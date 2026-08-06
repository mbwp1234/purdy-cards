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

/* An MA player also proxies whatever else its source device is doing — the
   Living Room Cast reports `playing` all through a Peacock episode. Only treat
   it as music when Music Assistant is the app driving it, or when the content
   type says so outright. */
const PC_MUSIC_TYPES = ["music", "playlist", "track", "album", "radio"];

function pcIsMusic(hass, id) {
  const st = hass && hass.states[id];
  if (!st || PC_MUSIC_LIVE.indexOf(st.state) < 0) return false;
  const a = st.attributes || {};
  if (a.app_id === "music_assistant") return true;
  return PC_MUSIC_TYPES.indexOf(a.media_content_type) >= 0;
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
    this._config = { title: "Music", compact: false, presets: [], ...config };
    this._watched = config.players.map((p) => p.entity).filter(Boolean);
    this._last = null;
    this._sel = null;      /* entity_id the user picked, or null for auto */
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
    if (sig === this._last) return;
    this._last = sig;
    this._render();
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

  _play(preset, entity) {
    this._hass.callService("music_assistant", "play_media", {
      entity_id: entity,
      media_id: preset.uri,
      media_type: preset.media_type || "playlist",
      enqueue: "replace",
    });
    this._sel = entity;
  }

  _art(st) {
    const pic = st.attributes.entity_picture;
    if (!pic) return `<div class="art ph"><ha-icon icon="mdi:music-note"></ha-icon></div>`;
    /* entity_picture is usually a relative HA path; MA hands back an absolute
       imageproxy URL. Both work as-is in an <img>. */
    return `<div class="art"><img src="${pic}" alt="" loading="lazy"></div>`;
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
            <div class="t trunc">${title}</div>
            <div class="sub trunc">${sub}</div>
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
                        data-room="${p.entity}">
                  ${pcIsMusic(this._hass, p.entity) ? '<span class="live"></span>' : ""}${this._label(p)}
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
      el.addEventListener("click", () => { this._sel = el.dataset.room; this._render(); });
    });
    this.shadowRoot.querySelectorAll("[data-preset]").forEach((el) => {
      el.addEventListener("click", () => {
        const target = this._active();
        if (!target) return;
        this._play(this._config.presets[parseInt(el.dataset.preset, 10)], target.entity);
      });
    });

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
