/* ============================================================================
 * purdy-shell-card — the `crew` section
 *
 * Replaces the `quick` tile grid AND the `systems` robot rows, which were two
 * views of the same three machines.
 *
 * TWO INDEPENDENT ZONES, not one section expand (v1.51.0). The robots share a
 * row but nothing else: one is a floor cleaner you dispatch to a room, the
 * other is a litter box you read trends off. A single section-level expand made
 * opening either one dump both control sets into a wall of chips — the
 * screenshot of v1.50.0 is a whole screen of room pills with the litter box's
 * two buttons stranded at the bottom. So each card owns its own open state and
 * its own panel, and both can be open, or neither.
 *
 * A NUMBER NEEDS ITS NOUN. The old tiles read "Jeeves 10 %" and "Litter 16 %" —
 * the dirty-water tank and the waste drawer, unlabelled, pointing opposite ways.
 * Every figure here is drawn next to what it measures.
 *
 * ZERO IS NOT MISSING. Everything reads through psCrewNum, which returns null
 * rather than 0 for an absent sensor; null renders as "—" and an empty ring.
 * ========================================================================== */

function psCrewNum(hass, id) {
  if (!id) return null;
  return pcNum(hass, id);
}

function psCrewPct(v) {
  return v == null ? "—" : `${Math.round(v)}%`;
}

/* Dreame publishes its selects as slugs — select.jeeves_cleaning_mode is
   "mopping", not "Mopping". Only rendering against real states caught it. */
