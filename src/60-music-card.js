/* ----------------------------------------------------------------- music --*/

/* Music Assistant surface, in two modes:
 *
 *   compact: true   home-screen headline — art, track, room, transport.
 *                   Renders nothing at all when no room is playing music,
 *                   so it needs no `conditional` wrapper.
 *   (default)       the #music popup — same headline, plus volume, a room
 *                   picker and playlist presets.
 *
 * Rooms are an explicit list rather than a sweep of the media_player domain:
 * Music Assistant mirrors every source player, and this house carries a dozen
 * permanently-unavailable AirPlay duplicates that a sweep would surface.
 */

/* States that mean "there is a queue we can act on". */
const PC_MUSIC_LIVE = ["playing", "paused", "buffering"];

/* The is-it-music rule itself lives in 05-shared.js; this adds the liveness
   check the card needs on top of it. */
function pcIsMusic(hass, id) {
  const st = hass && hass.states[id];
  if (!st || PC_MUSIC_LIVE.indexOf(st.state) < 0) return false;
  return pcIsMusicState(st);
}

class PurdyMusicCard extends PcBaseCard {
  /* Prefer players Music Assistant is actually driving; fall back to any media
     player so the card picker never hands back a config that will not load. */
  static getStubConfig(hass) {
    const all = Object.keys(hass.states).filter((e) => e.startsWith("media_player."));
    const ma = all.filter((e) => (hass.states[e].attributes || {}).app_id === "music_assistant");
    const p = (ma.length ? ma : all).slice(0, 4);
    return {
      players: (p.length ? p : ["media_player.speaker"]).map((e) => ({ entity: e })),
      presets: [],
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.players) || !config.players.length) {
      throw new Error("purdy-music-card: 'players' (a list) is required");
    }
    this._config = {
      title: "Music", compact: false, presets: [],
      recent_hours: 48, recent_max: 8,
      search_types: ["track", "playlist", "album", "artist"],
      ...config,
    };
    this._watched = config.players.map((p) => p.entity).filter(Boolean);
    this._last = null;
    this._sel = null;      /* entity_id the user picked, or null for auto */
    this._recent = [];
    this._results = null;  /* null = no search run yet, [] = ran and found nothing */
    this._query = "";
    this._searching = false;
    this._focus = false;   /* keep the caret in the search box across re-renders */
    if (this._recentTimer) clearInterval(this._recentTimer);
    if (!this._config.compact) {
      this._recentTimer = setInterval(() => this._fetchRecent(), 5 * 60 * 1000);
    }
  }

  disconnectedCallback() {
    if (this._recentTimer) clearInterval(this._recentTimer);
    if (this._debounce) clearTimeout(this._debounce);
  }

  /* PcBaseCard signs on state alone, which never changes as a queue moves from
     track to track. Sign on the fields this card actually draws. */
  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const sig = this._watched
      .map((id) => {
        const st = hass.states[id];
        if (!st) return "~";
        const a = st.attributes || {};
        return [st.state, a.media_title, a.media_artist, a.volume_level,
                a.is_volume_muted, a.app_id].join(",");
      })
      .join("|");
    if (!this._config.compact && !this._recentInit) {
      this._recentInit = true;
      this._fetchRecent();
    }
    if (sig === this._last) return;
    this._last = sig;
    this._render();
  }

  /* ---- recently listened --------------------------------------------------
     Not from Music Assistant. Its last_played / play_count columns are empty
     in this install and the built-in "Recently played tracks" smart playlist
     browses to zero children, so `order_by: last_played_desc` just returns the
     library in id order — it looks like it worked and is silently meaningless.
     HA's own recorder does have the history: every MA player logs media_title,
     media_artist and a playable media_content_id on each state change. So read
     it from there, newest first, deduped by URI. */
  async _fetchRecent() {
    if (!this._hass || !this._hass.callApi || this._config.compact) return;
    const ids = this._watched;
    if (!ids.length) return;
    const start = new Date(Date.now() - this._config.recent_hours * 3600 * 1000).toISOString();
    try {
      const res = await this._hass.callApi(
        "GET",
        /* end_time is not optional — see pcNowIso. recent_hours is 48 here,
           so the window used to stop 24h short and today never appeared. */
        `history/period/${start}?filter_entity_id=${ids.join(",")}` +
        `&end_time=${encodeURIComponent(pcNowIso())}`
      );
      const rows = [];
      (res || []).forEach((series) => (series || []).forEach((e) => {
        const a = e.attributes || {};
        if (!a.media_title || !a.media_content_id) return;
        /* Same music-vs-TV test the live card uses, so a Peacock episode does
           not end up filed as a recently-played track. */
        if (a.app_id !== "music_assistant" &&
            PC_MUSIC_TYPES.indexOf(a.media_content_type) < 0) return;
        rows.push({
          t: new Date(e.last_changed || e.last_updated).getTime(),
          uri: a.media_content_id,
          name: a.media_title,
          sub: a.media_artist || a.media_album_name || "",
          image: null,
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
      this._recent = out.slice(0, this._config.recent_max);
      this._render();
    } catch (err) {
      /* Recorder may be purged or unavailable; the section just stays empty. */
      console.warn("purdy-music-card: history fetch failed", err);
    }
  }

  /* ---- search ------------------------------------------------------------- */

  async _runSearch() {
    const q = (this._query || "").trim();
    const entry = this._config.config_entry;
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
        { config_entry_id: entry, name: q, media_type: this._config.search_types },
        undefined, false, true
      );
      const d = (r && r.response) || {};
      const rows = [];
      const take = (arr, kind, n) => (arr || []).slice(0, n).forEach((x) => rows.push({
        uri: x.uri,
        name: x.name,
        kind,
        sub: kind === "track" && x.artists && x.artists.length
          ? x.artists.map((a) => a.name).join(", ")
          : kind,
        image: x.image,
      }));
      take(d.tracks, "track", 4);
      take(d.playlists, "playlist", 3);
      take(d.albums, "album", 2);
      take(d.artists, "artist", 2);
      this._results = rows;
    } catch (err) {
      console.warn("purdy-music-card: search failed", err);
      this._results = [];
    }
    this._searching = false;
    this._render();
  }

  _playItem(item) {
    const t = this._active();
    if (!t) return;
    this._hass.callService("music_assistant", "play_media", {
      entity_id: t.entity,
      media_id: item.uri,
      media_type: item.kind || "track",
      enqueue: "replace",
    });
    this._sel = t.entity;
  }

  _players() {
    return this._config.players.filter((p) => p.entity && this._hass.states[p.entity]);
  }

  _label(p) {
    return p.name || pcName(this._hass, p.entity).replace(/\s*\+?$/, "");
  }

  /* Whatever is playing wins over whatever is merely paused, and an explicit
     pick wins over both — but only while that pick is still a real player. */
  _active() {
    const ps = this._players();
    if (!ps.length) return null;
    if (this._sel) {
      const picked = ps.find((p) => p.entity === this._sel);
      if (picked) return picked;
    }
    return ps.find((p) => pcState(this._hass, p.entity) === "playing" && pcIsMusic(this._hass, p.entity))
        || ps.find((p) => pcIsMusic(this._hass, p.entity))
        || null;
  }

  _call(service, data) {
    const a = this._active();
    if (!a) return;
    this._hass.callService("media_player", service, { entity_id: a.entity, ...(data || {}) });
  }

  /* Tapping a room selects it; tapping the room that is already selected stops
     it.

     Most of these players do NOT advertise TURN_OFF: the Cast speakers report
     supported_features 8320575, whose low bits are 63 — pause/seek/volume/prev/
     next and nothing else. Only the Whole House group player (7796671) carries
     the TURN_OFF bit. Calling turn_off blindly would be a silent no-op on every
     individual room, so fall back to media_stop, which ends the queue rather
     than merely pausing it, and only then to media_pause. */
  _off(entity) {
    const st = this._hass.states[entity];
    const feat = (st && st.attributes.supported_features) || 0;
    const svc = (feat & 256) ? "turn_off"        /* TURN_OFF  */
              : (feat & 4096) ? "media_stop"     /* STOP      */
              : "media_pause";                   /* PAUSE     */
    this._hass.callService("media_player", svc, { entity_id: entity });
    this._sel = null;
  }

  _play(preset, entity) {
    this._hass.callService("music_assistant", "play_media", {
      entity_id: entity,
      media_id: preset.uri,
      media_type: preset.media_type || "playlist",
      enqueue: "replace",
    });
    this._sel = entity;
  }

  /* entity_picture_local first, deliberately.
     Music Assistant publishes entity_picture as an absolute plain-HTTP URL to
     its own add-on port (http://<host>:8095/imageproxy/...). That fails twice
     on a phone: HTTPS pages block it as mixed content, and it is unreachable
     off the LAN. entity_picture_local is HA's same-origin authenticated proxy,
     which works in both places. */
  _art(st) {
    const a = st.attributes;
    const pic = a.entity_picture_local || a.entity_picture;
    if (!pic) return `<div class="art ph"><ha-icon icon="mdi:music-note"></ha-icon></div>`;
    return `<div class="art"><img src="${pic}" alt="" loading="lazy"></div>`;
  }

  /* Track and playlist names are third-party strings that land in innerHTML —
     "Rock & Roll", a title with a quote, or worse. Escape them. */
  _esc(s) {
    return pcEsc(s);
  }

  _itemHtml(r, group, i) {
    const thumb = r.image
      ? `<div class="thumb"><img src="${this._esc(r.image)}" alt="" loading="lazy"></div>`
      : `<div class="thumb"><ha-icon icon="${r.kind === "playlist" ? "mdi:playlist-music"
          : r.kind === "artist" ? "mdi:account-music"
          : r.kind === "album" ? "mdi:album" : "mdi:music-note"}"></ha-icon></div>`;
    return `
      <button class="item" type="button" data-${group}="${i}">
        ${thumb}
        <span class="grow">
          <span class="n trunc" style="display:block">${this._esc(r.name)}</span>
          <span class="s trunc" style="display:block">${this._esc(r.sub)}</span>
        </span>
        ${group === "res" ? `<span class="kind">${this._esc(r.kind)}</span>` : ""}
      </button>`;
  }

  _renderEmpty() {
    /* Compact mode is a headline for something that is happening. When nothing
       is, the home screen should not carry a dead row. */
    if (this._config.compact) {
      this.shadowRoot.innerHTML = "";
      this.style.display = "none";
      return true;
    }
    return false;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const a = this._active();
    const anyLive = this._players().some((p) => pcIsMusic(this._hass, p.entity));

    if (!anyLive && !this._sel && this._renderEmpty()) return;
    this.style.display = "block";

    const compact = !!this._config.compact;
    const st = a ? this._hass.states[a.entity] : null;
    const attrs = st ? st.attributes : {};
    const playing = st && st.state === "playing";
    const title = attrs.media_title || (a ? "Nothing playing" : "No player");
    const artist = attrs.media_artist || (a ? this._label(a) : "");
    const sub = compact && attrs.media_artist
      ? `${attrs.media_artist} · ${this._label(a)}`
      : artist;
    const vol = typeof attrs.volume_level === "number" ? Math.round(attrs.volume_level * 100) : null;
    const muted = !!attrs.is_volume_muted;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .card.tap { cursor: pointer; }
        .hd { display: flex; align-items: center; gap: 8px; padding: 0 2px 11px; }
        .hd b { font-size: 20px; font-weight: 650; letter-spacing: -0.02em; }
        .hd .spacer { flex: 1; }
        .chip.good { background: rgba(129,201,149,0.15); color: var(--pc-good); }
        .chip .cdot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

        .now { display: flex; align-items: center; gap: 12px; }
        .art {
          width: ${compact ? "46px" : "68px"}; height: ${compact ? "46px" : "68px"};
          border-radius: ${compact ? "13px" : "18px"}; flex: 0 0 auto; overflow: hidden;
          background: var(--pc-panel-2); display: flex; align-items: center;
          justify-content: center; color: var(--pc-muted);
        }
        .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .art.ph ha-icon { --mdc-icon-size: ${compact ? "22px" : "30px"}; }
        .t {
          font-size: ${compact ? "15.5px" : "17px"}; font-weight: 650;
          letter-spacing: -0.015em; margin-bottom: 2px;
        }
        .sub { font-size: 12.5px; color: var(--pc-muted); }

        .tr { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
        .tb {
          border: 0; cursor: pointer; padding: 0; background: none;
          color: var(--pc-text); display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; border-radius: 50%;
        }
        .tb:active { background: var(--pc-chip); }
        .tb[disabled] { opacity: 0.3; cursor: default; }
        .tb.pp { background: var(--pc-chip); width: 44px; height: 44px; }
        .tb.pp ha-icon { --mdc-icon-size: 26px; }
        .tb ha-icon { --mdc-icon-size: 22px; }
        .tr.full { justify-content: center; gap: 14px; margin: 16px 0 4px; }

        .vol { display: flex; align-items: center; gap: 11px; margin: 12px 0 2px; }
        .vbtn {
          flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; border: 0;
          cursor: pointer; background: var(--pc-chip); color: var(--pc-muted);
          display: flex; align-items: center; justify-content: center;
        }
        .vbtn.muted { color: var(--pc-bad); }
        .vbtn ha-icon { --mdc-icon-size: 18px; }
        input[type=range] {
          flex: 1; -webkit-appearance: none; appearance: none; height: 6px;
          border-radius: 999px; background: var(--pc-track); outline: none;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; width: 18px; height: 18px;
          border-radius: 50%; background: var(--pc-text); cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 18px; height: 18px; border: 0; border-radius: 50%;
          background: var(--pc-text); cursor: pointer;
        }
        .vnum { flex: 0 0 auto; width: 34px; text-align: right; font-size: 12px; color: var(--pc-muted); }

        .sec { margin-top: 18px; }
        .sec .lbl { display: block; margin-bottom: 8px; }
        .rooms { display: flex; flex-wrap: wrap; gap: 7px; }
        .room {
          border: 0; cursor: pointer; font-family: inherit; padding: 9px 13px;
          border-radius: 13px; background: var(--pc-panel-2); color: var(--pc-muted);
          font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 6px;
        }
        .room.sel { background: var(--pc-chip); color: var(--pc-text); }
        .room .live { width: 6px; height: 6px; border-radius: 50%; background: var(--pc-good); }
        .room[disabled] { opacity: 0.4; cursor: default; }
        /* The selected room doubles as its own power button — say so. */
        .room .off { --mdc-icon-size: 15px; color: var(--pc-muted); margin-left: 1px; }
        .room.sel:active .off { color: var(--pc-bad); }

        .presets { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .preset {
          border: 0; cursor: pointer; font-family: inherit; text-align: left;
          padding: 11px 12px; border-radius: 15px; background: var(--pc-panel-2);
          color: var(--pc-text); font-size: 12.5px; font-weight: 600;
          display: flex; align-items: center; gap: 9px; min-width: 0;
        }
        .preset:active { background: var(--pc-chip); }
        .preset ha-icon { --mdc-icon-size: 19px; color: var(--pc-cool); }
        button:focus-visible, input:focus-visible { outline: 2px solid var(--pc-cool); outline-offset: 2px; }

        .sbox { display: flex; align-items: center; gap: 9px; background: var(--pc-panel-2);
                border-radius: 14px; padding: 0 12px; height: 44px; }
        .sbox ha-icon { --mdc-icon-size: 19px; color: var(--pc-muted); }
        .sbox input {
          flex: 1; min-width: 0; border: 0; background: none; outline: none;
          font-family: inherit; font-size: 14px; color: var(--pc-text); height: 100%;
        }
        .sbox input::placeholder { color: var(--pc-muted); }
        .sclear { border: 0; background: none; cursor: pointer; padding: 0; display: flex; }

        .list { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
        .item {
          display: flex; align-items: center; gap: 10px; width: 100%;
          border: 0; background: none; cursor: pointer; font-family: inherit;
          padding: 7px 6px; border-radius: 12px; text-align: left; color: var(--pc-text);
        }
        .item:active { background: var(--pc-panel-2); }
        .thumb {
          width: 38px; height: 38px; border-radius: 9px; flex: 0 0 auto; overflow: hidden;
          background: var(--pc-panel-2); display: flex; align-items: center;
          justify-content: center; color: var(--pc-muted);
        }
        .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .thumb ha-icon { --mdc-icon-size: 18px; }
        .item .n { font-size: 13.5px; font-weight: 600; }
        .item .s { font-size: 11.5px; color: var(--pc-muted); }
        .kind {
          flex: 0 0 auto; font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase;
          color: var(--pc-muted); background: var(--pc-chip); padding: 3px 7px; border-radius: 999px;
        }
        .note { font-size: 12px; color: var(--pc-muted); padding: 10px 6px; }
      </style>

      <div class="card tint ${compact && this._config.navigate ? "tap" : ""}" id="card">
        ${compact ? "" : `
          <div class="hd">
            <b>${this._config.title}</b>
            <span class="spacer"></span>
            ${anyLive ? '<span class="chip good"><span class="cdot"></span>Playing</span>' : ""}
          </div>`}

        <div class="now">
          ${st ? this._art(st) : `<div class="art ph"><ha-icon icon="mdi:music-note-off"></ha-icon></div>`}
          <div class="grow">
            <div class="t trunc">${this._esc(title)}</div>
            <div class="sub trunc">${this._esc(sub)}</div>
          </div>
          ${compact ? `
            <div class="tr">
              <button class="tb pp" type="button" id="pp" aria-label="Play or pause" ${a ? "" : "disabled"}>
                <ha-icon icon="${playing ? "mdi:pause" : "mdi:play"}"></ha-icon>
              </button>
              <button class="tb" type="button" id="next" aria-label="Next track" ${a ? "" : "disabled"}>
                <ha-icon icon="mdi:skip-next"></ha-icon>
              </button>
            </div>` : ""}
        </div>

        ${compact ? "" : `
          <div class="tr full">
            <button class="tb" type="button" id="prev" aria-label="Previous track" ${a ? "" : "disabled"}>
              <ha-icon icon="mdi:skip-previous"></ha-icon>
            </button>
            <button class="tb pp" type="button" id="pp" aria-label="Play or pause" ${a ? "" : "disabled"}>
              <ha-icon icon="${playing ? "mdi:pause" : "mdi:play"}"></ha-icon>
            </button>
            <button class="tb" type="button" id="next" aria-label="Next track" ${a ? "" : "disabled"}>
              <ha-icon icon="mdi:skip-next"></ha-icon>
            </button>
          </div>

          ${vol === null ? "" : `
            <div class="vol">
              <button class="vbtn ${muted ? "muted" : ""}" type="button" id="mute" aria-label="Mute">
                <ha-icon icon="${muted ? "mdi:volume-off" : "mdi:volume-high"}"></ha-icon>
              </button>
              <input type="range" id="vol" min="0" max="100" step="1" value="${vol}" aria-label="Volume">
              <span class="vnum num">${vol}%</span>
            </div>`}

          <div class="sec">
            <span class="lbl">Rooms</span>
            <div class="rooms">
              ${this._players().map((p) => `
                <button class="room ${a && p.entity === a.entity ? "sel" : ""}" type="button"
                        data-room="${p.entity}"
                        title="${a && p.entity === a.entity ? "Tap again to turn off" : "Select " + this._label(p)}">
                  ${pcIsMusic(this._hass, p.entity) ? '<span class="live"></span>' : ""}${this._label(p)}
                  ${a && p.entity === a.entity ? '<ha-icon class="off" icon="mdi:power"></ha-icon>' : ""}
                </button>`).join("")}
            </div>
          </div>

          ${!this._config.presets.length ? "" : `
            <div class="sec">
              <span class="lbl">Presets</span>
              <div class="presets">
                ${this._config.presets.map((x, i) => `
                  <button class="preset" type="button" data-preset="${i}">
                    <ha-icon icon="${x.icon || "mdi:playlist-music"}"></ha-icon>
                    <span class="trunc">${x.name}</span>
                  </button>`).join("")}
              </div>
            </div>`}

          ${!this._config.config_entry ? "" : `
            <div class="sec">
              <span class="lbl">Search</span>
              <div class="sbox">
                <ha-icon icon="mdi:magnify"></ha-icon>
                <input type="search" id="q" placeholder="Songs, playlists, artists"
                       autocomplete="off" autocorrect="off" spellcheck="false"
                       value="${this._esc(this._query)}">
                ${this._query ? `<button class="sclear" type="button" id="qclear" aria-label="Clear search">
                  <ha-icon icon="mdi:close-circle"></ha-icon></button>` : ""}
              </div>
              ${this._searching ? '<div class="note">Searching…</div>' : ""}
              ${!this._searching && this._results && !this._results.length
                ? `<div class="note">No results for "${this._esc(this._query)}".</div>` : ""}
              ${!this._searching && this._results && this._results.length
                ? `<div class="list">${this._results.map((r, i) => this._itemHtml(r, "res", i)).join("")}</div>` : ""}
            </div>`}

          <div class="sec">
            <span class="lbl">Recently listened</span>
            ${this._recent.length
              ? `<div class="list">${this._recent.map((r, i) => this._itemHtml(r, "rec", i)).join("")}</div>`
              : `<div class="note">Nothing in the last ${this._config.recent_hours} hours.</div>`}
          </div>
        `}
      </div>
    `;

    const pp = this.shadowRoot.getElementById("pp");
    if (pp) pp.addEventListener("click", (e) => { e.stopPropagation(); this._call("media_play_pause"); });
    const nx = this.shadowRoot.getElementById("next");
    if (nx) nx.addEventListener("click", (e) => { e.stopPropagation(); this._call("media_next_track"); });
    const pv = this.shadowRoot.getElementById("prev");
    if (pv) pv.addEventListener("click", () => this._call("media_previous_track"));
    const mu = this.shadowRoot.getElementById("mute");
    if (mu) mu.addEventListener("click", () => this._call("volume_mute", { is_volume_muted: !muted }));
    const vr = this.shadowRoot.getElementById("vol");
    if (vr) {
      vr.addEventListener("change", () =>
        this._call("volume_set", { volume_level: parseInt(vr.value, 10) / 100 }));
    }
    this.shadowRoot.querySelectorAll("[data-room]").forEach((el) => {
      el.addEventListener("click", () => {
        const room = el.dataset.room;
        if (a && room === a.entity) this._off(room);
        else this._sel = room;
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("[data-preset]").forEach((el) => {
      el.addEventListener("click", () => {
        const target = this._active();
        if (!target) return;
        this._play(this._config.presets[parseInt(el.dataset.preset, 10)], target.entity);
      });
    });
    this.shadowRoot.querySelectorAll("[data-res]").forEach((el) => {
      el.addEventListener("click", () => this._playItem(this._results[parseInt(el.dataset.res, 10)]));
    });
    this.shadowRoot.querySelectorAll("[data-rec]").forEach((el) => {
      el.addEventListener("click", () => this._playItem(this._recent[parseInt(el.dataset.rec, 10)]));
    });

    const q = this.shadowRoot.getElementById("q");
    if (q) {
      /* A queue moving to the next track re-renders the whole card, which would
         otherwise blow away a half-typed query mid-search. Keep the value and
         the caret, and only re-render on a debounce rather than per keystroke. */
      q.addEventListener("focus", () => { this._focus = true; });
      q.addEventListener("blur", () => { this._focus = false; });
      q.addEventListener("input", () => {
        this._query = q.value;
        clearTimeout(this._debounce);
        this._debounce = setTimeout(() => this._runSearch(), 450);
      });
      q.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        clearTimeout(this._debounce);
        this._runSearch();
      });
      if (this._focus) {
        q.focus();
        const n = q.value.length;
        if (q.setSelectionRange) q.setSelectionRange(n, n);
      }
    }
    const qc = this.shadowRoot.getElementById("qclear");
    if (qc) {
      qc.addEventListener("click", () => {
        this._query = "";
        this._results = null;
        this._render();
      });
    }

    /* Whole-card tap is compact-only, and the transport buttons above already
       stop propagation so a play tap does not also open the popup. */
    if (compact && this._config.navigate) {
      const card = this.shadowRoot.getElementById("card");
      if (card) card.addEventListener("click", () => pcNavigate(this, this._config.navigate));
    }
  }

  getCardSize() {
    return this._config && this._config.compact ? 2 : 10;
  }
}
