/* ------------------------------------------------------------------ remote --*/

/* Brand marks drawn inline. The cbi:/si:/phu: iconsets are not reliably
   present, and a missing icon renders as an empty box — so the card owns
   its artwork rather than depending on an iconset being installed. */
const PC_BRANDS = {
  netflix: `<svg viewBox="0 0 24 24"><path fill="#B20710" d="M6.6 2h3.9l7 20h-3.9z"/><path fill="#E50914" d="M6.6 2h3.9v20H6.6zM13.5 2h3.9v20h-3.9z"/></svg>`,
  disney: `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#0C204A"/><text x="12" y="16.4" text-anchor="middle" font-family="Georgia,serif" font-size="11" font-style="italic" font-weight="700" fill="#fff">D+</text></svg>`,
  prime: `<svg viewBox="0 0 24 24"><rect x="2" y="3.5" width="20" height="17" rx="4" fill="#1399FF"/><path fill="#fff" d="M9.8 8.2l6 3.4-6 3.4z"/><path d="M6.6 17.4c3.1 1.7 7.7 1.7 10.8 0" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  peacock: `<svg viewBox="0 0 24 24"><g fill="none" stroke-width="2.4" stroke-linecap="round"><path stroke="#0089CF" d="M12 21C8.2 18.2 6.3 13 7.3 8"/><path stroke="#6E3FA3" d="M12 21c-1.9-3.9-2.4-9-1.4-13"/><path stroke="#E4002B" d="M12 21c0-4 .5-9 1.5-13"/><path stroke="#F6A800" d="M12 21c1.9-3.9 4-7.9 5.5-10.6"/><path stroke="#FFD100" d="M12 21c2.9-3 5.9-5.9 7.9-7.7"/></g></svg>`,
  twitch: `<svg viewBox="0 0 24 24"><path fill="#9146FF" d="M4.4 3h15.2v10.6l-3.6 3.6h-3L10 20.4H8.1v-3.2H4.4z"/><path fill="#fff" d="M10.4 6.9h1.8v5.2h-1.8zM14.6 6.9h1.8v5.2h-1.8z"/></svg>`,
  f1: `<svg viewBox="0 0 24 24"><text x="12" y="16.2" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="11" font-style="italic" font-weight="900" fill="#E10600">F1</text></svg>`,
  jellyfin: `<svg viewBox="0 0 24 24"><path fill="#AA5CC3" d="M12 3.4c1.7 0 6.4 8.4 5.5 9.9-.9 1.5-10.1 1.5-11 0C5.6 11.8 10.3 3.4 12 3.4z"/><path fill="#00A4DC" d="M12 9.6c1.2 0 4.6 6.1 4 7.2-.6 1.1-7.4 1.1-8 0-.6-1.1 2.8-7.2 4-7.2z"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="4.2" fill="#FF0000"/><path fill="#fff" d="M10.2 8.6l6 3.4-6 3.4z"/></svg>`,
  plex: `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#1F1F1F"/><path fill="#E5A00D" d="M8 4h4.6l4.6 8-4.6 8H8l4.6-8z"/></svg>`,
};

