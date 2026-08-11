/* ============================================================================
 * purdy-desk-card
 *
 * The whole DESKTOP view as one element — the counterpart to purdy-shell-card,
 * not a wider copy of it.
 *
 * Why a second element rather than a `wide:` flag on the shell: the two views
 * disagree about the thing the shell is built around. The shell is ONE COLUMN
 * you scroll, where detail is bought by pushing everything below you further
 * down. The desk is ONE SHEET that never scrolls, where detail is bought with
 * WIDTH — a panel expands sideways and its neighbours fold to a headline. A
 * flag cannot straddle that: every layout rule, every "what does collapsed
 * mean", and every decision about what earns a permanent slot inverts.
 *
 * What the two DO share is everything that is not layout, and they share it by
 * borrowing rather than by copying — see PD_BORROW below. The derivations, the
 * fault engine, the recorder fetches, the optimistic setpoint and the
 * bind-once guards are the shell's, live, so a fix lands in both.
 *
 * The three rules the shell learned the hard way apply here unchanged:
 *   - it PATCHES, it does not repaint (see _patch / _patchKeyed)
 *   - no handler may close over `hass` or `config` — read this._hass live
 *   - a zero and a missing reading must never look the same
 * ========================================================================== */

/* Sections accepted in `sections:`. Same config language as purdy-shell-card,
   deliberately: a section body written for the phone pastes into the desktop
   view unchanged, and the two views cannot drift into two vocabularies.
   `sleep` is absent — the Owlet panel was retired and porting it to buy back a
   view nobody uses would be work in the wrong direction. Paste a `sleep`
   section here and setConfig says so by name rather than rendering a blank.

   As on the shell, a type has to be added HERE **and** to the dispatch in
   _panelHtml / _stripHtml / _dockHtml. Missing the list is not a broken
   section, it is a card replaced by "Configuration error" — Lovelace's answer
   to a throw from setConfig. A test asserts the two halves name the same set. */
const PD_SECTIONS = [
  "climate", "nursery", "music", "calendar", "lights",
  "people", "quick", "rooms", "systems", "nowplaying", "weather",
];

/* Which tier a section lands in when it does not say. The strip is a glance,
   the stage is what you study, the dock is what you press — Rule 03 from the
   design plan, expressed as a default rather than as required config. */
const PD_ZONE_DEFAULT = {
  climate: "stage", nursery: "stage", music: "stage", calendar: "stage",
  lights: "stage", nowplaying: "stage", weather: "stage",
  people: "strip",
  quick: "dock", rooms: "dock", systems: "dock",
};

const PD_ZONES = ["strip", "stage", "dock"];

/* Everything reused from purdy-shell-card, named in one place.
 *
 * These are the methods that are about DATA rather than about markup: the
 * recorder fetches, the fault engine and its dismissal store, the nursery
 * derivation, the music target resolution, the optimistic setpoint, and the
 * bind-once guards. None of them emit HTML, so none of them care which view is
 * asking. Copying them would have meant two fault engines and two settle-window
 * implementations, and this project already knows how that ends — the morning
 * recap and the nursery card are a second implementation of the same facts and
 * are explicitly logged as a drift risk to watch. This is the same risk
 * declined.
 *
 * The markup-emitting cousins are NOT here on purpose. `_secClimate` and
 * `_resultsHtml` describe a phone column; the desk writes its own.
 *
 * `_ringSvg` and `_sparkSvg` are the exception that proves the rule: they emit
 * SVG, but every colour in them is a CSS variable, so they are markup only in
 * the sense that geometry is. The desk declares the same `--ps-*` palette
 * NAMES in its :host for exactly this reason — the shared names are what let
 * the two rings be one function instead of two.
 */
