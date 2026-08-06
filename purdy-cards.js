/*
 * Purdy Cards
 * One bundle, one resource, one version — the custom Lovelace cards for this house.
 *
 *   climate-panel-card   full climate panel, plus a `compact:` mode for the home screen
 *   sleep-panel-card     full infant sleep panel, plus a `ribbon:` mode for the home screen
 *
 * Both cards keep their original type strings, so existing dashboard config
 * needs no changes when migrating from the standalone repos.
 *
 * No build step, no dependencies — plain web components.
 * https://github.com/mbwp1234/purdy-cards
 */

const PC_VERSION = "1.10.0";

/* Shared design tokens. Every card derives its own prefixed variables from
   these, so a colour or radius changes in exactly one place. */
const PC_TOKENS = `
        --pc-panel: var(--ha-card-background, var(--card-background-color, #181f26));
        --pc-panel-2: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.07);
        --pc-line: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.10);
        --pc-track: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.12);
        --pc-chip: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.08);
        --pc-text: var(--primary-text-color, #e6ecf2);
        --pc-muted: var(--secondary-text-color, #8b96a3);
        --pc-heat: #ff9557;
        --pc-cool: #4dd0e1;
        --pc-good: #81c995;
        --pc-warn: #f2c14e;
        --pc-bad: #ef6a6a;
        --pc-radius: 24px;
        /* The cool wash across the top of a panel, lifted from the climate
           card's weather strip so every panel opens the same way. */
        --pc-tint: rgba(77, 208, 225, 0.10);
`;

/* Define an element only once. If a standalone build of the same card is still
   registered as a dashboard resource, defining again would throw and take the
   whole bundle down — so warn instead, and say how to fix it. */
function pcDefine(name, cls) {
  if (customElements.get(name)) {
    console.warn(
      `[purdy-cards] <${name}> is already defined by another resource. ` +
      `Remove the standalone card's HACS entry and its dashboard resource — ` +
      `until then the older card wins and compact/ribbon modes will not work.`
    );
    return;
  }
  customElements.define(name, cls);
}

