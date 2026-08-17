/* ----------------------------------------------------------------- devices --*/

/* A stack of collapsible groups. Everything starts closed and each closed row
   carries the numbers you would have opened it for, so most visits end without
   expanding anything. A group holding a fault shows it while still closed. */
class PurdyDevicesCard extends PcBaseCard {
  static getStubConfig() {
    return { title: "Devices", groups: [{ name: "Group", chips: [], body: {} }] };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.groups)) {
      throw new Error("purdy-devices-card: 'groups' (a list) is required");
    }
    this._config = { ...config };
    const ids = [];
    const add = (x) => x && typeof x === "string" && ids.push(x);
    add(config.subtitle_entity);
    (config.faults || []).forEach((f) => add(f.entity));
    (config.groups || []).forEach((g) => {
      (g.chips || []).forEach(add);
      (g.faults || []).forEach((f) => add(f.entity));
      const b = g.body || {};
      if (b.bar) add(b.bar.entity);
      (b.stats || []).forEach((s) => add(s.entity));
      (b.switch_groups || []).forEach((sg) => (sg.items || []).forEach((i) => add(i.entity)));
      if (g.sparkline) add(g.sparkline.entity);
      if (g.meter) add(g.meter.entity);
    });
    this._watched = ids;
    this._last = null;
    this._open = {};
    this._spark = {};
    this._sparkAt = 0;
  }

  /* Trend lines for the collapsed rows. Fetched on a timer rather than on
     every state change, because history is expensive and a sparkline does not
     need to be live to the second. */
  async _fetchSparks() {
    const groups = (this._config.groups || []).filter((g) => g.sparkline);
    if (!groups.length || !this._hass) return;
    if (Date.now() - this._sparkAt < 5 * 60 * 1000) return;
    this._sparkAt = Date.now();
    const ids = groups.map((g) => g.sparkline.entity);
    const hours = Math.max(...groups.map((g) => g.sparkline.hours || 24));
    const start = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    try {
      const res = await this._hass.callApi(
        "GET",
        /* end_time is not optional — see pcNowIso. */
        `history/period/${start}?filter_entity_id=${ids.join(",")}` +
        `&end_time=${encodeURIComponent(pcNowIso())}&minimal_response&no_attributes`
      );
      const out = {};
      (res || []).forEach((series) => {
        if (!series || !series.length) return;
        const id = series[0].entity_id;
        if (!id) return;
        out[id] = series
          .map((e) => parseFloat(e.state))
          .filter((v) => !isNaN(v));
      });
      this._spark = out;
      this._render();
    } catch (err) {
      /* History unavailable is not worth breaking the card over. */
    }
  }

  /* The same labelled fill bar the body uses, shown on a collapsed row so a
     shut group still carries its level at a glance. Hidden once the group is
     open, because the body renders it there. */
  _meterHtml(m) {
    return this._barHtml({
      entity: m.entity,
      label: m.label || "",
      max: m.max,
      warn_above: m.warn_above,
      critical_above: m.critical_above,
      suffix: m.suffix,
    });
  }

  _sparkHtml(sp) {
    const vals = this._spark[sp.entity];
    if (!vals || vals.length < 2) return "";
    const w = 62, h = 22;
    const lo = sp.min != null ? sp.min : Math.min(...vals);
    const hi = sp.max != null ? sp.max : Math.max(...vals);
    const range = hi - lo || 1;
    const step = w / (vals.length - 1);
    const pts = vals
      .map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - ((v - lo) / range) * (h - 4)).toFixed(1)}`)
      .join(" ");
    const last = vals[vals.length - 1];
    const warn = sp.warn_above == null ? 80 : sp.warn_above;
    const col = last >= warn ? "var(--pc-warn)" : "var(--pc-cool)";
    return `
      <svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6"
                  stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }

  _faultCount(list) {
    return (list || []).filter((f) => {
      const s = pcState(this._hass, f.entity);
      if (f.state !== undefined) return s === f.state;
      if (f.state_not !== undefined) return s !== f.state_not && s !== "";
      return false;
    }).length;
  }

  _chipText(id) {
    const st = this._hass.states[id];
    if (!st) return "—";
    const unit = st.attributes.unit_of_measurement || "";
    const v = st.state;
    return isNaN(parseFloat(v)) ? v.replace(/_/g, " ") : v + (unit ? " " + unit : "");
  }

  _barHtml(bar) {
    const v = pcNum(this._hass, bar.entity);
    if (v == null) return "";
    const max = bar.max || 100;
    const p = Math.max(0, Math.min(100, (v / max) * 100));
    const warn = bar.warn_above == null ? 80 : bar.warn_above;
    const crit = bar.critical_above == null ? 95 : bar.critical_above;
    const col = p >= crit ? "var(--pc-bad)" : p >= warn ? "var(--pc-warn)" : "var(--pc-cool)";
    return `
      <div class="spread"><span class="lbl">${bar.label || ""}</span>
        <span class="num" style="font-size:12.5px;color:${col}">${Math.round(v)}${bar.suffix || "%"}</span></div>
      <div class="bar"><i style="width:${p.toFixed(0)}%;background:${col}"></i></div>`;
  }

  _statsHtml(stats) {
    return `<div class="stats">${stats.map((s) => {
      const st = this._hass.states[s.entity];
      const raw = st ? st.state : "—";
      let cls = "";
      if (s.bad_when && s.bad_when.indexOf(raw) >= 0) cls = "badv";
      else if (s.good_when && s.good_when.indexOf(raw) >= 0) cls = "goodv";
      const unit = st && st.attributes.unit_of_measurement ? st.attributes.unit_of_measurement : "";
      /* A device_class: problem sensor reads on/off, which is meaningless in a
         stat tile. `map` turns it into words. */
      const mapped = s.map && s.map[raw] !== undefined ? s.map[raw] : null;
      const txt = s.text || mapped || (isNaN(parseFloat(raw)) ? raw.replace(/_/g, " ") : raw + unit);
      return `<div class="stat"><span class="lbl">${s.label}</span><b class="${cls}">${txt}</b></div>`;
    }).join("")}</div>`;
  }

  _switchesHtml(groups) {
    return groups.map((sg) => {
      const items = sg.items || [];
      const on = items.filter((i) => pcState(this._hass, i.entity) === "on").length;
      return `
        <div class="grouphd"><span class="lbl">${sg.name}</span><span class="line"></span>
          <span class="lbl num">${on} / ${items.length}</span></div>
        <div class="dgrid">
          ${items.map((i) => {
            const isOn = pcState(this._hass, i.entity) === "on";
            return `
              <div class="dock ${isOn ? "run" : "off"}">
                <ha-icon icon="${i.icon || "mdi:cube-outline"}" data-toggle="${i.entity}" class="tappable"></ha-icon>
                <div class="grow tappable" data-toggle="${i.entity}">
                  <div class="nm trunc">${i.name}</div>
                  <div class="st">${isOn ? "Running" : "Stopped"}</div>
                </div>
                ${i.url && isOn ? `<ha-icon class="lnk tappable" icon="mdi:open-in-new" data-url="${i.url}"></ha-icon>` : ""}
              </div>`;
          }).join("")}
        </div>`;
    }).join("");
  }

  _faultListHtml(list) {
    const hits = (list || []).filter((f) => {
      const st = pcState(this._hass, f.entity);
      if (f.state !== undefined) return st === f.state;
      if (f.state_not !== undefined) return st !== f.state_not && st !== "";
      return false;
    });
    if (!hits.length) return "";
    return `
      <div class="faults">
        ${hits.map((f) => `
          <div class="frow tappable" data-info="${f.entity}">
            <span class="fdot"></span>
            <div class="grow">
              <div class="fn">${pcEsc(f.label || pcName(this._hass, f.entity))}</div>
              <div class="fd">${f.detail || pcState(this._hass, f.entity)}</div>
            </div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
          </div>`).join("")}
      </div>`;
  }

  _bodyHtml(b, g) {
    let h = "";
    if (g && g.faults) h += this._faultListHtml(g.faults);
    if (b.bar) h += this._barHtml(b.bar);
    if (b.stats) h += this._statsHtml(b.stats);
    if (b.switch_groups) h += this._switchesHtml(b.switch_groups);
    if (b.chips) {
      h += `<div class="chiprow">${b.chips.map((c) =>
        `<span class="chip ${c.style || ""}">${c.text || this._chipText(c.entity)}</span>`).join("")}</div>`;
    }
    if (b.buttons) {
      h += `<div class="btnrow">${b.buttons.map((btn, i) =>
        `<button type="button" data-btn="${i}">${btn.name}</button>`).join("")}</div>`;
    }
    return h;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const c = this._config;
    const topFaults = this._faultCount(c.faults);

    let idx = -1;
    const groupsHtml = (c.groups || []).map((g) => {
      if (g.divider) {
        return `<div class="secbreak"><span class="lbl">${g.divider}</span><span class="line"></span></div>`;
      }
      idx += 1;
      const gi = idx;
      const faults = this._faultCount(g.faults);
      /* A fault forces the group open — minimising must never hide a problem. */
      const open = this._open[gi] === undefined ? faults > 0 : this._open[gi];
      const chips = (g.chips || []).map((id) => this._chipText(id)).join(" · ");
      return `
        <div class="acc ${faults ? "faulted" : ""}">
          <div class="summary tappable" data-grp="${gi}">
            <ha-icon class="chev ${open ? "open" : ""}" icon="mdi:chevron-right"></ha-icon>
            ${g.icon ? `<ha-icon class="gi" icon="${g.icon}"></ha-icon>` : ""}
            <div class="grow">
              <div class="ttl">${g.name}</div>
              ${chips ? `<div class="smry num">${chips}</div>` : ""}
            </div>
            ${g.sparkline ? this._sparkHtml(g.sparkline) : ""}
            ${faults ? `<span class="chip bad"><span class="cdot"></span>${faults}</span>` : ""}
          </div>
          ${!open && g.meter ? `<div class="mwrap">${this._meterHtml(g.meter)}</div>` : ""}
          ${open ? `<div class="body" data-body="${gi}">${this._bodyHtml(g.body || {}, g)}</div>` : ""}
        </div>`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .hdr { display: flex; align-items: center; gap: 11px; padding: 14px 16px; margin-bottom: 9px;
               border-radius: var(--pc-radius); background: var(--pc-panel);
               background-image: linear-gradient(180deg, var(--pc-tint), transparent 110px); }
        .hdr b { font-size: 19px; font-weight: 650; letter-spacing: -0.02em; }
        .chip.bad { background: rgba(239,106,106,0.15); color: var(--pc-bad); }
        .chip.good { background: rgba(129,201,149,0.15); color: var(--pc-good); }
        .chip.warn { background: rgba(242,193,78,0.14); color: var(--pc-warn); }
        .chip .cdot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

        .acc { background: var(--pc-panel); border-radius: var(--pc-radius); overflow: hidden; margin-bottom: 9px; }
        .acc.faulted { border-left: 3px solid var(--pc-bad); }
        .summary { display: flex; align-items: center; gap: 11px; padding: 13px 16px; }
        .chev { --mdc-icon-size: 18px; color: var(--pc-muted); transition: transform 0.18s ease; }
        .chev.open { transform: rotate(90deg); }
        @media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
        .gi { color: var(--pc-muted); }
        .ttl { font-size: 14.5px; font-weight: 650; letter-spacing: -0.012em; }
        .smry { font-size: 11.5px; color: var(--pc-muted); }
        .body { padding: 0 16px 15px; }

        .secbreak { display: flex; align-items: center; gap: 10px; margin: 16px 6px 8px; }
        .secbreak .line { flex: 1; height: 1px; background: var(--pc-line); }
        .secbreak .lbl { letter-spacing: 0.16em; }

        .bar { height: 6px; border-radius: 3px; background: var(--pc-track); overflow: hidden; margin-top: 7px; }
        .bar i { display: block; height: 100%; border-radius: 3px; }

        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
        .stat { background: var(--pc-panel-2); border-radius: 14px; padding: 9px 10px; }
        .stat .lbl { display: block; margin-bottom: 4px; }
        .stat b { font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.015em; }
        .stat b.badv { color: var(--pc-bad); }
        .stat b.goodv { color: var(--pc-good); }

        .grouphd { display: flex; align-items: center; gap: 8px; margin: 15px 0 0; color: var(--pc-muted); }
        .grouphd .line { flex: 1; height: 1px; background: var(--pc-line); }
        .dgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 9px; }
        .dock { background: var(--pc-panel-2); border-radius: 14px; padding: 9px 10px;
                display: flex; align-items: center; gap: 8px; min-width: 0; }
        .dock .nm { font-size: 12.5px; font-weight: 600; letter-spacing: -0.01em; }
        .dock .st { font-size: 10.5px; color: var(--pc-muted); }
        .dock.run { background: rgba(129,201,149,0.11); }
        .dock.run > ha-icon { color: var(--pc-good); }
        .dock.off > ha-icon, .dock.off .nm { color: var(--pc-muted); }
        .dock .lnk { --mdc-icon-size: 15px; color: var(--pc-muted); }

        .spark { width: 62px; height: 22px; flex: 0 0 auto; opacity: 0.9; }
        .mwrap { padding: 0 16px 14px; margin-top: -2px; }
        .faults { margin-bottom: 12px; }
        .frow { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--pc-line); }
        .frow:first-child { border-top: none; }
        .fdot { width: 7px; height: 7px; border-radius: 50%; background: var(--pc-bad); flex: 0 0 auto; }
        .fn { font-size: 13px; font-weight: 600; }
        .fd { font-size: 11.5px; color: var(--pc-muted); }
        .frow ha-icon { --mdc-icon-size: 16px; color: var(--pc-muted); }
        .chiprow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
        .btnrow { display: flex; gap: 8px; margin-top: 11px; }
        .btnrow button {
          flex: 1; height: 42px; border: 0; border-radius: 14px; cursor: pointer;
          background: var(--pc-panel-2); color: var(--pc-text); font-family: inherit;
          font-size: 13px; font-weight: 600;
        }
        .btnrow button:active { background: var(--pc-chip); }
        button:focus-visible, .tappable:focus-visible { outline: 2px solid var(--pc-cool); outline-offset: 2px; }
      </style>

      <div class="hdr">
        ${c.icon ? `<ha-icon icon="${c.icon}" style="--mdc-icon-size:26px;color:var(--pc-cool)"></ha-icon>` : ""}
        <div class="grow">
          <b>${c.title || "Devices"}</b>
          ${c.subtitle_entity ? `<div class="lbl">${pcState(this._hass, c.subtitle_entity)}</div>` : ""}
        </div>
        ${topFaults
          ? `<span class="chip bad"><span class="cdot"></span>${topFaults} fault${topFaults > 1 ? "s" : ""}</span>`
          : `<span class="chip good"><span class="cdot"></span>Healthy</span>`}
      </div>
      ${groupsHtml}
    `;

    this._fetchSparks();
    this.shadowRoot.querySelectorAll("[data-info]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        pcMoreInfo(this, el.dataset.info);
      });
    });
    this.shadowRoot.querySelectorAll("[data-grp]").forEach((el) => {
      el.addEventListener("click", () => {
        const i = parseInt(el.dataset.grp, 10);
        const cur = this._open[i] === undefined
          ? this._faultCount((this._config.groups.filter((g) => !g.divider)[i] || {}).faults) > 0
          : this._open[i];
        this._open[i] = !cur;
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("[data-toggle]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._hass.callService("homeassistant", "toggle", { entity_id: el.dataset.toggle });
      });
    });
    this.shadowRoot.querySelectorAll("[data-url]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(el.dataset.url, "_blank");
      });
    });
    this.shadowRoot.querySelectorAll("[data-btn]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const body = el.closest("[data-body]");
        const gi = parseInt(body.dataset.body, 10);
        const g = this._config.groups.filter((x) => !x.divider)[gi];
        const btn = ((g.body || {}).buttons || [])[parseInt(el.dataset.btn, 10)];
        if (btn) pcAction(this, this._hass, btn.tap_action, btn.entity);
      });
    });
  }

  getCardSize() {
    return 10;
  }
}