const PD_BORROW = [
  /* recorder + calendar */
  "_collectWatched", "_historyEntities", "_startHistory", "_fetchHistory", "_fetchEvents",
  /* nursery — the derivation, the fetch and the single clock the fixtures pin */
  "_nurserySection", "_startNursery", "_fetchNursery", "_nowMs", "_nurserySessions",
  /* The corrections store. `_nurserySessions` applies it, so leaving these
     behind would have thrown out of the borrowed method the moment a nursery
     panel rendered — and more quietly, the desk would have gone on showing the
     derived figure while the phone showed the corrected one. */
  "_napEditStore", "_napEdits",
  /* weather — the statistics fetch, the provider-shape detection and the rail's
     scale. `_wxCapsule` is here too, taking a class prefix: the three states it
     draws (a stub for a half-published day, a hatch for an absent one, a
     visible cap for a flat one) ARE the zero-versus-missing rules, and a second
     copy on the desk could regress on its own with nothing to say so. The
     markup-emitting cousins — `_secWeather`, `_wxRows`, `_wxHourly` — are not
     borrowed: they describe a phone column. */
  "_weatherSection", "_wxKind", "_startWeather", "_fetchWeather", "_fetchWxStats",
  "_fetchWxFc", "_wxLive", "_wxRail", "_wxDomain", "_wxCapsule", "_wxDow", "_wxDeg",
  "_wxAttrib", "_wxNoteText", "_wxHistRows", "_wxSrcName", "_wxHourDomain",
  "_wxHourCols", "_wxClock",
  /* faults, dismissals and the notification log */
  "_dismissals", "_writeDismissals", "_dismiss", "_ruleHit", "_firedAt", "_serverFaults",
  "_raised", "_faults", "_syncLog",
  /* Dependencies of the three above, added when a test started walking what
     borrowed methods CALL rather than only whether they resolve. All three
     were reachable and none of them worked: _dismiss threw on any desk
     dismissal with a log configured, _togglePick threw on picking a music
     room, and _syncLog's call to _logItems threw inside a try/catch that
     returns silently — so the desk had never once synced the notification
     log, and nothing said so. */
  "_closeLog", "_logItems", "_syncQueue", "_fetchQueue",
  /* music: which room is the target, and how a URI gets played there */
  "_musicSec", "_targets", "_activePlayer", "_isPicked", "_togglePick", "_nowPlaying",
  "_playUri", "_enqueueUri", "_toast", "_queueSearch", "_runSearch", "_paintResults",
  /* the optimistic setpoint — built for the shell's stepper, and the desk's
     stepper would have grown the identical bug without it */
  "_optGoal",
  /* render plumbing */
  /* _mediaFace rides along with _mountSheetCard, which now asks it which face
     of the Media sheet is showing before deciding what to mount. The desk has
     no Media button today, so the call never fires — but the borrow is about
     what the method CAN reach, not what it happens to reach, and a desk dock
     entry pointing at a media sheet should work the day it is added. */
  "_patch", "_each", "_one", "_claim", "_mountSheetCard", "_mediaFace",
  /* greeting + name, and the state-string prettifier */
  "_greeting", "_who", "_humanize",
  /* geometry that is genuinely one picture at two sizes */
  "_ringSvg", "_sparkSvg",
];

/* Take the named methods off the shell's prototype.
 *
 * Loud rather than silent when a name stops resolving: a borrow that quietly
 * returns undefined would surface much later as "the desktop fault chip never
 * fires", which is precisely the shape of bug this project keeps writing tests
 * for (`_bindScrub` was fully written and never called for three releases).
 * The returned list of misses is what the smoke test asserts is empty. */
function pdBorrow(target, source, names) {
  const missing = [];
  names.forEach((n) => {
    const fn = source[n];
    if (typeof fn !== "function") { missing.push(n); return; }
    target[n] = fn;
  });
  if (missing.length) {
    console.warn(
      `[purdy-cards] purdy-desk-card could not borrow from purdy-shell-card: ` +
      `${missing.join(", ")}. The desktop view will be missing whatever they backed.`
    );
  }
  return missing;
}