/* Navigate to a dashboard path or open a Bubble Card hash popup. */
function pcNavigate(node, path) {
  if (!path) return;
  if (path.charAt(0) === "#") {
    window.location.hash = path;
    return;
  }
  history.pushState(null, "", path);
  const ev = new Event("location-changed", { bubbles: true, composed: true });
  ev.detail = { replace: false };
  node.dispatchEvent(ev);
}

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
    const s = this._st(id);
    if (!s) return null;
    const raw = attr ? s.attributes[attr] : s.state;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }

  _fmt(n, digits = 1) {
    if (n === null || n === undefined) return "—";
    const r = Number(n.toFixed(digits));
    return `${r}`;
  }

  _esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
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
    const SWEEP = 270, TRACK = (SWEEP / 360) * C;
    const frac = cur === null ? 0 : Math.min(1, Math.max(0, (cur - min) / (max - min)));
    const fill = frac * TRACK;
    const hvac = this._st(this._config.thermostat);
    const action = hvac && hvac.attributes.hvac_action;
    const color = action === "heating" ? "var(--cpc-heat)" : action === "cooling" ? "var(--cpc-cool)" : "var(--cpc-idle-ring)";
    let marker = "";
    if (goal !== null && Number.isFinite(goal)) {
      const gfrac = Math.min(1, Math.max(0, (goal - min) / (max - min)));
      // The marker line is authored at 12 o'clock (-90° from 3 o'clock).
      // The arc runs clockwise from 135°, so rotate by 135 + frac·sweep + 90.
      const rot = 135 + gfrac * SWEEP + 90;
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

  _polyline(points, w, h, pad = 4) {
    if (!points || points.length < 2) return null;
    const t0 = points[0].t, t1 = points[points.length - 1].t;
    let vmin = Infinity, vmax = -Infinity;
    points.forEach((p) => { vmin = Math.min(vmin, p.v); vmax = Math.max(vmax, p.v); });
    if (vmax - vmin < 1) { vmax += 0.5; vmin -= 0.5; }
    const span = t1 - t0 || 1;
    return points
      .map((p) => {
        const x = ((p.t - t0) / span) * w;
        const y = pad + (1 - (p.v - vmin) / (vmax - vmin)) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  _downsample(series, n = 60) {
    if (!series || series.length <= n) return series;
    const out = [];
    const bucket = series.length / n;
    for (let i = 0; i < n; i++) {
      const slice = series.slice(Math.floor(i * bucket), Math.floor((i + 1) * bucket) || 1);
      if (!slice.length) continue;
      const v = slice.reduce((a, p) => a + p.v, 0) / slice.length;
      out.push({ t: slice[Math.floor(slice.length / 2)].t, v });
    }
    return out;
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

const SPC_VERSION = "1.2.0";

const SPC_DEFAULTS = {
  name: "Sleep",
  ring: { max_hours: 12 },
  hypnogram: {
    max_hours: 14,
    session_gap_minutes: 90,
    bars: 150,
    levels: { awake: "high", light_sleep: "mid", deep_sleep: "low" },
    colors: { awake: "#FFA74E", light_sleep: "#50A0FF", deep_sleep: "#AA78FF" },
  },
  history_refresh_minutes: 5,
};

// Sleep states we chart. Everything else (unknown, unavailable) is a gap.
const SPC_TRACKED = ["awake", "light_sleep", "deep_sleep"];

// Of those, the ones that mean a session is running. `awake` is charted inside
// a session but never opens one or holds one open, so the wake-up that ended
// last night does not keep it alive into tonight.
const SPC_SLEEPING = ["light_sleep", "deep_sleep"];

class SleepPanelCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._watched = [];
    this._lastStates = null;
    this._history = {}; // entity_id -> [{t, v}]
    this._historyTimer = null;
    this._renderQueued = false;
    this._rendered = false;
  }

  /* ---------------- config ---------------- */

  setConfig(config) {
    if (!config || !config.sleep_state) {
      throw new Error("sleep-panel-card: 'sleep_state' (a sleep-state sensor) is required");
    }
    const hyp = { ...SPC_DEFAULTS.hypnogram, ...(config.hypnogram || {}) };
    hyp.levels = { ...SPC_DEFAULTS.hypnogram.levels, ...((config.hypnogram || {}).levels || {}) };
    hyp.colors = { ...SPC_DEFAULTS.hypnogram.colors, ...((config.hypnogram || {}).colors || {}) };

    this._config = {
      ...SPC_DEFAULTS,
      ...config,
      ring: { ...SPC_DEFAULTS.ring, ...(config.ring || {}) },
      hypnogram: hyp,
    };
    this._watched = this._collectWatched();
    this._rendered = false;
    this._lastStates = null;
  }

  static getStubConfig(hass) {
    const s = Object.keys(hass.states).find((e) => /sleep_state$/.test(e));
    return { sleep_state: s || "sensor.sleep_state" };
  }

  getCardSize() {
    return this._config && this._config.ribbon ? 3 : 7;
  }

  _collectWatched() {
    const c = this._config;
    const ids = new Set([c.sleep_state]);
    const add = (v) => v && typeof v === "string" && v.includes(".") && ids.add(v);
    add(c.person);
    add(c.age);
    if (c.active_when) add(c.active_when.entity);
    if (c.ring) {
      add(c.ring.deep); add(c.ring.light);
      add(c.ring.deep_last_night); add(c.ring.light_last_night);
      if (c.ring.goal) { add(c.ring.goal.deep); add(c.ring.goal.light); }
    }
    (c.vitals || []).forEach((v) => { add(v.entity); add(v.last_night); add(v.baseline); });
    if (c.wakeups) { add(c.wakeups.live); add(c.wakeups.last_night); add(c.wakeups.baseline); }
    if (c.bedtime) { add(c.bedtime.entity); add(c.bedtime.baseline); add(c.bedtime.datetime); }
    if (c.hypnogram) add(c.hypnogram.start_entity);
    if (c.session) { add(c.session.start); add(c.session.end); }
    if (c.room) { add(c.room.temp); add(c.room.humidity); add(c.room.overnight_avg); }
    (c.chips || []).forEach((ch) => {
      add(ch.entity); add(ch.timer); add(ch.since);
      if (ch.visible) add(ch.visible.entity);
    });
    return [...ids];
  }

  /* ---------------- hass updates ---------------- */

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    if (!this._historyTimer) this._startHistory();

    const snapshot = this._watched
      .map((id) => {
        const s = hass.states[id];
        return s ? `${id}:${s.state}` : `${id}:missing`;
      })
      .join("|");

    if (snapshot !== this._lastStates) {
      this._lastStates = snapshot;
      this._scheduleRender();
    }
  }

  _scheduleRender() {
    if (this._renderQueued) return;
    this._renderQueued = true;
    requestAnimationFrame(() => {
      this._renderQueued = false;
      this._render();
    });
  }

  connectedCallback() {
    if (this._config && this._hass) this._startHistory();
  }

  disconnectedCallback() {
    clearInterval(this._historyTimer);
    this._historyTimer = null;
  }

  /* ---------------- data helpers ---------------- */

  _st(id) {
    return id && this._hass ? this._hass.states[id] : undefined;
  }

  _num(id, attr) {
    const s = this._st(id);
    if (!s) return null;
    const raw = attr ? s.attributes[attr] : s.state;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }

  _esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  _visible(cond) {
    if (!cond) return true;
    if (Array.isArray(cond)) return cond.every((c) => this._visible(c));
    const s = this._st(cond.entity);
    if (!s) return false;
    if (cond.state !== undefined) return s.state === cond.state;
    if (cond.state_not !== undefined) return s.state !== cond.state_not;
    const n = parseFloat(s.state);
    if (!Number.isFinite(n)) return false;
    if (cond.above !== undefined && !(n > cond.above)) return false;
    if (cond.below !== undefined && !(n < cond.below)) return false;
    return true;
  }

  // "light sleep", "Light_Sleep" -> "light_sleep"
  _norm(v) {
    return String(v ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  /** Actually asleep — `awake` is charted but does not delimit a session. */
  _isSleepingState(v) {
    return SPC_SLEEPING.includes(this._norm(v));
  }

  _isAsleepState(v) {
    return SPC_TRACKED.includes(this._norm(v));
  }

  /** Night while the sock reports, Recap once it is off. */
  _mode() {
    const c = this._config;
    if (c.active_when && c.active_when.entity) {
      const s = this._st(c.active_when.entity);
      if (!s) return "recap";
      const want = c.active_when.state !== undefined ? c.active_when.state : "on";
      return s.state === want ? "night" : "recap";
    }
    const s = this._st(c.sleep_state);
    return s && this._isAsleepState(s.state) ? "night" : "recap";
  }

  /* ---------------- formatting ---------------- */

  _hm(hours) {
    if (hours === null || hours === undefined || !Number.isFinite(hours)) return "—";
    const total = Math.round(hours * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  }

  _clock(date) {
    if (!date) return "—";
    let h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, "0");
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ap}`;
  }

  /** How long an entity has held its current state, as "34m" / "2h 05m". */
  _elapsed(entityId) {
    const s = this._st(entityId);
    if (!s || !s.last_changed) return null;
    const ms = Date.now() - new Date(s.last_changed).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
  }

  /** minutes past midnight -> "7:21 PM" */
  _clockFromMinutes(mins) {
    if (mins === null || mins === undefined || !Number.isFinite(mins)) return "—";
    const d = new Date();
    d.setHours(Math.floor(mins / 60), Math.round(mins % 60), 0, 0);
    return this._clock(d);
  }

  _signed(n, digits = 1) {
    const r = Number(Math.abs(n).toFixed(digits));
    return `${r}`;
  }

  /**
   * Renders "▲ 2.4 vs 7d" with direction colouring.
   * lower_is_better flips which direction reads as good.
   */
  _deltaHtml(value, baseline, opts = {}) {
    if (value === null || baseline === null) return `<span class="delta d-flat">no baseline</span>`;
    const diff = value - baseline;
    const digits = opts.digits !== undefined ? opts.digits : 1;
    const eps = opts.eps !== undefined ? opts.eps : 0.05;
    if (Math.abs(diff) < eps) {
      return `<span class="delta d-flat">— even vs 7d</span>`;
    }
    const up = diff > 0;
    const good = opts.lower_is_better ? !up : up;
    const cls = opts.neutral ? "d-warn" : good ? "d-good" : "d-warn";
    return `<span class="delta ${cls}">${up ? "▲" : "▼"} ${this._signed(diff, digits)} vs 7d</span>`;
  }

  /* ---------------- history ---------------- */

  _historyEntities() {
    const c = this._config;
    const ids = new Set([c.sleep_state]);
    (c.vitals || []).forEach((v) => v.entity && ids.add(v.entity));
    return [...ids];
  }

  _startHistory() {
    const run = () => this._fetchHistory();
    run();
    clearInterval(this._historyTimer);
    this._historyTimer = setInterval(run, (this._config.history_refresh_minutes || 5) * 60 * 1000);
  }

  async _fetchHistory() {
    if (!this._hass) return;
    const ids = this._historyEntities();
    if (!ids.length) return;
    const hyp = this._config.hypnogram;
    /* A window anchored to "now" slides forward all day, so by the afternoon
       the front of the night has fallen out of it. When a bedtime entity is
       configured, fetch from bedtime instead so the whole session is covered
       however late it is read. */
    let startMs = Date.now() - (hyp.max_hours || 14) * 3600 * 1000;
    const anchorId = hyp.start_entity || (this._config.session || {}).start;
    const anchor = anchorId && this._hass.states[anchorId];
    if (anchor && anchor.state) {
      const t = Date.parse(String(anchor.state).replace(" ", "T"));
      if (!isNaN(t) && t < Date.now()) {
        /* Pad before bedtime so the drop-off is visible, and never reach back
           further than the recorder is likely to hold. */
        startMs = Math.max(t - 30 * 60 * 1000, Date.now() - 48 * 3600 * 1000);
      }
    }
    const start = new Date(startMs).toISOString();
    try {
      const res = await this._hass.callApi(
        "GET",
        `history/period/${start}?filter_entity_id=${ids.join(",")}&minimal_response&no_attributes`
      );
      const hist = {};
      (res || []).forEach((series) => {
        if (!series || !series.length) return;
        const id = series[0].entity_id;
        if (!id) return;
        hist[id] = series
          .map((e) => ({
            t: new Date(e.last_changed || e.last_updated).getTime(),
            v: e.state,
          }))
          .filter((e) => Number.isFinite(e.t))
          .sort((a, b) => a.t - b.t);
      });
      this._history = hist;
      this._scheduleRender();
    } catch (err) {
      // Recorder may be unavailable; the card degrades to "—" rather than breaking.
      console.warn("sleep-panel-card: history fetch failed", err);
    }
  }

  /**
   * The span worth charting: the *most recent* sleep session, so Night shows
   * tonight and Recap shows last night, without needing a configured window.
   *
   * The history window deliberately reaches back far enough to still hold the
   * tail of the previous night once a new one starts, so first-asleep to
   * last-asleep would glue two nights together with a dead gap between them.
   * Walk back from the last sleep reading instead and stop at the first break
   * longer than `session_gap_minutes` — sock-off (`unavailable`), `unknown`
   * and long awake stretches end a session, while the brief awake blips
   * inside a night do not.
   */
  _sleepSpan() {
    const events = this._history[this._config.sleep_state] || [];
    if (!events.length) return null;

    const asleep = [];
    events.forEach((e, i) => {
      if (this._isSleepingState(e.v)) asleep.push(i);
    });
    if (!asleep.length) return null;

    const gapMs = (this._config.hypnogram.session_gap_minutes || 90) * 60000;
    const last = asleep[asleep.length - 1];
    let first = last;
    for (let k = asleep.length - 1; k > 0; k--) {
      const cur = asleep[k];
      const prev = asleep[k - 1];
      // `prev`'s sleep state ended when the next event replaced it.
      const prevEnd = events[prev + 1] ? events[prev + 1].t : events[prev].t;
      if (events[cur].t - prevEnd > gapMs) break;
      first = prev;
    }

    const t0 = events[first].t;
    // The session ends where the sensor stopped reporting a sleep state,
    // or at "now" if it still is.
    const t1 = last + 1 < events.length ? events[last + 1].t : Date.now();
    if (t1 <= t0) return null;
    return { t0, t1, events };
  }

  /** State in effect at time t (last event at or before t). */
  _stateAt(events, t) {
    let lo = 0;
    let hi = events.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].t <= t) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return idx === -1 ? null : events[idx].v;
  }

  /* ---------------- sections ---------------- */

  /* The recorded session, read straight from the bedtime/wake helpers.
     Deriving the header range from fetched history is fragile: the window is
     anchored to now, so by the afternoon its own left edge gets reported as
     the bedtime. These helpers are written once per night and never drift. */
  _sessionRange() {
    const sess = this._config.session;
    if (!sess) return null;
    const at = (id) => {
      const st = this._st(id);
      if (!st || !st.state) return null;
      const t = Date.parse(String(st.state).replace(" ", "T"));
      return Number.isFinite(t) ? t : null;
    };
    const t0 = at(sess.start);
    if (!t0) return null;
    return { t0, t1: at(sess.end) || Date.now() };
  }

  /* The configured person's own photo when there is one, falling back to the
     generic silhouette. */
  _avatarInner() {
    const st = this._config.person ? this._st(this._config.person) : null;
    const pic = st && st.attributes && st.attributes.entity_picture;
    if (pic) return `<img src="${this._esc(pic)}" alt="" />`;
    return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 10c4.4 0 8 2.2 8 5v3H4v-3c0-2.8 3.6-5 8-5Z"/></svg>`;
  }

  _headerHtml(mode) {
    const c = this._config;
    const stateRaw = (this._st(c.sleep_state) || {}).state;
    const state = this._norm(stateRaw);
    const label = {
      deep_sleep: "Deep sleep",
      light_sleep: "Light sleep",
      awake: "Awake",
    }[state];

    const pillCls = mode === "recap" ? "pill-off" : `pill-${state}`;
    const pillText = mode === "recap" ? "Sock off" : label || "No reading";

    const age = c.age ? (this._st(c.age) || {}).state : null;
    const span = this._sessionRange() || this._sleepSpan();
    let sub = age ? this._esc(age) : "";
    if (span) {
      const t0 = this._clock(new Date(span.t0));
      const when = mode === "night" ? `asleep since ${t0}` : `${t0} → ${this._clock(new Date(span.t1))}`;
      sub = sub ? `${sub} · ${when}` : when;
    }

    return `
      <div class="head">
        <div class="avatar ${mode === "recap" ? "avatar-off" : ""}" aria-hidden="true">
          ${this._avatarInner()}
        </div>
        <div class="id">
          <span class="nm">${this._esc(c.name)}</span>
          ${sub ? `<span class="sub">${sub}</span>` : ""}
        </div>
        <span class="pill ${pillCls}" data-tap="more-info" data-entity="${this._esc(c.sleep_state)}">
          <i class="dot"></i>${this._esc(pillText)}
        </span>
      </div>`;
  }

  _ringHtml(mode) {
    const c = this._config;
    const r = c.ring || {};
    const night = mode === "night";
    const deep = night ? this._num(r.deep) : this._num(r.deep_last_night);
    const light = night ? this._num(r.light) : this._num(r.light_last_night);

    if (deep === null && light === null) return "";

    const d = deep || 0;
    const l = light || 0;
    const total = d + l;
    const max = r.max_hours || 12;

    const goalDeep = r.goal ? this._num(r.goal.deep) : null;
    const goalLight = r.goal ? this._num(r.goal.light) : null;
    const goal = goalDeep !== null || goalLight !== null ? (goalDeep || 0) + (goalLight || 0) : null;

    const R = 92;
    const ARC = 2 * Math.PI * R * 0.75; // 270° sweep
    const clamp = (v) => Math.max(0, Math.min(1, v / max));
    const dLen = ARC * clamp(d);
    const lLen = ARC * clamp(Math.min(l, Math.max(0, max - d)));

    let marker = "";
    if (goal !== null && goal > 0 && goal < max) {
      const frac = goal / max;
      const ang = ((135 + 270 * frac) * Math.PI) / 180;
      const x1 = 120 + 80 * Math.cos(ang);
      const y1 = 120 + 80 * Math.sin(ang);
      const x2 = 120 + 104 * Math.cos(ang);
      const y2 = 120 + 104 * Math.sin(ang);
      marker = `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
                      class="goal-tick" stroke-width="2.5" stroke-linecap="round"/>`;
    }

    let caption = goal !== null && goal > 0 ? `of ${this._hm(goal)} typical` : "total sleep";
    let capCls = "";
    if (!night && goal !== null && goal > 0) {
      const diffMin = Math.round((total - goal) * 60);
      if (Math.abs(diffMin) >= 5) {
        caption = `${this._hm(Math.abs(total - goal))} ${diffMin > 0 ? "above" : "below"} typical`;
        capCls = diffMin > 0 ? "cap-good" : "cap-warn";
      }
    }

    const colors = c.hypnogram.colors;
    const legend = `
      <div class="legend">
        ${deep !== null ? `<span><i style="background:${this._esc(colors.deep_sleep)}"></i>Deep ${this._hm(d)}</span>` : ""}
        ${light !== null ? `<span><i style="background:${this._esc(colors.light_sleep)}"></i>Light ${this._hm(l)}</span>` : ""}
        ${goal !== null && goal > 0 ? `<span><i class="i-goal"></i>7-day avg</span>` : ""}
      </div>`;

    return `
      <div class="ring-wrap" data-tap="more-info" data-entity="${this._esc(r.deep || c.sleep_state)}">
        <svg viewBox="0 0 240 240" role="img" aria-label="Total sleep ${this._hm(total)}: ${this._hm(l)} light, ${this._hm(d)} deep.">
          <circle cx="120" cy="120" r="${R}" fill="none" class="track" stroke-width="15"
                  stroke-linecap="round" stroke-dasharray="${ARC.toFixed(1)} 999" transform="rotate(135 120 120)"/>
          <circle cx="120" cy="120" r="${R}" fill="none" stroke="${this._esc(colors.light_sleep)}" stroke-width="15"
                  stroke-linecap="${d > 0 ? "butt" : "round"}" stroke-dasharray="${lLen.toFixed(1)} 999"
                  stroke-dashoffset="${(-dLen).toFixed(1)}" transform="rotate(135 120 120)"/>
          <circle cx="120" cy="120" r="${R}" fill="none" stroke="${this._esc(colors.deep_sleep)}" stroke-width="15"
                  stroke-linecap="round" stroke-dasharray="${dLen.toFixed(1)} 999" transform="rotate(135 120 120)"/>
          ${marker}
        </svg>
        <div class="ring-center">
          <span class="ring-val">${this._hm(total)}</span>
          <span class="ring-cap ${capCls}">${this._esc(caption)}</span>
        </div>
      </div>
      ${legend}`;
  }

  /**
   * Live vitals, Night only. In Recap the same figures appear as rows
   * (_rowsHtml) with their last-night averages, so rendering both would
   * duplicate them.
   */
  _vitalsHtml(mode) {
    if (mode !== "night") return "";
    const vitals = this._config.vitals || [];
    if (!vitals.length) return "";

    const cells = vitals.map((v) => {
      const value = this._num(v.entity);
      const baseline = this._num(v.baseline);
      const digits = v.digits !== undefined ? v.digits : 1;
      const shown = value === null ? "—" : `${Number(value.toFixed(digits))}`;
      const spark = v.entity ? this._sparkSvg(v.entity, v.color || "var(--spc-deep)") : "";
      return `
        <div class="vital" data-tap="more-info" data-entity="${this._esc(v.entity)}">
          <span class="v-lab">${this._esc(v.label || "")}</span>
          <span class="v-val">${shown}${v.unit ? `<small>${this._esc(v.unit)}</small>` : ""}</span>
          ${this._deltaHtml(value, baseline, { lower_is_better: v.lower_is_better, digits })}
          ${spark}
        </div>`;
    });

    return `<div class="vitals">${cells.join("")}</div>`;
  }

  _sparkSvg(entityId, color) {
    const pts = (this._history[entityId] || [])
      .map((e) => parseFloat(e.v))
      .filter((n) => Number.isFinite(n));
    if (pts.length < 3) return "";
    const data = pts.slice(-40);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const coords = data.map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 18 - ((v - min) / span) * 15 + 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = coords.join(" ");
    const last = coords[coords.length - 1].split(",");
    return `
      <svg class="spark" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="0,20 ${line} 100,20" fill="${this._esc(color)}" opacity="0.16"></polygon>
        <polyline points="${line}" fill="none" stroke="${this._esc(color)}" stroke-width="1.4"
                  stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline>
        <circle cx="${last[0]}" cy="${last[1]}" r="1.6" fill="${this._esc(color)}"></circle>
      </svg>`;
  }

  _hypnogramHtml(mode) {
    const c = this._config;
    const h = c.hypnogram;
    const span = this._sleepSpan();
    const title = mode === "night" ? "Tonight" : "Last night";

    const wake = c.wakeups || {};
    const wakeVal = mode === "night" ? this._num(wake.live) : this._num(wake.last_night);
    const wakeText = wakeVal === null ? "" : `${wakeVal} wakeup${wakeVal === 1 ? "" : "s"}`;

    if (!span) {
      this._hypMeta = null;
      return `
        <div class="hyp">
          <div class="hyp-head"><span>${title}</span><em>${this._esc(wakeText)}</em></div>
          <div class="hyp-empty">No sleep recorded in the last ${h.max_hours}h</div>
        </div>`;
    }
    this._hypMeta = span;

    const bars = Math.max(20, Math.min(h.bars || 150, 300));
    const step = (span.t1 - span.t0) / bars;
    // Two-decker geometry: awake rides high, light mid, deep low.
    const geom = { high: [4, 20], mid: [22, 22], low: [40, 20] };
    const bw = 300 / bars;

    let rects = "";
    for (let i = 0; i < bars; i++) {
      const t = span.t0 + step * (i + 0.5);
      const state = this._norm(this._stateAt(span.events, t));
      if (!SPC_TRACKED.includes(state)) continue;
      const level = h.levels[state] || "mid";
      const g = geom[level] || geom.mid;
      const color = h.colors[state] || "#50A0FF";
      const x = i * bw + bw * 0.14;
      rects += `<rect x="${x.toFixed(2)}" y="${g[0]}" width="${Math.max(bw * 0.72, 0.6).toFixed(2)}"
                      height="${g[1]}" rx="${Math.min(bw * 0.3, 1.2).toFixed(2)}" fill="${color}"
                      opacity="${state === "awake" ? "0.95" : "0.82"}"></rect>`;
    }

    const t0 = new Date(span.t0);
    const t1 = new Date(span.t1);
    const mid = new Date(span.t0 + (span.t1 - span.t0) / 2);
    const endLabel = mode === "night" ? "now" : this._clock(t1);

    return `
      <div class="hyp">
        <div class="hyp-head"><span>${title}</span><em data-hyp-read>${this._esc(wakeText)}</em></div>
        <div class="hyp-plot-wrap">
          <svg class="hyp-plot" viewBox="0 0 300 62" preserveAspectRatio="none" role="img"
               aria-label="Hypnogram from ${this._clock(t0)} to ${endLabel}">${rects}</svg>
          <div class="hx" hidden></div>
          <div class="htip" hidden></div>
        </div>
        <div class="hyp-axis">
          <span>${this._clock(t0)}</span><span>${this._clock(mid)}</span><span>${this._esc(endLabel)}</span>
        </div>
      </div>`;
  }

  _stateLabel(state) {
    return {
      deep_sleep: "Deep sleep",
      light_sleep: "Light sleep",
      awake: "Awake",
    }[this._norm(state)] || "No reading";
  }

  /**
   * Scrub the hypnogram to read the time of day (and the state) at any point.
   * Mirrors the trend-graph hover in climate-panel-card: crosshair + tooltip,
   * driven by pointer events so touch-drag works as well as mouse hover.
   */
  _bindHypHover() {
    const wrap = this.shadowRoot.querySelector(".hyp-plot-wrap");
    if (!wrap || !this._hypMeta) return;
    const cross = wrap.querySelector(".hx");
    const tip = wrap.querySelector(".htip");
    const readout = this.shadowRoot.querySelector("[data-hyp-read]");
    const restore = readout ? readout.textContent : "";

    const show = (clientX) => {
      const m = this._hypMeta;
      const rect = wrap.getBoundingClientRect();
      if (!rect.width) return;
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const t = m.t0 + frac * (m.t1 - m.t0);
      const state = this._stateAt(m.events, t);
      const timeStr = this._clock(new Date(t));
      const label = this._stateLabel(state);
      const color = this._config.hypnogram.colors[this._norm(state)] || "var(--spc-muted)";

      cross.hidden = false;
      cross.style.left = `${(frac * 100).toFixed(2)}%`;

      tip.hidden = false;
      tip.innerHTML = `<b>${this._esc(timeStr)}</b><span><i style="background:${this._esc(color)}"></i>${this._esc(label)}</span>`;
      const onLeft = frac > 0.55;
      tip.style.left = onLeft ? "" : `calc(${(frac * 100).toFixed(2)}% + 10px)`;
      tip.style.right = onLeft ? `calc(${((1 - frac) * 100).toFixed(2)}% + 10px)` : "";

      if (readout) readout.textContent = `${timeStr} · ${label}`;
    };

    const hide = () => {
      cross.hidden = true;
      tip.hidden = true;
      if (readout) readout.textContent = restore;
    };

    wrap.addEventListener("pointermove", (e) => show(e.clientX));
    wrap.addEventListener("pointerdown", (e) => show(e.clientX));
    wrap.addEventListener("pointerleave", hide);
    wrap.addEventListener("pointercancel", hide);
  }

  _rowsHtml(mode) {
    if (mode !== "recap") return "";
    const c = this._config;
    const rows = [];

    (c.vitals || []).forEach((v) => {
      const value = this._num(v.last_night);
      if (value === null) return;
      const baseline = this._num(v.baseline);
      const digits = v.digits !== undefined ? v.digits : 1;
      rows.push(`
        <div class="row" data-tap="more-info" data-entity="${this._esc(v.last_night)}">
          <span class="r-lab">Avg ${this._esc((v.label || "").toLowerCase())}</span>
          <span class="r-val">${Number(value.toFixed(digits))}${v.unit ? ` ${this._esc(v.unit)}` : ""}</span>
          <span class="r-cmp">${this._deltaHtml(value, baseline, { lower_is_better: v.lower_is_better, digits })}</span>
        </div>`);
    });

    if (c.bedtime) {
      const mins = this._num(c.bedtime.entity);
      const base = this._num(c.bedtime.baseline);
      if (mins !== null) {
        let cmp = "";
        if (base !== null) {
          const diff = Math.round(mins - base);
          cmp = Math.abs(diff) < 10
            ? `<span class="delta d-flat">about usual</span>`
            : `<span class="delta ${diff > 0 ? "d-warn" : "d-good"}">${Math.abs(diff)}m ${diff > 0 ? "later" : "earlier"} than usual</span>`;
        }
        rows.push(`
          <div class="row" data-tap="more-info" data-entity="${this._esc(c.bedtime.entity)}">
            <span class="r-lab">Bedtime</span>
            <span class="r-val">${this._clockFromMinutes(mins)}</span>
            <span class="r-cmp">${cmp}</span>
          </div>`);
      }
    }

    if (c.room && c.room.overnight_avg) {
      const t = this._num(c.room.overnight_avg);
      if (t !== null) {
        rows.push(`
          <div class="row" data-tap="more-info" data-entity="${this._esc(c.room.overnight_avg)}">
            <span class="r-lab">Room while asleep</span>
            <span class="r-val">${Number(t.toFixed(1))}°</span>
            <span class="r-cmp"><span class="delta d-flat">avg overnight</span></span>
          </div>`);
      }
    }

    if (!rows.length) return "";
    return `<div class="divider"></div><div class="rows">${rows.join("")}</div>`;
  }

  _chipsHtml(mode) {
    const c = this._config;
    const chips = [];

    // Wakeups vs the 7-day average — only meaningful once the night is done.
    const wake = c.wakeups || {};
    if (mode === "recap") {
      const val = this._num(wake.last_night);
      const base = this._num(wake.baseline);
      if (val !== null && base !== null) {
        const better = val <= base;
        chips.push(`<span class="chip ${better ? "chip-good" : "chip-warn"}">${val} wakeup${val === 1 ? "" : "s"} · ${better ? "better than" : "above"} ${Number(base.toFixed(1))} avg</span>`);
      }
    }

    // Live room readout while the night is running.
    if (mode === "night" && c.room && c.room.temp) {
      const t = this._num(c.room.temp);
      const hum = this._num(c.room.humidity);
      if (t !== null) {
        chips.push(`<span class="chip" data-tap="more-info" data-entity="${this._esc(c.room.temp)}">Room ${Number(t.toFixed(1))}°${hum !== null ? ` · ${Math.round(hum)}%` : ""}</span>`);
      }
    }

    (c.chips || []).forEach((ch, i) => {
      if (ch.visible && !this._visible(ch.visible)) return;
      if (ch.timer) {
        const s = this._st(ch.timer);
        if (!s || s.state !== "active") return;
        chips.push(`<span class="chip chip-${this._esc(ch.style || "default")}" data-chip-idx="${i}">${this._esc(ch.name || "Timer")}</span>`);
        return;
      }
      // `since:` renders how long that entity has held its current state,
      // e.g. "Settled 34m" from the sleep-state sensor's last_changed.
      if (ch.since) {
        const elapsed = this._elapsed(ch.since);
        if (elapsed === null) return;
        chips.push(`<span class="chip chip-${this._esc(ch.style || "default")}" data-chip-idx="${i}">${this._esc(`${ch.name || ""} ${elapsed}`.trim())}</span>`);
        return;
      }
      const s = ch.entity ? this._st(ch.entity) : null;
      const text = ch.show_state && s ? `${ch.name || ""} ${s.state}`.trim() : ch.name || (s ? s.state : "");
      if (!text) return;
      chips.push(`<span class="chip chip-${this._esc(ch.style || "default")}" data-chip-idx="${i}">${this._esc(text)}</span>`);
    });

    if (!chips.length) return "";
    return `<div class="chips">${chips.join("")}</div>`;
  }

  /* ---------------- render ---------------- */

  _render() {
    if (!this._hass || !this._config) return;
    const mode = this._mode();
    if (this._config.ribbon) return this._renderRibbon(mode);
    this.shadowRoot.innerHTML = `
      <style>${SleepPanelCard.styles}</style>
      <ha-card>
        <div class="panel mode-${mode}">
          ${this._headerHtml(mode)}
          ${this._ringHtml(mode)}
          ${this._vitalsHtml(mode)}
          ${this._hypnogramHtml(mode)}
          ${this._rowsHtml(mode)}
          ${this._chipsHtml(mode)}
        </div>
      </ha-card>
    `;
    this._bind();
    this._bindHypHover();
    this._rendered = true;
  }

  /* Ribbon mode: header, vitals and a flattened deep/light bar. The ring,
     hypnogram and recap rows stay behind the popup. */
  _renderRibbon(mode) {
    const c = this._config;
    this.shadowRoot.innerHTML = `
      <style>${SleepPanelCard.styles}</style>
      <ha-card>
        <div class="panel ribbon mode-${mode}${c.navigate ? " tappable" : ""}">
          ${this._headerHtml(mode)}
          ${this._vitalsHtml(mode)}
          ${this._splitBarHtml(mode)}
        </div>
      </ha-card>
    `;
    this._bind();
    if (c.navigate) {
      const panel = this.shadowRoot.querySelector(".panel");
      panel.addEventListener("click", (e) => {
        if (e.target.closest("[data-tap], [data-chip-idx]")) return;
        pcNavigate(this, c.navigate);
      });
    }
    this._rendered = true;
  }

  /* The ring's deep/light split, flattened so it survives at ribbon height. */
  _splitBarHtml(mode) {
    const r = this._config.ring || {};
    const night = mode === "night";
    const deep = night ? this._num(r.deep) : this._num(r.deep_last_night);
    const light = night ? this._num(r.light) : this._num(r.light_last_night);
    const d = deep || 0;
    const l = light || 0;
    const tot = d + l;
    if (tot <= 0) return "";
    const dp = (d / tot) * 100;
    const fmt = (h) => {
      const m = Math.round(h * 60);
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      return hh ? `${hh}h ${mm}m` : `${mm}m`;
    };
    return `
      <div class="splitbar">
        <div class="sb-track" role="img" aria-label="Deep ${fmt(d)}, light ${fmt(l)}">
          <i class="sb-deep" style="width:${dp.toFixed(1)}%"></i>
          <i class="sb-light" style="width:${(100 - dp).toFixed(1)}%"></i>
        </div>
        <div class="sb-legend"><span>Deep ${fmt(d)}</span><span>Light ${fmt(l)}</span></div>
      </div>
    `;
  }

  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-tap='more-info']").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._moreInfo(el.dataset.entity);
      });
    });
    root.querySelectorAll("[data-chip-idx]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const chip = (this._config.chips || [])[parseInt(el.dataset.chipIdx, 10)];
        if (chip && (chip.entity || chip.timer)) this._moreInfo(chip.entity || chip.timer);
      });
    });
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  /* ---------------- styles ---------------- */

  static get styles() {
    return `
      :host {
        ${PC_TOKENS}
        --spc-panel: var(--pc-panel);
        --spc-panel-2: var(--pc-panel-2);
        --spc-line: var(--pc-line);
        --spc-track: var(--pc-track);
        --spc-chip: var(--pc-chip);
        --spc-text: var(--pc-text);
        --spc-muted: var(--pc-muted);
        --spc-deep: var(--spc-deep-override, #AA78FF);
        --spc-light: var(--spc-light-override, #50A0FF);
        --spc-awake: var(--spc-awake-override, #FFA74E);
        --spc-good: var(--spc-good-override, var(--pc-good));
        --spc-warn: var(--spc-warn-override, var(--pc-warn));
        --spc-cool: var(--pc-cool);
        --spc-radius: var(--pc-radius);
        display: block;
        font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        color: var(--spc-text);
      }

      ha-card {
        background: var(--spc-panel);
        border-radius: var(--spc-radius);
        overflow: hidden;
      }

      .panel {
        padding: 16px 16px 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      /* header */
      .head { display: flex; align-items: center; gap: 10px; }
      .avatar {
        width: 40px; height: 40px; border-radius: 999px; flex: none;
        display: grid; place-items: center; overflow: hidden;
        background: rgba(170, 120, 255, 0.16); color: var(--spc-deep);
      }
      .avatar-off { background: var(--spc-chip); color: var(--spc-muted); }
      .avatar svg { width: 22px; height: 22px; }
      .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .avatar-off img { filter: grayscale(1); opacity: 0.65; }
      .id { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
      .nm { font-size: 15px; font-weight: 600; letter-spacing: 0.01em; }
      .sub {
        font-size: 11.5px; color: var(--spc-muted);
        font-variant-numeric: tabular-nums;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pill {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 11px; border-radius: 999px;
        font-size: 12px; font-weight: 600; white-space: nowrap; cursor: pointer;
        background: var(--spc-chip); color: var(--spc-muted);
      }
      .pill .dot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
      .pill-deep_sleep  { background: rgba(170, 120, 255, 0.18); color: var(--spc-deep); }
      .pill-light_sleep { background: rgba(80, 160, 255, 0.18); color: var(--spc-light); }
      .pill-awake       { background: rgba(255, 167, 78, 0.18); color: var(--spc-awake); }
      .pill-off         { background: var(--spc-chip); color: var(--spc-muted); }

      /* ring */
      .ring-wrap {
        position: relative; width: 208px; height: 178px;
        margin: 0 auto; cursor: pointer;
      }
      .ring-wrap svg { width: 208px; height: 208px; margin-top: -14px; display: block; }
      .track { stroke: var(--spc-line); }
      .goal-tick { stroke: var(--spc-warn); }
      .ring-center {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 2px;
        padding-bottom: 12px; pointer-events: none;
      }
      .ring-val {
        font-size: 34px; font-weight: 600; letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums; line-height: 1;
      }
      .ring-cap { font-size: 11px; color: var(--spc-muted); font-variant-numeric: tabular-nums; }
      .cap-good { color: var(--spc-good); }
      .cap-warn { color: var(--spc-warn); }
      .legend {
        display: flex; justify-content: center; flex-wrap: wrap; gap: 6px 14px;
        font-size: 11px; color: var(--spc-muted);
        font-variant-numeric: tabular-nums; margin-top: -6px;
      }
      .legend span { display: inline-flex; align-items: center; gap: 5px; }
      .legend i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
      .legend .i-goal { background: var(--spc-warn); }

      /* vitals */
      .vitals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .vital {
        background: var(--spc-chip); border-radius: 14px;
        padding: 10px 10px 8px; min-width: 0; cursor: pointer;
        display: flex; flex-direction: column; gap: 3px;
      }
      .v-lab {
        font-size: 10px; letter-spacing: 0.07em; text-transform: uppercase;
        color: var(--spc-muted);
      }
      .v-val {
        font-size: 19px; font-weight: 600; line-height: 1.15;
        font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
      }
      .v-val small { font-size: 11px; font-weight: 500; color: var(--spc-muted); margin-left: 2px; }
      .delta { font-size: 10.5px; font-variant-numeric: tabular-nums; }
      .d-flat { color: var(--spc-muted); }
      .d-good { color: var(--spc-good); }
      .d-warn { color: var(--spc-warn); }
      .spark { width: 100%; height: 18px; margin-top: 2px; display: block; }

      /* hypnogram */
      .hyp { display: flex; flex-direction: column; gap: 6px; }
      .hyp-head {
        display: flex; align-items: baseline; justify-content: space-between;
        font-size: 10px; letter-spacing: 0.07em; text-transform: uppercase;
        color: var(--spc-muted);
      }
      .hyp-head em {
        font-style: normal; text-transform: none; letter-spacing: 0;
        font-variant-numeric: tabular-nums;
      }
      .hyp-plot-wrap { position: relative; touch-action: pan-y; cursor: crosshair; }
      .hyp-plot { width: 100%; height: 62px; display: block; }
      .hx {
        position: absolute; top: 0; bottom: 0; width: 1px;
        background: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.35);
        pointer-events: none; z-index: 2;
      }
      .htip {
        position: absolute; top: 50%; transform: translateY(-50%);
        background: rgba(10, 14, 18, 0.92); color: var(--spc-text);
        border-radius: 8px; padding: 5px 8px; white-space: nowrap;
        font-size: 11.5px; font-variant-numeric: tabular-nums;
        pointer-events: none; z-index: 3;
        display: flex; flex-direction: column; gap: 2px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      }
      .htip b { font-weight: 600; }
      .htip span { display: inline-flex; align-items: center; gap: 5px; color: var(--spc-muted); }
      .htip i { width: 7px; height: 7px; border-radius: 2px; display: inline-block; }
      .hyp-empty {
        font-size: 12px; color: var(--spc-muted);
        background: var(--spc-chip); border-radius: 12px;
        padding: 14px; text-align: center;
      }
      .hyp-axis {
        display: flex; justify-content: space-between;
        font-size: 9.5px; color: var(--spc-muted); font-variant-numeric: tabular-nums;
      }

      /* recap rows */
      .divider { height: 1px; background: var(--spc-line); }
      .rows { display: flex; flex-direction: column; gap: 6px; }
      .row {
        display: flex; align-items: center; gap: 10px; cursor: pointer;
        background: var(--spc-chip); border-radius: 12px;
        padding: 9px 12px; font-size: 12.5px; font-variant-numeric: tabular-nums;
      }
      .r-lab { color: var(--spc-muted); flex: 1; min-width: 0; }
      .r-val { font-weight: 600; white-space: nowrap; }
      .r-cmp { text-align: right; min-width: 96px; }

      /* chips */
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .chip {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 10px; border-radius: 999px;
        font-size: 11.5px; font-weight: 600;
        background: var(--spc-chip); color: var(--spc-muted);
      }
      .chip-warn { background: rgba(242, 193, 78, 0.13); color: var(--spc-warn); }
      .chip-good { background: rgba(129, 201, 149, 0.13); color: var(--spc-good); }
      .chip-deep { background: rgba(170, 120, 255, 0.15); color: var(--spc-deep); }

      [data-tap]:focus-visible, [data-chip-idx]:focus-visible {
        outline: 2px solid var(--spc-light); outline-offset: 2px;
      }

      @media (max-width: 340px) {
        .vitals { grid-template-columns: repeat(2, 1fr); }
      }

      /* ---- ribbon mode ---- */
      .panel.ribbon { padding: 14px 16px 15px; gap: 11px; }
      .panel.ribbon .ring, .panel.ribbon .hyp, .panel.ribbon .rows { display: none; }
      .panel.tappable { cursor: pointer; }
      .panel.tappable:active { background: var(--spc-panel-2); }
      .splitbar { display: flex; flex-direction: column; gap: 6px; }
      .sb-track {
        display: flex; height: 7px; border-radius: 4px;
        overflow: hidden; background: var(--spc-track);
      }
      .sb-track i { display: block; height: 100%; }
      .sb-deep { background: var(--spc-deep); }
      .sb-light { background: var(--spc-light); }
      .sb-legend {
        display: flex; justify-content: space-between;
        font-size: 11px; color: var(--spc-muted);
        font-variant-numeric: tabular-nums;
      }

      @media (prefers-reduced-motion: reduce) {
        * { transition: none !important; }
      }
    `;
  }
}

