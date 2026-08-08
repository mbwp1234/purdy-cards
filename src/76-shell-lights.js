/* Lights — the row is a lit room, not a progress bar.
 *
 * The #buttons Bubble pop-up was the last thing on Phone v2 that opened a
 * foreign sheet. Absorbing it as a tile-with-a-fill-bar was tried and rejected:
 * an icon chip, a name, a percentage and a translucent sweep IS the HA tile
 * card, and restyling it does not change what it depicts. So the fill is gone.
 * A glow starts at the bulb and falls off across the row — reach is brightness,
 * hue is the colour temperature the fixture actually reports — and an off light
 * is dark rather than zero percent.
 *
 * Three verbs on one pointer: tap toggles, drag dims, a 380ms hold opens the
 * lamps and the warmth track in place. The hold matches the graphs' scrub so
 * the card has exactly one press-and-hold.
 */

/* Kelvin → RGB across the range these fixtures really report (2000–6535 K).
   Drawing every light the same amber would be decoration; this is a reading,
   so a lamp on its warmest setting looks warm. A fixture that reports no
   colour temperature at all gets a neutral warm white rather than an invented
   one — the same refusal as a missing sensor reading. */
const PL_CT = [[2000, 255, 141, 26], [2700, 255, 169, 87], [3500, 255, 196, 137],
  [4500, 255, 219, 186], [5500, 255, 236, 224], [6535, 255, 249, 253]];
function plRgb(kelvin, rgb) {
  if (rgb && rgb.length === 3) return rgb;
  if (kelvin == null) return [255, 224, 192];
  const k = Math.max(2000, Math.min(6535, kelvin));
  for (let i = 1; i < PL_CT.length; i++) {
    if (k <= PL_CT[i][0]) {
      const a = PL_CT[i - 1], b = PL_CT[i], t = (k - a[0]) / (b[0] - a[0]);
      return [1, 2, 3].map((j) => Math.round(a[j] + (b[j] - a[j]) * t));
    }
  }
  return [255, 249, 253];
}
const plRgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* 0–255 is the wire format; 1–100 is what a person reads. Round to at least 1
   so a lamp that is on never reports 0% — on and off must not look the same. */
const plPct = (b) => (b == null ? null : Math.max(1, Math.round(b / 255 * 100)));
const plByte = (p) => Math.max(1, Math.min(255, Math.round(p / 100 * 255)));