function psCrewWords(s) {
  if (!s || s === "unknown" || s === "unavailable") return "";
  const t = String(s).replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function psCrewWhen(iso) {
  const t = psParseTs(iso);
  if (t == null) return "";
  const d = new Date(t);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

/* DISTANCE IS DERIVED, AND SAYS SO.
 *
 * Dreame publishes 233 entities for this vacuum and not one of them is a
 * distance — area, time and run count only. Miles therefore come from area
 * divided by the effective path width, which is an ASSUMPTION (`path_width_m`,
 * default 0.30 for a D10/L-series mop head), not a measurement. So the figure
 * carries a "≈" and the width stays in config where it can be corrected.
 * Presenting it bare would be a guess wearing a sensor's clothes. */
function psCrewMiles(areaValue, unit, widthM) {
  if (areaValue == null || !(widthM > 0)) return null;
  const m2 = /ft/i.test(unit || "") ? areaValue * 0.09290304 : areaValue;
  return (m2 / widthM) / 1609.344;
}

Object.assign(PurdyShellCard.prototype, {

  /* Two CONCENTRIC horseshoes, not two segments of one.
     _ringSvg stacks segments head-to-tail, which is right when the parts sum to
     a whole (deep + light = the night). These do not: they are independent and
     point opposite ways, and laid end-to-end they read as one arc that changes
     colour at an arbitrary point. Separate radii say "two things". */
  _crewRing(size, outer, inner) {
    const cx = size / 2;
    const ring = (r, stroke, frac, col) => {
      const c = 2 * Math.PI * r;
      const arc = pcRingArc(r);
      let out = `<circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="var(--ps-track)"
          stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${arc.toFixed(2)} ${c.toFixed(2)}"
          transform="rotate(${PC_RING_START} ${cx} ${cx})"/>`;
      if (frac == null) return out;          // no reading: track only, never zero
      const len = arc * Math.max(0, Math.min(1, frac));
      if (len > 0.2) {
        out += `<circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="${col}"
          stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${len.toFixed(2)} ${c.toFixed(2)}"
          transform="rotate(${PC_RING_START} ${cx} ${cx})"/>`;
      }
      return out;
    };
    const ro = size / 2 - 5;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        ${ring(ro, 7, outer.frac, outer.col)}
        ${ring(ro - 9, 4, inner.frac, inner.col)}
      </svg>`;
  },

  _crewLine(label, valueHtml) {
    return `<div class="ps-cwl"><em>${psEsc(label)}</em>${valueHtml}</div>`;
  },

  _crewCardHead(name, open, running, zone) {
    return `<div class="ps-cwtop">
        <span class="ps-cwdot ${running ? "on" : ""}"></span>
        <span class="ps-cwnm">${psEsc(name)}</span>
        <span class="ps-cwcv ${open ? "open" : ""}">${this._chev()}</span>
      </div>`;
  },

  /* ---- collapsed faces ---- */

  _crewVacCard(v, open) {
    const h = this._hass;
    const st = pcState(h, v.entity);
    const running = st === "cleaning" || st === "returning";
    const batt = psCrewNum(h, v.battery);
    const water = psCrewNum(h, v.dirty_water);
    const filter = psCrewNum(h, v.filter);

    /* While he is running the charge is not the interesting number — progress
       is. The ring keeps its shape and changes what it means, and the caption
       changes with it so the two can never disagree. */
    const prog = running ? psCrewNum(h, v.progress) : null;
    const outerVal = prog != null ? prog : batt;
    const outerLbl = prog != null ? "job" : "battery";

    const m = v.mileage || {};
    const areaSt = m.area && h.states[m.area];
    const miles = psCrewMiles(psCrewNum(h, m.area),
      areaSt && areaSt.attributes.unit_of_measurement, m.path_width_m || 0.3);
    const runs = psCrewNum(h, m.runs);

    return `<div class="ps-cwcard ${open ? "open" : ""}">
        <button class="ps-cwface" type="button" data-crewzone="vac">
          ${this._crewCardHead(v.name || "Jeeves", open, running)}
          <div class="ps-cwring">
            ${this._crewRing(92,
              { frac: outerVal == null ? null : outerVal / 100, col: "var(--ps-cool)" },
              { frac: water == null ? null : water / 100, col: "var(--ps-warn)" })}
            <div class="ps-cwrv"><b>${psCrewPct(outerVal)}</b><span>${outerLbl}</span></div>
          </div>
          ${this._crewLine("Distance", `<b>${miles == null ? "—" : `≈${miles.toFixed(1)} mi`}</b>`)}
          ${this._crewLine("Runs", `<b>${runs == null ? "—" : Math.round(runs).toLocaleString()}</b>`)}
          ${this._crewLine("Filter", `<b class="${filter != null && filter <= 20 ? "warn" : ""}">${psCrewPct(filter)}</b>`)}
        </button>
      </div>`;
  },

  _crewLitterCard(l, open) {
    const h = this._hass;
    const st = pcState(h, l.entity);
    const running = st === "cleaning";
    const litter = psCrewNum(h, l.litter_level);
    const drawer = psCrewNum(h, l.waste_drawer);
    const pet = l.pet || {};
    const weight = psCrewNum(h, pet.weight);
    const visits = psCrewNum(h, pet.visits);
    const scoops = psCrewNum(h, pet.scoops);
    const wUnit = (() => {
      const s = pet.weight && h.states[pet.weight];
      return s && s.attributes.unit_of_measurement ? s.attributes.unit_of_measurement : "lb";
    })();

    return `<div class="ps-cwcard ${open ? "open" : ""}">
        <button class="ps-cwface" type="button" data-crewzone="litter">
          ${this._crewCardHead(l.name || "Litter box", open, running)}
          <div class="ps-cwring">
            ${this._crewRing(92,
              { frac: litter == null ? null : litter / 100, col: "var(--ps-good)" },
              { frac: drawer == null ? null : drawer / 100, col: "var(--ps-warn)" })}
            <div class="ps-cwrv"><b>${psCrewPct(litter)}</b><span>litter</span></div>
          </div>
          ${this._crewLine("Scoops", `<b>${scoops == null ? "—" : Math.round(scoops).toLocaleString()}</b>`)}
          ${this._crewLine("Visits today", `<b>${visits == null ? "—" : Math.round(visits)}</b>`)}
          ${this._crewLine(pet.name || "Weight", `<b>${weight == null ? "—" : `${weight.toFixed(1)} ${wUnit}`}</b>`)}
        </button>
      </div>`;
  },

  /* ---- vacuum panel: dispatch ---- */

  /* Thirteen room pills over six rows was most of a phone screen. The rooms
     belong to a FLOOR, and the vacuum already knows which floor its map is on,
     so the floor is a tab and only that floor's rooms are drawn — six or seven
     chips, one or two rows. The prefix ("1F - ") is the grouping key AND is
     stripped from the chip, because printing it on every pill repeats the tab. */
  _crewRooms(v) {
    const h = this._hass;
    const sel = v.room_select && h.states[v.room_select];
    if (!sel || !Array.isArray(sel.attributes.options)) return "";
    const opts = sel.attributes.options;
    const cur = sel.state;

    const groups = [];
    opts.forEach((o) => {
      const i = String(o).indexOf(" - ");
      const g = i > 0 ? o.slice(0, i) : "";
      const label = i > 0 ? o.slice(i + 3) : o;
      let bucket = null;
      groups.forEach((x) => { if (x.name === g) bucket = x; });
      if (!bucket) { bucket = { name: g, rooms: [] }; groups.push(bucket); }
      bucket.rooms.push({ option: o, label });
    });

    /* Which tab is showing follows the SELECTION, so the chosen room is always
       visible — a tab that hid the current pick would look like nothing was
       selected at all. */
    let active = groups[0] && groups[0].name;
    groups.forEach((g) => { g.rooms.forEach((r) => { if (r.option === cur) active = g.name; }); });
    if (this._crewFloor != null) {
      groups.forEach((g) => { if (g.name === this._crewFloor) active = g.name; });
    }

    const tabs = groups.length > 1
      ? `<div class="ps-cwtabs">${groups.map((g) =>
        `<button class="ps-cwtab ${g.name === active ? "on" : ""}" type="button"
           data-crewfloor="${psEsc(g.name)}">${psEsc(g.name)}</button>`).join("")}</div>`
      : "";

    let chips = "";
    groups.forEach((g) => {
      if (g.name !== active) return;
      chips = g.rooms.map((r) =>
        `<button class="ps-cwroom ${r.option === cur ? "on" : ""}" type="button"
           data-crewroom="${psEsc(v.room_select)}" data-val="${psEsc(r.option)}">${psEsc(r.label)}</button>`).join("");
    });
    return `${tabs}<div class="ps-cwrooms">${chips}</div>`;
  },

  _crewBtn(label, icon, attrs) {
    return `<button class="ps-cwbtn" type="button" ${attrs}>
        <ha-icon icon="${psEsc(icon)}"></ha-icon><span>${psEsc(label)}</span>
      </button>`;
  },

  _crewVacPanel(v) {
    const h = this._hass;
    const st = pcState(h, v.entity);
    const busy = st === "cleaning" || st === "returning";
    const mode = psCrewWords(pcState(h, v.cleaning_mode));
    const suction = psCrewWords(pcState(h, v.suction));
    const sel = v.room_select && h.states[v.room_select];
    const pick = sel ? String(sel.state).replace(/^\S+ - /, "") : "";
    const sub = [mode, suction].filter(Boolean).join(" · ");

    /* Only the consumables that are actually low earn a line. "Filter 14%" is
       worth a nag; "Main brush 57%" is noise. Deep clean is gone — it named a
       house-cleaning routine that is no longer used. */
    const wear = [];
    (v.wear || []).forEach((w) => {
      const pct = psCrewNum(h, w.entity);
      if (pct != null && pct <= (w.warn_below == null ? 25 : w.warn_below)) {
        wear.push(`${w.label} ${Math.round(pct)}%`);
      }
    });

    return `<div class="ps-cwpanel">
        <button class="ps-cwhero" type="button" data-crewgo="${psEsc(v.entity)}"
          data-script="${psEsc(v.room_script || "")}">
          <span class="ps-cwplay">${busy
            ? `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5v14M15 5v14"/></svg>`
            : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M7 4.5 19 12 7 19.5Z"/></svg>`}</span>
          <span class="ps-grow">
            <span class="ps-cwt">${busy ? "Pause" : pick ? `Clean ${psEsc(pick)}` : "Start cleaning"}</span>
            ${sub ? `<span class="ps-cwd ps-trunc">${psEsc(sub)}</span>` : ""}
          </span>
        </button>
        ${this._crewRooms(v)}
        <div class="ps-cwpair">
          ${/* The map's only door used to be the Quick tile's tap_action, and
                replacing that grid with this section left the sheet configured,
                mounted and unreachable. Anything that lived ONLY on a control
                being replaced needs a new way in, or it silently disappears —
                the same trap that stranded the music presets in v1.25.1.
                data-sheet is handled generically in core's _bind, so this needs
                no handler of its own. */
            v.map_sheet
              ? this._crewBtn("Map", "mdi:map-marker-radius",
                `data-sheet="${psEsc(v.map_sheet)}"`)
              : ""}
          ${this._crewBtn("Dock", "mdi:home-import-outline",
            `data-crewact="vacuum.return_to_base" data-target="${psEsc(v.entity)}"`)}
          ${v.emptied_button
            ? this._crewBtn("Emptied tank", "mdi:cup-water",
              `data-crewact="input_button.press" data-target="${psEsc(v.emptied_button)}"`)
            : ""}
        </div>
        ${wear.length ? `<div class="ps-cwnote">${psEsc(wear.join(" · "))}</div>` : ""}
      </div>`;
  },

  /* ---- litter panel: trends ---- */

  /* A weight line and a visits bar chart, both off the recorder. Weight is the
     one that matters — a cat losing weight quietly is the thing a litter box is
     uniquely able to notice — so it gets the line and its own min/max labels
     rather than a bare sparkline nobody can read a number off. */
  _crewTrend(id, days, kind, colour) {
    const rows = (this._crewHist || {})[id];
    if (rows == null) return `<div class="ps-cwempty">loading…</div>`;
    if (!rows.length) return `<div class="ps-cwempty">no history yet</div>`;

    const W = 300;
    const H = 56;
    if (kind === "bars") {
      /* Visits are counted per day, so they are bars — a line between daily
         totals would imply values in between that were never measured. */
      const buckets = {};
      const now = new Date();
      for (let d = days - 1; d >= 0; d--) {
        const day = new Date(now.getTime() - d * 86400000);
        buckets[`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`] = 0;
      }
      rows.forEach((r) => {
        const d = new Date(r.t);
        const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (k in buckets && r.v > buckets[k]) buckets[k] = r.v;
      });
      const keys = Object.keys(buckets);
      const vals = keys.map((k) => buckets[k]);
      const max = Math.max(1, ...vals);
      const bw = W / keys.length;
      const bars = vals.map((v, i) => {
        const bh = Math.max(1.5, (v / max) * (H - 10));
        return `<rect x="${(i * bw + bw * 0.18).toFixed(1)}" y="${(H - bh).toFixed(1)}"
          width="${(bw * 0.64).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"
          fill="${i === vals.length - 1 ? colour : "rgba(255,255,255,.22)"}"/>`;
      }).join("");
      return `<svg class="ps-cwchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
        aria-hidden="true">${bars}</svg>
        <div class="ps-cwaxis"><span>${days}d ago</span><span>max ${max}</span><span>today</span></div>`;
    }

    /* pcSparkPoly takes {t,v} rows, not bare numbers, and returns null rather
       than a flat line when there is nothing to draw — an invented straight
       line through an empty box is the same lie as a ring reading zero.
       minSpan is 0.5 lb, not the 1.0 the temperature callers use: half a pound
       on a ten-pound cat is a real change and must not be flattened away. */
    const pts = pcSparkPoly(pcDownsample(rows, 60), W, H - 8, 4, 0.5);
    if (!pts) return `<div class="ps-cwempty">not enough history yet</div>`;
    const vals = rows.map((r) => r.v);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return `<svg class="ps-cwchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="ps-cwaxis"><span>${lo.toFixed(1)}</span><span>${days}d</span><span>${hi.toFixed(1)}</span></div>`;
  },

  _crewLitterPanel(l) {
    const h = this._hass;
    const st = pcState(h, l.entity);
    const pet = l.pet || {};
    const days = l.trend_days || 30;
    return `<div class="ps-cwpanel">
        <div class="ps-cwpair">
          ${this._crewBtn(st === "cleaning" ? "Cycling…" : "Cycle now", "mdi:reload",
            `data-crewact="vacuum.start" data-target="${psEsc(l.entity)}"`)}
          ${l.reset_button
            ? this._crewBtn("Reset", "mdi:restart",
              `data-crewact="button.press" data-target="${psEsc(l.reset_button)}"`)
            : ""}
        </div>
        ${pet.weight ? `<div class="ps-cwsub">${psEsc(pet.name || "Cat")} weight · ${days}d</div>
          ${this._crewTrend(pet.weight, days, "line", "var(--ps-cool)")}` : ""}
        ${pet.visits ? `<div class="ps-cwsub">Visits per day · 14d</div>
          ${this._crewTrend(pet.visits, 14, "bars", "var(--ps-good)")}` : ""}
      </div>`;
  },

  /* ---- history for the litter trends ----
     Its own fetch, not the shared 26h one: the graphs and room sparklines have
     no use for a month, and two entities over 30 days is a smaller query than
     widening the window everything else already shares.
     `end_time` is ALWAYS sent — /api/history/period defaults it to start + 1 day,
     so every window longer than 24h silently stops short. See pcNowIso. */
  _fetchCrewHistory() {
    const c = this._config;
    if (!c || !this._hass) return;
    let sec = null;
    (c.sections || []).forEach((s) => { if (s.type === "crew") sec = s; });
    if (!sec) return;
    const pet = (sec.litter || {}).pet || {};
    const ids = [pet.weight, pet.visits].filter(Boolean);
    if (!ids.length) return;
    const days = sec.trend_days || (sec.litter || {}).trend_days || 30;
    const start = new Date(Date.now() - days * 86400000).toISOString();
    const url = `history/period/${start}?end_time=${encodeURIComponent(pcNowIso())}`
      + `&filter_entity_id=${ids.join(",")}&minimal_response&significant_changes_only`;
    this._hass.callApi("GET", url).then((res) => {
      const out = {};
      ids.forEach((id) => { out[id] = []; });
      (res || []).forEach((series) => {
        if (!series || !series.length) return;
        const id = series[0].entity_id;
        if (!(id in out)) return;
        series.forEach((row) => {
          const v = parseFloat(row.state);
          if (!isNaN(v)) out[id].push({ t: Date.parse(row.last_changed), v });
        });
      });
      this._crewHist = out;
      this._render();
    }).catch(() => {
      const out = {};
      ids.forEach((id) => { out[id] = []; });
      this._crewHist = out;
      this._render();
    });
  },

  /* The status chip, named separately so the sheet header can carry it too. */
  _crewChip(sec) {
    const h = this._hass;
    const v = sec.vacuum || {};
    const l = sec.litter || {};
    const states = [v.entity, l.entity].filter(Boolean).map((e) => pcState(h, e));
    const busy = states.filter((s) => s === "cleaning" || s === "returning").length;
    const bad = states.filter((s) => s === "error").length;
    return bad
      ? `<span class="ps-chip bad"><span class="ps-dot"></span>${bad} error${bad > 1 ? "s" : ""}</span>`
      : busy
        ? `<span class="ps-chip cool"><span class="ps-dot"></span>${busy} running</span>`
        : `<span class="ps-chip good"><span class="ps-dot"></span>All docked</span>`;
  },

  /* The full crew body, shared by the section and the sheet.
   *
   * `openDefault` is how the sheet opens with Jeeves already expanded. In the
   * column an expanded panel pushed everything below it down, so collapsed was
   * the right default; a sheet has the room, and leaving it collapsed would put
   * the vacuum map — the whole reason the map sheet exists — two taps behind a
   * dock button instead of one. It is a DEFAULT, not a force: the moment
   * anyone taps a tile _crewOpen exists and wins, so collapsing it sticks. */
  _crewBody(sec, openDefault) {
    const v = sec.vacuum || {};
    const l = sec.litter || {};
    const w = sec.washer || {};
    const open = this._crewOpen || openDefault || {};
    const cards = [
      v.entity ? this._crewVacCard(v, !!open.vac) : "",
      l.entity ? this._crewLitterCard(l, !!open.litter) : "",
    ].filter(Boolean).join("");

    /* The panels sit BELOW the grid at full width, not inside the 50% card —
       a dispatch panel squeezed into half the screen is what made the room
       chips wrap six rows deep. */
    return `<div class="ps-cwgrid">${cards}</div>
      ${open.vac && v.entity ? this._crewVacPanel(v) : ""}
      ${open.litter && l.entity ? this._crewLitterPanel(l) : ""}
      ${w.entity ? this._crewWasher(w) : ""}`;
  },

  /* What, if anything, needs a HUMAN.
   *
   * This is the whole argument for moving the crew behind the dock. The section
   * measured 329px — the second largest thing on the phone — and the great
   * majority of the time it said: everything is docked, nothing is running, the
   * washer is off. That is a lot of screen to report an absence. Jeeves is idle
   * most of the day, the litter box is interesting twice a month, and the washer
   * matters for the twenty minutes after it finishes.
   *
   * So the landing page keeps only the moments that need you, and the rest of
   * it — the map, the rooms, the wear parts, the pet trend — lives in the dock
   * app where there is room for it. A section renderer that returns "" is
   * dropped entirely, divider and all, so a quiet house costs nothing.
   */
  _crewNeeds(sec) {
    const h = this._hass;
    const out = [];
    const v = sec.vacuum || {};
    const l = sec.litter || {};
    const w = sec.washer || {};

    if (pcState(h, v.entity) === "error") {
      out.push({ icon: v.icon || "mdi:robot-vacuum-alert", sev: "bad",
        text: `${v.name || "Vacuum"} needs help`, sub: "Stopped with an error" });
    }
    if (pcState(h, l.entity) === "error") {
      out.push({ icon: "mdi:alert-circle-outline", sev: "bad",
        text: `${l.name || "Litter box"} needs a reset`, sub: "Stopped with an error" });
    }

    const drawer = pcNum(h, l.waste_drawer);
    const dAt = sec.drawer_above == null ? 85 : sec.drawer_above;
    if (drawer != null && drawer >= dAt) {
      out.push({ icon: "mdi:delete-alert-outline", sev: drawer >= 95 ? "bad" : "warn",
        text: "Waste drawer is nearly full", sub: `${Math.round(drawer)}% — empty it` });
    }

    if (pcState(h, w.entity) === "Finished") {
      const started = psParseTs(pcState(h, w.start_time));
      out.push({ icon: w.icon || "mdi:washing-machine", sev: "warn",
        text: `${w.name || "Washer"} has finished`,
        sub: started ? `Started ${new Date(started).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Unload it" });
    }

    /* Consumables are a warn, never a critical: a filter at 15% still works.
       They are also collapsed into one row rather than five, the same way the
       attention card folds eleven battery sensors into a line. */
    const wAt = sec.wear_below == null ? 20 : sec.wear_below;
    const worn = (v.wear || []).filter((x) => {
      const n = pcNum(h, x.entity);
      return n != null && n <= wAt;
    });
    if (worn.length) {
      out.push({ icon: "mdi:tools", sev: "warn",
        text: `${worn.length} ${v.name || "vacuum"} part${worn.length > 1 ? "s" : ""} to replace`,
        sub: worn.map((x) => `${x.label} ${Math.round(pcNum(h, x.entity))}%`).join(" · ") });
    }
    return out;
  },

  _secCrew(sec) {
    const h = this._hass;
    if (!h) return "";

    /* alerts_only is the landing-page face: nothing at all unless something
       needs doing. The dock app carries everything else. */
    if (sec.alerts_only) {
      const needs = this._crewNeeds(sec);
      if (!needs.length) return "";
      return needs.map((n) => `<div class="ps-cwneed ${psEsc(n.sev)}" data-sheet="${
        psEsc(sec.sheet || "crew")}" role="button" tabindex="0">
          <div class="ps-cwbadge"><ha-icon icon="${psEsc(n.icon)}"></ha-icon></div>
          <div class="ps-grow">
            <div class="ps-cwt ps-trunc">${psEsc(n.text)}</div>
            ${n.sub ? `<div class="ps-cwd ps-trunc">${psEsc(n.sub)}</div>` : ""}
          </div>
          <span class="ps-cv"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5l7 7-7 7"/></svg></span>
        </div>`).join("");
    }

    return `${this._head(sec, this._crewChip(sec))}
      ${this._crewBody(sec)}`;
  },

  _crewWasher(w) {
    const h = this._hass;
    const st = pcState(h, w.entity);
    const done = st === "Finished";
    const running = st === "Running";
    const started = psParseTs(pcState(h, w.start_time));
    let sub = "";
    if (running && started) sub = `Started ${new Date(started).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    else if (done) sub = "Unload it";
    else if (started) sub = `Last run ${new Date(started).toLocaleDateString([], { day: "numeric", month: "short" })}`;

    return `<div class="ps-cwwash ${done ? "alert" : ""}">
        <div class="ps-cwbadge"><ha-icon icon="${psEsc(w.icon || "mdi:washing-machine")}"></ha-icon></div>
        <div class="ps-grow">
          <div class="ps-cwt">${psEsc(w.name || "Washer")}</div>
          ${sub ? `<div class="ps-cwd ps-trunc">${psEsc(sub)}</div>` : ""}
        </div>
        <span class="ps-chip ${done ? "warn" : running ? "cool" : ""}">${psEsc(st || "—")}</span>
      </div>`;
  },

  /* Bound once per element per selector — see _each. No handler closes over
     hass or config; they read this._hass live, because the shell patches and a
     handler outlives many repaints. */
  _bindCrew() {
    this._each("[data-crewzone]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const z = el.getAttribute("data-crewzone");
        if (!this._crewOpen) this._crewOpen = {};
        this._crewOpen[z] = !this._crewOpen[z];
        /* The trends are only worth fetching once someone opens the panel. */
        if (z === "litter" && this._crewOpen[z] && !this._crewHist) this._fetchCrewHistory();
        this._render();
      });
    });

    this._each("[data-crewfloor]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._crewFloor = el.getAttribute("data-crewfloor");
        this._render();
      });
    });

    this._each("[data-crewroom]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._hass.callService("input_select", "select_option", {
          entity_id: el.getAttribute("data-crewroom"),
          option: el.getAttribute("data-val"),
        });
      });
    });

    this._each("[data-crewact]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const [dom, srv] = el.getAttribute("data-crewact").split(".");
        this._hass.callService(dom, srv, { entity_id: el.getAttribute("data-target") });
      });
    });

    this._each("[data-crewgo]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const ent = el.getAttribute("data-crewgo");
        const script = el.getAttribute("data-script");
        const st = pcState(this._hass, ent);
        if (st === "cleaning") { this._hass.callService("vacuum", "pause", { entity_id: ent }); return; }
        if (script) { this._hass.callService("script", "turn_on", { entity_id: script }); return; }
        this._hass.callService("vacuum", "start", { entity_id: ent });
      });
    });
  },
});
