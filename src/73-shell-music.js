/* ============================================================================
 * purdy-shell-card — Music Assistant
 *
 * Music targets a room, not a card: _activePlayer() is whatever the user last
 * tapped, else whatever is actually playing, else default_player, so a stale
 * pick falls back rather than targeting a dead entity.
 *
 * PICKING A ROOM IS A RADIO, NOT A SET (v1.30.0). It used to toggle into a
 * multi-select array, and "play to N rooms" was N independent play_media calls
 * — N unsynchronised queues, not multi-room. Worse, the sheet's transport and
 * main volume never read the selection at all: they targeted
 * `nowPlaying || default_player`, so tapping Kitchen highlighted Kitchen and
 * then every control still drove the Living Room. That is what "selecting
 * devices gets stuck" was. One selected room now, and real grouping is
 * media_player.join, which these players do support (bit 524288 is set).
 *
 * Saved playlists live in a 255-character input_text, so the oldest saves are
 * dropped rather than the write failing.
 * ========================================================================== */

/* The order the search sheet offers, and the label on each chip. `all` is not
   a Music Assistant media_type — it means "send no media_type at all". */
const PS_MTYPES = [
  { key: "all", label: "All" },
  { key: "track", label: "Tracks" },
  { key: "album", label: "Albums" },
  { key: "artist", label: "Artists" },
  { key: "playlist", label: "Playlists" },
  { key: "radio", label: "Radio" },
];

