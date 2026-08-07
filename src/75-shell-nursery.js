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
  /* Going in to GET HIM is not an intervention. The door opens moments before
     the sound machine stops — six seconds, on the 10:58 nap — so an event this
     close to the end is the retrieval: the far more precise cousin of the
     sock's hour-wide wake-for-the-day guess. Finished sessions only; a run
     still going has no end to be near. */
  const retrieval = (o.retrieval_window_min == null ? 5 : o.retrieval_window_min) * 60000;
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
      if (!s.active && s.to - op.from <= retrieval) return;   /* picking him up */
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
      /* The longest run nobody had to go in. For a night this is the number
         that says whether anyone else slept, and it is not derivable from the
         count — three wake-ups spread evenly is a very different night from
         three in the last hour. */
      longestStretch: (() => {
        const marks = [settledAt, ...events, s.to];
        let best = 0;
        for (let k = 1; k < marks.length; k += 1) {
          best = Math.max(best, marks[k] - marks[k - 1]);
        }
        return Math.max(0, Math.round(best / 60000));
      })(),
    };
  });
}

/* Cross-session numbers: the ones worth having whether or not this card is
   what displays them.
 *
 *   wakeWindow      how long he has been up. For a baby this is what predicts
 *                   the next nap, and it is the difference between reporting
 *                   history and saying what happens next.
 *   longestStretch  per session above — surfaced here as the night's headline.
 *   bedtimeSpread   how consistent bedtime is across the window, as a ± in
 *                   minutes. Consistency is the thing sleep advice is actually
 *                   about, and a mean alone hides it.
 *
 * Bedtimes are shifted past midnight before averaging: a 00:20 bedtime is a
 * late night, not an early one, and treating it as minute 20 would drag the
 * mean back by eleven hours and report a wild spread on a settled week. */
