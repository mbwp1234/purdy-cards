/* ============================================================================
 * purdy-shell-card — health (Body)
 *
 * THE UNIT IS A METER, NOT A RING.
 *
 * Brian rejected the Apple activity rings. He did *not* reject graphed metrics
 * — that misreading cost a round trip, and it is worth writing down because the
 * two look like the same objection and are not. A meter is a micro label, the
 * number, and a track carrying his own normal band with a dot on today. It
 * answers "is this where it usually is", which is the question a ring never
 * answered: a ring shows a fraction of a goal somebody else picked.
 *
 * Four states, and the fourth is the one that matters:
 *
 *   in band          green   the value sits inside his usual range
 *   out of band      amber   outside, in the direction that costs something
 *   high and good    cyan    above the band where above is not a fault
 *   no reading       NO TRACK AT ALL
 *
 * A missing reading draws no rail, no band and no dot — only the label and a
 * dash. An empty track is a claim that the number is low, which is the
 * zero-vs-missing rule arriving at a new surface for the fourth time (the sleep
 * ring, the systems figures, the nursery night, now this). The same applies to
 * a band that does not exist yet: value, no track, no placeholder rail. That is
 * what lets this section ship BEFORE the capture layer that will produce the
 * bands, and still look deliberate.
 *
 * ---------------------------------------------------------------------------
 * THREE THINGS THE DATA WILL NOT SUPPORT. All three were drawn in the mockups
 * and all three are absent from the entities; verified 2026-08-10.
 *
 * 1. THERE IS NO BEDTIME AND NO WAKE TIME. Health Auto Export pushes sleep as
 *    four totals in a single write — the recorder holds exactly one state for
 *    the night, stamped about 09:15, carrying no times at all. Any header
 *    window is invented, and the invented one contradicted its own reading
 *    (a 7h37m window beside 5h37m asleep) across two mockups without being
 *    caught. So this section never prints a sleep window.
 *
 * 2. THE OVERNIGHT TRACE HAS NO TIME AXIS. All ~235 heart-rate samples arrive
 *    in ONE burst spanning about two seconds at breakfast, because the watch
 *    does not push overnight — it uploads the night when it syncs. Order
 *    survives; spacing does not. The shape is still the most legible thing in
 *    the section, so it is drawn — plotted against sample INDEX, captioned as
 *    not being to scale in time, and carrying no tick labels. If the export is
 *    ever set to push overnight this becomes a real axis and the caption goes.
 *
 * 3. THERE IS NO SLEEP EFFICIENCY. sleep_analysis_inbed equals
 *    sleep_analysis_totalsleep exactly, every night, so efficiency would print
 *    a constant fake 100% and look like a metric. It is not here.
 *    sleep_analysis_asleep reads 0 while the stages sum correctly, so the
 *    total to trust is totalsleep.
 *
 * Two more that look like data and are not: heart_rate_min / _avg / _max are
 * the SAME number (they track the latest sample, not a daily range), and
 * walking_asymmetry_percentage reads a flat 0% from inside the poisoned
 * backfill hour — so it is drawn with the questionable dot, not the green one.
 * ========================================================================== */

/* Where a value sits on a track, 0–100, clamped so an out-of-domain reading
   parks at the end rather than escaping the rail. */
function psHmPos(v, lo, hi) {
  if (v == null || !Number.isFinite(v) || !(hi > lo)) return null;
  return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
}

/* A band with no domain gets one: the band widened by its own width on each
   side, so it occupies the middle third of the rail. Naming a domain per metric
   in config would be forty numbers to maintain for a rail nobody measures
   against absolutely — the dot's position relative to the BAND is the whole
   message, and the band is the thing that came from his own readings. */
function psHmDomain(band) {
  if (!band) return null;
  const lo = Number(band.lo), hi = Number(band.hi);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) return null;
  if (Number.isFinite(Number(band.dlo)) && Number.isFinite(Number(band.dhi))) {
    return { lo: Number(band.dlo), hi: Number(band.dhi) };
  }
  const w = hi - lo;
  return { lo: lo - w, hi: hi + w };
}

