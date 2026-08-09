/* ============================================================================
 * purdy-shell-card — the `crew` section
 *
 * Replaces the `quick` tile grid AND the `systems` robot rows, which were two
 * views of the same three machines: Jeeves, the litter box and the washer each
 * appeared twice, costing ~610px of column. PurdyNAS moved out to its own mode,
 * so the systems section had nothing left that was not a duplicate.
 *
 * Two rules the tiles broke and this does not:
 *
 * A NUMBER NEEDS ITS NOUN. The old tiles read "Jeeves 10 %" and "Litter 16 %".
 * Those are the dirty-water tank and the waste drawer, the tile never said so,
 * and they point opposite ways — 10% dirty is good, 16% full is good, 90% litter
 * is good. Same "84.1% of what?" problem already fixed on the PurdyNAS pages.
 * Every figure here is drawn next to what it measures.
 *
 * ZERO IS NOT MISSING. Everything reads through psCrewNum, which returns null
 * rather than 0 for an absent sensor, and a null renders as "—". A robot that
 * is offline must not look like a robot whose tank is empty.
 *
 * COLLAPSED is two gauges and the washer strip; EXPANDED is dispatch for both
 * machines. Tapping either card opens the same expansion — the section has one
 * open state, like every other section, so there is no per-card accordion to
 * get out of sync with the chevron.
 * ========================================================================== */

/* A percentage that is honestly absent rather than zero. */
function psCrewNum(hass, id) {
  if (!id) return null;
  return pcNum(hass, id);
}

function psCrewPct(v) {
  return v == null ? "—" : `${Math.round(v)}%`;
}

/* Dreame publishes its selects as slugs — select.jeeves_cleaning_mode is
   "mopping", not "Mopping", and "sweeping_and_mopping" rather than words. Only
   rendering against real states caught it; the fixture had guessed the pretty
   form. Same shape as the desk card's "Partlycloudy". */
