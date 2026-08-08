/* ============================================================================
 * purdy-desk-card — the lights panel
 *
 * A light row should LOOK LIT, not look filled. A tile with an icon, a name, a
 * percentage and a left-to-right sweep IS the built-in tile card, and
 * restyling it does not change what it depicts. So there is no fill and no
 * track: a glow starts at the bulb and falls off across the row, its reach is
 * the brightness and its hue is the colour temperature the fixture actually
 * reports. An off light is dark, not 0%.
 *
 * Two verbs on one pointer here rather than the phone's three: click toggles,
 * drag dims. The phone's 380ms hold-to-open-the-lamps is a touch affordance
 * with no reason to exist next to a chevron and a mouse — the members live in
 * the expanded panel instead.
 *
 * The guard covers the LEVEL, not just the switch. Asking only about "off"
 * leaves the likelier accident open: a pointer landing on the night light
 * drags it to 80% and floods the room at 2am, silently. A guarded drag
 * PREVIEWS the value and asks with the number in the question.
 * ========================================================================== */

Object.assign(PurdyDeskCard.prototype, {

  /* What a light should READ as, which is not always what HA says yet. Same
     contract as _optGoal — the climate stepper's lesson applied before it
     could bite here. */
  _briOf(id, real) {
    const o = this._briOpt[id];
    if (!o) return real;
    if (Date.now() > o.until) { delete this._briOpt[id]; return real; }
    if (real != null && Math.abs(real - o.value) < 2) { delete this._briOpt[id]; return real; }
    return o.value;
  },

  /* Percent, or null when the light is off or missing — never 0, because "off"
     and "on at nothing" are different states and only one of them is a level. */
  _lightPct(id) {
    const st = this._hass.states[id];
    if (!st || st.state !== "on") return this._briOf(id, null);
    const b = st.attributes.brightness;
    const real = b == null ? 100 : Math.round((b / 255) * 100);
    return this._briOf(id, real);
  },

  _lightList(sec) {
    return (sec.lights || []).filter((l) => {
      if (!l.hide_when_unavailable) return true;
      /* The tree's light is not merely unavailable while it is down — it is
         absent from the registry entirely, so the hide has to key off
         something that still exists. */
      const st = this._hass.states[l.hide_when_unavailable];
      return !!st && st.state !== "unavailable" && st.state !== "unknown";
    });
  },

  _pnlLights(sec) {
    const h = this._hass;
    const list = this._lightList(sec);
    if (!list.length) return "";
    const on = list.filter((l) => {
      const st = h.states[l.entity];
      return st && st.state === "on";
    }).length;

    const chip = this._chip(on ? `${on} on` : "all off", on ? "warn" : "");

    const moods = (sec.moods || []).map((m, i) => `
      <button class="pd-mood" type="button" data-mood="${i}">
        <ha-icon icon="${psEsc(m.icon || "mdi:lightbulb-group")}"></ha-icon>
        <span class="pd-trunc">${psEsc(m.name)}</span>
      </button>`).join("");

    const guard = this._guard
      ? `<div class="pd-guard">
          <div class="pd-gq"><b>${psEsc(this._guard.ask)}</b>${
            this._guard.detail ? `<span>${psEsc(this._guard.detail)}</span>` : ""}</div>
          <div class="pd-grow2">${psEsc(this._guard.what)}</div>
          <button class="pd-mini-btn" type="button" data-guard="no">Cancel</button>
          <button class="pd-mini-btn arm" type="button" data-guard="yes">Do it</button>
        </div>`
      : "";

    return `${this._head(sec, chip)}
      <div class="pd-mini">
        ${this._mstat(String(on), on === 1 ? "light on" : "lights on")}
        ${chip}
      </div>
      <div class="pd-pbody pd-full">
        ${guard}
        ${moods ? `<div class="pd-moods">${moods}</div>` : ""}
        <div class="pd-lights">${list.map((l) => this._lightRow(l)).join("")}</div>
      </div>`;
  },

  _lightRow(l) {
    const h = this._hass;
    const st = h.states[l.entity];
    const missing = !st || st.state === "unavailable";
    const on = !!st && st.state === "on";
    const pct = this._lightPct(l.entity);
    const k = st && st.attributes.color_temp_kelvin;
    /* Hue from the temperature the fixture reports, so a warm lamp glows warm.
       No reading means neutral rather than a made-up colour. */
    const hue = k ? (k <= 2700 ? 32 : k <= 4000 ? 42 : 200) : 40;
    const sat = k && k > 4500 ? 30 : 78;
    const reach = on && pct != null ? 12 + (pct / 100) * 76 : 0;

    /* A row with nothing to say says nothing. The sub-line appears only for
       what you could not otherwise know. */
    const members = (l.members || []).map((m) => h.states[m]).filter(Boolean);
    const memOn = members.filter((m) => m.state === "on").length;
    const offline = members.filter((m) => m.state === "unavailable").length;
    const extras = (l.extras || []).map((e) => h.states[e]).filter(Boolean);
    const extraOn = extras.filter((e) => e.state === "on");
    let sub = "";
    if (missing) sub = "Offline";
    else if (offline) sub = `${offline} offline`;
    else if (extraOn.length) sub = extraOn.map((e) => pcName(h, e.entity_id) + " on").join(" · ");
    else if (members.length > 1 && memOn && memOn < members.length) sub = `${memOn} of ${members.length} on`;

    /* One dot per member, only the lit ones glowing — a group's member state is
       a picture, not a sentence. Past three the dots stop meaning anything, so
       those collapse to one orb. */
    const cluster = members.length
      ? (members.length > 3
        ? `<i class="pd-orb ${memOn ? "lit" : ""}"></i>`
        : members.map((m) => `<i class="pd-mdot ${m.state === "on" ? "lit" : ""}"></i>`).join(""))
      : "";

    return `<div class="pd-lrow ${on ? "on" : ""} ${missing ? "off-line" : ""}"
        data-light="${psEsc(l.entity)}"
        style="--l-reach:${reach.toFixed(1)}%;--l-hue:${hue};--l-sat:${sat}%">
        <span class="pd-lglow"></span>
        <ha-icon class="pd-lico" icon="${psEsc(l.icon || "mdi:lightbulb")}"></ha-icon>
        <div class="pd-grow">
          <div class="pd-ln">${psEsc(l.name || pcName(h, l.entity))}</div>
          ${sub ? `<div class="pd-ls">${psEsc(sub)}</div>` : ""}
        </div>
        <div class="pd-lclu">${cluster}</div>
        <div class="pd-lpct" data-lpct="${psEsc(l.entity)}">${
          missing ? "—" : on ? (pct == null ? "on" : pct + "%") : "off"}</div>
      </div>`;
  },

  /* Paint one row in place, without a repaint.
   *
   * A drag CANNOT go through _render: the renderer patches, so re-rendering
   * mid-gesture replaces the panel and DETACHES the very row under the pointer.
   * The handler keeps its stale element, getBoundingClientRect() reads zero,
   * and every later move is silently discarded — which shows up as "I drag to
   * where 25% should be and nothing happens, then I try again and it does",
   * because the second try binds to the fresh node. */
  _paintLight(el, pct) {
    const reach = 12 + (pct / 100) * 76;
    el.style.setProperty("--l-reach", reach.toFixed(1) + "%");
    el.classList.add("on");
    const out = el.querySelector("[data-lpct]");
    if (out) out.textContent = Math.round(pct) + "%";
  },

  /* Leading-plus-trailing THROTTLE, not a debounce.
   *
   * A debounce clears its timer on every move, so it only ever fires after the
   * drag stops — the number on screen moves and the room does not. A debounce
   * is right for a search box and wrong for a control something physical is
   * following. */
  _lightSetBri(id, pct) {
    this._briOpt[id] = { value: pct, until: Date.now() + 12000 };
    const s = (this._briSend[id] = this._briSend[id] || { last: 0, timer: null, pending: null });
    const send = (v) => {
      s.last = Date.now();
      this._hass.callService("light", "turn_on", {
        entity_id: id, brightness_pct: Math.max(1, Math.round(v)),
      });
    };
    const gap = Date.now() - s.last;
    if (gap >= 150) { send(pct); return; }
    s.pending = pct;
    if (s.timer) return;
    s.timer = setTimeout(() => {
      s.timer = null;
      if (s.pending != null) { send(s.pending); s.pending = null; }
    }, 150 - gap);
  },

  /* The session gate, not the light. `protect` is silent all day and only
     speaks while the Hatch is playing — a guard that fires at noon is a guard
     people learn to click through. */
  _protectOf(entity) {
    const sec = this._section("lights");
    const l = ((sec && sec.lights) || []).find((x) => x.entity === entity);
    const p = l && l.protect;
    if (!p || !p.when) return null;
    return pcState(this._hass, p.when) === (p.state == null ? "on" : p.state) ? p : null;
  },

  _bindDeskLights() {
    this._each("[data-mood]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = this._section("lights");
        const m = ((sec && sec.moods) || [])[Number(el.dataset.mood)];
        if (!m) return;
        /* Moods never touch a guarded light. An "All off" that kills the night
           light is the bug, not the feature. */
        Object.keys(m.set || {}).forEach((id) => {
          if (this._protectOf(id)) return;
          const v = m.set[id] || {};
          const data = { entity_id: id };
          if (v.brightness != null) data.brightness_pct = v.brightness;
          if (v.kelvin != null) data.color_temp_kelvin = v.kelvin;
          this._hass.callService("light", "turn_on", data);
        });
        (m.off || []).forEach((id) => {
          if (this._protectOf(id)) return;
          this._hass.callService("light", "turn_off", { entity_id: id });
        });
      });
    });

    this._each("[data-guard]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const g = this._guard;
        this._guard = null;
        if (el.dataset.guard === "yes" && g && typeof g.go === "function") g.go();
        this._last = null;
        this._render();
      });
    });

    this._each("[data-light]", (el) => {
      let start = null, moved = false, pct0 = 0;

      el.addEventListener("pointerdown", (e) => {
        if (e.button != null && e.button !== 0) return;
        const id = el.dataset.light;
        const st = this._hass.states[id];
        if (!st || st.state === "unavailable") return;
        start = e.clientX;
        moved = false;
        pct0 = this._lightPct(id) == null ? 0 : this._lightPct(id);
        this._dragging = true;
      });

      el.addEventListener("pointermove", (e) => {
        if (start == null) return;
        const dx = e.clientX - start;
        if (!moved && Math.abs(dx) < 5) return;
        moved = true;
        const r = el.getBoundingClientRect();
        if (!r.width) return;
        const pct = Math.max(1, Math.min(100, Math.round(pct0 + (dx / r.width) * 100)));
        el._pdPct = pct;
        this._paintLight(el, pct);
        /* A guarded light previews and does not send — the question gets asked
           with the number in it when the pointer comes up. */
        if (!this._protectOf(el.dataset.light)) this._lightSetBri(el.dataset.light, pct);
      });

      const finish = (e) => {
        if (start == null) return;
        start = null;
        this._dragging = false;
        const id = el.dataset.light;
        const prot = this._protectOf(id);

        if (moved) {
          const pct = el._pdPct;
          if (prot && pct != null) {
            this._guard = {
              ask: prot.ask || "Are you sure?",
              detail: prot.detail || "",
              what: `Set ${pcName(this._hass, id)} to ${pct}%`,
              go: () => this._lightSetBri(id, pct),
            };
          }
          this._last = null;
          this._render();
          return;
        }

        /* A click. Missing a control must do nothing, never something bigger —
           a near-miss inside the row must not fall through to something else. */
        if (prot) {
          const st = this._hass.states[id];
          this._guard = {
            ask: prot.ask || "Are you sure?",
            detail: prot.detail || "",
            what: `Turn ${pcName(this._hass, id)} ${st && st.state === "on" ? "off" : "on"}`,
            go: () => this._hass.callService("homeassistant", "toggle", { entity_id: id }),
          };
          this._last = null;
          this._render();
          return;
        }
        this._hass.callService("homeassistant", "toggle", { entity_id: id });
      };

      el.addEventListener("pointerup", finish);
      el.addEventListener("pointercancel", () => {
        if (start == null) return;
        start = null;
        this._dragging = false;
        this._last = null;
        this._render();
      });
      el.addEventListener("pointerleave", (e) => { if (start != null) finish(e); });

      /* More-info without a mouse verb of its own. */
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        pcMoreInfo(this, el.dataset.light);
      });
    });
  },
});
