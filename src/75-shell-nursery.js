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
 *  - door_merge_sec  A bounce guard for while someone is IN the room: an open
 *                    this soon after the door shut is the same door movement —
 *                    swung, bumped, or pulled back open to be propped — not
 *                    them leaving. It does not discard the open — discarding
 *                    one flips the entry/exit parity of every open after it
 *                    (see below).
 *  - reentry_sec     The same idea from outside: an open this soon after the
 *                    one that closed a visit is them stepping back in, so it
 *                    RESUMES that visit rather than opening a new one. Longer
 *                    than `door_merge_sec` because walking out, fetching
 *                    something and returning takes longer than a door swinging
 *                    — and they cannot be one number: 60 leaves a real 79s
 *                    return reading as a second wake-up, while 120 applied to a
 *                    bounce would swallow a genuine 97s step-out as one.
 *  - visit_max_min   Going in and coming out is one visit, and a visit lasts as
 *                    long as you stay. The open that follows a counted entry
 *                    inside this window is that visit's exit, not a new
 *                    intervention. Absorbs exactly one open, never a chain.
 *  - exit_window_min The put-down. Someone has to be IN the room to start the
 *                    Hatch, so the first door-open of a session is almost
 *                    always them leaving — and counting it made every session
 *                    read one intervention high, which is the sock's settling
 *                    stir wearing a different hat. It is not discarded: the
 *                    door closing behind them is the moment he is actually
 *                    alone, so it becomes `settledAt`, and the gap from bedtime
 *                    to it is settling time. Bounded, because a first entry
 *                    three hours in is a real intervention, not an exit.
 *                    The window runs from the LAST visit, not from the session
 *                    start — a put-down is several trips, not one exit.
 *  - settle_max_min  The brake on that chain. Without a ceiling, a visit every
 *                    twenty minutes would make a whole night read as settling.
 */
