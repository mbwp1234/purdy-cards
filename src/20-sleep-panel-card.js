const SPC_VERSION = "1.2.0";

const SPC_DEFAULTS = {
  name: "Sleep",
  ring: { max_hours: 12 },
  hypnogram: {
    max_hours: 14,
    session_gap_minutes: 90,
    bars: 150,
    levels: { awake: "high", light_sleep: "mid", deep_sleep: "low" },
    colors: { awake: "#FFA74E", light_sleep: "#50A0FF", deep_sleep: "#AA78FF" },
  },
  history_refresh_minutes: 5,
};

// Sleep states we chart. Everything else (unknown, unavailable) is a gap.
const SPC_TRACKED = ["awake", "light_sleep", "deep_sleep"];

// Of those, the ones that mean a session is running. `awake` is charted inside
// a session but never opens one or holds one open, so the wake-up that ended
// last night does not keep it alive into tonight.
const SPC_SLEEPING = ["light_sleep", "deep_sleep"];

class SleepPanelCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._watched = [];
    this._lastStates = null;
    this._history = {}; // entity_id -> [{t, v}]
    this._historyTimer = null;
    this._renderQueued = false;
    this._rendered = false;
  }

  /* ---------------- config ---------------- */

  setConfig(config) {
    if (!config || !config.sleep_state) {
      throw new Error("sleep-panel-card: 'sleep_state' (a sleep-state sensor) is required");
    }
    const hyp = { ...SPC_DEFAULTS.hypnogram, ...(config.hypnogram || {}) };
    hyp.levels = { ...SPC_DEFAULTS.hypnogram.levels, ...((config.hypnogram || {}).levels || {}) };
    hyp.colors = { ...SPC_DEFAULTS.hypnogram.colors, ...((config.hypnogram || {}).colors || {}) };

    this._config = {
      ...SPC_DEFAULTS,
      ...config,
      ring: { ...SPC_DEFAULTS.ring, ...(config.ring || {}) },
      hypnogram: hyp,
    };
    this._watched = this._collectWatched();
    this._rendered = false;
    this._lastStates = null;
  }

  static getStubConfig(hass) {
    const s = Object.keys(hass.states).find((e) => /sleep_state$/.test(e));
    return { sleep_state: s || "sensor.sleep_state" };
  }

  getCardSize() {
    return this._config && this._config.ribbon ? 3 : 7;
  }

  _collectWatched() {
    const c = this._config;
    const ids = new Set([c.sleep_state]);
    const add = (v) => v && typeof v === "string" && v.includes(".") && ids.add(v);
    add(c.person);
    add(c.age);
    if (c.active_when) add(c.active_when.entity);
    if (c.ring) {
      add(c.ring.deep); add(c.ring.light);
      add(c.ring.deep_last_night); add(c.ring.light_last_night);
      if (c.ring.goal) { add(c.ring.goal.deep); add(c.ring.goal.light); }
    }
    (c.vitals || []).forEach((v) => { add(v.entity); add(v.last_night); add(v.baseline); });
    if (c.wakeups) { add(c.wakeups.live); add(c.wakeups.last_night); add(c.wakeups.baseline); }
    if (c.bedtime) { add(c.bedtime.entity); add(c.bedtime.baseline); add(c.bedtime.datetime); }
    if (c.hypnogram) add(c.hypnogram.start_entity);
    if (c.session) { add(c.session.start); add(c.session.end); }
    if (c.room) { add(c.room.temp); add(c.room.humidity); add(c.room.overnight_avg); }
    (c.chips || []).forEach((ch) => {
      add(ch.entity); add(ch.timer); add(ch.since);
      if (ch.visible) add(ch.visible.entity);
    });
    return [...ids];
  }

  /* ---------------- hass updates ---------------- */

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    if (!this._historyTimer) this._startHistory();

    /* Connection state first — see the same note on ClimatePanelCard. */
    const off = pcOffline(hass);
    const snapshot = (off ? "off|" : "on|") + this._watched
      .map((id) => {
        const s = hass.states[id];
        return s ? `${id}:${s.state}` : `${id}:missing`;
      })
      .join("|");

    if (snapshot !== this._lastStates) {
      this._lastStates = snapshot;
      if (this.classList && this.classList.toggle) this.classList.toggle("pc-stale", off);
      this._scheduleRender();
    }
  }

  _scheduleRender() {
    if (this._renderQueued) return;
    this._renderQueued = true;
    requestAnimationFrame(() => {
      this._renderQueued = false;
      this._render();
    });
  }

  connectedCallback() {
    if (this._config && this._hass) this._startHistory();
  }

  disconnectedCallback() {
    clearInterval(this._historyTimer);
    this._historyTimer = null;
  }

  /* ---------------- data helpers ---------------- */

  _st(id) {
    return id && this._hass ? this._hass.states[id] : undefined;
  }

  _num(id, attr) {
    return pcNumOf(this._st(id), attr);
  }

  _esc(s) {
    return pcEsc(s);
  }

  _visible(cond) {
    if (!cond) return true;
    if (Array.isArray(cond)) return cond.every((c) => this._visible(c));
    const s = this._st(cond.entity);
    if (!s) return false;
    if (cond.state !== undefined) return s.state === cond.state;
    if (cond.state_not !== undefined) return s.state !== cond.state_not;
    const n = parseFloat(s.state);
    if (!Number.isFinite(n)) return false;
    if (cond.above !== undefined && !(n > cond.above)) return false;
    if (cond.below !== undefined && !(n < cond.below)) return false;
    return true;
  }

  // "light sleep", "Light_Sleep" -> "light_sleep"
  _norm(v) {
    return String(v ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  /** Actually asleep — `awake` is charted but does not delimit a session. */
  _isSleepingState(v) {
    return SPC_SLEEPING.includes(this._norm(v));
  }

  _isAsleepState(v) {
    return SPC_TRACKED.includes(this._norm(v));
  }

  /** Night while the sock reports, Recap once it is off. */
  _mode() {
    const c = this._config;
    if (c.active_when && c.active_when.entity) {
      const s = this._st(c.active_when.entity);
      if (!s) return "recap";
      const want = c.active_when.state !== undefined ? c.active_when.state : "on";
      return s.state === want ? "night" : "recap";
    }
    const s = this._st(c.sleep_state);
    return s && this._isAsleepState(s.state) ? "night" : "recap";
  }

  /* ---------------- formatting ---------------- */

  _hm(hours) {
    if (hours === null || hours === undefined || !Number.isFinite(hours)) return "—";
    const total = Math.round(hours * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  }

  _clock(date) {
    if (!date) return "—";
    let h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, "0");
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ap}`;
  }

  /** How long an entity has held its current state, as "34m" / "2h 05m". */
  _elapsed(entityId) {
    const s = this._st(entityId);
    if (!s || !s.last_changed) return null;
    const ms = Date.now() - new Date(s.last_changed).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
  }

  /** minutes past midnight -> "7:21 PM" */
  _clockFromMinutes(mins) {
    if (mins === null || mins === undefined || !Number.isFinite(mins)) return "—";
    const d = new Date();
    d.setHours(Math.floor(mins / 60), Math.round(mins % 60), 0, 0);
    return this._clock(d);
  }

  _signed(n, digits = 1) {
    const r = Number(Math.abs(n).toFixed(digits));
    return `${r}`;
  }

  /**
   * Renders "▲ 2.4 vs 7d" with direction colouring.
   * lower_is_better flips which direction reads as good.
   */
  _deltaHtml(value, baseline, opts = {}) {
    if (value === null || baseline === null) return `<span class="delta d-flat">no baseline</span>`;
    const diff = value - baseline;
    const digits = opts.digits !== undefined ? opts.digits : 1;
    const eps = opts.eps !== undefined ? opts.eps : 0.05;
    if (Math.abs(diff) < eps) {
      return `<span class="delta d-flat">— even vs 7d</span>`;
    }
    const up = diff > 0;
    const good = opts.lower_is_better ? !up : up;
    const cls = opts.neutral ? "d-warn" : good ? "d-good" : "d-warn";
    return `<span class="delta ${cls}">${up ? "▲" : "▼"} ${this._signed(diff, digits)} vs 7d</span>`;
  }

  /* ---------------- history ---------------- */

  _historyEntities() {
    const c = this._config;
    const ids = new Set([c.sleep_state]);
    (c.vitals || []).forEach((v) => v.entity && ids.add(v.entity));
    return [...ids];
  }

  _startHistory() {
    const run = () => this._fetchHistory();
    run();
    clearInterval(this._historyTimer);
    this._historyTimer = setInterval(run, (this._config.history_refresh_minutes || 5) * 60 * 1000);
  }

  async _fetchHistory() {
    if (!this._hass) return;
    const ids = this._historyEntities();
    if (!ids.length) return;
    const hyp = this._config.hypnogram;
    /* A window anchored to "now" slides forward all day, so by the afternoon
       the front of the night has fallen out of it. When a bedtime entity is
       configured, fetch from bedtime instead so the whole session is covered
       however late it is read. */
    let startMs = Date.now() - (hyp.max_hours || 14) * 3600 * 1000;
    const anchorId = hyp.start_entity || (this._config.session || {}).start;
    const anchor = anchorId && this._hass.states[anchorId];
    if (anchor && anchor.state) {
      const t = Date.parse(String(anchor.state).replace(" ", "T"));
      if (!isNaN(t) && t < Date.now()) {
        /* Pad before bedtime so the drop-off is visible, and never reach back
           further than the recorder is likely to hold. */
        startMs = Math.max(t - 30 * 60 * 1000, Date.now() - 48 * 3600 * 1000);
      }
    }
    const start = new Date(startMs).toISOString();
    try {
      const res = await this._hass.callApi(
        "GET",
        /* end_time is not optional — see pcNowIso. This window is a whole
           sleep session, so it routinely exceeds 24h and lost its newest
           hours entirely. */
        `history/period/${start}?filter_entity_id=${ids.join(",")}` +
        `&end_time=${encodeURIComponent(pcNowIso())}&minimal_response&no_attributes`
      );
      const hist = {};
      (res || []).forEach((series) => {
        if (!series || !series.length) return;
        const id = series[0].entity_id;
        if (!id) return;
        hist[id] = series
          .map((e) => ({
            t: new Date(e.last_changed || e.last_updated).getTime(),
            v: e.state,
          }))
          .filter((e) => Number.isFinite(e.t))
          .sort((a, b) => a.t - b.t);
      });
      this._history = hist;
      this._scheduleRender();
    } catch (err) {
      // Recorder may be unavailable; the card degrades to "—" rather than breaking.
      console.warn("sleep-panel-card: history fetch failed", err);
    }
  }

  /**
   * The span worth charting: the *most recent* sleep session, so Night shows
   * tonight and Recap shows last night, without needing a configured window.
   *
   * The history window deliberately reaches back far enough to still hold the
   * tail of the previous night once a new one starts, so first-asleep to
   * last-asleep would glue two nights together with a dead gap between them.
   * Walk back from the last sleep reading instead and stop at the first break
   * longer than `session_gap_minutes` — sock-off (`unavailable`), `unknown`
   * and long awake stretches end a session, while the brief awake blips
   * inside a night do not.
   */
  _sleepSpan() {
    const events = this._history[this._config.sleep_state] || [];
    if (!events.length) return null;

    const asleep = [];
    events.forEach((e, i) => {
      if (this._isSleepingState(e.v)) asleep.push(i);
    });
    if (!asleep.length) return null;

    const gapMs = (this._config.hypnogram.session_gap_minutes || 90) * 60000;
    const last = asleep[asleep.length - 1];
    let first = last;
    for (let k = asleep.length - 1; k > 0; k--) {
      const cur = asleep[k];
      const prev = asleep[k - 1];
      // `prev`'s sleep state ended when the next event replaced it.
      const prevEnd = events[prev + 1] ? events[prev + 1].t : events[prev].t;
      if (events[cur].t - prevEnd > gapMs) break;
      first = prev;
    }

    const t0 = events[first].t;
    // The session ends where the sensor stopped reporting a sleep state,
    // or at "now" if it still is.
    const t1 = last + 1 < events.length ? events[last + 1].t : Date.now();
    if (t1 <= t0) return null;
    return { t0, t1, events };
  }

  /** State in effect at time t (last event at or before t). */
  _stateAt(events, t) {
    let lo = 0;
    let hi = events.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].t <= t) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return idx === -1 ? null : events[idx].v;
  }

  /* ---------------- sections ---------------- */

  /* The recorded session, read straight from the bedtime/wake helpers.
     Deriving the header range from fetched history is fragile: the window is
     anchored to now, so by the afternoon its own left edge gets reported as
     the bedtime. These helpers are written once per night and never drift. */
  _sessionRange() {
    const sess = this._config.session;
    if (!sess) return null;
    const at = (id) => {
      const st = this._st(id);
      if (!st || !st.state) return null;
      const t = Date.parse(String(st.state).replace(" ", "T"));
      return Number.isFinite(t) ? t : null;
    };
    const t0 = at(sess.start);
    if (!t0) return null;
    return { t0, t1: at(sess.end) || Date.now() };
  }

  /* The configured person's own photo when there is one, falling back to the
     generic silhouette. */
  _avatarInner() {
    const st = this._config.person ? this._st(this._config.person) : null;
    const pic = st && st.attributes && st.attributes.entity_picture;
    if (pic) return `<img src="${this._esc(pic)}" alt="" />`;
    return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 10c4.4 0 8 2.2 8 5v3H4v-3c0-2.8 3.6-5 8-5Z"/></svg>`;
  }

  _headerHtml(mode) {
    const c = this._config;
    const stateRaw = (this._st(c.sleep_state) || {}).state;
    const state = this._norm(stateRaw);
    const label = {
      deep_sleep: "Deep sleep",
      light_sleep: "Light sleep",
      awake: "Awake",
    }[state];

    const pillCls = mode === "recap" ? "pill-off" : `pill-${state}`;
    const pillText = mode === "recap" ? "Sock off" : label || "No reading";

    const age = c.age ? (this._st(c.age) || {}).state : null;
    const span = this._sessionRange() || this._sleepSpan();
    let sub = age ? this._esc(age) : "";
    if (span) {
      const t0 = this._clock(new Date(span.t0));
      const when = mode === "night" ? `asleep since ${t0}` : `${t0} → ${this._clock(new Date(span.t1))}`;
      sub = sub ? `${sub} · ${when}` : when;
    }

    return `
      <div class="head">
        <div class="avatar ${mode === "recap" ? "avatar-off" : ""}" aria-hidden="true">
          ${this._avatarInner()}
        </div>
        <div class="id">
          <span class="nm">${this._esc(c.name)}</span>
          ${sub ? `<span class="sub">${sub}</span>` : ""}
        </div>
        <span class="pill ${pillCls}" data-tap="more-info" data-entity="${this._esc(c.sleep_state)}">
          <i class="dot"></i>${this._esc(pillText)}
        </span>
      </div>`;
  }

  _ringHtml(mode) {
    const c = this._config;
    const r = c.ring || {};
    const night = mode === "night";
    const deep = night ? this._num(r.deep) : this._num(r.deep_last_night);
    const light = night ? this._num(r.light) : this._num(r.light_last_night);

    if (deep === null && light === null) return "";

    const d = deep || 0;
    const l = light || 0;
    const total = d + l;
    const max = r.max_hours || 12;

    const goalDeep = r.goal ? this._num(r.goal.deep) : null;
    const goalLight = r.goal ? this._num(r.goal.light) : null;
    const goal = goalDeep !== null || goalLight !== null ? (goalDeep || 0) + (goalLight || 0) : null;

    const R = 92;
    const ARC = pcRingArc(R);
    const clamp = (v) => Math.max(0, Math.min(1, v / max));
    const dLen = ARC * clamp(d);
    const lLen = ARC * clamp(Math.min(l, Math.max(0, max - d)));

    let marker = "";
    if (goal !== null && goal > 0 && goal < max) {
      const frac = goal / max;
      /* This ring draws its tick from trig endpoints rather than a rotate, so
         it shares the angle but not the upright quarter-turn. */
      const ang = (pcRingAngle(frac) * Math.PI) / 180;
      const x1 = 120 + 80 * Math.cos(ang);
      const y1 = 120 + 80 * Math.sin(ang);
      const x2 = 120 + 104 * Math.cos(ang);
      const y2 = 120 + 104 * Math.sin(ang);
      marker = `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
                      class="goal-tick" stroke-width="2.5" stroke-linecap="round"/>`;
    }

    let caption = goal !== null && goal > 0 ? `of ${this._hm(goal)} typical` : "total sleep";
    let capCls = "";
    if (!night && goal !== null && goal > 0) {
      const diffMin = Math.round((total - goal) * 60);
      if (Math.abs(diffMin) >= 5) {
        caption = `${this._hm(Math.abs(total - goal))} ${diffMin > 0 ? "above" : "below"} typical`;
        capCls = diffMin > 0 ? "cap-good" : "cap-warn";
      }
    }

    const colors = c.hypnogram.colors;
    const legend = `
      <div class="legend">
        ${deep !== null ? `<span><i style="background:${this._esc(colors.deep_sleep)}"></i>Deep ${this._hm(d)}</span>` : ""}
        ${light !== null ? `<span><i style="background:${this._esc(colors.light_sleep)}"></i>Light ${this._hm(l)}</span>` : ""}
        ${goal !== null && goal > 0 ? `<span><i class="i-goal"></i>7-day avg</span>` : ""}
      </div>`;

    return `
      <div class="ring-wrap" data-tap="more-info" data-entity="${this._esc(r.deep || c.sleep_state)}">
        <svg viewBox="0 0 240 240" role="img" aria-label="Total sleep ${this._hm(total)}: ${this._hm(l)} light, ${this._hm(d)} deep.">
          <circle cx="120" cy="120" r="${R}" fill="none" class="track" stroke-width="15"
                  stroke-linecap="round" stroke-dasharray="${ARC.toFixed(1)} 999" transform="rotate(135 120 120)"/>
          <circle cx="120" cy="120" r="${R}" fill="none" stroke="${this._esc(colors.light_sleep)}" stroke-width="15"
                  stroke-linecap="${d > 0 ? "butt" : "round"}" stroke-dasharray="${lLen.toFixed(1)} 999"
                  stroke-dashoffset="${(-dLen).toFixed(1)}" transform="rotate(135 120 120)"/>
          <circle cx="120" cy="120" r="${R}" fill="none" stroke="${this._esc(colors.deep_sleep)}" stroke-width="15"
                  stroke-linecap="round" stroke-dasharray="${dLen.toFixed(1)} 999" transform="rotate(135 120 120)"/>
          ${marker}
        </svg>
        <div class="ring-center">
          <span class="ring-val">${this._hm(total)}</span>
          <span class="ring-cap ${capCls}">${this._esc(caption)}</span>
        </div>
      </div>
      ${legend}`;
  }

  /**
   * Live vitals, Night only. In Recap the same figures appear as rows
   * (_rowsHtml) with their last-night averages, so rendering both would
   * duplicate them.
   */
  _vitalsHtml(mode) {
    if (mode !== "night") return "";
    const vitals = this._config.vitals || [];
    if (!vitals.length) return "";

    const cells = vitals.map((v) => {
      const value = this._num(v.entity);
      const baseline = this._num(v.baseline);
      const digits = v.digits !== undefined ? v.digits : 1;
      const shown = value === null ? "—" : `${Number(value.toFixed(digits))}`;
      const spark = v.entity ? this._sparkSvg(v.entity, v.color || "var(--spc-deep)") : "";
      return `
        <div class="vital" data-tap="more-info" data-entity="${this._esc(v.entity)}">
          <span class="v-lab">${this._esc(v.label || "")}</span>
          <span class="v-val">${shown}${v.unit ? `<small>${this._esc(v.unit)}</small>` : ""}</span>
          ${this._deltaHtml(value, baseline, { lower_is_better: v.lower_is_better, digits })}
          ${spark}
        </div>`;
    });

    return `<div class="vitals">${cells.join("")}</div>`;
  }

  _sparkSvg(entityId, color) {
    const pts = (this._history[entityId] || [])
      .map((e) => parseFloat(e.v))
      .filter((n) => Number.isFinite(n));
    if (pts.length < 3) return "";
    const data = pts.slice(-40);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const coords = data.map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 18 - ((v - min) / span) * 15 + 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = coords.join(" ");
    const last = coords[coords.length - 1].split(",");
    return `
      <svg class="spark" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="0,20 ${line} 100,20" fill="${this._esc(color)}" opacity="0.16"></polygon>
        <polyline points="${line}" fill="none" stroke="${this._esc(color)}" stroke-width="1.4"
                  stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline>
        <circle cx="${last[0]}" cy="${last[1]}" r="1.6" fill="${this._esc(color)}"></circle>
      </svg>`;
  }

  _hypnogramHtml(mode) {
    const c = this._config;
    const h = c.hypnogram;
    const span = this._sleepSpan();
    const title = mode === "night" ? "Tonight" : "Last night";

    const wake = c.wakeups || {};
    const wakeVal = mode === "night" ? this._num(wake.live) : this._num(wake.last_night);
    const wakeText = wakeVal === null ? "" : `${wakeVal} wakeup${wakeVal === 1 ? "" : "s"}`;

    if (!span) {
      this._hypMeta = null;
      return `
        <div class="hyp">
          <div class="hyp-head"><span>${title}</span><em>${this._esc(wakeText)}</em></div>
          <div class="hyp-empty">No sleep recorded in the last ${h.max_hours}h</div>
        </div>`;
    }
    this._hypMeta = span;

    const bars = Math.max(20, Math.min(h.bars || 150, 300));
    const step = (span.t1 - span.t0) / bars;
    // Two-decker geometry: awake rides high, light mid, deep low.
    const geom = { high: [4, 20], mid: [22, 22], low: [40, 20] };
    const bw = 300 / bars;

    let rects = "";
    for (let i = 0; i < bars; i++) {
      const t = span.t0 + step * (i + 0.5);
      const state = this._norm(this._stateAt(span.events, t));
      if (!SPC_TRACKED.includes(state)) continue;
      const level = h.levels[state] || "mid";
      const g = geom[level] || geom.mid;
      const color = h.colors[state] || "#50A0FF";
      const x = i * bw + bw * 0.14;
      rects += `<rect x="${x.toFixed(2)}" y="${g[0]}" width="${Math.max(bw * 0.72, 0.6).toFixed(2)}"
                      height="${g[1]}" rx="${Math.min(bw * 0.3, 1.2).toFixed(2)}" fill="${color}"
                      opacity="${state === "awake" ? "0.95" : "0.82"}"></rect>`;
    }

    const t0 = new Date(span.t0);
    const t1 = new Date(span.t1);
    const mid = new Date(span.t0 + (span.t1 - span.t0) / 2);
    const endLabel = mode === "night" ? "now" : this._clock(t1);

    return `
      <div class="hyp">
        <div class="hyp-head"><span>${title}</span><em data-hyp-read>${this._esc(wakeText)}</em></div>
        <div class="hyp-plot-wrap">
          <svg class="hyp-plot" viewBox="0 0 300 62" preserveAspectRatio="none" role="img"
               aria-label="Hypnogram from ${this._clock(t0)} to ${endLabel}">${rects}</svg>
          <div class="hx" hidden></div>
          <div class="htip" hidden></div>
        </div>
        <div class="hyp-axis">
          <span>${this._clock(t0)}</span><span>${this._clock(mid)}</span><span>${this._esc(endLabel)}</span>
        </div>
      </div>`;
  }

  _stateLabel(state) {
    return {
      deep_sleep: "Deep sleep",
      light_sleep: "Light sleep",
      awake: "Awake",
    }[this._norm(state)] || "No reading";
  }

  /**
   * Scrub the hypnogram to read the time of day (and the state) at any point.
   * Mirrors the trend-graph hover in climate-panel-card: crosshair + tooltip,
   * driven by pointer events so touch-drag works as well as mouse hover.
   */
  _bindHypHover() {
    const wrap = this.shadowRoot.querySelector(".hyp-plot-wrap");
    if (!wrap || !this._hypMeta) return;
    const cross = wrap.querySelector(".hx");
    const tip = wrap.querySelector(".htip");
    const readout = this.shadowRoot.querySelector("[data-hyp-read]");
    const restore = readout ? readout.textContent : "";

    const show = (clientX) => {
      const m = this._hypMeta;
      const rect = wrap.getBoundingClientRect();
      if (!rect.width) return;
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const t = m.t0 + frac * (m.t1 - m.t0);
      const state = this._stateAt(m.events, t);
      const timeStr = this._clock(new Date(t));
      const label = this._stateLabel(state);
      const color = this._config.hypnogram.colors[this._norm(state)] || "var(--spc-muted)";

      cross.hidden = false;
      cross.style.left = `${(frac * 100).toFixed(2)}%`;

      tip.hidden = false;
      tip.innerHTML = `<b>${this._esc(timeStr)}</b><span><i style="background:${this._esc(color)}"></i>${this._esc(label)}</span>`;
      const onLeft = frac > 0.55;
      tip.style.left = onLeft ? "" : `calc(${(frac * 100).toFixed(2)}% + 10px)`;
      tip.style.right = onLeft ? `calc(${((1 - frac) * 100).toFixed(2)}% + 10px)` : "";

      if (readout) readout.textContent = `${timeStr} · ${label}`;
    };

    const hide = () => {
      cross.hidden = true;
      tip.hidden = true;
      if (readout) readout.textContent = restore;
    };

    wrap.addEventListener("pointermove", (e) => show(e.clientX));
    wrap.addEventListener("pointerdown", (e) => show(e.clientX));
    wrap.addEventListener("pointerleave", hide);
    wrap.addEventListener("pointercancel", hide);
  }

  _rowsHtml(mode) {
    if (mode !== "recap") return "";
    const c = this._config;
    const rows = [];

    (c.vitals || []).forEach((v) => {
      const value = this._num(v.last_night);
      if (value === null) return;
      const baseline = this._num(v.baseline);
      const digits = v.digits !== undefined ? v.digits : 1;
      rows.push(`
        <div class="row" data-tap="more-info" data-entity="${this._esc(v.last_night)}">
          <span class="r-lab">Avg ${this._esc((v.label || "").toLowerCase())}</span>
          <span class="r-val">${Number(value.toFixed(digits))}${v.unit ? ` ${this._esc(v.unit)}` : ""}</span>
          <span class="r-cmp">${this._deltaHtml(value, baseline, { lower_is_better: v.lower_is_better, digits })}</span>
        </div>`);
    });

    if (c.bedtime) {
      const mins = this._num(c.bedtime.entity);
      const base = this._num(c.bedtime.baseline);
      if (mins !== null) {
        let cmp = "";
        if (base !== null) {
          const diff = Math.round(mins - base);
          cmp = Math.abs(diff) < 10
            ? `<span class="delta d-flat">about usual</span>`
            : `<span class="delta ${diff > 0 ? "d-warn" : "d-good"}">${Math.abs(diff)}m ${diff > 0 ? "later" : "earlier"} than usual</span>`;
        }
        rows.push(`
          <div class="row" data-tap="more-info" data-entity="${this._esc(c.bedtime.entity)}">
            <span class="r-lab">Bedtime</span>
            <span class="r-val">${this._clockFromMinutes(mins)}</span>
            <span class="r-cmp">${cmp}</span>
          </div>`);
      }
    }

    if (c.room && c.room.overnight_avg) {
      const t = this._num(c.room.overnight_avg);
      if (t !== null) {
        rows.push(`
          <div class="row" data-tap="more-info" data-entity="${this._esc(c.room.overnight_avg)}">
            <span class="r-lab">Room while asleep</span>
            <span class="r-val">${Number(t.toFixed(1))}°</span>
            <span class="r-cmp"><span class="delta d-flat">avg overnight</span></span>
          </div>`);
      }
    }

    if (!rows.length) return "";
    return `<div class="divider"></div><div class="rows">${rows.join("")}</div>`;
  }

  _chipsHtml(mode) {
    const c = this._config;
    const chips = [];

    // Wakeups vs the 7-day average — only meaningful once the night is done.
    const wake = c.wakeups || {};
    if (mode === "recap") {
      const val = this._num(wake.last_night);
      const base = this._num(wake.baseline);
      if (val !== null && base !== null) {
        const better = val <= base;
        chips.push(`<span class="chip ${better ? "chip-good" : "chip-warn"}">${val} wakeup${val === 1 ? "" : "s"} · ${better ? "better than" : "above"} ${Number(base.toFixed(1))} avg</span>`);
      }
    }

    // Live room readout while the night is running.
    if (mode === "night" && c.room && c.room.temp) {
      const t = this._num(c.room.temp);
      const hum = this._num(c.room.humidity);
      if (t !== null) {
        chips.push(`<span class="chip" data-tap="more-info" data-entity="${this._esc(c.room.temp)}">Room ${Number(t.toFixed(1))}°${hum !== null ? ` · ${Math.round(hum)}%` : ""}</span>`);
      }
    }

    (c.chips || []).forEach((ch, i) => {
      if (ch.visible && !this._visible(ch.visible)) return;
      if (ch.timer) {
        const s = this._st(ch.timer);
        if (!s || s.state !== "active") return;
        chips.push(`<span class="chip chip-${this._esc(ch.style || "default")}" data-chip-idx="${i}">${this._esc(ch.name || "Timer")}</span>`);
        return;
      }
      // `since:` renders how long that entity has held its current state,
      // e.g. "Settled 34m" from the sleep-state sensor's last_changed.
      if (ch.since) {
        const elapsed = this._elapsed(ch.since);
        if (elapsed === null) return;
        chips.push(`<span class="chip chip-${this._esc(ch.style || "default")}" data-chip-idx="${i}">${this._esc(`${ch.name || ""} ${elapsed}`.trim())}</span>`);
        return;
      }
      const s = ch.entity ? this._st(ch.entity) : null;
      const text = ch.show_state && s ? `${ch.name || ""} ${s.state}`.trim() : ch.name || (s ? s.state : "");
      if (!text) return;
      chips.push(`<span class="chip chip-${this._esc(ch.style || "default")}" data-chip-idx="${i}">${this._esc(text)}</span>`);
    });

    if (!chips.length) return "";
    return `<div class="chips">${chips.join("")}</div>`;
  }

  /* ---------------- render ---------------- */

  _render() {
    if (!this._hass || !this._config) return;
    const mode = this._mode();
    if (this._config.ribbon) return this._renderRibbon(mode);
    this.shadowRoot.innerHTML = `
      <style>${SleepPanelCard.styles}</style>
      <ha-card>
        <div class="panel mode-${mode}">
          ${this._headerHtml(mode)}
          ${this._ringHtml(mode)}
          ${this._vitalsHtml(mode)}
          ${this._hypnogramHtml(mode)}
          ${this._rowsHtml(mode)}
          ${this._chipsHtml(mode)}
        </div>
      </ha-card>
    `;
    this._bind();
    this._bindHypHover();
    this._rendered = true;
  }

  /* Ribbon mode: header, vitals and a flattened deep/light bar. The ring,
     hypnogram and recap rows stay behind the popup. */
  _renderRibbon(mode) {
    const c = this._config;
    this.shadowRoot.innerHTML = `
      <style>${SleepPanelCard.styles}</style>
      <ha-card>
        <div class="panel ribbon mode-${mode}${c.navigate ? " tappable" : ""}">
          ${this._headerHtml(mode)}
          ${this._vitalsHtml(mode)}
          ${this._splitBarHtml(mode)}
        </div>
      </ha-card>
    `;
    this._bind();
    if (c.navigate) {
      const panel = this.shadowRoot.querySelector(".panel");
      panel.addEventListener("click", (e) => {
        if (e.target.closest("[data-tap], [data-chip-idx]")) return;
        pcNavigate(this, c.navigate);
      });
    }
    this._rendered = true;
  }

  /* The ring's deep/light split, flattened so it survives at ribbon height. */
  _splitBarHtml(mode) {
    const r = this._config.ring || {};
    const night = mode === "night";
    const deep = night ? this._num(r.deep) : this._num(r.deep_last_night);
    const light = night ? this._num(r.light) : this._num(r.light_last_night);
    const d = deep || 0;
    const l = light || 0;
    const tot = d + l;
    if (tot <= 0) return "";
    const dp = (d / tot) * 100;
    const fmt = (h) => {
      const m = Math.round(h * 60);
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      return hh ? `${hh}h ${mm}m` : `${mm}m`;
    };
    return `
      <div class="splitbar">
        <div class="sb-track" role="img" aria-label="Deep ${fmt(d)}, light ${fmt(l)}">
          <i class="sb-deep" style="width:${dp.toFixed(1)}%"></i>
          <i class="sb-light" style="width:${(100 - dp).toFixed(1)}%"></i>
        </div>
        <div class="sb-legend"><span>Deep ${fmt(d)}</span><span>Light ${fmt(l)}</span></div>
      </div>
    `;
  }

  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-tap='more-info']").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._moreInfo(el.dataset.entity);
      });
    });
    root.querySelectorAll("[data-chip-idx]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const chip = (this._config.chips || [])[parseInt(el.dataset.chipIdx, 10)];
        if (chip && (chip.entity || chip.timer)) this._moreInfo(chip.entity || chip.timer);
      });
    });
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  /* ---------------- styles ---------------- */

  static get styles() {
    return `
      :host {
        ${PC_TOKENS}
        --spc-panel: var(--pc-panel);
        --spc-panel-2: var(--pc-panel-2);
        --spc-line: var(--pc-line);
        --spc-track: var(--pc-track);
        --spc-chip: var(--pc-chip);
        --spc-text: var(--pc-text);
        --spc-muted: var(--pc-muted);
        --spc-deep: var(--spc-deep-override, #AA78FF);
        --spc-light: var(--spc-light-override, #50A0FF);
        --spc-awake: var(--spc-awake-override, #FFA74E);
        --spc-good: var(--spc-good-override, var(--pc-good));
        --spc-warn: var(--spc-warn-override, var(--pc-warn));
        --spc-cool: var(--pc-cool);
        --spc-radius: var(--pc-radius);
        display: block;
        font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        color: var(--spc-text);
      }

      /* See the same note on ClimatePanelCard: disconnected, the vitals and the
         composition are last-known-good, and a sleeping baby's numbers are the
         last ones you want to read as live. */
      :host(.pc-stale) { opacity: 0.62; filter: saturate(0.45); }

      ha-card {
        background: var(--spc-panel);
        border-radius: var(--spc-radius);
        overflow: hidden;
      }

      .panel {
        padding: 16px 16px 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      /* header */
      .head { display: flex; align-items: center; gap: 10px; }
      .avatar {
        width: 40px; height: 40px; border-radius: 999px; flex: none;
        display: grid; place-items: center; overflow: hidden;
        background: rgba(170, 120, 255, 0.16); color: var(--spc-deep);
      }
      .avatar-off { background: var(--spc-chip); color: var(--spc-muted); }
      .avatar svg { width: 22px; height: 22px; }
      .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .avatar-off img { filter: grayscale(1); opacity: 0.65; }
      .id { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
      .nm { font-size: 15px; font-weight: 600; letter-spacing: 0.01em; }
      .sub {
        font-size: 11.5px; color: var(--spc-muted);
        font-variant-numeric: tabular-nums;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pill {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 11px; border-radius: 999px;
        font-size: 12px; font-weight: 600; white-space: nowrap; cursor: pointer;
        background: var(--spc-chip); color: var(--spc-muted);
      }
      .pill .dot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
      .pill-deep_sleep  { background: rgba(170, 120, 255, 0.18); color: var(--spc-deep); }
      .pill-light_sleep { background: rgba(80, 160, 255, 0.18); color: var(--spc-light); }
      .pill-awake       { background: rgba(255, 167, 78, 0.18); color: var(--spc-awake); }
      .pill-off         { background: var(--spc-chip); color: var(--spc-muted); }

      /* ring */
      .ring-wrap {
        position: relative; width: 208px; height: 178px;
        margin: 0 auto; cursor: pointer;
      }
      .ring-wrap svg { width: 208px; height: 208px; margin-top: -14px; display: block; }
      .track { stroke: var(--spc-line); }
      .goal-tick { stroke: var(--spc-warn); }
      .ring-center {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 2px;
        padding-bottom: 12px; pointer-events: none;
      }
      .ring-val {
        font-size: 34px; font-weight: 600; letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums; line-height: 1;
      }
      .ring-cap { font-size: 11px; color: var(--spc-muted); font-variant-numeric: tabular-nums; }
      .cap-good { color: var(--spc-good); }
      .cap-warn { color: var(--spc-warn); }
      .legend {
        display: flex; justify-content: center; flex-wrap: wrap; gap: 6px 14px;
        font-size: 11px; color: var(--spc-muted);
        font-variant-numeric: tabular-nums; margin-top: -6px;
      }
      .legend span { display: inline-flex; align-items: center; gap: 5px; }
      .legend i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
      .legend .i-goal { background: var(--spc-warn); }

      /* vitals */
      .vitals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .vital {
        background: var(--spc-chip); border-radius: 14px;
        padding: 10px 10px 8px; min-width: 0; cursor: pointer;
        display: flex; flex-direction: column; gap: 3px;
      }
      .v-lab {
        font-size: 10px; letter-spacing: 0.07em; text-transform: uppercase;
        color: var(--spc-muted);
      }
      .v-val {
        font-size: 19px; font-weight: 600; line-height: 1.15;
        font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
      }
      .v-val small { font-size: 11px; font-weight: 500; color: var(--spc-muted); margin-left: 2px; }
      .delta { font-size: 10.5px; font-variant-numeric: tabular-nums; }
      .d-flat { color: var(--spc-muted); }
      .d-good { color: var(--spc-good); }
      .d-warn { color: var(--spc-warn); }
      .spark { width: 100%; height: 18px; margin-top: 2px; display: block; }

      /* hypnogram */
      .hyp { display: flex; flex-direction: column; gap: 6px; }
      .hyp-head {
        display: flex; align-items: baseline; justify-content: space-between;
        font-size: 10px; letter-spacing: 0.07em; text-transform: uppercase;
        color: var(--spc-muted);
      }
      .hyp-head em {
        font-style: normal; text-transform: none; letter-spacing: 0;
        font-variant-numeric: tabular-nums;
      }
      .hyp-plot-wrap { position: relative; touch-action: pan-y; cursor: crosshair; }
      .hyp-plot { width: 100%; height: 62px; display: block; }
      .hx {
        position: absolute; top: 0; bottom: 0; width: 1px;
        background: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.35);
        pointer-events: none; z-index: 2;
      }
      .htip {
        position: absolute; top: 50%; transform: translateY(-50%);
        background: rgba(10, 14, 18, 0.92); color: var(--spc-text);
        border-radius: 8px; padding: 5px 8px; white-space: nowrap;
        font-size: 11.5px; font-variant-numeric: tabular-nums;
        pointer-events: none; z-index: 3;
        display: flex; flex-direction: column; gap: 2px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      }
      .htip b { font-weight: 600; }
      .htip span { display: inline-flex; align-items: center; gap: 5px; color: var(--spc-muted); }
      .htip i { width: 7px; height: 7px; border-radius: 2px; display: inline-block; }
      .hyp-empty {
        font-size: 12px; color: var(--spc-muted);
        background: var(--spc-chip); border-radius: 12px;
        padding: 14px; text-align: center;
      }
      .hyp-axis {
        display: flex; justify-content: space-between;
        font-size: 9.5px; color: var(--spc-muted); font-variant-numeric: tabular-nums;
      }

      /* recap rows */
      .divider { height: 1px; background: var(--spc-line); }
      .rows { display: flex; flex-direction: column; gap: 6px; }
      .row {
        display: flex; align-items: center; gap: 10px; cursor: pointer;
        background: var(--spc-chip); border-radius: 12px;
        padding: 9px 12px; font-size: 12.5px; font-variant-numeric: tabular-nums;
      }
      .r-lab { color: var(--spc-muted); flex: 1; min-width: 0; }
      .r-val { font-weight: 600; white-space: nowrap; }
      .r-cmp { text-align: right; min-width: 96px; }

      /* chips */
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .chip {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 10px; border-radius: 999px;
        font-size: 11.5px; font-weight: 600;
        background: var(--spc-chip); color: var(--spc-muted);
      }
      .chip-warn { background: rgba(242, 193, 78, 0.13); color: var(--spc-warn); }
      .chip-good { background: rgba(129, 201, 149, 0.13); color: var(--spc-good); }
      .chip-deep { background: rgba(170, 120, 255, 0.15); color: var(--spc-deep); }

      [data-tap]:focus-visible, [data-chip-idx]:focus-visible {
        outline: 2px solid var(--spc-light); outline-offset: 2px;
      }

      @media (max-width: 340px) {
        .vitals { grid-template-columns: repeat(2, 1fr); }
      }

      /* ---- ribbon mode ---- */
      .panel.ribbon { padding: 14px 16px 15px; gap: 11px; }
      .panel.ribbon .ring, .panel.ribbon .hyp, .panel.ribbon .rows { display: none; }
      .panel.tappable { cursor: pointer; }
      .panel.tappable:active { background: var(--spc-panel-2); }
      .splitbar { display: flex; flex-direction: column; gap: 6px; }
      .sb-track {
        display: flex; height: 7px; border-radius: 4px;
        overflow: hidden; background: var(--spc-track);
      }
      .sb-track i { display: block; height: 100%; }
      .sb-deep { background: var(--spc-deep); }
      .sb-light { background: var(--spc-light); }
      .sb-legend {
        display: flex; justify-content: space-between;
        font-size: 11px; color: var(--spc-muted);
        font-variant-numeric: tabular-nums;
      }

      @media (prefers-reduced-motion: reduce) {
        * { transition: none !important; }
      }
    `;
  }
}

