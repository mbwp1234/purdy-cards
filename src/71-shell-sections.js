/* ============================================================================
 * purdy-shell-card — section renderers
 *
 * Every one of these returns an HTML string and reads nothing but hass and the
 * section's own config, which is what lets the core diff a section's output
 * against the last one and skip the DOM entirely when nothing changed.
 *
 * A renderer that returns "" is dropped by the core along with its divider —
 * that is how the tv section disappears when every set is off.
 * ========================================================================== */

Object.assign(PurdyShellCard.prototype, {
  /* The key word carries the aurora gradient (styled on h2 b), so this returns
     markup, not plain text — it is inserted unescaped by both render paths.
   *
   * The night branch exists because the greeting and the sky are two readings
   * of the same clock, and they were contradicting each other: at 11 PM the
   * ground went near-black while the header still said "Good evening". The
   * cutoff is 22, the SAME boundary as the night sky band, so the two cannot
   * drift apart — the other three thresholds are left alone, because a
   * greeting is about the part of the day and a sky is about the light, and
   * "Good afternoon" at 9:30 in the morning would be the worse error. */
  _greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Good <b>night</b>";
    if (h < 12) return "Good <b>morning</b>";
    if (h < 17) return "Good <b>afternoon</b>";
    if (h < 22) return "Good <b>evening</b>";
    return "Good <b>night</b>";
  },

  _who() {
    const c = this._config;
    if (c.name !== undefined) return c.name;
    const u = this._hass && this._hass.user;
    if (!u || !u.name) return "";
    return String(u.name).trim().split(/\s+/)[0];
  },

  /* Where a "this is playing" row should go.
   *
   * Once TV and music are one sheet, a row that opens the old `music` sheet
   * lands somewhere the dock no longer goes, and a TV row that opens `tv` gets
   * the remote with no way through to Listen. Both are the orphaning trap this
   * card has hit twice — so the target is derived rather than configured: if a
   * media sheet exists, everything routes there, on the face matching the row
   * the user actually tapped. Installs without one are unchanged. */
  _playTarget(face) {
    const sheets = this._config.sheets || {};
    if (sheets.media) return `data-sheet="media" data-face="${face}"`;
    return face === "watch" ? "" : `data-sheet="music"`;
  },

  /* Presence in the header, replacing the `people` section.
   *
   * A ring means home. A red pip means the phone is under 25% — the one thing
   * about a person that is ever actionable from a dashboard, and the only
   * reason the old section's battery column existed. Steps are neither, so
   * they move to more-info along with everything else. */
  _hdrPeople() {
    const list = this._config.people || [];
    if (!list.length) return "";
    const h = this._hass;
    return `<span class="ps-pav">${list.map((p, i) => {
      const st = pcState(h, p.entity);
      const home = st === "home";
      const batt = pcNum(h, p.battery);
      const nm = pcName(h, p.entity, p.name);
      /* Only a person with a step sensor gets the horseshoe and the sheet.
         Everyone else keeps the avatar exactly as it was — presence ring,
         battery pip, tap for more-info — because a bare track around a face
         that will never carry a reading is the zero-and-missing confusion in
         its most useless form: a ring that can only ever mean nothing. */
      const tracked = !!p.steps;
      const s = tracked ? this._personStats(p) : null;
      const bits = [home ? "home" : (st || "").replace(/_/g, " ")];
      if (s && s.today != null) bits.push(`${Math.round(s.today).toLocaleString()} steps`);
      if (batt != null) bits.push(`${Math.round(batt)}%`);
      /* Presence moves from the ring to the FACE when the ring is carrying
         steps: two coloured rings around a 21px photograph is one signal too
         many in the space of a fingernail, and "lit or grey" is the reading
         that survives at this size. */
      const cls = `ps-pv ${home ? "home" : "away"} ${batt != null && batt < 25 ? "low" : ""} ${tracked ? "big" : ""}`;
      const hooks = tracked
        ? `data-person="${i}" data-entity="${psEsc(p.entity)}"`
        : `data-info="${psEsc(p.entity)}"`;
      return `<span class="${cls}" ${hooks} role="button" tabindex="0"
          title="${psEsc(`${nm} — ${bits.join(", ")}`)}"
          aria-label="${psEsc(`${nm}, ${bits.join(", ")}`)}">${
            tracked ? this._pvRing(s) : ""}${this._pvFace(p, nm)}</span>`;
    }).join("")}</span>`;
  },

  /* A 270° arc. `segs` are [fraction, colour] laid end to end. */
  _ringSvg(size, stroke, segs, goalFrac, goalCol) {
    const r = size / 2 - stroke / 2 - 2;
    const c = 2 * Math.PI * r;
    const arc = pcRingArc(r);
    const cx = size / 2;
    let off = 0;
    /* Every ring carries the aurora gradient in its defs; a caller opts in by
       passing "url(#ps-aur)" as a segment colour. Duplicate ids across
       sibling SVGs are fine — url() resolves to the first match and every
       def is identical. */
    let out = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <defs><linearGradient id="ps-aur" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--ps-aur-a, #56D4E4)"/>
        <stop offset="1" stop-color="var(--ps-aur-b, #8B7CFF)"/></linearGradient></defs>
      <circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="var(--ps-track)"
        stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${arc.toFixed(2)} ${c.toFixed(2)}" transform="rotate(${PC_RING_START} ${cx} ${cx})"/>`;
    segs.forEach(([f, col]) => {
      const len = arc * Math.max(0, Math.min(1, f));
      if (len <= 0.2) { off += len; return; }
      out += `<circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="${col}"
        stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${len.toFixed(2)} ${c.toFixed(2)}"
        stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(${PC_RING_START} ${cx} ${cx})"/>`;
      off += len;
    });
    if (goalFrac != null && goalFrac > 0 && goalFrac <= 1) {
      const deg = pcRingRotate(goalFrac);
      out += `<line x1="${cx}" y1="${(cx - r - stroke / 2 - 1).toFixed(2)}" x2="${cx}" y2="${(cx - r + stroke / 2 + 1).toFixed(2)}"
        stroke="${goalCol || "var(--ps-warn)"}" stroke-width="2.2" stroke-linecap="round"
        transform="rotate(${deg.toFixed(1)} ${cx} ${cx})"/>`;
    }
    return out + "</svg>";
  },

  /* One room, 24h, no axes — enough to answer "is this room drifting?" beside
     the number that answers "where is it now?".
   *
   * An empty box when there is no history, never a flat line: a straight line
   * through the middle is a claim about the room, and "the recorder has
   * nothing" is not that claim. The box keeps its size either way so the
   * column of numbers to its right stays aligned. */
  _sparkSvg(id, scale) {
    const W = 56, H = 18;
    const empty = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"></svg>`;
    const raw = this._history[id];
    if (!raw || raw.length < 2) return empty;
    const pts = raw
      .map((p) => ({ t: p.t, v: parseFloat(p.s) }))
      .filter((p) => Number.isFinite(p.v));
    const poly = pcSparkPoly(pcDownsample(pts, 28), W, H, 3, null, scale);
    if (!poly) return empty;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <polyline fill="none" stroke="var(--ps-cool)" stroke-width="1.5" opacity=".75"
          stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"
          points="${poly}"/>
      </svg>`;
  },

  _waveSvg(sec) {
    const g = sec.graph || {};
    const inside = (this._history[g.inside] || []).map((p) => ({ t: p.t, v: parseFloat(p.s) })).filter((p) => Number.isFinite(p.v));
    const outside = (this._history[g.outside] || []).map((p) => ({ t: p.t, v: parseFloat(p.s) })).filter((p) => Number.isFinite(p.v));
    /* A graph that quietly disappears reads as "this card has no graph".
       Say which it is: the recorder has nothing yet, or it did not answer. */
    if (inside.length < 2 && outside.length < 2) {
      return `<div class="ps-nohist">${this._histErr
        ? "History unavailable — " + psEsc(this._histErr)
        : "Not enough history yet"}</div>`;
    }

    const hours = g.hours || 24;
    const t1 = Date.now();
    const t0 = t1 - hours * 3600 * 1000;
    const all = inside.concat(outside).filter((p) => p.t >= t0);
    if (all.length < 2) return "";
    const vlo = Math.min.apply(null, all.map((p) => p.v));
    const vhi = Math.max.apply(null, all.map((p) => p.v));
    let lo = vlo, hi = vhi;
    const pad = Math.max(1.5, (hi - lo) * 0.18);
    lo -= pad; hi += pad;
    /* What the plot actually spanned, so a shape can be read as a measurement.
       The legend carries the two current readings and nothing said what the
       vertical axis meant — the same line drawn over a two-degree night and a
       twenty-degree one looks identical. Stashed rather than drawn into the
       SVG because preserveAspectRatio="none" would stretch any text in it. */
    this._waveRange = { lo: vlo, hi: vhi };

    /* TOP was 24 of 74 — a third of the graph reserved as blank headroom for
       a label that does not live there, showing up as a gap between the
       legend and the plot. The lines get the room back. */
    const W = 360, H = 74, TOP = 8, BOT = 3;
    const px = (t) => ((t - t0) / (t1 - t0)) * W;
    const py = (v) => TOP + (1 - (v - lo) / (hi - lo)) * (H - TOP - BOT);
    const line = (arr) =>
      arr.filter((p) => p.t >= t0)
        .map((p) => `${px(p.t).toFixed(1)},${py(p.v).toFixed(1)}`)
        .join(" ");

    /* Keep what was plotted so the scrubber reads the same numbers the line
       was drawn from, rather than re-deriving and drifting. */
    this._waveData = { t0, t1, inside: inside.filter((p) => p.t >= t0), outside: outside.filter((p) => p.t >= t0) };
    const ip = line(inside), op = line(outside);
    const uid = "psw" + Math.random().toString(36).slice(2, 7);
    let out = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="ps-wave-svg" aria-hidden="true">
      <defs>
        <linearGradient id="${uid}o" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--ps-heat)" stop-opacity=".30"/>
          <stop offset="100%" stop-color="var(--ps-heat)" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="${uid}i" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--ps-cool)" stop-opacity=".26"/>
          <stop offset="100%" stop-color="var(--ps-cool)" stop-opacity="0"/>
        </linearGradient>
      </defs>`;
    if (op) {
      out += `<polygon points="0,${H} ${op} ${W},${H}" fill="url(#${uid}o)"/>
        <polyline points="${op}" fill="none" stroke="var(--ps-heat)" stroke-width="1.7"
          stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    }
    if (ip) {
      out += `<polygon points="0,${H} ${ip} ${W},${H}" fill="url(#${uid}i)"/>
        <polyline points="${ip}" fill="none" stroke="var(--ps-cool)" stroke-width="1.9"
          stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    }
    return out + "</svg>";
  },

  /* Walk the sleep-state history back from the newest reading and stop at the
     first break longer than the gap, so tonight is charted rather than tonight
     glued to the tail of last night. */
  _sleepSpan(sec) {
    const rows = this._history[sec.sleep_state] || [];
    const asleep = (v) => v === "light_sleep" || v === "deep_sleep" || v === "awake";
    const live = rows.filter((r) => asleep(r.s));
    if (!live.length) return null;
    const gap = (sec.session_gap_minutes || 90) * 60000;
    let i = live.length - 1;
    while (i > 0 && live[i].t - live[i - 1].t < gap) i--;
    const startTs = psParseTs(
      this._hass.states[(sec.hypnogram || {}).start_entity || (sec.session || {}).start] &&
      this._hass.states[(sec.hypnogram || {}).start_entity || (sec.session || {}).start].state
    );
    const from = startTs && startTs < live[i].t ? startTs : live[i].t;

    /* The session ends when it ended. Running the axis to "now" regardless
       meant that as the day went on the night was squeezed into a shrinking
       slice with a growing empty tail — by evening the hypnogram was mostly
       blank. Only a session still in progress ends at now; a finished one ends
       where the sock stopped reporting a sleep state. */
    const last = live[live.length - 1];
    const li = rows.indexOf(last);
    const active = asleep(pcState(this._hass, sec.sleep_state));
    const ended = rows[li + 1] ? rows[li + 1].t : last.t;
    const to = active ? Date.now() : Math.max(ended, from + 60000);

    return { from, to, active, rows: rows.filter((r) => r.t >= from && r.t <= to) };
  },

  _hypnoSvg(sec) {
    const span = this._sleepSpan(sec);
    if (!span || span.to - span.from < 60000) {
      return `<div class="ps-nohist">${this._histErr
        ? "History unavailable — " + psEsc(this._histErr)
        : "No sleep session recorded"}</div>`;
    }
    this._hypData = span;
    const LANE = { awake: 7, light_sleep: 22, deep_sleep: 37 };
    const COL = { awake: "var(--ps-awake)", light_sleep: "var(--ps-light)", deep_sleep: "var(--ps-deep)" };
    const W = 400, H = 46;
    const px = (t) => ((t - span.from) / (span.to - span.from)) * W;

    let out = "";
    [7, 22, 37].forEach((y) => {
      out += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="var(--ps-hair)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    });
    let prevY = null;
    const rows = span.rows.filter((r) => LANE[r.s] !== undefined);
    rows.forEach((r, i) => {
      const next = i + 1 < rows.length ? rows[i + 1].t : span.to;
      const x0 = px(r.t), x1 = px(next), y = LANE[r.s];
      if (prevY !== null) {
        out += `<line x1="${x0.toFixed(1)}" y1="${prevY}" x2="${x0.toFixed(1)}" y2="${y}"
          stroke="rgba(255,255,255,.2)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      }
      out += `<rect x="${x0.toFixed(1)}" y="${y - 3.5}" width="${Math.max(1.2, x1 - x0).toFixed(1)}"
        height="7" rx="2" fill="${COL[r.s]}"/>`;
      prevY = y;
    });
    const fmt = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `<div class="ps-hyp">
        <div class="ps-hypt" data-readout="hyp"><span class="ps-lbl">${span.active ? "Tonight" : "Last night"}</span><span>${rows.length} transitions</span></div>
        <div class="ps-hypplot" data-scrub="hyp">
          <div class="ps-cross" hidden></div>
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Sleep stages tonight">${out}</svg>
        </div>
        <div class="ps-hypt"><span>${fmt(span.from)}</span><span>${fmt(span.to)}</span></div>
      </div>`;
  },

  _chev() {
    return `<span class="ps-cv"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5l7 7-7 7"/></svg></span>`;
  },

  /* A DOOR's affordance, and deliberately not the chevron.
   *
   * A header that enters a mode or opens a sheet drew nothing at all, on a card
   * where nearly everything else responds to a press — so the row read as a
   * caption and the whole page behind it was undiscoverable. That is the named
   * worst friction: "not tappable" is not a complaint about what happens when
   * you press, it is a complaint about not knowing you may.
   *
   * It must not be the chevron. A chevron promises the thing below it is about
   * to unfold in place, and these do the opposite — they replace the screen or
   * slide a sheet over it. A diagonal arrow is the standard "this leaves here"
   * glyph and reads as a different promise at a glance. */
  _door() {
    return `<span class="ps-dv"><svg viewBox="0 0 24 24" class="ps-ico"><path
      d="M8 16L16 8M16 8H10M16 8v6"/></svg></span>`;
  },

  /* snake_case out of an integration is not a label. `manual_override` was
     rendering verbatim as the only such string on the screen. */
  _humanize(s) {
    const t = String(s == null ? "" : s).replace(/[_-]+/g, " ").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  },

  /* Why the goal is what it is. Humanising alone left a bare word sitting
     under the temperature — "Schedule" reads as a stray link rather than a
     status, where "Manual override" happened to read as a sentence. Say what
     the known reasons mean and fall back to humanising the rest. */
  _reasonText(raw) {
    const known = {
      schedule: "Following the schedule",
      manual_override: "Manual override — holding this goal",
      window_open: "Paused — a window is open",
      away: "Away setback",
      preset: "Set by the active preset",
    };
    const k = String(raw == null ? "" : raw).toLowerCase();
    return known[k] || this._humanize(raw);
  },

  /* One header treatment for every section.
   *
   * A fixed section used to render as a 9px uppercase caption while an
   * expandable one rendered as a 12.5px title — so scrolling the column, two
   * sections read as headings and five read as labels of the block above them.
   * And the early return DROPPED chipHtml: Systems computed its
   * `Healthy` / `N faults` summary, passed it in, and it was never displayed.
   * The chip is the whole reason to leave a section collapsed.
   */
  /* `opts.mode` turns the header into a DOOR rather than a toggle: the whole
     row enters that mode, and it draws no chevron because a chevron promises
     the thing below it is about to unfold in place. The Systems row on the
     landing page made the same promise and set the precedent for dropping it;
     Body is the second. The status chip is still drawn either way — dropping
     it was the v1.28.0 bug where the Systems summary was computed and never
     displayed. */
  /* `opts.sheet` is the third kind of header: it slides a sheet over the
     column. Same argument as `mode` — no chevron, because nothing unfolds
     below — so it takes the door glyph too. */
  _head(sec, chipHtml, opts) {
    const mode = opts && opts.mode;
    const sheet = opts && opts.sheet;
    const fixed = sec.expandable === false;
    const door = mode || sheet;
    const inner = `<span class="ps-nm">${psEsc(sec.title || "")}</span>
        ${chipHtml || ""}
        ${door ? this._door() : (fixed ? "" : this._chev())}`;
    if (mode) {
      return `<button class="ps-sh" type="button" data-mode="${psEsc(mode)}">${inner}</button>`;
    }
    if (sheet) {
      return `<button class="ps-sh" type="button" data-sheet="${psEsc(sheet)}">${inner}</button>`;
    }
    if (fixed) return `<div class="ps-sh">${inner}</div>`;
    return `<button class="ps-sh" type="button" data-open="${psEsc(sec.key)}">${inner}</button>`;
  },

  _secSleep(sec) {
    const h = this._hass;
    const state = pcState(h, sec.sleep_state);
    const active = state === "deep_sleep" || state === "light_sleep" || state === "awake";

    /* "Sock off" and "the sensor is not there" are different facts. The first
       is the normal daytime state; the second means nothing on this card can
       be trusted, and it used to render as the first. */
    const sockR = pcReading(h, sec.sleep_state);
    const gone = !sockR.ok && (sockR.why === "missing" || sockR.why === "offline");
    const label = { deep_sleep: "Deep sleep", light_sleep: "Light sleep", awake: "Awake" }[state]
      || (gone ? "Sensor unavailable" : "Sock off");
    const cls = { deep_sleep: "deep", light_sleep: "lt", awake: "warn" }[state] || (gone ? "warn" : "");

    /* Between sessions this section is the tallest thing on the screen and
       every number in it is eighteen hours old. Collapsed, it keeps the ring,
       the caption and the split — the vitals and the hypnogram move behind the
       expand, one tap away, rather than holding 140px all day. While the sock
       is on nothing is hidden: that is when it is worth the room. */
    const idle = !active && sec.idle_compact !== false;

    const r = sec.ring || {};
    /* Keep null distinct from zero all the way to the caption. */
    const deepN = active ? pcNum(h, r.deep) : pcNum(h, r.deep_last_night);
    const lightN = active ? pcNum(h, r.light) : pcNum(h, r.light_last_night);
    const noData = deepN == null && lightN == null;
    const deep = deepN || 0;
    const light = lightN || 0;
    const max = r.max_hours || 12;
    const total = deep + light;
    const goalDeep = pcNum(h, (r.goal || {}).deep) || 0;
    const goalLight = pcNum(h, (r.goal || {}).light) || 0;
    const goal = goalDeep + goalLight;

    const ring = this._ringSvg(98, 8,
      [[deep / max, "var(--ps-deep)"], [light / max, "var(--ps-light)"]],
      goal > 0 ? Math.min(1, goal / max) : null);

    const startTs = psParseTs(pcState(h, (sec.session || {}).start));
    const since = startTs
      ? new Date(startTs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "—";
    const elapsed = startTs && active ? psDur((Date.now() - startTs) / 60000) : null;

    const vitals = (sec.vitals || []).map((v) => {
      const liveVal = pcNum(h, v.entity);
      const val = active && liveVal != null ? liveVal : pcNum(h, v.last_night);
      const base = pcNum(h, v.baseline);
      const dig = v.digits == null ? 1 : v.digits;
      let d = `<span class="ps-vd ps-flat">—</span>`;
      if (val != null && base != null) {
        const diff = val - base;
        const good = v.lower_is_better ? diff < 0 : diff > 0;
        const cl = Math.abs(diff) < (v.flat_within || 0.6) ? "ps-flat" : good ? "ps-good" : "ps-warnc";
        const sign = diff > 0 ? "+" : "";
        d = `<span class="ps-vd ${cl}">${Math.abs(diff) < (v.flat_within || 0.6)
          ? "level" : sign + diff.toFixed(dig ? 1 : 0) + " vs 7d"}</span>`;
      }
      return `<div class="ps-vit" data-info="${psEsc(v.entity)}">
          <span class="ps-vk">${psEsc(v.label)}</span>
          <span class="ps-vv">${val == null ? "—" : val.toFixed(dig)}<small>${psEsc(v.unit || "")}</small></span>
          ${d}
        </div>`;
    }).join("");

    /* Expanded: the recap rows and chips that used to live behind #joel. */
    const w = sec.wakeups || {};
    /* Everything else in this section switches to the persisted value when the
       sock is off; this row alone always read the live counter, so the night
       the counter resets before the card is looked at it would show 0 wakeups
       beside a full ring of last night's sleep. */
    const wLast = pcNum(h, w.last_night);
    const wLive = active || wLast == null ? pcNum(h, w.live) : wLast;
    const wBase = pcNum(h, w.baseline);
    const bed = pcNum(h, (sec.bedtime || {}).entity);
    const bedBase = pcNum(h, (sec.bedtime || {}).baseline);
    const room = sec.room || {};
    const rt = pcNum(h, room.temp), rh = pcNum(h, room.humidity);
    const rAvg = pcNum(h, room.overnight_avg);

    const bedCmp = bed != null && bedBase != null
      ? (() => {
          const d = Math.round(bed - bedBase);
          if (Math.abs(d) < 10) return `<span class="ps-flat">on time</span>`;
          return `<span class="${d > 0 ? "ps-warnc" : "ps-good"}">${Math.abs(d)} min ${d > 0 ? "late" : "early"}</span>`;
        })()
      : `<span class="ps-flat">—</span>`;

    const rows = `
      <div class="ps-jrs">
        <div class="ps-jr" data-info="${psEsc(w.live)}"><span class="ps-l">Wakeups</span>
          <span class="ps-v">${wLive == null ? "—" : wLive}</span>
          <span class="${wBase != null && wLive != null && wLive <= wBase ? "ps-good" : "ps-flat"}">${wBase == null ? "" : wBase.toFixed(1) + " avg"}</span></div>
        <div class="ps-jr" data-info="${psEsc((sec.bedtime || {}).entity)}"><span class="ps-l">Bedtime</span>
          <span class="ps-v">${psMinsToClock(bed)}</span>${bedCmp}</div>
        <div class="ps-jr"><span class="ps-l">Deep / light</span>
          <span class="ps-v">${deep.toFixed(1)}h / ${light.toFixed(1)}h</span>
          <span class="ps-flat">${goal > 0 ? `7d ${goalDeep.toFixed(1)} / ${goalLight.toFixed(1)}` : ""}</span></div>
        <div class="ps-jr" data-info="${psEsc(room.temp)}"><span class="ps-l">Room</span>
          <span class="ps-v">${rt == null ? "—" : rt.toFixed(1) + "°"}${rh == null ? "" : " · " + rh.toFixed(0) + "%"}</span>
          <span class="ps-flat">${rAvg == null ? "" : rAvg.toFixed(1) + "° last"}</span></div>
      </div>`;

    return `
      ${this._head(sec, `<span class="ps-chip ${cls}"><span class="ps-dot"></span>${label}</span>`)}
      <div class="ps-jtop">
        <div class="ps-ring" style="width:98px;height:98px" data-info="${psEsc(sec.sleep_state)}">
          ${ring}
          <div class="ps-rv">${noData
            ? `<b class="ps-nodata">—</b><small>no data</small>`
            : `<b>${total.toFixed(1)}h</b><small>of ${max}h</small>`}</div>
        </div>
        <div class="ps-grow">
          <div class="ps-jn">${psEsc(pcState(h, sec.age) || pcName(h, sec.person, sec.name))}</div>
          <div class="ps-js">${active
            ? `asleep ${elapsed || "—"}<br>since ${since}`
            : `last night<br>${since === "—" ? "no session" : "from " + since}`}</div>
          <div class="ps-chips" style="margin-top:9px">${noData
            ? `<span class="ps-chip">${gone ? "Sensor not reporting" : "Nothing recorded yet"}</span>`
            : `<span class="ps-chip deep">Deep ${deepN == null ? "—" : deep.toFixed(1) + "h"}</span>
            <span class="ps-chip lt">Light ${lightN == null ? "—" : light.toFixed(1) + "h"}</span>`}
          </div>
        </div>
      </div>
      ${idle ? "" : `<div class="ps-vits">${vitals}</div>${this._hypnoSvg(sec)}`}
      <div class="ps-xtra">${idle ? `<div class="ps-vits" style="margin-top:0">${vitals}</div>${this._hypnoSvg(sec)}` : ""}${rows}</div>`;
  },

  _secClimate(sec) {
    const h = this._hass;
    const th = h.states[sec.goal] || h.states[sec.thermostat];
    const cur = th && th.attributes.current_temperature;
    /* Reads the optimistic setpoint while one is in flight, so the number
       moves on the tap instead of five seconds later. */
    const goal = this._optGoal(sec.goal || sec.thermostat, th && th.attributes.temperature);
    const action = (th && th.attributes.hvac_action) || (th && th.state) || "idle";
    const reason = th && th.attributes.hvac_action_reason;
    const rng = sec.ring || { min: 60, max: 80 };
    const frac = cur == null ? 0 : Math.max(0, Math.min(1, (cur - rng.min) / (rng.max - rng.min)));
    /* The ring drew an absolute 60–80 position and nothing else, which answers
       a question nobody asks. With the goal marked, the same arc says at a
       glance whether the house is above or below where it is meant to be. */
    const goalFrac = goal == null ? null
      : Math.max(0, Math.min(1, (goal - rng.min) / (rng.max - rng.min)));
    const heating = action === "heating";
    const col = heating ? "var(--ps-heat)" : "var(--ps-cool)";

    const zc = sec.zones || {};
    const activeZone = pcState(h, zc.select);
    const zones = (zc.options || []).map((o) => {
      const t = pcNum(h, o.temp);
      const on = activeZone === o.option;
      return `<div class="ps-zc ${on ? "on" : ""}" data-zone="${psEsc(o.option)}">${psEsc(o.label || o.option)}
        <b>${t == null ? "—" : t.toFixed(1) + "°"}</b></div>`;
    }).join("");
    const ot = pcNum(h, (sec.outside || {}).temp);
    const outside = ot == null ? "" :
      `<div class="ps-zc" data-info="${psEsc((sec.outside || {}).temp)}">Outside<b>${ot.toFixed(1)}°</b></div>`;

    const spark = sec.room_spark !== false;
    /* ONE scale down the column. Auto-scaling each room to its own data drew a
       bedroom drifting half a degree with the same amplitude as a room swinging
       four, so the list looked like five rooms in trouble and invited a
       comparison none of the pictures could support. A room genuinely steadier
       than its neighbours now looks it. */
    const sparkScale = spark ? (() => {
      let lo = Infinity, hi = -Infinity;
      (sec.rooms || []).forEach((r) => {
        (this._history[r.temp] || []).forEach((p) => {
          const v = parseFloat(p.s);
          if (!Number.isFinite(v)) return;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        });
      });
      return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? { lo, hi } : null;
    })() : null;
    const rooms = (sec.rooms || []).map((r) => {
      const t = pcNum(h, r.temp), hu = pcNum(h, r.humidity);
      return `<div class="ps-rml" data-info="${psEsc(r.temp)}">
          <span class="ps-rn ps-trunc">${psEsc(r.name || pcName(h, r.temp))}</span>
          ${spark ? `<span class="ps-spark">${this._sparkSvg(r.temp, sparkScale)}</span>` : ""}
          <span class="ps-v">${t == null ? "—" : t.toFixed(1) + "°"}</span>
          <span class="ps-h">${hu == null ? "" : hu.toFixed(1) + "%"}</span>
        </div>`;
    }).join("");

    const chips = (sec.chips || []).map((ch) => {
      /* `select.gttc_schedule_mode` names the BASE weekday/weekend lists, not
         the plan in force — GTTC runs a preset situationally and leaves
         active_preset null. A chip reading "Weekday/Weekend" while the `home`
         preset drives the house is worse than no chip. This one asks the
         schedule which scope actually owns the live window. */
      if (ch.source === "schedule_preset") {
        const scope = this._detectScope();
        const labels = (this._sched && this._sched.preset_labels) || {};
        if (!this._sched) return "";
        const txt = scope ? (labels[scope] || scope) : "Base";
        return `<span class="ps-chip">${psEsc(ch.name || "Running:")} ${psEsc(this._humanize(txt))}</span>`;
      }
      const vis = ch.visible;
      if (vis) {
        const list = Array.isArray(vis) ? vis : [vis];
        const ok = list.every((v) => {
          const st = pcState(h, v.entity);
          return v.state !== undefined ? st === v.state : st !== v.state_not;
        });
        if (!ok) return "";
      }
      const val = ch.show_state ? " " + pcState(h, ch.entity) : "";
      return `<span class="ps-chip ${ch.style === "warn" ? "warn" : ""}">${psEsc(ch.name)}${psEsc(val)}</span>`;
    }).join("");

    const wave = this._waveSvg(sec);
    const inNow = pcNum(h, (sec.graph || {}).inside);
    const outNow = pcNum(h, (sec.graph || {}).outside);

    return `
      ${this._head(sec, `<span class="ps-chip ${heating ? "warn" : "cool"}"><span class="ps-dot"></span>${psEsc(
        this._humanize(action))}</span>`)}
      <div class="ps-chero">
        <div class="ps-ring" style="width:92px;height:92px" data-info="${psEsc(sec.goal || sec.thermostat)}">
          ${this._ringSvg(92, 7.5, [[frac, col]], goalFrac, "var(--ps-text)")}
          ${/* "now" invited the reading that this is the house temperature,
                and then neither zone chip below it agreed — three numbers on
                one card with no stated relationship. It is the thermostat's
                own sensor, in ONE room (the kitchen, here), so naming that
                room is the entire explanation.

                `hero_label` rather than the word "thermostat": that was tried
                and it overflowed the ring, clipping to "HERMOSTAT". A ring
                caption has about seven characters, which a room name fits and
                a job title does not. Defaults to "now" so an install that
                does not set it is unchanged. */""}
          <div class="ps-rv"><b>${cur == null ? "—" : Number(cur).toFixed(1) + "°"}</b><small>${
            psEsc(sec.hero_label || "now")}</small></div>
        </div>
        <div class="ps-grow">
          <div class="ps-row">
            <button class="ps-step" type="button" data-step="-1" aria-label="Lower goal">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M5 12h14"/></svg></button>
            <div class="ps-goal"><b>${goal == null ? "—" : Math.round(goal) + "°"}</b><span>goal</span></div>
            <button class="ps-step" type="button" data-step="1" aria-label="Raise goal">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M12 5v14M5 12h14"/></svg></button>
          </div>
          ${reason ? `<div class="ps-reason">${psEsc(this._reasonText(reason))}</div>` : ""}
        </div>
      </div>
      <div class="ps-zpair">${zones}${outside}</div>
      ${this._holdHtml(sec)}
      <div class="ps-xtra">
        ${sec.schedule ? `<div class="ps-btns">
          <button class="ps-btn" type="button" data-sheet="schedule">
            <svg viewBox="0 0 24 24" class="ps-ico"><rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9h17M8 3v3M16 3v3M12 12.5v3l2 1.2"/></svg>
            Schedule</button>
        </div>` : ""}
        <div class="ps-rmlist">${rooms}</div>
        ${chips ? `<div class="ps-chips">${chips}</div>` : ""}
      </div>
      ${wave ? `<div class="ps-wlg" data-readout="wave">
          <span><i style="background:var(--ps-cool)"></i>In<b>${inNow == null ? "\u2014" : inNow.toFixed(1) + "\u00B0"}</b></span>
          <span><i style="background:var(--ps-heat)"></i>Out<b>${outNow == null ? "\u2014" : outNow.toFixed(1) + "\u00B0"}</b></span>
        </div>
        <div class="ps-wave" data-scrub="wave">
        <div class="ps-cross" hidden></div>
        ${this._waveRange ? `<span class="ps-wax hi">${this._waveRange.hi.toFixed(0)}°</span>
        <span class="ps-wax lo">${this._waveRange.lo.toFixed(0)}°</span>` : ""}
        ${wave}</div>` : ""}`;
  },

  /* Renders nothing at all when every television is off, the same way the
     conditional card it replaces disappeared from the old view. */
  /* One surface for everything currently playing, music and television alike.
   *
   * Music used to hold a permanent slot on the landing page whether or not
   * anything was playing, and the televisions had a separate self-hiding
   * section. Both are the same question — "what is on right now" — so they are
   * one section that renders nothing at all when the house is quiet, and the
   * full music controls moved behind the dock button.
   *
   * Music shows its album art, television shows the logo of whatever app is
   * open, so the row is identifiable before any text is read.
   */
  _secNowplaying(sec) {
    const h = this._hass;
    const rows = [];

    /* Every room that is playing, not just the first one. _nowPlaying answers
       with a single player because the dock bar has room for exactly one — but
       this section is the answer to "what is on right now", and while the
       foreign-app_id reject was in place multi-room simply never happened, so
       one row was always enough by accident. Two rooms now routinely play
       different things. */
    (this._config.now_playing || {}).players?.forEach((p) => {
      const st = this._hass.states[p.entity];
      if (!psLiveMusic(st)) return;
      const a = st.attributes;
      const np = { ...p, st, playing: st.state === "playing" };
      const art = a.entity_picture_local;
      /* The album is dropped when it merely restates the track, which is what
         a single reports — "Danza Kuduro X Beautiful" printed a line below
         itself. The room name is the fallback, never a second copy of the
         title. */
      const album = a.media_album_name && a.media_album_name !== a.media_title
        ? a.media_album_name : null;
      /* The room is always named. With one row it was implied and could be
         left out; with two it is the only thing telling them apart. */
      const sub = [[a.media_artist, album].filter(Boolean).join(" — "), np.name]
        .filter(Boolean).join(" · ");
      rows.push(`<div class="ps-npr" ${this._playTarget("listen")} role="button" tabindex="0">
          <div class="ps-npart">${art
            ? `<img src="${psEsc(art)}" alt="" />`
            : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
          <div class="ps-grow">
            <div class="ps-npt ps-trunc">${psEsc(a.media_title || "Playing")}</div>
            <div class="ps-nps ps-trunc">${psEsc(sub)}</div>
          </div>
          <button class="ps-npb" type="button" data-mp="playpause" data-entity="${psEsc(np.entity)}"
            aria-label="${np.playing ? "Pause" : "Play"}">
            <svg viewBox="0 0 24 24" class="ps-ico">${np.playing
              ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
        </div>`);
    });

    (sec.tvs || []).forEach((t) => {
      const st = pcState(h, t.media_player);
      if (!st || st === "off" || st === "unavailable" || st === "unknown") return;
      const app = pcState(h, t.app_sensor);
      const shown = app && app !== "unknown" && app !== "unavailable" ? app : "On";
      /* Prefer a sheet when one is configured; a hash link is the older path
         and leaves a Bubble pop-up to be closed. */
      /* The media sheet wins when there is one; the older remote_sheet and
         hash-link paths still work for an install without it. */
      const open = (this._config.sheets || {}).media
        ? this._playTarget("watch")
        : (sec.remote_sheet
          ? `data-sheet="${psEsc(sec.remote_sheet)}"`
          : `data-nav="${psEsc(sec.remote_link || "#tvs")}"`);
      rows.push(`<div class="ps-npr" ${open} role="button" tabindex="0">
          <div class="ps-npart ps-npapp">${this._appIcon(sec, app)}</div>
          <div class="ps-grow">
            <div class="ps-npt ps-trunc">${psEsc(shown)}</div>
            <div class="ps-nps ps-trunc">${psEsc(t.name)}</div>
          </div>
          <button class="ps-npb" type="button" data-tvoff="${psEsc(t.remote || t.media_player)}"
            aria-label="Turn off ${psEsc(t.name)}">
            <svg viewBox="0 0 24 24" class="ps-ico"><path d="M12 3.5v8"/><path d="M6.8 7.2a7.5 7.5 0 1 0 10.4 0"/></svg>
          </button>
        </div>`);
    });

    /* Nothing on: the section is dropped entirely, divider and all. */
    if (!rows.length) return "";
    return `${this._head(sec, `<span class="ps-chip good"><span class="ps-dot"></span>${rows.length}</span>`)}${rows.join("")}`;
  },

  /* Match the app sensor's text against the configured apps, by name or by the
     android activity, then fall back to a plain screen. */
  _appIcon(sec, app) {
    const tvGlyph = `<svg viewBox="0 0 24 24" class="ps-ico"><rect x="2.5" y="5" width="19" height="12" rx="2"/><path d="M8.5 20.5h7"/></svg>`;
    if (!app) return tvGlyph;
    const want = String(app).toLowerCase();
    const hit = (sec.apps || []).find((x) =>
      String(x.name || "").toLowerCase() === want ||
      String(x.activity || "").toLowerCase() === want);
    if (hit && PC_BRANDS[hit.brand]) return PC_BRANDS[hit.brand];
    /* The sensor sometimes reports the brand outright, with no app configured. */
    if (PC_BRANDS[want]) return PC_BRANDS[want];
    return tvGlyph;
  },

  _secTv(sec) {
    const h = this._hass;
    const live = (sec.tvs || []).filter((t) => {
      const st = pcState(h, t.media_player);
      return st && st !== "off" && st !== "unavailable" && st !== "unknown";
    });
    if (!live.length) return "";
    const rows = live.map((t) => {
      const app = pcState(h, t.app_sensor);
      return `<div class="ps-tvrow">
          <svg viewBox="0 0 24 24" class="ps-ico"><rect x="2.5" y="5" width="19" height="12" rx="2"/><path d="M8.5 20.5h7"/></svg>
          <span class="ps-grow"><span class="ps-tvn">${psEsc(t.name)}</span>
            <span class="ps-tva ps-trunc">${psEsc(app && app !== "unknown" ? app : "On")}</span></span>
          <button class="ps-tvoff" type="button" data-tvoff="${psEsc(t.remote || t.media_player)}"
            aria-label="Turn off ${psEsc(t.name)}">
            <svg viewBox="0 0 24 24" class="ps-ico"><path d="M12 3.5v8"/><path d="M6.8 7.2a7.5 7.5 0 1 0 10.4 0"/></svg>
          </button>
        </div>`;
    }).join("");
    return `${this._head(sec, `<span class="ps-chip good"><span class="ps-dot"></span>${live.length} on</span>`)}${rows}`;
  },

  /* A manual hold outranks the schedule, so it gets its own row with a
     two-tap cancel rather than hiding among the chips. */
  _holdHtml(sec) {
    const hold = sec.hold;
    if (!hold || !hold.remaining) return "";
    const raw = pcState(this._hass, hold.remaining);
    const mins = parseFloat(raw);
    if (!Number.isFinite(mins) || mins <= 0) return "";
    const armed = this._armed === "hold";
    return `<button class="ps-hold ${armed ? "armed" : ""}" type="button" data-arm="hold">
        <svg viewBox="0 0 24 24" class="ps-ico"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/></svg>
        <span class="ps-grow">${armed ? "Tap again to cancel the hold"
          : `Hold active \u00B7 ${psDur(mins)} left`}</span>
        <span class="ps-holdx">${armed ? "Cancel" : "\u00D7"}</span>
      </button>`;
  },

  _secPeople(sec) {
    const h = this._hass;
    const cells = (sec.people || []).map((p) => {
      const st = pcState(h, p.entity);
      const home = st === "home";
      const batt = pcNum(h, p.battery);
      const steps = pcNum(h, p.steps);
      const nm = pcName(h, p.entity, p.name);
      const pic = h.states[p.entity] && h.states[p.entity].attributes.entity_picture;
      return `<div class="ps-pw" data-info="${psEsc(p.entity)}">
          <div class="ps-av">${pic ? `<img src="${psEsc(pic)}" alt="" />` : psEsc((nm || "?").charAt(0).toUpperCase())}</div>
          <div class="ps-grow">
            <div class="ps-pn ps-trunc">${psEsc(nm)}</div>
            <div class="ps-pb ${batt != null && batt < 25 ? "low" : ""}">${
              home ? "Home" : psEsc(st.replace(/_/g, " "))
            }${batt == null ? "" : " · " + Math.round(batt) + "%"}${
              steps == null ? "" : " · " + Math.round(steps).toLocaleString()
            }</div>
          </div>
        </div>`;
    }).join("");
    return `${this._head(sec)}<div class="ps-ppl">${cells}</div>`;
  },

  _secRooms(sec) {
    const h = this._hass;
    const cells = (sec.rooms || []).map((r) => {
      const t = pcNum(h, r.temp), hu = pcNum(h, r.humidity);
      return `<div class="ps-rc ${r.accent ? "acc" : ""}" data-info="${psEsc(r.temp)}">
          <span class="ps-rn2">${psEsc(r.name || pcName(h, r.temp))}</span>
          <b>${t == null ? "—" : t.toFixed(1) + "°"}</b>
          <span class="ps-rh">${hu == null ? "" : hu.toFixed(1) + "%"}</span>
        </div>`;
    }).join("");
    return `${this._head(sec)}<div class="ps-rstrip">${cells}</div>`;
  },

  _secQuick(sec) {
    const h = this._hass;
    const tone = (t) => {
      const s = pcState(h, t.entity);
      if (t.alert_when && t.alert_when.indexOf(s) >= 0) return "alert";
      if (t.on_when) return t.on_when.indexOf(s) >= 0 ? "on" : "";
      return s === "on" || s === "playing" || s === "cleaning" ? "on" : "";
    };
    const tiles = (sec.tiles || []).map((t, i) => {
      const vs = h.states[t.value_entity || t.entity];
      const raw = vs ? vs.state : "";
      const unit = vs && vs.attributes.unit_of_measurement ? " " + vs.attributes.unit_of_measurement : "";
      const value = t.value_text || (raw ? raw.replace(/_/g, " ") + unit : "—");
      let bar = "";
      if (t.bar_entity) {
        const pct = pcNum(h, t.bar_entity);
        if (pct != null) {
          const p = Math.max(0, Math.min(100, (pct / (t.bar_max || 100)) * 100));
          const warn = t.bar_warn_above == null ? 80 : t.bar_warn_above;
          const crit = t.bar_critical_above == null ? 95 : t.bar_critical_above;
          const c = p >= crit ? "var(--ps-bad)" : p >= warn ? "var(--ps-warn)" : "var(--ps-cool)";
          bar = `<div class="ps-bar"><i style="width:${p.toFixed(0)}%;background:${c}"></i></div>`;
        }
      }
      return `<button class="ps-qt ${tone(t)}" type="button" data-tile="${i}">
          <ha-icon icon="${psEsc(t.icon || "mdi:circle-outline")}"></ha-icon>
          <span><span class="ps-qn ps-trunc">${psEsc(pcName(h, t.entity, t.name))}</span>
          <span class="ps-qv ps-trunc">${psEsc(value)}</span></span>${bar}
        </button>`;
    }).join("");
    return `${this._head(sec)}<div class="ps-qgrid">${tiles}</div>`;
  },

  /* Only days that have something on them get a row.
   *
   * Five fixed days meant five "Nothing scheduled" lines on a quiet week —
   * a hundred pixels of the column saying nothing. Today always renders,
   * because "today is clear" is itself worth knowing; every later empty day is
   * counted into one quiet line at the end instead. */
  _secCalendar(sec) {
    const days = sec.days || 5;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let out = "";
    let skipped = 0;
    for (let d = 0; d < days; d++) {
      const day = new Date(today.getTime() + d * 86400000);
      const next = day.getTime() + 86400000;
      const evs = this._events.filter((e) => e.t >= day.getTime() && e.t < next);
      if (!evs.length && d > 0) { skipped++; continue; }
      out += `<div class="ps-cday">
        <div class="ps-cdt ${d === 0 ? "today" : ""}">
          <div class="ps-dw">${day.toLocaleDateString([], { weekday: "short" })}</div>
          <div class="ps-dn">${day.getDate()}</div>
        </div>
        <div class="ps-cev">${evs.length
          ? evs.map((e) => `<div class="ps-ev"><i style="background:${psEsc(e.color)}"></i>
              <span class="ps-trunc">${psEsc(e.name)}</span>
              <span class="ps-et">${e.allDay ? "all day"
                : new Date(e.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>`).join("")
          : `<div class="ps-ev none">Nothing scheduled</div>`}</div>
      </div>`;
    }
    const tail = skipped
      ? `<div class="ps-cskip">${skipped === days - 1
          ? `Nothing else in the next ${days} days`
          : `${skipped} clear day${skipped > 1 ? "s" : ""} not shown`}</div>`
      : "";
    return `${this._head(sec)}${out}${tail}`;
  },

  _fired(list) {
    const h = this._hass;
    return (list || []).filter((f) => {
      const st = pcState(h, f.entity);
      if (f.state !== undefined) return st === f.state;
      if (f.state_not !== undefined) return st !== f.state_not && st !== "unavailable" && st !== "unknown";
      return false;
    });
  },

  _meterHtml(m) {
    const v = pcNum(this._hass, m.entity);
    const p = v == null ? 0 : Math.max(0, Math.min(100, v));
    const warn = m.warn_above == null ? 80 : m.warn_above;
    const crit = m.critical_above == null ? 95 : m.critical_above;
    const c = p >= crit ? "var(--ps-bad)" : p >= warn ? "var(--ps-warn)" : "var(--ps-good)";
    return `<div class="ps-sysrow" data-info="${psEsc(m.entity)}">
        <span class="ps-sn">${psEsc(m.label)}</span>
        <span class="ps-sv">${m.text ? psEsc(pcState(this._hass, m.entity))
          : (v == null ? "\u2014" : v.toFixed(1) + "%")}</span>
        <span class="ps-meter"><i style="width:${p.toFixed(0)}%;background:${c}"></i></span>
      </div>`;
  },

  _statsHtml(list) {
    const h = this._hass;
    return (list || []).map((x) => {
      const st = h.states[x.entity];
      const raw = st ? st.state : "";
      const unit = st && st.attributes.unit_of_measurement ? st.attributes.unit_of_measurement : "";
      const txt = x.map && x.map[raw] ? x.map[raw] : raw + (unit ? " " + unit : "");
      const good = x.good_when && x.good_when.indexOf(raw) >= 0;
      const bad = x.bad_when && x.bad_when.indexOf(raw) >= 0;
      return `<div class="ps-st" data-info="${psEsc(x.entity)}">
          <span class="ps-stk">${psEsc(x.label)}</span>
          <span class="ps-stv ${bad ? "ps-warnc" : good ? "ps-good" : ""}">${psEsc(txt || "\u2014")}</span>
        </div>`;
    }).join("");
  },

  _switchesHtml(items) {
    return (items || []).map((it) => {
      const on = pcState(this._hass, it.entity) === "on";
      const missing = !this._hass.states[it.entity];
      return `<div class="ps-sw ${missing ? "gone" : ""}">
          <ha-icon icon="${psEsc(it.icon || "mdi:application")}"></ha-icon>
          <span class="ps-trunc">${psEsc(it.name)}</span>
          ${it.url ? `<button class="ps-link" type="button" data-url="${psEsc(it.url)}"
            aria-label="Open ${psEsc(it.name)}">
            <svg viewBox="0 0 24 24" class="ps-ico"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
          </button>` : ""}
          ${missing ? `<span class="ps-chip">missing</span>`
            : `<button class="ps-knob ${on ? "on" : ""}" type="button" data-toggle="${psEsc(it.entity)}"
               role="switch" aria-checked="${on}" aria-label="${psEsc(it.name)}"><i></i></button>`}
        </div>`;
    }).join("");
  },

  /* A NAS, a floor robot and a litter box are three devices, not six peer
     groups — the robots were sitting at the same level as a Docker category,
     which made them read like a subsystem of the server. Each device owns its
     own header, health and meters, and only the NAS has groups inside it. */
  _devicesHtml(sec) {
    return (sec.devices || []).map((d, di) => {
      const key = sec.key + "|dev|" + (d.key || d.name);
      const open = !!this._openGroups[key];
      const faults = this._fired(d.faults);
      const sub = d.subtitle_entity ? pcState(this._hass, d.subtitle_entity) : (d.subtitle || "");
      const chip = d.chip ? pcState(this._hass, d.chip) : "";

      const groups = (d.groups || []).map((g) => {
        const gkey = key + "|" + g.name;
        const gopen = !!this._openGroups[gkey];
        const items = g.items || [];
        const on = items.filter((it) => pcState(this._hass, it.entity) === "on").length;
        return `<div class="ps-grp ${gopen ? "open" : ""}">
            <button class="ps-grph" type="button" data-group="${psEsc(gkey)}" aria-expanded="${gopen}">
              <ha-icon icon="${psEsc(g.icon || "mdi:folder-outline")}"></ha-icon>
              <span class="ps-gn">${psEsc(g.name)}</span>
              <span class="ps-chip ${on ? "good" : ""}">${on} of ${items.length}</span>
              <span class="ps-gcv"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5l7 7-7 7"/></svg></span>
            </button>
            <div class="ps-grpb"><div class="ps-swrap">${this._switchesHtml(items)}</div></div>
          </div>`;
      }).join("");

      const buttons = (d.buttons || []).map((b, i) =>
        `<button class="ps-btn" type="button" data-dbtn="${di}|${i}">${psEsc(b.name)}</button>`).join("");

      /* A device can hand its depth to the systems mode instead of expanding.
         PurdyNAS is five pages now, and a chevron that opens a stub of them
         beside the real thing is two answers to one question — so the row
         becomes the way in and drops the expand entirely. */
      const toMode = d.mode
        ? ` data-mode="${psEsc(d.mode)}"` : "";

      return `<div class="ps-dev ${open && !d.mode ? "open" : ""}">
          <button class="ps-devh" type="button"${d.mode ? toMode : ` data-group="${psEsc(key)}"`}
            aria-expanded="${d.mode ? "false" : open}">
            <span class="ps-devi ${faults.length ? "bad" : ""}"><ha-icon icon="${psEsc(d.icon || "mdi:devices")}"></ha-icon></span>
            <span class="ps-grow">
              <span class="ps-devn">${psEsc(d.name)}</span>
              <span class="ps-devs">${psEsc(sub)}</span>
            </span>
            ${faults.length
              ? `<span class="ps-chip bad"><span class="ps-dot"></span>${faults.length}</span>`
              : chip ? `<span class="ps-chip">${psEsc(chip)}</span>`
              : `<span class="ps-chip good"><span class="ps-dot"></span>OK</span>`}
            <span class="ps-gcv"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5l7 7-7 7"/></svg></span>
          </button>

          ${faults.length ? `<div class="ps-faults">${faults.map((f) =>
            `<div class="ps-fault" data-info="${psEsc(f.entity)}"><span class="ps-dotc bad"></span>
              <span class="ps-grow"><b>${psEsc(f.label)}</b> ${psEsc(f.detail || "")}</span></div>`).join("")}</div>` : ""}
          ${(d.meters || []).map((m) => this._meterHtml(m)).join("")}

          <div class="ps-devb">
            ${d.stats ? `<div class="ps-stats">${this._statsHtml(d.stats)}</div>` : ""}
            ${groups}
            ${buttons ? `<div class="ps-btns">${buttons}</div>` : ""}
          </div>
        </div>`;
    }).join("");
  },

  /* The section that got the most attention: collapsed shows meters, expanded
     shows every group's stats, every container switch and the robot controls
     that used to need the #devices popup. */
  _secSystems(sec) {
    const h = this._hass;
    if (sec.devices) {
      const all = (sec.devices || []).reduce((n, d) => n + this._fired(d.faults).length, 0);
      return `${this._head(sec, all
        ? `<span class="ps-chip bad"><span class="ps-dot"></span>${all} fault${all > 1 ? "s" : ""}</span>`
        : `<span class="ps-chip good"><span class="ps-dot"></span>Healthy</span>`)}
        ${this._devicesHtml(sec)}`;
    }

    const faults = (sec.faults || []).filter((f) => {
      const st = pcState(h, f.entity);
      if (f.state !== undefined) return st === f.state;
      if (f.state_not !== undefined) return st !== f.state_not && st !== "unavailable";
      return false;
    });

    const meters = (sec.meters || []).map((m) => {
      const v = pcNum(h, m.entity);
      const p = v == null ? 0 : Math.max(0, Math.min(100, v));
      const warn = m.warn_above == null ? 80 : m.warn_above;
      const crit = m.critical_above == null ? 95 : m.critical_above;
      const c = p >= crit ? "var(--ps-bad)" : p >= warn ? "var(--ps-warn)" : "var(--ps-good)";
      return `<div class="ps-sysrow" data-info="${psEsc(m.entity)}">
          <ha-icon icon="${psEsc(m.icon || "mdi:chart-box-outline")}"></ha-icon>
          <span class="ps-sn">${psEsc(m.label)}</span>
          <span class="ps-sv">${m.text ? psEsc(pcState(h, m.entity)) : (v == null ? "—" : v.toFixed(1) + "%")}</span>
          <span class="ps-meter"><i style="width:${p.toFixed(0)}%;background:${c}"></i></span>
        </div>`;
    }).join("");

    const groups = (sec.groups || []).map((g) => {
      const gkey = sec.key + "|" + g.name;
      const gopen = !!this._openGroups[gkey];

      const stats = (g.stats || []).map((s) => {
        const st = h.states[s.entity];
        const raw = st ? st.state : "";
        const unit = st && st.attributes.unit_of_measurement ? st.attributes.unit_of_measurement : "";
        const txt = s.map && s.map[raw] ? s.map[raw] : raw + (unit ? " " + unit : "");
        const good = s.good_when && s.good_when.indexOf(raw) >= 0;
        const bad = s.bad_when && s.bad_when.indexOf(raw) >= 0;
        return `<div class="ps-st" data-info="${psEsc(s.entity)}">
            <span class="ps-stk">${psEsc(s.label)}</span>
            <span class="ps-stv ${bad ? "ps-warnc" : good ? "ps-good" : ""}">${psEsc(txt || "—")}</span>
          </div>`;
      }).join("");

      const items = (g.items || []).map((it) => {
        const on = pcState(h, it.entity) === "on";
        return `<div class="ps-sw">
            <ha-icon icon="${psEsc(it.icon || "mdi:application")}"></ha-icon>
            <span class="ps-trunc">${psEsc(it.name)}</span>
            ${it.url ? `<button class="ps-link" type="button" data-url="${psEsc(it.url)}" aria-label="Open ${psEsc(it.name)}">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
            </button>` : ""}
            <button class="ps-knob ${on ? "on" : ""}" type="button" data-toggle="${psEsc(it.entity)}"
              role="switch" aria-checked="${on}" aria-label="${psEsc(it.name)}"><i></i></button>
          </div>`;
      }).join("");

      const buttons = (g.buttons || []).map((b, i) =>
        `<button class="ps-btn" type="button" data-gbtn="${psEsc(g.name)}|${i}">${psEsc(b.name)}</button>`).join("");

      /* A collapsed group still has to say something useful, or there is no
         reason to leave it shut: switch groups report how many are on. */
      let summary = "";
      if (g.chip) {
        summary = `<span class="ps-chip">${psEsc(pcState(h, g.chip))}</span>`;
      } else if ((g.items || []).length) {
        const on = g.items.filter((it) => pcState(h, it.entity) === "on").length;
        summary = `<span class="ps-chip ${on ? "good" : ""}">${on} of ${g.items.length} on</span>`;
      }

      return `<div class="ps-grp ${gopen ? "open" : ""}">
          <button class="ps-grph" type="button" data-group="${psEsc(gkey)}" aria-expanded="${gopen}">
            <ha-icon icon="${psEsc(g.icon || "mdi:server")}"></ha-icon>
            <span class="ps-gn">${psEsc(g.name)}</span>
            ${summary}
            <span class="ps-gcv"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5l7 7-7 7"/></svg></span>
          </button>
          <div class="ps-grpb">
            ${stats ? `<div class="ps-stats">${stats}</div>` : ""}
            ${items ? `<div class="ps-swrap">${items}</div>` : ""}
            ${buttons ? `<div class="ps-btns">${buttons}</div>` : ""}
          </div>
        </div>`;
    }).join("");

    const sub = sec.subtitle_entity ? pcState(h, sec.subtitle_entity) : "";

    return `
      ${this._head(sec, faults.length
        ? `<span class="ps-chip bad"><span class="ps-dot"></span>${faults.length} fault${faults.length > 1 ? "s" : ""}</span>`
        : `<span class="ps-chip good"><span class="ps-dot"></span>Healthy</span>`)}
      ${sub ? `<div class="ps-sub2">${psEsc(sub)}</div>` : ""}
      ${faults.length ? `<div class="ps-faults">${faults.map((f) =>
        `<div class="ps-fault" data-info="${psEsc(f.entity)}"><span class="ps-dotc bad"></span>
          <span class="ps-grow"><b>${psEsc(f.label)}</b> ${psEsc(f.detail || "")}</span></div>`).join("")}</div>` : ""}
      ${meters}
      <div class="ps-xtra">${groups}</div>`;
  },
});