function psNurseryStats(sessions, opts) {
  const o = opts || {};
  const now = o.now == null ? Date.now() : o.now;
  const all = sessions || [];

  const nights = all.filter((s) => s.night && !s.active).slice(-(o.days || 7));
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const avgNightMin = nights.length ? Math.round(mean(nights.map((s) => s.asleepMinutes))) : null;
  const avgIns = nights.length ? mean(nights.map((s) => s.interventions)) : null;
  const avgStretch = nights.length ? Math.round(mean(nights.map((s) => s.longestStretch))) : null;

  const beds = nights.map((s) => {
    const d = new Date(s.from);
    const m = d.getHours() * 60 + d.getMinutes();
    return m < 720 ? m + 1440 : m;      /* after midnight is late, not early */
  });
  const bedMean = beds.length ? Math.round(mean(beds)) % 1440 : null;
  const bedSpread = beds.length > 1
    ? Math.round(Math.sqrt(mean(beds.map((b) => (b - mean(beds)) ** 2))))
    : null;

  /* Awake since the last session ended — null while he is actually asleep,
     because "awake 0m" during a nap is a lie rather than a zero. */
  const live = all.find((s) => s.active);
  const ended = all.filter((s) => !s.active);
  const last = ended.length ? ended[ended.length - 1] : null;
  const wakeSince = live || !last ? null : last.to;
  const wakeWindowMin = wakeSince == null ? null : Math.max(0, Math.round((now - wakeSince) / 60000));

  return {
    nights: nights.length,
    avgNightMin, avgIns, avgStretch,
    bedMean, bedSpread,
    wakeSince, wakeWindowMin,
  };
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

  /* The night, scrubbable.
   *
   * The sock card drew sleep stages; there are none here, so this draws the
   * shape of the night — settling at the head, the sleep itself, and a tick
   * wherever someone went in. Dragging it names the time under your finger,
   * which is the whole point: "what time was that 2am wake-up" becomes a swipe
   * rather than a memory test.
   *
   * It rides the shell's existing scrub (data-scrub / .ps-cross / data-readout),
   * so it inherits the parts that were hard to get right: a ~340ms press before
   * touch is claimed, so a vertical swipe still scrolls the page, and a readout
   * written straight to the DOM instead of through a repaint.
   *
   * Deliberately NOT folded into `_hypnoSvg`. Same size, both bars on a time
   * axis — but that one samples a state series and this one plots intervals
   * with point events over them. Merging would mean picking one model and
   * changing how the other view reads.
   */
  _nurseryRail(night, loaded, err) {
    if (!loaded || err || !night) {
      const msg = err ? "Recorder did not answer"
        : !loaded ? "Loading…" : "No night recorded yet";
      return `<div class="ps-hyp">
          <div class="ps-hypt"><span class="ps-lbl">Night</span></div>
          <div class="ps-nohist">${psEsc(msg)}</div>
        </div>`;
    }

    const PAD = 3;
    const from = night.from;
    const to = night.to;
    const span = Math.max(60000, to - from);
    const x = (t) => PAD + ((t - from) / span) * (100 - PAD * 2);
    this._nightData = { from, to, settledAt: night.settledAt, events: night.events };

    const sx = x(night.settledAt);
    let bars = `<rect x="${PAD}" y="14" width="${Math.max(0.4, sx - PAD).toFixed(2)}"
        height="18" rx="2" fill="var(--ps-light)" opacity="0.5"/>
      <rect x="${sx.toFixed(2)}" y="10" width="${Math.max(0.4, (100 - PAD) - sx).toFixed(2)}"
        height="26" rx="2" fill="var(--ps-deep)" opacity="${night.active ? 0.95 : 0.8}"/>`;

    let ticks = "";
    night.events.forEach((t) => {
      ticks += `<rect x="${(x(t) - 0.32).toFixed(2)}" y="5" width="0.64" height="36"
        rx="0.3" fill="var(--ps-warn)"/>`;
    });

    let grid = "";
    const hours = span / 3600000;
    const step = hours > 8 ? 2 : 1;
    for (let h = step; h < hours; h += step) {
      const gx = x(from + h * 3600000);
      grid += `<line x1="${gx.toFixed(2)}" y1="4" x2="${gx.toFixed(2)}" y2="42"
        stroke="var(--ps-edge)" stroke-width="0.25"/>`;
    }

    const fmt = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `<div class="ps-hyp">
        <div class="ps-hypt" data-readout="night">
          <span class="ps-lbl">${night.active ? "Tonight" : "Last night"}</span>
          <span><i style="background:var(--ps-light);opacity:.5"></i>settling<i style="background:var(--ps-deep);margin-left:9px"></i>asleep</span>
          <b>${night.interventions} in</b>
        </div>
        <div class="ps-hypplot" data-scrub="night">
          <svg viewBox="0 0 100 46" preserveAspectRatio="none" aria-hidden="true">
            ${grid}${bars}${ticks}
          </svg>
          <div class="ps-cross" hidden></div>
        </div>
        <div class="ps-hypt"><span>${psEsc(fmt(from))}</span><span>${psEsc(night.active ? "now" : fmt(to))}</span></div>
      </div>`;
  },

  /* Today at a glance: the tail of last night, each nap where it fell, now,
     and tonight's expected bedtime as a ghost. Answers "are we on schedule"
     without a single number. */
  _nurseryDayRail(sessions, todayKey, bedMean) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const t0 = start.getTime();
    const t1 = t0 + 86400000;
    const PAD = 0;
    const x = (t) => ((t - t0) / (t1 - t0)) * 100;

    let bars = "";
    (sessions || []).forEach((s) => {
      if (s.to < t0 || s.from > t1) return;
      const a = Math.max(x(s.from), 0);
      const b = Math.min(x(s.to), 100);
      const short = !s.night && s.asleepMinutes < 30;
      bars += `<rect x="${a.toFixed(2)}" y="6" width="${Math.max(0.5, b - a).toFixed(2)}"
        height="6" rx="2" fill="${s.night ? "var(--ps-deep)" : short ? "var(--ps-warn)" : "var(--ps-light)"}"
        opacity="${s.night ? 0.75 : 1}"/>`;
    });

    const ghost = bedMean == null ? "" : (() => {
      const gx = (bedMean / 1440) * 100;
      return `<rect x="${gx.toFixed(2)}" y="3.5" width="6" height="11" rx="1.6" fill="none"
        stroke="var(--ps-deep)" stroke-width="0.6" stroke-dasharray="1.6 1.4"/>`;
    })();

    const nx = x(Date.now());
    return `<div class="ps-hyp">
        <div class="ps-hypt"><span class="ps-lbl">Today</span></div>
        <div class="ps-rail">
          <svg viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y="6" width="100" height="6" rx="2" fill="rgba(255,255,255,.05)"/>
            ${bars}${ghost}
            <line x1="${nx.toFixed(2)}" y1="1.5" x2="${nx.toFixed(2)}" y2="16.5"
              stroke="var(--ps-text)" stroke-width="0.8"/>
          </svg>
        </div>
        <div class="ps-hypt"><span>12</span><span>6 AM</span><span>noon</span><span>6 PM</span><span>12</span></div>
      </div>`;
  },

  _secNursery(sec) {
    const h = this._hass;
    const playing = pcState(h, sec.hatch) === "playing";
    const doorOpen = pcState(h, sec.door) === "on";

    const loaded = !!this._nursery;
    const err = this._nurseryErr;
    const sessions = loaded ? this._nurserySessions(sec) : [];
    const stats = psNurseryStats(sessions, { now: Date.now(), days: sec.days || 7 });

    const live = sessions.find((s) => s.active);
    const past = sessions.filter((s) => !s.active);
    const lastNight = [...past].reverse().find((s) => s.night) || null;
    const nightSession = live && live.night ? live : lastNight;

    const todayKey = psDayKey(new Date());
    const todayNaps = sessions.filter((s) => !s.night && s.day === todayKey);
    const napMins = todayNaps.reduce((a, s) => a + s.asleepMinutes, 0);
    const catnapUnder = sec.catnap_under_min == null ? 30 : sec.catnap_under_min;
    const napTarget = (sec.nap_target_min == null ? 60 : sec.nap_target_min) * 1;

    const wifiOk = !sec.hatch_wifi || pcState(h, sec.hatch_wifi) === "on";
    const clock = (m) => (m == null ? "—"
      : `${((Math.floor(m / 60) % 12) || 12)}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`);

    /* Chip — what is true right now, never what the history says. */
    let chipCls = "";
    let chipTxt = "Awake";
    if (playing && live) {
      chipCls = live.hadExit ? "deep" : "lt";
      chipTxt = live.hadExit ? `Asleep ${psHM(live.asleepMinutes)}` : `Settling ${psHM(live.minutes)}`;
    } else if (playing) {
      chipCls = "deep"; chipTxt = "Asleep";
    } else if (doorOpen) {
      chipCls = "warn"; chipTxt = "Door open";
    } else if (stats.wakeWindowMin != null) {
      chipTxt = `Awake ${psHM(stats.wakeWindowMin)}`;
    }

    /* The horseshoe is scaled to HIS OWN seven-day average, not a made-up
       twelve hours: the marker sits at his normal and the reading is
       above/below it, which keeps meaning as he grows. The 1.25 headroom is so
       a better-than-usual night has somewhere to go. */
    const avg = stats.avgNightMin;
    const maxMins = avg ? Math.round(avg * 1.25) : ((sec.ring || {}).max_hours || 12) * 60;
    const nightMins = nightSession ? nightSession.asleepMinutes : 0;
    /* A night that has not happened and a night of no sleep are different
       facts. The ring read "0m LAST NIGHT" on a day with no recorded night at
       all — the exact shape the sock taught us to avoid. */
    const nightNoData = !loaded || !nightSession;
    const noData = !loaded || (!nightSession && !todayNaps.length);
    const ring = this._ringSvg(120, 9,
      [[nightMins / maxMins, "var(--ps-deep)"]],
      avg ? Math.min(1, avg / maxMins) : null);

    /* Nap rings. No slot is drawn for a nap that has not happened — two short
       naps make a third possible, but only going down a third time makes it
       real, and the card has no business claiming more than it can see. */
    const ringPx = todayNaps.length > 2 ? 44 : 52;
    const stroke = todayNaps.length > 2 ? 4.5 : 5.5;
    const napRings = todayNaps.map((s) => {
      const short = !s.active && s.asleepMinutes < catnapUnder;
      const col = short ? "var(--ps-warn)" : "var(--ps-light)";
      const sub = s.active ? "now" : psClock(s.from);
      const subCol = s.active ? "var(--ps-light)" : short ? "var(--ps-warn)" : "var(--ps-dim)";
      return `<div class="ps-napr">
          <div class="ps-ring" style="width:${ringPx}px;height:${ringPx}px" data-info="${psEsc(sec.hatch)}">
            ${this._ringSvg(ringPx, stroke, [[s.asleepMinutes / napTarget, col]], null)}
            <div class="ps-rv sm"><b>${psHM(s.asleepMinutes).replace(" ", "")}</b></div>
          </div>
          <span style="color:${subCol}">${psEsc(sub)}</span>
        </div>`;
    }).join("");

    /* Nap total against a BAND. There is no single number to miss by: under
       `ok_min` is short, `ok_min`–`max_min` is fine, and the mark is the aim.
       Drawn even at zero, because "none yet" against the band is exactly the
       reading wanted at nine in the morning. */
    const nb = sec.nap_band || {};
    const bOk = nb.ok_min == null ? 120 : nb.ok_min;
    const bAim = nb.aim_min == null ? 150 : nb.aim_min;
    const bMax = nb.max_min == null ? 180 : nb.max_min;
    const pct = (m) => Math.max(0, Math.min(100, (m / bMax) * 100));
    const bandTxt = napMins >= bAim ? "on target" : napMins >= bOk ? "fine" : "short";
    const band = `<div class="ps-band">
        <div class="ps-bandt"><span>Naps today</span>
          <b class="${napMins >= bOk ? "ps-good" : "ps-warnc"}">${psHM(napMins)} · ${bandTxt}</b></div>
        <div class="ps-bandbar">
          <div class="ps-bandok" style="left:${pct(bOk).toFixed(1)}%;right:0"></div>
          <div class="ps-bandaim" style="left:${pct(bAim).toFixed(1)}%"></div>
          <div class="ps-bandfill" style="width:${pct(napMins).toFixed(1)}%;
            background:var(${napMins >= bOk ? "--ps-good" : "--ps-warn"})"></div>
        </div>
        <div class="ps-bandsc"><span>0</span><span>${psHM(bOk)}</span><span>${psHM(bAim)} aim</span><span>${psHM(bMax)}</span></div>
      </div>`;

    /* One line of live status, and nothing else. Predicted bedtime comes from
       his own average rather than a configured time. */
    const statusL = live
      ? `Down ${psClock(live.from)}`
      : stats.wakeSince ? `Awake since ${psClock(stats.wakeSince)}` : "";
    const statusR = live
      ? (live.hadExit ? `settled ${psClock(live.settledAt)}` : "settling…")
      : (stats.bedMean != null ? `bedtime ~${clock(stats.bedMean)}` : "");

    return `
      ${this._head(sec, `<span class="ps-chip ${chipCls}"><span class="ps-dot"></span>${psEsc(chipTxt)}</span>`)}
      <div class="ps-jtop">
        <div class="ps-ring" style="width:120px;height:120px" data-info="${psEsc(sec.hatch)}">
          ${ring}
          <div class="ps-rv">${nightNoData
            ? `<b class="ps-nodata">—</b><small>${loaded ? "NO NIGHT YET" : "LOADING"}</small>`
            : `<b>${psHM(nightMins)}</b><small>${nightSession.active ? "TONIGHT" : "LAST NIGHT"}</small>`}</div>
        </div>
        <div class="ps-grow">
          <span class="ps-lbl">Naps${napMins ? ` · ${psHM(napMins)}` : ""}</span>
          <div class="ps-naps">${napRings || `<span class="ps-flat" style="font-size:var(--pc-fs-xs)">${
            noData ? (err ? "recorder unavailable" : loaded ? "none yet" : "loading…") : "none yet"}</span>`}</div>
        </div>
      </div>
      ${noData ? "" : band}
      ${noData ? "" : `<div class="ps-jstat">
        <span>${psEsc(statusL)}</span>
        <span>${psEsc(statusR)}</span>
      </div>`}
      ${wifiOk ? "" : `<div class="ps-chips"><span class="ps-chip bad">Hatch offline</span></div>`}

      <div class="ps-xtra">
        ${this._nurseryRail(nightSession, loaded, err)}
        ${nightSession ? `
        <div class="ps-jrs">
          <div class="ps-jr"><span class="ps-l">Asleep</span>
            <span class="ps-v">${psHM(nightSession.asleepMinutes)}</span>
            <span class="${avg == null ? "ps-flat" : nightSession.asleepMinutes >= avg ? "ps-good" : "ps-warnc"}">${
              avg == null ? "" : psHM(avg) + " avg"}</span></div>
          <div class="ps-jr"><span class="ps-l">Longest stretch</span>
            <span class="ps-v">${psHM(nightSession.longestStretch)}</span>
            <span class="ps-flat">${stats.avgStretch == null ? "" : psHM(stats.avgStretch) + " avg"}</span></div>
          <div class="ps-jr"><span class="ps-l">Down / up</span>
            <span class="ps-v">${psClock(nightSession.from)} – ${
              nightSession.active ? "now" : psClock(nightSession.to)}</span>
            <span class="ps-flat">${stats.bedSpread == null ? "" : "±" + stats.bedSpread + "m"}</span></div>
          <div class="ps-jr"><span class="ps-l">Settled</span>
            <span class="ps-v">${nightSession.hadExit ? psClock(nightSession.settledAt) : "—"}</span>
            <span class="ps-flat">${nightSession.hadExit ? psHM(nightSession.settleMinutes) : "nobody went in"}</span></div>
          ${nightSession.events.length ? `<div class="ps-jr"><span class="ps-l">Went in at</span>
            <span class="ps-v">${nightSession.events.map((t) => psClock(t)).join(", ")}</span></div>` : ""}
        </div>` : ""}

        ${this._nurseryDayRail(sessions, todayKey, stats.bedMean)}
        <div class="ps-jrs">
          ${todayNaps.length ? todayNaps.map((s) => `
            <div class="ps-jr"><span class="ps-l">${psClock(s.from)} – ${s.active ? "now" : psClock(s.to)}</span>
              <span class="ps-v">${psHM(s.asleepMinutes)}${s.active ? " …" : ""}</span>
              <span class="${!s.active && s.asleepMinutes < catnapUnder ? "ps-warnc" : "ps-flat"}">${
                !s.active && s.asleepMinutes < catnapUnder ? "short" : s.interventions ? s.interventions + " in" : ""}</span></div>`).join("")
            : `<div class="ps-jr"><span class="ps-l">No naps yet today</span></div>`}
          ${stats.wakeWindowMin == null ? "" : `<div class="ps-jr"><span class="ps-l">Awake for</span>
            <span class="ps-v">${psHM(stats.wakeWindowMin)}</span>
            <span class="ps-flat">since ${psClock(stats.wakeSince)}</span></div>`}
        </div>
      </div>`;
  },
});