/* A time of day, for the axis labels and the status line. */
function pdClock(t) {
  if (t == null || !Number.isFinite(t)) return "—";
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

class PurdyDeskCard extends PcBaseCard {
  static getStubConfig() {
    return {
      weather: "weather.home",
      sections: [{ type: "quick", tiles: [] }],
    };
  }

  constructor() {
    super();
    /* --- desk marker: constructor begins ---
       Three copies of the shell's constructor were once spliced into unrelated
       methods by a failed string replace, and one of them silently blanked the
       saved-playlist list. The markers are what a test counts. */
    this._open = null;         // key of the expanded stage panel, or null
    this._sheet = null;        // key of the open sheet, or null
    this._alertOpen = false;   // the strip's fault popover
    this._history = {};
    this._histErr = null;
    /* null, not {} — "the recorder has not answered yet" and "he has never
       slept" are different facts, and {} reads as the second. */
    this._nursery = null;
    this._nurseryErr = null;
    this._nurseryTimer = null;
    /* Weather, null for the same reason: the rail must tell "not answered yet"
       from "the week was flat". The borrowed fetch writes these. */
    this._wxStats = null;
    this._wxStatsErr = null;
    this._wxFc = null;
    this._wxFcErr = null;
    this._wxHrs = null;
    this._wxPick = null;
    this._wxTimer = null;
    this._events = [];
    this._goalOpt = null;      // optimistic setpoint, see _optGoal
    this._disOpt = null;       // optimistic dismissal, see _dismissals
    this._goalSend = null;
    this._briOpt = {};         // optimistic light brightness
    this._briSend = {};
    this._dragging = false;    // a drag or a focused field must survive a state change
    this._armed = null;        // a destructive control awaiting its second tap
    this._logged = {};
    this._pick = null;         // the music target room; null follows what plays
    this._results = null;      // search results, null until a query runs
    this._query = "";
    this._mtype = "all";
    this._note = null;
    this._searching = false;
    this._openGroups = {};     // "sectionKey|groupName" -> true
    this._guard = null;        // a protected light awaiting confirmation
    /* --- desk marker: constructor ends --- */
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.sections)) {
      throw new Error("purdy-desk-card: 'sections' (a list) is required");
    }
    config.sections.forEach((s) => {
      if (!s || PD_SECTIONS.indexOf(s.type) < 0) {
        throw new Error(
          `purdy-desk-card: unknown section type '${s && s.type}'. ` +
          `Expected one of: ${PD_SECTIONS.join(", ")}`
        );
      }
      const z = s.zone || PD_ZONE_DEFAULT[s.type];
      if (PD_ZONES.indexOf(z) < 0) {
        throw new Error(
          `purdy-desk-card: section '${s.type}' has zone '${s.zone}'. ` +
          `Expected one of: ${PD_ZONES.join(", ")}`
        );
      }
    });
    this._config = { ...config };
    this._watched = this._collectWatched();
    this._last = null;
    if (this._clock) clearInterval(this._clock);
    /* The clock is the one thing no entity change drives. */
    this._clock = setInterval(() => this._render(), 30000);
  }

  set hass(hass) {
    const first = !this._hass;
    super.hass = hass;
    if (first && this._config) this._start();
  }

  get hass() {
    return this._hass;
  }

  _start() {
    this._startHistory();
    this._startNursery();
    this._startWeather();
    this._fetchEvents();
  }

  /* Lovelace detaches a view's elements, it does not destroy them — so coming
     back to this view reconnects THIS element, with every timer that
     disconnectedCallback stopped still stopped. Without this the card looks
     frozen on return while still accepting clicks. */
  connectedCallback() {
    if (!this._config) return;
    if (!this._clock) this._clock = setInterval(() => this._render(), 30000);
    if (this._hass && !this._historyTimer) this._start();
    this._last = null;
    this._render();
  }

  disconnectedCallback() {
    if (this._clock) clearInterval(this._clock);
    if (this._historyTimer) clearInterval(this._historyTimer);
    if (this._eventTimer) clearInterval(this._eventTimer);
    if (this._nurseryTimer) clearInterval(this._nurseryTimer);
    if (this._wxTimer) clearInterval(this._wxTimer);
    clearTimeout(this._goalSend);
    this._goalSend = null;
    /* Nulled rather than merely cleared: connectedCallback tells "stopped"
       from "running" by the handle, so leaving one set stacks a second poller
       on every return to the view. */
    this._clock = null;
    this._historyTimer = null;
    this._eventTimer = null;
    this._nurseryTimer = null;
    this._wxTimer = null;
  }

  /* Sections in a zone, in config order. Re-ranking the screen is a config
     edit and never a code change — the shell's rule, kept. */
  _zone(name) {
    return (this._config.sections || [])
      .filter((s) => !s.sheet_only && (s.zone || PD_ZONE_DEFAULT[s.type]) === name)
      .map((s, i) => ({ key: s.key || s.type + i, ...s }));
  }

  _section(type) {
    return (this._config.sections || []).find((s) => s.type === type);
  }

  /* ---------------------------------------------------------------- mount --
   *
   * The skeleton is built once and everything after it is a patch into one of
   * these slots. Two things depend on that and both are load-bearing:
   *
   *   - the stylesheet is parsed once rather than on every state change, and
   *   - #pd-stage SURVIVES every repaint, which is the only reason it may
   *     carry a CSS transition at all. A transition on a node the renderer
   *     replaces re-runs from zero on every state change; that is what made
   *     the phone's lamp chips slide under the thumb constantly. The stage's
   *     grid-template-columns is written as a style property on the surviving
   *     node — never as part of an innerHTML string — so the expand animates
   *     once, when it is asked to.
   */
  _mount() {
    this.shadowRoot.innerHTML = `
      <style>${PurdyDeskCard.styles}</style>
      <div class="pd-ground"></div>
      <div class="pd-sheet">
        <div class="pd-tier pd-t1" id="pd-strip"></div>
        <div class="pd-tier pd-t2"><div class="pd-stage" id="pd-stage"></div></div>
        <div class="pd-tier pd-t3" id="pd-dock"></div>
      </div>
      <div id="pd-sheetslot"></div>`;
    this._mounted = true;
  }

  /* Keyed reconciliation for a container of panels.
   *
   * This is _patchSections' shape rather than _patchSections itself: that one
   * writes into the shell's single column and stamps `ps-sect` on what it
   * finds there. The container, the class base and the state carried per node
   * all differ here, and the honest way to share it would be to widen the
   * shell's signature — a change to shipped code for the benefit of a caller
   * that does not exist yet. Borrow the data, write the layout.
   */
  _patchKeyed(container, list, baseCls) {
    if (!container) return;
    const have = new Map();
    Array.from(container.children).forEach((n) => have.set(n.dataset.pkey, n));

    let prev = null;
    list.forEach((s) => {
      let node = have.get(s.key);
      if (node) {
        have.delete(s.key);
        /* The rendered string IS the cache key, so identical output cannot
           touch the DOM — which is what preserves focus, scroll position and
           the artwork <img> between repaints. */
        if (node._pdHtml !== s.html) {
          node._pdHtml = s.html;
          node.innerHTML = s.html;
        }
      } else {
        node = document.createElement("div");
        node.dataset.pkey = s.key;
        node._pdHtml = s.html;
        node.innerHTML = s.html;
      }
      const cls = [baseCls].concat(s.cls || []).join(" ");
      if (node.className !== cls) node.className = cls;
      /* Re-inserting a node already in place would detach and re-attach it,
         losing focus for no reason. */
      const want = prev ? prev.nextSibling : container.firstChild;
      if (node !== want) container.insertBefore(node, want);
      prev = node;
    });

    have.forEach((n) => n.remove());
  }

  /* Column widths for the stage.
   *
   * Balanced, every panel gets its configured `weight` (default 1). Expanded,
   * the open panel takes `expand_ratio` (default 2.9) and the rest fold to
   * `fold_ratio` (0.62) — enough width for a headline number and a chip, which
   * is the whole promise of folding rather than hiding: the other three stay
   * legible, so nothing you were reading disappears because you opened
   * something else.
   */
  _stageCols(panels) {
    const c = this._config;
    if (!panels.length) return "";
    if (!this._open) return panels.map((p) => `${p.weight || 1}fr`).join(" ");
    const open = c.expand_ratio || 2.9;
    const fold = c.fold_ratio || 0.62;
    return panels.map((p) => `${p.key === this._open ? open : fold}fr`).join(" ");
  }

  _render() {
    if (!this._hass || !this._config) return;
    /* Repainting mid-gesture would rip the control out from under the pointer
       and, on a focused field, destroy the input mid-word. */
    if (this._dragging) return;
    if (!this._mounted) this._mount();
    /* Written as a property rather than into the stylesheet so changing it is
       a config edit and not a rebuild of the bundle. */
    if (this._config.viewport_offset != null && this.style && this.style.setProperty) {
      this.style.setProperty("--pd-off", String(this._config.viewport_offset).replace(/^(\d+(\.\d+)?)$/, "$1px"));
    }

    const raised = this._raised();
    if (this._config.log_to) this._syncLog(raised);
    const faults = this._faults();

    this._patch("pd-strip", this._stripHtml(faults));

    const panels = this._zone("stage")
      .map((sec) => {
        const html = this._panelHtml(sec);
        /* A panel that renders nothing is dropped entirely, hairline and all —
           that is how `nowplaying` disappears when the house is quiet rather
           than leaving an empty column with a title in it. */
        if (!html) return null;
        const cls = ["pd-panel"];
        if (this._open === sec.key) cls.push("is-exp");
        else if (this._open) cls.push("is-min");
        return { key: sec.key, html, cls, weight: sec.weight };
      })
      .filter(Boolean);

    const stage = this.shadowRoot.getElementById("pd-stage");
    this._patchKeyed(stage, panels, "pd-panelwrap");
    if (stage) {
      /* Written as a property on the surviving node, never into an innerHTML
         string — see _mount. This is the one animated thing on the screen. */
      const cols = this._stageCols(panels);
      if (stage.style.gridTemplateColumns !== cols) stage.style.gridTemplateColumns = cols;
    }

    this._patch("pd-dock", this._dockHtml());
    this._patch("pd-sheetslot", this._sheetHtml(faults));
    this._mountSheetCard();

    this._bind();
    this._bindScrub();
    /* Attached AFTER the patch, because a patch may have replaced the node the
       last series was hanging on. The scrub reads these back rather than
       re-deriving, so the number under the pointer is the number that was
       actually drawn. */
    this._stash("pd-wave", this._waveSeries);
    this._stash("pd-nightrail", this._nightSeries);
  }

  /* ----------------------------------------------------------------- bind --
   *
   * Handlers are attached once per element and then outlive many repaints, so
   * nothing in here may close over `hass` or `config`. Every handler reads
   * this._hass / this._config live.
   */
  _bind() {
    /* expand / collapse a stage panel */
    this._each("[data-exp]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = el.dataset.exp;
        this._open = this._open === k ? null : k;
        this._last = null;
        this._render();
      });
    });

    /* open a sheet */
    this._each("[data-sheet]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._sheet = el.dataset.sheet;
        this._last = null;
        this._render();
      });
    });

    this._each("[data-close]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._sheet = null;
        this._last = null;
        this._render();
      });
    });

    /* more-info, the desktop's answer to the phone's long-press */
    this._each("[data-info]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        pcMoreInfo(this, el.dataset.info);
      });
    });

    this._each("[data-nav]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        pcNavigate(this, el.dataset.nav);
      });
    });

    /* the fault popover in the strip */
    this._one("pd-alert", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._alertOpen = !this._alertOpen;
        this._last = null;
        this._render();
      });
    });

    this._each("[data-dismiss]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = this._faults().find((f) => f.key === el.dataset.dismiss);
        if (row) this._dismiss(row);
      });
    });

    this._bindStrip();
    this._bindStage();
    this._bindDeskLights();
    this._bindDock();
  }

  /* -------------------------------------------------------------- scrub ----
   *
   * The desktop scrub is NOT the phone's, and the difference is deliberate.
   *
   * The shell's scrubber has to spend ~340ms deciding whether a finger on the
   * graph meant "read this" or "scroll the page", because on a phone both
   * gestures start identically. A desk view has a pointer that hovers without
   * committing to anything, and a sheet that never scrolls — so there is no
   * ambiguity to resolve and no reason to make anyone wait for it. Reading the
   * graph is hovering over it.
   *
   * The one rule kept verbatim is the important one: the readout is written
   * STRAIGHT TO THE DOM from the series stashed at render time, never through
   * _render. Re-rendering to move a crosshair would replace the node under the
   * pointer on every pixel of travel.
   */
  _bindScrub() {
    this._each("[data-scrub]", (box) => {
      const cross = box.querySelector(".pd-cross");
      /* The readout is not always INSIDE the scrub box. The night rail is a
         26px bar and its caption belongs in the railbox header above it — so
         looking only inside the box found nothing, returned early, and that
         rail silently never scrubbed. A handler that is wired but unreachable
         is the same failure as one that is written and never called. */
      const out = box.querySelector("[data-readout]")
        || (box.parentNode && box.parentNode.querySelector
          ? box.parentNode.querySelector("[data-readout]") : null);
      if (!cross || !out) return;

      const hide = () => {
        cross.style.opacity = "0";
        out.style.opacity = "0";
      };

      const read = (clientX) => {
        const r = box.getBoundingClientRect();
        if (!r.width) return;
        const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
        const series = box._pdSeries;
        if (!series || !series.length) return;
        const i = Math.min(series.length - 1, Math.round(f * (series.length - 1)));
        const pt = series[i];
        cross.style.opacity = "1";
        cross.style.left = (f * 100).toFixed(2) + "%";
        out.style.opacity = "1";
        out.textContent = pt.label;
      };

      box.addEventListener("pointermove", (e) => read(e.clientX));
      box.addEventListener("pointerleave", hide);
      box.addEventListener("pointercancel", hide);
    });
  }

  /* Stash the series a graph reads back, keyed to the element that owns it.
     Read back at scrub time rather than re-derived, so the number under the
     pointer is the number that was drawn. */
  _stash(id, series) {
    const el = this.shadowRoot && this.shadowRoot.getElementById(id);
    if (el) el._pdSeries = series;
  }

  /* --------------------------------------------------------------- sheets --
   *
   * The desktop inverts the phone's rule: what you LOOK AT is inline, what you
   * FIDDLE WITH is behind a sheet. Climate, Joel, music and the calendar are
   * on the glass; the TV remote, the notification log and the vacuum map stay
   * sheets, because a d-pad is a task and a log is read on demand.
   *
   * The host is `ps-host` on purpose — that is the id the shell's
   * _mountSheetCard looks for, and using it is what lets the hosted-card
   * plumbing be borrowed whole rather than reimplemented. It brings the parts
   * that were hard to get right: `bare: true` by default so a hosted card does
   * not draw a second surface, the blanked title so the chrome does not print
   * the name twice, the retry without `bare` for a card entitled not to know
   * our conventions, and an in-place error instead of a throw out of render.
   */
  _sheetHtml(faults) {
    if (!this._sheet) return "";
    const spec = (this._config.sheets || {})[this._sheet];
    const title = this._sheet === "alerts"
      ? (faults.length ? `${faults.length} need${faults.length > 1 ? "" : "s"} attention` : "All clear")
      : (spec && spec.title) || this._humanize(this._sheet);
    let body;
    if (this._sheet === "alerts") {
      body = this._alertListHtml(faults);
    } else if (spec && spec.section) {
      /* A sheet can host one of our own sections as well as a foreign card.
         That is how lights stays one click away without taking a permanent
         column on the stage — the phone reached the same answer from the other
         direction, and a `sheet_only` section keeps supplying its config while
         rendering nothing in the column. */
      const sec = (this._config.sections || []).find((s) => (s.key || s.type) === spec.section);
      this._inSheet = true;
      body = sec ? this._panelHtml({ key: sec.key || sec.type, ...sec }) : "";
      this._inSheet = false;
      if (!body) body = `<div class="pd-empty">Nothing to show.</div>`;
    } else {
      /* `dim` exists for a hosted card that hardcodes a light surface and
         never reads HA's card variables — a filter is the only lever there is,
         so it is opt-in per sheet and an out-of-range value is ignored rather
         than blanking the sheet. */
      const d = spec && Number(spec.dim);
      body = `<div id="ps-host" class="pd-host"${d > 0 && d <= 1 ? ` style="filter:brightness(${d})"` : ""}></div>`;
    }
    return `
      <div class="pd-scrim" data-close="1"></div>
      <div class="pd-sheet-panel" role="dialog" aria-label="${psEsc(title)}">
        <div class="pd-sheet-head">
          <span class="pd-sheet-title">${psEsc(title)}</span>
          <button class="pd-x" type="button" data-close="1" aria-label="Close">
            <svg viewBox="0 0 24 24" class="pd-ico"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <div class="pd-sheet-body">${body}</div>
      </div>`;
  }

  getCardSize() {
    return 30;
  }

  /* Pure helpers, exposed so the smoke test can exercise them without reaching
     into the bundle's module scope — the bundle is one concatenated script, so
     its free functions are not otherwise reachable from a test that evals it. */
  static get helpers() {
    return {
      sections: PD_SECTIONS,
      zones: PD_ZONES,
      zoneDefault: PD_ZONE_DEFAULT,
      borrowed: PD_BORROW,
      /* Empty, or the borrow silently lost something. A test asserts it. */
      borrowMissing: PD_BORROW_MISSING,
      /* Exposed so a test can walk what the borrowed methods actually CALL —
         the list names methods, not their dependencies. */
      borrowed: PD_BORROW,
      clock: pdClock,
    };
  }

  static get styles() {
    return PD_STYLES;
  }
}

/* Do the borrowing once, at definition time, and remember what failed so a
   test can assert nothing did. */
const PD_BORROW_MISSING = pdBorrow(PurdyDeskCard.prototype, PurdyShellCard.prototype, PD_BORROW);
