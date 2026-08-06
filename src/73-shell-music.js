/* ============================================================================
 * purdy-shell-card — Music Assistant
 *
 * Music targets a room, not a card: _activePlayer() is whatever the user last
 * tapped, else whatever is actually playing, else default_player, so a stale
 * pick falls back rather than targeting a dead entity.
 *
 * Saved playlists live in a 255-character input_text, so the oldest saves are
 * dropped rather than the write failing.
 * ========================================================================== */

Object.assign(PurdyShellCard.prototype, {
  /* GTTC exposes the whole schedule over its own websocket command; the
     climate entity only ever carries the window that happens to be active. */
  /* Recently listened comes from HA's recorder, not Music Assistant: MA's
     last_played / play_count are empty in this install, so its own
     "recently played" ordering is silently meaningless. Every MA player logs
     media_title, media_artist and a playable media_content_id per state
     change, so read it back from there. Bounded by recorder retention. */
  async _fetchRecent() {
    const sec = (this._config.sections || []).find((x) => x.type === "music");
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
        if (a.app_id !== "music_assistant" && PS_MUSIC_TYPES.indexOf(a.media_content_type) < 0) return;
        rows.push({
          t: new Date(e.last_changed || e.last_updated).getTime(),
          uri: a.media_content_id,
          name: a.media_title,
          sub: a.media_artist || a.media_album_name || "",
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

  async _runSearch() {
    const sec = (this._config.sections || []).find((x) => x.type === "music");
    const q = (this._query || "").trim();
    const entry = sec && sec.config_entry;
    if (!q || !entry) {
      this._results = q && !entry ? [] : null;
      this._render();
      return;
    }
    this._searching = true;
    this._render();
    try {
      const r = await this._hass.callService(
        "music_assistant", "search",
        { config_entry_id: entry, name: q }, undefined, false, true
      );
      const d = (r && r.response) || {};
      const rows = [];
      const take = (arr, kind, n) => (arr || []).slice(0, n).forEach((x) => rows.push({
        uri: x.uri, name: x.name, kind, image: x.image,
        sub: kind === "track" && x.artists && x.artists.length
          ? x.artists.map((a) => a.name).join(", ") : kind,
      }));
      take(d.tracks, "track", 4);
      take(d.playlists, "playlist", 3);
      take(d.albums, "album", 2);
      take(d.artists, "artist", 2);
      this._results = rows;
    } catch (err) {
      this._results = [];
    }
    this._searching = false;
    this._render();
  },

  _playUri(uri, kind) {
    const targets = this._targets();
    if (!uri || !targets.length) return;
    this._hass.callService("music_assistant", "play_media", {
      entity_id: targets, media_id: uri, media_type: kind || "track", enqueue: "replace",
    });
  },

  /* --- saved playlists ----------------------------------------------------
     A store is either a todo list (unbounded) or an input_text (`uri~name`
     pairs, and that helper caps at 255 characters, so the oldest pins fall
     off rather than the write failing). */
  _pinStore() {
    const sec = (this._config.sections || []).find((x) => x.type === "music");
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
    this._last = null;
    this._render();
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
     the user last picked, else whatever is actually playing, else the default. */
  _targets() {
    const sec = (this._config.sections || []).find((x) => x.type === "music");
    if (!sec) return [];
    const known = (sec.players || []).map((p) => p.entity);
    const picked = (this._sel || []).filter((e) => known.indexOf(e) >= 0);
    if (picked.length) return picked;
    const np = this._nowPlaying();
    if (np) return [np.entity];
    const fallback = sec.default_player || known[0];
    return fallback ? [fallback] : [];
  },

  /* The room the transport and the main volume act on: the first selected. */
  _activePlayer() {
    return this._targets()[0] || null;
  },

  _isPicked(entity) {
    return (this._sel || []).indexOf(entity) >= 0;
  },

  /* Tapping toggles, so two taps play to two rooms and tapping again drops
     one. Emptying the selection falls back to whatever is playing. */
  _togglePick(entity) {
    const cur = this._sel || [];
    this._sel = cur.indexOf(entity) >= 0 ? cur.filter((e) => e !== entity) : cur.concat([entity]);
    this._render();
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
      const on = this._isPicked(p.entity) || (!(this._sel || []).length && p.entity === active);
      return `<button class="ps-mr ${on ? "sel" : ""}" type="button"
        data-pick="${psEsc(p.entity)}" aria-pressed="${on}">
        ${live ? `<span class="ps-live"></span>` : ""}${psEsc(p.name)}</button>`;
    }).join("");

    const presets = (sec.presets || []).map((p, i) =>
      `<button class="ps-pr" type="button" data-preset="${i}">
        <ha-icon icon="${psEsc(p.icon || "mdi:playlist-music")}"></ha-icon>
        <span class="ps-trunc">${psEsc(p.name)}</span></button>`).join("");

    return `
      ${this._head(sec, (this._sel || []).length > 1
        ? `<span class="ps-chip cool">${this._sel.length} rooms</span>`
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

  /* What you actually reach for is what you just played, so it leads. */
  _recentHtml() {
    if (!this._recent.length) return "";
    return `<div><span class="ps-lbl">Recently played</span>
      <div class="ps-mlist" style="margin-top:6px">${this._recent.map((r, i) => `
        <button class="ps-mi" type="button" data-play="${i}" data-from="recent">
          <span class="ps-th"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg></span>
          <span class="ps-grow"><span class="ps-min ps-trunc">${psEsc(r.name)}</span>
          <span class="ps-mis ps-trunc">${psEsc(r.sub)}</span></span></button>`).join("")}</div></div>`;
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
});

