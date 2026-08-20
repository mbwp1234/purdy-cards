/* ============================================================================
 * People — the header avatars, and the person sheet behind them.
 *
 * The `people` section was deleted for being the only thing on the column that
 * DID nothing: two rows, no control, no decision, 105px. The avatars that
 * replaced it said one thing — who is home — and a red pip said the one
 * actionable fact about a person, a phone about to die.
 *
 * This gives them the job the old section's step column never had. A thin
 * horseshoe around each face is today's steps against THAT PERSON'S OWN
 * average, and tapping opens a sheet with the rest of what the companion app
 * already publishes. Nothing new is captured: iOS pushes steps, distance,
 * floors, the current activity and both batteries whether anything reads them
 * or not.
 *
 * WHY A RING IS ALLOWED HERE. The rule the health mode hangs on is that a ring
 * shows a fraction of a goal SOMEBODY ELSE picked, which is why the Apple rings
 * were rejected — and that a ring is fine where the goal is his own. His own
 * seven-day average is exactly that, so the horseshoe is honest here in a way
 * "10,000 steps" would not be. A configured `goal:` is accepted as the fallback
 * until there is a week of history, and the sheet SAYS WHICH ONE IT IS rather
 * than letting an average masquerade as a target.
 *
 * WHY THE PHONE SENSORS AND NOT APPLE HEALTH. `hae.*` is Brian's alone, is a
 * raw REST push with no history, and is empty for days at a time. The companion
 * step counters exist for both people, survive a restart, and are in the
 * recorder — so this is the only version of "Brian and Tayler stats" that can
 * be built for both of them today. The Body mode is untouched.
 * ==========================================================================*/

/* Per-day totals out of a DAILY-RESETTING counter.
 *
 * iOS republishes `steps` as steps-so-far-today and drops it back to zero at
 * local midnight, so the day's total is the day's MAXIMUM — not its last
 * sample, which on a day the phone kept reporting past midnight belongs to
 * tomorrow, and not a difference, which would be a step count of a step count.
 *
 * A day with no samples is null and stays null. It is drawn hatched, never as
 * a zero column: a short bar reads as a lazy day at a glance, and a strip is
 * the surface where a zero is the most convincing lie this card could tell —
 * the same reason a missing night is hatched in Joel's week.
 *
 * The keys are LOCAL days. toISOString() rolls the day at the wrong moment west
 * of Greenwich, which would file an evening walk under tomorrow. */
function psStepDays(series, opts) {
  const o = opts || {};
  const now = o.now == null ? Date.now() : o.now;
  const days = Math.max(1, o.days || 7);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const at = now - i * 86400000;
    out.push({ key: pcDayKey(at), at, steps: null, today: i === 0 });
  }
  const idx = {};
  out.forEach((d) => { idx[d.key] = d; });
  (series || []).forEach((p) => {
    const n = parseFloat(p.s);
    /* "unknown" and "unavailable" parse to NaN and are dropped rather than
       counted as zero — a phone that stopped reporting has not stood still. */
    if (!Number.isFinite(n)) return;
    const slot = idx[pcDayKey(p.t)];
    if (!slot) return;
    if (slot.steps == null || n > slot.steps) slot.steps = n;
  });
  return out;
}

/* His own normal, over COMPLETED days only.
 *
 * Today is excluded on purpose: it is a partial day, and averaging it in drags
 * the very figure today is being measured against down by however early it is.
 * Two days is the floor, the same floor Joel's bands and the nap prediction
 * use — one day is an anecdote, and below the floor there is no band at all
 * rather than a band drawn around a single number. */
function psStepStats(days) {
  const done = (days || []).filter((d) => !d.today && d.steps != null).map((d) => d.steps);
  if (done.length < 2) return { n: done.length, avg: null, sd: null };
  const avg = done.reduce((a, b) => a + b, 0) / done.length;
  const varr = done.reduce((a, b) => a + (b - avg) * (b - avg), 0) / done.length;
  const sd = Math.sqrt(varr);
  return { n: done.length, avg, sd };
}

