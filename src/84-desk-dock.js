/* ============================================================================
 * purdy-desk-card — Tier 3, the dock
 *
 * The bottom band is what you PRESS, plus the two readings that are pure
 * ambience: room temperatures and how the server is doing.
 *
 * Everything here is deliberately one line tall. These are the surfaces that
 * grew into whole pop-ups on the phone because a phone has one screen to spend;
 * given a band across the bottom they are a strip of numbers and a row of
 * tiles, and the depth stays one click away in a sheet rather than taking
 * permanent height from the stage.
 * ========================================================================== */

Object.assign(PurdyDeskCard.prototype, {

  _dockHtml() {
    const zones = this._zone("dock").map((sec) => {
      const body = this._dockSection(sec);
      if (!body) return "";
      return `<div class="pd-z pd-z-${psEsc(sec.type)}" style="flex:${sec.weight || 1}">
          <span class="pd-lbl">${psEsc(sec.title || this._humanize(sec.type))}</span>
          ${body}
        </div>`;
    }).join("");
    const links = (this._config.links || []).map((d) => {
      const attr = d.sheet ? `data-sheet="${psEsc(d.sheet)}"` : `data-nav="${psEsc(d.link || "")}"`;
      /* `alert_when_faults` is a BADGE, not a destination. Treating the flag as
         an action meant that with any fault raised — and the low-battery rule
         means there almost always is one — the button stopped going where it
         said it went. It only becomes an action for an entry with nothing of
         its own to open. */
      const faults = d.alert_when_faults ? this._faults().length : 0;
      const dest = (d.sheet || d.link) ? attr : (d.alert_when_faults ? `data-sheet="alerts"` : "");
      return `<button class="pd-link ${faults ? "alert" : ""}" type="button" ${dest}>
          <ha-icon icon="${psEsc(d.icon)}"></ha-icon><span>${psEsc(d.name)}</span>
          ${faults ? `<i class="pd-badge">${faults}</i>` : ""}
        </button>`;
    }).join("");
    return zones + (links ? `<div class="pd-z pd-z-links">${links}</div>` : "");
  },

  _dockSection(sec) {
    const fn = {
      rooms: () => this._dockRooms(sec),
      quick: () => this._dockQuick(sec),
      systems: () => this._dockSystems(sec),
      nowplaying: () => this._dockNowplaying(sec),
      people: () => this._stripSection(sec),
    }[sec.type];
    return fn ? fn() : "";
  },

  /* The room strip. Falls back to the climate section's room list when the
     section carries none of its own — the same rooms written twice in config
     is two lists to keep in step, and they would not stay in step. */
  _dockRooms(sec) {
    const h = this._hass;
    const clim = this._section("climate") || {};
    const rooms = (sec.rooms && sec.rooms.length) ? sec.rooms : (clim.rooms || []);
    const out = (clim.outside || {});
    const cells = [];
    if (out.temp) {
      const t = pcReading(h, out.temp);
      const hu = pcReading(h, out.humidity);
      cells.push(this._roomCell("Outside", t, hu, out.temp, true));
    }
    rooms.forEach((r) => {
      cells.push(this._roomCell(r.name, pcReading(h, r.temp), pcReading(h, r.humidity), r.temp));
    });
    return cells.length ? `<div class="pd-rstrip">${cells.join("")}</div>` : "";
  },

  _roomCell(name, t, hu, id, accent) {
    return `<div class="pd-rc ${accent ? "acc" : ""}" data-info="${psEsc(id || "")}" role="button" tabindex="0">
        <span class="pd-rn">${psEsc(name)}</span>
        <b>${t.ok && t.n != null ? t.n.toFixed(1) + "°" : "—"}</b>
        <span class="pd-rh">${hu.ok && hu.n != null ? hu.n.toFixed(0) + "%" : ""}</span>
      </div>`;
  },

  _dockQuick(sec) {
    const h = this._hass;
    const tiles = (sec.tiles || []).map((t, i) => {
      const st = t.entity && h.states[t.entity];
      const raw = st ? st.state : "";
      const on = (t.on_when || ["on", "home", "playing", "cleaning"]).indexOf(raw) >= 0;
      const alert = (t.alert_when || []).indexOf(raw) >= 0;
      const vr = t.value_entity ? pcReading(h, t.value_entity) : null;
      const value = vr
        ? (vr.ok && vr.n != null ? Math.round(vr.n) + "%" : vr.ok ? this._humanize(vr.st.state) : "—")
        : this._humanize(raw);
      const bar = t.bar_entity ? pcReading(h, t.bar_entity) : null;
      const barPct = bar && bar.ok && bar.n != null ? Math.max(0, Math.min(100, bar.n)) : null;
      const warn = t.bar_warn_above != null && barPct != null && barPct > t.bar_warn_above;
      return `<button class="pd-qt ${alert ? "alert" : on ? "on" : ""}" type="button" data-tile="${i}">
          <ha-icon icon="${psEsc(t.icon || "mdi:toggle-switch")}"></ha-icon>
          <div class="pd-qn">${psEsc(t.name || pcName(h, t.entity))}</div>
          <div class="pd-qv">${psEsc(value || "")}</div>
          ${barPct == null ? "" : `<span class="pd-qbar"><i style="width:${barPct.toFixed(0)}%;background:${
            warn ? "var(--ps-warn)" : "var(--ps-cool)"}"></i></span>`}
        </button>`;
    }).join("");
    return tiles ? `<div class="pd-qstrip">${tiles}</div>` : "";
  },

  /* One line per device group: its worst fault if it has one, otherwise its
     headline meter. A group that is fine says so in three words and takes one
     line; a group that is not says which. */
  _dockSystems(sec) {
    const h = this._hass;
    const rows = (sec.devices || []).map((d) => {
      const fired = (d.faults || []).filter((f) => {
        const st = h.states[f.entity];
        if (!st) return false;
        if (f.state !== undefined) return st.state === f.state;
        if (f.state_not !== undefined) return st.state !== f.state_not
          && st.state !== "unavailable" && st.state !== "unknown";
        return false;
      });
      const m = (d.meters || [])[0];
      const r = m ? pcReading(h, m.entity) : null;
      const pct = r && r.ok && r.n != null ? r.n : null;
      const crit = m && m.critical_above != null && pct != null && pct > m.critical_above;
      const warn = m && m.warn_above != null && pct != null && pct > m.warn_above;
      const col = fired.length || crit ? "var(--ps-bad)" : warn ? "var(--ps-warn)" : "var(--ps-good)";
      const chip = d.chip ? pcState(h, d.chip) : "";
      return `<div class="pd-sysrow ${d.mode || d.sheet ? "tappable" : ""}" ${
          d.sheet ? `data-sheet="${psEsc(d.sheet)}"` : d.link ? `data-nav="${psEsc(d.link)}"` : ""}>
          <ha-icon icon="${psEsc(d.icon || "mdi:chip")}"></ha-icon>
          <span class="pd-sn">${psEsc(d.name)}</span>
          <span class="pd-sv">${fired.length
            ? psEsc(fired[0].label + " " + (fired[0].detail || ""))
            : psEsc(chip || (pct == null ? "—" : pct.toFixed(1) + "%"))}</span>
          ${pct == null ? "" : `<span class="pd-meter"><i style="width:${
            Math.max(0, Math.min(100, pct)).toFixed(0)}%;background:${col}"></i></span>`}
        </div>`;
    }).join("");
    return rows || "";
  },

  _bindDock() {
    this._each("[data-tile]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = this._zone("dock").find((s) => s.type === "quick")
          || this._zone("stage").find((s) => s.type === "quick");
        const t = ((sec && sec.tiles) || [])[Number(el.dataset.tile)];
        if (!t) return;
        /* `sheet` is our own action, so it is handled before pcAction — which
           knows navigate/toggle/perform-action/more-info and rightly nothing
           about this card's sheets. */
        if (t.tap_action && t.tap_action.action === "sheet") {
          this._sheet = t.tap_action.sheet;
          this._last = null;
          this._render();
          return;
        }
        pcAction(this, this._hass, t.tap_action, t.entity);
      });
    });
  },
});
