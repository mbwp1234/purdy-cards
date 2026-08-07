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
 *                    absorbs connectivity blips.
 *  - min_session_min Drops a Hatch switched on and straight off again. A run
 *                    that is STILL going is never dropped, however short — that
 *                    is a session in progress, not a stray.
 *  - door_min_sec    Mounting the sensor produced ten transitions in 34
 *                    seconds, five of them under 300ms. A magnet settling is
 *                    not a person; a person holds a door open for seconds.
 *  - door_merge_sec  Going in and coming out is one visit. Without this, every
 *                    intervention counts twice — in and out — which is the same
 *                    double-count the sock's 30-minute cooldown existed to stop.
 */
function psNurserySessions(hatch, door, opts) {
  const o = opts || {};
  const mergeGap = (o.merge_gap_min == null ? 15 : o.merge_gap_min) * 60000;
  const minLen = (o.min_session_min == null ? 10 : o.min_session_min) * 60000;
  const doorMin = (o.door_min_sec == null ? 2 : o.door_min_sec) * 1000;
  const doorMerge = (o.door_merge_sec == null ? 60 : o.door_merge_sec) * 1000;
  const nightAfter = o.night_after_hour == null ? 18 : o.night_after_hour;
  const morning = o.morning_hour == null ? 5 : o.morning_hour;
  const now = o.now == null ? Date.now() : o.now;

  /* 1 — raw playing spans */
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

  /* 2 — merge across short gaps */
  const merged = [];
  spans.forEach((s) => {
    const last = merged[merged.length - 1];
    if (last && s.from - last.to < mergeGap) {
      last.to = s.to;
      if (s.active) last.active = true;
      last.splits = (last.splits || 1) + 1;
    } else {
      merged.push({ from: s.from, to: s.to, active: s.active, splits: 1 });
    }
  });

  /* 3 — drop strays, never drop a run in progress */
  const kept = merged.filter((s) => s.active || s.to - s.from >= minLen);

  /* 4 — door opens as intervals, so a flicker can be measured and discarded */
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

  /* 5 — attach interventions and classify */
  return kept.map((s) => {
    const events = [];
    let lastCounted = -Infinity;
    opens.forEach((op) => {
      if (op.from < s.from || op.from > s.to) return;
      if (!op.held && op.to - op.from < doorMin) return;
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
    const napMins = todayNaps.reduce((a, s) => a + s.minutes, 0);

    /* Chip: what is true right now, not what the history says. */
    let chipCls = "";
    let chipTxt = "Hatch off";
    if (playing) {
      chipCls = "deep";
      chipTxt = live ? `Asleep ${psHM(live.minutes)}` : "Asleep";
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

    /* Today's sessions, newest first. */
    const todayAll = sessions
      .filter((s) => s.day === todayKey || (s.night && s.active))
      .slice()
      .reverse();
    const todayRows = todayAll.length
      ? todayAll.map((s) => `
          <div class="ps-jr">
            <span class="ps-l">${s.night ? "Night" : "Nap"} · ${psClock(s.from)}</span>
            <span class="ps-v">${psHM(s.minutes)}${s.active ? " …" : ""}</span>
            <span class="ps-flat">${s.interventions} in</span>
          </div>`).join("")
      : `<div class="ps-jr"><span class="ps-l">Nothing yet today</span></div>`;

    /* Recent days. A day with no night recorded still gets a row — an absent
       night is information, and skipping it would silently shorten the list. */
    const byDay = new Map();
    sessions.forEach((s) => {
      if (!byDay.has(s.day)) byDay.set(s.day, { night: null, naps: 0, napMins: 0, ins: 0 });
      const d = byDay.get(s.day);
      if (s.night) d.night = s;
      else { d.naps += 1; d.napMins += s.minutes; }
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
          <span class="ps-v">${d.night ? psHM(d.night.minutes) : "—"}</span>
          <span class="ps-flat">${d.naps ? `${d.naps} nap${d.naps > 1 ? "s" : ""} ${psHM(d.napMins)}` : "no naps"} · ${d.ins} in</span>
        </div>`;
    }).join("");

    const nightsWithData = dayKeys.map((k) => byDay.get(k)).filter((d) => d.night);
    const avgNight = nightsWithData.length
      ? Math.round(nightsWithData.reduce((a, d) => a + d.night.minutes, 0) / nightsWithData.length)
      : null;
    const avgIns = nightsWithData.length
      ? (nightsWithData.reduce((a, d) => a + d.night.interventions, 0) / nightsWithData.length)
      : null;

    return `
      ${this._head(sec, `<span class="ps-chip ${chipCls}"><span class="ps-dot"></span>${psEsc(chipTxt)}</span>`)}
      <div class="ps-jtop">
        <div class="ps-grow">
          <div class="ps-jn">${psEsc(sec.name || sec.title || "Nursery")}</div>
          <div class="ps-js">${psEsc(heroLabel)}<br>${psEsc(heroSub)}</div>
          <div class="ps-chips" style="margin-top:9px">
            ${hero
              ? `<span class="ps-chip deep">${psHM(hero.minutes)}</span>
                 <span class="ps-chip ${hero.interventions ? "warn" : "good"}">${hero.interventions} intervention${hero.interventions === 1 ? "" : "s"}</span>`
              : `<span class="ps-chip">${err ? "Recorder unavailable" : loaded ? "Nothing recorded" : "Loading…"}</span>`}
            ${napMins ? `<span class="ps-chip lt">Naps ${psHM(napMins)}</span>` : ""}
            ${wifiOk ? "" : `<span class="ps-chip bad">Hatch offline</span>`}
          </div>
        </div>
      </div>
      <div class="ps-xtra">
        <span class="ps-lbl" style="display:block;margin:2px 0 6px">Today</span>
        ${todayRows}
        <span class="ps-lbl" style="display:block;margin:14px 0 6px">Last ${dayKeys.length} day${dayKeys.length === 1 ? "" : "s"}</span>
        ${dayRows || `<div class="ps-jr"><span class="ps-l">No history yet</span></div>`}
        ${avgNight == null ? "" : `
        <div class="ps-jr"><span class="ps-l">Average night</span>
          <span class="ps-v">${psHM(avgNight)}</span>
          <span class="ps-flat">${avgIns.toFixed(1)} in</span></div>`}
      </div>`;
  },
});
