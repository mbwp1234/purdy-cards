const CPC_VERSION = "1.1.4";

const CPC_DEFAULTS = {
  title: "Climate",
  step: 0.5,
  hold_debounce_ms: 1200,
  ring: { min: 60, max: 80 },
  graph: { hours: 24 },
  history_refresh_minutes: 5,
};

class ClimatePanelCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._watched = [];
    this._lastStates = null;
    this._history = {}; // entity_id -> [{t, v}]
    this._forecast = null;
    this._forecastUnsub = null;
    this._historyTimer = null;
    this._pendingTarget = null; // optimistic goal while stepping
    this._pendingTimer = null;
    this._armTimer = null;
    this._rendered = false;
    this._graphMeta = null; // hover metadata for the trend graph
    this._modalOpen = false; // schedule editor overlay
    this._sched = null;
    this._schedDay = null;
    this._schedEdit = null; // entry being edited, or "new"
    this._schedNote = null;
  }

  /* ---------------- config ---------------- */

  setConfig(config) {
    if (!config || !config.thermostat) {
      throw new Error("climate-panel-card: 'thermostat' (a climate entity) is required");
    }
    this._config = {
      ...CPC_DEFAULTS,
      ...config,
      ring: { ...CPC_DEFAULTS.ring, ...(config.ring || {}) },
      graph: { ...CPC_DEFAULTS.graph, ...(config.graph || {}) },
    };
    this._watched = this._collectWatched();
    this._rendered = false;
    this._lastStates = null;
  }

  static getStubConfig(hass) {
    const climate = Object.keys(hass.states).find((e) => e.startsWith("climate."));
    return { thermostat: climate || "climate.thermostat" };
  }

  getCardSize() {
    return this._config && this._config.compact ? 3 : 6;
  }

  _collectWatched() {
    const c = this._config;
    const ids = new Set([c.thermostat]);
    const add = (v) => v && typeof v === "string" && v.includes(".") && ids.add(v);
    add(c.goal);
    add(c.current_temp);
    add(c.weather);
    if (c.outside) { add(c.outside.temp); add(c.outside.humidity); }
    if (c.graph) { add(c.graph.inside); add(c.graph.outside); }
    if (c.status_text) add(c.status_text.entity);
    if (c.hold) { add(c.hold.remaining); add(c.hold.status); }
    if (c.zones) {
      add(c.zones.select);
      (c.zones.options || []).forEach((z) => add(z.temp));
    }
    (c.chips || []).forEach((ch) => {
      add(ch.entity);
      if (ch.visible) add(ch.visible.entity);
    });
    (c.rooms || []).forEach((r) => { add(r.temp); add(r.humidity); });
    return [...ids];
  }

  /* ---------------- hass updates ---------------- */

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    if (!this._historyTimer) this._startHistory();
    if (this._config.weather && !this._forecastUnsub) this._subscribeForecast();

    const snapshot = this._watched
      .map((id) => {
        const s = hass.states[id];
        return s ? `${id}:${s.state}:${s.attributes.temperature}:${s.attributes.current_temperature}:${s.attributes.hvac_action}:${s.attributes.from_thermostat}` : `${id}:missing`;
      })
      .join("|");

    if (snapshot !== this._lastStates) {
      this._lastStates = snapshot;
      this._scheduleRender();
    }
  }

  _scheduleRender() {
    // Don't repaint under the user's finger while a confirm is armed
    // or while the schedule editor is open
    if (this._modalOpen || this.shadowRoot.querySelector(".armed")) {
      clearTimeout(this._deferredRender);
      this._deferredRender = setTimeout(() => this._scheduleRender(), 1500);
      return;
    }
    if (this._renderQueued) return;
    this._renderQueued = true;
    requestAnimationFrame(() => {
      this._renderQueued = false;
      this._render();
    });
  }

  connectedCallback() {
    if (this._config && this._hass) {
      this._startHistory();
      if (this._config.weather) this._subscribeForecast();
    }
  }

  disconnectedCallback() {
    clearInterval(this._historyTimer);
    this._historyTimer = null;
    if (this._forecastUnsub) {
      this._forecastUnsub.then((u) => u()).catch(() => {});
      this._forecastUnsub = null;
    }
  }

  /* ---------------- data helpers ---------------- */

  _st(id) {
    return id && this._hass ? this._hass.states[id] : undefined;
  }

  _num(id, attr) {
    return pcNumOf(this._st(id), attr);
  }

  _fmt(n, digits = 1) {
    if (n === null || n === undefined) return "—";
    const r = Number(n.toFixed(digits));
    return `${r}`;
  }

  _esc(s) {
    return pcEsc(s);
  }

  _goalEntity() {
    return this._config.goal || this._config.thermostat;
  }

  _currentTemp() {
    const c = this._config;
    if (c.current_temp) return this._num(c.current_temp);
    return this._num(c.thermostat, "current_temperature");
  }

  _targetTemp() {
    if (this._pendingTarget !== null) return this._pendingTarget;
    return this._num(this._goalEntity(), "temperature");
  }

  _visible(cond) {
    if (!cond) return true;
    if (Array.isArray(cond)) return cond.every((c) => this._visible(c));
    const s = this._st(cond.entity);
    if (!s) return false;
    if (cond.state !== undefined) return s.state === cond.state;
    const n = parseFloat(s.state);
    if (!Number.isFinite(n)) return false;
    if (cond.above !== undefined && !(n > cond.above)) return false;
    if (cond.below !== undefined && !(n < cond.below)) return false;
    return true;
  }

  /* ---------------- history + forecast ---------------- */

  _historyEntities() {
    const c = this._config;
    const ids = new Set();
    if (c.graph && c.graph.inside) ids.add(c.graph.inside);
    if (c.graph && c.graph.outside) ids.add(c.graph.outside);
    (c.rooms || []).forEach((r) => r.temp && ids.add(r.temp));
    return [...ids];
  }

  _startHistory() {
    const fetch = () => this._fetchHistory();
    fetch();
    clearInterval(this._historyTimer);
    this._historyTimer = setInterval(fetch, (this._config.history_refresh_minutes || 5) * 60 * 1000);
  }

  async _fetchHistory() {
    if (!this._hass) return;
    const ids = this._historyEntities();
    if (!ids.length) return;
    const hours = this._config.graph.hours || 24;
    const start = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    try {
      const res = await this._hass.callApi(
        "GET",
        `history/period/${start}?filter_entity_id=${ids.join(",")}&minimal_response&no_attributes`
      );
      const hist = {};
      (res || []).forEach((series) => {
        if (!series || !series.length) return;
        const id = series[0].entity_id;
        hist[id] = series
          .map((p) => ({ t: new Date(p.last_changed).getTime(), v: parseFloat(p.state) }))
          .filter((p) => Number.isFinite(p.v));
      });
      this._history = hist;
      this._lastStates = null; // force repaint with fresh graphs
      if (this._hass) this.hass = this._hass;
    } catch (e) {
      // History is decoration; never break the card over it.
    }
  }

  async _subscribeForecast() {
    if (!this._hass || !this._config.weather) return;
    try {
      this._forecastUnsub = this._hass.connection.subscribeMessage(
        (msg) => {
          this._forecast = msg.forecast || null;
          this._lastStates = null;
          if (this._hass) this.hass = this._hass;
        },
        { type: "weather/subscribe_forecast", entity_id: this._config.weather, forecast_type: "daily" }
      );
    } catch (e) {
      this._forecastUnsub = null;
    }
  }

  /* ---------------- actions ---------------- */

  _moreInfo(entityId) {
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  _step(dir) {
    const goal = this._goalEntity();
    const s = this._st(goal);
    if (!s || s.attributes.temperature === undefined) return;
    const step = this._config.step || s.attributes.target_temp_step || 0.5;
    const base = this._pendingTarget !== null ? this._pendingTarget : parseFloat(s.attributes.temperature);
    if (!Number.isFinite(base)) return;
    let next = base + dir * step;
    const min = s.attributes.min_temp, max = s.attributes.max_temp;
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);
    this._pendingTarget = Math.round(next * 2) / 2;

    const el = this.shadowRoot.querySelector("[data-goal-value]");
    if (el) {
      el.textContent = `${this._fmt(this._pendingTarget)}°`;
      el.classList.add("pending");
    }

    clearTimeout(this._pendingTimer);
    this._pendingTimer = setTimeout(() => {
      const value = this._pendingTarget;
      this._pendingTarget = null;
      if (value === null) return;
      this._hass.callService("climate", "set_temperature", {
        entity_id: goal,
        temperature: value,
      });
    }, this._config.hold_debounce_ms);
  }

  _runAction(action, el) {
    if (!action) return;
    if (action === "more-info" || action.action === "more-info") {
      this._moreInfo(action.entity || el.dataset.entity);
      return;
    }
    if (action.navigate) {
      if (action.navigate.startsWith("#")) {
        window.location.hash = action.navigate;
      } else {
        history.pushState(null, "", action.navigate);
        const ev = new Event("location-changed", { bubbles: true, composed: true });
        this.dispatchEvent(ev);
      }
      return;
    }
    if (action.service) {
      const run = () => {
        const [domain, service] = action.service.split(".");
        this._hass.callService(domain, service, action.data || {});
      };
      if (action.confirm) {
        this._armOrRun(el, action.confirm, run);
      } else {
        run();
      }
    }
  }

  // Two-tap confirm: first tap arms the control for 3s, second tap fires.
  _armOrRun(el, label, run) {
    if (el.classList.contains("armed")) {
      el.classList.remove("armed");
      clearTimeout(this._armTimer);
      run();
      return;
    }
    this.shadowRoot.querySelectorAll(".armed").forEach((a) => this._disarm(a));
    el.classList.add("armed");
    el.dataset.restore = el.innerHTML;
    el.innerHTML = `<span class="arm-label">${this._esc(typeof label === "string" ? label : "Tap again to confirm")}</span>`;
    clearTimeout(this._armTimer);
    this._armTimer = setTimeout(() => this._disarm(el), 3000);
  }

  _disarm(el) {
    if (!el || !el.classList.contains("armed")) return;
    el.classList.remove("armed");
    if (el.dataset.restore) {
      el.innerHTML = el.dataset.restore;
      delete el.dataset.restore;
    }
  }

  /* ---------------- svg builders ---------------- */

  _ringSvg(cur, goal) {
    const { min, max } = this._config.ring;
    const R = 46, C = 2 * Math.PI * R;
    const TRACK = pcRingArc(R);
    const frac = cur === null ? 0 : Math.min(1, Math.max(0, (cur - min) / (max - min)));
    const fill = frac * TRACK;
    const hvac = this._st(this._config.thermostat);
    const action = hvac && hvac.attributes.hvac_action;
    const color = action === "heating" ? "var(--cpc-heat)" : action === "cooling" ? "var(--cpc-cool)" : "var(--cpc-idle-ring)";
    let marker = "";
    if (goal !== null && Number.isFinite(goal)) {
      const gfrac = Math.min(1, Math.max(0, (goal - min) / (max - min)));
      const rot = pcRingRotate(gfrac);
      marker = `<line x1="54" y1="3" x2="54" y2="13" stroke="var(--cpc-muted)" stroke-width="2.5" stroke-linecap="round" transform="rotate(${rot.toFixed(1)} 54 54)"/>`;
    }
    return `
      <svg viewBox="0 0 108 108" width="108" height="108" aria-hidden="true">
        <circle cx="54" cy="54" r="${R}" fill="none" stroke="var(--cpc-track)" stroke-width="8"
          stroke-dasharray="${TRACK} ${C}" stroke-linecap="round" transform="rotate(135 54 54)"/>
        <circle cx="54" cy="54" r="${R}" fill="none" stroke="${color}" stroke-width="8"
          stroke-dasharray="${Math.max(0.001, fill)} ${C}" stroke-linecap="round" transform="rotate(135 54 54)"/>
        ${marker}
      </svg>`;
  }

  /* Both delegate to the shared geometry in 05-shared.js — same maths, one
     copy. The markup stays here because the sizes and tokens are this card's. */
  _polyline(points, w, h, pad = 4) {
    return pcSparkPoly(points, w, h, pad);
  }

  _downsample(series, n = 60) {
    return pcDownsample(series, n);
  }

  _graphSvg() {
    const g = this._config.graph || {};
    const W = 360, H = 74, PAD = 6;
    const series = [];
    const addSeries = (id, label, color, width, opacity) => {
      const pts = this._downsample(this._history[id]);
      if (!pts || pts.length < 2) return;
      let vmin = Infinity, vmax = -Infinity;
      pts.forEach((p) => { vmin = Math.min(vmin, p.v); vmax = Math.max(vmax, p.v); });
      if (vmax - vmin < 1) { vmax += 0.5; vmin -= 0.5; }
      series.push({ id, label, color, width, opacity, pts, vmin, vmax });
    };
    addSeries(g.outside, g.outside_label || "Outside", "var(--cpc-good)", 2, 0.9);
    addSeries(g.inside, g.inside_label || "Inside", "var(--cpc-heat)", 2.5, 1);
    if (!series.length) { this._graphMeta = null; return ""; }

    const t0 = Math.min(...series.map((s) => s.pts[0].t));
    const t1 = Math.max(...series.map((s) => s.pts[s.pts.length - 1].t));
    const span = t1 - t0 || 1;
    series.forEach((s) => {
      s.poly = s.pts
        .map((p) => {
          const x = ((p.t - t0) / span) * W;
          const y = PAD + (1 - (p.v - s.vmin) / (s.vmax - s.vmin)) * (H - PAD * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    });
    this._graphMeta = { t0, t1, W, H, PAD, series };

    const last = series[series.length - 1];
    const endPt = last.poly.split(" ").pop().split(",");
    const dots = series.map((s, i) => `<div class="gdot" data-si="${i}" style="background:${s.color}" hidden></div>`).join("");
    const legend = series
      .slice()
      .reverse()
      .map((s, i) => {
        const cur = s.pts[s.pts.length - 1].v;
        return `<span class="lg"><i style="background:${s.color}"></i>${this._esc(s.label)} <b data-lv="${series.length - 1 - i}">${this._fmt(cur)}°</b></span>`;
      })
      .join("");
    return `
      <div class="graph" role="img" aria-label="Temperature, last ${g.hours} hours. Touch or hover to inspect.">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="var(--cpc-track)" stroke-width="1"/>
          ${series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="${s.width}" opacity="${s.opacity}" points="${s.poly}"/>`).join("")}
          <circle cx="${endPt[0]}" cy="${endPt[1]}" r="3.5" fill="${last.color}"/>
        </svg>
        <div class="gx" hidden></div>
        ${dots}
        <div class="gtip" hidden></div>
      </div>
      <div class="legend">${legend}<span class="ltime" data-ltime></span></div>`;
  }

  _bindGraphHover() {
    const graph = this.shadowRoot.querySelector(".graph");
    if (!graph || !this._graphMeta) return;
    const cross = graph.querySelector(".gx");
    const tip = graph.querySelector(".gtip");
    const dots = [...graph.querySelectorAll(".gdot")];
    const ltime = this.shadowRoot.querySelector("[data-ltime]");
    // Legend spans render in reversed order — map them back to series index
    // via their data-lv attribute, never by DOM position.
    const lvals = {};
    this.shadowRoot.querySelectorAll("[data-lv]").forEach((el) => {
      lvals[el.dataset.lv] = el;
    });

    const show = (clientX) => {
      const m = this._graphMeta;
      const rect = graph.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const t = m.t0 + frac * (m.t1 - m.t0);
      cross.hidden = false;
      cross.style.left = `${(frac * 100).toFixed(2)}%`;
      const parts = [];
      m.series.forEach((s, i) => {
        let best = s.pts[0], bd = Infinity;
        s.pts.forEach((p) => {
          const d = Math.abs(p.t - t);
          if (d < bd) { bd = d; best = p; }
        });
        const yFrac = (m.PAD + (1 - (best.v - s.vmin) / (s.vmax - s.vmin)) * (m.H - m.PAD * 2)) / m.H;
        const xFrac = (best.t - m.t0) / (m.t1 - m.t0 || 1);
        const dot = dots[i];
        if (dot) {
          dot.hidden = false;
          dot.style.left = `${(xFrac * 100).toFixed(2)}%`;
          dot.style.top = `${(yFrac * 100).toFixed(2)}%`;
        }
        if (lvals[i]) lvals[i].textContent = `${this._fmt(best.v)}°`;
        parts.push(`<span><i style="background:${s.color}"></i>${this._fmt(best.v)}°</span>`);
      });
      const timeStr = new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (ltime) ltime.textContent = timeStr;
      tip.hidden = false;
      tip.innerHTML = `<b>${timeStr}</b>${parts.join("")}`;
      const onLeft = frac > 0.55;
      tip.style.left = onLeft ? "" : `calc(${(frac * 100).toFixed(2)}% + 10px)`;
      tip.style.right = onLeft ? `calc(${((1 - frac) * 100).toFixed(2)}% + 10px)` : "";
    };
    const hide = () => {
      cross.hidden = true;
      tip.hidden = true;
      dots.forEach((d) => (d.hidden = true));
      if (ltime) ltime.textContent = "";
      const m = this._graphMeta;
      m.series.forEach((s, i) => {
        if (lvals[i]) lvals[i].textContent = `${this._fmt(s.pts[s.pts.length - 1].v)}°`;
      });
    };
    graph.addEventListener("pointermove", (e) => show(e.clientX));
    graph.addEventListener("pointerdown", (e) => show(e.clientX));
    graph.addEventListener("pointerleave", hide);
    graph.addEventListener("pointercancel", hide);
  }

  _sparkSvg(entityId) {
    const series = this._downsample(this._history[entityId], 28);
    const p = this._polyline(series, 84, 26, 3);
    if (!p) return `<svg viewBox="0 0 84 26"></svg>`;
    return `<svg viewBox="0 0 84 26" preserveAspectRatio="none" aria-hidden="true">
      <polyline fill="none" stroke="var(--cpc-cool)" stroke-width="1.5" opacity="0.8" points="${p}"/>
    </svg>`;
  }

  /* ---------------- section renderers ---------------- */

  _weatherHtml() {
    const c = this._config;
    if (!c.weather && !c.outside) return "";
    const w = this._st(c.weather);
    const cond = w ? w.state.replace(/_/g, " ") : "";
    const wTemp = w ? this._fmt(this._num(c.weather, "temperature"), 0) : "—";
    let hiLo = "";
    if (this._forecast && this._forecast.length) {
      const today = this._forecast[0];
      const hi = today.temperature, lo = today.templow;
      if (hi !== undefined && lo !== undefined) hiLo = ` · ${this._fmt(hi, 0)}° / ${this._fmt(lo, 0)}° today`;
    }
    const oTemp = c.outside && c.outside.temp ? this._fmt(this._num(c.outside.temp)) : null;
    const oHum = c.outside && c.outside.humidity ? this._fmt(this._num(c.outside.humidity), 0) : null;
    const name = w ? (c.weather_label || w.attributes.friendly_name || "") : "";
    return `
      <div class="weather" data-entity="${this._esc(c.weather || (c.outside && c.outside.temp) || "")}" data-tap="more-info">
        <ha-icon class="wicon" icon="${this._weatherIcon(w && w.state)}"></ha-icon>
        <div class="wmain">${this._esc(name)}${cond ? ` · ${this._esc(cond)}` : ""}<br><b>${wTemp}°</b>${this._esc(hiLo)}</div>
        <div class="spread">${oTemp !== null ? `Outside <b>${oTemp}°</b>` : ""}${oHum !== null ? `<br>Humidity ${oHum}%` : ""}</div>
      </div>`;
  }

  _weatherIcon(state) {
    const map = {
      "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy", fog: "mdi:weather-fog",
      hail: "mdi:weather-hail", lightning: "mdi:weather-lightning", "lightning-rainy": "mdi:weather-lightning-rainy",
      partlycloudy: "mdi:weather-partly-cloudy", pouring: "mdi:weather-pouring", rainy: "mdi:weather-rainy",
      snowy: "mdi:weather-snowy", "snowy-rainy": "mdi:weather-snowy-rainy", sunny: "mdi:weather-sunny",
      windy: "mdi:weather-windy", "windy-variant": "mdi:weather-windy-variant", exceptional: "mdi:alert-circle-outline",
    };
    return map[state] || "mdi:weather-partly-cloudy";
  }

  _heroHtml() {
    const c = this._config;
    const cur = this._currentTemp();
    const goal = this._targetTemp();
    const thermo = this._st(c.thermostat);
    const action = thermo && thermo.attributes.hvac_action;
    const actionLabel = { heating: "Heating", cooling: "Cooling", idle: "Idle", off: "Off", fan: "Fan", drying: "Drying" }[action] || (thermo ? thermo.state : "—");
    const actionCls = action === "heating" ? "heat" : action === "cooling" ? "cool" : "idle";
    const zoneNote = this._activeZoneLabel();
    let reason = "";
    if (c.status_text && c.status_text.entity) {
      const s = this._st(c.status_text.entity);
      const raw = s ? (c.status_text.attribute ? s.attributes[c.status_text.attribute] : s.state) : null;
      if (raw && raw !== "unknown" && raw !== "unavailable") reason = String(raw);
    }
    const canStep = this._st(this._goalEntity()) && this._st(this._goalEntity()).attributes.temperature !== undefined;
    const holdChip = this._holdHtml();
    return `
      <div class="hero">
        <div class="ring" data-entity="${this._esc(c.thermostat)}" data-tap="more-info">
          ${this._ringSvg(cur, goal)}
          <div class="val"><b>${cur === null ? "—" : `${this._fmt(cur)}°`}</b><small>inside</small></div>
        </div>
        <div class="hero-info">
          <div class="goal-row">
            ${canStep ? `<button class="stepper" data-step="-1" aria-label="Lower goal temperature"><ha-icon icon="mdi:minus"></ha-icon></button>` : ""}
            <div class="goal" data-entity="${this._esc(this._goalEntity())}" data-tap="more-info">
              <b data-goal-value class="${this._pendingTarget !== null ? "pending" : ""}">${goal === null ? "—" : `${this._fmt(goal)}°`}</b>
              <span>goal</span>
            </div>
            ${canStep ? `<button class="stepper" data-step="1" aria-label="Raise goal temperature"><ha-icon icon="mdi:plus"></ha-icon></button>` : ""}
          </div>
          <div class="action ${actionCls}"><span class="dot"></span>${this._esc(actionLabel)}${zoneNote ? ` · ${this._esc(zoneNote)}` : ""}</div>
          ${holdChip}
          ${reason ? `<div class="reason">${this._esc(reason)}</div>` : ""}
        </div>
      </div>`;
  }

  _holdHtml() {
    const h = this._config.hold;
    if (!h || !h.remaining) return "";
    const mins = this._num(h.remaining);
    if (!mins || mins <= 0) return "";
    const hrs = Math.floor(mins / 60);
    const rem = Math.round(mins % 60);
    const dur = hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`;
    const cancel = h.cancel_service
      ? `data-chip-idx="__hold__"`
      : `data-entity="${this._esc(h.remaining)}" data-tap="more-info"`;
    // GTTC >= 2.1.0 tags overrides made on the physical thermostat. Older
    // versions have no such attribute, so this falls back to a plain hold.
    const src = this._st(h.remaining);
    const physical = !!(src && src.attributes && src.attributes.from_thermostat);
    const icon = physical ? "mdi:thermostat" : "mdi:timer-outline";
    const label = physical ? "Thermostat hold" : "Hold";
    return `<button class="hold-chip${physical ? " physical" : ""}" ${cancel}>
      <ha-icon icon="${icon}"></ha-icon> ${label} · ${dur} left${h.cancel_service ? " — tap to cancel" : ""}
    </button>`;
  }

  _activeZoneLabel() {
    const z = this._config.zones;
    if (!z || !z.select) return "";
    const s = this._st(z.select);
    if (!s) return "";
    const opt = (z.options || []).find((o) => o.option === s.state);
    return `${(opt && opt.label) || s.state} zone`;
  }

  _zonesHtml() {
    const z = this._config.zones;
    if (!z || !z.select || !(z.options || []).length) return "";
    const s = this._st(z.select);
    const active = s ? s.state : null;
    const btns = z.options
      .map((o, i) => {
        const temp = o.temp ? this._fmt(this._num(o.temp)) : null;
        const on = o.option === active;
        return `<button class="zone ${on ? "on" : ""}" data-zone-idx="${i}">
          ${this._esc(o.label || o.option)}${temp !== null ? ` · <b>${temp}°</b>` : ""}
        </button>`;
      })
      .join("");
    return `<div class="zones">${btns}</div>`;
  }

  _chipsHtml() {
    const chips = this._config.chips || [];
    const schedChip = this._config.schedule
      ? `<button class="chip" data-open-schedule><ha-icon icon="mdi:calendar-clock"></ha-icon>Schedule</button>`
      : "";
    const html = schedChip + chips
      .map((ch, i) => {
        if (!this._visible(ch.visible)) return "";
        const s = this._st(ch.entity);
        const state = ch.show_state && s ? ` ${this._esc(s.state)}` : "";
        const cls = ch.style === "warn" ? "warn" : "";
        return `<button class="chip ${cls}" data-chip-idx="${i}">
          ${ch.icon ? `<ha-icon icon="${this._esc(ch.icon)}"></ha-icon>` : ""}${this._esc(ch.name || "")}${state}
        </button>`;
      })
      .filter(Boolean)
      .join("");
    return html ? `<div class="chips">${html}</div>` : "";
  }

  _roomsHtml() {
    const rooms = this._config.rooms || [];
    if (!rooms.length) return "";
    const rows = rooms
      .map((r, i) => {
        const t = this._fmt(this._num(r.temp));
        const h = r.humidity ? this._fmt(this._num(r.humidity), 0) : null;
        const goal = r.goal !== undefined ? (typeof r.goal === "number" ? this._fmt(r.goal) : this._fmt(this._num(r.goal))) : null;
        const dead = this._num(r.temp) === null;
        return `
        <div class="room ${dead ? "dead" : ""}" data-entity="${this._esc(r.temp)}" data-tap="more-info">
          <ha-icon class="ric" icon="${this._esc(r.icon || "mdi:thermometer")}"></ha-icon>
          <div class="nm">${this._esc(r.name || r.temp)}${h !== null ? `<small>${h}% humidity</small>` : ""}</div>
          <div class="spark">${this._sparkSvg(r.temp)}</div>
          <div class="tv"><b>${t === "—" ? "—" : `${t}°`}</b>${goal !== null ? `<small>goal ${goal}°</small>` : ""}</div>
        </div>`;
      })
      .join("");
    return `<div class="rooms">${rows}</div>`;
  }

  /* ---------------- schedule editor (GTTC WS API) ---------------- */

  _schedWs(msg) {
    const extra = this._config.schedule && this._config.schedule.entry_id
      ? { entry_id: this._config.schedule.entry_id }
      : {};
    return this._hass.callWS({ ...msg, ...extra });
  }

  async _openSchedule() {
    try {
      this._sched = await this._schedWs({ type: "gttc/get_schedule" });
    } catch (e) {
      this._sched = null;
      this._schedNote = "Couldn't load the schedule.";
    }
    this._modalOpen = true;
    this._schedEdit = null;
    if (this._sched) {
      const days = this._schedDays().map((d) => d[0]);
      if (!this._schedDay || !days.includes(this._schedDay)) {
        // Open on today (per-day tabs) or the matching group
        const dow = new Date().getDay();
        const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        this._schedDay = this._perDayTabs() ? names[dow] : (dow === 0 || dow === 6 ? "weekend" : "weekday");
      }
    }
    this._renderModal();
  }

  _closeSchedule() {
    this._modalOpen = false;
    this._schedEdit = null;
    this._schedNote = null;
    const el = this.shadowRoot.querySelector(".modal-backdrop");
    if (el) el.remove();
    this._scheduleRender();
  }

  async _refreshSchedule() {
    try {
      this._sched = await this._schedWs({ type: "gttc/get_schedule" });
    } catch (e) { /* keep the stale copy */ }
    this._renderModal();
  }

  // When a preset is active, GTTC reads AND edits the preset's per-day
  // schedule (update_entry/delete_entry default to active_preset), so the
  // editor must show that — not the base weekday/weekend lists.
  _activePreset() {
    const s = this._sched;
    if (s && s.active_preset && s.presets && s.presets[s.active_preset]) {
      return s.presets[s.active_preset];
    }
    return null;
  }

  _perDayTabs() {
    return !!this._activePreset() || (this._sched && this._sched.mode === "per_day");
  }

  _schedDays() {
    if (!this._sched) return [];
    if (this._perDayTabs()) {
      return [["monday", "Mon"], ["tuesday", "Tue"], ["wednesday", "Wed"], ["thursday", "Thu"], ["friday", "Fri"], ["saturday", "Sat"], ["sunday", "Sun"]];
    }
    return [["weekday", "Weekdays"], ["weekend", "Weekend"]];
  }

  _schedEntries(day) {
    const s = this._sched;
    if (!s) return [];
    const preset = this._activePreset();
    if (preset) return (preset.schedule && preset.schedule[day]) || [];
    if (s.mode === "per_day") return (s.per_day && s.per_day[day]) || [];
    return s[day] || [];
  }

  _mins(hhmm) {
    const [h, m] = String(hhmm || "0:0").split(":").map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  }

  _fmt12(hhmm) {
    const mins = this._mins(hhmm);
    const d = new Date();
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  _zoneName(zoneId) {
    if (!zoneId || !this._sched) return null;
    const z = (this._sched.zones || []).find((z) => z.id === zoneId);
    return z ? z.name : null;
  }

  _renderModal() {
    let backdrop = this.shadowRoot.querySelector(".modal-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) this._closeSchedule();
      });
      this.shadowRoot.appendChild(backdrop);
    }
    backdrop.innerHTML = this._modalHtml();
    this._bindModal(backdrop);
  }

  _modalHtml() {
    const s = this._sched;
    if (!s) {
      return `<div class="modal"><div class="mhead"><b>Schedule</b><button class="mclose" data-m-close>✕</button></div>
        <div class="mnote">${this._esc(this._schedNote || "No schedule data.")}</div></div>`;
    }
    const presetLabel = (s.preset_labels && s.preset_labels[s.active_preset]) || s.active_preset || "Default";
    const tabs = this._schedDays()
      .map(([key, label]) => `<button class="mtab ${key === this._schedDay ? "on" : ""}" data-m-day="${key}">${label}</button>`)
      .join("");
    const entries = this._schedEntries(this._schedDay);
    const now = new Date();
    const nowPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;

    // 24h timeline — one lane per zone so per-zone entries don't stack,
    // and overnight entries (end before start) wrap around midnight.
    const lanesMap = new Map();
    entries.forEach((e, i) => {
      const key = e.zone_id || "__all__";
      if (!lanesMap.has(key)) {
        lanesMap.set(key, {
          name: e.zone_id ? this._zoneName(e.zone_id) || "Zone" : "All zones",
          items: [],
        });
      }
      lanesMap.get(key).items.push({ e, i });
    });
    const lanes = [...lanesMap.values()];
    const multiLane = lanes.length > 1;
    const seg = (i, a, b, label) => {
      const left = (a / 1440) * 100;
      const width = (Math.max(b - a, 8) / 1440) * 100;
      const lbl = width >= 10 && label ? label : "";
      return `<button class="seg" data-m-edit="${i}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%">${lbl}</button>`;
    };
    const laneHtml = lanes
      .map((lane) => {
        const segs = lane.items
          .map(({ e, i }) => {
            const a = this._mins(e.time_start);
            const b = this._mins(e.time_end);
            const label = `${this._fmt(e.target_temp, 0)}°${e.cooling_temp != null ? ` / ${this._fmt(e.cooling_temp, 0)}°` : ""}`;
            if (b <= a) return seg(i, a, 1440, label) + seg(i, 0, b, "");
            return seg(i, a, b, label);
          })
          .join("");
        return `
          <div class="mlane">
            ${multiLane ? `<span class="mlane-label">${this._esc(lane.name)}</span>` : ""}
            <div class="mtimeline">${segs}<span class="mnow" style="left:${nowPct.toFixed(2)}%"></span></div>
          </div>`;
      })
      .join("");

    const rows = entries
      .map((e, i) => `
        <button class="mrow" data-m-edit="${i}">
          <span class="mtime">${this._fmt12(e.time_start)} – ${this._fmt12(e.time_end)}</span>
          <span class="mtemps"><i class="h"></i>${this._fmt(e.target_temp)}°${e.cooling_temp != null ? ` <i class="c"></i>${this._fmt(e.cooling_temp)}°` : ""}</span>
          <span class="mzone">${this._esc(this._zoneName(e.zone_id) || "All zones")}</span>
        </button>`)
      .join("");

    let editor = "";
    if (this._schedEdit !== null) {
      const isNew = this._schedEdit === "new";
      const e = isNew
        ? { time_start: "08:00", time_end: "17:00", target_temp: 70, cooling_temp: 74, zone_id: null }
        : entries[this._schedEdit];
      const zoneOpts = [`<option value="">All zones</option>`]
        .concat((s.zones || []).map((z) => `<option value="${this._esc(z.id)}" ${e.zone_id === z.id ? "selected" : ""}>${this._esc(z.name)}</option>`))
        .join("");
      editor = `
        <div class="meditor">
          <div class="mform">
            <label>Start<input type="time" data-f="time_start" value="${this._esc(e.time_start)}"></label>
            <label>End<input type="time" data-f="time_end" value="${this._esc(e.time_end)}"></label>
            <label>Heat °<input type="number" step="0.5" data-f="target_temp" value="${e.target_temp}"></label>
            <label>Cool °<input type="number" step="0.5" data-f="cooling_temp" value="${e.cooling_temp != null ? e.cooling_temp : ""}" placeholder="—"></label>
            <label class="wide">Zone<select data-f="zone_id">${zoneOpts}</select></label>
          </div>
          <div class="mactions">
            <button class="mbtn primary" data-m-save>${isNew ? "Add entry" : "Save"}</button>
            ${isNew ? "" : `<button class="mbtn danger" data-m-delete>Delete</button>`}
            <button class="mbtn" data-m-cancel>Cancel</button>
          </div>
        </div>`;
    }

    return `
      <div class="modal">
        <div class="mhead">
          <div><b>Schedule</b><small>${this._esc(presetLabel)}${s.enabled === false ? " · off" : ""}</small></div>
          <div class="mhead-actions">
            ${s.can_undo ? `<button class="mbtn small" data-m-undo><ha-icon icon="mdi:undo"></ha-icon></button>` : ""}
            <button class="mclose" data-m-close>✕</button>
          </div>
        </div>
        <div class="mtabs">${tabs}</div>
        <div class="mlanes">${laneHtml}</div>
        <div class="mscale">${multiLane ? `<span class="mlane-label"></span>` : ""}<div class="mscale-in"><span>12A</span><span>6A</span><span>12P</span><span>6P</span><span>12A</span></div></div>
        ${this._schedNote ? `<div class="mnote">${this._esc(this._schedNote)}</div>` : ""}
        ${editor || `<div class="mrows">${rows || `<div class="mnote">No entries for this day.</div>`}</div>
        <button class="mbtn add" data-m-add><ha-icon icon="mdi:plus"></ha-icon> Add entry</button>
        ${this._perDayTabs() && entries.length ? `
        <div class="mcopy">
          <span>Copy this day to</span>
          <button class="mbtn small" data-m-copy="weekdays">Weekdays</button>
          <button class="mbtn small" data-m-copy="weekend">Weekend</button>
          <button class="mbtn small" data-m-copy="all">All</button>
        </div>` : ""}`}
      </div>`;
  }

  _bindModal(backdrop) {
    const q = (sel) => backdrop.querySelectorAll(sel);
    q("[data-m-close]").forEach((el) => el.addEventListener("click", () => this._closeSchedule()));
    q("[data-m-day]").forEach((el) =>
      el.addEventListener("click", () => {
        this._schedDay = el.dataset.mDay;
        this._schedEdit = null;
        this._schedNote = null;
        this._renderModal();
      })
    );
    q("[data-m-edit]").forEach((el) =>
      el.addEventListener("click", () => {
        this._schedEdit = parseInt(el.dataset.mEdit, 10);
        this._schedNote = null;
        this._renderModal();
      })
    );
    q("[data-m-add]").forEach((el) =>
      el.addEventListener("click", () => {
        this._schedEdit = "new";
        this._schedNote = null;
        this._renderModal();
      })
    );
    q("[data-m-cancel]").forEach((el) =>
      el.addEventListener("click", () => {
        this._schedEdit = null;
        this._schedNote = null;
        this._renderModal();
      })
    );
    q("[data-m-undo]").forEach((el) =>
      el.addEventListener("click", async () => {
        await this._schedWs({ type: "gttc/undo_schedule" }).catch(() => {});
        this._schedNote = "Undone.";
        this._schedEdit = null;
        this._refreshSchedule();
      })
    );
    q("[data-m-copy]").forEach((el) =>
      el.addEventListener("click", () => {
        const groups = {
          weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
          weekend: ["saturday", "sunday"],
          all: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        };
        const targets = (groups[el.dataset.mCopy] || []).filter((d) => d !== this._schedDay);
        if (!targets.length) return;
        this._armOrRun(el, "Confirm copy", async () => {
          try {
            await this._schedWs({
              type: "gttc/copy_day",
              source_day: this._schedDay,
              target_days: targets,
            });
            this._schedNote = `Copied to ${targets.length} day${targets.length > 1 ? "s" : ""}.`;
            this._refreshSchedule();
          } catch (err) {
            this._schedNote = `Copy failed: ${err && err.message ? err.message : "unknown error"}`;
            this._renderModal();
          }
        });
      })
    );
    q("[data-m-save]").forEach((el) =>
      el.addEventListener("click", async () => {
        const val = (f) => {
          const input = backdrop.querySelector(`[data-f="${f}"]`);
          return input ? input.value : "";
        };
        const entries = this._schedEntries(this._schedDay);
        const isNew = this._schedEdit === "new";
        const orig = isNew ? null : entries[this._schedEdit];
        const msg = {
          type: "gttc/update_entry",
          day: this._schedDay,
          time_start: val("time_start"),
          time_end: val("time_end"),
          target_temp: parseFloat(val("target_temp")),
        };
        if (!msg.time_start || !msg.time_end || !Number.isFinite(msg.target_temp)) {
          this._schedNote = "Start, end, and heat temperature are required.";
          this._renderModal();
          return;
        }
        const cool = parseFloat(val("cooling_temp"));
        if (Number.isFinite(cool)) msg.cooling_temp = cool;
        const zone = val("zone_id");
        if (zone) msg.zone_id = zone;
        if (orig) {
          msg.old_time_start = orig.time_start;
          msg.old_time_end = orig.time_end;
          if (orig.away_temp != null) msg.away_temp = orig.away_temp;
        }
        try {
          const res = await this._schedWs(msg);
          this._schedNote = res && res.conflicts && res.conflicts.length ? "Saved — overlaps another entry, check times." : null;
          this._schedEdit = null;
          this._refreshSchedule();
        } catch (err) {
          this._schedNote = `Save failed: ${err && err.message ? err.message : "unknown error"}`;
          this._renderModal();
        }
      })
    );
    q("[data-m-delete]").forEach((el) =>
      el.addEventListener("click", () => {
        const entries = this._schedEntries(this._schedDay);
        const orig = entries[this._schedEdit];
        if (!orig) return;
        this._armOrRun(el, "Tap again to delete", async () => {
          try {
            await this._schedWs({
              type: "gttc/delete_entry",
              day: this._schedDay,
              time_start: orig.time_start,
              time_end: orig.time_end,
            });
            this._schedEdit = null;
            this._schedNote = null;
            this._refreshSchedule();
          } catch (err) {
            this._schedNote = `Delete failed: ${err && err.message ? err.message : "unknown error"}`;
            this._renderModal();
          }
        });
      })
    );
  }

  /* ---------------- main render ---------------- */

  _render() {
    if (!this._hass || !this._config) return;
    const c = this._config;
    if (c.compact) return this._renderCompact();
    this.shadowRoot.innerHTML = `
      <style>${ClimatePanelCard.styles}</style>
      <div class="panel">
        ${this._weatherHtml()}
        ${this._heroHtml()}
        ${this._graphSvg()}
        ${this._zonesHtml()}
        ${this._chipsHtml()}
      </div>
      ${this._roomsHtml()}
    `;
    this._bind();
    this._bindGraphHover();
    this._rendered = true;
  }

  /* Compact mode: weather strip, hero ring and zones only. Everything the
     full panel adds — graph, chips, room rows — stays behind the popup. */
  _renderCompact() {
    const c = this._config;
    this.shadowRoot.innerHTML = `
      <style>${ClimatePanelCard.styles}</style>
      <div class="panel compact${c.navigate ? " tappable" : ""}">
        ${this._weatherHtml()}
        ${this._heroHtml()}
        ${this._zonesHtml()}
      </div>
    `;
    this._bind();
    if (c.navigate) {
      const panel = this.shadowRoot.querySelector(".panel");
      panel.addEventListener("click", (e) => {
        if (e.target.closest(".stepper, [data-zone-idx], [data-chip-idx], [data-open-schedule], [data-tap]")) return;
        pcNavigate(this, c.navigate);
      });
    }
    this._rendered = true;
  }

  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-tap='more-info']").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.currentTarget.classList.contains("armed")) return;
        this._moreInfo(el.dataset.entity);
      });
    });
    root.querySelectorAll(".stepper").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._step(parseInt(el.dataset.step, 10));
      });
    });
    root.querySelectorAll("[data-zone-idx]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const z = this._config.zones;
        const opt = z.options[parseInt(el.dataset.zoneIdx, 10)];
        if (!opt || el.classList.contains("on")) return;
        const run = () =>
          this._hass.callService("select", "select_option", { entity_id: z.select, option: opt.option });
        if (z.confirm === false) run();
        else this._armOrRun(el, `Switch to ${opt.label || opt.option}?`, run);
      });
    });
    root.querySelectorAll("[data-open-schedule]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._openSchedule();
      });
    });
    root.querySelectorAll("[data-chip-idx]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = el.dataset.chipIdx;
        if (idx === "__hold__") {
          const h = this._config.hold;
          const run = () => {
            const [domain, service] = h.cancel_service.split(".");
            this._hass.callService(domain, service, h.cancel_data || {});
          };
          this._armOrRun(el, "Cancel hold?", run);
          return;
        }
        const chip = (this._config.chips || [])[parseInt(idx, 10)];
        if (chip) this._runAction(chip.tap_action || "more-info", el);
      });
    });
  }

  /* ---------------- styles ---------------- */

  static get styles() {
    return `
      :host {
        ${PC_TOKENS}
        --cpc-panel: var(--cpc-panel-override, var(--pc-panel));
        --cpc-panel-2: var(--pc-panel-2);
        --cpc-line: var(--pc-line);
        --cpc-track: var(--pc-track);
        --cpc-chip: var(--pc-chip);
        --cpc-text: var(--pc-text);
        --cpc-muted: var(--pc-muted);
        --cpc-heat: var(--cpc-heat-override, var(--pc-heat));
        --cpc-cool: var(--cpc-cool-override, var(--pc-cool));
        --cpc-good: var(--cpc-good-override, var(--pc-good));
        --cpc-warn: var(--cpc-warn-override, var(--pc-warn));
        --cpc-idle-ring: var(--cpc-muted);
        --cpc-radius: 24px;
        display: block;
        color: var(--cpc-text);
        font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        -webkit-font-smoothing: antialiased;
      }
      * { box-sizing: border-box; }
      button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; text-align: inherit; }
      button:focus-visible { outline: 2px solid var(--cpc-cool); outline-offset: 2px; border-radius: 8px; }
      ha-icon { --mdc-icon-size: 18px; }

      .panel {
        background: var(--cpc-panel);
        border-radius: var(--cpc-radius);
        overflow: hidden;
        margin-bottom: 14px;
      }
      .weather {
        display: flex; align-items: center; gap: 12px; width: 100%;
        padding: 12px 16px;
        background: linear-gradient(180deg, rgba(77, 208, 225, 0.10), transparent);
        border-bottom: 1px solid var(--cpc-line);
        font-size: 13px; color: var(--cpc-muted);
        cursor: pointer;
      }
      .weather .wicon { color: var(--cpc-cool); --mdc-icon-size: 22px; flex: 0 0 auto; }
      .weather b { color: var(--cpc-text); font-weight: 600; }
      .weather .wmain { line-height: 1.4; }
      .weather .spread { margin-left: auto; text-align: right; line-height: 1.4; }

      .hero { display: flex; align-items: center; gap: 18px; padding: 18px 18px 8px; }
      .ring { width: 108px; height: 108px; flex: 0 0 auto; position: relative; cursor: pointer; }
      .ring svg { display: block; }
      .ring .val {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-variant-numeric: tabular-nums;
      }
      .ring .val b { font-size: 27px; font-weight: 650; letter-spacing: -0.02em; }
      .ring .val small { font-size: 11px; color: var(--cpc-muted); margin-top: 2px; }

      .hero-info { flex: 1; min-width: 0; }
      .goal-row { display: flex; align-items: center; gap: 10px; }
      .goal { display: flex; align-items: baseline; gap: 7px; cursor: pointer; }
      .goal b { font-size: 21px; font-weight: 650; font-variant-numeric: tabular-nums; transition: color 0.2s; }
      .goal b.pending { color: var(--cpc-warn); }
      .goal span { font-size: 12px; color: var(--cpc-muted); }
      .stepper {
        width: 34px; height: 34px; border-radius: 50%; flex: 0 0 auto;
        background: var(--cpc-chip);
        display: inline-flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      .stepper:active { background: var(--cpc-panel-2); transform: scale(0.94); }
      .stepper ha-icon { --mdc-icon-size: 18px; color: var(--cpc-text); }

      .action {
        display: inline-flex; align-items: center; gap: 6px;
        margin-top: 9px; padding: 4px 10px;
        border-radius: 999px; font-size: 12px; font-weight: 600;
        background: var(--cpc-chip); color: var(--cpc-muted);
      }
      .action .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
      .action.cool { background: rgba(77, 208, 225, 0.14); color: var(--cpc-cool); }
      .action.heat { background: rgba(255, 149, 87, 0.14); color: var(--cpc-heat); }
      .reason { margin-top: 8px; font-size: 12px; color: var(--cpc-muted); line-height: 1.45; }

      .hold-chip {
        display: inline-flex; align-items: center; gap: 6px;
        margin-top: 8px; padding: 5px 10px; border-radius: 999px;
        font-size: 12px; font-weight: 600;
        background: rgba(242, 193, 78, 0.13); color: var(--cpc-warn);
      }
      .hold-chip ha-icon { --mdc-icon-size: 15px; }
      /* Hold set on the physical thermostat — distinct from an app hold */
      .hold-chip.physical {
        background: rgba(255, 149, 87, 0.14); color: var(--cpc-heat);
      }

      .graph { padding: 4px 6px 0; position: relative; touch-action: pan-y; cursor: crosshair; }
      .graph svg { display: block; width: 100%; height: 74px; }
      .gx {
        position: absolute; top: 4px; bottom: 0; width: 1px;
        background: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.35);
        pointer-events: none;
      }
      .gdot {
        position: absolute; width: 9px; height: 9px; border-radius: 50%;
        transform: translate(-50%, -50%);
        border: 2px solid var(--cpc-panel);
        pointer-events: none;
      }
      .gtip {
        position: absolute; top: 2px;
        display: flex; align-items: center; gap: 8px;
        padding: 4px 9px; border-radius: 8px;
        background: rgba(10, 14, 18, 0.92);
        font-size: 11.5px; font-variant-numeric: tabular-nums;
        white-space: nowrap; pointer-events: none; z-index: 2;
        box-shadow: 0 2px 10px rgba(0,0,0,0.4);
      }
      .gtip b { font-weight: 650; }
      .gtip i, .lg i {
        display: inline-block; width: 8px; height: 8px; border-radius: 50%;
        margin-right: 4px; vertical-align: 0;
      }
      .gtip span { display: inline-flex; align-items: center; }
      .legend {
        display: flex; align-items: center; gap: 14px;
        padding: 6px 16px 0; font-size: 11.5px; color: var(--cpc-muted);
      }
      .lg { display: inline-flex; align-items: center; }
      .lg b { color: var(--cpc-text); font-weight: 600; margin-left: 4px; font-variant-numeric: tabular-nums; }
      .ltime { margin-left: auto; font-variant-numeric: tabular-nums; }

      .zones {
        display: flex; margin: 10px 16px 0;
        background: var(--cpc-chip); border-radius: 12px; padding: 3px;
      }
      .zone {
        flex: 1; border-radius: 10px; padding: 8px 6px;
        color: var(--cpc-muted); font-size: 13px; text-align: center;
        font-variant-numeric: tabular-nums;
        transition: background 0.15s, color 0.15s;
      }
      .zone.on {
        background: var(--cpc-panel-2); color: var(--cpc-text);
        font-weight: 600; box-shadow: inset 0 0 0 1px var(--cpc-line);
      }
      .zone b { font-weight: 650; }

      .chips { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 16px 16px; }
      .panel > .chips:last-child { padding-top: 12px; }
      .zones + .chips { padding-top: 12px; }
      .chip {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 12px; padding: 5px 10px; border-radius: 999px;
        background: var(--cpc-chip); color: var(--cpc-muted);
      }
      .chip ha-icon { --mdc-icon-size: 15px; }
      .chip.warn { color: var(--cpc-warn); background: rgba(242, 193, 78, 0.12); }

      .armed { background: var(--cpc-warn) !important; color: #1a1a1a !important; font-weight: 650; }
      .arm-label { padding: 0 4px; }

      .rooms { background: var(--cpc-panel); border-radius: var(--cpc-radius); overflow: hidden; }
      .room {
        display: grid; grid-template-columns: 34px 1fr auto auto; gap: 12px;
        align-items: center; padding: 13px 16px;
        border-bottom: 1px solid var(--cpc-line);
        cursor: pointer;
      }
      .room:last-child { border-bottom: 0; }
      .room.dead { opacity: 0.45; }
      .room .ric { color: var(--cpc-muted); justify-self: center; --mdc-icon-size: 20px; }
      .room .nm { font-size: 14px; font-weight: 550; }
      .room .nm small { display: block; font-size: 11.5px; color: var(--cpc-muted); font-weight: 400; margin-top: 2px; }
      .room .spark svg { display: block; width: 84px; height: 26px; }
      .room .tv { text-align: right; font-variant-numeric: tabular-nums; }
      .room .tv b { font-size: 16px; font-weight: 650; }
      .room .tv small { display: block; font-size: 11.5px; color: var(--cpc-muted); margin-top: 2px; }

      /* ---- schedule editor modal ---- */
      .modal-backdrop {
        position: fixed; inset: 0; z-index: 20;
        background: rgba(6, 9, 12, 0.7);
        display: flex; align-items: center; justify-content: center;
        padding: 18px;
        backdrop-filter: blur(3px);
      }
      .modal {
        width: 100%; max-width: 420px; max-height: 86vh; overflow-y: auto;
        background: var(--cpc-panel);
        border-radius: var(--cpc-radius);
        padding: 16px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.5);
      }
      .mhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .mhead b { font-size: 16px; font-weight: 650; }
      .mhead small { display: block; font-size: 12px; color: var(--cpc-muted); margin-top: 2px; }
      .mhead-actions { display: flex; align-items: center; gap: 8px; }
      .mclose {
        width: 32px; height: 32px; border-radius: 50%;
        background: var(--cpc-chip); color: var(--cpc-muted);
        display: inline-flex; align-items: center; justify-content: center; font-size: 14px;
      }
      .mtabs {
        display: flex; gap: 0; background: var(--cpc-chip);
        border-radius: 12px; padding: 3px; margin-bottom: 14px;
        overflow-x: auto;
      }
      .mtab {
        flex: 1; min-width: 44px; border-radius: 10px; padding: 7px 4px;
        color: var(--cpc-muted); font-size: 12.5px; text-align: center;
        white-space: nowrap;
      }
      .mtab.on {
        background: var(--cpc-panel-2); color: var(--cpc-text);
        font-weight: 600; box-shadow: inset 0 0 0 1px var(--cpc-line);
      }
      .mlanes { display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; }
      .mlane { display: flex; align-items: center; gap: 8px; }
      .mlane-label {
        flex: 0 0 54px; width: 54px; text-align: right;
        font-size: 10px; color: var(--cpc-muted);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .mtimeline {
        position: relative; flex: 1; height: 32px; border-radius: 9px;
        background: var(--cpc-chip); overflow: hidden;
      }
      .seg {
        position: absolute; top: 3px; bottom: 3px; min-width: 3px;
        background: rgba(77, 208, 225, 0.28);
        border: 1px solid rgba(77, 208, 225, 0.5);
        border-radius: 6px; padding: 0 3px;
        font-size: 10.5px; font-weight: 600; line-height: 1;
        color: var(--cpc-text);
        display: flex; align-items: center; justify-content: center;
        font-variant-numeric: tabular-nums; overflow: hidden; white-space: nowrap;
        z-index: 1; cursor: pointer;
      }
      .mnow {
        position: absolute; top: 0; bottom: 0; width: 2px;
        background: var(--cpc-warn); pointer-events: none; z-index: 2;
      }
      .mscale {
        display: flex; align-items: center; gap: 8px;
        font-size: 10px; color: var(--cpc-muted); margin-bottom: 12px;
        font-variant-numeric: tabular-nums;
      }
      .mscale .mlane-label { flex: 0 0 54px; }
      .mscale-in { flex: 1; display: flex; justify-content: space-between; }
      .mrows { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
      .mrow {
        display: grid; grid-template-columns: 1fr auto auto; gap: 10px;
        align-items: center; width: 100%;
        background: var(--cpc-chip); border-radius: 12px; padding: 10px 12px;
        font-size: 12.5px; font-variant-numeric: tabular-nums;
      }
      .mrow .mtime { font-weight: 600; }
      .mrow .mtemps i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin: 0 3px 0 0; }
      .mrow .mtemps i.h { background: var(--cpc-heat); }
      .mrow .mtemps i.c { background: var(--cpc-cool); }
      .mrow .mzone { color: var(--cpc-muted); font-size: 11px; }
      .mnote {
        background: rgba(242, 193, 78, 0.12); color: var(--cpc-warn);
        border-radius: 10px; padding: 8px 12px; font-size: 12px; margin-bottom: 10px;
      }
      .meditor { margin-bottom: 4px; }
      .mform { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
      .mform label {
        display: flex; flex-direction: column; gap: 4px;
        font-size: 11px; color: var(--cpc-muted); letter-spacing: 0.02em;
      }
      .mform label.wide { grid-column: 1 / -1; }
      .mform input, .mform select {
        background: var(--cpc-chip); color: var(--cpc-text);
        border: 1px solid var(--cpc-line); border-radius: 10px;
        padding: 9px 10px; font: inherit; font-size: 14px;
        font-variant-numeric: tabular-nums;
        color-scheme: dark;
      }
      .mform input:focus, .mform select:focus { outline: 2px solid var(--cpc-cool); outline-offset: 1px; }
      .mactions { display: flex; gap: 8px; }
      .mbtn {
        padding: 9px 14px; border-radius: 12px;
        background: var(--cpc-chip); color: var(--cpc-text);
        font-size: 13px; font-weight: 600;
        display: inline-flex; align-items: center; gap: 6px; justify-content: center;
      }
      .mbtn.primary { background: var(--cpc-cool); color: #0f1317; }
      .mbtn.danger { color: #ff8a80; }
      .mbtn.add { width: 100%; }
      .mcopy {
        display: flex; align-items: center; gap: 8px;
        margin-top: 10px; font-size: 11.5px; color: var(--cpc-muted);
      }
      .mcopy span { margin-right: auto; }
      .mcopy .mbtn.small { font-size: 12px; }
      .mbtn.small { padding: 6px 9px; }
      .mbtn ha-icon { --mdc-icon-size: 16px; }

      /* ---- compact mode ---- */
      .panel.compact { padding-bottom: 14px; gap: 10px; }
      .panel.compact .graph, .panel.compact .chips { display: none; }
      .panel.tappable { cursor: pointer; }
      .panel.tappable:active { background: var(--cpc-panel-2); }

      @media (prefers-reduced-motion: reduce) {
        * { transition: none !important; }
      }
    `;
  }
}