/* ============================================================================
 * Home-screen cards
 *
 * Five small elements that replace the built-in markdown/tile/grid cards on
 * the phone dashboard. They share PC_TOKENS with the two panels above, so the
 * whole home screen reads as one surface.
 * ========================================================================== */

/* Primitives every home-screen card uses. Kept in one string so the chip,
   label and numeral treatments cannot drift between cards. */
const PC_BASE = `
  :host {
    ${PC_TOKENS}
    display: block;
    font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    color: var(--pc-text);
  }
  * { box-sizing: border-box; }
  .card {
    background: var(--pc-panel);
    border-radius: var(--pc-radius);
    padding: 14px 16px;
  }
  /* Opt-in, because a card that already carries a severity colour should not
     also be washed cool. */
  .card.tint, .tint {
    background-image: linear-gradient(180deg, var(--pc-tint), transparent 130px);
  }
  .avatar {
    width: 34px; height: 34px; border-radius: 50%; flex: 0 0 auto;
    background: var(--pc-panel-2); color: var(--pc-muted);
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; overflow: hidden;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .lbl {
    font-size: 10px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--pc-muted);
    font-weight: 500;
  }
  .num { font-variant-numeric: tabular-nums; }
  .row { display: flex; align-items: center; gap: 10px; }
  .spread { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .grow { flex: 1; min-width: 0; }
  .trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ha-icon { --mdc-icon-size: 21px; flex: 0 0 auto; }
  .chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 9px; border-radius: 999px;
    font-size: 11px; font-weight: 600;
    background: var(--pc-chip); color: var(--pc-muted);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .chip ha-icon { --mdc-icon-size: 14px; }
  .tappable { cursor: pointer; }
  .tappable:active { background: var(--pc-panel-2); }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

/* Read a numeric state, or null when it is missing/non-numeric. */
function pcNum(hass, id) {
  if (!id || !hass || !hass.states[id]) return null;
  const v = parseFloat(hass.states[id].state);
  return isNaN(v) ? null : v;
}

/* Raw state string, or "" when the entity is absent. */
function pcState(hass, id) {
  if (!id || !hass || !hass.states[id]) return "";
  return hass.states[id].state;
}

function pcName(hass, id, fallback) {
  if (fallback) return fallback;
  if (!id || !hass || !hass.states[id]) return id || "";
  return hass.states[id].attributes.friendly_name || id;
}

function pcMoreInfo(node, entityId) {
  if (!entityId) return;
  const ev = new Event("hass-more-info", { bubbles: true, composed: true });
  ev.detail = { entityId };
  node.dispatchEvent(ev);
}

/* Run a Lovelace-style action object. Supports the subset the home screen
   needs: navigate, toggle, perform-action, more-info. */
function pcAction(node, hass, action, fallbackEntity) {
  const a = action || { action: "more-info" };
  if (a.action === "none") return;
  if (a.action === "navigate") return pcNavigate(node, a.navigation_path);
  if (a.action === "toggle" && fallbackEntity) {
    return hass.callService("homeassistant", "toggle", { entity_id: fallbackEntity });
  }
  if (a.action === "url") {
    if (a.url_path) window.open(a.url_path, a.new_tab === false ? "_self" : "_blank");
    return;
  }
  if (a.action === "perform-action" || a.action === "call-service") {
    const svc = a.perform_action || a.service;
    if (!svc || svc.indexOf(".") < 0) return;
    const parts = svc.split(".");
    return hass.callService(parts[0], parts[1], a.data || {}, a.target || undefined);
  }
  pcMoreInfo(node, a.entity || fallbackEntity);
}

/* Shared plumbing: re-render only when a watched entity actually changed. */
class PcBaseCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._watched = [];
    this._last = null;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const sig = this._watched
      .map((id) => (hass.states[id] ? hass.states[id].state : "~"))
      .join("|");
    if (sig === this._last) return;
    this._last = sig;
    this._render();
  }

  getCardSize() {
    return 2;
  }
}

/* ---------------------------------------------------------------- header --*/

class PurdyHeaderCard extends PcBaseCard {
  static getStubConfig(hass) {
    const w = Object.keys(hass.states).find((e) => e.startsWith("weather."));
    /* No name key at all, so the greeting follows whoever is signed in. */
    return { weather: w || "weather.home" };
  }

  setConfig(config) {
    this._config = { ...config };
    const c = this._config;
    this._watched = [c.weather, c.occupancy].filter(Boolean);
    this._last = null;
    if (this._clock) clearInterval(this._clock);
    /* The clock is the one thing no entity change drives. */
    this._clock = setInterval(() => this._render(), 30000);
  }

  disconnectedCallback() {
    if (this._clock) clearInterval(this._clock);
  }

  _greeting(h) {
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  /* Who is actually holding the phone. A dashboard shared by a household
     should not greet everyone by the same name, so the logged-in user wins
     unless the config names someone explicitly.

     - name omitted   -> the viewer's own first name
     - name: "Alex"   -> always Alex
     - name: ""       -> no name at all */
  _who() {
    const c = this._config;
    if (c.name !== undefined) return c.name;
    const u = this._hass && this._hass.user;
    if (!u || !u.name) return "";
    return String(u.name).trim().split(/\s+/)[0];
  }

  _render() {
    if (!this._hass || !this._config) return;
    const c = this._config;
    const now = new Date();
    const wState = pcState(this._hass, c.weather);
    const wTemp = c.weather && this._hass.states[c.weather]
      ? this._hass.states[c.weather].attributes.temperature
      : null;
    const occ = pcState(this._hass, c.occupancy);
    const icons = {
      rainy: "mdi:weather-rainy", pouring: "mdi:weather-pouring",
      sunny: "mdi:weather-sunny", clear: "mdi:weather-night",
      "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy",
      partlycloudy: "mdi:weather-partly-cloudy", snowy: "mdi:weather-snowy",
      fog: "mdi:weather-fog", windy: "mdi:weather-windy",
      lightning: "mdi:weather-lightning", hail: "mdi:weather-hail",
    };
    const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const date = now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
    const sub = [date, time, occ].filter(Boolean).join(" · ");

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .wrap { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 2px 6px 0; }
        h2 { font-size: 25px; font-weight: 650; letter-spacing: -0.025em; margin: 0; line-height: 1.1; }
        .sub { font-size: 12.5px; color: var(--pc-muted); font-variant-numeric: tabular-nums; margin-top: 2px; }
        .wx { display: flex; align-items: center; gap: 7px; color: var(--pc-cool); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
        .wx ha-icon { --mdc-icon-size: 22px; }
      </style>
      <div class="wrap">
        <div>
          <h2>${this._greeting(now.getHours())}${this._who() ? ", " + this._who() : ""}</h2>
          <div class="sub">${sub}</div>
        </div>
        ${wTemp == null ? "" : `
          <div class="wx">
            <ha-icon icon="${icons[wState] || "mdi:weather-partly-cloudy"}"></ha-icon>
            ${Math.round(wTemp)}°
          </div>`}
      </div>
    `;
  }

  getCardSize() {
    return 1;
  }
}

