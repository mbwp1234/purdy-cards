/* ============================================================================
 * purdy-shell-card — attention rules, dismissals and the notification log
 *
 * A dismissal is an acknowledgement, not a mute: a row is hidden only while
 * the triggering entity's last_changed is older than the dismissal, so a fault
 * that re-fires comes back.
 * ========================================================================== */

Object.assign(PurdyShellCard.prototype, {
  /* --- dismissals ---------------------------------------------------------
     A dismissal is an acknowledgement, not a mute: a row stays hidden only
     while the triggering entity has not changed since, and `dismiss_hours`
     caps how long a stale one can hide. Store format is `key:epoch|key:epoch`
     in an input_text, which caps at 255 characters — so keep rule keys short
     and drop the oldest entries rather than overflowing the write. */
  _dismissals() {
    const raw = pcState(this._hass, this._config.dismiss_store);
    const out = {};
    if (raw && raw !== "unknown" && raw !== "unavailable") {
      raw.split("|").forEach((pair) => {
        const bits = pair.split(":");
        const at = parseInt(bits[1], 10);
        if (bits[0] && Number.isFinite(at)) out[bits[0]] = at;
      });
    }

    /* Dismissing has to be optimistic, or it looks broken.
     *
     * The write goes to an input_text and the re-render immediately reads that
     * same input_text back — which still holds the OLD value until HA echoes,
     * so the row you just dismissed stayed on screen for a beat and reported
     * as "kinda slow to remove notifs". Exactly the setpoint problem, and the
     * shell had already solved that one: `_optGoal` holds a value locally,
     * yields the moment the real state agrees, and EXPIRES so a call that
     * never lands shows the truth again rather than hiding a live fault
     * forever. Same contract here, keyed per rule. */
    const opt = this._disOpt;
    if (opt) {
      const now = Date.now();
      Object.keys(opt).forEach((k) => {
        if (now > opt[k].until) { delete opt[k]; return; }
        /* The real store has caught up: stop overriding it. */
        if (out[k] != null && out[k] >= opt[k].at) { delete opt[k]; return; }
        out[k] = opt[k].at;
      });
      if (!Object.keys(opt).length) this._disOpt = null;
    }
    return out;
  },

  _writeDismissals(map) {
    const store = this._config.dismiss_store;
    if (!store) return;
    let pairs = Object.keys(map)
      .map((k) => [k, map[k]])
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0] + ":" + e[1]);
    while (pairs.length && pairs.join("|").length > 255) pairs.pop();
    this._hass.callService("input_text", "set_value", {
      entity_id: store, value: pairs.join("|"),
    });
  },

  _dismiss(row) {
    const map = this._dismissals();
    const at = Math.floor(Date.now() / 1000);
    map[row.key] = at;
    /* Hold it locally until the store agrees — see _dismissals. 12s is
       _optGoal's window: long enough for a slow echo, short enough that a
       write which never landed puts a live fault back on the screen. */
    if (!this._disOpt) this._disOpt = {};
    this._disOpt[row.key] = { at, until: Date.now() + 12000 };
    this._writeDismissals(map);
    if (this._config.log_to) this._closeLog(row);
    this._last = null;
    this._render();
  },

  async _logItems() {
    if (!this._config.log_to || !this._hass.callWS) return [];
    const res = await this._hass.callWS({ type: "todo/item/list", entity_id: this._config.log_to });
    return (res && res.items) || [];
  },

  /* One open log entry per raised rule. The key lives in the description so
     the entry can be found again without depending on the wording. */
  async _syncLog(rows) {
    if (!this._config.log_to || !rows.length || !this._hass.callWS) return;
    let items;
    try { items = await this._logItems(); } catch (e) { return; }
    for (const row of rows) {
      const tag = "[" + row.key + "]";
      const open = items.find((it) => (it.description || "").indexOf(tag) >= 0 && it.status !== "completed");
      if (open) continue;
      if (this._logged[row.key] === row.firedAt) continue;
      this._logged[row.key] = row.firedAt;
      this._hass.callService("todo", "add_item", {
        entity_id: this._config.log_to,
        item: row.title,
        description: tag + " " + row.severity + " \u00B7 " + (row.detail || "") +
          " \u00B7 raised " + new Date(row.firedAt * 1000).toISOString(),
      });
    }
  },

  async _closeLog(row) {
    if (!this._hass.callWS) return;
    let items;
    try { items = await this._logItems(); } catch (e) { return; }
    const tag = "[" + row.key + "]";
    const open = items.find((it) => (it.description || "").indexOf(tag) >= 0 && it.status !== "completed");
    if (open) {
      this._hass.callService("todo", "update_item", {
        entity_id: this._config.log_to, item: open.uid, status: "completed",
      });
    }
  },

  /* One rule, one predicate. `state` / `state_not` / `above` / `below`, in that
     order, against a single entity's state. */
  _ruleHit(r, st) {
    if (!st) return false;
    const v = st.state;
    if (r.state !== undefined) return v === r.state;
    if (r.state_not !== undefined) return v !== r.state_not && v !== "unavailable" && v !== "unknown";
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return false;
    if (r.above !== undefined) return n > r.above;
    if (r.below !== undefined) return n < r.below;
    return false;
  },

  /* When did this rule's condition last change? A dismissal older than that
     means the fault re-fired, so the row comes back.

     The group branch used to ask `state !== (r.state || "on")` outright, which
     silently assumes every group rule is a boolean one. A numeric group rule —
     five consumables all below a threshold — has no `r.state`, so every member
     was compared against the string "on", nothing ever matched, and firedAt
     came back 0. A dismissal is always newer than 0, so dismissing such a rule
     would have hidden it FOREVER rather than for `dismiss_hours`. It shares
     _ruleHit with _raised now, so the two halves cannot disagree about what
     the rule means. */
  _firedAt(r) {
    const h = this._hass;
    if (r.entity && h.states[r.entity]) {
      return Math.floor(new Date(h.states[r.entity].last_changed).getTime() / 1000);
    }
    if (r.match) {
      const re = new RegExp(r.match);
      let newest = 0;
      Object.keys(h.states).forEach((id) => {
        if (!re.test(id) || !this._ruleHit(r, h.states[id])) return;
        const t = Math.floor(new Date(h.states[id].last_changed).getTime() / 1000);
        if (t > newest) newest = t;
      });
      return newest;
    }
    return 0;
  },

  /* The server's own fault rules, in the same shape as an attention rule —
     one vocabulary for "what counts as wrong". The desk wrote this first and
     the shell had a lesser copy inside the systems page that knew about
     `above` but not `below`; it lives here now and both views share it. */
  _serverFaults() {
    const srv = this._config.server;
    if (!srv || !this._hass) return [];
    return (srv.faults || []).filter((f) => this._ruleHit(f, this._hass.states[f.entity]));
  },

  /* Everything currently matching, before dismissals are applied.

     The server's faults are in here too, and that is the point. They used to
     raise only on the Systems overview, two taps inside a mode — so with disk1
     at 92.8% the landing page's header chip read "All clear" while the array
     was nearly full. The chip is the one place a fault is supposed to reach
     you; a fault it does not know about is a fault you find by going looking,
     which is the opposite of what it is for. Keys are prefixed `sv:` so they
     dismiss independently of a house rule that happens to share a name. */
  _raised() {
    const rules = this._config.attention || [];
    const hass = this._hass;
    if (!hass) return [];
    const out = [];
    this._serverFaults().forEach((f) => {
      out.push({
        key: "sv:" + (f.key || String(f.label || f.entity).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 8)),
        severity: f.severity || "warn",
        title: f.label || pcName(hass, f.entity),
        detail: f.detail || "",
        entity: f.entity,
        firedAt: this._firedAt(f),
      });
    });
    rules.forEach((r, i) => {
      const hit = (st) => this._ruleHit(r, st);
      if (r.match) {
        const re = new RegExp(r.match);
        const names = Object.keys(hass.states)
          .filter((id) => re.test(id) && hit(hass.states[id]))
          /* `strip` takes a list as well as a single string. One pattern only
             ever removed a prefix, so the Jeeves consumables rule came out as
             "Filter Left · Sensor Dirty Time Left · Wheel Dirty Time Left" —
             HA's friendly names leaking through the tail. Applied in order,
             then collapsed, so a rule can take both ends off a name. */
          .map((id) => {
            const pats = r.strip == null ? [] : [].concat(r.strip);
            let n = hass.states[id].attributes.friendly_name || id;
            pats.forEach((p) => { n = n.split(p).join(" "); });
            return n.replace(/\s+/g, " ").trim();
          })
          .filter(Boolean);
        if (names.length) {
          out.push({
            key: r.key || "r" + i,
            severity: r.severity || "info",
            title: `${names.length} ${r.title || "issues"}`,
            detail: names.slice(0, 4).join(" · "),
            entity: null,
            firedAt: this._firedAt(r),
          });
        }
        return;
      }
      if (hit(hass.states[r.entity])) {
        out.push({
          key: r.key || "r" + i,
          severity: r.severity || "warn",
          title: r.title || pcName(hass, r.entity),
          detail: r.detail || "",
          entity: r.entity,
          firedAt: this._firedAt(r),
        });
      }
    });
    /* `rank[x] || 3` would treat critical (0) as unranked and sink it below
       info — the one severity that must always sort first. */
    const rank = { critical: 0, warn: 1, info: 2 };
    const at = (x) => (rank[x] === undefined ? 3 : rank[x]);
    return out.sort((a, b) => at(a.severity) - at(b.severity));
  },

  /* What the chip and the sheet actually show: raised, minus live dismissals. */
  _faults() {
    const dis = this._dismissals();
    const now = Math.floor(Date.now() / 1000);
    const hrs = this._config.dismiss_hours;
    return this._raised().filter((row) => {
      const at = dis[row.key];
      if (!at) return true;
      if (row.firedAt > at) return true;           // it re-fired
      if (hrs && now - at > hrs * 3600) return true; // the snooze lapsed
      return false;
    });
  },

  /* One sheet, two contents. Both slide over the column rather than pushing
     it around, so opening either never moves what is under your thumb. */
  _sheetHtml(faults) {
    if (!this._sheet) return "";
    const close = `<button class="ps-x" type="button" id="ps-close" aria-label="Close">
        <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;

    /* A hosted sheet wraps a card that already exists rather than
       reimplementing it. The remote's d-pad and app grid are 300 lines that
       work; the point of moving the TV off a Bubble pop-up is the surface, not
       the contents. The element itself is attached after the patch — it cannot
       be expressed as a string — so this only leaves it a mount point. */
    /* Media is excluded: it also names a card, but it owns its own chrome —
       the two tabs have to sit above the mount point, and the generic path
       would render the remote alone with no way to reach Listen. */
    const hosted = this._sheet === "media"
      ? null : (this._config.sheets || {})[this._sheet];
    if (hosted && hosted.card) {
      /* `dim` is for a hosted card that hardcodes a light surface instead of
         reading HA's card variables — dreame-vacuum-map-card writes #fff in
         seventy places, so there is nothing to re-theme from out here and a
         floodlight in the middle of a dark sheet is the result. A filter is
         the only lever, so it is opt-in per sheet and never applied by
         default: it dims the map's own colours along with the background,
         which is a trade the config should make deliberately. */
      const dim = Number(hosted.dim);
      const dimStyle = Number.isFinite(dim) && dim > 0 && dim < 1
        ? ` style="filter:brightness(${dim.toFixed(2)})"` : "";
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall">
          <div class="ps-sheeth"><span class="ps-lbl">${psEsc(hosted.title || "")}</span>${close}</div>
          <div class="ps-host" id="ps-host"${dimStyle}></div>
        </div>`;
    }

    if (this._sheet === "alerts") {
      if (!faults.length) return "";
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet">
          <div class="ps-sheeth"><span class="ps-lbl">Needs attention</span>${close}</div>
          ${faults.map((f, i) => `<div class="ps-ar" data-info="${psEsc(f.entity || "")}">
            <span class="ps-dotc ${f.severity}"></span>
            <span class="ps-grow"><span class="ps-at">${psEsc(f.title)}</span>
            <span class="ps-ad">${psEsc(f.detail)}</span></span>
            ${this._config.dismiss_store ? `<button class="ps-x" type="button" data-dismiss="${i}"
              aria-label="Dismiss ${psEsc(f.title)}">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ""}
          </div>`).join("")}
        </div>`;
    }

    /* Lights live in a sheet, not in the column. The section is `sheet_only`,
       so this is the only path that renders it: a sheet slides over what is
       already there instead of pushing it down, which is the same reason the
       schedule and the music controls are sheets. Same body, same handlers —
       only the header differs, and the sheet chrome names itself rather than
       printing "Lights" twice. */
    if (this._sheet === "lights") {
      const sec = (this._config.sections || []).find((x) => x.type === "lights");
      if (!sec) return "";
      const lights = this._lightList(sec);
      if (!lights.length) return "";
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet">
          <div class="ps-sheeth"><span class="ps-lbl">Lights</span>
            ${this._lightChip(lights)}${close}</div>
          ${this._lightsBody(sec, lights)}
        </div>`;
    }

    /* Every control in this sheet acts on _activePlayer(). It used to act on
       `nowPlaying || default_player` while the room list highlighted the
       user's pick \u2014 so picking a room changed the highlight and nothing else,
       which is what made choosing a speaker feel broken. One target, and the
       room list is what sets it. */
    /* The crew, behind the dock. Same body as the section drew, same handlers —
       only the header differs, and the sheet chrome names itself rather than
       printing "Crew" twice. The section stays in the config as `alerts_only`,
       so the landing page keeps the moments that need a human and nothing else.

       The vacuum map is reached from the Jeeves tile inside this body, which is
       the door that had to move with it: replacing a surface orphans whatever
       was only reachable through it, and this card has lost the music presets
       and the vacuum map to exactly that mistake before. */
    /* Correcting a session. A sheet for the same reason the schedule editor is
       one: it slides over the list you were reading instead of pushing it down
       the screen, so the row you long-pressed is still where you left it when
       the sheet closes. */
    if (this._sheet === "napedit") {
      const body = this._napEditHtml();
      if (!body) return "";
      const s = this._napEditSpan();
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet">
          ${/* No time chip: the rail immediately below carries the session's
                start and end, and a chip repeating the start is the fifth
                time that duplication would have shipped. */""}
          <div class="ps-sheeth"><span class="ps-lbl">${
            s && s.night ? "Correct the night" : "Correct this nap"}</span>${close}</div>
          ${body}
        </div>`;
    }

    /* The week, behind the collapsed rail. Same body the section's `.ps-xtra`
       used to hold, rendered by the same `_wxDetailBody` — only the header
       differs, and the sheet chrome names itself rather than printing
       "Weather" twice. `tall`, because the hourly strip and the detail rows
       make this the second-tallest thing the card draws after Media. */
    if (this._sheet === "wx") {
      const sec = this._weatherSection();
      if (!sec) return "";
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall">
          <div class="ps-sheeth"><span class="ps-lbl">${psEsc(sec.title || "Weather")}</span>
            ${this._wxChip(sec)}${close}</div>
          <div class="ps-wxsheet">${this._wxDetailBody(sec)}</div>
        </div>`;
    }

    if (this._sheet === "crew") {
      const sec = (this._config.sections || []).find((x) => x.type === "crew");
      if (!sec) return "";
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall">
          <div class="ps-sheeth"><span class="ps-lbl">${psEsc(sec.name || sec.title || "Crew")}</span>
            ${this._crewChip(sec)}${close}</div>
          ${this._crewBody(sec, { vac: true })}
        </div>`;
    }

    /* One sheet, two verbs.
     *
     * Television and music are the same question — what is on — and they were
     * two dock buttons answering it. Merging them frees a slot AND fixes the
     * remote, which measured 716px inside a sheet with about 600 to give it, so
     * the transport keys you reach for while something is playing were the part
     * that fell off the bottom.
     *
     * Which face opens is not a remembered preference: it is what is actually
     * on. See _mediaFace. */
    if (this._sheet === "media") {
      const face = this._mediaFace();
      const sec = (this._config.sections || []).find((x) => x.type === "music");
      const tabs = `<div class="ps-mtabs" role="tablist">
          <button class="ps-mtab${face === "watch" ? " on" : ""}" type="button"
            data-media="watch" role="tab" aria-selected="${face === "watch"}">Watch</button>
          <button class="ps-mtab${face === "listen" ? " on" : ""}" type="button"
            data-media="listen" role="tab" aria-selected="${face === "listen"}">Listen</button>
        </div>`;
      const spec = (this._config.sheets || {}).media || {};
      const title = psEsc(spec.title || "Media");
      if (face === "watch") {
        return `<div class="ps-scrim" id="ps-scrim"></div>
          <div class="ps-sheet tall">
            <div class="ps-sheeth"><span class="ps-lbl">${title}</span>${close}</div>
            ${tabs}
            <div class="ps-host" id="ps-host"></div>
          </div>`;
      }
      if (!sec) return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet">
          <div class="ps-sheeth"><span class="ps-lbl">${title}</span>${close}</div>
          ${tabs}
          <div class="ps-nohist">No music section is configured.</div>
        </div>`;
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall">
          <div class="ps-sheeth"><span class="ps-lbl">${title}${
            this._musicTargetName(sec)}</span>${close}</div>
          ${tabs}
          ${this._musicBody(sec)}
        </div>`;
    }

    if (this._sheet === "music") {
      const sec = (this._config.sections || []).find((x) => x.type === "music");
      if (!sec) return "";
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall">
          <div class="ps-sheeth"><span class="ps-lbl">Music${
            this._musicTargetName(sec)}</span>${close}</div>
          ${this._musicBody(sec)}
        </div>`;
    }

    if (this._sheet === "schedule") {
      const sec = (this._config.sections || []).find((x) => x.type === "climate" && x.schedule);
      if (!sec) return "";
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall">
          <div class="ps-sheeth"><span class="ps-lbl">Thermostat schedule</span>${close}</div>
          ${this._scheduleHtml(sec)}
        </div>`;
    }
    return "";
  },

  /* The music sheet's body, lifted out of _sheetHtml so the Media sheet can
     render the same thing under its Listen tab. Television and music are the
     same question — what is on — and they were two dock buttons answering it;
     the body had to be shared before they could be one.

     Nothing here changed in the lift. The derivations and the markup moved
     together, which is the only safe way to move a block this size: leaving
     the derivations behind would have left them computing for a caller that
     no longer used them. */
  _musicBody(sec) {
      const np = this._nowPlaying();
      if (!sec) return "";
      const target = this._activePlayer();
      const tst = target && this._hass.states[target];
      /* The header shows what the TARGET room is playing, not what some other
         room is: pointing the controls at Kitchen while the artwork shows the
         Living Room's track is how you skip the wrong song. */
      const tmusic = psLiveMusic(tst);
      const art = tmusic && tmusic.attributes.entity_picture_local;
      const vol = tst && tst.attributes.volume_level != null ? tst.attributes.volume_level : 0;
      const muted = !!(tst && tst.attributes.is_volume_muted);
      const tname = (sec.players || []).find((p) => p.entity === target);
      const playing = !!(tmusic && tst.state === "playing");
      /* Something is playing, but not here. Offer to bring it rather than
         making the user find it again from the start. */
      const elsewhere = np && target && np.entity !== target && !tmusic;
      const groupIds = this._groupOf(target);

      const rooms = (sec.players || []).map((p) => {
        const st = this._hass.states[p.entity];
        const live = st && st.state === "playing" && psIsMusic(st);
        const active = p.entity === target;
        const joined = groupIds.indexOf(p.entity) >= 0;
        const pv = st && st.attributes.volume_level != null ? st.attributes.volume_level : 0;
        return `<div class="ps-vrow ${active ? "on" : ""} ${joined ? "joined" : ""}">
            <button class="ps-vname" type="button" data-pick="${psEsc(p.entity)}"
              aria-pressed="${active}">
              ${live ? `<span class="ps-live"></span>` : ""}${psEsc(p.name)}</button>
            <input class="ps-vol" type="range" min="0" max="100" step="1"
              value="${Math.round(pv * 100)}" data-vol="${psEsc(p.entity)}"
              aria-label="${psEsc(p.name)} volume" />
            <span class="ps-vnum">${Math.round(pv * 100)}</span>
            ${active ? `<span class="ps-jspace"></span>` : `<button class="ps-jb ${joined ? "on" : ""}"
              type="button" data-join="${psEsc(p.entity)}" aria-pressed="${joined}"
              aria-label="${joined ? "Remove" : "Add"} ${psEsc(p.name)} ${joined ? "from" : "to"} the group">
              <svg viewBox="0 0 24 24" class="ps-ico">${joined
                ? `<path d="M9.5 14.5 14.5 9.5M8 11 6 13a3.5 3.5 0 0 0 5 5l2-2M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2"/>`
                : `<path d="M12 7v10M7 12h10"/>`}</svg></button>`}
          </div>`;
      }).join("");

    return `
          <div class="ps-now" style="margin-bottom:12px">
            <div class="ps-art">${art
              ? `<img src="${psEsc(art)}" alt="" />`
              : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
            <div class="ps-grow">
              <div class="ps-nt ps-trunc">${tmusic
                ? psEsc(tmusic.attributes.media_title) : "Nothing playing here"}</div>
              <div class="ps-ns ps-trunc">${tmusic
                ? psEsc([tmusic.attributes.media_artist, tname && tname.name].filter(Boolean).join(" \u00B7 "))
                : (elsewhere ? psEsc(`Playing in ${np.name}`) : "Pick something below")}</div>
            </div>
            ${this._pinBtn()}
          </div>
          ${elsewhere ? `<button class="ps-move" type="button" id="ps-move">
            <svg viewBox="0 0 24 24" class="ps-ico"><path d="M4 12h13M13 7l5 5-5 5"/></svg>
            Move ${psEsc(np.name)} playback here</button>` : ""}
          <div class="ps-transport">
            <button class="ps-tb" type="button" data-mpc="media_previous_track" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Previous">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M18 5v14L8 12zM6 5v14"/></svg></button>
            <button class="ps-tb big" type="button" data-mp="playpause" data-entity="${psEsc(target || "")}" aria-label="Play or pause">
              <svg viewBox="0 0 24 24" class="ps-ico">${playing
                ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
            <button class="ps-tb" type="button" data-mpc="media_next_track" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Next">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 5v14l10-7zM18 5v14"/></svg></button>
            <button class="ps-tb" type="button" data-mpc="media_stop" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Stop">
              <svg viewBox="0 0 24 24" class="ps-ico"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg></button>
          </div>
          ${this._queueHtml()}
          <div class="ps-volmain">
            <button class="ps-vbtn ${muted ? "muted" : ""}" type="button" data-mute="${psEsc(target || "")}"
              data-muted="${muted}" aria-label="Mute">
              <svg viewBox="0 0 24 24" class="ps-ico">${muted
                ? `<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM16 9.5l5 5M21 9.5l-5 5"/>`
                : `<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM16 9a4 4 0 0 1 0 6"/>`}</svg></button>
            <input class="ps-vol" type="range" min="0" max="100" step="1"
              value="${Math.round(vol * 100)}" data-vol="${psEsc(target || "")}" aria-label="Volume" />
            <span class="ps-vnum">${Math.round(vol * 100)}</span>
          </div>
          ${this._note ? `<div class="ps-toast">${psEsc(this._note)}</div>` : ""}

          <span class="ps-lbl" style="display:block;margin:14px 0 6px">Rooms${
            groupIds.length ? ` \u00B7 ${groupIds.length + 1} grouped` : ""}</span>
          ${rooms}

          <span class="ps-lbl" style="display:block;margin:14px 0 6px">Search</span>
          <div class="ps-sbox">
            <svg viewBox="0 0 24 24" class="ps-ico"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/></svg>
            <input id="ps-q" type="search" placeholder="Tracks, albums, playlists\u2026"
              value="${psEsc(this._query)}" aria-label="Search music" />
            ${this._query ? `<button class="ps-sclear" type="button" id="ps-qclear" aria-label="Clear">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ""}
          </div>
          <div id="ps-res">${this._resultsHtml()}</div>

          ${(sec.presets || []).length ? `<span class="ps-lbl" style="display:block;margin:14px 0 6px">Presets</span>
          <div class="ps-pres">${(sec.presets || []).map((p, i) =>
            `<button class="ps-pr" type="button" data-preset="${i}">
              <ha-icon icon="${psEsc(p.icon || "mdi:playlist-music")}"></ha-icon>
              <span class="ps-trunc">${psEsc(p.name)}</span></button>`).join("")}</div>` : ""}

          ${this._pinsHtml()}

          <div style="margin-top:14px">${this._recentHtml()}</div>
      `;
  },

  /* Which face the Media sheet opens on.
   *
   * A remembered preference is the wrong answer: you open this sheet BECAUSE
   * something is on, and the thing that is on is the thing you want. So the
   * live state decides, and a tap only overrides it for as long as the sheet is
   * open (_mediaPick is cleared when the sheet closes, the same way _wxPick is
   * a session-scoped override of a config default).
   *
   * What changed: the two cases the live state does NOT decide.
   *
   * Both on is genuinely ambiguous and neither on is a cold start, and both of
   * them used to land on Listen — on the reasoning that starting music from
   * nothing is the commoner cold start. Reported otherwise: "I do wish the TV
   * screen opened first." So the rule is unchanged where the house answers the
   * question, and Watch takes the two cases where it does not. Listen now opens
   * only when music is genuinely playing and no television is on, which is
   * exactly when it is the right answer.
   *
   * `default_face:` on the sheet is that tie-break, so changing your mind about
   * it is config rather than another release. */
  _mediaFace() {
    if (this._mediaPick === "watch" || this._mediaPick === "listen") return this._mediaPick;
    const media = (this._config.sheets || {}).media || {};
    const tvOn = media.tvs || (media.card || {}).tvs
      || (((this._config.sheets || {}).tv || {}).card || {}).tvs || [];
    const anyTv = tvOn.some((t) => {
      const st = pcState(this._hass, t.media_player || t.remote);
      return st && st !== "off" && st !== "unavailable" && st !== "unknown";
    });
    const anyMusic = !!this._nowPlaying();
    if (anyTv && !anyMusic) return "watch";
    if (anyMusic && !anyTv) return "listen";
    return media.default_face === "listen" ? "listen" : "watch";
  },

  /* The target room, for the sheet header. Named separately because the
     header is the caller's and the body is not. */
  _musicTargetName(sec) {
    const t = this._activePlayer();
    const n = (sec.players || []).find((p) => p.entity === t);
    return n ? ` \u00B7 ${psEsc(n.name)}` : "";
  },
});

