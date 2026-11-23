/* ============================================================================
 * purdy-sky-card — "Skylight", the phone as tabs, light first
 *
 * A SUBCLASS of the shell, for the reason purdy-desk2-card is one: everything
 * the shell knows about the house — the sleep derivation and its corrections,
 * the fault rules and the notification log, GTTC's schedule and plans, the
 * music targeting, the light gestures, the crew panel, the server pages and
 * every sheet — is inherited by construction. This file writes LAYOUT ONLY.
 *
 * What changes is how you move around:
 *
 *   - Five tabs on a floating dock: Home · Joel · Climate · Media · House.
 *     Joel and Climate are the phone's own sections drawn OPEN as a page, so
 *     nothing either of them can do is missing; Home draws them collapsed.
 *   - Home opens on a sky keyed to the hour with the measured outside reading,
 *     and as it scrolls the sky folds into the top bar and every card you pass
 *     leaves a pill behind in the bar, so the summary never leaves the screen.
 *   - Light and dark are both designed. `theme: auto` (the default) follows
 *     Home Assistant's own dark mode.
 *
 * The config is the phone's config, unchanged — the same `sections:`, `sheets:`,
 * `server:`, `people:` and the rest — plus an optional `sky:` block:
 *
 *   theme: auto | light | dark
 *   sky: { media_face: watch | listen }   # which Media face opens by default
 *
 * `dock:` is ignored: the tabs are the dock. Every destination the phone dock
 * had is still reachable — Lights and Jeeves are on House, PurdyNAS opens from
 * House and from its Home tile, Alerts is the bell — because replacing a
 * surface orphans whatever was only reachable through it.
 *
 * SCROLLING belongs to Home Assistant, not to this card: the view scrolls, so
 * the effects listen to the window in the CAPTURE phase (which hears a scroll
 * from any element) and measure with getBoundingClientRect. They write styles
 * straight onto surviving nodes and never call _render — the patching-renderer
 * rule, which a drag cut off mid-gesture has taught this card five times.
 * ========================================================================== */

const SK_TABS = [
  { key: "home", name: "Home", icon: "mdi:home-variant-outline" },
  { key: "joel", name: "Joel", icon: "mdi:weather-night", type: "nursery" },
  { key: "climate", name: "Climate", icon: "mdi:thermostat", type: "climate" },
  { key: "media", name: "Media", icon: "mdi:play-box-outline" },
  { key: "house", name: "House", icon: "mdi:view-grid-outline" },
];

/* Which tab a section belongs to — a collapsed section on Home opens its tab
   rather than expanding in place. */
const SK_TAB_OF = { nursery: "joel", climate: "climate", nowplaying: "media", music: "media", tv: "media", lights: "house", crew: "house" };

/* Kelvin to an RGB triplet, for a lit tile's glow. The glow's HUE is the
   colour temperature the fixture reports, the same rule the light rows follow. */
function skKelvin(k) {
  const t = [[2000, [255, 160, 70]], [2700, [255, 188, 110]], [3000, [255, 204, 140]], [4000, [255, 226, 190]], [6500, [226, 238, 255]]];
  const v = Number(k) || 2700;
  let a = t[0], b = t[t.length - 1];
  for (let i = 0; i < t.length - 1; i++) if (v >= t[i][0] && v <= t[i + 1][0]) { a = t[i]; b = t[i + 1]; }
  const f = Math.max(0, Math.min(1, (v - a[0]) / ((b[0] - a[0]) || 1)));
  return a[1].map((x, i) => Math.round(x + (b[1][i] - x) * f)).join(",");
}

const skClamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

class PurdySkyCard extends PurdyShellCard {
  static getStubConfig() {
    return { weather: "weather.home", sections: [] };
  }