/* ------------------------------------------------------------- attention --*/

class PurdyAttentionCard extends PcBaseCard {
  static getStubConfig() {
    return {
      title: "Needs attention",
      rules: [{ entity: "binary_sensor.problem", state: "on", severity: "warn", title: "Problem" }],
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.rules)) {
      throw new Error("purdy-attention-card: 'rules' (a list) is required");
    }
    this._config = { title: "Needs attention", ...config };
    const ids = [];
    (config.rules || []).forEach((r) => {
      if (r.entity) ids.push(r.entity);
    });
    if (config.dismiss_store) ids.push(config.dismiss_store);
    this._watched = ids;
    this._last = null;
    this._groupRule = (config.rules || []).find((r) => r.match);
    this._logged = {};
  }

  /* Group rules match by regex across the whole registry. Rescanning ~1300
     entities on every state change is wasteful, so the id list is cached and
     rebuilt only when the registry size changes or the cache ages out. */
  _matching(pattern) {
    const size = Object.keys(this._hass.states).length;
    const now = Date.now();
    if (!this._mCache || this._mSize !== size || now - this._mAt > 60000) {
      this._mCache = {};
      this._mSize = size;
      this._mAt = now;
    }
    if (!this._mCache[pattern]) {
      const pat = new RegExp(pattern);
      this._mCache[pattern] = Object.keys(this._hass.states).filter((id) => pat.test(id));
    }
    return this._mCache[pattern];
  }

  /* A group rule's entities are not known at setConfig time, so fold them
     into the watch list here — otherwise a battery going low on its own
     would never re-render the card. */
  set hass(hass) {
    if (this._groupRule && this._config) {
      this._hass = hass;
      const pat = new RegExp(this._groupRule.match);
      this._watched = this._watched
        .filter((id) => !pat.test(id))
        .concat(this._matching(this._groupRule.match));
    }
    super.hass = hass;
  }

  /* A rule needs a stable id so a dismissal survives a re-render. Prefer an
     explicit key; fall back to a slug of the title. */
  _key(r, i) {
    if (r.key) return r.key;
    const t = r.title || r.entity || String(i);
    return t.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12);
  }

  /* Store format is "key:epoch|key:epoch" — compact enough that a dozen
     dismissals fit inside input_text's 255-character ceiling. */
  _dismissals() {
    const raw = pcState(this._hass, this._config.dismiss_store);
    const out = {};
    if (!raw || raw === "unknown") return out;
    raw.split("|").forEach((pair) => {
      const bits = pair.split(":");
      if (bits.length === 2 && bits[0]) out[bits[0]] = parseInt(bits[1], 10) || 0;
    });
    return out;
  }

  _writeDismissals(map) {
    const val = Object.keys(map)
      .map((k) => k + ":" + map[k])
      .join("|")
      .slice(0, 255);
    this._hass.callService("input_text", "set_value", {
      entity_id: this._config.dismiss_store,
      value: val,
    });
  }

  /* When did this rule's condition last change? A dismissal older than that
     means the fault re-fired, so the row comes back. */
  _firedAt(r) {
    if (r.entity && this._hass.states[r.entity]) {
      return Math.floor(new Date(this._hass.states[r.entity].last_changed).getTime() / 1000);
    }
    if (r.match) {
      let newest = 0;
      this._matching(r.match).forEach((id) => {
        if (!this._hass.states[id] || this._hass.states[id].state !== (r.state || "on")) return;
        const t = Math.floor(new Date(this._hass.states[id].last_changed).getTime() / 1000);
        if (t > newest) newest = t;
      });
      return newest;
    }
    return 0;
  }

  _matches(r) {
    const s = pcState(this._hass, r.entity);
    if (r.state !== undefined) return s === r.state;
    if (r.state_not !== undefined) return s !== r.state_not && s !== "";
    const n = pcNum(this._hass, r.entity);
    if (r.above !== undefined) return n != null && n > r.above;
    if (r.below !== undefined) return n != null && n < r.below;
    return false;
  }

  /* Every rule that currently matches, before dismissals are applied. */
  _raised() {
    const out = [];
    (this._config.rules || []).forEach((r, i) => {
      if (r.match) {
        const hits = this._matching(r.match)
          .filter((id) => this._hass.states[id] && this._hass.states[id].state === (r.state || "on"))
          .map((id) => (this._hass.states[id].attributes.friendly_name || id)
            .replace(r.strip || "", "").trim());
        if (hits.length) {
          out.push({
            key: this._key(r, i), rule: r,
            severity: r.severity || "info",
            title: hits.length + " " + (r.title || "items"),
            detail: hits.join(" · "),
            entity: null,
            firedAt: this._firedAt(r),
          });
        }
        return;
      }
      if (this._matches(r)) {
        out.push({
          key: this._key(r, i), rule: r,
          severity: r.severity || "warn",
          title: r.title || pcName(this._hass, r.entity),
          detail: r.detail || "",
          entity: r.entity,
          firedAt: this._firedAt(r),
        });
      }
    });
    return out;
  }

  _rows() {
    const dis = this._dismissals();
    const now = Math.floor(Date.now() / 1000);
    return this._raised().filter((row) => {
      const at = dis[row.key];
      if (!at) return true;
      /* Re-show once the condition changes again... */
      if (row.firedAt > at) return true;
      /* ...or once the snooze window lapses. */
      const hrs = this._config.dismiss_hours;
      if (hrs && now - at > hrs * 3600) return true;
      return false;
    });
  }

  _dismiss(row) {
    const map = this._dismissals();
    map[row.key] = Math.floor(Date.now() / 1000);
    this._writeDismissals(map);
    if (this._config.log_to) this._closeLog(row);
    this._last = null;
    this._render();
  }

  /* --- notification log ------------------------------------------------- */

  async _items() {
    if (!this._config.log_to) return [];
    const res = await this._hass.callWS({
      type: "todo/item/list",
      entity_id: this._config.log_to,
    });
    return (res && res.items) || [];
  }

  /* One open log entry per raised rule. The key lives in the description so
     the entry can be found again without depending on the wording. */
  async _syncLog(rows) {
    if (!this._config.log_to || !rows.length) return;
    const items = await this._items();
    for (const row of rows) {
      const tag = "[" + row.key + "]";
      const open = items.find(
        (it) => (it.description || "").indexOf(tag) >= 0 && it.status !== "completed"
      );
      if (open) continue;
      if (this._logged[row.key] === row.firedAt) continue;
      this._logged[row.key] = row.firedAt;
      this._hass.callService("todo", "add_item", {
        entity_id: this._config.log_to,
        item: row.title,
        description: tag + " " + row.severity + " · " + (row.detail || "") +
          " · raised " + new Date(row.firedAt * 1000).toISOString(),
      });
    }
  }

  async _closeLog(row) {
    const items = await this._items();
    const tag = "[" + row.key + "]";
    const open = items.find(
      (it) => (it.description || "").indexOf(tag) >= 0 && it.status !== "completed"
    );
    if (!open) return;
    this._hass.callService("todo", "update_item", {
      entity_id: this._config.log_to,
      item: open.uid,
      status: "completed",
    });
  }

  _render() {
    if (!this._hass || !this._config) return;
    const rows = this._rows();
    if (this._config.log_to) this._syncLog(this._raised());
    if (!rows.length) {
      this.shadowRoot.innerHTML = "";
      this.style.display = "none";
      return;
    }
    this.style.display = "block";
    const worst = rows.some((r) => r.severity === "critical") ? "critical" : "warn";
    const canDismiss = !!this._config.dismiss_store;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .card { border-left: 3px solid var(--edge); padding-left: 13px; }
        .hd { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: var(--edge); }
        .hd .lbl { color: var(--edge); }
        .hd .spacer { flex: 1; }
        .all {
          font-size: 11px; color: var(--pc-muted); cursor: pointer;
          background: var(--pc-chip); border: 0; border-radius: 999px;
          padding: 3px 9px; font-family: inherit;
        }
        .all:hover { color: var(--pc-text); }
        .r { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid var(--pc-line); }
        .r:first-of-type { border-top: none; }
        .r .t { font-size: 13.5px; font-weight: 600; }
        .r .d { font-size: 12px; color: var(--pc-muted); }
        .dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
        .dot.critical { background: var(--pc-bad); }
        .dot.warn { background: var(--pc-warn); }
        .dot.info { background: var(--pc-muted); }
        .x {
          flex: 0 0 auto; border: 0; background: var(--pc-chip); cursor: pointer;
          width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: var(--pc-muted); padding: 0;
        }
        .x:hover { color: var(--pc-text); background: var(--pc-panel-2); }
        .x ha-icon { --mdc-icon-size: 15px; }
        .x:focus-visible, .all:focus-visible { outline: 2px solid var(--pc-cool); outline-offset: 2px; }
      </style>
      <div class="card" style="--edge: ${worst === "critical" ? "var(--pc-bad)" : "var(--pc-warn)"}">
        <div class="hd">
          <ha-icon icon="mdi:alert-circle-outline" style="--mdc-icon-size:16px"></ha-icon>
          <span class="lbl">${this._config.title} · ${rows.length}</span>
          <span class="spacer"></span>
          ${canDismiss && rows.length > 1
            ? `<button class="all" type="button" id="all">Dismiss all</button>` : ""}
        </div>
        ${rows.map((r, i) => `
          <div class="r">
            <span class="dot ${r.severity}"></span>
            <div class="grow ${r.entity ? "tappable" : ""}" data-info="${r.entity || ""}">
              <div class="t">${r.title}</div>
              ${r.detail ? `<div class="d">${r.detail}</div>` : ""}
            </div>
            ${canDismiss
              ? `<button class="x" type="button" data-idx="${i}" aria-label="Dismiss ${r.title}">
                   <ha-icon icon="mdi:close"></ha-icon>
                 </button>`
              : `<ha-icon icon="mdi:chevron-right" style="--mdc-icon-size:16px;color:var(--pc-muted)"></ha-icon>`}
          </div>`).join("")}
      </div>
    `;

    this._rowData = rows;
    this.shadowRoot.querySelectorAll("[data-info]").forEach((el) => {
      if (!el.dataset.info) return;
      el.addEventListener("click", () => pcMoreInfo(this, el.dataset.info));
    });
    this.shadowRoot.querySelectorAll("[data-idx]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._dismiss(this._rowData[parseInt(el.dataset.idx, 10)]);
      });
    });
    const all = this.shadowRoot.getElementById("all");
    if (all) {
      all.addEventListener("click", () => {
        const map = this._dismissals();
        const now = Math.floor(Date.now() / 1000);
        this._rowData.forEach((r) => {
          map[r.key] = now;
          if (this._config.log_to) this._closeLog(r);
        });
        this._writeDismissals(map);
        this._last = null;
        this._render();
      });
    }
  }

  getCardSize() {
    return 3;
  }
}

/* --------------------------------------------------------- notifications --*/

/* Reads the todo list the attention card logs into, so dismissed items stay
   readable instead of vanishing. */
class PurdyNotificationsCard extends PcBaseCard {
  static getStubConfig(hass) {
    const t = Object.keys(hass.states).find((e) => e.startsWith("todo."));
    return { entity: t || "todo.notification_center", title: "Notifications" };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("purdy-notifications-card: 'entity' (a todo list) is required");
    }
    this._config = { title: "Notifications", max: 50, unread: [], ...config };
    this._watched = [config.entity].concat(
      (this._config.unread || []).map((u) => u.entity)
    );
    this._last = null;
    this._items = null;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._config) return;
    /* Refetch when the list changes; re-render alone when only a counter did. */
    const sig = this._watched.map((id) => pcState(hass, id)).join("|");
    if (!first && sig === this._last) return;
    const listChanged = first || pcState(hass, this._config.entity) !== this._listSig;
    this._last = sig;
    this._listSig = pcState(hass, this._config.entity);
    if (listChanged) this._fetch();
    else this._render();
  }

  /* Unread counters from an upstream system (Unraid, for instance). Zero
     counts are dropped so a quiet source shows nothing at all. */
  _unreadHtml() {
    const chips = (this._config.unread || [])
      .map((u) => ({ ...u, n: pcNum(this._hass, u.entity) }))
      .filter((u) => u.n != null && u.n > 0);
    if (!chips.length) return "";
    return `
      <div class="chips">
        ${chips.map((u) => `
          <span class="chip ${u.severity || "info"} tappable" data-info="${u.entity}">
            <span class="cdot"></span>${u.n} ${u.label || pcName(this._hass, u.entity)}
          </span>`).join("")}
      </div>`;
  }

  async _fetch() {
    const res = await this._hass.callWS({
      type: "todo/item/list",
      entity_id: this._config.entity,
    });
    this._items = (res && res.items) || [];
    this._render();
  }

  /* The attention card encodes "[key] severity · detail · raised <iso>". */
  _parse(it) {
    const d = it.description || "";
    const sev = /\b(critical|warn|info)\b/.exec(d);
    const iso = /raised (\S+)/.exec(d);
    let detail = d.replace(/^\[[^\]]*\]\s*/, "").replace(/\braised \S+\s*/, "");
    detail = detail.replace(/^(critical|warn|info)\s*·?\s*/, "").replace(/·\s*$/, "").trim();
    return {
      uid: it.uid,
      summary: it.summary,
      severity: sev ? sev[1] : "info",
      detail,
      at: iso ? new Date(iso[1]).getTime() : null,
      done: it.status === "completed",
    };
  }

  _rel(ms) {
    if (!ms) return "";
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  _render() {
    if (!this._hass || !this._config || !this._items) return;
    const parsed = this._items.map((it) => this._parse(it));
    parsed.sort((a, b) => (b.at || 0) - (a.at || 0));
    const active = parsed.filter((p) => !p.done).slice(0, this._config.max);
    const done = parsed.filter((p) => p.done).slice(0, this._config.max);

    const row = (p) => `
      <div class="n ${p.done ? "done" : ""}">
        <span class="dot ${p.severity}"></span>
        <div class="grow">
          <div class="t">${p.summary}</div>
          ${p.detail ? `<div class="d">${p.detail}</div>` : ""}
        </div>
        <span class="when num">${this._rel(p.at)}</span>
        ${p.done
          ? `<button class="act" type="button" data-restore="${p.uid}" aria-label="Restore">
               <ha-icon icon="mdi:restore"></ha-icon></button>`
          : `<button class="act" type="button" data-done="${p.uid}" aria-label="Dismiss">
               <ha-icon icon="mdi:close"></ha-icon></button>`}
      </div>`;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .hd { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .hd .spacer { flex: 1; }
        .sec { margin-top: 12px; }
        .sec:first-of-type { margin-top: 6px; }
        .n { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--pc-line); }
        .n:first-of-type { border-top: none; }
        .n .t { font-size: 13.5px; font-weight: 600; }
        .n .d { font-size: 12px; color: var(--pc-muted); }
        .n.done .t, .n.done .d { color: var(--pc-muted); }
        .n.done .t { font-weight: 500; text-decoration: line-through; text-decoration-color: var(--pc-line); }
        .when { font-size: 11px; color: var(--pc-muted); white-space: nowrap; }
        .dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
        .dot.critical { background: var(--pc-bad); }
        .dot.warn { background: var(--pc-warn); }
        .dot.info { background: var(--pc-muted); }
        .n.done .dot { opacity: 0.45; }
        .act {
          flex: 0 0 auto; border: 0; background: var(--pc-chip); cursor: pointer;
          width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: var(--pc-muted); padding: 0;
        }
        .act:hover { color: var(--pc-text); }
        .act ha-icon { --mdc-icon-size: 15px; }
        .act:focus-visible, .clear:focus-visible { outline: 2px solid var(--pc-cool); outline-offset: 2px; }
        .clear {
          font-size: 11px; color: var(--pc-muted); cursor: pointer;
          background: var(--pc-chip); border: 0; border-radius: 999px;
          padding: 3px 9px; font-family: inherit;
        }
        .empty { color: var(--pc-muted); font-size: 13px; padding: 10px 0 4px; }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 2px; }
        .chip .cdot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .chip.critical { background: rgba(239, 106, 106, 0.15); color: var(--pc-bad); }
        .chip.warn { background: rgba(242, 193, 78, 0.14); color: var(--pc-warn); }
      </style>
      <div class="card tint">
        <div class="hd">
          <ha-icon icon="mdi:bell-outline" style="--mdc-icon-size:18px;color:var(--pc-muted)"></ha-icon>
          <span class="lbl">${this._config.title}</span>
          <span class="spacer"></span>
          ${done.length ? `<button class="clear" type="button" id="clear">Clear history</button>` : ""}
        </div>
        ${this._unreadHtml()}

        ${active.length ? `
          <div class="sec">
            <span class="lbl">Active · ${active.length}</span>
            ${active.map(row).join("")}
          </div>` : `<div class="empty">Nothing active — the house is quiet.</div>`}

        ${done.length ? `
          <div class="sec">
            <span class="lbl">Dismissed · ${done.length}</span>
            ${done.map(row).join("")}
          </div>` : ""}
      </div>
    `;

    const call = (uid, status) =>
      this._hass.callService("todo", "update_item", {
        entity_id: this._config.entity, item: uid, status,
      });

    this.shadowRoot.querySelectorAll("[data-done]").forEach((el) => {
      el.addEventListener("click", () => { call(el.dataset.done, "completed"); this._fetch(); });
    });
    this.shadowRoot.querySelectorAll("[data-restore]").forEach((el) => {
      el.addEventListener("click", () => { call(el.dataset.restore, "needs_action"); this._fetch(); });
    });
    const clear = this.shadowRoot.getElementById("clear");
    if (clear) {
      clear.addEventListener("click", () => {
        this._hass.callService("todo", "remove_completed_items", {
          entity_id: this._config.entity,
        });
        setTimeout(() => this._fetch(), 400);
      });
    }
  }

  getCardSize() {
    return 5;
  }
}

