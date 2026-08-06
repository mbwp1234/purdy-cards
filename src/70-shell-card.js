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
  "sleep", "climate", "people", "music", "rooms", "quick", "calendar", "systems", "tv",
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
      this._fetchRecent();
      this._loadPins();
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

    push(c.dismiss_store);
    (c.attention || []).forEach((r) => push(r.entity));
    (c.dock || []).forEach((d) => push(d.entity));
    ((c.now_playing || {}).players || []).forEach((p) => push(p.entity));
    c.sections.forEach((sx) => { if (sx.type === "music" && sx.pins) push(sx.pins.store); });

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
        push((s.schedule || {}).mode_entity);
        push((s.schedule || {}).switch_entity);
      }
      if (s.type === "tv") {
        (s.tvs || []).forEach((t) => { push(t.media_player); push(t.app_sensor); push(t.remote); });
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
  /* Recently listened comes from HA's recorder, not Music Assistant: MA's
     last_played / play_count are empty in this install, so its own
     "recently played" ordering is silently meaningless. Every MA player logs
     media_title, media_artist and a playable media_content_id per state
     change, so read it back from there. Bounded by recorder retention. */
  async _fetchRecent() {
    const sec = (this._config.sections || []).find((x) => x.type === "music");
    if (!sec || !this._hass || !this._hass.callApi) return;
    const ids = (sec.players || []).map((p) => p.entity);
    if (!ids.length) return;
    const start = new Date(Date.now() - (sec.recent_hours || 48) * 3600 * 1000).toISOString();
    try {
      const res = await this._hass.callApi("GET", `history/period/${start}?filter_entity_id=${ids.join(",")}`);
      const rows = [];
      (res || []).forEach((series) => (series || []).forEach((e) => {
        const a = e.attributes || {};
        if (!a.media_title || !a.media_content_id) return;
        if (a.app_id !== "music_assistant" && PS_MUSIC_TYPES.indexOf(a.media_content_type) < 0) return;
        rows.push({
          t: new Date(e.last_changed || e.last_updated).getTime(),
          uri: a.media_content_id,
          name: a.media_title,
          sub: a.media_artist || a.media_album_name || "",
          kind: "track",
        });
      }));
      rows.sort((x, y) => y.t - x.t);
      const seen = {};
      const out = [];
      rows.forEach((r) => {
        if (seen[r.uri] || !Number.isFinite(r.t)) return;
        seen[r.uri] = 1;
        out.push(r);
      });
      this._recent = out.slice(0, sec.recent_max || 8);
      this._last = null;
      this._render();
    } catch (err) {
      /* Recorder may be purged; the list just stays empty. */
    }
  }

  async _runSearch() {
    const sec = (this._config.sections || []).find((x) => x.type === "music");
    const q = (this._query || "").trim();
    const entry = sec && sec.config_entry;
    if (!q || !entry) {
      this._results = q && !entry ? [] : null;
      this._render();
      return;
    }
    this._searching = true;
    this._render();
    try {
      const r = await this._hass.callService(
        "music_assistant", "search",
        { config_entry_id: entry, name: q }, undefined, false, true
      );
      const d = (r && r.response) || {};
      const rows = [];
      const take = (arr, kind, n) => (arr || []).slice(0, n).forEach((x) => rows.push({
        uri: x.uri, name: x.name, kind, image: x.image,
        sub: kind === "track" && x.artists && x.artists.length
          ? x.artists.map((a) => a.name).join(", ") : kind,
      }));
      take(d.tracks, "track", 4);
      take(d.playlists, "playlist", 3);
      take(d.albums, "album", 2);
      take(d.artists, "artist", 2);
      this._results = rows;
    } catch (err) {
      this._results = [];
    }
    this._searching = false;
    this._render();
  }

  _playUri(uri, kind) {
    const targets = this._targets();
    if (!uri || !targets.length) return;
    this._hass.callService("music_assistant", "play_media", {
      entity_id: targets, media_id: uri, media_type: kind || "track", enqueue: "replace",
    });
  }

  /* --- saved playlists ----------------------------------------------------
     A store is either a todo list (unbounded) or an input_text (`uri~name`
     pairs, and that helper caps at 255 characters, so the oldest pins fall
     off rather than the write failing). */
  _pinStore() {
    const sec = (this._config.sections || []).find((x) => x.type === "music");
    return sec && sec.pins && sec.pins.store;
  }

  async _loadPins() {
    const store = this._pinStore();
    if (!store || !this._hass) return;
    if (store.indexOf("todo.") === 0) {
      if (!this._hass.callWS) return;
      try {
        const res = await this._hass.callWS({ type: "todo/item/list", entity_id: store });
        this._pins = ((res && res.items) || [])
          .filter((it) => it.status !== "completed" && it.description)
          .map((it) => ({ name: it.summary, uri: it.description, uid: it.uid }));
      } catch (e) { this._pins = []; }
    } else {
      const raw = pcState(this._hass, store);
      this._pins = (!raw || raw === "unknown" || raw === "unavailable") ? [] :
        raw.split("|").map((pair) => {
          const i = pair.indexOf("~");
          return i < 0 ? null : { uri: pair.slice(0, i), name: pair.slice(i + 1) };
        }).filter(Boolean);
    }
    this._last = null;
    this._render();
  }

  _writePins(list) {
    const store = this._pinStore();
    if (!store) return;
    let pairs = list.map((p) => p.uri + "~" + p.name);
    while (pairs.length && pairs.join("|").length > 255) pairs.shift();
    this._hass.callService("input_text", "set_value", { entity_id: store, value: pairs.join("|") });
  }

  _isPinned(uri) {
    return this._pins.some((p) => p.uri === uri);
  }

  async _togglePin(uri, name, kind) {
    const store = this._pinStore();
    if (!store || !uri) return;
    const existing = this._pins.find((p) => p.uri === uri);
    if (store.indexOf("todo.") === 0) {
      if (existing) {
        await this._hass.callService("todo", "remove_item", { entity_id: store, item: existing.uid });
      } else {
        await this._hass.callService("todo", "add_item", {
          entity_id: store, item: name || "Saved playlist", description: uri,
        });
      }
      this._loadPins();
      return;
    }
    const next = existing
      ? this._pins.filter((p) => p.uri !== uri)
      : this._pins.concat([{ uri, name: (name || "Saved").slice(0, 40) }]);
    this._pins = next;
    this._writePins(next);
    this._last = null;
    this._render();
  }

  /* What is playing right now, as something that can be pinned. MA reports the
     queue item, so prefer the playlist it came from when there is one. */
  _pinnable() {
    const np = this._nowPlaying();
    if (!np) return null;
    const a = np.st.attributes;
    const uri = a.media_playlist_content_id || a.media_content_id;
    if (!uri) return null;
    const name = a.media_playlist || a.media_album_name || a.media_title;
    const kind = a.media_playlist ? "playlist" : (a.media_content_type || "track");
    return { uri, name, kind };
  }

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
  }

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
  }

  _dayName(offset) {
    const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return names[offset == null ? new Date().getDay() : offset];
  }

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
  }

  _scope() {
    return this._schedScope === undefined ? this._detectScope() : this._schedScope;
  }

  /* Presets and per_day mode are seven-day; the base split is two-bucket. */
  _perDay() {
    return !!this._scope() || (this._sched && this._sched.mode === "per_day");
  }

  _schedDayName() {
    if (this._schedDay) return this._schedDay;
    if (this._perDay()) return this._dayName();
    return new Date().getDay() % 6 === 0 ? "weekend" : "weekday";
  }

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
  }

  _schedToday() {
    return this._schedEntries();
  }

  _zoneName(id) {
    if (!id || !this._sched) return null;
    const z = (this._sched.zones || []).find((x) => x.id === id);
    return z ? z.name : null;
  }

  /* GTTC's update_entry / delete_entry write to the ACTIVE preset, so editing
     anything else would silently land in the wrong schedule. Only offer it
     where the write will go where it looks like it goes. */
  _schedEditable(sec) {
    if ((sec.schedule || {}).editable === false) return false;
    return this._scope() === this._activePreset();
  }

  _schedWs(msg) {
    const sec = (this._config.sections || []).find((x) => x.type === "climate" && x.schedule);
    const extra = sec && sec.schedule.entry_id ? { entry_id: sec.schedule.entry_id } : {};
    return this._hass.callWS({ ...msg, ...extra });
  }

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
  }

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
  }

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

  /* --- dismissals ---------------------------------------------------------
     A dismissal is an acknowledgement, not a mute: a row stays hidden only
     while the triggering entity has not changed since, and `dismiss_hours`
     caps how long a stale one can hide. Store format is `key:epoch|key:epoch`
     in an input_text, which caps at 255 characters — so keep rule keys short
     and drop the oldest entries rather than overflowing the write. */
  _dismissals() {
    const raw = pcState(this._hass, this._config.dismiss_store);
    const out = {};
    if (!raw || raw === "unknown" || raw === "unavailable") return out;
    raw.split("|").forEach((pair) => {
      const bits = pair.split(":");
      const at = parseInt(bits[1], 10);
      if (bits[0] && Number.isFinite(at)) out[bits[0]] = at;
    });
    return out;
  }

  _writeDismissals(map) {
    const store = this._config.dismiss_store;
    if (!store) return;
    let pairs = Object.keys(map)
      .map((k) => [k, map[k]])
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0] + ":" + e[1]);
    while (pairs.length && pairs.join("|").length > 255) pairs.pop();
    this._hass.callService("input_text", "set_value", {
      entity_id: store, value: pairs.join("|"),
    });
  }

  _dismiss(row) {
    const map = this._dismissals();
    map[row.key] = Math.floor(Date.now() / 1000);
    this._writeDismissals(map);
    if (this._config.log_to) this._closeLog(row);
    this._last = null;
    this._render();
  }

  async _logItems() {
    if (!this._config.log_to || !this._hass.callWS) return [];
    const res = await this._hass.callWS({ type: "todo/item/list", entity_id: this._config.log_to });
    return (res && res.items) || [];
  }

  /* One open log entry per raised rule. The key lives in the description so
     the entry can be found again without depending on the wording. */
  async _syncLog(rows) {
    if (!this._config.log_to || !rows.length || !this._hass.callWS) return;
    let items;
    try { items = await this._logItems(); } catch (e) { return; }
    for (const row of rows) {
      const tag = "[" + row.key + "]";
      const open = items.find((it) => (it.description || "").indexOf(tag) >= 0 && it.status !== "completed");
      if (open) continue;
      if (this._logged[row.key] === row.firedAt) continue;
      this._logged[row.key] = row.firedAt;
      this._hass.callService("todo", "add_item", {
        entity_id: this._config.log_to,
        item: row.title,
        description: tag + " " + row.severity + " \u00B7 " + (row.detail || "") +
          " \u00B7 raised " + new Date(row.firedAt * 1000).toISOString(),
      });
    }
  }

  async _closeLog(row) {
    if (!this._hass.callWS) return;
    let items;
    try { items = await this._logItems(); } catch (e) { return; }
    const tag = "[" + row.key + "]";
    const open = items.find((it) => (it.description || "").indexOf(tag) >= 0 && it.status !== "completed");
    if (open) {
      this._hass.callService("todo", "update_item", {
        entity_id: this._config.log_to, item: open.uid, status: "completed",
      });
    }
  }

  /* When did this rule's condition last change? A dismissal older than that
     means the fault re-fired, so the row comes back. */
  _firedAt(r) {
    const h = this._hass;
    if (r.entity && h.states[r.entity]) {
      return Math.floor(new Date(h.states[r.entity].last_changed).getTime() / 1000);
    }
    if (r.match) {
      const re = new RegExp(r.match);
      let newest = 0;
      Object.keys(h.states).forEach((id) => {
        if (!re.test(id) || h.states[id].state !== (r.state || "on")) return;
        const t = Math.floor(new Date(h.states[id].last_changed).getTime() / 1000);
        if (t > newest) newest = t;
      });
      return newest;
    }
    return 0;
  }

  /* Everything currently matching, before dismissals are applied. */
  _raised() {
    const rules = this._config.attention || [];
    const hass = this._hass;
    if (!hass) return [];
    const out = [];
    rules.forEach((r, i) => {
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
            key: r.key || "r" + i,
            severity: r.severity || "info",
            title: `${names.length} ${r.title || "issues"}`,
            detail: names.slice(0, 4).join(" · "),
            entity: null,
            firedAt: this._firedAt(r),
          });
        }
        return;
      }
      if (hit(hass.states[r.entity])) {
        out.push({
          key: r.key || "r" + i,
          severity: r.severity || "warn",
          title: r.title || pcName(hass, r.entity),
          detail: r.detail || "",
          entity: r.entity,
          firedAt: this._firedAt(r),
        });
      }
    });
    /* `rank[x] || 3` would treat critical (0) as unranked and sink it below
       info — the one severity that must always sort first. */
    const rank = { critical: 0, warn: 1, info: 2 };
    const at = (x) => (rank[x] === undefined ? 3 : rank[x]);
    return out.sort((a, b) => at(a.severity) - at(b.severity));
  }

  /* What the chip and the sheet actually show: raised, minus live dismissals. */
  _faults() {
    const dis = this._dismissals();
    const now = Math.floor(Date.now() / 1000);
    const hrs = this._config.dismiss_hours;
    return this._raised().filter((row) => {
      const at = dis[row.key];
      if (!at) return true;
      if (row.firedAt > at) return true;           // it re-fired
      if (hrs && now - at > hrs * 3600) return true; // the snooze lapsed
      return false;
    });
  }

  /* Which room a preset, a search result or the transport acts on: whatever
     the user last picked, else whatever is actually playing, else the default. */
  _targets() {
    const sec = (this._config.sections || []).find((x) => x.type === "music");
    if (!sec) return [];
    const known = (sec.players || []).map((p) => p.entity);
    const picked = (this._sel || []).filter((e) => known.indexOf(e) >= 0);
    if (picked.length) return picked;
    const np = this._nowPlaying();
    if (np) return [np.entity];
    const fallback = sec.default_player || known[0];
    return fallback ? [fallback] : [];
  }

  /* The room the transport and the main volume act on: the first selected. */
  _activePlayer() {
    return this._targets()[0] || null;
  }

  _isPicked(entity) {
    return (this._sel || []).indexOf(entity) >= 0;
  }

  /* Tapping toggles, so two taps play to two rooms and tapping again drops
     one. Emptying the selection falls back to whatever is playing. */
  _togglePick(entity) {
    const cur = this._sel || [];
    this._sel = cur.indexOf(entity) >= 0 ? cur.filter((e) => e !== entity) : cur.concat([entity]);
    this._render();
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
        <div class="ps-hypt" data-readout="hyp"><span class="ps-lbl">Tonight</span><span>${rows.length} transitions</span></div>
        <div class="ps-hypplot" data-scrub="hyp">
          <div class="ps-cross" hidden></div>
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Sleep stages tonight">${out}</svg>
        </div>
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
        ${wave}</div>` : ""}`;
  }

  /* Renders nothing at all when every television is off, the same way the
     conditional card it replaces disappeared from the old view. */
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
  }

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
    const active = this._activePlayer();
    const players = (sec.players || []).map((p) => {
      const st = h.states[p.entity];
      const live = st && st.state === "playing" && psIsMusic(st);
      const on = this._isPicked(p.entity) || (!(this._sel || []).length && p.entity === active);
      return `<button class="ps-mr ${on ? "sel" : ""}" type="button"
        data-pick="${psEsc(p.entity)}" aria-pressed="${on}">
        ${live ? `<span class="ps-live"></span>` : ""}${psEsc(p.name)}</button>`;
    }).join("");

    const presets = (sec.presets || []).map((p, i) =>
      `<button class="ps-pr" type="button" data-preset="${i}">
        <ha-icon icon="${psEsc(p.icon || "mdi:playlist-music")}"></ha-icon>
        <span class="ps-trunc">${psEsc(p.name)}</span></button>`).join("");

    return `
      ${this._head(sec, (this._sel || []).length > 1
        ? `<span class="ps-chip cool">${this._sel.length} rooms</span>`
        : `<span class="ps-chip">${np ? (np.playing ? "Playing" : "Paused") : "Idle"}</span>`)}
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
        ${this._pinBtn()}
        ${np ? `<button class="ps-tb" type="button" data-mp="playpause" data-entity="${psEsc(np.entity)}">
          <svg viewBox="0 0 24 24" class="ps-ico">${np.playing
            ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>` : ""}
      </div>
      <div class="ps-mroom">${players}</div>
      <div class="ps-btns" style="margin-top:10px">
        <button class="ps-btn" type="button" data-sheet="music">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM16 9a4 4 0 0 1 0 6"/></svg>
          Controls &amp; volume</button>
      </div>
      <div class="ps-xtra">
        ${this._recentHtml()}
        ${this._pinsHtml()}
        <div><span class="ps-lbl">Presets</span><div class="ps-pres">${presets}</div></div>
      </div>`;
  }

  /* A star on whatever is playing, so the playlist you just found by
     searching can be found again without searching for it. */
  _pinBtn() {
    if (!this._pinStore()) return "";
    const item = this._pinnable();
    if (!item) return "";
    const on = this._isPinned(item.uri);
    return `<button class="ps-pin ${on ? "on" : ""}" type="button"
        data-pin="${psEsc(item.uri)}" data-pinname="${psEsc(item.name)}" data-pinkind="${psEsc(item.kind)}"
        aria-pressed="${on}" aria-label="${on ? "Remove from saved" : "Save"}">
        <svg viewBox="0 0 24 24" class="ps-ico" ${on ? 'style="fill:currentColor"' : ""}>
          <path d="m12 4 2.35 4.76 5.25.77-3.8 3.7.9 5.23L12 15.99l-4.7 2.47.9-5.23-3.8-3.7 5.25-.77Z"/></svg>
      </button>`;
  }

  /* What you actually reach for is what you just played, so it leads. */
  _recentHtml() {
    if (!this._recent.length) return "";
    return `<div><span class="ps-lbl">Recently played</span>
      <div class="ps-mlist" style="margin-top:6px">${this._recent.map((r, i) => `
        <button class="ps-mi" type="button" data-play="${i}" data-from="recent">
          <span class="ps-th"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg></span>
          <span class="ps-grow"><span class="ps-min ps-trunc">${psEsc(r.name)}</span>
          <span class="ps-mis ps-trunc">${psEsc(r.sub)}</span></span></button>`).join("")}</div></div>`;
  }

  _pinsHtml() {
    if (!this._pinStore() || !this._pins.length) return "";
    return `<span class="ps-lbl" style="display:block;margin:14px 0 6px">Saved</span>
      <div class="ps-pres">${this._pins.map((p, i) => `
        <span class="ps-pr">
          <button class="ps-prplay" type="button" data-pinplay="${i}">
            <ha-icon icon="mdi:playlist-star"></ha-icon>
            <span class="ps-trunc">${psEsc(p.name)}</span></button>
          <button class="ps-prx" type="button" data-pin="${psEsc(p.uri)}"
            aria-label="Remove ${psEsc(p.name)} from saved">
            <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </span>`).join("")}</div>`;
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
    /* Repainting mid-drag would rip the slider out from under the thumb. */
    if (this._dragging) return;
    const c = this._config;
    const now = new Date();
    const who = this._who();
    const raised = this._raised();
    if (this._config.log_to) this._syncLog(raised);
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
        tv: () => this._secTv(sec),
      }[sec.type]();
      if (!body) return "";   // a self-hiding section takes its divider with it
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

      ${this._sheetHtml(faults)}

      <div class="ps-fade"></div>
      <div class="ps-dockwrap">
        ${np ? `<div class="ps-mini" id="ps-mini" data-sheet="music" role="button" tabindex="0">
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
    this._bindScrub();
  }

  /* One sheet, two contents. Both slide over the column rather than pushing
     it around, so opening either never moves what is under your thumb. */
  _sheetHtml(faults) {
    if (!this._sheet) return "";
    const close = `<button class="ps-x" type="button" id="ps-close" aria-label="Close">
        <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;

    if (this._sheet === "alerts") {
      if (!faults.length) return "";
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet">
          <div class="ps-sheeth"><span class="ps-lbl">Needs attention</span>${close}</div>
          ${faults.map((f, i) => `<div class="ps-ar" data-info="${psEsc(f.entity || "")}">
            <span class="ps-dotc ${f.severity}"></span>
            <span class="ps-grow"><span class="ps-at">${psEsc(f.title)}</span>
            <span class="ps-ad">${psEsc(f.detail)}</span></span>
            ${this._config.dismiss_store ? `<button class="ps-x" type="button" data-dismiss="${i}"
              aria-label="Dismiss ${psEsc(f.title)}">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ""}
          </div>`).join("")}
        </div>`;
    }

    if (this._sheet === "music") {
      const sec = (this._config.sections || []).find((x) => x.type === "music");
      const np = this._nowPlaying();
      if (!sec) return "";
      const art = np && np.st.attributes.entity_picture_local;
      const target = np ? np.entity : sec.default_player;
      const tst = target && this._hass.states[target];
      const vol = tst && tst.attributes.volume_level != null ? tst.attributes.volume_level : 0;
      const muted = !!(tst && tst.attributes.is_volume_muted);

      const rooms = (sec.players || []).map((p) => {
        const st = this._hass.states[p.entity];
        const live = st && st.state === "playing" && psIsMusic(st);
        const active = this._isPicked(p.entity) ||
          (!(this._sel || []).length && this._activePlayer() === p.entity);
        const pv = st && st.attributes.volume_level != null ? st.attributes.volume_level : 0;
        return `<div class="ps-vrow ${active ? "on" : ""}">
            <button class="ps-vname" type="button" data-pick="${psEsc(p.entity)}">
              ${live ? `<span class="ps-live"></span>` : ""}${psEsc(p.name)}</button>
            <input class="ps-vol" type="range" min="0" max="100" step="1"
              value="${Math.round(pv * 100)}" data-vol="${psEsc(p.entity)}"
              aria-label="${psEsc(p.name)} volume" />
            <span class="ps-vnum">${Math.round(pv * 100)}</span>
          </div>`;
      }).join("");

      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall">
          <div class="ps-sheeth"><span class="ps-lbl">Music</span>${close}</div>
          <div class="ps-now" style="margin-bottom:12px">
            <div class="ps-art">${art
              ? `<img src="${psEsc(art)}" alt="" />`
              : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
            <div class="ps-grow">
              <div class="ps-nt ps-trunc">${np ? psEsc(np.st.attributes.media_title) : "Nothing playing"}</div>
              <div class="ps-ns ps-trunc">${np
                ? psEsc([np.st.attributes.media_artist, np.name].filter(Boolean).join(" \u00B7 "))
                : "Pick a room below"}</div>
            </div>
          </div>
          <div class="ps-transport">
            <button class="ps-tb" type="button" data-mpc="media_previous_track" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Previous">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M18 5v14L8 12zM6 5v14"/></svg></button>
            <button class="ps-tb big" type="button" data-mp="playpause" data-entity="${psEsc(target || "")}" aria-label="Play or pause">
              <svg viewBox="0 0 24 24" class="ps-ico">${np && np.playing
                ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
            <button class="ps-tb" type="button" data-mpc="media_next_track" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Next">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 5v14l10-7zM18 5v14"/></svg></button>
            <button class="ps-tb" type="button" data-mpc="media_stop" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Stop">
              <svg viewBox="0 0 24 24" class="ps-ico"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg></button>
          </div>
          <div class="ps-volmain">
            <button class="ps-vbtn ${muted ? "muted" : ""}" type="button" data-mute="${psEsc(target || "")}"
              data-muted="${muted}" aria-label="Mute">
              <svg viewBox="0 0 24 24" class="ps-ico">${muted
                ? `<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM16 9.5l5 5M21 9.5l-5 5"/>`
                : `<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM16 9a4 4 0 0 1 0 6"/>`}</svg></button>
            <input class="ps-vol" type="range" min="0" max="100" step="1"
              value="${Math.round(vol * 100)}" data-vol="${psEsc(target || "")}" aria-label="Volume" />
            <span class="ps-vnum">${Math.round(vol * 100)}</span>
          </div>
          <span class="ps-lbl" style="display:block;margin:14px 0 6px">Rooms</span>
          ${rooms}

          ${this._pinsHtml()}
          <span class="ps-lbl" style="display:block;margin:14px 0 6px">Search</span>
          <div class="ps-sbox">
            <svg viewBox="0 0 24 24" class="ps-ico"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/></svg>
            <input id="ps-q" type="search" placeholder="Tracks, albums, playlists\u2026"
              value="${psEsc(this._query)}" aria-label="Search music" />
            ${this._query ? `<button class="ps-sclear" type="button" id="ps-qclear" aria-label="Clear">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ""}
          </div>
          ${this._searching ? `<div class="ps-note">Searching\u2026</div>` : ""}
          ${this._results && this._results.length ? `<div class="ps-mlist">${
            this._results.map((r, i) => `<button class="ps-mi" type="button" data-play="${i}" data-from="results">
              <span class="ps-th">${r.image ? `<img src="${psEsc(r.image)}" alt="" />`
                : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</span>
              <span class="ps-grow"><span class="ps-min ps-trunc">${psEsc(r.name)}</span>
              <span class="ps-mis ps-trunc">${psEsc(r.sub)}</span></span>
              <span class="ps-kind">${psEsc(r.kind)}</span></button>`).join("")}</div>` : ""}
          ${this._results && this._results.length && this._pinStore() ? `<div class="ps-note">
            Hold a result to save it, or star what is playing.</div>` : ""}
          ${this._results && !this._results.length && !this._searching
            ? `<div class="ps-note">${sec.config_entry ? "No results." : "Search needs a Music Assistant config_entry."}</div>` : ""}

          <div style="margin-top:14px">${this._recentHtml()}</div>
        </div>`;
    }

    if (this._sheet === "schedule") {
      const sec = (this._config.sections || []).find((x) => x.type === "climate" && x.schedule);
      if (!sec) return "";
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall">
          <div class="ps-sheeth"><span class="ps-lbl">Thermostat schedule</span>${close}</div>
          ${this._scheduleHtml(sec)}
        </div>`;
    }
    return "";
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

    /* Two-tap confirm for anything destructive: the first tap arms, the
       second runs. A modal would be heavier than the action deserves. */
    root.querySelectorAll("[data-arm]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = el.dataset.arm;
        if (this._armed !== k) {
          this._armed = k;
          this._render();
          clearTimeout(this._armTimer);
          this._armTimer = setTimeout(() => { this._armed = null; this._render(); }, 5000);
          return;
        }
        this._armed = null;
        clearTimeout(this._armTimer);
        if (k === "hold") {
          const sec = c.sections.find((x) => x.type === "climate");
          const svc = sec && sec.hold && sec.hold.cancel_service;
          if (svc && svc.indexOf(".") > 0) {
            const parts = svc.split(".");
            hass.callService(parts[0], parts[1], (sec.hold.cancel_data) || {});
          }
          this._render();
        } else if (k === "sdel") {
          this._schedDelete();
        }
      });
    });

    root.querySelectorAll("[data-dismiss]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const rows = this._faults();
        const row = rows[parseInt(el.dataset.dismiss, 10)];
        if (row) this._dismiss(row);
      });
    });

    root.querySelectorAll("[data-tvoff]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.dataset.tvoff;
        hass.callService(id.split(".")[0], "turn_off", { entity_id: id });
      });
    });

    root.querySelectorAll("[data-scope]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const v = el.dataset.scope;
        this._schedScope = v === "__base__" ? null : v;
        this._schedDay = null;
        this._schedEdit = null;
        this._render();
      });
    });
    root.querySelectorAll("[data-sday]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._schedDay = el.dataset.sday;
        this._schedEdit = null;
        this._render();
      });
    });

    root.querySelectorAll("[data-sedit]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const v = el.dataset.sedit;
        this._schedEdit = v === "new" ? "new" : parseInt(v, 10);
        this._schedNote = null;
    this._schedScope = undefined; // preset key being viewed; null = base lists
    this._schedDay = null;        // day being viewed; null = today
    this._sel = [];           // rooms the user picked, overriding what is playing
    this._pins = [];          // saved playlists
        this._armed = null;
        this._render();
      });
    });
    const sSave = root.getElementById("ps-ssave");
    if (sSave) sSave.addEventListener("click", (e) => { e.stopPropagation(); this._schedSave(); });
    const sCancel = root.getElementById("ps-scancel");
    if (sCancel) sCancel.addEventListener("click", (e) => {
      e.stopPropagation();
      this._schedEdit = null; this._schedNote = null; this._armed = null; this._render();
    });
    /* Typing must not be eaten by the repaint, so the field owns its value
       until the query is submitted. */
    root.querySelectorAll("[data-f]").forEach((el) => {
      el.addEventListener("pointerdown", () => { this._dragging = true; });
      el.addEventListener("blur", () => { this._dragging = false; });
      el.addEventListener("click", (e) => e.stopPropagation());
    });

    const q = root.getElementById("ps-q");
    if (q) {
      q.addEventListener("focus", () => { this._dragging = true; });
      q.addEventListener("blur", () => { this._dragging = false; });
      q.addEventListener("click", (e) => e.stopPropagation());
      q.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        this._query = q.value;
        this._dragging = false;
        this._runSearch();
      });
      q.addEventListener("search", () => { this._query = q.value; this._dragging = false; this._runSearch(); });
    }
    const qc = root.getElementById("ps-qclear");
    if (qc) qc.addEventListener("click", (e) => {
      e.stopPropagation();
      this._query = ""; this._results = null; this._dragging = false; this._render();
    });

    root.querySelectorAll("[data-play]").forEach((el) => {
      const item = () => {
        const list = el.dataset.from === "recent" ? this._recent : (this._results || []);
        return list[parseInt(el.dataset.play, 10)];
      };
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const it = item();
        if (it) this._playUri(it.uri, it.kind);
      });
      /* Hold to save, so the row keeps its single obvious tap action. */
      let hold;
      const start = () => {
        hold = setTimeout(() => {
          const it = item();
          if (it) this._togglePin(it.uri, it.name, it.kind);
        }, 550);
      };
      const stop = () => clearTimeout(hold);
      el.addEventListener("pointerdown", start);
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => el.addEventListener(ev, stop));
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const it = item();
        if (it) this._togglePin(it.uri, it.name, it.kind);
      });
    });

    root.querySelectorAll("[data-pinplay]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const p = this._pins[parseInt(el.dataset.pinplay, 10)];
        if (p) this._playUri(p.uri, "playlist");
      });
    });

    root.querySelectorAll("[data-sheet]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = el.dataset.sheet;
        this._sheet = this._sheet === k ? null : k;
        this._render();
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

    root.querySelectorAll("[data-mpc]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const ids = el.dataset.all === "1" ? this._targets() : [el.dataset.entity].filter(Boolean);
        if (!ids.length) return;
        hass.callService("media_player", el.dataset.mpc, { entity_id: ids });
      });
    });

    root.querySelectorAll("[data-mute]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!el.dataset.mute) return;
        hass.callService("media_player", "volume_mute", {
          entity_id: el.dataset.mute, is_volume_muted: el.dataset.muted !== "true",
        });
      });
    });

    root.querySelectorAll("[data-vol]").forEach((el) => {
      const hold = () => { this._dragging = true; };
      const release = () => {
        this._dragging = false;
        if (!el.dataset.vol) return;
        hass.callService("media_player", "volume_set", {
          entity_id: el.dataset.vol, volume_level: parseInt(el.value, 10) / 100,
        });
      };
      el.addEventListener("pointerdown", hold);
      el.addEventListener("touchstart", hold, { passive: true });
      /* Scrolling away from a slider fires neither change nor blur, which
         would leave _dragging stuck and freeze every later repaint. */
      ["pointercancel", "pointerleave"].forEach((ev) =>
        el.addEventListener(ev, () => { this._dragging = false; }));
      el.addEventListener("input", (e) => {
        e.stopPropagation();
        const num = el.parentElement && el.parentElement.querySelector(".ps-vnum");
        if (num) num.textContent = el.value;
      });
      el.addEventListener("change", (e) => { e.stopPropagation(); release(); });
      el.addEventListener("click", (e) => e.stopPropagation());
    });

    /* Tapping a room picks it as the target. It used to open the built-in
       more-info dialog, which is not what "choose a speaker" means. */
    root.querySelectorAll("[data-pick]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._togglePick(el.dataset.pick);
      });
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        pcMoreInfo(this, el.dataset.pick);
      });
    });

    root.querySelectorAll("[data-pin]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._togglePin(el.dataset.pin, el.dataset.pinname, el.dataset.pinkind);
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

  /* Scrubbing must never compete with scrolling, and only one mechanism can
   * actually hold a touch gesture once it has begun.
   *
   * `touch-action` is read at gesture start and cannot be taken back: with
   * `auto` the browser owns the gesture, so the first vertical move starts a
   * scroll and fires `pointercancel`, killing any drag. Pointer capture does
   * not help — the gesture is already gone. The one thing that does work
   * mid-gesture is `preventDefault()` on a NON-PASSIVE `touchmove`.
   *
   * So the two input types get two implementations. A mouse uses pointer
   * events and scrubs on hover, having no scroll gesture to be confused with.
   * A finger uses raw touch events: it scrolls freely until a deliberate press
   * completes, after which every touchmove is prevented and the gesture is
   * ours until the finger lifts — wherever on the screen it goes.
   */
  _bindScrub() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-scrub]").forEach((box) => {
      const kind = box.dataset.scrub;
      const cross = box.querySelector(".ps-cross");
      /* The readout lives ABOVE the plot, in normal flow, because a tooltip
         drawn at the touch point is under the thumb by definition. */
      const out = root.querySelector(`[data-readout="${kind}"]`);
      if (!cross || !out) return;
      const resting = out.innerHTML;

      let scrubbing = false;
      let holdTimer = null;
      let startX = 0;
      let startY = 0;

      const hide = () => {
        cross.hidden = true;
        out.innerHTML = resting;
        out.classList.remove("live");
      };

      const stop = () => {
        clearTimeout(holdTimer);
        holdTimer = null;
        scrubbing = false;
        box.classList.remove("scrubbing");
        hide();
      };

      const readout = (clientX) => {
        const r = box.getBoundingClientRect();
        if (!r.width) return;
        const x = Math.max(0, Math.min(r.width, clientX - r.left));
        const f = x / r.width;

        let html = null;
        if (kind === "wave") {
          const d = this._waveData;
          if (!d) return;
          const t = d.t0 + f * (d.t1 - d.t0);
          const at = (arr) => {
            if (!arr || !arr.length) return null;
            let best = arr[0];
            for (const p of arr) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
            return best;
          };
          const i = at(d.inside), o = at(d.outside);
          html = `<b>${new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</b>` +
            (i ? `<span><i style="background:var(--ps-cool)"></i>In<b>${i.v.toFixed(1)}\u00B0</b></span>` : "") +
            (o ? `<span><i style="background:var(--ps-heat)"></i>Out<b>${o.v.toFixed(1)}\u00B0</b></span>` : "");
        } else {
          const d = this._hypData;
          if (!d) return;
          const t = d.from + f * (d.to - d.from);
          const rows = d.rows.filter((x) => x.t <= t);
          const c = rows.length ? rows[rows.length - 1] : d.rows[0];
          if (!c) return;
          const label = { awake: "Awake", light_sleep: "Light sleep", deep_sleep: "Deep sleep" }[c.s] || c.s;
          const col = { awake: "var(--ps-awake)", light_sleep: "var(--ps-light)", deep_sleep: "var(--ps-deep)" }[c.s];
          html = `<b>${new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</b>` +
            `<span><i style="background:${col}"></i>${label}</span>` +
            `<span>since ${new Date(c.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>`;
        }

        cross.hidden = false;
        cross.style.left = x.toFixed(1) + "px";
        out.innerHTML = html;
        out.classList.add("live");
      };

      /* ---- mouse: hover, no gesture to fight ---- */
      box.addEventListener("pointermove", (ev) => {
        if (ev.pointerType !== "mouse") return;
        readout(ev.clientX);
      });
      box.addEventListener("pointerleave", (ev) => {
        if (ev.pointerType !== "mouse") return;
        hide();
      });

      /* ---- touch: scroll by default, own the gesture once pressed ---- */
      const TOL = 18;   // a thumb on glass wanders; that is not a swipe
      const HOLD = 340;

      box.addEventListener("touchstart", (ev) => {
        if (ev.touches.length !== 1) return;
        const t = ev.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          scrubbing = true;
          box.classList.add("scrubbing");
          readout(startX);
        }, HOLD);
      }, { passive: true });

      /* Non-passive: once scrubbing, this preventDefault is the only thing
         that stops the page scrolling out from under the drag. */
      box.addEventListener("touchmove", (ev) => {
        const t = ev.touches[0];
        if (!t) return;
        if (scrubbing) {
          ev.preventDefault();
          /* Only X matters, so the thumb can drop below the plot and out of
             its own way — off the element entirely is fine. */
          readout(t.clientX);
          return;
        }
        if (holdTimer &&
            (Math.abs(t.clientX - startX) > TOL || Math.abs(t.clientY - startY) > TOL)) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
      }, { passive: false });

      box.addEventListener("touchend", (ev) => {
        const t = ev.changedTouches && ev.changedTouches[0];
        /* A tap is unambiguously not a scroll, so it is the quick way in:
           lift without having moved and the readout appears, then clears. */
        if (!scrubbing && t &&
            Math.abs(t.clientX - startX) <= TOL && Math.abs(t.clientY - startY) <= TOL) {
          clearTimeout(holdTimer);
          holdTimer = null;
          readout(t.clientX);
          clearTimeout(this._tapTimer);
          this._tapTimer = setTimeout(hide, 5000);
          return;
        }
        stop();
      });

      box.addEventListener("touchcancel", stop);
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
        /* A negative horizontal margin made the card wider than the view, and
           the page then scrolled sideways whenever a drag started on a graph.
           Stay inside the view and clip anything that still reaches past. */
        margin: 0;
        padding: 6px 6px 132px;
        max-width: 100%;
        overflow-x: clip;
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
        border-radius: 26px; overflow: clip;
        background: linear-gradient(180deg, rgba(255,255,255,.062), rgba(255,255,255,.026));
        border: 1px solid rgba(255,255,255,.085);
        box-shadow: 0 24px 60px -18px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.075);
        backdrop-filter: blur(26px) saturate(1.25);
        -webkit-backdrop-filter: blur(26px) saturate(1.25);
      }
      .ps-sect { padding: 13px 15px 15px; overflow-x: clip; }
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
      .ps-wave { margin: 4px -15px -15px; position: relative; }
      .ps-wave-svg { width: 100%; height: 74px; display: block; }
      .ps-wlg { display: flex; gap: 12px; align-items: baseline; margin-top: 11px; min-height: 16px;
                font-size: 10.5px; color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .ps-wlg i { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px; }
      .ps-wlg b { color: var(--ps-text); font-weight: 640; margin-left: 3px; }
      .ps-wlg span { display: inline-flex; align-items: center; }
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
      .ps-hypt { display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
                 font-size: 9.5px; color: var(--ps-dim); font-variant-numeric: tabular-nums; min-height: 13px; }
      .ps-hypt i { width: 7px; height: 7px; border-radius: 2px; display: inline-block; margin-right: 5px; }
      .ps-hypt span { display: inline-flex; align-items: center; }
      .ps-hypt b { color: var(--ps-text); font-weight: 650; }
      /* While scrubbing the caption becomes the value line, so make it read
         like one rather than like a muted label. */
      [data-readout].live { color: var(--ps-text); }
      [data-readout].live b { color: var(--ps-text); }
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
      .ps-mroom { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
      .ps-mr { flex: 0 0 auto; padding: 7px 12px; border-radius: 12px; background: var(--ps-fill);
               color: var(--ps-muted); font-size: 11px; font-weight: 650;
               display: inline-flex; align-items: center; gap: 6px; }
      .ps-mr.sel { background: rgba(77,208,225,.16); color: var(--ps-cool);
                   box-shadow: inset 0 0 0 1px rgba(77,208,225,.4); }
      .ps-live { width: 6px; height: 6px; border-radius: 50%; background: var(--ps-good); }
      .ps-pres { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-top: 7px; }
      .ps-pr { padding: 10px 11px; border-radius: 14px; background: var(--ps-fill); font-size: 11.5px;
               font-weight: 650; display: flex; align-items: center; gap: 8px; min-width: 0; }
      .ps-pr ha-icon { --mdc-icon-size: 16px; color: var(--ps-cool); }

      /* rooms */
      .ps-rstrip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .ps-rc { min-width: 0; background: var(--ps-fill); border-radius: 15px;
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
      .ps-timeline { position: relative; height: 28px; border-radius: 9px; background: var(--ps-fill);
                     overflow: hidden; }
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

      /* television */
      .ps-tvrow { display: flex; align-items: center; gap: 10px; padding: 7px 0;
                  border-top: 1px solid var(--ps-hair-soft); }
      .ps-tvrow:first-of-type { border-top: 0; }
      .ps-tvrow > .ps-ico { color: var(--ps-dim); }
      .ps-tvn { display: block; font-size: 12.5px; font-weight: 650; }
      .ps-tva { display: block; font-size: 10.5px; color: var(--ps-dim); }
      .ps-tvoff { width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,.08);
                  display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-tvoff:active { color: var(--ps-bad); }

      /* hold */
      .ps-hold { display: flex; align-items: center; gap: 9px; width: 100%; margin-top: 10px;
                 background: rgba(242,193,78,.13); color: var(--ps-warn); border-radius: 12px;
                 padding: 8px 11px; font-size: 11.5px; font-weight: 650; }
      .ps-hold.armed { background: var(--ps-warn); color: #1a1a1a; }
      .ps-holdx { font-size: 12px; font-weight: 700; }

      /* schedule tabs */
      .ps-tabs { display: flex; flex-wrap: wrap; gap: 3px; background: var(--ps-fill);
                 border-radius: 11px; padding: 3px; }
      .ps-tab { flex: 1 1 auto; min-width: 40px; border-radius: 9px; padding: 7px 10px; font-size: 11px;
                font-weight: 650; color: var(--ps-muted); text-align: center; white-space: nowrap; }
      .ps-tab.on { background: rgba(255,255,255,.1); color: var(--ps-text);
                   box-shadow: inset 0 0 0 1px var(--ps-hair); }
      .ps-srz { margin-left: 8px; color: var(--ps-dim); font-size: 10px; }
      .ps-srt { flex: 0 0 128px; }

      /* schedule editor */
      .ps-sedit { display: flex; flex-direction: column; gap: 9px; background: var(--ps-fill);
                  border-radius: 14px; padding: 11px; }
      .ps-sform { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .ps-sform label { display: flex; flex-direction: column; gap: 4px; font-size: 10px;
                        letter-spacing: .08em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-sform input { background: rgba(255,255,255,.07); color: var(--ps-text);
                        border: 1px solid var(--ps-hair); border-radius: 10px; padding: 8px 9px;
                        font: inherit; font-size: 14px; font-variant-numeric: tabular-nums;
                        color-scheme: dark; min-width: 0; }
      .ps-sform input:focus { outline: 2px solid var(--ps-cool); outline-offset: 1px; }
      .ps-snote { font-size: 11px; color: var(--ps-warn); }
      .ps-btn.primary { background: var(--ps-cool); color: #0f1317; }
      .ps-btn.danger { color: var(--ps-bad); }
      .ps-btn.armed { background: var(--ps-warn); color: #1a1a1a; }
      .ps-btn { display: inline-flex; align-items: center; gap: 7px; }
      .ps-sr { width: 100%; text-align: left; }
      .ps-sr[disabled] { cursor: default; }

      /* graph scrubber */
      .ps-hypplot { position: relative; }
      /* Default to letting the browser scroll; claim the gesture only once a
         long press has deliberately entered scrub mode. */
      [data-scrub] { touch-action: auto; }
      [data-scrub].scrubbing { touch-action: none; }
      .ps-cross { position: absolute; top: 0; bottom: 0; width: 1px; z-index: 2; pointer-events: none;
                  background: rgba(255,255,255,.4); }

      /* saved playlists */
      .ps-pin { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,.08);
                display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-pin.on { background: rgba(242,193,78,.17); color: var(--ps-warn); }
      .ps-pin .ps-ico { width: 18px; height: 18px; }
      .ps-pr { position: relative; }
      .ps-prplay { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0;
                   font-size: 11.5px; font-weight: 650; padding-right: 18px; }
      .ps-prplay ha-icon { --mdc-icon-size: 16px; color: var(--ps-warn); }
      .ps-prx { position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
                width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
                color: var(--ps-dim); }
      .ps-prx .ps-ico { width: 11px; height: 11px; }

      /* search + lists */
      .ps-sbox { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.06);
                 border-radius: 13px; padding: 0 11px; height: 40px; color: var(--ps-dim); }
      .ps-sbox input { flex: 1; min-width: 0; border: 0; background: none; outline: none;
                       font: inherit; font-size: 13.5px; color: var(--ps-text); height: 100%; }
      .ps-sbox input::placeholder { color: var(--ps-dim); }
      .ps-sclear { display: flex; color: var(--ps-dim); }
      .ps-note { font-size: 11.5px; color: var(--ps-dim); padding: 9px 2px; }
      .ps-mlist { display: flex; flex-direction: column; gap: 1px; }
      /* Nothing in the view scrolls sideways any more; only the sheet scrolls,
         and only downwards. */
      .ps-mi { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 4px;
               border-radius: 11px; text-align: left; }
      .ps-mi:active { background: rgba(255,255,255,.06); }
      .ps-th { width: 34px; height: 34px; border-radius: 9px; background: rgba(255,255,255,.07);
               display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden; }
      .ps-th .ps-ico { width: 15px; height: 15px; }
      .ps-min { display: block; font-size: 12.5px; font-weight: 650; }
      .ps-mis { display: block; font-size: 10.5px; color: var(--ps-dim); }
      .ps-kind { flex: 0 0 auto; font-size: 8.5px; letter-spacing: .09em; text-transform: uppercase;
                 color: var(--ps-dim); background: rgba(255,255,255,.07); padding: 3px 7px; border-radius: 999px; }

      /* music controls */
      .ps-transport { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 14px; }
      .ps-tb.big { width: 48px; height: 48px; }
      .ps-tb.big .ps-ico { width: 24px; height: 24px; }
      .ps-volmain { display: flex; align-items: center; gap: 11px; }
      .ps-vbtn { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.08);
                 display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-vbtn.muted { color: var(--ps-bad); }
      .ps-vol { flex: 1; min-width: 0; -webkit-appearance: none; appearance: none; height: 6px;
                border-radius: 999px; background: var(--ps-track); outline: none; touch-action: pan-y; }
      .ps-vol::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px;
                border-radius: 50%; background: var(--ps-text); cursor: pointer; }
      .ps-vol::-moz-range-thumb { width: 18px; height: 18px; border: 0; border-radius: 50%;
                background: var(--ps-text); cursor: pointer; }
      .ps-vol:focus-visible { outline: 2px solid var(--ps-cool); outline-offset: 3px; }
      .ps-vnum { flex: 0 0 26px; text-align: right; font-size: 11px; color: var(--ps-dim);
                 font-variant-numeric: tabular-nums; }
      .ps-vrow { display: flex; align-items: center; gap: 10px; padding: 7px 0;
                 border-top: 1px solid var(--ps-hair-soft); }
      .ps-vrow:first-of-type { border-top: 0; }
      .ps-vname { flex: 0 0 96px; font-size: 11.5px; font-weight: 650; color: var(--ps-muted);
                  display: flex; align-items: center; gap: 6px; }
      .ps-vrow.on .ps-vname { color: var(--ps-text); }
      .ps-mini { cursor: pointer; }

      /* alert sheet */
      .ps-scrim { position: fixed; inset: 0; background: rgba(4,6,10,.6); z-index: 8; backdrop-filter: blur(2px); }
      .ps-sheet {
        position: fixed; left: 12px; right: 12px; bottom: 96px; z-index: 9;
        background: rgba(20,23,32,.96); border: 1px solid rgba(255,255,255,.1); border-radius: 20px;
        padding: 13px 15px; box-shadow: 0 24px 60px rgba(0,0,0,.6);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        max-height: 60vh; overflow-y: auto; overscroll-behavior: contain;
      }
      .ps-sheet.tall { max-height: 74vh; }
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
