/* ============================================================================
 * purdy-desk2-card — the desk as a SUBCLASS of the shell
 *
 * The first desk (80–89) was a sibling that borrowed ~90 shell methods by
 * name through a borrow list, and every "added it to the phone, forgot the desk"
 * bug came through that list: `edits:` missing, the disk1 rule, `visible_to`
 * ignored, and a `_logItems` throw that meant the desk had NEVER synced the
 * notification log. A subclass inherits all of that by construction — data,
 * faults, log sync, nursery derivation, `_visible`, the weather fetch, every
 * sheet and every handler. What this file writes is LAYOUT ONLY: a rail, a
 * one-line header, a stage of columns, and a drawer that is the shell's own
 * sheet slot restyled to sit at the right edge.
 *
 * The config is the phone's config. `sections:` carries the same blocks — the
 * drawer's sheets look sections up by type there — and `stage:` names which
 * section keys the columns draw:
 *
 *   stage: { joel: "joel", climate: "clim", weather: "wx", side: ["now", "ahead", "crew"] }
 *
 * Referencing keys rather than restating blocks is deliberate: a block that
 * lives in two places is the drift the old desk was built out of.
 * ========================================================================== */

/* Which section types each stage slot can draw. setConfig rejects anything
   else BY NAME — an unknown type in a slot would otherwise throw at render,
   and Lovelace answers a throw by replacing the whole card. The dispatch in
   _pd2Slot must name exactly this set; a test pairs the two. */
const PD2_STAGE = {
  joel: ["nursery"],
  climate: ["climate"],
  weather: ["weather"],
  side: ["nowplaying", "calendar", "crew"],
};

class PurdyDesk2Card extends PurdyShellCard {
  static getStubConfig() {
    return { weather: "weather.home", sections: [], stage: {} };
  }

