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
    if (!raw || raw === "unknown" || raw === "unavailable") return out;
    raw.split("|").forEach((pair) => {
      const bits = pair.split(":");
      const at = parseInt(bits[1], 10);
      if (bits[0] && Number.isFinite(at)) out[bits[0]] = at;
    });
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
    map[row.key] = Math.floor(Date.now() / 1000);
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

  /* When did this rule's condition last change? A dismissal older than that
     means the fault re-fired, so the row comes back. */
  _firedAt(r) {
    const h = this._hass;
    if (r.entity && h.states[r.entity]) {
      return Math.floor(new Date(h.states[r.entity].last_changed).getTime() / 1000);
    }
    if (r.match) {
      const re = new RegExp(r.match);
      let newest = 0;
      Object.keys(h.states).forEach((id) => {
        if (!re.test(id) || h.states[id].state !== (r.state || "on")) return;
        const t = Math.floor(new Date(h.states[id].last_changed).getTime() / 1000);
        if (t > newest) newest = t;
      });
      return newest;
    }
    return 0;
  },

  /* Everything currently matching, before dismissals are applied. */
  _raised() {
    const rules = this._config.attention || [];
    const hass = this._hass;
    if (!hass) return [];
    const out = [];
    rules.forEach((r, i) => {
      const hit = (st) => {
        if (!st) return false;
        const v = st.state;
        if (r.state !== undefined) return v === r.state;
        if (r.state_not !== undefined) return v !== r.state_not && v !== "unavailable" && v !== "unknown";
        const n = parseFloat(v);
        if (!Number.isFinite(n)) return false;
        if (r.above !== undefined) return n > r.above;
        if (r.below !== undefined) return n < r.below;
        return false;
      };
      if (r.match) {
        const re = new RegExp(r.match);
        const names = Object.keys(hass.states)
          .filter((id) => re.test(id) && hit(hass.states[id]))
          .map((id) => (hass.states[id].attributes.friendly_name || id).replace(r.strip || "", "").trim());
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

    if (this._sheet === "music") {
      const sec = (this._config.sections || []).find((x) => x.type === "music");
      const np = this._nowPlaying();
      if (!sec) return "";
      const art = np && np.st.attributes.entity_picture_local;
      const target = np ? np.entity : sec.default_player;
      const tst = target && this._hass.states[target];
      const vol = tst && tst.attributes.volume_level != null ? tst.attributes.volume_level : 0;
      const muted = !!(tst && tst.attributes.is_volume_muted);

      const rooms = (sec.players || []).map((p) => {
        const st = this._hass.states[p.entity];
        const live = st && st.state === "playing" && psIsMusic(st);
        const active = this._isPicked(p.entity) ||
          (!(this._sel || []).length && this._activePlayer() === p.entity);
        const pv = st && st.attributes.volume_level != null ? st.attributes.volume_level : 0;
        return `<div class="ps-vrow ${active ? "on" : ""}">
            <button class="ps-vname" type="button" data-pick="${psEsc(p.entity)}">
              ${live ? `<span class="ps-live"></span>` : ""}${psEsc(p.name)}</button>
            <input class="ps-vol" type="range" min="0" max="100" step="1"
              value="${Math.round(pv * 100)}" data-vol="${psEsc(p.entity)}"
              aria-label="${psEsc(p.name)} volume" />
            <span class="ps-vnum">${Math.round(pv * 100)}</span>
          </div>`;
      }).join("");

      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall">
          <div class="ps-sheeth"><span class="ps-lbl">Music</span>${close}</div>
          <div class="ps-now" style="margin-bottom:12px">
            <div class="ps-art">${art
              ? `<img src="${psEsc(art)}" alt="" />`
              : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
            <div class="ps-grow">
              <div class="ps-nt ps-trunc">${np ? psEsc(np.st.attributes.media_title) : "Nothing playing"}</div>
              <div class="ps-ns ps-trunc">${np
                ? psEsc([np.st.attributes.media_artist, np.name].filter(Boolean).join(" \u00B7 "))
                : "Pick a room below"}</div>
            </div>
          </div>
          <div class="ps-transport">
            <button class="ps-tb" type="button" data-mpc="media_previous_track" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Previous">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M18 5v14L8 12zM6 5v14"/></svg></button>
            <button class="ps-tb big" type="button" data-mp="playpause" data-entity="${psEsc(target || "")}" aria-label="Play or pause">
              <svg viewBox="0 0 24 24" class="ps-ico">${np && np.playing
                ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
            <button class="ps-tb" type="button" data-mpc="media_next_track" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Next">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 5v14l10-7zM18 5v14"/></svg></button>
            <button class="ps-tb" type="button" data-mpc="media_stop" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Stop">
              <svg viewBox="0 0 24 24" class="ps-ico"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg></button>
          </div>
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
          <span class="ps-lbl" style="display:block;margin:14px 0 6px">Rooms</span>
          ${rooms}

          ${(sec.presets || []).length ? `<span class="ps-lbl" style="display:block;margin:14px 0 6px">Presets</span>
          <div class="ps-pres">${(sec.presets || []).map((p, i) =>
            `<button class="ps-pr" type="button" data-preset="${i}">
              <ha-icon icon="${psEsc(p.icon || "mdi:playlist-music")}"></ha-icon>
              <span class="ps-trunc">${psEsc(p.name)}</span></button>`).join("")}</div>` : ""}

          ${this._pinsHtml()}
          <span class="ps-lbl" style="display:block;margin:14px 0 6px">Search</span>
          <div class="ps-sbox">
            <svg viewBox="0 0 24 24" class="ps-ico"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/></svg>
            <input id="ps-q" type="search" placeholder="Tracks, albums, playlists\u2026"
              value="${psEsc(this._query)}" aria-label="Search music" />
            ${this._query ? `<button class="ps-sclear" type="button" id="ps-qclear" aria-label="Clear">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ""}
          </div>
          ${this._searching ? `<div class="ps-note">Searching\u2026</div>` : ""}
          ${this._results && this._results.length ? `<div class="ps-mlist">${
            this._results.map((r, i) => `<button class="ps-mi" type="button" data-play="${i}" data-from="results">
              <span class="ps-th">${r.image ? `<img src="${psEsc(r.image)}" alt="" />`
                : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</span>
              <span class="ps-grow"><span class="ps-min ps-trunc">${psEsc(r.name)}</span>
              <span class="ps-mis ps-trunc">${psEsc(r.sub)}</span></span>
              <span class="ps-kind">${psEsc(r.kind)}</span></button>`).join("")}</div>` : ""}
          ${this._results && this._results.length && this._pinStore() ? `<div class="ps-note">
            Hold a result to save it, or star what is playing.</div>` : ""}
          ${this._results && !this._results.length && !this._searching
            ? `<div class="ps-note">${sec.config_entry ? "No results." : "Search needs a Music Assistant config_entry."}</div>` : ""}

          <div style="margin-top:14px">${this._recentHtml()}</div>
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
});

