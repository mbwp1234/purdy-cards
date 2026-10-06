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
 * v1.91 — the schedule is read as BLOCKS, not entries. GTTC stores a night as
 * two entries split at midnight (19:00–23:59 and 00:00–05:59) and ends every
 * entry at :59, so the sheet used to say "Holding 70° until 11:59 PM" about a
 * night that ran until six. A block is what a person means: one span with one
 * number, named for when it runs, laid on a 6 AM → 6 AM axis so the night is
 * drawn in one piece. Saving writes ONE entry with exact, exclusive ends —
 * GTTC's scheduler already treats start > end as running past midnight.
 *
 * Writes carry `preset`, so any plan can be edited from here, not only the
 * one GTTC happens to have pinned.
 * ========================================================================== */

const PS_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const PS_WKDAYS = PS_DAYS.slice(0, 5);
const PS_WKEND = ["saturday", "sunday"];

/* An entry's END, as an exclusive minute. GTTC entries end at :59 by habit,
   which leaves a minute of nothing at every seam — read them as the top of the
   next hour, which is what was meant. 23:59 is midnight, written as 0. */
function psEndMins(e) {
  if (!e || !e.time_end) return null;
  const m = psMins(e.time_end);
  return m % 60 === 59 ? (m + 1) % 1440 : m;
}

function psHhmm(m) {
  const v = ((Math.round(m) % 1440) + 1440) % 1440;
  return String(Math.floor(v / 60)).padStart(2, "0") + ":" + String(v % 60).padStart(2, "0");
}

/* Minutes past 6 AM — the sheet's day starts there, so the night is one piece. */
function psAx(m) {
  return ((m - 360) % 1440 + 1440) % 1440;
}

function psDeg1(v) {
  const n = Number(v);
  return Number.isFinite(n) ? (Math.round(n * 10) / 10) + "°" : "—";
}