function psNurserySessions(hatch, door, opts) {
  const o = opts || {};
  const doorMin = (o.door_min_sec == null ? 2 : o.door_min_sec) * 1000;
  const doorMerge = (o.door_merge_sec == null ? 60 : o.door_merge_sec) * 1000;
  const reentry = (o.reentry_sec == null ? 120 : o.reentry_sec) * 1000;
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
  const NAP = { min_session_min: 8, exit_window_min: 25, merge_gap_min: 5,
    settle_max_min: 30, visit_max_min: 20 };
  const NIGHT = { min_session_min: 20, exit_window_min: 30, merge_gap_min: 20,
    settle_max_min: 60, visit_max_min: 30 };
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
       before deciding which of them is the exit.
     *
     * An open that STRADDLES the start counts, clamped to it. The door is
     * often already cracked when the sound machine goes on, so that open
     * begins before the session and `from >= s.from` dropped it — and if the
     * parent simply pulls the cracked door shut on the way out, that close is
     * the only settling signal there is. Observed 2026-08-07: the door had
     * been open since before 12:30 and the Hatch started at 14:18:41.
     * The chatter filter still judges the door's REAL duration, not the
     * clamped one, so a straddling open can never look like a flicker. */
    const inside = realOpens
      .filter((op) => op.to > s.from && op.from <= s.to)
      .map((op) => (op.from < s.from ? { from: s.from, to: op.to, held: op.held } : op));

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
     * runs 10-20 minutes, hence the generous default.
     *
     * The window CHAINS off the last visit, it does not run from the session
     * start — a fixed window from bedtime assumes the put-down is one exit, and
     * it is not. On the 2026-08-07 night the Hatch went on at 19:06:19 and the
     * room was visited four times over 33 minutes; measured from the start, the
     * 30-minute window closed at 19:36:19 and the FOURTH visit missed it by two
     * and a half minutes. So the card marked him settled at 19:32 and called
     * the real final exit an intervention — and worse than a miscount, it
     * started `asleepMinutes` while someone was still in the room. Widening the
     * window to 40 would have fixed that night and broken on a 45-minute one;
     * chaining is the shape that scales.
     *
     * The chain runs from the CLOSE of the last visit, not its open: the question is
     * how long the room has been quiet since anyone was last in it.
     *
     * `settle_max_min` is the brake. Chaining alone is unbounded — a visit
     * every twenty minutes all night would make the entire night "settling" and
     * report zero interventions — so total settling is capped regardless of how
     * the chain runs. The nap cap is tight because swallowing thirty minutes of
     * a fifty-minute nap would be worse than the bug it fixes. */
    const settleMax = rule(s.from, "settle_max_min");
    let settledAt = s.from;
    let hadExit = false;
    let i = 0;
    let quietFrom = s.from;
    while (i < inside.length
           && inside[i].from - quietFrom <= exitWindow
           && inside[i].from - s.from <= settleMax) {
      settledAt = Math.min(inside[i].to, s.to);
      quietFrom = settledAt;
      hadExit = true;
      i += 1;
    }

    /* An intervention is a VISIT, and a visit is two door-opens: going in and
     * coming out again. Pairing them is the only way to count one.
     *
     * `door_merge_sec` was doing this job and could not. It merges opens within
     * 60 seconds of each other, which assumes the visit is over almost as soon
     * as it began — so any wake-up where someone actually settles him read as
     * two. Observed 2026-08-07: in at 22:05:13, out at 22:17:22, **12 minutes**
     * apart, counted twice. A visit is bounded by how long you STAY, not by how
     * fast you come back.
     *
     * So the first open is the entry and is counted; the next open within
     * `visit_max_min` is that visit's exit and is absorbed. It absorbs exactly
     * ONE open, never a chain — that is what keeps it from swallowing a whole
     * night the way an unbounded rule would, and it is the same asymmetry the
     * settle chain needed a cap for.
     *
     * The failure mode is now an UNDERCOUNT — a genuine second wake-up inside
     * the window reads as the first visit's exit. That is the better error:
     * visits longer than a minute are the norm, two wake-ups inside half an
     * hour are not.
     *
     * DROPPING an open breaks the pairing for everything after it, and that is
     * what `door_merge_sec` used to do. Observed 2026-08-10: in at 22:48:01,
     * out at 22:49:44, straight back in at 22:50:13, finally out at 23:05:15.
     * The bounce guard threw the 22:50:13 re-entry away as chatter — it fell 29
     * seconds after the previous open — which left 23:05:15 with nothing to
     * pair against, so it was read as a fresh entry and ONE wake-up was
     * reported as two, seventeen minutes apart. Parity is the whole mechanism
     * here: an odd number of discarded opens turns every later exit into an
     * entry, so the error does not stay local to the burst that caused it.
     *
     * So a bounce is no longer discarded — it RESUMES the visit it interrupted.
     * An open within `reentry_sec` of the one that just closed a visit is them
     * stepping back in, and `visit_max_min` keeps running from the original
     * entry so the resumed visit is still bounded.
     *
     * The mirror of that, from INSIDE the room, is the second half of the same
     * rule and was missing. An open within `door_merge_sec` of the moment the
     * door shut is the same door movement, not the exit — and it must be tested
     * BEFORE the exit branch, or it takes the exit's place and leaves the real
     * exit to be read as a fresh entry. Observed 2026-08-11: in at 00:19:30,
     * door shut at 00:19:35, pulled open again 1.3 seconds later and PROPPED
     * for eleven minutes, finally out at 00:34:33 — one wake-up reported as
     * two. There was already a test covering this shape and it passed, because
     * that night's stray second entry happened to be popped by the retrieval
     * rule; the bug only surfaces when the real exit is nowhere near the end of
     * the session.
     *
     * A bounce is measured from the previous open's CLOSE, so a chain of them
     * keeps extending the visit — `visit_max_min` from the original entry is
     * the brake, the same asymmetry every other rule here needed. Chatter now
     * nets out to ONE visit rather than two: the mounting burst is a single
     * continuous episode of the door being handled, which is what it was. */
    const visitMax = rule(s.from, "visit_max_min");
    const events = [];
    let lastOp = hadExit ? inside[i - 1].from : -Infinity;
    let lastTo = hadExit ? inside[i - 1].to : -Infinity;
    let entryAt = null;   /* set while someone is in the room */
    let exitAt = null;    /* the open that closed the last visit, if any */
    inside.slice(i).forEach((op) => {
      const sinceLast = op.from - lastOp;
      const sinceShut = op.from - lastTo;
      /* Picking him up. `retrieval_window_min` catches the usual shape — the
       * door opens seconds before the Hatch stops — but the surer signal is a
       * door that is never shut again: opened at 06:15:03 on 2026-08-10 and
       * still open when the Hatch stopped 21 minutes later, far outside any
       * window, so the morning get-up was counted as a fourth wake-up. Nobody
       * closes the door on their way out of a room they are carrying him from.
       * If they were already in the room when it happened, the entry that put
       * them there was part of the same get-up and comes back off the list. */
      if (!s.active && (s.to - op.from <= retrieval || op.to >= s.to)) {
        if (entryAt != null && op.from - entryAt <= visitMax
            && events[events.length - 1] === entryAt) events.pop();
        entryAt = null;
        return;
      }
      lastOp = op.from;
      lastTo = op.to;
      if (entryAt != null) {
        /* still in the room: the door swinging straight back open is the same
           movement, not them coming out */
        if (sinceShut < doorMerge && op.from - entryAt <= visitMax) return;
        /* in the room: this open is them coming out again */
        if (op.from - entryAt <= visitMax) { exitAt = op.from; entryAt = null; return; }
      } else if (exitAt != null && sinceLast < reentry && events.length) {
        /* straight back in — the same visit resuming, not a second one */
        entryAt = events[events.length - 1];
        exitAt = null;
        return;
      }
      entryAt = op.from;
      exitAt = null;
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
      /* Every door open inside the session that survived the chatter filter,
         put-down trips included. `events` is the card's answer to "how many
         times did someone have to go in"; this is the raw evidence behind it,
         and the correction sheet draws it — which of these trips was the last
         of the put-down is exactly the judgement a person is being asked to
         make, so it must not be filtered by the guess being corrected. */
      doorAt: inside.map((op) => op.from),
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
      /* When he woke. Derived, this is always the end of the Hatch span — the
         sound machine stopping IS the wake. It is a named field rather than an
         implicit `to` because a human correction can move it in without also
         claiming the Hatch stopped earlier than it did. */
      wokeAt: s.to,
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

/* ---------------------------------------------------------------------------
 * Human corrections.
 *
 * The derivation is good and it is not always right. On 2026-08-10 the 8:52
 * nap reported 31 minutes asleep; he slept eleven. The Hatch ran 08:52–09:53
 * and the room was visited four times, the last at 09:42 — but the nap's
 * `settle_max_min` is 30 minutes, so the chain stopped at the third trip and
 * the fourth was filed as an intervention DURING sleep rather than as the end
 * of the put-down. Raising the cap would have fixed that morning and swallowed
 * the first fifty minutes of a genuinely long nap on another one, which this
 * file already records as the worse error. Some put-downs simply are not
 * decidable from two contact sensors, and the person who was in the room knows.
 *
 * So: an override, not a threshold change. It records the sleep WINDOW — when
 * he actually fell asleep and when he woke — rather than a corrected number of
 * minutes, because a typed duration would leave the nap's start time, its block
 * on the rail and its own length disagreeing with each other.
 *
 * Stored as `start~from~to` per entry, `start~d` for a session that never
 * happened: `start` is epoch MINUTES (eight digits, not thirteen) and the two
 * others are offsets in minutes from it, because the store is an input_text and
 * that helper truncates at 255 characters. The oldest entries fall off rather
 * than the write failing, exactly as the saved-playlist store does, and entries
 * older than the fetch window are dropped on write — an override for a session
 * the recorder no longer holds can never match anything again.
 *
 * Matched on start time within a tolerance, because the derivation's own merge
 * step can shift a session's start by a minute or two when a Hatch dropout
 * lands differently on the next fetch. An exact key would orphan the edit and
 * silently restore the wrong number. */
function psParseNapEdits(raw) {
  if (!raw || raw === "unknown" || raw === "unavailable") return [];
  return String(raw).split("|").map((chunk) => {
    const p = chunk.split("~");
    const start = parseInt(p[0], 10);
    if (!Number.isFinite(start) || start <= 0) return null;
    if (p[1] === "d") return { start: start * 60000, del: true };
    const from = parseInt(p[1], 10);
    const to = parseInt(p[2], 10);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    return { start: start * 60000, from, to };
  }).filter(Boolean);
}

function psWriteNapEdits(list) {
  let parts = (list || []).slice()
    .sort((a, b) => a.start - b.start)
    .map((e) => (e.del
      ? `${Math.round(e.start / 60000)}~d`
      : `${Math.round(e.start / 60000)}~${Math.round(e.from)}~${Math.round(e.to)}`));
  while (parts.length && parts.join("|").length > 255) parts.shift();
  return parts.join("|");
}

/* Apply the overrides on top of the derivation.
 *
 * An edited session keeps its Hatch span — that is measured and is not in
 * dispute — and gets a corrected `settledAt` / `wokeAt` pair. Everything
 * downstream of those is recomputed rather than patched: settling, asleep
 * minutes, the longest undisturbed stretch, and the intervention list, which
 * drops the trips that now fall outside the sleep window. That last one is the
 * point of the 2026-08-10 case: the 09:42 visit was the end of the put-down,
 * so once the window says so it stops being a wake-up too.
 *
 * `edited` rides along on the session because a corrected number and a measured
 * one must not render identically — the same rule as a zero and a missing
 * reading. Every surface that shows an edited session marks it. */
function psApplyNapEdits(sessions, edits, tolMin) {
  const list = edits || [];
  if (!list.length) return sessions || [];
  const tol = (tolMin == null ? 3 : tolMin) * 60000;
  const out = [];
  (sessions || []).forEach((s) => {
    let best = null;
    list.forEach((e) => {
      const d = Math.abs(e.start - s.from);
      if (d <= tol && (!best || d < Math.abs(best.start - s.from))) best = e;
    });
    if (!best) { out.push(s); return; }
    if (best.del) return;

    const settledAt = Math.max(s.from, Math.min(s.to, s.from + best.from * 60000));
    const wokeAt = Math.max(settledAt, Math.min(s.to, s.from + best.to * 60000));
    const events = (s.events || []).filter((t) => t > settledAt && t < wokeAt);
    const marks = [settledAt, ...events, wokeAt];
    let best2 = 0;
    for (let k = 1; k < marks.length; k += 1) best2 = Math.max(best2, marks[k] - marks[k - 1]);

    out.push(Object.assign({}, s, {
      settledAt,
      wokeAt,
      hadExit: true,
      edited: true,
      settleMinutes: Math.max(0, Math.round((settledAt - s.from) / 60000)),
      asleepMinutes: Math.max(0, Math.round((wokeAt - settledAt) / 60000)),
      /* A hand-logged session has no door behind it, so narrowing its window
         cannot turn "nobody was watching" into "nobody went in". Recomputing
         these from an empty event list would hand back a confident zero — the
         one thing psManualSessions holds null on purpose. */
      interventions: s.manual ? null : events.length,
      events,
      longestStretch: s.manual ? null : Math.max(0, Math.round(best2 / 60000)),
    }));
  });
  return out;
}

/* ---------------------------------------------------------------------------
 * Away from the sensors.
 *
 * Everything above derives sleep from two things bolted to one room: a sound
 * machine and a door magnet. Away from that room they report nothing, and the
 * card cannot tell "he did not sleep" from "he slept somewhere I cannot see" —
 * which is the same zero-versus-missing rule this file already turns on, one
 * level up. On a weekend away the section would read no naps, no night, a wake
 * window of eleven hours and a nap OVERDUE by six: five confident statements,
 * every one of them wrong, on the days a parent is least able to check.
 *
 * Two things fix it, and they are deliberately separate because they answer
 * different questions.
 *
 * A MANUAL SESSION is sleep a person watched and the house did not. It is
 * recorded rather than derived, so it is the one thing in this file that a
 * fetch cannot recompute — which is exactly why it carries `manual: true` and
 * why every surface marks it: a logged number and a measured one must never
 * look the same, for the same reason a corrected one may not.
 *
 * An AWAY DAY says he was not here. It records no sleep at all: the nanny is
 * not going to be asked to log naps, and a card that guessed at them would be
 * inventing data to avoid admitting it has none. What it does is stop the card
 * COMPLAINING — no missing naps, no overdue nap, no hatched night reading as a
 * fault. The absence stays visible and stops being an alarm, which is the
 * difference between "nothing recorded" and "nothing to record".
 *
 * Stored the same way the corrections are, and for the same reason: an
 * input_text truncates at 255 characters, so a session is `start~dur` with the
 * start in epoch MINUTES, and a day is its eight-digit key. The oldest entries
 * fall off rather than the write failing, and anything past the fetch window is
 * pruned on write — a session the recorder can no longer show has nowhere to
 * render, and a day older than the strip has nothing left to un-flag.
 */
function psParseManual(raw) {
  if (!raw || raw === "unknown" || raw === "unavailable") return [];
  return String(raw).split("|").map((chunk) => {
    const p = chunk.split("~");
    const start = parseInt(p[0], 10);
    if (!Number.isFinite(start) || start <= 0) return null;
    /* `a` is a session STILL RUNNING — started by hand and not yet ended. It
       cannot be stored as a duration, because the duration is whatever it has
       reached by the time somebody looks. */
    const dur = p[1] === "a" ? null : parseInt(p[1], 10);
    if (dur != null && (!Number.isFinite(dur) || dur < 0)) return null;
    const kind = p[2] === "n" || p[2] === "p" ? p[2] : null;
    return { start: start * 60000, dur, kind };
  }).filter(Boolean);
}

function psWriteManual(list) {
  let parts = (list || []).slice()
    .sort((a, b) => a.start - b.start)
    .map((e) => `${Math.round(e.start / 60000)}~${e.dur == null ? "a" : Math.round(e.dur)}${
      e.kind ? `~${e.kind}` : ""}`);
  while (parts.length && parts.join("|").length > 255) parts.shift();
  return parts.join("|");
}

/* The same session shape the derivation produces, so nothing downstream has to
   know which kind it is holding — with three fields that are deliberately NULL
   rather than zero.

   Nobody was watching a door. `interventions: 0` would be the card claiming an
   undisturbed night on the strength of having no sensor in the room, and the
   "Went in" meter would read a confident zero against his band — the best night
   of the week, invented. `longestStretch` falls with it, because it is the same
   claim measured differently. A null reaches `psHealthMeter` as a missing
   reading and draws the state that was designed for exactly this. */
function psManualSessions(entries, opts) {
  const o = opts || {};
  const now = o.now == null ? Date.now() : o.now;
  const nightAfter = o.night_after_hour == null ? 18 : o.night_after_hour;
  const morning = o.morning_hour == null ? 5 : o.morning_hour;

  return (entries || []).map((e) => {
    const from = e.start;
    const active = e.dur == null;
    const to = active ? Math.max(from, now) : from + e.dur * 60000;
    const hr = new Date(from).getHours();
    /* Kind is decided the same way a derived session's is — by the hour it
       started — with an explicit override for the case the clock gets wrong: a
       7pm nap in a different time zone, or an early night on a bad day. */
    const night = e.kind === "n" ? true
      : e.kind === "p" ? false : (hr >= nightAfter || hr < morning);
    const anchor = new Date(from);
    if (night && hr < morning) anchor.setDate(anchor.getDate() - 1);
    const mins = Math.max(0, Math.round((to - from) / 60000));

    return {
      from, to, active, splits: 1, minutes: mins,
      night, day: psDayKey(anchor),
      /* Not zero. See above. */
      interventions: null,
      events: [], doorAt: [],
      /* Logged asleep-to-awake, so there is no settling to report and none is
         claimed: `settledAt` is the start, and `settleMinutes` is a real zero
         because the window being recorded IS the sleep. */
      settledAt: from, wokeAt: to,
      settleMinutes: 0, asleepMinutes: mins,
      hadExit: true,
      longestStretch: null,
      manual: true,
      kind: e.kind || null,
    };
  });
}

/* A hand-logged session SUPERSEDES anything derived that overlaps it.
 *
 * The two sources can both be running — the Hatch travels, and a nap logged in
 * a car seat can land on top of a Hatch left playing in an empty room at home.
 * Two sessions over one span would double the day's nap total and produce a
 * third nap ring for a nap that happened once. The person who logged it was
 * there and the derivation was not, so the log wins, whole. */
function psMergeManual(derived, manual) {
  if (!manual || !manual.length) return derived || [];
  const keep = (derived || []).filter(
    (s) => !manual.some((m) => m.from < s.to && s.from < m.to));
  return keep.concat(manual).sort((a, b) => a.from - b.from);
}

/* Days he was not here, as eight-digit local day keys — the same key
   `psDayKey` produces, with the dashes taken out to fit the store. */
function psParseAway(raw) {
  if (!raw || raw === "unknown" || raw === "unavailable") return [];
  return String(raw).split("|")
    .map((k) => String(k).trim())
    .filter((k) => /^\d{8}$/.test(k))
    .map((k) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`);
}

function psWriteAway(days) {
  const seen = {};
  let parts = (days || []).filter((d) => {
    const k = String(d).replace(/-/g, "");
    if (!/^\d{8}$/.test(k) || seen[k]) return false;
    seen[k] = 1;
    return true;
  }).map((d) => String(d).replace(/-/g, "")).sort();
  while (parts.length && parts.join("|").length > 255) parts.shift();
  return parts.join("|");
}

/* When he WOKE, which is the end of the Hatch span unless a correction moved
 * it in. Every surface that prints a wake time, or measures from one, has to
 * go through this — otherwise a correction changes the asleep minutes and
 * leaves the clock time beside them still reading the Hatch, which is exactly
 * the "session's start, its block on the day rail and its length disagreeing"
 * that recording the WINDOW rather than a duration was supposed to prevent.
 *
 * Shipped that way from the start: the night rail alone read `wokeAt`, while
 * the night's "Down / up" row, the nap rows, the day rail and the awake-since
 * chip all read `to`. Reported as a corrected wake-up not moving anything on
 * the dashboard — and the chip is the loudest of them, since a wake time
 * pulled 25 minutes earlier is 25 minutes missing from the wake window that
 * decides when the next nap is due. */
function psWokeAt(s) {
  return s && s.wokeAt != null ? s.wokeAt : (s || {}).to;
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

  /* How long he slept is known for a hand-logged night; how many times somebody
     went in is not, and neither is the longest undisturbed run. Averaging a
     null in gives NaN, and defaulting it to zero would be worse — it would pull
     his intervention average down every time the family goes away. So the two
     door-derived averages are taken over the nights that HAD a door. */
  const observed = nights.filter((s) => !s.manual);
  const avgNightMin = nights.length ? Math.round(mean(nights.map((s) => s.asleepMinutes))) : null;
  const avgIns = observed.length ? mean(observed.map((s) => s.interventions)) : null;
  const avgStretch = observed.length ? Math.round(mean(observed.map((s) => s.longestStretch))) : null;

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
  const wakeSince = live || !last ? null : psWokeAt(last);
  const wakeWindowMin = wakeSince == null ? null : Math.max(0, Math.round((now - wakeSince) / 60000));

  /* When the next nap is due — the question the wake window is the INPUT to.
   *
   * `wakeWindowMin` says how long he has been up, which is the number you then
   * do arithmetic on; the chip was spending itself on that and leaving the
   * answer to be worked out in your head. So: measure how long he is usually
   * up before he goes down again, and add it to when he actually woke.
   *
   * The window is OBSERVED, never configured. Every threshold in this file is
   * set from his own data for the same reason a fixed twelve-hour ring was
   * wrong — a number typed into config is a claim about a baby who is still
   * changing. Each ended session that is followed by another gives one sample:
   * the gap between the two. Nights are excluded as the FOLLOWING session — the
   * gap before bedtime is an afternoon, not a wake window — and as the leading
   * one, because the morning gap is set by when the night ended rather than by
   * how long he can stay up.
   *
   * The MEDIAN, not the mean. One 4h car-trip gap drags a mean of five samples
   * by nearly an hour, and the days he skips a nap are exactly the days that
   * produce the outliers. */
  const gaps = [];
  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i];
    const b = all[i + 1];
    if (a.active || a.night || b.night) continue;
    const g = Math.round((b.from - a.to) / 60000);
    /* A gap that spans a night is not a wake window; nor is a re-settle that
       reads as two sessions minutes apart. */
    if (g >= 30 && g <= 8 * 60) gaps.push(g);
  }
  const median = (xs) => {
    const v = xs.slice().sort((x, y) => x - y);
    const m = v.length >> 1;
    return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
  };
  /* Two samples is the floor. One gap is an anecdote, and a prediction drawn
     from it would be stated with the same confidence as one drawn from a
     fortnight — so below the floor there is NO prediction, and the chip falls
     back to saying what it knows rather than inventing what it does not. */
  const napWindowMin = gaps.length >= 2 ? median(gaps) : null;
  const napDueAt = wakeSince != null && napWindowMin != null
    ? wakeSince + napWindowMin * 60000 : null;
  const napDueInMin = napDueAt == null ? null : Math.round((napDueAt - now) / 60000);

  return {
    nights: nights.length,
    avgNightMin, avgIns, avgStretch,
    bedMean, bedSpread,
    wakeSince, wakeWindowMin,
    napWindowMin, napDueAt, napDueInMin,
    napSamples: gaps.length,
  };
}

/* HIS OWN NORMAL, per metric — the bands the expanded face reads against.
 *
 * The expanded view used to explain how each number was DERIVED: settling
 * against asleep, the intervention list, the honest lower and upper bounds.
 * That precision is right and survives below, but it is aimed at a reader who
 * does not trust the number yet. The question actually being asked of this
 * section every morning is "is that normal for him, and is the week going the
 * right way" — which is the band-and-meter vocabulary from Body, pointed at
 * Joel. It costs nothing extra to compute: the sessions are already derived
 * from the seven-day fetch, so his normal is free where every Apple Health band
 * needs a template mirror and a nightly ring buffer.
 *
 * A ring would be the wrong unit here for the reason it was wrong in Body: a
 * ring shows a fraction of a goal, and nobody sets a goal for how long a baby
 * sleeps. The night ring on the collapsed face survives precisely because it is
 * already scaled to HIS OWN average rather than to a number somebody picked.
 *
 * Mean ± one standard deviation, over the completed nights in the window.
 *
 * TWO NIGHTS IS THE FLOOR, the same floor the nap prediction uses: a band drawn
 * from one night is a claim about a baby stated with the confidence of a
 * fortnight. Below it there is no band, and `psHealthMeter` then draws the value
 * with NO TRACK AT ALL — which is the designed state, not a broken one.
 *
 * Each band carries a minimum half-width. Two reasons, and the second is the
 * one that bites: a band narrower than the noise in the measurement claims a
 * precision the door sensor does not have, and a perfectly consistent week
 * would produce a ZERO-WIDTH band, which `psHmDomain` correctly refuses — so
 * the meter would silently lose its rail on exactly the weeks it had the most
 * to say. */
function psNurseryNorms(sessions, opts) {
  const o = opts || {};
  const nights = (sessions || []).filter((s) => s.night && !s.active).slice(-(o.days || 7));
  const observed = nights.filter((s) => !s.manual);

  /* Bedtimes are shifted past midnight before anything is done with them, for
     the same reason `psNurseryStats` shifts them: a 00:20 bedtime is a late
     night, not an early one, and treating it as minute 20 drags the mean back
     eleven hours and reports a wild spread on a settled week. The meter
     compares a shifted value against a shifted band, so the rail never sees a
     raw clock minute. */
  const bedOf = (s) => {
    const d = new Date(s.from);
    const m = d.getHours() * 60 + d.getMinutes();
    return m < 720 ? m + 1440 : m;
  };

  const band = (xs, floor) => {
    if (xs.length < 2) return null;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    const half = Math.max(sd, floor);
    return { lo: m - half, hi: m + half, mean: m };
  };

  return {
    nights: nights.map((s) => ({
      day: s.day,
      from: s.from,
      asleep: s.asleepMinutes,
      bed: bedOf(s),
      longest: s.longestStretch,
      ins: s.interventions,
      edited: !!s.edited,
      manual: !!s.manual,
    })),
    asleep: band(nights.map((s) => s.asleepMinutes), 15),
    bed: band(nights.map(bedOf), 10),
    /* Door-derived, so hand-logged nights are not in these two — see
       psNurseryStats. A band is a claim about his normal, and a night nobody
       measured cannot narrow it or widen it. */
    longest: band(observed.map((s) => s.longestStretch), 20),
    ins: band(observed.map((s) => s.interventions), 0.5),
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

  /* One clock for the whole render path. Every nap fixture in the suite was
     anchored to `Date.now() - 3h`, which is a NAP in the afternoon and a NIGHT
     after nine — so six tests passed all day and failed every evening, and the
     suite could not be trusted at exactly the hour the nursery card matters
     most. An explicit seam is the fix; the fixtures set `_testNow`. */
  _nowMs() { return this._testNow == null ? Date.now() : this._testNow; },

  _nurserySessions(sec) {
    const h = this._nursery || {};
    const opts = Object.assign({}, sec, { now: this._nowMs() });
    const derived = psNurserySessions(h[sec.hatch], h[sec.door], opts);
    /* Hand-logged sessions join the derived ones BEFORE the corrections are
       applied, so one pipeline feeds every surface and the desk — which
       borrows this method — cannot end up showing a different set of sessions
       from the phone. A log supersedes anything derived that overlaps it. */
    const manual = psManualSessions(this._manualEntries(sec), opts);
    return psApplyNapEdits(psMergeManual(derived, manual),
      this._napEdits(sec), (sec.edits || {}).match_tolerance_min);
  },

  /* --- corrections --------------------------------------------------------
     Read straight out of hass rather than fetched: the store is an ordinary
     entity, it is in the watched set, and a write repaints the section on the
     state change it causes. There is nothing to keep in sync. */
  _napEditStore(sec) {
    const s = sec || this._nurserySection();
    return s && s.edits && s.edits.store;
  },

  _napEdits(sec) {
    const store = this._napEditStore(sec);
    if (!store || !this._hass) return [];
    return psParseNapEdits(pcState(this._hass, store));
  },

  /* --- away from the sensors ----------------------------------------------
     Both stores are ordinary entities in the watched set, so a write repaints
     the section on the state change it causes — the same contract the
     corrections store has, and the reason neither of these is fetched. */
  _manualCfg(sec) {
    const s = sec || this._nurserySection();
    return (s && s.manual) || {};
  },

  _manualStore(sec) { return this._manualCfg(sec).store; },

  _manualEntries(sec) {
    const store = this._manualStore(sec);
    if (!store || !this._hass) return [];
    return psParseManual(pcState(this._hass, store));
  },

  _awayStore(sec) { return this._manualCfg(sec).away_store; },

  /* "Nanny day" by default because that is what these days are here. It is
     config rather than a constant so a week away reads as one. */
  _awayLabel(sec) { return this._manualCfg(sec).away_label || "Nanny day"; },

  _awayDays(sec) {
    const store = this._awayStore(sec);
    if (!store || !this._hass) return [];
    return psParseAway(pcState(this._hass, store));
  },

  _isAwayDay(sec, dayKey) {
    return this._awayDays(sec).indexOf(dayKey) !== -1;
  },

  /* One write path for both stores, so the pruning rule is stated once. Both
     are capped at 255 characters and both are pruned to the window the card
     can still draw: an entry outside it has nothing left to render onto. */
  _manualWrite(sec, entries) {
    const store = this._manualStore(sec);
    if (!store || !this._hass) return;
    const floor = this._nowMs() - ((sec.days || 7) + 1) * 86400000;
    const keep = (entries || []).filter((e) => e.dur == null || e.start >= floor);
    this._hass.callService("input_text", "set_value",
      { entity_id: store, value: psWriteManual(keep) });
    this._last = null;
    this._render();
  },

  _awayWrite(sec, days) {
    const store = this._awayStore(sec);
    if (!store || !this._hass) return;
    const floor = new Date(this._nowMs() - ((sec.days || 7) + 1) * 86400000);
    const cut = psDayKey(floor);
    this._hass.callService("input_text", "set_value",
      { entity_id: store, value: psWriteAway((days || []).filter((d) => d >= cut)) });
    this._last = null;
    this._render();
  },

  /* The running hand-logged session, if there is one. At most one: a second
     Start while one is open would leave two sessions running with no way to
     tell which the Stop belonged to. */
  _manualLive(sec) {
    return this._manualEntries(sec).find((e) => e.dur == null) || null;
  },

  _manualStart() {
    const sec = this._nurserySection();
    if (!sec || !this._manualStore(sec) || this._manualLive(sec)) return;
    pcHaptic("medium");
    /* To the minute, because the store holds minutes — rounding it here rather
       than at the write is what keeps the elapsed figure on screen agreeing
       with the one that lands in the helper. */
    const start = Math.round(this._nowMs() / 60000) * 60000;
    this._manualWrite(sec, this._manualEntries(sec).concat([{ start, dur: null, kind: null }]));
  },

  /* Stopping is what records the session, so it is a completion rather than a
     destructive act and takes no arm — unlike stopping the Hatch, which ends
     the white noise in the room as well as the record. */
  _manualStop() {
    const sec = this._nurserySection();
    const live = sec && this._manualLive(sec);
    if (!live) return;
    pcHaptic("success");
    const dur = Math.max(0, Math.round((this._nowMs() - live.start) / 60000));
    this._manualWrite(sec, this._manualEntries(sec)
      .map((e) => (e.start === live.start ? { start: e.start, dur, kind: e.kind } : e)));
  },

  _manualAdd(from, to, kind) {
    const sec = this._nurserySection();
    if (!sec || !this._manualStore(sec)) return;
    const start = Math.round(from / 60000) * 60000;
    const dur = Math.max(0, Math.round((to - from) / 60000));
    pcHaptic("success");
    this._manualWrite(sec, this._manualEntries(sec)
      .filter((e) => Math.abs(e.start - start) > 60000)
      .concat([{ start, dur, kind: kind || null }]));
  },

  /* Matched on start within a minute rather than exactly, for the reason the
     corrections are: the session on screen carries the rounded start. */
  _manualDrop(start) {
    const sec = this._nurserySection();
    if (!sec || !this._manualStore(sec)) return;
    this._manualWrite(sec, this._manualEntries(sec)
      .filter((e) => Math.abs(e.start - start) > 60000));
  },

  _manualSet(oldStart, from, to, kind) {
    const sec = this._nurserySection();
    if (!sec || !this._manualStore(sec)) return;
    const start = Math.round(from / 60000) * 60000;
    this._manualWrite(sec, this._manualEntries(sec)
      .filter((e) => Math.abs(e.start - oldStart) > 60000 && Math.abs(e.start - start) > 60000)
      .concat([{ start, dur: Math.max(0, Math.round((to - from) / 60000)), kind: kind || null }]));
  },

  _awayToggle(dayKey) {
    const sec = this._nurserySection();
    if (!sec || !this._awayStore(sec)) return;
    const days = this._awayDays(sec);
    const on = days.indexOf(dayKey) !== -1;
    pcHaptic("selection");
    this._awayWrite(sec, on ? days.filter((d) => d !== dayKey) : days.concat([dayKey]));
  },

  /* --- the log sheet -------------------------------------------------------
   *
   * A sheet, like every other thing on this section you FIDDLE with rather than
   * read: it slides over the column instead of pushing the rings and the rail
   * down the screen while you count backwards to when he went down.
   *
   * Two ways in, because there are two situations. Away from home you press
   * Start when he goes down and Stop when he wakes, and the section behaves
   * exactly as it does at home — a live ring, a live chip, a bar on the day
   * rail. Coming back from an afternoon out you log the nap that already
   * happened, from two clock steppers.
   *
   * The steppers move in FIFTEEN minutes, where the correction sheet moves in
   * five. They are answering different questions: correcting a session is
   * reading a rail to decide which door trip ended the put-down, and logging
   * one is remembering roughly when he went down in somebody else's house.
   * Five-minute steps there would be false precision bought with three times
   * the taps.
   */
  _openNurseryLog() {
    const sec = this._nurserySection();
    if (!sec || !this._manualStore(sec)) return;
    const now = this._nowMs();
    const q = 15 * 60000;
    /* Defaults that are one nap wide and end now, because the overwhelmingly
       common case is logging the nap that has just finished. Quantised to the
       step so the first tap moves a round number rather than un-rounding one. */
    const to = Math.round(now / q) * q;
    this._log = { from: to - 90 * 60000, to, kind: null };
    this._sheet = "joellog";
    this._armed = null;
    this._last = null;
    this._render();
  },

  _logStep(field, delta) {
    const e = this._log;
    if (!e) return;
    const next = Object.assign({}, e);
    next[field] = e[field] + delta * 60000;
    /* Woke can never precede fell-asleep, and a session cannot be logged into
       the future — there is nothing to remember about sleep that has not
       happened. Pushing one field past the other carries the other with it
       rather than refusing the tap, exactly as the correction sheet does. */
    const cap = Math.round(this._nowMs() / 60000) * 60000;
    if (next.to > cap) next.to = cap;
    if (next.from > cap) next.from = cap;
    if (field === "from" && next.from > next.to) next.to = next.from;
    if (field === "to" && next.to < next.from) next.from = next.to;
    if (next.from !== e.from || next.to !== e.to) pcHaptic("selection");
    this._log = next;
    this._last = null;
    this._render();
  },

  _nurseryLogHtml() {
    const sec = this._nurserySection();
    const e = this._log;
    if (!sec || !this._manualStore(sec) || !e) return "";

    const now = this._nowMs();
    const live = this._manualLive(sec);
    const label = this._awayLabel(sec);
    const mins = Math.max(0, Math.round((e.to - e.from) / 60000));

    /* Whichever of the two is not the situation you are in is still worth
       seeing — the sheet says which one is live rather than hiding the other
       and leaving you to wonder where it went. */
    const running = live
      ? `<div class="ps-jlrun">
          <span class="ps-grow"><b>Logging since ${psEsc(psClock(live.start))}</b>
            <span class="ps-flat">${psEsc(psHM(Math.max(0, Math.round((now - live.start) / 60000))))} so far</span></span>
          <button class="ps-btn primary" type="button" id="ps-jlstop">Stop</button>
        </div>`
      : `<div class="ps-jlrun">
          <span class="ps-grow"><b>He is going down now</b>
            <span class="ps-flat">start the clock and stop it when he wakes</span></span>
          <button class="ps-btn primary" type="button" id="ps-jlstart">Start</button>
        </div>`;

    const steppers = ["from", "to"].map((f) => `<div class="ps-ner">
        <span class="ps-l">${f === "from" ? "Fell asleep" : "Woke"}</span>
        <button class="ps-step" type="button" data-logstep="${f}:-15"
          aria-label="${f === "from" ? "Fell asleep" : "Woke"} fifteen minutes earlier">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M5 12h14"/></svg></button>
        <b>${psEsc(psClock(e[f]))}</b>
        <button class="ps-step" type="button" data-logstep="${f}:15"
          aria-label="${f === "from" ? "Fell asleep" : "Woke"} fifteen minutes later">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M12 5v14M5 12h14"/></svg></button>
      </div>`).join("");

    /* Today and yesterday, and no further back. A nanny day is marked either
       on the day or the morning after, and a date picker for a case nobody has
       is more surface than the thing it serves. */
    const dayRow = (offset, name) => {
      const d = new Date(now);
      d.setDate(d.getDate() - offset);
      const key = psDayKey(d);
      const on = this._isAwayDay(sec, key);
      return `<button class="ps-jlday${on ? " on" : ""}" type="button" data-away="${key}">
          <span>${psEsc(name)}</span><b>${on ? psEsc(label) : "Home"}</b></button>`;
    };
    const away = !this._awayStore(sec) ? "" : `<div class="ps-jlsec">Out of the house</div>
      <div class="ps-jldays">${dayRow(0, "Today")}${dayRow(1, "Yesterday")}</div>
      <div class="ps-note">Marks the day as spent elsewhere: no missing naps, no
        overdue nap window. It records no sleep — only that he was not here.</div>`;

    return `${running}
      <div class="ps-jlsec">Log a session that already happened</div>
      ${steppers}
      <div class="ps-nesum"><b>${psEsc(psHM(mins))}</b> asleep
        <span class="ps-flat">· ${psEsc(psClock(e.from))} – ${psEsc(psClock(e.to))}</span></div>
      <div class="ps-btns">
        <button class="ps-btn primary" type="button" id="ps-jladd"${
  mins <= 0 ? " disabled" : ""}>Add ${psEsc(this._logKindWord(sec, e))}</button>
      </div>
      <div class="ps-note">Hand-logged sleep is marked wherever it shows, and it
        reports no wake-ups — nobody was watching the door.</div>
      ${away}`;
  },

  /* Named for what it will become, so the button is not a promise the day rail
     then breaks. The rule is the derivation's own: the hour it started. */
  _logKindWord(sec, e) {
    const nightAfter = sec.night_after_hour == null ? 18 : sec.night_after_hour;
    const morning = sec.morning_hour == null ? 5 : sec.morning_hour;
    const hr = new Date(e.from).getHours();
    return hr >= nightAfter || hr < morning ? "night" : "nap";
  },

  _bindNurseryLog() {
    this._each("[data-jlog]", (el) => {
      el.addEventListener("click", (ev) => { ev.stopPropagation(); this._openNurseryLog(); });
    });
    this._each("[data-logstep]", (el) => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const p = String(el.dataset.logstep).split(":");
        this._logStep(p[0], parseInt(p[1], 10));
      });
    });
    this._each("[data-away]", (el) => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._awayToggle(el.dataset.away);
      });
    });
    this._one("ps-jlstart", (el) =>
      el.addEventListener("click", (ev) => { ev.stopPropagation(); this._manualStart(); }));
    this._one("ps-jlstop", (el) =>
      el.addEventListener("click", (ev) => { ev.stopPropagation(); this._manualStop(); }));
    this._one("ps-jladd", (el) => el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const e = this._log;
      if (!e || e.to <= e.from) return;
      this._manualAdd(e.from, e.to, e.kind);
      this._sheet = null;
      this._log = null;
      this._last = null;
      this._render();
    }));
  },

  _openNapEdit(start) {
    const sec = this._nurserySection();
    if (!sec || !this._napEditStore(sec)) return;
    const s = this._nurserySessions(sec).find((x) => x.from === start);
    if (!s) return;
    /* The editor holds offsets in minutes from the session start, which is what
       the store holds too — so Save is a write and not a second derivation. */
    const d = this._napEditDefaults(s);
    this._napEdit = { start: s.from, from: d.from, to: d.to };
    this._sheet = "napedit";
    this._armed = null;
    this._render();
  },

  /* Where the editor opens, and the figure it is compared against — ONE
     derivation, read by the opener, the stepper's clamp and the renderer alike.
     Deriving them separately is how the sheet came up reading "34m asleep ·
     derived 33m" before anything had been touched: two roundings of the same
     pair of timestamps, disagreeing by a minute, presented as a correction the
     card had made by itself.

     The span is FLOORED because the clock labels drop seconds. Rounding a
     42m30s session up to 43 offers a wake time one minute AFTER the rail's own
     right-hand label — the card contradicting itself, on one screen, about when
     the sound machine stopped. */
  _napEditDefaults(s) {
    const span = Math.max(1, Math.floor((s.to - s.from) / 60000));
    const clamp = (t) => Math.max(0, Math.min(span, Math.round((t - s.from) / 60000)));
    return { span, from: clamp(s.settledAt), to: clamp(s.wokeAt == null ? s.to : s.wokeAt) };
  },

  _napEditSpan() {
    const sec = this._nurserySection();
    const e = this._napEdit;
    if (!sec || !e) return null;
    const s = this._nurserySessions(sec).find((x) => Math.abs(x.from - e.start) < 60000);
    return s || null;
  },

  /* One step is five minutes. A finer step would be false precision — the
     inputs are a door magnet and a speaker, and nobody remembers the minute. */
  _napEditStep(field, delta) {
    const e = this._napEdit;
    const s = this._napEditSpan();
    if (!e || !s) return;
    const span = this._napEditDefaults(s).span;
    const next = Object.assign({}, e);
    next[field] = Math.max(0, Math.min(span, e[field] + delta));
    /* Woke can never precede fell-asleep. Pushing one past the other carries
       the other with it rather than refusing the tap, so the control keeps
       answering the thumb. */
    if (field === "from" && next.from > next.to) next.to = next.from;
    if (field === "to" && next.to < next.from) next.from = next.to;
    /* Only a step that MOVED gets a tick. Both fields clamp to the session, so
       pressing on at either end is a control that has run out of room — and a
       buzz there would say the value changed when it did not. */
    if (next.from !== e.from || next.to !== e.to) pcHaptic("selection");
    this._napEdit = next;
    this._last = null;
    this._render();
  },

  _napEditWrite(entry) {
    const sec = this._nurserySection();
    const store = this._napEditStore(sec);
    if (!store || !this._hass) return;
    /* Prune anything older than the window the recorder is asked for: an
       override for a session that can no longer be derived will never match
       again, and it is only taking room in a 255-character store. */
    const floor = this._nowMs() - ((sec.days || 7) + 1) * 86400000;
    const keep = this._napEdits(sec)
      .filter((x) => x.start >= floor && Math.abs(x.start - entry.start) > 60000);
    const list = entry.drop ? keep : keep.concat([entry]);
    this._hass.callService("input_text", "set_value",
      { entity_id: store, value: psWriteNapEdits(list) });
    this._sheet = null;
    this._napEdit = null;
    this._armed = null;
    this._last = null;
    this._render();
  },

  _napEditSave() {
    const e = this._napEdit;
    if (!e) return;
    /* A hand-logged session is corrected where it LIVES. Writing an override
       into the corrections store instead would leave the log saying one thing
       and the override saying another, in two 255-character helpers, for a
       session that has no derivation to override in the first place. */
    const s = this._napEditSpan();
    if (s && s.manual) {
      this._manualSet(s.from, s.from + e.from * 60000, s.from + e.to * 60000, s.kind);
      this._sheet = null;
      this._napEdit = null;
      this._armed = null;
      this._last = null;
      this._render();
      return;
    }
    /* `success` — the one place on the card that earns it. The correction has
       landed in the helper and every number downstream is about to be
       recomputed from it, which is a thing completing rather than a control
       being pressed. */
    pcHaptic("success");
    this._napEditWrite({ start: e.start, from: e.from, to: e.to });
  },

  /* Back to what the derivation says. Not the same as deleting the session —
     this drops the correction, that records one. */
  _napEditReset() {
    const e = this._napEdit;
    if (!e) return;
    this._napEditWrite({ start: e.start, drop: true });
  },

  _napEditDelete() {
    const e = this._napEdit;
    if (!e) return;
    /* Removing a hand-logged session deletes the log. Recording a deletion of
       something that was only ever a record is two entries saying nothing. */
    const s = this._napEditSpan();
    if (s && s.manual) {
      this._manualDrop(s.from);
      this._sheet = null;
      this._napEdit = null;
      this._armed = null;
      this._render();
      return;
    }
    this._napEditWrite({ start: e.start, del: true });
  },

  /* The correction sheet.
   *
   * A sheet rather than an in-place expansion for the reason the schedule
   * editor is one: it slides over the column instead of pushing the list you
   * were reading down the screen. It draws the session it is editing at the
   * top — the Hatch span, the door trips, and the window being set over them —
   * because the trips are the evidence you are correcting against, and reading
   * them off a rail is the whole reason you know the 9:42 one was a re-settle.
   */
  _napEditHtml() {
    const sec = this._nurserySection();
    const e = this._napEdit;
    const s = this._napEditSpan();
    if (!sec || !e || !s) return "";

    const d = this._napEditDefaults(s);
    const span = d.span;
    const at = (m) => psClock(s.from + m * 60000);
    const derived = Math.max(0, d.to - d.from);
    const now = Math.max(0, e.to - e.from);

    const PAD = 3;
    const x = (m) => PAD + (Math.max(0, Math.min(span, m)) / span) * (100 - PAD * 2);
    const fx = x(e.from);
    const tx = x(e.to);
    const ticks = (s.doorAt || s.events || []).map((t) => {
      const gx = x(Math.round((t - s.from) / 60000));
      return `<rect x="${(gx - 0.32).toFixed(2)}" y="4" width="0.64" height="26" rx="0.3"
        fill="var(--ps-warn)"/>`;
    }).join("");

    return `<div class="ps-neb">
        <div class="ps-railbox">
          ${/* Sized inline, like the day rail. An SVG with no width/height
                falls back to 300x150 and lands on top of the row below it —
                the section's own rails are sized by a `.ps-hyp svg` rule this
                sheet is not inside. */""}
          <svg viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"
            style="width:100%;height:34px;display:block">
            <rect x="${PAD}" y="11" width="${(100 - PAD * 2).toFixed(2)}" height="12" rx="2"
              fill="rgba(255,255,255,.06)"/>
            <rect x="${fx.toFixed(2)}" y="9" width="${Math.max(0.5, tx - fx).toFixed(2)}"
              height="16" rx="2" fill="var(--ps-deep)" opacity="0.9"/>
            ${ticks}
          </svg>
          <div class="ps-railticks"><span>${psEsc(psClock(s.from))}</span>
            <span>${psEsc(psClock(s.to))}</span></div>
        </div>
      </div>

      ${["from", "to"].map((f) => `<div class="ps-ner">
        <span class="ps-l">${f === "from" ? "Fell asleep" : "Woke"}</span>
        <button class="ps-step" type="button" data-napstep="${f}:-5"
          aria-label="${f === "from" ? "Fell asleep" : "Woke"} five minutes earlier">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M5 12h14"/></svg></button>
        <b>${psEsc(at(e[f]))}</b>
        <button class="ps-step" type="button" data-napstep="${f}:5"
          aria-label="${f === "from" ? "Fell asleep" : "Woke"} five minutes later">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M12 5v14M5 12h14"/></svg></button>
      </div>`).join("")}

      ${/* The derived figure is named beside the corrected one, and only while
            they differ. A card that quietly replaced a measurement with a
            correction would be a card you could not check. */""}
      ${/* Named for what it actually is. On an unedited session the comparison
            figure is the derivation; on one already corrected, `s` carries the
            correction, so calling that "derived" would be a plain lie about
            where the number came from. */""}
      <div class="ps-nesum"><b>${psEsc(psHM(now))}</b> asleep${
        now === derived ? "" : ` <span class="ps-flat">· ${
          s.manual ? "logged" : s.edited ? "saved" : "derived"} ${psEsc(psHM(derived))}</span>`}</div>

      <div class="ps-btns">
        <button class="ps-btn primary" type="button" id="ps-nesave">Save</button>
        ${/* "Didn't sleep" records a real zero over a derivation that claimed
              sleep. There is no derivation behind a hand-logged session, so the
              honest verb for one that should not be there is Remove — which is
              already on this row. */""}
        ${s.manual ? "" : `<button class="ps-btn" type="button" id="ps-nenone">Didn't sleep</button>`}
        ${s.edited && !s.manual ? `<button class="ps-btn" type="button" id="ps-nereset">Undo edit</button>` : ""}
        <button class="ps-btn danger ${this._armed === "napdel" ? "armed" : ""}" type="button"
          ${/* "Not a nap" reads wrong on a night, and "Didn't happen" is a
                hair from "Didn't sleep" beside it. Remove says what it does for
                both kinds. */""}
          data-arm="napdel">${this._armed === "napdel" ? "Tap again" : "Remove"}</button>
      </div>
      ${/* The note only says what is true of the buttons actually on screen —
            offering to undo an edit that does not exist is the same shape of
            noise as a caption under every meter that has no band. */""}
      <div class="ps-note">${s.manual
        ? (s.active
          ? "Hand-logged and still running. Saving a wake time ends it."
          : "Hand-logged. Saving rewrites the log itself — there is no derivation underneath.")
        : s.edited
          ? "Corrected by hand. Undo puts the derived times back."
          : "Correcting this changes what the card reports, not what the recorder holds."}</div>`;
  },

  /* Long press, not tap. The rows are a list you read far more often than you
     correct, and a tap target on every one of them would make scrolling past a
     mistake the likeliest interaction. 380ms matches the graph scrub and the
     light row, so there is exactly one press-and-hold on the card.
     Eight pixels of movement cancels it — a hold that starts a scroll is a
     scroll. */
  _bindNapEdit() {
    this._each("[data-napedit]", (el) => {
      let hold = null, x0 = 0, y0 = 0;
      const cancel = () => { if (hold) { clearTimeout(hold); hold = null; } };
      el.addEventListener("pointerdown", (ev) => {
        x0 = ev.clientX; y0 = ev.clientY;
        cancel();
        hold = setTimeout(() => {
          hold = null;
          /* The third of the three holds, and the one most in need of a tick:
             rows are read far more often than they are corrected, so nothing
             about a nap row suggests it can be held at all. */
          pcHaptic("medium");
          this._openNapEdit(+el.dataset.napedit);
        }, 380);
      });
      el.addEventListener("pointermove", (ev) => {
        if (hold && (Math.abs(ev.clientX - x0) > 8 || Math.abs(ev.clientY - y0) > 8)) cancel();
      });
      el.addEventListener("pointerup", cancel);
      el.addEventListener("pointercancel", cancel);
      el.addEventListener("contextmenu", (ev) => ev.preventDefault());
    });

    this._each("[data-napstep]", (el) => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const p = String(el.dataset.napstep).split(":");
        this._napEditStep(p[0], parseInt(p[1], 10));
      });
    });

    this._one("ps-nesave", (el) =>
      el.addEventListener("click", (ev) => { ev.stopPropagation(); this._napEditSave(); }));
    this._one("ps-nereset", (el) =>
      el.addEventListener("click", (ev) => { ev.stopPropagation(); this._napEditReset(); }));
    /* Set, not sent: the values land in the editor and Save commits them, so
       the one destructive-looking button on the sheet is still reversible with
       a glance at the rail before you commit. */
    this._one("ps-nenone", (el) => el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const s = this._napEditSpan();
      if (!s || !this._napEdit) return;
      const span = Math.round((s.to - s.from) / 60000);
      this._napEdit = { start: this._napEdit.start, from: span, to: span };
      this._last = null;
      this._render();
    }));
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
    /* The asleep bar ends where he WOKE, which is the end of the Hatch span
       unless a correction moved it in. Time in the room after that is left as
       bare track rather than coloured asleep — drawing it as sleep is the same
       lie as reporting the minutes. */
    const wx = x(night.wokeAt == null ? night.to : night.wokeAt);
    let bars = `<rect x="${PAD}" y="14" width="${Math.max(0.4, sx - PAD).toFixed(2)}"
        height="18" rx="2" fill="var(--ps-light)" opacity="0.5"/>
      <rect x="${sx.toFixed(2)}" y="10" width="${Math.max(0.4, wx - sx).toFixed(2)}"
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
    /* Labelled at the hours the gridlines actually fall on, with the true ends
       either side — evenly spacing three captions across a rail whose axis is
       not evenly divided points every one of them at the wrong time. */
    const marks = [fmt(from)];
    for (let hh = step; hh < hours; hh += step) {
      const at = new Date(from + hh * 3600000);
      marks.push(at.toLocaleTimeString([], { hour: "numeric" }));
    }
    marks.push(night.active ? "now" : fmt(to));
    const hourLabels = marks.map((m) => `<span>${psEsc(m)}</span>`).join("");
    return `<div class="ps-hyp">
        <div class="ps-hypt" data-readout="night">
          <span class="ps-lbl">${night.active ? "Tonight" : "Last night"}</span>
          <span>${night.manual ? `<i style="background:var(--ps-deep)"></i>asleep`
    : `<i style="background:var(--ps-light);opacity:.5"></i>settling<i style="background:var(--ps-deep);margin-left:9px"></i>asleep`}</span>
          ${/* A hand-logged night has no door behind it. "0 in" would be a
                claim; naming the source is the honest thing in the same slot. */""}
          <b>${night.manual ? "logged" : `${night.interventions} in`}</b>
        </div>
        <div class="ps-railbox">
          <div class="ps-hypplot" data-scrub="night">
            <svg viewBox="0 0 100 46" preserveAspectRatio="none" aria-hidden="true">
              ${grid}${bars}${ticks}
            </svg>
            <div class="ps-cross" hidden></div>
          </div>
          <div class="ps-railticks">${hourLabels}</div>
        </div>
      </div>`;
  },

  /* The week of nights, as a column per night with HIS OWN BAND behind them.
   *
   * A meter answers "is this normal" for one night at one moment; it cannot
   * answer "is it trending", and the two together were the whole ask. So the
   * headline metric — how long he slept — gets the plot, and the supporting
   * facts get meters underneath. "Slept" is deliberately NOT also a meter: the
   * strip already is one, and a meter beside it would be the chip repeating the
   * line next to it for the sixth time.
   *
   * A night with no data draws HATCHED, never as a zero column. A missing night
   * and a night of no sleep are different facts, and a strip is the surface
   * where a zero is most convincing — a short column reads as a bad night at a
   * glance, and the recorder falling over for a day would look like one.
   *
   * The domain is padded BELOW the minimum, the lesson the hourly weather strip
   * taught: his worst night sitting exactly on the baseline draws as a hairline
   * and reads as no data, which is the one thing the hatching exists to keep
   * apart from a real reading.
   *
   * It does not scrub. The night rail does, because a night has a shape you
   * read along; this has seven values and they are each one number, already
   * captioned by the day underneath. The day rail beside it is non-interactive
   * for the same reason, so a plain railbox is established here as a plot you
   * read rather than one you press — which is what keeps it off the affordance
   * sweep's list. */
  _nurseryWeek(norms, sec, awayDays) {
    const b = norms.asleep;
    const nights = norms.nights;
    if (!nights.length) return "";
    const isAway = (k) => (awayDays || []).indexOf(k) !== -1;

    const days = sec.days || 7;
    const byDay = {};
    nights.forEach((n) => { byDay[n.day] = n; });

    /* Slots END YESTERDAY, not at the most recent night on record. Sliding the
       strip up to the last night he actually has would quietly redraw a gap as
       a full week and hide the very thing the hatching is for. */
    const midnight = new Date(this._nowMs());
    midnight.setHours(0, 0, 0, 0);
    const slots = [];
    for (let i = days; i >= 1; i -= 1) {
      const d = new Date(midnight);
      d.setDate(d.getDate() - i);
      slots.push({ key: psDayKey(d), date: d });
    }

    const vals = nights.map((n) => n.asleep);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (b) { lo = Math.min(lo, b.lo); hi = Math.max(hi, b.hi); }
    const pad = Math.max(20, (hi - lo) * 0.18);
    lo = Math.max(0, lo - pad);
    hi += pad;
    const y = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

    const lastKey = slots.length ? slots[slots.length - 1].key : null;
    const cols = slots.map((sl) => {
      const n = byDay[sl.key];
      /* A night away and a night the recorder lost are both empty and are not
         the same fact. The hatch says "this should be here and is not"; the
         away slot is quieter still and says "he was not here", which is the
         one thing that stops a fortnight of travel reading as two weeks of
         broken sensors. */
      if (!n) {
        return isAway(sl.key)
          ? `<div class="ps-jwb away" title="${psEsc(this._awayLabel(sec))}"><i></i></div>`
          : `<div class="ps-jwb miss"><i></i></div>`;
      }
      const last = sl.key === lastKey;
      const hgt = y(n.asleep);
      /* The corrected pip rides on the BAR, not on the column. Pinned to the
         column it sat at the top of the plot with nothing under it — two of
         them floating over the middle of the week, attached to nothing a reader
         could connect them to. */
      const pip = n.manual ? ` hand` : n.edited ? "" : null;
      return `<div class="ps-jwb${last ? " last" : ""}${n.manual ? " logged" : ""}" title="${
        psEsc(psHM(n.asleep))}${n.manual ? " · hand-logged" : ""}">
          <i style="height:${hgt.toFixed(1)}%"></i>${
        pip == null ? "" : `<span class="ps-edd wk${pip}" style="bottom:calc(${
          hgt.toFixed(1)}% + 4px)" title="${n.manual ? "Hand-logged" : "Corrected"}"></span>`}</div>`;
    }).join("");

    const labels = slots.map((sl) => `<span class="${sl.key === lastKey ? "last" : ""}${
      isAway(sl.key) && !byDay[sl.key] ? " away" : ""}">${
      psEsc(sl.date.toLocaleDateString([], { weekday: "narrow" }))}</span>`).join("");

    /* A week with three days away is not a week with three nights missing, and
       the count line was the loudest place that lie was told. Away days with no
       night come out of the denominator and are named separately. */
    const awayN = slots.filter((sl) => isAway(sl.key) && !byDay[sl.key]).length;

    const bandEl = !b ? "" : `<div class="ps-jwband" style="bottom:${y(b.lo).toFixed(1)}%;height:${
      Math.max(1, y(b.hi) - y(b.lo)).toFixed(1)}%"></div>
      <div class="ps-jwavg" style="bottom:${y(b.mean).toFixed(1)}%"></div>`;

    return `<div class="ps-hyp">
        <div class="ps-hypt">
          <span class="ps-lbl">How the week is going</span>
          <span class="ps-grow"></span>
          <b>${nights.length} of ${days - awayN} nights${awayN ? ` · ${awayN} away` : ""}</b>
        </div>
        <div class="ps-railbox">
          <div class="ps-jwk">${bandEl}<div class="ps-jwbars">${cols}</div></div>
          <div class="ps-jwx">${labels}</div>
        </div>
      </div>`;
  },

  /* One line, and only where it can say something the plot above it cannot.
   *
   * The plot shows last night's column against the band; this says what that
   * MEANS as a comparison — the distance from his usual, or how long the good
   * run has been going. Both are arithmetic you would otherwise do by eye, which
   * is the test a roll-up has to pass to earn a line at all. With no band there
   * is nothing to compare against and the line is DROPPED rather than filled
   * with a hedge. */
  _nurseryVerdict(norms) {
    const b = norms.asleep;
    const ns = norms.nights;
    if (!b || !ns.length) return "";
    const last = ns[ns.length - 1];

    if (last.asleep < b.lo) {
      return `<div class="ps-jvd">Last night ran <em class="w">${
        psEsc(psHM(Math.round(b.mean - last.asleep)))} short</em> of his usual.</div>`;
    }
    if (last.asleep > b.hi) {
      return `<div class="ps-jvd">Last night ran <em>${
        psEsc(psHM(Math.round(last.asleep - b.mean)))} longer</em> than his usual.</div>`;
    }
    let streak = 0;
    for (let i = ns.length - 1; i >= 0 && ns[i].asleep >= b.lo && ns[i].asleep <= b.hi; i -= 1) streak += 1;
    return `<div class="ps-jvd"><em>Normal for him</em>${
      streak > 1 ? ` — ${streak} nights running inside his usual range` : ""}.</div>`;
  },

  /* Today at a glance: the tail of last night, each nap where it fell, now,
     and tonight's expected bedtime as a ghost. Answers "are we on schedule"
     without a single number. */
  _nurseryDayRail(sessions, todayKey, bedMean) {
    /* 6am to 10pm, not midnight to midnight: a whole-day axis spends a third
       of its width on hours nothing ever happens in, which squeezes the naps
       into slivers. The tail of last night and the head of tonight still land
       inside it. */
    const day = new Date(this._nowMs()); day.setHours(0, 0, 0, 0);
    const t0 = day.getTime() + 6 * 3600000;
    const t1 = day.getTime() + 22 * 3600000;
    const x = (t) => Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100));

    let bars = "";
    (sessions || []).forEach((s) => {
      const end = psWokeAt(s);
      if (end < t0 || s.from > t1) return;
      const a = x(s.from);
      const b = x(end);
      const short = !s.night && s.asleepMinutes < 30;
      bars += `<rect x="${a.toFixed(2)}" y="6" width="${Math.max(0.5, b - a).toFixed(2)}"
        height="6" rx="2" fill="${s.night ? "var(--ps-deep)" : short ? "var(--ps-warn)" : "var(--ps-light)"}"
        opacity="${s.night ? 0.75 : 1}"/>`;
    });

    /* The ghost is placed on the SAME axis as everything else on this rail.
       It was `(bedMean / 1440) * 100`, which is a position on a midnight-to-
       midnight axis — and this axis runs 6am to 10pm, so a 7:23 PM bedtime drew
       at 80.7% where it belongs at 83.6%: the expected bedtime marker sat half
       an hour early, every day, with nothing to give it away. Surfacing bedtime
       consistency as a metric is what made it visible. */
    const ghost = bedMean == null ? "" : (() => {
      const gx = Math.max(0, Math.min(97, x(day.getTime() + bedMean * 60000) - 3));
      return `<rect x="${gx.toFixed(2)}" y="3.5" width="6" height="11" rx="1.6" fill="none"
        stroke="var(--ps-deep)" stroke-width="0.6" stroke-dasharray="1.6 1.4"/>`;
    })();

    const nx = x(this._nowMs());
    return `<div class="ps-hyp">
        <div class="ps-hypt"><span class="ps-lbl">Today</span></div>
        <div class="ps-railbox">
          <svg viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true"
            style="width:100%;height:18px;display:block">
            <rect x="0" y="6" width="100" height="6" rx="2" fill="rgba(255,255,255,.05)"/>
            ${bars}${ghost}
            <line x1="${nx.toFixed(2)}" y1="1.5" x2="${nx.toFixed(2)}" y2="16.5"
              stroke="var(--ps-text)" stroke-width="0.8"/>
          </svg>
          <div class="ps-railticks">
            <span>6 AM</span><span>10</span><span>2 PM</span><span>6</span><span>10 PM</span>
          </div>
        </div>
      </div>`;
  },

  _secNursery(sec) {
    const h = this._hass;
    const playing = pcState(h, sec.hatch) === "playing";
    const doorOpen = pcState(h, sec.door) === "on";

    const loaded = !!this._nursery;
    const err = this._nurseryErr;
    const sessions = loaded ? this._nurserySessions(sec) : [];
    const stats = psNurseryStats(sessions, { now: this._nowMs(), days: sec.days || 7 });

    const live = sessions.find((s) => s.active);
    const past = sessions.filter((s) => !s.active);
    const lastNight = [...past].reverse().find((s) => s.night) || null;
    const nightSession = live && live.night ? live : lastNight;

    const todayKey = psDayKey(new Date(this._nowMs()));
    const todayNaps = sessions.filter((s) => !s.night && s.day === todayKey);
    const napMins = todayNaps.reduce((a, s) => a + s.asleepMinutes, 0);
    const catnapUnder = sec.catnap_under_min == null ? 30 : sec.catnap_under_min;
    const napTarget = (sec.nap_target_min == null ? 60 : sec.nap_target_min) * 1;

    /* A corrected figure must never look like a measured one — the same rule
       that keeps a zero apart from a missing reading, one level up. Every
       surface that can show an edited session carries the mark. */
    const editable = !!this._napEditStore(sec) || !!this._manualStore(sec);
    /* Two marks, one rule. A CORRECTED figure is a filled dot; a HAND-LOGGED
       one is the same dot hollowed out. Both are the accent rather than a
       warning colour, because neither is a fault — one is a fact the sensors
       could not reach and the other is a fact they were not present for — and
       hollow reads as "there is nothing measured inside this" without needing
       a second hue on a card that already spends five. */
    const edd = (s) => (!s ? "" : s.manual
      ? `<span class="ps-edd hand" title="Hand-logged"></span>`
      : s.edited ? `<span class="ps-edd" title="Corrected"></span>` : "");

    /* A day he was not here. It records no sleep — the nanny is not going to
       be asked to log naps — so what it does is stop the card treating an
       absence as a fault: no missing naps, no overdue nap window, no hatched
       night reading like the recorder fell over. The absence stays on screen
       and stops being an alarm. */
    const away = this._isAwayDay(sec, todayKey);
    const awayLabel = this._awayLabel(sec);

    const wifiOk = !sec.hatch_wifi || pcState(h, sec.hatch_wifi) === "on";
    const clock = (m) => (m == null ? "—"
      : `${((Math.floor(m / 60) % 12) || 12)}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`);

    /* Chip - what is true right now, never what the history says.
     *
     * The door deliberately does NOT appear here. It is opened several times a
     * day for reasons nobody is tracking, and while it was a chip state it
     * displaced the one number that matters when he is up: how long he has
     * been awake and since when. That is what decides whether the next nap is
     * due, so that is what the chip carries. */
    let chipCls = "";
    let chipTxt = "Awake";
    if (playing && live) {
      chipCls = live.hadExit ? "deep" : "lt";
      /* During the NIGHT the ring under this chip already reads the same
         minutes — "Asleep 2h 51m" sat three centimetres above "2h 51m
         TONIGHT" all night, which is when you actually look at it. The rule
         had been applied to the awake case and missed here.
         So on the night the chip carries the thing the ring cannot: how many
         times somebody has had to go in. That is the number you want at 2am,
         and zero is worth saying out loud rather than leaving blank.
         A nap is different — the ring is showing last night, so the nap's own
         asleep time is new information and stays. */
      const isNight = !!(live === nightSession && nightSession.active);
      chipTxt = !live.hadExit ? `Settling ${psHM(live.minutes)}`
        : isNight ? (live.interventions
          ? `${live.interventions} wake-up${live.interventions > 1 ? "s" : ""}`
          : "Undisturbed")
          : `Asleep ${psHM(live.asleepMinutes)}`;
      if (isNight && live.interventions) chipCls = "lt";
    } else if (playing) {
      chipCls = "deep"; chipTxt = "Asleep";
    } else if (away) {
      /* The wake window is measured from a session that ENDED here, and on a
         day he spent somewhere else there is no such session — so "Nap overdue
         6h" is arithmetic on a number that was never a fact. The chip says
         where he is instead, which is the one thing that explains every empty
         slot underneath it. */
      chipTxt = awayLabel;
    } else if (stats.wakeWindowMin != null) {
      /* Awake: the chip answers WHEN THE NEXT NAP IS DUE.
       *
       * It used to read "Awake 2h 15m · since 3:15 PM" — both true, both
       * already available (the expanded list has "Awake for", and the wake
       * time is the end of the row above it), and neither of them the
       * question. The question is whether the next nap is due, and the wake
       * window is only the input to it.
       *
       * Three readings, because how you use this changes with how close it is.
       * Far out you are planning around it and want the clock time; close to
       * it, or past it, the clock time is noise and the urgency is the fact.
       * Past due is worth saying plainly — an overshot window is the thing
       * that makes the next put-down hard, so it is a warn.
       *
       * With too few samples to predict, this falls through to what it used to
       * say. A chip that asks for a value and does not get one is DROPPED
       * rather than filled with a placeholder — and here the honest fallback
       * is the awake time, which is a fact rather than a guess. */
      /* A prediction landing in the evening is not a nap, it is BEDTIME.
       *
       * After the last nap of the day the wake window runs into the night, and
       * the median gap would cheerfully report "Nap due ~7:45 PM" for what is
       * actually the put-down — inventing a fourth nap out of arithmetic, the
       * same mistake as drawing a ring for a nap that has not happened. The
       * night boundary is the one that decides it, exactly as it decides a
       * session's kind. The status line beside this already carries
       * "bedtime ~7:13 PM", so the chip must NOT say it a second time: past
       * the boundary it falls back to the awake time. */
      const nightAfter = sec.night_after_hour == null ? 18 : sec.night_after_hour;
      const dueIsNight = stats.napDueAt != null
        && new Date(stats.napDueAt).getHours() >= nightAfter;
      const due = dueIsNight ? null : stats.napDueInMin;
      if (due == null) {
        chipTxt = `Awake ${psHM(stats.wakeWindowMin)} · since ${psClock(stats.wakeSince)}`;
      } else if (due <= -10) {
        chipCls = "warn"; chipTxt = `Nap overdue ${psHM(-due)}`;
      } else if (due <= 10) {
        chipCls = "lt"; chipTxt = "Nap due now";
      } else {
        chipTxt = `Nap due ~${psClock(stats.napDueAt)}`;
      }
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
      [[nightMins / maxMins, "url(#ps-aur)"]],
      avg ? Math.min(1, avg / maxMins) : null);

    /* Nap rings. No slot is drawn for a nap that has not happened — two short
       naps make a third possible, but only going down a third time makes it
       real, and the card has no business claiming more than it can see. */
    /* 52px was sized against "36m". An hour-crossing nap reads "1h19m" and
       needs the room; there is width for three at 58 in the row beside the
       night ring, so only a fourth nap forces the smaller ring. */
    const ringPx = todayNaps.length > 3 ? 46 : 58;
    const stroke = todayNaps.length > 3 ? 4.5 : 5.5;
    const napRings = todayNaps.map((s) => {
      const short = !s.active && s.asleepMinutes < catnapUnder;
      const col = short ? "var(--ps-warn)" : "var(--ps-light)";
      const sub = s.active ? "now" : psClock(s.from);
      const subCol = s.active ? "var(--ps-light)" : short ? "var(--ps-warn)" : "var(--ps-dim)";
      const val = psHM(s.asleepMinutes).replace(" ", "");
      const fit = val.length >= 5 ? " sm5" : val.length === 4 ? " sm4" : "";
      return `<div class="ps-napr">
          <div class="ps-ring" style="width:${ringPx}px;height:${ringPx}px" data-info="${psEsc(sec.hatch)}">
            ${this._ringSvg(ringPx, stroke, [[s.asleepMinutes / napTarget, col]], null)}
            <div class="ps-rv sm${fit}"><b>${psEsc(val)}</b></div>
            ${s.manual ? `<span class="ps-edd ring hand" title="Hand-logged"></span>`
    : s.edited ? `<span class="ps-edd ring" title="Corrected"></span>` : ""}
          </div>
          <span style="color:${subCol}">${psEsc(sub)}</span>
        </div>`;
    }).join("");

    /* One line of live status, and nothing else. Predicted bedtime comes from
       his own average rather than a configured time. */
    /* The chip carries awake-and-since now, so this line must not repeat it. */
    /* Plain words here too, and the SAME words as the block below — "Down" and
       "settled" are the pair a stranger cannot tell apart, and fixing them only
       where there was room to explain them would leave the collapsed face, the
       face that is actually read every day, still speaking the old dialect. */
    const statusL = live ? `Put down ${psClock(live.from)}` : "";
    const statusR = live
      ? (live.hadExit ? `left him ${psClock(live.settledAt)}` : "still settling…")
      : (stats.bedMean != null ? `bedtime ~${clock(stats.bedMean)}` : "");

    /* His own bands, and the meters that read against them. Built here rather
       than inside the expanded block because a renderer that is only called
       from one place is still easier to reason about with its inputs named. */
    const norms = psNurseryNorms(sessions, { days: sec.days || 7 });
    const nb = nightSession && !nightSession.active ? nightSession : null;
    const bedOf = (s) => {
      const d = new Date(s.from);
      const m = d.getHours() * 60 + d.getMinutes();
      return m < 720 ? m + 1440 : m;
    };
    /* Three meters, not four. "Slept" is missing on purpose — the strip above
       is already that metric against that band, and putting it here as well is
       the chip restating the line beside it.
       LONGEST RUN is hiOk and WENT IN is loOk: a long undisturbed run and an
       undisturbed night both sit on the good side of his band, and drawing
       either of them amber would call the best night of the week a fault. */
    const meters = !nb ? "" : `<div class="ps-hmg g3 ps-jmet">
        ${psHealthMeter({
    label: "Bedtime", value: bedOf(nb), band: norms.bed, text: psClock(nb.from),
  })}
        ${psHealthMeter({
    label: "Longest run", value: nb.longestStretch, band: norms.longest,
    text: nb.longestStretch == null ? null : psHM(nb.longestStretch), hiOk: true,
    why: "Not measured",
  })}
        ${/* A hand-logged night has no door behind it, so both of these are
              NULL rather than zero, and psHealthMeter's missing-reading state
              is what draws them. Printing 0 against his band would show the
              best night of the week on a night nobody measured. `text` has to
              go null with the value, or the dash never appears. */""}
        ${psHealthMeter({
    label: "Went in", value: nb.interventions, band: norms.ins,
    text: nb.interventions == null ? null : String(nb.interventions),
    unit: "×", loOk: true, why: "Not measured",
  })}
      </div>`;

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
            !loaded ? "loading…" : err ? "recorder unavailable"
              : away ? psEsc(`${awayLabel.toLowerCase()} — not recorded today`) : "none yet"}</span>`}</div>
        </div>
      </div>
      ${/* The one thing done in this room every single day, and the card could
            not do it: start the Hatch to put him down, stop it to get him up.
            Both meant leaving for the media page. The sound machine IS the
            session boundary, so this control is also the thing that starts and
            ends the record the rest of the section is derived from.

            Stopping is guarded by a two-tap arm, the same as cancelling a hold
            or deleting a schedule window: an accidental tap while he is asleep
            ends the session in the data and the white noise in the room. */""}
      ${noData && !sec.hatch && !this._manualStore(sec) ? "" : `<div class="ps-jstat">
        <span>${psEsc(statusL)}</span>
        <span class="ps-grow"></span>
        <span>${psEsc(statusR)}</span>
        ${!this._manualStore(sec) ? "" : `<button class="ps-jhatch ${
          this._manualLive(sec) ? "on" : ""}" type="button" data-jlog="1"
          aria-label="Log sleep by hand">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8.4"/></svg>
        </button>`}
        ${!sec.hatch ? "" : `<button class="ps-jhatch ${playing ? "on" : ""} ${
          this._armed === "hatch" ? "armed" : ""}" type="button"
          data-arm="${playing ? "hatch" : ""}" data-hatch="${playing ? "" : "start"}"
          aria-label="${playing ? "Stop the Hatch" : "Start the Hatch"}">
          ${this._armed === "hatch"
            ? `<span class="ps-jhx">Stop?</span>`
            : `<svg viewBox="0 0 24 24" class="ps-ico">${playing
              ? `<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>`
              : `<path d="M7.5 4.8 19 12 7.5 19.2Z"/>`}</svg>`}
        </button>`}
      </div>`}
      ${wifiOk ? "" : `<div class="ps-chips"><span class="ps-chip bad">Hatch offline</span></div>`}

      <div class="ps-xtra">
        ${/* VERSUS HIS NORMAL FIRST; the derivation underneath as evidence.
              What was here answered "where did this number come from" — right,
              and still below, but aimed at a reader who does not trust the
              figure yet. The question asked of this section each morning is
              whether the night was normal for him and whether the week is going
              the right way, so that is what it opens with now. */""}
        ${this._nurseryWeek(norms, sec, this._awayDays(sec))}
        ${this._nurseryVerdict(norms)}
        ${meters}
        ${nightSession ? `
        ${/* Five rows became two lines, in the words a person would use.
              A stranger reading the old block could not tell "Down" from
              "Settled" — and the honest gloss is not a definition, it is the
              sequence: he went in the cot, somebody left the room, he woke.
              "Left him" rather than "fell asleep" is deliberate and is the same
              care the numbers already take: settledAt is when the PARENT LEFT,
              a lower bound on when he dropped off, and no wording here is
              allowed to claim the card knows the moment. */""}
        <div class="ps-jstory"${editable ? ` data-napedit="${nightSession.from}"` : ""}>
          ${edd(nightSession)}Put down <b>${psClock(nightSession.from)}</b>
          ${nightSession.hadExit ? `<i>→</i> left him <b>${psClock(nightSession.settledAt)}</b>` : ""}
          ${nightSession.active ? "" : `<i>→</i> woke <b>${psClock(psWokeAt(nightSession))}</b>`}
        </div>
        <div class="ps-jstoryn">${nightSession.manual
          ? "Logged by hand"
          : nightSession.hadExit
            ? `${psEsc(psHM(nightSession.settleMinutes))} to settle him`
            : "still settling — nobody has left the room yet"}${
          nightSession.manual ? " · hand-logged, so wake-ups are not known"
            : nightSession.events.length
              ? ` · went in at ${psEsc(nightSession.events.map((t) => psClock(t)).join(", "))}`
              : nightSession.hadExit ? " · nobody went in" : ""}</div>` : ""}
        ${/* The night's own shape, kept as the last piece of evidence rather
              than the opening statement. Its legend is also the only place
              settling and asleep are drawn apart in colour, which is what makes
              the two words above it mean something. */""}
        ${this._nurseryRail(nightSession, loaded, err)}

        ${this._nurseryDayRail(sessions, todayKey, stats.bedMean)}
        <div class="ps-jrs">
          ${todayNaps.length ? todayNaps.map((s) => `
            <div class="ps-jr"${editable ? ` data-napedit="${s.from}"` : ""}>
              <span class="ps-l">${edd(s)}${psClock(s.from)} – ${s.active ? "now" : psClock(psWokeAt(s))}</span>
              <span class="ps-v">${psHM(s.asleepMinutes)}${s.active ? " so far" : ""}</span>
              <span class="${!s.active && s.asleepMinutes < catnapUnder ? "ps-warnc" : "ps-flat"}">${
                !s.active && s.asleepMinutes < catnapUnder ? "short" : s.interventions ? s.interventions + " in" : ""}</span></div>`).join("")
            : `<div class="ps-jr"><span class="ps-l">${away
              ? psEsc(`${awayLabel} — he was out, so no naps were recorded`)
              : "No naps yet today"}</span></div>`}
          ${/* Suppressed on an away day for the same reason the chip is: it is
                measured from the end of a session that happened HERE, and the
                naps it should have been reset by happened somewhere else. */""}
          ${away || stats.wakeWindowMin == null ? "" : `<div class="ps-jr"><span class="ps-l">Awake for</span>
            <span class="ps-v">${psHM(stats.wakeWindowMin)}</span>
            <span class="ps-flat">since ${psClock(stats.wakeSince)}</span></div>`}
        </div>
        ${/* A long press has no affordance of its own, so the list says it
              once. Only where there is somewhere to write the correction —
              without the store the gesture does nothing, and inviting it would
              be worse than not offering it. */""}
        ${editable && (todayNaps.length || nightSession)
          ? `<div class="ps-note">Press and hold a session to correct when he actually slept.</div>` : ""}
      </div>`;
  },
});
