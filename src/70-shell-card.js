/* ============================================================================
 * purdy-shell-card
 *
 * The whole phone view as one element.
 *
 * Why one element and not a stack of cards: the look depends on there being no
 * gaps and no per-card backgrounds. Twelve `ha-card`s with a 14px margin read
 * as a list of boxes no matter how they are styled — the boxes ARE the gaps.
 * So the shell owns one gradient ground, one glass column, hairline dividers
 * between sections, a shared expand state and a fixed dock.
 *
 * Sections are config-driven and ordered by the config, so re-ranking the
 * screen is an edit to `sections:`, never a code change.
 * ========================================================================== */

const PS_SECTIONS = [
  "sleep", "climate", "people", "music", "rooms", "quick", "calendar", "systems",
];

/* Minutes-past-midnight → "7:25 PM". The bedtime helpers store minutes, so
   anything showing them has to convert rather than print the raw number. */
function psMinsToClock(mins) {
  if (mins == null || !Number.isFinite(mins)) return "—";
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const ap = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${ap}`;
}

function psDur(mins) {
  if (mins == null || !Number.isFinite(mins) || mins < 0) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/* Parse an input_datetime state ("2026-08-05 19:25:53") without relying on
   browser-specific Date parsing of the space-separated form. */
function psParseTs(v) {
  if (!v) return null;
  const t = Date.parse(String(v).replace(" ", "T"));
  return isNaN(t) ? null : t;
}

/* Bubble Card pop-ups are driven by the URL hash, so leaving to a path or an
   in-page section has to clear it or the pop-up stays open over the new view. */
function psClosePopup() {
  if (typeof window !== "undefined" && window.location && window.location.hash) {
    window.location.hash = "";
  }
}

function psMins(hhmm) {
  const parts = String(hhmm || "0:0").split(":");
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

function psEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

/* An MA player is playing *music* only when the app or the content type says
   so — the same player proxies whatever else its source device is doing, so a
   TV episode would otherwise raise a phantom now-playing row. */
const PS_MUSIC_TYPES = ["music", "playlist", "track", "album", "radio"];
function psIsMusic(st) {
  if (!st) return false;
  const a = st.attributes || {};
  if (a.app_id === "music_assistant") return true;
  return PS_MUSIC_TYPES.indexOf(a.media_content_type) >= 0;
}

class PurdyShellCard extends PcBaseCard {
  static getStubConfig() {
    return {
      weather: "weather.home",
      sections: [{ type: "quick", tiles: [] }],
    };
  }

  constructor() {
    super();
    this._open = null;        // key of the expanded section, or null
    this._openGroups = {};    // "sectionKey|groupName" -> true for open groups
    this._sheet = null;       // "alerts" when the alert sheet is showing
    this._history = {};
    this._events = [];
    this._sched = null;
    this._pending = false;
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.sections)) {
      throw new Error("purdy-shell-card: 'sections' (a list) is required");
    }
    config.sections.forEach((s) => {
      if (!s || PS_SECTIONS.indexOf(s.type) < 0) {
        throw new Error(
          `purdy-shell-card: unknown section type '${s && s.type}'. ` +
          `Expected one of: ${PS_SECTIONS.join(", ")}`
        );
      }
    });
    this._config = { dock: [], ...config };
    this._watched = this._collectWatched();
    this._last = null;
    if (this._clock) clearInterval(this._clock);
    this._clock = setInterval(() => this._render(), 30000);
  }

  /* hass arrives after the element is connected, so the first history and
     calendar fetch is kicked from here rather than connectedCallback. */
  set hass(hass) {
    const first = !this._hass;
    super.hass = hass;
    if (first && this._config) {
      this._startHistory();
      this._fetchEvents();
      this._fetchSchedule();
    }
  }

  get hass() {
    return this._hass;
  }

  disconnectedCallback() {
    if (this._clock) clearInterval(this._clock);
    if (this._historyTimer) clearInterval(this._historyTimer);
    if (this._eventTimer) clearInterval(this._eventTimer);
  }

  /* Everything the shell reads, so a state change repaints exactly once. */
  _collectWatched() {
    const c = this._config;
    const ids = [c.weather, c.occupancy].filter(Boolean);
    const push = (x) => { if (x) ids.push(x); };

    (c.attention || []).forEach((r) => push(r.entity));
    (c.dock || []).forEach((d) => push(d.entity));
    ((c.now_playing || {}).players || []).forEach((p) => push(p.entity));

    c.sections.forEach((s) => {
      if (s.type === "sleep") {
        push(s.sleep_state); push(s.person); push(s.age);
        push((s.active_when || {}).entity);
        const r = s.ring || {};
        [r.deep, r.light, r.deep_last_night, r.light_last_night].forEach(push);
        [(r.goal || {}).deep, (r.goal || {}).light].forEach(push);
        (s.vitals || []).forEach((v) => { push(v.entity); push(v.last_night); push(v.baseline); });
        const w = s.wakeups || {};
        [w.live, w.last_night, w.baseline].forEach(push);
        const b = s.bedtime || {};
        [b.entity, b.baseline].forEach(push);
        const rm = s.room || {};
        [rm.temp, rm.humidity, rm.overnight_avg].forEach(push);
        push((s.session || {}).start); push((s.session || {}).end);
        push((s.hypnogram || {}).start_entity);
      }
      if (s.type === "climate") {
        push(s.thermostat); push(s.goal); push(s.weather);
        push((s.outside || {}).temp); push((s.outside || {}).humidity);
        push((s.zones || {}).select);
        ((s.zones || {}).options || []).forEach((o) => push(o.temp));
        (s.rooms || []).forEach((r) => { push(r.temp); push(r.humidity); });
        (s.chips || []).forEach((ch) => push(ch.entity));
        push((s.hold || {}).remaining);
      }
      if (s.type === "people") {
        (s.people || []).forEach((p) => { push(p.entity); push(p.battery); push(p.steps); });
      }
      if (s.type === "music") {
        (s.players || []).forEach((p) => push(p.entity));
      }
      if (s.type === "rooms") {
        (s.rooms || []).forEach((r) => { push(r.temp); push(r.humidity); });
      }
      if (s.type === "quick") {
        (s.tiles || []).forEach((t) => { push(t.entity); push(t.value_entity); push(t.bar_entity); });
      }
      if (s.type === "systems") {
        push(s.subtitle_entity);
        (s.faults || []).forEach((f) => push(f.entity));
        (s.meters || []).forEach((m) => push(m.entity));
        (s.groups || []).forEach((g) => {
          (g.stats || []).forEach((x) => push(x.entity));
          (g.items || []).forEach((x) => push(x.entity));
          push((g.bar || {}).entity);
        });
      }
    });
    return ids.filter(Boolean);
  }

  /* ------------------------------------------------------------- history --*/

  _historyEntities() {
    const ids = [];
    this._config.sections.forEach((s) => {
      if (s.type === "climate" && s.graph) {
        if (s.graph.inside) ids.push(s.graph.inside);
        if (s.graph.outside) ids.push(s.graph.outside);
      }
      if (s.type === "sleep" && s.sleep_state) ids.push(s.sleep_state);
    });
    return ids;
  }

  _startHistory() {
    const run = () => this._fetchHistory();
    run();
    if (this._historyTimer) clearInterval(this._historyTimer);
    this._historyTimer = setInterval(run, (this._config.history_refresh_minutes || 5) * 60 * 1000);
  }

  async _fetchHistory() {
    if (!this._hass || !this._hass.callApi) return;
    const ids = this._historyEntities();
    if (!ids.length) return;
    /* Reach back far enough to cover both the 24h graph and a whole sleep
       session, capped so a long-dead sock never asks the recorder for weeks. */
    const start = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
    try {
      const res = await this._hass.callApi(
        "GET",
        `history/period/${start}?filter_entity_id=${ids.join(",")}&minimal_response&no_attributes`
      );
      const hist = {};
      (res || []).forEach((series) => {
        if (!series || !series.length) return;
        const id = series[0].entity_id;
        if (!id) return;
        hist[id] = series
          .map((p) => ({ t: new Date(p.last_changed || p.last_updated).getTime(), s: p.state }))
          .filter((p) => Number.isFinite(p.t))
          .sort((a, b) => a.t - b.t);
      });
      this._history = hist;
      this._last = null;
      this._render();
    } catch (e) {
      /* History is decoration. Never break the view over it. */
    }
  }

  /* GTTC exposes the whole schedule over its own websocket command; the
     climate entity only ever carries the window that happens to be active. */
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
    }
  }

  /* Today's entries, following GTTC's own per_day / weekday-weekend split. */
  _schedToday() {
    const s = this._sched;
    if (!s) return [];
    const dow = new Date().getDay();
    if (s.mode === "per_day") {
      const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      return (s.per_day && s.per_day[names[dow]]) || [];
    }
    return s[dow === 0 || dow === 6 ? "weekend" : "weekday"] || [];
  }

  _scheduleHtml(sec) {
    const h = this._hass;
    const cfg = sec.schedule || {};
    const th = h.states[sec.goal];
    const cur = th && th.attributes.current_schedule_entry;
    const entries = this._schedToday()
      .slice()
      .sort((a, b) => psMins(a.time_start) - psMins(b.time_start));

    const nowPct = ((new Date().getHours() * 60 + new Date().getMinutes()) / 1440) * 100;
    let bars = "";
    entries.forEach((e, i) => {
      const start = psMins(e.time_start);
      const end = i + 1 < entries.length ? psMins(entries[i + 1].time_start) : 1440;
      const left = (start / 1440) * 100;
      const w = Math.max(1.2, ((end - start) / 1440) * 100);
      const live = cur && cur.time_start === e.time_start;
      bars += `<span class="ps-seg ${live ? "live" : ""}" style="left:${left.toFixed(2)}%;width:${w.toFixed(2)}%"
        >${e.cooling_temp != null ? Math.round(e.cooling_temp) + "\u00B0" : ""}</span>`;
    });

    const rows = entries.map((e) => {
      const live = cur && cur.time_start === e.time_start;
      return `<div class="ps-sr ${live ? "live" : ""}">
          <span class="ps-srt">${psEsc(psMinsToClock(psMins(e.time_start)))}</span>
          <span class="ps-srv"><i class="h"></i>${e.target_temp == null ? "\u2014" : Math.round(e.target_temp) + "\u00B0"}
            <i class="c"></i>${e.cooling_temp == null ? "\u2014" : Math.round(e.cooling_temp) + "\u00B0"}</span>
          ${live ? `<span class="ps-chip cool">now</span>` : ""}
        </div>`;
    }).join("");

    const modeId = cfg.mode_entity;
    const onId = cfg.switch_entity;
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
          <span class="ps-flat">(${Math.round(cur.target_temp)}\u00B0 heat / ${Math.round(cur.cooling_temp)}\u00B0 cool)</span></div>` : ""}
        ${entries.length ? `<div class="ps-timeline">${bars}
            <span class="ps-nowline" style="left:${nowPct.toFixed(2)}%"></span></div>
          <div class="ps-tscale"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div>
          <div class="ps-srs">${rows}</div>`
        : `<div class="ps-flat" style="font-size:11px">${this._sched === null
            ? "Schedule unavailable." : "No windows set for today."}</div>`}
      </div>`;
  }

  async _fetchEvents() {
    const sec = (this._config.sections || []).find((s) => s.type === "calendar");
    if (!sec || !Array.isArray(sec.entities) || !this._hass || !this._hass.callApi) return;
    const days = sec.days || 5;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + days * 86400000);
    const out = [];
    try {
      for (const e of sec.entities) {
        const id = typeof e === "string" ? e : e.entity;
        const color = typeof e === "string" ? null : e.color;
        const res = await this._hass.callApi(
          "GET",
          `calendars/${id}?start=${start.toISOString()}&end=${end.toISOString()}`
        );
        (res || []).forEach((ev) => {
          const s = ev.start && (ev.start.dateTime || ev.start.date);
          if (!s) return;
          out.push({
            name: ev.summary || "Busy",
            color: color || "var(--ps-cool)",
            allDay: !(ev.start && ev.start.dateTime),
            t: new Date(String(s).length <= 10 ? s + "T00:00:00" : s).getTime(),
          });
        });
      }
      out.sort((a, b) => a.t - b.t);
      this._events = out;
      this._last = null;
      this._render();
    } catch (err) {
      /* A calendar that will not answer shows as an empty day, not an error. */
    }
    if (this._eventTimer) clearInterval(this._eventTimer);
    this._eventTimer = setInterval(() => this._fetchEvents(), 30 * 60 * 1000);
  }

  /* ------------------------------------------------------------- helpers --*/

  _greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  _who() {
    const c = this._config;
    if (c.name !== undefined) return c.name;
    const u = this._hass && this._hass.user;
    if (!u || !u.name) return "";
    return String(u.name).trim().split(/\s+/)[0];
  }

  /* Attention rules. Same grammar as purdy-attention-card: one of
     state / state_not / above / below, plus `match:` for a group rule. */
  _faults() {
    const rules = this._config.attention || [];
    const hass = this._hass;
    if (!hass) return [];
    const out = [];
    rules.forEach((r) => {
      const hit = (st) => {
        if (!st) return false;
        const v = st.state;
        if (r.state !== undefined) return v === r.state;
        if (r.state_not !== undefined) return v !== r.state_not && v !== "unavailable" && v !== "unknown";
        const n = parseFloat(v);
        if (!Number.isFinite(n)) return false;
        if (r.above !== undefined) return n > r.above;
        if (r.below !== undefined) return n < r.below;
        return false;
      };
      if (r.match) {
        const re = new RegExp(r.match);
        const names = Object.keys(hass.states)
          .filter((id) => re.test(id) && hit(hass.states[id]))
          .map((id) => (hass.states[id].attributes.friendly_name || id).replace(r.strip || "", "").trim());
        if (names.length) {
          out.push({
            severity: r.severity || "info",
            title: `${names.length} ${r.title || "issues"}`,
            detail: names.slice(0, 4).join(" · "),
            entity: null,
          });
        }
        return;
      }
      if (hit(hass.states[r.entity])) {
        out.push({
          severity: r.severity || "warn",
          title: r.title || pcName(hass, r.entity),
          detail: r.detail || "",
          entity: r.entity,
        });
      }
    });
    /* `rank[x] || 3` would treat critical (0) as unranked and sink it below
       info — the one severity that must always sort first. */
    const rank = { critical: 0, warn: 1, info: 2 };
    const at = (x) => (rank[x] === undefined ? 3 : rank[x]);
    return out.sort((a, b) => at(a.severity) - at(b.severity));
  }

  /* The one player worth showing in the mini bar: prefer something actually
     playing, fall back to whatever is paused with a title. */
  _nowPlaying() {
    const np = this._config.now_playing || {};
    const players = np.players || [];
    const hass = this._hass;
    if (!hass) return null;
    let paused = null;
    for (const p of players) {
      const st = hass.states[p.entity];
      if (!st || !psIsMusic(st)) continue;
      const title = st.attributes.media_title;
      if (!title) continue;
      if (st.state === "playing") return { ...p, st, playing: true };
      if (!paused && st.state === "paused") paused = { ...p, st, playing: false };
    }
    return paused;
  }

  /* ---------------------------------------------------------- SVG pieces --*/

  /* A 270° arc. `segs` are [fraction, colour] laid end to end. */
  _ringSvg(size, stroke, segs, goalFrac) {
    const r = size / 2 - stroke / 2 - 2;
    const c = 2 * Math.PI * r;
    const arc = c * 0.75;
    const cx = size / 2;
    let off = 0;
    let out = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="var(--ps-track)"
        stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${arc.toFixed(2)} ${c.toFixed(2)}" transform="rotate(135 ${cx} ${cx})"/>`;
    segs.forEach(([f, col]) => {
      const len = arc * Math.max(0, Math.min(1, f));
      if (len <= 0.2) { off += len; return; }
      out += `<circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="${col}"
        stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${len.toFixed(2)} ${c.toFixed(2)}"
        stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(135 ${cx} ${cx})"/>`;
      off += len;
    });
    if (goalFrac != null && goalFrac > 0 && goalFrac <= 1) {
      const deg = 135 + 270 * goalFrac + 90; // ring starts at 3 o'clock; tick drawn at 12
      out += `<line x1="${cx}" y1="${(cx - r - stroke / 2 - 1).toFixed(2)}" x2="${cx}" y2="${(cx - r + stroke / 2 + 1).toFixed(2)}"
        stroke="var(--ps-warn)" stroke-width="2.2" stroke-linecap="round"
        transform="rotate(${deg.toFixed(1)} ${cx} ${cx})"/>`;
    }
    return out + "</svg>";
  }

  _waveSvg(sec) {
    const g = sec.graph || {};
    const inside = (this._history[g.inside] || []).map((p) => ({ t: p.t, v: parseFloat(p.s) })).filter((p) => Number.isFinite(p.v));
    const outside = (this._history[g.outside] || []).map((p) => ({ t: p.t, v: parseFloat(p.s) })).filter((p) => Number.isFinite(p.v));
    if (inside.length < 2 && outside.length < 2) return "";

    const hours = g.hours || 24;
    const t1 = Date.now();
    const t0 = t1 - hours * 3600 * 1000;
    const all = inside.concat(outside).filter((p) => p.t >= t0);
    if (all.length < 2) return "";
    let lo = Math.min.apply(null, all.map((p) => p.v));
    let hi = Math.max.apply(null, all.map((p) => p.v));
    const pad = Math.max(1.5, (hi - lo) * 0.18);
    lo -= pad; hi += pad;

    const W = 360, H = 74, TOP = 24, BOT = 3;
    const px = (t) => ((t - t0) / (t1 - t0)) * W;
    const py = (v) => TOP + (1 - (v - lo) / (hi - lo)) * (H - TOP - BOT);
    const line = (arr) =>
      arr.filter((p) => p.t >= t0)
        .map((p) => `${px(p.t).toFixed(1)},${py(p.v).toFixed(1)}`)
        .join(" ");

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
  }

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
    return { from, to: Date.now(), rows: rows.filter((r) => r.t >= from) };
  }

  _hypnoSvg(sec) {
    const span = this._sleepSpan(sec);
    if (!span || span.to - span.from < 60000) return "";
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
        <div class="ps-hypt"><span class="ps-lbl">Tonight</span><span>${rows.length} transitions</span></div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Sleep stages tonight">${out}</svg>
        <div class="ps-hypt"><span>${fmt(span.from)}</span><span>${fmt(span.to)}</span></div>
      </div>`;
  }

  /* ------------------------------------------------------------ sections --*/

  _chev() {
    return `<span class="ps-cv"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5l7 7-7 7"/></svg></span>`;
  }

  _head(sec, chipHtml) {
    if (sec.expandable === false) {
      return `<span class="ps-lbl ps-solo">${psEsc(sec.title || "")}</span>`;
    }
    return `<button class="ps-sh" type="button" data-open="${psEsc(sec.key)}">
        <span class="ps-nm">${psEsc(sec.title || "")}</span>
        ${chipHtml || ""}
        ${this._chev()}
      </button>`;
  }

  _secSleep(sec) {
    const h = this._hass;
    const state = pcState(h, sec.sleep_state);
    const label = { deep_sleep: "Deep sleep", light_sleep: "Light sleep", awake: "Awake" }[state] || "Sock off";
    const cls = { deep_sleep: "deep", light_sleep: "lt", awake: "warn" }[state] || "";
    const active = state === "deep_sleep" || state === "light_sleep" || state === "awake";

    const r = sec.ring || {};
    const deep = (active ? pcNum(h, r.deep) : pcNum(h, r.deep_last_night)) || 0;
    const light = (active ? pcNum(h, r.light) : pcNum(h, r.light_last_night)) || 0;
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
    const wLive = pcNum(h, w.live);
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
          <div class="ps-rv"><b>${total.toFixed(1)}h</b><small>of ${max}h</small></div>
        </div>
        <div class="ps-grow">
          <div class="ps-jn">${psEsc(pcState(h, sec.age) || pcName(h, sec.person, sec.name))}</div>
          <div class="ps-js">${active
            ? `asleep ${elapsed || "—"}<br>since ${since}`
            : `last night<br>${since === "—" ? "no session" : "from " + since}`}</div>
          <div class="ps-chips" style="margin-top:9px">
            <span class="ps-chip deep">Deep ${deep.toFixed(1)}h</span>
            <span class="ps-chip lt">Light ${light.toFixed(1)}h</span>
          </div>
        </div>
      </div>
      <div class="ps-vits">${vitals}</div>
      ${this._hypnoSvg(sec)}
      <div class="ps-xtra">${rows}</div>`;
  }

  _secClimate(sec) {
    const h = this._hass;
    const th = h.states[sec.goal] || h.states[sec.thermostat];
    const cur = th && th.attributes.current_temperature;
    const goal = th && th.attributes.temperature;
    const action = (th && th.attributes.hvac_action) || (th && th.state) || "idle";
    const reason = th && th.attributes.hvac_action_reason;
    const rng = sec.ring || { min: 60, max: 80 };
    const frac = cur == null ? 0 : Math.max(0, Math.min(1, (cur - rng.min) / (rng.max - rng.min)));
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

    const rooms = (sec.rooms || []).map((r) => {
      const t = pcNum(h, r.temp), hu = pcNum(h, r.humidity);
      return `<div class="ps-rml" data-info="${psEsc(r.temp)}">
          <span class="ps-rn">${psEsc(r.name || pcName(h, r.temp))}</span>
          <span class="ps-v">${t == null ? "—" : t.toFixed(1) + "°"}</span>
          <span class="ps-h">${hu == null ? "" : hu.toFixed(1) + "%"}</span>
        </div>`;
    }).join("");

    const chips = (sec.chips || []).map((ch) => {
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
        action.charAt(0).toUpperCase() + action.slice(1))}</span>`)}
      <div class="ps-chero">
        <div class="ps-ring" style="width:92px;height:92px" data-info="${psEsc(sec.goal || sec.thermostat)}">
          ${this._ringSvg(92, 7.5, [[frac, col]], null)}
          <div class="ps-rv"><b>${cur == null ? "—" : Number(cur).toFixed(1) + "°"}</b><small>now</small></div>
        </div>
        <div class="ps-grow">
          <div class="ps-row">
            <button class="ps-step" type="button" data-step="-1" aria-label="Lower goal">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M5 12h14"/></svg></button>
            <div class="ps-goal"><b>${goal == null ? "—" : Math.round(goal) + "°"}</b><span>goal</span></div>
            <button class="ps-step" type="button" data-step="1" aria-label="Raise goal">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M12 5v14M5 12h14"/></svg></button>
          </div>
          ${reason ? `<div class="ps-reason">${psEsc(reason)}</div>` : ""}
        </div>
      </div>
      <div class="ps-zpair">${zones}${outside}</div>
      <div class="ps-xtra">
        ${sec.schedule ? this._scheduleHtml(sec) : ""}
        <div class="ps-rmlist">${rooms}</div>
        ${chips ? `<div class="ps-chips">${chips}</div>` : ""}
      </div>
      ${wave ? `<div class="ps-wave">
        <div class="ps-wlg">
          <span><i style="background:var(--ps-cool)"></i>In<b>${inNow == null ? "—" : inNow.toFixed(1) + "°"}</b></span>
          <span><i style="background:var(--ps-heat)"></i>Out<b>${outNow == null ? "—" : outNow.toFixed(1) + "°"}</b></span>
        </div>${wave}</div>` : ""}`;
  }

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
  }

  _secMusic(sec) {
    const h = this._hass;
    const np = this._nowPlaying();
    const art = np && np.st.attributes.entity_picture_local;
    const players = (sec.players || []).map((p) => {
      const st = h.states[p.entity];
      const live = st && st.state === "playing" && psIsMusic(st);
      return `<button class="ps-mr ${live ? "sel" : ""}" type="button" data-player="${psEsc(p.entity)}">
        ${live ? `<span class="ps-live"></span>` : ""}${psEsc(p.name)}</button>`;
    }).join("");

    const presets = (sec.presets || []).map((p, i) =>
      `<button class="ps-pr" type="button" data-preset="${i}">
        <ha-icon icon="${psEsc(p.icon || "mdi:playlist-music")}"></ha-icon>
        <span class="ps-trunc">${psEsc(p.name)}</span></button>`).join("");

    return `
      ${this._head(sec, `<span class="ps-chip">${np ? (np.playing ? "Playing" : "Paused") : "Idle"}</span>`)}
      <div class="ps-now">
        <div class="ps-art">${art
          ? `<img src="${psEsc(art)}" alt="" />`
          : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
        <div class="ps-grow">
          <div class="ps-nt ps-trunc">${np ? psEsc(np.st.attributes.media_title) : "Nothing playing"}</div>
          <div class="ps-ns ps-trunc">${np
            ? psEsc([np.st.attributes.media_artist, np.name].filter(Boolean).join(" · "))
            : "Pick a room to start"}</div>
        </div>
        ${np ? `<button class="ps-tb" type="button" data-mp="playpause" data-entity="${psEsc(np.entity)}">
          <svg viewBox="0 0 24 24" class="ps-ico">${np.playing
            ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>` : ""}
      </div>
      <div class="ps-mroom">${players}</div>
      <div class="ps-xtra">
        <div><span class="ps-lbl">Presets</span><div class="ps-pres">${presets}</div></div>
      </div>`;
  }

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
  }

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
  }

  _secCalendar(sec) {
    const days = sec.days || 5;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let out = "";
    for (let d = 0; d < days; d++) {
      const day = new Date(today.getTime() + d * 86400000);
      const next = day.getTime() + 86400000;
      const evs = this._events.filter((e) => e.t >= day.getTime() && e.t < next);
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
    return `${this._head(sec)}${out}`;
  }

  /* The section that got the most attention: collapsed shows meters, expanded
     shows every group's stats, every container switch and the robot controls
     that used to need the #devices popup. */
  _secSystems(sec) {
    const h = this._hass;

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
  }

  /* -------------------------------------------------------------- render --*/

  _render() {
    if (!this._hass || !this._config) return;
    const c = this._config;
    const now = new Date();
    const who = this._who();
    const faults = this._faults();
    const worst = faults.length
      ? (faults[0].severity === "critical" ? "bad" : faults[0].severity === "warn" ? "warn" : "")
      : "good";

    const wTemp = c.weather && this._hass.states[c.weather]
      ? this._hass.states[c.weather].attributes.temperature : null;
    const wState = pcState(this._hass, c.weather);
    const wIcons = {
      rainy: "mdi:weather-rainy", pouring: "mdi:weather-pouring", sunny: "mdi:weather-sunny",
      clear: "mdi:weather-night", "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy",
      partlycloudy: "mdi:weather-partly-cloudy", snowy: "mdi:weather-snowy", fog: "mdi:weather-fog",
      windy: "mdi:weather-windy", lightning: "mdi:weather-lightning", hail: "mdi:weather-hail",
    };

    const sections = c.sections.map((raw, i) => {
      const sec = { key: raw.key || raw.type + i, ...raw };
      const body = {
        sleep: () => this._secSleep(sec),
        climate: () => this._secClimate(sec),
        people: () => this._secPeople(sec),
        music: () => this._secMusic(sec),
        rooms: () => this._secRooms(sec),
        quick: () => this._secQuick(sec),
        calendar: () => this._secCalendar(sec),
        systems: () => this._secSystems(sec),
      }[sec.type]();
      const open = this._open === sec.key;
      return `<div class="ps-sect ${open ? "open" : ""}" data-sect="${psEsc(sec.key)}">${body}</div>`;
    }).join("");

    const np = this._nowPlaying();
    const dock = (c.dock || []).map((d, i) => {
      const alert = d.alert_when_faults && faults.length;
      return `<button class="ps-db ${d.active ? "on" : ""} ${alert ? "alert" : ""}" type="button" data-dock="${i}">
          <ha-icon icon="${psEsc(d.icon)}"></ha-icon><span>${psEsc(d.name)}</span>
        </button>`;
    }).join("");

    const npArt = np && np.st.attributes.entity_picture_local;

    this.shadowRoot.innerHTML = `
      <style>${PurdyShellCard.styles}</style>
      <div class="ps-ground"></div>

      <div class="ps-stat">
        <div>
          <h2>${this._greeting()}${who ? `,<br>${psEsc(who)}` : ""}</h2>
          <div class="ps-d">${now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
            · ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${
              c.occupancy ? " · " + psEsc(pcState(this._hass, c.occupancy)) : ""}</div>
        </div>
        <div class="ps-rt">
          ${wTemp == null ? "" : `<div class="ps-wx" data-info="${psEsc(c.weather)}">
            <ha-icon icon="${wIcons[wState] || "mdi:weather-partly-cloudy"}"></ha-icon>${Math.round(wTemp)}°</div>`}
          <button class="ps-chip ${worst}" type="button" id="ps-alert">
            <span class="ps-dot"></span>${faults.length ? `${faults.length} need${faults.length > 1 ? "" : "s"} attention` : "All clear"}
          </button>
        </div>
      </div>

      <div class="ps-col">${sections}</div>

      ${this._sheet === "alerts" && faults.length ? `
        <div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet">
          <div class="ps-sheeth"><span class="ps-lbl">Needs attention</span>
            <button class="ps-x" type="button" id="ps-close" aria-label="Close">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
          ${faults.map((f) => `<div class="ps-ar" data-info="${psEsc(f.entity || "")}">
            <span class="ps-dotc ${f.severity}"></span>
            <span class="ps-grow"><span class="ps-at">${psEsc(f.title)}</span>
            <span class="ps-ad">${psEsc(f.detail)}</span></span></div>`).join("")}
        </div>` : ""}

      <div class="ps-fade"></div>
      <div class="ps-dockwrap">
        ${np ? `<div class="ps-mini" id="ps-mini">
          <div class="ps-mart">${npArt
            ? `<img src="${psEsc(npArt)}" alt="" />`
            : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
          <div class="ps-grow">
            <div class="ps-mt ps-trunc">${psEsc(np.st.attributes.media_title)}</div>
            <div class="ps-ms ps-trunc">${psEsc(np.name)} · ${np.playing ? "playing" : "paused"}</div>
          </div>
          <button class="ps-mb" type="button" data-mp="playpause" data-entity="${psEsc(np.entity)}" aria-label="Play or pause">
            <svg viewBox="0 0 24 24" class="ps-ico">${np.playing
              ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
        </div>` : ""}
        <div class="ps-dock">${dock}</div>
      </div>`;

    this._bind();
  }

  _bind() {
    const root = this.shadowRoot;
    const hass = this._hass;
    const c = this._config;

    root.querySelectorAll("[data-open]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = el.dataset.open;
        psClosePopup();
        this._open = this._open === k ? null : k;
        this._render();
        if (this._open) {
          const sect = root.querySelector(`[data-sect="${this._open}"]`);
          if (sect && sect.scrollIntoView) sect.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    });

    root.querySelectorAll("[data-info]").forEach((el) => {
      if (!el.dataset.info) return;
      el.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        pcMoreInfo(this, el.dataset.info);
      });
    });

    const alertBtn = root.getElementById("ps-alert");
    if (alertBtn) {
      alertBtn.addEventListener("click", () => {
        this._sheet = this._sheet === "alerts" ? null : "alerts";
        this._render();
      });
    }
    ["ps-close", "ps-scrim"].forEach((id) => {
      const el = root.getElementById(id);
      if (el) el.addEventListener("click", () => { this._sheet = null; this._render(); });
    });

    root.querySelectorAll("[data-step]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = c.sections.find((s) => s.type === "climate");
        if (!sec) return;
        const id = sec.goal || sec.thermostat;
        const st = hass.states[id];
        if (!st || st.attributes.temperature == null) return;
        const next = st.attributes.temperature + parseInt(el.dataset.step, 10) * (sec.step || 1);
        hass.callService("climate", "set_temperature", { entity_id: id, temperature: next });
      });
    });

    root.querySelectorAll("[data-zone]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = c.sections.find((s) => s.type === "climate");
        if (!sec || !sec.zones || !sec.zones.select) return;
        hass.callService("select", "select_option", {
          entity_id: sec.zones.select, option: el.dataset.zone,
        });
      });
    });

    root.querySelectorAll("[data-tile]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = c.sections.find((s) => s.type === "quick");
        const t = sec && sec.tiles[parseInt(el.dataset.tile, 10)];
        if (t) pcAction(this, hass, t.tap_action, t.entity);
      });
    });

    root.querySelectorAll("[data-group]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = el.dataset.group;
        if (this._openGroups[k]) delete this._openGroups[k];
        else this._openGroups[k] = true;
        this._render();
      });
    });

    root.querySelectorAll("[data-toggle]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        hass.callService("homeassistant", "toggle", { entity_id: el.dataset.toggle });
      });
    });

    root.querySelectorAll("[data-url]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(el.dataset.url, "_blank");
      });
    });

    root.querySelectorAll("[data-mp]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        hass.callService("media_player", "media_play_pause", { entity_id: el.dataset.entity });
      });
    });

    root.querySelectorAll("[data-player]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        pcMoreInfo(this, el.dataset.player);
      });
    });

    root.querySelectorAll("[data-preset]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = c.sections.find((s) => s.type === "music");
        const p = sec && (sec.presets || [])[parseInt(el.dataset.preset, 10)];
        const np = this._nowPlaying();
        const target = np ? np.entity : (sec.default_player || (sec.players[0] || {}).entity);
        if (!p || !target) return;
        hass.callService("music_assistant", "play_media", {
          entity_id: target, media_id: p.uri, media_type: p.media_type || "playlist",
        });
      });
    });

    root.querySelectorAll("[data-gbtn]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const [gname, idx] = el.dataset.gbtn.split("|");
        const sec = c.sections.find((s) => s.type === "systems");
        const g = sec && (sec.groups || []).find((x) => x.name === gname);
        const b = g && (g.buttons || [])[parseInt(idx, 10)];
        if (b) pcAction(this, hass, b.tap_action, null);
      });
    });

    root.querySelectorAll("[data-dock]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const d = (c.dock || [])[parseInt(el.dataset.dock, 10)];
        if (!d) return;
        if (d.section) {
          psClosePopup();
          this._open = this._open === d.section ? null : d.section;
          this._render();
          const sect = root.querySelector(`[data-sect="${d.section}"]`);
          if (sect && sect.scrollIntoView) sect.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        if (d.alert_when_faults && this._faults().length) {
          psClosePopup();
          this._sheet = "alerts";
          this._render();
          return;
        }
        if (!d.link || d.link.charAt(0) !== "#") psClosePopup();
        pcNavigate(this, d.link);
      });
    });
  }

  getCardSize() {
    return 30;
  }

  /* Pure helpers, exposed so the smoke test can exercise them without
     reaching into the bundle's module scope. */
  static get helpers() {
    return { minsToClock: psMinsToClock, dur: psDur, esc: psEsc, isMusic: psIsMusic, parseTs: psParseTs };
  }

  static get styles() {
    return `
      :host {
        ${PC_TOKENS}
        --ps-text: #e8eef4;
        --ps-muted: #8792a0;
        --ps-dim: #606b79;
        --ps-cool: var(--pc-cool);
        --ps-heat: var(--pc-heat);
        --ps-good: var(--pc-good);
        --ps-warn: var(--pc-warn);
        --ps-bad: var(--pc-bad);
        --ps-deep: #AA78FF;
        --ps-light: #50A0FF;
        --ps-awake: #FFA74E;
        --ps-hair: rgba(255,255,255,.075);
        --ps-hair-soft: rgba(255,255,255,.05);
        --ps-fill: rgba(255,255,255,.055);
        --ps-track: rgba(255,255,255,.12);
        display: block;
        position: relative;
        margin: -8px -12px 0;
        padding: 6px 12px 132px;
        color: var(--ps-text);
        font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        -webkit-font-smoothing: antialiased;
        min-height: 100vh;
      }
      * { box-sizing: border-box; }
      button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; text-align: inherit; }
      button:focus-visible, [role="switch"]:focus-visible { outline: 2px solid var(--ps-cool); outline-offset: 2px; border-radius: 8px; }
      img { display: block; width: 100%; height: 100%; object-fit: cover; }
      ha-icon { --mdc-icon-size: 20px; flex: 0 0 auto; }
      .ps-ico { width: 17px; height: 17px; flex: 0 0 auto; display: block; }
      .ps-ico path, .ps-ico circle, .ps-ico rect, .ps-ico line {
        fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round;
      }
      .ps-grow { flex: 1; min-width: 0; }
      .ps-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
      .ps-row { display: flex; align-items: center; gap: 9px; }
      .ps-lbl { font-size: 9px; letter-spacing: .15em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-solo { display: block; margin-bottom: 9px; }

      /* the ground — one gradient behind everything */
      .ps-ground {
        position: fixed; inset: 0; z-index: -1; pointer-events: none;
        background:
          radial-gradient(120% 58% at 92% -8%, rgba(122,86,255,.46), transparent 62%),
          radial-gradient(110% 52% at 4% 104%, rgba(26,128,142,.44), transparent 60%),
          radial-gradient(90% 40% at 50% 44%, rgba(60,44,120,.28), transparent 72%),
          linear-gradient(170deg, #0B0D16 0%, #080A12 55%, #06070E 100%);
      }

      /* status strip — no box, floats on the ground */
      .ps-stat { display: flex; align-items: flex-start; gap: 10px; padding: 2px 8px 14px; }
      .ps-stat h2 { font-size: 22px; font-weight: 640; letter-spacing: -.028em; margin: 0; line-height: 1.12; }
      .ps-d { font-size: 11.5px; color: var(--ps-muted); font-variant-numeric: tabular-nums; margin-top: 3px; }
      .ps-rt { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
      .ps-wx { display: flex; align-items: center; gap: 7px; color: var(--ps-cool); font-size: 17px;
               font-weight: 640; font-variant-numeric: tabular-nums; letter-spacing: -.02em; cursor: pointer; }
      .ps-wx ha-icon { --mdc-icon-size: 22px; }

      .ps-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px;
                 font-size: 10.5px; font-weight: 650; background: rgba(255,255,255,.08); color: var(--ps-muted);
                 font-variant-numeric: tabular-nums; white-space: nowrap; }
      .ps-chip.good { background: rgba(129,201,149,.17); color: var(--ps-good); }
      .ps-chip.warn { background: rgba(242,193,78,.17); color: var(--ps-warn); }
      .ps-chip.bad  { background: rgba(239,106,106,.17); color: var(--ps-bad); }
      .ps-chip.cool { background: rgba(77,208,225,.16); color: var(--ps-cool); }
      .ps-chip.deep { background: rgba(170,120,255,.18); color: var(--ps-deep); }
      .ps-chip.lt   { background: rgba(80,160,255,.18); color: var(--ps-light); }
      .ps-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }
      .ps-chips { display: flex; flex-wrap: wrap; gap: 6px; }

      /* one glass column */
      .ps-col {
        border-radius: 26px; overflow: hidden;
        background: linear-gradient(180deg, rgba(255,255,255,.062), rgba(255,255,255,.026));
        border: 1px solid rgba(255,255,255,.085);
        box-shadow: 0 24px 60px -18px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.075);
        backdrop-filter: blur(26px) saturate(1.25);
        -webkit-backdrop-filter: blur(26px) saturate(1.25);
      }
      .ps-sect { padding: 13px 15px 15px; }
      .ps-sect + .ps-sect { border-top: 1px solid var(--ps-hair); }
      .ps-sh { display: flex; align-items: center; gap: 8px; width: 100%; padding: 0 0 11px; }
      .ps-nm { font-size: 12.5px; font-weight: 680; letter-spacing: -.004em; }
      .ps-cv { margin-left: auto; color: var(--ps-dim); transition: transform .3s; display: flex; }
      .ps-cv .ps-ico { width: 15px; height: 15px; }
      .ps-sect.open .ps-cv { transform: rotate(90deg); color: var(--ps-cool); }
      .ps-xtra { display: none; flex-direction: column; gap: 10px; margin-top: 11px;
                 padding-top: 11px; border-top: 1px solid var(--ps-hair-soft); }
      .ps-sect.open .ps-xtra { display: flex; }

      /* rings shared by climate + sleep */
      .ps-ring { position: relative; flex: 0 0 auto; cursor: pointer; }
      .ps-ring svg { display: block; }
      .ps-rv { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
               justify-content: center; font-variant-numeric: tabular-nums; }
      .ps-rv b { font-size: 22px; font-weight: 640; letter-spacing: -.028em; line-height: 1; }
      .ps-rv small { font-size: 9px; color: var(--ps-dim); margin-top: 3px; letter-spacing: .09em;
                     text-transform: uppercase; font-weight: 650; }

      /* climate */
      .ps-chero { display: flex; align-items: center; gap: 14px; }
      .ps-goal { display: flex; align-items: baseline; gap: 6px; }
      .ps-goal b { font-size: 20px; font-weight: 660; font-variant-numeric: tabular-nums; }
      .ps-goal span { font-size: 11px; color: var(--ps-muted); }
      .ps-step { width: 31px; height: 31px; border-radius: 50%; background: rgba(255,255,255,.08);
                 display: grid; place-items: center; flex: 0 0 auto; }
      .ps-step .ps-ico { width: 16px; height: 16px; }
      .ps-step:active { transform: scale(.93); }
      .ps-reason { font-size: 11px; color: var(--ps-muted); margin-top: 9px; line-height: 1.42; }
      .ps-zpair { display: flex; gap: 6px; margin-top: 11px; }
      .ps-zc { flex: 1; padding: 7px 10px; border-radius: 12px; background: var(--ps-fill); font-size: 10.5px;
               color: var(--ps-muted); font-variant-numeric: tabular-nums; line-height: 1.3; cursor: pointer; }
      .ps-zc b { display: block; font-size: 15px; color: var(--ps-text); font-weight: 660; letter-spacing: -.02em; }
      .ps-zc.on { background: rgba(77,208,225,.15); color: var(--ps-cool); }
      .ps-zc.on b { color: var(--ps-cool); }
      .ps-wave { margin: 11px -15px -15px; position: relative; }
      .ps-wave-svg { width: 100%; height: 74px; display: block; }
      .ps-wlg { position: absolute; top: 6px; left: 15px; display: flex; gap: 12px; font-size: 10px;
                color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .ps-wlg i { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px; }
      .ps-wlg b { color: var(--ps-text); font-weight: 640; margin-left: 3px; }
      .ps-rmlist { display: flex; flex-direction: column; }
      .ps-rml { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 12px;
                border-top: 1px solid var(--ps-hair-soft); cursor: pointer; }
      .ps-rml:first-child { border-top: 0; }
      .ps-rn { flex: 1; min-width: 0; }
      .ps-rml .ps-v { font-weight: 660; font-variant-numeric: tabular-nums; }
      .ps-rml .ps-h { color: var(--ps-dim); font-size: 10.5px; font-variant-numeric: tabular-nums;
                      width: 44px; text-align: right; }

      /* sleep */
      .ps-jtop { display: flex; align-items: center; gap: 13px; }
      .ps-jn { font-size: 13px; font-weight: 660; }
      .ps-js { font-size: 11px; color: var(--ps-muted); font-variant-numeric: tabular-nums; margin-top: 2px; line-height: 1.4; }
      .ps-vits { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 12px; }
      .ps-vit { background: var(--ps-fill); border-radius: 13px; padding: 9px 10px; display: flex;
                flex-direction: column; gap: 2px; min-width: 0; cursor: pointer; }
      .ps-vk { font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-vv { font-size: 17px; font-weight: 640; font-variant-numeric: tabular-nums; letter-spacing: -.022em; line-height: 1.1; }
      .ps-vv small { font-size: 9.5px; font-weight: 500; color: var(--ps-muted); margin-left: 1px; }
      .ps-vd { font-size: 9px; font-variant-numeric: tabular-nums; }
      .ps-good { color: var(--ps-good); }
      .ps-flat { color: var(--ps-dim); }
      .ps-warnc { color: var(--ps-warn); }
      .ps-hyp { margin-top: 12px; display: flex; flex-direction: column; gap: 5px; }
      .ps-hyp svg { width: 100%; height: 46px; display: block; }
      .ps-hypt { display: flex; justify-content: space-between; font-size: 9px; color: var(--ps-dim);
                 font-variant-numeric: tabular-nums; }
      .ps-jrs { display: flex; flex-direction: column; gap: 5px; }
      .ps-jr { display: flex; align-items: center; gap: 9px; background: var(--ps-fill); border-radius: 11px;
               padding: 8px 11px; font-size: 11.5px; font-variant-numeric: tabular-nums; cursor: pointer; }
      .ps-jr .ps-l { color: var(--ps-muted); flex: 1; }
      .ps-jr .ps-v { font-weight: 650; }

      /* people */
      .ps-ppl { display: flex; gap: 8px; }
      .ps-pw { flex: 1; display: flex; align-items: center; gap: 9px; padding: 9px 11px; border-radius: 16px;
               background: var(--ps-fill); min-width: 0; cursor: pointer; }
      .ps-av { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,.1); display: grid;
               place-items: center; font-size: 12px; font-weight: 700; color: var(--ps-muted);
               flex: 0 0 auto; overflow: hidden; }
      .ps-pn { font-size: 13px; font-weight: 650; line-height: 1.2; }
      .ps-pb { font-size: 10px; color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .ps-pb.low { color: var(--ps-warn); }

      /* music */
      .ps-now { display: flex; align-items: center; gap: 11px; }
      .ps-art { width: 50px; height: 50px; border-radius: 14px; background: rgba(255,255,255,.075);
                display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden; }
      .ps-art .ps-ico { width: 23px; height: 23px; }
      .ps-nt { font-size: 14px; font-weight: 650; letter-spacing: -.014em; }
      .ps-ns { font-size: 11px; color: var(--ps-muted); }
      .ps-tb { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
               background: rgba(255,255,255,.09); flex: 0 0 auto; }
      .ps-tb .ps-ico { width: 18px; height: 18px; }
      .ps-mroom { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;
                  margin: 11px -15px 0; padding: 0 15px 2px; }
      .ps-mroom::-webkit-scrollbar { display: none; }
      .ps-mr { flex: 0 0 auto; padding: 7px 12px; border-radius: 12px; background: var(--ps-fill);
               color: var(--ps-muted); font-size: 11px; font-weight: 650;
               display: inline-flex; align-items: center; gap: 6px; }
      .ps-mr.sel { background: rgba(255,255,255,.11); color: var(--ps-text); }
      .ps-live { width: 6px; height: 6px; border-radius: 50%; background: var(--ps-good); }
      .ps-pres { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-top: 7px; }
      .ps-pr { padding: 10px 11px; border-radius: 14px; background: var(--ps-fill); font-size: 11.5px;
               font-weight: 650; display: flex; align-items: center; gap: 8px; min-width: 0; }
      .ps-pr ha-icon { --mdc-icon-size: 16px; color: var(--ps-cool); }

      /* rooms */
      .ps-rstrip { display: flex; gap: 7px; overflow-x: auto; scrollbar-width: none; margin: 0 -15px; padding: 0 15px 2px; }
      .ps-rstrip::-webkit-scrollbar { display: none; }
      .ps-rc { flex: 0 0 auto; min-width: 82px; background: var(--ps-fill); border-radius: 15px;
               padding: 9px 11px; cursor: pointer; }
      .ps-rc.acc { background: rgba(77,208,225,.12); }
      .ps-rn2 { font-size: 8.5px; letter-spacing: .11em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-rc b { display: block; font-size: 18px; font-weight: 660; font-variant-numeric: tabular-nums;
                 letter-spacing: -.028em; margin-top: 3px; }
      .ps-rh { font-size: 9.5px; color: var(--ps-dim); font-variant-numeric: tabular-nums; }

      /* quick */
      .ps-qgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .ps-qt { background: var(--ps-fill); border-radius: 17px; padding: 11px 10px 12px; display: flex;
               flex-direction: column; gap: 7px; min-width: 0; position: relative; overflow: hidden; }
      .ps-qt ha-icon { --mdc-icon-size: 22px; color: var(--ps-dim); }
      .ps-qn { font-size: 11px; font-weight: 650; line-height: 1.2; }
      .ps-qv { font-size: 9.5px; color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .ps-qt.on { background: rgba(242,193,78,.15); }
      .ps-qt.on ha-icon, .ps-qt.on .ps-qn { color: var(--ps-warn); }
      .ps-qt.alert { background: rgba(239,106,106,.15); }
      .ps-qt.alert ha-icon, .ps-qt.alert .ps-qn { color: var(--ps-bad); }
      .ps-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.1); }
      .ps-bar i { display: block; height: 100%; }

      /* calendar */
      .ps-cday { display: flex; gap: 11px; padding: 7px 0; border-top: 1px solid var(--ps-hair-soft); }
      .ps-cday:first-of-type { border-top: 0; }
      .ps-cdt { flex: 0 0 34px; text-align: center; }
      .ps-dw { font-size: 8.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-dn { font-size: 17px; font-weight: 660; font-variant-numeric: tabular-nums; line-height: 1.2; }
      .ps-cdt.today .ps-dn { color: var(--ps-cool); }
      .ps-cev { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; justify-content: center; }
      .ps-ev { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
      .ps-ev i { width: 3px; height: 14px; border-radius: 2px; flex: 0 0 auto; }
      .ps-et { margin-left: auto; color: var(--ps-dim); font-size: 10px; font-variant-numeric: tabular-nums; }
      .ps-ev.none { color: var(--ps-dim); font-size: 11px; }

      /* systems */
      .ps-sub2 { font-size: 11px; color: var(--ps-dim); margin: -4px 0 9px; font-variant-numeric: tabular-nums; }
      .ps-sysrow { display: flex; align-items: center; gap: 10px; font-size: 11.5px; padding: 5px 0; cursor: pointer; }
      .ps-sysrow ha-icon { --mdc-icon-size: 16px; color: var(--ps-dim); }
      .ps-sn { color: var(--ps-muted); }
      .ps-sv { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 650; }
      .ps-meter { width: 54px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.11);
                  overflow: hidden; flex: 0 0 auto; }
      .ps-meter i { display: block; height: 100%; }
      .ps-faults { display: flex; flex-direction: column; gap: 5px; margin-bottom: 9px; }
      .ps-fault { display: flex; align-items: center; gap: 9px; font-size: 11.5px;
                  background: rgba(239,106,106,.12); border-radius: 10px; padding: 7px 10px; cursor: pointer; }
      .ps-dotc { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
      .ps-dotc.bad, .ps-dotc.critical { background: var(--ps-bad); }
      .ps-dotc.warn { background: var(--ps-warn); }
      .ps-dotc.info { background: var(--ps-dim); }
      .ps-grp { display: flex; flex-direction: column; gap: 8px; padding-top: 10px;
                border-top: 1px solid var(--ps-hair-soft); }
      .ps-grp:first-child { border-top: 0; padding-top: 0; }
      .ps-grph { display: flex; align-items: center; gap: 9px; width: 100%; }
      .ps-grph ha-icon { --mdc-icon-size: 17px; color: var(--ps-dim); }
      .ps-gn { font-size: 12px; font-weight: 660; flex: 1; }
      .ps-gcv { color: var(--ps-dim); display: flex; transition: transform .25s; }
      .ps-gcv .ps-ico { width: 14px; height: 14px; }
      .ps-grp.open .ps-gcv { transform: rotate(90deg); color: var(--ps-cool); }
      .ps-grpb { display: none; flex-direction: column; gap: 8px; }
      .ps-grp.open .ps-grpb { display: flex; }
      .ps-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
      .ps-st { background: var(--ps-fill); border-radius: 11px; padding: 7px 10px; min-width: 0; cursor: pointer; }
      .ps-stk { display: block; font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase;
                color: var(--ps-dim); font-weight: 650; }
      .ps-stv { display: block; font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums;
                margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ps-swrap { display: flex; flex-direction: column; gap: 6px; }
      .ps-sw { display: flex; align-items: center; gap: 9px; background: var(--ps-fill); border-radius: 12px;
               padding: 8px 11px; font-size: 11.5px; }
      .ps-sw ha-icon { --mdc-icon-size: 16px; color: var(--ps-dim); }
      .ps-sw .ps-trunc { flex: 1; }
      .ps-link { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
                 color: var(--ps-dim); flex: 0 0 auto; }
      .ps-link .ps-ico { width: 13px; height: 13px; }
      .ps-knob { width: 34px; height: 19px; border-radius: 999px; background: rgba(255,255,255,.13);
                 position: relative; flex: 0 0 auto; }
      .ps-knob i { position: absolute; top: 2.5px; left: 2.5px; width: 14px; height: 14px; border-radius: 50%;
                   background: var(--ps-muted); display: block; transition: left .18s, background .18s; }
      .ps-knob.on { background: rgba(77,208,225,.4); }
      .ps-knob.on i { left: 17.5px; background: var(--ps-cool); }
      .ps-btns { display: flex; gap: 6px; flex-wrap: wrap; }
      .ps-btn { padding: 8px 13px; border-radius: 12px; background: var(--ps-fill); font-size: 11.5px; font-weight: 650; }
      .ps-btn:active { background: rgba(255,255,255,.1); }

      /* schedule */
      .ps-sched { display: flex; flex-direction: column; gap: 8px; }
      .ps-schedh { display: flex; align-items: center; gap: 8px; }
      .ps-schedh .ps-lbl { flex: 1; }
      .ps-schednow { font-size: 11.5px; color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .ps-schednow b { color: var(--ps-text); font-weight: 660; }
      .ps-timeline { position: relative; height: 28px; border-radius: 9px; background: var(--ps-fill); overflow: hidden; }
      .ps-seg { position: absolute; top: 3px; bottom: 3px; border-radius: 6px;
                background: rgba(77,208,225,.22); border: 1px solid rgba(77,208,225,.4);
                font-size: 9.5px; font-weight: 650; color: var(--ps-text);
                display: flex; align-items: center; justify-content: center;
                font-variant-numeric: tabular-nums; overflow: hidden; }
      .ps-seg.live { background: rgba(77,208,225,.4); border-color: var(--ps-cool); }
      .ps-nowline { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ps-warn); }
      .ps-tscale { display: flex; justify-content: space-between; font-size: 9px; color: var(--ps-dim);
                   font-variant-numeric: tabular-nums; }
      .ps-srs { display: flex; flex-direction: column; gap: 4px; }
      .ps-sr { display: flex; align-items: center; gap: 9px; background: var(--ps-fill); border-radius: 10px;
               padding: 7px 10px; font-size: 11.5px; font-variant-numeric: tabular-nums; }
      .ps-sr.live { background: rgba(77,208,225,.13); }
      .ps-srt { font-weight: 650; flex: 0 0 74px; }
      .ps-srv { flex: 1; color: var(--ps-muted); }
      .ps-srv i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin: 0 4px 0 0; }
      .ps-srv i.h { background: var(--ps-heat); }
      .ps-srv i.c { background: var(--ps-cool); margin-left: 10px; }

      /* alert sheet */
      .ps-scrim { position: fixed; inset: 0; background: rgba(4,6,10,.6); z-index: 8; backdrop-filter: blur(2px); }
      .ps-sheet {
        position: fixed; left: 12px; right: 12px; bottom: 96px; z-index: 9;
        background: rgba(20,23,32,.96); border: 1px solid rgba(255,255,255,.1); border-radius: 20px;
        padding: 13px 15px; box-shadow: 0 24px 60px rgba(0,0,0,.6);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        max-height: 60vh; overflow-y: auto;
      }
      .ps-sheeth { display: flex; align-items: center; margin-bottom: 6px; }
      .ps-sheeth .ps-lbl { flex: 1; }
      .ps-x { width: 26px; height: 26px; border-radius: 50%; background: rgba(255,255,255,.08);
              display: grid; place-items: center; color: var(--ps-muted); }
      .ps-x .ps-ico { width: 14px; height: 14px; }
      .ps-ar { display: flex; align-items: center; gap: 9px; padding: 8px 0;
               border-top: 1px solid var(--ps-hair-soft); cursor: pointer; }
      .ps-ar:first-of-type { border-top: 0; }
      .ps-at { display: block; font-size: 12.5px; font-weight: 650; }
      .ps-ad { display: block; font-size: 11px; color: var(--ps-muted); }

      /* fade + dock */
      .ps-fade { position: fixed; left: 0; right: 0; bottom: 0; height: 150px; pointer-events: none; z-index: 5;
                 background: linear-gradient(180deg, transparent, rgba(6,7,14,.72) 46%, rgba(6,7,14,.94)); }
      .ps-dockwrap { position: fixed; left: 12px; right: 12px; z-index: 7;
                     bottom: calc(12px + env(safe-area-inset-bottom, 0px));
                     display: flex; flex-direction: column; gap: 9px; }
      .ps-mini { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 20px;
                 background: rgba(255,255,255,.075); border: 1px solid rgba(255,255,255,.1);
                 backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3);
                 box-shadow: 0 12px 30px -8px rgba(0,0,0,.6); }
      .ps-mart { width: 32px; height: 32px; border-radius: 10px; background: rgba(255,255,255,.09);
                 display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden; }
      .ps-mart .ps-ico { width: 15px; height: 15px; }
      .ps-mt { font-size: 11.5px; font-weight: 650; line-height: 1.2; }
      .ps-ms { font-size: 9.5px; color: var(--ps-dim); }
      .ps-mb { width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,.1);
               display: grid; place-items: center; flex: 0 0 auto; }
      .ps-mb .ps-ico { width: 15px; height: 15px; }
      .ps-dock { display: flex; align-items: center; justify-content: space-between; gap: 2px;
                 padding: 9px 10px; border-radius: 24px;
                 background: rgba(255,255,255,.075); border: 1px solid rgba(255,255,255,.1);
                 backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3);
                 box-shadow: 0 16px 40px -10px rgba(0,0,0,.65); }
      .ps-db { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
               padding: 5px 0; border-radius: 16px; color: var(--ps-dim); }
      .ps-db ha-icon { --mdc-icon-size: 20px; }
      .ps-db span { font-size: 8.5px; letter-spacing: .03em; font-weight: 650; }
      .ps-db.on { color: var(--ps-cool); background: rgba(77,208,225,.13); }
      .ps-db.alert { color: var(--ps-bad); }

      @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
    `;
  }
}
