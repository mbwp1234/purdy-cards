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
/* A plain number from a payload field (garage/get), or null: never a zero for a missing one. */
const skFinite = (v) => { const n = typeof v === "number" ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };

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
    /* The width tiers this card is laid out for (see _skSize). Empty is the
       phone, and the phone is the default: nothing below 700px reads it. */
    this._skW = "";
    this._skRO = null;
    this._skOnKey = (e) => this._skKey(e);
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
      window.addEventListener("keydown", this._skOnKey);
    }
    /* The card measures ITSELF, not the window: Home Assistant's sidebar and
       the view's own padding take space the viewport does not know about. A
       ResizeObserver callback runs after layout and before paint, so the tier
       is in place before the first frame anyone sees. */
    if (typeof ResizeObserver === "function" && !this._skRO) {
      this._skRO = new ResizeObserver((ents) => {
        const r = ents && ents[0] && ents[0].contentRect;
        this._skSize(r ? r.width : this.clientWidth);
      });
      this._skRO.observe(this);
    }
    this._skFromHash();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (typeof window !== "undefined" && window.removeEventListener) {
      window.removeEventListener("scroll", this._skOnScroll, { capture: true });
      window.removeEventListener("resize", this._skOnScroll);
      window.removeEventListener("keydown", this._skOnKey);
    }
    if (this._skRO) { this._skRO.disconnect(); this._skRO = null; }
    this._skLockPage(false);
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
        <section class="sk-view" data-v="home"><div class="sk-hero" id="sk-hero"><div class="sk-heroslot" id="sk-herob"></div><div class="sk-fx" id="sk-fx"></div></div><div class="sk-stack sk-homecards" id="sk-home"></div></section>
        <section class="sk-view" data-v="joel"><div class="sk-stack" id="sk-joel"></div></section>
        <section class="sk-view" data-v="climate"><div class="sk-stack" id="sk-climate"></div></section>
        <section class="sk-view" data-v="media"><div class="sk-stack" id="sk-media"></div></section>
        <section class="sk-view" data-v="house"><div class="sk-stack" id="sk-house"></div></section>
        <section class="sk-view sk-sys" data-v="sys"><div class="sk-stack" id="sk-sys"></div></section>
        <footer class="sk-foot" id="sk-foot"><div class="sk-brand" id="sk-brand"></div><div class="sk-mini" id="sk-mini"></div><nav class="sk-dock" id="sk-dock" aria-label="Tabs"></nav></footer>
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
    /* From 700px the foot is the side rail, a full screen tall, and the
       sheets are a drawer that does not sit above it. Forgetting the last
       reading means coming back to the phone measures again. */
    if (this._skHas("tab")) { this._dockH = null; return; }
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
    if (!this._sheet && !this._mode && this._skTab === "media" && (this._skFaceNow() === "listen" || this._skHas("desk"))) {
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

  /* The page holds still while a sheet is open. A sheet is a fixed overlay,
     and one too short to scroll itself hands every vertical wobble of the
     thumb on it — a handle drag, a press on a stepper — straight through to
     the page behind; overscroll-behavior only contains a box that can scroll.
     The Night page under the correction sheet moves its pinned rail and cursor
     with the scroll, so the whole screen jolted while a time was being set.
     Locked on the element that scrolls, keyed to the sheet that was actually
     DRAWN (a _sheet whose body came back empty must not freeze the page), and
     restored exactly as found. */
  _skLockPage(on) {
    if (on) {
      if (this._skLocked) return;
      const sc = this._skScroller();
      if (!sc || !sc.style) return;
      this._skLocked = sc;
      this._skLockWas = sc.style.overflow;
      sc.style.overflow = "hidden";
    } else if (this._skLocked) {
      this._skLocked.style.overflow = this._skLockWas || "";
      this._skLocked = null;
    }
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
    /* The Joel tab always opens on Today: its pages are reached from there,
       and the dock is the way home from any of them. */
    if (tab === "joel") this._skJPage = null;
    if (o.mode) {
      this._mode = o.mode;
      this._expandWatched();
    } else {
      this._mode = null;
      this._skTab = tab;
    }
    if (o.face) this._skFace = o.face;
    this._render();
    this._skToHash();
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
    const view = this._skView();
    /* A night being logged away takes the Joel tab to ember — dark, and warm
       enough that a phone at 2 AM does not light the room. */
    const ember = !!(this._skJoelEmber && this._skJoelEmber(view));
    const dark = this._skDark() || ember;
    if (this.getAttribute && this.getAttribute("data-sk-theme") !== (dark ? "dark" : "light")) {
      this.setAttribute("data-sk-theme", dark ? "dark" : "light");
    }
    if (this.toggleAttribute && this.hasAttribute && this.hasAttribute("data-sk-ember") !== ember) this.toggleAttribute("data-sk-ember", ember);
    const root = this.shadowRoot;
    root.querySelectorAll(".sk-view").forEach((v) => {
      const on = v.dataset.v === view;
      if (v.classList.contains("on") !== on) v.classList.toggle("on", on);
    });
    const skRoot = root.getElementById("sk");
    if (skRoot && skRoot.dataset.view !== view) skRoot.dataset.view = view;

    this._patch("sk-bart", this._skBarTitle(view, now));
    this._patch("sk-barr", this._skBell(faults));
    this._patch("sk-brand", this._skHas("tab") ? this._skBrand(now) : "");
    this._patch("sk-dock", this._skDock(view));
    this._patch("sk-mini", view === "media" ? "" : this._miniHtml());

    if (view === "home") {
      this._patch("sk-herob", this._skHero(now, faults));
      /* Its own slot: the seasons animate, and the hero repaints every tick. */
      this._patch("sk-fx", this._skFx(this._skClock(now)));
      const home = this._skHome(faults);
      this._patch("sk-home", home.html);
      this._patch("sk-pills", home.pills);
    } else {
      this._patch("sk-pills", "");
      const html = { joel: () => this._skJoel(), climate: () => this._skClimate(), media: () => this._skMedia(), house: () => this._skHouse(), sys: () => this._skSys(faults) }[view]();
      this._patch("sk-" + view, html);
    }

    const sheet = this._sheetHtml(faults);
    this._patchSheet(sheet);
    this._skLockPage(!!sheet);
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
    if (this._sheet === "lake") return this._skLakeSheet();
    if (this._sheet === "litter") return this._skLitterSheet();
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
    if (view === "joel" && this._skJPage && SKJ_PAGES[this._skJPage]) {
      return `<span>${psEsc(SKJ_PAGES[this._skJPage])}</span><small>${psEsc(this._skTabName("joel"))}</small>`;
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
    /* The sidebar's roll-ups are drawn only where they show. On the phone
       they would be hidden text that still changes the dock's string, and a
       dock repainted under a thumb because the temperature moved is a tap
       lost. */
    const vals = this._skHas("desk") ? this._skTabVals() : null;
    const keys = tabs.map((t, n) => n < 9 ? ` aria-keyshortcuts="${n + 1}"` : "");
    return `<span class="sk-lens" style="--n:${tabs.length};--i:${i}"></span>` + tabs.map((t, n) => `
      <button class="sk-db ${t.key === cur ? "on" : ""}" type="button" data-sktab="${t.key}"${t.key === cur ? ` aria-current="page"` : ""}${vals ? keys[n] : ""}>
        <ha-icon icon="${t.icon}"></ha-icon><span>${psEsc(t.key === "joel" ? this._skTabName("joel") : t.name)}</span>${
          vals && vals[t.key] ? `<span class="sk-dv">${psEsc(vals[t.key])}</span>` : ""}</button>`).join("");
  }

  /* ------------------------------------------------------------- widths --- */

  /* Tiers, not pixels: each is a token in data-sk-w, so ">= 940" is
     [data-sk-w~="split"] and a rule says which layout it belongs to.
       tab    700   the dock stands up into a rail; sheets become a drawer
       split  940   the detail tabs go two-pane
       desk  1100   a labelled sidebar; Home becomes a grid; Watch and Listen together
       wide  1500   three columns; content stops widening at 1320
     Coming DOWN through a line takes 12px more than going up, so a scrollbar
     that comes and goes with the layout cannot flip the layout back. */
  _skSize(w) {
    if (!(w > 0)) return;
    const had = this._skW || "";
    const t = [[700, "tab"], [940, "split"], [1100, "desk"], [1500, "wide"]]
      .filter(([px, k]) => w >= (this._skHas(k) ? px - 12 : px)).map(([, k]) => k).join(" ");
    if (t === had) return;
    this._skW = t;
    if (this.setAttribute) {
      if (t) this.setAttribute("data-sk-w", t); else this.removeAttribute("data-sk-w");
    }
    if (this._mounted && this._hass) this._render();
  }

  _skHas(k) { return (" " + (this._skW || "") + " ").indexOf(" " + k + " ") >= 0; }

  /* What each tab would tell you if you opened it, one fact each, for the
     sidebar: a night's length, a reading, a room, a count. Never the tab's
     own name again — the chip rule. Home has no roll-up; it IS the roll-up. */
  _skTabVals() {
    const out = {};
    try {
      const N = this._skNurse();
      const n = N && N.m.nightSession;
      if (n) out.joel = n.active ? "asleep" : psHM(n.asleepMinutes);
    } catch (e) { /* no nursery model yet */ }
    const C = this._skClim();
    if (C && C.cur != null) out.climate = `${C.cur.toFixed(1)}°`;
    const np = this._nowPlaying && this._nowPlaying();
    if (np) out.media = np.name;
    else {
      const sec = this._skSec("nowplaying");
      const on = ((sec && sec.tvs) || []).find((t) => {
        const st = pcState(this._hass, t.media_player || t.remote);
        return st && st !== "off" && st !== "unavailable" && st !== "unknown";
      });
      if (on) out.media = `${on.name} TV`;
    }
    const lsec = this._skSec("lights");
    if (lsec) out.house = `${this._lightList(lsec).filter((l) => l.on && !l.cfg.protect && !l.gone).length} lit`;
    return out;
  }

  /* The rail's head: a little sky in a square, the same band as the hero,
     with the sun or the moon in it. Words only where the sidebar has room. */
  _skBrand(now) {
    const band = this._skBand(this._skClock(now));
    const words = this._skHas("desk")
      ? `<span class="sk-bt"><b>Skylight</b><small>${psEsc(now.toLocaleDateString([], { weekday: "short" }))} · ${psEsc(now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</small></span>` : "";
    return `<button class="sk-brandb" type="button" data-sktab="home" aria-label="Home"><span class="sk-orb sky-${band}"><i></i></span>${words}</button>`;
  }

  /* Keys, where there is a keyboard to press them: 1-5 are the tabs in dock
     order, Escape closes a sheet. Never while typing, never with a modifier,
     and only once the layout is a desktop's — a phone's Bluetooth keyboard
     is not a reason to change how the phone behaves. */
  _skKey(e) {
    if (!this._skHas("tab") || !this.isConnected || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
    const t = path[0];
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable)) return;
    if (e.key === "Escape") {
      if (this._sheet) { this._sheet = null; this._render(); e.preventDefault(); }
      return;
    }
    if (!/^[1-9]$/.test(e.key)) return;
    const tabs = SK_TABS.filter((x) => !x.type || this._skSec(x.type));
    const tab = tabs[Number(e.key) - 1];
    if (!tab) return;
    e.preventDefault();
    this._skGo(tab.key);
  }

  /* A tab is a link on a desktop: #joel, #climate… so a bookmark or a second
     window opens where you meant. Written with replaceState (no history entry
     per tab, and Home Assistant's router never hears it) and only from 700px;
     read on connect at any width, and only when it names a tab exactly. */
  _skToHash() {
    if (!this._skHas("tab") || typeof history === "undefined" || !history.replaceState || typeof location === "undefined") return;
    const want = this._mode === "systems" ? "#nas" : this._skTab === "home" ? "" : "#" + this._skTab;
    if ((location.hash || "") === want) return;
    try { history.replaceState(history.state, "", location.pathname + location.search + want); } catch (e) { /* a sandboxed frame */ }
  }

  _skFromHash() {
    if (typeof location === "undefined" || !this._config) return;
    const h = String(location.hash || "").replace(/^#/, "");
    if (!h || this._skHashDone === h) return;
    this._skHashDone = h;
    if (h === "nas" && this._sysCfg && this._sysCfg()) { this._skTab = "house"; this._mode = "systems"; return; }
    const tab = SK_TABS.find((x) => x.key === h && (!x.type || this._skSec(x.type)));
    if (tab) { this._skTab = tab.key; this._mode = null; }
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
    const sky = this._skClock(now);
    const band = this._skBand(sky);
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
      <div class="sk-sky sky-${band}"><div class="sk-stars"></div>${this._skArc(sky)}</div>
      <div class="sk-heroin sky-${band}" id="sk-heroin">
        <div class="sk-htop"><div class="sk-ppl">${this._hdrPeople({ sky: true })}</div></div>
        <div class="sk-greet" id="sk-greet"><div class="sk-hi">${this._skGreeting(now)}${who ? `, ${psEsc(who)}` : ""}</div>
          <div class="sk-date">${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div></div>
        <button class="sk-temp" type="button" id="sk-temp" data-sheet="wx" aria-label="Weather: ${t == null ? "no reading" : Math.round(t) + " degrees"}">
          <span class="sk-tn">${t == null ? `<span class="ps-nodata">—</span>` : `${Math.round(t)}<sup>°</sup>`}</span>
          <span class="sk-tc"><ha-icon icon="${pcWxIcon(st)}"></ha-icon><span>${psEsc(pcWxText(st) || "")}</span>${
            feels == null ? "" : `<span class="sk-feels">feels ${Math.round(feels)}°</span>`}</span>
        </button>
        ${today}
        ${chips ? `<div class="sk-hchips">${chips}</div>` : ""}
        ${this._skHas("desk") ? this._skHeroWeek() : ""}
      </div>`;
  }

  /* From 1100px the week rides in the sky on glass, beside the reading it
     extends, and the Home card that carried it steps aside. Same capsules,
     same door to the weather sheet. */
  _skHeroWeek() {
    if (!this._weatherSection()) return "";
    return `<div class="sk-hweek" data-sheet="wx" role="button" tabindex="0" aria-label="The week ahead">
        <div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-cool)"><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon></span><span class="sk-hn">This week</span></div>
        <div class="sk-week">${this._skWeekRail()}</div></div>`;
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

  /* Named, worst first, three at most — the desk's rule. With nothing raised
     there is no chip: an empty row is the all-clear. */
  _skFaultChips(faults) {
    if (pcOffline(this._hass)) return `<span class="ps-chip bad"><span class="ps-dot"></span>Reconnecting…</span>`;
    if (!faults.length) return "";
    /* ONE row, always (v1.109.0). Two worded chips wrapped onto a second line
       and that line ran into the sun's arc. A fault is now its glyph, plus a
       tag only where the fault carries arithmetic (a count, an age); the words
       ride on the label and the alerts sheet one tap away. Three fit beside
       the wet chip at 390px, so a fourth folds into "+N" with the third. */
    const cls = (f) => (f.severity === "critical" ? "bad" : f.severity === "warn" ? "warn" : "");
    const ico = (f) => f.icon || (f.severity === "critical" ? "mdi:alert-circle-outline" : "mdi:alert-outline");
    const shown = faults.length > 3 ? faults.slice(0, 2) : faults;
    return shown.map((f) => {
      const words = f.short || f.title;
      return `<button class="ps-chip sk-ichip ${cls(f)}${f.tag ? "" : " solo"}" type="button" data-sheet="alerts" title="${psEsc(words)}" aria-label="${psEsc(words)}"><ha-icon icon="${psEsc(ico(f))}"></ha-icon>${
        f.tag ? `<span>${psEsc(f.tag)}</span>` : ""}</button>`;
    }).join("")
      + (faults.length > 3 ? `<button class="ps-chip sk-ichip solo more" type="button" data-sheet="alerts" aria-label="${faults.length - 2} more">+${faults.length - 2}</button>` : "");
  }

  /* The first wet day and how likely — a roll-up, so it is allowed a chip.
     The glyph says rain or snow; the words stay on the label. */
  _skWetChip() {
    const wet = (this._wxFc || []).find((d) => d.pop != null && d.pop >= 50);
    if (!wet) return "";
    const when = wet.today ? (new Date(this._nowMs()).getHours() >= 17 ? "tonight" : "today") : this._wxDow(wet.ts, false);
    const word = skWetWord(wet.condition), pop = Math.round(wet.pop);
    const icon = /snow/i.test(word) ? "mdi:weather-snowy" : "mdi:umbrella-outline";
    return `<button class="ps-chip cool sk-ichip sk-wet" type="button" data-sheet="wx" aria-label="${psEsc(`${word} ${when} · ${pop}%`)}"><ha-icon icon="${icon}"></ha-icon><span>${psEsc(when)} ${pop}%</span></button>`;
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
      const media = this._skMediaHome("home");
      const liveNp = this._nowPlaying && this._nowPlaying();
      /* Your order (2026-11-27): what is playing, then what needs you, then
         Joel, Climate, the week and the garage as cards, the tiles below.
         Media is on Home only while something is on — two TVs that are off
         were a 195px card saying "Off" twice. */
      if (media) push("now", media, { icon: "mdi:music-note", text: liveNp ? (liveNp.st.attributes.media_title || "Playing") : "Media", tab: "media", color: "var(--sk-media)" }, "sk-pad");
      const crewH = this._skSec("crew");
      if (crewH) {
        const needs = this._secCrew(crewH);
        if (needs) push("needs", `<div class="ps-sect">${needs}</div>`, null);
      }
      const jsec = this._skSec("nursery");
      if (jsec) {
        const N = this._skNurse();
        const n = N && N.m.nightSession;
        push("joel", this._skJoelHome(), { icon: "mdi:weather-night", text: n ? psHM(n.asleepMinutes).replace(" ", "") : "Joel", tab: "joel", color: "var(--ps-deep)" }, "sk-pad sk-tap");
      }
      const C = this._skClim();
      if (C) push("clim", this._skClimateHome(), { icon: "mdi:thermostat", text: C.cur == null ? "Climate" : `${C.cur.toFixed(1)}°`, tab: "climate", color: "var(--ps-heat)" }, "sk-pad sk-tap");
      const wsec = this._weatherSection();
      /* From 1100px the week is in the sky (_skHeroWeek), not a card. */
      if (wsec && !this._skHas("desk")) {
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
      const veh = this._skVehicleHome();
      if (veh) push("truck", veh.html, veh.pill, "sk-pad sk-veh");
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

  /* `vehicle:` is a TOP-LEVEL key, so the section walk never sees it — the same
     treatment weather_fx and people needed. It takes one vehicle or a list. */
  _skVehCfgs() {
    const v = this._config.vehicle;
    return (Array.isArray(v) ? v : v ? [v] : []).filter((x) => x && typeof x === "object");
  }

  _collectWatched() {
    const ids = super._collectWatched();
    this._skVehCfgs().forEach((v) => [v.entity, v.next, v.fuel].forEach((x) => { if (x && ids.indexOf(x) < 0) ids.push(x); }));
    /* The real tree's switch: an off tree is drawn dark. */
    const tree = (this._config.sky || {}).tree;
    if (tree && ids.indexOf(tree) < 0) ids.push(tree);
    if (ids.indexOf("sun.sun") < 0) ids.push("sun.sun");
    const sit = this._config.sitter || {};
    [sit.mode, sit.log, sit.opens, sit.arrived].forEach((x) => { if (x && ids.indexOf(x) < 0) ids.push(x); });
    const lake = this._config.lake || {};
    [lake.entity].concat((Array.isArray(lake.also) ? lake.also : []).map((a) => a && a.entity)).forEach((x) => { if (x && ids.indexOf(x) < 0) ids.push(x); });
    return ids;
  }

  /* One slot per configured vehicle: what garage/get last said, and its picture. */
  _skVehSlot(i) {
    this._skVs = this._skVs || [];
    return this._skVs[i] || (this._skVs[i] = { data: null, sig: null, busy: false, img: null, imgFor: null });
  }

  /* The Garage integration owns the maths (what is due, where it lives on the
     vehicle, when the next one lands); this card only draws it. One read of
     garage/get per vehicle whenever its overdue or next-service sensor changes —
     never a second derivation here, which is how the morning recap drifted. */
  _skVehLoad() {
    const h = this._hass;
    if (!h || typeof h.callWS !== "function") return;
    this._skVehCfgs().forEach((v, i) => {
      const slot = this._skVehSlot(i);
      const sig = [v.entity, v.next].map((id) => { const s = id && h.states[id]; return s ? s.state + "@" + s.last_updated : ""; }).join("|");
      if (slot.busy || (slot.data && slot.sig === sig)) return;
      slot.busy = true;
      const msg = { type: "garage/get" };
      if (v.entry) msg.entry_id = v.entry;
      Promise.resolve(h.callWS(msg)).then((r) => {
        slot.data = r && r.vehicle ? { v: r.vehicle, settings: r.settings || {}, logged: (r.log || []).length } : null;
        slot.sig = sig;
        this._skVehImage(slot);
      }).catch(() => { slot.sig = sig; })
        .then(() => { slot.busy = false; this._render(); });
    });
  }

  /* The picture lives in the vehicle's folder on the share, behind auth, so it
     is fetched once into a blob URL. The URL is part of the rendered string and
     never changes, so the patching renderer keeps the <img>. */
  _skVehImage(slot) {
    const V = slot.data && slot.data.v, h = this._hass;
    if (!V || slot.imgFor === V.entry_id || !h || typeof h.fetchWithAuth !== "function") return;
    slot.imgFor = V.entry_id;
    Promise.resolve(h.fetchWithAuth("/api/garage/" + V.entry_id + "/image")).then((r) => (r && r.ok ? r.blob() : null))
      .then((b) => { if (b && typeof URL !== "undefined") { slot.img = URL.createObjectURL(b); this._render(); } })
      .catch(() => {});
  }

  /* "2 wk", "Dec", "2028": how far off a date is, at the grain that matters. */
  _skVehWhen(iso) {
    const p = String(iso || "").split("-");
    if (p.length !== 3) return "";
    const d = new Date(+p[0], +p[1] - 1, +p[2]);
    const days = Math.round((d.getTime() - this._nowMs()) / 864e5);
    if (days <= 1) return "now";
    if (days < 10) return `${days} days`;
    if (days < 60) return `${Math.round(days / 7)} wk`;
    return d.toLocaleDateString("en-US", days < 330 ? { month: "short" } : { month: "short", year: "numeric" });
  }

  /* The one number for a vehicle. An overdue count names its item ("overdue · Grease"):
     a red number that stays red for months and says nothing else gets tuned out. A
     vehicle with nothing logged yet is a setup chore, not news, so it shows its mileage
     and a quiet "not set up yet" — never "nothing due" in green, which is a claim, and
     never a big grey count that outweighs the other vehicle's red one. */
  _skVehStatus(slot) {
    const V = slot && slot.data && slot.data.v;
    if (!V || !V.summary) return null;
    const s = V.summary;
    if (s.over) {
      const names = s.overdue_items || [];
      const what = names.length ? names[0] + (names.length > 1 ? ` +${names.length - 1}` : "") : "";
      return { cls: "over", n: String(s.over), label: "overdue", what, pill: `${s.over} due`, color: "var(--ps-bad)" };
    }
    if (s.soon) return { cls: "soon", n: String(s.soon), label: "due soon", pill: `${s.soon} soon`, color: "var(--ps-warn)" };
    if (s.nolog && !slot.data.logged) {
      const odo = skFinite(V.odometer);
      return { cls: "nolog", n: odo == null ? "—" : Math.round(odo).toLocaleString("en-US"), unit: odo == null ? "" : "mi",
        label: "not set up yet", row: `${s.nolog} never logged`, pill: `${s.nolog} to log`, color: "var(--ps-dim)" };
    }
    const nx = s.next;
    return nx ? { cls: "ok", n: Math.round(nx.remaining).toLocaleString("en-US"), label: `mi to ${nx.short}`, pill: nx.short, color: "var(--ps-good)" }
      : { cls: "ok", n: "—", label: "nothing due", pill: V.name || "Vehicle", color: "var(--ps-good)" };
  }

  /* The number and its caption, shared by the one-vehicle and the shared card. */
  _skVehNum(st, sm) {
    return `<span class="sk-vnum${sm ? " sm" : ""} ${st.cls}"><b>${psEsc(st.n)}${st.unit ? `<small>${psEsc(st.unit)}</small>` : ""}</b>` +
      `<span>${psEsc(st.label)}${st.what ? ` · <em>${psEsc(st.what)}</em>` : ""}</span></span>`;
  }

  _skVehAria(V, st) {
    return `${V.name || "Vehicle"}: ${st.n}${st.unit ? " " + st.unit : ""} ${st.label}${st.what ? ", " + st.what : ""}`;
  }

  _skVehPath(cfg, V, many) {
    return cfg.path || ("/garage" + (many && V && V.name ? "?vehicle=" + encodeURIComponent(V.name) : ""));
  }

  /* The picture with a dot where something is overdue or due soon. */
  _skVehArt(slot) {
    const V = slot.data.v;
    const hs = (slot.data.settings && slot.data.settings.hotspots) || {};
    const rank = { over: 0, soon: 1 };
    const zones = {};
    (V.items || []).forEach((i) => {
      if (rank[i.status] == null || !hs[i.zone]) return;
      if (zones[i.zone] == null || rank[i.status] < rank[zones[i.zone]]) zones[i.zone] = i.status;
    });
    const dots = slot.img ? Object.keys(zones).map((z) =>
      `<i class="sk-vdot ${zones[z]}" style="left:${Number(hs[z][0])}%;top:${Number(hs[z][1])}%"></i>`).join("") : "";
    return slot.img ? `<span class="sk-vart"><img src="${slot.img}" alt="">${dots}</span>`
      : `<span class="sk-vart none"><ha-icon icon="mdi:car-wrench"></ha-icon></span>`;
  }

  /* Fuel is read live, not from the snapshot: it moves while nothing is due. A
     sleeping tank is MISSING, drawn hatched — never an empty tank. A vehicle with
     no fuel sensor at all draws no gauge: a track that can never carry a reading.
     The figure is RANGE when Garage knows an mpg (learned, else the assumed one in
     settings), because the decision is "fill up before leaving home?", and below
     `fuel_low_mi` (30, the fill-up automation's line) the gauge turns amber. */
  _skVehFuel(cfg, V, settings) {
    const fuelId = cfg.fuel || V.fuel_entity;
    if (!fuelId) return "";
    const litres = pcNum(this._hass, fuelId);
    const pct = litres != null && V.tank_l ? skClamp(litres / V.tank_l) * 100 : null;
    const mpg = skFinite((V.economy && V.economy.mpg) != null ? V.economy.mpg : (settings || {}).mpg);
    const range = litres != null && mpg ? Math.round(litres / 3.78541 * mpg) : null;
    const lowAt = skFinite(cfg.fuel_low_mi) != null ? skFinite(cfg.fuel_low_mi) : 30;
    const low = range != null && range < lowAt;
    const txt = pct == null ? "—" : range != null ? `≈${range.toLocaleString("en-US")} mi` : Math.round(pct) + "%";
    return `<span class="sk-vfuel${low ? " low" : ""}"><ha-icon icon="mdi:gas-station-outline"></ha-icon>
        <span class="sk-vcap${pct == null ? " none" : ""}"><i style="width:${pct == null ? 0 : pct.toFixed(0)}%"></i></span><span>${txt}</span></span>`;
  }

  /* Home: one picture and one number. With one vehicle the chip is the next
     service's ETA — a different fact from the count, never a restatement. With
     several, ONE Garage card carries a column each (a picture and a number), and
     the pill counts across them. */
  _skVehicleHome() {
    const cfgs = this._skVehCfgs();
    if (!cfgs.length) return null;
    this._skVehLoad();
    const rows = cfgs.map((cfg, i) => ({ cfg, slot: this._skVehSlot(i) })).filter((r) => r.slot.data && r.slot.data.v);
    if (!rows.length) return null;
    if (cfgs.length === 1) {
      const { cfg, slot } = rows[0];
      const V = slot.data.v;
      const st = this._skVehStatus(slot);
      const nx = (V.summary || {}).next;
      const when = nx && nx.eta ? this._skVehWhen(nx.eta) : "";
      const chip = nx && when ? `<span class="ps-chip"><ha-icon icon="mdi:clock-outline"></ha-icon>${psEsc(nx.short)} ≈ ${psEsc(when)}</span>` : "";
      const html = `<div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-truck)"><ha-icon icon="mdi:car-wrench"></ha-icon></span><span class="sk-hn">${psEsc(V.name || "Vehicle")}</span>${chip}</div>
      <div class="sk-vbody" data-sknav="${psEsc(this._skVehPath(cfg, V, false))}" role="button" tabindex="0" aria-label="${psEsc(this._skVehAria(V, st))}">
        ${this._skVehNum(st, false)}${this._skVehArt(slot)}</div>${this._skVehFuel(cfg, V, slot.data.settings)}`;
      return { html, pill: { icon: "mdi:car-wrench", text: st.pill, color: st.color } };
    }
    const cols = rows.map(({ cfg, slot }) => {
      const V = slot.data.v, st = this._skVehStatus(slot);
      return `<div class="sk-vcol" data-sknav="${psEsc(this._skVehPath(cfg, V, true))}" role="button" tabindex="0" aria-label="${psEsc(this._skVehAria(V, st))}">
        ${this._skVehArt(slot)}<span class="sk-vname">${psEsc(V.name || "Vehicle")}</span>
        ${this._skVehNum(st, true)}${this._skVehFuel(cfg, V, slot.data.settings)}</div>`;
    }).join("");
    const sum = (k) => rows.reduce((a, r) => a + ((r.slot.data.v.summary || {})[k] || 0), 0);
    const over = sum("over"), soon = sum("soon");
    const pill = over ? { icon: "mdi:car-wrench", text: `${over} due`, color: "var(--ps-bad)" }
      : soon ? { icon: "mdi:car-wrench", text: `${soon} soon`, color: "var(--ps-warn)" }
      : { icon: "mdi:car-wrench", text: "Garage", color: "var(--sk-truck)" };
    const html = `<div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-truck)"><ha-icon icon="mdi:car-wrench"></ha-icon></span><span class="sk-hn">Garage</span></div>
      <div class="sk-vgrid">${cols}</div>`;
    return { html, pill };
  }

  /* The House rows: the same front doors, one row per vehicle. */
  _skVehicleRow() {
    const cfgs = this._skVehCfgs();
    if (!cfgs.length) return "";
    this._skVehLoad();
    const many = cfgs.length > 1;
    return cfgs.map((cfg, i) => {
      const slot = this._skVehSlot(i), V = slot.data && slot.data.v;
      if (!V) return "";
      const st = this._skVehStatus(slot);
      const nx = (V.summary || {}).next;
      const sub = st.cls === "nolog" ? st.row
        : st.cls === "ok" ? (nx ? `Next: ${nx.short}` : "Nothing due") : `${st.n} ${st.label}${nx ? ` · next ${nx.short}` : ""}`;
      return `<button class="sk-card sk-rowcard" type="button" data-sknav="${psEsc(this._skVehPath(cfg, V, many))}">
        <span class="sk-ico" style="--c:var(--sk-truck)"><ha-icon icon="mdi:car-wrench"></ha-icon></span>
        <span class="ps-grow"><b>${psEsc(V.name || "Vehicle")}</b><small>${psEsc(sub)}</small></span><ha-icon icon="mdi:chevron-right"></ha-icon></button>`;
    }).join("");
  }

  /* The house at a glance: one picture and one number per tile. */
  _skTiles() {
    const h = this._hass;
    const T = {};
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
      T.lights = (`<button class="sk-tile ${lit.length ? "lit" : ""}" type="button" data-sktab="house" data-skto="sk-c-lights" aria-label="${lit.length} lights on">
          ${glow ? `<span class="sk-tglow" style="background:${glow}"></span>` : ""}
          <span class="sk-trow"><span class="sk-ico" style="--c:var(--sk-lamp)"><ha-icon icon="mdi:lightbulb-outline"></ha-icon></span>
            <span class="sk-pips">${ls.map((l) => `<i class="${l.gone ? "x" : l.on ? "on" : ""}" style="--g:rgb(${skKelvin(l.kelvin || 2700)})"></i>`).join("")}</span></span>
          <span class="sk-tv"><b>${lit.length}</b><small>on</small></span>
          <span class="sk-tlab">${psEsc(lit.map((l) => l.name).join(" · ") || "All off")}</span></button>`);
    }
    const sit = this._skSitTile();
    if (sit) T.sit = sit;
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
      T.vac = (`<button class="sk-tile" type="button" data-sktab="house" data-skto="sk-c-crew" aria-label="${psEsc(v.name || "Vacuum")}, ${psEsc(state)}">
          <span class="sk-trow"><span class="sk-ring"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="${R}" class="tr"/>${
            ring == null ? "" : `<circle cx="22" cy="22" r="${R}" class="fl" stroke-dasharray="${(C * skClamp(ring / 100)).toFixed(1)} ${C.toFixed(1)}"/>`}</svg>
            <ha-icon icon="mdi:robot-vacuum"></ha-icon></span>${worn.length ? `<span class="sk-warn" title="${psEsc(worn[0].label)} ${Math.round(worn[0].v)}%"></span>` : ""}</span>
          <span class="sk-tv">${running && prog != null ? `<b>${Math.round(prog)}</b><small>%</small>` : bat == null ? `<b class="ps-nodata">—</b>` : `<b>${Math.round(bat)}</b><small>%</small>`}</span>
          <span class="sk-tlab">${psEsc(v.name || "Vacuum")} · ${psEsc(running ? (state === "returning" ? "returning" : "cleaning") : this._humanize(state))}</span></button>`);
    }
    const l = crew && crew.litter;
    if (l && (l.waste_drawer || l.litter_level)) {
      const dr = pcNum(h, l.waste_drawer), lv = pcNum(h, l.litter_level);
      const bar = (x, cls) => `<span class="sk-tank ${cls}${x == null ? " none" : ""}"><i style="height:${x == null ? 0 : skClamp(x / 100) * 100}%"></i></span>`;
      T.litter = (`<button class="sk-tile" type="button" data-sktab="house" data-skto="sk-c-litter" aria-label="${psEsc(l.name || "Litter box")}, drawer ${dr == null ? "no reading" : Math.round(dr) + "%"}">
          <span class="sk-trow"><span class="sk-tanks">${bar(dr, "dr")}${bar(lv, "lv")}</span><span class="sk-ico" style="--c:var(--sk-litter)"><ha-icon icon="mdi:cat"></ha-icon></span></span>
          <span class="sk-tv">${dr == null ? `<b class="ps-nodata">—</b>` : `<b>${Math.round(dr)}</b><small>%</small>`}</span>
          <span class="sk-tlab">Drawer${lv == null ? "" : ` · litter ${Math.round(lv)}%`}</span></button>`);
    }
    const s = this._sysCfg && this._sysCfg();
    if (s) {
      const meters = (s.meters || []).slice(0, 3).map((m) => ({ ...m, v: pcNum(h, m.entity) }));
      const arr = meters[0];
      const r = pcReading(h, s.status);
      const online = r.ok && String(r.st.state).toLowerCase() === "online";
      T.nas = (`<button class="sk-tile" type="button" data-skmode="systems" aria-label="${psEsc(s.name || "Server")}">
          <span class="sk-trow"><span class="sk-tanks">${meters.map((m) => `<span class="sk-tank nas${m.v == null ? " none" : ""}${
            m.v != null && m.critical_above != null && m.v >= m.critical_above ? " bad" : m.v != null && m.warn_above != null && m.v >= m.warn_above ? " warn" : ""}"><i style="height:${m.v == null ? 0 : skClamp(m.v / 100) * 100}%"></i></span>`).join("")}</span>
            <span class="sk-ico" style="--c:var(--sk-nas)"><ha-icon icon="mdi:server"></ha-icon></span></span>
          <span class="sk-tv">${arr && arr.v != null ? `<b>${Math.round(arr.v)}</b><small>%</small>` : `<b class="ps-nodata">—</b>`}</span>
          <span class="sk-tlab">${psEsc(s.name || "Server")} · ${online ? psEsc(pcState(h, (s.docker || {}).running) || "online") : r.ok ? psEsc(String(r.st.state)) : "no data"}</span></button>`);
    }
    const lake = this._skLakeTile();
    if (lake) T.lake = lake;
    const w = crew && crew.washer;
    if (w && w.entity) {
      const ws = String(pcState(h, w.entity) || "").toLowerCase();
      /* A finished load is already raised twice — the hero's fault chip and
         the crew row that says "has finished" — so the tile carries a RUNNING
         washer only, the one state nothing else on Home shows. */
      if (ws && !/^(off|idle|empty|unknown|unavailable|none)$/.test(ws) && !/done|finish|complete/.test(ws)) {
        T.washer = (`<button class="sk-tile wide" type="button" data-sktab="house" data-skto="sk-c-washer">
            <span class="sk-trow"><span class="sk-ico" style="--c:var(--ps-cool)"><ha-icon icon="${psEsc(w.icon || "mdi:washing-machine")}"></ha-icon></span>
              <span class="sk-tlab" style="margin-left:10px">${psEsc(w.name || "Washer")}</span><span class="ps-chip ${/done|finish|complete/.test(ws) ? "warn" : "cool"}" style="margin-left:auto"><span class="ps-dot"></span>${psEsc(this._humanize(ws))}</span></span></button>`);
      }
    }
    /* Your order: lights, server, vacuum, litter, lake, sitter. A running
       washer is the one wide tile and closes the grid. */
    return ["lights", "nas", "vac", "litter", "lake", "sit", "washer"].map((k) => T[k] || "").join("");
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
    this._skJoelBind();
    this._skLakeBind();
    this._skLitterBind();
    /* A card that is another app's front door (the Garage panel). */
    this._each("[data-sknav]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      pcNavigate(this, el.dataset.sknav);
    }));
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
      let any = false, flipped = false;
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
        if (was !== on) { pill.classList.toggle("on", on); flipped = true; }
        if (on) any = true;
      });
      if (bar.classList.contains("pilled") !== any) bar.classList.toggle("pilled", any);
      this._skPillFit(root, bar, any);
      /* A pill that just lit is still growing; measure again once it has. */
      if (flipped) {
        clearTimeout(this._skPillT);
        this._skPillT = setTimeout(() => { const r = this.shadowRoot, b = r && r.getElementById("sk-bar"); if (b) this._skPillFit(r, b, b.classList.contains("pilled")); }, 400);
      }
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
    /* Joel: the cursor on the pinned night follows the row under it. */
    if (view === "joel") this._skJoelFrame(root);
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
    /* From 700px the cover sits BESIDE the transport (or in its own column),
       so stepping it back would only open a hole; the phone keeps it. */
    if (view === "media" && !reduce && !this._skHas("tab")) {
      const art = root.getElementById("sk-art");
      if (art) {
        const r = art.getBoundingClientRect();
        const q = skClamp((barR.bottom + 40 - r.top) / 320);
        art.style.transform = `scale(${(1 - q * 0.14).toFixed(3)}) translateY(${(q * 36).toFixed(1)}px)`;
      }
    }
    /* A two-pane column pins itself beside the long one only when it fits on
       the screen: a sticky column taller than the window hides its own foot
       until the page ends, which is worse than not pinning at all. */
    if (this._skHas("split")) {
      const vh = typeof innerHeight === "number" ? innerHeight : 900;
      root.querySelectorAll(".sk-view.on .sk-pin").forEach((c) => {
        const fit = c.offsetHeight > 0 && c.offsetHeight < vh - barR.height - 28;
        if (c.classList.contains("stuck") !== fit) c.classList.toggle("stuck", fit);
      });
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

  /* How tall the pill row is when it wraps: the foot of the lowest LIT pill,
     plus the 12px the single row always had under it. Written onto the bar as
     --sk-pillh (the ground grows to cover it) and kept for _skCover. */
  _skPillFit(root, bar, any) {
    const row = root.getElementById("sk-pills");
    let h = 46;
    if (any && row && row.getBoundingClientRect) {
      const top = row.getBoundingClientRect().top;
      let foot = 0;
      row.querySelectorAll(".sk-pill.on").forEach((p) => { foot = Math.max(foot, p.getBoundingClientRect().bottom - top); });
      h = Math.max(46, Math.round(foot) + 12);
    }
    if (this._skPillH !== h) {
      this._skPillH = h;
      bar.style.setProperty("--sk-pillh", `${h}px`);
    }
  }

  /* How much of the top of the screen the bar covers: the bar, plus the pill
     row hanging under it when there is one. Its BOTTOM, not its height — the
     bar is translated down by the inset. */
  _skCover() {
    const bar = this.shadowRoot && this.shadowRoot.getElementById("sk-bar");
    if (!bar || !bar.getBoundingClientRect) return 100;
    return Math.max(0, bar.getBoundingClientRect().bottom) + (bar.classList.contains("pilled") && !this._skHas("tab") ? (this._skPillH || 46) : 0);
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
    return PurdyShellCard.styles.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/g, "rgba(var(--sk-fg),") + SK_STYLES + SK_SKY_STYLES + SK_JOEL_STYLES + SK_LITTER_STYLES;
  }
}
