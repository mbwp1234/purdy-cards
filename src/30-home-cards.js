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
  /* Opt-in translucent surface, so a card dropped into the shell view's
     gradient reads as part of it instead of a solid slab on top of it. */
  .card.glass {
    background: linear-gradient(180deg, rgba(255,255,255,0.062), rgba(255,255,255,0.026));
    background-image: linear-gradient(180deg, rgba(255,255,255,0.062), rgba(255,255,255,0.026));
    border: 1px solid rgba(255,255,255,0.085);
    border-radius: 26px;
    box-shadow: 0 24px 60px -18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.075);
    backdrop-filter: blur(26px) saturate(1.25);
    -webkit-backdrop-filter: blur(26px) saturate(1.25);
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
      <div class="card tint${this._config.glass ? " glass" : ""}">
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