/* ---------------------------------------------------------------- people --*/

class PurdyPeopleCard extends PcBaseCard {
  static getStubConfig(hass) {
    const people = Object.keys(hass.states).filter((e) => e.startsWith("person.")).slice(0, 2);
    return { people: (people.length ? people : ["person.someone"]).map((e) => ({ entity: e })) };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.people)) {
      throw new Error("purdy-people-card: 'people' (a list) is required");
    }
    this._config = config;
    const ids = [];
    config.people.forEach((p) => {
      [p.entity, p.battery, p.steps].forEach((x) => x && ids.push(x));
    });
    this._watched = ids;
    this._last = null;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const fmt = (n) => (n == null ? "—" : n.toLocaleString());

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .wrap { display: flex; gap: 9px; }
        .p { flex: 1; background: var(--pc-panel); border-radius: 20px; padding: 12px 13px; min-width: 0; }
        .who { display: flex; align-items: center; gap: 9px; min-width: 0; }
        .nm { font-weight: 650; font-size: 15px; letter-spacing: -0.01em; }
        .st { font-size: 11.5px; font-weight: 600; }
        .st.home { color: var(--pc-good); }
        .st.away { color: var(--pc-muted); }
        .foot { display: flex; gap: 6px; margin-top: 10px; }
        .mini {
          flex: 1; background: var(--pc-panel-2); border-radius: 10px; padding: 4px 7px;
          font-size: 11px; font-variant-numeric: tabular-nums; color: var(--pc-muted);
          display: flex; align-items: center; gap: 4px; justify-content: center;
        }
        .mini ha-icon { --mdc-icon-size: 14px; }
        .mini.low { color: var(--pc-warn); }
      </style>
      <div class="wrap">
        ${this._config.people.map((p) => {
          const state = pcState(this._hass, p.entity);
          const home = state === "home";
          const batt = pcNum(this._hass, p.battery);
          const steps = pcNum(this._hass, p.steps);
          const nm = pcName(this._hass, p.entity, p.name);
          const st = this._hass.states[p.entity];
          const pic = st && st.attributes.entity_picture;
          return `
            <div class="p tint tappable" data-entity="${p.entity}">
              <div class="who">
                <div class="avatar">${
                  pic ? `<img src="${pic}" alt="" />` : (nm || "?").charAt(0).toUpperCase()
                }</div>
                <div class="grow">
                  <div class="nm trunc">${nm}</div>
                  <div class="st ${home ? "home" : "away"}">${home ? "Home" : (state ? state.replace(/_/g, " ") : "Unknown")}</div>
                </div>
              </div>
              <div class="foot">
                ${p.battery ? `<span class="mini ${batt != null && batt < 20 ? "low" : ""}">
                  <ha-icon icon="mdi:battery-outline"></ha-icon>${batt == null ? "—" : Math.round(batt) + "%"}
                </span>` : ""}
                ${p.steps ? `<span class="mini">
                  <ha-icon icon="mdi:walk"></ha-icon>${fmt(steps == null ? null : Math.round(steps))}
                </span>` : ""}
              </div>
            </div>`;
        }).join("")}
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => {
      el.addEventListener("click", () => pcMoreInfo(this, el.dataset.entity));
    });
  }
}

