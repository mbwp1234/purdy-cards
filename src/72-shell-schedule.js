/* ============================================================================
 * purdy-shell-card — GTTC schedule
 *
 * GTTC keeps four schedules at once and the base one is not the one running.
 * `climate.gttc` only ever carries the window that happens to be active, so
 * the whole day comes from the `gttc/get_schedule` websocket command, and the
 * preset actually in force is found by matching `current_schedule_entry`
 * against each preset's plan for today — `active_preset` is null when GTTC
 * picks one situationally.
 *
 * Writes (`update_entry` / `delete_entry`) always land in the ACTIVE preset,
 * so editing is offered only where the write goes where it looks like it goes.
 * ========================================================================== */

Object.assign(PurdyShellCard.prototype, {
  async _fetchSchedule() {
    const sec = (this._config.sections || []).find((x) => x.type === "climate" && x.schedule);
    if (!sec || !this._hass || !this._hass.callWS) return;
    const extra = sec.schedule.entry_id ? { entry_id: sec.schedule.entry_id } : {};
    try {
      this._sched = await this._hass.callWS({ type: "gttc/get_schedule", ...extra });
      this._last = null;
      this._render();
    } catch (e) {
      this._sched = null;
    this._dragging = false;   // a volume drag must survive the state repaint
    this._armed = null;       // key of a destructive control awaiting a second tap
    this._logged = {};        // rule key -> firedAt already written to the log
    this._results = null;     // music search results, null until a query runs
    this._recent = [];
    this._query = "";
    this._schedEdit = null;   // index of the entry being edited, or "new"
    this._schedNote = null;
    this._schedScope = undefined; // preset key being viewed; null = base lists
    this._schedDay = null;        // day being viewed; null = today
    this._sel = [];           // rooms the user picked, overriding what is playing
    this._pins = [];          // saved playlists
    }
  },

  /* GTTC keeps FOUR schedules at once: the base weekday/weekend lists, and a
     named preset per situation (home / work_from_home / away / sleep), each
     with its own seven-day plan. `active_preset` is only set when a preset is
     pinned — when GTTC picks one situationally it stays null, so reading the
     base lists shows a schedule the house is not running. The live window on
     the climate entity is the one reliable signal of which is in force, so
     match against that. */
  _activePreset() {
    const s = this._sched;
    if (s && s.active_preset && s.presets && s.presets[s.active_preset]) return s.active_preset;
    return null;
  },

  _dayName(offset) {
    const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return names[offset == null ? new Date().getDay() : offset];
  },

  /* Which schedule is actually running: the pinned preset, else whichever
     preset owns the window the thermostat reports, else the base lists. */
  _detectScope() {
    const s = this._sched;
    if (!s || !this._hass) return null;
    const pinned = this._activePreset();
    if (pinned) return pinned;

    const sec = ((this._config || {}).sections || []).find((x) => x.type === "climate" && x.schedule);
    const th = sec && sec.goal && this._hass.states[sec.goal];
    const cur = th && th.attributes.current_schedule_entry;
    if (cur) {
      const today = this._dayName();
      const same = (e) => e.time_start === cur.time_start && e.time_end === cur.time_end &&
        Number(e.target_temp) === Number(cur.target_temp);
      const keys = Object.keys(s.presets || {});
      for (const k of keys) {
        const list = (s.presets[k].schedule && s.presets[k].schedule[today]) || [];
        if (list.some(same)) return k;
      }
      const base = s.mode === "per_day"
        ? ((s.per_day && s.per_day[today]) || [])
        : (s[new Date().getDay() % 6 === 0 ? "weekend" : "weekday"] || []);
      if (base.some(same)) return null;
    }
    return null;
  },

  _scope() {
    return this._schedScope === undefined ? this._detectScope() : this._schedScope;
  },

  /* Presets and per_day mode are seven-day; the base split is two-bucket. */
  _perDay() {
    return !!this._scope() || (this._sched && this._sched.mode === "per_day");
  },

  _schedDayName() {
    if (this._schedDay) return this._schedDay;
    if (this._perDay()) return this._dayName();
    return new Date().getDay() % 6 === 0 ? "weekend" : "weekday";
  },

  _schedEntries() {
    const s = this._sched;
    if (!s) return [];
    const day = this._schedDayName();
    const scope = this._scope();
    if (scope && s.presets && s.presets[scope]) {
      return (s.presets[scope].schedule && s.presets[scope].schedule[day]) || [];
    }
    if (s.mode === "per_day") return (s.per_day && s.per_day[day]) || [];
    return s[day] || [];
  },

  _schedToday() {
    return this._schedEntries();
  },

  _zoneName(id) {
    if (!id || !this._sched) return null;
    const z = (this._sched.zones || []).find((x) => x.id === id);
    return z ? z.name : null;
  },

  /* GTTC's update_entry / delete_entry write to the ACTIVE preset, so editing
     anything else would silently land in the wrong schedule. Only offer it
     where the write will go where it looks like it goes. */
  _schedEditable(sec) {
    if ((sec.schedule || {}).editable === false) return false;
    return this._scope() === this._activePreset();
  },

  _schedWs(msg) {
    const sec = (this._config.sections || []).find((x) => x.type === "climate" && x.schedule);
    const extra = sec && sec.schedule.entry_id ? { entry_id: sec.schedule.entry_id } : {};
    return this._hass.callWS({ ...msg, ...extra });
  },

  async _schedSave() {
    const root = this.shadowRoot;
    const val = (f) => {
      const el = root.querySelector(`[data-f="${f}"]`);
      return el ? el.value : "";
    };
    const entries = this._schedEntries().slice().sort((a, b) => psMins(a.time_start) - psMins(b.time_start));
    const orig = this._schedEdit === "new" ? null : entries[this._schedEdit];
    const msg = {
      type: "gttc/update_entry",
      day: this._schedDayName(),
      time_start: val("time_start"),
      time_end: val("time_end"),
      target_temp: parseFloat(val("target_temp")),
    };
    if (!msg.time_start || !msg.time_end || !Number.isFinite(msg.target_temp)) {
      this._schedNote = "Start, end and heat temperature are required.";
      this._render();
      return;
    }
    const cool = parseFloat(val("cooling_temp"));
    if (Number.isFinite(cool)) msg.cooling_temp = cool;
    if (orig) {
      msg.old_time_start = orig.time_start;
      msg.old_time_end = orig.time_end;
      if (orig.zone_id) msg.zone_id = orig.zone_id;
      if (orig.away_temp != null) msg.away_temp = orig.away_temp;
    }
    try {
      const res = await this._schedWs(msg);
      this._schedNote = res && res.conflicts && res.conflicts.length
        ? "Saved \u2014 overlaps another window, check the times." : null;
      this._schedEdit = null;
      await this._fetchSchedule();
    } catch (err) {
      this._schedNote = "Save failed: " + ((err && err.message) || "unknown error");
      this._render();
    }
  },

  async _schedDelete() {
    const entries = this._schedEntries().slice().sort((a, b) => psMins(a.time_start) - psMins(b.time_start));
    const orig = entries[this._schedEdit];
    if (!orig) return;
    try {
      await this._schedWs({
        type: "gttc/delete_entry", day: this._schedDayName(),
        time_start: orig.time_start, time_end: orig.time_end,
      });
      this._schedEdit = null;
      this._schedNote = null;
    this._schedScope = undefined; // preset key being viewed; null = base lists
    this._schedDay = null;        // day being viewed; null = today
    this._sel = [];           // rooms the user picked, overriding what is playing
    this._pins = [];          // saved playlists
      await this._fetchSchedule();
    } catch (err) {
      this._schedNote = "Delete failed: " + ((err && err.message) || "unknown error");
      this._render();
    }
  },

  _scheduleHtml(sec) {
    const h = this._hass;
    const sd = this._sched;
    const th = h.states[sec.goal];
    const cur = th && th.attributes.current_schedule_entry;
    const scope = this._scope();
    const day = this._schedDayName();
    const editable = this._schedEditable(sec);
    const entries = this._schedEntries().slice()
      .sort((a, b) => psMins(a.time_start) - psMins(b.time_start));

    /* Which of the four schedules you are looking at. */
    const labels = (sd && sd.preset_labels) || {};
    const scopes = [{ k: null, label: "Base" }].concat(
      Object.keys((sd && sd.presets) || {}).map((k) => ({ k, label: labels[k] || k })));
    const scopeTabs = sd && scopes.length > 1
      ? `<div class="ps-tabs">${scopes.map((x) => `
          <button class="ps-tab ${x.k === scope ? "on" : ""}" type="button"
            data-scope="${x.k === null ? "__base__" : psEsc(x.k)}">${psEsc(x.label)}</button>`).join("")}</div>`
      : "";

    const days = this._perDay()
      ? [["monday", "Mon"], ["tuesday", "Tue"], ["wednesday", "Wed"], ["thursday", "Thu"],
         ["friday", "Fri"], ["saturday", "Sat"], ["sunday", "Sun"]]
      : [["weekday", "Weekdays"], ["weekend", "Weekend"]];
    const dayTabs = `<div class="ps-tabs">${days.map(([k, lbl]) => `
        <button class="ps-tab ${k === day ? "on" : ""}" type="button" data-sday="${k}">${psEsc(lbl)}</button>`).join("")}</div>`;

    const nowPct = ((new Date().getHours() * 60 + new Date().getMinutes()) / 1440) * 100;
    const isToday = this._perDay() ? day === this._dayName()
      : day === (new Date().getDay() % 6 === 0 ? "weekend" : "weekday");

    let bars = "";
    entries.forEach((e, i) => {
      const st = psMins(e.time_start);
      let en = e.time_end ? psMins(e.time_end)
        : (i + 1 < entries.length ? psMins(entries[i + 1].time_start) : 1440);
      if (en <= st) en = 1440;                    // a window that wraps midnight
      const live = isToday && cur && cur.time_start === e.time_start && cur.time_end === e.time_end;
      bars += `<span class="ps-seg ${live ? "live" : ""}"
        style="left:${((st / 1440) * 100).toFixed(2)}%;width:${Math.max(1.2, ((en - st) / 1440) * 100).toFixed(2)}%"
        >${e.cooling_temp != null ? Math.round(e.cooling_temp) + "\u00B0" : Math.round(e.target_temp) + "\u00B0"}</span>`;
    });

    const rows = entries.map((e, i) => {
      const live = isToday && cur && cur.time_start === e.time_start && cur.time_end === e.time_end;
      const zone = this._zoneName(e.zone_id);
      return `<button class="ps-sr ${live ? "live" : ""}" type="button" ${
          editable ? `data-sedit="${i}"` : "disabled"}>
          <span class="ps-srt">${psEsc(psMinsToClock(psMins(e.time_start)))}\u2013${
            psEsc(psMinsToClock(psMins(e.time_end || "23:59")))}</span>
          <span class="ps-srv"><i class="h"></i>${e.target_temp == null ? "\u2014" : Math.round(e.target_temp) + "\u00B0"}${
            e.cooling_temp == null ? "" : `<i class="c"></i>${Math.round(e.cooling_temp)}\u00B0`}${
            zone ? `<span class="ps-srz">${psEsc(zone)}</span>` : ""}</span>
          ${live ? `<span class="ps-chip cool">now</span>` : ""}
        </button>`;
    }).join("");

    let editor = "";
    if (editable && this._schedEdit !== null) {
      const isNew = this._schedEdit === "new";
      const e = isNew ? {} : (entries[this._schedEdit] || {});
      editor = `<div class="ps-sedit">
          <div class="ps-sform">
            <label>Start<input type="time" data-f="time_start" value="${psEsc(e.time_start || "")}" /></label>
            <label>End<input type="time" data-f="time_end" value="${psEsc(e.time_end || "")}" /></label>
            <label>Heat<input type="number" inputmode="decimal" data-f="target_temp" value="${
              e.target_temp == null ? "" : e.target_temp}" /></label>
            <label>Cool<input type="number" inputmode="decimal" data-f="cooling_temp" value="${
              e.cooling_temp == null ? "" : e.cooling_temp}" /></label>
          </div>
          ${this._schedNote ? `<div class="ps-snote">${psEsc(this._schedNote)}</div>` : ""}
          <div class="ps-btns">
            <button class="ps-btn primary" type="button" id="ps-ssave">Save</button>
            <button class="ps-btn" type="button" id="ps-scancel">Cancel</button>
            ${isNew ? "" : `<button class="ps-btn danger ${this._armed === "sdel" ? "armed" : ""}"
              type="button" data-arm="sdel">${this._armed === "sdel" ? "Tap again" : "Delete"}</button>`}
          </div>
        </div>`;
    }

    const modeId = (sec.schedule || {}).mode_entity;
    const onId = (sec.schedule || {}).switch_entity;
    const on = onId ? pcState(h, onId) === "on" : null;

    return `<div class="ps-sched">
        <div class="ps-schedh">
          <span class="ps-lbl">Schedule</span>
          ${modeId ? `<span class="ps-chip">${psEsc(pcState(h, modeId))}</span>` : ""}
          ${onId ? `<button class="ps-knob ${on ? "on" : ""}" type="button" data-toggle="${psEsc(onId)}"
            role="switch" aria-checked="${on}" aria-label="Schedule enabled"><i></i></button>` : ""}
        </div>
        ${cur ? `<div class="ps-schednow">Holding <b>${Math.round(cur.effective_temp)}\u00B0</b>
          until ${psEsc(psMinsToClock(psMins(cur.time_end)))}
          <span class="ps-flat">(${Math.round(cur.target_temp)}\u00B0 heat${
            cur.cooling_temp == null ? "" : " / " + Math.round(cur.cooling_temp) + "\u00B0 cool"})</span></div>` : ""}
        ${scopeTabs}
        ${sd ? dayTabs : ""}
        ${entries.length ? `<div class="ps-timeline">${bars}
            ${isToday ? `<span class="ps-nowline" style="left:${nowPct.toFixed(2)}%"></span>` : ""}</div>
          <div class="ps-tscale"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div>
          <div class="ps-srs">${rows}</div>`
        : `<div class="ps-flat" style="font-size:11px">${this._sched === null
            ? "Schedule unavailable." : "No windows set for this day."}</div>`}
        ${editor}
        ${editable && this._schedEdit === null && sd
          ? `<div class="ps-btns"><button class="ps-btn" type="button" data-sedit="new">Add a window</button></div>` : ""}
        ${!editable && sd ? `<div class="ps-note">Read-only \u2014 GTTC writes edits to the active preset${
          this._activePreset() ? "" : ", and none is pinned"}. Pin one to edit here.</div>` : ""}
      </div>`;
  },
});