function psCrewWords(s) {
  if (!s || s === "unknown" || s === "unavailable") return "";
  const t = String(s).replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* "7:42 AM" today, "6 Aug" before that — a bare date for something that
   happened this morning reads as older than it is. */
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

Object.assign(PurdyShellCard.prototype, {

  /* Two CONCENTRIC horseshoes, not two segments of one.
   *
   * _ringSvg stacks its segments head-to-tail around a single track, which is
   * right when the parts sum to a whole (deep + light = the night's sleep).
   * Here they do not: charge and dirty water are independent quantities that
   * point opposite ways, and laid end-to-end they would read as one arc that
   * changes colour at an arbitrary point. Separate radii say "two things".
   */
  _crewRing(size, outer, inner) {
    const cx = size / 2;
    const ring = (r, stroke, frac, col) => {
      const c = 2 * Math.PI * r;
      const arc = pcRingArc(r);
      let out = `<circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="var(--ps-track)"
          stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${arc.toFixed(2)} ${c.toFixed(2)}"
          transform="rotate(${PC_RING_START} ${cx} ${cx})"/>`;
      /* A null fraction draws the track and nothing else — an empty ring is
         how "no reading" looks, and it must not look like zero. */
      if (frac == null) return out;
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
    const ri = ro - 9;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        ${ring(ro, 7, outer.frac, outer.col)}
        ${ring(ri, 4, inner.frac, inner.col)}
      </svg>`;
  },

  /* "5,562 ft² over 219 runs" — the odometer. Deliberately below the gauge and
     in the quiet colour: it is the fact you enjoy, not the one you act on. */
  _crewMileage(v) {
    const h = this._hass;
    const m = v.mileage || {};
    const area = psCrewNum(h, m.area);
    const runs = psCrewNum(h, m.runs);
    const mins = psCrewNum(h, m.time);
    const bits = [];
    if (area != null) {
      const st = h.states[m.area];
      const unit = st && st.attributes.unit_of_measurement ? st.attributes.unit_of_measurement : "ft²";
      bits.push(`${Math.round(area).toLocaleString()} ${unit}`);
    }
    if (runs != null) bits.push(`${Math.round(runs)} runs`);
    if (mins != null && bits.length < 2) bits.push(`${Math.round(mins / 60)} h`);
    if (!bits.length) return "";
    return `<div class="ps-cwmile">${psEsc(bits.join(" · "))}</div>`;
  },

  _crewLine(label, valueHtml) {
    return `<div class="ps-cwl"><em>${psEsc(label)}</em>${valueHtml}</div>`;
  },

  _crewVacCard(v) {
    const h = this._hass;
    const st = pcState(h, v.entity);
    const running = st === "cleaning" || st === "returning";
    const batt = psCrewNum(h, v.battery);
    const dirty = psCrewNum(h, v.dirty_water);
    const filter = psCrewNum(h, v.filter);

    /* While he is actually running the charge is not the interesting number —
       progress is. The ring keeps its shape and changes what it means, and the
       caption under it changes with it so the two can never disagree. */
    const prog = running ? psCrewNum(h, v.progress) : null;
    const outerVal = running && prog != null ? prog : batt;
    const outerLbl = running && prog != null ? "cleaned" : "charged";

    const ring = this._crewRing(92,
      { frac: outerVal == null ? null : outerVal / 100, col: "var(--ps-cool)" },
      { frac: dirty == null ? null : dirty / 100, col: "var(--ps-warn)" });

    /* The third row must EARN its line. It used to read "Status · Docked",
       which the dot beside the name and the section chip already say — three
       statements of the same fact on one card. While he is running the useful
       third fact is the room; while he is docked it is when he last ran. */
    const room = pcState(h, v.current_room);
    const busyRoom = running && room && room !== "unknown" && room !== "unavailable";
    const thirdLabel = busyRoom ? "Room" : "Last run";
    const thirdValue = busyRoom ? room : (psCrewWhen(pcState(h, v.last_run)) || "—");

    return `<button class="ps-cwcard" type="button" data-open="${psEsc(this._crewKey)}">
        <div class="ps-cwtop">
          <span class="ps-cwdot ${running ? "on" : ""}"></span>
          <span class="ps-cwnm">${psEsc(v.name || "Jeeves")}</span>
        </div>
        <div class="ps-cwring">${ring}
          <div class="ps-cwrv"><b>${psCrewPct(outerVal)}</b><span>${psEsc(outerLbl)}</span></div>
        </div>
        ${this._crewMileage(v)}
        ${this._crewLine("Dirty water", `<b>${psCrewPct(dirty)}</b>`)}
        ${this._crewLine("Filter", `<b class="${filter != null && filter <= 20 ? "warn" : ""}">${psCrewPct(filter)}</b>`)}
        ${this._crewLine(thirdLabel, `<b class="ps-trunc">${psEsc(thirdValue)}</b>`)}
      </button>`;
  },

  _crewVacState(st) {
    return { docked: "Docked", cleaning: "Cleaning", returning: "Returning",
      paused: "Paused", idle: "Idle", error: "Error" }[st] || (st ? st.replace(/_/g, " ") : "—");
  },

  _crewLitterCard(l) {
    const h = this._hass;
    const st = pcState(h, l.entity);
    const running = st === "cleaning";
    const litter = psCrewNum(h, l.litter_level);
    const drawer = psCrewNum(h, l.waste_drawer);
    const pet = l.pet || {};
    const weight = psCrewNum(h, pet.weight);
    const visits = psCrewNum(h, pet.visits);
    const scoops = psCrewNum(h, pet.scoops);

    const ring = this._crewRing(92,
      { frac: litter == null ? null : litter / 100, col: "var(--ps-good)" },
      { frac: drawer == null ? null : drawer / 100, col: "var(--ps-warn)" });

    const petName = pet.name || "Cat";
    const wUnit = (() => {
      const s = pet.weight && h.states[pet.weight];
      return s && s.attributes.unit_of_measurement ? s.attributes.unit_of_measurement : "lb";
    })();

    return `<button class="ps-cwcard" type="button" data-open="${psEsc(this._crewKey)}">
        <div class="ps-cwtop">
          <span class="ps-cwdot ${running ? "on" : ""}"></span>
          <span class="ps-cwnm">${psEsc(l.name || "Litter box")}</span>
        </div>
        <div class="ps-cwring">${ring}
          <div class="ps-cwrv"><b>${psCrewPct(litter)}</b><span>litter</span></div>
        </div>
        ${scoops == null || scoops <= 0
          /* A counter that has never been seeded is not an achievement of zero,
             so it does not print "0 scoops saved". It also must not fall back to
             the visit count — the row below already carries that, and the live
             render showed the same fact twice on one card. Say why it is empty. */
          ? `<div class="ps-cwmile ps-cwquiet">counting scoops from today</div>`
          : `<div class="ps-cwmile">${Math.round(scoops).toLocaleString()} scoops saved</div>`}
        ${this._crewLine("Waste drawer", `<b class="${drawer != null && drawer >= 75 ? "warn" : ""}">${psCrewPct(drawer)}</b>`)}
        ${this._crewLine(petName, `<b>${weight == null ? "—" : `${weight.toFixed(1)} ${wUnit}`}</b>`)}
        ${this._crewLine("Visits today", `<b>${visits == null ? "—" : Math.round(visits)}</b>`)}
      </button>`;
  },

  /* The washer has one number and no shape, so it gets a strip rather than a
     gauge — a ring drawn for a three-state select would be decoration. */
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

  /* ---- dispatch: what the expansion is FOR ---- */

  /* Room chips come from the input_select's own options, not from config and
     not from the vacuum's `rooms` attribute — the script that actually does the
     cleaning reads that helper, so anything else would be a second list that
     could disagree with the one being obeyed. */
  _crewRooms(v) {
    const h = this._hass;
    const sel = v.room_select && h.states[v.room_select];
    if (!sel || !Array.isArray(sel.attributes.options)) return "";
    const cur = sel.state;
    const chips = sel.attributes.options.map((o) =>
      `<button class="ps-cwroom ${o === cur ? "on" : ""}" type="button"
         data-crewroom="${psEsc(v.room_select)}" data-val="${psEsc(o)}">${psEsc(o)}</button>`).join("");
    return `<div class="ps-cwrooms">${chips}</div>`;
  },

  _crewBtn(label, icon, attrs) {
    return `<button class="ps-cwbtn" type="button" ${attrs}>
        <ha-icon icon="${psEsc(icon)}"></ha-icon><span>${psEsc(label)}</span>
      </button>`;
  },

  _crewDispatch(sec) {
    const h = this._hass;
    const v = sec.vacuum || {};
    const l = sec.litter || {};
    let out = "";

    if (v.entity) {
      const st = pcState(h, v.entity);
      const busy = st === "cleaning" || st === "returning";
      const mode = psCrewWords(pcState(h, v.cleaning_mode));
      const rooms = this._crewRooms(v);
      out += `<div class="ps-cwsub">${psEsc(v.name || "Jeeves")}</div>
        <button class="ps-cwhero" type="button" data-crewgo="${psEsc(v.entity)}"
          data-script="${psEsc(v.room_script || "")}">
          <span class="ps-cwplay">${busy
            ? `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5v14M15 5v14"/></svg>`
            : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M7 4.5 19 12 7 19.5Z"/></svg>`}</span>
          <span class="ps-grow">
            <span class="ps-cwt">${busy ? "Pause" : rooms ? "Send to the selected room" : "Start cleaning"}</span>
            ${mode ? `<span class="ps-cwd">${psEsc(mode)}</span>` : ""}
          </span>
        </button>
        ${rooms}
        <div class="ps-cwpair">
          ${this._crewBtn("Dock", "mdi:home-import-outline",
            `data-crewact="vacuum.return_to_base" data-target="${psEsc(v.entity)}"`)}
          ${v.emptied_button
            ? this._crewBtn("Emptied tank", "mdi:cup-water",
              `data-crewact="input_button.press" data-target="${psEsc(v.emptied_button)}"`)
            : ""}
        </div>`;

      const maint = pcState(h, v.maintenance);
      const deep = pcState(h, v.deep_clean);
      const notes = [];
      if (maint && maint !== "unknown" && maint !== "OK") notes.push(maint);
      if (deep && deep !== "unknown") notes.push(`Deep clean ${deep}`);
      if (notes.length) out += `<div class="ps-cwnote">${psEsc(notes.join(" · "))}</div>`;
    }

    if (l.entity) {
      const st = pcState(h, l.entity);
      out += `<div class="ps-cwsub">${psEsc(l.name || "Litter box")}</div>
        <div class="ps-cwpair">
          ${this._crewBtn(st === "cleaning" ? "Cycling…" : "Cycle now", "mdi:reload",
            `data-crewact="vacuum.start" data-target="${psEsc(l.entity)}"`)}
          ${l.reset_button
            ? this._crewBtn("Reset", "mdi:restart",
              `data-crewact="button.press" data-target="${psEsc(l.reset_button)}"`)
            : ""}
        </div>`;
    }

    return out;
  },

  _secCrew(sec) {
    const h = this._hass;
    if (!h) return "";
    this._crewKey = sec.key;
    const v = sec.vacuum || {};
    const l = sec.litter || {};
    const w = sec.washer || {};

    const states = [v.entity, l.entity].filter(Boolean).map((e) => pcState(h, e));
    const busy = states.filter((s) => s === "cleaning" || s === "returning").length;
    const bad = states.filter((s) => s === "error").length;
    const chip = bad
      ? `<span class="ps-chip bad"><span class="ps-dot"></span>${bad} error${bad > 1 ? "s" : ""}</span>`
      : busy
        ? `<span class="ps-chip cool"><span class="ps-dot"></span>${busy} running</span>`
        : `<span class="ps-chip good"><span class="ps-dot"></span>All docked</span>`;

    const cards = [
      v.entity ? this._crewVacCard(v) : "",
      l.entity ? this._crewLitterCard(l) : "",
    ].filter(Boolean).join("");

    return `${this._head(sec, chip)}
      <div class="ps-cwgrid">${cards}</div>
      ${w.entity ? this._crewWasher(w) : ""}
      <div class="ps-xtra">${this._crewDispatch(sec)}</div>`;
  },

  /* Bound once per element per selector, like every other handler — see _each.
     No handler closes over hass or config; they read this._hass live, because
     the shell patches and a handler outlives many repaints. */
  _bindCrew() {
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

    /* Start is "clean the selected room" when a room script is configured and a
       room is picked, and a plain whole-floor start otherwise. Pausing a running
       robot goes through the same button, so there is one place to press. */
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