  constructor() {
    super();
    /* Esc closes the drawer. Bound once and kept on the card, so disconnect
       can remove exactly the function it added. */
    this._pd2Key = (e) => {
      if (!e) return;
      if (e.key === "Escape" && this._sheet) {
        this._sheet = this._pd2Back();
        this._mediaPick = null; this._napEdit = null;
        this._render();
        return;
      }
      /* 1–9 press the rail's entries in the order they are drawn. Never while
         typing — the music and container searches are fields, and a "2" typed
         into one must stay a "2" — and never with a modifier, which belongs
         to the browser. */
      if (!/^[1-9]$/.test(e.key || "") || e.ctrlKey || e.metaKey || e.altKey) return;
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];
      if (path.some((n) => n && (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.isContentEditable))) return;
      const btn = this.shadowRoot && this.shadowRoot.querySelector(`.pd2-rb[data-key="${e.key}"]`);
      if (btn) { e.preventDefault(); btn.click(); }
    };
    /* The HA header comes and goes (kiosk, edit mode, the app vs a browser),
       so a fixed offset was right on one screen and ran the stage off the
       bottom of the next. Measured instead: where the card starts on the page
       is exactly what the header and view padding took. */
    this._pd2Fit = () => {
      if (this._pd2Fixed || !this.isConnected || !this.getBoundingClientRect || typeof window === "undefined") return;
      const top = Math.max(0, Math.round(this.getBoundingClientRect().top + (window.scrollY || 0)));
      if (top !== this._pd2Top) {
        this._pd2Top = top;
        this.style.setProperty("--pd-off", top + "px");
      }
    };
  }

  setConfig(config) {
    const c = config || {};
    const sections = Array.isArray(c.sections) ? c.sections : [];
    const stage = c.stage || {};
    Object.keys(stage).forEach((slot) => {
      const allowed = PD2_STAGE[slot];
      if (!allowed) {
        throw new Error(`purdy-desk2-card: unknown stage slot '${slot}'. ` +
          `Expected one of: ${Object.keys(PD2_STAGE).join(", ")}`);
      }
      const keys = Array.isArray(stage[slot]) ? stage[slot] : [stage[slot]];
      keys.forEach((k) => {
        const sec = sections.find((s) => s && (s.key || "") === k);
        if (!sec) throw new Error(`purdy-desk2-card: stage.${slot} names '${k}', which is not a section key`);
        if (allowed.indexOf(sec.type) < 0) {
          throw new Error(`purdy-desk2-card: stage.${slot} cannot draw a '${sec.type}' section. ` +
            `Expected one of: ${allowed.join(", ")}`);
        }
      });
    });
    super.setConfig({ ...c, sections });
    /* viewport_offset pins the offset by hand; left out, _pd2Fit measures it. */
    const off = Number(c.viewport_offset);
    this._pd2Fixed = c.viewport_offset != null && Number.isFinite(off);
    this._pd2Top = null;
    if (this.style && typeof this.style.setProperty === "function") {
      this.style.setProperty("--pd-off", (this._pd2Fixed ? off : 16) + "px");
    }
    this._pd2Fit();
  }

  /* `house:` is a desk-only top-level block, so the shell's walk cannot know
     it — extended, never replaced, or a House row would wait on the 30s
     clock to show what it had done. */
  _collectWatched() {
    return super._collectWatched().concat((this._config.house || []).map((r) => r && r.entity).filter(Boolean));
  }

  connectedCallback() {
    super.connectedCallback();
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("keydown", this._pd2Key);
      window.addEventListener("resize", this._pd2Fit);
      /* HA lays the view out after connecting the card; measure once it has. */
      if (window.requestAnimationFrame) window.requestAnimationFrame(() => window.requestAnimationFrame(this._pd2Fit));
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (typeof window !== "undefined" && window.removeEventListener) {
      window.removeEventListener("keydown", this._pd2Key);
      window.removeEventListener("resize", this._pd2Fit);
    }
  }

  /* The skeleton. `ps-ground`, `ps-sheetslot`, `ps-stat`, `ps-col` and
     `ps-dockwrap` keep the shell's ids so _paintSky, _patchSheet,
     _mountSheetCard and _renderSystems work untouched — the last three live
     inside the mode panel, which is where the server's pages draw. */
  _mount() {
    this.shadowRoot.innerHTML = `
      <style>${PurdyDesk2Card.styles}</style>
      <div class="ps-ground" id="ps-ground"></div>
      <div class="pd2-frame">
        <nav class="pd2-rail" id="pd2-rail" aria-label="Dock"></nav>
        <main class="pd2-glass">
          <header class="pd2-head" id="pd2-head"></header>
          <div class="pd2-hhair"></div>
          <section class="pd2-stage" id="pd2-stage">
            <article class="pd2-col pd2-joel" id="pd2-joel"></article>
            <div class="pd2-vhair h1"></div>
            <article class="pd2-col pd2-clim" id="pd2-clim"></article>
            <article class="pd2-col pd2-wx" id="pd2-wx"></article>
            <div class="pd2-vhair h2"></div>
            <div class="pd2-vhair h3"></div>
            <article class="pd2-col pd2-side" id="pd2-side"></article>
          </section>
          <section class="pd2-mode" id="pd2-mode">
            <div class="ps-stat" id="ps-stat"></div>
            <div class="ps-dockwrap" id="ps-dockwrap"></div>
            <div class="ps-col" id="ps-col"></div>
          </section>
        </main>
      </div>
      <div id="ps-sheetslot"></div>`;
    this._mounted = true;
  }

  /* The section a slot draws, or null — never a throw: setConfig has already
     refused a slot that names something it cannot draw. */
  _pd2Sec(key) {
    if (!key) return null;
    const raw = (this._config.sections || []).find((s) => (s.key || "") === key);
    if (!raw || !this._visible(raw)) return null;
    return { ...raw, key: raw.key };
  }

  /* One dispatch for the side column. The keys are PD2_STAGE.side — a test
     asserts the two halves name the same set. */
  _pd2Slot(sec) {
    return {
      nowplaying: () => this._dkNow(sec),
      calendar: () => this._dkAhead(sec),
      crew: () => this._dkHouse(sec),
    }[sec.type]();
  }

  _render() {
    const pre = this._renderPre();
    if (!pre) return;
    const { now, faults } = pre;
    const c = this._config;
    const st = c.stage || {};

    this._patch("pd2-rail", this._dkRail(faults));

    const glass = this.shadowRoot.querySelector(".pd2-glass");
    const mode = this._mode === "systems" || this._mode === "health";
    if (glass && glass.classList) glass.classList.toggle("moded", mode);
    /* A mode owns the panel. _renderSystems writes ps-stat, ps-col and the
       page tabs in ps-dockwrap, and the sheet — the house's faults and log
       do not stop mattering because you are looking at the server. */
    this._pd2Track();
    if (this._mode === "systems") { this._renderSystems(faults); this._pd2Bind(); return; }
    if (this._mode === "health") { this._renderHealth(faults); this._pd2Bind(); return; }

    this._patch("pd2-head", this._dkHead(now, faults));

    const joel = this._pd2Sec(st.joel);
    const clim = this._pd2Sec(st.climate);
    const wx = this._pd2Sec(st.weather);
    this._patch("pd2-joel", joel ? this._dkJoel(joel) : "");
    this._patch("pd2-clim", clim ? this._dkClimate(clim) : "");
    this._patch("pd2-wx", wx ? this._dkWeather(wx) : "");
    const side = (Array.isArray(st.side) ? st.side : [st.side])
      .map((k) => this._pd2Sec(k)).filter(Boolean)
      .map((s) => this._pd2Slot(s)).filter(Boolean);
    this._patch("pd2-side", side.join(`<div class="pd2-hhair in"></div>`));

    this._pd2Track();
    this._patchSheet(this._sheetHtml(faults));
    this._mountSheetCard();

    this._bind();
    this._bindScrub();
    this._bindLights();
    this._bindCrew();
    this._bindNapEdit();
    this._bindNapOpen();
    this._bindPeople();
    this._bindNurseryLog();
    this._bindSystems();
    this._pd2Bind();
    this._syncQueue();
  }

  /* Where closing a sheet lands. The nap correction and the sleep log are
     opened FROM the Joel drawer; closing them used to drop all the way to the
     stage, so correcting two naps meant opening Joel twice. They now step back
     to the drawer they came from. Anything else closes outright. */
  _pd2Back() {
    return (this._sheet === "napedit" || this._sheet === "joellog") && this._pd2From === "joel" ? "joel" : null;
  }

  /* A phone has to be held; a pointer hovers — the desk's scrub is hover. */
  _scrubHint() { return "hover to scrub"; }

  /* The drawer's contents are the shell's own sheets, with one addition: the
     Joel sheet, which is the phone's nursery section drawn open. The drawer is
     ~460px, phone width, so the section body renders unchanged — which is the
     whole reason the drawer is that wide. */
  _sheetHtml(faults) {
    const close = `<button class="ps-x" type="button" id="ps-close" aria-label="Close">
        <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    /* Joel and Climate are their phone sections drawn OPEN — the same
       renderer, so nothing the phone can do is missing here. Joel's drawer is
       twice the width and lays the section out in two columns: his week and
       last night side by side is what a desk has the room for. */
    const full = { joel: ["joel", "_secNursery", "pd2-jsheet"], climate: ["climate", "_secClimate", "pd2-csheet"] }[this._sheet];
    if (full) {
      const sec = this._pd2Sec((this._config.stage || {})[full[0]]);
      if (!sec) return "";
      /* No chip in the chrome: the section draws its own chips row, and the
         same chip twice in one sheet is the chip rule broken at a new surface. */
      const chip = "";
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall ${full[2]}">
          <div class="ps-sheeth"><span class="ps-lbl">${psEsc(sec.title || (full[0] === "joel" ? "Joel" : "Climate"))}</span>
            ${chip ? `<span class="pd2-shchips">${chip}</span>` : ""}${close}</div>
          <div class="ps-sect open">${full[0] === "joel"
            ? this._secNursery(sec, { omit: ["raster", "day"] }) + this._dkJoelTrends(sec)
            : this[full[1]](sec)}</div>
        </div>`;
    }
    /* The week sheet is the phone's, plus one row: the header's reading used
       to open the thermometer's more-info, and now opens this sheet — so the
       thermometer's history must still be reachable from here, or the header
       change orphaned it. */
    if (this._sheet === "wx") {
      const base = super._sheetHtml(faults);
      const id = this._config.weather_temp;
      if (!base || !id) return base;
      const i = base.lastIndexOf("</div>");
      return base.slice(0, i) + `<button class="pd2-more" type="button" data-info="${psEsc(id)}">
          <span>${psEsc(pcName(this._hass, id))}</span><span>History ›</span></button>` + base.slice(i);
    }
    /* "All clear" is not a dead end: with nothing raised, the chip opens the
       notification log — what WAS raised — rather than an empty sheet. */
    if (this._sheet === "alerts" && !faults.length && (this._config.sheets || {}).notifications) {
      this._sheet = "notifications";
    }
    return super._sheetHtml(faults);
  }

  /* Every handler that closes a sheet sets `_sheet = null` — the shell's ✕,
     its scrim, a save. Rather than teach each of them about the desk, the
     render notices a sheet that was opened from Joel closing, and steps back
     to Joel instead. `_pd2From` is the sheet before this one. */
  _pd2Track() {
    const cur = this._sheet || null;
    if (cur === this._pd2Last) return;
    if (!cur && (this._pd2Last === "napedit" || this._pd2Last === "joellog") && this._pd2From === "joel" && !this._pd2Home) {
      this._sheet = "joel";
      this._pd2From = null;
      this._pd2Last = "joel";
      return;
    }
    this._pd2From = this._pd2Last;
    this._pd2Last = cur;
    this._pd2Home = false;
  }

  /* -------------------------------------------------------------- rail --- */

  /* The phone's dock, drawn vertically, from the SAME `dock:` config. The
     index is captured before the `_visible` filter so a hidden entry does not
     shift its neighbours — the handler is the shell's own [data-dock], which
     looks the entry up in the unfiltered array.
     The `active` entry is Home. On the phone it is a link to the phone view;
     here it closes whatever is open, so it gets its own hook rather than the
     shell's navigation. */
  _dkRail(faults) {
    const dock = this._config.dock || [];
    const cur = this._mode
      ? dock.findIndex((d) => d.mode === this._mode)
      : this._sheet ? dock.findIndex((d) => d.sheet === this._sheet && !d.mode) : -1;
    const items = dock.map((d, i) => ({ d, i })).filter(({ d }) => this._visible(d));
    return items.map(({ d, i }, n) => {
      const home = !!d.active;
      const on = home ? cur < 0 : i === cur;
      const alert = d.alert_when_faults && faults.length;
      /* With nothing raised, the bell still counts the LOG's open warnings
         and alerts — the entries a person has not dealt with. Info rows
         (61 of them, mostly update notices) do not count: a badge that is
         never zero is a badge nobody reads. */
      const logN = !alert && d.alert_when_faults && d.sheet === "notifications" ? this._pd2LogCount() : 0;
      /* The divider sits before the last entry, the way the mockup groups the
         bell apart from the places. */
      const sep = n === items.length - 1 && items.length > 2 ? `<i class="pd2-rsep"></i>` : "";
      /* Labelled, as the phone's dock is: six glyphs with the names only in
         tooltips is a row of guesses the first week. The number is the key
         that presses it. */
      const key = n < 9 ? String(n + 1) : "";
      return `${sep}<button class="pd2-rb ${on ? "on" : ""} ${alert ? "alert" : ""}" type="button"
          ${home ? `data-pd2home="1"` : `data-dock="${i}"`} ${key ? `data-key="${key}"` : ""}
          aria-label="${psEsc(d.name)}" title="${psEsc(d.name)}${key ? ` (${key})` : ""}"${on ? ` aria-current="page"` : ""}>
          <ha-icon icon="${psEsc(d.icon)}"></ha-icon><span>${psEsc(d.name)}</span>
          ${alert ? `<i class="pd2-badge">${faults.length}</i>`
            : logN ? `<i class="pd2-badge log">${logN}</i>` : ""}</button>`;
    }).join("");
  }

  /* Open warn/critical entries in the notification log, polled at most once
     a minute off the render path. The log is the sheet's hosted card's todo
     list, so its entity is read from there rather than configured twice. */
  _pd2LogCount() {
    const ent = ((((this._config.sheets || {}).notifications) || {}).card || {}).entity;
    if (!ent || !this._hass || !this._hass.callWS) return 0;
    const now = Date.now();
    if (!this._pd2LogAt || now - this._pd2LogAt > 60000) {
      this._pd2LogAt = now;
      this._hass.callWS({ type: "todo/item/list", entity_id: ent }).then((res) => {
        const n = ((res && res.items) || []).filter((it) => it.status !== "completed"
          && /\b(critical|warn)\b/.test(it.description || "")).length;
        if (n !== this._pd2LogN) { this._pd2LogN = n; this._render(); }
      }).catch(() => {});
    }
    return this._pd2LogN || 0;
  }

  /* ------------------------------------------------------------ header --- */

  /* One line: greeting and date on the left, the people, then the outside
     reading, the weather roll-up and the fault chip. The reading comes from
     `weather_temp:` — the measured sensor — never the provider, for the reason
     the phone header learned: a provider is opinionated about the present. */
  _dkHead(now, faults) {
    const c = this._config;
    const h = this._hass;
    const wTemp = c.weather_temp && pcNum(h, c.weather_temp) != null
      ? pcNum(h, c.weather_temp)
      : (c.weather && h.states[c.weather] ? h.states[c.weather].attributes.temperature : null);
    const wState = pcState(h, c.weather);
    const wxSec = (c.sections || []).find((s) => s.type === "weather");
    const feels = wxSec && wxSec.feels_from && h.states[wxSec.feels_from]
      ? h.states[wxSec.feels_from].attributes.apparent_temperature : null;
    const who = this._who();
    const chip = this._dkWxChip();
    return `
      <div class="pd2-hl">
        <h1>${this._greeting()}${who ? `, ${psEsc(who)}` : ""}</h1>
        <div class="pd2-date">${now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
          <i>·</i>${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
      </div>
      <div class="pd2-ppl">${this._hdrPeople()}</div>
      <div class="pd2-att">${pcOffline(h) ? "" : this._dkFaultChips(faults)}</div>
      <div class="pd2-hr">
        ${wTemp == null ? "" : `<div class="pd2-hwx" data-sheet="wx" role="button" tabindex="0" title="The week and the next 24 hours">
          <ha-icon icon="${pcWxIcon(wState)}"></ha-icon>
          <div><b>${Math.round(wTemp)}°</b><span>${psEsc(pcWxText(wState) || "")}${
            feels == null ? "" : ` · feels ${Math.round(feels)}°`}</span></div></div>`}
        ${chip}
        ${pcOffline(h) ? `<span class="ps-chip bad"><span class="ps-dot"></span>Reconnecting…</span>` : ""}
      </div>`;
  }

  /* The faults, NAMED, in the middle of the header.
   *
   * The header's middle was 600px of nothing, and the one chip that could say
   * something sat in the far corner reading "All clear" or "2 need
   * attention" — so a fault was only ever named inside a popover. Each raised
   * row is its own chip now, worst first, three at most and the rest as "+N".
   * With nothing raised the middle stays EMPTY: the absence of chips is the
   * all-clear, and a green pill saying so was a chip with no fact in it. The
   * notification log is the rail's Alerts entry either way. */
  _dkFaultChips(faults) {
    if (!faults.length) return "";
    const cls = (f) => (f.severity === "critical" ? "bad" : f.severity === "warn" ? "warn" : "");
    const shown = faults.slice(0, 3).map((f) => `<button class="ps-chip ${cls(f)}" type="button" data-sheet="alerts"
        title="${psEsc([f.title, f.detail].filter(Boolean).join(" — "))}"><span class="ps-dot"></span>${
      psEsc(f.short || [f.title, f.detail].filter(Boolean).join(" · "))}</button>`).join("");
    const more = faults.length > 3
      ? `<button class="ps-chip" type="button" data-sheet="alerts">+${faults.length - 3}</button>` : "";
    return shown + more;
  }

  /* The weather chip is a ROLL-UP — the first wet period ahead and how
     likely — which is a fact you would otherwise read off seven columns. A dry
     week has nothing to roll up and draws no chip at all. */
  _dkWxChip() {
    const wet = (this._wxFc || []).find((d) => d.pop != null && d.pop >= 50);
    if (!wet) return "";
    const when = wet.today ? (new Date(this._nowMs()).getHours() >= 17 ? "tonight" : "today")
      : this._wxDow(wet.ts, false);
    return `<button class="ps-chip warn" type="button" data-sheet="wx">${psEsc(pcWxText(wet.condition) || "Rain")} ${psEsc(when)} · ${Math.round(wet.pop)}%</button>`;
  }

  /* -------------------------------------------------------------- joel --- */

  /* The widest column, because it is why the page exists. The WHOLE column is
     one button onto the Joel sheet, so nothing inside it may be a control of
     its own — the night light is a House row, not a switch here. */
  _dkJoel(sec) {
    const m = this._nurseryModel(sec);
    const { loaded, err, stats, live, nightSession, todayNaps, catnapUnder, avg, maxMins,
      nightMins, nightNoData, statusL, statusR, sessions, todayKey, away, awayLabel } = m;
    const napTarget = m.napTarget;
    const ring = this._ringSvg(176, 11, [[nightMins / maxMins, "url(#ps-aur)"]],
      avg ? Math.min(1, avg / maxMins) : null, "var(--ps-text)");
    const naps = todayNaps.map((s) => {
      const short = !s.active && s.asleepMinutes < catnapUnder;
      const col = short ? "var(--ps-warn)" : "var(--ps-light)";
      return `<div class="pd2-nap">
          ${this._ringSvg(46, 5, [[s.asleepMinutes / napTarget, col]], null)}
          <div><b>${psHM(s.asleepMinutes)}</b><span>Nap · ${s.active ? "now" : psClock(s.from)}${
            s.manual ? " · logged" : s.edited ? " · edited" : ""}</span></div></div>`;
    }).join("");
    const napsEmpty = !loaded ? "loading…" : err ? "recorder unavailable"
      : away ? `${awayLabel.toLowerCase()} — not recorded today` : "no naps yet";

    const norms = psNurseryNorms(sessions, { days: sec.days || 7 });
    /* Last night is the most recent COMPLETED night. While tonight runs the
       ring is tonight's, and this row is the one before — two different
       nights, so the row is not the ring restated. */
    const done = sessions.filter((s) => s.night && !s.active);
    const ln = done.length ? done[done.length - 1] : null;
    const blind = ln && ln.blindMin;
    const lastRow = !ln ? "" : `<div class="pd2-last">
        <div><span>Last night</span><b>${psHM(ln.asleepMinutes)}</b></div>
        <div><span>Woke</span><b>${ln.interventions == null ? "—"
          : `${ln.interventions}${blind ? "+" : ""}×`}</b></div>
        <div><span>Longest</span><b>${blind || ln.longestStretch == null ? "—" : psHM(ln.longestStretch)}</b></div>
      </div>`;

    /* The verdict is a COMPARISON — the distance from his own average — and
       never a restatement of the row above. No band, no verdict: it is
       dropped, not hedged. */
    const band = norms.asleep;
    let verdict = "";
    if (ln && band) {
      const d = Math.round(ln.asleepMinutes - band.mean);
      const inBand = ln.asleepMinutes >= band.lo && ln.asleepMinutes <= band.hi;
      const how = Math.abs(d) < 5 ? "right on his average"
        : d > 0 ? `${psHM(d)} over his average` : `${psHM(-d)} under his average`;
      verdict = `<div class="pd2-verdict ${inBand ? "good" : "warn"}">
          <span class="ps-dot"></span><b>${inBand ? "Within his norm" : "Outside his norm"}</b>
          <span>· ${psEsc(how)}</span></div>`;
    }

    /* The chip carries only what the column does not already draw. During a
       NAP the phone's chip reads "Asleep 4m" because its ring is showing last
       night — but here the nap row beside the ring says "4m · now", so the
       chip would be the line beside it restated (the rule, a sixth time). A
       bare "Awake" with nothing to add is dropped for the same reason. */
    const chipOk = !!m.chipTxt && m.chipTxt !== "Awake" && !(live && !live.night);

    return `<div class="pd2-jbtn" data-pd2joel="1" role="button" tabindex="0" aria-label="Open Joel">
        <div class="pd2-lblrow"><span class="pd2-lbl">${psEsc(sec.title || "Joel")}</span>
          ${chipOk ? `<span class="ps-chip ${m.chipCls}">${psEsc(m.chipTxt)}</span>` : ""}</div>
        <div class="pd2-jtop">
          <div class="pd2-ring">${ring}
            <div class="pd2-rv">${nightNoData
              ? `<b class="ps-nodata">—</b><small>${loaded ? "NO NIGHT YET" : "LOADING"}</small>`
              : `<b>${this._dkHM(nightMins)}</b><small>${nightSession.active ? "TONIGHT" : "LAST NIGHT"}</small>`}</div>
          </div>
          <div class="pd2-naps">${naps || `<span class="pd2-flat">${psEsc(napsEmpty)}</span>`}</div>
        </div>
        ${statusL || statusR ? `<div class="pd2-status">${psEsc(statusL)}${statusL && statusR ? ` <i>·</i> ` : ""}${psEsc(statusR)}</div>` : ""}
        ${/* A tall screen has the room for the night's own shape — the rail
              the drawer opens with — so it comes out onto the stage there
              rather than leaving a gap above the verdict. */""}
        ${nightSession && loaded ? `<div class="pd2-tall">${this._nurseryRail(nightSession, loaded, err)}</div>` : ""}
        ${!loaded || (!sessions.length && stats.bedMean == null) ? ""
          : this._nurseryDayRail(sessions, todayKey, stats.bedMean, norms)}
        ${lastRow}
        ${/* His week, when the screen is tall enough to hold it without
              squeezing anything above — the raster the drawer opens with, so
              the one question asked of this column every morning (was last
              night normal, and which way is the week going) is answered
              without a click. A short screen drops it; the drawer still has it. */""}
        ${loaded && sessions.length ? `<div class="pd2-week">${this._nurseryRaster(sessions, norms, sec, this._awayDays(sec))}</div>` : ""}
        ${verdict}
      </div>`;
  }

  /* The drawer's half the column cannot hold: how his nights and naps have
   * RUN, as three small plots over the fetch window, and tonight against his
   * usual in numbers.
   *
   * The drawer used to be the column again — ring, day rail, the whole week
   * raster — all of it visible under the scrim beside it. The raster answers
   * "what did each day look like"; these answer "which way is it going",
   * which is the question a trend plot exists for. Slots end YESTERDAY, a
   * missing night is hatched and an away day framed, never a zero column:
   * the week strip's rules, at a new surface. */
  _dkJoelTrends(sec) {
    const m = this._nurseryModel(sec);
    if (!m.loaded || m.err) return "";
    const N = sec.days || 7;
    const { sessions, stats } = m;
    const norms = psNurseryNorms(sessions, { days: N });
    const away = this._awayDays(sec);
    const t0 = new Date(this._nowMs()); t0.setHours(12, 0, 0, 0);
    const slots = [];
    for (let i = N; i >= 1; i--) {
      const d = new Date(t0); d.setDate(d.getDate() - i);
      slots.push({ key: psDayKey(d), dow: d.toLocaleDateString([], { weekday: "narrow" }) });
    }
    const nights = slots.map((sl) => ({ ...sl, s: sessions.find((x) => x.night && !x.active && x.day === sl.key) }));
    const naps = slots.map((sl) => ({ ...sl,
      mins: sessions.filter((x) => !x.night && !x.active && x.day === sl.key).reduce((a, x) => a + x.asleepMinutes, 0) }));
    const has = nights.filter((n) => n.s).length;
    if (!has) return "";

    const col = (n, v, max, cls, band) => {
      if (away.indexOf(n.key) >= 0) return `<i class="pd2-tc away" title="${psEsc(this._awayLabel(sec))}"></i>`;
      if (v == null) return `<i class="pd2-tc none"></i>`;
      return `<i class="pd2-tc ${cls}" style="height:${Math.max(3, Math.min(100, v / max * 100)).toFixed(1)}%" title="${psEsc(band)}"></i>`;
    };
    const axis = `<div class="pd2-tax">${slots.map((sl) => `<span>${psEsc(sl.dow)}</span>`).join("")}</div>`;

    /* Zoomed to HIS range, not to zero: every night sits between ten and
       twelve hours, and a zero-based axis drew seven identical full bars. The
       floor is labelled on the plot so the zoom is never mistaken for scale. */
    const aVals = nights.filter((n) => n.s).map((n) => n.s.asleepMinutes)
      .concat(norms.asleep ? [norms.asleep.lo, norms.asleep.hi] : []);
    const aLo = Math.max(0, Math.floor((Math.min(...aVals) - 60) / 60) * 60);
    const aHi = Math.max(...aVals) + 15;
    const aPct = (v) => Math.max(0, Math.min(100, (v - aLo) / (aHi - aLo) * 100));
    const bandA = norms.asleep ? `<div class="pd2-tband" style="bottom:${aPct(norms.asleep.lo).toFixed(1)}%;height:${
      (aPct(norms.asleep.hi) - aPct(norms.asleep.lo)).toFixed(1)}%"></div>` : "";
    const asleep = `<div class="pd2-tplot">${bandA}<span class="pd2-tfloor">${psHM(aLo)}</span>${nights.map((n) =>
      col(n, n.s ? n.s.asleepMinutes - aLo : null, aHi - aLo, n.s && n.s.edited ? "night edited" : "night", n.s ? psHM(n.s.asleepMinutes) : "")).join("")}</div>`;

    /* Wake-ups: one pip per visit. A hand-logged night or one the server was
       blind through has no count to draw, and says so with a hollow pip. */
    const ins = `<div class="pd2-tdots">${nights.map((n) => {
      if (!n.s) return `<i class="pd2-td none"></i>`;
      if (n.s.interventions == null || n.s.blindMin) return `<i class="pd2-td"><u class="q"></u></i>`;
      return `<i class="pd2-td" title="${n.s.interventions}">${"<u></u>".repeat(Math.min(6, n.s.interventions))}</i>`;
    }).join("")}</div>`;
    const obs = nights.filter((n) => n.s && n.s.interventions != null && !n.s.blindMin);
    const avgIns = obs.length ? obs.reduce((a, n) => a + n.s.interventions, 0) / obs.length : null;

    const nMax = Math.max(180, ...naps.map((n) => n.mins));
    const napPlot = `<div class="pd2-tplot sm">${naps.map((n) =>
      col(n, n.mins || (sessions.some((x) => x.day === n.key) ? 0 : null), nMax, "nap", psHM(n.mins))).join("")}</div>`;
    const napDays = naps.filter((n) => n.mins > 0);
    const napAvg = napDays.length ? Math.round(napDays.reduce((a, n) => a + n.mins, 0) / napDays.length) : null;

    /* Tonight (or last night, by day) against his own usual, in numbers —
       each line only when both halves exist. */
    const ref = m.nightSession;
    const done = sessions.filter((x) => x.night && !x.active && x !== ref).slice(-N);
    const clockOf = (t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
    const settleObs = done.filter((x) => !x.manual && x.settleMinutes != null);
    const settleAvg = settleObs.length ? Math.round(settleObs.reduce((a, x) => a + x.settleMinutes, 0) / settleObs.length) : null;
    const firsts = done.filter((x) => !x.manual && x.events && x.events.length).map((x) => {
      const c = clockOf(x.events[0]); return c < 720 ? c + 1440 : c;
    });
    const firstAvg = firsts.length >= 2 ? Math.round(firsts.reduce((a, b) => a + b, 0) / firsts.length) % 1440 : null;
    const vs = [];
    if (ref && stats.bedMean != null) vs.push(["Put down", psClock(ref.from), `usual ${psMinsToClock(stats.bedMean)}`]);
    if (ref && !ref.manual && ref.hadExit && settleAvg != null) vs.push(["Settled in", psHM(ref.settleMinutes), `usual ${psHM(settleAvg)}`]);
    if (firstAvg != null) vs.push(["First wake, usually", psMinsToClock(firstAvg), `${firsts.length} of ${done.length} nights`]);
    const vsHtml = !vs.length ? "" : `<div class="pd2-tvs"><span class="ps-lbl">${ref && ref.active ? "Tonight" : "Last night"} vs his usual</span>
      ${vs.map(([k, a, b]) => `<div><span>${psEsc(k)}</span><b>${psEsc(a)}</b><em>${psEsc(b)}</em></div>`).join("")}</div>`;

    return `<div class="pd2-trends">
      ${vsHtml}
      <div class="pd2-tbox"><div class="pd2-thd"><span class="ps-lbl">Asleep · ${N} nights</span>
        <em>${norms.asleep ? `band ${psHM(norms.asleep.lo)}–${psHM(norms.asleep.hi)}` : "no band yet"}</em></div>${asleep}${axis}</div>
      <div class="pd2-tbox"><div class="pd2-thd"><span class="ps-lbl">Went in</span>
        <em>${avgIns == null ? "not measured" : `avg ${avgIns.toFixed(1)} a night`}</em></div>${ins}${axis}</div>
      <div class="pd2-tbox"><div class="pd2-thd"><span class="ps-lbl">Naps a day</span>
        <em>${napAvg == null ? "none recorded" : `avg ${psHM(napAvg)}`}</em></div>${napPlot}${axis}</div>
    </div>`;
  }

  /* "11h 32m" at the hero step does not fit inside the ring it sits in; the
     digits carry the number, so the units step down rather than the figure. */
  _dkHM(mins) {
    return psEsc(psHM(mins)).replace(/(\d+)([hm])/g, "$1<u>$2</u>");
  }

  /* ----------------------------------------------------------- climate --- */

  _dkClimate(sec) {
    const h = this._hass;
    const th = h.states[sec.goal] || h.states[sec.thermostat];
    const cur = th && th.attributes.current_temperature;
    const goal = this._optGoal(sec.goal || sec.thermostat, th && th.attributes.temperature);
    const action = (th && th.attributes.hvac_action) || (th && th.state) || "idle";
    const rng = sec.ring || { min: 60, max: 80 };
    const f = (v) => Math.max(0, Math.min(1, (v - rng.min) / (rng.max - rng.min)));
    const heating = action === "heating";
    const col = heating ? "var(--ps-heat)" : "var(--ps-cool)";
    /* No humidity under the ring: it was the FIRST ROOM's (the living room)
       printed under a number that belongs to the active zone, and every
       room's own humidity is in the table below. */

    /* The chip is a comparison, and at goal there is nothing to compare. */
    const diff = cur == null || goal == null ? null : Math.round(cur - goal);
    const chip = diff == null || diff === 0 ? ""
      : `<span class="ps-chip ${diff > 0 ? "warn" : "cool"}">${Math.abs(diff)}° ${diff > 0 ? "over" : "under"} goal</span>`;
    /* The phone's chips — the running preset and GTTC's season advice — ride
       the label row beside the comparison, where they cost no height. */
    const chips = this._climateChips(sec);
    const reason = th && th.attributes.hvac_action_reason;

    const zc = sec.zones || {};
    const activeZone = pcState(h, zc.select);
    const zones = (zc.options || []).map((o) => {
      const t = pcNum(h, o.temp);
      return `<button class="pd2-seg ${activeZone === o.option ? "on" : ""}" type="button" data-zone="${psEsc(o.option)}">${
        psEsc(o.label || o.option)}${t == null ? "" : ` · ${Math.round(t)}°`}</button>`;
    }).join("");

    /* One sparkline scale down the column, as on the phone. An offline room is
       HATCHED and reads "offline" — never a 0 and never a blank that looks
       like a room with no sensor at all. */
    let lo = Infinity, hi = -Infinity;
    (sec.rooms || []).forEach((r) => (this._history[r.temp] || []).forEach((p) => {
      const v = parseFloat(p.s);
      if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }));
    const scale = Number.isFinite(lo) && hi > lo ? { lo, hi } : null;
    const rooms = (sec.rooms || []).map((r) => {
      /* The phone's reader — so a room whose sensor died but whose thermostat
         still reports reads the same on both surfaces, with the substitute
         named and how long its own sensor has been dark. */
      const { t, hu, via, viaId, offSince } = this._roomRead(r);
      const off = t == null;
      const age = offSince ? ` ${pcAgo(offSince)}` : "";
      return `<div class="pd2-room ${off ? "off" : ""}${via ? " via" : ""}" data-info="${psEsc(via ? viaId : r.temp)}">
          <span class="pd2-rn">${psEsc(r.name || pcName(h, r.temp))}${via
            ? `<small>${psEsc(via)}<span class="pd2-offage"> · sensor off${psEsc(age)}</span></small>` : ""}</span>
          <span class="pd2-spark">${off || via ? "" : this._sparkSvg(r.temp, scale)}</span>
          <span class="pd2-rt">${off ? `offline${psEsc(age)}` : pcDeg(t) + "°"}</span>
          <span class="pd2-rh">${off || hu == null ? "" : Math.round(hu) + "%"}</span>
        </div>`;
    }).join("");

    const wave = this._waveSvg(sec);
    const inNow = pcNum(h, (sec.graph || {}).inside);
    const outNow = pcNum(h, (sec.graph || {}).outside);
    return `
      <div class="pd2-lblrow"><button class="pd2-lbl pd2-open" type="button" data-sheet="climate"
          title="Open climate">${psEsc(sec.title || "Climate")}<em>›</em></button>
        <span class="pd2-chips">${chips}${chip}</span></div>
      <div class="pd2-chero">
        <div class="pd2-ring sm" data-info="${psEsc(sec.goal || sec.thermostat)}">
          ${this._ringSvg(150, 10, [[cur == null ? 0 : f(cur), col]], goal == null ? null : f(goal), "var(--ps-text)")}
          ${/* Whose number: the zone GTTC is reading, the same caption the
                phone's ring carries — at the precision it was published. */""}
          <div class="pd2-rv"><b>${cur == null ? "—" : pcDeg(cur) + "°"}</b><small>${
            psEsc(String(this._climateSource(sec, cur)).toUpperCase())}</small><small class="pd2-rv2">${
            psEsc(this._humanize(action).toUpperCase())}</small></div>
        </div>
        <div class="pd2-goal">
          <span class="pd2-cap">${heating ? "HEAT TO" : "GOAL"}</span>
          <div class="pd2-step">
            <button class="ps-step" type="button" data-step="-1" aria-label="Lower goal">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M5 12h14"/></svg></button>
            <b>${goal == null ? "—" : Math.round(goal) + "°"}</b>
            <button class="ps-step" type="button" data-step="1" aria-label="Raise goal">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M12 5v14M5 12h14"/></svg></button>
          </div>
          ${reason ? `<div class="pd2-reason">${psEsc(this._reasonText(reason))}</div>` : ""}
          ${zones ? `<div class="pd2-segs">${zones}</div>` : ""}
          ${sec.schedule || sec.season ? `<div class="pd2-cbtns">
            ${sec.schedule ? `<button class="pd2-link" type="button" data-sheet="schedule">Schedule</button>` : ""}
            ${this._seasonHtml(sec)}</div>` : ""}
        </div>
      </div>
      ${this._holdHtml(sec)}
      ${wave ? `<div class="pd2-wide pd2-graph">
          <div class="pd2-lblrow"><span class="pd2-cap">LAST 24H</span>
            <div class="ps-wlg pd2-wlg" data-readout="wave">
              <span><i style="background:var(--ps-cool)"></i>In<b>${inNow == null ? "—" : inNow.toFixed(1) + "°"}</b></span>
              <span><i style="background:var(--ps-heat)"></i>Out<b>${outNow == null ? "—" : outNow.toFixed(1) + "°"}</b></span></div></div>
          <div class="ps-wave" data-scrub="wave"><div class="ps-cross" hidden></div>${wave}</div></div>` : ""}
      <div class="pd2-rooms">
        <div class="pd2-room hd"><span>ROOM</span><span>24H</span><span>TEMP</span><span>RH</span></div>
        ${rooms}
      </div>`;
  }

  /* ----------------------------------------------------------- weather --- */

  /* The phone's forecast rail, inherited whole: seven capsules on one axis,
     with the stub, hatch and now-tick states already in it. The wide face
     adds the facts the phone keeps behind its sheet. */
  _dkWeather(sec) {
    const facts = this._wxDetailFacts(sec);
    /* The whole column is one door onto the phone's week sheet — the hourly
       strip, measured vs forecast and the detail rows all live there, and a
       seven-capsule rail with nothing behind it would be the only place on
       the desk that knew less than the phone. */
    return `<div class="pd2-colbtn" data-pd2open="wx" role="button" tabindex="0" aria-label="Open the week's weather">
      <div class="pd2-lblrow"><span class="pd2-lbl">${psEsc(sec.title || "Weather")}<em>›</em></span>
        <span class="pd2-src">Forecast · high / low</span></div>
      ${this._wxForecastRail(sec)}
      ${this._dkWxRows(sec)}
      ${/* The wide face has a whole column to itself, so the next 24 hours
            come out from behind the drawer — the strip a desk has the width
            for and the phone keeps a tap away. */""}
      <div class="pd2-wide pd2-hourly">${this._wxHourly(sec)}</div>
      ${facts ? `<div class="pd2-wide pd2-facts">${facts}</div>` : ""}</div>`;
  }

  /* The week as ROWS, for a short window.
   *
   * Seven vertical capsules need about 250px before they read as anything; at
   * 666px tall the column left them ~60px and they flattened into pills. A
   * row per day carrying a horizontal low→high bar says the same thing in
   * ~170px. Rendered always and swapped in by a container query, so there is
   * one data path — the same `_wxFcDays` the capsules draw, measured today
   * and all. */
  _dkWxRows(sec) {
    const days = this._wxFcDays(sec);
    if (!days.length) return "";
    const los = days.map((d) => d.lo).filter((v) => v != null);
    const his = days.map((d) => d.hi).filter((v) => v != null);
    if (!los.length && !his.length) return "";
    const lo = Math.min(...los.concat(his)), hi = Math.max(...los.concat(his));
    const span = Math.max(1, hi - lo);
    const x = (v) => ((v - lo) / span) * 100;
    return `<div class="pd2-wxrows">${days.map((d) => {
      const a = d.lo == null ? null : x(d.lo), b = d.hi == null ? null : x(d.hi);
      const bar = a == null && b == null ? `<i class="none"></i>`
        : a == null || b == null ? `<i class="stub" style="left:${Math.max(0, (a == null ? b : a) - 2).toFixed(1)}%"></i>`
          : `<i class="${d.meas ? "meas" : ""}" style="left:${a.toFixed(1)}%;right:${(100 - b).toFixed(1)}%"></i>`;
      return `<div class="pd2-wxr${d.today ? " now" : ""}"><span>${psEsc(this._wxDow(d.ts, d.today))}</span>
          <span class="lo">${d.lo == null ? "—" : Math.round(d.lo) + "°"}</span>
          <span class="rng">${bar}</span>
          <b>${d.hi == null ? "—" : Math.round(d.hi) + "°"}</b>
          <span class="pp${d.pop != null && d.pop >= 50 ? " wet" : ""}">${d.pop == null ? "" : Math.round(d.pop) + "%"}</span></div>`;
    }).join("")}</div>`;
  }

  /* Tonight · feels · dew/wind · sunrise, as rows. Each drops out when its
     source has nothing — a row reading "—" is a claim the provider made. */
  _wxDetailFacts(sec) {
    const h = this._hass;
    const rows = [];
    const tn = (this._wxFc || []).find((d) => d.today);
    if (tn && tn.lo != null) rows.push(["Tonight", `${pcWxText(tn.condition) || ""}${tn.condition ? ", " : ""}low ${Math.round(tn.lo)}°`]);
    const fe = sec.feels_from && h.states[sec.feels_from] && h.states[sec.feels_from].attributes.apparent_temperature;
    if (fe != null) rows.push(["Feels like", `${Math.round(fe)}°`]);
    const fa = sec.forecast && h.states[sec.forecast] ? h.states[sec.forecast].attributes : {};
    const bits = [fa.dew_point != null ? `${Math.round(fa.dew_point)}°` : null,
      fa.wind_speed != null ? `${Math.round(fa.wind_speed)} ${fa.wind_speed_unit || "mph"}` : null].filter(Boolean);
    /* The label names only what came back: NWS publishes wind and no dew
       point, and "Dew point · wind — 6 mph" reads as a dew point of 6. */
    if (bits.length) rows.push([[fa.dew_point != null ? "Dew point" : null, fa.wind_speed != null ? "wind" : null]
      .filter(Boolean).join(" · ").replace(/^w/, (x) => (fa.dew_point != null ? x : "W")), bits.join(" · ")]);
    const sun = sec.sun && h.states[sec.sun];
    const rise = sun && sun.attributes.next_rising;
    if (rise) rows.push(["Sunrise", new Date(rise).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })]);
    return rows.map(([k, v]) => `<div><span>${psEsc(k)}</span><b>${psEsc(v)}</b></div>`).join("");
  }

  /* -------------------------------------------------------------- side --- */

  /* Now playing: every live room and television, each one routed by
     _playTarget — DERIVED, never read from config, which is what stopped the
     Media merge orphaning every now-playing route on the phone. */
  _dkNow(sec) {
    const h = this._hass;
    const rows = [];
    ((this._config.now_playing || {}).players || []).forEach((p) => {
      const st = h.states[p.entity];
      if (!psLiveMusic(st)) return;
      const a = st.attributes;
      const art = a.entity_picture_local;
      /* WHERE, first. On a desk built around the nursery, white noise with no
         room reads as Joel's Hatch — it was the parents' bedroom speaker. The
         room leads, with the volume beside it, because those two are what
         you would reach for; the artist moves under the title. */
      const vol = a.volume_level == null ? null : Math.round(Number(a.volume_level) * 100);
      rows.push(`<div class="pd2-np" ${this._playTarget("listen")} role="button" tabindex="0">
          <div class="pd2-art">${art ? `<img src="${psEsc(art)}" alt="" />`
            : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
          <div class="ps-grow"><div class="pd2-npw">${psEsc(p.name || pcName(h, p.entity))}${
            vol == null || !Number.isFinite(vol) ? "" : ` · vol ${vol}`}</div>
            <div class="pd2-npt">${psEsc(a.media_title || "Playing")}</div>
            ${a.media_artist ? `<div class="pd2-nps">${psEsc(a.media_artist)}</div>` : ""}</div>
          <button class="ps-npb" type="button" data-mp="playpause" data-entity="${psEsc(p.entity)}"
            aria-label="${st.state === "playing" ? "Pause" : "Play"}">
            <svg viewBox="0 0 24 24" class="ps-ico">${st.state === "playing"
              ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
        </div>`);
    });
    (sec.tvs || []).forEach((t) => {
      const st = pcState(h, t.media_player);
      if (!st || st === "off" || st === "unavailable" || st === "unknown") return;
      const app = pcState(h, t.app_sensor);
      const shown = app && app !== "unknown" && app !== "unavailable" ? app : "On";
      rows.push(`<div class="pd2-np" ${this._playTarget("watch")} role="button" tabindex="0">
          <div class="pd2-art app">${this._appIcon(sec, app)}</div>
          <div class="ps-grow"><div class="pd2-npt">${psEsc(shown)}</div>
            <div class="pd2-nps">${psEsc(t.name)} TV</div></div>
          <span class="pd2-pill">Remote</span>
        </div>`);
    });
    const empty = `<div class="pd2-np quiet" ${this._playTarget("listen")} role="button" tabindex="0">
        <div class="pd2-art"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg></div>
        <div class="ps-grow"><div class="pd2-npt">Nothing playing</div><div class="pd2-nps">Music and televisions</div></div>
      </div>`;
    return `<div class="pd2-lbl pd2-nplbl">${psEsc(sec.title || "Now playing")}</div>${rows.join("") || empty}`;
  }

  /* Ahead: today always, later days only when they carry something. Hidden
     in the compact face, where House takes a single "Next" row instead. */
  _dkAhead(sec) {
    const days = sec.days || 5;
    const t0 = new Date(this._nowMs()); t0.setHours(0, 0, 0, 0);
    let out = "";
    for (let d = 0; d < days; d++) {
      const day = new Date(t0.getTime() + d * 86400000);
      const evs = this._events.filter((e) => e.t >= day.getTime() && e.t < day.getTime() + 86400000);
      if (!evs.length && d > 0) continue;
      /* A day off is marked under its label — the workday calendar's one fact,
         which it used to state as an event on every day that was NOT off. */
      const off = this._dayOff(day.getTime());
      out += `<div class="pd2-aday"><span class="${d === 0 ? "today" : ""}">${d === 0 ? "TODAY"
        : day.toLocaleDateString([], { weekday: "short" }).toUpperCase()}${off ? `<em>off</em>` : ""}</span><div>${evs.length
        ? evs.map((e) => `<div class="pd2-ev"><i style="background:${psEsc(e.color)}"></i><em>${e.allDay ? "all day"
          : new Date(e.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</em><span>${psEsc(e.name)}</span></div>`).join("")
        : `<div class="pd2-ev none">Nothing scheduled</div>`}</div></div>`;
    }
    return `<div class="pd2-ahead"><div class="pd2-lbl">${psEsc(sec.title || "Ahead")}</div>${out}</div>`;
  }

  /* The next event after now, for the compact face's single House row. */
  _dkNext() {
    const now = this._nowMs();
    const e = this._events.find((x) => !x.allDay && x.t > now);
    if (!e) return null;
    const d = new Date(e.t);
    const same = new Date(now).toDateString() === d.toDateString();
    return `${same ? "" : d.toLocaleDateString([], { weekday: "short" }) + " "}${
      d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${e.name}`;
  }

  /* House: one row per thing that lives behind the rail. Each is a dot and one
     line, and each opens its drawer or mode. The crew's amber comes from the
     crew section's OWN rules (_crewNeeds) — a second set of thresholds here
     would be a second place for them to drift. */
  _dkHouse(sec) {
    const h = this._hass;
    const c = this._config;
    const dock = c.dock || [];
    const route = (pred) => {
      const i = dock.findIndex(pred);
      return i >= 0 && this._visible(dock[i]) ? `data-dock="${i}"` : "";
    };
    const needs = this._crewNeeds(sec);
    const rows = [];

    const ls = (c.sections || []).find((s) => s.type === "lights");
    if (ls) {
      const lights = this._lightList(ls);
      const on = lights.filter((l) => l.on);
      /* Offline lamps are counted here, because nothing else on the stage
         would tell you two of them have dropped off the network. */
      const dead = lights.reduce((n, l) => n + (l.gone ? 1
        : (l.cfg.members || []).filter((m) => !pcReading(h, m).ok).length), 0);
      rows.push({ name: "Lights", dot: on.length ? "lit" : "", attrs: route((d) => d.sheet === "lights") || `data-sheet="lights"`,
        detail: [on.length ? `${on.length} on · ${on.map((l) => l.name).join(", ")}` : "All off",
          dead ? `${dead} offline` : null].filter(Boolean).join(" · ") });
    }
    const v = sec.vacuum || {};
    if (v.entity) {
      const vs = pcState(h, v.entity);
      const mine = needs.filter((n) => !/drawer|litter|washer|Washer|Litter/.test(n.text));
      /* Consumables as a COUNT. The list ("Side brush 12% · Wheel 16% ·
         Sensors 16%") wrapped onto two lines at 1440 and truncated at 1280;
         the crew drawer, one click away, is where the names are. */
      const short = (n) => {
        if (n.icon !== "mdi:tools") return n.text;
        const k = parseInt(n.text, 10) || 1;
        return `${k} part${k === 1 ? "" : "s"} due`;
      };
      const wear = mine.length ? mine.map(short).join(" · ") : null;
      rows.push({ name: v.name || "Vacuum", dot: vs === "error" ? "bad" : mine.length ? "warn" : vs === "cleaning" ? "cool" : "good",
        attrs: `data-sheet="${psEsc(sec.sheet || "crew")}"`,
        detail: [this._humanize(vs || "unknown"), wear].filter(Boolean).join(" · ") });
    }
    const l = sec.litter || {};
    if (l.entity) {
      const drawer = pcNum(h, l.waste_drawer);
      const litter = pcNum(h, l.litter_level);
      const visits = pcNum(h, (l.pet || {}).visits);
      const lneed = needs.find((n) => /drawer|Litter|litter/.test(n.text));
      /* The machine's name, not the cat's: the drawer called it one thing,
         this row another, and the entity a third. The litter level rides
         along because it is the headline of the drawer's ring — the two
         surfaces now lead with numbers that agree. */
      rows.push({ name: l.name || "Litter", dot: lneed ? (lneed.sev === "bad" ? "bad" : "warn") : "good",
        attrs: `data-sheet="${psEsc(sec.sheet || "crew")}"`,
        detail: [drawer == null ? null : `Drawer ${Math.round(drawer)}%`,
          litter == null ? null : `litter ${Math.round(litter)}%`,
          visits == null ? null : `${Math.round(visits)} visit${visits === 1 ? "" : "s"}`].filter(Boolean).join(" · ") || this._humanize(pcState(h, l.entity)) });
    }
    const w = sec.washer || {};
    if (w.entity) {
      const ws = pcState(h, w.entity);
      rows.push({ name: w.name || "Washer", dot: ws === "Finished" ? "warn" : ws === "Running" ? "cool" : "",
        attrs: `data-sheet="${psEsc(sec.sheet || "crew")}"`, detail: ws || "—" });
    }
    const srv = c.server;
    if (srv) {
      const arr = pcNum(h, (srv.storage || {}).array);
      const run = pcState(h, (srv.docker || {}).running);
      const sf = this._serverFaults ? this._serverFaults() : [];
      rows.push({ name: srv.name || "Server", dot: sf.length ? "warn" : "good", attrs: route((d) => d.mode === "systems"),
        detail: [arr == null ? null : `${Math.round(arr)}% full`, run && run !== "unknown" ? `${run} up` : null].filter(Boolean).join(" · ") || "—" });
    }
    /* `house:` — rows the crew does not know about. The first desk carried
       Doors and Occupancy as quick tiles; dropping them here would orphan
       both. Each row is an entity, its state in words, amber on `alert_when`,
       and a tap that opens `sheet:` or else the entity's more-info. */
    (c.house || []).forEach((r) => {
      if (!r || !r.entity || !this._visible(r)) return;
      const st = pcState(h, r.entity);
      const bad = !st || st === "unavailable" || st === "unknown";
      const alert = !bad && (r.alert_when || []).indexOf(st) >= 0;
      const on = !bad && (r.on_when || []).indexOf(st) >= 0;
      rows.push({ name: r.name || pcName(h, r.entity), dot: bad ? "" : alert ? "warn" : on ? "cool" : "good",
        attrs: r.sheet ? `data-sheet="${psEsc(r.sheet)}"` : `data-info="${psEsc(r.entity)}"`,
        detail: bad ? "Not reporting" : this._humanize(st) });
    });
    /* `short` is the one-word form the two-column grid uses on a short
       window, where seven full rows ran off the bottom of the glass. */
    const shortOf = (r) => {
      const parts = String(r.detail).split(" · ");
      /* An amber row keeps its REASON, not its state: "Docked" in amber says
         something is wrong and not what. */
      return r.dot === "warn" || r.dot === "bad" ? parts[parts.length - 1] : parts[0];
    };
    return `<div class="pd2-lbl">House</div><div class="pd2-house">${rows.map((r) =>
      `<button class="pd2-hrow" type="button" ${r.attrs}><span class="pd2-dot ${r.dot}"></span><b>${psEsc(r.name)}</b>
        <span class="${r.dot === "warn" || r.dot === "bad" ? r.dot : ""}"><i class="pd2-long">${psEsc(r.detail)}</i><i class="pd2-short">${psEsc(shortOf(r))}</i></span></button>`).join("")}</div>
      ${this._dkCrewCards(sec)}`;
  }

  /* The crew's two cards, on a TALL window only (the container query shows
     them). The rings are the drawer's own renderer, drawn as a picture: the
     whole block is one door onto the crew sheet, and nothing inside it takes
     a click of its own. */
  _dkCrewCards(sec) {
    const v = sec.vacuum || {}, l = sec.litter || {};
    const cards = [v.entity ? this._crewVacCard(v, false) : "", l.entity ? this._crewLitterCard(l, false) : ""].filter(Boolean);
    if (!cards.length) return "";
    return `<div class="pd2-tall pd2-crewmini" data-sheet="${psEsc(sec.sheet || "crew")}" role="button" tabindex="0"
        aria-label="Open the crew"><div class="ps-cwgrid">${cards.join("")}</div></div>`;
  }

  /* ------------------------------------------------------------- server --- */

  /* The server's Overview, laid out for a desk.
   *
   * The phone's five pages set in two columns left every page under half the
   * glass: Overview ended at 420px of 900. A desk can hold on ONE page what
   * the phone spreads across four — so Overview is the server at a glance
   * (identity, faults, the pools and every array disk; the CPU trace, fans,
   * network and power; the running containers and parity), and the other tabs
   * stay for detail. Power moves behind a disclosure: Reboot, Shut down and
   * Stop array were three red buttons on the page you open to LOOK. */
  _syOverview(s) {
    const p = this._syOverviewParts(s);
    const disks = this._syDisks().filter((d) => d.role === "data" && d.hasUsage)
      .map((d) => this._syMeter(d.key, d.usageId, { warn: 85, crit: 95 })).join("");
    const all = this._syContainers();
    const on = all.filter((c) => c.on).sort((a, b) => a.name.localeCompare(b.name));
    const off = all.filter((c) => !c.on).map((c) => c.name).sort();
    const vms = this._syVms();
    const ctr = !all.length && !vms.length ? "" : `<div class="ps-sycard pd2-ctr">
        <div class="ps-syrow"><span class="ps-lbl">Containers</span><span class="ps-sysub">${on.length} of ${all.length} running</span></div>
        ${on.map((c) => `<div class="ps-syrow ps-sysub"${c.url ? ` data-syurl="${psEsc(c.url)}"` : ` data-info="${psEsc(c.id)}"`}>
          <span><span class="ps-dotc good"></span>${psEsc(c.name)}</span><b>${psEsc(c.port)}${c.url ? " ↗" : ""}</b></div>`).join("")}
        ${off.length ? `<div class="ps-sysub pd2-ctroff">Stopped · ${psEsc(off.join(", "))}</div>` : ""}
        ${vms.map((v) => `<div class="ps-syrow ps-sysub" data-info="${psEsc(v.id)}"><span><span class="ps-dotc ${v.on ? "good" : ""}"></span>VM · ${psEsc(v.name)}</span><b>${v.on ? "on" : "off"}</b></div>`).join("")}
      </div>`;
    const power = !p.power ? "" : this._pd2Pow
      ? p.power.replace(`<span class="ps-lbl">Power</span>`, `<div class="ps-syrow"><span class="ps-lbl">Power</span>
          <button class="ps-btn" type="button" data-pd2pow="0">Hide</button></div>`)
      : `<button class="ps-btn pd2-powbtn" type="button" data-pd2pow="1">Power…</button>`;
    return `<div class="pd2-nas">
        <div>${p.id}${p.faults}${p.meters}${disks ? `<div class="ps-sycard"><span class="ps-lbl">Array disks</span>${disks}</div>` : ""}</div>
        <div>${this._syPerf(s)}</div>
        <div>${ctr}${p.parity}${power}</div>
      </div>`;
  }

  /* ----------------------------------------------------------- binding --- */

  _pd2Bind() {
    /* A role=button div answers the keyboard the way a button does. */
    this._each(".pd2-hwx[data-sheet]", (el) => el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
    }));
    this._each("[data-pd2pow]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._pd2Pow = el.dataset.pd2pow === "1";
      this._armed = null;
      this._render();
    }));
    this._each(".pd2-crewmini", (el) => el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
    }));
    this._each("[data-pd2home]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._sheet = null; this._mediaPick = null; this._napEdit = null; this._mode = null;
      this._pd2Home = true;
      this._render();
    }));
    this._each("[data-pd2joel], [data-pd2open]", (el) => {
      const k = el.dataset.pd2open || "joel";
      const open = (e) => {
        if (e && e.target && e.target.closest && e.target.closest("button, [data-info]") && e.target.closest("button, [data-info]") !== el) return;
        this._sheet = this._sheet === k ? null : k;
        this._render();
      };
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }

  getCardSize() { return 12; }

  static get styles() {
    return PurdyShellCard.styles + PD2_STYLES;
  }
}