/* Where he was at this time on a previous day.
 *
 * The chip compares today against the same clock time yesterday, NOT against
 * the seven-day average — an average is a whole day, and holding a partial day
 * up against one says "3,000 short" at nine in the morning every single day.
 * The ring can be a fraction of a usual day because a fraction is what it
 * looks like; a sentence cannot.
 *
 * Same maximum-so-far rule as the day total, cut at the clock time. */
function psStepsBy(series, dayAt, cutMs) {
  const key = pcDayKey(dayAt);
  let best = null;
  (series || []).forEach((p) => {
    if (p.t > cutMs) return;
    if (pcDayKey(p.t) !== key) return;
    const n = parseFloat(p.s);
    if (!Number.isFinite(n)) return;
    if (best == null || n > best) best = n;
  });
  return best;
}

Object.assign(PurdyShellCard.prototype, {

  /* Only people with a step sensor take part. Everyone else keeps the avatar
     they have always had, with the presence ring and the battery pip and a tap
     that opens more-info — an install that has never configured `steps:` must
     not grow a bare track around every face. */
  _peopleCfg() { return (this._config && this._config.people) || []; },

  _peopleTracked() { return this._peopleCfg().some((p) => p.steps); },

  /* Its own request, for the same reason the nursery has one: a week of two
     step counters is a far smaller query than folding seven days onto the
     shared 26h fetch that the graphs and room sparklines share, and none of
     them have any use for a week. */
  _startPeople() {
    if (!this._peopleTracked()) return;
    const run = () => this._fetchPeople();
    run();
    if (this._peopleTimer) clearInterval(this._peopleTimer);
    this._peopleTimer = setInterval(run, (this._config.history_refresh_minutes || 5) * 60 * 1000);
  },

  async _fetchPeople() {
    if (!this._hass || !this._hass.callApi) return;
    const ids = this._peopleCfg().map((p) => p.steps).filter(Boolean);
    if (!ids.length) return;
    const days = this._config.people_days || 7;
    const start = new Date(Date.now() - days * 86400000).toISOString();
    try {
      const res = await this._hass.callApi(
        "GET",
        /* end_time is NOT optional — without it the recorder defaults to
           start + 1 DAY and the week silently stops six days ago with no gap
           to give it away. See pcNowIso() in 05-shared.js. */
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
      this._people = hist;
      this._peopleErr = null;
      this._last = null;
      this._render();
    } catch (e) {
      /* A week of steps is decoration; the avatars and the presence they carry
         are not. So this never breaks the header — it only means the ring has
         no goal to be a fraction of, which draws as a bare track. */
      this._peopleErr = (e && e.message) || "recorder did not answer";
      this._last = null;
      this._render();
    }
  },

  /* Everything one person's face and sheet need, derived once.
   *
   * `today` prefers the LIVE state over the history series: the poller is five
   * minutes behind and the number under a thumb should not be. */
  _personStats(p) {
    const days = this._config.people_days || 7;
    const now = this._nowMs();
    const series = (this._people || {})[p.steps];
    const week = psStepDays(series, { now, days });
    const stats = psStepStats(week);
    const live = pcReading(this._hass, p.steps);
    const today = live.ok && Number.isFinite(live.n) ? live.n
      : (week.length ? week[week.length - 1].steps : null);
    if (week.length) week[week.length - 1].steps = today;

    /* His own average when there is one, and the configured goal only until
       then. Which of the two it is travels with the number, because a marker
       that calls an average a target is the ring mistake the health mode was
       redesigned to avoid. */
    const goalN = pcNumOf({ state: p.goal });
    const goal = stats.avg != null ? stats.avg : (Number.isFinite(goalN) && goalN > 0 ? goalN : null);
    const goalKind = stats.avg != null ? "avg" : (goal != null ? "goal" : null);

    /* A band narrower than the noise in a step counter claims a precision it
       does not have, and a perfectly consistent week would produce a
       zero-width band that psHmDomain correctly refuses — so the meter would
       lose its rail on exactly the weeks it had the most to say. */
    const band = stats.avg != null && stats.sd != null
      ? { lo: stats.avg - Math.max(stats.sd, 400), hi: stats.avg + Math.max(stats.sd, 400) }
      : null;

    const yest = series && week.length > 1
      ? psStepsBy(series, now - 86400000, now - 86400000) : null;

    return { week, stats, today, goal, goalKind, band, yest, why: live.ok ? null : live.why };
  },

  /* The horseshoe on a 28px face.
   *
   * The scale is whichever of value and goal is larger, so passing his average
   * never clamps the arc into a lie — it fills, and the sheet is where the
   * overshoot gets a number. There is no goal marker at this size: a 2px tick
   * on a 12px radius is a rendering artefact, not a reading.
   *
   * No goal and no reading both draw the TRACK ALONE. A ring at zero and a
   * phone that has not reported must never look the same. */
  _pvRing(st) {
    const size = 28, stroke = 2.2, r = size / 2 - stroke / 2 - 1.4;
    const arc = pcRingArc(r);
    const c = 2 * Math.PI * r;
    const cx = size / 2;
    const track = `<circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="var(--ps-track)"
        stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${arc.toFixed(2)} ${c.toFixed(2)}" transform="rotate(${PC_RING_START} ${cx} ${cx})"/>`;
    let seg = "";
    if (st.today != null && st.goal) {
      const frac = Math.max(0, Math.min(1, st.today / Math.max(st.today, st.goal)));
      const len = arc * frac;
      if (len > 0.2) {
        seg = `<circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="url(#ps-aur)"
          stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${len.toFixed(2)} ${c.toFixed(2)}" transform="rotate(${PC_RING_START} ${cx} ${cx})"/>`;
      }
    }
    return `<svg class="ps-pvr" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <defs><linearGradient id="ps-aur" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--ps-aur-a, #56D4E4)"/>
        <stop offset="1" stop-color="var(--ps-aur-b, #8B7CFF)"/></linearGradient></defs>
      ${track}${seg}</svg>`;
  },

  /* Distance arrives in metres from the companion app and in kilometres from
     an Android one. Neither is what anyone in this house reads. */
  _pDist(p) {
    const rd = pcReading(this._hass, p.distance);
    if (!rd.ok || !Number.isFinite(rd.n)) return null;
    const unit = (rd.st.attributes.unit_of_measurement || "m").toLowerCase();
    const km = unit === "km" ? rd.n : unit === "mi" ? rd.n * 1.60934 : rd.n / 1000;
    return this._config.metric ? { v: km, u: "km" } : { v: km / 1.60934, u: "mi" };
  },

  /* "Automotive" is a state slug with a sensible word behind it; "Unknown" is
     the companion app saying it has not decided, which is a MISSING reading and
     has to read as one rather than as a person doing nothing. */
  _pDoing(p) {
    const rd = pcReading(this._hass, p.activity);
    if (!rd.ok) return null;
    const raw = String(rd.st.state || "");
    if (!raw || /^unknown$/i.test(raw)) return null;
    return ({
      automotive: "Driving", walking: "Walking", running: "Running",
      cycling: "Cycling", stationary: "Still",
    })[raw.toLowerCase()] || raw.replace(/_/g, " ");
  },

  _personBody(p) {
    const st = this._personStats(p);
    const nm = pcName(this._hass, p.entity, p.name);
    const home = pcState(this._hass, p.entity) === "home";
    const pv = this._hass.states[p.entity];
    const since = pv && pv.last_changed ? new Date(pv.last_changed) : null;

    /* The chip is a comparison or it is not drawn. Today's number is six
       inches away in 40px type; a chip repeating it would be the sixth time
       that duplication shipped on this card. */
    /* Nothing has happened yet today is not a comparison. At six in the
       morning both numbers are near zero and "level with yesterday" is true,
       useless, and takes the place of nothing — so it is dropped rather than
       drawn, the same way a chip with no fact to carry is dropped everywhere
       else on this card. */
    let chip = "";
    if (st.today != null && st.yest != null && (st.today > 150 || st.yest > 150)) {
      const d = Math.round(st.today - st.yest);
      const n = Math.abs(d) >= 1000 ? `${(Math.abs(d) / 1000).toFixed(1)}k` : String(Math.abs(d));
      chip = Math.abs(d) < 150
        ? `<span class="ps-ppchip">level with yesterday</span>`
        : `<span class="ps-ppchip ${d > 0 ? "up" : "dn"}">${n} ${d > 0 ? "ahead of" : "behind"} this time yesterday</span>`;
    }

    /* Hero. The ring's scale is max(value, goal) so an overshoot pulls the
       marker back rather than being clipped at full — a ring stopped at 100%
       throws away the only thing it had left to say. */
    const scale = st.today != null && st.goal ? Math.max(st.today, st.goal) : null;
    const segs = st.today != null && scale ? [[st.today / scale, "url(#ps-aur)"]] : [];
    const ring = this._ringSvg(96, 9, segs, scale ? st.goal / scale : null, "var(--ps-warn)");
    const num = st.today == null
      ? `<div class="ps-ppn none">—</div><div class="ps-ppu">steps today</div>
         <div class="ps-ppnote">${psEsc(st.why === "unset" ? "No step sensor configured" : "The phone is not reporting")}</div>`
      : `<div class="ps-ppn">${Math.round(st.today).toLocaleString()}</div>
         <div class="ps-ppu">steps today</div>
         <div class="ps-ppnote">${st.goal == null
           ? "No normal yet — two logged days is the floor."
           : st.goalKind === "avg"
             ? `Marker is ${psEsc(nm.split(" ")[0])}'s own ${st.stats.n}-day average, ${Math.round(st.goal).toLocaleString()}.`
             : `Marker is the goal set in config, ${Math.round(st.goal).toLocaleString()}.`}</div>`;

    /* The week. A plot you READ, not one you press — seven values already
       captioned underneath, so it takes the railbox and not the scrub. */
    const hi = Math.max(st.goal || 0, ...st.week.map((d) => d.steps || 0), 1);
    const bandTop = st.band ? 100 - (Math.min(st.band.hi, hi) / hi) * 100 : 0;
    const bandBot = st.band ? 100 - (Math.max(st.band.lo, 0) / hi) * 100 : 0;
    const bars = st.week.map((d) => {
      if (d.steps == null) {
        return `<span class="ps-ppb miss" title="${psEsc(d.key)} — nothing reported"></span>`;
      }
      const h = Math.max(2, (d.steps / hi) * 100);
      return `<span class="ps-ppb ${d.today ? "now" : ""}" style="height:${h.toFixed(1)}%"
        title="${psEsc(d.key)} — ${Math.round(d.steps).toLocaleString()} steps"></span>`;
    }).join("");
    const labels = st.week.map((d) => `<span>${d.today ? "TODAY"
      : new Date(d.at).toLocaleDateString([], { weekday: "short" }).slice(0, 2).toUpperCase()}</span>`).join("");
    const week = `<div class="ps-railbox ps-ppweek">
        <div class="ps-ppbars">
          ${st.band ? `<span class="ps-ppband" style="top:${bandTop.toFixed(1)}%;bottom:${(100 - bandBot).toFixed(1)}%"></span>` : ""}
          ${bars}
        </div>
        <div class="ps-ppdays">${labels}</div>
        <div class="ps-ppcap"><span>${st.band
          ? "Band is a usual day, ±1sd"
          : (this._peopleErr ? psEsc(this._peopleErr) : "No band yet — needs two logged days")}</span>
          <span>${(() => {
            const n = st.week.filter((d) => d.steps == null).length;
            return n ? `${n} day${n > 1 ? "s" : ""} not reported` : "";
          })()}</span></div>
      </div>`;

    const dist = this._pDist(p);
    const fl = pcReading(this._hass, p.floors);
    const doing = this._pDoing(p);
    const fact = (k, v, na) => `<div class="ps-ppf"><div class="ps-ppk">${psEsc(k)}</div>
      <div class="ps-ppv${v == null ? " na" : ""}">${v == null ? psEsc(na) : v}</div></div>`;
    const facts = `<div class="ps-ppfacts">
        ${fact("Distance", dist ? `${dist.v.toFixed(1)}<small>${dist.u}</small>` : null, "Not reported")}
        ${fact("Floors up", fl.ok && Number.isFinite(fl.n) ? String(Math.round(fl.n)) : null, "Not reported")}
        ${fact("Doing", doing ? psEsc(doing) : null, "Not reported")}
      </div>`;

    /* The batteries keep the pip's meaning rather than restating it: the pip
       says "under 25%", this says how far under, and adds the watch, which has
       no room on a 28px face. */
    const batt = pcReading(this._hass, p.battery);
    const watch = pcReading(this._hass, p.watch);
    const seen = this._hass.states[p.steps] && this._hass.states[p.steps].last_changed;
    const foot = [
      batt.ok && Number.isFinite(batt.n)
        ? `<span class="ps-ppdot ${batt.n < 25 ? "bad" : ""}"></span>Phone <b>${Math.round(batt.n)}%</b>` : "",
      watch.ok && Number.isFinite(watch.n)
        ? `<span class="ps-ppdot ${watch.n < 25 ? "bad" : ""}"></span>Watch <b>${Math.round(watch.n)}%</b>` : "",
      seen ? `<span class="ps-ppdot"></span>Reported ${psEsc(new Date(seen).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}` : "",
    ].filter(Boolean).join("");

    return `<div class="ps-pphead">
        <span class="ps-pv ${home ? "home" : "away"} big">${this._pvRing(st)}${this._pvFace(p, nm)}</span>
        <span class="ps-grow"><span class="ps-ppname">${psEsc(nm)}</span>
          <span class="ps-ppwhen">${home ? "Home" : psEsc((pcState(this._hass, p.entity) || "away").replace(/_/g, " "))}${
            since ? ` since ${psEsc(since.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}` : ""}</span></span>
        ${chip}
      </div>
      <div class="ps-pphero">${ring}<div>${num}</div></div>
      ${week}${facts}
      ${foot ? `<div class="ps-ppfoot">${foot}</div>` : ""}
      <div class="ps-ppmore" data-info="${psEsc(p.entity)}" role="button" tabindex="0">Open ${psEsc(nm.split(" ")[0])}'s device page</div>`;
  },

  _pvFace(p, nm) {
    const stt = this._hass.states[p.entity];
    const pic = stt && stt.attributes.entity_picture;
    return pic
      ? `<img src="${psEsc(pic)}" alt="" />`
      : `<span class="ps-pvi">${psEsc((nm || "?").charAt(0).toUpperCase())}</span>`;
  },

  /* Tap opens the sheet; the hold that used to be a tap opens more-info, so
     the device page this avatar has always led to is not orphaned by the
     surface replacing it. Same 380ms as every other hold on the card. */
  _bindPeople() {
    this._each("[data-person]", (el) => {
      let hold = null, x0 = 0, y0 = 0, fired = false;
      const cancel = () => { if (hold) { clearTimeout(hold); hold = null; } };
      el.addEventListener("pointerdown", (ev) => {
        x0 = ev.clientX; y0 = ev.clientY; fired = false;
        cancel();
        hold = setTimeout(() => {
          hold = null; fired = true;
          pcHaptic("medium");
          pcMoreInfo(this, el.dataset.entity);
        }, 380);
      });
      el.addEventListener("pointermove", (ev) => {
        if (hold && (Math.abs(ev.clientX - x0) > 8 || Math.abs(ev.clientY - y0) > 8)) cancel();
      });
      el.addEventListener("pointercancel", cancel);
      el.addEventListener("pointerup", cancel);
      el.addEventListener("click", () => {
        if (fired) { fired = false; return; }
        const i = +el.dataset.person;
        pcHaptic("light");
        this._personPick = i;
        this._sheet = this._sheet === "person" ? null : "person";
        this._render();
      });
      el.addEventListener("contextmenu", (ev) => ev.preventDefault());
    });
  },
});