class PurdyRemoteCard extends PcBaseCard {
  static getStubConfig(hass) {
    const r = Object.keys(hass.states).find((e) => e.startsWith("remote."));
    return { tvs: [{ name: "TV", remote: r || "remote.tv" }], apps: [] };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.tvs) || !config.tvs.length) {
      throw new Error("purdy-remote-card: 'tvs' (a list) is required");
    }
    this._config = { title: "Televisions", apps: [], ...config };
    const ids = [];
    config.tvs.forEach((t) => {
      [t.remote, t.app_sensor, t.media_player].forEach((x) => x && ids.push(x));
    });
    this._watched = ids;
    this._last = null;
    this._sel = 0;
  }

  _tv() {
    return this._config.tvs[this._sel] || this._config.tvs[0];
  }

  _isOn(t) {
    if (t.media_player && this._hass.states[t.media_player]) {
      const ms = pcState(this._hass, t.media_player);
      return ms !== "off" && ms !== "unavailable" && ms !== "unknown" && ms !== "";
    }
    return pcState(this._hass, t.remote) === "on";
  }

  /* Default to whichever television is actually on. */
  _autoSelect() {
    if (this._touched) return;
    const i = this._config.tvs.findIndex((t) => this._isOn(t));
    if (i >= 0) this._sel = i;
  }

  _send(command) {
    const t = this._tv();
    if (!t.remote) return;
    this._hass.callService("remote", "send_command", {
      entity_id: t.remote, command,
    });
  }

  _launch(activity) {
    const t = this._tv();
    if (!t.remote) return;
    this._hass.callService("remote", "turn_on", { entity_id: t.remote, activity });
  }

  _muted(t) {
    const st = this._hass.states[t.media_player];
    return !!(st && st.attributes.is_volume_muted);
  }

  /* Volume steps rather than sets. Samsung's Tizen websocket advertises
     VOLUME_SET but never honours it and reports volume_level as 0 forever,
     so an absolute slider is meaningless. VOLUME_STEP works everywhere. */
  _step(dir) {
    const t = this._tv();
    if (!t.media_player) return;
    this._hass.callService("media_player", dir > 0 ? "volume_up" : "volume_down", {
      entity_id: t.media_player,
    });
  }

  _toggleMute() {
    const t = this._tv();
    if (!t.media_player) return;
    this._hass.callService("media_player", "volume_mute", {
      entity_id: t.media_player, is_volume_muted: !this._muted(t),
    });
  }

  _power() {
    const t = this._tv();
    const on = this._isOn(t);
    if (t.media_player && this._hass.states[t.media_player]) {
      this._hass.callService("media_player", on ? "turn_off" : "turn_on", {
        entity_id: t.media_player,
      });
      return;
    }
    if (!t.remote) return;
    this._hass.callService("remote", on ? "turn_off" : "turn_on", { entity_id: t.remote });
  }

  _render() {
    if (!this._hass || !this._config) return;
    this._autoSelect();
    const tvs = this._config.tvs;
    const t = this._tv();
    const on = this._isOn(t);
    const app = pcState(this._hass, t.app_sensor);
    const onCount = tvs.filter((x) => this._isOn(x)).length;

    const key = (icon, cmd, cls) =>
      `<button class="k ${cls || ""}" type="button" data-cmd="${cmd}" aria-label="${cmd}">
         <ha-icon icon="${icon}"></ha-icon></button>`;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .hd { display: flex; align-items: center; gap: 8px; padding: 0 4px 10px; }
        .hd b { font-size: 20px; font-weight: 650; letter-spacing: -0.02em; }
        .hd .spacer { flex: 1; }
        .chip.good { background: rgba(129,201,149,0.15); color: var(--pc-good); }
        .chip .cdot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

        .seg { display: flex; background: var(--pc-chip); border-radius: 14px; padding: 3px; gap: 3px; margin-bottom: 11px; }
        .seg button {
          flex: 1; border: 0; background: none; cursor: pointer; font-family: inherit;
          padding: 8px 6px; border-radius: 11px; color: var(--pc-muted);
          font-size: 12.5px; font-weight: 600; display: flex; align-items: center;
          justify-content: center; gap: 5px;
        }
        .seg button.sel { background: var(--pc-panel-2); color: var(--pc-text); }
        .seg .live { width: 6px; height: 6px; border-radius: 50%; background: var(--pc-good); }

        .now { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .art {
          width: 46px; height: 46px; border-radius: 13px; flex: 0 0 auto;
          display: flex; align-items: center; justify-content: center;
          background: var(--pc-panel-2); color: var(--pc-muted);
        }
        .art.on { background: linear-gradient(140deg, #9146ff, #5c2ea8); color: #fff; }
        .now .t { font-size: 16px; font-weight: 650; letter-spacing: -0.015em; }
        .pwr {
          flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%;
          border: 0; cursor: pointer; background: var(--pc-chip);
          display: flex; align-items: center; justify-content: center;
        }
        .pwr ha-icon { color: var(--pc-bad); }
        .pwr.off ha-icon { color: var(--pc-good); }

        .apps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 6px; }
        .app {
          aspect-ratio: 1; border: 0; cursor: pointer; font-family: inherit;
          border-radius: 16px; background: var(--pc-panel-2);
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 5px; padding: 0;
          font-size: 9px; letter-spacing: 0.04em; color: var(--pc-muted);
        }
        .app svg { width: 26px; height: 26px; }

        .dpad { position: relative; width: 214px; height: 214px; margin: 10px auto 0; }
        .dpad .ring { position: absolute; inset: 0; border-radius: 50%; background: var(--pc-panel-2); }
        .dpad button { position: absolute; border: 0; background: none; cursor: pointer; padding: 0;
          display: flex; align-items: center; justify-content: center; color: var(--pc-text); }
        .dpad .k { width: 54px; height: 54px; border-radius: 50%; }
        .dpad .k:active { background: var(--pc-chip); }
        .dpad .up { top: 8px; left: 80px; }
        .dpad .dn { bottom: 8px; left: 80px; }
        .dpad .lf { left: 8px; top: 80px; }
        .dpad .rt { right: 8px; top: 80px; }
        .dpad .ok {
          width: 84px; height: 84px; border-radius: 50%; top: 65px; left: 65px;
          background: var(--pc-chip); font-size: 13.5px; font-weight: 650;
        }
        .dpad ha-icon { --mdc-icon-size: 26px; }

        .row { display: flex; gap: 8px; margin-top: 9px; }
        .row button {
          flex: 1; height: 46px; border: 0; border-radius: 15px; cursor: pointer;
          background: var(--pc-panel-2); color: var(--pc-text);
          display: flex; align-items: center; justify-content: center; font-family: inherit;
        }
        .row button:active { background: var(--pc-chip); }
        button:focus-visible { outline: 2px solid var(--pc-cool); outline-offset: 2px; }
        .off-note { text-align: center; color: var(--pc-muted); font-size: 12.5px; padding: 18px 0 6px; }
        .vol { display: flex; align-items: center; gap: 11px; margin: 0 0 14px; }
        .vbtn { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; border: 0;
                cursor: pointer; background: var(--pc-chip); color: var(--pc-muted);
                display: flex; align-items: center; justify-content: center; }
        .vbtn ha-icon { --mdc-icon-size: 18px; }
        .vstep { flex: 1; height: 40px; border-radius: 14px; border: 0; cursor: pointer;
                 background: var(--pc-panel-2); color: var(--pc-text);
                 display: flex; align-items: center; justify-content: center; }
        .vstep:active { background: var(--pc-chip); }
        .vbtn.muted { color: var(--pc-bad); }
      </style>

      <div class="card tint">
        <div class="hd">
          <b>${this._config.title}</b>
          <span class="spacer"></span>
          <span class="chip ${onCount ? "good" : ""}">
            ${onCount ? '<span class="cdot"></span>' : ""}${onCount} on
          </span>
        </div>

        ${tvs.length > 1 ? `
          <div class="seg">
            ${tvs.map((x, i) => `
              <button type="button" data-sel="${i}" class="${i === this._sel ? "sel" : ""}">
                ${this._isOn(x) ? '<span class="live"></span>' : ""}${x.name}
              </button>`).join("")}
          </div>` : ""}

        <div class="now">
          <div class="art ${on ? "on" : ""}"><ha-icon icon="mdi:television"></ha-icon></div>
          <div class="grow">
            <div class="t trunc">${on ? (app && app !== "Idle" ? app : "Home screen") : "Off"}</div>
            <div class="lbl trunc">${t.name}</div>
          </div>
          <button class="pwr ${on ? "" : "off"}" type="button" id="pwr" aria-label="Power">
            <ha-icon icon="mdi:power"></ha-icon>
          </button>
        </div>

        ${on && t.media_player && this._hass.states[t.media_player] ? `
          <div class="vol">
            <button class="vstep" type="button" id="voldown" aria-label="Volume down">
              <ha-icon icon="mdi:volume-minus"></ha-icon>
            </button>
            <button class="vbtn ${this._muted(t) ? "muted" : ""}" type="button" id="mute" aria-label="Mute">
              <ha-icon icon="${this._muted(t) ? "mdi:volume-off" : "mdi:volume-high"}"></ha-icon>
            </button>
            <button class="vstep" type="button" id="volup" aria-label="Volume up">
              <ha-icon icon="mdi:volume-plus"></ha-icon>
            </button>
          </div>` : ""}

        ${!on ? `<div class="off-note">${t.name} is off — turn it on to use the remote.</div>` : `
          <span class="lbl">Apps</span>
          <div class="apps">
            ${(this._config.apps || []).map((a) => `
              <button class="app" type="button" data-app="${a.activity}">
                ${PC_BRANDS[a.brand] || '<ha-icon icon="mdi:application"></ha-icon>'}
                ${(a.name || "").toUpperCase()}
              </button>`).join("")}
          </div>

          <div class="dpad">
            <div class="ring"></div>
            <button class="k up" type="button" data-cmd="DPAD_UP" aria-label="Up"><ha-icon icon="mdi:chevron-up"></ha-icon></button>
            <button class="k lf" type="button" data-cmd="DPAD_LEFT" aria-label="Left"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
            <button class="k rt" type="button" data-cmd="DPAD_RIGHT" aria-label="Right"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
            <button class="k dn" type="button" data-cmd="DPAD_DOWN" aria-label="Down"><ha-icon icon="mdi:chevron-down"></ha-icon></button>
            <button class="ok" type="button" data-cmd="DPAD_CENTER">OK</button>
          </div>

          <div class="row">
            ${key("mdi:arrow-u-left-top", "BACK")}
            ${key("mdi:home", "HOME")}
            ${key("mdi:menu", "MENU")}
          </div>
          <div class="row">
            ${key("mdi:rewind", "MEDIA_REWIND")}
            ${key("mdi:play-pause", "MEDIA_PLAY_PAUSE")}
            ${key("mdi:fast-forward", "MEDIA_FAST_FORWARD")}
          </div>
        `}
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-sel]").forEach((el) => {
      el.addEventListener("click", () => {
        this._touched = true;
        this._sel = parseInt(el.dataset.sel, 10);
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("[data-cmd]").forEach((el) => {
      el.addEventListener("click", () => this._send(el.dataset.cmd));
    });
    this.shadowRoot.querySelectorAll("[data-app]").forEach((el) => {
      el.addEventListener("click", () => this._launch(el.dataset.app));
    });
    const p = this.shadowRoot.getElementById("pwr");
    if (p) p.addEventListener("click", () => this._power());
    const m = this.shadowRoot.getElementById("mute");
    if (m) m.addEventListener("click", () => this._toggleMute());
    const vu = this.shadowRoot.getElementById("volup");
    if (vu) vu.addEventListener("click", () => this._step(1));
    const vd = this.shadowRoot.getElementById("voldown");
    if (vd) vd.addEventListener("click", () => this._step(-1));
  }

  getCardSize() {
    return 12;
  }
}