/* ----------------------------------------------------------------- rooms --*/

class PurdyRoomsCard extends PcBaseCard {
  static getStubConfig(hass) {
    const t = Object.keys(hass.states)
      .filter((e) => hass.states[e].attributes.device_class === "temperature")
      .slice(0, 3);
    return { rooms: (t.length ? t : ["sensor.temperature"]).map((e) => ({ temp: e })) };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.rooms)) {
      throw new Error("purdy-rooms-card: 'rooms' (a list) is required");
    }
    this._config = config;
    const ids = [];
    config.rooms.forEach((r) => {
      [r.temp, r.humidity].forEach((x) => x && ids.push(x));
    });
    this._watched = ids;
    this._last = null;
  }

  _render() {
    if (!this._hass || !this._config) return;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .strip::-webkit-scrollbar { display: none; }
        .rm {
          flex: 0 0 auto; min-width: 86px;
          background: var(--pc-panel); border-radius: 18px; padding: 11px 12px;
        }
        .rm.accent { background: rgba(77, 208, 225, 0.10); }
        .rm .nm { font-size: 10.5px; color: var(--pc-muted); text-transform: uppercase; letter-spacing: 0.08em; }
        .rm b { display: block; font-size: 19px; font-weight: 650; font-variant-numeric: tabular-nums; margin-top: 4px; letter-spacing: -0.02em; }
        .rm .hum { font-size: 10.5px; color: var(--pc-muted); font-variant-numeric: tabular-nums; }
      </style>
      <div class="strip">
        ${this._config.rooms.map((r) => {
          const t = pcNum(this._hass, r.temp);
          const h = pcNum(this._hass, r.humidity);
          return `
            <div class="rm ${r.accent ? "accent" : ""} tappable" data-entity="${r.temp}">
              <span class="nm">${r.name || pcName(this._hass, r.temp)}</span>
              <b>${t == null ? "—" : t.toFixed(1) + "°"}</b>
              <span class="hum">${h == null ? "" : h.toFixed(1) + "%"}</span>
            </div>`;
        }).join("")}
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => {
      el.addEventListener("click", () => pcMoreInfo(this, el.dataset.entity));
    });
  }
}

