/* ============================================================================
 * purdy-sky-card — the Joel tab (v1.105.0)
 *
 * Four screens, from the Nov 26 mockup, plus the weeks page it kept as a
 * "fun addition":
 *
 *   Today     the day as a ribbon, his usual nap offered as a "?" when nothing
 *             was recorded, the next nap and bedtime drawn where they would
 *             fall, and the buttons for wherever he is: the Hatch at home, the
 *             phone away. Bedtime away turns this same tab into the night
 *             logger, dimmed to ember so a phone at 2 AM does not light the
 *             room.
 *   Timeline  every day the recorder still holds, one row each, naps or the
 *             whole day. It absorbed the trip fill-in (a "?" for each usual
 *             nap nobody logged, "Like usual" to accept them all) and the week
 *             comparison (each week's header carries it).
 *   Walk      the night as a list you scroll through while the night stays
 *             pinned above it, the cursor following the row under it. The
 *             sleep between trips is a row too, and lights its stretch.
 *   Weeks     one card per week, a bar a day, a dashed line at the week
 *             before's average.
 *
 * Plus the correction sheet, redrawn for Skylight with a drag track whose
 * handles stop on the door trips.
 *
 * What a hand-logged night does not know stays unknown everywhere here: its
 * wake-ups read "?", never 0, and nothing claims it slept through.
 * ========================================================================== */

const SKJ_DAY = 86400000;
/* Local midnight of a day key. */
const skjMid = (key) => { const p = String(key).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]).getTime(); };
const skjMod = (ts) => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };
/* Monday midnight of the week holding ts. */
const skjWeek = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
/* The Monday n weeks before, found through the middle of that week, so a
   23- or 25-hour day between them cannot land it on a Sunday. */
const skjPrevWk = (wk, n) => skjWeek(wk - (n || 1) * 7 * 86400000 + 43200000);
const skjClk = (mins) => { const m = ((Math.round(mins) % 1440) + 1440) % 1440; return `${(Math.floor(m / 60) % 12) || 12}:${String(m % 60).padStart(2, "0")}`; };
const skjPct = (v, a, b) => (skClamp((v - a) / (b - a)) * 100).toFixed(2);
/* Wake-ups as the card may state them. Null is "nobody counted", and a count
   from an outage or a "3+" is a floor. */
const skjWakes = (s) => (!s || s.interventions == null ? "?" : (s.blindMin || s.wakesPlus) ? `${s.interventions}+` : String(s.interventions));
const skjDelta = (d, unit) => `${d >= 0 ? "+" : "−"}${unit === "m" ? psHM(Math.abs(Math.round(d))) : Math.abs(d).toFixed(1)}`;
const SKJ_PAGES = { timeline: "Timeline", walk: "Night", weeks: "Weeks" };

