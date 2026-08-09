/* ============================================================================
 * purdy-desk-card — Tier 1, the status strip
 *
 * Everything you glance at and never press, on one line across the top.
 *
 * The phone gives each of these a row of its own because it has no width to
 * spend. Across 1500px they are five short answers — who, when, outside, the
 * house, and is anything wrong — and stacking them would waste the one
 * dimension the desktop actually has.
 *
 * The attention list is a CHIP here, not a band. A full-width band for
 * something that is empty most of the time is dead height on a sheet that
 * never scrolls, and this house almost always has one low battery raised, so
 * the band would almost always be drawn and almost never be read. Green when
 * clear, red with a count when not, and the list itself lives in a popover.
 * ========================================================================== */

/* The condition maps live in 05-shared.js. There were four copies of the icon
   map across this bundle and every one of them was missing `lightning-rainy`
   and `exceptional` — which is most of a thunderstorm week from the National
   Weather Service, drawn as no glyph at all. See pcWxIcon / pcWxText. */

Object.assign(PurdyDeskCard.prototype, {

  _stripHtml(faults) {
    const now = new Date();
    const zones = [this._zoneId(), this._zoneClock(now), this._zoneWeather()];
    zones.push(this._zoneHvac());
    /* Anything the config parked in the strip — people, today. Rendered from
       the same section bodies the stage and dock use, so moving a section
       between tiers stays a `zone:` edit. */
    this._zone("strip").forEach((sec) => {
      const html = this._stripSection(sec);
      if (html) zones.push(`<div class="pd-z pd-z-sec">${html}</div>`);
    });
    zones.push(this._zoneAlert(faults));
    return zones.filter(Boolean).join("");
  },

  _zoneId() {
    const now = new Date();
    const occ = this._config.occupancy ? pcState(this._hass, this._config.occupancy) : "";
    const who = this._who();
    return `<div class="pd-z pd-z-id">
        <h2>${this._greeting()}${who ? `, ${psEsc(who)}` : ""}</h2>
        <div class="pd-sub">${now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}${
          occ ? ` · ${psEsc(this._humanize(occ))}` : ""}</div>
      </div>`;
  },

  _zoneClock(now) {
    /* Split so the meridiem can sit under the digits rather than beside them —
       at this size a trailing " PM" drags the eye off the number. */
    const t = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const parts = t.split(" ");
    return `<div class="pd-z pd-z-clock">
        <div class="pd-time">${psEsc(parts[0])}</div>
        <div class="pd-mer">${psEsc(parts[1] || "")}</div>
      </div>`;
  },

  _zoneWeather() {
    const c = this._config;
    if (!c.weather) return "";
    const st = this._hass.states[c.weather];
    if (!st) return "";
    const temp = st.attributes.temperature;
    const clim = this._section("climate") || {};
    const out = clim.outside || {};
    /* pcReading rather than `|| 0`: an outside sensor that has dropped off has
       to read as absent, not as zero degrees. */
    const oT = pcReading(this._hass, out.temp);
    const oH = pcReading(this._hass, out.humidity);
    return `<div class="pd-z pd-z-wx" data-info="${psEsc(c.weather)}" role="button" tabindex="0">
        <div class="pd-wxmain">
          <ha-icon icon="${pcWxIcon(st.state)}"></ha-icon>
          <div>
            <div class="pd-wxt">${temp == null ? "—" : Math.round(temp) + "°"}</div>
            <div class="pd-wxs">${psEsc(pcWxText(st.state) || this._humanize(st.state))}</div>
          </div>
        </div>
        <div class="pd-wxout">
          <span>Outside <b>${oT.ok && oT.n != null ? oT.n.toFixed(1) + "°" : "—"}</b></span>
          <span>Humidity <b>${oH.ok && oH.n != null ? oH.n.toFixed(0) + "%" : "—"}</b></span>
        </div>
      </div>`;
  },

  /* The house in one line: what it is trying to do, and what each zone reads.
     The detail — the ring, the graph, the schedule — is the stage's job. */
  _zoneHvac() {
    const sec = this._section("climate");
    if (!sec) return "";
    const h = this._hass;
    const goalSt = sec.goal && h.states[sec.goal];
    const thermo = sec.thermostat && h.states[sec.thermostat];
    const src = goalSt || thermo;
    if (!src) return "";
    const action = (thermo && thermo.attributes.hvac_action) || (src.state || "");
    const real = pcNumOf(src, "temperature");
    const goal = this._optGoal(sec.goal || sec.thermostat, real);
    const cool = /cool/i.test(action);
    const heat = /heat/i.test(action);
    const verb = cool ? "Cooling to" : heat ? "Heating to" : "Holding";

    const zones = ((sec.zones || {}).options || []).map((z) => {
      const r = pcReading(h, z.temp);
      const active = (sec.zones || {}).select
        ? pcState(h, sec.zones.select) === z.option : false;
      return `<div class="pd-zc ${active ? "on" : ""}">${psEsc(z.label)}
          <b>${r.ok && r.n != null ? r.n.toFixed(1) + "°" : "—"}</b></div>`;
    }).join("");

    return `<div class="pd-z pd-z-hvac">
        <div class="pd-hv">
          <div class="pd-hvgoal">
            <span class="pd-lbl">${verb}</span>
            <div class="pd-hvbig">${goal == null ? "—" : Math.round(goal) + "°"}</div>
          </div>
          <div class="pd-zpair">${zones}</div>
        </div>
      </div>`;
  },

  /* Presence, as pills. Battery colours itself only when it is actually low —
     a number that is always amber stops meaning anything. */
  _stripSection(sec) {
    if (sec.type !== "people") return "";
    const h = this._hass;
    const rows = (sec.people || []).map((p) => {
      const st = p.entity && h.states[p.entity];
      const home = st && st.state === "home";
      const b = pcReading(h, p.battery);
      const s = pcReading(h, p.steps);
      const low = b.ok && b.n != null && b.n <= (sec.low_battery || 25);
      const name = p.name || pcName(h, p.entity);
      return `<div class="pd-pw ${home ? "home" : ""}" data-info="${psEsc(p.entity || "")}" role="button" tabindex="0">
          <div class="pd-av">${psEsc((name || "?").slice(0, 1))}</div>
          <div>
            <div class="pd-pn">${psEsc(name)}</div>
            <div class="pd-pb ${low ? "low" : ""}">${
              b.ok && b.n != null ? Math.round(b.n) + "%" : "—"}${
              s.ok && s.n != null ? " · " + Math.round(s.n).toLocaleString() : ""}</div>
          </div>
        </div>`;
    }).join("");
    return `<div class="pd-ppl">${rows}</div>`;
  },

  _zoneAlert(faults) {
    /* A dropped connection must say so. Everything on the screen is
       last-known-good from that moment, and a confident "All clear" over stale
       states is the one thing the chip must never say. */
    if (pcOffline(this._hass)) {
      return `<div class="pd-z pd-z-alert">
          <span class="pd-chip bad"><span class="pd-dot"></span>Reconnecting…</span>
        </div>`;
    }
    const worst = faults.length
      ? (faults[0].severity === "critical" ? "bad" : faults[0].severity === "warn" ? "warn" : "")
      : "good";
    const label = faults.length
      ? `${faults.length} need${faults.length > 1 ? "" : "s"} attention`
      : "All clear";
    return `<div class="pd-z pd-z-alert">
        <button class="pd-chip ${worst}" type="button" id="pd-alert"
          aria-expanded="${this._alertOpen ? "true" : "false"}">
          <span class="pd-dot"></span>${label}</button>
        ${this._alertOpen ? `<div class="pd-pop">${this._alertListHtml(faults)}</div>` : ""}
      </div>`;
  },

  /* The list itself, shared by the popover and the sheet — one renderer, so
     the two can never disagree about what is raised. */
  _alertListHtml(faults) {
    if (!faults.length) {
      return `<div class="pd-empty">Nothing needs attention.</div>`;
    }
    const rows = faults.map((f) => `
      <div class="pd-ar">
        <span class="pd-sev ${psEsc(f.severity)}"></span>
        <div class="pd-grow">
          <div class="pd-at">${psEsc(f.title)}</div>
          ${f.detail ? `<div class="pd-ad">${psEsc(f.detail)}</div>` : ""}
        </div>
        ${f.entity ? `<button class="pd-mini-btn" type="button" data-info="${psEsc(f.entity)}">Open</button>` : ""}
        <button class="pd-mini-btn" type="button" data-dismiss="${psEsc(f.key)}">Dismiss</button>
      </div>`).join("");
    /* A dismissal is an acknowledgement, not a mute — saying so beside the
       button is cheaper than the support question it prevents. */
    return `${rows}<div class="pd-note">Dismissing hides a row until it fires again.</div>`;
  },

  _bindStrip() {
    /* Clicking elsewhere in the strip closes the popover.
     *
     * Deliberately NOT a capture-phase listener, and not on document. Capture
     * runs on the ancestor BEFORE the chip's own handler, so it would close the
     * popover and repaint — which replaces the chip mid-dispatch, so the chip's
     * click never lands and the thing can never be opened at all. The chip
     * stops propagation, so bubbling gives the right answer for both cases.
     * Bound on the strip rather than on document so it dies with the element. */
    this._one("pd-strip", (el) => {
      el.addEventListener("click", () => {
        if (!this._alertOpen) return;
        this._alertOpen = false;
        this._last = null;
        this._render();
      });
    });
  },
});