/* ----------------------------------------------------------------- quick --*/

class PurdyQuickCard extends PcBaseCard {
  static getStubConfig(hass) {
    const l = Object.keys(hass.states).filter((e) => e.startsWith("light.")).slice(0, 3);
    return { columns: 3, tiles: (l.length ? l : ["light.example"]).map((e) => ({ entity: e })) };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.tiles)) {
      throw new Error("purdy-quick-card: 'tiles' (a list) is required");
    }
    this._config = { columns: 3, ...config };
    this._watched = config.tiles
      .reduce((acc, t) => acc.concat([t.entity, t.value_entity, t.bar_entity]), [])
      .filter(Boolean);
    this._last = null;
  }

  /* on → accent, alert → red, otherwise neutral. */
  _tone(t) {
    const s = pcState(this._hass, t.entity);
    if (t.alert_when && t.alert_when.indexOf(s) >= 0) return "alert";
    if (t.on_when) return t.on_when.indexOf(s) >= 0 ? "on" : "";
    return s === "on" || s === "playing" || s === "cleaning" ? "on" : "";
  }

  _render() {
    if (!this._hass || !this._config) return;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .grid { display: grid; grid-template-columns: repeat(${this._config.columns}, 1fr); gap: 9px; }
        .t {
          background: var(--pc-panel); border-radius: 20px; padding: 12px 11px;
          display: flex; flex-direction: column; gap: 7px; min-height: 84px;
        }
        .t ha-icon { --mdc-icon-size: 26px; color: var(--pc-muted); }
        .t .tl { font-size: 12px; font-weight: 600; letter-spacing: -0.01em; }
        .t .tv { font-size: 11px; color: var(--pc-muted); font-variant-numeric: tabular-nums; }
        .t.on { background: rgba(242, 193, 78, 0.13); }
        .t.on ha-icon, .t.on .tl { color: var(--pc-warn); }
        .t.alert { background: rgba(239, 106, 106, 0.13); }
        .t.alert ha-icon, .t.alert .tl { color: var(--pc-bad); }
        .t.hasbar { position: relative; overflow: hidden; padding-bottom: 15px; }
        .fill { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: var(--pc-track); }
        .fill i { display: block; height: 100%; transition: width 0.3s ease; }
        @media (prefers-reduced-motion: reduce) { .fill i { transition: none; } }
      </style>
      <div class="grid">
        ${this._config.tiles.map((t, i) => {
          const st = this._hass.states[t.entity];
          /* The second line can come from a different entity — a tile for the
             vacuum that reads out its waste drawer, for instance. */
          const vs = this._hass.states[t.value_entity || t.entity];
          const raw = vs ? vs.state : "";
          const unit = vs && vs.attributes.unit_of_measurement ? " " + vs.attributes.unit_of_measurement : "";
          const value = t.value_text || (raw ? raw.replace(/_/g, " ") + unit : "—");
          /* An optional fill bar. Colour tracks the level, not the tile tone —
             a nearly-full waste tank should read amber even when the machine
             itself is idle and healthy. */
          let bar = "";
          if (t.bar_entity) {
            const pct = pcNum(this._hass, t.bar_entity);
            if (pct != null) {
              const max = t.bar_max || 100;
              const p = Math.max(0, Math.min(100, (pct / max) * 100));
              const warn = t.bar_warn_above == null ? 80 : t.bar_warn_above;
              const crit = t.bar_critical_above == null ? 95 : t.bar_critical_above;
              const col = p >= crit ? "var(--pc-bad)" : p >= warn ? "var(--pc-warn)" : "var(--pc-cool)";
              bar = `<div class="fill"><i style="width:${p.toFixed(0)}%;background:${col}"></i></div>`;
            }
          }
          return `
            <div class="t ${this._tone(t)} ${bar ? "hasbar" : ""} tappable" data-idx="${i}">
              <ha-icon icon="${t.icon || (st && st.attributes.icon) || "mdi:circle-outline"}"></ha-icon>
              <div>
                <div class="tl trunc">${pcName(this._hass, t.entity, t.name)}</div>
                <div class="tv trunc">${value}</div>
              </div>
              ${bar}
            </div>`;
        }).join("")}
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-idx]").forEach((el) => {
      el.addEventListener("click", () => {
        const t = this._config.tiles[parseInt(el.dataset.idx, 10)];
        if (t) pcAction(this, this._hass, t.tap_action, t.entity);
      });
    });
  }

  getCardSize() {
    return 3;
  }
}


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
        `history/period/${start}?filter_entity_id=${ids.join(",")}&minimal_response&no_attributes`
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
              <div class="fn">${f.label || pcName(this._hass, f.entity)}</div>
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
        `history/period/${start}?filter_entity_id=${ids.join(",")}`
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
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
pcDefine("climate-panel-card", ClimatePanelCard);
pcDefine("sleep-panel-card", SleepPanelCard);
pcDefine("purdy-header-card", PurdyHeaderCard);
pcDefine("purdy-attention-card", PurdyAttentionCard);
pcDefine("purdy-people-card", PurdyPeopleCard);
pcDefine("purdy-rooms-card", PurdyRoomsCard);
pcDefine("purdy-quick-card", PurdyQuickCard);
pcDefine("purdy-notifications-card", PurdyNotificationsCard);
pcDefine("purdy-remote-card", PurdyRemoteCard);
pcDefine("purdy-devices-card", PurdyDevicesCard);
pcDefine("purdy-music-card", PurdyMusicCard);

