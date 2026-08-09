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

/* setConfig rejects anything not on this list, so a new section type has to be
   added HERE as well as to the renderer dispatch in _render. Miss this and the
   card throws out of setConfig and Lovelace replaces the whole thing with
   "Configuration error" — not just the one section. */
const PS_SECTIONS = [
  "sleep", "climate", "people", "music", "rooms", "quick", "calendar", "systems", "tv",
  "nowplaying", "nursery", "lights",
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

/* Both of these were local copies. See 05-shared.js — the escaper in
   particular had already drifted from the other three. */
const psEsc = pcEsc;
const psIsMusic = pcIsMusicState;

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
    /* Systems is a MODE, not a section: the column and the dock both swap.
       null is the house; "systems" is the server, and _page is which of its
       pages is showing. See 77-shell-systems.js. */
    this._mode = null;
    this._page = "overview";
    this._swOpt = {};         // optimistic container/VM switch states
    this._syq = "";           // container search
    this._syfilter = "all";
    this._synf = "all";       // notification importance filter
    this._history = {};
    /* null, not {} — the nursery section has to tell "the recorder has not
       answered yet" from "he has never slept", and {} reads as the second. */
    this._nursery = null;
    this._nurseryErr = null;
    this._nurseryTimer = null;
    /* An optimistic setpoint, so the goal moves on the tap rather than on the
       round trip. See _optGoal. */
    this._goalOpt = null;
    this._goalSend = null;
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
    /* ONE room, not a set. A multi-select made "play to two rooms" mean two
       unsynchronised queues; real multi-room is media_player.join, which these
       players support. null means "follow whatever is actually playing". */
    this._pick = null;
    this._queue = null;       // the active room's queue, from music_assistant.get_queue
    this._queueKey = null;    // what the last queue read was for
    this._mtype = "all";      // search filter: a media_type, or "all" for none
    this._note = null;        // a transient confirmation line in the music sheet
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
    if (first && this._config) this._start();
  }

  get hass() {
    return this._hass;
  }

  _start() {
    /* The systems mode's lists are discovered from hass.states, so the watched
       set cannot be complete until hass exists. Without this a container
       toggle would not repaint until the 30s clock came round. */
    this._expandWatched();
    this._startHistory();
    this._startNursery();
    this._fetchEvents();
    this._fetchSchedule();
    this._fetchRecent();
    this._loadPins();
  }

  /* Lovelace keeps a view's elements alive and simply detaches them, so
   * leaving for another view and coming back reconnects THIS element rather
   * than building a new one.
   *
   * disconnectedCallback stops every timer, and nothing used to start them
   * again: the fetches only ran on the first hass, which had long since
   * arrived. So a return from the vacuum view left a card whose clock had
   * stopped, whose graphs never refreshed and whose calendar never reloaded —
   * looking frozen while still accepting taps.
   */
  connectedCallback() {
    if (!this._config) return;
    if (!this._clock) this._clock = setInterval(() => this._render(), 30000);
    if (this._hass && !this._historyTimer) this._start();
    /* The shadow tree and its listeners both survive a detach, so this is not
       a rebuild — it is a catch-up. The clock has been stopped for however
       long we were away, so the greeting, the date and every elapsed time on
       screen are stale by exactly that much. */
    this._last = null;
    this._render();
  }

  disconnectedCallback() {
    if (this._clock) clearInterval(this._clock);
    if (this._historyTimer) clearInterval(this._historyTimer);
    if (this._eventTimer) clearInterval(this._eventTimer);
    if (this._nurseryTimer) clearInterval(this._nurseryTimer);
    clearTimeout(this._goalSend);
    this._goalSend = null;
    this._clock = null;
    this._historyTimer = null;
    this._eventTimer = null;
    /* Nulled, not just cleared — connectedCallback tells "stopped" from
       "running" by the handle, so leaving it set would stack a second poller
       on every return to the view. */
    this._nurseryTimer = null;
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
      if (s.type === "nursery") {
        push(s.hatch); push(s.door); push(s.hatch_wifi); push(s.light);
      }
      if (s.type === "lights") {
        (s.lights || []).forEach((x) => {
          push(x.entity); push(x.hide_when_unavailable);
          push((x.protect || {}).when);
          (x.members || []).forEach(push);
          (x.extras || []).forEach(push);
        });
      }
      if (s.type === "tv" || s.type === "nowplaying") {
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
        (s.devices || []).forEach((d) => {
          push(d.subtitle_entity); push(d.chip);
          (d.faults || []).forEach((f) => push(f.entity));
          (d.meters || []).forEach((m) => push(m.entity));
          (d.stats || []).forEach((x) => push(x.entity));
          (d.groups || []).forEach((g) => (g.items || []).forEach((x) => push(x.entity)));
        });
        (s.groups || []).forEach((g) => {
          (g.stats || []).forEach((x) => push(x.entity));
          (g.items || []).forEach((x) => push(x.entity));
          push((g.bar || {}).entity);
        });
      }
    });
    return ids.filter(Boolean);
  }

  /* Deduped: a room temp is frequently also the graph's inside sensor, and
     Joel's room appears in both the climate rooms and the sleep section. The
     same id twice makes the recorder query longer for no extra data. */
  _historyEntities() {
    const ids = new Set();
    this._config.sections.forEach((s) => {
      if (s.type === "climate") {
        if (s.graph && s.graph.inside) ids.add(s.graph.inside);
        if (s.graph && s.graph.outside) ids.add(s.graph.outside);
        /* The expanded room list draws a sparkline per room off the same
           fetch — a second request for a shorter window would cost more than
           the extra ids do. */
        if (s.room_spark !== false) {
          (s.rooms || []).forEach((r) => { if (r.temp) ids.add(r.temp); });
        }
      }
      if (s.type === "sleep" && s.sleep_state) ids.add(s.sleep_state);
    });
    /* The systems mode's CPU graph rides the same 26h fetch — one more id on a
       request that is already going out beats a second request. */
    const srv = this._config.server;
    if (srv && srv.perf && srv.perf.cpu && srv.perf.graph !== false) ids.add(srv.perf.cpu);
    return [...ids];
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
        `history/period/${start}?filter_entity_id=${ids.join(",")}` +
        `&end_time=${encodeURIComponent(pcNowIso())}&minimal_response&no_attributes`
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
      this._histErr = null;
      this._last = null;
      this._render();
    } catch (e) {
      /* History is decoration — never break the view over it — but the graphs
         must be able to say the recorder did not answer, rather than looking
         like a card that simply has no graph. */
      this._histErr = (e && e.message) || "recorder did not answer";
      this._last = null;
      this._render();
    }
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

  /* The skeleton is built once. Everything after this is a patch into one of
     these four slots, so the stylesheet is parsed once rather than on every
     state change, and untouched regions keep their DOM — which is what keeps
     scroll position, focus and the artwork <img> alive between repaints. */
  _mount() {
    this.shadowRoot.innerHTML = `
      <style>${PurdyShellCard.styles}</style>
      <div class="ps-ground"></div>
      <div class="ps-stat" id="ps-stat"></div>
      <div class="ps-col" id="ps-col"></div>
      <div id="ps-sheetslot"></div>
      <div class="ps-dockwrap" id="ps-dockwrap"></div>`;
    this._mounted = true;
  }

  /* Write only when the string actually differs. Identical output must not
     touch the DOM at all — that is the whole point. */
  _patch(id, html) {
    const el = this.shadowRoot.getElementById(id);
    if (!el || el._psHtml === html) return;
    el._psHtml = html;
    el.innerHTML = html;
  }

  /* Sections are keyed so a self-hiding one can come and go without disturbing
     its neighbours, and so an unchanged section is left entirely alone. */
  _patchSections(list) {
    const col = this.shadowRoot.getElementById("ps-col");
    if (!col) return;
    const have = new Map();
    Array.from(col.children).forEach((n) => have.set(n.dataset.sect, n));

    let prev = null;
    list.forEach((s) => {
      let node = have.get(s.key);
      if (node) {
        have.delete(s.key);
        if (node._psHtml !== s.html) {
          node._psHtml = s.html;
          node.innerHTML = s.html;
        }
      } else {
        node = document.createElement("div");
        node.dataset.sect = s.key;
        node._psHtml = s.html;
        node.innerHTML = s.html;
      }
      /* Systems mode reuses this reconciler for its pages, and a page is not
         a section: no hairline divider, no expand state. */
      const base = s.cls || "ps-sect";
      const cls = s.open ? base + " open" : base;
      if (node.className !== cls) node.className = cls;
      /* Re-inserting a node that is already in place would detach and
         re-attach it, losing focus for no reason. */
      const want = prev ? prev.nextSibling : col.firstChild;
      if (node !== want) col.insertBefore(node, want);
      prev = node;
    });

    have.forEach((n) => n.remove());
  }

  /* Attach the card a hosted sheet wraps, and keep feeding it hass.
   *
   * It is built once and then left alone: the sheet's markup is identical
   * between repaints, so _patch skips it and the element survives — which is
   * what keeps the remote's selected device and the notification list's scroll
   * position from resetting under the thumb every time a state changes.
   */
  _mountSheetCard() {
    const spec = (this._config.sheets || {})[this._sheet];
    const host = this.shadowRoot.getElementById("ps-host");
    if (!spec || !spec.card || !host) {
      this._hosted = null;
      this._hostedKey = null;
      return;
    }
    if (this._hosted && this._hostedKey === this._sheet && host.firstChild) {
      this._hosted.hass = this._hass;
      return;
    }

    const tag = String(spec.card.type || "").replace(/^custom:/, "");
    if (!tag || !customElements.get(tag)) {
      host.innerHTML = `<div class="ps-nohist">${psEsc(tag || "card")} is not registered</div>`;
      this._hosted = null;
      this._hostedKey = this._sheet;
      return;
    }

    const el = document.createElement(tag);
    /* The sheet has already drawn a surface, so the card must not draw a
       second one — the shell is what knows it is nesting, so it defaults
       `bare` rather than making every hosted config remember to. Listed
       first so an explicit `bare: false` in config still wins. */
    const hostCfg = { bare: true, ...spec.card };
    /* And it has already written the title, for the same reason: the sheet
       chrome names itself next to the close button. Leaving the card's own
       title set printed it twice — "TELEVISIONS / Televisions",
       "NOTIFICATIONS / NOTIFICATIONS". Blanked rather than deleted, so a card
       that puts a chip or a button in the same header row keeps it. */
    if (spec.title && !spec.keep_title) hostCfg.title = "";
    try {
      el.setConfig(hostCfg);
    } catch (err) {
      try {
        /* `bare` is our own convention. A third-party card is entitled to
           reject a key it has never heard of, and losing the whole card over
           a cosmetic hint would be a poor trade — so try again without it and
           accept the nested surface. The blank title is dropped too: a card
           that validates its config strictly may require one. */
        el.setConfig({ ...spec.card });
      } catch (err2) {
        /* A card that rejects its own config must say so here rather than
           throwing out of the render and taking the whole shell down. */
        host.innerHTML = `<div class="ps-nohist">${psEsc(tag)}: ${psEsc((err2 && err2.message) || "bad config")}</div>`;
        this._hosted = null;
        this._hostedKey = this._sheet;
        return;
      }
    }
    el.hass = this._hass;
    host.innerHTML = "";
    host.appendChild(el);
    this._hosted = el;
    this._hostedKey = this._sheet;
  }

  _render() {
    if (!this._hass || !this._config) return;
    /* Repainting mid-drag would rip the slider out from under the thumb. */
    if (this._dragging) return;
    if (!this._mounted) this._mount();
    const c = this._config;
    const now = new Date();
    const who = this._who();
    const raised = this._raised();
    if (this._config.log_to) this._syncLog(raised);
    const faults = this._faults();

    /* Systems mode owns the same four slots — header, column, sheet and dock —
       so it branches here rather than being a section. Everything above this
       line still runs: the fault list and the notification log are the house's
       and do not stop mattering because you are looking at the server. */
    if (this._mode === "systems") return this._renderSystems(faults);

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

    const sections = [];
    c.sections.forEach((raw, i) => {
      const sec = { key: raw.key || raw.type + i, ...raw };
      /* A section can carry the config a sheet needs without taking a
         permanent slot in the column — that is how music keeps its players,
         presets and pins while only appearing behind the dock button. */
      if (sec.sheet_only) return;
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
        nowplaying: () => this._secNowplaying(sec),
        nursery: () => this._secNursery(sec),
        lights: () => this._secLights(sec),
      }[sec.type]();
      if (!body) return;   // a self-hiding section takes its divider with it
      sections.push({ key: sec.key, html: body, open: this._open === sec.key });
    });

    const dock = (c.dock || []).map((d, i) => {
      const alert = d.alert_when_faults && faults.length;
      return `<button class="ps-db ${d.active ? "on" : ""} ${alert ? "alert" : ""}" type="button" data-dock="${i}">
          <ha-icon icon="${psEsc(d.icon)}"></ha-icon><span>${psEsc(d.name)}</span>
        </button>`;
    }).join("");

    this._patch("ps-stat", `
        <div>
          <h2>${this._greeting()}${who ? `,<br>${psEsc(who)}` : ""}</h2>
          <div class="ps-d">${now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
            · ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${
              c.occupancy ? " · " + psEsc(pcState(this._hass, c.occupancy)) : ""}</div>
        </div>
        <div class="ps-rt">
          ${wTemp == null ? "" : `<div class="ps-wx" data-info="${psEsc(c.weather)}">
            <ha-icon icon="${wIcons[wState] || "mdi:weather-partly-cloudy"}"></ha-icon>${Math.round(wTemp)}°</div>`}
          ${pcOffline(this._hass)
            /* Everything below is last-known-good from here on. Saying so beats
               a screen of confidently stale numbers. */
            ? `<span class="ps-chip bad"><span class="ps-dot"></span>Reconnecting…</span>`
            : `<button class="ps-chip ${worst}" type="button" id="ps-alert">
            <span class="ps-dot"></span>${faults.length ? `${faults.length} need${faults.length > 1 ? "" : "s"} attention` : "All clear"}
          </button>`}
        </div>`);

    this._patchSections(sections);

    this._patch("ps-sheetslot", this._sheetHtml(faults));
    this._mountSheetCard();

    this._patch("ps-dockwrap", `${this._miniHtml()}<div class="ps-dock">${dock}</div>`);

    this._bind();
    this._bindScrub();
    this._bindLights();
    this._bindSystems();
    this._reserve();
    /* Only while the music sheet is open, and only when the answer could have
       changed — see _syncQueue. Kicked from the tail of the render so it
       cannot recurse into one that has not finished. */
    this._syncQueue();
  }

  /* The now-playing bar belongs to the house, not to a dock: walking into the
     server pages must not take the pause button away from you. Shared by both
     render paths for that reason, and _reserve measures whatever results. */
  _miniHtml() {
    const np = this._nowPlaying();
    if (!np) return "";
    const art = np.st.attributes.entity_picture_local;
    return `<div class="ps-mini" id="ps-mini" data-sheet="music" role="button" tabindex="0">
        <div class="ps-mart">${art
          ? `<img src="${psEsc(art)}" alt="" />`
          : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
        <div class="ps-grow">
          <div class="ps-mt ps-trunc">${psEsc(np.st.attributes.media_title)}</div>
          <div class="ps-ms ps-trunc">${psEsc(np.name)} · ${np.playing ? "playing" : "paused"}</div>
        </div>
        <button class="ps-mb" type="button" data-mp="playpause" data-entity="${psEsc(np.entity)}" aria-label="Play or pause">
          <svg viewBox="0 0 24 24" class="ps-ico">${np.playing
            ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
      </div>`;
  }

  /* Reserve exactly as much room as the dock actually occupies.
   *
   * `:host` reserved a fixed 132px while the dock wrap is the dock (~65px) plus,
   * whenever anything is playing, a now-playing bar and its gap (~59px more) —
   * before env(safe-area-inset-bottom) adds another ~34 on a phone. So the tail
   * of the last section sat underneath the dock, and .ps-sheet's fixed 96px
   * bottom put every sheet's lower edge behind the mini bar. Measure the real
   * thing and let the padding, the fade and the sheet all derive from it.
   */
  _reserve() {
    const wrap = this.shadowRoot.getElementById("ps-dockwrap");
    if (!wrap || typeof wrap.offsetHeight !== "number") return;   // no layout in tests
    const h = wrap.offsetHeight;
    if (!h || h === this._dockH) return;
    this._dockH = h;
    if (this.style && typeof this.style.setProperty === "function") {
      this.style.setProperty("--ps-dockh", h + "px");
    }
  }

  /* What the goal should READ as, which is not always what the thermostat
     says yet. The optimistic value stands until the real state agrees with it
     or until it expires — so a call that never lands shows the truth again
     rather than leaving a number on screen that nothing backs. */
  _optGoal(id, real) {
    const o = this._goalOpt;
    if (!o || o.id !== id) return real;
    if (Date.now() > o.until) { this._goalOpt = null; return real; }
    if (real != null && Math.abs(real - o.value) < 0.01) { this._goalOpt = null; return real; }
    return o.value;
  }

  /* Bind exactly once per element. _bind runs after every patch, but a patch
     leaves unchanged regions untouched — so without this guard each repaint
     would stack another copy of every listener onto the surviving nodes. */
  _each(sel, fn) {
    this.shadowRoot.querySelectorAll(sel).forEach((el) => {
      if (!this._claim(el, sel)) return;
      fn(el);
    });
  }

  _one(id, fn) {
    const el = this.shadowRoot.getElementById(id);
    if (!el || !this._claim(el, "#" + id)) return;
    fn(el);
  }

  /* Marked per selector, not per element. One node can match more than one
     pass — a graph container is both [data-scrub] and, being inside a section,
     reachable from other selectors — and a single boolean would let the first
     pass claim it and the second silently skip it. That is the same shape of
     failure as a handler that is defined but never called. */
  _claim(el, key) {
    if (!el._psBound) el._psBound = {};
    if (el._psBound[key]) return false;
    el._psBound[key] = true;
    return true;
  }

  /* Handlers are attached once per element and then outlive many repaints, so
     nothing here may close over `hass` or `config` — a handler bound on the
     first render would otherwise still be reading that first render's states
     an hour later. Every handler reads this._hass / this._config live. */
  _bind() {
    const root = this.shadowRoot;

    this._each("[data-open]", (el) => {
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

    this._each("[data-info]", (el) => {
      if (!el.dataset.info) return;
      el.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        pcMoreInfo(this, el.dataset.info);
      });
    });

    /* Two-tap confirm for anything destructive: the first tap arms, the
       second runs. A modal would be heavier than the action deserves. */
    this._each("[data-arm]", (el) => {
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
          const sec = this._config.sections.find((x) => x.type === "climate");
          const svc = sec && sec.hold && sec.hold.cancel_service;
          if (svc && svc.indexOf(".") > 0) {
            const parts = svc.split(".");
            this._hass.callService(parts[0], parts[1], (sec.hold.cancel_data) || {});
          }
          this._render();
        } else if (k === "sdel") {
          this._schedDelete();
        } else if (k.indexOf("sy:") === 0) {
          /* Reboot, shut down, stop the array. The entity is in the key so
             this stays generic — the arm is the only thing core owns. */
          this._syArmedAction(k.slice(3));
        }
      });
    });

    this._each("[data-dismiss]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const rows = this._faults();
        const row = rows[parseInt(el.dataset.dismiss, 10)];
        if (row) this._dismiss(row);
      });
    });

    this._each("[data-nav]", (el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;   // the power button is not the row
        e.stopPropagation();
        const to = el.dataset.nav;
        if (!to || to.charAt(0) !== "#") psClosePopup();
        pcNavigate(this, to);
      });
    });

    this._each("[data-tvoff]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.dataset.tvoff;
        this._hass.callService(id.split(".")[0], "turn_off", { entity_id: id });
      });
    });

    this._each("[data-scope]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const v = el.dataset.scope;
        this._schedScope = v === "__base__" ? null : v;
        this._schedDay = null;
        this._schedEdit = null;
        this._render();
      });
    });
    this._each("[data-sday]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._schedDay = el.dataset.sday;
        this._schedEdit = null;
        this._render();
      });
    });

    this._each("[data-sedit]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const v = el.dataset.sedit;
        this._schedEdit = v === "new" ? "new" : parseInt(v, 10);
        this._schedNote = null;
        this._armed = null;
        this._render();
      });
    });
    this._one("ps-sretry", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._schedErr = null;
      this._render();
      this._fetchSchedule();
    }));
    this._one("ps-ssave", (el) =>
      el.addEventListener("click", (e) => { e.stopPropagation(); this._schedSave(); }));
    this._one("ps-scancel", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._schedEdit = null; this._schedNote = null; this._armed = null; this._render();
    }));
    /* Typing must not be eaten by the repaint, so the field owns its value
       until the query is submitted. */
    this._each("[data-f]", (el) => {
      el.addEventListener("pointerdown", () => { this._dragging = true; });
      el.addEventListener("blur", () => { this._dragging = false; });
      el.addEventListener("click", (e) => e.stopPropagation());
    });

    /* Search as you type. The field keeps focus — and therefore keeps
       _dragging set, or the patch would destroy the input mid-word — so the
       results are written straight into #ps-res rather than through _render.
       See _paintResults. */
    this._one("ps-q", (q) => {
      q.addEventListener("focus", () => { this._dragging = true; });
      q.addEventListener("blur", () => {
        this._dragging = false;
        /* The value typed while the repaint was suppressed is the truth; a
           later patch would otherwise restore the value from the last render. */
        this._query = q.value;
      });
      q.addEventListener("click", (e) => e.stopPropagation());
      q.addEventListener("input", () => this._queueSearch(q.value));
      q.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        /* Enter still means "now" — it just closes the keyboard as well. */
        if (this._searchT) clearTimeout(this._searchT);
        this._query = q.value;
        q.blur();
        this._runSearch();
      });
      q.addEventListener("search", () => this._queueSearch(q.value));
    });
    this._one("ps-qclear", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this._searchT) clearTimeout(this._searchT);
      this._query = ""; this._results = null; this._dragging = false;
      this._last = null;
      this._render();
    }));

    this._each("[data-mtype]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this._mtype === el.dataset.mtype) return;
        this._mtype = el.dataset.mtype;
        if (this._searchT) clearTimeout(this._searchT);
        /* Changing the filter with nothing typed just moves the chip. */
        if ((this._query || "").trim()) this._runSearch();
        else this._paintResults();
      });
    });

    this._each("[data-queue]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const list = el.dataset.from === "recent" ? this._recent : (this._results || []);
        const it = list[parseInt(el.dataset.queue, 10)];
        if (it) this._enqueueUri(it.uri, it.kind);
      });
    });

    this._each("[data-join]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._toggleJoin(el.dataset.join);
      });
    });

    this._one("ps-move", (el) =>
      el.addEventListener("click", (e) => { e.stopPropagation(); this._moveHere(); }));
    this._one("ps-shuf", (el) =>
      el.addEventListener("click", (e) => { e.stopPropagation(); this._setShuffle(); }));
    this._one("ps-rep", (el) =>
      el.addEventListener("click", (e) => { e.stopPropagation(); this._cycleRepeat(); }));

    this._each("[data-play]", (el) => {
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

    this._each("[data-pinplay]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const p = this._pins[parseInt(el.dataset.pinplay, 10)];
        if (p) this._playUri(p.uri, "playlist");
      });
    });

    this._each("[data-sheet]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = el.dataset.sheet;
        this._sheet = this._sheet === k ? null : k;
        this._render();
      });
    });

    this._one("ps-alert", (el) => el.addEventListener("click", () => {
      this._sheet = this._sheet === "alerts" ? null : "alerts";
      this._render();
    }));
    ["ps-close", "ps-scrim"].forEach((id) => {
      this._one(id, (el) =>
        el.addEventListener("click", () => { this._sheet = null; this._render(); }));
    });

    this._each("[data-step]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = this._config.sections.find((s) => s.type === "climate");
        if (!sec) return;
        const id = sec.goal || sec.thermostat;
        const st = this._hass.states[id];
        if (!st || st.attributes.temperature == null) return;
        /* Step from what is ON SCREEN, not from what the thermostat last
           said. GTTC takes several seconds to acknowledge a setpoint, and
           reading the live attribute meant a second tap inside that window
           recomputed the SAME number — so the goal could not be moved more
           than one step at a time however fast you pressed. */
        const base = this._optGoal(id, st.attributes.temperature);
        const step = parseInt(el.dataset.step, 10) * (sec.step || 1);
        const next = Math.round((base + step) * 10) / 10;
        this._goalOpt = { id, value: next, until: Date.now() + 12000 };
        this._last = null;
        this._render();
        /* One call for a burst of taps: three quick presses are one setpoint,
           not three, and the last one wins. */
        clearTimeout(this._goalSend);
        this._goalSend = setTimeout(() => {
          this._hass.callService("climate", "set_temperature", { entity_id: id, temperature: next });
        }, 450);
      });
    });

    this._each("[data-zone]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = this._config.sections.find((s) => s.type === "climate");
        if (!sec || !sec.zones || !sec.zones.select) return;
        this._hass.callService("select", "select_option", {
          entity_id: sec.zones.select, option: el.dataset.zone,
        });
      });
    });

    this._each("[data-tile]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = this._config.sections.find((s) => s.type === "quick");
        const t = sec && sec.tiles[parseInt(el.dataset.tile, 10)];
        if (!t) return;
        /* A tile can open one of the shell's own sheets. Lovelace has no such
           action, so it is handled here rather than in pcAction — which knows
           nothing about the shell it happens to be running inside. */
        const ta = t.tap_action || {};
        if (ta.action === "sheet" && ta.sheet) {
          psClosePopup();
          this._sheet = this._sheet === ta.sheet ? null : ta.sheet;
          this._render();
          return;
        }
        pcAction(this, this._hass, t.tap_action, t.entity);
      });
    });

    this._each("[data-group]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = el.dataset.group;
        if (this._openGroups[k]) delete this._openGroups[k];
        else this._openGroups[k] = true;
        this._render();
      });
    });

    this._each("[data-toggle]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._hass.callService("homeassistant", "toggle", { entity_id: el.dataset.toggle });
      });
    });

    this._each("[data-url]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(el.dataset.url, "_blank");
      });
    });

    this._each("[data-mp]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._hass.callService("media_player", "media_play_pause", { entity_id: el.dataset.entity });
      });
    });

    this._each("[data-mpc]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const ids = el.dataset.all === "1" ? this._targets() : [el.dataset.entity].filter(Boolean);
        if (!ids.length) return;
        this._hass.callService("media_player", el.dataset.mpc, { entity_id: ids });
      });
    });

    this._each("[data-mute]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!el.dataset.mute) return;
        this._hass.callService("media_player", "volume_mute", {
          entity_id: el.dataset.mute, is_volume_muted: el.dataset.muted !== "true",
        });
      });
    });

    this._each("[data-vol]", (el) => {
      const hold = () => { this._dragging = true; };
      const release = () => {
        this._dragging = false;
        if (!el.dataset.vol) return;
        this._hass.callService("media_player", "volume_set", {
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
    this._each("[data-pick]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._togglePick(el.dataset.pick);
      });
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        pcMoreInfo(this, el.dataset.pick);
      });
    });

    this._each("[data-pin]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._togglePin(el.dataset.pin, el.dataset.pinname, el.dataset.pinkind);
      });
    });

    this._each("[data-preset]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = this._config.sections.find((s) => s.type === "music");
        const p = sec && (sec.presets || [])[parseInt(el.dataset.preset, 10)];
        /* A preset goes to the room you picked, like everything else here. It
           used to ignore the pick and go to whatever happened to be playing. */
        const target = this._activePlayer();
        if (!p || !target) return;
        this._hass.callService("music_assistant", "play_media", {
          entity_id: target, media_id: p.uri, media_type: p.media_type || "playlist",
        });
      });
    });

    this._each("[data-dbtn]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const [di, bi] = el.dataset.dbtn.split("|").map((x) => parseInt(x, 10));
        const sec = this._config.sections.find((x) => x.type === "systems");
        const b = sec && ((sec.devices || [])[di] || {}).buttons;
        if (b && b[bi]) pcAction(this, this._hass, b[bi].tap_action, null);
      });
    });

    this._each("[data-gbtn]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const [gname, idx] = el.dataset.gbtn.split("|");
        const sec = this._config.sections.find((s) => s.type === "systems");
        const g = sec && (sec.groups || []).find((x) => x.name === gname);
        const b = g && (g.buttons || [])[parseInt(idx, 10)];
        if (b) pcAction(this, this._hass, b.tap_action, null);
      });
    });

    /* A row can be the way into a mode as well as a dock button — the
       PurdyNAS row on the landing page opens the server pages rather than
       expanding a smaller copy of them beside the real thing. */
    this._each("[data-mode]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        psClosePopup();
        this._sheet = null;
        this._mode = el.dataset.mode;
        this._expandWatched();
        this._render();
      });
    });

    this._each("[data-dock]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const d = (this._config.dock || [])[parseInt(el.dataset.dock, 10)];
        if (!d) return;
        /* `alert_when_faults` is a BADGE, not a destination. It was hijacking
           the bell: with any fault raised — and the low-battery rule means
           there usually is one — tapping Notifications opened the attention
           list instead of the notification log, so the log was effectively
           unreachable. Faults already have their own way in, the chip in the
           header. So the flag only becomes an action for an entry that has no
           destination of its own. */
        if (d.alert_when_faults && this._faults().length
            && !d.sheet && !d.section && !d.link) {
          psClosePopup();
          this._sheet = "alerts";
          this._render();
          return;
        }
        /* A mode replaces the column AND the dock. Checked before `sheet` so
           an entry can carry both and the mode wins — the sheet would open
           behind a dock that no longer has a button to close it. */
        if (d.mode) {
          psClosePopup();
          this._sheet = null;
          this._mode = d.mode;
          /* Re-discover on entry: this is the moment the list of containers
             and disks actually matters, and it is cheap enough to do once. */
          this._expandWatched();
          this._render();
          return;
        }
        /* A sheet slides over the column instead of expanding inside it, so it
           never moves what is under your thumb. */
        if (d.sheet) {
          psClosePopup();
          this._sheet = this._sheet === d.sheet ? null : d.sheet;
          this._render();
          return;
        }
        if (d.section) {
          psClosePopup();
          this._open = this._open === d.section ? null : d.section;
          this._render();
          const sect = root.querySelector(`[data-sect="${d.section}"]`);
          if (sect && sect.scrollIntoView) sect.scrollIntoView({ behavior: "smooth", block: "start" });
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
    this._each("[data-scrub]", (box) => {
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
        } else if (kind === "cpu") {
          const d = this._cpuData;
          if (!d) return;
          const t = d.t0 + f * (d.t1 - d.t0);
          let best = d.pts[0];
          for (const q of d.pts) if (Math.abs(q.t - t) < Math.abs(best.t - t)) best = q;
          html = `<b>${best.v.toFixed(1)}%</b>` +
            `<span>${new Date(best.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>`;
        } else if (kind === "night") {
          /* The nursery rail. Unlike the hypnogram there is no state series to
             sample — just two phases and a set of point events — so the
             readout answers "what was happening here, and how far into the
             night is it". */
          const d = this._nightData;
          if (!d) return;
          const t = d.from + f * (d.to - d.from);
          const tol = (d.to - d.from) / 90;
          const near = (d.events || []).find((e) => Math.abs(e - t) <= tol);
          const into = Math.max(0, Math.round((t - d.from) / 60000));
          const phase = near
            ? ["var(--ps-warn)", "went in"]
            : t < d.settledAt ? ["var(--ps-light)", "settling"] : ["var(--ps-deep)", "asleep"];
          html = `<b>${new Date(near || t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</b>` +
            `<span><i style="background:${phase[0]}"></i>${phase[1]}</span>` +
            `<span>${psDur(into)} in</span>`;
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
  /* The bundle is one concatenated script, so its free functions are not
     reachable from a test that evals it. This is the seam they come out of. */
  static get helpers() {
    return {
      minsToClock: psMinsToClock, dur: psDur, esc: psEsc, isMusic: psIsMusic, parseTs: psParseTs,
      numOf: pcNumOf, reading: pcReading, offline: pcOffline, ringArc: pcRingArc, ringAngle: pcRingAngle, ringRotate: pcRingRotate,
      sparkPoly: pcSparkPoly, downsample: pcDownsample,
      nurserySessions: psNurserySessions, nurseryStats: psNurseryStats, dayKey: psDayKey, hm: psHM,
    };
  }

  static get styles() {
    return PS_STYLES;
  }
}

