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

  /* The section is a FACE now, not a container. Its whole body is the header,
     the chip and three meters — everything else moved into the mode, and the
     header is a door into it rather than a toggle. There is no expanded state
     at all: `_head` draws no chevron for a mode door, and a stub of the four
     pages sitting beside the real thing would be two answers to one question,
     which is the argument that dropped the Systems row's chevron first. */
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

    return `
      ${this._head(sec, this._hlChip(sec), { mode: "health" })}
      ${top}
      ${this._hlSentence(sec)}`;
  },

  /* ==========================================================================
   * THE MODE
   *
   * Four pages behind their own dock, with Home on the far left — the Systems
   * shape, for the Systems reason: these pages are alternatives to each other
   * rather than neighbours in a scrolling column, and entering swaps the dock
   * as well as the column.
   *
   * It differs from Systems in ONE structural way, deliberately. Systems reads
   * a top-level `server:` block; this reads the `health` SECTION's own config,
   * because there is exactly one of it and it is already on the column. A
   * second top-level block would mean forty entity ids maintained in two
   * places, and the drift that produces is already logged in this project
   * once (the morning recap against psNurserySessions).
   *
   * WHERE A RING IS ALLOWED. The section shipped with meters because a ring
   * shows a fraction of a goal somebody else picked, and that argument still
   * holds. So the horseshoe comes back only where the goal is HIS: a number in
   * `goals:` that he set, or his own rolling average. Everything measured
   * against where it usually sits keeps the band. That is why Today and Sleep
   * have rings and Heart and Fitness have none — not a layout preference, a
   * rule about what the picture is claiming.
   * ======================================================================= */

  /* The section, wherever it sits in the column — including when it is
     `sheet_only`, so the mode survives the section being taken off the page.
     Visibility is re-checked here rather than only at the dock, because
     `data-mode` can also arrive from a stale binding. */
  _hlCfg() {
    const s = ((this._config || {}).sections || []).find((x) => x.type === "health");
    if (!s || !this._visible(s)) return null;
    return { key: s.key || "health", ...s };
  },

  /* A page whose data is entirely absent gets no dock slot, exactly as a
     missing `server:` sub-block does — so an install with no Garmin degrades
     to three pages rather than to one empty one. */
  _hlPages() {
    const sec = this._hlCfg();
    if (!sec) return [];
    const out = [];
    const L = sec.load || {}, F = sec.fitness || {};
    const has = (...ids) => ids.some((id) => id && this._hlRead(id) != null);
    if (has(L.steps, L.exercise, L.active, L.distance, L.flights, L.stand, sec.effort)) {
      out.push({ key: "today", name: "Today", icon: "mdi:progress-clock" });
    }
    if (has(sec.sleep_total, sec.sleep_deep, sec.sleep_core, sec.sleep_rem)) {
      out.push({ key: "sleep", name: "Sleep", icon: "mdi:weather-night" });
    }
    if (has(sec.hrv, sec.resting_hr, sec.respiratory, sec.walking_hr)) {
      out.push({ key: "heart", name: "Heart", icon: "mdi:heart-pulse" });
    }
    if (has(F.ftp, F.wkg, F.weight, F.vo2) || (sec.ride && this._hass.states[sec.ride])) {
      out.push({ key: "fitness", name: "Fitness", icon: "mdi:bike" });
    }
    return out;
  },

  _hlPageNow() {
    const pages = this._hlPages();
    if (!pages.length) return null;
    return pages.find((p) => p.key === this._hpage) || pages[0];
  },

  /* ------------------------------------------------------------------ rings */

  /* One horseshoe with its reading inside it. `goal` is the number the marker
     sits at; the ring's scale is whichever of value and goal is larger, so an
     OVERSHOOT stays visible instead of being clamped away at 100% — exercise
     is routinely over, and "39 minutes against a 30 minute goal" is the whole
     message on that ring. */
  _hlRing(o) {
    const size = o.size || 112;
    const stroke = o.stroke || (size >= 100 ? 9 : 6.5);
    const goal = Number.isFinite(o.goal) && o.goal > 0 ? o.goal : null;
    const segs = o.segs || (o.value == null ? [] : null);
    const max = o.max != null ? o.max
      : Math.max(o.value == null ? 0 : o.value, goal || 0) || 1;

    const arcs = segs || [[o.value / max, o.color || "var(--ps-cool)"]];
    const goalFrac = goal == null ? null : Math.min(1, goal / max);

    /* A SMALL ring wears its label underneath, not inside.
       Inside a 72px ring "EXERCISE" is wider than the chord available at the
       height the caption sits at, so it ran over the stroke on both sides and
       collided with the arc — which the first live screenshot caught and no
       assertion could. The big ring keeps its label inside, where it fits. */
    const small = size < 100;
    const label = pcEsc(o.label || "");
    const ring = `<div class="ps-ring ps-hring"${o.info ? ` data-info="${pcEsc(o.info)}"` : ""}
        style="width:${size}px;height:${size}px">
        ${this._ringSvg(size, stroke, arcs, goalFrac, o.goalColor || "var(--ps-warn)")}
        <div class="ps-rv ${small ? "sm" : ""}"><b>${o.text}</b>${
          small ? "" : `<small>${label}</small>`}</div>
      </div>`;
    if (!small) return ring;
    return `<div class="ps-hrsm">${ring}<span class="ps-hrsl">${label}</span></div>`;
  },

  /* What a ring's goal is, with the config number as the floor. `goals:` is
     where he sets them; the defaults are Apple's own so the page is useful
     before anything is configured. */
  _hlGoal(sec, key, dflt) {
    const g = (sec.goals || {})[key];
    return Number.isFinite(Number(g)) && Number(g) > 0 ? Number(g) : dflt;
  },

  /* ------------------------------------------------------------ page: today */
  _hpToday(sec) {
    const L = sec.load || {};
    const act = this._hlRead(L.active), ex = this._hlRead(L.exercise);
    const stand = this._hlRead(L.stand);
    const steps = this._hlRead(L.steps), dist = this._hlRead(L.distance);
    const fl = this._hlRead(L.flights), eff = this._hlRead(sec.effort);

    const gMove = this._hlGoal(sec, "move", 500);
    const gEx = this._hlGoal(sec, "exercise", 30);
    const gStand = this._hlGoal(sec, "stand", L.stand_goal || 12);

    /* A ring with no reading behind it draws its track and a dash — not a
       zero-length arc, which is a claim that the day has produced nothing. */
    const ring = (v, goal, text, label, color, size) => this._hlRing({
      value: v, goal, text: v == null ? "—" : text, label, color, size,
    });

    const rings = `<div class="ps-hrings">
        ${ring(act, gMove, Math.round(act || 0), "kcal move", "var(--ps-heat)", 118)}
        <div class="ps-hrcol">
          ${ring(ex, gEx, `${Math.round(ex || 0)}m`, "exercise", "var(--ps-good)", 72)}
          ${ring(stand, gStand, stand == null ? "—" : stand, "stand", "var(--ps-cool)", 72)}
        </div>
      </div>`;

    /* WHAT IS LEFT, not what has been done. The rings already carry the three
       readings at the largest step on the page, so a caption saying "264 of
       500 · stood 6 of 12" prints both of those numbers a second time an inch
       below themselves — the duplication this project has now shipped five
       times. The remaining figure is the one the rings cannot show and the one
       you would do the subtraction for. */
    const bits = [];
    const left = (v, goal, one, done) => {
      if (v == null) return;
      bits.push(v >= goal ? done : `<b>${Math.round(goal - v)}</b> ${one}`);
    };
    left(act, gMove, "kcal to go", "move goal met");
    left(ex, gEx, "minutes to go", "exercise goal met");
    left(stand, gStand, "hours left to stand", "stood every hour");

    const cells = [
      this._hlMeter(sec, "steps", {
        label: "Steps", value: steps,
        text: steps == null ? "—" : Math.round(steps).toLocaleString(),
      }),
      this._hlMeter(sec, "distance", { label: "Walked", value: dist, unit: "mi", digits: 2 }),
      this._hlMeter(sec, "flights", { label: "Flights", value: fl, digits: 0 }),
      this._hlMeter(sec, "effort", { label: "Effort", value: eff, unit: "kcal/hr/kg", digits: 1 }),
    ];

    return `<div class="ps-hblk">
        ${rings}
        ${bits.length ? `<div class="ps-hrcap">${bits.join(" · ")}</div>` : ""}
      </div>
      <div class="ps-hblk">
        <div class="ps-hbh"><span class="ps-hbt">Movement</span><span class="ps-hbw">so far today</span></div>
        ${this._hlGrid(cells, 2)}
        <div class="ps-hnote"><b>These four carry no bands on purpose.</b> Until the day
          is over every one of them is low, and a dot near the bottom of a track would
          read as a deficit rather than as a morning. The rings above are the ones with
          a goal, and a goal is a thing you are still walking toward.</div>
      </div>`;
  },

  /* ------------------------------------------------------------ page: sleep */
  _hpSleep(sec) {
    const total = this._hlRead(sec.sleep_total);
    const deep = this._hlRead(sec.sleep_deep);
    const core = this._hlRead(sec.sleep_core);
    const rem = this._hlRead(sec.sleep_rem);
    const awake = this._hlRead(sec.sleep_awake);
    const goal = this._hlGoal(sec, "sleep", 7.5);

    /* Three arcs on one ring, summing to the total in the middle — the Joel
       ring's construction, which already answers "how much, and what was it
       made of" in a single picture. The arcs are drawn from the STAGES rather
       than sliced out of the total: they sum to it anyway, and scaling
       segments to a denominator they did not come from is how a bar drifts. */
    const sum = [deep, core, rem].reduce((a, v) => a + (v == null ? 0 : v), 0);
    const max = Math.max(total == null ? sum : total, goal) || 1;
    const segs = sum > 0
      ? [[(deep || 0) / max, "var(--ps-deep)"],
         [(core || 0) / max, "var(--ps-light)"],
         [(rem || 0) / max, "var(--ps-cool)"]]
      : (total == null ? [] : [[total / max, "var(--ps-light)"]]);

    const ring = `<div class="ps-hrings">${this._hlRing({
      segs, goal, max, size: 130, stroke: 10,
      text: psHmDur(total), label: "asleep", info: sec.sleep_total,
    })}</div>`;

    /* The marker means two different things depending on whether a band
       exists, so it says which. Naming it "goal" while it is his own average
       would be the ring mistake all over again. */
    const band = this._hlBand(sec, "asleep");
    const cap = `<div class="ps-hrcap">Marker at <b>${psHmDur(goal)}</b> — ${
      band ? "the middle of your own range" : "your target, until seven nights of history exist"}</div>`;

    const denom = sum + (awake == null ? 0 : awake);
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
      this._hlMeter(sec, "deep_pct", { label: "Deep", value: pct(deep), unit: "%", digits: 0 }),
      this._hlMeter(sec, "rem_pct", { label: "REM", value: pct(rem), unit: "%", digits: 0, hiOk: true }),
      this._hlMeter(sec, "awake", { label: "Awake", value: awake, text: psHmDur(awake) }),
    ];

    return `<div class="ps-hblk">${ring}${cap}${bar}${this._hlGrid(cells, 3)}</div>
      ${this._hlTrace(sec)}
      <div class="ps-hnote"><b>No bedtime and no wake time anywhere on this page.</b>
        Apple pushes the night as four totals in one write and publishes neither, so any
        window here would be invented. Time in bed also equals time asleep exactly, every
        night, so the ratio between them would be a constant 100% wearing the look of a
        measurement.</div>`;
  },

  /* ------------------------------------------------------------ page: heart */
  _hpHeart(sec) {
    const latest = this._hlRead(sec.hr_series);
    return `${this._hlRecovery(sec)}
      ${this._hlTrace(sec)}
      ${latest == null ? "" : `<div class="ps-jr"><span class="ps-l">Latest sample</span>
        <span class="ps-v">${Math.round(latest)} bpm</span></div>`}
      <div class="ps-hnote"><b>No daily high and low.</b> The min, average and max
        sensors all report the same number — they track the latest sample rather than a
        range — so a high/low pair here would be one reading printed twice.</div>`;
  },

  /* ---------------------------------------------------------- page: fitness */
  _hpFitness(sec) {
    return `${this._hlFitness(sec)}${this._hlRide(sec)}`;
  },

  /* ------------------------------------------------------------------- chip */

  /* A page chip carries a DERIVED STATE, never a measurement the page is
     already printing at size.
   *
     The first live render broke that on three pages out of four — "31 ms HRV"
     directly above an HRV meter reading 31, "200 W FTP" above an FTP meter
     reading 200, "4,817 steps" above a Steps meter. It is the same duplication
     as the weather hero, the desk's "Up 2h 0m", Joel's chip and this section's
     own first sentence, and it keeps coming back because a number is the
     easiest thing to reach for when a chip needs filling.
   *
     So: a roll-up, a comparison, or an elapsed time — something you would have
     to do arithmetic to get. And where a page has no such fact, NO CHIP, the
     way the desk's schedule chip is dropped rather than filled with a
     placeholder word. */
  _hlPageChip(sec, page) {
    const L = sec.load || {};

    /* How many of the three closed — a roll-up of the rings, which each show
       only their own progress. */
    if (page.key === "today") {
      const pairs = [
        [this._hlRead(L.active), this._hlGoal(sec, "move", 500)],
        [this._hlRead(L.exercise), this._hlGoal(sec, "exercise", 30)],
        [this._hlRead(L.stand), this._hlGoal(sec, "stand", L.stand_goal || 12)],
      ].filter(([v]) => v != null);
      if (!pairs.length) return "";
      const met = pairs.filter(([v, g]) => v >= g).length;
      const all = met === pairs.length;
      return `<span class="ps-chip ${all ? "good" : ""}"><span class="ps-dot"></span>${
        all ? "All goals met" : `${met} of ${pairs.length} goals`}</span>`;
    }

    /* The gap against the target, which is the subtraction the ring's marker
       shows the position of but never the size of. */
    if (page.key === "sleep") {
      const total = this._hlRead(sec.sleep_total);
      const goal = this._hlGoal(sec, "sleep", 7.5);
      if (total == null) return "";
      const d = total - goal;
      if (Math.abs(d) < 1 / 12) return `<span class="ps-chip good"><span class="ps-dot"></span>On target</span>`;
      return `<span class="ps-chip ${d < 0 ? "warn" : "cool"}"><span class="ps-dot"></span>${
        psHmDur(Math.abs(d))} ${d < 0 ? "under" : "over"}</span>`;
    }

    /* A verdict against his bands — which only exists once there ARE bands.
       Before the capture layer this page correctly carries no chip at all. */
    if (page.key === "heart") {
      const rows = [["hrv", this._hlRead(sec.hrv), true],
        ["resting_hr", this._hlRead(sec.resting_hr), false],
        ["respiratory", this._hlRead(sec.respiratory), false]]
        .map(([k, v, hiOk]) => {
          const b = this._hlBand(sec, k);
          if (v == null || !b) return null;
          if (v < Number(b.lo)) return { k, bad: true };
          if (v > Number(b.hi)) return { k, bad: !hiOk };
          return { k, bad: false };
        }).filter(Boolean);
      if (!rows.length) return "";
      const off = rows.filter((r) => r.bad).length;
      return `<span class="ps-chip ${off ? "warn" : "good"}"><span class="ps-dot"></span>${
        off ? `${off} outside range` : "All in range"}</span>`;
    }

    /* How long since he rode — the page prints the DATE, and days-ago is the
       arithmetic you would otherwise do in your head. */
    const st = sec.ride && this._hass.states[sec.ride];
    const raw = st && st.attributes && st.attributes.startTime;
    const when = raw ? new Date(String(raw).replace(" ", "T")) : null;
    if (!when || !Number.isFinite(when.getTime())) return "";
    const days = Math.floor((this._nowMs() - when.getTime()) / 86400000);
    return `<span class="ps-chip ${days > 14 ? "warn" : ""}"><span class="ps-dot"></span>${
      days <= 0 ? "Rode today" : `Rode ${days}d ago`}</span>`;
  },

  /* ----------------------------------------------------------------- render */

  _renderHealth(faults) {
    const sec = this._hlCfg();
    const page = this._hlPageNow();
    /* No config, not this person's card, or nothing published yet — fall back
       to the house rather than drawing an empty app with a dock that has no
       way out of it. */
    if (!sec || !page) { this._mode = null; return this._render(); }

    this._patch("ps-stat", `
        <div>
          <div class="ps-lbl">${psEsc(sec.title || "Body")}</div>
          <h2 class="ps-syh">${psEsc(page.name)}</h2>
        </div>
        <div class="ps-rt">${this._hlPageChip(sec, page)}</div>`);

    const html = {
      today: () => this._hpToday(sec),
      sleep: () => this._hpSleep(sec),
      heart: () => this._hpHeart(sec),
      fitness: () => this._hpFitness(sec),
    }[page.key]();

    /* One keyed node per page through the column's own reconciler, so
       switching pages swaps the node rather than rewriting a shared one. */
    this._patchSections([{ key: "hl-" + page.key, html, open: false, cls: "ps-sypage" }]);

    this._patch("ps-sheetslot", this._sheetHtml(faults));
    this._mountSheetCard();

    const pages = this._hlPages();
    const dock = `<button class="ps-db home" type="button" data-hldock="__home">
        <ha-icon icon="mdi:home-variant"></ha-icon><span>Home</span></button>` +
      pages.map((p) => `<button class="ps-db ${p.key === page.key ? "on" : ""}"
          type="button" data-hldock="${psEsc(p.key)}">
          <ha-icon icon="${psEsc(p.icon)}"></ha-icon><span>${psEsc(p.name)}</span></button>`).join("");

    /* The mini bar is shared by every render path — walking into Body must not
       take the pause button away. */
    this._patch("ps-dockwrap", `${this._miniHtml()}<div class="ps-dock">${dock}</div>`);

    this._bind();
    this._bindScrub();
    this._bindHealth();
    this._reserve();
  },

  _bindHealth() {
    this._each("[data-hldock]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = el.dataset.hldock;
        psClosePopup();
        if (k === "__home") {
          this._mode = null;
          this._sheet = null;
        } else {
          this._hpage = k;
        }
        /* The signature is built from the OLD page's markup, so it has to be
           dropped or the patch decides nothing changed. */
        this._last = null;
        this._render();
        if (this.scrollIntoView) this.scrollIntoView({ block: "start" });
      });
    });
  },
});