Object.assign(PurdyShellCard.prototype, {
  _musicSec() {
    return (this._config.sections || []).find((x) => x.type === "music");
  },

  /* Recently listened comes from HA's recorder, not Music Assistant: MA's
     last_played / play_count are empty in this install, so its own
     "recently played" ordering is silently meaningless. Every MA player logs
     media_title, media_artist and a playable media_content_id per state
     change, so read it back from there. Bounded by recorder retention. */
  async _fetchRecent() {
    const sec = this._musicSec();
    if (!sec || !this._hass || !this._hass.callApi) return;
    const ids = (sec.players || []).map((p) => p.entity);
    if (!ids.length) return;
    const start = new Date(Date.now() - (sec.recent_hours || 48) * 3600 * 1000).toISOString();
    try {
      const res = await this._hass.callApi("GET", `history/period/${start}?filter_entity_id=${ids.join(",")}`);
      const rows = [];
      (res || []).forEach((series) => (series || []).forEach((e) => {
        const a = e.attributes || {};
        if (!a.media_title || !a.media_content_id) return;
        if (!pcIsMusicState(e)) return;
        rows.push({
          t: new Date(e.last_changed || e.last_updated).getTime(),
          uri: a.media_content_id,
          name: a.media_title,
          sub: a.media_artist || a.media_album_name || "",
          /* The recorder keeps entity_picture_local, and a row with a cover is
             recognisable at a glance where a row of identical note glyphs is
             not. It is HA's own authenticated same-origin proxy, so unlike
             entity_picture it actually loads. */
          image: a.entity_picture_local || null,
          kind: "track",
        });
      }));
      rows.sort((x, y) => y.t - x.t);
      const seen = {};
      const out = [];
      rows.forEach((r) => {
        if (seen[r.uri] || !Number.isFinite(r.t)) return;
        seen[r.uri] = 1;
        out.push(r);
      });
      this._recent = out.slice(0, sec.recent_max || 8);
      this._last = null;
      this._render();
    } catch (err) {
      /* Recorder may be purged; the list just stays empty. */
    }
  },

  /* --- the queue ----------------------------------------------------------
     get_queue answers with the current item, the next item and how far through
     the list we are — not the whole list. That is exactly the useful part:
     "17 of 27, up next X" tells you whether to skip, and a full scrolling
     queue would not fit above the fold anyway. Shuffle and repeat come back
     in the same call, which is the only place their real state is visible
     (the media_player attributes do not carry them for these players). */
  async _fetchQueue() {
    const target = this._activePlayer();
    if (!target || !this._hass || !this._hass.callService) return;
    /* A queue read is per-player, so a stale answer for the room you just
       left must not paint over the room you just picked. */
    const token = (this._queueToken = (this._queueToken || 0) + 1);
    try {
      const r = await this._hass.callService(
        "music_assistant", "get_queue", { entity_id: target }, undefined, false, true
      );
      if (token !== this._queueToken) return;
      const q = ((r && r.response) || {})[target];
      this._queue = q ? { ...q, entity: target } : null;
    } catch (err) {
      /* A player with no queue (or an MA that will not answer) simply shows
         no up-next line. It must not read as "nothing is playing". */
      if (token !== this._queueToken) return;
      this._queue = null;
    }
    this._last = null;
    this._render();
  },

  /* The queue is only worth reading while the music sheet is open, and only
     when the answer could have changed: a new track, or a new target room. */
  _syncQueue() {
    if (this._sheet !== "music") { this._queueKey = null; return; }
    const target = this._activePlayer();
    const st = target && this._hass.states[target];
    const key = [target, st && st.state, st && st.attributes.media_title].join("|");
    if (key === this._queueKey) return;
    this._queueKey = key;
    this._fetchQueue();
  },

  /* --- search -------------------------------------------------------------
     Typed-into, not submitted. The old field only searched on Enter, which on
     a phone keyboard means the search was one deliberate extra action behind
     every thought. Debounced at 400ms so a fast typist makes one request. */
  _queueSearch(q) {
    this._query = q;
    if (this._searchT) clearTimeout(this._searchT);
    if (!q.trim()) {
      this._results = null;
      this._paintResults();
      return;
    }
    this._searchT = setTimeout(() => this._runSearch(), 400);
  },

  async _runSearch() {
    const sec = this._musicSec();
    const q = (this._query || "").trim();
    const entry = sec && sec.config_entry;
    if (!q || !entry) {
      this._results = q && !entry ? [] : null;
      this._paintResults();
      return;
    }
    const kind = this._mtype || "all";
    /* The field keeps focus while this runs, so a late answer for a query the
       user has already typed past must not replace the newer one. */
    const token = (this._searchToken = (this._searchToken || 0) + 1);
    this._searching = true;
    this._paintResults();
    const data = { config_entry_id: entry, name: q };
    if (kind !== "all") data.media_type = [kind];
    try {
      const r = await this._hass.callService(
        "music_assistant", "search", data, undefined, false, true
      );
      if (token !== this._searchToken) return;
      const d = (r && r.response) || {};
      const rows = [];
      const take = (arr, k, n) => (arr || []).slice(0, n).forEach((x) => rows.push({
        uri: x.uri, name: x.name, kind: k, image: x.image,
        sub: x.artists && x.artists.length
          ? x.artists.map((a) => a.name).join(", ")
          : (k === "album" && x.version ? x.version : k),
      }));
      /* Filtered means you already said what you wanted, so give it the room:
         a single deep list rather than four shallow ones. */
      if (kind === "all") {
        take(d.tracks, "track", 4);
        take(d.playlists, "playlist", 3);
        take(d.albums, "album", 3);
        take(d.artists, "artist", 2);
        take(d.radio, "radio", 1);
      } else {
        const bucket = { track: "tracks", album: "albums", artist: "artists",
                         playlist: "playlists", radio: "radio" }[kind];
        take(d[bucket], kind, 20);
      }
      this._results = rows;
    } catch (err) {
      if (token !== this._searchToken) return;
      this._results = [];
    }
    this._searching = false;
    this._paintResults();
  },

  /* Write the results straight into their own container instead of asking for
     a repaint. _render is gated by _dragging — which a focused search field
     sets, and must set, or the patch would destroy the input mid-word. So
     search-as-you-type is only possible if the results can be drawn without
     going through _render at all. Same reasoning as the scrub readouts. */
  _paintResults() {
    const box = this.shadowRoot && this.shadowRoot.getElementById("ps-res");
    if (!box) { this._render(); return; }
    const html = this._resultsHtml();
    if (box._psHtml === html) return;
    box._psHtml = html;
    box.innerHTML = html;
    this._bind();
  },

  _playUri(uri, kind) {
    const targets = this._targets();
    if (!uri || !targets.length) return;
    this._hass.callService("music_assistant", "play_media", {
      entity_id: targets, media_id: uri, media_type: kind || "track", enqueue: "replace",
    });
  },

  /* Queue behind what is playing rather than replacing it. Long-press already
     means "save", so this is the row's second button, not a second gesture. */
  _enqueueUri(uri, kind) {
    const targets = this._targets();
    if (!uri || !targets.length) return;
    this._hass.callService("music_assistant", "play_media", {
      entity_id: targets, media_id: uri, media_type: kind || "track", enqueue: "add",
    });
    this._toast(`Added to queue`);
  },

  /* A one-line, self-clearing confirmation. An action whose whole effect
     happens on a speaker in another room otherwise looks like it did nothing. */
  _toast(msg) {
    this._note = msg;
    if (this._noteT) clearTimeout(this._noteT);
    this._noteT = setTimeout(() => {
      this._note = null;
      this._last = null;
      this._render();
    }, 2600);
    this._last = null;
    this._render();
  },

  /* --- saved playlists ----------------------------------------------------
     A store is either a todo list (unbounded) or an input_text (`uri~name`
     pairs, and that helper caps at 255 characters, so the oldest pins fall
     off rather than the write failing). */
  _pinStore() {
    const sec = this._musicSec();
    return sec && sec.pins && sec.pins.store;
  },

  async _loadPins() {
    const store = this._pinStore();
    if (!store || !this._hass) return;
    if (store.indexOf("todo.") === 0) {
      if (!this._hass.callWS) return;
      try {
        const res = await this._hass.callWS({ type: "todo/item/list", entity_id: store });
        this._pins = ((res && res.items) || [])
          .filter((it) => it.status !== "completed" && it.description)
          .map((it) => ({ name: it.summary, uri: it.description, uid: it.uid }));
      } catch (e) { this._pins = []; }
    } else {
      const raw = pcState(this._hass, store);
      this._pins = (!raw || raw === "unknown" || raw === "unavailable") ? [] :
        raw.split("|").map((pair) => {
          const i = pair.indexOf("~");
          return i < 0 ? null : { uri: pair.slice(0, i), name: pair.slice(i + 1) };
        }).filter(Boolean);
    }
    this._last = null;
    this._render();
  },

  _writePins(list) {
    const store = this._pinStore();
    if (!store) return;
    let pairs = list.map((p) => p.uri + "~" + p.name);
    while (pairs.length && pairs.join("|").length > 255) pairs.shift();
    this._hass.callService("input_text", "set_value", { entity_id: store, value: pairs.join("|") });
  },

  _isPinned(uri) {
    return this._pins.some((p) => p.uri === uri);
  },

  async _togglePin(uri, name, kind) {
    const store = this._pinStore();
    if (!store || !uri) return;
    const existing = this._pins.find((p) => p.uri === uri);
    if (store.indexOf("todo.") === 0) {
      if (existing) {
        await this._hass.callService("todo", "remove_item", { entity_id: store, item: existing.uid });
      } else {
        await this._hass.callService("todo", "add_item", {
          entity_id: store, item: name || "Saved playlist", description: uri,
        });
      }
      this._loadPins();
      return;
    }
    const next = existing
      ? this._pins.filter((p) => p.uri !== uri)
      : this._pins.concat([{ uri, name: (name || "Saved").slice(0, 40) }]);
    this._pins = next;
    this._writePins(next);
    this._toast(existing ? "Removed from saved" : "Saved");
  },

  /* What is playing right now, as something that can be pinned. MA reports the
     queue item, so prefer the playlist it came from when there is one. */
  _pinnable() {
    const np = this._nowPlaying();
    if (!np) return null;
    const a = np.st.attributes;
    const uri = a.media_playlist_content_id || a.media_content_id;
    if (!uri) return null;
    const name = a.media_playlist || a.media_album_name || a.media_title;
    const kind = a.media_playlist ? "playlist" : (a.media_content_type || "track");
    return { uri, name, kind };
  },

  /* Which room a preset, a search result or the transport acts on: whatever
     the user last picked, else whatever is actually playing, else the default.
     One room — see the header note. Grouping is join, not a list of targets. */
  _targets() {
    const p = this._activePlayer();
    return p ? [p] : [];
  },

  _activePlayer() {
    const sec = this._musicSec();
    if (!sec) return null;
    const known = (sec.players || []).map((p) => p.entity);
    /* A pick survives only while the room still exists in config. */
    if (this._pick && known.indexOf(this._pick) >= 0) return this._pick;
    const np = this._nowPlaying();
    if (np && known.indexOf(np.entity) >= 0) return np.entity;
    return sec.default_player || known[0] || null;
  },

  _isPicked(entity) {
    return this._activePlayer() === entity;
  },

  /* Tapping a room makes it THE room. Tapping the one already active clears
     the pick, which hands control back to whatever is actually playing. */
  _togglePick(entity) {
    this._pick = this._pick === entity ? null : entity;
    this._queueKey = null;
    this._last = null;
    this._render();
    this._syncQueue();
  },

  /* --- grouping -----------------------------------------------------------
     These players carry the GROUPING bit, so media_player.join really does
     produce one synchronised stream across rooms — which is what tapping two
     rooms was pretending to do by starting two independent queues. */
  _groupOf(entity) {
    const st = entity && this._hass.states[entity];
    const g = (st && st.attributes.group_members) || [];
    return Array.isArray(g) ? g : [];
  },

  _isGrouped(entity) {
    const lead = this._activePlayer();
    if (!lead || lead === entity) return false;
    return this._groupOf(lead).indexOf(entity) >= 0;
  },

  _toggleJoin(entity) {
    const lead = this._activePlayer();
    if (!lead || lead === entity) return;
    if (this._isGrouped(entity)) {
      this._hass.callService("media_player", "unjoin", { entity_id: entity });
    } else {
      this._hass.callService("media_player", "join", {
        entity_id: lead, group_members: this._groupOf(lead).concat([entity]),
      });
    }
  },

  /* Move what is playing to the room you just picked, rather than making you
     find it again and start it over. */
  _moveHere() {
    const to = this._activePlayer();
    const np = this._nowPlaying();
    if (!to || !np || np.entity === to) return;
    this._hass.callService("music_assistant", "transfer_queue", {
      entity_id: to, source_player: np.entity, auto_play: true,
    });
    this._toast("Moving playback…");
  },

  /* Shuffle and repeat live in the queue answer, not in the entity, so both
     read from _queue and fall back to off until it lands. */
  _setShuffle() {
    const t = this._activePlayer();
    if (!t) return;
    const on = !!(this._queue && this._queue.shuffle_enabled);
    this._hass.callService("media_player", "shuffle_set", { entity_id: t, shuffle: !on });
    this._queueKey = null;
  },

  _cycleRepeat() {
    const t = this._activePlayer();
    if (!t) return;
    const cur = (this._queue && this._queue.repeat_mode) || "off";
    const next = cur === "off" ? "all" : cur === "all" ? "one" : "off";
    this._hass.callService("media_player", "repeat_set", { entity_id: t, repeat: next });
    this._queueKey = null;
  },

  /* The one player worth showing in the mini bar: prefer something actually
     playing, fall back to whatever is paused with a title. */
  _nowPlaying() {
    const np = this._config.now_playing || {};
    const players = np.players || [];
    const hass = this._hass;
    if (!hass) return null;
    let paused = null;
    for (const p of players) {
      const st = hass.states[p.entity];
      if (!st || !psIsMusic(st)) continue;
      const title = st.attributes.media_title;
      if (!title) continue;
      if (st.state === "playing") return { ...p, st, playing: true };
      if (!paused && st.state === "paused") paused = { ...p, st, playing: false };
    }
    return paused;
  },

  _secMusic(sec) {
    const h = this._hass;
    const np = this._nowPlaying();
    const art = np && np.st.attributes.entity_picture_local;
    const active = this._activePlayer();
    const players = (sec.players || []).map((p) => {
      const st = h.states[p.entity];
      const live = st && st.state === "playing" && psIsMusic(st);
      const on = p.entity === active;
      const grouped = this._isGrouped(p.entity);
      return `<button class="ps-mr ${on ? "sel" : ""} ${grouped ? "grp" : ""}" type="button"
        data-pick="${psEsc(p.entity)}" aria-pressed="${on}">
        ${live ? `<span class="ps-live"></span>` : ""}${psEsc(p.name)}</button>`;
    }).join("");

    const presets = (sec.presets || []).map((p, i) =>
      `<button class="ps-pr" type="button" data-preset="${i}">
        <ha-icon icon="${psEsc(p.icon || "mdi:playlist-music")}"></ha-icon>
        <span class="ps-trunc">${psEsc(p.name)}</span></button>`).join("");

    const grouped = this._groupOf(active).length;
    return `
      ${this._head(sec, grouped
        ? `<span class="ps-chip cool">${grouped + 1} rooms</span>`
        : `<span class="ps-chip">${np ? (np.playing ? "Playing" : "Paused") : "Idle"}</span>`)}
      <div class="ps-now">
        <div class="ps-art">${art
          ? `<img src="${psEsc(art)}" alt="" />`
          : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
        <div class="ps-grow">
          <div class="ps-nt ps-trunc">${np ? psEsc(np.st.attributes.media_title) : "Nothing playing"}</div>
          <div class="ps-ns ps-trunc">${np
            ? psEsc([np.st.attributes.media_artist, np.name].filter(Boolean).join(" · "))
            : "Pick a room to start"}</div>
        </div>
        ${this._pinBtn()}
        ${np ? `<button class="ps-tb" type="button" data-mp="playpause" data-entity="${psEsc(np.entity)}">
          <svg viewBox="0 0 24 24" class="ps-ico">${np.playing
            ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>` : ""}
      </div>
      <div class="ps-mroom">${players}</div>
      <div class="ps-btns" style="margin-top:10px">
        <button class="ps-btn" type="button" data-sheet="music">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM16 9a4 4 0 0 1 0 6"/></svg>
          Controls &amp; volume</button>
      </div>
      <div class="ps-xtra">
        ${this._recentHtml()}
        ${this._pinsHtml()}
        <div><span class="ps-lbl">Presets</span><div class="ps-pres">${presets}</div></div>
      </div>`;
  },

  /* A star on whatever is playing, so the playlist you just found by
     searching can be found again without searching for it. */
  _pinBtn() {
    if (!this._pinStore()) return "";
    const item = this._pinnable();
    if (!item) return "";
    const on = this._isPinned(item.uri);
    return `<button class="ps-pin ${on ? "on" : ""}" type="button"
        data-pin="${psEsc(item.uri)}" data-pinname="${psEsc(item.name)}" data-pinkind="${psEsc(item.kind)}"
        aria-pressed="${on}" aria-label="${on ? "Remove from saved" : "Save"}">
        <svg viewBox="0 0 24 24" class="ps-ico" ${on ? 'style="fill:currentColor"' : ""}>
          <path d="m12 4 2.35 4.76 5.25.77-3.8 3.7.9 5.23L12 15.99l-4.7 2.47.9-5.23-3.8-3.7 5.25-.77Z"/></svg>
      </button>`;
  },

  /* One row shape for anything playable — a recent track, a search hit, a
     queue peek. It carries its own enqueue button so "play now" stays the
     single obvious tap. */
  _mediaRow(r, i, from) {
    return `<div class="ps-mi">
        <button class="ps-miplay" type="button" data-play="${i}" data-from="${from}">
          <span class="ps-th">${r.image
            ? `<img src="${psEsc(r.image)}" alt="" />`
            : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</span>
          <span class="ps-grow"><span class="ps-min ps-trunc">${psEsc(r.name)}</span>
          <span class="ps-mis ps-trunc">${psEsc(r.sub || "")}</span></span>
          ${from === "results" && this._mtype === "all"
            /* Only where the list is mixed. With a filter chip lit, every row
               is that kind and the badge is just noise on every line. */
            ? `<span class="ps-kind">${psEsc(r.kind)}</span>` : ""}
        </button>
        <button class="ps-miq" type="button" data-queue="${i}" data-from="${from}"
          aria-label="Add ${psEsc(r.name)} to the queue">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M4 7h11M4 12h11M4 17h7M18 11v8M14 15h8"/></svg>
        </button>
      </div>`;
  },

  /* What you actually reach for is what you just played, so it leads. */
  _recentHtml() {
    if (!this._recent.length) return "";
    return `<div><span class="ps-lbl">Recently played</span>
      <div class="ps-mlist" style="margin-top:6px">${
        this._recent.map((r, i) => this._mediaRow(r, i, "recent")).join("")}</div></div>`;
  },

  _pinsHtml() {
    if (!this._pinStore() || !this._pins.length) return "";
    return `<span class="ps-lbl" style="display:block;margin:14px 0 6px">Saved</span>
      <div class="ps-pres">${this._pins.map((p, i) => `
        <span class="ps-pr">
          <button class="ps-prplay" type="button" data-pinplay="${i}">
            <ha-icon icon="mdi:playlist-star"></ha-icon>
            <span class="ps-trunc">${psEsc(p.name)}</span></button>
          <button class="ps-prx" type="button" data-pin="${psEsc(p.uri)}"
            aria-label="Remove ${psEsc(p.name)} from saved">
            <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </span>`).join("")}</div>`;
  },

  /* The results block is patched on its own — see _paintResults — so it has to
     render from state alone, chips included. */
  _resultsHtml() {
    const sec = this._musicSec();
    const cur = this._mtype || "all";
    const chips = PS_MTYPES.map((t) =>
      `<button class="ps-fc ${t.key === cur ? "on" : ""}" type="button" data-mtype="${t.key}"
        aria-pressed="${t.key === cur}">${t.label}</button>`).join("");

    let body = "";
    if (this._searching) {
      body = `<div class="ps-note">Searching…</div>`;
    } else if (this._results && this._results.length) {
      body = `<div class="ps-mlist">${
        this._results.map((r, i) => this._mediaRow(r, i, "results")).join("")}</div>`;
      if (this._pinStore()) {
        body += `<div class="ps-note">Hold a row to save it. The list icon queues it up next.</div>`;
      }
    } else if (this._results && !this._results.length) {
      body = `<div class="ps-note">${sec && sec.config_entry
        ? "No results." : "Search needs a Music Assistant config_entry."}</div>`;
    }
    return `<div class="ps-filters">${chips}</div>${body}`;
  },

  /* "17 of 27 · up next X" is the part of a queue worth the space. The whole
     list would not fit above the fold and is not what you came to check. */
  _queueHtml() {
    const q = this._queue;
    const target = this._activePlayer();
    if (!q || !q.active || q.entity !== target || !q.items) return "";
    const next = q.next_item && q.next_item.media_item;
    const pos = Number.isFinite(q.current_index) ? `${q.current_index + 1} of ${q.items}` : `${q.items} queued`;
    const shuf = !!q.shuffle_enabled;
    const rep = q.repeat_mode || "off";
    return `<div class="ps-qbar">
        <button class="ps-qb ${shuf ? "on" : ""}" type="button" id="ps-shuf"
          aria-pressed="${shuf}" aria-label="Shuffle">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M17 4l3 3-3 3M17 14l3 3-3 3M4 7h4l8 10h4M4 17h4l2.2-2.8M14 8.8L16 7h4"/></svg>
        </button>
        <button class="ps-qb ${rep !== "off" ? "on" : ""}" type="button" id="ps-rep"
          aria-label="Repeat: ${rep}">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5M17 7v4M7 17v-4"/></svg>
          ${rep === "one" ? `<span class="ps-qone">1</span>` : ""}
        </button>
        <span class="ps-grow ps-trunc ps-qup">${next
          ? `Up next · ${psEsc(next.name)}`
          : "Last in queue"}</span>
        <span class="ps-qpos">${psEsc(pos)}</span>
      </div>`;
  },
});
