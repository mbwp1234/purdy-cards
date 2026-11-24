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

/* The word for a likely-wet day. The chip is there BECAUSE precipitation is
   likely, but NWS keys the day by its daytime condition, which can be
   "cloudy" over a 91% chance of rain — and "Cloudy Wed · 91%" read as a 91%
   chance of clouds. A wet condition keeps its own word; anything else says
   rain. */
const SK_WET = /^(rainy|pouring|lightning|lightning-rainy|snowy|snowy-rainy|hail)$/;
function skWetWord(cond) {
  return SK_WET.test(String(cond || "")) ? (pcWxText(cond) || "Rain") : "Rain";
}

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
    this._skAnchor = null;     // where the mini bar's last direction began
    this._skAnchorView = null;
    this._skTick = false;
    this._skRemoteEl = null;
    /* One handler, kept on the card so disconnect removes exactly what it added. */
    this._skOnScroll = () => {
      if (this._skTick) return;
      this._skTick = true;
      const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16);
      raf(() => { this._skTick = false; this._skFrame(); });
    };
    /* The same, for a scroller that is not the document. A scroll event is
       not composed: one fired by an element inside Home Assistant's shadow
       trees never reaches a window listener, capture phase or not. So the
       element that actually scrolls gets a listener of its own, and it feeds
       the shell's _scrollAt too — the tap guard is blind without it. */
    this._skOnElScroll = () => { this._scrollAt = Date.now(); this._skOnScroll(); };
    /* A touch is a scroll until it proves otherwise — for EVERY button on the
       card, not only the gesture controls. A finger that lands within 150ms of
       a scroll is a thumb stopping a coasting page, and whether the browser
       then fires a click is the browser's choice, not ours (a headless fling
       fired one onto the climate +). So the decision is taken at the DOWN,
       from the shell's own _scrollAt, and the click that follows is
       swallowed in the capture phase before any handler — ours or a hosted
       card's — can see it. Reset on every click, so one stopped scroll costs
       exactly one tap. */
    if (this.shadowRoot && this.shadowRoot.addEventListener) {
      this.shadowRoot.addEventListener("pointerdown", () => {
        this._skStopper = !!(this._scrollAt && Date.now() - this._scrollAt < 150);
        this._skEatClick = false;
      }, { capture: true, passive: true });
      /* _skEatClick: a press-and-hold has already done its job, and the
         release's click lands on whatever the hold just opened — the sheet's
         scrim, which would close it again under the finger. */
      this.shadowRoot.addEventListener("click", (e) => {
        if (!this._skStopper && !this._skEatClick) return;
        this._skStopper = false;
        this._skEatClick = false;
        e.stopPropagation();
        e.preventDefault();
      }, { capture: true });
    }
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
    if (this._skHooked) this._skHooked.removeEventListener("scroll", this._skOnElScroll);
    this._skHooked = null;
    this._skSc = null;
  }

  /* Listen to the scroller itself when it is an element. Re-checked on every
     frame, which is cheap: _skScroller is cached once it finds an element. */
  _skHook() {
    const sc = this._skScroller();
    const doc = typeof document !== "undefined" ? document : null;
    const el = !sc || !doc || sc === doc.scrollingElement || sc === doc.documentElement || sc === doc.body ? null : sc;
    if (el === this._skHooked) return;
    if (this._skHooked) this._skHooked.removeEventListener("scroll", this._skOnElScroll);
    this._skHooked = el;
    if (el && el.addEventListener) el.addEventListener("scroll", this._skOnElScroll, { passive: true });
  }

  /* The skeleton. `ps-ground`, `ps-sheetslot`, `ps-stat`, `ps-dockwrap` and
     `ps-col` keep the shell's ids so _paintSky, _patchSheet, _mountSheetCard
     and _renderSystems work untouched; the last three live in the server view. */
  _mount() {
    this.shadowRoot.innerHTML = `
      <style>${PurdySkyCard.styles}</style>
      <div class="ps-ground" id="ps-ground"></div>
      <div class="sk" id="sk">
        <div class="sk-safeprobe" id="sk-safeprobe" style="position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px)"></div>
        <div class="sk-safepad"></div>
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
        <section class="sk-view sk-sys" data-v="sys"><div class="sk-stack" id="sk-sys"></div></section>
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
    /* The document is the FALLBACK, and it is not cached for long: asked
       before the view has content, no ancestor overflows yet, and caching the
       answer then meant every later frame measured the wrong scroller for as
       long as the card lived. Re-walk at most once a second until an element
       turns up. */
    const now = Date.now();
    if (this._skScDoc && now - this._skScDocAt < 1000) return this._skScDoc;
    let n = this;
    for (let i = 0; i < 40 && n; i++) {
      const p = n.assignedSlot || n.parentElement || (n.parentNode && n.parentNode.host) || null;
      if (!p) break;
      n = p;
      if (typeof getComputedStyle !== "function") break;
      const oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 2) { this._skSc = n; return n; }
    }
    this._skScDoc = (typeof document !== "undefined" && (document.scrollingElement || document.documentElement)) || null;
    this._skScDocAt = now;
    return this._skScDoc;
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
          const off = el.getBoundingClientRect().top - (bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 60) - 8;
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

    if (view === "home") {
      this._patch("sk-hero", this._skHero(now, faults));
      const home = this._skHome(faults);
      this._patch("sk-home", home.html);
      this._patch("sk-pills", home.pills);
    } else {
      this._patch("sk-pills", "");
      const html = { joel: () => this._skJoel(), climate: () => this._skClimate(), media: () => this._skMedia(), house: () => this._skHouse(), sys: () => this._skSys(faults) }[view]();
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
  _sheetHtml(faults) {
    if (this._sheet === "skpart") return this._skPartSheet();
    return super._sheetHtml(faults);
  }

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
    const r = this._skTodayRange();
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
      <div class="sk-heroin sky-${band}" id="sk-heroin">
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

  /* Today's low and high for the hero bar. The yard thermometer sits in the
     sun: on 2026-11-23 it read 52.9° at 8 AM, 79° by noon and 54.9° at 10 PM
     while the NWS station said 52° — so its daily MAX is a reading of the
     sun on the sensor, not of the air, and the bar said "35° to 79°" in
     November. Lows happen at night, out of the sun, so the measured minimum
     stands. The high is the forecast's when NWS still publishes today's
     daytime period, else the highest the NWS STATION itself observed today,
     and only with neither does the yard's maximum come back. The live tick
     stays the yard reading — that is the number the hero prints. */
  _skTodayRange() {
    const r = this._wxTodayRange();
    const st = (this._wxStats || []).find((d) => d.partial);
    const fc = (this._wxFc || []).find((d) => d.today);
    const air = this._skAir && this._skAir.day === new Date(this._nowMs()).toDateString() ? this._skAir : null;
    const his = [fc && fc.hi, air && air.hi].filter((v) => v != null);
    const los = [st && st.min, fc && fc.lo, air && air.lo].filter((v) => v != null);
    return { ...r, lo: los.length ? Math.min(...los) : r.lo, hi: his.length ? Math.max(...his) : r.hi };
  }

  /* The station's own observations since local midnight: one history read of
     the weather entity with its attributes, ~24 rows from NWS's hourly
     reports. Rides the shell's weather refresh, never a timer of its own. */
  async _fetchWeather() {
    await Promise.all([super._fetchWeather(), this._skFetchAir()]);
    this._last = null;
    this._render();
  }

  async _skFetchAir() {
    const id = (this._config.sky || {}).air_station || this._config.weather;
    if (!id || !this._hass || !this._hass.callApi) return;
    const from = new Date(this._nowMs()); from.setHours(0, 0, 0, 0);
    try {
      const res = await this._hass.callApi("GET",
        `history/period/${from.toISOString()}?filter_entity_id=${id}&end_time=${encodeURIComponent(pcNowIso())}`);
      const temps = ((res || [])[0] || []).map((p) => Number((p.attributes || {}).temperature)).filter(Number.isFinite);
      this._skAir = temps.length ? { day: from.toDateString(), hi: Math.max(...temps), lo: Math.min(...temps) } : null;
    } catch (e) {
      this._skAir = null;   // the bar falls back to the yard's own range
    }
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
    return `<button class="ps-chip cool" type="button" data-sheet="wx"><span class="ps-dot"></span>${psEsc(skWetWord(wet.condition))} ${psEsc(when)} · ${Math.round(wet.pop)}%</button>`;
  }

  _skCard(key, body, pill, extra) {
    if (!body) return "";
    const tab = { joel: "joel", clim: "climate" }[key];
    return `<div class="sk-card ${extra || ""}" id="sk-c-${key}" data-skc="${key}"${pill ? ` data-pill="${psEsc(pill)}"` : ""}${
      tab && /sk-tap/.test(extra || "") ? ` data-sktab="${tab}" role="button" tabindex="0"` : ""}>${body}</div>`;
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
      const media = this._skMediaHome();
      const liveNp = this._nowPlaying && this._nowPlaying();
      const jsec = this._skSec("nursery");
      if (jsec) {
        const N = this._skNurse();
        const n = N && N.m.nightSession;
        push("joel", this._skJoelHome(), { icon: "mdi:weather-night", text: n ? psHM(n.asleepMinutes).replace(" ", "") : "Joel", tab: "joel", color: "var(--ps-deep)" }, "sk-pad sk-tap");
      }
      const C = this._skClim();
      if (C) push("clim", this._skClimateHome(), { icon: "mdi:thermostat", text: C.cur == null ? "Climate" : `${C.cur.toFixed(1)}°`, tab: "climate", color: "var(--ps-heat)" }, "sk-pad sk-tap");
      if (media) push("now", media, { icon: "mdi:music-note", text: liveNp ? (liveNp.st.attributes.media_title || "Playing") : "Media", tab: "media", color: "var(--sk-media)" }, "sk-pad");
      const wsec = this._weatherSection();
      if (wsec) {
        const wet = (this._wxFc || []).find((d) => !d.today && d.pop != null && d.pop >= 50);
        /* The hero's chip already names the first wet day. This one only adds
           something when the hero's is TODAY and the week has another. */
        const heroWet = (this._wxFc || []).find((d) => d.pop != null && d.pop >= 50);
        const weekChip = wet && heroWet && heroWet.today;
        push("week", `<div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-cool)"><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon></span><span class="sk-hn">This week</span>${
            weekChip ? `<span class="ps-chip cool"><span class="ps-dot"></span>${psEsc(skWetWord(wet.condition))} ${psEsc(this._wxDow(wet.ts, false))}</span>` : ""}</div>
            <div class="sk-week" data-sheet="wx" role="button" tabindex="0">${this._skWeekRail()}</div>`,
          { icon: "mdi:weather-partly-rainy", text: wet ? this._wxDow(wet.ts, false) : "Week", color: "var(--ps-cool)" }, "sk-pad");
      }
      const crew = this._skSec("crew");
      if (crew) {
        const needs = this._secCrew(crew);
        if (needs) push("needs", `<div class="ps-sect">${needs}</div>`, null);
      }
      const tiles = this._skTiles();
      if (tiles) {
        const lsec = this._skSec("lights");
        const on = lsec ? this._lightList(lsec).filter((l) => l.on && !l.cfg.protect && !l.gone).length : 0;
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
      /* Counted the way the Lights chip counts — a guarded light (the night
         light) and a lamp that is gone are not "on" — so the tile and the
         House tab cannot say 3 and 2 about the same rooms. */
      const lit = ls.filter((l) => l.on && !l.cfg.protect && !l.gone);
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
          <span class="sk-tl">${psEsc(v.name || "Vacuum")} · ${psEsc(running ? (state === "returning" ? "returning" : "cleaning") : this._humanize(state))}</span></button>`);
    }
    const l = crew && crew.litter;
    if (l && (l.waste_drawer || l.litter_level)) {
      const dr = pcNum(h, l.waste_drawer), lv = pcNum(h, l.litter_level);
      const bar = (x, cls) => `<span class="sk-tank ${cls}${x == null ? " none" : ""}"><i style="height:${x == null ? 0 : skClamp(x / 100) * 100}%"></i></span>`;
      tiles.push(`<button class="sk-tile" type="button" data-sktab="house" data-skto="sk-c-litter" aria-label="${psEsc(l.name || "Litter box")}, drawer ${dr == null ? "no reading" : Math.round(dr) + "%"}">
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
      /* A finished load is already raised twice — the hero's fault chip and
         the crew row that says "has finished" — so the tile carries a RUNNING
         washer only, the one state nothing else on Home shows. */
      if (ws && !/^(off|idle|empty|unknown|unavailable|none)$/.test(ws) && !/done|finish|complete/.test(ws)) {
        tiles.push(`<button class="sk-tile wide" type="button" data-sktab="house" data-skto="sk-c-washer">
            <span class="sk-trow"><span class="sk-ico" style="--c:var(--ps-cool)"><ha-icon icon="${psEsc(w.icon || "mdi:washing-machine")}"></ha-icon></span>
              <span class="sk-tl" style="margin-left:10px">${psEsc(w.name || "Washer")}</span><span class="ps-chip ${/done|finish|complete/.test(ws) ? "warn" : "cool"}" style="margin-left:auto"><span class="ps-dot"></span>${psEsc(this._humanize(ws))}</span></span></button>`);
      }
    }
    return tiles.join("");
  }

  /* ------------------------------------------------------------------ pages --- */





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
    this._skLighten(this._skRemoteEl);
    this._skRemoteEl.hass = this._hass;
    if (this._skRemoteEl.parentNode !== host) { host.innerHTML = ""; host.appendChild(this._skRemoteEl); }
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
    if (ours && !el._skLit) { this._skLighten(el); el._last = null; el.hass = this._hass; }
  }

  /* One of our own hosted cards, made to read the light tokens: after each of
     its renders the white-alpha in its <style> goes through --sk-fg. Styles
     only, never its markup, so its bindings survive. */
  _skLighten(el) {
    if (!el || el._skLit || typeof el._render !== "function") return;
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
      const off = card.getBoundingClientRect().top - this._skCover() - 10;
      if (sc.scrollTo) sc.scrollTo({ top: sc.scrollTop + off, behavior: "smooth" }); else sc.scrollTop += off;
    }));
    /* Joel: tap a night in the week to read it above. */
    this._each("[data-sknight]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._skNight = Number(el.dataset.sknight);
      this._render();
      const w = this.shadowRoot.getElementById("sk-nightwrap");
      const sc = this._skScroller();
      const bar = this.shadowRoot.getElementById("sk-bar");
      if (w && sc && w.getBoundingClientRect) {
        const off = w.getBoundingClientRect().top - (bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 60) - 8;
        if (sc.scrollTo) sc.scrollTo({ top: sc.scrollTop + off, behavior: "smooth" }); else sc.scrollTop += off;
      }
    }));
    /* An event row scrolls itself under the pinned night, which moves the cursor. */
    this._each("[data-skev]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const hero = this.shadowRoot.getElementById("sk-c-night");
      const sc = this._skScroller();
      if (!hero || !sc) return;
      const off = el.getBoundingClientRect().top - hero.getBoundingClientRect().bottom - 18;
      if (sc.scrollTo) sc.scrollTo({ top: sc.scrollTop + off, behavior: "smooth" }); else sc.scrollTop += off;
    }));
    /* A select's option, straight to select.select_option. */
    this._each("[data-sksel]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      pcHaptic("light");
      this._hass.callService("select", "select_option", { entity_id: el.dataset.sksel, option: el.dataset.val });
    }));
    this._each("[data-skvacopts]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._skVacOpen = !this._skVacOpen;
      this._render();
    }));
    this._each("[data-sktoggle]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.dataset.sktoggle;
      this._hass.callService(id.split(".")[0], "toggle", { entity_id: id });
    }));
    /* Two-tap arm for a press that cannot be taken back; lapses after 5s. */
    this._each("[data-skarm]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const k = el.dataset.skarm;
      if (this._skArmed === k) {
        clearTimeout(this._skArmT); this._skArmed = null;
        if (el.dataset.skpress) this._hass.callService(el.dataset.skpress.split(".")[0], "press", { entity_id: el.dataset.skpress });
        if (el.dataset.sktog) this._hass.callService(el.dataset.sktog.split(".")[0], "toggle", { entity_id: el.dataset.sktog });
        this._render();
        return;
      }
      this._skArmed = k;
      clearTimeout(this._skArmT);
      this._skArmT = setTimeout(() => { this._skArmed = null; this._render(); }, 5000);
      this._render();
    }));
    /* A wear ring: hold to open its sheet. Nothing on the down; a move past
       8px is a scroll and lets go; the release is bound to the window so it
       cannot be missed; and a page that moved under the finger cancels. */
    this._each("[data-skpart]", (el) => {
      el.addEventListener("contextmenu", (e) => e.preventDefault());
      el.addEventListener("pointerdown", (e) => {
        if ((e.button != null && e.button > 0) || this._skStopper) return;
        const x0 = e.clientX, y0 = e.clientY, t0 = Date.now();
        let timer = null;
        const end = () => {
          clearTimeout(timer);
          window.removeEventListener("pointermove", mv);
          window.removeEventListener("pointerup", end, true);
          window.removeEventListener("pointercancel", end, true);
          el.classList.remove("hold");
        };
        const mv = (ev) => { if (Math.abs(ev.clientX - x0) > 8 || Math.abs(ev.clientY - y0) > 8) end(); };
        el.classList.add("hold");
        timer = setTimeout(() => {
          end();
          if ((this._scrollAt || 0) > t0) return;
          pcHaptic("medium");
          this._skPart = Number(el.dataset.skpart);
          this._skEatClick = true;
          this._sheet = "skpart";
          this._render();
        }, 380);
        window.addEventListener("pointermove", mv);
        window.addEventListener("pointerup", end, true);
        window.addEventListener("pointercancel", end, true);
      });
    });
    this._each("[data-skpartdone]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.dataset.skpartdone;
      pcHaptic("success");
      this._hass.callService(id.split(".")[0], "press", { entity_id: id });
      this._sheet = null;
      this._render();
    }));
    /* Server page tabs. */
    this._each("[data-sksys]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._page = el.dataset.sksys;
      this._render();
    }));
    /* The volume ladder: tap or drag across the rungs. Painted in place while
       the finger moves (a render would detach the node under it), sent once
       on release, and the release is bound to the window so it cannot be missed.
       Nothing moves until the gesture has said what it is: a sideways move past
       10px, more across than down, is a drag, a vertical one is the page's scroll and lets go, and a
       release that never moved is a tap. A CANCEL sends nothing and puts the
       rungs back — the browser cancels exactly when it takes a scroll, and
       treating that as a release set the volume to wherever a swipe began. */
    this._each("#sk-ladder", (lad) => lad.addEventListener("pointerdown", (e) => {
      const ent = lad.dataset.entity;
      if (!ent || (e.button != null && e.button > 0)) return;
      const rungs = Array.from(lad.querySelectorAll("i"));
      const out = this.shadowRoot.getElementById("sk-volv");
      const was = rungs.map((x) => x.classList.contains("on"));
      const wasTxt = out ? out.textContent : null;
      const x0 = e.clientX, y0 = e.clientY, t0 = Date.now();
      /* A touch within 150ms of a scroll is a thumb stopping a coasting page,
         not a choice of volume — it may still become a drag, never a tap. */
      const coasting = !!(this._scrollAt && t0 - this._scrollAt < 150);
      let v = null, live = false;
      const set = (ev) => {
        const r = lad.getBoundingClientRect();
        if (!r.width) return;
        v = Math.round(skClamp((ev.clientX - r.left) / r.width) * 100);
        rungs.forEach((x, i) => x.classList.toggle("on", i < Math.round(v / 100 * rungs.length)));
        if (out) out.textContent = v;
      };
      const restore = () => {
        rungs.forEach((x, i) => x.classList.toggle("on", was[i]));
        if (out && wasTxt != null) out.textContent = wasTxt;
      };
      const end = () => {
        window.removeEventListener("pointermove", mv);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", cancel, true);
        this._dragging = false;
      };
      const mv = (ev) => {
        if (!live) {
          const dx = Math.abs(ev.clientX - x0), dy = Math.abs(ev.clientY - y0);
          if (dy > 10 && dy >= dx) { end(); restore(); return; }
          if (dx <= 10 || dx <= dy) return;
          live = true;
          this._dragging = true;
        }
        set(ev);
      };
      const up = (ev) => {
        /* The page moved under the finger: a scroll, whatever the pointer says. */
        if (!live && (coasting || (this._scrollAt || 0) > t0)) { end(); restore(); return; }
        if (!live) set(ev);
        end();
        if (v != null) this._hass.callService("media_player", "volume_set", { entity_id: ent, volume_level: v / 100 });
      };
      const cancel = () => { end(); restore(); };
      window.addEventListener("pointermove", mv);
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", cancel, true);
    }));
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
    this._skHook();
    this._skSafe(bar);
    const barR = bar.getBoundingClientRect();
    const ins = this._skIns || 0;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    let solid = 0, title = 0;
    if (view === "home") {
      const hero = root.getElementById("sk-hero");
      const hr = hero ? hero.getBoundingClientRect() : null;
      const y = hr ? Math.max(0, barR.top - ins - hr.top) : 0;
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
        /* A gap between on and off, so a card resting on the line cannot
           chatter. The pill row no longer moves the cards (it hangs below the
           bar, out of flow), so this is belt and braces, not the fix. */
        const was = pill.classList.contains("on");
        const b = c.getBoundingClientRect().bottom, line = barR.top + 112;
        const on = was ? b < line + 16 : b < line;
        if (was !== on) pill.classList.toggle("on", on);
        if (on) any = true;
      });
      if (bar.classList.contains("pilled") !== any) bar.classList.toggle("pilled", any);
    } else {
      const ttl = root.querySelector(".sk-view.on .sk-ttl");
      const tr = ttl ? ttl.getBoundingClientRect() : null;
      /* The title rests IN the bar's row, so "under the bar" is measured from
         that resting place: nothing until it has moved, solid within 24px,
         the bar's own title in as the big one's foot passes the bar's. */
      const y = tr ? Math.max(0, barR.top - tr.top) : 0;
      solid = skClamp(y / 24);
      title = tr ? skClamp((barR.bottom - tr.bottom - 4) / 30) : 1;
      if (bar.classList.contains("pilled")) bar.classList.remove("pilled");
    }
    /* Joel: the cursor on the pinned night follows the event row under it. */
    if (view === "joel") {
      const box = root.getElementById("sk-bigrail"), cur = root.getElementById("sk-cursor"), hero = root.getElementById("sk-c-night");
      const rows = Array.from(root.querySelectorAll(".sk-ev"));
      if (box && cur && hero && rows.length) {
        const line = hero.getBoundingClientRect().bottom + 40;
        let act = 0;
        rows.forEach((r, i) => { if (r.getBoundingClientRect().top <= line) act = i; });
        rows.forEach((r, i) => { if (r.classList.contains("on") !== (i === act)) r.classList.toggle("on", i === act); });
        const t = Number(rows[act].dataset.t), T0 = Number(box.dataset.t0), T1 = Number(box.dataset.t1);
        cur.style.left = (skClamp((t - T0) / (T1 - T0)) * 100).toFixed(2) + "%";
        const b = cur.querySelector("b");
        if (b) b.textContent = new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      }
    }
    /* Climate: the room row under the pinned chart lights its line. */
    if (view === "climate") {
      const chart = root.getElementById("sk-chart"), card = root.getElementById("sk-c-chart");
      if (chart && card) {
        const cr = card.getBoundingClientRect();
        const stuck = cr.top <= barR.bottom + 14;
        let act = null;
        if (stuck) root.querySelectorAll(".sk-room").forEach((r) => { if (r.getBoundingClientRect().top <= cr.bottom + 30) act = r.dataset.skroom; });
        root.querySelectorAll(".sk-room").forEach((r) => { const on = r.dataset.skroom === act; if (r.classList.contains("on") !== on) r.classList.toggle("on", on); });
        if (act == null) chart.removeAttribute("data-act"); else chart.setAttribute("data-act", act);
        const t = root.getElementById("sk-chartt"), v = root.getElementById("sk-chartv");
        const row = act == null ? null : root.querySelector(`.sk-room[data-skroom="${act}"] .nm`);
        if (t) t.textContent = row ? row.firstChild.textContent.trim() : "Rooms";
        if (v) v.textContent = act == null ? "24h" : (root.querySelector(`.sk-room[data-skroom="${act}"] .sk-rv`) || {}).textContent || "24h";
      }
    }
    /* Listen: the cover steps back as you scroll past it. */
    if (view === "media" && !reduce) {
      const art = root.getElementById("sk-art");
      if (art) {
        const r = art.getBoundingClientRect();
        const q = skClamp((barR.bottom + 40 - r.top) / 320);
        art.style.transform = `scale(${(1 - q * 0.14).toFixed(3)}) translateY(${(q * 36).toFixed(1)}px)`;
      }
    }
    bar.style.setProperty("--solid", solid.toFixed(3));
    bar.style.setProperty("--titlep", title.toFixed(3));
    /* The bar's title is written onto ITSELF, not left to inherit --titlep.
       iOS WebKit did not always repaint a child whose opacity reads an
       inherited variable: back at the top, --titlep and --solid both said 0
       and the ground had cleared, but the collapsed "56° Sunny · Tue" stayed
       painted at half strength over the avatars (2026-11-24, after v1.97.5
       had already fixed the scroll events). A style on the node itself is
       always invalidated, and at 0 it is hidden outright so a stale layer
       has nothing left to show. */
    const bt = root.getElementById("sk-bart");
    if (bt && bt.style) {
      const op = title.toFixed(3);
      if (bt.style.opacity !== op) {
        bt.style.opacity = op;
        bt.style.transform = `translateY(${((1 - title) * 6).toFixed(1)}px)`;
        bt.style.visibility = title > 0 ? "visible" : "hidden";
      }
    }

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
      /* Direction is measured from where it last turned, not frame to frame:
         a slow scroll moves under 6px a frame and never registered, and any
         jump the browser made on its own counted as a direction. Each view
         starts fresh — a restored offset is not a scroll. */
      if (this._skAnchorView !== view || this._skAnchor == null) {
        this._skAnchorView = view;
        this._skAnchor = y;
        mini.classList.remove("slim");
      }
      const slim = mini.classList.contains("slim");
      if (y < 80) {
        if (slim) mini.classList.remove("slim");
        this._skAnchor = y;
      } else if (!slim) {
        if (y < this._skAnchor) this._skAnchor = y;
        else if (y - this._skAnchor > 24 && y > 140) { mini.classList.add("slim"); this._skAnchor = y; }
      } else {
        if (y > this._skAnchor) this._skAnchor = y;
        else if (this._skAnchor - y > 24) { mini.classList.remove("slim"); this._skAnchor = y; }
      }
    }
  }

  /* How much of the top of the screen the bar covers: the bar, plus the pill
     row hanging under it when there is one. Its BOTTOM, not its height — the
     bar is translated down by the inset. */
  _skCover() {
    const bar = this.shadowRoot && this.shadowRoot.getElementById("sk-bar");
    if (!bar || !bar.getBoundingClientRect) return 100;
    return Math.max(0, bar.getBoundingClientRect().bottom) + (bar.classList.contains("pilled") ? 46 : 0);
  }

  /* The notch, measured, against what already covers it. Two numbers:
     - the PAD is static: how much of the notch sits over the card's own top at
       the top of the page (0 under HA's toolbar, the whole notch in kiosk);
     - the INSET is live: how far the bar, where it now sits, still reaches up
       into the notch. 0 while the toolbar is showing, 47 once it has scrolled
       away. The bar's untransformed top does not depend on the inset, so
       writing it cannot feed back into the next read. Written only on change. */
  _skSafe(bar) {
    const root = this.shadowRoot;
    const probe = root.getElementById("sk-safeprobe");
    const safe = probe && probe.getBoundingClientRect ? probe.getBoundingClientRect().height || 0 : 0;
    const sc = this._skScroller();
    const hostTop = this.getBoundingClientRect ? this.getBoundingClientRect().top + (sc ? sc.scrollTop || 0 : 0) : 0;
    const pad = Math.max(0, Math.round(safe - hostTop));
    const natural = bar.getBoundingClientRect().top - (this._skIns || 0);
    const ins = Math.max(0, Math.round(safe - natural));
    if (!this.style || typeof this.style.setProperty !== "function") return;
    if (pad !== this._skPad) { this._skPad = pad; this.style.setProperty("--sk-safepad", pad + "px"); }
    if (ins !== this._skIns) { this._skIns = ins; this.style.setProperty("--sk-inset", ins + "px"); }
  }

  getCardSize() { return 12; }

  static get styles() {
    /* The shell's sheet speaks white-alpha; rewritten once so the same rules
       read on paper. */
    return PurdyShellCard.styles.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/g, "rgba(var(--sk-fg),") + SK_STYLES;
  }
}