Object.assign(PurdyShellCard.prototype, {

  /* Everything the section needs to know about one light, read live. */
  _lightOf(cfg) {
    const h = this._hass;
    const st = h && h.states && h.states[cfg.entity];
    const a = (st && st.attributes) || {};
    const gone = !st || st.state === "unavailable" || st.state === "unknown";
    const on = !!st && st.state === "on";
    /* Optimistic: a drag has to move the row now, not when HA echoes back.
       Same lesson as the climate stepper — waiting on the round trip made the
       control look broken, and recomputing from the live attribute made a
       second tap read the same stale value. */
    const opt = this._optBri(cfg.entity, on ? plPct(a.brightness) : null);
    const modes = a.supported_color_modes || [];
    const dimmable = gone ? false
      : modes.some((m) => m !== "onoff") || a.brightness != null;
    const warmable = modes.indexOf("color_temp") >= 0;
    return {
      cfg, id: cfg.entity, name: cfg.name || (a.friendly_name || cfg.entity),
      gone, on, dimmable, warmable,
      bri: opt == null ? (on ? 100 : (cfg.default_brightness || 100)) : opt,
      kelvin: a.color_temp_kelvin == null ? null : a.color_temp_kelvin,
      minK: a.min_color_temp_kelvin || 2000,
      maxK: a.max_color_temp_kelvin || 6535,
      rgb: a.rgb_color,
    };
  },

  /* The optimistic brightness, on the same contract as _optGoal: it stands
     until the real state agrees or until it expires, so a call that never
     lands shows the truth again rather than leaving an unbacked number up. */
  _optBri(id, real) {
    const o = (this._briOpt || {})[id];
    if (!o) return real;
    if (Date.now() > o.until) { delete this._briOpt[id]; return real; }
    if (real != null && Math.abs(real - o.value) <= 1) { delete this._briOpt[id]; return real; }
    return o.value;
  },

  /* Is this light guarded right now?
   *
   * `protect.when` names an entity and `protect.state` the state that means
   * "guarded" — for Joel that is the Hatch playing, i.e. a sleep session
   * actually in progress. Gated on the SESSION and not on the light, so the
   * prompt is silent all day and unmissable at 2am.
   */
  _lightGuarded(cfg) {
    const p = cfg.protect;
    if (!p || !p.when) return false;
    return pcState(this._hass, p.when) === (p.state == null ? "on" : p.state);
  },

  /* The cluster: one dot per member, and only the lit ones glow. It replaced a
     sub-line reading "2 lamps · Scentsy" — a group's member state is a picture,
     not a sentence. Beyond three members the dots stop meaning anything at a
     glance, so those collapse to one orb and the sub-line carries the count. */
  _lightCluster(l, c) {
    const h = this._hass;
    const mem = l.cfg.members || [];
    const b = l.bri / 100;
    const dots = mem.length && mem.length <= 3
      ? mem.map((m) => {
        const r = pcReading(h, m);
        return { on: l.on && pcState(h, m) === "on", dead: !r.ok };
      })
      : [{ on: l.on, dead: l.gone }];
    return `<div class="pl-clus${dots.length === 1 ? " solo" : ""}">${dots.map((d) =>
      `<span class="pl-pip" style="${d.on
        ? `background:${plRgba(c, .95)};box-shadow:0 0 ${(5 + b * 13).toFixed(1)}px ${(1 + b * 2.5).toFixed(1)}px ${plRgba(c, (.45 + b * .35).toFixed(2))}`
        : d.dead ? "background:rgba(255,255,255,.06)" : ""}"></span>`).join("")}</div>`;
  },

  /* A row with nothing to say says nothing. The old sub-line carried level,
     kelvin, member count and extras at once — three of which are already on
     screen. This returns only what you could not otherwise know. */
  _lightSub(l) {
    const h = this._hass;
    if (l.gone) return "unavailable";
    const mem = l.cfg.members || [];
    const dead = mem.filter((m) => !pcReading(h, m).ok);
    if (dead.length) return `${pcName(h, dead[0])} offline`;
    const ex = (l.cfg.extras || []).filter((e) => pcState(h, e) === "on");
    if (ex.length) return `${ex.map((e) => pcName(h, e)).join(" · ")} on`;
    if (l.on && mem.length > 3) {
      const lit = mem.filter((m) => pcState(h, m) === "on").length;
      if (lit && lit < mem.length) return `${lit} of ${mem.length} on`;
    }
    return "";
  },

  /* The look of a lit row, as values. Shared by the renderer and by the live
     drag painter below, because a drag CANNOT go through _render(): the shell
     patches, so re-rendering mid-gesture replaces the sheet and detaches the
     very element under the finger. Same reason the scrub readouts and the music
     search results are written straight to the DOM. Two code paths drawing the
     same row would drift, so there is one. */
  _lightPaint(l) {
    const c = plRgb(l.kelvin, l.on ? l.rgb : null);
    const b = l.bri / 100;
    /* Reach and intensity both scale, so a dim lamp is a small warm pool
       rather than a faint wash of the whole row. */
    const reach = 24 + b * 90;
    return {
      c,
      bg: `radial-gradient(120% 300% at 22px 50%,${plRgba(c, (.11 + b * .50).toFixed(3))} 0%,`
        + `${plRgba(c, (.04 + b * .20).toFixed(3))} ${(reach * .42).toFixed(1)}%, transparent ${reach.toFixed(1)}%)`,
      /* A lit row lifts off the column in its own colour; a dark one is barely
         a hairline. That is what makes "what is on" countable across a room. */
      lift: l.on
        ? `box-shadow:0 6px 26px -10px ${plRgba(c, (.34 + b * .3).toFixed(2))};`
          + `border-color:${plRgba(c, (.16 + b * .14).toFixed(2))};background:rgba(255,255,255,.035)`
        : "",
      pip: `background:${plRgba(c, .95)};box-shadow:0 0 ${(5 + b * 13).toFixed(1)}px `
        + `${(1 + b * 2.5).toFixed(1)}px ${plRgba(c, (.45 + b * .35).toFixed(2))}`,
    };
  },

  _lightRow(l, open) {
    const p = this._lightPaint(l);
    const sub = this._lightSub(l);
    const dets = l.dimmable
      ? [25, 50, 75].map((x) => `<span class="pl-det" style="left:${x}%"></span>`).join("")
      : "";
    return `<div class="pl-row${l.on ? " on" : ""}${l.gone ? " na" : ""}${open ? " open" : ""}"
        data-light="${psEsc(l.id)}" data-dim="${l.dimmable ? 1 : 0}" data-guard="${this._lightGuarded(l.cfg) ? 1 : 0}"
        style="${p.lift}">
        <div class="pl-glow" style="background:${p.bg}"></div>${dets}
        <div class="pl-face">
          ${this._lightCluster(l, p.c)}
          <div class="pl-txt">
            <div class="pl-t1">${psEsc(l.name)}</div>
            ${sub ? `<div class="pl-t2">${psEsc(sub)}</div>` : ""}
          </div>
          <div class="pl-kv">${l.dimmable ? l.bri + "%" : "On"}</div>
        </div>
        <div class="pl-more">${open ? this._lightMore(l) : ""}</div>
      </div>`;
  },

  /* Paint one row at a value, in place. No render, no reconciliation — the
     element under the finger must survive the whole gesture. */
  _paintLight(el, id, v) {
    const cfg = this._lightCfg(id);
    if (!cfg) return;
    const l = this._lightOf(cfg);
    l.bri = v; l.on = true;
    const p = this._lightPaint(l);
    el.classList.add("on");
    el.setAttribute("style", p.lift);
    const glow = el.querySelector(".pl-glow");
    if (glow) glow.style.background = p.bg;
    const kv = el.querySelector(".pl-kv");
    if (kv) kv.textContent = v + "%";
    /* The cluster is part of the picture: a group brightening with dark pips
       would read as "the lamps are off but the room is lit". */
    el.querySelectorAll(".pl-pip").forEach((pip) => { pip.style.cssText = p.pip; });
  },

  /* The hold panel: the members, then warmth. A fixture that reports no colour
     temperature gets no track rather than a dead one — the same rule that stops
     a missing reading being drawn as a zero. */
  _lightMore(l) {
    const h = this._hass;
    const mem = (l.cfg.members || []).concat(l.cfg.extras || []);
    const chips = mem.map((m) => {
      const r = pcReading(h, m);
      const on = pcState(h, m) === "on";
      return `<button class="pl-kid${!r.ok ? " na" : on ? " on" : ""}" type="button"
          data-lkid="${psEsc(m)}"${r.ok ? "" : " disabled"}>
          ${r.ok ? '<span class="ps-dot"></span>' : ""}${psEsc(pcName(h, m))}${r.ok ? "" : " · offline"}
        </button>`;
    }).join("");
    let warm;
    if (l.warmable && !l.gone) {
      const k = l.kelvin == null ? Math.round((l.minK + l.maxK) / 2) : l.kelvin;
      const pct = Math.max(0, Math.min(100, (k - l.minK) / (l.maxK - l.minK) * 100));
      warm = `<div class="pl-warmrow">
          <div class="pl-warm" data-lwarm="${psEsc(l.id)}" data-lmin="${l.minK}" data-lmax="${l.maxK}">
            <span class="pl-g" style="left:${pct.toFixed(1)}%"></span>
          </div><em>${k}K</em>
        </div>`;
    } else {
      warm = `<div class="pl-warmrow"><em class="pl-none">${
        l.cfg.protect ? "Colour is set by its own routine"
          : l.dimmable ? "Brightness only — no warmth to set" : "Switched, not dimmed"}</em></div>`;
    }
    return `<div class="pl-mb">${chips ? `<div class="pl-kids">${chips}</div>` : ""}${warm}</div>`;
  },

  /* Moods are target sets in config, not scene entities. There are no light
     scenes in this install, and creating some would have put the real settings
     somewhere the card cannot read or show. A protected light is never in a
     mood — "all off" that kills the night light is the bug, not the feature. */
  _lightMoodHtml(sec) {
    const moods = sec.moods || [];
    if (!moods.length) return "";
    return `<div class="pl-moods">${moods.map((m, i) =>
      `<button class="pl-mood${this._mood === i ? " on" : ""}" type="button" data-lmood="${i}">
        ${m.icon ? `<ha-icon icon="${psEsc(m.icon)}"></ha-icon>` : ""}
        <span>${psEsc(m.name || "")}</span>
      </button>`).join("")}</div>`;
  },

  /* The lights of a section, resolved. Split out from the renderer because the
     same list feeds the column and the sheet — the section is `sheet_only` on
     Phone v2, so this is the only path that actually runs there. */
  _lightList(sec) {
    return (sec.lights || [])
      .filter((c) => {
        if (!c.hide_when_unavailable) return true;
        /* Christmas hid itself with a Bubble `styles` hack watching a sensor go
           unavailable. The shell already drops a section that renders nothing,
           so this is the same contract one level down. */
        return pcReading(this._hass, c.hide_when_unavailable).ok;
      })
      .map((c) => this._lightOf(c));
  },

  /* The summary chip, shared by the section header and the sheet header. A
     guarded light is neither "on" nor part of the total: it is not something
     you are being asked to deal with. */
  _lightChip(lights) {
    const counted = lights.filter((l) => !l.cfg.protect && !l.gone);
    const on = counted.filter((l) => l.on);
    if (on.length) return `<span class="ps-chip lit">${on.length} of ${counted.length} on</span>`;
    if (lights.some((l) => l.on && l.cfg.protect)) return `<span class="ps-chip">Night light only</span>`;
    return `<span class="ps-chip">All off</span>`;
  },

  /* Moods and rows, with no header — so the sheet chrome can name itself
     rather than printing the title twice, the same reason a hosted card gets
     its own title blanked. */
  _lightsBody(sec, lights) {
    const rows = lights.map((l) => {
      let html = this._lightRow(l, this._lightOpen === l.id);
      if (this._lightAsk && this._lightAsk.id === l.id) html += this._lightAskHtml(l);
      return html;
    }).join("");
    return `${this._lightMoodHtml(sec)}<div class="pl-rows">${rows}</div>`;
  },

  _secLights(sec) {
    const lights = this._lightList(sec);
    if (!lights.length) return "";
    return `${this._head(sec, this._lightChip(lights))}${this._lightsBody(sec, lights)}`;
  },

  /* The guard covers the LEVEL as well as the switch.
   *
   * Asking only about "off" would leave the more likely accident wide open: a
   * thumb landing on his row while scrolling drags it to 80% and floods the
   * room at 2am, silently. So a drag on a guarded light previews the value and
   * then asks with the number in the question, and cancelling restores what was
   * really there. Nothing about a guarded light changes without a yes.
   */
  _lightAskHtml(l) {
    const a = this._lightAsk;
    const p = l.cfg.protect || {};
    const what = a.kind === "level"
      ? `Set it to ${a.value}%?`
      : l.on ? "Turn it off?" : "Turn it on?";
    const go = a.kind === "level" ? `Set ${a.value}%` : l.on ? "Turn it off" : "Turn it on";
    return `<div class="pl-ask">
        <div class="pl-ab">
          <div class="pl-amk"><ha-icon icon="mdi:alert-outline"></ha-icon></div>
          <div>
            <b>${psEsc(p.ask || "Are you sure?")}</b>
            <p>${psEsc(p.detail || `This is ${l.name.toLowerCase()}.`)} ${psEsc(what)}</p>
          </div>
        </div>
        <div class="pl-arow">
          <button class="pl-abtn" type="button" data-lask="no">Leave it</button>
          <button class="pl-abtn go" type="button" data-lask="yes">${psEsc(go)}</button>
        </div>
      </div>`;
  },

  _lightToggle(id) {
    this._hass.callService("light", "toggle", { entity_id: id });
  },

  /* The real lamp follows the finger.
   *
   * This debounced at 220ms and cleared the timer on every move, so it only
   * ever fired 220ms after the drag STOPPED — the number on screen moved and
   * the room did not. A throttle with a leading and a trailing edge sends
   * immediately, then at most every `gap`, and the final value always lands.
   * 150ms is about as fast as these bulbs act on; faster only queues calls.
   */
  _lightSetBri(id, pct) {
    if (!this._briOpt) this._briOpt = {};
    this._briOpt[id] = { value: pct, until: Date.now() + 12000 };
    if (!this._briSend) this._briSend = {};
    const s = this._briSend[id] || (this._briSend[id] = {});
    s.value = pct;
    const gap = 150;
    const fire = () => {
      s.timer = null;
      s.last = Date.now();
      if (this._hass) {
        this._hass.callService("light", "turn_on",
          { entity_id: id, brightness: plByte(s.value) });
      }
    };
    const since = s.last ? Date.now() - s.last : Infinity;
    if (since >= gap) { fire(); return; }
    if (!s.timer) s.timer = setTimeout(fire, gap - since);
  },

  _lightSetKelvin(id, k) {
    this._hass.callService("light", "turn_on", { entity_id: id, color_temp_kelvin: k });
  },

  _lightApplyMood(sec, i) {
    const m = (sec.moods || [])[i];
    if (!m) return;
    const guardedIds = (sec.lights || []).filter((c) => c.protect).map((c) => c.entity);
    const allowed = (id) => guardedIds.indexOf(id) < 0;
    Object.keys(m.set || {}).forEach((id) => {
      if (!allowed(id)) return;
      const v = m.set[id] || {};
      const data = { entity_id: id };
      if (v.brightness != null) data.brightness = plByte(v.brightness);
      if (v.kelvin != null) data.color_temp_kelvin = v.kelvin;
      this._hass.callService("light", "turn_on", data);
      if (v.brightness != null) {
        if (!this._briOpt) this._briOpt = {};
        this._briOpt[id] = { value: v.brightness, until: Date.now() + 12000 };
      }
    });
    (m.off || []).filter(allowed).forEach((id) => {
      this._hass.callService("light", "turn_off", { entity_id: id });
    });
    this._mood = i;
  },

  /* Tap / drag / hold on one pointer.
   *
   * touch-action stays `pan-y` on the row: the page must keep scrolling until
   * a deliberate horizontal drag starts, and a gesture cannot be taken back
   * once the browser has claimed it — the lesson the graphs taught. The hold
   * is 380ms, matching the scrub, so there is one press-and-hold on the card.
   */
  _bindLights() {
    this._each("[data-light]", (el) => {
      let hold = null, moved = false, x0 = 0, id = null;

      const pct = (clientX) => {
        const r = el.getBoundingClientRect();
        if (!r.width) return null;
        let v = Math.round((clientX - r.left) / r.width * 100);
        v = Math.max(1, Math.min(100, v));
        [25, 50, 75, 100].forEach((d) => { if (Math.abs(v - d) <= 2) v = d; });
        return v;
      };

      /* No pointer capture anywhere — a test asserts the card never reaches for
         it. Touch does not retarget, so there is nothing to capture; the mouse
         drag is followed on the shadow root instead, which is what lets the
         cursor wander off the row without dropping the gesture. Capture cannot
         rescue a gesture the browser has already claimed, so it would only look
         like a fix. `touch-action: pan-y` is what actually splits the axes here:
         vertical stays the page's, horizontal is ours. */
      const onMove = (ev) => {
        if (!id) return;
        if (!moved) {
          if (Math.abs(ev.clientX - x0) < 5) return;
          if (el.dataset.dim !== "1") return;     /* a switch has nothing to drag */
          clearTimeout(hold); hold = null; moved = true;
          el.classList.add("dragging");
          this._dragging = true;
        }
        const v = pct(ev.clientX);
        if (v == null) return;
        /* Paint first, always — the row has to answer the finger even when the
           value is only a preview. */
        this._paintLight(el, id, v);
        if (el.dataset.guard === "1") {
          el.dataset.preview = v;   /* nothing is sent until the question is answered */
          return;
        }
        this._mood = null;
        this._lightSetBri(id, v);
        /* No _render() here. _dragging stays true for the whole gesture: a
           patch would replace the sheet and detach `el`, after which
           getBoundingClientRect() reads zero and every later move is silently
           discarded. That is exactly why a drag used to do nothing until you
           lifted off and started again. */
      };

      const finish = () => {
        if (hold) { clearTimeout(hold); hold = null; }
        el.classList.remove("dragging");
        this._dragging = false;
        this.shadowRoot.removeEventListener("pointermove", onMove);
        this.shadowRoot.removeEventListener("pointerup", onUp);
        this.shadowRoot.removeEventListener("pointercancel", onCancel);
      };

      const onUp = () => {
        const was = id, wasMoved = moved, guard = el.dataset.guard === "1";
        const preview = el.dataset.preview;
        finish(); id = null; moved = false;
        if (!was) return;
        if (!wasMoved) {
          if (guard) this._lightAsk = { id: was, kind: "toggle" };
          else { this._mood = null; this._lightToggle(was); }
        } else if (guard && preview) {
          this._lightAsk = { id: was, kind: "level", value: +preview };
          delete el.dataset.preview;
        }
        this._render();
      };

      const onCancel = () => { finish(); id = null; moved = false; this._render(); };

      el.addEventListener("pointerdown", (e) => {
        if (e.target.closest("[data-lkid],[data-lask],[data-lwarm]")) return;
        id = el.dataset.light; moved = false; x0 = e.clientX;
        this.shadowRoot.addEventListener("pointermove", onMove);
        this.shadowRoot.addEventListener("pointerup", onUp);
        this.shadowRoot.addEventListener("pointercancel", onCancel);
        hold = setTimeout(() => {
          hold = null; moved = true;            /* consumed — no toggle on release */
          this._lightOpen = this._lightOpen === id ? null : id;
          this._render();
        }, 380);
      });
    });

    this._each("[data-lkid]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._mood = null;
      const m = el.dataset.lkid;
      this._hass.callService(m.split(".")[0], "toggle", { entity_id: m });
    }));

    this._each("[data-lmood]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const sec = (this._config.sections || []).find((s) => s.type === "lights");
      if (sec) this._lightApplyMood(sec, +el.dataset.lmood);
      this._render();
    }));

    this._each("[data-lask]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const a = this._lightAsk;
      this._lightAsk = null;
      if (a && el.dataset.lask === "yes") {
        if (a.kind === "level") { this._mood = null; this._lightSetBri(a.id, a.value); }
        else this._lightToggle(a.id);
      }
      this._render();
    }));

    this._each("[data-lwarm]", (el) => {
      const set = (e) => {
        const r = el.getBoundingClientRect();
        if (!r.width) return;
        const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        const min = +el.dataset.lmin, max = +el.dataset.lmax;
        this._lightSetKelvin(el.dataset.lwarm, Math.round(min + p * (max - min)));
      };
      let warming = false;
      const mv = (e) => { if (warming) set(e); };
      const up = () => {
        warming = false; this._dragging = false;
        this.shadowRoot.removeEventListener("pointermove", mv);
        this.shadowRoot.removeEventListener("pointerup", up);
        this._render();
      };
      el.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        warming = true; this._dragging = true;
        this.shadowRoot.addEventListener("pointermove", mv);
        this.shadowRoot.addEventListener("pointerup", up);
        set(e);
      });
    });
  },

  _lightCfg(id) {
    const sec = (this._config.sections || []).find((s) => s.type === "lights");
    return sec && (sec.lights || []).find((c) => c.entity === id);
  },
});