window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: "climate-panel-card",
    name: "Climate Panel Card",
    description: "Cohesive climate panel: weather, temp ring with hold steppers, trend graph, zones, status chips, and room rows. Set compact: true for the home-screen summary.",
    preview: false,
    documentationURL: "https://github.com/mbwp1234/purdy-cards",
  },
  {
    type: "sleep-panel-card",
    name: "Sleep Panel Card",
    description: "Cohesive infant sleep panel: composition ring with 7-day goal, vitals with baseline deltas, hypnogram, and recap rows. Set ribbon: true for the home-screen summary.",
    preview: false,
    documentationURL: "https://github.com/mbwp1234/purdy-cards",
  },
  { type: "purdy-header-card", name: "Purdy Header Card", description: "Greeting, date, weather and occupancy.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-attention-card", name: "Purdy Attention Card", description: "Rule-driven fault list. Renders nothing when the house is clean.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-people-card", name: "Purdy People Card", description: "Presence with battery and step counts, side by side.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-rooms-card", name: "Purdy Rooms Card", description: "Scrolling strip of room temperatures and humidity.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-quick-card", name: "Purdy Quick Card", description: "Grid of state-coloured action tiles.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-notifications-card", name: "Purdy Notifications Card", description: "Notification centre backed by a todo list; keeps dismissed items readable.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-remote-card", name: "Purdy Remote Card", description: "Android TV remote with a device selector, brand app grid and circular d-pad.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-devices-card", name: "Purdy Devices Card", description: "Collapsible device groups with summary lines; faults stay visible while collapsed.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-music-card", name: "Purdy Music Card", description: "Music Assistant now-playing with transport, room switching and playlist presets. Set compact: true for the self-hiding home-screen headline.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" }
);

console.info(
  `%c PURDY-CARDS %c v${PC_VERSION} %c climate v${CPC_VERSION} · sleep v${SPC_VERSION} `,
  "background:#4dd0e1;color:#0f1317;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px;",
  "background:#232d38;color:#e6ecf2;padding:2px 6px;",
  "background:#151b22;color:#8b96a3;border-radius:0 4px 4px 0;padding:2px 6px;"
);