Object.assign(PurdySkyCard.prototype, {

  _skJoel() {
    const N = this._skNurse();
    const name = this._skTabName("joel");
    if (!N) return this._skTitle(name) + `<div class="sk-card sk-pad"><div class="sk-empty">No nursery section is configured.</div></div>`;
    const logging = this._skJoelLogging(N);
    if (logging) return this._skJoelLogger(N, logging);
    if (this._skJPage === "timeline") return this._skJoelTimeline(N);
    if (this._skJPage === "walk") return this._skJoelWalk(N);
    if (this._skJPage === "weeks") return this._skJoelWeeks(N);
    return this._skJoelMain(N);
  },

  /* A night being logged by hand, live: the one state that takes the tab over. */
  _skJoelLogging(N) {
    const l = N && N.m.live;
    return l && l.manual && l.night ? l : null;
  },

  /* The ember palette, while that night runs. Read by _render. */
  _skJoelEmber(view) {
    if (view !== "joel") return false;
    try { return !!this._skJoelLogging(this._skNurse()); } catch (e) { return false; }
  },

  _skJBack() {
    return `<button class="sk-back sk-jback" type="button" data-skjp=""><svg viewBox="0 0 24 24" class="ps-ico"><path d="M15 6l-6 6 6 6"/></svg>${psEsc(this._skTabName("joel"))}</button>`;
  },

  /* His usual naps: the morning one and the afternoon one, as minutes of the
     day, from the naps on record before today. Two of each or no usual. */
  _skJUsual(m) {
    const naps = m.sessions.filter((s) => !s.night && !s.active && s.day !== m.todayKey);
    const pick = (am) => {
      const xs = naps.filter((s) => (skjMod(s.from) < 13 * 60) === am);
      if (xs.length < 2) return null;
      return { a: skAvg(xs.map((s) => skjMod(s.settledAt))), b: skAvg(xs.map((s) => skjMod(psWokeAt(s)))) };
    };
    return { am: pick(true), pm: pick(false) };
  },

  /* His usual night as minutes from the evening's midnight: bedtime and the
     wake, which runs past 1440. Two nights or a plain 7:30 → 7:00. */
  _skJUsualNight(m) {
    const ns = m.sessions.filter((s) => s.night && !s.active);
    const r5 = (v) => Math.round(v / 5) * 5;
    if (ns.length < 2) return { a: 19 * 60 + 30, b: 31 * 60 };
    return {
      a: r5(skAvg(ns.map((s) => (s.from - skjMid(s.day)) / 60000))),
      b: r5(skAvg(ns.map((s) => (psWokeAt(s) - skjMid(s.day)) / 60000))),
    };
  },

  /* The night a day is missing, as one "?" to log: his usual window, trimmed
     to whatever else was recorded either side of it and to now. Null when the
     day has a night, or when what is left is too short to be one. */
  _skJNightGhost(m, key) {
    const all = m.all || m.sessions;
    if (all.some((s) => s.night && s.day === key)) return null;
    const u = this._skJUsualNight(m), mid = skjMid(key), now = this._nowMs();
    let a = mid + u.a * 60000, b = Math.min(mid + u.b * 60000, now);
    all.forEach((s) => {
      const e = s.active ? now : psWokeAt(s);
      if (e <= a || s.from >= b) return;
      if (s.from <= a) a = e; else b = Math.min(b, s.from);
    });
    return b - a >= 3 * 3600000 ? { a, b } : null;
  },

  /* The usual naps a day is missing, as "?" blocks: only windows already over,
     only when nothing overlaps them, never while he is asleep. */
  _skJGhosts(m, key, usual, opts) {
    const o = opts || {};
    const mid = skjMid(key), now = this._nowMs();
    const naps = m.sessions.filter((s) => !s.night && s.day === key);
    if (naps.some((s) => s.active)) return [];
    return [usual.am, usual.pm].filter(Boolean).map((u) => ({ a: mid + u.a * 60000, b: mid + u.b * 60000 }))
      .filter((g) => (o.all || g.b < now) && !naps.some((s) => s.from < g.b + 3600000 && psWokeAt(s) > g.a - 3600000));
  },

  /* ============================================================== TODAY === */

  _skJoelMain(N) {
    const { sec, m, nights, past } = N;
    const name = this._skTabName("joel");
    const now = this._nowMs();
    const usual = this._skJUsual(m);
    const away = m.away;
    const live = m.live;
    const manualNap = live && live.manual && !live.night ? live : null;
    /* Away, "Nap overdue" is arithmetic on sessions that ended somewhere he is
       not. The wake window itself is still a fact once anything is logged. */
    let status = m.chipTxt, scls = m.chipCls || "";
    if (manualNap) { status = `Asleep ${psHM(manualNap.asleepMinutes)}`; scls = "deep"; }
    else if (away && !live) { status = m.stats.wakeWindowMin != null ? `Awake ${psHM(m.stats.wakeWindowMin)}` : this._awayLabel(sec); scls = ""; }
    const pill = this._awayStore(sec)
      ? `<button class="sk-jplace ${away ? "away" : ""}" type="button" data-jaway="${psEsc(m.todayKey)}" aria-label="Where Joel is: ${away ? "away" : "home"}. Tap to change">
          <ha-icon icon="mdi:map-marker-outline"></ha-icon>${away ? "Away" : "Home"}</button>` : "";
    const head = `<div class="sk-ttl"><h1>${psEsc(name)}</h1>${status ? `<span class="sk-status big ${scls}">${psEsc(status)}</span>` : ""}</div>`;
    const P = {};

    /* ---- today ---- */
    const todayNaps = m.todayNaps;
    const napMins = todayNaps.filter((s) => !s.active).reduce((a, s) => a + s.asleepMinutes, 0);
    const done = todayNaps.filter((s) => !s.active).length;
    const store = !!this._manualStore(sec);
    let btns;
    if (manualNap) {
      btns = `<button class="sk-bigbtn pri" type="button" data-jstop="1"><ha-icon icon="mdi:white-balance-sunny"></ha-icon>He woke</button>`;
    } else if (away && store) {
      btns = `<button class="sk-bigbtn pri" type="button" data-jnap="1"><ha-icon icon="mdi:weather-night"></ha-icon>Nap now</button>
        <button class="sk-bigbtn" type="button" data-jbed="1"><ha-icon icon="mdi:bed-outline"></ha-icon>Bedtime</button>`;
    } else {
      const playing = m.playing;
      btns = `${sec.hatch ? `<button class="sk-bigbtn ${playing ? "" : "pri"} ${this._armed === "hatch" ? "armed" : ""}" type="button"
            data-arm="${playing ? "hatch" : ""}" data-hatch="${playing ? "" : "start"}">
            <ha-icon icon="${playing ? "mdi:stop" : "mdi:play"}"></ha-icon>${this._armed === "hatch" ? "Stop the Hatch?" : playing ? "Stop Hatch" : "Start Hatch"}</button>` : ""}
        ${sec.light ? this._skJLightBtn(sec, m) : ""}`;
    }
    P.today = `<div class="sk-card sk-pad" id="sk-c-jtoday">
        <div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-j2)"><ha-icon icon="mdi:white-balance-sunny"></ha-icon></span><span class="sk-hn">Today</span>
          ${done ? `<span class="ps-chip">${done} nap${done > 1 ? "s" : ""} · ${psHM(napMins)}</span>` : ""}${pill}</div>
        ${this._skJDayRib(N, usual)}
        <div class="sk-btnrow">${btns}</div>
      </div>`;

    /* ---- last night ---- */
    const n = m.nightSession;
    /* Last night is YESTERDAY's evening. A night from two days back is not it,
       and while he is away the house saw nothing, so the gap is offered as a
       "?" to log rather than an older night wearing the label. */
    const yk = psDayKey(new Date(skjMid(m.todayKey) - 43200000));
    const isLast = n && (n.active || n.day === yk || n.day === m.todayKey);
    const gap = store && m.loaded && !isLast && !(live && live.night) ? this._skJNightGhost(m, yk) : null;
    if (gap) {
      P.night = `<div class="sk-card sk-pad" id="sk-c-jnight">
          <div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-deep)"><ha-icon icon="mdi:weather-night"></ha-icon></span>
            <span class="sk-hn">Last night</span></div>
          <div class="sk-big"><span class="sk-num q">?</span></div>
          <button class="sk-bigbtn pri wide" type="button" data-jlognight="${gap.a}:${gap.b}">
            <ha-icon icon="mdi:plus"></ha-icon>Log last night · ${psEsc(skClk(gap.a))} → ${psEsc(skClk(gap.b))}</button>
        </div>`;
    } else if (n) {
      const rail = this._skRail(n, true);
      const mark = n.edited ? `<span class="ps-chip">corrected</span>` : n.manual ? `<span class="ps-chip">logged by hand</span>` : "";
      const nName = n.active ? "Tonight" : isLast ? "Last night" : `${skDayName(n.from, true)} night`;
      P.night = `<button class="sk-card sk-pad sk-jlink" type="button" id="sk-c-jnight" data-skjp="walk" data-jnight="${n.from}" aria-label="${psEsc(nName)}: walk through it">
          <div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-deep)"><ha-icon icon="mdi:weather-night"></ha-icon></span>
            <span class="sk-hn">${psEsc(nName)}</span>${mark}${this._skNightDelta(n, past)}</div>
          <div class="sk-big"><span class="sk-num">${skHMHtml(n.asleepMinutes)}</span>
            <span class="sk-wk ${n.interventions == null ? "q" : ""}"><ha-icon icon="mdi:door-open"></ha-icon>${skjWakes(n)}</span>
            <ha-icon class="sk-jchev" icon="mdi:chevron-right"></ha-icon></div>
          <div class="sk-railbox">${rail.svg}</div>
        </button>`;
    } else {
      P.night = `<div class="sk-card sk-pad"><div class="sk-empty">${m.loaded ? "No night recorded yet" : "Loading the nights…"}</div></div>`;
    }

    /* ---- naps by time of day ---- */
    P.naps = this._skJNapsCard(N, usual);

    /* ---- the weeks, small ---- */
    P.weeks = this._skJWeeksCard(N);

    if (this._skHas("wide")) return head + this._skCols([[P.today, P.weeks], [P.night], [P.naps]], "sk-joelcols");
    if (this._skHas("split")) return head + this._skCols([[P.today, P.naps], [P.night, P.weeks]], "sk-joelcols");
    return head + P.today + P.night + P.naps + P.weeks;
  },

  _skJLightBtn(sec, m) {
    const lt = this._hass.states[sec.light];
    const on = lt && lt.state === "on";
    const guard = !!m.playing;
    const armed = guard && this._skArmed === "nl";
    const act = guard ? `data-skarm="nl" data-sktog="${psEsc(sec.light)}"` : `data-sktoggle="${psEsc(sec.light)}"`;
    return `<button class="sk-bigbtn ${on ? "lit" : ""} ${armed ? "armed" : ""}" type="button" ${act} aria-label="Night light${guard ? ", Joel is asleep" : ""}">
        <ha-icon icon="mdi:lightbulb-night-outline"></ha-icon>${armed ? (on ? "Turn it off?" : "Turn it on?") : "Night light"}</button>`;
  },

  /* The day from 6 AM to 10 PM: what happened, what nobody logged, and what
     comes next, each drawn where it falls. */
  _skJDayRib(N, usual) {
    const { sec, m } = N;
    const now = this._nowMs();
    const mid = skjMid(m.todayKey);
    const T0 = mid + 6 * 3600000, T1 = mid + 22 * 3600000;
    const x = (t) => skjPct(t, T0, T1);
    const w = (a, b) => Math.max(1.4, (skClamp((b - a) / (T1 - T0)) * 100)).toFixed(2);
    const out = [];
    const ln = m.lastNight;
    if (ln && psWokeAt(ln) > T0) out.push(`<span class="b${ln.manual ? " man" : ""}" style="left:0;width:${x(psWokeAt(ln))}%"></span>`);
    m.sessions.filter((s) => s.night && s.active && s.from >= mid).forEach((s) =>
      out.push(`<span class="b live" style="left:${x(s.from)}%;width:${w(s.from, now)}%"></span>`));
    m.todayNaps.forEach((s) => {
      const end = s.active ? now : psWokeAt(s);
      const can = s.manual ? !!this._manualStore(sec) : !!this._napEditStore(sec);
      out.push(`<${can ? "button" : "span"} class="b nap${s.manual ? " man" : ""}${s.active ? " live" : ""}" style="left:${x(s.from)}%;width:${w(s.from, end)}%"${
        can ? ` type="button" data-napopen="${s.from}" data-entity="${psEsc(sec.hatch || "")}" aria-label="Nap at ${psEsc(skClk(s.from))}, ${psHM(s.asleepMinutes)}. Tap to correct"` : ""}></${can ? "button" : "span"}>`);
    });
    if (this._manualStore(sec)) {
      this._skJGhosts(m, m.todayKey, usual).forEach((g) => out.push(`<button class="b ghost" type="button" data-jghost="${g.a}:${g.b}"
          style="left:${x(g.a)}%;width:${w(g.a, g.b)}%" aria-label="His usual nap, ${psEsc(skClk(g.a))}. Tap if he slept">?</button>`));
    }
    /* What comes next: the nap the wake window predicts, and bedtime. */
    if (!m.live) {
      const st = m.stats;
      const nightAfter = sec.night_after_hour == null ? 18 : sec.night_after_hour;
      if (st.napDueAt != null && new Date(st.napDueAt).getHours() < nightAfter) {
        const a = Math.max(st.napDueAt, now);
        const len = usual.pm ? (usual.pm.b - usual.pm.a) * 60000 : 3600000;
        out.push(`<span class="b ghost still" style="left:${x(a)}%;width:${w(a, a + len)}%"></span>`);
      }
      const tonight = m.sessions.some((s) => s.night && s.from >= mid);
      if (st.bedMean != null && !tonight) {
        const bed = Math.max(mid + st.bedMean * 60000, now);
        if (bed < T1) out.push(`<span class="b ghost still night" style="left:${x(bed)}%;width:${w(bed, T1)}%"></span>`);
      }
    }
    const nx = x(now);
    return `<div class="sk-jribwrap"><div class="sk-jrib tall" role="img" aria-label="Today from 6 AM to 10 PM">${out.join("")}
        <span class="fut" style="left:${nx}%"></span><span class="now" style="left:${nx}%"></span></div>
      <div class="sk-jax"><span style="left:0">6a</span><span style="left:18.75%">9a</span><span style="left:37.5%">12p</span><span style="left:56.25%">3p</span><span style="left:75%">6p</span><span style="left:100%">10p</span></div></div>`;
  },

  /* Naps, 7 AM to 7 PM, a row a day with dashed lines at his usual starts —
     so a nap drifting early or late is visible down the column. */
  _skJNapsCard(N, usual) {
    const { sec, m } = N;
    const now = this._nowMs();
    const A = 7 * 60, B = 19 * 60;
    const guides = [usual.am, usual.pm].filter(Boolean).map((u) => `<i class="g" style="left:${skjPct(u.a, A, B)}%"></i>`).join("");
    const rows = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const key = psDayKey(d), today = i === 0;
      const naps = (m.all || m.sessions).filter((s) => !s.night && s.day === key);
      const away = this._isAwayDay(sec, key);
      let inner;
      if (!naps.length && !today) inner = `<span class="sk-napbar hatch">${guides}${away ? "<em>away</em>" : ""}</span>`;
      else {
        const segs = naps.map((s) => {
          const a = skjMod(s.from), b = s.active ? skjMod(now) : skjMod(psWokeAt(s));
          return `<i class="seg${s.manual ? " man" : ""}${s.active ? " live" : ""}" style="left:${skjPct(a, A, B)}%;width:${Math.max(1.5, ((b - a) / (B - A)) * 100).toFixed(1)}%;--set:0%"></i>`;
        }).join("");
        const nm = today ? `<i class="fut" style="left:${skjPct(skjMod(now), A, B)}%"></i><i class="now" style="left:${skjPct(skjMod(now), A, B)}%"></i>` : "";
        inner = `<span class="sk-napbar">${guides}${segs}${nm}</span>`;
      }
      rows.push(`<div class="sk-nap"><span class="${today ? "td" : ""}">${today ? "Today" : psEsc(d.toLocaleDateString([], { weekday: "short" }))}</span>${inner}</div>`);
    }
    const chip = this._skJNapShift(m);
    return `<button class="sk-card sk-pad sk-jlink" type="button" id="sk-c-naps" data-skjp="timeline" aria-label="Naps this week by time of day. Open the timeline">
        <div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-j2)"><ha-icon icon="mdi:sleep"></ha-icon></span><span class="sk-hn">Naps</span>${chip}</div>
        <div class="sk-naps">${rows.join("")}
          <div class="sk-nap ax"><span></span><span class="sk-napax"><span>7a</span><span>10a</span><span>1p</span><span>4p</span><span>7p</span></span></div></div>
      </button>`;
  },

  /* The bigger of the two drifts this week against last: when the morning or
     the afternoon nap has started, on average. A comparison, so it is a chip. */
  _skJNapShift(m) {
    const wk = skjWeek(this._nowMs());
    const starts = (a, b, am) => (m.all || m.sessions).filter((s) => !s.night && !s.active && s.day !== m.todayKey
      && skjMid(s.day) >= a && skjMid(s.day) < b && (skjMod(s.from) < 780) === am).map((s) => skjMod(s.from));
    let best = null;
    [true, false].forEach((am) => {
      const t = starts(wk, wk + 8 * SKJ_DAY, am), l = starts(skjPrevWk(wk), wk, am);
      if (t.length < 1 || l.length < 2) return;
      const d = Math.round(skAvg(t) - skAvg(l));
      if (Math.abs(d) >= 10 && (!best || Math.abs(d) > Math.abs(best.d))) best = { d, am };
    });
    return best ? `<span class="ps-chip">${best.am ? "AM" : "PM"} nap ${best.d > 0 ? "+" : "−"}${psHM(Math.abs(best.d))}</span>` : "";
  },

  /* ============================================================== WEEKS === */

  /* Each day of a week, measured. undefined is a day still to come, null a day
     with nothing recorded — never a zero. */
  _skJWeekDays(m, wk) {
    const now = this._nowMs();
    const days = [];
    for (let i = 0; i < 7; i++) {
      /* By calendar day, not by adding 24h: a week holding a clock change has
         a 23- or 25-hour day in it. */
      const d = new Date(wk); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
      const key = psDayKey(d);
      if (d.getTime() > now) { days.push(undefined); continue; }
      const night = (m.all || m.sessions).find((s) => s.night && s.day === key && !s.active) || null;
      const naps = (m.all || m.sessions).filter((s) => !s.night && s.day === key && !s.active);
      const today = key === m.todayKey;
      days.push({ key, today, night, naps,
        napMin: naps.length ? naps.reduce((a, s) => a + s.asleepMinutes, 0) : null,
        napsManual: naps.some((s) => s.manual) });
    }
    return days;
  },

  _skJWeekStat(days, metric) {
    const xs = days.filter((d) => d && !d.today).map((d) => {
      if (metric === "night") return d.night ? d.night.asleepMinutes : null;
      if (metric === "naps") return d.napMin;
      if (metric === "wakes") return d.night && d.night.interventions != null ? d.night.interventions : null;
      if (metric === "bed") return d.night ? skMinOfNight(d.night.from) : null;
      return null;
    }).filter((v) => v != null);
    return xs.length ? skAvg(xs) : null;
  },

  _skJWeeksCard(N) {
    const { m } = N;
    const wk = skjWeek(this._nowMs());
    const t = this._skJWeekDays(m, wk), l = this._skJWeekDays(m, skjPrevWk(wk));
    const tn = this._skJWeekStat(t, "night"), tp = this._skJWeekStat(t, "naps"), tw = this._skJWeekStat(t, "wakes");
    const lp = this._skJWeekStat(l, "naps");
    if (tn == null && tp == null) return "";
    const chip = tp != null && lp != null ? `<span class="ps-chip">${skjDelta(tp - lp, "m")} naps</span>` : "";
    const cell = (v, lab, cls) => `<div class="sk-jwn ${cls || ""}"><b>${v == null ? "—" : lab === "wakes" ? v.toFixed(1) : skHMHtml(Math.round(v))}</b><span>${lab}</span></div>`;
    return `<button class="sk-card sk-pad sk-jlink" type="button" id="sk-c-jweeks" data-skjp="weeks" aria-label="This week, compared. Open weeks">
        <div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-r2)"><ha-icon icon="mdi:chart-bar"></ha-icon></span><span class="sk-hn">This week</span>${chip}</div>
        <div class="sk-jwns">${cell(tn, "nights")}${cell(tp, "naps")}${cell(tw, "wakes", "v")}</div>
      </button>`;
  },

  _skJoelWeeks(N) {
    const { m } = N;
    const tab = this._skJWk || "night";
    const now = this._nowMs();
    const wk0 = skjWeek(now);
    const nW = (m.archive || []).length ? 8 : 4;
    const weeks = Array.from({ length: nW }, (_, i) => i).map((i) => {
      const wk = i ? skjPrevWk(wk0, i) : wk0;
      return { wk, days: this._skJWeekDays(m, wk) };
    });
    const SC = { night: [540, 780], naps: [0, 240], wakes: [0, 6], bed: [1080, 1230] };
    const fmt = (v) => v == null ? "—" : tab === "wakes" ? v.toFixed(1) : tab === "bed" ? skMinText(v) : psHM(Math.round(v));
    const tabs = [["night", "Night"], ["naps", "Naps"], ["times", "Nap time"], ["wakes", "Wakes"], ["bed", "Bed"]];
    const cards = weeks.map((w, i) => {
      const label = i === 0 ? "This week" : i === 1 ? "Last week" : new Date(w.wk).toLocaleDateString([], { month: "short", day: "numeric" });
      const has = w.days.some((d) => d && (d.night || d.naps.length));
      if (!has) {
        return `<div class="sk-card sk-pad sk-jwk old"><div class="sk-hd"><span class="sk-hn">${psEsc(label)}</span><span class="ps-chip">not kept</span></div>
          <div class="sk-jcols">${w.days.map(() => `<span class="col unseen"></span>`).join("")}</div>${this._skJDays()}</div>`;
      }
      const prev = weeks[i + 1];
      let avg, avg2 = "", ref = [], chip = "";
      if (tab === "times") {
        const st = (days, am) => skAvg(days.filter((d) => d && !d.today).flatMap((d) => d.naps).filter((s) => (skjMod(s.from) < 780) === am).map((s) => skjMod(s.from)));
        const a = st(w.days, true), b = st(w.days, false);
        avg = a == null ? "—" : skjClk(a); avg2 = b == null ? "" : skjClk(b);
        if (prev) {
          const pa = st(prev.days, true), pb = st(prev.days, false);
          ref = [pa, pb].filter((v) => v != null).map((v) => ({ top: skjPct(v, 420, 1140) }));
          if (b != null && pb != null) chip = `PM ${skjDelta(b - pb, "m")}`;
        }
      } else {
        const v = this._skJWeekStat(w.days, tab);
        avg = fmt(v);
        const pv = prev ? this._skJWeekStat(prev.days, tab) : null;
        if (pv != null) {
          const [lo, hi] = SC[tab];
          ref = [tab === "bed" ? { top: (8 + skClamp((pv - lo) / (hi - lo)) * 84).toFixed(2) } : { bottom: skjPct(pv, lo, hi) }];
          if (v != null) chip = tab === "wakes" ? skjDelta(v - pv) : skjDelta(v - pv, "m");
        }
      }
      const cols = w.days.map((d) => {
        if (d === undefined) return `<span class="col future"></span>`;
        if (tab === "times") {
          if (!d.naps.length) return `<span class="col ${d.today ? "future" : "unseen"}"></span>`;
          return `<span class="col">${d.naps.map((s) => `<i class="nb${s.manual ? " man" : ""}" style="top:${skjPct(skjMod(s.from), 420, 1140)}%;height:${Math.max(2, ((skjMod(psWokeAt(s)) - skjMod(s.from)) / 720) * 100).toFixed(1)}%"></i>`).join("")}</span>`;
        }
        const s = d.night;
        let v = null, man = false;
        if (tab === "night") { v = s ? s.asleepMinutes : null; man = !!(s && s.manual); }
        else if (tab === "naps") { v = d.napMin; man = d.napsManual; }
        else if (tab === "wakes") { v = s ? s.interventions : null; man = !!(s && s.manual); if (s && v == null) return `<span class="col unseen"><em>?</em></span>`; }
        else if (tab === "bed") { v = s ? skMinOfNight(s.from) : null; man = !!(s && s.manual); }
        if (v == null) return `<span class="col ${d.today ? "future" : "unseen"}"></span>`;
        const [lo, hi] = SC[tab];
        const f = skClamp((v - lo) / (hi - lo));
        if (tab === "bed") return `<span class="col"><i class="dot${man ? " man" : ""}" style="top:${(8 + f * 84).toFixed(2)}%"></i></span>`;
        return `<span class="col"><i class="bar ${tab}${man ? " man" : ""}" style="height:${Math.max(4, Math.round(f * 100))}%"></i></span>`;
      }).join("");
      const refs = ref.map((r) => `<i class="ref" style="${r.top != null ? `top:${r.top}%` : `bottom:${r.bottom}%`}"></i>`).join("");
      return `<div class="sk-card sk-pad sk-jwk">
          <div class="sk-hd"><span class="sk-hn">${psEsc(label)}</span>${chip ? `<span class="ps-chip">${psEsc(chip)}</span>` : ""}</div>
          <div class="sk-num sk-jwkn">${psEsc(avg)}${avg2 ? `<small> &amp; </small>${psEsc(avg2)}` : ""}</div>
          <div class="sk-jcols${tab === "times" ? " tall" : ""}" role="img" aria-label="${psEsc(label)}: ${psEsc(avg)}">${cols}${refs}</div>${this._skJDays()}
        </div>`;
    });
    return `${this._skJBack()}<div class="sk-ttl"><h1>Weeks</h1></div>
      <div class="sk-seg sk-jseg" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-jwk="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}</div>
      ${cards.join("")}`;
  },

  _skJDays() {
    return `<div class="sk-jdays"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>`;
  },

  /* =========================================================== TIMELINE === */

  _skJoelTimeline(N) {
    const { sec, m } = N;
    const naps = (this._skJTl || "naps") === "naps";
    const now = this._nowMs();
    const usual = this._skJUsual(m);
    const fill = this._skFill || {};
    const nDays = Math.max(7, sec.days || 7);
    const A = naps ? 7 * 60 : 6 * 60, B = naps ? 19 * 60 : 32 * 60;
    const store = !!this._manualStore(sec);
    const days = [];
    for (let i = 0; i < nDays; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      days.push({ key: psDayKey(d), mid: d.getTime(), today: i === 0 });
    }
    const span = (a, b) => ({ l: skjPct(a, A, B), w: Math.max(1, ((Math.min(b, B) - Math.max(a, A)) / (B - A)) * 100).toFixed(2) });
    const minOf = (t, mid) => (t - mid) / 60000;
    let openGhosts = [];
    const weekOf = (mid) => skjWeek(mid);
    const wk0 = skjWeek(now);
    const metric = naps ? "naps" : "night";
    const wkStat = (wk) => this._skJWeekStat(this._skJWeekDays(m, wk), metric);

    /* The recorder keeps about ten days. A day before the oldest thing it still
       holds was never seen by this card at all — not a day to fill in, a day
       that is gone — so the list stops there and says so. */
    const first = (m.all || m.sessions).length ? Math.min(...(m.all || m.sessions).map((s) => skjMid(s.day))) : now;
    const kept = days.filter((d) => d.mid >= first || d.today);
    const lost = kept.length < days.length;
    const rows = [];
    let lastWk = null;
    kept.forEach((d) => {
      const wk = weekOf(d.mid);
      if (wk !== lastWk) {
        lastWk = wk;
        const lab = wk === wk0 ? "This week" : wk === skjPrevWk(wk0) ? "Last week" : new Date(wk).toLocaleDateString([], { month: "short", day: "numeric" });
        const v = wkStat(wk), pv = wk === wk0 ? wkStat(skjPrevWk(wk)) : null;
        const chip = v != null && pv != null ? `<span class="ps-chip">${skjDelta(v - pv, "m")}</span>` : "";
        rows.push(`<div class="sk-jwkh">${psEsc(lab)}<i></i>${v == null ? "" : `<b>${psHM(Math.round(v))}</b>`}${chip}</div>`);
      }
      const dn = (m.all || m.sessions).filter((s) => !s.night && s.day === d.key);
      const night = (m.all || m.sessions).find((s) => s.night && s.day === d.key) || null;
      const away = this._isAwayDay(sec, d.key);
      const ghosts = store && (d.today || (!dn.length && (fill[d.key] || away)))
        ? this._skJGhosts(m, d.key, usual, { all: !d.today }) : [];
      const blocks = [];
      if (naps) blocks.push(...[usual.am, usual.pm].filter(Boolean).map((u) => `<i class="g" style="left:${skjPct(u.a, A, B)}%"></i>`));
      if (!dn.length && !d.today && !ghosts.length) blocks.push(`<span class="hz" style="left:${skjPct(8 * 60, A, B)}%;width:${(((18 - 8) * 60) / (B - A) * 100).toFixed(2)}%"></span>`);
      dn.forEach((s) => {
        const a = minOf(s.from, d.mid), b = minOf(s.active ? now : psWokeAt(s), d.mid), sp = span(a, b);
        const can = !s.archived && (s.manual ? !!this._manualStore(sec) : !!this._napEditStore(sec));
        const lab = naps && +sp.w > 22 && !s.active ? `<span class="dl">${psHM(s.asleepMinutes)}</span>` : "";
        blocks.push(`<${can ? "button" : "span"} class="b nap${s.manual ? " man" : ""}${s.active ? " live" : ""}" style="left:${sp.l}%;width:${sp.w}%"${
          can ? ` type="button" data-napopen="${s.from}" data-entity="${psEsc(sec.hatch || "")}" aria-label="Nap ${psEsc(skClk(s.from))}, ${psHM(s.asleepMinutes)}. Tap to correct"` : ""}>${lab}</${can ? "button" : "span"}>`);
        if (naps) (s.events || []).forEach((t) => blocks.push(`<i class="k" style="left:${skjPct(minOf(t, d.mid), A, B)}%"></i>`));
      });
      ghosts.forEach((g) => {
        openGhosts.push(g);
        const sp = span(minOf(g.a, d.mid), minOf(g.b, d.mid));
        blocks.push(`<button class="b ghost" type="button" data-jghost="${g.a}:${g.b}" style="left:${sp.l}%;width:${sp.w}%" aria-label="Usual nap, ${psEsc(skClk(g.a))}. Tap if he slept">?</button>`);
      });
      if (!naps && night) {
        const sp = span(minOf(night.from, d.mid), minOf(night.active ? now : psWokeAt(night), d.mid));
        blocks.push(`<button class="b${night.manual ? " man" : ""}${night.active ? " live" : ""}" type="button" style="left:${sp.l}%;width:${sp.w}%" data-skjp="walk" data-jnight="${night.from}" aria-label="${psEsc(skDayName(night.from, true))} night. Walk through it"></button>`);
        (night.events || []).forEach((t) => blocks.push(`<i class="k" style="left:${skjPct(minOf(t, d.mid), A, B)}%"></i>`));
      }
      const ng = !naps && !night && !d.today && store ? this._skJNightGhost(m, d.key) : null;
      if (ng) {
        const sp = span(minOf(ng.a, d.mid), minOf(ng.b, d.mid));
        blocks.push(`<button class="b ghost night" type="button" data-jlognight="${ng.a}:${ng.b}" style="left:${sp.l}%;width:${sp.w}%" aria-label="His usual night, ${psEsc(skClk(ng.a))}. Tap to log it">?</button>`);
      }
      if (d.today) { const nx = skjPct(minOf(now, d.mid), A, B); blocks.push(`<i class="fut" style="left:${nx}%"></i><i class="now" style="left:${nx}%"></i>`); }
      const fillBtn = store && !dn.length && !d.today && !ghosts.length && !ng
        ? `<button class="fill" type="button" data-jfill="${d.key}"><span>${away ? "Away · fill in" : "Fill in"}</span></button>` : "";
      let total, sub = "", q = "";
      const napMin = dn.filter((s) => !s.active).reduce((a, s) => a + s.asleepMinutes, 0);
      if (naps) {
        if (d.today) { total = dn.length ? psHM(napMin) : "—"; sub = "so far"; }
        else if (!dn.length) { total = "?"; q = "q"; }
        else { total = psHM(napMin); sub = `${dn.length} nap${dn.length > 1 ? "s" : ""}`; }
      } else if (d.today && !night) { total = "—"; sub = "tonight"; }
      else if (!night) { total = "?"; q = "q"; }
      else { total = psHM(night.asleepMinutes + napMin); sub = dn.length ? "" : "naps ?"; }
      const date = new Date(d.mid);
      const label = `<b>${d.today ? "Today" : psEsc(date.toLocaleDateString([], { weekday: "short" }))}</b><small>${psEsc(date.toLocaleDateString([], { month: "short", day: "numeric" }))}</small>`;
      rows.push(`<div class="sk-tl">
          ${night && !night.active ? `<button class="d ${d.today ? "td" : away ? "away" : ""}" type="button" data-skjp="walk" data-jnight="${night.from}" aria-label="Walk through ${psEsc(date.toLocaleDateString([], { weekday: "long" }))} night">${label}</button>`
            : `<span class="d ${d.today ? "td" : away ? "away" : ""}">${label}</span>`}
          <span class="sk-jrib">${blocks.join("")}${fillBtn}</span>
          <span class="v ${q}">${psEsc(total)}<small>${psEsc(sub)}</small></span></div>`);
    });

    /* How often he is asleep at each quarter hour, over the days that were seen. */
    const seen = kept.filter((d) => !d.today);
    const dens = [];
    for (let t = A; t < B; t += 15) {
      let n = 0, of = 0;
      seen.forEach((d) => {
        const at = d.mid + t * 60000;
        const dn = (m.all || m.sessions).filter((s) => !s.night && s.day === d.key);
        const inNap = dn.some((s) => at >= s.from && at < psWokeAt(s));
        const inNight = !naps && (m.all || m.sessions).some((s) => s.night && at >= s.from && at < psWokeAt(s));
        if (!dn.length && t >= 480 && t < 1080 && !inNight) return;
        of++; if (inNap || inNight) n++;
      });
      dens.push(of ? (0.08 + 0.92 * (n / of)).toFixed(2) : "0.08");
    }

    const ticks = naps ? [["7a", 0], ["10a", 25], ["1p", 50], ["4p", 75], ["7p", 100]] : [["6a", 0], ["12p", 23.08], ["6p", 46.15], ["12a", 69.23], ["8a", 100]];
    const todayAway = this._isAwayDay(sec, m.todayKey);
    let since = null;
    if (todayAway) {
      const dd = new Date(now); dd.setHours(0, 0, 0, 0);
      for (let i = 0; i < nDays; i++) { if (!this._isAwayDay(sec, psDayKey(dd))) break; since = dd.getTime(); dd.setDate(dd.getDate() - 1); }
    }
    const banner = openGhosts.length ? `<div class="sk-jbanner"><ha-icon icon="mdi:map-marker-outline"></ha-icon>
        <span>${since != null && since < skjMid(m.todayKey) ? `Away since ${psEsc(new Date(since).toLocaleDateString([], { weekday: "short" }))} · ` : ""}${openGhosts.length} to check</span>
        <button type="button" data-jusual="${openGhosts.map((g) => `${g.a}:${g.b}`).join(",")}"><ha-icon icon="mdi:check"></ha-icon>Like usual</button></div>` : "";
    return `${this._skJBack()}<div class="sk-ttl"><h1>Timeline</h1></div>${banner}
      <div class="sk-seg sk-jseg" role="tablist">
        <button type="button" role="tab" data-jtl="naps" aria-selected="${naps}">Naps</button>
        <button type="button" role="tab" data-jtl="day" aria-selected="${!naps}">Whole day</button></div>
      <div class="sk-card sk-jtlcard">
        <div class="sk-jlg"><span><i class="h"></i>Hatch</span><span><i class="m"></i>By hand</span><span><i class="u"></i>Not seen</span><span><i class="k"></i>Went in</span></div>
        <div class="sk-tl ax"><span></span><span class="sk-jax">${ticks.map(([l, p]) => `<span style="left:${p}%">${l}</span>`).join("")}</span><span></span></div>
        ${rows.join("")}
        ${lost ? `<div class="sk-jwkh">Earlier<i></i><span class="ps-chip">not kept</span></div>` : ""}
        <div class="sk-jwkh">Usual<i></i></div>
        <div class="sk-tl"><span class="d"><b>Avg</b><small>${seen.length} days</small></span>
          <span class="sk-jdens" role="img" aria-label="How often he is asleep at each time of day">${dens.map((o) => `<i style="opacity:${o}"></i>`).join("")}</span><span></span></div>
      </div>`;
  },

  /* =============================================================== WALK === */

  _skJoelWalk(N) {
    const { sec, m, past } = N;
    const list = (m.all || m.sessions).filter((s) => s.night);
    /* A night just logged from a "?" is not in hass until the write lands;
       wait for it rather than showing another night, then open its sheet so
       the times and the wake-ups are set while they are remembered. */
    const fix = this._skJFix;
    if (fix) {
      const hit = list.find((s) => s.manual && Math.abs(s.from - fix.at) <= 60000);
      if (hit) {
        this._skJFix = null;
        this._skNight = hit.from;
        setTimeout(() => this._openNapEdit(hit.from), 0);
      } else if (Date.now() - fix.t < 10000) {
        return `${this._skJBack()}<div class="sk-card sk-pad"><div class="sk-empty">Saving the night…</div></div>`;
      } else this._skJFix = null;
    }
    const pick = list.find((s) => s.from === this._skNight) || m.nightSession || list[list.length - 1];
    if (!pick) return `${this._skJBack()}<div class="sk-card sk-pad"><div class="sk-empty">No night recorded yet</div></div>`;
    const i = list.indexOf(pick);
    const rail = this._skRail(pick, true);
    /* A hand-logged night says so on its Down row; a corrected one needs the chip. */
    const mark = pick.edited ? `<span class="ps-chip">corrected</span>` : pick.archived ? `<span class="ps-chip">archived</span>` : "";
    const canFix = !pick.archived && (pick.manual ? !!this._manualStore(sec) : !!this._napEditStore(sec));
    const name = pick.active ? "Tonight" : `${skDayName(pick.from, true)} night`;
    return `${this._skJBack()}<div class="sk-ttl"><h1>Night</h1></div>
      <div class="sk-nightwrap" id="sk-nightwrap">
        <div class="sk-card sk-pad sk-nighthero" id="sk-c-night">
          <div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-deep)"><ha-icon icon="mdi:weather-night"></ha-icon></span>
            <span class="sk-jstep">
              <button type="button" data-jstep="${i > 0 ? list[i - 1].from : ""}" ${i > 0 ? "" : "disabled"} aria-label="The night before"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
              <span class="sk-hn">${psEsc(name)}</span>
              <button type="button" data-jstep="${i < list.length - 1 ? list[i + 1].from : ""}" ${i < list.length - 1 ? "" : "disabled"} aria-label="The night after"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
            </span>${mark}${this._skNightDelta(pick, past)}</div>
          <div class="sk-big"><span class="sk-num">${skHMHtml(pick.asleepMinutes)}</span>
            <span class="sk-wk ${pick.interventions == null ? "q" : ""}"><ha-icon icon="mdi:door-open"></ha-icon>${skjWakes(pick)}</span></div>
          <div class="sk-railbox" id="sk-bigrail" data-t0="${rail.T0}" data-t1="${rail.T1}">${rail.svg}<span class="sk-hl" id="sk-hl"></span><span class="sk-cursor" id="sk-cursor"><b></b></span></div>
        </div>
        <div class="sk-evs" id="sk-evs">${this._skJEvents(pick, sec)}</div>
        ${canFix ? `<button class="sk-bigbtn wide" type="button" data-napopen="${pick.from}" data-entity="${psEsc(sec.hatch || "")}">
            <ha-icon icon="mdi:pencil-outline"></ha-icon>${pick.manual && pick.night && !(pick.wakeLog || []).length ? "Fix times · wake-ups" : "Fix times"}</button>` : ""}
      </div>`;
  },

  /* Every event of the night as a row, and the sleep between them as rows of
     their own. The cursor on the pinned rail follows the row under it: an
     event moves it, a stretch lights its span. */
  _skJEvents(s, sec) {
    const now = this._nowMs();
    const end = s.active ? now : psWokeAt(s);
    const rows = [];
    const ev = (t, w, sub, c) => rows.push({ k: "ev", t, w, sub, c });
    const st = (a, b, o) => rows.push(Object.assign({ k: "st", a, b, m: Math.max(0, Math.round((b - a) / 60000)) }, o || {}));
    ev(s.from, "Down", s.manual ? "logged by hand" : "", "sk-j2");
    if (s.manual && !(s.wakeLog || []).length && s.interventions !== 0) {
      st(s.from, end, { unseen: true, w: "Not watched", sub: `wake-ups ${skjWakes(s)}` });
    } else if (s.manual) {
      let prev = s.from;
      (s.wakeLog || []).forEach((w, i) => {
        st(prev, w.at);
        const aw = w.back == null ? null : Math.round((w.back - w.at) / 60000);
        ev(w.at, "Woke", [i === 0 ? "first wake" : "", aw == null ? "up now" : `up ${psHM(aw)}`].filter(Boolean).join(" · "), "visit");
        prev = w.back == null ? now : w.back;
      });
      if (!s.awakeNow) st(prev, end);
    } else {
      if (s.settledAt > s.from) ev(s.settledAt, "Left him", s.settleMinutes ? `${s.settleMinutes}m to settle` : "", "deep");
      const visitMax = 30 * 60000;
      let prev = s.settledAt;
      (s.events || []).forEach((t, i) => {
        st(prev, t);
        const out = (s.doorAt || []).find((x) => x > t + 60000 && x <= t + visitMax);
        const room = out ? Math.max(1, Math.round((out - t) / 60000)) : null;
        ev(t, "Went in", [i === 0 ? "first wake" : "", room ? `${room}m in the room` : ""].filter(Boolean).join(" · "), "visit");
        prev = out || t;
      });
      st(prev, end);
    }
    if (s.active) ev(now, s.awakeNow ? "Awake now" : "Asleep now", "", "deep");
    else ev(end, "Up", `${psHM(s.asleepMinutes)} asleep`, "deep");
    const gaps = rows.filter((r) => r.k === "st" && !r.unseen);
    const visits = rows.some((r) => r.c === "visit");
    let best = null;
    gaps.forEach((r) => { if (!best || r.m > best.m) best = r; });
    return rows.map((r, i) => {
      if (r.k === "ev") {
        return `<button class="sk-ev ${r.c}" type="button" data-skev="${i}" data-t="${r.t}">
          <span class="dot"></span><span class="tm">${skClkHtml(r.t)}</span><span class="w">${psEsc(r.w)}${r.sub ? `<small>${psEsc(r.sub)}</small>` : ""}</span></button>`;
      }
      const w = r.w || (visits ? "asleep" : s.active ? "asleep" : "slept through");
      return `<button class="sk-ev st${r.unseen ? " unseen" : ""}" type="button" data-skev="${i}" data-a="${r.a}" data-b="${r.b}" data-len="${psEsc(psHM(r.m))}">
          <span class="dot"></span><span class="tm">${psEsc(psHM(r.m))}${best === r && visits ? `<span class="sk-best">longest</span>` : ""}</span><span class="w">${psEsc(w)}${r.sub ? `<small>${psEsc(r.sub)}</small>` : ""}</span></button>`;
    }).join("");
  },

  /* Called from _skFrame: the row under the pinned night drives its rail. */
  _skJoelFrame(root) {
    const box = root.getElementById("sk-bigrail"), cur = root.getElementById("sk-cursor"), hl = root.getElementById("sk-hl"), hero = root.getElementById("sk-c-night");
    const rows = Array.from(root.querySelectorAll("#sk-evs .sk-ev"));
    if (!box || !cur || !hero || !rows.length) return;
    const line = hero.getBoundingClientRect().bottom + 40;
    let act = 0;
    rows.forEach((r, i) => { if (r.getBoundingClientRect().top <= line) act = i; });
    rows.forEach((r, i) => { if (r.classList.contains("on") !== (i === act)) r.classList.toggle("on", i === act); });
    const T0 = Number(box.dataset.t0), T1 = Number(box.dataset.t1);
    const pc = (t) => (skClamp((t - T0) / (T1 - T0)) * 100);
    const r = rows[act];
    const b = cur.querySelector("b");
    if (r.dataset.a != null && r.dataset.a !== undefined && r.dataset.b != null) {
      const a = pc(Number(r.dataset.a)), e = pc(Number(r.dataset.b));
      if (hl) { hl.style.left = a.toFixed(2) + "%"; hl.style.width = Math.max(1, e - a).toFixed(2) + "%"; hl.style.opacity = "1"; }
      cur.style.left = ((a + e) / 2).toFixed(2) + "%";
      cur.classList.add("span");
      if (b) b.textContent = r.dataset.len || "";
    } else {
      const t = Number(r.dataset.t);
      if (hl) hl.style.opacity = "0";
      cur.classList.remove("span");
      cur.style.left = pc(t).toFixed(2) + "%";
      if (b) b.textContent = new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
  },

  /* ============================================================= LOGGER === */

  /* A night away, logged live. One thumb, big targets, and dim: the tab is
     drawn in ember while it runs. */
  _skJoelLogger(N, live) {
    const { sec, m } = N;
    const now = this._nowMs();
    const wl = live.wakeLog || [];
    const last = wl[wl.length - 1];
    const awake = !!live.awakeNow;
    const since = awake ? last.at : last ? last.back : live.from;
    const mins = Math.max(0, Math.round((now - since) / 60000));
    const T0 = (() => { const d = new Date(live.from); if (d.getHours() < 12) d.setDate(d.getDate() - 1); d.setHours(18, 0, 0, 0); return Math.min(d.getTime(), live.from); })();
    const T1 = T0 + 14 * 3600000;
    const x = (t) => skjPct(t, T0, T1);
    const segs = [];
    let prev = live.from;
    wl.forEach((w) => {
      segs.push(`<span class="b" style="left:${x(prev)}%;width:${Math.max(0.8, skClamp((w.at - prev) / (T1 - T0)) * 100).toFixed(2)}%"></span>`);
      const e = w.back == null ? now : w.back;
      segs.push(`<span class="b aw" style="left:${x(w.at)}%;width:${Math.max(0.8, skClamp((e - w.at) / (T1 - T0)) * 100).toFixed(2)}%"></span>`);
      prev = e;
    });
    if (!awake) segs.push(`<span class="b" style="left:${x(prev)}%;width:${Math.max(0.8, skClamp((now - prev) / (T1 - T0)) * 100).toFixed(2)}%"></span>`);
    const armed = this._skArmed;
    const undoArm = !wl.length;
    return `<div class="sk-jlog">
        ${this._skTitle(this._skTabName("joel"), `<span class="sk-status big">Away</span>`)}
        <div class="sk-jlstate">${awake ? "Awake" : wl.length ? "Back asleep" : "Asleep"}</div>
        <div class="sk-jltimer">${Math.floor(mins / 60)}<small>h</small> ${String(mins % 60).padStart(2, "0")}<small>m</small></div>
        <div class="sk-jlclock">${psEsc(skClk(now))} · down ${psEsc(skClk(live.from))}</div>
        <div class="sk-jribwrap"><div class="sk-jrib" role="img" aria-label="Tonight so far">${segs.join("")}<span class="now" style="left:${x(now)}%"></span></div>
          <div class="sk-jax"><span style="left:0">6p</span><span style="left:21.4%">9p</span><span style="left:42.9%">12a</span><span style="left:64.3%">3a</span><span style="left:85.7%">6a</span></div></div>
        <div class="sk-jtally">${wl.map((w) => `<span><ha-icon icon="mdi:door-open"></ha-icon>${psEsc(skClk(w.at).replace(/\s?[AP]M$/i, ""))}</span>`).join("")}</div>
        <button class="sk-jbig ${awake ? "sleep" : "wake"}" type="button" ${awake ? `data-jback="1"` : `data-jwoke="1"`}>
          <ha-icon icon="${awake ? "mdi:weather-night" : "mdi:door-open"}"></ha-icon>${awake ? "Back asleep" : "He woke"}<small>${awake ? `awake ${psHM(mins)}` : `wake ${wl.length + 1}`}</small></button>
        <div class="sk-btnrow">
          <button class="sk-bigbtn ${undoArm && armed === "jundo" ? "armed" : ""}" type="button" ${undoArm ? `data-jarm="jundo"` : `data-jundo="1"`}>
            <ha-icon icon="mdi:undo"></ha-icon>${undoArm ? (armed === "jundo" ? "Not bedtime?" : "Undo") : "Undo"}</button>
          <button class="sk-bigbtn ${armed === "jup" ? "armed" : ""}" type="button" data-jarm="jup"><ha-icon icon="mdi:white-balance-sunny"></ha-icon>${armed === "jup" ? "Tap again" : "Up for day"}</button>
        </div>
      </div>`;
  },

  /* ======================================================= CORRECTIONS === */

  /* The correction sheet, Skylight's way: the session on a track with its
     door trips, two handles that stop on them, the ±5 steppers kept for a
     thumb that prefers them, and — on a hand-logged night with nothing logged
     inside it — the wake-ups as a count, "?" until somebody says. */
  _napEditHtml() {
    const sec = this._nurserySection();
    const e = this._napEdit;
    const s = this._napEditSpan();
    if (!sec || !e || !s) return "";
    const d = this._napEditDefaults(s);
    if (!e.ax) {
      const pad = Math.max(20, Math.round(d.span * 0.12));
      e.ax = { lo: Math.max(d.lo, Math.min(0, e.from) - pad), hi: Math.min(d.hi, Math.max(d.span, e.to) + pad) };
    }
    const { lo, hi } = e.ax;
    const x = (mm) => skjPct(mm, lo, hi);
    const at = (mm) => psClock(s.from + mm * 60000);
    const derived = Math.max(0, d.to - d.from);
    const nowM = Math.max(0, e.to - e.from);
    const doors = (s.doorAt || s.events || []).map((t) => Math.round((t - s.from) / 60000)).filter((mm) => mm >= lo && mm <= hi);
    const countable = s.manual && s.night && !(s.wakeLog || []).length;
    const cur = "count" in e ? e.count : s.interventions == null ? null : { n: s.interventions, plus: !!s.wakesPlus };
    const key = (c) => (c == null ? "?" : c.plus ? `${c.n}+` : String(c.n));
    return `<div class="sk-jed">
        <div class="sk-jtrk" id="sk-jtrk" data-lo="${lo}" data-hi="${hi}" data-dlo="${d.lo}" data-dhi="${d.hi}" data-doors="${doors.join(",")}" data-from="${s.from}"
          role="group" aria-label="Drag either handle to set when he fell asleep and woke">
          <span class="base"></span>
          ${s.manual ? "" : `<span class="hs" style="left:${x(0)}%;width:${(+x(d.span) - +x(0)).toFixed(2)}%"></span>`}
          <span class="win${s.manual ? " man" : ""}" id="sk-jwin" style="left:${x(e.from)}%;width:${(+x(e.to) - +x(e.from)).toFixed(2)}%"></span>
          ${doors.map((mm) => `<span class="door" data-m="${mm}" style="left:${x(mm)}%"></span>`).join("")}
          <span class="hdl" id="sk-jha" style="left:${x(e.from)}%"><i></i></span>
          <span class="hdl" id="sk-jhb" style="left:${x(e.to)}%"><i></i></span>
          <span class="flag" id="sk-jflag"></span>
        </div>
        <div class="sk-jtiles">
          ${["from", "to"].map((f) => `<div class="sk-jtile">
            <button type="button" data-napstep="${f}:-5" aria-label="Five minutes earlier">−</button>
            <span><b id="sk-jt${f}">${psEsc(at(e[f]))}</b><small>${f === "from" ? (s.manual ? "down" : "fell asleep") : "woke"}</small></span>
            <button type="button" data-napstep="${f}:5" aria-label="Five minutes later">+</button></div>`).join("")}
        </div>
        <div class="sk-jsum"><b id="sk-jlen">${psEsc(psHM(nowM))}</b> asleep${nowM === derived ? "" : ` <span>· ${s.manual ? "logged" : s.edited ? "saved" : "derived"} ${psEsc(psHM(derived))}</span>`}</div>
        ${countable ? `<div class="sk-jcount"><ha-icon icon="mdi:door-open"></ha-icon><div class="sk-seg" role="tablist" aria-label="Wake-ups that night">${
          ["?", "0", "1", "2", "3+"].map((v) => `<button type="button" role="tab" data-jcount="${v}" aria-selected="${key(cur) === v}">${v}</button>`).join("")}</div></div>` : ""}
        <div class="sk-btnrow">
          <button class="sk-bigbtn pri" type="button" id="ps-nesave">Save</button>
          ${s.manual ? "" : `<button class="sk-bigbtn" type="button" id="ps-nenone">Didn't sleep</button>`}
          ${s.edited && !s.manual ? `<button class="sk-bigbtn" type="button" id="ps-nereset">Undo edit</button>` : ""}
          <button class="sk-bigbtn ${this._armed === "napdel" ? "armed" : ""}" type="button" data-arm="napdel">${this._armed === "napdel" ? "Tap again" : "Remove"}</button>
        </div>
      </div>`;
  },

  /* The drag. Nothing happens on the down; a clear sideways lead claims the
     gesture and a vertical one lets it go, so the sheet still scrolls. While
     dragging, the handle, the window and the labels are painted in place —
     a repaint would detach the node under the finger — and the release
     commits once. A cancel paints back what was there. */
  _skJBindTrack() {
    this._one("sk-jtrk", (trk) => {
      let st = null;
      const mOf = (ev) => {
        const r = trk.getBoundingClientRect();
        const lo = +trk.dataset.lo, hi = +trk.dataset.hi;
        return lo + skClamp((ev.clientX - r.left) / Math.max(1, r.width)) * (hi - lo);
      };
      const paint = (f, v) => {
        const root = this.shadowRoot;
        const lo = +trk.dataset.lo, hi = +trk.dataset.hi;
        const e = this._napEdit;
        const a = f === "from" ? v : e.from, b = f === "to" ? v : e.to;
        const win = root.getElementById("sk-jwin");
        if (win) { win.style.left = skjPct(a, lo, hi) + "%"; win.style.width = (+skjPct(b, lo, hi) - +skjPct(a, lo, hi)).toFixed(2) + "%"; }
        const h = root.getElementById(f === "from" ? "sk-jha" : "sk-jhb");
        if (h) { h.style.left = skjPct(v, lo, hi) + "%"; h.classList.add("on"); }
        const s0 = +trk.dataset.from;
        const t = root.getElementById("sk-jt" + f); if (t) t.textContent = psClock(s0 + v * 60000);
        const len = root.getElementById("sk-jlen"); if (len) len.textContent = psHM(Math.max(0, b - a));
        const fl = root.getElementById("sk-jflag"); if (fl) { fl.textContent = psClock(s0 + v * 60000); fl.style.left = skjPct(v, lo, hi) + "%"; fl.classList.add("on"); }
        trk.querySelectorAll(".door").forEach((dd) => dd.classList.toggle("hit", +dd.dataset.m === v));
      };
      /* Moves and the release are bound to the WINDOW for the life of the
         gesture: a mouse released off the track still ends it, and nothing
         here needs pointer capture. */
      const move = (ev) => {
        if (!st || ev.pointerId !== st.id) return;
        const dx = ev.clientX - st.x0, dy = ev.clientY - st.y0;
        if (!st.on) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { done(false)(); return; }
          if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy)) return;
          st.on = true;
          this._dragging = true;
        }
        if (ev.cancelable) ev.preventDefault();
        const e = this._napEdit;
        if (!e) return;
        let v = mOf(ev);
        const doors = String(trk.dataset.doors || "").split(",").filter(Boolean).map(Number);
        const near = doors.find((dd) => Math.abs(dd - v) <= 4);
        v = near != null ? near : Math.round(v / 5) * 5;
        v = Math.max(+trk.dataset.dlo, Math.min(+trk.dataset.dhi, v));
        if (st.f === "from") v = Math.min(v, e.to); else v = Math.max(v, e.from);
        if (v !== st.v) { if (near != null) pcHaptic("selection"); st.v = v; paint(st.f, v); }
      };
      const done = (commit) => () => {
        const s0 = st;
        st = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        this._dragging = false;
        if (!s0 || !s0.on) return;
        if (commit && s0.v != null && this._napEdit) this._napEdit = Object.assign({}, this._napEdit, { [s0.f]: s0.v });
        this._last = null;
        this._render();
      };
      const up = done(true), cancel = done(false);
      trk.addEventListener("pointerdown", (ev) => {
        if (!this._napEdit || (ev.button != null && ev.button > 0)) return;
        const mm = mOf(ev);
        const e = this._napEdit;
        st = { x0: ev.clientX, y0: ev.clientY, id: ev.pointerId, on: false, f: Math.abs(mm - e.from) <= Math.abs(mm - e.to) ? "from" : "to", v: null };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel);
      });
    });
  },

  /* ============================================================ BINDING === */

  _skJoelBind() {
    const go = (page, night) => {
      this._skJPage = page || null;
      if (night != null) this._skNight = night;
      this._sheet = null;
      this._render();
      const sc = this._skScroller();
      if (sc) sc.scrollTop = 0;
      this._skFrame();
    };
    this._each("[data-skjp]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      pcHaptic("light");
      go(el.dataset.skjp, el.dataset.jnight ? Number(el.dataset.jnight) : null);
    }));
    this._each("[data-jstep]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!el.dataset.jstep) return;
      pcHaptic("selection");
      go("walk", Number(el.dataset.jstep));
    }));
    this._each("[data-jaway]", (el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._awayToggle(el.dataset.jaway); }));
    this._each("[data-jnap]", (el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._manualStart("p"); }));
    this._each("[data-jbed]", (el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._manualStart("n"); }));
    this._each("[data-jstop]", (el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._manualStop(); }));
    this._each("[data-jwoke]", (el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._manualWoke(); }));
    this._each("[data-jback]", (el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._manualBack(); }));
    this._each("[data-jundo]", (el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._manualUndo(); }));
    /* Two taps for the two presses that end something: Up for day closes the
       night, and Undo with nothing logged withdraws the bedtime itself. */
    this._each("[data-jarm]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const k = el.dataset.jarm;
      if (this._skArmed === k) {
        clearTimeout(this._skArmT); this._skArmed = null;
        if (k === "jup") this._manualUp(); else if (k === "jundo") this._manualUndo();
        return;
      }
      pcHaptic("warning");
      this._skArmed = k;
      clearTimeout(this._skArmT);
      this._skArmT = setTimeout(() => { this._skArmed = null; this._render(); }, 5000);
      this._render();
    }));
    this._each("[data-jghost]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const [a, b] = el.dataset.jghost.split(":").map(Number);
      this._manualAdd(a, b, "p");
    }));
    /* "Like usual": every open "?" at once, written as one store update. */
    this._each("[data-jusual]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const sec = this._nurserySection();
      if (!sec || !this._manualStore(sec)) return;
      const add = el.dataset.jusual.split(",").filter(Boolean).map((p) => p.split(":").map(Number))
        .map(([a, b]) => ({ start: Math.round(a / 60000) * 60000, dur: Math.round((b - a) / 60000), kind: "p" }));
      pcHaptic("success");
      this._manualWrite(sec, this._manualEntries(sec).filter((x) => !add.some((y) => Math.abs(y.start - x.start) <= 60000)).concat(add));
    }));
    this._each("[data-jlognight]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const [a, b] = el.dataset.jlognight.split(":").map(Number);
      const at = Math.round(a / 60000) * 60000;
      this._manualAdd(a, b, "n");
      this._skJFix = { at, t: Date.now() };
      go("walk", at);
    }));
    this._each("[data-jfill]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._skFill = Object.assign({}, this._skFill || {}, { [el.dataset.jfill]: true });
      this._render();
    }));
    this._each("[data-jtl]", (el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._skJTl = el.dataset.jtl; this._render(); }));
    this._each("[data-jwk]", (el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._skJWk = el.dataset.jwk; this._render(); }));
    this._each("[data-jcount]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!this._napEdit) return;
      const v = el.dataset.jcount;
      pcHaptic("selection");
      this._napEdit = Object.assign({}, this._napEdit, { count: v === "?" ? null : { n: parseInt(v, 10), plus: /\+$/.test(v) } });
      this._last = null;
      this._render();
    }));
    this._skJBindTrack();
  },
});

/* NOTE: a template literal. No backticks anywhere in it. */
const SK_JOEL_STYLES = `
      /* ---- Joel (v1.105.0) ---- */
      .sk-jplace { margin-left: auto; height: 32px; padding: 0 13px 0 10px; border-radius: 18px; display: inline-flex; align-items: center; gap: 6px;
                   font-weight: 650; font-size: var(--pc-fs-md); background: var(--sk-card); border: 1px solid var(--sk-edge); box-shadow: var(--sk-shadow); color: var(--ps-muted); }
      .sk-jplace ha-icon { --mdc-icon-size: 16px; }
      .sk-jplace.away { color: var(--sk-r2); background: color-mix(in srgb, var(--sk-r2) 13%, var(--sk-card)); border-color: color-mix(in srgb, var(--sk-r2) 28%, transparent); }
      .sk-jlink { display: block; width: 100%; text-align: left; font: inherit; color: inherit; }
      .sk-jchev { margin-left: auto; align-self: center; color: var(--ps-dim); --mdc-icon-size: 20px; }
      .sk-wk.q { color: var(--ps-dim); }
      .sk-jback { color: var(--ps-deep); }
      .sk-bigbtn.lit { background: color-mix(in srgb, var(--sk-lamp) 18%, var(--sk-card2)); color: var(--sk-lamp); }

      /* ribbons: a time axis with blocks on it */
      .sk-jribwrap { margin-top: 18px; }
      .sk-jrib { position: relative; display: block; height: 14px; border-radius: 7px; background: var(--ps-track); }
      .sk-jrib.tall { height: 28px; border-radius: 10px; }
      .sk-jrib .b { position: absolute; top: 0; bottom: 0; padding: 0; border: 0; border-radius: inherit; background: linear-gradient(90deg, var(--sk-j2), var(--ps-deep)); }
      .sk-jrib .b.nap { background: var(--sk-j2); }
      .sk-jrib .b.man { background: color-mix(in srgb, var(--ps-deep) 14%, transparent); box-shadow: inset 0 0 0 2px var(--ps-deep); }
      .sk-jrib .b.nap.man { background: color-mix(in srgb, var(--sk-j2) 16%, transparent); box-shadow: inset 0 0 0 2px var(--sk-j2); }
      .sk-jrib .b.live { animation: skjpulse 2s ease-in-out infinite; }
      .sk-jrib .b.aw { background: var(--sk-visit); }
      .sk-jrib .b.ghost { background: transparent; border: 1.5px dashed var(--ps-dim); box-shadow: none; display: grid; place-items: center;
                          color: var(--ps-dim); font-weight: 700; font-size: var(--pc-fs-xs); }
      .sk-jrib .b.ghost.still { pointer-events: none; opacity: .7; }
      .sk-num.q { color: var(--ps-dim); }
      .sk-jrib .b.ghost.night { border-color: color-mix(in srgb, var(--ps-deep) 55%, transparent); }
      .sk-jrib .b .dl { position: absolute; inset: 0; display: grid; place-items: center; font-size: var(--pc-fs-micro); font-weight: 700; color: #fff; white-space: nowrap; pointer-events: none; }
      .sk-jrib .b.man .dl { color: var(--ps-deep); }
      .sk-jrib .now { position: absolute; top: -6px; bottom: -6px; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--ps-text); }
      .sk-jrib .fut { position: absolute; top: 0; bottom: 0; right: 0; border-radius: 0 10px 10px 0; background: var(--sk-card); opacity: .5; pointer-events: none; }
      .sk-jrib .k { position: absolute; top: -4px; bottom: -4px; width: 3px; margin-left: -1.5px; border-radius: 2px; background: var(--sk-visit); pointer-events: none; }
      .sk-jrib .g, .sk-napbar .g { position: absolute; top: -6px; bottom: -6px; width: 0; margin-left: -.75px; border-left: 1.5px dashed var(--ps-dim); opacity: .5; pointer-events: none; }
      .sk-jrib .hz { position: absolute; top: 0; bottom: 0; border-radius: inherit; background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 7px); box-shadow: inset 0 0 0 1px var(--ps-track); }
      .sk-jrib .fill { position: absolute; inset: -8px 0; display: grid; place-items: center; padding: 0; border: 0; background: none; }
      .sk-jrib .fill span { padding: 2px 10px; border-radius: 10px; background: var(--sk-card); box-shadow: var(--sk-shadow); font-size: var(--pc-fs-xs); font-weight: 650; color: var(--ps-muted); }
      .sk-jax { position: relative; display: block; height: 16px; margin-top: 6px; font-size: var(--pc-fs-xs); font-weight: 550; color: var(--ps-dim); }
      .sk-jax span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
      .sk-jax span:first-child { transform: none; } .sk-jax span:last-child { transform: translateX(-100%); }
      @keyframes skjpulse { 50% { opacity: .55; } }
      .sk-napbar .seg.man { background: color-mix(in srgb, var(--sk-j2) 16%, transparent); box-shadow: inset 0 0 0 2px var(--sk-j2); }

      /* the week, small */
      .sk-jwns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
      .sk-jwn { display: flex; flex-direction: column; gap: 2px; }
      .sk-jwn b { font-size: var(--pc-fs-2xl); font-weight: 350; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
      .sk-jwn b small { font-size: .6em; color: var(--ps-muted); margin: 0 2px 0 1px; }
      .sk-jwn span { font-size: var(--pc-fs-sm); color: var(--ps-dim); font-weight: 550; }
      .sk-jwn.v b { color: var(--sk-visit); }

      /* weeks */
      .sk-jseg { margin: 2px 0 2px; }
      .sk-jseg button { font-size: var(--pc-fs-md); }
      .sk-jwk.old { opacity: .7; }
      .sk-jwkn { display: block; margin-top: 6px; font-size: var(--pc-fs-4xl); }
      .sk-jcols { position: relative; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; height: 96px; margin-top: 14px; }
      .sk-jcols.tall { height: 170px; }
      .sk-jcols .col { position: relative; border-radius: 8px; background: var(--sk-card2); overflow: hidden; }
      .sk-jcols .col.unseen { background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 7px); }
      .sk-jcols .col.future { background: transparent; box-shadow: inset 0 0 0 1px var(--ps-track); }
      .sk-jcols .col em { position: absolute; inset: 0; display: grid; place-items: center; font-style: normal; font-weight: 700; color: var(--ps-dim); }
      .sk-jcols .bar { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 8px; background: linear-gradient(0deg, var(--sk-j2), var(--ps-deep)); }
      .sk-jcols .bar.naps { background: var(--sk-j2); }
      .sk-jcols .bar.wakes { background: var(--sk-visit); }
      .sk-jcols .bar.man { background: color-mix(in srgb, var(--ps-deep) 14%, transparent); box-shadow: inset 0 0 0 2px var(--ps-deep); }
      .sk-jcols .dot { position: absolute; left: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--ps-deep); }
      .sk-jcols .dot.man { background: var(--sk-card); box-shadow: inset 0 0 0 2.5px var(--ps-deep); }
      .sk-jcols .nb { position: absolute; left: 3px; right: 3px; border-radius: 6px; background: var(--sk-j2); }
      .sk-jcols .nb.man { background: color-mix(in srgb, var(--sk-j2) 16%, transparent); box-shadow: inset 0 0 0 2px var(--sk-j2); }
      .sk-jcols .ref { position: absolute; left: -4px; right: -4px; height: 0; border-top: 2px dashed var(--ps-text); opacity: .45; pointer-events: none; }
      .sk-jdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; margin-top: 6px; font-size: var(--pc-fs-xs); font-weight: 600; color: var(--ps-dim); text-align: center; }

      /* timeline */
      .sk-jbanner { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; border-radius: 24px; font-weight: 650; font-size: var(--pc-fs-md);
                    color: var(--sk-r2); background: color-mix(in srgb, var(--sk-r2) 12%, var(--sk-card)); border: 1px solid color-mix(in srgb, var(--sk-r2) 26%, transparent); }
      .sk-jbanner ha-icon { --mdc-icon-size: 18px; }
      .sk-jbanner button { margin-left: auto; height: 40px; padding: 0 16px; border-radius: 20px; background: var(--sk-r2); color: #fff; font-weight: 650; font-size: var(--pc-fs-md); display: inline-flex; align-items: center; gap: 6px; }
      .sk-jbanner button ha-icon { --mdc-icon-size: 16px; }
      .sk-jtlcard { padding: 12px 8px 14px; }
      .sk-jlg { display: flex; flex-wrap: wrap; gap: 12px; padding: 0 8px 6px; font-size: var(--pc-fs-xs); font-weight: 550; color: var(--ps-dim); }
      .sk-jlg span { display: inline-flex; align-items: center; gap: 6px; }
      .sk-jlg i { width: 18px; height: 10px; border-radius: 5px; }
      .sk-jlg i.h { background: linear-gradient(90deg, var(--sk-j2), var(--ps-deep)); }
      .sk-jlg i.m { box-shadow: inset 0 0 0 2px var(--ps-deep); }
      .sk-jlg i.u { background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 7px); box-shadow: inset 0 0 0 1px var(--ps-track); }
      .sk-jlg i.k { width: 3px; height: 14px; border-radius: 2px; background: var(--sk-visit); }
      .sk-tl { display: grid; grid-template-columns: 44px minmax(0, 1fr) 60px; align-items: center; gap: 8px; min-height: 40px; padding: 0 6px; }
      .sk-tl.ax { min-height: 20px; }
      .sk-tl.ax .sk-jax { margin-top: 0; }
      .sk-tl .d { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.1; padding: 4px 0; text-align: left; font: inherit; color: inherit; }
      .sk-tl .d b { font-size: var(--pc-fs-md); font-weight: 650; color: var(--ps-text); }
      .sk-tl .d small { font-size: var(--pc-fs-xs); font-weight: 500; color: var(--ps-dim); }
      .sk-tl .d.td b { color: var(--ps-deep); } .sk-tl .d.away b { color: var(--sk-r2); }
      .sk-tl .v { font-size: var(--pc-fs-md); font-weight: 650; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .sk-tl .v small { display: block; font-size: var(--pc-fs-xs); font-weight: 500; color: var(--ps-dim); }
      .sk-tl .v.q { color: var(--ps-dim); }
      .sk-jwkh { display: flex; align-items: center; gap: 8px; padding: 14px 6px 6px; font-size: var(--pc-fs-xs); font-weight: 650; letter-spacing: .06em; text-transform: uppercase; color: var(--ps-dim); }
      .sk-jwkh i { flex: 1; height: 1px; background: var(--sk-edge); }
      .sk-jwkh b { font-size: var(--pc-fs-lg); font-weight: 600; letter-spacing: -.01em; text-transform: none; color: var(--ps-text); }
      .sk-jwkh .ps-chip { text-transform: none; letter-spacing: 0; }
      .sk-jdens { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--ps-track); }
      .sk-jdens i { flex: 1; background: var(--ps-deep); }

      /* the walk */
      .sk-jstep { display: inline-flex; align-items: center; gap: 0; }
      .sk-jstep .sk-hn { min-width: 84px; text-align: center; }
      .sk-jstep button { width: 34px; height: 34px; border-radius: 17px; display: grid; place-items: center; color: var(--ps-muted); }
      .sk-jstep button:disabled { opacity: .3; }
      .sk-jstep ha-icon { --mdc-icon-size: 20px; }
      .sk-hl { position: absolute; top: 17px; height: 24px; left: 0; width: 0; border-radius: 10px; box-shadow: 0 0 0 2px var(--ps-text); opacity: 0; pointer-events: none;
               transition: left .45s cubic-bezier(.2,.8,.2,1), width .45s cubic-bezier(.2,.8,.2,1), opacity .3s; }
      .sk-cursor.span::before { opacity: 0; }
      .sk-ev.st { height: 44px; }
      .sk-ev.st::before { width: 4px; left: 21px; background: color-mix(in srgb, var(--sk-j2) 45%, var(--ps-track)); }
      .sk-ev.st .dot { visibility: hidden; }
      .sk-ev.st .tm { font-size: var(--pc-fs-lg); font-weight: 600; }
      .sk-ev.st.on { color: var(--ps-deep); } .sk-ev.st.on::before { background: var(--ps-deep); }
      .sk-ev.st.unseen::before { background: repeating-linear-gradient(180deg, var(--ps-track) 0 4px, transparent 4px 8px); }
      .sk-ev.st.unseen.on { color: var(--ps-muted); }
      .sk-best { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; margin-left: 8px; border-radius: 11px; vertical-align: 2px;
                 background: color-mix(in srgb, var(--ps-deep) 14%, var(--sk-card)); color: var(--ps-deep); font-size: var(--pc-fs-xs); font-weight: 650; }

      /* the night logger */
      .sk-jlog { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; }
      .sk-jlstate { margin-top: 10px; font-size: var(--pc-fs-lg); color: var(--ps-muted); font-weight: 550; }
      .sk-jltimer { font-size: var(--pc-fs-5xl); font-weight: 200; letter-spacing: -.05em; line-height: 1; font-variant-numeric: tabular-nums; }
      .sk-jltimer small { font-size: .38em; font-weight: 400; letter-spacing: 0; color: var(--ps-muted); margin-left: 2px; }
      .sk-jlclock { font-size: var(--pc-fs-md); color: var(--ps-dim); font-weight: 550; }
      .sk-jtally { display: flex; flex-wrap: wrap; gap: 8px; min-height: 30px; margin-top: 8px; }
      .sk-jtally span { height: 30px; padding: 0 11px; border-radius: 15px; display: inline-flex; align-items: center; gap: 6px; background: var(--sk-card2); color: var(--sk-visit); font-weight: 650; font-size: var(--pc-fs-sm); }
      .sk-jtally ha-icon { --mdc-icon-size: 14px; }
      .sk-jbig { width: 100%; height: 220px; margin-top: 14px; border-radius: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
                 font-size: var(--pc-fs-2xl); font-weight: 650; }
      .sk-jbig ha-icon { --mdc-icon-size: 44px; }
      .sk-jbig small { font-size: var(--pc-fs-lg); font-weight: 550; opacity: .8; }
      .sk-jbig.wake { background: color-mix(in srgb, var(--sk-visit) 22%, var(--sk-card)); color: var(--sk-visit); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--sk-visit) 40%, transparent); }
      .sk-jbig.sleep { background: color-mix(in srgb, var(--ps-deep) 24%, var(--sk-card)); color: var(--sk-j2); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--ps-deep) 40%, transparent); }
      .sk-jbig:active { transform: scale(.98); }
      :host([data-sk-ember]) {
        --sk-bg: #07060A; --sk-card: #120E12; --sk-card2: #1B1418; --sk-edge: rgba(255,140,100,.07);
        --sk-bar: rgba(7,6,10,.86); --sk-dock: rgba(20,14,16,.90);
        --ps-text: #F2C6B4; --ps-muted: #C08F80; --ps-dim: #9A7466; --ps-track: rgba(255,140,100,.12);
        --ps-deep: #C85A3A; --sk-j2: #F0A07E; --sk-visit: #FFB36B; --sk-r2: #C08F80;
      }

      /* the correction sheet */
      .sk-jed { display: flex; flex-direction: column; gap: 4px; }
      .sk-jtrk { position: relative; height: 86px; margin: 8px 8px 0; touch-action: pan-y; user-select: none; -webkit-user-select: none; cursor: ew-resize; }
      .sk-jtrk .base { position: absolute; left: 0; right: 0; top: 36px; height: 14px; border-radius: 7px; background: var(--ps-track); }
      .sk-jtrk .hs { position: absolute; top: 36px; height: 14px; border-radius: 7px; background: color-mix(in srgb, var(--sk-j2) 30%, var(--ps-track)); }
      .sk-jtrk .win { position: absolute; top: 30px; height: 26px; border-radius: 9px; background: linear-gradient(90deg, var(--sk-j2), var(--ps-deep)); }
      .sk-jtrk .win.man { background: color-mix(in srgb, var(--ps-deep) 16%, transparent); box-shadow: inset 0 0 0 2px var(--ps-deep); }
      .sk-jtrk .door { position: absolute; top: 16px; width: 2px; height: 50px; margin-left: -1px; border-radius: 1px; background: var(--sk-visit); }
      .sk-jtrk .door::before { content: ""; position: absolute; top: -5px; left: -3px; width: 8px; height: 8px; border-radius: 50%; background: var(--sk-visit); }
      .sk-jtrk .door.hit::before { box-shadow: 0 0 0 5px color-mix(in srgb, var(--sk-visit) 30%, transparent); }
      .sk-jtrk .hdl { position: absolute; top: 21px; width: 44px; height: 44px; margin-left: -22px; display: grid; place-items: center; pointer-events: none; }
      .sk-jtrk .hdl i { width: 20px; height: 42px; border-radius: 10px; background: var(--sk-card); border: 3px solid var(--ps-deep); box-shadow: 0 6px 16px -6px rgba(16,24,40,.4); }
      .sk-jtrk .hdl.on i { transform: scale(1.12); }
      .sk-jtrk .flag { position: absolute; top: -4px; transform: translateX(-50%); padding: 2px 8px; border-radius: 9px; background: var(--ps-text); color: var(--sk-card);
                       font-size: var(--pc-fs-sm); font-weight: 650; white-space: nowrap; pointer-events: none; opacity: 0; }
      .sk-jtrk .flag.on { opacity: 1; }
      .sk-jtiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
      .sk-jtile { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px; border-radius: 20px; background: var(--sk-card2); }
      .sk-jtile > span { grid-row: 1; grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; }
      .sk-jtile b { font-size: var(--pc-fs-lg); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .sk-jtile small { font-size: var(--pc-fs-xs); color: var(--ps-dim); font-weight: 550; }
      .sk-jtile button { grid-row: 2; width: 100%; height: 36px; display: grid; place-items: center; border-radius: 18px; background: var(--sk-card); color: var(--ps-muted); font-weight: 700; font-size: var(--pc-fs-xl); }
      .sk-jsum { margin-top: 10px; font-size: var(--pc-fs-lg); color: var(--ps-muted); }
      .sk-jsum b { color: var(--ps-text); font-weight: 650; }
      .sk-jsum span { color: var(--ps-dim); }
      .sk-jcount { display: flex; align-items: center; gap: 10px; margin-top: 12px; color: var(--sk-visit); }
      .sk-jcount .sk-seg { flex: 1; }
      .sk-jcount .sk-seg button[aria-selected="true"] { color: var(--sk-visit); }
`;