/* Hours (5.61) → "5h 37m", and under an hour → "50m". Sleep arrives in decimal
   hours, which nobody reads as a duration. */
function psHmDur(h) {
  if (h == null || !Number.isFinite(h)) return "—";
  const mins = Math.round(h * 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

/* One meter.
 *
 *   label   uppercase micro caption
 *   value   number or null — null is what produces the no-track state
 *   text    pre-formatted display string; falls back to value + digits
 *   unit    small trailing unit, inside the numeral
 *   band    {lo, hi} from HIS readings, or null/absent when there is none yet
 *   hiOk    true when above the band is not a fault (HRV, REM)
 *   cap     true when the band is a published ceiling rather than a personal
 *           range — it is drawn filled from the floor, because "under the
 *           limit" is a different claim from "where you usually are"
 *   q       true when the value is present but not trustworthy (a perfect zero
 *           out of the poisoned hour) — grey dot, never green
 */
function psHealthMeter(o) {
  const label = `<div class="ps-hmk">${pcEsc(o.label || "")}</div>`;
  const unit = o.unit ? `<u>${pcEsc(o.unit)}</u>` : "";
  const missing = o.value == null || !Number.isFinite(o.value);
  const shown = o.text != null ? o.text
    : (missing ? "—" : o.value.toFixed(o.digits == null ? 0 : o.digits));
  const val = `<div class="ps-hmv${missing ? " none" : ""}">${shown}${missing ? "" : unit}</div>`;

  const dom = missing ? null : psHmDomain(o.band);
  if (!dom) {
    /* Two different blanks, and only one of them needs saying.
       A MISSING READING gets a caption, because a bare dash otherwise looks
       like a rendering fault rather than a sensor that is not reporting.
       A MISSING BAND says nothing at all: the value is right there and true,
       and before the capture layer exists that is every meter on the screen —
       eleven identical "No band yet" captions stacked down the section, which
       is what the first live render actually looked like. The absence of a
       rail is its own signal. */
    if (!missing) return `<div class="ps-hm">${label}${val}</div>`;
    return `<div class="ps-hm">${label}${val}<div class="ps-hmn">${pcEsc(o.why || "No reading")}</div></div>`;
  }

  const bLo = psHmPos(Number(o.band.lo), dom.lo, dom.hi);
  const bHi = psHmPos(Number(o.band.hi), dom.lo, dom.hi);
  const at = psHmPos(o.value, dom.lo, dom.hi);
  const above = o.value > Number(o.band.hi);
  const below = o.value < Number(o.band.lo);
  let cls = "";
  if (o.q) cls = "q";
  else if (above) cls = o.hiOk ? "high" : "out";
  else if (below) cls = "out";

  const band = o.cap
    ? `<span class="ps-hmb cap" style="left:0%;width:${bHi.toFixed(1)}%"></span>`
    : `<span class="ps-hmb" style="left:${bLo.toFixed(1)}%;width:${(bHi - bLo).toFixed(1)}%"></span>`;

  return `<div class="ps-hm">${label}${val}
      <div class="ps-hmt">${band}<span class="ps-hmd ${cls}" style="left:${at.toFixed(1)}%"></span></div>
    </div>`;
}

Object.assign(PurdyShellCard.prototype, {

  _hlBand(sec, key) {
    const b = (sec.bands || {})[key];
    return b && Number.isFinite(Number(b.lo)) && Number.isFinite(Number(b.hi)) ? b : null;
  },

  /* Every reading in this section goes through here so a missing entity and a
     zero can never collapse into the same number. */
  _hlRead(id) {
    const r = pcReading(this._hass, id);
    return r.ok ? r.n : null;
  },

  _hlMeter(sec, key, o) {
    return psHealthMeter({ band: this._hlBand(sec, key), ...o });
  },

  _hlGrid(cells, n) {
    return `<div class="ps-hmg g${n || 4}">${cells.join("")}</div>`;
  },

  /* ------------------------------------------------------------ last night */
  _hlSleep(sec) {
    const total = this._hlRead(sec.sleep_total);
    const deep = this._hlRead(sec.sleep_deep);
    const core = this._hlRead(sec.sleep_core);
    const rem = this._hlRead(sec.sleep_rem);
    const awake = this._hlRead(sec.sleep_awake);
    if (total == null && deep == null && core == null && rem == null) return "";

    /* The split is drawn off the stages themselves, not off the total: they sum
       to the total anyway, and a bar whose segments are scaled to a different
       denominator than they came from would drift. */
    const sum = [deep, core, rem].reduce((a, v) => a + (v == null ? 0 : v), 0);
    const aw = awake == null ? 0 : awake;
    const denom = sum + aw;
    const seg = (v, cls) => (v == null || denom <= 0 ? "" :
      `<i class="${cls}" style="width:${((v / denom) * 100).toFixed(1)}%"></i>`);
    const bar = denom > 0 ? `<div class="ps-hstage">${
        seg(deep, "d")}${seg(core, "c")}${seg(rem, "r")}${seg(awake, "a")}</div>
      <div class="ps-hslg">
        <span><i class="d"></i>Deep <b>${psHmDur(deep)}</b></span>
        <span><i class="c"></i>Core <b>${psHmDur(core)}</b></span>
        <span><i class="r"></i>REM <b>${psHmDur(rem)}</b></span>
        <span><i class="a"></i>Awake <b>${psHmDur(awake)}</b></span>
      </div>
      <div class="ps-hcap">Stage totals · Apple publishes no sequence</div>` : "";

    const pct = (v) => (v == null || sum <= 0 ? null : (v / sum) * 100);
    const cells = [
      this._hlMeter(sec, "asleep", { label: "Asleep", value: total, text: psHmDur(total) }),
      this._hlMeter(sec, "deep_pct", { label: "Deep", value: pct(deep), unit: "%", digits: 0 }),
      this._hlMeter(sec, "rem_pct", { label: "REM", value: pct(rem), unit: "%", digits: 0, hiOk: true }),
      this._hlMeter(sec, "awake", { label: "Awake", value: awake, text: psHmDur(awake) }),
    ];

    return `<div class="ps-hblk">
        <div class="ps-hbh"><span class="ps-hbt">Last night</span><span class="ps-hbw">stages</span></div>
        ${bar}${this._hlGrid(cells, 4)}
      </div>`;
  },

  /* -------------------------------------------------------- overnight shape */
  _hlTrace(sec) {
    if (!sec.hr_series) return "";
    if (this._histErr) {
      return `<div class="ps-hblk"><div class="ps-hbh"><span class="ps-hbt">Overnight heart</span></div>
        <div class="ps-hcap">Recorder did not answer</div></div>`;
    }
    const series = (this._history || {})[sec.hr_series];
    if (!series || series.length < 2) {
      return `<div class="ps-hblk"><div class="ps-hbh"><span class="ps-hbt">Overnight heart</span></div>
        <div class="ps-hcap">No samples yet</div></div>`;
    }
    const vals = series.map((p) => parseFloat(p.s)).filter((v) => Number.isFinite(v));
    if (vals.length < 2) return "";

    /* Plotted against sample INDEX, not time. Every one of these samples is
       stamped within the same two-second upload, so time carries no
       information and using it would pile the whole night onto one pixel.
       pcSparkPoly is reused by handing it the index as its t — the geometry is
       identical, only the meaning of x differs, which is the same reuse
       argument the ring extraction set the precedent for. */
    const rest = this._hlRead(sec.resting_hr);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (rest != null) { lo = Math.min(lo, rest); hi = Math.max(hi, rest); }
    const W = 292, H = 62, PAD = 4;
    const poly = pcSparkPoly(vals.map((v, i) => ({ t: i, v })), W, H, PAD, 1, { lo, hi });
    if (!poly) return "";

    const restY = rest == null ? null
      : PAD + (1 - (rest - lo) / (hi - lo || 1)) * (H - PAD * 2);
    /* The resting line is painted AFTER the area fill. Drawn before it, the
       gradient covers it and the section ships with an invisible reference —
       which is exactly what the first screenshot of the mockup caught. */
    const line = restY == null ? "" :
      `<line x1="0" y1="${restY.toFixed(1)}" x2="${W}" y2="${restY.toFixed(1)}"
         stroke="var(--ps-good)" stroke-opacity=".45" stroke-width="1" stroke-dasharray="3 3"/>`;

    return `<div class="ps-hblk">
        <div class="ps-hbh"><span class="ps-hbt">Overnight heart</span>
          <span class="ps-hbw">${vals.length} samples</span></div>
        <svg class="ps-htrace" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
             aria-label="Overnight heart rate in sample order, low ${Math.round(lo)} to high ${Math.round(hi)}">
          <defs><linearGradient id="ps-hg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--ps-heat)" stop-opacity=".30"></stop>
            <stop offset="100%" stop-color="var(--ps-heat)" stop-opacity="0"></stop>
          </linearGradient></defs>
          <polygon fill="url(#ps-hg)" points="${poly} ${W},${H} 0,${H}"></polygon>
          <polyline fill="none" stroke="var(--ps-heat)" stroke-width="1.6"
            stroke-linejoin="round" stroke-linecap="round" points="${poly}"></polyline>
          ${line}
        </svg>
        <div class="ps-hcap">In order · not to scale in time</div>
        <div class="ps-hnote">Low ${Math.round(lo)} · peak ${Math.round(hi)}${
          rest == null ? "" : `, resting ${Math.round(rest)} dashed`
        }. The watch uploads the night in one burst at breakfast, so the samples keep
        their order and lose their spacing.</div>
      </div>`;
  },

  /* --------------------------------------------------------------- recovery */
  _hlRecovery(sec) {
    const hrv = this._hlRead(sec.hrv);
    const rhr = this._hlRead(sec.resting_hr);
    const resp = this._hlRead(sec.respiratory);
    const whr = this._hlRead(sec.walking_hr);
    if (hrv == null && rhr == null && resp == null && whr == null) return "";
    const cells = [
      this._hlMeter(sec, "hrv", { label: "HRV", value: hrv, unit: "ms", digits: 0, hiOk: true }),
      this._hlMeter(sec, "resting_hr", { label: "Resting", value: rhr, unit: "bpm", digits: 0 }),
      this._hlMeter(sec, "respiratory", { label: "Breathing", value: resp, unit: "/min", digits: 0 }),
      this._hlMeter(sec, "walking_hr", { label: "Walking HR", value: whr, unit: "bpm", digits: 0 }),
    ];
    return `<div class="ps-hblk">
        <div class="ps-hbh"><span class="ps-hbt">Recovery</span><span class="ps-hbw">this morning</span></div>
        ${this._hlGrid(cells, 4)}
        <div class="ps-hnote">Measured while he slept — the body's report on
          <b>yesterday</b>, not on this morning.</div>
      </div>`;
  },

  /* ------------------------------------------------------------------- load */
  _hlLoad(sec) {
    const L = sec.load || {};
    const steps = this._hlRead(L.steps), ex = this._hlRead(L.exercise);
    const act = this._hlRead(L.active), dist = this._hlRead(L.distance);
    const fl = this._hlRead(L.flights), stand = this._hlRead(L.stand);
    if ([steps, ex, act, dist, fl, stand].every((v) => v == null)) return "";
    const ct = (v, lbl, unit, digits) => `<div class="ps-hct"><b>${
      v == null ? "—" : v.toLocaleString(undefined, {
        minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 })
      }${v == null || !unit ? "" : `<u>${pcEsc(unit)}</u>`}</b><span>${pcEsc(lbl)}</span></div>`;
    const goal = L.stand_goal || 12;
    return `<div class="ps-hblk">
        <div class="ps-hbh"><span class="ps-hbt">Load</span><span class="ps-hbw">so far today</span></div>
        <div class="ps-hctr">
          ${ct(steps, "steps")}${ct(ex, "exercise", "m")}${ct(act, "active kcal")}
          ${ct(dist, "walked", "mi", 1)}${ct(fl, "flights")}
          <div class="ps-hct"><b>${stand == null ? "—" : stand}<u>/${goal}</u></b><span>stand hrs</span></div>
        </div>
        <div class="ps-hnote"><b>No bands here, deliberately.</b> Until the day is over every
          load figure is low, and a dot near the bottom of a track would read as a deficit
          rather than as a morning.</div>
      </div>`;
  },

  /* ---------------------------------------------------------------- fitness */
  _hlFitness(sec) {
    const F = sec.fitness || {};
    const ftp = this._hlRead(F.ftp), wkg = this._hlRead(F.wkg);
    const kg = this._hlRead(F.weight), vo2 = this._hlRead(F.vo2);
    if (ftp == null && wkg == null && kg == null && vo2 == null) return "";
    const lb = kg == null ? null : kg * 2.20462;
    /* Garmin returns 429 for long stretches, so a blank VO2 max beside a live
       FTP is a normal state here rather than a bug — the chip names it. */
    const stale = vo2 == null && (ftp != null || kg != null);
    const cells = [
      this._hlMeter(sec, "ftp", { label: "FTP", value: ftp, unit: "W", digits: 0 }),
      this._hlMeter(sec, "wkg", { label: "W per kg", value: wkg, digits: 2 }),
      this._hlMeter(sec, "weight", { label: "Weight", value: lb, unit: "lb", digits: 0 }),
      this._hlMeter(sec, "vo2", { label: "VO2 max", value: vo2, digits: 1 }),
    ];
    return `<div class="ps-hblk">
        <div class="ps-hbh"><span class="ps-hbt">Fitness</span><span class="ps-hbw">this season</span>
          ${stale ? `<span class="ps-chip warn"><span class="ps-dot"></span>Garmin offline</span>` : ""}</div>
        ${this._hlGrid(cells, 4)}
      </div>`;
  },

  /* ------------------------------------------------------------------- ride */
  _hlRide(sec) {
    const st = sec.ride && this._hass.states[sec.ride];
    if (!st) return "";
    const a = st.attributes || {};
    const m = (k) => (Number.isFinite(Number(a[k])) ? Number(a[k]) : null);
    const dist = m("distance"), dur = m("duration"), gain = m("elevationGain");
    const spd = m("averageSpeed"), kcal = m("calories"), te = m("aerobicTrainingEffect");
    if (dist == null && dur == null) return "";
    const when = a.startTime ? new Date(String(a.startTime).replace(" ", "T")) : null;
    const dateTxt = when && Number.isFinite(when.getTime())
      ? when.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
    const ct = (v, lbl, unit, digits) => `<div class="ps-hct"><b>${
      v == null ? "—" : v.toFixed(digits == null ? 0 : digits)
      }${v == null || !unit ? "" : `<u>${pcEsc(unit)}</u>`}</b><span>${pcEsc(lbl)}</span></div>`;
    return `<div class="ps-hblk">
        <div class="ps-hbh"><span class="ps-hbt">Last ride</span>
          <span class="ps-hbw">${pcEsc(a.locationName || a.activityName || "")}</span>
          ${dateTxt ? `<span class="ps-chip"><span class="ps-dot"></span>${pcEsc(dateTxt)}</span>` : ""}</div>
        <div class="ps-hctr">
          ${ct(dist == null ? null : dist / 1609.344, "distance", "mi", 1)}
          ${ct(dur == null ? null : dur / 60, "elapsed", "m")}
          ${ct(gain == null ? null : gain * 3.28084, "climbed", "ft")}
          ${ct(spd == null ? null : spd * 2.23694, "avg mph", "", 1)}
          ${ct(kcal, "kcal")}
          ${ct(te, "train effect", "", 1)}
        </div>
        <div class="ps-hnote">Garmin sends a summary, never a stream, so there is no ride
          trace to draw.</div>
      </div>`;
  },

  /* ---------------------------------------------------------------- walking */
  _hlWalking(sec) {
    const W = sec.walking || {};
    const sp = this._hlRead(W.speed), sl = this._hlRead(W.step_len);
    const su = this._hlRead(W.support), asym = this._hlRead(W.asymmetry);
    if (sp == null && sl == null && su == null && asym == null) return "";
    const cells = [
      this._hlMeter(sec, "speed", { label: "Speed", value: sp, unit: "mph", digits: 1 }),
      this._hlMeter(sec, "step_len", { label: "Step len", value: sl, unit: "in", digits: 1 }),
      this._hlMeter(sec, "support", { label: "2-foot", value: su, unit: "%", digits: 1 }),
      /* A flat zero here landed inside the poisoned backfill hour, and a
         perfect gait is less likely than a missing one — so it reports as
         questionable rather than as the best possible reading. */
      this._hlMeter(sec, "asymmetry", { label: "Asymmetry", value: asym, unit: "%", digits: 0, q: asym === 0 }),
    ];
    return `<div class="ps-hblk">
        <div class="ps-hbh"><span class="ps-hbt">Walking</span><span class="ps-hbw">mechanics</span></div>
        ${this._hlGrid(cells, 4)}
        ${asym === 0 ? `<div class="ps-hnote"><b>Asymmetry reads a flat 0%</b> and its dot is grey,
          not green — a perfect zero out of the backfill hour is more likely absent than true.</div>` : ""}
      </div>`;
  },

  /* ---------------------------------------------------------------- hearing */
  _hlHearing(sec) {
    const db = this._hlRead(sec.hearing);
    const eff = this._hlRead(sec.effort);
    if (db == null && eff == null) return "";
    /* The only band in this section that is not his own. 80 dB is Apple's
       published exposure limit, so it is a ceiling rather than a habit — drawn
       filled from the floor, because "under the limit" and "where you usually
       are" are different claims and must not look alike. */
    const cap = sec.hearing_limit || 80;
    const cells = [
      psHealthMeter({
        label: "Sound around him", value: db, unit: "dB", digits: 0,
        band: { lo: 40, hi: cap, dlo: 40, dhi: cap + 25 }, cap: true,
      }),
      this._hlMeter(sec, "effort", { label: "Effort", value: eff, unit: "kcal/hr/kg", digits: 1 }),
    ];
    return `<div class="ps-hblk">
        <div class="ps-hbh"><span class="ps-hbt">Hearing</span><span class="ps-hbw">environment</span></div>
        ${this._hlGrid(cells, 2)}
        <div class="ps-hnote">${cap} dB is Apple's published exposure limit — a real threshold,
          not a personal range, which is why it is drawn as a ceiling.</div>
      </div>`;
  },

  /* -------------------------------------------------------------- synthesis
     A sentence, never a score. A readiness number is the rings mistake one
     level up: a manufactured figure standing in front of the measurements.
     Every clause here is traceable to a dot you can see, and the whole thing
     degrades to a plain reading when there are no bands to read yet. */
  _hlSentence(sec) {
    const total = this._hlRead(sec.sleep_total);
    const hrv = this._hlRead(sec.hrv);
    const rhr = this._hlRead(sec.resting_hr);
    const cmp = (v, k) => {
      const b = this._hlBand(sec, k);
      if (v == null || !b) return null;
      if (v < Number(b.lo)) return "under";
      if (v > Number(b.hi)) return "over";
      return "in";
    };

    const bits = [];
    const sleepC = cmp(total, "asleep");
    if (sleepC === "under") bits.push(`<em class="w">Short night</em>`);
    else if (sleepC === "over") bits.push("Long night");
    else if (sleepC === "in") bits.push("Solid night");
    /* No fallback here either. "5h 37m asleep" restates the meter three
       centimetres above it, which is the whole reason the sentence exists to
       say what the band MEANS rather than what the number is. */

    /* Recovery reads as one clause only when every banded metric agrees;
       naming the exception is more useful than an average of dots. */
    const rec = [["hrv", hrv], ["resting_hr", rhr]]
      .map(([k, v]) => ({ k, c: cmp(v, k) }))
      .filter((x) => x.c);
    if (rec.length && rec.every((x) => x.c === "in" || (x.k === "hrv" && x.c === "over"))) {
      bits.push(`<em>fully recovered</em>`);
    } else if (rec.length) {
      const bad = rec.find((x) => x.c === "under" || x.c === "over");
      if (bad) bits.push(`<em class="w">${bad.k === "hrv" ? "HRV low" : "resting HR up"}</em>`);
    }

    /* No fallback that restates the meters. With no bands the sentence has
       nothing to add, and the first live render proved it: it read
       "5h 37m asleep, HRV 31 · resting 59" directly under three meters showing
       5h 37m, 31 and 59. That is the duplication this project has now shipped
       four times; a clause exists only where a band supports it, and a
       sentence with no clauses is not drawn. */
    return bits.length ? `<div class="ps-hsyn">${bits.join(", ")}</div>` : "";
  },

  /* ------------------------------------------------------------------- chip
     The chip carries the half of the loop the body is NOT showing. The three
     collapsed meters are night and recovery, so the chip is today's load.
     It must never carry the sentence's conclusion — that is the duplication
     this project has shipped four times now (weather, desk, Joel, and the
     first draft of this card) — and it must never claim a roll-up like "all
     in band", because sleep is routinely out while the other two are in, and
     the chip would then contradict a dot two centimetres below it. */
  _hlChip(sec) {
    const ex = this._hlRead((sec.load || {}).exercise);
    if (ex != null) {
      return `<span class="ps-chip"><span class="ps-dot"></span>${Math.round(ex)}m active</span>`;
    }
    const steps = this._hlRead((sec.load || {}).steps);
    if (steps != null) {
      return `<span class="ps-chip"><span class="ps-dot"></span>${Math.round(steps).toLocaleString()} steps</span>`;
    }
    return "";
  },

  _secHealth(sec) {
    if (!this._hass) return "";
    const total = this._hlRead(sec.sleep_total);
    const hrv = this._hlRead(sec.hrv);
    const rhr = this._hlRead(sec.resting_hr);

    /* Nothing at all to say — the whole section goes, divider and all, rather
       than leaving a band of dashes on the column. */
    if (total == null && hrv == null && rhr == null) return "";

    const top = this._hlGrid([
      this._hlMeter(sec, "asleep", { label: "Slept", value: total, text: psHmDur(total) }),
      this._hlMeter(sec, "hrv", { label: "HRV", value: hrv, unit: "ms", digits: 0, hiOk: true }),
      this._hlMeter(sec, "resting_hr", { label: "Resting", value: rhr, unit: "bpm", digits: 0 }),
    ], 3);

    const blocks = [
      this._hlSleep(sec),
      this._hlTrace(sec),
      this._hlRecovery(sec),
      this._hlLoad(sec),
      this._hlFitness(sec),
      this._hlRide(sec),
      this._hlWalking(sec),
      this._hlHearing(sec),
    ].filter(Boolean).join("");

    return `
      ${this._head(sec, this._hlChip(sec))}
      ${top}
      ${this._hlSentence(sec)}
      <div class="ps-xtra">${blocks}</div>`;
  },
});
