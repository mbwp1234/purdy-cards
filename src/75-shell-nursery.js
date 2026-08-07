/* Nursery — sleep derived from the Hatch and the door, not from a wearable.
 *
 * The Owlet sock guessed at sleep state and every consumer of it inherited the
 * guess: a settling stir counted as a wakeup, waking for the day counted as a
 * wakeup, and a three-minute dropout restarted the night. All three were
 * heuristics standing in for a fact nobody could observe.
 *
 * Here the facts are observable. The sound machine is only ever on when sleep
 * is intended — they sit in his room awake, but never with it running — so a
 * `playing` span IS the session, start and end both. The door is who went in.
 *
 * Nothing is persisted. Sessions, durations, start times and intervention
 * counts are all derived from recorder history of two entities, which means a
 * bug in the derivation is fixed by editing this file and the PAST recomputes.
 * That was never true of `input_number.joel_wakeups_last_night`.
 */

/* Local YYYY-MM-DD. Not toISOString(), which is UTC and rolls the day over at
   the wrong moment for anyone west of Greenwich — an 8pm bedtime would file
   itself under tomorrow. */
function psDayKey(d) {
  const p = (n) => (n < 10 ? "0" + n : "" + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function psHM(mins) {
  if (mins == null || !Number.isFinite(mins)) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function psClock(t) {
  if (t == null) return "—";
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/* Derive sessions from the Hatch's playing spans, and interventions from door
   opens that fall inside them.
 *
 * Every threshold here earns its place against observed data:
 *
 *  - merge_gap_min   The Hatch can auto-off or be bumped mid-night. Two spans
 *                    separated by less than this are one night, not two. A
 *                    momentary `unavailable` closes a span too, so this also
 *                    absorbs connectivity blips. **A gap containing a door
 *                    event is never merged**, however short — that is someone
 *                    getting him up, which is a real boundary. Without that,
 *                    a 20-minute nap, twelve minutes awake and the next nap
 *                    fused into one bogus 50-minute session.
 *  - min_session_min Drops a Hatch switched on and straight off again. A run
 *                    that is STILL going is never dropped, however short — that
 *                    is a session in progress, not a stray.
 *  - door_min_sec    Mounting the sensor produced ten transitions in 34
 *                    seconds, five of them under 300ms. A magnet settling is
 *                    not a person; a person holds a door open for seconds.
 *  - door_merge_sec  Going in and coming out is one visit. Without this, every
 *                    intervention counts twice — in and out — which is the same
 *                    double-count the sock's 30-minute cooldown existed to stop.
 *  - exit_window_min The put-down. Someone has to be IN the room to start the
 *                    Hatch, so the first door-open of a session is almost
 *                    always them leaving — and counting it made every session
 *                    read one intervention high, which is the sock's settling
 *                    stir wearing a different hat. It is not discarded: the
 *                    door closing behind them is the moment he is actually
 *                    alone, so it becomes `settledAt`, and the gap from bedtime
 *                    to it is settling time. Bounded, because a first entry
 *                    three hours in is a real intervention, not an exit.
 */
function psNurserySessions(hatch, door, opts) {
  const o = opts || {};
  const doorMin = (o.door_min_sec == null ? 2 : o.door_min_sec) * 1000;
  const doorMerge = (o.door_merge_sec == null ? 60 : o.door_merge_sec) * 1000;
  const nightAfter = o.night_after_hour == null ? 18 : o.night_after_hour;
  const morning = o.morning_hour == null ? 5 : o.morning_hour;
  const now = o.now == null ? Date.now() : o.now;

  /* Setting a contact sensor up, and switching the sound machine on to see
     what it reports, both look exactly like sleep to this function — the
     commissioning session read as a 40-minute nap with three interventions
     and would have skewed a week of averages. `ignore_before` draws a line
     under that without purging the recorder, which is destructive and takes
     the real data with it. Useful again any time a sensor is re-sited.
     An unparseable value is ignored rather than silently hiding everything. */
  const cut = o.ignore_before == null ? null : (() => {
    const v = typeof o.ignore_before === "number"
      ? o.ignore_before : Date.parse(o.ignore_before);
    return Number.isFinite(v) ? v : null;
  })();

  /* A nap and a night are not the same event at different lengths — they need
     their own numbers. Naps here run as short as twenty minutes, so a single
     45-minute exit window was longer than the whole nap: every door open would
     have been swallowed as the put-down and a short nap could never report an
     intervention at all. One set of thresholds cannot serve both. */
  const NAP = { min_session_min: 8, exit_window_min: 25, merge_gap_min: 5 };
  const NIGHT = { min_session_min: 20, exit_window_min: 30, merge_gap_min: 20 };
  const isNight = (t) => {
    const hr = new Date(t).getHours();
    return hr >= nightAfter || hr < morning;
  };
  /* Per-kind config wins, then a flat top-level override, then the default —
     so `nap: {exit_window_min: 4}` tunes one without disturbing the other. */
  const rule = (t, key) => {
    const kind = isNight(t) ? "night" : "nap";
    const scoped = o[kind] || {};
    const base = kind === "night" ? NIGHT : NAP;
    const v = scoped[key] != null ? scoped[key] : (o[key] != null ? o[key] : base[key]);
    return v * 60000;
  };

  /* 1 — door opens first: the merge step needs them */
  const opens = [];
  let dOpen = null;
  (door || []).forEach((p) => {
    if (p.s === "on") {
      if (dOpen == null) dOpen = p.t;
    } else if (dOpen != null) {
      opens.push({ from: dOpen, to: p.t });
      dOpen = null;
    }
  });
  if (dOpen != null) opens.push({ from: dOpen, to: now, held: true });
  const realOpens = opens.filter((op) => op.held || op.to - op.from >= doorMin);

  /* 2 — raw playing spans */
  const spans = [];
  let openAt = null;
  (hatch || []).forEach((p) => {
    if (p.s === "playing") {
      if (openAt == null) openAt = p.t;
    } else if (openAt != null) {
      spans.push({ from: openAt, to: p.t });
      openAt = null;
    }
  });
  if (openAt != null) spans.push({ from: openAt, to: now, active: true });

  /* 3 — merge across short gaps, but NEVER across a door event. Someone going
     in is the boundary: the Hatch stopping on its own with nobody entering is
     one session interrupted, whereas a door open in the gap means he was got
     up. Judging the gap by time alone fused a nap, twelve minutes awake and
     the next nap into one session. */
  const merged = [];
  spans.forEach((s) => {
    const last = merged[merged.length - 1];
    const gap = last ? s.from - last.to : Infinity;
    const entered = last && realOpens.some((op) => op.from >= last.to && op.from <= s.from);
    if (last && gap < rule(s.from, "merge_gap_min") && !entered) {
      last.to = s.to;
      if (s.active) last.active = true;
      last.splits = (last.splits || 1) + 1;
    } else {
      merged.push({ from: s.from, to: s.to, active: s.active, splits: 1 });
    }
  });

  /* 4 — drop strays, never drop a run in progress; then anything before the
     commissioning cut. A session STILL RUNNING is kept regardless — it is
     happening now, whatever the cut says about history. */
  const kept = merged
    .filter((s) => s.active || s.to - s.from >= rule(s.from, "min_session_min"))
    .filter((s) => s.active || cut == null || s.from >= cut);

  /* 5 — attach interventions and classify */
  return kept.map((s) => {
    const exitWindow = rule(s.from, "exit_window_min");
    /* Every door event inside the session that survives the chatter filter,
       before deciding which of them is the exit. */
    const inside = realOpens.filter((op) => op.from >= s.from && op.from <= s.to);

    /* The put-down: everything up to the LAST door event within the window is
     * settling, and its close is when he was left alone.
     *
     * Two earlier rules failed against real settles. "The first door-open is
     * them leaving" banked her ARRIVAL as the exit — the door was already open
     * when the Hatch went on and closed at 10:07:31 with her inside. Then
     * "settling ends at the first close followed by quiet" failed too: she sat
     * with him for fourteen silent minutes, and from door events alone that
     * quiet is indistinguishable from the quiet after she leaves. Only what
     * happens NEXT tells them apart, so no forward-looking gap rule works.
     *
     * The window swallows an intervention that lands inside it, and that is
     * deliberate rather than tolerated: an early intervention means he had not
     * started the nap yet, so it belongs to settling. Settling here typically
     * runs 10-20 minutes, hence the generous default. */
    let settledAt = s.from;
    let hadExit = false;
    let i = 0;
    while (i < inside.length && inside[i].from - s.from <= exitWindow) {
      settledAt = Math.min(inside[i].to, s.to);
      hadExit = true;
      i += 1;
    }

    const events = [];
    /* Seeded from the last settling event so a straight-back-in within the
       merge window is part of leaving, not a first intervention. */
    let lastCounted = hadExit ? inside[i - 1].from : -Infinity;
    inside.slice(i).forEach((op) => {
      if (op.from - lastCounted < doorMerge) return;
      lastCounted = op.from;
      events.push(op.from);
    });

    const started = new Date(s.from);
    const hr = started.getHours();
    const night = hr >= nightAfter || hr < morning;
    /* A night that began after midnight belongs to the evening it started
       from, or "last night" would point at the wrong date all morning. */
    const anchor = new Date(s.from);
    if (night && hr < morning) anchor.setDate(anchor.getDate() - 1);

    return {
      from: s.from,
      to: s.to,
      active: !!s.active,
      splits: s.splits || 1,
      minutes: Math.max(0, Math.round((s.to - s.from) / 60000)),
      night,
      day: psDayKey(anchor),
      interventions: events.length,
      events,
      /* Three different quantities, kept apart because they answer different
         questions and only one of them is "how long did he sleep":
           minutes       the whole Hatch span — time in the sleep environment
           settleMinutes Hatch-on to the door shutting behind them
           asleepMinutes from being left alone to the end
         settledAt is when they LEFT, which is not exactly when he dropped off
         — he may well have gone under while they were still in the room — so
         asleepMinutes is a lower bound and minutes an upper one. The card
         shows the lower bound and names the settling beside it rather than
         quietly folding an ambiguous quarter of an hour into "slept". */
      settledAt,
      settleMinutes: Math.max(0, Math.round((settledAt - s.from) / 60000)),
      asleepMinutes: Math.max(0, Math.round((s.to - settledAt) / 60000)),
      hadExit,
    };
  });
}

Object.assign(PurdyShellCard.prototype, {

  /* A longer window than the shared 26h fetch, because this section is about
     comparing days. Kept as its own request rather than widening the shared
     one: the graphs and room sparklines have no use for a week of data, and
     two entities over seven days is a far smaller query than nine over one. */
  _nurserySection() {
    return (this._config.sections || []).find((s) => s.type === "nursery");
  },

  _startNursery() {
    const sec = this._nurserySection();
    if (!sec) return;
    const run = () => this._fetchNursery();
    run();
    if (this._nurseryTimer) clearInterval(this._nurseryTimer);
    this._nurseryTimer = setInterval(run, (this._config.history_refresh_minutes || 5) * 60 * 1000);
  },

  async _fetchNursery() {
    const sec = this._nurserySection();
    if (!sec || !this._hass || !this._hass.callApi) return;
    const ids = [sec.hatch, sec.door].filter(Boolean);
    if (!ids.length) return;
    const days = sec.days || 7;
    const start = new Date(Date.now() - days * 86400000).toISOString();
    try {
      const res = await this._hass.callApi(
        "GET",
        /* end_time is NOT optional. Without it the recorder defaults to
           start + 1 DAY, so a seven-day window would quietly stop six days
           ago and the newest sample would stretch to the right-hand edge.
           See pcNowIso() in 05-shared.js. */
        `history/period/${start}?filter_entity_id=${ids.join(",")}` +
        `&end_time=${encodeURIComponent(pcNowIso())}&minimal_response&no_attributes`
      );
      const hist = {};
      (res || []).forEach((series) => {
        if (!series || !series.length) return;
        const id = series[0].entity_id;
        if (!id) return;
        hist[id] = series
          .map((p) => ({ t: new Date(p.last_changed || p.last_updated).getTime(), s: p.state }))
          .filter((p) => Number.isFinite(p.t))
          .sort((a, b) => a.t - b.t);
      });
      this._nursery = hist;
      this._nurseryErr = null;
      this._last = null;
      this._render();
    } catch (e) {
      this._nurseryErr = (e && e.message) || "recorder did not answer";
      this._last = null;
      this._render();
    }
  },

  _nurserySessions(sec) {
    const h = this._nursery || {};
    return psNurserySessions(h[sec.hatch], h[sec.door], sec);
  },

  /* The hypnogram's counterpart. The sock drew sleep stages; there are none
     here, so this draws the shape of the day instead — where the sessions sat,
     which were nights and which naps, and where someone went in.
   *
     Deliberately NOT folded together with `_hypnoSvg`: they are the same size
     and both are bars on a time axis, but that one samples a state series and
     this one plots intervals with point events on top. Merging them would mean
     picking one model and changing how the other view reads — the same reason
     the hypnogram and the sleep card's graph were left apart. */
  _nurseryTimeline(night, loaded, err) {
    const PAD = 3;
    /* The night only. Naps are two twenty-minute bars in a 24-hour axis —
       slivers carrying no shape, and their numbers are already in the rows
       below. The old sock card drew one night for the same reason. */
    if (!loaded || err || !night) {
      const msg = err ? "Recorder did not answer"
        : !loaded ? "Loading…" : "No night recorded yet";
      return `<div class="ps-hyp">
          <div class="ps-hypt"><span class="ps-lbl">Night</span></div>
          <div class="ps-nohist">${psEsc(msg)}</div>
        </div>`;
    }

    const from = night.from;
    const to = night.to;
    const span = Math.max(60000, to - from);
    const x = (t) => PAD + ((t - from) / span) * (100 - PAD * 2);

    /* Two segments, because they mean different things: the settling phase
       before he was left alone, then the night proper. */
    const sx = x(night.settledAt);
    let bars = `<rect x="${PAD}" y="12" width="${Math.max(0.4, sx - PAD).toFixed(2)}"
        height="22" rx="2" fill="var(--ps-light)" opacity="0.55"/>
      <rect x="${sx.toFixed(2)}" y="8" width="${Math.max(0.4, (100 - PAD) - sx).toFixed(2)}"
        height="30" rx="2" fill="var(--ps-deep)" opacity="${night.active ? 0.95 : 0.8}"/>`;

    let ticks = "";
    night.events.forEach((t) => {
      ticks += `<rect x="${(x(t) - 0.35).toFixed(2)}" y="4" width="0.7" height="38"
        rx="0.3" fill="var(--ps-warn)"/>`;
    });

    /* An hourly gridline, so the eye can place a tick without an axis. */
    let grid = "";
    const hours = span / 3600000;
    if (hours >= 2) {
      const step = hours > 8 ? 2 : 1;
      for (let h = step; h < hours; h += step) {
        const gx = x(from + h * 3600000);
        grid += `<line x1="${gx.toFixed(2)}" y1="2" x2="${gx.toFixed(2)}" y2="44"
          stroke="var(--ps-line)" stroke-width="0.25"/>`;
      }
    }

    const fmt = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `<div class="ps-hyp">
        <div class="ps-hypt">
          <span class="ps-lbl">${night.active ? "Tonight" : "Last night"}</span>
          <span><i style="background:var(--ps-light);opacity:.55"></i>settling<i style="background:var(--ps-deep);margin-left:9px"></i>asleep</span>
          <b>${night.interventions} in</b>
        </div>
        <svg viewBox="0 0 100 46" preserveAspectRatio="none" aria-hidden="true">
          ${grid}${bars}${ticks}
        </svg>
        <div class="ps-hypt"><span>${psEsc(fmt(from))}</span><span>${psEsc(night.active ? "now" : fmt(to))}</span></div>
      </div>`;
  },

  _secNursery(sec) {
    const h = this._hass;
    const playing = pcState(h, sec.hatch) === "playing";
    const doorOpen = pcState(h, sec.door) === "on";

    /* "The recorder has not answered yet" and "he has never slept" are
       different facts and must not render the same. */
    const loaded = !!this._nursery;
    const sessions = loaded ? this._nurserySessions(sec) : [];
    const err = this._nurseryErr;

    const live = sessions.find((s) => s.active);
    const past = sessions.filter((s) => !s.active);
    const lastNight = [...past].reverse().find((s) => s.night) || null;

    const todayKey = psDayKey(new Date());
    const todayNaps = sessions.filter((s) => !s.night && s.day === todayKey);
    /* Sleep totals exclude settling everywhere — the ring, the chips, the day
   rows and the averages all mean the same thing as a result. */
    const napMins = todayNaps.reduce((a, s) => a + s.asleepMinutes, 0);

    /* Chip: what is true right now, not what the history says. */
    let chipCls = "";
    let chipTxt = "Hatch off";
    if (playing) {
      chipCls = "deep";
      chipTxt = live
        ? (live.hadExit ? `Asleep ${psHM(live.asleepMinutes)}` : `Settling ${psHM(live.minutes)}`)
        : "Asleep";
    } else if (doorOpen) {
      chipCls = "warn";
      chipTxt = "Door open";
    }

    /* Hero — the run in progress if there is one, otherwise last night. */
    const hero = live || lastNight;
    const heroLabel = live ? (live.night ? "Tonight" : "Nap") : "Last night";
    const heroSub = hero
      ? `${psClock(hero.from)} → ${hero.active ? "now" : psClock(hero.to)}`
      : (err ? "recorder did not answer" : loaded ? "no session recorded" : "loading…");

    const wifiOk = !sec.hatch_wifi || pcState(h, sec.hatch_wifi) === "on";

    /* Naps are their own list, because the questions asked of them are
       different from the ones asked of a night: how long, when did it start,
       when did it end, and how many were there. No settling column — for a
       fifty-minute nap that is noise beside the number that matters. */
    const napRows = todayNaps.length
      ? todayNaps.slice().reverse().map((s) => `
          <div class="ps-jr">
            <span class="ps-l">${psClock(s.from)} – ${s.active ? "now" : psClock(s.to)}</span>
            <span class="ps-v">${psHM(s.asleepMinutes)}${s.active ? " …" : ""}</span>
            <span class="ps-flat">${s.interventions ? `${s.interventions} in` : ""}</span>
          </div>`).join("")
      : `<div class="ps-jr"><span class="ps-l">No naps yet today</span></div>`;

    /* Recent days. A day with no night recorded still gets a row — an absent
       night is information, and skipping it would silently shorten the list. */
    const byDay = new Map();
    sessions.forEach((s) => {
      if (!byDay.has(s.day)) byDay.set(s.day, { night: null, naps: 0, napMins: 0, ins: 0 });
      const d = byDay.get(s.day);
      if (s.night) d.night = s;
      else { d.naps += 1; d.napMins += s.asleepMinutes; }
      d.ins += s.interventions;
    });
    const dayKeys = [...byDay.keys()].sort().reverse().slice(0, sec.days || 7);
    const dayRows = dayKeys.map((k) => {
      const d = byDay.get(k);
      const when = new Date(k + "T12:00:00");
      const label = k === todayKey
        ? "Today"
        : when.toLocaleDateString([], { weekday: "short", day: "numeric" });
      return `
        <div class="ps-jr">
          <span class="ps-l">${psEsc(label)}</span>
          <span class="ps-v">${d.night ? psHM(d.night.asleepMinutes) : "—"}</span>
          <span class="ps-flat">${d.naps ? `${d.naps} nap${d.naps > 1 ? "s" : ""} ${psHM(d.napMins)}` : "no naps"} · ${d.ins} in</span>
        </div>`;
    }).join("");

    const nightsWithData = dayKeys.map((k) => byDay.get(k)).filter((d) => d.night);
    const avgNight = nightsWithData.length
      ? Math.round(nightsWithData.reduce((a, d) => a + d.night.asleepMinutes, 0) / nightsWithData.length)
      : null;
    const avgIns = nightsWithData.length
      ? (nightsWithData.reduce((a, d) => a + d.night.interventions, 0) / nightsWithData.length)
      : null;

    /* The horseshoe, carrying the same meaning the sock card's did: one ring,
       two arcs, a total in the middle. Deep/light became night/naps — there
       are no sleep stages here, but "how much has he slept today, and how
       much of it was the night" is the question that ring was answering. */
    const nightSession = live && live.night ? live : lastNight;
    const nightMins = nightSession ? nightSession.asleepMinutes : 0;
    const totalMins = nightMins + napMins;
    const maxH = (sec.ring || {}).max_hours || 14;
    const maxMins = maxH * 60;
    /* No data and a genuine zero must not look the same. */
    const noData = !loaded || (!lastNight && !live && !todayNaps.length);
    const ring = this._ringSvg(98, 8, [
      [nightMins / maxMins, "var(--ps-deep)"],
      [napMins / maxMins, "var(--ps-light)"],
    ], avgNight != null ? Math.min(1, avgNight / maxMins) : null);

    return `
      ${this._head(sec, `<span class="ps-chip ${chipCls}"><span class="ps-dot"></span>${psEsc(chipTxt)}</span>`)}
      <div class="ps-jtop">
        <div class="ps-ring" style="width:98px;height:98px" data-info="${psEsc(sec.hatch)}">
          ${ring}
          <div class="ps-rv">${noData
            ? `<b class="ps-nodata">—</b><small>no data</small>`
            : `<b>${(totalMins / 60).toFixed(1)}h</b><small>of ${maxH}h</small>`}</div>
        </div>
        <div class="ps-grow">
          <div class="ps-jn">${psEsc(sec.name || sec.title || "Nursery")}</div>
          <div class="ps-js">${psEsc(heroLabel)}<br>${psEsc(heroSub)}</div>
          <div class="ps-chips" style="margin-top:9px">
            ${noData
              ? `<span class="ps-chip">${err ? "Recorder unavailable" : loaded ? "Nothing recorded" : "Loading…"}</span>`
              : `<span class="ps-chip deep">Night ${nightMins ? psHM(nightMins) : "—"}</span>
                 <span class="ps-chip lt">${todayNaps.length
                    ? `${todayNaps.length} nap${todayNaps.length > 1 ? "s" : ""} ${psHM(napMins)}`
                    : "No naps"}</span>`}
            ${wifiOk ? "" : `<span class="ps-chip bad">Hatch offline</span>`}
          </div>
        </div>
      </div>
      <div class="ps-xtra">
        <span class="ps-lbl" style="display:block;margin:2px 0 6px">Naps today${
          todayNaps.length ? ` · ${todayNaps.length} · ${psHM(napMins)}` : ""}</span>
        ${napRows}

        <span class="ps-lbl" style="display:block;margin:14px 0 6px">${
          nightSession && nightSession.active ? "Tonight" : "Last night"}</span>
        ${nightSession ? `
          <div class="ps-jr"><span class="ps-l">Asleep</span>
            <span class="ps-v">${psHM(nightSession.asleepMinutes)}</span>
            <span class="ps-flat">${avgNight == null ? "" : psHM(avgNight) + " avg"}</span></div>
          <div class="ps-jr"><span class="ps-l">Down / up</span>
            <span class="ps-v">${psClock(nightSession.from)} – ${
              nightSession.active ? "now" : psClock(nightSession.to)}</span>
            <span class="ps-flat">${nightSession.splits > 1 ? nightSession.splits + " spans" : ""}</span></div>
          <div class="ps-jr"><span class="ps-l">Settled</span>
            <span class="ps-v">${nightSession.hadExit ? psClock(nightSession.settledAt) : "—"}</span>
            <span class="ps-flat">${nightSession.hadExit ? psHM(nightSession.settleMinutes) + " to settle" : "nobody went in"}</span></div>
          <div class="ps-jr"><span class="ps-l">Interventions</span>
            <span class="ps-v">${nightSession.interventions}</span>
            <span class="ps-flat">${avgIns == null ? "" : avgIns.toFixed(1) + " avg"}</span></div>
          ${nightSession.events.length ? `<div class="ps-jr"><span class="ps-l">Went in at</span>
            <span class="ps-v">${nightSession.events.map((t) => psClock(t)).join(", ")}</span></div>` : ""}
          ${this._nurseryTimeline(nightSession, loaded, err)}
        ` : `<div class="ps-jr"><span class="ps-l">${
          err ? "Recorder did not answer" : loaded ? "No night recorded yet" : "Loading…"}</span></div>`}

        <span class="ps-lbl" style="display:block;margin:14px 0 6px">Last ${dayKeys.length} day${dayKeys.length === 1 ? "" : "s"}</span>
        ${dayRows || `<div class="ps-jr"><span class="ps-l">No history yet</span></div>`}
      </div>`;
  },
});
