/* ============================================================================
 * purdy-desk-card — Tier 2, the stage
 *
 * The middle tier is the whole idea of the view: the panels you actually study,
 * side by side, where DETAIL IS BOUGHT WITH WIDTH RATHER THAN WITH A POP-UP.
 *
 * Every panel has three faces and shows exactly one of them:
 *
 *   full   the balanced state — what it looks like when nothing is expanded
 *   xtra   revealed underneath `full` when this panel is the expanded one
 *   mini   the folded headline, shown when a DIFFERENT panel is expanded
 *
 * `mini` is why this is folding and not hiding. Opening climate must not make
 * Joel disappear — it makes him a number you can still read. That is the whole
 * difference between this and the phone's pop-ups, which black out everything
 * behind them.
 *
 * All three faces are `display` swaps driven by a class on the panel wrapper.
 * NONE of them animates. The only transition on the screen is the stage's
 * grid-template-columns, on a node the renderer never replaces — see _mount.
 * An entry/exit animation on a patched node re-runs from zero on every state
 * change, which is how the phone's lamp chips ended up sliding under the thumb
 * constantly. Assume any such animation is wrong until proven against a
 * patching renderer.
 * ========================================================================== */

Object.assign(PurdyDeskCard.prototype, {

  /* The dispatch half of the two-places rule. PD_SECTIONS is the other half,
     and a test asserts the stage types here are exactly the stage-defaulted
     types there — either half alone is a card that throws out of setConfig. */
  _panelHtml(sec) {
    const fn = {
      climate: () => this._pnlClimate(sec),
      nursery: () => this._pnlNursery(sec),
      music: () => this._pnlMusic(sec),
      calendar: () => this._pnlCalendar(sec),
      lights: () => this._pnlLights(sec),
      nowplaying: () => this._pnlNowplaying(sec),
      weather: () => this._pnlWeather(sec),
      /* A section parked on the stage that has no stage renderer falls back to
         its dock treatment rather than vanishing — moving a section between
         tiers is a `zone:` edit and must never be a blank column. */
      systems: () => this._pnlSystems(sec),
      people: () => `<div class="pd-pbody pd-full">${this._stripSection(sec)}</div>`,
      quick: () => `<div class="pd-pbody pd-full">${this._dockSection(sec)}</div>`,
      rooms: () => `<div class="pd-pbody pd-full">${this._dockSection(sec)}</div>`,
    }[sec.type];
    return fn ? fn() : "";
  },

  /* The header is a button whenever the panel has anything more to show.
   *
   * `expandable: false` renders the same header — same size, same weight, same
   * chip — minus the chevron and the click. It is NOT a smaller, quieter
   * treatment: on the phone that mistake turned five of seven section titles
   * into captions, and a title that shrinks because it happens to have no
   * detail behind it is a hierarchy that means nothing. */
  _head(sec, chip) {
    /* Inside a sheet the chrome has already named itself beside the close
       button, and there is nothing to expand into — a second title printed
       the name twice on the phone and would here too. */
    if (this._inSheet) return "";
    const open = this._open === sec.key;
    const can = sec.expandable !== false;
    const inner = `<span class="pd-nm">${psEsc(sec.title || this._humanize(sec.type))}</span>
        ${chip || ""}
        ${can ? `<span class="pd-cv"><svg viewBox="0 0 24 24" class="pd-ico"><path d="M9 5l7 7-7 7"/></svg></span>` : ""}`;
    return can
      ? `<button class="pd-ph" type="button" data-exp="${psEsc(sec.key)}"
           aria-expanded="${open ? "true" : "false"}">${inner}</button>`
      : `<div class="pd-ph static">${inner}</div>`;
  },

  _chip(text, cls) {
    return `<span class="pd-chip ${cls || ""}">${cls ? `<span class="pd-dot"></span>` : ""}${psEsc(text)}</span>`;
  },

  _mstat(value, key, small) {
    return `<div class="pd-mstat">
        <span class="pd-mv">${value}${small ? `<small>${psEsc(small)}</small>` : ""}</span>
        <span class="pd-mk">${psEsc(key)}</span>
      </div>`;
  },

  /* ------------------------------------------------------------- climate --*/

  _pnlClimate(sec) {
    const h = this._hass;
    const goalSt = sec.goal && h.states[sec.goal];
    const thermo = sec.thermostat && h.states[sec.thermostat];
    const src = goalSt || thermo;
    const action = (thermo && thermo.attributes.hvac_action) || (src && src.state) || "";
    const cool = /cool/i.test(action);
    const heat = /heat/i.test(action);
    const col = cool ? "var(--ps-cool)" : heat ? "var(--ps-heat)" : "var(--ps-good)";

    const cur = pcNumOf(thermo, "current_temperature");
    const real = pcNumOf(src, "temperature");
    const goalId = sec.goal || sec.thermostat;
    const goal = this._optGoal(goalId, real);

    const lo = (sec.ring || {}).min == null ? 60 : sec.ring.min;
    const hi = (sec.ring || {}).max == null ? 80 : sec.ring.max;
    const frac = (v) => (v == null ? null : Math.max(0, Math.min(1, (v - lo) / (hi - lo))));

    /* A missing current temperature draws an EMPTY ring, not a ring at zero —
       a thermostat that has dropped off and a house at 60° must not look the
       same. */
    const segs = cur == null ? [] : [[frac(cur), col]];
    const ring = this._ringSvg(112, 9, segs, frac(goal), "var(--ps-warn)");

    const mini = `<div class="pd-mini">
        ${this._mstat(cur == null ? "—" : cur.toFixed(1), "inside", "°")}
        ${this._mstat(goal == null ? "—" : Math.round(goal), "goal", "°")}
        ${this._chip(cool ? "Cooling" : heat ? "Heating" : "Idle", cool ? "cool" : heat ? "heat" : "")}
      </div>`;

    const chip = this._chip(cool ? "Cooling" : heat ? "Heating" : "Idle", cool ? "cool" : heat ? "heat" : "");

    return `${this._head(sec, chip)}
      ${mini}
      <div class="pd-pbody pd-full">
        <div class="pd-cwrap">
          <div class="pd-ring" style="width:112px;height:112px">
            ${ring}
            <div class="pd-rv">
              <b>${cur == null ? "—" : cur.toFixed(1) + "°"}</b>
              <small>${cur == null ? "no reading" : "now"}</small>
            </div>
          </div>
          <div class="pd-grow">
            <div class="pd-steprow">
              <button class="pd-step" type="button" data-goal="-1" aria-label="Lower the goal"
                ${goal == null ? "disabled" : ""}>
                <svg viewBox="0 0 24 24" class="pd-ico"><path d="M5 12h14"/></svg></button>
              <div class="pd-goal"><b>${goal == null ? "—" : Math.round(goal) + "°"}</b><span>goal</span></div>
              <button class="pd-step" type="button" data-goal="1" aria-label="Raise the goal"
                ${goal == null ? "disabled" : ""}>
                <svg viewBox="0 0 24 24" class="pd-ico"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
            <div class="pd-cnote">${psEsc(this._climateNote(sec, action))}</div>
          </div>
        </div>
        ${this._wave(sec)}
        <div class="pd-xtra">
          ${this._climateRooms(sec)}
          ${this._climateChips(sec)}
        </div>
      </div>`;
  },

  /* What window the schedule is holding.
   *
   * GTTC's `current_schedule_entry` is `{time_start, time_end, target_temp,
   * cooling_temp, effective_temp}` — NOT the `{start, heat_temp, cool_temp}`
   * shape a reasonable person would guess, and which this first read from.
   * Guessing produced no error and no gap: `win.start` was undefined, the
   * branch fell through, and the panel quietly printed "HVAC is cooling"
   * forever instead of the window. Both shapes are accepted so a different
   * thermostat integration is not a silent blank. */
  _climateNote(sec, action) {
    const h = this._hass;
    const st = sec.goal && h.states[sec.goal];
    const win = st && st.attributes.current_schedule_entry;
    const start = win && (win.time_start || win.start);
    if (start) {
      const end = win.time_end || win.end;
      const clock = (hhmm) => (/^\d{1,2}:\d{2}$/.test(String(hhmm))
        ? psMinsToClock(psMins(hhmm)) : String(hhmm));
      const heat = win.target_temp != null ? win.target_temp : win.heat_temp;
      const cool = win.cooling_temp != null ? win.cooling_temp : win.cool_temp;
      const range = end ? `${clock(start)}–${clock(end)}` : clock(start);
      const pair = heat != null && cool != null
        ? ` ${Math.round(heat)}° heat / ${Math.round(cool)}° cool.` : "";
      return `Holding the ${range} window.${pair}`;
    }
    return action ? `HVAC is ${this._humanize(action).toLowerCase()}.` : "";
  },

  /* Every room, its 24h shape and its number. The sparkline rides the same
     26h fetch the graph makes rather than asking for its own. */
  _climateRooms(sec) {
    const h = this._hass;
    const rows = (sec.rooms || []).map((r) => {
      const t = pcReading(h, r.temp);
      const hu = pcReading(h, r.humidity);
      return `<div class="pd-rml" data-info="${psEsc(r.temp || "")}" role="button" tabindex="0">
          <span class="pd-rmn">${psEsc(r.name)}</span>
          ${sec.room_spark === false ? "" : `<span class="pd-spark">${this._sparkSvg(r.temp)}</span>`}
          <span class="pd-rmv">${t.ok && t.n != null ? t.n.toFixed(1) + "°" : "—"}</span>
          <span class="pd-rmh">${hu.ok && hu.n != null ? hu.n.toFixed(0) + "%" : "—"}</span>
        </div>`;
    }).join("");
    return rows ? `<div class="pd-rmlist">${rows}</div>` : "";
  },

  _climateChips(sec) {
    const h = this._hass;
    const out = (sec.chips || []).map((c) => {
      if (c.visible && c.visible.entity) {
        if (pcState(h, c.visible.entity) !== c.visible.state) return "";
      }
      /* `source: schedule_preset` asks which of GTTC's four schedules owns the
         live window. select.gttc_schedule_mode describes the BASE lists only
         and is not a reliable guide, so it is never put on a dashboard. */
      const val = c.source === "schedule_preset"
        ? this._preset(sec)
        : (c.show_state && c.entity ? this._humanize(pcState(h, c.entity)) : "");
      /* A chip that asked for a value and did not get one is dropped whole —
         printing just its label is a question with no answer. */
      if ((c.source || c.show_state) && !val) return "";
      const label = [c.name, val].filter(Boolean).join(" ");
      if (!label) return "";
      return this._chip(label, c.style || "");
    }).filter(Boolean).join("");
    const hold = this._holdRow(sec);
    return (out || hold) ? `<div class="pd-chiprow">${out}</div>${hold}` : "";
  },

  /* Which schedule is actually running. `active_preset` is null whenever GTTC
     picks one situationally, so there is no flag to follow — the live window
     has to be matched against each preset's plan. The schedule fetch is the
     phone's job; here the chip reports the thermostat's own answer or says it
     does not know, rather than printing the base list's name as if it were it. */
  /* GTTC keeps four schedules at once and `active_preset` is null whenever it
     picks one situationally, so there is often no flag to follow — telling
     which owns the live window means matching it against each preset's plan
     over the websocket, which this panel does not do.
     Returning null DROPS the chip. The rejected alternative was a placeholder
     word, which is what the first pass shipped: the chip read "Running:
     schedule", which is not an answer, and `select.gttc_schedule_mode` is
     worse than nothing because it describes the base lists only. */
  _preset(sec) {
    const st = sec.goal && this._hass.states[sec.goal];
    const p = st && (st.attributes.active_preset || st.attributes.preset_mode);
    return p ? this._humanize(p) : null;
  },

  _holdRow(sec) {
    const rem = (sec.hold || {}).remaining;
    if (!rem) return "";
    const r = pcReading(this._hass, rem);
    if (!r.ok || !r.st || !r.st.state || r.st.state === "0") return "";
    const armed = this._armed === "hold";
    return `<div class="pd-hold">
        <span>Hold · ${psEsc(r.st.state)} left</span>
        <button class="pd-mini-btn ${armed ? "arm" : ""}" type="button" data-hold="1">${
          armed ? "Tap again to cancel" : "Cancel hold"}</button>
      </div>`;
  },

  /* ---------------------------------------------------------------- wave --
   *
   * Inside and outside on ONE shared vertical scale — two independently scaled
   * lines in the same box would put a 70° room and a 95° afternoon on top of
   * each other and read as agreement.
   *
   * Deliberately not the phone's `_waveSvg`. That one is 320px wide with no
   * axis at all, because a phone has nowhere to put one; this draws six-hourly
   * gridlines and names them, which is most of what the picture is for at this
   * size. Same data, different picture — the hypnogram/temperature precedent.
   */
  _wave(sec) {
    const g = sec.graph || {};
    const W = 400, H = 96;
    const err = this._histErr;
    const pick = (id) => {
      const raw = this._history[id];
      if (!raw) return [];
      return raw.map((p) => ({ t: p.t, v: parseFloat(p.s) })).filter((p) => Number.isFinite(p.v));
    };
    const ins = pcDownsample(pick(g.inside), 120);
    const out = pcDownsample(pick(g.outside), 120);

    if ((!ins.length && !out.length)) {
      /* "The recorder did not answer" and "there is nothing here yet" are
         different facts and the graph says which. Neither is a flat line. */
      return `<div class="pd-graph"><div class="pd-nohist">${
        err ? "Recorder did not answer" : "No history yet"}</div></div>`;
    }

    const all = ins.concat(out);
    let vmin = Infinity, vmax = -Infinity, t0 = Infinity, t1 = -Infinity;
    all.forEach((p) => {
      vmin = Math.min(vmin, p.v); vmax = Math.max(vmax, p.v);
      t0 = Math.min(t0, p.t); t1 = Math.max(t1, p.t);
    });
    if (vmax - vmin < 4) { const grow = (4 - (vmax - vmin)) / 2; vmax += grow; vmin -= grow; }
    const span = t1 - t0 || 1;
    const x = (t) => ((t - t0) / span) * W;
    const y = (v) => 6 + (1 - (v - vmin) / (vmax - vmin)) * (H - 12);
    const poly = (pts) => pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

    /* Gridlines on real hours, labelled where they actually fall. Three
       captions spread evenly across an axis that is not evenly divided point
       at the wrong times — the nursery rail learned that the hard way. */
    const marks = [];
    const step = 6 * 3600 * 1000;
    const first = Math.ceil(t0 / step) * step;
    for (let t = first; t <= t1; t += step) {
      marks.push(`<line x1="${x(t).toFixed(1)}" y1="0" x2="${x(t).toFixed(1)}" y2="${H}"
        stroke="var(--ps-hair)" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
    }
    const labels = [];
    for (let t = first; t <= t1; t += step) {
      labels.push(`<span style="left:${((x(t) / W) * 100).toFixed(2)}%">${psEsc(
        new Date(t).toLocaleTimeString([], { hour: "numeric" }))}</span>`);
    }

    const lastIn = ins.length ? ins[ins.length - 1].v : null;
    const lastOut = out.length ? out[out.length - 1].v : null;

    /* What the scrub reads back — stashed after the patch, from the same
       series that was drawn rather than re-derived. */
    this._waveSeries = (ins.length ? ins : out).map((p, i) => {
      const o = out.length ? out[Math.min(out.length - 1, Math.round(i * (out.length / (ins.length || 1))))] : null;
      return {
        t: p.t,
        label: `${pdClock(p.t)} · ${ins.length ? p.v.toFixed(1) + "° in" : ""}${
          ins.length && o ? " · " : ""}${o ? o.v.toFixed(1) + "° out" : ""}`,
      };
    });

    return `<div class="pd-graph" id="pd-wave" data-scrub="wave">
        <div class="pd-cross"></div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="pd-wavesvg"
             aria-label="Inside and outside temperature">
          ${marks.join("")}
          ${out.length ? `<polyline fill="none" stroke="var(--ps-heat)" stroke-width="1.8"
            stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"
            points="${poly(out)}"/>` : ""}
          ${ins.length ? `<polyline fill="none" stroke="var(--ps-cool)" stroke-width="2"
            stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"
            points="${poly(ins)}"/>` : ""}
        </svg>
        <div class="pd-axis">${labels.join("")}</div>
        <div class="pd-glg">
          <span><i style="background:var(--ps-cool)"></i>Inside<b>${lastIn == null ? "—" : lastIn.toFixed(1) + "°"}</b></span>
          <span><i style="background:var(--ps-heat)"></i>Outside<b>${lastOut == null ? "—" : lastOut.toFixed(1) + "°"}</b></span>
          <span class="pd-readout" data-readout="1"></span>
        </div>
      </div>`;
  },

  /* ------------------------------------------------------------- nursery --*/

  _pnlNursery(sec) {
    const loaded = this._nursery != null;
    const err = this._nurseryErr;
    const sessions = loaded ? this._nurserySessions(sec) : [];
    const stats = psNurseryStats(sessions, { now: this._nowMs(), days: sec.days || 7 });
    const now = this._nowMs();
    const todayKey = psDayKey(new Date(now));

    const live = sessions.find((s) => s.active);
    const nights = sessions.filter((s) => s.night);
    const night = nights.length ? nights[nights.length - 1] : null;
    const naps = sessions.filter((s) => !s.night && s.day === todayKey);

    /* The ring scales to HIS OWN average, never a fixed goal: the reading is
       "above or below normal", which keeps meaning as he grows. The configured
       max is only the fallback until an average exists. */
    const avg = stats.avgNightMin;
    const maxMin = avg ? avg * 1.25 : (sec.ring || {}).max_hours ? sec.ring.max_hours * 60 : 12 * 60;
    const nightMin = night ? night.asleepMinutes : null;
    const frac = nightMin == null ? 0 : Math.max(0, Math.min(1, nightMin / maxMin));
    const goalFrac = avg ? Math.max(0, Math.min(1, avg / maxMin)) : null;

    /* A night that has not happened and a night of no sleep are different
       facts. The ring reads "—" and says which. */
    const ringLabel = night ? psDur(nightMin) : "—";
    const ringSub = night
      ? (night.active ? "tonight" : "last night")
      : (loaded ? "no night yet" : err ? "unavailable" : "loading");

    const napRings = naps.map((n, i) => {
      const short = n.asleepMinutes < (sec.catnap_under_min || 30);
      const f = Math.max(0.04, Math.min(1, n.asleepMinutes / (sec.nap_full_min || 120)));
      return `<div class="pd-nap">
          <div class="pd-ring sm" style="width:54px;height:54px">
            ${this._ringSvg(54, 5, [[f, short ? "var(--ps-warn)" : "var(--ps-light)"]], null)}
            <div class="pd-rv sm"><b>${psEsc(psHM(n.asleepMinutes))}</b></div>
            ${n.edited ? `<span class="ps-edd ring" title="Corrected"></span>` : ""}
          </div>
          <span class="pd-napt">${psEsc(pdClock(n.from))}</span>
        </div>`;
    }).join("");

    const chip = live
      ? this._chip(live.settledAt && live.settledAt <= now ? "Asleep" : "Settling", "deep")
      : stats.wakeWindowMin != null
        ? this._chip(`Up ${psHM(stats.wakeWindowMin)}`, "")
        : this._chip(loaded ? "Idle" : "…", "");

    const mini = `<div class="pd-mini">
        ${this._mstat(nightMin == null ? "—" : (nightMin / 60).toFixed(1), "night", nightMin == null ? "" : "h")}
        ${this._mstat(String(naps.length), naps.length === 1 ? "nap today" : "naps today")}
        ${chip}
      </div>`;

    return `${this._head(sec, chip)}
      ${mini}
      <div class="pd-pbody pd-full">
        <div class="pd-jwrap">
          <div class="pd-ring" style="width:112px;height:112px">
            ${this._ringSvg(112, 9, night ? [[frac, "var(--ps-light)"]] : [], goalFrac, "var(--ps-warn)")}
            <div class="pd-rv"><b>${psEsc(ringLabel)}</b><small>${psEsc(ringSub)}</small></div>
          </div>
          <div class="pd-grow">
            <div class="pd-naps">${napRings || `<span class="pd-dimtext">No naps yet today</span>`}</div>
            <div class="pd-jstatus">${this._nurseryStatus(sec, live, stats, night, now)}</div>
          </div>
        </div>
        ${this._nightRail(sec, night, loaded, err)}
        <div class="pd-xtra">
          ${this._nurseryRows(sec, night, stats, naps)}
        </div>
      </div>`;
  },

  /* One line of live status. When he is up it carries how long and since when
     — the number that decides whether the next nap is due. The door is
     deliberately not a state here: it opens several times a day for reasons
     nobody is tracking, and while it was a state it displaced the one thing
     worth reading. */
  _nurseryStatus(sec, live, stats, night, now) {
    if (!this._nursery) {
      return this._nurseryErr
        ? `Recorder did not answer — <button class="pd-mini-btn" type="button" data-retry="nursery">retry</button>`
        : "Loading his week…";
    }
    if (live) {
      const settled = live.settledAt && live.settledAt <= now;
      if (!settled) return `Down ${pdClock(live.from)} · settling ${psHM(Math.round((now - live.from) / 60000))}`;
      return `Down ${pdClock(live.from)} · settled ${pdClock(live.settledAt)} · asleep ${
        psHM(Math.round((now - live.settledAt) / 60000))}`;
    }
    if (stats.wakeWindowMin == null) return "Nothing recorded yet.";
    /* The CHIP carries how long he has been up; this line must not say it
       again. Printing "Up 2h 0m" beside "Awake 2h 0m · since 11:47 AM" spends
       the one free line on a number that is already on screen — when he is up,
       what is not on screen is when he last went down and when he next will. */
    const bed = stats.bedMean != null ? ` · usually down ${psMinsToClock(stats.bedMean)}` : "";
    return `Since ${pdClock(stats.wakeSince)}${bed}`;
  },

  /* The night as a plot with an axis, inside a box — a bare line on the card
     ground does not read as one. Two segments (settling, asleep) with a tick
     wherever someone went in, and hourly gridlines. */
  _nightRail(sec, night, loaded, err) {
    if (!loaded) {
      return `<div class="pd-railbox"><div class="pd-nohist">${
        err ? "Recorder did not answer" : "Loading…"}</div></div>`;
    }
    if (!night) {
      return `<div class="pd-railbox"><div class="pd-nohist">No night recorded yet</div></div>`;
    }
    const from = night.from;
    /* A finished night ends where the Hatch stopped. Running it to now
       regardless would leave the sleep as a narrow band on the left with hours
       of blank to the right, and the end label reading the current time. */
    const to = night.active ? this._nowMs() : night.to;
    const span = to - from || 1;
    const pct = (t) => (((t - from) / span) * 100).toFixed(2);
    const settled = Math.min(Math.max(night.settledAt, from), to);

    const ticks = (night.events || []).map((t) =>
      `<i class="pd-tick" style="left:${pct(t)}%"></i>`).join("");

    const marks = [];
    const step = 3600 * 1000;
    for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
      marks.push(`<i class="pd-grid" style="left:${pct(t)}%"></i>`);
    }

    this._nightSeries = [];
    const N = 120;
    for (let i = 0; i < N; i++) {
      const t = from + (span * i) / (N - 1);
      const state = t < settled ? "settling" : "asleep";
      this._nightSeries.push({ t, label: `${pdClock(t)} · ${state}` });
    }

    return `<div class="pd-railbox">
        <div class="pd-railhead">
          <span>${psEsc(night.active ? "Tonight" : "Last night")}</span>
          <span class="pd-readout" data-readout="1"></span>
        </div>
        <div class="pd-rail" id="pd-nightrail" data-scrub="night">
          <div class="pd-cross"></div>
          ${marks.join("")}
          <i class="pd-seg settle" style="left:0;width:${pct(settled)}%"></i>
          <i class="pd-seg sleep" style="left:${pct(settled)}%;width:${(100 - pct(settled)).toFixed(2)}%"></i>
          ${ticks}
        </div>
        <div class="pd-railfoot">
          <span>${psEsc(pdClock(from))}</span>
          <span>${psEsc(pdClock(to))}</span>
        </div>
      </div>`;
  },

  _nurseryRows(sec, night, stats, naps) {
    /* `ed` marks a session a person corrected. The desk reads the same store
       the phone writes, so without this it would print a corrected figure as
       though the sensors had produced it — the phone marks it, and one surface
       marking it is worse than neither. */
    const row = (l, v, c, ed) => `<div class="pd-jr"><span class="pd-l">${
        ed ? `<span class="ps-edd" title="Corrected"></span>` : ""}${psEsc(l)}</span>
        <span class="pd-v">${psEsc(v)}</span><span class="pd-c">${psEsc(c || "")}</span></div>`;
    const napRows = naps.map((n) => row(
      pdClock(n.from) + " – " + pdClock(n.to),
      psHM(n.asleepMinutes),
      n.interventions ? `${n.interventions} in` : "",
      n.edited
    )).join("");

    const nightRows = night ? [
      row("Asleep", psDur(night.asleepMinutes),
        stats.avgNightMin ? `7d ${psDur(stats.avgNightMin)}` : "no average yet", night.edited),
      row("Down / up", `${pdClock(night.from)} – ${pdClock(night.to)}`, ""),
      row("Settled", pdClock(night.settledAt), `+${psHM(night.settleMinutes)} settling`),
      row("Interventions", String(night.interventions),
        (night.events || []).map((t) => pdClock(t)).join(" · ")),
      row("Longest stretch", psDur(night.longestStretch),
        stats.avgStretch ? `7d ${psDur(stats.avgStretch)}` : ""),
    ].join("") : "";

    const spread = stats.bedSpread != null
      ? row("Bedtime", psMinsToClock(stats.bedMean), `± ${stats.bedSpread}m over ${stats.nights} nights`)
      : "";

    return `${naps.length ? `<div class="pd-sub2">Naps today · ${naps.length}</div>${napRows}` : ""}
      ${night ? `<div class="pd-sub2">${night.active ? "Tonight" : "Last night"}</div>${nightRows}` : ""}
      ${spread}`;
  },

  /* -------------------------------------------------------------- weather --*/

  /* Measured in the balanced face; the forecast when the panel is expanded.
   *
   * This was built showing BOTH rails at once, on the reasoning that width is
   * what a stage panel buys. A screenshot at 1440 killed it: a stage column
   * among five panels is about 290px wide, so the two rails stacked, the
   * forecast's day labels were clipped off the bottom of the panel, and the
   * caption truncated mid-word. Width is what EXPANDING buys — the balanced
   * face has no more room than the phone does.
   *
   * So the measured week is the `full` face, because it is the thing nothing
   * else on this screen says (the strip already carries current conditions), and
   * the forecast rides `xtra` with the hourly strip beside it, where there is
   * genuinely room for both. No tabs: on the desk the second rail is a chevron
   * away rather than a toggle away.
   *
   * Everything numeric comes off borrowed methods — the statistics fetch, the
   * provider-shape detection, the domain floor, today's live widening and the
   * capsule's three states. Only the markup is the desk's. */
  _pnlWeather(sec) {
    const h = this._hass;
    const live = this._wxLive(sec);
    const reading = pcReading(h, sec.sensor);
    const st = psWeatherStats(this._wxStats || []);
    const fcSt = sec.forecast && h.states[sec.forecast];
    const app = sec.feels_from ? pcNumOf(h.states[sec.feels_from], "apparent_temperature") : null;
    const feels = live != null && app != null && Math.abs(app - live) >= 2;

    const chip = feels
      ? this._chip(`Feels ${this._wxDeg(app)}`, app > live ? "heat" : "cool")
      : (fcSt ? this._chip(pcWxText(fcSt.state), "") : "");

    /* Folded, not hidden: opening Climate turns the weather into a number that
       can still be read. The rails are what goes — a capsule column at a
       hundred pixels wide is unreadable, and pretending otherwise is worse than
       dropping it. */
    const mini = `<div class="pd-mini">
        ${fcSt ? `<ha-icon class="pd-wxmi" icon="${psEsc(pcWxIcon(fcSt.state))}"></ha-icon>` : ""}
        ${this._mstat(live == null ? "—" : live.toFixed(1), "outside", "°")}
        ${st.max == null ? "" : this._mstat(Math.round(st.max), `max ${st.days}d`, "°")}
        ${chip}
      </div>`;

    const hero = `<div class="pd-wxhero">
        <div>
          <div class="pd-wxbig${reading.ok ? "" : " off"}">${
            reading.ok && live != null ? `${live.toFixed(1)}<sup>°</sup>` : "—"}</div>
          ${this._wxDeltaHtml(sec, live)}
          <div class="pd-wxsrc">${psEsc(reading.ok ? this._wxSrcName(sec)
            : (reading.why === "missing" ? "Sensor not found" : "Sensor unavailable"))}</div>
        </div>
        <div class="pd-wxtiles">
          ${this._mstat(st.min == null ? "—" : st.min.toFixed(1), `min ${st.days}d`, "°")}
          ${this._mstat(st.mean == null ? "—" : st.mean.toFixed(1), `avg ${st.days}d`, "°")}
          ${this._mstat(st.max == null ? "—" : st.max.toFixed(1), `max ${st.days}d`, "°")}
        </div>
      </div>`;

    const note = this._wxNoteText(sec);
    /* The window comes off the CLOSED days, never off the column count.
       Statistics answers with `days` complete buckets plus the one in progress,
       so reading the array's length printed "last 8 days" for `days: 7` — and at
       this panel width it truncated to "last 8 day" as well. */
    const closed = st.days || sec.days || 7;

    return `${this._head(sec, chip)}
      ${mini}
      <div class="pd-pbody pd-full">
        ${hero}
        <div class="pd-wxcol">
          <div class="pd-wxrh"><span class="pd-wxlb">Measured</span>
            <span class="pd-wxrb">${closed} days</span></div>
          ${this._deskWxRail(sec, "hist", live)}
        </div>
        ${note ? `<div class="pd-wxnote">${psEsc(note)}</div>` : ""}
        <div class="pd-xtra">
          <div class="pd-wxrails">
            <div class="pd-wxcol">
              <div class="pd-wxrh"><span class="pd-wxlb">Forecast</span>
                <span class="pd-wxrb">${psEsc(this._wxAttrib(fcSt && fcSt.attributes.attribution) || "high–low")}</span></div>
              ${this._deskWxRail(sec, "fc", live)}
            </div>
            <div class="pd-wxcol">
              ${this._deskWxHourly(sec)}
              ${this._deskWxRows(sec)}
            </div>
          </div>
        </div>
      </div>`;
  },

  _wxDeltaHtml(sec, live) {
    const today = (this._wxStats || []).find((d) => d.partial);
    const from = today && today.min != null && live != null ? live - today.min : null;
    if (from == null) return "";
    return `<div class="pd-wxdelta${from < 0 ? " cool" : ""}">${from >= 0 ? "↑" : "↓"} ${
      Math.abs(from).toFixed(1)}° from today's low</div>`;
  },

  _deskWxRail(sec, which, live) {
    const err = which === "fc" ? this._wxFcErr : this._wxStatsErr;
    if (err) return `<div class="pd-wxbox">${psEsc(err)}</div>`;
    const raw = which === "fc" ? this._wxFc : this._wxStats;
    /* null is still loading; [] is an answer with nothing in it. */
    if (raw == null) return `<div class="pd-wxbox">Reading…</div>`;
    /* `_wxHistRows` is borrowed rather than reimplemented: it is what stops the
       live tick floating above the top of today's own capsule. */
    const rows = which === "fc" ? raw.slice(0, sec.forecast_days || 7) : this._wxHistRows(live);
    if (!rows.length) {
      return `<div class="pd-wxbox">${which === "fc"
        ? `No ${psEsc(this._wxKind(sec).replace("_", " "))} forecast published.`
        : "No statistics for this sensor yet."}</div>`;
    }
    const dom = this._wxDomain(rows, which);
    if (!dom) return `<div class="pd-wxbox">No temperatures in this range.</div>`;

    const cells = rows.map((d) => {
      const isNow = which === "fc" ? d.today : d.partial;
      const hi = which === "fc" ? d.hi : d.max;
      const lo = which === "fc" ? d.lo : d.min;
      const pop = which === "fc" && d.pop != null ? `${Math.round(d.pop)}%` : "";
      return `<div class="pd-wxday${isNow ? " now" : ""}">
          ${which === "fc"
            ? `<ha-icon class="pd-wxi" icon="${psEsc(pcWxIcon(d.condition))}"></ha-icon>` : ""}
          <span class="pd-wxhi">${this._wxDeg(hi)}</span>
          ${this._wxCapsule(lo, hi, dom, isNow && live != null ? live : null, "pd-wx")}
          <span class="pd-wxlo">${this._wxDeg(lo)}</span>
          ${which === "fc" ? `<span class="pd-wxpcp${pop ? "" : " none"}">${pop || "0%"}</span>` : ""}
          <span class="pd-wxdw">${psEsc(this._wxDow(d.ts, isNow))}</span>
        </div>`;
    }).join("");
    return `<div class="pd-wxbox plot"><div class="pd-wxrail"
      style="--n:${rows.length}">${cells}</div></div>`;
  },

  /* Same columns as the phone, from the borrowed derivation, so the two views
     cannot draw the same hour at two different heights. It scrolls here too: a
     stage panel is not wide enough for a day of hours either, and a desk has a
     trackpad. */
  _deskWxHourly(sec) {
    const hrs = this._wxHrs;
    if (!hrs || hrs.length < 2) return "";
    const cols = this._wxHourCols(hrs);
    const wet = cols.some((c) => c.pop != null && c.pop >= 20);
    const body = cols.map((c) => `<div class="pd-wxhr${c.now ? " now" : ""}${c.newDay ? " nd" : ""}">
        <span class="pd-wxht">${this._wxDeg(c.t)}</span>
        <div class="pd-wxhbar"><i style="height:${c.h.toFixed(1)}%"></i></div>
        ${wet ? `<span class="pd-wxhp">${c.pop != null && c.pop >= 20 ? `${Math.round(c.pop)}%` : ""}</span>` : ""}
        <span class="pd-wxhl">${psEsc(c.label)}</span>
      </div>`).join("");
    const temps = cols.map((c) => c.t);
    return `<div>
        <div class="pd-wxrh"><span class="pd-wxlb">Next ${cols.length} hours</span>
          <span class="pd-wxrb">${this._wxDeg(Math.min(...temps))} – ${this._wxDeg(Math.max(...temps))}</span></div>
        <div class="pd-wxhrs">${body}</div>
      </div>`;
  },

  /* A row whose value is missing is dropped, not dashed — NWS publishes no
     apparent temperature and no UV index at all, so a fixed list would be half
     dashes on the most accurate provider available. */
  _deskWxRows(sec) {
    const h = this._hass;
    const fc = sec.forecast && h.states[sec.forecast];
    const feels = sec.feels_from && h.states[sec.feels_from];
    const pick = (k) => {
      const v = feels ? pcNumOf(feels, k) : null;
      return v == null ? (fc ? pcNumOf(fc, k) : null) : v;
    };
    const out = [];
    const hum = pick("humidity");
    const dew = pick("dew_point");
    if (hum != null) out.push(["Humidity", `${Math.round(hum)}%`]);
    if (dew != null) out.push(["Dew point", this._wxDeg(dew)]);
    const ws = pick("wind_speed");
    if (ws != null) {
      const unit = (((feels || fc || {}).attributes) || {}).wind_speed_unit || "";
      out.push(["Wind", `${Math.round(ws)}${unit ? ` ${unit}` : ""}`]);
    }
    const uv = pick("uv_index");
    if (uv != null) out.push(["UV", uv.toFixed(1)]);
    const g = sec.gttc_outdoor && h.states[sec.gttc_outdoor];
    const diff = g ? pcNumOf(g, "outdoor_minus_indoor") : null;
    if (diff != null) out.push(["vs inside", `${diff > 0 ? "+" : ""}${diff.toFixed(1)}°`]);
    if (!out.length) return "";
    return `<div class="pd-wxfacts">${out.map(([k, v]) =>
      this._mstat(v, k)).join("")}</div>`;
  },

  /* ---------------------------------------------------------------- music --*/

  _pnlMusic(sec) {
    const h = this._hass;
    const target = this._activePlayer();
    const st = target && h.states[target];
    const playing = st && st.state === "playing";
    /* An idle MA player KEEPS its media_title and its artwork — the living
       room reports "Bluey Theme Tune" hours after it stopped. psLiveMusic is
       the shared rule; this used to be written out here, which is how the
       shell's copies stayed broken after this one was fixed. */
    const live = !!psLiveMusic(st);
    const title = live ? st.attributes.media_title : null;
    const art = live ? st.attributes.entity_picture_local : null;
    const artist = live ? (st.attributes.media_artist || st.attributes.media_album_name) : null;

    const rooms = (sec.players || []).map((p) => {
      const ps = h.states[p.entity];
      const live = ps && psIsMusic(ps) && ps.state === "playing";
      return `<button class="pd-mr ${this._isPicked(p.entity) ? "sel" : ""} ${live ? "live" : ""}"
          type="button" data-pick="${psEsc(p.entity)}">${psEsc(p.name)}</button>`;
    }).join("");

    const presets = (sec.presets || []).map((p) => `
      <button class="pd-pr" type="button" data-uri="${psEsc(p.uri)}" data-kind="playlist">
        <ha-icon icon="${psEsc(p.icon || "mdi:playlist-music")}"></ha-icon>
        <span class="pd-trunc">${psEsc(p.name)}</span>
      </button>`).join("");

    const idle = (sec.players || []).filter((p) => {
      const ps = h.states[p.entity];
      return !(ps && psIsMusic(ps) && ps.state === "playing");
    }).length;

    const chip = title
      ? this._chip(playing ? "Playing" : "Paused", playing ? "cool" : "")
      : this._chip(`${idle} idle`, "");

    const mini = `<div class="pd-mini">
        ${title
          ? `${this._mstat(psEsc(title), psEsc(artist || "playing"))}`
          : this._mstat("—", "nothing playing")}
        ${chip}
      </div>`;

    return `${this._head(sec, chip)}
      ${mini}
      <div class="pd-pbody pd-full">
        <div class="pd-now">
          <div class="pd-art">${art
            /* entity_picture_local, never entity_picture: MA publishes an
               absolute plain-HTTP URL to its own port, which an HTTPS
               dashboard blocks as mixed content and which is unreachable off
               the LAN. The image simply never loads and nothing says why. */
            ? `<img src="${psEsc(art)}" alt="" />`
            : `<svg viewBox="0 0 24 24" class="pd-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
          <div class="pd-grow">
            <div class="pd-nt pd-trunc">${psEsc(title || "Nothing playing")}</div>
            <div class="pd-ns pd-trunc">${psEsc(artist || this._roomName(sec, target))}</div>
          </div>
          <div class="pd-tbs">
            <button class="pd-tb" type="button" data-mp="prev" ${target ? "" : "disabled"} aria-label="Previous">
              <svg viewBox="0 0 24 24" class="pd-ico"><path d="M18 5v14L8 12zM6 5v14"/></svg></button>
            <button class="pd-tb pp" type="button" data-mp="playpause" ${target ? "" : "disabled"} aria-label="Play or pause">
              <svg viewBox="0 0 24 24" class="pd-ico">${playing
                ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
            <button class="pd-tb" type="button" data-mp="next" ${target ? "" : "disabled"} aria-label="Next">
              <svg viewBox="0 0 24 24" class="pd-ico"><path d="M6 5v14l10-7zM18 5v14"/></svg></button>
          </div>
        </div>
        <div class="pd-lbl">Rooms</div>
        <div class="pd-mroom">${rooms}</div>
        <div class="pd-lbl">Presets</div>
        <div class="pd-pres">${presets}</div>
        <div class="pd-xtra">
          <div class="pd-lbl">Search</div>
          <input class="pd-search" id="pd-q" type="search" placeholder="Tracks, albums, playlists, radio…"
            value="${psEsc(this._query)}" />
          <div class="pd-mtypes">${["all", "track", "album", "artist", "playlist", "radio"].map((k) =>
            `<button class="pd-mt ${this._mtype === k ? "on" : ""}" type="button" data-mtype="${k}">${
              k === "all" ? "All" : this._humanize(k)}</button>`).join("")}</div>
          <div id="ps-res" class="pd-res">${this._resultsHtml()}</div>
          ${this._note ? `<div class="pd-note">${psEsc(this._note)}</div>` : ""}
        </div>
      </div>`;
  },

  /* The ROOM, as config named it. The entity's friendly name is Music
     Assistant's mirror of the source device — the living room speaker answers
     to "Living Room TV", which is both wrong and confusing next to a TV row.
     Config already says what the room is called. */
  _roomName(sec, entity) {
    if (!entity) return "";
    const p = (sec.players || []).find((x) => x.entity === entity);
    return (p && p.name) || pcName(this._hass, entity);
  },

  /* Overrides the shell's, which speaks in ps- classes. The borrowed
     _paintResults calls whichever the instance has, so search-as-you-type
     writes desk markup straight into #ps-res without a repaint — which is what
     keeps the focused field alive mid-word. The id is `ps-res` precisely so
     that borrowed painter finds it. */
  _resultsHtml() {
    if (this._searching) return `<div class="pd-dimtext">Searching…</div>`;
    if (this._results == null) return "";
    if (!this._results.length) return `<div class="pd-dimtext">Nothing found.</div>`;
    return this._results.map((r) => `
      <div class="pd-mi">
        <div class="pd-th">${r.image
          ? `<img src="${psEsc(r.image)}" alt="" />`
          : `<svg viewBox="0 0 24 24" class="pd-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
        <div class="pd-grow">
          <div class="pd-n pd-trunc">${psEsc(r.name)}</div>
          <div class="pd-s pd-trunc">${psEsc(r.sub || r.kind)}</div>
        </div>
        <button class="pd-mini-btn" type="button" data-uri="${psEsc(r.uri)}" data-kind="${psEsc(r.kind)}">Play</button>
        <button class="pd-mini-btn" type="button" data-enq="${psEsc(r.uri)}" data-kind="${psEsc(r.kind)}">Queue</button>
      </div>`).join("");
  },

  /* ------------------------------------------------------------ calendar --*/

  _pnlCalendar(sec) {
    const days = sec.days || 5;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const byDay = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const next = d.getTime() + 86400000;
      byDay.push({
        d,
        events: this._events.filter((e) => e.t >= d.getTime() && e.t < next),
      });
    }
    /* Today always. After that only days that have something, with the empty
       ones counted into one line rather than drawn as five "Nothing scheduled"
       rows — five identical negatives is not information, it is height. */
    const shown = byDay.filter((x, i) => i === 0 || x.events.length);
    const emptyCount = byDay.length - shown.length;
    const next = this._events.find((e) => e.t >= Date.now());

    const dayRow = (x) => `
      <div class="pd-cday">
        <div class="pd-cdt ${x.d.toDateString() === new Date().toDateString() ? "today" : ""}">
          <div class="pd-dw">${x.d.toLocaleDateString([], { weekday: "short" })}</div>
          <div class="pd-dn">${x.d.getDate()}</div>
        </div>
        <div class="pd-cev">${x.events.length
          ? x.events.map((e) => `<div class="pd-ev"><i style="background:${psEsc(e.color)}"></i>
              <span class="pd-trunc">${psEsc(e.name)}</span>
              <span class="pd-et">${e.allDay ? "all day" : psEsc(pdClock(e.t))}</span></div>`).join("")
          : `<div class="pd-ev none">Nothing scheduled</div>`}</div>
      </div>`;

    const chip = this._chip(
      this._events.length ? `${this._events.length} event${this._events.length > 1 ? "s" : ""}` : "clear", "");

    const mini = `<div class="pd-mini">
        ${next
          ? this._mstat(psEsc(new Date(next.t).toLocaleDateString([], { weekday: "short", day: "numeric" })), "next")
          : this._mstat("—", "nothing ahead")}
        ${next ? `<div class="pd-mstat"><span class="pd-mv sm">${psEsc(next.name)}</span>
            <span class="pd-mk">${next.allDay ? "all day" : psEsc(pdClock(next.t))}</span></div>` : ""}
      </div>`;

    return `${this._head(sec, chip)}
      ${mini}
      <div class="pd-pbody pd-full">
        ${shown.map(dayRow).join("")}
        ${emptyCount ? `<div class="pd-dimtext">${emptyCount} more day${
          emptyCount > 1 ? "s" : ""} with nothing scheduled</div>` : ""}
        <div class="pd-xtra">
          ${byDay.filter((x, i) => i > 0 && !x.events.length).map(dayRow).join("")}
          <div class="pd-chiprow">${(sec.entities || []).map((e) => typeof e === "string" ? "" :
            `<span class="pd-chip" style="color:${psEsc(e.color)}"><span class="pd-dot"></span>${
              psEsc(pcName(this._hass, e.entity).replace(/ calendar$/i, ""))}</span>`).join("")}</div>
        </div>
      </div>`;
  },

  /* --------------------------------------------------------- now playing --*/

  _pnlNowplaying(sec) {
    const h = this._hass;
    const rows = [];
    (sec.tvs || []).forEach((tv) => {
      const st = tv.media_player && h.states[tv.media_player];
      if (!st || (st.state !== "playing" && st.state !== "on")) return;
      const app = tv.app_sensor ? pcState(h, tv.app_sensor) : "";
      rows.push(`<div class="pd-npr" data-info="${psEsc(tv.media_player)}" role="button" tabindex="0">
          <div class="pd-th"><svg viewBox="0 0 24 24" class="pd-ico"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 20.5h8"/></svg></div>
          <div class="pd-grow">
            <div class="pd-n pd-trunc">${psEsc(st.attributes.media_title || app || "On")}</div>
            <div class="pd-s pd-trunc">${psEsc(tv.name)}</div>
          </div>
          ${sec.remote_sheet ? `<button class="pd-mini-btn" type="button" data-sheet="${psEsc(sec.remote_sheet)}">Remote</button>` : ""}
        </div>`);
    });
    const np = this._nowPlaying();
    if (np) {
      rows.push(`<div class="pd-npr" data-info="${psEsc(np.entity)}" role="button" tabindex="0">
          <div class="pd-th">${np.st.attributes.entity_picture_local
            ? `<img src="${psEsc(np.st.attributes.entity_picture_local)}" alt="" />`
            : `<svg viewBox="0 0 24 24" class="pd-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
          <div class="pd-grow">
            <div class="pd-n pd-trunc">${psEsc(np.st.attributes.media_title)}</div>
            <div class="pd-s pd-trunc">${psEsc(np.name)} · ${np.playing ? "playing" : "paused"}</div>
          </div>
        </div>`);
    }
    /* Nothing on means no panel at all — the renderer drops a section that
       returns "", hairline and all, rather than leaving an empty column. */
    if (!rows.length) return "";
    return `${this._head(sec, this._chip(`${rows.length} on`, "cool"))}
      <div class="pd-mini">${this._mstat(String(rows.length), rows.length === 1 ? "playing" : "playing")}</div>
      <div class="pd-pbody pd-full">${rows.join("")}</div>`;
  },

  /* ----------------------------------------------------------------- bind --*/

  _bindStage() {
    /* The setpoint moves on the TAP, not on the round trip.
     *
     * Two bugs in one, both of which the phone's stepper shipped with: waiting
     * for HA to echo the value back takes seconds with GTTC, and computing the
     * next value from the LIVE attribute means a second tap inside that window
     * reads the same unchanged temperature and recomputes the same number — so
     * tapping + three times raised the goal by one degree. The optimistic value
     * is what BOTH the display and the next tap read, and a burst of taps sends
     * one call carrying the last value. */
    this._each("[data-goal]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = this._section("climate");
        if (!sec) return;
        const id = sec.goal || sec.thermostat;
        const st = this._hass.states[id];
        const base = this._optGoal(id, pcNumOf(st, "temperature"));
        if (base == null) return;
        const next = Math.round(base + Number(el.dataset.goal));
        /* Expires after 12s so a call that never lands shows the truth again
           rather than leaving an unbacked number on screen. */
        this._goalOpt = { id, value: next, until: Date.now() + 12000 };
        this._last = null;
        this._render();
        clearTimeout(this._goalSend);
        this._goalSend = setTimeout(() => {
          this._hass.callService("climate", "set_temperature", { entity_id: id, temperature: next });
        }, 400);
      });
    });

    /* Cancelling a hold is destructive, so it arms rather than asking. The arm
       lapses after 5s — a modal for this would be heavier than the action. */
    this._each("[data-hold]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = this._section("climate");
        if (this._armed !== "hold") {
          this._armed = "hold";
          this._last = null;
          this._render();
          clearTimeout(this._armTimer);
          this._armTimer = setTimeout(() => {
            this._armed = null; this._last = null; this._render();
          }, 5000);
          return;
        }
        clearTimeout(this._armTimer);
        this._armed = null;
        const svc = (sec.hold || {}).cancel_service;
        if (svc && svc.indexOf(".") > 0) {
          const p = svc.split(".");
          this._hass.callService(p[0], p[1], {});
        }
        this._last = null;
        this._render();
      });
    });

    this._each("[data-retry]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (el.dataset.retry === "nursery") this._fetchNursery();
        else this._fetchHistory();
      });
    });

    /* transport */
    this._each("[data-mp]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const target = this._activePlayer();
        if (!target) return;
        const st = this._hass.states[target];
        const svc = { prev: "media_previous_track", next: "media_next_track" }[el.dataset.mp]
          || (st && st.state === "playing" ? "media_pause" : "media_play");
        this._hass.callService("media_player", svc, { entity_id: target });
      });
    });

    /* Picking a room is a radio, not a set. "Play to two rooms" as two
       play_media calls is two unsynchronised queues, not multi-room — real
       grouping is media_player.join. Every control in this panel acts on the
       one target, including the artwork and the title. */
    this._each("[data-pick]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._togglePick(el.dataset.pick);
        this._render();
      });
    });

    this._each("[data-uri]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._playUri(el.dataset.uri, el.dataset.kind);
      });
    });

    this._each("[data-enq]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._enqueueUri(el.dataset.enq, el.dataset.kind);
      });
    });

    this._each("[data-mtype]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._mtype = el.dataset.mtype;
        this._last = null;
        this._render();
        if ((this._query || "").trim()) this._runSearch();
      });
    });

    /* A focused field must keep _dragging set or the next state change patches
       the input away mid-word. The results are painted straight into their own
       container for the same reason — see _paintResults. */
    this._one("pd-q", (el) => {
      el.addEventListener("focus", () => { this._dragging = true; });
      el.addEventListener("blur", () => { this._dragging = false; });
      el.addEventListener("input", () => this._queueSearch(el.value));
    });
  },
});
