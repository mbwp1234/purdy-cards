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
      if (e && e.key === "Escape" && (this._sheet || this._pd2Joel)) {
        this._sheet = null; this._mediaPick = null; this._napEdit = null;
        this._render();
      }
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

  /* The drawer's contents are the shell's own sheets, with one addition: the
     Joel sheet, which is the phone's nursery section drawn open. The drawer is
     ~460px, phone width, so the section body renders unchanged — which is the
     whole reason the drawer is that wide. */
  _sheetHtml(faults) {
    if (this._sheet === "joel") {
      const sec = this._pd2Sec((this._config.stage || {}).joel);
      if (!sec) return "";
      const close = `<button class="ps-x" type="button" id="ps-close" aria-label="Close">
        <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall pd2-jsheet">
          <div class="ps-sheeth"><span class="ps-lbl">${psEsc(sec.title || "Joel")}</span>${close}</div>
          <div class="ps-sect open">${this._secNursery(sec)}</div>
        </div>`;
    }
    return super._sheetHtml(faults);
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
      /* The divider sits before the last entry, the way the mockup groups the
         bell apart from the places. */
      const sep = n === items.length - 1 && items.length > 2 ? `<i class="pd2-rsep"></i>` : "";
      return `${sep}<button class="pd2-rb ${on ? "on" : ""} ${alert ? "alert" : ""}" type="button"
          ${home ? `data-pd2home="1"` : `data-dock="${i}"`} aria-label="${psEsc(d.name)}" title="${psEsc(d.name)}">
          <ha-icon icon="${psEsc(d.icon)}"></ha-icon></button>`;
    }).join("");
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
    const worst = faults.length
      ? (faults[0].severity === "critical" ? "bad" : faults[0].severity === "warn" ? "warn" : "")
      : "good";
    const who = this._who();
    const chip = this._dkWxChip();
    return `
      <div class="pd2-hl">
        <h1>${this._greeting()}${who ? `, ${psEsc(who)}` : ""}</h1>
        <div class="pd2-date">${now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
          <i>·</i>${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
      </div>
      <div class="pd2-ppl">${this._hdrPeople()}</div>
      <div class="pd2-hr">
        ${wTemp == null ? "" : `<div class="pd2-hwx" data-info="${psEsc(c.weather_temp || c.weather)}">
          <ha-icon icon="${pcWxIcon(wState)}"></ha-icon>
          <div><b>${Math.round(wTemp)}°</b><span>${psEsc(pcWxText(wState) || "")}${
            feels == null ? "" : ` · feels ${Math.round(feels)}°`}</span></div></div>`}
        ${chip}
        ${pcOffline(h)
          ? `<span class="ps-chip bad"><span class="ps-dot"></span>Reconnecting…</span>`
          : `<button class="ps-chip ${worst}" type="button" id="ps-alert">
            <span class="ps-dot"></span>${faults.length
              ? `${faults.length} need${faults.length > 1 ? "" : "s"} attention` : "All clear"}</button>`}
      </div>`;
  }

  /* The weather chip is a ROLL-UP — the first wet period ahead and how
     likely — which is a fact you would otherwise read off seven columns. A dry
     week has nothing to roll up and draws no chip at all. */
  _dkWxChip() {
    const wet = (this._wxFc || []).find((d) => d.pop != null && d.pop >= 50);
    if (!wet) return "";
    const when = wet.today ? (new Date(this._nowMs()).getHours() >= 17 ? "tonight" : "today")
      : this._wxDow(wet.ts, false);
    return `<span class="ps-chip warn">${psEsc(pcWxText(wet.condition) || "Rain")} ${psEsc(when)} · ${Math.round(wet.pop)}%</span>`;
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
        ${!loaded || (!sessions.length && stats.bedMean == null) ? ""
          : this._nurseryDayRail(sessions, todayKey, stats.bedMean, norms)}
        ${lastRow}
        ${verdict}
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
    const hum = pcNum(h, (sec.rooms || [])[0] && (sec.rooms || [])[0].humidity);

    /* The chip is a comparison, and at goal there is nothing to compare. */
    const diff = cur == null || goal == null ? null : Math.round(cur - goal);
    const chip = diff == null || diff === 0 ? ""
      : `<span class="ps-chip ${diff > 0 ? "warn" : "cool"}">${Math.abs(diff)}° ${diff > 0 ? "over" : "under"} goal</span>`;

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
      const rd = pcReading(h, r.temp);
      const t = rd.ok ? pcNum(h, r.temp) : null;
      const hu = pcNum(h, r.humidity);
      const off = t == null;
      return `<div class="pd2-room ${off ? "off" : ""}" data-info="${psEsc(r.temp)}">
          <span class="pd2-rn">${psEsc(r.name || pcName(h, r.temp))}</span>
          <span class="pd2-spark">${off ? "" : this._sparkSvg(r.temp, scale)}</span>
          <span class="pd2-rt">${off ? "offline" : t.toFixed(1) + "°"}</span>
          <span class="pd2-rh">${off || hu == null ? "" : Math.round(hu) + "%"}</span>
        </div>`;
    }).join("");

    const wave = this._waveSvg(sec);
    return `
      <div class="pd2-lblrow"><span class="pd2-lbl">${psEsc(sec.title || "Climate")}</span>${chip}</div>
      <div class="pd2-chero">
        <div class="pd2-ring sm" data-info="${psEsc(sec.goal || sec.thermostat)}">
          ${this._ringSvg(150, 10, [[cur == null ? 0 : f(cur), col]], goal == null ? null : f(goal), "var(--ps-text)")}
          <div class="pd2-rv"><b>${cur == null ? "—" : Math.round(cur) + "°"}</b><small>${
            psEsc(this._humanize(action).toUpperCase())}${hum == null ? "" : ` · ${Math.round(hum)}% RH`}</small></div>
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
          ${zones ? `<div class="pd2-segs">${zones}</div>` : ""}
          ${sec.schedule ? `<button class="pd2-link" type="button" data-sheet="schedule">Schedule</button>` : ""}
        </div>
      </div>
      ${this._holdHtml(sec)}
      ${wave ? `<div class="pd2-wide pd2-graph">
          <div class="pd2-lblrow"><span class="pd2-cap">LAST 24H</span></div>
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
    return `
      <div class="pd2-lblrow"><span class="pd2-lbl">${psEsc(sec.title || "Weather")}</span>
        <span class="pd2-src">Forecast · high / low</span></div>
      ${this._wxForecastRail(sec)}
      ${facts ? `<div class="pd2-wide pd2-facts">${facts}</div>` : ""}`;
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
      rows.push(`<div class="pd2-np" ${this._playTarget("listen")} role="button" tabindex="0">
          <div class="pd2-art">${art ? `<img src="${psEsc(art)}" alt="" />`
            : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
          <div class="ps-grow"><div class="pd2-npt">${psEsc(a.media_title || "Playing")}</div>
            <div class="pd2-nps">${psEsc([a.media_artist, p.name].filter(Boolean).join(" · "))}</div></div>
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
    return `<div class="pd2-lbl">${psEsc(sec.title || "Now playing")}</div>${rows.join("") || empty}`;
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
      out += `<div class="pd2-aday"><span class="${d === 0 ? "today" : ""}">${d === 0 ? "TODAY"
        : day.toLocaleDateString([], { weekday: "short" }).toUpperCase()}</span><div>${evs.length
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
      rows.push({ name: "Lights", dot: on.length ? "lit" : "", attrs: route((d) => d.sheet === "lights") || `data-sheet="lights"`,
        detail: on.length ? `${on.length} on · ${on.map((l) => l.name).join(", ")}` : "All off" });
    }
    const v = sec.vacuum || {};
    if (v.entity) {
      const vs = pcState(h, v.entity);
      const mine = needs.filter((n) => !/drawer|litter|washer|Washer|Litter/.test(n.text));
      rows.push({ name: v.name || "Vacuum", dot: vs === "error" ? "bad" : mine.length ? "warn" : vs === "cleaning" ? "cool" : "good",
        attrs: `data-sheet="${psEsc(sec.sheet || "crew")}"`,
        detail: [this._humanize(vs || "unknown"), mine.length ? (mine[0].sub || mine[0].text) : null].filter(Boolean).join(" · ") });
    }
    const l = sec.litter || {};
    if (l.entity) {
      const drawer = pcNum(h, l.waste_drawer);
      const visits = pcNum(h, (l.pet || {}).visits);
      const lneed = needs.find((n) => /drawer|Litter|litter/.test(n.text));
      rows.push({ name: (l.pet || {}).name || l.name || "Litter", dot: lneed ? (lneed.sev === "bad" ? "bad" : "warn") : "good",
        attrs: `data-sheet="${psEsc(sec.sheet || "crew")}"`,
        detail: [drawer == null ? null : `Drawer ${Math.round(drawer)}%`,
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
    const next = this._dkNext();
    const nextRow = next ? `<div class="pd2-hrow compact-only"><span class="pd2-dot aur"></span><b>Next</b><span>${psEsc(next)}</span></div>` : "";
    return `<div class="pd2-lbl">House</div><div class="pd2-house">${nextRow}${rows.map((r) =>
      `<button class="pd2-hrow" type="button" ${r.attrs}><span class="pd2-dot ${r.dot}"></span><b>${psEsc(r.name)}</b>
        <span class="${r.dot === "warn" || r.dot === "bad" ? r.dot : ""}">${psEsc(r.detail)}</span></button>`).join("")}</div>`;
  }

  /* ----------------------------------------------------------- binding --- */

  _pd2Bind() {
    this._each("[data-pd2home]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._sheet = null; this._mediaPick = null; this._napEdit = null; this._mode = null;
      this._render();
    }));
    this._each("[data-pd2joel]", (el) => {
      const open = (e) => {
        if (e && e.target && e.target.closest && e.target.closest("button, [data-info]") && e.target.closest("button, [data-info]") !== el) return;
        this._sheet = this._sheet === "joel" ? null : "joel";
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