Object.assign(PurdyShellCard.prototype, {
  async _fetchSchedule() {
    const sec = (this._config.sections || []).find((x) => x.type === "climate" && x.schedule);
    if (!sec || !this._hass || !this._hass.callWS) return;
    const extra = sec.schedule.entry_id ? { entry_id: sec.schedule.entry_id } : {};
    try {
      this._sched = await this._hass.callWS({ type: "gttc/get_schedule", ...extra });
      this._schedErr = null;
      this._last = null;
      this._render();
    } catch (e) {
      /* A schedule that will not load must say so. Rendering an empty day
         would read as "nothing is scheduled", which is the opposite of the
         truth and the one reading that would make someone change the heat. */
      this._sched = null;
      this._schedErr = (e && e.message) || "GTTC did not answer";
      this._last = null;
      this._render();
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

  _schedSec() {
    return ((this._config || {}).sections || []).find((x) => x.type === "climate" && x.schedule);
  },

  _schedGoalAttrs() {
    const sec = this._schedSec();
    const th = sec && this._hass && this._hass.states[sec.goal || sec.thermostat];
    return (th && th.attributes) || {};
  },

  /* Which schedule is actually running: the pinned preset, else whichever
     preset owns the window the thermostat reports, else the base lists. */
  _detectScope() {
    const s = this._sched;
    if (!s || !this._hass) return null;
    const pinned = this._activePreset();
    if (pinned) return pinned;

    const cur = this._schedGoalAttrs().current_schedule_entry;
    if (cur) {
      const today = this._dayName();
      const same = (e) => e.time_start === cur.time_start && e.time_end === cur.time_end &&
        Number(e.target_temp) === Number(cur.target_temp);
      const keys = Object.keys(s.presets || {});
      for (const k of keys) {
        const list = (s.presets[k].schedule && s.presets[k].schedule[today]) || [];
        if (list.some(same)) return k;
      }
    }
    return null;
  },

  _scope() {
    return this._schedScope === undefined ? this._detectScope() : this._schedScope;
  },

  /* Presets and per_day mode are seven-day; the base split is two-bucket. */
  _perDay(scope) {
    const sc = scope === undefined ? this._scope() : scope;
    return !!sc || !!(this._sched && this._sched.mode === "per_day");
  },

  _todayBucket() {
    return new Date().getDay() % 6 === 0 ? "weekend" : "weekday";
  },

  /* The raw entry list for one scope and one day. */
  _schedList(scope, day) {
    const s = this._sched;
    if (!s) return [];
    if (scope && s.presets && s.presets[scope]) {
      return (s.presets[scope].schedule && s.presets[scope].schedule[day]) || [];
    }
    if (s.mode === "per_day") return (s.per_day && s.per_day[day]) || [];
    return s[day] || [];
  },

  /* Which grouping of days is TRUE for the plan being viewed. A coarser one is
     offered only when it is already the truth — "Every day" over seven days
     that differ would be a promise the save could not keep. */
  _schedGroups() {
    const scope = this._scope();
    const sig = (d) => JSON.stringify(this._schedList(scope, d).map((e) => [
      e.time_start, e.time_end, Number(e.target_temp),
      e.cooling_temp == null ? null : Number(e.cooling_temp),
      e.zone_id || null, e.away_temp == null ? null : Number(e.away_temp),
    ]).sort());
    const sigs = PS_DAYS.map(sig);
    return {
      all: sigs.every((x) => x === sigs[0]),
      split: sigs.slice(0, 5).every((x) => x === sigs[0]) && sigs[5] === sigs[6],
    };
  },

  _schedMode() {
    if (!this._perDay()) return null;
    const g = this._schedGroups();
    const want = this._schedGroup;
    if (want === "all" && g.all) return "all";
    if (want === "split" && g.split) return "split";
    if (want === "each") return "each";
    return g.all ? "all" : g.split ? "split" : "each";
  },

  /* The day whose entries are READ — one representative of the group. */
  _schedDayName() {
    const pick = this._schedDay;
    const today = this._dayName();
    if (!this._perDay()) {
      return pick || this._todayBucket();
    }
    if (PS_DAYS.includes(pick)) return pick;
    const mode = this._schedMode();
    if (mode === "split") {
      const grp = pick === "weekdays" || pick === "weekends" ? pick
        : PS_WKEND.includes(today) ? "weekends" : "weekdays";
      const days = grp === "weekends" ? PS_WKEND : PS_WKDAYS;
      return days.includes(today) ? today : days[0];
    }
    return today;
  },

  /* Every day a save or delete has to land on. */
  _schedTargetDays() {
    const day = this._schedDayName();
    if (!this._perDay()) return [day];
    const mode = this._schedMode();
    if (mode === "all") return PS_DAYS.slice();
    if (mode === "split") return PS_WKEND.includes(day) ? PS_WKEND.slice() : PS_WKDAYS.slice();
    return [day];
  },

  _schedEntries() {
    return this._schedList(this._scope(), this._schedDayName());
  },

  _schedToday() {
    return this._schedEntries();
  },

  _zoneName(id) {
    if (!id || !this._sched) return null;
    const z = (this._sched.zones || []).find((x) => x.id === id);
    return z ? z.name : null;
  },

  /* Entries → blocks. Two entries meeting at midnight with the same settings
     are one night; each block keeps the entries it came from (`parts`) so a
     save can replace exactly those. Ordered from 6 AM. */
  _schedBlocks(list) {
    const es = (list || []).slice().sort((a, b) => psMins(a.time_start) - psMins(b.time_start));
    const same = (a, b) => Number(a.target_temp) === Number(b.target_temp) &&
      (a.cooling_temp == null ? null : Number(a.cooling_temp)) === (b.cooling_temp == null ? null : Number(b.cooling_temp)) &&
      (a.zone_id || null) === (b.zone_id || null) &&
      (a.away_temp == null ? null : Number(a.away_temp)) === (b.away_temp == null ? null : Number(b.away_temp));
    const blocks = es.map((e, i) => {
      let end = psEndMins(e);
      if (end == null) end = i + 1 < es.length ? psMins(es[i + 1].time_start) : 0;
      return { start: psMins(e.time_start), end, parts: [e], e };
    });
    const late = blocks.find((b) => b.end === 0 && b.start > 0);
    const early = blocks.find((b) => b.start === 0 && b.end > 0 && b !== late);
    if (late && early && same(late.e, early.e)) {
      late.end = early.end;
      late.parts.push(early.e);
      blocks.splice(blocks.indexOf(early), 1);
    }
    blocks.forEach((b) => {
      b.dur = ((b.end - b.start) % 1440 + 1440) % 1440 || 1440;
      b.name = this._schedBlockName(b);
    });
    return blocks.sort((a, b) => psAx(a.start) - psAx(b.start));
  },

  /* GTTC entries have no names, so a block is named for WHEN it runs. */
  _schedBlockName(b) {
    const d = b.dur == null ? (((b.end - b.start) % 1440 + 1440) % 1440 || 1440) : b.dur;
    if (d >= 1439) return "All day";
    const s = b.start, e = b.start + d;
    if (e > 1440 || s < 300) return "Overnight";
    if (s <= 720 && e > 720) return "Day";
    if (s < 720) return "Morning";
    if (s < 1020) return "Afternoon";
    return "Evening";
  },

  _schedIsLive(b, cur) {
    return !!cur && b.parts.some((p) => p.time_start === cur.time_start && p.time_end === cur.time_end);
  },

  /* The number a block holds in the season GTTC is in. A blank cool number is
     GTTC's global cooling default, which this card cannot see — so it is
     said, never guessed. */
  _schedSeason() {
    const a = this._schedGoalAttrs();
    return a.season || (a.hvac_action === "heating" ? "heating" : "cooling");
  },

  _schedEff(e) {
    if (!e) return null;
    const s = this._schedSeason();
    if (s === "heating") return Number(e.target_temp);
    return e.cooling_temp == null ? null : Number(e.cooling_temp);
  },

  _schedEffText(e) {
    const v = this._schedEff(e);
    if (v != null) return psDeg1(v);
    return this._schedSeason() === "heating" ? "—" : "cool default";
  },

  /* One number when heat and cool agree, both (dotted) when they do not. */
  _schedTempHtml(e) {
    const t = Number(e.target_temp);
    const c = e.cooling_temp == null ? null : Number(e.cooling_temp);
    if (c == null || c === t) return `<b>${psDeg1(t)}</b>`;
    return `<b><i class="h"></i>${psDeg1(t)}</b><b><i class="c"></i>${psDeg1(c)}</b>`;
  },

  /* Writes go to the plan being viewed: GTTC's update_entry / delete_entry
     take `preset`. The base lists are the one exception — with a plan pinned,
     a base write without `preset` would land in the PINNED plan. */
  _schedEditable(sec) {
    if ((sec.schedule || {}).editable === false) return false;
    if (this._scope()) return true;
    return !this._activePreset();
  },

  _schedWs(msg) {
    const sec = this._schedSec();
    const extra = sec && sec.schedule.entry_id ? { entry_id: sec.schedule.entry_id } : {};
    const scope = this._scope();
    return this._hass.callWS({ ...msg, ...(scope ? { preset: scope } : {}), ...extra });
  },

  _schedActiveZone() {
    const a = this._schedGoalAttrs();
    const zones = (this._sched && this._sched.zones) || [];
    const z = zones.find((x) => x.name === a.active_zone);
    return z ? z.id : (this._sched && this._sched.active_zone_id) || null;
  },

  _schedZoneTemp(id) {
    const a = this._schedGoalAttrs();
    const d = (a.zone_details || {})[id];
    const v = d ? Number(d.current_temp) : NaN;
    return Number.isFinite(v) ? v : null;
  },

  /* The editor works on a draft so the steppers can repaint freely. */
  _schedDraftFor(blocks, idx) {
    if (idx === "new") {
      const last = blocks[blocks.length - 1];
      const st = last ? last.end : 360;
      return { start: psHhmm(st), end: psHhmm(st + 120), temp: 70, cool: 70, split: false,
        zone: this._schedActiveZone(), away: null };
    }
    const b = blocks[idx];
    if (!b) return null;
    const e = b.e;
    const t = Number(e.target_temp);
    const c = e.cooling_temp == null ? null : Number(e.cooling_temp);
    return { start: psHhmm(b.start), end: psHhmm(b.end), temp: t, cool: c == null ? t : c,
      split: c != null && c !== t, zone: e.zone_id || null, away: e.away_temp == null ? null : e.away_temp };
  },

  _schedDraft_() {
    const key = [this._scope(), this._schedDayName(), this._schedEdit].join("|");
    if (!this._schedDraft || this._schedDraft.key !== key) {
      const d = this._schedDraftFor(this._schedBlocks(this._schedEntries()), this._schedEdit);
      this._schedDraft = d ? { ...d, key } : null;
    }
    return this._schedDraft;
  },

  async _schedSave() {
    const root = this.shadowRoot;
    const d = this._schedDraft_();
    if (!d) return;
    const val = (f) => {
      const el = root && root.querySelector(`[data-f="${f}"]`);
      return el && el.value ? el.value : null;
    };
    const start = val("time_start") || d.start;
    const end = val("time_end") || d.end;
    if (!start || !end || start === end || !Number.isFinite(d.temp)) {
      this._schedNote = start === end ? "A block needs a start and an end that differ." : "Start, end and a temperature are required.";
      this._render();
      return;
    }
    const blocks = this._schedBlocks(this._schedEntries());
    const old = this._schedEdit === "new" ? null : blocks[this._schedEdit];
    const sig = old ? old.parts.map((p) => [p.time_start, p.time_end]) : [];
    const cool = d.split ? d.cool : d.temp;
    let conflicts = false;
    try {
      for (const day of this._schedTargetDays()) {
        const list = this._schedList(this._scope(), day);
        for (const [ts, te] of sig) {
          if (list.some((p) => p.time_start === ts && p.time_end === te)) {
            await this._schedWs({ type: "gttc/delete_entry", day, time_start: ts, time_end: te });
          }
        }
        const msg = { type: "gttc/update_entry", day, time_start: start, time_end: end,
          target_temp: d.temp, cooling_temp: cool };
        if (d.zone) msg.zone_id = d.zone;
        if (d.away != null) msg.away_temp = d.away;
        const res = await this._schedWs(msg);
        if (res && res.conflicts && res.conflicts.length) conflicts = true;
      }
      this._schedNote = conflicts ? "Saved — it overlaps another block, check the times." : null;
      this._schedEdit = null;
      this._schedDraft = null;
      await this._fetchSchedule();
    } catch (err) {
      this._schedNote = "Save failed: " + ((err && err.message) || "unknown error");
      this._render();
    }
  },

  async _schedDelete() {
    const blocks = this._schedBlocks(this._schedEntries());
    const b = blocks[this._schedEdit];
    if (!b) return;
    try {
      for (const day of this._schedTargetDays()) {
        const list = this._schedList(this._scope(), day);
        for (const p of b.parts) {
          if (!list.some((x) => x.time_start === p.time_start && x.time_end === p.time_end)) continue;
          await this._schedWs({ type: "gttc/delete_entry", day, time_start: p.time_start, time_end: p.time_end });
        }
      }
      /* Close the editor but stay on the plan and day being looked at —
         a delete is not a reason to throw the user back to today. */
      this._schedEdit = null;
      this._schedDraft = null;
      this._schedNote = null;
      this._armed = null;
      await this._fetchSchedule();
    } catch (err) {
      this._schedNote = "Delete failed: " + ((err && err.message) || "unknown error");
      this._render();
    }
  },

  /* Segments on the 6 AM axis. A block that crosses 6 AM is drawn as two. */
  _schedSegs(blocks) {
    const out = [];
    blocks.forEach((b, i) => {
      const s = psAx(b.start);
      if (s + b.dur <= 1440) out.push({ b, i, s, w: b.dur });
      else { out.push({ b, i, s, w: 1440 - s }); out.push({ b, i, s: 0, w: s + b.dur - 1440 }); }
    });
    return out;
  },

  /* Minutes of the day nothing covers, longer than the :59 habit's minute. */
  _schedGaps(blocks) {
    if (!blocks.length) return [];
    const cov = new Array(1440).fill(false);
    blocks.forEach((b) => { for (let k = 0; k < b.dur; k++) cov[(b.start + k) % 1440] = true; });
    const gaps = [];
    let k = 0;
    while (k < 1440) {
      const m = (360 + k) % 1440;
      if (cov[m]) { k++; continue; }
      let n = 0;
      while (k + n < 1440 && !cov[(360 + k + n) % 1440]) n++;
      if (n > 1) gaps.push([m, (m + n) % 1440]);
      k += n;
    }
    return gaps;
  },

  /* The compact schedule line in the climate section: what is holding now,
     what comes next, which plan, on a mini 6 AM → 6 AM bar. It replaces the
     Schedule button and the "Running:" chip, which said less in more room. */
  _schedStripHtml(sec) {
    const fallback = `<button class="ps-btn" type="button" data-sheet="schedule">
            <svg viewBox="0 0 24 24" class="ps-ico"><rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9h17M8 3v3M16 3v3M12 12.5v3l2 1.2"/></svg>
            Schedule</button>`;
    if (!this._sched) return fallback;
    const running = this._detectScope();
    const day = this._perDay(running) ? this._dayName() : this._todayBucket();
    const blocks = this._schedBlocks(this._schedList(running, day));
    if (!blocks.length) return fallback;
    const a = this._schedGoalAttrs();
    const cur = a.current_schedule_entry;
    const li = blocks.findIndex((b) => this._schedIsLive(b, cur));
    const labels = this._sched.preset_labels || {};
    const plan = running ? (labels[running] || this._humanize(running)) : null;
    let l1, l2;
    if (li >= 0) {
      const b = blocks[li];
      const next = blocks.length > 1 ? blocks[(li + 1) % blocks.length] : null;
      const now = cur && cur.effective_temp != null ? psDeg1(cur.effective_temp) : this._schedEffText(b.e);
      l1 = `${psEsc(b.name)} ${psEsc(now)} until ${psEsc(psMinsToClock(b.end))}`;
      l2 = next ? `then ${psEsc(next.name)} ${psEsc(this._schedEffText(next.e))}` : "the same all day";
    } else {
      l1 = "Nothing scheduled right now";
      l2 = "";
    }
    if (plan) l2 = l2 ? `${l2} · ${psEsc(plan)}` : psEsc(plan);
    const nowAx = psAx(new Date().getHours() * 60 + new Date().getMinutes());
    const segs = this._schedSegs(blocks).map((g) =>
      `<span class="${g.i === li ? "on" : ""}" style="left:${(g.s / 14.4).toFixed(2)}%;width:${(g.w / 14.4).toFixed(2)}%"></span>`).join("");
    return `<button class="ps-sstrip" type="button" data-sheet="schedule" aria-label="Open the schedule">
        <span class="ps-grow">
          <span class="ps-sl1">${l1}</span>
          ${l2 ? `<span class="ps-sl2">${l2}</span>` : ""}
          <span class="ps-smini">${segs}<i style="left:${(nowAx / 14.4).toFixed(2)}%"></i></span>
        </span>
        <svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5l7 7-7 7"/></svg>
      </button>`;
  },

  _scheduleHtml(sec) {
    const sd = this._sched;
    /* An empty day and a schedule that would not load look identical, and the
       difference is whether the heat is about to change on its own. */
    if (!sd) {
      return `<div class="ps-schedfail">
          <div class="ps-lbl">Schedule</div>
          <p>${this._schedErr
            ? "Schedule unavailable — " + psEsc(this._schedErr)
            : "Loading the schedule…"}</p>
          ${this._schedErr ? `<button class="ps-btn" type="button" id="ps-sretry">Try again</button>` : ""}
        </div>`;
    }
    const h = this._hass;
    const a = this._schedGoalAttrs();
    const cur = a.current_schedule_entry;
    const scope = this._scope();
    const running = this._detectScope();
    const day = this._schedDayName();
    const editable = this._schedEditable(sec);
    const blocks = this._schedBlocks(this._schedEntries());
    const labels = sd.preset_labels || {};
    const planName = (k) => k ? (labels[k] || this._humanize(k)) : "Base";
    const viewingRunning = scope === running;

    /* Which plan you are looking at. The base list appears only when it is
       the one running (or the one open) — otherwise it is GTTC's backstop and
       a tab beside the real plans invited editing a list nothing reads. */
    const keys = Object.keys(sd.presets || {});
    const scopes = (running === null || scope === null ? [{ k: null }] : [])
      .concat(keys.map((k) => ({ k })));
    const scopeTabs = keys.length ? `<div class="ps-tabs">${scopes.map((x) => `
        <button class="ps-tab ${x.k === scope ? "on" : ""}" type="button"
          data-scope="${x.k === null ? "__base__" : psEsc(x.k)}">${x.k === running ? `<i class="ps-srun"></i>` : ""}${psEsc(planName(x.k))}</button>`).join("")}</div>` : "";

    /* Days: offer only groupings that are true. */
    let groupTabs = "", dayTabs = "";
    if (this._perDay()) {
      const g = this._schedGroups();
      const mode = this._schedMode();
      const opts = [g.all ? ["all", "Every day"] : null, g.split ? ["split", "Weekdays · Weekends"] : null, ["each", "Each day"]]
        .filter(Boolean);
      if (opts.length > 1) {
        groupTabs = `<div class="ps-tabs">${opts.map(([k, lbl]) => `
          <button class="ps-tab ${k === mode ? "on" : ""}" type="button" data-sgroup="${k}">${psEsc(lbl)}</button>`).join("")}</div>`;
      }
      if (mode === "split") {
        const grp = PS_WKEND.includes(day) ? "weekends" : "weekdays";
        dayTabs = `<div class="ps-tabs">${[["weekdays", "Weekdays"], ["weekends", "Weekends"]].map(([k, lbl]) => `
          <button class="ps-tab ${k === grp ? "on" : ""}" type="button" data-sday="${k}">${lbl}</button>`).join("")}</div>`;
      } else if (mode === "each") {
        dayTabs = `<div class="ps-tabs">${PS_DAYS.map((k) => `
          <button class="ps-tab ${k === day ? "on" : ""}" type="button" data-sday="${k}">${k.slice(0, 1).toUpperCase() + k.slice(1, 3)}</button>`).join("")}</div>`;
      }
    } else {
      dayTabs = `<div class="ps-tabs">${[["weekday", "Weekdays"], ["weekend", "Weekend"]].map(([k, lbl]) => `
        <button class="ps-tab ${k === day ? "on" : ""}" type="button" data-sday="${k}">${lbl}</button>`).join("")}</div>`;
    }

    const today = this._dayName();
    const isToday = viewingRunning && (this._perDay() ? this._schedTargetDays().includes(today) : day === this._todayBucket());

    /* The line that answers "what is it doing", from the RUNNING plan. */
    let nowLine = "";
    if (cur) {
      const rday = this._perDay(running) ? today : this._todayBucket();
      const rb = this._schedBlocks(this._schedList(running, rday));
      const li = rb.findIndex((b) => this._schedIsLive(b, cur));
      const live = li >= 0 ? rb[li] : null;
      const end = live ? live.end : psEndMins(cur);
      const next = live && rb.length > 1 ? rb[(li + 1) % rb.length] : null;
      const zone = this._zoneName(cur.zone_id);
      nowLine = `<div class="ps-schednow">Holding <b>${psDeg1(cur.effective_temp)}</b>${
        zone ? ` on the ${psEsc(zone)}` : ""} until <b>${psEsc(psMinsToClock(end))}</b>${
        next ? `, then <b>${psEsc(this._schedEffText(next.e))}</b>` : ""}</div>`;
    }

    const nowAx = psAx(new Date().getHours() * 60 + new Date().getMinutes());
    const bars = this._schedSegs(blocks).map((g) => {
      const live = isToday && this._schedIsLive(g.b, cur);
      const pct = g.w / 14.4;
      /* A blank cool number has no figure to draw; the row says "cools to
         the default", the bar just stays quiet rather than wrapping. */
      const v = this._schedEff(g.b.e);
      const t = v == null ? "" : psDeg1(v);
      const txt = pct >= 26 ? `${g.b.name}${t ? " " + t : ""}` : pct >= 9 ? t : "";
      return `<span class="ps-seg ${live ? "live" : ""}"
        style="left:${(g.s / 14.4).toFixed(2)}%;width:${Math.max(1.2, pct).toFixed(2)}%">${psEsc(txt)}</span>`;
    }).join("");

    const rows = blocks.map((b, i) => {
      const live = isToday && this._schedIsLive(b, cur);
      const zone = this._zoneName(b.e.zone_id);
      return `<button class="ps-sr ${live ? "live" : ""}" type="button" ${
          editable ? `data-sedit="${i}"` : "disabled"}>
          <span class="ps-grow">
            <span class="ps-sbn">${psEsc(b.name)}${live ? ` <span class="ps-chip cool">now</span>` : ""}</span>
            <span class="ps-sbm">${psEsc(psMinsToClock(b.start))}–${psEsc(psMinsToClock(b.end))}${
              zone ? ` · ${psEsc(zone)}` : (sd.zones || []).length ? " · no room set" : ""}${
              b.e.cooling_temp == null && this._schedSeason() !== "heating" ? " · cools to the default" : ""}</span>
          </span>
          <span class="ps-sbt">${this._schedTempHtml(b.e)}</span>
        </button>`;
    }).join("");

    /* What each block does in each season. GTTC picks heat or cool from the
       season switch; in Heat·Cool it keeps the two ends the thermostat's gap
       apart, which quietly moves the heat end down. */
    let seasons = "";
    if (blocks.length && blocks.length <= 4) {
      const gap = Number.isFinite(Number(a.heat_cool_min_gap)) && a.heat_cool_min_gap != null ? Number(a.heat_cool_min_gap) : 3;
      const ss = this._schedSeason();
      const hc = (a.hvac_modes || []).includes("heat_cool") || ss === "heat_cool";
      let moved = false;
      const cell = (e, kind) => {
        const t = Number(e.target_temp);
        const c = e.cooling_temp == null ? null : Number(e.cooling_temp);
        if (kind === "h") return psDeg1(t);
        if (kind === "c") return c == null ? "default" : psDeg1(c);
        if (c == null) return "—";
        const lo = Math.min(t, Math.round((c - gap) * 10) / 10);
        if (lo < t) moved = true;
        return `${Math.round(lo * 10) / 10}–${psDeg1(c)}`;
      };
      const row = (key, lbl, kind) => `<span class="ps-sgk ${key}${ss === key ? " on" : ""}">${lbl}${ss === key ? " · now" : ""}</span>${
        blocks.map((b) => `<span class="${ss === key ? "on" : ""}">${cell(b.e, kind)}</span>`).join("")}`;
      const grid = `<span></span>${blocks.map((b) => `<span class="ps-sgh">${psEsc(b.name)}</span>`).join("")}
        ${row("heating", "Heat", "h")}${row("cooling", "Cool", "c")}${hc ? row("heat_cool", "Heat·Cool", "b") : ""}`;
      seasons = `<div class="ps-skbox">
          <span class="ps-lbl">What the thermostat does</span>
          <div class="ps-sgrid" style="grid-template-columns:76px repeat(${blocks.length}, minmax(0, 1fr))">${grid}</div>
          ${hc && moved ? `<span class="ps-sfoot">Heat·Cool keeps heat and cool ${gap}° apart for the thermostat, so heating starts that much lower.</span>` : ""}
        </div>`;
    }

    /* Things worth knowing about this plan, said once, plainly. */
    const warns = [];
    if (!viewingRunning && editable) {
      warns.push(`<div class="ps-schednow">Not running now. Changes save to ${psEsc(planName(scope))} and take effect the next time it runs.</div>`);
    }
    if ((sd.zones || []).length && blocks.some((b) => !b.e.zone_id)) {
      warns.push(`<div class="ps-swarn"><b>No room set${blocks.every((b) => !b.e.zone_id) ? "" : " on some blocks"}.</b> They keep watching whichever room the previous block picked.</div>`);
    }
    this._schedGaps(blocks).forEach(([s, e]) => {
      warns.push(`<div class="ps-swarn"><b>Nothing scheduled ${psEsc(psMinsToClock(s))}–${psEsc(psMinsToClock(e))}.</b> GTTC falls back to its base list then.</div>`);
    });

    const editor = editable && this._schedEdit !== null ? this._schedEditorHtml(blocks) : "";

    const onId = (sec.schedule || {}).switch_entity;
    const on = onId ? pcState(h, onId) === "on" : null;

    return `<div class="ps-sched">
        <div class="ps-schedh">
          <span class="ps-lbl">Schedule</span>
          ${keys.length ? "" : `<span class="ps-chip cool">Running: ${psEsc(this._humanize(planName(running)))}</span>`}
          ${onId ? `<button class="ps-knob ${on ? "on" : ""}" type="button" data-toggle="${psEsc(onId)}"
            role="switch" aria-checked="${on}" aria-label="Schedule enabled"><i></i></button>` : ""}
        </div>
        ${nowLine}
        ${scopeTabs}
        ${editor || `
        ${warns.join("")}
        ${groupTabs}
        ${dayTabs}
        ${blocks.length ? `<div class="ps-timeline">${bars}
            ${isToday ? `<span class="ps-nowline" style="left:${(nowAx / 14.4).toFixed(2)}%"></span>` : ""}</div>
          <div class="ps-tscale"><span>6a</span><span>12p</span><span>6p</span><span>12a</span><span>6a</span></div>
          <div class="ps-srs">${rows}</div>`
        : `<div class="ps-note">No blocks set for this day.</div>`}
        ${seasons}
        ${this._schedNote ? `<div class="ps-snote">${psEsc(this._schedNote)}</div>` : ""}
        ${editable ? `<div class="ps-btns"><button class="ps-btn" type="button" data-sedit="new">Add a block</button></div>` : ""}
        ${!editable && (sec.schedule || {}).editable !== false ? `<div class="ps-note">Read-only — with ${
          psEsc(planName(this._activePreset()))} pinned, GTTC would write edits there, not to this list.</div>` : ""}
        ${running !== null && keys.length ? `<div class="ps-note">If a plan leaves a gap, GTTC falls back to its base list.</div>` : ""}`}
      </div>`;
  },

  _schedEditorHtml(blocks) {
    const d = this._schedDraft_();
    if (!d) return "";
    const isNew = this._schedEdit === "new";
    const b = isNew ? null : blocks[this._schedEdit];
    const s = psMins(d.start), e = psMins(d.end);
    const dur = ((e - s) % 1440 + 1440) % 1440;
    const durTxt = dur === 0 ? "Start and end are the same." :
      `${Math.floor(dur / 60) ? Math.floor(dur / 60) + "h" : ""}${dur % 60 ? (dur >= 60 ? " " : "") + (dur % 60) + "m" : ""}${e <= s ? ", into the next morning" : ""}.`;
    const zones = (this._sched.zones || []);
    const zoneTabs = zones.length ? `<span class="ps-lbl">Room that decides</span>
      <div class="ps-tabs">${zones.map((z) => {
        const t = this._schedZoneTemp(z.id);
        return `<button class="ps-tab ${d.zone === z.id ? "on" : ""}" type="button" data-szone="${psEsc(z.id)}">${
          psEsc(z.name)}${t == null ? "" : " · " + psDeg1(t)}</button>`;
      }).join("")}</div>` : "";
    const step = (attr, v, lbl) => `<div class="ps-row ps-sstep">
        <button class="ps-step" type="button" ${attr}="-1" aria-label="Lower ${lbl}"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M5 12h14"/></svg></button>
        <b>${psDeg1(v)}</b>
        <button class="ps-step" type="button" ${attr}="1" aria-label="Raise ${lbl}"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M12 5v14M5 12h14"/></svg></button>
      </div>`;
    const temps = d.split
      ? `<div class="ps-spair">
          <div class="ps-spc"><span class="ps-lbl" style="color:var(--ps-heat)">Heat to</span>${step("data-sstep", d.temp, "heat")}</div>
          <div class="ps-spc"><span class="ps-lbl" style="color:var(--ps-cool)">Cool to</span>${step("data-scstep", d.cool, "cool")}</div>
        </div>`
      : `<div class="ps-sbig">${step("data-sstep", d.temp, "temperature")}</div>`;
    const cool = d.split ? d.cool : d.temp;
    const a = this._schedGoalAttrs();
    const gap = a.heat_cool_min_gap != null && Number.isFinite(Number(a.heat_cool_min_gap)) ? Number(a.heat_cool_min_gap) : 3;
    const lo = Math.min(d.temp, Math.round((cool - gap) * 10) / 10);
    const ss = this._schedSeason();
    const zn = this._zoneName(d.zone);
    const zt = this._schedZoneTemp(d.zone);
    const nowTag = (k) => ss === k ? ` <span class="ps-chip cool">now</span>` : "";
    return `<div class="ps-sedit">
        <span class="ps-sbn">${isNew ? "New block" : psEsc(b ? b.name : "Block")}</span>
        <div class="ps-sform">
          <label>From<input type="time" data-f="time_start" data-sf="start" value="${psEsc(d.start)}" /></label>
          <label>Until<input type="time" data-f="time_end" data-sf="end" value="${psEsc(d.end)}" /></label>
        </div>
        <div class="ps-schednow">${psEsc(durTxt)}</div>
        ${zoneTabs}
        ${temps}
        <button class="ps-stog" type="button" data-ssplit role="switch" aria-checked="${d.split}">
          <span>Different numbers for heat and cool</span><span class="ps-knob ${d.split ? "on" : ""}"><i></i></span></button>
        <div class="ps-skbox">
          <span class="ps-lbl">What this does${zn ? " on the " + psEsc(zn) : ""}</span>
          <span><b style="color:var(--ps-heat)">Heat</b> · heats up to <b>${psDeg1(d.temp)}</b>${nowTag("heating")}</span>
          <span><b style="color:var(--ps-cool)">Cool</b> · cools down to <b>${psDeg1(cool)}</b>${
            zt == null ? "" : ` (${psDeg1(zt)} there now)`}${nowTag("cooling")}</span>
          ${(a.hvac_modes || []).includes("heat_cool") || ss === "heat_cool" ? `<span><b>Heat·Cool</b> · holds <b>${
            Math.round(lo * 10) / 10}–${psDeg1(cool)}</b>${lo < d.temp ? ` — heat waits for ${Math.round(lo * 10) / 10}°, the thermostat needs ${gap}° between them` : ""}${nowTag("heat_cool")}</span>` : ""}
        </div>
        ${this._schedTargetDays().length > 1 ? `<div class="ps-note" style="padding:0">Saves to ${
          this._schedTargetDays().length === 7 ? "every day" : this._schedTargetDays().length === 5 ? "every weekday" : "both weekend days"}.</div>` : ""}
        ${this._schedNote ? `<div class="ps-snote">${psEsc(this._schedNote)}</div>` : ""}
        <div class="ps-btns">
          <button class="ps-btn primary" type="button" id="ps-ssave">Save</button>
          <button class="ps-btn" type="button" id="ps-scancel">Cancel</button>
          ${isNew ? "" : `<button class="ps-btn danger ${this._armed === "sdel" ? "armed" : ""}"
            type="button" data-arm="sdel">${this._armed === "sdel" ? "Tap again" : "Delete"}</button>`}
        </div>
      </div>`;
  },
});