  constructor() {
    super();
    this._skTab = "home";
    this._skFace = null;       // Media: watch | listen, null = the config default
    this._skCtx = null;        // "home" | "page" while a section renders for us
    this._skScroll = {};       // scroll offset per tab
    this._skLastY = 0;
    this._skTick = false;
    this._skRemoteEl = null;
    /* One handler, kept on the card so disconnect removes exactly what it added. */
    this._skOnScroll = () => {
      if (this._skTick) return;
      this._skTick = true;
      const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16);
      raf(() => { this._skTick = false; this._skFrame(); });
    };
  }

  setConfig(config) {
    super.setConfig({ ...(config || {}), sections: Array.isArray((config || {}).sections) ? config.sections : [] });
    const t = (config || {}).theme;
    this._skThemeCfg = t === "light" || t === "dark" ? t : "auto";
  }

  connectedCallback() {
    super.connectedCallback();
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("scroll", this._skOnScroll, { capture: true, passive: true });
      window.addEventListener("resize", this._skOnScroll);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (typeof window !== "undefined" && window.removeEventListener) {
      window.removeEventListener("scroll", this._skOnScroll, { capture: true });
      window.removeEventListener("resize", this._skOnScroll);
    }
    this._skSc = null;
  }

  /* The skeleton. `ps-ground`, `ps-sheetslot`, `ps-stat`, `ps-dockwrap` and
     `ps-col` keep the shell's ids so _paintSky, _patchSheet, _mountSheetCard
     and _renderSystems work untouched; the last three live in the server view. */
  _mount() {
    this.shadowRoot.innerHTML = `
      <style>${PurdySkyCard.styles}</style>
      <div class="ps-ground" id="ps-ground"></div>
      <div class="sk" id="sk">
        <header class="sk-bar" id="sk-bar">
          <div class="sk-barbg"></div>
          <div class="sk-barrow"><div class="sk-bart" id="sk-bart"></div><div class="sk-barr" id="sk-barr"></div></div>
          <div class="sk-pills" id="sk-pills"></div>
        </header>
        <section class="sk-view" data-v="home"><div class="sk-hero" id="sk-hero"></div><div class="sk-stack sk-homecards" id="sk-home"></div></section>
        <section class="sk-view" data-v="joel"><div class="sk-stack" id="sk-joel"></div></section>
        <section class="sk-view" data-v="climate"><div class="sk-stack" id="sk-climate"></div></section>
        <section class="sk-view" data-v="media"><div class="sk-stack" id="sk-media"></div></section>
        <section class="sk-view" data-v="house"><div class="sk-stack" id="sk-house"></div></section>
        <section class="sk-view sk-sys" data-v="sys">
          <button class="sk-back" type="button" data-skback="1"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M15 5l-7 7 7 7"/></svg>House</button>
          <div class="ps-stat" id="ps-stat"></div>
          <div class="ps-dockwrap" id="ps-dockwrap"></div>
          <div class="ps-col" id="ps-col"></div>
        </section>
        <footer class="sk-foot" id="sk-foot"><div class="sk-mini" id="sk-mini"></div><nav class="sk-dock" id="sk-dock" aria-label="Tabs"></nav></footer>
      </div>
      <div id="ps-sheetslot"></div>`;
    this._mounted = true;
  }

  /* ------------------------------------------------------------ plumbing --- */

  /* Literal white-alpha fills are the dark ground's vocabulary; on paper they
     are invisible. Every string this card patches routes them through
     --sk-fg, which is white in dark and ink in light — the stylesheet gets the
     same rewrite once, at definition. */
  _skInk(html) {
    return typeof html === "string" ? html.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/g, "rgba(var(--sk-fg),") : html;
  }
  _patch(id, html) { super._patch(id, this._skInk(html)); }
  _patchSections(list) { super._patchSections((list || []).map((s) => ({ ...s, html: this._skInk(s.html) }))); }

  /* The sheets must clear the dock and the mini bar, which live in the foot. */
  _reserve() {
    const foot = this.shadowRoot && this.shadowRoot.getElementById("sk-foot");
    if (!foot || typeof foot.offsetHeight !== "number") return;
    const h = foot.offsetHeight;
    if (!h || h === this._dockH) return;
    this._dockH = h;
    if (this.style && typeof this.style.setProperty === "function") this.style.setProperty("--ps-dockh", (h - 8) + "px");
  }

  /* A row that means "what is playing" opens the Media TAB on the right face
     rather than the media sheet — same rows, same mini bar, one destination. */
  _playTarget(face) {
    return `data-sktab="media" data-face="${face === "watch" ? "watch" : "listen"}"`;
  }

  /* Music's queue is only read while the music sheet is open. The Listen face
     IS that sheet here, so it answers as one while it is on screen. */
  _syncQueue() {
    if (!this._sheet && !this._mode && this._skTab === "media" && this._skFaceNow() === "listen") {
      this._sheet = "music";
      try { super._syncQueue(); } finally { this._sheet = null; }
      return;
    }
    super._syncQueue();
  }

  /* Section headers. On Home a collapsed section's header is the door to its
     tab; on a page the tab title already names it, so only the chip stays. */
  _head(sec, chipHtml, opts) {
    if (this._skCtx === "page") {
      return chipHtml ? `<div class="ps-sh sk-psh"><span class="ps-nm"></span>${chipHtml}</div>` : "";
    }
    if (this._skCtx === "home") {
      const tab = SK_TAB_OF[sec.type];
      if (tab) {
        return `<button class="ps-sh" type="button" data-sktab="${tab}">
          <span class="ps-nm">${psEsc(sec.title || sec.name || "")}</span>${chipHtml || ""}${this._door()}</button>`;
      }
    }
    return super._head(sec, chipHtml, opts);
  }

  _skSec(type) {
    const raw = (this._config.sections || []).find((s) => s && s.type === type && this._visible(s));
    return raw ? { key: raw.key || type, ...raw } : null;
  }

  _skDark() {
    if (this._skThemeCfg === "dark") return true;
    if (this._skThemeCfg === "light") return false;
    const t = this._hass && this._hass.themes;
    if (t && typeof t.darkMode === "boolean") return t.darkMode;
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  }

  _skFaceNow() {
    if (this._skFace) return this._skFace;
    const want = (this._config.sky || {}).media_face;
    return want === "listen" ? "listen" : "watch";
  }

  /* The element the page actually scrolls in. HA's view, normally the
     document; found once by walking up through shadow roots. */
  _skScroller() {
    if (this._skSc && this._skSc.isConnected) return this._skSc;
    let n = this;
    for (let i = 0; i < 40 && n; i++) {
      const p = n.assignedSlot || n.parentElement || (n.parentNode && n.parentNode.host) || null;
      if (!p) break;
      n = p;
      if (typeof getComputedStyle !== "function") break;
      const oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 2) { this._skSc = n; return n; }
    }
    this._skSc = (typeof document !== "undefined" && (document.scrollingElement || document.documentElement)) || null;
    return this._skSc;
  }

  _skView() { return this._mode === "systems" ? "sys" : this._skTab; }

  _skGo(tab, opts) {
    const o = opts || {};
    const sc = this._skScroller();
    const was = this._skView();
    if (sc) this._skScroll[was] = sc.scrollTop;
    const same = !o.mode && !this._mode && tab === this._skTab && !o.to && !o.face;
    this._sheet = null;
    this._mediaPick = null;
    this._napEdit = null;
    if (o.mode) {
      this._mode = o.mode;
      this._expandWatched();
    } else {
      this._mode = null;
      this._skTab = tab;
    }
    if (o.face) this._skFace = o.face;
    this._render();
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 0);
    raf(() => {
      if (!sc) return;
      const now = this._skView();
      if (o.to) {
        const el = this.shadowRoot.getElementById(o.to);
        const bar = this.shadowRoot.getElementById("sk-bar");
        if (el && el.getBoundingClientRect) {
          const off = el.getBoundingClientRect().top - (bar ? bar.getBoundingClientRect().height : 60) - 8;
          sc.scrollTop += off;
        }
      } else if (same) {
        if (sc.scrollTo) sc.scrollTo({ top: 0, behavior: "smooth" }); else sc.scrollTop = 0;
      } else {
        sc.scrollTop = this._skScroll[now] || 0;
      }
      this._skFrame();
    });
  }

  /* ---------------------------------------------------------------- render --- */

  _render() {
    const pre = this._renderPre();
    if (!pre) return;
    const { now, faults } = pre;
    if (this._mode === "health") this._mode = null;
    const dark = this._skDark();
    if (this.getAttribute && this.getAttribute("data-sk-theme") !== (dark ? "dark" : "light")) {
      this.setAttribute("data-sk-theme", dark ? "dark" : "light");
    }
    const view = this._skView();
    const root = this.shadowRoot;
    root.querySelectorAll(".sk-view").forEach((v) => {
      const on = v.dataset.v === view;
      if (v.classList.contains("on") !== on) v.classList.toggle("on", on);
    });
    const skRoot = root.getElementById("sk");
    if (skRoot && skRoot.dataset.view !== view) skRoot.dataset.view = view;

    this._patch("sk-bart", this._skBarTitle(view, now));
    this._patch("sk-barr", this._skBell(faults));
    this._patch("sk-dock", this._skDock(view));
    this._patch("sk-mini", view === "media" ? "" : this._miniHtml());

    if (view === "sys") {
      /* The server pages are the shell's own, written into the same slots. */
      this._renderSystems(faults);
      this._patch("sk-pills", "");
      this._skBind();
      this._skFrame();
      return;
    }

    if (view === "home") {
      this._patch("sk-hero", this._skHero(now, faults));
      const home = this._skHome(faults);
      this._patch("sk-home", home.html);
      this._patch("sk-pills", home.pills);
    } else {
      this._patch("sk-pills", "");
      const html = { joel: () => this._skJoel(), climate: () => this._skClimate(), media: () => this._skMedia(), house: () => this._skHouse() }[view]();
      this._patch("sk-" + view, html);
    }

    this._patchSheet(this._sheetHtml(faults));
    this._mountSheetCard();
    if (view === "media") this._skMountRemote();

    this._bind();
    this._bindScrub();
    this._bindLights();
    this._bindCrew();
    this._bindNapEdit();
    this._bindNapOpen();
    this._bindPeople();
    this._bindNurseryLog();
    this._bindSystems();
    this._skBind();
    this._reserve();
    this._syncQueue();
    this._skFrame();
  }

  /* With nothing raised the bell opens the log — what WAS raised — and counts
     the log's open warnings, the desk's rule: a badge never zero is a badge
     nobody reads, so info rows do not count. */
  _skBell(faults) {
    const n = faults.length;
    const logN = n ? 0 : this._logOpenCount();
    const cls = n ? (faults[0].severity === "critical" ? "bad" : "warn") : logN ? "log" : "";
    return `<button class="sk-bell ${cls}" type="button" data-skbell="1" aria-label="${n ? `${n} need attention` : logN ? `${logN} unread` : "Notifications"}">
        <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>
        ${n || logN ? `<i>${n || logN}</i>` : ""}</button>`;
  }

  _skBarTitle(view, now) {
    const c = this._config;
    if (view === "home") {
      const t = c.weather_temp != null ? pcNum(this._hass, c.weather_temp) : null;
      const st = pcState(this._hass, c.weather);
      return `<span class="sk-bnum">${t == null ? "" : `${Math.round(t)}°`}</span><small>${psEsc(pcWxText(st) || "")} · ${
        now.toLocaleDateString([], { weekday: "short" })}</small>`;
    }
    if (view === "sys") {
      const s = this._sysCfg();
      return `<span>${psEsc((s && s.name) || "Server")}</span><small>${psEsc((this._sysPage() || {}).name || "")}</small>`;
    }
    return `<span>${psEsc(this._skTabName(view))}</span>`;
  }

  _skTabName(key) {
    if (key === "joel") { const s = this._skSec("nursery"); return (s && (s.name || s.title)) || "Joel"; }
    const t = SK_TABS.find((x) => x.key === key);
    return t ? t.name : key;
  }

  _skDock(view) {
    const cur = view === "sys" ? "house" : view;
    const tabs = SK_TABS.filter((t) => !t.type || this._skSec(t.type));
    const i = Math.max(0, tabs.findIndex((t) => t.key === cur));
    return `<span class="sk-lens" style="--n:${tabs.length};--i:${i}"></span>` + tabs.map((t) => `
      <button class="sk-db ${t.key === cur ? "on" : ""}" type="button" data-sktab="${t.key}"${t.key === cur ? ` aria-current="page"` : ""}>
        <ha-icon icon="${t.icon}"></ha-icon><span>${psEsc(t.key === "joel" ? this._skTabName("joel") : t.name)}</span></button>`).join("");
  }

  _skTitle(name, extra) {
    return `<div class="sk-ttl"><h1>${psEsc(name)}</h1>${extra || ""}</div>`;
  }

  /* ------------------------------------------------------------------ home --- */

  /* The sky. Same four bands as the shell's ground, off the same clock, so the
     greeting and the colour cannot disagree about whether it is evening. */
  _skHero(now, faults) {
    const c = this._config;
    const h = this._hass;
    const band = this._skyBand(now.getHours()).replace("sky-", "");
    const t = c.weather_temp != null ? pcNum(h, c.weather_temp) : null;
    const st = pcState(h, c.weather);
    const wx = this._weatherSection();
    const feels = wx && wx.feels_from && h.states[wx.feels_from] ? h.states[wx.feels_from].attributes.apparent_temperature : null;
    const r = this._wxTodayRange();
    const live = t;
    let today = "";
    if (r.lo != null || r.hi != null) {
      const lo = r.lo == null ? r.hi : r.lo, hi = r.hi == null ? r.lo : r.hi;
      const vals = [lo, hi].concat(live == null ? [] : [live]);
      const dLo = Math.min(...vals) - 1, dHi = Math.max(...vals) + 1, span = Math.max(1, dHi - dLo);
      const pct = (v) => ((v - dLo) / span) * 100;
      today = `<div class="sk-today" role="img" aria-label="Today ${r.lo == null ? "" : Math.round(r.lo) + "° to "}${r.hi == null ? "" : Math.round(r.hi) + "°"}">
          <b class="lo">${r.lo == null ? "—" : Math.round(r.lo) + "°"}</b>
          <span class="sk-cap"><span class="sk-capfill" style="left:${pct(lo).toFixed(1)}%;width:${Math.max(3, pct(hi) - pct(lo)).toFixed(1)}%"></span>${
            live == null ? "" : `<i style="left:${pct(live).toFixed(1)}%"></i>`}</span>
          <b class="hi">${r.hi == null ? "—" : Math.round(r.hi) + "°"}</b></div>`;
    }
    const who = this._who();
    const chips = this._skFaultChips(faults) + this._skWetChip();
    return `
      <div class="sk-sky sky-${band}"><div class="sk-stars"></div>${this._skSunArc(now)}</div>
      <div class="sk-heroin" id="sk-heroin">
        <div class="sk-htop"><div class="sk-ppl">${this._hdrPeople()}</div></div>
        <div class="sk-greet" id="sk-greet"><div class="sk-hi">${this._greeting()}${who ? `, ${psEsc(who)}` : ""}</div>
          <div class="sk-date">${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div></div>
        <button class="sk-temp" type="button" id="sk-temp" data-sheet="wx" aria-label="Weather: ${t == null ? "no reading" : Math.round(t) + " degrees"}">
          <span class="sk-tn">${t == null ? `<span class="ps-nodata">—</span>` : `${Math.round(t)}<sup>°</sup>`}</span>
          <span class="sk-tc"><ha-icon icon="${pcWxIcon(st)}"></ha-icon><span>${psEsc(pcWxText(st) || "")}</span>${
            feels == null ? "" : `<span class="sk-feels">feels ${Math.round(feels)}°</span>`}</span>
        </button>
        ${today}
        ${chips ? `<div class="sk-hchips">${chips}</div>` : ""}
      </div>`;
  }

  /* Where the sun is between rise and set. sun.sun only publishes the NEXT
     rise and set, so once the sun is up today's rise is tomorrow's less a day. */
  _skSunArc(now) {
    const s = this._hass.states["sun.sun"];
    if (!s) return "";
    const nr = Date.parse(s.attributes.next_rising), ns = Date.parse(s.attributes.next_setting);
    if (!Number.isFinite(nr) || !Number.isFinite(ns)) return "";
    const t = now.getTime();
    let rise = nr, set = ns;
    if (nr > ns) rise = nr - 864e5;          // the sun is up: next rise is tomorrow's
    else if (t > ns) { rise = nr - 864e5; set = ns - 864e5; }
    const f = (t - rise) / (set - rise);
    const W = 400, H = 120, L = 20, R = W - 20, base = 104, top = 22;
    const pt = (q) => [L + q * (R - L), base - Math.sin(Math.PI * skClamp(q)) * (base - top)];
    let d = "";
    for (let i = 0; i <= 40; i++) { const [x, y] = pt(i / 40); d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }
    const clk = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");
    /* The path stretches with the hero; the sun, the moon and the times are
       HTML on top of it, so they stay round and upright at any width. */
    let body = "";
    if (f >= 0 && f <= 1) {
      const [x, y] = pt(f);
      body = `<span class="sk-sun" style="left:${(x / W * 100).toFixed(2)}%;top:${(y / H * 100).toFixed(2)}%"></span>`;
    } else {
      body = `<span class="sk-moon" style="left:88%;top:30%"></span>`;
    }
    return `<div class="sk-arc" aria-hidden="true">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${base}" y2="${base}" class="sk-hz"/><path d="${d}" class="sk-path"/></svg>
        ${body}<span class="sk-st l">${clk(rise)}</span><span class="sk-st r">${clk(set)}</span></div>`;
  }

  /* Named, worst first, three at most — the desk's rule. With nothing raised
     there is no chip: an empty row is the all-clear. */
  _skFaultChips(faults) {
    if (!faults.length || pcOffline(this._hass)) return pcOffline(this._hass) ? `<span class="ps-chip bad"><span class="ps-dot"></span>Reconnecting…</span>` : "";
    const cls = (f) => (f.severity === "critical" ? "bad" : f.severity === "warn" ? "warn" : "");
    return faults.slice(0, 2).map((f) => `<button class="ps-chip ${cls(f)}" type="button" data-sheet="alerts"><span class="ps-dot"></span>${
      psEsc(f.short || f.title)}</button>`).join("")
      + (faults.length > 2 ? `<button class="ps-chip" type="button" data-sheet="alerts">+${faults.length - 2}</button>` : "");
  }

  /* The first wet day and how likely — a roll-up, so it is allowed a chip. */
  _skWetChip() {
    const wet = (this._wxFc || []).find((d) => d.pop != null && d.pop >= 50);
    if (!wet) return "";
    const when = wet.today ? (new Date(this._nowMs()).getHours() >= 17 ? "tonight" : "today") : this._wxDow(wet.ts, false);
    return `<button class="ps-chip cool" type="button" data-sheet="wx"><span class="ps-dot"></span>${psEsc(pcWxText(wet.condition) || "Rain")} ${psEsc(when)} · ${Math.round(wet.pop)}%</button>`;
  }

  _skCard(key, body, pill, extra) {
    if (!body) return "";
    return `<div class="sk-card ${extra || ""}" id="sk-c-${key}" data-skc="${key}"${pill ? ` data-pill="${psEsc(pill)}"` : ""}>${body}</div>`;
  }

  _skHome(faults) {
    const out = [];
    const pills = [];
    const push = (key, body, pill, extra) => {
      if (!body) return;
      out.push(this._skCard(key, body, pill ? `${pill.icon}|${pill.text}|${pill.tab || ""}|${pill.color || ""}` : "", extra));
      if (pill) pills.push({ key, ...pill });
    };
    this._skCtx = "home";
    try {
      const np = this._skSec("nowplaying");
      if (np) {
        const body = this._secNowplaying(np);
        const live = this._nowPlaying && this._nowPlaying();
        push("now", body ? `<div class="ps-sect">${body}</div>` : "",
          { icon: "mdi:music-note", text: live ? (live.st.attributes.media_title || "Playing") : "Playing", tab: "media", color: "var(--sk-media)" });
      }
      const jsec = this._skSec("nursery");
      if (jsec) {
        let m = null;
        try { m = this._nurseryModel(jsec); } catch (e) { m = null; }
        const night = m && !m.nightNoData ? psHM(m.nightMins).replace(" ", "") : (m && m.chipTxt) || "Joel";
        push("joel", `<div class="ps-sect">${this._secNursery(jsec)}</div>`,
          { icon: "mdi:weather-night", text: night, tab: "joel", color: "var(--ps-deep)" });
      }
      const csec = this._skSec("climate");
      if (csec) {
        /* The same reading the section's ring shows, from the same entity. */
        const th = this._hass.states[csec.goal] || this._hass.states[csec.thermostat];
        const cur = th ? th.attributes.current_temperature : null;
        push("clim", `<div class="ps-sect">${this._secClimate(csec)}</div>`,
          { icon: "mdi:thermostat", text: cur == null ? "Climate" : `${Number(cur).toFixed(1)}°`, tab: "climate", color: "var(--ps-heat)" });
      }
      const wsec = this._weatherSection();
      if (wsec) {
        const wet = (this._wxFc || []).find((d) => !d.today && d.pop != null && d.pop >= 50);
        push("week", `<button class="ps-sh" type="button" data-sheet="wx"><span class="ps-nm">This week</span>${this._wxChip(wsec)}${this._door()}</button>
            <div class="sk-week">${this._wxForecastRail(wsec)}</div>`,
          { icon: "mdi:weather-partly-rainy", text: wet ? this._wxDow(wet.ts, false) : "Week", sheet: "wx", color: "var(--ps-cool)" }, "sk-pad");
      }
      const crew = this._skSec("crew");
      if (crew) {
        const needs = this._secCrew(crew);
        if (needs) push("needs", `<div class="ps-sect">${needs}</div>`, null);
      }
      const tiles = this._skTiles();
      if (tiles) {
        const lsec = this._skSec("lights");
        const on = lsec ? this._lightList(lsec).filter((l) => l.on).length : 0;
        out.push(`<div class="sk-tiles" id="sk-c-tiles" data-skc="tiles" data-pill="mdi:lightbulb-outline|${on} on|house|var(--sk-lamp)">${tiles}</div>`);
        pills.push({ key: "tiles", icon: "mdi:lightbulb-outline", text: `${on} on`, tab: "house", color: "var(--sk-lamp)" });
      }
    } finally {
      this._skCtx = null;
    }
    const pillHtml = pills.map((p) => `<button class="sk-pill" type="button" data-skpill="${p.key}" style="--pc:${p.color || "var(--ps-text)"}">
        <ha-icon icon="${p.icon}"></ha-icon><span>${psEsc(p.text)}</span></button>`).join("");
    return { html: out.join(""), pills: pillHtml };
  }

  /* The house at a glance: one picture and one number per tile. */
  _skTiles() {
    const h = this._hass;
    const tiles = [];
    const lsec = this._skSec("lights");
    if (lsec) {
      const ls = this._lightList(lsec);
      const lit = ls.filter((l) => l.on);
      const glow = lit.slice(0, 3).map((l, i) => {
        const rgb = skKelvin(l.kelvin || 2700);
        const at = ["18% 82%", "86% 18%", "60% 60%"][i];
        return `radial-gradient(${80 + l.bri * 1.4}px ${64 + l.bri}px at ${at}, rgba(${rgb},var(--sk-glow)), rgba(${rgb},0))`;
      }).join(",");
      tiles.push(`<button class="sk-tile ${lit.length ? "lit" : ""}" type="button" data-sktab="house" data-skto="sk-c-lights" aria-label="${lit.length} lights on">
          ${glow ? `<span class="sk-tglow" style="background:${glow}"></span>` : ""}
          <span class="sk-trow"><span class="sk-ico" style="--c:var(--sk-lamp)"><ha-icon icon="mdi:lightbulb-outline"></ha-icon></span>
            <span class="sk-pips">${ls.map((l) => `<i class="${l.gone ? "x" : l.on ? "on" : ""}" style="--g:rgb(${skKelvin(l.kelvin || 2700)})"></i>`).join("")}</span></span>
          <span class="sk-tv"><b>${lit.length}</b><small>on</small></span>
          <span class="sk-tl">${psEsc(lit.map((l) => l.name).join(" · ") || "All off")}</span></button>`);
    }
    const crew = this._skSec("crew");
    const v = crew && crew.vacuum;
    if (v && v.entity) {
      const st = h.states[v.entity];
      const state = st ? st.state : "unavailable";
      const bat = pcNum(h, v.battery);
      const prog = pcNum(h, v.progress);
      const running = state === "cleaning" || state === "returning";
      const worn = (v.wear || []).map((w) => ({ ...w, v: pcNum(h, w.entity) })).filter((w) => w.v != null && w.v < 20)
        .sort((a, b) => a.v - b.v);
      const ring = running && prog != null ? prog : bat;
      const R = 19, C = 2 * Math.PI * R;
      tiles.push(`<button class="sk-tile" type="button" data-sktab="house" data-skto="sk-c-crew" aria-label="${psEsc(v.name || "Vacuum")}, ${psEsc(state)}">
          <span class="sk-trow"><span class="sk-ring"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="${R}" class="tr"/>${
            ring == null ? "" : `<circle cx="22" cy="22" r="${R}" class="fl" stroke-dasharray="${(C * skClamp(ring / 100)).toFixed(1)} ${C.toFixed(1)}"/>`}</svg>
            <ha-icon icon="mdi:robot-vacuum"></ha-icon></span>${worn.length ? `<span class="sk-warn" title="${psEsc(worn[0].label)} ${Math.round(worn[0].v)}%"></span>` : ""}</span>
          <span class="sk-tv">${running && prog != null ? `<b>${Math.round(prog)}</b><small>%</small>` : bat == null ? `<b class="ps-nodata">—</b>` : `<b>${Math.round(bat)}</b><small>%</small>`}</span>
          <span class="sk-tl">${psEsc(v.name || "Vacuum")} · ${psEsc(running ? (state === "returning" ? "returning" : "cleaning") : this._humanize(state))}${
            worn.length ? ` · ${psEsc(worn[0].label.toLowerCase())} ${Math.round(worn[0].v)}%` : ""}</span></button>`);
    }
    const l = crew && crew.litter;
    if (l && (l.waste_drawer || l.litter_level)) {
      const dr = pcNum(h, l.waste_drawer), lv = pcNum(h, l.litter_level);
      const bar = (x, cls) => `<span class="sk-tank ${cls}${x == null ? " none" : ""}"><i style="height:${x == null ? 0 : skClamp(x / 100) * 100}%"></i></span>`;
      tiles.push(`<button class="sk-tile" type="button" data-sktab="house" data-skto="sk-c-crew" aria-label="${psEsc(l.name || "Litter box")}, drawer ${dr == null ? "no reading" : Math.round(dr) + "%"}">
          <span class="sk-trow"><span class="sk-tanks">${bar(dr, "dr")}${bar(lv, "lv")}</span><span class="sk-ico" style="--c:var(--sk-litter)"><ha-icon icon="mdi:cat"></ha-icon></span></span>
          <span class="sk-tv">${dr == null ? `<b class="ps-nodata">—</b>` : `<b>${Math.round(dr)}</b><small>%</small>`}</span>
          <span class="sk-tl">Drawer${lv == null ? "" : ` · litter ${Math.round(lv)}%`}</span></button>`);
    }
    const s = this._sysCfg && this._sysCfg();
    if (s) {
      const meters = (s.meters || []).slice(0, 3).map((m) => ({ ...m, v: pcNum(h, m.entity) }));
      const arr = meters[0];
      const r = pcReading(h, s.status);
      const online = r.ok && String(r.st.state).toLowerCase() === "online";
      tiles.push(`<button class="sk-tile" type="button" data-skmode="systems" aria-label="${psEsc(s.name || "Server")}">
          <span class="sk-trow"><span class="sk-tanks">${meters.map((m) => `<span class="sk-tank nas${m.v == null ? " none" : ""}${
            m.v != null && m.critical_above != null && m.v >= m.critical_above ? " bad" : m.v != null && m.warn_above != null && m.v >= m.warn_above ? " warn" : ""}"><i style="height:${m.v == null ? 0 : skClamp(m.v / 100) * 100}%"></i></span>`).join("")}</span>
            <span class="sk-ico" style="--c:var(--sk-nas)"><ha-icon icon="mdi:server"></ha-icon></span></span>
          <span class="sk-tv">${arr && arr.v != null ? `<b>${Math.round(arr.v)}</b><small>%</small>` : `<b class="ps-nodata">—</b>`}</span>
          <span class="sk-tl">${psEsc(s.name || "Server")} · ${online ? psEsc(pcState(h, (s.docker || {}).running) || "online") : r.ok ? psEsc(String(r.st.state)) : "no data"}</span></button>`);
    }
    const w = crew && crew.washer;
    if (w && w.entity) {
      const ws = String(pcState(h, w.entity) || "").toLowerCase();
      if (ws && !/^(off|idle|empty|unknown|unavailable|none)$/.test(ws)) {
        tiles.push(`<button class="sk-tile wide" type="button" data-sktab="house" data-skto="sk-c-crew">
            <span class="sk-trow"><span class="sk-ico" style="--c:var(--ps-cool)"><ha-icon icon="${psEsc(w.icon || "mdi:washing-machine")}"></ha-icon></span>
              <span class="sk-tl" style="margin-left:10px">${psEsc(w.name || "Washer")}</span><span class="ps-chip ${/done|finish|complete/.test(ws) ? "warn" : "cool"}" style="margin-left:auto"><span class="ps-dot"></span>${psEsc(this._humanize(ws))}</span></span></button>`);
      }
    }
    return tiles.join("");
  }

  /* ------------------------------------------------------------------ pages --- */

  _skPage(title, sub, body) {
    return `${this._skTitle(title, sub)}${body}`;
  }

  _skJoel() {
    const sec = this._skSec("nursery");
    if (!sec) return this._skTitle("Joel");
    this._skCtx = "page";
    try {
      return this._skPage(this._skTabName("joel"), "",
        `<div class="sk-card"><div class="ps-sect open">${this._secNursery(sec)}</div></div>`);
    } finally { this._skCtx = null; }
  }

  _skClimate() {
    const sec = this._skSec("climate");
    if (!sec) return this._skTitle("Climate");
    this._skCtx = "page";
    try {
      return this._skPage(sec.title || "Climate", "",
        `<div class="sk-card"><div class="ps-sect open">${this._secClimate(sec)}</div></div>`);
    } finally { this._skCtx = null; }
  }

  _skMedia() {
    const face = this._skFaceNow();
    const live = this._mediaLive ? this._mediaLive() : { tv: false, music: false };
    const dot = (o) => (o ? `<span class="sk-live"></span>` : "");
    const seg = `<div class="sk-seg" role="tablist" aria-label="Watch or listen">
        <button type="button" role="tab" data-skface="watch" aria-selected="${face === "watch"}">${dot(live.tv)}Watch</button>
        <button type="button" role="tab" data-skface="listen" aria-selected="${face === "listen"}">${dot(live.music)}Listen</button></div>`;
    if (face === "watch") {
      const sheets = this._config.sheets || {};
      const spec = (sheets.media && sheets.media.card) ? sheets.media : sheets.tv;
      if (!spec || !spec.card) return this._skTitle("Media") + seg + `<div class="sk-card"><div class="ps-nohist">No television is configured.</div></div>`;
      /* What is playing elsewhere sits under the remote, so Watch never hides
         the rain sounds in the nursery; a row opens Listen on that room. */
      const np = this._skSec("nowplaying");
      let rows = "";
      if (np && live.music) {
        this._skCtx = "page";
        try { rows = this._secNowplaying(np) || ""; } finally { this._skCtx = null; }
      }
      return this._skTitle("Media") + seg + `<div class="sk-card sk-remotecard"><div class="ps-host" id="sk-remote"></div></div>`
        + (rows ? `<div class="sk-card"><div class="ps-sect">${rows}</div></div>` : "");
    }
    const sec = (this._config.sections || []).find((x) => x.type === "music");
    if (!sec) return this._skTitle("Media") + seg + `<div class="sk-card"><div class="ps-nohist">No music section is configured.</div></div>`;
    return this._skTitle("Media") + seg
      + `<div class="sk-card sk-musiccard"><div class="sk-musichead"><span class="ps-lbl">Playing on${this._musicTargetName(sec)}</span></div>${this._musicBody(sec)}</div>`;
  }

  /* The remote is a card of its own. Built once and kept: the Watch markup is
     identical between repaints, so the host survives, and when a face switch
     does replace it the same element is put back — the selected television
     and the app strip's scroll come with it. */
  _skMountRemote() {
    const host = this.shadowRoot.getElementById("sk-remote");
    if (!host) return;
    const sheets = this._config.sheets || {};
    const spec = (sheets.media && sheets.media.card) ? sheets.media : sheets.tv;
    if (!spec || !spec.card) return;
    if (!this._skRemoteEl) {
      const tag = String(spec.card.type || "").replace(/^custom:/, "");
      if (!tag || !customElements.get(tag)) {
        host.innerHTML = `<div class="ps-nohist">${psEsc(tag || "card")} is not registered</div>`;
        return;
      }
      const el = document.createElement(tag);
      const cfg = { bare: true, ...spec.card };
      if (!spec.keep_title) cfg.title = "";
      try { el.setConfig(cfg); } catch (e) {
        try { el.setConfig({ ...spec.card }); } catch (e2) {
          host.innerHTML = `<div class="ps-nohist">${psEsc(tag)}: ${psEsc((e2 && e2.message) || "bad config")}</div>`;
          return;
        }
      }
      this._skRemoteEl = el;
    }
    this._skRemoteEl.hass = this._hass;
    if (this._skRemoteEl.parentNode !== host) { host.innerHTML = ""; host.appendChild(this._skRemoteEl); }
  }

  _skHouse() {
    const parts = [this._skTitle("House")];
    this._skCtx = "page";
    try {
      const lsec = this._skSec("lights");
      if (lsec) {
        const body = this._secLights(lsec);
        if (body) parts.push(this._skCard("lights", `<div class="sk-cardh"><span class="sk-ico" style="--c:var(--sk-lamp)"><ha-icon icon="mdi:lightbulb-outline"></ha-icon></span><span>Lights</span></div><div class="ps-sect open sk-flush">${body}</div>`));
      }
      const crew = this._skSec("crew");
      if (crew) {
        parts.push(this._skCard("crew", `<div class="sk-cardh"><span class="sk-ico" style="--c:var(--ps-good)"><ha-icon icon="mdi:robot-vacuum"></ha-icon></span><span>${psEsc(crew.name || crew.title || "Jeeves")}</span>${this._crewChip(crew)}</div>
          <div class="ps-sect open sk-flush">${this._crewBody(crew, { vac: true })}</div>`));
      }
      const s = this._sysCfg && this._sysCfg();
      if (s) parts.push(this._skCard("nas", this._skNasCard(s)));
      if ((this._config.sheets || {}).notifications) {
        const n = this._logOpenCount();
        parts.push(`<button class="sk-card sk-rowcard" type="button" data-sheet="notifications">
            <span class="sk-ico" style="--c:var(--ps-warn)"><ha-icon icon="mdi:bell-outline"></ha-icon></span>
            <span class="ps-grow"><b>Notifications</b><small>${n ? `${n} unread` : "Everything read"}</small></span>${this._door()}</button>`);
      }
    } finally { this._skCtx = null; }
    return parts.join("");
  }

  /* The server's headline: its own meters and stats from `server:`, so the
     card is config-driven exactly the way the server pages are. */
  _skNasCard(s) {
    const h = this._hass;
    const r = pcReading(h, s.status);
    const online = r.ok && String(r.st.state).toLowerCase() === "online";
    const up = pcState(h, s.uptime);
    const meters = (s.meters || []).map((m) => {
      const v = pcNum(h, m.entity);
      const cls = v == null ? "" : m.critical_above != null && v >= m.critical_above ? "bad" : m.warn_above != null && v >= m.warn_above ? "warn" : "";
      return `<div class="sk-meter ${cls}"><span>${psEsc(m.label)}</span><span class="sk-mbar${v == null ? " none" : ""}"><i style="width:${v == null ? 0 : skClamp(v / 100) * 100}%"></i></span><b>${v == null ? "—" : psPct(v)}</b></div>`;
    }).join("");
    const stats = (s.stats || []).map((x) => {
      const v = pcNum(h, x.entity);
      return `<div class="st3"><b>${v == null ? "—" : (x.digits != null ? Number(v).toFixed(x.digits) : Math.round(v)) + (x.unit ? `<small>${psEsc(x.unit)}</small>` : "")}</b><span>${psEsc(x.label)}</span></div>`;
    }).join("");
    return `<div class="sk-cardh"><span class="sk-ico" style="--c:var(--sk-nas)"><ha-icon icon="mdi:server"></ha-icon></span><span>${psEsc(s.name || "Server")}</span>
        <span class="ps-chip ${online ? "good" : r.ok ? "bad" : "warn"}" style="margin-left:auto"><span class="ps-dot"></span>${online ? (up && up !== "unknown" ? psEsc(up) : "Online") : r.ok ? psEsc(String(r.st.state)) : "No data"}</span></div>
      <div class="sk-meters">${meters}</div>
      ${stats ? `<div class="sk-stats">${stats}</div>` : ""}
      <button class="sk-btn" type="button" data-skmode="systems"><ha-icon icon="mdi:server"></ha-icon>Open ${psEsc(s.name || "server")}</button>`;
  }

  /* Hosted sheet cards. Our own notification list reads the light tokens
     through inheritance, but its stylesheet speaks white-alpha like the
     shell's did, so after each of its renders the same rewrite is applied to
     its <style> — styles only, never its markup, so its bindings survive.
     Third-party cards (the vacuum map) keep the dark object treatment. */
  _mountSheetCard() {
    super._mountSheetCard();
    const el = this._hosted;
    const host = this.shadowRoot.getElementById("ps-host");
    if (!el || !host) return;
    const ours = el.tagName && /^PURDY-NOTIFICATIONS-CARD$/i.test(el.tagName);
    if (host.classList.contains("sk-paper") !== !!ours) host.classList.toggle("sk-paper", !!ours);
    if (ours && !el._skLit && typeof el._render === "function") {
      const orig = el._render;
      el._render = function (...args) {
        const out = orig.apply(this, args);
        try {
          this.shadowRoot.querySelectorAll("style").forEach((st) => {
            const t = st.textContent;
            const n = t.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/g, "rgba(var(--sk-fg, 255, 255, 255),");
            if (n !== t) st.textContent = n;
          });
        } catch (e) { /* a style we cannot reach stays as it was */ }
        return out;
      };
      el._skLit = true;
      el._last = null;
      el.hass = this._hass;
    }
  }

  /* ---------------------------------------------------------------- binding --- */

  _skBind() {
    this._each("[data-sktab]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._skGo(el.dataset.sktab, { to: el.dataset.skto, face: el.dataset.face });
    }));
    this._each("[data-skface]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._skFace = el.dataset.skface;
      this._render();
    }));
    this._each("[data-skmode]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._skGo("house", { mode: el.dataset.skmode });
    }));
    this._each("[data-skback]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._skGo("house", { to: "sk-c-nas" });
    }));
    this._each("[data-skbell]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const faults = this._faults();
      const notes = !!(this._config.sheets || {}).notifications;
      const want = faults.length ? "alerts" : notes ? "notifications" : null;
      if (!want) return;
      this._sheet = this._sheet === want ? null : want;
      this._render();
    }));
    this._each("[data-skpill]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = this.shadowRoot.getElementById("sk-c-" + el.dataset.skpill);
      const sc = this._skScroller();
      const bar = this.shadowRoot.getElementById("sk-bar");
      if (!card || !sc || !card.getBoundingClientRect) return;
      const off = card.getBoundingClientRect().top - (bar ? bar.getBoundingClientRect().height : 100) - 10;
      if (sc.scrollTo) sc.scrollTo({ top: sc.scrollTop + off, behavior: "smooth" }); else sc.scrollTop += off;
    }));
    /* The Home "This week" card is a sheet door; the whole card, not just its header. */
    this._each(".sk-week", (el) => el.addEventListener("click", () => { this._sheet = "wx"; this._render(); }));
  }

  /* --------------------------------------------------------------- the alive --- */

  /* Everything that moves with the scroll, written straight onto surviving
     nodes. Never _render from here. */
  _skFrame() {
    const root = this.shadowRoot;
    if (!root || !this._mounted) return;
    const bar = root.getElementById("sk-bar");
    const sk = root.getElementById("sk");
    if (!bar || !sk || !bar.getBoundingClientRect) return;
    const view = this._skView();
    const barR = bar.getBoundingClientRect();
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    let solid = 0, title = 0;
    if (view === "home") {
      const hero = root.getElementById("sk-hero");
      const hr = hero ? hero.getBoundingClientRect() : null;
      const y = hr ? Math.max(0, barR.top - hr.top) : 0;
      const H = hr ? hr.height : 360;
      solid = skClamp((y - (H - barR.height - 120)) / 80);
      title = skClamp((y - (H - barR.height - 60)) / 60);
      const inn = root.getElementById("sk-heroin");
      const greet = root.getElementById("sk-greet");
      const temp = root.getElementById("sk-temp");
      if (inn && !reduce) inn.style.transform = `translate3d(0,${(y * 0.38).toFixed(1)}px,0)`;
      if (greet) greet.style.opacity = String(1 - skClamp(y / 140));
      if (temp && !reduce) {
        temp.style.transform = `scale(${(1 - skClamp(y / 300) * 0.28).toFixed(3)})`;
        temp.style.opacity = String(1 - skClamp((y - 120) / 140));
      }
      /* Cards fold into pills as they pass under the bar. */
      let any = false;
      root.querySelectorAll("#sk-home [data-skc]").forEach((c) => {
        const key = c.dataset.skc;
        const pill = root.querySelector(`.sk-pill[data-skpill="${key}"]`);
        if (!pill) return;
        const on = c.getBoundingClientRect().bottom < barR.top + 112;
        if (pill.classList.contains("on") !== on) pill.classList.toggle("on", on);
        if (on) any = true;
      });
      if (bar.classList.contains("pilled") !== any) bar.classList.toggle("pilled", any);
    } else {
      const ttl = root.querySelector(".sk-view.on .sk-ttl, .sk-view.on .ps-stat");
      const tr = ttl ? ttl.getBoundingClientRect() : null;
      const y = tr ? Math.max(0, barR.bottom - tr.top) : 0;
      solid = skClamp(y / 24);
      title = tr ? skClamp((barR.bottom - tr.bottom + 10) / 30) : 1;
      if (bar.classList.contains("pilled")) bar.classList.remove("pilled");
    }
    bar.style.setProperty("--solid", solid.toFixed(3));
    bar.style.setProperty("--titlep", title.toFixed(3));

    /* The mini player steps aside while you read downwards and comes back the
       moment you scroll up. */
    const sc = this._skScroller();
    const y = sc ? sc.scrollTop : 0;
    const mini = root.getElementById("sk-mini");
    /* And it steps aside entirely while the Now playing card is on screen —
       the same track twice, one above the other, is the chip rule in motion. */
    const npCard = view === "home" ? root.getElementById("sk-c-now") : null;
    if (mini) {
      let seen = false;
      if (npCard && npCard.getBoundingClientRect) {
        const r = npCard.getBoundingClientRect();
        const vh = typeof innerHeight === "number" ? innerHeight : 800;
        seen = r.bottom > barR.bottom + 40 && r.top < vh - 150;
      }
      if (mini.classList.contains("np") !== seen) mini.classList.toggle("np", seen);
      if (y > this._skLastY + 6 && y > 140) mini.classList.add("slim");
      else if (y < this._skLastY - 6 || y < 80) mini.classList.remove("slim");
    }
    this._skLastY = y;
  }

  getCardSize() { return 12; }

  static get styles() {
    /* The shell's sheet speaks white-alpha; rewritten once so the same rules
       read on paper. */
    return PurdyShellCard.styles.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/g, "rgba(var(--sk-fg),") + SK_STYLES;
  }
}
