/*
 * Purdy Cards
 * One bundle, one resource, one version — the custom Lovelace cards for this house.
 *
 *   climate-panel-card   full climate panel, plus a `compact:` mode for the home screen
 *   sleep-panel-card     full infant sleep panel, plus a `ribbon:` mode for the home screen
 *
 * Both cards keep their original type strings, so existing dashboard config
 * needs no changes when migrating from the standalone repos.
 *
 * No build step, no dependencies — plain web components.
 * https://github.com/mbwp1234/purdy-cards
 */

const PC_VERSION = "1.56.0";

/* Shared design tokens. Every card derives its own prefixed variables from
   these, so a colour or radius changes in exactly one place.
 *
 * The three SCALES below exist because the shell had grown 17 distinct font
 * sizes, 15 radii and 13 near-identical surface tints — differences of half a
 * pixel or two percent of alpha that nobody reads as hierarchy, only as slight
 * inconsistency. Anything new picks a step; it does not invent one.
 */
const PC_TOKENS = `
        --pc-panel: var(--ha-card-background, var(--card-background-color, #181f26));
        --pc-panel-2: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.07);
        --pc-line: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.10);
        --pc-track: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.12);
        --pc-chip: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.08);
        --pc-text: var(--primary-text-color, #e6ecf2);
        --pc-muted: var(--secondary-text-color, #8b96a3);
        --pc-heat: #ff9557;
        --pc-cool: #4dd0e1;
        --pc-good: #81c995;
        --pc-warn: #f2c14e;
        --pc-bad: #ef6a6a;
        --pc-radius: 24px;
        /* The cool wash across the top of a panel, lifted from the climate
           card's weather strip so every panel opens the same way. */
        --pc-tint: rgba(77, 208, 225, 0.10);

        /* type — seven steps. micro is the floor: 8.5px uppercase was below
           what a phone at arm's length in daylight can resolve. */
        --pc-fs-micro: 10px;
        --pc-fs-xs: 11px;
        --pc-fs-sm: 12px;
        --pc-fs-md: 13px;
        --pc-fs-lg: 15px;
        --pc-fs-xl: 18px;
        --pc-fs-2xl: 22px;
        /* One step above the scale's old ceiling, added deliberately rather
           than as a loose pixel. Every other big number on the card sits inside
           a ring, which is what gives it its weight; the weather section's
           reading has no ring, so the numeral itself has to carry the hero
           role. 2xl at 22px reads as a chip beside the min/avg/max tiles. */
        --pc-fs-3xl: 40px;

        /* radius */
        --pc-r-hair: 2px;
        --pc-r-xs: 9px;
        --pc-r-sm: 11px;
        --pc-r-md: 14px;
        --pc-r-lg: 17px;
        --pc-r-xl: 20px;
        --pc-r-2xl: 26px;
        --pc-r-pill: 999px;

        /* surfaces, on a dark ground — three fills and one hairline */
        --pc-fill-1: rgba(255, 255, 255, 0.055);
        --pc-fill-2: rgba(255, 255, 255, 0.08);
        --pc-fill-3: rgba(255, 255, 255, 0.11);
        --pc-edge: rgba(255, 255, 255, 0.10);
`;

/* Define an element only once. If a standalone build of the same card is still
   registered as a dashboard resource, defining again would throw and take the
   whole bundle down — so warn instead, and say how to fix it. */
function pcDefine(name, cls) {
  if (customElements.get(name)) {
    console.warn(
      `[purdy-cards] <${name}> is already defined by another resource. ` +
      `Remove the standalone card's HACS entry and its dashboard resource — ` +
      `until then the older card wins and compact/ribbon modes will not work.`
    );
    return;
  }
  customElements.define(name, cls);
}

/* Navigate to a dashboard path or open a Bubble Card hash popup. */
function pcNavigate(node, path) {
  if (!path) return;
  if (path.charAt(0) === "#") {
    window.location.hash = path;
    return;
  }
  history.pushState(null, "", path);
  const ev = new Event("location-changed", { bubbles: true, composed: true });
  ev.detail = { replace: false };
  node.dispatchEvent(ev);
}

/* ============================================================================
 * Shared primitives
 *
 * Everything here had two or more copies across the cards. A copy is fine
 * until one of them is fixed and the others are not — which had already
 * happened to the escaper below.
 *
 * What is deliberately NOT here: the hypnogram, the temperature graph and the
 * ring markup. Those look like duplicates and are not. The sleep card samples
 * fixed-width bars across a session; the shell draws one step per state change
 * with risers between lanes. They are different pictures of the same data, and
 * folding them together would mean picking one and changing how the other view
 * looks. Only the geometry they genuinely agree on is shared.
 * ========================================================================== */

/* One escaper. There were four, and the shell's quietly omitted the apostrophe
   — harmless inside double-quoted attributes, which is exactly why nobody
   noticed it drift. */
const PC_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function pcEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => PC_ESC[c]);
}

/* The end of a history window, and it is NEVER optional.
 *
 * `/api/history/period/<start>` does not default end_time to "now" — it
 * defaults to **start + 1 day**. So a window that reaches back further than
 * 24 hours silently stops short of the present by exactly the overshoot, and
 * the caller gets a plausible-looking series with the newest data missing:
 *
 *   26h window  ->  ends 2h ago   (the hypnogram, the temperature graph)
 *   48h window  ->  ends 24h ago  (recently played)
 *
 * The failure has no error and no gap in the data — the last sample simply
 * gets stretched to the right-hand edge. That is how a hypnogram came to be
 * one flat orange "awake" bar all evening: the only row inside the window was
 * a stale 8:04 PM reading, painted across to now.
 */
function pcNowIso() {
  return new Date().toISOString();
}

/* Read a state or one of its attributes as a number, or null. Anything
   non-finite is null so a caller can tell "no reading" from "zero" — the
   distinction the whole failure-state pass depends on. */
function pcNumOf(st, attr) {
  if (!st) return null;
  const n = parseFloat(attr ? st.attributes[attr] : st.state);
  return Number.isFinite(n) ? n : null;
}

/* Why a reading is missing, so a card can say so rather than draw a zero.
   `pcNum(...) || 0` is the shape that hides this: a sock that is off and a
   baby who slept nothing produce the same empty ring. */
function pcReading(hass, id) {
  if (!id) return { ok: false, why: "unset" };
  if (!hass || !hass.states) return { ok: false, why: "offline" };
  const st = hass.states[id];
  if (!st) return { ok: false, why: "missing" };
  if (st.state === "unavailable") return { ok: false, why: "unavailable" };
  if (st.state === "unknown") return { ok: false, why: "unknown" };
  return { ok: true, st, n: pcNumOf(st) };
}

/* True once HA has told us the connection dropped. Everything on screen is
   last-known-good from that moment on, and the header says so. */
function pcOffline(hass) {
  return !!hass && hass.connected === false;
}

/* Ring geometry. Every ring in this bundle is a 270° sweep starting at 135°,
   and every one of them had its own copy of the marker derivation — including
   three separate comments explaining the same +90.
   The markup stays per-card: radii, stroke widths and colours legitimately
   differ, and the sleep ring butts its segments where the others round them. */
const PC_RING_START = 135;
const PC_RING_SWEEP = 270;

function pcRingArc(r) {
  return 2 * Math.PI * r * (PC_RING_SWEEP / 360);
}

/* Where a fraction sits on the ring, in degrees. */
function pcRingAngle(frac) {
  return PC_RING_START + PC_RING_SWEEP * Math.max(0, Math.min(1, frac));
}

/* Rotation for a marker authored upright at 12 o'clock. The ring is measured
   from 3 o'clock, so an upright tick needs the extra quarter turn. */
function pcRingRotate(frac) {
  return pcRingAngle(frac) + 90;
}

/* Sparkline geometry, shared the same way the ring geometry is: the maths is
   genuinely identical, the markup stays per-card because the sizes, colours and
   tokens differ. Bucket-average down to `n` points, then map to a polyline.

   `vmax - vmin < 1` widens a flat series deliberately — a room that held 72.4°
   all day should read as a flat line through the middle, not as noise
   amplified to fill the box. */
function pcDownsample(series, n) {
  const k = n || 60;
  if (!series || series.length <= k) return series;
  const out = [];
  const bucket = series.length / k;
  for (let i = 0; i < k; i++) {
    const slice = series.slice(Math.floor(i * bucket), Math.floor((i + 1) * bucket) || 1);
    if (!slice.length) continue;
    const v = slice.reduce((a, p) => a + p.v, 0) / slice.length;
    out.push({ t: slice[Math.floor(slice.length / 2)].t, v });
  }
  return out;
}

/* null — never a flat line — when there is nothing to draw. A sparkline that
   invents a straight line through the middle of an empty box is the same lie
   as a ring that reads zero because the sock is off. */
/* `minSpan` is the narrowest range the plot is allowed to fill its height
   with. A room that holds within a degree is steady, not noisy, and a CPU that
   idles between 7% and 11% is idle — auto-scaling either one draws a mountain
   range out of nothing. Defaults to 1 (the temperature case it was written
   for) so the existing callers are unchanged. */
/* `scale` is an optional {lo, hi} imposed from outside. Without it every
   sparkline auto-scales to its own data, which is right for a lone sparkline
   and wrong for a COLUMN of them: a bedroom drifting half a degree is drawn
   with the same amplitude as a room swinging four, so the list invites a
   comparison it cannot support. The caller that owns the column passes one
   scale for all of them. */
function pcSparkPoly(points, w, h, pad, minSpan, scale) {
  if (!points || points.length < 2) return null;
  const p = pad == null ? 4 : pad;
  const floor = minSpan == null ? 1 : minSpan;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  let vmin = Infinity, vmax = -Infinity;
  if (scale && Number.isFinite(scale.lo) && Number.isFinite(scale.hi)) {
    vmin = scale.lo; vmax = scale.hi;
  } else {
    points.forEach((q) => { vmin = Math.min(vmin, q.v); vmax = Math.max(vmax, q.v); });
  }
  if (vmax - vmin < floor) {
    const grow = (floor - (vmax - vmin)) / 2;
    vmax += grow; vmin -= grow;
  }
  const span = t1 - t0 || 1;
  return points.map((q) => {
    const x = ((q.t - t0) / span) * w;
    /* An imposed scale can be narrower than a given room's own range, so the
       line is clamped into the box rather than drawn outside it. */
    const f = Math.max(0, Math.min(1, (q.v - vmin) / (vmax - vmin)));
    const y = p + (1 - f) * (h - p * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

/* An MA player also proxies whatever else its source device is doing, so a
   player is showing *music* only when the app or the content type says so —
   otherwise a TV episode raises a phantom now-playing row. */
const PC_MUSIC_TYPES = ["music", "playlist", "track", "album", "radio"];
/* Apps that stream video however they label their content. Matched as a
   substring so the short slug ("twitch") and the android package
   ("tv.twitch.android.app") are both covered by one entry. */
const PC_VIDEO_APPS = ["twitch", "netflix", "youtube", "disney", "amazonvideo",
  "primevideo", "peacock", "jellyfin", "hulu", "hbo", "max", "plex", "f1tv",
  "formula1", "emby", "kodi", "paramount", "crunchyroll"];
function pcIsMusicState(st) {
  if (!st) return false;
  const a = st.attributes || {};
  if (a.app_id === "music_assistant") return true;
  /* "Any foreign app_id is not music" was the first fix for a Twitch stream
     arriving through its MA mirror as media_content_type "music" with app_id
     "twitch" — and it over-corrected badly. Spotify on the kitchen speaker and
     a sleep-sounds app in the bedroom are both genuinely music with a foreign
     app_id, and both were silently missing from the now-playing section, the
     dock bar and the room list the whole time they played. Hiding real music
     produces no error and no gap, so it goes unnoticed; a phantom row does not.
     Name the video apps instead of rejecting everything unfamiliar. */
  const app = String(a.app_id || "").toLowerCase();
  if (app && PC_VIDEO_APPS.some((v) => app.indexOf(v) >= 0)) return false;
  /* Two guards that hold whatever the app is. The content type has to agree,
     and a foreign app needs a title — the missing title is the only thing that
     kept the original Twitch stream from raising a row, since it claimed
     "music" outright. */
  if (app && !a.media_title) return false;
  return PC_MUSIC_TYPES.indexOf(a.media_content_type) >= 0;
}

/* A player's media_title is not evidence that anything is playing. An idle
   Music Assistant player KEEPS its title and its artwork for hours — the living
   room still reported "Bluey Theme Tune" long after it stopped — so reading the
   attribute without the state is how a silent house grows a now-playing row.
   The title is only true while the queue is; a paused track still is.

   This is one function rather than the check written out at each surface
   because it had already been inlined four times and was wrong in two of them:
   the desk card was fixed for it and the shell's music sheet and pin button
   never were, which is precisely what "the same rule in four places" buys. */
function pcLiveMusicState(st) {
  if (!st) return null;
  if (st.state !== "playing" && st.state !== "paused") return null;
  if (!pcIsMusicState(st) || !st.attributes.media_title) return null;
  return st;
}


/* ---------------------------------------------------------------- weather --*/
/* One condition map. There were FOUR — the climate panel, the home cards, the
   shell's status strip and the desk's — and every one of them was missing
   `lightning-rainy`, `exceptional`, `snowy-rainy` and `windy-variant`, which
   between them are what the National Weather Service returns for most of a
   thunderstorm week. A name the map does not have draws no icon at all: the
   row silently loses its glyph and measures narrower than its neighbours,
   which is precisely the bug class the shoot harness's dotted box exists to
   catch. HA publishes a CLOSED set of conditions, so it is named in full.

   Text as well as icons, for the same reason the desk needed it: the states
   are slugs with no separator, so a generic humaniser turns `partlycloudy`
   into "Partlycloudy" and `clear-night` into "Clear-night". */
const PC_WX_ICON = {
  "clear-night": "mdi:weather-night",
  clear: "mdi:weather-night",
  cloudy: "mdi:weather-cloudy",
  /* Not a bare alert triangle. In a row of weather glyphs that reads as a
     rendering error rather than as weather — and NWS uses `exceptional` for heat
     advisories, which is a kind of weather. */
  exceptional: "mdi:weather-sunny-alert",
  fog: "mdi:weather-fog",
  hail: "mdi:weather-hail",
  lightning: "mdi:weather-lightning",
  "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring",
  rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
};

const PC_WX_TEXT = {
  "clear-night": "Clear", clear: "Clear", partlycloudy: "Partly cloudy",
  "lightning-rainy": "Thunderstorms", "snowy-rainy": "Sleet",
  "windy-variant": "Windy", exceptional: "Severe", pouring: "Heavy rain",
  hail: "Hail", lightning: "Lightning", fog: "Fog", cloudy: "Cloudy",
  rainy: "Rain", snowy: "Snow", sunny: "Sunny", windy: "Windy",
};

/* An unknown condition falls back to a neutral glyph rather than to nothing —
   a blank where every sibling has an icon reads as a rendering fault. */
function pcWxIcon(cond) {
  return PC_WX_ICON[String(cond || "")] || "mdi:weather-cloudy";
}

function pcWxText(cond) {
  const c = String(cond || "");
  if (!c) return "";
  if (PC_WX_TEXT[c]) return PC_WX_TEXT[c];
  return c.charAt(0).toUpperCase() + c.slice(1).replace(/[-_]+/g, " ");
}

/* Local day key. toISOString() rolls the day at the wrong moment west of
   Greenwich: an 8pm reading would file itself under tomorrow, and "last night"
   would point at the wrong date all morning. The nursery card learned this
   once already. */
function pcDayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const CPC_VERSION = "1.1.4";

const CPC_DEFAULTS = {
  title: "Climate",
  step: 0.5,
  hold_debounce_ms: 1200,
  ring: { min: 60, max: 80 },
  graph: { hours: 24 },
  history_refresh_minutes: 5,
};

class ClimatePanelCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._watched = [];
    this._lastStates = null;
    this._history = {}; // entity_id -> [{t, v}]
    this._forecast = null;
    this._forecastUnsub = null;
    this._historyTimer = null;
    this._pendingTarget = null; // optimistic goal while stepping
    this._pendingTimer = null;
    this._armTimer = null;
    this._rendered = false;
    this._graphMeta = null; // hover metadata for the trend graph
    this._modalOpen = false; // schedule editor overlay
    this._sched = null;
    this._schedDay = null;
    this._schedEdit = null; // entry being edited, or "new"
    this._schedNote = null;
  }

  /* ---------------- config ---------------- */

  setConfig(config) {
    if (!config || !config.thermostat) {
      throw new Error("climate-panel-card: 'thermostat' (a climate entity) is required");
    }
    this._config = {
      ...CPC_DEFAULTS,
      ...config,
      ring: { ...CPC_DEFAULTS.ring, ...(config.ring || {}) },
      graph: { ...CPC_DEFAULTS.graph, ...(config.graph || {}) },
    };
    this._watched = this._collectWatched();
    this._rendered = false;
    this._lastStates = null;
  }

  static getStubConfig(hass) {
    const climate = Object.keys(hass.states).find((e) => e.startsWith("climate."));
    return { thermostat: climate || "climate.thermostat" };
  }

  getCardSize() {
    return this._config && this._config.compact ? 3 : 6;
  }

  _collectWatched() {
    const c = this._config;
    const ids = new Set([c.thermostat]);
    const add = (v) => v && typeof v === "string" && v.includes(".") && ids.add(v);
    add(c.goal);
    add(c.current_temp);
    add(c.weather);
    if (c.outside) { add(c.outside.temp); add(c.outside.humidity); }
    if (c.graph) { add(c.graph.inside); add(c.graph.outside); }
    if (c.status_text) add(c.status_text.entity);
    if (c.hold) { add(c.hold.remaining); add(c.hold.status); }
    if (c.zones) {
      add(c.zones.select);
      (c.zones.options || []).forEach((z) => add(z.temp));
    }
    (c.chips || []).forEach((ch) => {
      add(ch.entity);
      if (ch.visible) add(ch.visible.entity);
    });
    (c.rooms || []).forEach((r) => { add(r.temp); add(r.humidity); });
    return [...ids];
  }

  /* ---------------- hass updates ---------------- */

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    if (!this._historyTimer) this._startHistory();
    if (this._config.weather && !this._forecastUnsub) this._subscribeForecast();

    const snapshot = this._watched
      .map((id) => {
        const s = hass.states[id];
        return s ? `${id}:${s.state}:${s.attributes.temperature}:${s.attributes.current_temperature}:${s.attributes.hvac_action}:${s.attributes.from_thermostat}` : `${id}:missing`;
      })
      .join("|");

    if (snapshot !== this._lastStates) {
      this._lastStates = snapshot;
      this._scheduleRender();
    }
  }

  _scheduleRender() {
    // Don't repaint under the user's finger while a confirm is armed
    // or while the schedule editor is open
    if (this._modalOpen || this.shadowRoot.querySelector(".armed")) {
      clearTimeout(this._deferredRender);
      this._deferredRender = setTimeout(() => this._scheduleRender(), 1500);
      return;
    }
    if (this._renderQueued) return;
    this._renderQueued = true;
    requestAnimationFrame(() => {
      this._renderQueued = false;
      this._render();
    });
  }

  connectedCallback() {
    if (this._config && this._hass) {
      this._startHistory();
      if (this._config.weather) this._subscribeForecast();
    }
  }

  disconnectedCallback() {
    clearInterval(this._historyTimer);
    this._historyTimer = null;
    if (this._forecastUnsub) {
      this._forecastUnsub.then((u) => u()).catch(() => {});
      this._forecastUnsub = null;
    }
  }

  /* ---------------- data helpers ---------------- */

  _st(id) {
    return id && this._hass ? this._hass.states[id] : undefined;
  }

  _num(id, attr) {
    return pcNumOf(this._st(id), attr);
  }

  _fmt(n, digits = 1) {
    if (n === null || n === undefined) return "—";
    const r = Number(n.toFixed(digits));
    return `${r}`;
  }

  _esc(s) {
    return pcEsc(s);
  }

  _goalEntity() {
    return this._config.goal || this._config.thermostat;
  }

  _currentTemp() {
    const c = this._config;
    if (c.current_temp) return this._num(c.current_temp);
    return this._num(c.thermostat, "current_temperature");
  }

  _targetTemp() {
    if (this._pendingTarget !== null) return this._pendingTarget;
    return this._num(this._goalEntity(), "temperature");
  }

  _visible(cond) {
    if (!cond) return true;
    if (Array.isArray(cond)) return cond.every((c) => this._visible(c));
    const s = this._st(cond.entity);
    if (!s) return false;
    if (cond.state !== undefined) return s.state === cond.state;
    const n = parseFloat(s.state);
    if (!Number.isFinite(n)) return false;
    if (cond.above !== undefined && !(n > cond.above)) return false;
    if (cond.below !== undefined && !(n < cond.below)) return false;
    return true;
  }

  /* ---------------- history + forecast ---------------- */

  _historyEntities() {
    const c = this._config;
    const ids = new Set();
    if (c.graph && c.graph.inside) ids.add(c.graph.inside);
    if (c.graph && c.graph.outside) ids.add(c.graph.outside);
    (c.rooms || []).forEach((r) => r.temp && ids.add(r.temp));
    return [...ids];
  }

  _startHistory() {
    const fetch = () => this._fetchHistory();
    fetch();
    clearInterval(this._historyTimer);
    this._historyTimer = setInterval(fetch, (this._config.history_refresh_minutes || 5) * 60 * 1000);
  }

  async _fetchHistory() {
    if (!this._hass) return;
    const ids = this._historyEntities();
    if (!ids.length) return;
    const hours = this._config.graph.hours || 24;
    const start = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    try {
      const res = await this._hass.callApi(
        "GET",
        /* end_time is not optional — see pcNowIso. */
        `history/period/${start}?filter_entity_id=${ids.join(",")}` +
        `&end_time=${encodeURIComponent(pcNowIso())}&minimal_response&no_attributes`
      );
      const hist = {};
      (res || []).forEach((series) => {
        if (!series || !series.length) return;
        const id = series[0].entity_id;
        hist[id] = series
          .map((p) => ({ t: new Date(p.last_changed).getTime(), v: parseFloat(p.state) }))
          .filter((p) => Number.isFinite(p.v));
      });
      this._history = hist;
      this._lastStates = null; // force repaint with fresh graphs
      if (this._hass) this.hass = this._hass;
    } catch (e) {
      // History is decoration; never break the card over it.
    }
  }

  async _subscribeForecast() {
    if (!this._hass || !this._config.weather) return;
    try {
      this._forecastUnsub = this._hass.connection.subscribeMessage(
        (msg) => {
          this._forecast = msg.forecast || null;
          this._lastStates = null;
          if (this._hass) this.hass = this._hass;
        },
        { type: "weather/subscribe_forecast", entity_id: this._config.weather, forecast_type: "daily" }
      );
    } catch (e) {
      this._forecastUnsub = null;
    }
  }

  /* ---------------- actions ---------------- */

  _moreInfo(entityId) {
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  _step(dir) {
    const goal = this._goalEntity();
    const s = this._st(goal);
    if (!s || s.attributes.temperature === undefined) return;
    const step = this._config.step || s.attributes.target_temp_step || 0.5;
    const base = this._pendingTarget !== null ? this._pendingTarget : parseFloat(s.attributes.temperature);
    if (!Number.isFinite(base)) return;
    let next = base + dir * step;
    const min = s.attributes.min_temp, max = s.attributes.max_temp;
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);
    this._pendingTarget = Math.round(next * 2) / 2;

    const el = this.shadowRoot.querySelector("[data-goal-value]");
    if (el) {
      el.textContent = `${this._fmt(this._pendingTarget)}°`;
      el.classList.add("pending");
    }

    clearTimeout(this._pendingTimer);
    this._pendingTimer = setTimeout(() => {
      const value = this._pendingTarget;
      this._pendingTarget = null;
      if (value === null) return;
      this._hass.callService("climate", "set_temperature", {
        entity_id: goal,
        temperature: value,
      });
    }, this._config.hold_debounce_ms);
  }

  _runAction(action, el) {
    if (!action) return;
    if (action === "more-info" || action.action === "more-info") {
      this._moreInfo(action.entity || el.dataset.entity);
      return;
    }
    if (action.navigate) {
      if (action.navigate.startsWith("#")) {
        window.location.hash = action.navigate;
      } else {
        history.pushState(null, "", action.navigate);
        const ev = new Event("location-changed", { bubbles: true, composed: true });
        this.dispatchEvent(ev);
      }
      return;
    }
    if (action.service) {
      const run = () => {
        const [domain, service] = action.service.split(".");
        this._hass.callService(domain, service, action.data || {});
      };
      if (action.confirm) {
        this._armOrRun(el, action.confirm, run);
      } else {
        run();
      }
    }
  }

  // Two-tap confirm: first tap arms the control for 3s, second tap fires.
  _armOrRun(el, label, run) {
    if (el.classList.contains("armed")) {
      el.classList.remove("armed");
      clearTimeout(this._armTimer);
      run();
      return;
    }
    this.shadowRoot.querySelectorAll(".armed").forEach((a) => this._disarm(a));
    el.classList.add("armed");
    el.dataset.restore = el.innerHTML;
    el.innerHTML = `<span class="arm-label">${this._esc(typeof label === "string" ? label : "Tap again to confirm")}</span>`;
    clearTimeout(this._armTimer);
    this._armTimer = setTimeout(() => this._disarm(el), 3000);
  }

  _disarm(el) {
    if (!el || !el.classList.contains("armed")) return;
    el.classList.remove("armed");
    if (el.dataset.restore) {
      el.innerHTML = el.dataset.restore;
      delete el.dataset.restore;
    }
  }

  /* ---------------- svg builders ---------------- */

  _ringSvg(cur, goal) {
    const { min, max } = this._config.ring;
    const R = 46, C = 2 * Math.PI * R;
    const TRACK = pcRingArc(R);
    const frac = cur === null ? 0 : Math.min(1, Math.max(0, (cur - min) / (max - min)));
    const fill = frac * TRACK;
    const hvac = this._st(this._config.thermostat);
    const action = hvac && hvac.attributes.hvac_action;
    const color = action === "heating" ? "var(--cpc-heat)" : action === "cooling" ? "var(--cpc-cool)" : "var(--cpc-idle-ring)";
    let marker = "";
    if (goal !== null && Number.isFinite(goal)) {
      const gfrac = Math.min(1, Math.max(0, (goal - min) / (max - min)));
      const rot = pcRingRotate(gfrac);
      marker = `<line x1="54" y1="3" x2="54" y2="13" stroke="var(--cpc-muted)" stroke-width="2.5" stroke-linecap="round" transform="rotate(${rot.toFixed(1)} 54 54)"/>`;
    }
    return `
      <svg viewBox="0 0 108 108" width="108" height="108" aria-hidden="true">
        <circle cx="54" cy="54" r="${R}" fill="none" stroke="var(--cpc-track)" stroke-width="8"
          stroke-dasharray="${TRACK} ${C}" stroke-linecap="round" transform="rotate(135 54 54)"/>
        <circle cx="54" cy="54" r="${R}" fill="none" stroke="${color}" stroke-width="8"
          stroke-dasharray="${Math.max(0.001, fill)} ${C}" stroke-linecap="round" transform="rotate(135 54 54)"/>
        ${marker}
      </svg>`;
  }

  /* Both delegate to the shared geometry in 05-shared.js — same maths, one
     copy. The markup stays here because the sizes and tokens are this card's. */
  _polyline(points, w, h, pad = 4) {
    return pcSparkPoly(points, w, h, pad);
  }

  _downsample(series, n = 60) {
    return pcDownsample(series, n);
  }

  _graphSvg() {
    const g = this._config.graph || {};
    const W = 360, H = 74, PAD = 6;
    const series = [];
    const addSeries = (id, label, color, width, opacity) => {
      const pts = this._downsample(this._history[id]);
      if (!pts || pts.length < 2) return;
      let vmin = Infinity, vmax = -Infinity;
      pts.forEach((p) => { vmin = Math.min(vmin, p.v); vmax = Math.max(vmax, p.v); });
      if (vmax - vmin < 1) { vmax += 0.5; vmin -= 0.5; }
      series.push({ id, label, color, width, opacity, pts, vmin, vmax });
    };
    addSeries(g.outside, g.outside_label || "Outside", "var(--cpc-good)", 2, 0.9);
    addSeries(g.inside, g.inside_label || "Inside", "var(--cpc-heat)", 2.5, 1);
    if (!series.length) { this._graphMeta = null; return ""; }

    const t0 = Math.min(...series.map((s) => s.pts[0].t));
    const t1 = Math.max(...series.map((s) => s.pts[s.pts.length - 1].t));
    const span = t1 - t0 || 1;
    series.forEach((s) => {
      s.poly = s.pts
        .map((p) => {
          const x = ((p.t - t0) / span) * W;
          const y = PAD + (1 - (p.v - s.vmin) / (s.vmax - s.vmin)) * (H - PAD * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    });
    this._graphMeta = { t0, t1, W, H, PAD, series };

    const last = series[series.length - 1];
    const endPt = last.poly.split(" ").pop().split(",");
    const dots = series.map((s, i) => `<div class="gdot" data-si="${i}" style="background:${s.color}" hidden></div>`).join("");
    const legend = series
      .slice()
      .reverse()
      .map((s, i) => {
        const cur = s.pts[s.pts.length - 1].v;
        return `<span class="lg"><i style="background:${s.color}"></i>${this._esc(s.label)} <b data-lv="${series.length - 1 - i}">${this._fmt(cur)}°</b></span>`;
      })
      .join("");
    return `
      <div class="graph" role="img" aria-label="Temperature, last ${g.hours} hours. Touch or hover to inspect.">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="var(--cpc-track)" stroke-width="1"/>
          ${series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="${s.width}" opacity="${s.opacity}" points="${s.poly}"/>`).join("")}
          <circle cx="${endPt[0]}" cy="${endPt[1]}" r="3.5" fill="${last.color}"/>
        </svg>
        <div class="gx" hidden></div>
        ${dots}
        <div class="gtip" hidden></div>
      </div>
      <div class="legend">${legend}<span class="ltime" data-ltime></span></div>`;
  }

  _bindGraphHover() {
    const graph = this.shadowRoot.querySelector(".graph");
    if (!graph || !this._graphMeta) return;
    const cross = graph.querySelector(".gx");
    const tip = graph.querySelector(".gtip");
    const dots = [...graph.querySelectorAll(".gdot")];
    const ltime = this.shadowRoot.querySelector("[data-ltime]");
    // Legend spans render in reversed order — map them back to series index
    // via their data-lv attribute, never by DOM position.
    const lvals = {};
    this.shadowRoot.querySelectorAll("[data-lv]").forEach((el) => {
      lvals[el.dataset.lv] = el;
    });

    const show = (clientX) => {
      const m = this._graphMeta;
      const rect = graph.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const t = m.t0 + frac * (m.t1 - m.t0);
      cross.hidden = false;
      cross.style.left = `${(frac * 100).toFixed(2)}%`;
      const parts = [];
      m.series.forEach((s, i) => {
        let best = s.pts[0], bd = Infinity;
        s.pts.forEach((p) => {
          const d = Math.abs(p.t - t);
          if (d < bd) { bd = d; best = p; }
        });
        const yFrac = (m.PAD + (1 - (best.v - s.vmin) / (s.vmax - s.vmin)) * (m.H - m.PAD * 2)) / m.H;
        const xFrac = (best.t - m.t0) / (m.t1 - m.t0 || 1);
        const dot = dots[i];
        if (dot) {
          dot.hidden = false;
          dot.style.left = `${(xFrac * 100).toFixed(2)}%`;
          dot.style.top = `${(yFrac * 100).toFixed(2)}%`;
        }
        if (lvals[i]) lvals[i].textContent = `${this._fmt(best.v)}°`;
        parts.push(`<span><i style="background:${s.color}"></i>${this._fmt(best.v)}°</span>`);
      });
      const timeStr = new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (ltime) ltime.textContent = timeStr;
      tip.hidden = false;
      tip.innerHTML = `<b>${timeStr}</b>${parts.join("")}`;
      const onLeft = frac > 0.55;
      tip.style.left = onLeft ? "" : `calc(${(frac * 100).toFixed(2)}% + 10px)`;
      tip.style.right = onLeft ? `calc(${((1 - frac) * 100).toFixed(2)}% + 10px)` : "";
    };
    const hide = () => {
      cross.hidden = true;
      tip.hidden = true;
      dots.forEach((d) => (d.hidden = true));
      if (ltime) ltime.textContent = "";
      const m = this._graphMeta;
      m.series.forEach((s, i) => {
        if (lvals[i]) lvals[i].textContent = `${this._fmt(s.pts[s.pts.length - 1].v)}°`;
      });
    };
    graph.addEventListener("pointermove", (e) => show(e.clientX));
    graph.addEventListener("pointerdown", (e) => show(e.clientX));
    graph.addEventListener("pointerleave", hide);
    graph.addEventListener("pointercancel", hide);
  }

  _sparkSvg(entityId) {
    const series = this._downsample(this._history[entityId], 28);
    const p = this._polyline(series, 84, 26, 3);
    if (!p) return `<svg viewBox="0 0 84 26"></svg>`;
    return `<svg viewBox="0 0 84 26" preserveAspectRatio="none" aria-hidden="true">
      <polyline fill="none" stroke="var(--cpc-cool)" stroke-width="1.5" opacity="0.8" points="${p}"/>
    </svg>`;
  }

  /* ---------------- section renderers ---------------- */

  _weatherHtml() {
    const c = this._config;
    if (!c.weather && !c.outside) return "";
    const w = this._st(c.weather);
    const cond = w ? w.state.replace(/_/g, " ") : "";
    const wTemp = w ? this._fmt(this._num(c.weather, "temperature"), 0) : "—";
    let hiLo = "";
    if (this._forecast && this._forecast.length) {
      const today = this._forecast[0];
      const hi = today.temperature, lo = today.templow;
      if (hi !== undefined && lo !== undefined) hiLo = ` · ${this._fmt(hi, 0)}° / ${this._fmt(lo, 0)}° today`;
    }
    const oTemp = c.outside && c.outside.temp ? this._fmt(this._num(c.outside.temp)) : null;
    const oHum = c.outside && c.outside.humidity ? this._fmt(this._num(c.outside.humidity), 0) : null;
    const name = w ? (c.weather_label || w.attributes.friendly_name || "") : "";
    return `
      <div class="weather" data-entity="${this._esc(c.weather || (c.outside && c.outside.temp) || "")}" data-tap="more-info">
        <ha-icon class="wicon" icon="${this._weatherIcon(w && w.state)}"></ha-icon>
        <div class="wmain">${this._esc(name)}${cond ? ` · ${this._esc(cond)}` : ""}<br><b>${wTemp}°</b>${this._esc(hiLo)}</div>
        <div class="spread">${oTemp !== null ? `Outside <b>${oTemp}°</b>` : ""}${oHum !== null ? `<br>Humidity ${oHum}%` : ""}</div>
      </div>`;
  }

  _weatherIcon(state) {
    const map = {
      "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy", fog: "mdi:weather-fog",
      hail: "mdi:weather-hail", lightning: "mdi:weather-lightning", "lightning-rainy": "mdi:weather-lightning-rainy",
      partlycloudy: "mdi:weather-partly-cloudy", pouring: "mdi:weather-pouring", rainy: "mdi:weather-rainy",
      snowy: "mdi:weather-snowy", "snowy-rainy": "mdi:weather-snowy-rainy", sunny: "mdi:weather-sunny",
      windy: "mdi:weather-windy", "windy-variant": "mdi:weather-windy-variant", exceptional: "mdi:alert-circle-outline",
    };
    return map[state] || "mdi:weather-partly-cloudy";
  }

  _heroHtml() {
    const c = this._config;
    const cur = this._currentTemp();
    const goal = this._targetTemp();
    const thermo = this._st(c.thermostat);
    const action = thermo && thermo.attributes.hvac_action;
    const actionLabel = { heating: "Heating", cooling: "Cooling", idle: "Idle", off: "Off", fan: "Fan", drying: "Drying" }[action] || (thermo ? thermo.state : "—");
    const actionCls = action === "heating" ? "heat" : action === "cooling" ? "cool" : "idle";
    const zoneNote = this._activeZoneLabel();
    let reason = "";
    if (c.status_text && c.status_text.entity) {
      const s = this._st(c.status_text.entity);
      const raw = s ? (c.status_text.attribute ? s.attributes[c.status_text.attribute] : s.state) : null;
      if (raw && raw !== "unknown" && raw !== "unavailable") reason = String(raw);
    }
    const canStep = this._st(this._goalEntity()) && this._st(this._goalEntity()).attributes.temperature !== undefined;
    const holdChip = this._holdHtml();
    return `
      <div class="hero">
        <div class="ring" data-entity="${this._esc(c.thermostat)}" data-tap="more-info">
          ${this._ringSvg(cur, goal)}
          <div class="val"><b>${cur === null ? "—" : `${this._fmt(cur)}°`}</b><small>inside</small></div>
        </div>
        <div class="hero-info">
          <div class="goal-row">
            ${canStep ? `<button class="stepper" data-step="-1" aria-label="Lower goal temperature"><ha-icon icon="mdi:minus"></ha-icon></button>` : ""}
            <div class="goal" data-entity="${this._esc(this._goalEntity())}" data-tap="more-info">
              <b data-goal-value class="${this._pendingTarget !== null ? "pending" : ""}">${goal === null ? "—" : `${this._fmt(goal)}°`}</b>
              <span>goal</span>
            </div>
            ${canStep ? `<button class="stepper" data-step="1" aria-label="Raise goal temperature"><ha-icon icon="mdi:plus"></ha-icon></button>` : ""}
          </div>
          <div class="action ${actionCls}"><span class="dot"></span>${this._esc(actionLabel)}${zoneNote ? ` · ${this._esc(zoneNote)}` : ""}</div>
          ${holdChip}
          ${reason ? `<div class="reason">${this._esc(reason)}</div>` : ""}
        </div>
      </div>`;
  }

  _holdHtml() {
    const h = this._config.hold;
    if (!h || !h.remaining) return "";
    const mins = this._num(h.remaining);
    if (!mins || mins <= 0) return "";
    const hrs = Math.floor(mins / 60);
    const rem = Math.round(mins % 60);
    const dur = hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`;
    const cancel = h.cancel_service
      ? `data-chip-idx="__hold__"`
      : `data-entity="${this._esc(h.remaining)}" data-tap="more-info"`;
    // GTTC >= 2.1.0 tags overrides made on the physical thermostat. Older
    // versions have no such attribute, so this falls back to a plain hold.
    const src = this._st(h.remaining);
    const physical = !!(src && src.attributes && src.attributes.from_thermostat);
    const icon = physical ? "mdi:thermostat" : "mdi:timer-outline";
    const label = physical ? "Thermostat hold" : "Hold";
    return `<button class="hold-chip${physical ? " physical" : ""}" ${cancel}>
      <ha-icon icon="${icon}"></ha-icon> ${label} · ${dur} left${h.cancel_service ? " — tap to cancel" : ""}
    </button>`;
  }

  _activeZoneLabel() {
    const z = this._config.zones;
    if (!z || !z.select) return "";
    const s = this._st(z.select);
    if (!s) return "";
    const opt = (z.options || []).find((o) => o.option === s.state);
    return `${(opt && opt.label) || s.state} zone`;
  }

  _zonesHtml() {
    const z = this._config.zones;
    if (!z || !z.select || !(z.options || []).length) return "";
    const s = this._st(z.select);
    const active = s ? s.state : null;
    const btns = z.options
      .map((o, i) => {
        const temp = o.temp ? this._fmt(this._num(o.temp)) : null;
        const on = o.option === active;
        return `<button class="zone ${on ? "on" : ""}" data-zone-idx="${i}">
          ${this._esc(o.label || o.option)}${temp !== null ? ` · <b>${temp}°</b>` : ""}
        </button>`;
      })
      .join("");
    return `<div class="zones">${btns}</div>`;
  }

  _chipsHtml() {
    const chips = this._config.chips || [];
    const schedChip = this._config.schedule
      ? `<button class="chip" data-open-schedule><ha-icon icon="mdi:calendar-clock"></ha-icon>Schedule</button>`
      : "";
    const html = schedChip + chips
      .map((ch, i) => {
        if (!this._visible(ch.visible)) return "";
        const s = this._st(ch.entity);
        const state = ch.show_state && s ? ` ${this._esc(s.state)}` : "";
        const cls = ch.style === "warn" ? "warn" : "";
        return `<button class="chip ${cls}" data-chip-idx="${i}">
          ${ch.icon ? `<ha-icon icon="${this._esc(ch.icon)}"></ha-icon>` : ""}${this._esc(ch.name || "")}${state}
        </button>`;
      })
      .filter(Boolean)
      .join("");
    return html ? `<div class="chips">${html}</div>` : "";
  }

  _roomsHtml() {
    const rooms = this._config.rooms || [];
    if (!rooms.length) return "";
    const rows = rooms
      .map((r, i) => {
        const t = this._fmt(this._num(r.temp));
        const h = r.humidity ? this._fmt(this._num(r.humidity), 0) : null;
        const goal = r.goal !== undefined ? (typeof r.goal === "number" ? this._fmt(r.goal) : this._fmt(this._num(r.goal))) : null;
        const dead = this._num(r.temp) === null;
        return `
        <div class="room ${dead ? "dead" : ""}" data-entity="${this._esc(r.temp)}" data-tap="more-info">
          <ha-icon class="ric" icon="${this._esc(r.icon || "mdi:thermometer")}"></ha-icon>
          <div class="nm">${this._esc(r.name || r.temp)}${h !== null ? `<small>${h}% humidity</small>` : ""}</div>
          <div class="spark">${this._sparkSvg(r.temp)}</div>
          <div class="tv"><b>${t === "—" ? "—" : `${t}°`}</b>${goal !== null ? `<small>goal ${goal}°</small>` : ""}</div>
        </div>`;
      })
      .join("");
    return `<div class="rooms">${rows}</div>`;
  }

  /* ---------------- schedule editor (GTTC WS API) ---------------- */

  _schedWs(msg) {
    const extra = this._config.schedule && this._config.schedule.entry_id
      ? { entry_id: this._config.schedule.entry_id }
      : {};
    return this._hass.callWS({ ...msg, ...extra });
  }

  async _openSchedule() {
    try {
      this._sched = await this._schedWs({ type: "gttc/get_schedule" });
    } catch (e) {
      this._sched = null;
      this._schedNote = "Couldn't load the schedule.";
    }
    this._modalOpen = true;
    this._schedEdit = null;
    if (this._sched) {
      const days = this._schedDays().map((d) => d[0]);
      if (!this._schedDay || !days.includes(this._schedDay)) {
        // Open on today (per-day tabs) or the matching group
        const dow = new Date().getDay();
        const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        this._schedDay = this._perDayTabs() ? names[dow] : (dow === 0 || dow === 6 ? "weekend" : "weekday");
      }
    }
    this._renderModal();
  }

  _closeSchedule() {
    this._modalOpen = false;
    this._schedEdit = null;
    this._schedNote = null;
    const el = this.shadowRoot.querySelector(".modal-backdrop");
    if (el) el.remove();
    this._scheduleRender();
  }

  async _refreshSchedule() {
    try {
      this._sched = await this._schedWs({ type: "gttc/get_schedule" });
    } catch (e) { /* keep the stale copy */ }
    this._renderModal();
  }

  // When a preset is active, GTTC reads AND edits the preset's per-day
  // schedule (update_entry/delete_entry default to active_preset), so the
  // editor must show that — not the base weekday/weekend lists.
  _activePreset() {
    const s = this._sched;
    if (s && s.active_preset && s.presets && s.presets[s.active_preset]) {
      return s.presets[s.active_preset];
    }
    return null;
  }

  _perDayTabs() {
    return !!this._activePreset() || (this._sched && this._sched.mode === "per_day");
  }

  _schedDays() {
    if (!this._sched) return [];
    if (this._perDayTabs()) {
      return [["monday", "Mon"], ["tuesday", "Tue"], ["wednesday", "Wed"], ["thursday", "Thu"], ["friday", "Fri"], ["saturday", "Sat"], ["sunday", "Sun"]];
    }
    return [["weekday", "Weekdays"], ["weekend", "Weekend"]];
  }

  _schedEntries(day) {
    const s = this._sched;
    if (!s) return [];
    const preset = this._activePreset();
    if (preset) return (preset.schedule && preset.schedule[day]) || [];
    if (s.mode === "per_day") return (s.per_day && s.per_day[day]) || [];
    return s[day] || [];
  }

  _mins(hhmm) {
    const [h, m] = String(hhmm || "0:0").split(":").map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  }

  _fmt12(hhmm) {
    const mins = this._mins(hhmm);
    const d = new Date();
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  _zoneName(zoneId) {
    if (!zoneId || !this._sched) return null;
    const z = (this._sched.zones || []).find((z) => z.id === zoneId);
    return z ? z.name : null;
  }

  _renderModal() {
    let backdrop = this.shadowRoot.querySelector(".modal-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) this._closeSchedule();
      });
      this.shadowRoot.appendChild(backdrop);
    }
    backdrop.innerHTML = this._modalHtml();
    this._bindModal(backdrop);
  }

  _modalHtml() {
    const s = this._sched;
    if (!s) {
      return `<div class="modal"><div class="mhead"><b>Schedule</b><button class="mclose" data-m-close>✕</button></div>
        <div class="mnote">${this._esc(this._schedNote || "No schedule data.")}</div></div>`;
    }
    const presetLabel = (s.preset_labels && s.preset_labels[s.active_preset]) || s.active_preset || "Default";
    const tabs = this._schedDays()
      .map(([key, label]) => `<button class="mtab ${key === this._schedDay ? "on" : ""}" data-m-day="${key}">${label}</button>`)
      .join("");
    const entries = this._schedEntries(this._schedDay);
    const now = new Date();
    const nowPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;

    // 24h timeline — one lane per zone so per-zone entries don't stack,
    // and overnight entries (end before start) wrap around midnight.
    const lanesMap = new Map();
    entries.forEach((e, i) => {
      const key = e.zone_id || "__all__";
      if (!lanesMap.has(key)) {
        lanesMap.set(key, {
          name: e.zone_id ? this._zoneName(e.zone_id) || "Zone" : "All zones",
          items: [],
        });
      }
      lanesMap.get(key).items.push({ e, i });
    });
    const lanes = [...lanesMap.values()];
    const multiLane = lanes.length > 1;
    const seg = (i, a, b, label) => {
      const left = (a / 1440) * 100;
      const width = (Math.max(b - a, 8) / 1440) * 100;
      const lbl = width >= 10 && label ? label : "";
      return `<button class="seg" data-m-edit="${i}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%">${lbl}</button>`;
    };
    const laneHtml = lanes
      .map((lane) => {
        const segs = lane.items
          .map(({ e, i }) => {
            const a = this._mins(e.time_start);
            const b = this._mins(e.time_end);
            const label = `${this._fmt(e.target_temp, 0)}°${e.cooling_temp != null ? ` / ${this._fmt(e.cooling_temp, 0)}°` : ""}`;
            if (b <= a) return seg(i, a, 1440, label) + seg(i, 0, b, "");
            return seg(i, a, b, label);
          })
          .join("");
        return `
          <div class="mlane">
            ${multiLane ? `<span class="mlane-label">${this._esc(lane.name)}</span>` : ""}
            <div class="mtimeline">${segs}<span class="mnow" style="left:${nowPct.toFixed(2)}%"></span></div>
          </div>`;
      })
      .join("");

    const rows = entries
      .map((e, i) => `
        <button class="mrow" data-m-edit="${i}">
          <span class="mtime">${this._fmt12(e.time_start)} – ${this._fmt12(e.time_end)}</span>
          <span class="mtemps"><i class="h"></i>${this._fmt(e.target_temp)}°${e.cooling_temp != null ? ` <i class="c"></i>${this._fmt(e.cooling_temp)}°` : ""}</span>
          <span class="mzone">${this._esc(this._zoneName(e.zone_id) || "All zones")}</span>
        </button>`)
      .join("");

    let editor = "";
    if (this._schedEdit !== null) {
      const isNew = this._schedEdit === "new";
      const e = isNew
        ? { time_start: "08:00", time_end: "17:00", target_temp: 70, cooling_temp: 74, zone_id: null }
        : entries[this._schedEdit];
      const zoneOpts = [`<option value="">All zones</option>`]
        .concat((s.zones || []).map((z) => `<option value="${this._esc(z.id)}" ${e.zone_id === z.id ? "selected" : ""}>${this._esc(z.name)}</option>`))
        .join("");
      editor = `
        <div class="meditor">
          <div class="mform">
            <label>Start<input type="time" data-f="time_start" value="${this._esc(e.time_start)}"></label>
            <label>End<input type="time" data-f="time_end" value="${this._esc(e.time_end)}"></label>
            <label>Heat °<input type="number" step="0.5" data-f="target_temp" value="${e.target_temp}"></label>
            <label>Cool °<input type="number" step="0.5" data-f="cooling_temp" value="${e.cooling_temp != null ? e.cooling_temp : ""}" placeholder="—"></label>
            <label class="wide">Zone<select data-f="zone_id">${zoneOpts}</select></label>
          </div>
          <div class="mactions">
            <button class="mbtn primary" data-m-save>${isNew ? "Add entry" : "Save"}</button>
            ${isNew ? "" : `<button class="mbtn danger" data-m-delete>Delete</button>`}
            <button class="mbtn" data-m-cancel>Cancel</button>
          </div>
        </div>`;
    }

    return `
      <div class="modal">
        <div class="mhead">
          <div><b>Schedule</b><small>${this._esc(presetLabel)}${s.enabled === false ? " · off" : ""}</small></div>
          <div class="mhead-actions">
            ${s.can_undo ? `<button class="mbtn small" data-m-undo><ha-icon icon="mdi:undo"></ha-icon></button>` : ""}
            <button class="mclose" data-m-close>✕</button>
          </div>
        </div>
        <div class="mtabs">${tabs}</div>
        <div class="mlanes">${laneHtml}</div>
        <div class="mscale">${multiLane ? `<span class="mlane-label"></span>` : ""}<div class="mscale-in"><span>12A</span><span>6A</span><span>12P</span><span>6P</span><span>12A</span></div></div>
        ${this._schedNote ? `<div class="mnote">${this._esc(this._schedNote)}</div>` : ""}
        ${editor || `<div class="mrows">${rows || `<div class="mnote">No entries for this day.</div>`}</div>
        <button class="mbtn add" data-m-add><ha-icon icon="mdi:plus"></ha-icon> Add entry</button>
        ${this._perDayTabs() && entries.length ? `
        <div class="mcopy">
          <span>Copy this day to</span>
          <button class="mbtn small" data-m-copy="weekdays">Weekdays</button>
          <button class="mbtn small" data-m-copy="weekend">Weekend</button>
          <button class="mbtn small" data-m-copy="all">All</button>
        </div>` : ""}`}
      </div>`;
  }

  _bindModal(backdrop) {
    const q = (sel) => backdrop.querySelectorAll(sel);
    q("[data-m-close]").forEach((el) => el.addEventListener("click", () => this._closeSchedule()));
    q("[data-m-day]").forEach((el) =>
      el.addEventListener("click", () => {
        this._schedDay = el.dataset.mDay;
        this._schedEdit = null;
        this._schedNote = null;
        this._renderModal();
      })
    );
    q("[data-m-edit]").forEach((el) =>
      el.addEventListener("click", () => {
        this._schedEdit = parseInt(el.dataset.mEdit, 10);
        this._schedNote = null;
        this._renderModal();
      })
    );
    q("[data-m-add]").forEach((el) =>
      el.addEventListener("click", () => {
        this._schedEdit = "new";
        this._schedNote = null;
        this._renderModal();
      })
    );
    q("[data-m-cancel]").forEach((el) =>
      el.addEventListener("click", () => {
        this._schedEdit = null;
        this._schedNote = null;
        this._renderModal();
      })
    );
    q("[data-m-undo]").forEach((el) =>
      el.addEventListener("click", async () => {
        await this._schedWs({ type: "gttc/undo_schedule" }).catch(() => {});
        this._schedNote = "Undone.";
        this._schedEdit = null;
        this._refreshSchedule();
      })
    );
    q("[data-m-copy]").forEach((el) =>
      el.addEventListener("click", () => {
        const groups = {
          weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
          weekend: ["saturday", "sunday"],
          all: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        };
        const targets = (groups[el.dataset.mCopy] || []).filter((d) => d !== this._schedDay);
        if (!targets.length) return;
        this._armOrRun(el, "Confirm copy", async () => {
          try {
            await this._schedWs({
              type: "gttc/copy_day",
              source_day: this._schedDay,
              target_days: targets,
            });
            this._schedNote = `Copied to ${targets.length} day${targets.length > 1 ? "s" : ""}.`;
            this._refreshSchedule();
          } catch (err) {
            this._schedNote = `Copy failed: ${err && err.message ? err.message : "unknown error"}`;
            this._renderModal();
          }
        });
      })
    );
    q("[data-m-save]").forEach((el) =>
      el.addEventListener("click", async () => {
        const val = (f) => {
          const input = backdrop.querySelector(`[data-f="${f}"]`);
          return input ? input.value : "";
        };
        const entries = this._schedEntries(this._schedDay);
        const isNew = this._schedEdit === "new";
        const orig = isNew ? null : entries[this._schedEdit];
        const msg = {
          type: "gttc/update_entry",
          day: this._schedDay,
          time_start: val("time_start"),
          time_end: val("time_end"),
          target_temp: parseFloat(val("target_temp")),
        };
        if (!msg.time_start || !msg.time_end || !Number.isFinite(msg.target_temp)) {
          this._schedNote = "Start, end, and heat temperature are required.";
          this._renderModal();
          return;
        }
        const cool = parseFloat(val("cooling_temp"));
        if (Number.isFinite(cool)) msg.cooling_temp = cool;
        const zone = val("zone_id");
        if (zone) msg.zone_id = zone;
        if (orig) {
          msg.old_time_start = orig.time_start;
          msg.old_time_end = orig.time_end;
          if (orig.away_temp != null) msg.away_temp = orig.away_temp;
        }
        try {
          const res = await this._schedWs(msg);
          this._schedNote = res && res.conflicts && res.conflicts.length ? "Saved — overlaps another entry, check times." : null;
          this._schedEdit = null;
          this._refreshSchedule();
        } catch (err) {
          this._schedNote = `Save failed: ${err && err.message ? err.message : "unknown error"}`;
          this._renderModal();
        }
      })
    );
    q("[data-m-delete]").forEach((el) =>
      el.addEventListener("click", () => {
        const entries = this._schedEntries(this._schedDay);
        const orig = entries[this._schedEdit];
        if (!orig) return;
        this._armOrRun(el, "Tap again to delete", async () => {
          try {
            await this._schedWs({
              type: "gttc/delete_entry",
              day: this._schedDay,
              time_start: orig.time_start,
              time_end: orig.time_end,
            });
            this._schedEdit = null;
            this._schedNote = null;
            this._refreshSchedule();
          } catch (err) {
            this._schedNote = `Delete failed: ${err && err.message ? err.message : "unknown error"}`;
            this._renderModal();
          }
        });
      })
    );
  }

  /* ---------------- main render ---------------- */

  _render() {
    if (!this._hass || !this._config) return;
    const c = this._config;
    if (c.compact) return this._renderCompact();
    this.shadowRoot.innerHTML = `
      <style>${ClimatePanelCard.styles}</style>
      <div class="panel">
        ${this._weatherHtml()}
        ${this._heroHtml()}
        ${this._graphSvg()}
        ${this._zonesHtml()}
        ${this._chipsHtml()}
      </div>
      ${this._roomsHtml()}
    `;
    this._bind();
    this._bindGraphHover();
    this._rendered = true;
  }

  /* Compact mode: weather strip, hero ring and zones only. Everything the
     full panel adds — graph, chips, room rows — stays behind the popup. */
  _renderCompact() {
    const c = this._config;
    this.shadowRoot.innerHTML = `
      <style>${ClimatePanelCard.styles}</style>
      <div class="panel compact${c.navigate ? " tappable" : ""}">
        ${this._weatherHtml()}
        ${this._heroHtml()}
        ${this._zonesHtml()}
      </div>
    `;
    this._bind();
    if (c.navigate) {
      const panel = this.shadowRoot.querySelector(".panel");
      panel.addEventListener("click", (e) => {
        if (e.target.closest(".stepper, [data-zone-idx], [data-chip-idx], [data-open-schedule], [data-tap]")) return;
        pcNavigate(this, c.navigate);
      });
    }
    this._rendered = true;
  }

  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-tap='more-info']").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.currentTarget.classList.contains("armed")) return;
        this._moreInfo(el.dataset.entity);
      });
    });
    root.querySelectorAll(".stepper").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._step(parseInt(el.dataset.step, 10));
      });
    });
    root.querySelectorAll("[data-zone-idx]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const z = this._config.zones;
        const opt = z.options[parseInt(el.dataset.zoneIdx, 10)];
        if (!opt || el.classList.contains("on")) return;
        const run = () =>
          this._hass.callService("select", "select_option", { entity_id: z.select, option: opt.option });
        if (z.confirm === false) run();
        else this._armOrRun(el, `Switch to ${opt.label || opt.option}?`, run);
      });
    });
    root.querySelectorAll("[data-open-schedule]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._openSchedule();
      });
    });
    root.querySelectorAll("[data-chip-idx]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = el.dataset.chipIdx;
        if (idx === "__hold__") {
          const h = this._config.hold;
          const run = () => {
            const [domain, service] = h.cancel_service.split(".");
            this._hass.callService(domain, service, h.cancel_data || {});
          };
          this._armOrRun(el, "Cancel hold?", run);
          return;
        }
        const chip = (this._config.chips || [])[parseInt(idx, 10)];
        if (chip) this._runAction(chip.tap_action || "more-info", el);
      });
    });
  }

  /* ---------------- styles ---------------- */

  static get styles() {
    return `
      :host {
        ${PC_TOKENS}
        --cpc-panel: var(--cpc-panel-override, var(--pc-panel));
        --cpc-panel-2: var(--pc-panel-2);
        --cpc-line: var(--pc-line);
        --cpc-track: var(--pc-track);
        --cpc-chip: var(--pc-chip);
        --cpc-text: var(--pc-text);
        --cpc-muted: var(--pc-muted);
        --cpc-heat: var(--cpc-heat-override, var(--pc-heat));
        --cpc-cool: var(--cpc-cool-override, var(--pc-cool));
        --cpc-good: var(--cpc-good-override, var(--pc-good));
        --cpc-warn: var(--cpc-warn-override, var(--pc-warn));
        --cpc-idle-ring: var(--cpc-muted);
        --cpc-radius: 24px;
        display: block;
        color: var(--cpc-text);
        font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        -webkit-font-smoothing: antialiased;
      }
      * { box-sizing: border-box; }
      button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; text-align: inherit; }
      button:focus-visible { outline: 2px solid var(--cpc-cool); outline-offset: 2px; border-radius: 8px; }
      ha-icon { --mdc-icon-size: 18px; }

      .panel {
        background: var(--cpc-panel);
        border-radius: var(--cpc-radius);
        overflow: hidden;
        margin-bottom: 14px;
      }
      .weather {
        display: flex; align-items: center; gap: 12px; width: 100%;
        padding: 12px 16px;
        background: linear-gradient(180deg, rgba(77, 208, 225, 0.10), transparent);
        border-bottom: 1px solid var(--cpc-line);
        font-size: 13px; color: var(--cpc-muted);
        cursor: pointer;
      }
      .weather .wicon { color: var(--cpc-cool); --mdc-icon-size: 22px; flex: 0 0 auto; }
      .weather b { color: var(--cpc-text); font-weight: 600; }
      .weather .wmain { line-height: 1.4; }
      .weather .spread { margin-left: auto; text-align: right; line-height: 1.4; }

      .hero { display: flex; align-items: center; gap: 18px; padding: 18px 18px 8px; }
      .ring { width: 108px; height: 108px; flex: 0 0 auto; position: relative; cursor: pointer; }
      .ring svg { display: block; }
      .ring .val {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-variant-numeric: tabular-nums;
      }
      .ring .val b { font-size: 27px; font-weight: 650; letter-spacing: -0.02em; }
      .ring .val small { font-size: 11px; color: var(--cpc-muted); margin-top: 2px; }

      .hero-info { flex: 1; min-width: 0; }
      .goal-row { display: flex; align-items: center; gap: 10px; }
      .goal { display: flex; align-items: baseline; gap: 7px; cursor: pointer; }
      .goal b { font-size: 21px; font-weight: 650; font-variant-numeric: tabular-nums; transition: color 0.2s; }
      .goal b.pending { color: var(--cpc-warn); }
      .goal span { font-size: 12px; color: var(--cpc-muted); }
      .stepper {
        width: 34px; height: 34px; border-radius: 50%; flex: 0 0 auto;
        background: var(--cpc-chip);
        display: inline-flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      .stepper:active { background: var(--cpc-panel-2); transform: scale(0.94); }
      .stepper ha-icon { --mdc-icon-size: 18px; color: var(--cpc-text); }

      .action {
        display: inline-flex; align-items: center; gap: 6px;
        margin-top: 9px; padding: 4px 10px;
        border-radius: 999px; font-size: 12px; font-weight: 600;
        background: var(--cpc-chip); color: var(--cpc-muted);
      }
      .action .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
      .action.cool { background: rgba(77, 208, 225, 0.14); color: var(--cpc-cool); }
      .action.heat { background: rgba(255, 149, 87, 0.14); color: var(--cpc-heat); }
      .reason { margin-top: 8px; font-size: 12px; color: var(--cpc-muted); line-height: 1.45; }

      .hold-chip {
        display: inline-flex; align-items: center; gap: 6px;
        margin-top: 8px; padding: 5px 10px; border-radius: 999px;
        font-size: 12px; font-weight: 600;
        background: rgba(242, 193, 78, 0.13); color: var(--cpc-warn);
      }
      .hold-chip ha-icon { --mdc-icon-size: 15px; }
      /* Hold set on the physical thermostat — distinct from an app hold */
      .hold-chip.physical {
        background: rgba(255, 149, 87, 0.14); color: var(--cpc-heat);
      }

      .graph { padding: 4px 6px 0; position: relative; touch-action: pan-y; cursor: crosshair; }
      .graph svg { display: block; width: 100%; height: 74px; }
      .gx {
        position: absolute; top: 4px; bottom: 0; width: 1px;
        background: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.35);
        pointer-events: none;
      }
      .gdot {
        position: absolute; width: 9px; height: 9px; border-radius: 50%;
        transform: translate(-50%, -50%);
        border: 2px solid var(--cpc-panel);
        pointer-events: none;
      }
      .gtip {
        position: absolute; top: 2px;
        display: flex; align-items: center; gap: 8px;
        padding: 4px 9px; border-radius: 8px;
        background: rgba(10, 14, 18, 0.92);
        font-size: 11.5px; font-variant-numeric: tabular-nums;
        white-space: nowrap; pointer-events: none; z-index: 2;
        box-shadow: 0 2px 10px rgba(0,0,0,0.4);
      }
      .gtip b { font-weight: 650; }
      .gtip i, .lg i {
        display: inline-block; width: 8px; height: 8px; border-radius: 50%;
        margin-right: 4px; vertical-align: 0;
      }
      .gtip span { display: inline-flex; align-items: center; }
      .legend {
        display: flex; align-items: center; gap: 14px;
        padding: 6px 16px 0; font-size: 11.5px; color: var(--cpc-muted);
      }
      .lg { display: inline-flex; align-items: center; }
      .lg b { color: var(--cpc-text); font-weight: 600; margin-left: 4px; font-variant-numeric: tabular-nums; }
      .ltime { margin-left: auto; font-variant-numeric: tabular-nums; }

      .zones {
        display: flex; margin: 10px 16px 0;
        background: var(--cpc-chip); border-radius: 12px; padding: 3px;
      }
      .zone {
        flex: 1; border-radius: 10px; padding: 8px 6px;
        color: var(--cpc-muted); font-size: 13px; text-align: center;
        font-variant-numeric: tabular-nums;
        transition: background 0.15s, color 0.15s;
      }
      .zone.on {
        background: var(--cpc-panel-2); color: var(--cpc-text);
        font-weight: 600; box-shadow: inset 0 0 0 1px var(--cpc-line);
      }
      .zone b { font-weight: 650; }

      .chips { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 16px 16px; }
      .panel > .chips:last-child { padding-top: 12px; }
      .zones + .chips { padding-top: 12px; }
      .chip {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 12px; padding: 5px 10px; border-radius: 999px;
        background: var(--cpc-chip); color: var(--cpc-muted);
      }
      .chip ha-icon { --mdc-icon-size: 15px; }
      .chip.warn { color: var(--cpc-warn); background: rgba(242, 193, 78, 0.12); }

      .armed { background: var(--cpc-warn) !important; color: #1a1a1a !important; font-weight: 650; }
      .arm-label { padding: 0 4px; }

      .rooms { background: var(--cpc-panel); border-radius: var(--cpc-radius); overflow: hidden; }
      .room {
        display: grid; grid-template-columns: 34px 1fr auto auto; gap: 12px;
        align-items: center; padding: 13px 16px;
        border-bottom: 1px solid var(--cpc-line);
        cursor: pointer;
      }
      .room:last-child { border-bottom: 0; }
      .room.dead { opacity: 0.45; }
      .room .ric { color: var(--cpc-muted); justify-self: center; --mdc-icon-size: 20px; }
      .room .nm { font-size: 14px; font-weight: 550; }
      .room .nm small { display: block; font-size: 11.5px; color: var(--cpc-muted); font-weight: 400; margin-top: 2px; }
      .room .spark svg { display: block; width: 84px; height: 26px; }
      .room .tv { text-align: right; font-variant-numeric: tabular-nums; }
      .room .tv b { font-size: 16px; font-weight: 650; }
      .room .tv small { display: block; font-size: 11.5px; color: var(--cpc-muted); margin-top: 2px; }

      /* ---- schedule editor modal ---- */
      .modal-backdrop {
        position: fixed; inset: 0; z-index: 20;
        background: rgba(6, 9, 12, 0.7);
        display: flex; align-items: center; justify-content: center;
        padding: 18px;
        backdrop-filter: blur(3px);
      }
      .modal {
        width: 100%; max-width: 420px; max-height: 86vh; overflow-y: auto;
        background: var(--cpc-panel);
        border-radius: var(--cpc-radius);
        padding: 16px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.5);
      }
      .mhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .mhead b { font-size: 16px; font-weight: 650; }
      .mhead small { display: block; font-size: 12px; color: var(--cpc-muted); margin-top: 2px; }
      .mhead-actions { display: flex; align-items: center; gap: 8px; }
      .mclose {
        width: 32px; height: 32px; border-radius: 50%;
        background: var(--cpc-chip); color: var(--cpc-muted);
        display: inline-flex; align-items: center; justify-content: center; font-size: 14px;
      }
      .mtabs {
        display: flex; gap: 0; background: var(--cpc-chip);
        border-radius: 12px; padding: 3px; margin-bottom: 14px;
        overflow-x: auto;
      }
      .mtab {
        flex: 1; min-width: 44px; border-radius: 10px; padding: 7px 4px;
        color: var(--cpc-muted); font-size: 12.5px; text-align: center;
        white-space: nowrap;
      }
      .mtab.on {
        background: var(--cpc-panel-2); color: var(--cpc-text);
        font-weight: 600; box-shadow: inset 0 0 0 1px var(--cpc-line);
      }
      .mlanes { display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; }
      .mlane { display: flex; align-items: center; gap: 8px; }
      .mlane-label {
        flex: 0 0 54px; width: 54px; text-align: right;
        font-size: 10px; color: var(--cpc-muted);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .mtimeline {
        position: relative; flex: 1; height: 32px; border-radius: 9px;
        background: var(--cpc-chip); overflow: hidden;
      }
      .seg {
        position: absolute; top: 3px; bottom: 3px; min-width: 3px;
        background: rgba(77, 208, 225, 0.28);
        border: 1px solid rgba(77, 208, 225, 0.5);
        border-radius: 6px; padding: 0 3px;
        font-size: 10.5px; font-weight: 600; line-height: 1;
        color: var(--cpc-text);
        display: flex; align-items: center; justify-content: center;
        font-variant-numeric: tabular-nums; overflow: hidden; white-space: nowrap;
        z-index: 1; cursor: pointer;
      }
      .mnow {
        position: absolute; top: 0; bottom: 0; width: 2px;
        background: var(--cpc-warn); pointer-events: none; z-index: 2;
      }
      .mscale {
        display: flex; align-items: center; gap: 8px;
        font-size: 10px; color: var(--cpc-muted); margin-bottom: 12px;
        font-variant-numeric: tabular-nums;
      }
      .mscale .mlane-label { flex: 0 0 54px; }
      .mscale-in { flex: 1; display: flex; justify-content: space-between; }
      .mrows { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
      .mrow {
        display: grid; grid-template-columns: 1fr auto auto; gap: 10px;
        align-items: center; width: 100%;
        background: var(--cpc-chip); border-radius: 12px; padding: 10px 12px;
        font-size: 12.5px; font-variant-numeric: tabular-nums;
      }
      .mrow .mtime { font-weight: 600; }
      .mrow .mtemps i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin: 0 3px 0 0; }
      .mrow .mtemps i.h { background: var(--cpc-heat); }
      .mrow .mtemps i.c { background: var(--cpc-cool); }
      .mrow .mzone { color: var(--cpc-muted); font-size: 11px; }
      .mnote {
        background: rgba(242, 193, 78, 0.12); color: var(--cpc-warn);
        border-radius: 10px; padding: 8px 12px; font-size: 12px; margin-bottom: 10px;
      }
      .meditor { margin-bottom: 4px; }
      .mform { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
      .mform label {
        display: flex; flex-direction: column; gap: 4px;
        font-size: 11px; color: var(--cpc-muted); letter-spacing: 0.02em;
      }
      .mform label.wide { grid-column: 1 / -1; }
      .mform input, .mform select {
        background: var(--cpc-chip); color: var(--cpc-text);
        border: 1px solid var(--cpc-line); border-radius: 10px;
        padding: 9px 10px; font: inherit; font-size: 14px;
        font-variant-numeric: tabular-nums;
        color-scheme: dark;
      }
      .mform input:focus, .mform select:focus { outline: 2px solid var(--cpc-cool); outline-offset: 1px; }
      .mactions { display: flex; gap: 8px; }
      .mbtn {
        padding: 9px 14px; border-radius: 12px;
        background: var(--cpc-chip); color: var(--cpc-text);
        font-size: 13px; font-weight: 600;
        display: inline-flex; align-items: center; gap: 6px; justify-content: center;
      }
      .mbtn.primary { background: var(--cpc-cool); color: #0f1317; }
      .mbtn.danger { color: #ff8a80; }
      .mbtn.add { width: 100%; }
      .mcopy {
        display: flex; align-items: center; gap: 8px;
        margin-top: 10px; font-size: 11.5px; color: var(--cpc-muted);
      }
      .mcopy span { margin-right: auto; }
      .mcopy .mbtn.small { font-size: 12px; }
      .mbtn.small { padding: 6px 9px; }
      .mbtn ha-icon { --mdc-icon-size: 16px; }

      /* ---- compact mode ---- */
      .panel.compact { padding-bottom: 14px; gap: 10px; }
      .panel.compact .graph, .panel.compact .chips { display: none; }
      .panel.tappable { cursor: pointer; }
      .panel.tappable:active { background: var(--cpc-panel-2); }

      @media (prefers-reduced-motion: reduce) {
        * { transition: none !important; }
      }
    `;
  }
}

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

    const snapshot = this._watched
      .map((id) => {
        const s = hass.states[id];
        return s ? `${id}:${s.state}` : `${id}:missing`;
      })
      .join("|");

    if (snapshot !== this._lastStates) {
      this._lastStates = snapshot;
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

/* ============================================================================
 * Home-screen cards
 *
 * Five small elements that replace the built-in markdown/tile/grid cards on
 * the phone dashboard. They share PC_TOKENS with the two panels above, so the
 * whole home screen reads as one surface.
 * ========================================================================== */

/* Primitives every home-screen card uses. Kept in one string so the chip,
   label and numeral treatments cannot drift between cards. */
const PC_BASE = `
  :host {
    ${PC_TOKENS}
    display: block;
    font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    color: var(--pc-text);
  }
  * { box-sizing: border-box; }
  .card {
    background: var(--pc-panel);
    border-radius: var(--pc-radius);
    padding: 14px 16px;
  }
  /* Opt-in, because a card that already carries a severity colour should not
     also be washed cool. */
  .card.tint, .tint {
    background-image: linear-gradient(180deg, var(--pc-tint), transparent 130px);
  }
  /* Opt-in translucent surface, so a card dropped into the shell view's
     gradient reads as part of it instead of a solid slab on top of it. */
  .card.glass {
    background: linear-gradient(180deg, rgba(255,255,255,0.062), rgba(255,255,255,0.026));
    background-image: linear-gradient(180deg, rgba(255,255,255,0.062), rgba(255,255,255,0.026));
    border: 1px solid rgba(255,255,255,0.085);
    border-radius: 26px;
    box-shadow: 0 24px 60px -18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.075);
    backdrop-filter: blur(26px) saturate(1.25);
    -webkit-backdrop-filter: blur(26px) saturate(1.25);
  }
  /* Hosted inside the shell's sheet, where the surface is already drawn. A
     card that draws its own on top of it reads as a card inside a card, which
     is exactly what glass-on-glass looks like. Must follow .glass to win. */
  .card.bare {
    background: none;
    background-image: none;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    padding: 0;
  }
  .avatar {
    width: 34px; height: 34px; border-radius: 50%; flex: 0 0 auto;
    background: var(--pc-panel-2); color: var(--pc-muted);
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; overflow: hidden;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .lbl {
    font-size: 10px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--pc-muted);
    font-weight: 500;
  }
  .num { font-variant-numeric: tabular-nums; }
  .row { display: flex; align-items: center; gap: 10px; }
  .spread { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .grow { flex: 1; min-width: 0; }
  .trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ha-icon { --mdc-icon-size: 21px; flex: 0 0 auto; }
  .chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 9px; border-radius: 999px;
    font-size: 11px; font-weight: 600;
    background: var(--pc-chip); color: var(--pc-muted);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .chip ha-icon { --mdc-icon-size: 14px; }
  .tappable { cursor: pointer; }
  .tappable:active { background: var(--pc-panel-2); }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

/* Read a numeric state, or null when it is missing/non-numeric. */
function pcNum(hass, id) {
  if (!id || !hass || !hass.states[id]) return null;
  const v = parseFloat(hass.states[id].state);
  return isNaN(v) ? null : v;
}

/* Raw state string, or "" when the entity is absent. */
function pcState(hass, id) {
  if (!id || !hass || !hass.states[id]) return "";
  return hass.states[id].state;
}

function pcName(hass, id, fallback) {
  if (fallback) return fallback;
  if (!id || !hass || !hass.states[id]) return id || "";
  return hass.states[id].attributes.friendly_name || id;
}

function pcMoreInfo(node, entityId) {
  if (!entityId) return;
  const ev = new Event("hass-more-info", { bubbles: true, composed: true });
  ev.detail = { entityId };
  node.dispatchEvent(ev);
}

/* Run a Lovelace-style action object. Supports the subset the home screen
   needs: navigate, toggle, perform-action, more-info. */
function pcAction(node, hass, action, fallbackEntity) {
  const a = action || { action: "more-info" };
  if (a.action === "none") return;
  if (a.action === "navigate") return pcNavigate(node, a.navigation_path);
  if (a.action === "toggle" && fallbackEntity) {
    return hass.callService("homeassistant", "toggle", { entity_id: fallbackEntity });
  }
  if (a.action === "url") {
    if (a.url_path) window.open(a.url_path, a.new_tab === false ? "_self" : "_blank");
    return;
  }
  if (a.action === "perform-action" || a.action === "call-service") {
    const svc = a.perform_action || a.service;
    if (!svc || svc.indexOf(".") < 0) return;
    const parts = svc.split(".");
    return hass.callService(parts[0], parts[1], a.data || {}, a.target || undefined);
  }
  pcMoreInfo(node, a.entity || fallbackEntity);
}

/* Shared plumbing: re-render only when a watched entity actually changed. */
class PcBaseCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._watched = [];
    this._last = null;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const sig = this._watched
      .map((id) => (hass.states[id] ? hass.states[id].state : "~"))
      .join("|");
    if (sig === this._last) return;
    this._last = sig;
    this._render();
  }

  getCardSize() {
    return 2;
  }
}

/* ---------------------------------------------------------------- header --*/

class PurdyHeaderCard extends PcBaseCard {
  static getStubConfig(hass) {
    const w = Object.keys(hass.states).find((e) => e.startsWith("weather."));
    /* No name key at all, so the greeting follows whoever is signed in. */
    return { weather: w || "weather.home" };
  }

  setConfig(config) {
    this._config = { ...config };
    const c = this._config;
    this._watched = [c.weather, c.occupancy].filter(Boolean);
    this._last = null;
    if (this._clock) clearInterval(this._clock);
    /* The clock is the one thing no entity change drives. */
    this._clock = setInterval(() => this._render(), 30000);
  }

  disconnectedCallback() {
    if (this._clock) clearInterval(this._clock);
  }

  _greeting(h) {
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  /* Who is actually holding the phone. A dashboard shared by a household
     should not greet everyone by the same name, so the logged-in user wins
     unless the config names someone explicitly.

     - name omitted   -> the viewer's own first name
     - name: "Alex"   -> always Alex
     - name: ""       -> no name at all */
  _who() {
    const c = this._config;
    if (c.name !== undefined) return c.name;
    const u = this._hass && this._hass.user;
    if (!u || !u.name) return "";
    return String(u.name).trim().split(/\s+/)[0];
  }

  _render() {
    if (!this._hass || !this._config) return;
    const c = this._config;
    const now = new Date();
    const wState = pcState(this._hass, c.weather);
    const wTemp = c.weather && this._hass.states[c.weather]
      ? this._hass.states[c.weather].attributes.temperature
      : null;
    const occ = pcState(this._hass, c.occupancy);
    const icons = {
      rainy: "mdi:weather-rainy", pouring: "mdi:weather-pouring",
      sunny: "mdi:weather-sunny", clear: "mdi:weather-night",
      "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy",
      partlycloudy: "mdi:weather-partly-cloudy", snowy: "mdi:weather-snowy",
      fog: "mdi:weather-fog", windy: "mdi:weather-windy",
      lightning: "mdi:weather-lightning", hail: "mdi:weather-hail",
    };
    const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const date = now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
    const sub = [date, time, occ].filter(Boolean).join(" · ");

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .wrap { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 2px 6px 0; }
        h2 { font-size: 25px; font-weight: 650; letter-spacing: -0.025em; margin: 0; line-height: 1.1; }
        .sub { font-size: 12.5px; color: var(--pc-muted); font-variant-numeric: tabular-nums; margin-top: 2px; }
        .wx { display: flex; align-items: center; gap: 7px; color: var(--pc-cool); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
        .wx ha-icon { --mdc-icon-size: 22px; }
      </style>
      <div class="wrap">
        <div>
          <h2>${this._greeting(now.getHours())}${this._who() ? ", " + this._who() : ""}</h2>
          <div class="sub">${sub}</div>
        </div>
        ${wTemp == null ? "" : `
          <div class="wx">
            <ha-icon icon="${icons[wState] || "mdi:weather-partly-cloudy"}"></ha-icon>
            ${Math.round(wTemp)}°
          </div>`}
      </div>
    `;
  }

  getCardSize() {
    return 1;
  }
}

/* ------------------------------------------------------------- attention --*/

class PurdyAttentionCard extends PcBaseCard {
  static getStubConfig() {
    return {
      title: "Needs attention",
      rules: [{ entity: "binary_sensor.problem", state: "on", severity: "warn", title: "Problem" }],
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.rules)) {
      throw new Error("purdy-attention-card: 'rules' (a list) is required");
    }
    this._config = { title: "Needs attention", ...config };
    const ids = [];
    (config.rules || []).forEach((r) => {
      if (r.entity) ids.push(r.entity);
    });
    if (config.dismiss_store) ids.push(config.dismiss_store);
    this._watched = ids;
    this._last = null;
    this._groupRule = (config.rules || []).find((r) => r.match);
    this._logged = {};
  }

  /* Group rules match by regex across the whole registry. Rescanning ~1300
     entities on every state change is wasteful, so the id list is cached and
     rebuilt only when the registry size changes or the cache ages out. */
  _matching(pattern) {
    const size = Object.keys(this._hass.states).length;
    const now = Date.now();
    if (!this._mCache || this._mSize !== size || now - this._mAt > 60000) {
      this._mCache = {};
      this._mSize = size;
      this._mAt = now;
    }
    if (!this._mCache[pattern]) {
      const pat = new RegExp(pattern);
      this._mCache[pattern] = Object.keys(this._hass.states).filter((id) => pat.test(id));
    }
    return this._mCache[pattern];
  }

  /* A group rule's entities are not known at setConfig time, so fold them
     into the watch list here — otherwise a battery going low on its own
     would never re-render the card. */
  set hass(hass) {
    if (this._groupRule && this._config) {
      this._hass = hass;
      const pat = new RegExp(this._groupRule.match);
      this._watched = this._watched
        .filter((id) => !pat.test(id))
        .concat(this._matching(this._groupRule.match));
    }
    super.hass = hass;
  }

  /* A rule needs a stable id so a dismissal survives a re-render. Prefer an
     explicit key; fall back to a slug of the title. */
  _key(r, i) {
    if (r.key) return r.key;
    const t = r.title || r.entity || String(i);
    return t.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12);
  }

  /* Store format is "key:epoch|key:epoch" — compact enough that a dozen
     dismissals fit inside input_text's 255-character ceiling. */
  _dismissals() {
    const raw = pcState(this._hass, this._config.dismiss_store);
    const out = {};
    if (!raw || raw === "unknown") return out;
    raw.split("|").forEach((pair) => {
      const bits = pair.split(":");
      if (bits.length === 2 && bits[0]) out[bits[0]] = parseInt(bits[1], 10) || 0;
    });
    return out;
  }

  _writeDismissals(map) {
    const val = Object.keys(map)
      .map((k) => k + ":" + map[k])
      .join("|")
      .slice(0, 255);
    this._hass.callService("input_text", "set_value", {
      entity_id: this._config.dismiss_store,
      value: val,
    });
  }

  /* When did this rule's condition last change? A dismissal older than that
     means the fault re-fired, so the row comes back. */
  _firedAt(r) {
    if (r.entity && this._hass.states[r.entity]) {
      return Math.floor(new Date(this._hass.states[r.entity].last_changed).getTime() / 1000);
    }
    if (r.match) {
      let newest = 0;
      this._matching(r.match).forEach((id) => {
        if (!this._hass.states[id] || this._hass.states[id].state !== (r.state || "on")) return;
        const t = Math.floor(new Date(this._hass.states[id].last_changed).getTime() / 1000);
        if (t > newest) newest = t;
      });
      return newest;
    }
    return 0;
  }

  _matches(r) {
    const s = pcState(this._hass, r.entity);
    if (r.state !== undefined) return s === r.state;
    if (r.state_not !== undefined) return s !== r.state_not && s !== "";
    const n = pcNum(this._hass, r.entity);
    if (r.above !== undefined) return n != null && n > r.above;
    if (r.below !== undefined) return n != null && n < r.below;
    return false;
  }

  /* Every rule that currently matches, before dismissals are applied. */
  _raised() {
    const out = [];
    (this._config.rules || []).forEach((r, i) => {
      if (r.match) {
        const hits = this._matching(r.match)
          .filter((id) => this._hass.states[id] && this._hass.states[id].state === (r.state || "on"))
          .map((id) => (this._hass.states[id].attributes.friendly_name || id)
            .replace(r.strip || "", "").trim());
        if (hits.length) {
          out.push({
            key: this._key(r, i), rule: r,
            severity: r.severity || "info",
            title: hits.length + " " + (r.title || "items"),
            detail: hits.join(" · "),
            entity: null,
            firedAt: this._firedAt(r),
          });
        }
        return;
      }
      if (this._matches(r)) {
        out.push({
          key: this._key(r, i), rule: r,
          severity: r.severity || "warn",
          title: r.title || pcName(this._hass, r.entity),
          detail: r.detail || "",
          entity: r.entity,
          firedAt: this._firedAt(r),
        });
      }
    });
    return out;
  }

  _rows() {
    const dis = this._dismissals();
    const now = Math.floor(Date.now() / 1000);
    return this._raised().filter((row) => {
      const at = dis[row.key];
      if (!at) return true;
      /* Re-show once the condition changes again... */
      if (row.firedAt > at) return true;
      /* ...or once the snooze window lapses. */
      const hrs = this._config.dismiss_hours;
      if (hrs && now - at > hrs * 3600) return true;
      return false;
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

  /* --- notification log ------------------------------------------------- */

  async _items() {
    if (!this._config.log_to) return [];
    const res = await this._hass.callWS({
      type: "todo/item/list",
      entity_id: this._config.log_to,
    });
    return (res && res.items) || [];
  }

  /* One open log entry per raised rule. The key lives in the description so
     the entry can be found again without depending on the wording. */
  async _syncLog(rows) {
    if (!this._config.log_to || !rows.length) return;
    const items = await this._items();
    for (const row of rows) {
      const tag = "[" + row.key + "]";
      const open = items.find(
        (it) => (it.description || "").indexOf(tag) >= 0 && it.status !== "completed"
      );
      if (open) continue;
      if (this._logged[row.key] === row.firedAt) continue;
      this._logged[row.key] = row.firedAt;
      this._hass.callService("todo", "add_item", {
        entity_id: this._config.log_to,
        item: row.title,
        description: tag + " " + row.severity + " · " + (row.detail || "") +
          " · raised " + new Date(row.firedAt * 1000).toISOString(),
      });
    }
  }

  async _closeLog(row) {
    const items = await this._items();
    const tag = "[" + row.key + "]";
    const open = items.find(
      (it) => (it.description || "").indexOf(tag) >= 0 && it.status !== "completed"
    );
    if (!open) return;
    this._hass.callService("todo", "update_item", {
      entity_id: this._config.log_to,
      item: open.uid,
      status: "completed",
    });
  }

  _render() {
    if (!this._hass || !this._config) return;
    const rows = this._rows();
    if (this._config.log_to) this._syncLog(this._raised());
    if (!rows.length) {
      this.shadowRoot.innerHTML = "";
      this.style.display = "none";
      return;
    }
    this.style.display = "block";
    const worst = rows.some((r) => r.severity === "critical") ? "critical" : "warn";
    const canDismiss = !!this._config.dismiss_store;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .card { border-left: 3px solid var(--edge); padding-left: 13px; }
        .hd { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: var(--edge); }
        .hd .lbl { color: var(--edge); }
        .hd .spacer { flex: 1; }
        .all {
          font-size: 11px; color: var(--pc-muted); cursor: pointer;
          background: var(--pc-chip); border: 0; border-radius: 999px;
          padding: 3px 9px; font-family: inherit;
        }
        .all:hover { color: var(--pc-text); }
        .r { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid var(--pc-line); }
        .r:first-of-type { border-top: none; }
        .r .t { font-size: 13.5px; font-weight: 600; }
        .r .d { font-size: 12px; color: var(--pc-muted); }
        .dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
        .dot.critical { background: var(--pc-bad); }
        .dot.warn { background: var(--pc-warn); }
        .dot.info { background: var(--pc-muted); }
        .x {
          flex: 0 0 auto; border: 0; background: var(--pc-chip); cursor: pointer;
          width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: var(--pc-muted); padding: 0;
        }
        .x:hover { color: var(--pc-text); background: var(--pc-panel-2); }
        .x ha-icon { --mdc-icon-size: 15px; }
        .x:focus-visible, .all:focus-visible { outline: 2px solid var(--pc-cool); outline-offset: 2px; }
      </style>
      <div class="card" style="--edge: ${worst === "critical" ? "var(--pc-bad)" : "var(--pc-warn)"}">
        <div class="hd">
          <ha-icon icon="mdi:alert-circle-outline" style="--mdc-icon-size:16px"></ha-icon>
          <span class="lbl">${this._config.title} · ${rows.length}</span>
          <span class="spacer"></span>
          ${canDismiss && rows.length > 1
            ? `<button class="all" type="button" id="all">Dismiss all</button>` : ""}
        </div>
        ${rows.map((r, i) => `
          <div class="r">
            <span class="dot ${r.severity}"></span>
            <div class="grow ${r.entity ? "tappable" : ""}" data-info="${r.entity || ""}">
              <div class="t">${r.title}</div>
              ${r.detail ? `<div class="d">${r.detail}</div>` : ""}
            </div>
            ${canDismiss
              ? `<button class="x" type="button" data-idx="${i}" aria-label="Dismiss ${r.title}">
                   <ha-icon icon="mdi:close"></ha-icon>
                 </button>`
              : `<ha-icon icon="mdi:chevron-right" style="--mdc-icon-size:16px;color:var(--pc-muted)"></ha-icon>`}
          </div>`).join("")}
      </div>
    `;

    this._rowData = rows;
    this.shadowRoot.querySelectorAll("[data-info]").forEach((el) => {
      if (!el.dataset.info) return;
      el.addEventListener("click", () => pcMoreInfo(this, el.dataset.info));
    });
    this.shadowRoot.querySelectorAll("[data-idx]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._dismiss(this._rowData[parseInt(el.dataset.idx, 10)]);
      });
    });
    const all = this.shadowRoot.getElementById("all");
    if (all) {
      all.addEventListener("click", () => {
        const map = this._dismissals();
        const now = Math.floor(Date.now() / 1000);
        this._rowData.forEach((r) => {
          map[r.key] = now;
          if (this._config.log_to) this._closeLog(r);
        });
        this._writeDismissals(map);
        this._last = null;
        this._render();
      });
    }
  }

  getCardSize() {
    return 3;
  }
}

/* --------------------------------------------------------- notifications --*/

/* Reads the todo list the attention card logs into, so dismissed items stay
   readable instead of vanishing. */
class PurdyNotificationsCard extends PcBaseCard {
  static getStubConfig(hass) {
    const t = Object.keys(hass.states).find((e) => e.startsWith("todo."));
    return { entity: t || "todo.notification_center", title: "Notifications" };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("purdy-notifications-card: 'entity' (a todo list) is required");
    }
    this._config = { title: "Notifications", max: 50, unread: [], ...config };
    this._watched = [config.entity].concat(
      (this._config.unread || []).map((u) => u.entity)
    );
    this._last = null;
    this._items = null;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._config) return;
    /* Refetch when the list changes; re-render alone when only a counter did. */
    const sig = this._watched.map((id) => pcState(hass, id)).join("|");
    if (!first && sig === this._last) return;
    const listChanged = first || pcState(hass, this._config.entity) !== this._listSig;
    this._last = sig;
    this._listSig = pcState(hass, this._config.entity);
    if (listChanged) this._fetch();
    else this._render();
  }

  /* Unread counters from an upstream system (Unraid, for instance). Zero
     counts are dropped so a quiet source shows nothing at all. */
  _unreadHtml() {
    const chips = (this._config.unread || [])
      .map((u) => ({ ...u, n: pcNum(this._hass, u.entity) }))
      .filter((u) => u.n != null && u.n > 0);
    if (!chips.length) return "";
    return `
      <div class="chips">
        ${chips.map((u) => `
          <span class="chip ${u.severity || "info"} tappable" data-info="${u.entity}">
            <span class="cdot"></span>${u.n} ${u.label || pcName(this._hass, u.entity)}
          </span>`).join("")}
      </div>`;
  }

  async _fetch() {
    const res = await this._hass.callWS({
      type: "todo/item/list",
      entity_id: this._config.entity,
    });
    this._items = (res && res.items) || [];
    this._render();
  }

  /* The attention card encodes "[key] severity · detail · raised <iso>". */
  _parse(it) {
    const d = it.description || "";
    const sev = /\b(critical|warn|info)\b/.exec(d);
    const iso = /raised (\S+)/.exec(d);
    let detail = d.replace(/^\[[^\]]*\]\s*/, "").replace(/\braised \S+\s*/, "");
    detail = detail.replace(/^(critical|warn|info)\s*·?\s*/, "").replace(/·\s*$/, "").trim();
    return {
      uid: it.uid,
      /* "Notice [PURDYNAS] - Version update ac65..33a6" spends its first twenty
         characters saying what the severity dot beside it already says, then
         pushes the real subject onto a second line or off the end. The systems
         page learned this in v1.46.2 and the log never did — same feed, same
         rows, two renderers. Stripped here so the fix covers the items already
         written as well as the ones to come. */
      summary: String(it.summary || "Notification")
        .replace(/^\s*(Notice|Alert|Warning|Info)\s*\[[^\]]*\]\s*[-–—]\s*/i, ""),
      severity: sev ? sev[1] : "info",
      detail,
      at: iso ? new Date(iso[1]).getTime() : null,
      done: it.status === "completed",
    };
  }

  _rel(ms) {
    if (!ms) return "";
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  _render() {
    if (!this._hass || !this._config || !this._items) return;
    const parsed = this._items.map((it) => this._parse(it));
    parsed.sort((a, b) => (b.at || 0) - (a.at || 0));
    const active = parsed.filter((p) => !p.done).slice(0, this._config.max);
    const done = parsed.filter((p) => p.done).slice(0, this._config.max);

    const row = (p) => `
      <div class="n ${p.done ? "done" : ""}">
        <span class="dot ${p.severity}"></span>
        <div class="grow">
          <div class="t">${pcEsc(p.summary)}</div>
          ${p.detail ? `<div class="d">${pcEsc(p.detail)}</div>` : ""}
        </div>
        <span class="when num">${this._rel(p.at)}</span>
        ${p.done
          ? `<button class="act" type="button" data-restore="${p.uid}" aria-label="Restore">
               <ha-icon icon="mdi:restore"></ha-icon></button>`
          : `<button class="act" type="button" data-done="${p.uid}" aria-label="Dismiss">
               <ha-icon icon="mdi:close"></ha-icon></button>`}
      </div>`;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .hd { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .hd .spacer { flex: 1; }
        .sec { margin-top: 12px; }
        .sec:first-of-type { margin-top: 6px; }
        .n { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--pc-line); }
        .n:first-of-type { border-top: none; }
        .n .t { font-size: 13.5px; font-weight: 600; }
        .n .d { font-size: 12px; color: var(--pc-muted); }
        .n.done .t, .n.done .d { color: var(--pc-muted); }
        .n.done .t { font-weight: 500; text-decoration: line-through; text-decoration-color: var(--pc-line); }
        .when { font-size: 11px; color: var(--pc-muted); white-space: nowrap; }
        .dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
        .dot.critical { background: var(--pc-bad); }
        .dot.warn { background: var(--pc-warn); }
        .dot.info { background: var(--pc-muted); }
        .n.done .dot { opacity: 0.45; }
        .act {
          flex: 0 0 auto; border: 0; background: var(--pc-chip); cursor: pointer;
          width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: var(--pc-muted); padding: 0;
        }
        .act:hover { color: var(--pc-text); }
        .act ha-icon { --mdc-icon-size: 15px; }
        .act:focus-visible, .clear:focus-visible { outline: 2px solid var(--pc-cool); outline-offset: 2px; }
        .clear {
          font-size: 11px; color: var(--pc-muted); cursor: pointer;
          background: var(--pc-chip); border: 0; border-radius: 999px;
          padding: 3px 9px; font-family: inherit;
        }
        .empty { color: var(--pc-muted); font-size: 13px; padding: 10px 0 4px; }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 2px; }
        .chip .cdot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .chip.critical { background: rgba(239, 106, 106, 0.15); color: var(--pc-bad); }
        .chip.warn { background: rgba(242, 193, 78, 0.14); color: var(--pc-warn); }
      </style>
      <div class="card tint${this._config.glass ? " glass" : ""}${this._config.bare ? " bare" : ""}">
        <div class="hd">
          ${/* The shell blanks a hosted card's title because the sheet chrome
                already names itself — which left this bell sitting alone on an
                otherwise empty row. An icon with nothing to label is not a
                header. */
            this._config.title ? `<ha-icon icon="mdi:bell-outline" style="--mdc-icon-size:18px;color:var(--pc-muted)"></ha-icon>
          <span class="lbl">${pcEsc(this._config.title)}</span>` : ""}
          <span class="spacer"></span>
          ${done.length ? `<button class="clear" type="button" id="clear">Clear history</button>` : ""}
        </div>
        ${this._unreadHtml()}

        ${active.length ? `
          <div class="sec">
            <span class="lbl">Active · ${active.length}</span>
            ${active.map(row).join("")}
          </div>` : `<div class="empty">Nothing active — the house is quiet.</div>`}

        ${done.length ? `
          <div class="sec">
            <span class="lbl">Dismissed · ${done.length}</span>
            ${done.map(row).join("")}
          </div>` : ""}
      </div>
    `;

    const call = (uid, status) =>
      this._hass.callService("todo", "update_item", {
        entity_id: this._config.entity, item: uid, status,
      });

    this.shadowRoot.querySelectorAll("[data-done]").forEach((el) => {
      el.addEventListener("click", () => { call(el.dataset.done, "completed"); this._fetch(); });
    });
    this.shadowRoot.querySelectorAll("[data-restore]").forEach((el) => {
      el.addEventListener("click", () => { call(el.dataset.restore, "needs_action"); this._fetch(); });
    });
    const clear = this.shadowRoot.getElementById("clear");
    if (clear) {
      clear.addEventListener("click", () => {
        this._hass.callService("todo", "remove_completed_items", {
          entity_id: this._config.entity,
        });
        setTimeout(() => this._fetch(), 400);
      });
    }
  }

  getCardSize() {
    return 5;
  }
}

/* ---------------------------------------------------------------- people --*/

class PurdyPeopleCard extends PcBaseCard {
  static getStubConfig(hass) {
    const people = Object.keys(hass.states).filter((e) => e.startsWith("person.")).slice(0, 2);
    return { people: (people.length ? people : ["person.someone"]).map((e) => ({ entity: e })) };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.people)) {
      throw new Error("purdy-people-card: 'people' (a list) is required");
    }
    this._config = config;
    const ids = [];
    config.people.forEach((p) => {
      [p.entity, p.battery, p.steps].forEach((x) => x && ids.push(x));
    });
    this._watched = ids;
    this._last = null;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const fmt = (n) => (n == null ? "—" : n.toLocaleString());

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .wrap { display: flex; gap: 9px; }
        .p { flex: 1; background: var(--pc-panel); border-radius: 20px; padding: 12px 13px; min-width: 0; }
        .who { display: flex; align-items: center; gap: 9px; min-width: 0; }
        .nm { font-weight: 650; font-size: 15px; letter-spacing: -0.01em; }
        .st { font-size: 11.5px; font-weight: 600; }
        .st.home { color: var(--pc-good); }
        .st.away { color: var(--pc-muted); }
        .foot { display: flex; gap: 6px; margin-top: 10px; }
        .mini {
          flex: 1; background: var(--pc-panel-2); border-radius: 10px; padding: 4px 7px;
          font-size: 11px; font-variant-numeric: tabular-nums; color: var(--pc-muted);
          display: flex; align-items: center; gap: 4px; justify-content: center;
        }
        .mini ha-icon { --mdc-icon-size: 14px; }
        .mini.low { color: var(--pc-warn); }
      </style>
      <div class="wrap">
        ${this._config.people.map((p) => {
          const state = pcState(this._hass, p.entity);
          const home = state === "home";
          const batt = pcNum(this._hass, p.battery);
          const steps = pcNum(this._hass, p.steps);
          const nm = pcName(this._hass, p.entity, p.name);
          const st = this._hass.states[p.entity];
          const pic = st && st.attributes.entity_picture;
          return `
            <div class="p tint tappable" data-entity="${p.entity}">
              <div class="who">
                <div class="avatar">${
                  pic ? `<img src="${pic}" alt="" />` : (nm || "?").charAt(0).toUpperCase()
                }</div>
                <div class="grow">
                  <div class="nm trunc">${nm}</div>
                  <div class="st ${home ? "home" : "away"}">${home ? "Home" : (state ? state.replace(/_/g, " ") : "Unknown")}</div>
                </div>
              </div>
              <div class="foot">
                ${p.battery ? `<span class="mini ${batt != null && batt < 20 ? "low" : ""}">
                  <ha-icon icon="mdi:battery-outline"></ha-icon>${batt == null ? "—" : Math.round(batt) + "%"}
                </span>` : ""}
                ${p.steps ? `<span class="mini">
                  <ha-icon icon="mdi:walk"></ha-icon>${fmt(steps == null ? null : Math.round(steps))}
                </span>` : ""}
              </div>
            </div>`;
        }).join("")}
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => {
      el.addEventListener("click", () => pcMoreInfo(this, el.dataset.entity));
    });
  }
}

/* ----------------------------------------------------------------- rooms --*/

class PurdyRoomsCard extends PcBaseCard {
  static getStubConfig(hass) {
    const t = Object.keys(hass.states)
      .filter((e) => hass.states[e].attributes.device_class === "temperature")
      .slice(0, 3);
    return { rooms: (t.length ? t : ["sensor.temperature"]).map((e) => ({ temp: e })) };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.rooms)) {
      throw new Error("purdy-rooms-card: 'rooms' (a list) is required");
    }
    this._config = config;
    const ids = [];
    config.rooms.forEach((r) => {
      [r.temp, r.humidity].forEach((x) => x && ids.push(x));
    });
    this._watched = ids;
    this._last = null;
  }

  _render() {
    if (!this._hass || !this._config) return;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .strip::-webkit-scrollbar { display: none; }
        .rm {
          flex: 0 0 auto; min-width: 86px;
          background: var(--pc-panel); border-radius: 18px; padding: 11px 12px;
        }
        .rm.accent { background: rgba(77, 208, 225, 0.10); }
        .rm .nm { font-size: 10.5px; color: var(--pc-muted); text-transform: uppercase; letter-spacing: 0.08em; }
        .rm b { display: block; font-size: 19px; font-weight: 650; font-variant-numeric: tabular-nums; margin-top: 4px; letter-spacing: -0.02em; }
        .rm .hum { font-size: 10.5px; color: var(--pc-muted); font-variant-numeric: tabular-nums; }
      </style>
      <div class="strip">
        ${this._config.rooms.map((r) => {
          const t = pcNum(this._hass, r.temp);
          const h = pcNum(this._hass, r.humidity);
          return `
            <div class="rm ${r.accent ? "accent" : ""} tappable" data-entity="${r.temp}">
              <span class="nm">${r.name || pcName(this._hass, r.temp)}</span>
              <b>${t == null ? "—" : t.toFixed(1) + "°"}</b>
              <span class="hum">${h == null ? "" : h.toFixed(1) + "%"}</span>
            </div>`;
        }).join("")}
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => {
      el.addEventListener("click", () => pcMoreInfo(this, el.dataset.entity));
    });
  }
}

/* ----------------------------------------------------------------- quick --*/

class PurdyQuickCard extends PcBaseCard {
  static getStubConfig(hass) {
    const l = Object.keys(hass.states).filter((e) => e.startsWith("light.")).slice(0, 3);
    return { columns: 3, tiles: (l.length ? l : ["light.example"]).map((e) => ({ entity: e })) };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.tiles)) {
      throw new Error("purdy-quick-card: 'tiles' (a list) is required");
    }
    this._config = { columns: 3, ...config };
    this._watched = config.tiles
      .reduce((acc, t) => acc.concat([t.entity, t.value_entity, t.bar_entity]), [])
      .filter(Boolean);
    this._last = null;
  }

  /* on → accent, alert → red, otherwise neutral. */
  _tone(t) {
    const s = pcState(this._hass, t.entity);
    if (t.alert_when && t.alert_when.indexOf(s) >= 0) return "alert";
    if (t.on_when) return t.on_when.indexOf(s) >= 0 ? "on" : "";
    return s === "on" || s === "playing" || s === "cleaning" ? "on" : "";
  }

  _render() {
    if (!this._hass || !this._config) return;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .grid { display: grid; grid-template-columns: repeat(${this._config.columns}, 1fr); gap: 9px; }
        .t {
          background: var(--pc-panel); border-radius: 20px; padding: 12px 11px;
          display: flex; flex-direction: column; gap: 7px; min-height: 84px;
        }
        .t ha-icon { --mdc-icon-size: 26px; color: var(--pc-muted); }
        .t .tl { font-size: 12px; font-weight: 600; letter-spacing: -0.01em; }
        .t .tv { font-size: 11px; color: var(--pc-muted); font-variant-numeric: tabular-nums; }
        .t.on { background: rgba(242, 193, 78, 0.13); }
        .t.on ha-icon, .t.on .tl { color: var(--pc-warn); }
        .t.alert { background: rgba(239, 106, 106, 0.13); }
        .t.alert ha-icon, .t.alert .tl { color: var(--pc-bad); }
        .t.hasbar { position: relative; overflow: hidden; padding-bottom: 15px; }
        .fill { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: var(--pc-track); }
        .fill i { display: block; height: 100%; transition: width 0.3s ease; }
        @media (prefers-reduced-motion: reduce) { .fill i { transition: none; } }
      </style>
      <div class="grid">
        ${this._config.tiles.map((t, i) => {
          const st = this._hass.states[t.entity];
          /* The second line can come from a different entity — a tile for the
             vacuum that reads out its waste drawer, for instance. */
          const vs = this._hass.states[t.value_entity || t.entity];
          const raw = vs ? vs.state : "";
          const unit = vs && vs.attributes.unit_of_measurement ? " " + vs.attributes.unit_of_measurement : "";
          const value = t.value_text || (raw ? raw.replace(/_/g, " ") + unit : "—");
          /* An optional fill bar. Colour tracks the level, not the tile tone —
             a nearly-full waste tank should read amber even when the machine
             itself is idle and healthy. */
          let bar = "";
          if (t.bar_entity) {
            const pct = pcNum(this._hass, t.bar_entity);
            if (pct != null) {
              const max = t.bar_max || 100;
              const p = Math.max(0, Math.min(100, (pct / max) * 100));
              const warn = t.bar_warn_above == null ? 80 : t.bar_warn_above;
              const crit = t.bar_critical_above == null ? 95 : t.bar_critical_above;
              const col = p >= crit ? "var(--pc-bad)" : p >= warn ? "var(--pc-warn)" : "var(--pc-cool)";
              bar = `<div class="fill"><i style="width:${p.toFixed(0)}%;background:${col}"></i></div>`;
            }
          }
          return `
            <div class="t ${this._tone(t)} ${bar ? "hasbar" : ""} tappable" data-idx="${i}">
              <ha-icon icon="${t.icon || (st && st.attributes.icon) || "mdi:circle-outline"}"></ha-icon>
              <div>
                <div class="tl trunc">${pcName(this._hass, t.entity, t.name)}</div>
                <div class="tv trunc">${value}</div>
              </div>
              ${bar}
            </div>`;
        }).join("")}
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-idx]").forEach((el) => {
      el.addEventListener("click", () => {
        const t = this._config.tiles[parseInt(el.dataset.idx, 10)];
        if (t) pcAction(this, this._hass, t.tap_action, t.entity);
      });
    });
  }

  getCardSize() {
    return 3;
  }
}


/* ------------------------------------------------------------------ remote --*/

/* Brand marks drawn inline. The cbi:/si:/phu: iconsets are not reliably
   present, and a missing icon renders as an empty box — so the card owns
   its artwork rather than depending on an iconset being installed. */
const PC_BRANDS = {
  netflix: `<svg viewBox="0 0 24 24"><path fill="#B20710" d="M6.6 2h3.9l7 20h-3.9z"/><path fill="#E50914" d="M6.6 2h3.9v20H6.6zM13.5 2h3.9v20h-3.9z"/></svg>`,
  disney: `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#0C204A"/><text x="12" y="16.4" text-anchor="middle" font-family="Georgia,serif" font-size="11" font-style="italic" font-weight="700" fill="#fff">D+</text></svg>`,
  prime: `<svg viewBox="0 0 24 24"><rect x="2" y="3.5" width="20" height="17" rx="4" fill="#1399FF"/><path fill="#fff" d="M9.8 8.2l6 3.4-6 3.4z"/><path d="M6.6 17.4c3.1 1.7 7.7 1.7 10.8 0" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  peacock: `<svg viewBox="0 0 24 24"><g fill="none" stroke-width="2.4" stroke-linecap="round"><path stroke="#0089CF" d="M12 21C8.2 18.2 6.3 13 7.3 8"/><path stroke="#6E3FA3" d="M12 21c-1.9-3.9-2.4-9-1.4-13"/><path stroke="#E4002B" d="M12 21c0-4 .5-9 1.5-13"/><path stroke="#F6A800" d="M12 21c1.9-3.9 4-7.9 5.5-10.6"/><path stroke="#FFD100" d="M12 21c2.9-3 5.9-5.9 7.9-7.7"/></g></svg>`,
  twitch: `<svg viewBox="0 0 24 24"><path fill="#9146FF" d="M4.4 3h15.2v10.6l-3.6 3.6h-3L10 20.4H8.1v-3.2H4.4z"/><path fill="#fff" d="M10.4 6.9h1.8v5.2h-1.8zM14.6 6.9h1.8v5.2h-1.8z"/></svg>`,
  f1: `<svg viewBox="0 0 24 24"><text x="12" y="16.2" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="11" font-style="italic" font-weight="900" fill="#E10600">F1</text></svg>`,
  jellyfin: `<svg viewBox="0 0 24 24"><path fill="#AA5CC3" d="M12 3.4c1.7 0 6.4 8.4 5.5 9.9-.9 1.5-10.1 1.5-11 0C5.6 11.8 10.3 3.4 12 3.4z"/><path fill="#00A4DC" d="M12 9.6c1.2 0 4.6 6.1 4 7.2-.6 1.1-7.4 1.1-8 0-.6-1.1 2.8-7.2 4-7.2z"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="4.2" fill="#FF0000"/><path fill="#fff" d="M10.2 8.6l6 3.4-6 3.4z"/></svg>`,
  plex: `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#1F1F1F"/><path fill="#E5A00D" d="M8 4h4.6l4.6 8-4.6 8H8l4.6-8z"/></svg>`,
};

class PurdyRemoteCard extends PcBaseCard {
  static getStubConfig(hass) {
    const r = Object.keys(hass.states).find((e) => e.startsWith("remote."));
    return { tvs: [{ name: "TV", remote: r || "remote.tv" }], apps: [] };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.tvs) || !config.tvs.length) {
      throw new Error("purdy-remote-card: 'tvs' (a list) is required");
    }
    this._config = { title: "Televisions", apps: [], ...config };
    const ids = [];
    config.tvs.forEach((t) => {
      [t.remote, t.app_sensor, t.media_player].forEach((x) => x && ids.push(x));
    });
    this._watched = ids;
    this._last = null;
    this._sel = 0;
  }

  _tv() {
    return this._config.tvs[this._sel] || this._config.tvs[0];
  }

  _isOn(t) {
    if (t.media_player && this._hass.states[t.media_player]) {
      const ms = pcState(this._hass, t.media_player);
      return ms !== "off" && ms !== "unavailable" && ms !== "unknown" && ms !== "";
    }
    return pcState(this._hass, t.remote) === "on";
  }

  /* Default to whichever television is actually on. */
  _autoSelect() {
    if (this._touched) return;
    const i = this._config.tvs.findIndex((t) => this._isOn(t));
    if (i >= 0) this._sel = i;
  }

  _send(command) {
    const t = this._tv();
    if (!t.remote) return;
    this._hass.callService("remote", "send_command", {
      entity_id: t.remote, command,
    });
  }

  _launch(activity) {
    const t = this._tv();
    if (!t.remote) return;
    this._hass.callService("remote", "turn_on", { entity_id: t.remote, activity });
  }

  _muted(t) {
    const st = this._hass.states[t.media_player];
    return !!(st && st.attributes.is_volume_muted);
  }

  /* Volume steps rather than sets. Samsung's Tizen websocket advertises
     VOLUME_SET but never honours it and reports volume_level as 0 forever,
     so an absolute slider is meaningless. VOLUME_STEP works everywhere. */
  _step(dir) {
    const t = this._tv();
    if (!t.media_player) return;
    this._hass.callService("media_player", dir > 0 ? "volume_up" : "volume_down", {
      entity_id: t.media_player,
    });
  }

  _toggleMute() {
    const t = this._tv();
    if (!t.media_player) return;
    this._hass.callService("media_player", "volume_mute", {
      entity_id: t.media_player, is_volume_muted: !this._muted(t),
    });
  }

  _power() {
    const t = this._tv();
    const on = this._isOn(t);
    if (t.media_player && this._hass.states[t.media_player]) {
      this._hass.callService("media_player", on ? "turn_off" : "turn_on", {
        entity_id: t.media_player,
      });
      return;
    }
    if (!t.remote) return;
    this._hass.callService("remote", on ? "turn_off" : "turn_on", { entity_id: t.remote });
  }

  _render() {
    if (!this._hass || !this._config) return;
    this._autoSelect();
    const tvs = this._config.tvs;
    const t = this._tv();
    const on = this._isOn(t);
    const app = pcState(this._hass, t.app_sensor);
    const onCount = tvs.filter((x) => this._isOn(x)).length;

    const key = (icon, cmd, cls) =>
      `<button class="k ${cls || ""}" type="button" data-cmd="${cmd}" aria-label="${cmd}">
         <ha-icon icon="${icon}"></ha-icon></button>`;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .hd { display: flex; align-items: center; gap: 8px; padding: 0 4px 10px; }
        .hd b { font-size: 20px; font-weight: 650; letter-spacing: -0.02em; }
        .hd .spacer { flex: 1; }
        .chip.good { background: rgba(129,201,149,0.15); color: var(--pc-good); }
        .chip .cdot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

        .seg { display: flex; background: var(--pc-chip); border-radius: 14px; padding: 3px; gap: 3px; margin-bottom: 11px; }
        .seg button {
          flex: 1; border: 0; background: none; cursor: pointer; font-family: inherit;
          padding: 8px 6px; border-radius: 11px; color: var(--pc-muted);
          font-size: 12.5px; font-weight: 600; display: flex; align-items: center;
          justify-content: center; gap: 5px;
        }
        .seg button.sel { background: var(--pc-panel-2); color: var(--pc-text); }
        .seg .live { width: 6px; height: 6px; border-radius: 50%; background: var(--pc-good); }

        .now { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .art {
          width: 46px; height: 46px; border-radius: 13px; flex: 0 0 auto;
          display: flex; align-items: center; justify-content: center;
          background: var(--pc-panel-2); color: var(--pc-muted);
        }
        .art.on { background: linear-gradient(140deg, #9146ff, #5c2ea8); color: #fff; }
        .now .t { font-size: 16px; font-weight: 650; letter-spacing: -0.015em; }
        .pwr {
          flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%;
          border: 0; cursor: pointer; background: var(--pc-chip);
          display: flex; align-items: center; justify-content: center;
        }
        .pwr ha-icon { color: var(--pc-bad); }
        .pwr.off ha-icon { color: var(--pc-good); }

        .apps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 6px; }
        .app {
          aspect-ratio: 1; border: 0; cursor: pointer; font-family: inherit;
          border-radius: 16px; background: var(--pc-panel-2);
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 5px; padding: 0;
          font-size: 9px; letter-spacing: 0.04em; color: var(--pc-muted);
        }
        .app svg { width: 26px; height: 26px; }

        .dpad { position: relative; width: 214px; height: 214px; margin: 10px auto 0; }
        .dpad .ring { position: absolute; inset: 0; border-radius: 50%; background: var(--pc-panel-2); }
        .dpad button { position: absolute; border: 0; background: none; cursor: pointer; padding: 0;
          display: flex; align-items: center; justify-content: center; color: var(--pc-text); }
        .dpad .k { width: 54px; height: 54px; border-radius: 50%; }
        .dpad .k:active { background: var(--pc-chip); }
        .dpad .up { top: 8px; left: 80px; }
        .dpad .dn { bottom: 8px; left: 80px; }
        .dpad .lf { left: 8px; top: 80px; }
        .dpad .rt { right: 8px; top: 80px; }
        .dpad .ok {
          width: 84px; height: 84px; border-radius: 50%; top: 65px; left: 65px;
          background: var(--pc-chip); font-size: 13.5px; font-weight: 650;
        }
        .dpad ha-icon { --mdc-icon-size: 26px; }

        .row { display: flex; gap: 8px; margin-top: 9px; }
        .row button {
          flex: 1; height: 46px; border: 0; border-radius: 15px; cursor: pointer;
          background: var(--pc-panel-2); color: var(--pc-text);
          display: flex; align-items: center; justify-content: center; font-family: inherit;
        }
        .row button:active { background: var(--pc-chip); }
        button:focus-visible { outline: 2px solid var(--pc-cool); outline-offset: 2px; }
        .off-note { text-align: center; color: var(--pc-muted); font-size: 12.5px; padding: 18px 0 6px; }
        .vol { display: flex; align-items: center; gap: 11px; margin: 0 0 14px; }
        .vbtn { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; border: 0;
                cursor: pointer; background: var(--pc-chip); color: var(--pc-muted);
                display: flex; align-items: center; justify-content: center; }
        .vbtn ha-icon { --mdc-icon-size: 18px; }
        .vstep { flex: 1; height: 40px; border-radius: 14px; border: 0; cursor: pointer;
                 background: var(--pc-panel-2); color: var(--pc-text);
                 display: flex; align-items: center; justify-content: center; }
        .vstep:active { background: var(--pc-chip); }
        .vbtn.muted { color: var(--pc-bad); }
      </style>

      <div class="card tint${this._config.glass ? " glass" : ""}${this._config.bare ? " bare" : ""}">
        <div class="hd">
          <b>${this._config.title}</b>
          <span class="spacer"></span>
          <span class="chip ${onCount ? "good" : ""}">
            ${onCount ? '<span class="cdot"></span>' : ""}${onCount} on
          </span>
        </div>

        ${tvs.length > 1 ? `
          <div class="seg">
            ${tvs.map((x, i) => `
              <button type="button" data-sel="${i}" class="${i === this._sel ? "sel" : ""}">
                ${this._isOn(x) ? '<span class="live"></span>' : ""}${x.name}
              </button>`).join("")}
          </div>` : ""}

        <div class="now">
          <div class="art ${on ? "on" : ""}"><ha-icon icon="mdi:television"></ha-icon></div>
          <div class="grow">
            <div class="t trunc">${on ? (app && app !== "Idle" ? app : "Home screen") : "Off"}</div>
            <div class="lbl trunc">${t.name}</div>
          </div>
          <button class="pwr ${on ? "" : "off"}" type="button" id="pwr" aria-label="Power">
            <ha-icon icon="mdi:power"></ha-icon>
          </button>
        </div>

        ${on && t.media_player && this._hass.states[t.media_player] ? `
          <div class="vol">
            <button class="vstep" type="button" id="voldown" aria-label="Volume down">
              <ha-icon icon="mdi:volume-minus"></ha-icon>
            </button>
            <button class="vbtn ${this._muted(t) ? "muted" : ""}" type="button" id="mute" aria-label="Mute">
              <ha-icon icon="${this._muted(t) ? "mdi:volume-off" : "mdi:volume-high"}"></ha-icon>
            </button>
            <button class="vstep" type="button" id="volup" aria-label="Volume up">
              <ha-icon icon="mdi:volume-plus"></ha-icon>
            </button>
          </div>` : ""}

        ${!on ? `<div class="off-note">${t.name} is off — turn it on to use the remote.</div>` : `
          <span class="lbl">Apps</span>
          <div class="apps">
            ${(this._config.apps || []).map((a) => `
              <button class="app" type="button" data-app="${a.activity}">
                ${PC_BRANDS[a.brand] || '<ha-icon icon="mdi:application"></ha-icon>'}
                ${(a.name || "").toUpperCase()}
              </button>`).join("")}
          </div>

          <div class="dpad">
            <div class="ring"></div>
            <button class="k up" type="button" data-cmd="DPAD_UP" aria-label="Up"><ha-icon icon="mdi:chevron-up"></ha-icon></button>
            <button class="k lf" type="button" data-cmd="DPAD_LEFT" aria-label="Left"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
            <button class="k rt" type="button" data-cmd="DPAD_RIGHT" aria-label="Right"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
            <button class="k dn" type="button" data-cmd="DPAD_DOWN" aria-label="Down"><ha-icon icon="mdi:chevron-down"></ha-icon></button>
            <button class="ok" type="button" data-cmd="DPAD_CENTER">OK</button>
          </div>

          <div class="row">
            ${key("mdi:arrow-u-left-top", "BACK")}
            ${key("mdi:home", "HOME")}
            ${key("mdi:menu", "MENU")}
          </div>
          <div class="row">
            ${key("mdi:rewind", "MEDIA_REWIND")}
            ${key("mdi:play-pause", "MEDIA_PLAY_PAUSE")}
            ${key("mdi:fast-forward", "MEDIA_FAST_FORWARD")}
          </div>
        `}
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-sel]").forEach((el) => {
      el.addEventListener("click", () => {
        this._touched = true;
        this._sel = parseInt(el.dataset.sel, 10);
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("[data-cmd]").forEach((el) => {
      el.addEventListener("click", () => this._send(el.dataset.cmd));
    });
    this.shadowRoot.querySelectorAll("[data-app]").forEach((el) => {
      el.addEventListener("click", () => this._launch(el.dataset.app));
    });
    const p = this.shadowRoot.getElementById("pwr");
    if (p) p.addEventListener("click", () => this._power());
    const m = this.shadowRoot.getElementById("mute");
    if (m) m.addEventListener("click", () => this._toggleMute());
    const vu = this.shadowRoot.getElementById("volup");
    if (vu) vu.addEventListener("click", () => this._step(1));
    const vd = this.shadowRoot.getElementById("voldown");
    if (vd) vd.addEventListener("click", () => this._step(-1));
  }

  getCardSize() {
    return 12;
  }
}

/* ----------------------------------------------------------------- devices --*/

/* A stack of collapsible groups. Everything starts closed and each closed row
   carries the numbers you would have opened it for, so most visits end without
   expanding anything. A group holding a fault shows it while still closed. */
class PurdyDevicesCard extends PcBaseCard {
  static getStubConfig() {
    return { title: "Devices", groups: [{ name: "Group", chips: [], body: {} }] };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.groups)) {
      throw new Error("purdy-devices-card: 'groups' (a list) is required");
    }
    this._config = { ...config };
    const ids = [];
    const add = (x) => x && typeof x === "string" && ids.push(x);
    add(config.subtitle_entity);
    (config.faults || []).forEach((f) => add(f.entity));
    (config.groups || []).forEach((g) => {
      (g.chips || []).forEach(add);
      (g.faults || []).forEach((f) => add(f.entity));
      const b = g.body || {};
      if (b.bar) add(b.bar.entity);
      (b.stats || []).forEach((s) => add(s.entity));
      (b.switch_groups || []).forEach((sg) => (sg.items || []).forEach((i) => add(i.entity)));
      if (g.sparkline) add(g.sparkline.entity);
      if (g.meter) add(g.meter.entity);
    });
    this._watched = ids;
    this._last = null;
    this._open = {};
    this._spark = {};
    this._sparkAt = 0;
  }

  /* Trend lines for the collapsed rows. Fetched on a timer rather than on
     every state change, because history is expensive and a sparkline does not
     need to be live to the second. */
  async _fetchSparks() {
    const groups = (this._config.groups || []).filter((g) => g.sparkline);
    if (!groups.length || !this._hass) return;
    if (Date.now() - this._sparkAt < 5 * 60 * 1000) return;
    this._sparkAt = Date.now();
    const ids = groups.map((g) => g.sparkline.entity);
    const hours = Math.max(...groups.map((g) => g.sparkline.hours || 24));
    const start = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    try {
      const res = await this._hass.callApi(
        "GET",
        /* end_time is not optional — see pcNowIso. */
        `history/period/${start}?filter_entity_id=${ids.join(",")}` +
        `&end_time=${encodeURIComponent(pcNowIso())}&minimal_response&no_attributes`
      );
      const out = {};
      (res || []).forEach((series) => {
        if (!series || !series.length) return;
        const id = series[0].entity_id;
        if (!id) return;
        out[id] = series
          .map((e) => parseFloat(e.state))
          .filter((v) => !isNaN(v));
      });
      this._spark = out;
      this._render();
    } catch (err) {
      /* History unavailable is not worth breaking the card over. */
    }
  }

  /* The same labelled fill bar the body uses, shown on a collapsed row so a
     shut group still carries its level at a glance. Hidden once the group is
     open, because the body renders it there. */
  _meterHtml(m) {
    return this._barHtml({
      entity: m.entity,
      label: m.label || "",
      max: m.max,
      warn_above: m.warn_above,
      critical_above: m.critical_above,
      suffix: m.suffix,
    });
  }

  _sparkHtml(sp) {
    const vals = this._spark[sp.entity];
    if (!vals || vals.length < 2) return "";
    const w = 62, h = 22;
    const lo = sp.min != null ? sp.min : Math.min(...vals);
    const hi = sp.max != null ? sp.max : Math.max(...vals);
    const range = hi - lo || 1;
    const step = w / (vals.length - 1);
    const pts = vals
      .map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - ((v - lo) / range) * (h - 4)).toFixed(1)}`)
      .join(" ");
    const last = vals[vals.length - 1];
    const warn = sp.warn_above == null ? 80 : sp.warn_above;
    const col = last >= warn ? "var(--pc-warn)" : "var(--pc-cool)";
    return `
      <svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6"
                  stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }

  _faultCount(list) {
    return (list || []).filter((f) => {
      const s = pcState(this._hass, f.entity);
      if (f.state !== undefined) return s === f.state;
      if (f.state_not !== undefined) return s !== f.state_not && s !== "";
      return false;
    }).length;
  }

  _chipText(id) {
    const st = this._hass.states[id];
    if (!st) return "—";
    const unit = st.attributes.unit_of_measurement || "";
    const v = st.state;
    return isNaN(parseFloat(v)) ? v.replace(/_/g, " ") : v + (unit ? " " + unit : "");
  }

  _barHtml(bar) {
    const v = pcNum(this._hass, bar.entity);
    if (v == null) return "";
    const max = bar.max || 100;
    const p = Math.max(0, Math.min(100, (v / max) * 100));
    const warn = bar.warn_above == null ? 80 : bar.warn_above;
    const crit = bar.critical_above == null ? 95 : bar.critical_above;
    const col = p >= crit ? "var(--pc-bad)" : p >= warn ? "var(--pc-warn)" : "var(--pc-cool)";
    return `
      <div class="spread"><span class="lbl">${bar.label || ""}</span>
        <span class="num" style="font-size:12.5px;color:${col}">${Math.round(v)}${bar.suffix || "%"}</span></div>
      <div class="bar"><i style="width:${p.toFixed(0)}%;background:${col}"></i></div>`;
  }

  _statsHtml(stats) {
    return `<div class="stats">${stats.map((s) => {
      const st = this._hass.states[s.entity];
      const raw = st ? st.state : "—";
      let cls = "";
      if (s.bad_when && s.bad_when.indexOf(raw) >= 0) cls = "badv";
      else if (s.good_when && s.good_when.indexOf(raw) >= 0) cls = "goodv";
      const unit = st && st.attributes.unit_of_measurement ? st.attributes.unit_of_measurement : "";
      /* A device_class: problem sensor reads on/off, which is meaningless in a
         stat tile. `map` turns it into words. */
      const mapped = s.map && s.map[raw] !== undefined ? s.map[raw] : null;
      const txt = s.text || mapped || (isNaN(parseFloat(raw)) ? raw.replace(/_/g, " ") : raw + unit);
      return `<div class="stat"><span class="lbl">${s.label}</span><b class="${cls}">${txt}</b></div>`;
    }).join("")}</div>`;
  }

  _switchesHtml(groups) {
    return groups.map((sg) => {
      const items = sg.items || [];
      const on = items.filter((i) => pcState(this._hass, i.entity) === "on").length;
      return `
        <div class="grouphd"><span class="lbl">${sg.name}</span><span class="line"></span>
          <span class="lbl num">${on} / ${items.length}</span></div>
        <div class="dgrid">
          ${items.map((i) => {
            const isOn = pcState(this._hass, i.entity) === "on";
            return `
              <div class="dock ${isOn ? "run" : "off"}">
                <ha-icon icon="${i.icon || "mdi:cube-outline"}" data-toggle="${i.entity}" class="tappable"></ha-icon>
                <div class="grow tappable" data-toggle="${i.entity}">
                  <div class="nm trunc">${i.name}</div>
                  <div class="st">${isOn ? "Running" : "Stopped"}</div>
                </div>
                ${i.url && isOn ? `<ha-icon class="lnk tappable" icon="mdi:open-in-new" data-url="${i.url}"></ha-icon>` : ""}
              </div>`;
          }).join("")}
        </div>`;
    }).join("");
  }

  _faultListHtml(list) {
    const hits = (list || []).filter((f) => {
      const st = pcState(this._hass, f.entity);
      if (f.state !== undefined) return st === f.state;
      if (f.state_not !== undefined) return st !== f.state_not && st !== "";
      return false;
    });
    if (!hits.length) return "";
    return `
      <div class="faults">
        ${hits.map((f) => `
          <div class="frow tappable" data-info="${f.entity}">
            <span class="fdot"></span>
            <div class="grow">
              <div class="fn">${f.label || pcName(this._hass, f.entity)}</div>
              <div class="fd">${f.detail || pcState(this._hass, f.entity)}</div>
            </div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
          </div>`).join("")}
      </div>`;
  }

  _bodyHtml(b, g) {
    let h = "";
    if (g && g.faults) h += this._faultListHtml(g.faults);
    if (b.bar) h += this._barHtml(b.bar);
    if (b.stats) h += this._statsHtml(b.stats);
    if (b.switch_groups) h += this._switchesHtml(b.switch_groups);
    if (b.chips) {
      h += `<div class="chiprow">${b.chips.map((c) =>
        `<span class="chip ${c.style || ""}">${c.text || this._chipText(c.entity)}</span>`).join("")}</div>`;
    }
    if (b.buttons) {
      h += `<div class="btnrow">${b.buttons.map((btn, i) =>
        `<button type="button" data-btn="${i}">${btn.name}</button>`).join("")}</div>`;
    }
    return h;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const c = this._config;
    const topFaults = this._faultCount(c.faults);

    let idx = -1;
    const groupsHtml = (c.groups || []).map((g) => {
      if (g.divider) {
        return `<div class="secbreak"><span class="lbl">${g.divider}</span><span class="line"></span></div>`;
      }
      idx += 1;
      const gi = idx;
      const faults = this._faultCount(g.faults);
      /* A fault forces the group open — minimising must never hide a problem. */
      const open = this._open[gi] === undefined ? faults > 0 : this._open[gi];
      const chips = (g.chips || []).map((id) => this._chipText(id)).join(" · ");
      return `
        <div class="acc ${faults ? "faulted" : ""}">
          <div class="summary tappable" data-grp="${gi}">
            <ha-icon class="chev ${open ? "open" : ""}" icon="mdi:chevron-right"></ha-icon>
            ${g.icon ? `<ha-icon class="gi" icon="${g.icon}"></ha-icon>` : ""}
            <div class="grow">
              <div class="ttl">${g.name}</div>
              ${chips ? `<div class="smry num">${chips}</div>` : ""}
            </div>
            ${g.sparkline ? this._sparkHtml(g.sparkline) : ""}
            ${faults ? `<span class="chip bad"><span class="cdot"></span>${faults}</span>` : ""}
          </div>
          ${!open && g.meter ? `<div class="mwrap">${this._meterHtml(g.meter)}</div>` : ""}
          ${open ? `<div class="body" data-body="${gi}">${this._bodyHtml(g.body || {}, g)}</div>` : ""}
        </div>`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .hdr { display: flex; align-items: center; gap: 11px; padding: 14px 16px; margin-bottom: 9px;
               border-radius: var(--pc-radius); background: var(--pc-panel);
               background-image: linear-gradient(180deg, var(--pc-tint), transparent 110px); }
        .hdr b { font-size: 19px; font-weight: 650; letter-spacing: -0.02em; }
        .chip.bad { background: rgba(239,106,106,0.15); color: var(--pc-bad); }
        .chip.good { background: rgba(129,201,149,0.15); color: var(--pc-good); }
        .chip.warn { background: rgba(242,193,78,0.14); color: var(--pc-warn); }
        .chip .cdot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

        .acc { background: var(--pc-panel); border-radius: var(--pc-radius); overflow: hidden; margin-bottom: 9px; }
        .acc.faulted { border-left: 3px solid var(--pc-bad); }
        .summary { display: flex; align-items: center; gap: 11px; padding: 13px 16px; }
        .chev { --mdc-icon-size: 18px; color: var(--pc-muted); transition: transform 0.18s ease; }
        .chev.open { transform: rotate(90deg); }
        @media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
        .gi { color: var(--pc-muted); }
        .ttl { font-size: 14.5px; font-weight: 650; letter-spacing: -0.012em; }
        .smry { font-size: 11.5px; color: var(--pc-muted); }
        .body { padding: 0 16px 15px; }

        .secbreak { display: flex; align-items: center; gap: 10px; margin: 16px 6px 8px; }
        .secbreak .line { flex: 1; height: 1px; background: var(--pc-line); }
        .secbreak .lbl { letter-spacing: 0.16em; }

        .bar { height: 6px; border-radius: 3px; background: var(--pc-track); overflow: hidden; margin-top: 7px; }
        .bar i { display: block; height: 100%; border-radius: 3px; }

        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
        .stat { background: var(--pc-panel-2); border-radius: 14px; padding: 9px 10px; }
        .stat .lbl { display: block; margin-bottom: 4px; }
        .stat b { font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.015em; }
        .stat b.badv { color: var(--pc-bad); }
        .stat b.goodv { color: var(--pc-good); }

        .grouphd { display: flex; align-items: center; gap: 8px; margin: 15px 0 0; color: var(--pc-muted); }
        .grouphd .line { flex: 1; height: 1px; background: var(--pc-line); }
        .dgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 9px; }
        .dock { background: var(--pc-panel-2); border-radius: 14px; padding: 9px 10px;
                display: flex; align-items: center; gap: 8px; min-width: 0; }
        .dock .nm { font-size: 12.5px; font-weight: 600; letter-spacing: -0.01em; }
        .dock .st { font-size: 10.5px; color: var(--pc-muted); }
        .dock.run { background: rgba(129,201,149,0.11); }
        .dock.run > ha-icon { color: var(--pc-good); }
        .dock.off > ha-icon, .dock.off .nm { color: var(--pc-muted); }
        .dock .lnk { --mdc-icon-size: 15px; color: var(--pc-muted); }

        .spark { width: 62px; height: 22px; flex: 0 0 auto; opacity: 0.9; }
        .mwrap { padding: 0 16px 14px; margin-top: -2px; }
        .faults { margin-bottom: 12px; }
        .frow { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--pc-line); }
        .frow:first-child { border-top: none; }
        .fdot { width: 7px; height: 7px; border-radius: 50%; background: var(--pc-bad); flex: 0 0 auto; }
        .fn { font-size: 13px; font-weight: 600; }
        .fd { font-size: 11.5px; color: var(--pc-muted); }
        .frow ha-icon { --mdc-icon-size: 16px; color: var(--pc-muted); }
        .chiprow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
        .btnrow { display: flex; gap: 8px; margin-top: 11px; }
        .btnrow button {
          flex: 1; height: 42px; border: 0; border-radius: 14px; cursor: pointer;
          background: var(--pc-panel-2); color: var(--pc-text); font-family: inherit;
          font-size: 13px; font-weight: 600;
        }
        .btnrow button:active { background: var(--pc-chip); }
        button:focus-visible, .tappable:focus-visible { outline: 2px solid var(--pc-cool); outline-offset: 2px; }
      </style>

      <div class="hdr">
        ${c.icon ? `<ha-icon icon="${c.icon}" style="--mdc-icon-size:26px;color:var(--pc-cool)"></ha-icon>` : ""}
        <div class="grow">
          <b>${c.title || "Devices"}</b>
          ${c.subtitle_entity ? `<div class="lbl">${pcState(this._hass, c.subtitle_entity)}</div>` : ""}
        </div>
        ${topFaults
          ? `<span class="chip bad"><span class="cdot"></span>${topFaults} fault${topFaults > 1 ? "s" : ""}</span>`
          : `<span class="chip good"><span class="cdot"></span>Healthy</span>`}
      </div>
      ${groupsHtml}
    `;

    this._fetchSparks();
    this.shadowRoot.querySelectorAll("[data-info]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        pcMoreInfo(this, el.dataset.info);
      });
    });
    this.shadowRoot.querySelectorAll("[data-grp]").forEach((el) => {
      el.addEventListener("click", () => {
        const i = parseInt(el.dataset.grp, 10);
        const cur = this._open[i] === undefined
          ? this._faultCount((this._config.groups.filter((g) => !g.divider)[i] || {}).faults) > 0
          : this._open[i];
        this._open[i] = !cur;
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("[data-toggle]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._hass.callService("homeassistant", "toggle", { entity_id: el.dataset.toggle });
      });
    });
    this.shadowRoot.querySelectorAll("[data-url]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(el.dataset.url, "_blank");
      });
    });
    this.shadowRoot.querySelectorAll("[data-btn]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const body = el.closest("[data-body]");
        const gi = parseInt(body.dataset.body, 10);
        const g = this._config.groups.filter((x) => !x.divider)[gi];
        const btn = ((g.body || {}).buttons || [])[parseInt(el.dataset.btn, 10)];
        if (btn) pcAction(this, this._hass, btn.tap_action, btn.entity);
      });
    });
  }

  getCardSize() {
    return 10;
  }
}

/* ----------------------------------------------------------------- music --*/

/* Music Assistant surface, in two modes:
 *
 *   compact: true   home-screen headline — art, track, room, transport.
 *                   Renders nothing at all when no room is playing music,
 *                   so it needs no `conditional` wrapper.
 *   (default)       the #music popup — same headline, plus volume, a room
 *                   picker and playlist presets.
 *
 * Rooms are an explicit list rather than a sweep of the media_player domain:
 * Music Assistant mirrors every source player, and this house carries a dozen
 * permanently-unavailable AirPlay duplicates that a sweep would surface.
 */

/* States that mean "there is a queue we can act on". */
const PC_MUSIC_LIVE = ["playing", "paused", "buffering"];

/* The is-it-music rule itself lives in 05-shared.js; this adds the liveness
   check the card needs on top of it. */
function pcIsMusic(hass, id) {
  const st = hass && hass.states[id];
  if (!st || PC_MUSIC_LIVE.indexOf(st.state) < 0) return false;
  return pcIsMusicState(st);
}

class PurdyMusicCard extends PcBaseCard {
  /* Prefer players Music Assistant is actually driving; fall back to any media
     player so the card picker never hands back a config that will not load. */
  static getStubConfig(hass) {
    const all = Object.keys(hass.states).filter((e) => e.startsWith("media_player."));
    const ma = all.filter((e) => (hass.states[e].attributes || {}).app_id === "music_assistant");
    const p = (ma.length ? ma : all).slice(0, 4);
    return {
      players: (p.length ? p : ["media_player.speaker"]).map((e) => ({ entity: e })),
      presets: [],
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.players) || !config.players.length) {
      throw new Error("purdy-music-card: 'players' (a list) is required");
    }
    this._config = {
      title: "Music", compact: false, presets: [],
      recent_hours: 48, recent_max: 8,
      search_types: ["track", "playlist", "album", "artist"],
      ...config,
    };
    this._watched = config.players.map((p) => p.entity).filter(Boolean);
    this._last = null;
    this._sel = null;      /* entity_id the user picked, or null for auto */
    this._recent = [];
    this._results = null;  /* null = no search run yet, [] = ran and found nothing */
    this._query = "";
    this._searching = false;
    this._focus = false;   /* keep the caret in the search box across re-renders */
    if (this._recentTimer) clearInterval(this._recentTimer);
    if (!this._config.compact) {
      this._recentTimer = setInterval(() => this._fetchRecent(), 5 * 60 * 1000);
    }
  }

  disconnectedCallback() {
    if (this._recentTimer) clearInterval(this._recentTimer);
    if (this._debounce) clearTimeout(this._debounce);
  }

  /* PcBaseCard signs on state alone, which never changes as a queue moves from
     track to track. Sign on the fields this card actually draws. */
  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const sig = this._watched
      .map((id) => {
        const st = hass.states[id];
        if (!st) return "~";
        const a = st.attributes || {};
        return [st.state, a.media_title, a.media_artist, a.volume_level,
                a.is_volume_muted, a.app_id].join(",");
      })
      .join("|");
    if (!this._config.compact && !this._recentInit) {
      this._recentInit = true;
      this._fetchRecent();
    }
    if (sig === this._last) return;
    this._last = sig;
    this._render();
  }

  /* ---- recently listened --------------------------------------------------
     Not from Music Assistant. Its last_played / play_count columns are empty
     in this install and the built-in "Recently played tracks" smart playlist
     browses to zero children, so `order_by: last_played_desc` just returns the
     library in id order — it looks like it worked and is silently meaningless.
     HA's own recorder does have the history: every MA player logs media_title,
     media_artist and a playable media_content_id on each state change. So read
     it from there, newest first, deduped by URI. */
  async _fetchRecent() {
    if (!this._hass || !this._hass.callApi || this._config.compact) return;
    const ids = this._watched;
    if (!ids.length) return;
    const start = new Date(Date.now() - this._config.recent_hours * 3600 * 1000).toISOString();
    try {
      const res = await this._hass.callApi(
        "GET",
        /* end_time is not optional — see pcNowIso. recent_hours is 48 here,
           so the window used to stop 24h short and today never appeared. */
        `history/period/${start}?filter_entity_id=${ids.join(",")}` +
        `&end_time=${encodeURIComponent(pcNowIso())}`
      );
      const rows = [];
      (res || []).forEach((series) => (series || []).forEach((e) => {
        const a = e.attributes || {};
        if (!a.media_title || !a.media_content_id) return;
        /* Same music-vs-TV test the live card uses, so a Peacock episode does
           not end up filed as a recently-played track. */
        if (a.app_id !== "music_assistant" &&
            PC_MUSIC_TYPES.indexOf(a.media_content_type) < 0) return;
        rows.push({
          t: new Date(e.last_changed || e.last_updated).getTime(),
          uri: a.media_content_id,
          name: a.media_title,
          sub: a.media_artist || a.media_album_name || "",
          image: null,
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
      this._recent = out.slice(0, this._config.recent_max);
      this._render();
    } catch (err) {
      /* Recorder may be purged or unavailable; the section just stays empty. */
      console.warn("purdy-music-card: history fetch failed", err);
    }
  }

  /* ---- search ------------------------------------------------------------- */

  async _runSearch() {
    const q = (this._query || "").trim();
    const entry = this._config.config_entry;
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
        { config_entry_id: entry, name: q, media_type: this._config.search_types },
        undefined, false, true
      );
      const d = (r && r.response) || {};
      const rows = [];
      const take = (arr, kind, n) => (arr || []).slice(0, n).forEach((x) => rows.push({
        uri: x.uri,
        name: x.name,
        kind,
        sub: kind === "track" && x.artists && x.artists.length
          ? x.artists.map((a) => a.name).join(", ")
          : kind,
        image: x.image,
      }));
      take(d.tracks, "track", 4);
      take(d.playlists, "playlist", 3);
      take(d.albums, "album", 2);
      take(d.artists, "artist", 2);
      this._results = rows;
    } catch (err) {
      console.warn("purdy-music-card: search failed", err);
      this._results = [];
    }
    this._searching = false;
    this._render();
  }

  _playItem(item) {
    const t = this._active();
    if (!t) return;
    this._hass.callService("music_assistant", "play_media", {
      entity_id: t.entity,
      media_id: item.uri,
      media_type: item.kind || "track",
      enqueue: "replace",
    });
    this._sel = t.entity;
  }

  _players() {
    return this._config.players.filter((p) => p.entity && this._hass.states[p.entity]);
  }

  _label(p) {
    return p.name || pcName(this._hass, p.entity).replace(/\s*\+?$/, "");
  }

  /* Whatever is playing wins over whatever is merely paused, and an explicit
     pick wins over both — but only while that pick is still a real player. */
  _active() {
    const ps = this._players();
    if (!ps.length) return null;
    if (this._sel) {
      const picked = ps.find((p) => p.entity === this._sel);
      if (picked) return picked;
    }
    return ps.find((p) => pcState(this._hass, p.entity) === "playing" && pcIsMusic(this._hass, p.entity))
        || ps.find((p) => pcIsMusic(this._hass, p.entity))
        || null;
  }

  _call(service, data) {
    const a = this._active();
    if (!a) return;
    this._hass.callService("media_player", service, { entity_id: a.entity, ...(data || {}) });
  }

  /* Tapping a room selects it; tapping the room that is already selected stops
     it.

     Most of these players do NOT advertise TURN_OFF: the Cast speakers report
     supported_features 8320575, whose low bits are 63 — pause/seek/volume/prev/
     next and nothing else. Only the Whole House group player (7796671) carries
     the TURN_OFF bit. Calling turn_off blindly would be a silent no-op on every
     individual room, so fall back to media_stop, which ends the queue rather
     than merely pausing it, and only then to media_pause. */
  _off(entity) {
    const st = this._hass.states[entity];
    const feat = (st && st.attributes.supported_features) || 0;
    const svc = (feat & 256) ? "turn_off"        /* TURN_OFF  */
              : (feat & 4096) ? "media_stop"     /* STOP      */
              : "media_pause";                   /* PAUSE     */
    this._hass.callService("media_player", svc, { entity_id: entity });
    this._sel = null;
  }

  _play(preset, entity) {
    this._hass.callService("music_assistant", "play_media", {
      entity_id: entity,
      media_id: preset.uri,
      media_type: preset.media_type || "playlist",
      enqueue: "replace",
    });
    this._sel = entity;
  }

  /* entity_picture_local first, deliberately.
     Music Assistant publishes entity_picture as an absolute plain-HTTP URL to
     its own add-on port (http://<host>:8095/imageproxy/...). That fails twice
     on a phone: HTTPS pages block it as mixed content, and it is unreachable
     off the LAN. entity_picture_local is HA's same-origin authenticated proxy,
     which works in both places. */
  _art(st) {
    const a = st.attributes;
    const pic = a.entity_picture_local || a.entity_picture;
    if (!pic) return `<div class="art ph"><ha-icon icon="mdi:music-note"></ha-icon></div>`;
    return `<div class="art"><img src="${pic}" alt="" loading="lazy"></div>`;
  }

  /* Track and playlist names are third-party strings that land in innerHTML —
     "Rock & Roll", a title with a quote, or worse. Escape them. */
  _esc(s) {
    return pcEsc(s);
  }

  _itemHtml(r, group, i) {
    const thumb = r.image
      ? `<div class="thumb"><img src="${this._esc(r.image)}" alt="" loading="lazy"></div>`
      : `<div class="thumb"><ha-icon icon="${r.kind === "playlist" ? "mdi:playlist-music"
          : r.kind === "artist" ? "mdi:account-music"
          : r.kind === "album" ? "mdi:album" : "mdi:music-note"}"></ha-icon></div>`;
    return `
      <button class="item" type="button" data-${group}="${i}">
        ${thumb}
        <span class="grow">
          <span class="n trunc" style="display:block">${this._esc(r.name)}</span>
          <span class="s trunc" style="display:block">${this._esc(r.sub)}</span>
        </span>
        ${group === "res" ? `<span class="kind">${this._esc(r.kind)}</span>` : ""}
      </button>`;
  }

  _renderEmpty() {
    /* Compact mode is a headline for something that is happening. When nothing
       is, the home screen should not carry a dead row. */
    if (this._config.compact) {
      this.shadowRoot.innerHTML = "";
      this.style.display = "none";
      return true;
    }
    return false;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const a = this._active();
    const anyLive = this._players().some((p) => pcIsMusic(this._hass, p.entity));

    if (!anyLive && !this._sel && this._renderEmpty()) return;
    this.style.display = "block";

    const compact = !!this._config.compact;
    const st = a ? this._hass.states[a.entity] : null;
    const attrs = st ? st.attributes : {};
    const playing = st && st.state === "playing";
    const title = attrs.media_title || (a ? "Nothing playing" : "No player");
    const artist = attrs.media_artist || (a ? this._label(a) : "");
    const sub = compact && attrs.media_artist
      ? `${attrs.media_artist} · ${this._label(a)}`
      : artist;
    const vol = typeof attrs.volume_level === "number" ? Math.round(attrs.volume_level * 100) : null;
    const muted = !!attrs.is_volume_muted;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .card.tap { cursor: pointer; }
        .hd { display: flex; align-items: center; gap: 8px; padding: 0 2px 11px; }
        .hd b { font-size: 20px; font-weight: 650; letter-spacing: -0.02em; }
        .hd .spacer { flex: 1; }
        .chip.good { background: rgba(129,201,149,0.15); color: var(--pc-good); }
        .chip .cdot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

        .now { display: flex; align-items: center; gap: 12px; }
        .art {
          width: ${compact ? "46px" : "68px"}; height: ${compact ? "46px" : "68px"};
          border-radius: ${compact ? "13px" : "18px"}; flex: 0 0 auto; overflow: hidden;
          background: var(--pc-panel-2); display: flex; align-items: center;
          justify-content: center; color: var(--pc-muted);
        }
        .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .art.ph ha-icon { --mdc-icon-size: ${compact ? "22px" : "30px"}; }
        .t {
          font-size: ${compact ? "15.5px" : "17px"}; font-weight: 650;
          letter-spacing: -0.015em; margin-bottom: 2px;
        }
        .sub { font-size: 12.5px; color: var(--pc-muted); }

        .tr { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
        .tb {
          border: 0; cursor: pointer; padding: 0; background: none;
          color: var(--pc-text); display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; border-radius: 50%;
        }
        .tb:active { background: var(--pc-chip); }
        .tb[disabled] { opacity: 0.3; cursor: default; }
        .tb.pp { background: var(--pc-chip); width: 44px; height: 44px; }
        .tb.pp ha-icon { --mdc-icon-size: 26px; }
        .tb ha-icon { --mdc-icon-size: 22px; }
        .tr.full { justify-content: center; gap: 14px; margin: 16px 0 4px; }

        .vol { display: flex; align-items: center; gap: 11px; margin: 12px 0 2px; }
        .vbtn {
          flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; border: 0;
          cursor: pointer; background: var(--pc-chip); color: var(--pc-muted);
          display: flex; align-items: center; justify-content: center;
        }
        .vbtn.muted { color: var(--pc-bad); }
        .vbtn ha-icon { --mdc-icon-size: 18px; }
        input[type=range] {
          flex: 1; -webkit-appearance: none; appearance: none; height: 6px;
          border-radius: 999px; background: var(--pc-track); outline: none;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; width: 18px; height: 18px;
          border-radius: 50%; background: var(--pc-text); cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 18px; height: 18px; border: 0; border-radius: 50%;
          background: var(--pc-text); cursor: pointer;
        }
        .vnum { flex: 0 0 auto; width: 34px; text-align: right; font-size: 12px; color: var(--pc-muted); }

        .sec { margin-top: 18px; }
        .sec .lbl { display: block; margin-bottom: 8px; }
        .rooms { display: flex; flex-wrap: wrap; gap: 7px; }
        .room {
          border: 0; cursor: pointer; font-family: inherit; padding: 9px 13px;
          border-radius: 13px; background: var(--pc-panel-2); color: var(--pc-muted);
          font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 6px;
        }
        .room.sel { background: var(--pc-chip); color: var(--pc-text); }
        .room .live { width: 6px; height: 6px; border-radius: 50%; background: var(--pc-good); }
        .room[disabled] { opacity: 0.4; cursor: default; }
        /* The selected room doubles as its own power button — say so. */
        .room .off { --mdc-icon-size: 15px; color: var(--pc-muted); margin-left: 1px; }
        .room.sel:active .off { color: var(--pc-bad); }

        .presets { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .preset {
          border: 0; cursor: pointer; font-family: inherit; text-align: left;
          padding: 11px 12px; border-radius: 15px; background: var(--pc-panel-2);
          color: var(--pc-text); font-size: 12.5px; font-weight: 600;
          display: flex; align-items: center; gap: 9px; min-width: 0;
        }
        .preset:active { background: var(--pc-chip); }
        .preset ha-icon { --mdc-icon-size: 19px; color: var(--pc-cool); }
        button:focus-visible, input:focus-visible { outline: 2px solid var(--pc-cool); outline-offset: 2px; }

        .sbox { display: flex; align-items: center; gap: 9px; background: var(--pc-panel-2);
                border-radius: 14px; padding: 0 12px; height: 44px; }
        .sbox ha-icon { --mdc-icon-size: 19px; color: var(--pc-muted); }
        .sbox input {
          flex: 1; min-width: 0; border: 0; background: none; outline: none;
          font-family: inherit; font-size: 14px; color: var(--pc-text); height: 100%;
        }
        .sbox input::placeholder { color: var(--pc-muted); }
        .sclear { border: 0; background: none; cursor: pointer; padding: 0; display: flex; }

        .list { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
        .item {
          display: flex; align-items: center; gap: 10px; width: 100%;
          border: 0; background: none; cursor: pointer; font-family: inherit;
          padding: 7px 6px; border-radius: 12px; text-align: left; color: var(--pc-text);
        }
        .item:active { background: var(--pc-panel-2); }
        .thumb {
          width: 38px; height: 38px; border-radius: 9px; flex: 0 0 auto; overflow: hidden;
          background: var(--pc-panel-2); display: flex; align-items: center;
          justify-content: center; color: var(--pc-muted);
        }
        .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .thumb ha-icon { --mdc-icon-size: 18px; }
        .item .n { font-size: 13.5px; font-weight: 600; }
        .item .s { font-size: 11.5px; color: var(--pc-muted); }
        .kind {
          flex: 0 0 auto; font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase;
          color: var(--pc-muted); background: var(--pc-chip); padding: 3px 7px; border-radius: 999px;
        }
        .note { font-size: 12px; color: var(--pc-muted); padding: 10px 6px; }
      </style>

      <div class="card tint ${compact && this._config.navigate ? "tap" : ""}" id="card">
        ${compact ? "" : `
          <div class="hd">
            <b>${this._config.title}</b>
            <span class="spacer"></span>
            ${anyLive ? '<span class="chip good"><span class="cdot"></span>Playing</span>' : ""}
          </div>`}

        <div class="now">
          ${st ? this._art(st) : `<div class="art ph"><ha-icon icon="mdi:music-note-off"></ha-icon></div>`}
          <div class="grow">
            <div class="t trunc">${this._esc(title)}</div>
            <div class="sub trunc">${this._esc(sub)}</div>
          </div>
          ${compact ? `
            <div class="tr">
              <button class="tb pp" type="button" id="pp" aria-label="Play or pause" ${a ? "" : "disabled"}>
                <ha-icon icon="${playing ? "mdi:pause" : "mdi:play"}"></ha-icon>
              </button>
              <button class="tb" type="button" id="next" aria-label="Next track" ${a ? "" : "disabled"}>
                <ha-icon icon="mdi:skip-next"></ha-icon>
              </button>
            </div>` : ""}
        </div>

        ${compact ? "" : `
          <div class="tr full">
            <button class="tb" type="button" id="prev" aria-label="Previous track" ${a ? "" : "disabled"}>
              <ha-icon icon="mdi:skip-previous"></ha-icon>
            </button>
            <button class="tb pp" type="button" id="pp" aria-label="Play or pause" ${a ? "" : "disabled"}>
              <ha-icon icon="${playing ? "mdi:pause" : "mdi:play"}"></ha-icon>
            </button>
            <button class="tb" type="button" id="next" aria-label="Next track" ${a ? "" : "disabled"}>
              <ha-icon icon="mdi:skip-next"></ha-icon>
            </button>
          </div>

          ${vol === null ? "" : `
            <div class="vol">
              <button class="vbtn ${muted ? "muted" : ""}" type="button" id="mute" aria-label="Mute">
                <ha-icon icon="${muted ? "mdi:volume-off" : "mdi:volume-high"}"></ha-icon>
              </button>
              <input type="range" id="vol" min="0" max="100" step="1" value="${vol}" aria-label="Volume">
              <span class="vnum num">${vol}%</span>
            </div>`}

          <div class="sec">
            <span class="lbl">Rooms</span>
            <div class="rooms">
              ${this._players().map((p) => `
                <button class="room ${a && p.entity === a.entity ? "sel" : ""}" type="button"
                        data-room="${p.entity}"
                        title="${a && p.entity === a.entity ? "Tap again to turn off" : "Select " + this._label(p)}">
                  ${pcIsMusic(this._hass, p.entity) ? '<span class="live"></span>' : ""}${this._label(p)}
                  ${a && p.entity === a.entity ? '<ha-icon class="off" icon="mdi:power"></ha-icon>' : ""}
                </button>`).join("")}
            </div>
          </div>

          ${!this._config.presets.length ? "" : `
            <div class="sec">
              <span class="lbl">Presets</span>
              <div class="presets">
                ${this._config.presets.map((x, i) => `
                  <button class="preset" type="button" data-preset="${i}">
                    <ha-icon icon="${x.icon || "mdi:playlist-music"}"></ha-icon>
                    <span class="trunc">${x.name}</span>
                  </button>`).join("")}
              </div>
            </div>`}

          ${!this._config.config_entry ? "" : `
            <div class="sec">
              <span class="lbl">Search</span>
              <div class="sbox">
                <ha-icon icon="mdi:magnify"></ha-icon>
                <input type="search" id="q" placeholder="Songs, playlists, artists"
                       autocomplete="off" autocorrect="off" spellcheck="false"
                       value="${this._esc(this._query)}">
                ${this._query ? `<button class="sclear" type="button" id="qclear" aria-label="Clear search">
                  <ha-icon icon="mdi:close-circle"></ha-icon></button>` : ""}
              </div>
              ${this._searching ? '<div class="note">Searching…</div>' : ""}
              ${!this._searching && this._results && !this._results.length
                ? `<div class="note">No results for "${this._esc(this._query)}".</div>` : ""}
              ${!this._searching && this._results && this._results.length
                ? `<div class="list">${this._results.map((r, i) => this._itemHtml(r, "res", i)).join("")}</div>` : ""}
            </div>`}

          <div class="sec">
            <span class="lbl">Recently listened</span>
            ${this._recent.length
              ? `<div class="list">${this._recent.map((r, i) => this._itemHtml(r, "rec", i)).join("")}</div>`
              : `<div class="note">Nothing in the last ${this._config.recent_hours} hours.</div>`}
          </div>
        `}
      </div>
    `;

    const pp = this.shadowRoot.getElementById("pp");
    if (pp) pp.addEventListener("click", (e) => { e.stopPropagation(); this._call("media_play_pause"); });
    const nx = this.shadowRoot.getElementById("next");
    if (nx) nx.addEventListener("click", (e) => { e.stopPropagation(); this._call("media_next_track"); });
    const pv = this.shadowRoot.getElementById("prev");
    if (pv) pv.addEventListener("click", () => this._call("media_previous_track"));
    const mu = this.shadowRoot.getElementById("mute");
    if (mu) mu.addEventListener("click", () => this._call("volume_mute", { is_volume_muted: !muted }));
    const vr = this.shadowRoot.getElementById("vol");
    if (vr) {
      vr.addEventListener("change", () =>
        this._call("volume_set", { volume_level: parseInt(vr.value, 10) / 100 }));
    }
    this.shadowRoot.querySelectorAll("[data-room]").forEach((el) => {
      el.addEventListener("click", () => {
        const room = el.dataset.room;
        if (a && room === a.entity) this._off(room);
        else this._sel = room;
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("[data-preset]").forEach((el) => {
      el.addEventListener("click", () => {
        const target = this._active();
        if (!target) return;
        this._play(this._config.presets[parseInt(el.dataset.preset, 10)], target.entity);
      });
    });
    this.shadowRoot.querySelectorAll("[data-res]").forEach((el) => {
      el.addEventListener("click", () => this._playItem(this._results[parseInt(el.dataset.res, 10)]));
    });
    this.shadowRoot.querySelectorAll("[data-rec]").forEach((el) => {
      el.addEventListener("click", () => this._playItem(this._recent[parseInt(el.dataset.rec, 10)]));
    });

    const q = this.shadowRoot.getElementById("q");
    if (q) {
      /* A queue moving to the next track re-renders the whole card, which would
         otherwise blow away a half-typed query mid-search. Keep the value and
         the caret, and only re-render on a debounce rather than per keystroke. */
      q.addEventListener("focus", () => { this._focus = true; });
      q.addEventListener("blur", () => { this._focus = false; });
      q.addEventListener("input", () => {
        this._query = q.value;
        clearTimeout(this._debounce);
        this._debounce = setTimeout(() => this._runSearch(), 450);
      });
      q.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        clearTimeout(this._debounce);
        this._runSearch();
      });
      if (this._focus) {
        q.focus();
        const n = q.value.length;
        if (q.setSelectionRange) q.setSelectionRange(n, n);
      }
    }
    const qc = this.shadowRoot.getElementById("qclear");
    if (qc) {
      qc.addEventListener("click", () => {
        this._query = "";
        this._results = null;
        this._render();
      });
    }

    /* Whole-card tap is compact-only, and the transport buttons above already
       stop propagation so a play tap does not also open the popup. */
    if (compact && this._config.navigate) {
      const card = this.shadowRoot.getElementById("card");
      if (card) card.addEventListener("click", () => pcNavigate(this, this._config.navigate));
    }
  }

  getCardSize() {
    return this._config && this._config.compact ? 2 : 10;
  }
}
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
  "nowplaying", "nursery", "lights", "crew", "weather",
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
const psLiveMusic = pcLiveMusicState;

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
    /* Weather, and null for the same reason: the min–max rail has to tell "the
       recorder has not answered yet" from "the week was flat", and [] reads as
       the second. See 78b-shell-weather.js. */
    this._wxStats = null;
    this._wxStatsErr = null;
    this._wxFc = null;
    this._wxFcErr = null;
    this._wxHrs = null;
    this._wxPick = null;      // which rail the user last tapped, for the session
    this._wxTimer = null;
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
    this._startWeather();
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
    if (this._wxTimer) clearInterval(this._wxTimer);
    clearTimeout(this._goalSend);
    this._goalSend = null;
    this._clock = null;
    this._historyTimer = null;
    this._eventTimer = null;
    /* Nulled, not just cleared — connectedCallback tells "stopped" from
       "running" by the handle, so leaving it set would stack a second poller
       on every return to the view. */
    this._nurseryTimer = null;
    this._wxTimer = null;
  }

  /* Everything the shell reads, so a state change repaints exactly once. */
  _collectWatched() {
    const c = this._config;
    const ids = [c.weather, c.occupancy].filter(Boolean);
    const push = (x) => { if (x) ids.push(x); };

    push(c.dismiss_store);
    /* weather_fx is a TOP-LEVEL key, not a section — it paints the ground
       behind every section rather than living in one — so the section walk
       below will never see it. The same treatment the server: block needed. */
    push((c.weather_fx || {}).entity);
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
      /* The hero number is a watched state, not part of the weather fetch, so
         the reading on screen moves with the thermometer rather than waiting up
         to fifteen minutes for the next statistics poll. */
      if (s.type === "weather") {
        push(s.sensor); push(s.forecast); push(s.feels_from);
        push(s.gttc_outdoor); push(s.sun);
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
      <div class="ps-wxfx"></div>
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
        crew: () => this._secCrew(sec),
        weather: () => this._secWeather(sec),
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
          ${/* One line, not two. The name was on its own row below the
                greeting at the largest step on the screen — three lines of
                chrome before a single measurement, on a column where
                everything under it is one. The greeting changes three times a
                day and the name never does; neither earns 22px. */""}
          <h2>${this._greeting()}${who ? `, ${psEsc(who)}` : ""}</h2>
          <div class="ps-d">${now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
            · ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${
              c.occupancy ? " · " + psEsc(pcState(this._hass, c.occupancy)) : ""}</div>
        </div>
        <div class="ps-rt">
          ${wTemp == null ? "" : `<div class="ps-wx" data-info="${psEsc(c.weather)}">
            <ha-icon icon="${pcWxIcon(wState)}"></ha-icon>${Math.round(wTemp)}°</div>`}
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

    this._paintWxFx();

    this._bind();
    this._bindScrub();
    this._bindLights();
    this._bindCrew();
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

    /* The weather rail's source toggle. A plain re-render is right here: the
       tab is a discrete tap, not a continuous gesture, so there is no focused
       field and no element under a moving finger to detach. `stopPropagation`
       keeps it off the section header's expand. */
    this._each("[data-wxrail]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._wxPick = el.dataset.wxrail;
        this._last = null;
        this._render();
      });
    });
    this._each("[data-wxretry]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        /* Back to "still loading" rather than leaving the error on screen while
           the request is in flight — a retry that looks like nothing happened
           gets pressed again. */
        this._wxStatsErr = null;
        this._wxFcErr = null;
        this._last = null;
        this._render();
        this._fetchWeather();
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
      minsToClock: psMinsToClock, dur: psDur, esc: psEsc, isMusic: psIsMusic,
      liveMusic: psLiveMusic, parseTs: psParseTs,
      numOf: pcNumOf, reading: pcReading, offline: pcOffline, ringArc: pcRingArc, ringAngle: pcRingAngle, ringRotate: pcRingRotate,
      sparkPoly: pcSparkPoly, downsample: pcDownsample,
      nurserySessions: psNurserySessions, nurseryStats: psNurseryStats, dayKey: psDayKey, hm: psHM,
      weatherDays: psWeatherDays, weatherStats: psWeatherStats, weatherFc: psWeatherFc,
      wxIcon: pcWxIcon, wxText: pcWxText, localDayKey: pcDayKey,
    };
  }

  static get styles() {
    return PS_STYLES;
  }
}

/* ============================================================================
 * purdy-shell-card — section renderers
 *
 * Every one of these returns an HTML string and reads nothing but hass and the
 * section's own config, which is what lets the core diff a section's output
 * against the last one and skip the DOM entirely when nothing changed.
 *
 * A renderer that returns "" is dropped by the core along with its divider —
 * that is how the tv section disappears when every set is off.
 * ========================================================================== */

Object.assign(PurdyShellCard.prototype, {
  _greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  },

  _who() {
    const c = this._config;
    if (c.name !== undefined) return c.name;
    const u = this._hass && this._hass.user;
    if (!u || !u.name) return "";
    return String(u.name).trim().split(/\s+/)[0];
  },

  /* A 270° arc. `segs` are [fraction, colour] laid end to end. */
  _ringSvg(size, stroke, segs, goalFrac, goalCol) {
    const r = size / 2 - stroke / 2 - 2;
    const c = 2 * Math.PI * r;
    const arc = pcRingArc(r);
    const cx = size / 2;
    let off = 0;
    let out = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="var(--ps-track)"
        stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${arc.toFixed(2)} ${c.toFixed(2)}" transform="rotate(${PC_RING_START} ${cx} ${cx})"/>`;
    segs.forEach(([f, col]) => {
      const len = arc * Math.max(0, Math.min(1, f));
      if (len <= 0.2) { off += len; return; }
      out += `<circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="${col}"
        stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${len.toFixed(2)} ${c.toFixed(2)}"
        stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(${PC_RING_START} ${cx} ${cx})"/>`;
      off += len;
    });
    if (goalFrac != null && goalFrac > 0 && goalFrac <= 1) {
      const deg = pcRingRotate(goalFrac);
      out += `<line x1="${cx}" y1="${(cx - r - stroke / 2 - 1).toFixed(2)}" x2="${cx}" y2="${(cx - r + stroke / 2 + 1).toFixed(2)}"
        stroke="${goalCol || "var(--ps-warn)"}" stroke-width="2.2" stroke-linecap="round"
        transform="rotate(${deg.toFixed(1)} ${cx} ${cx})"/>`;
    }
    return out + "</svg>";
  },

  /* One room, 24h, no axes — enough to answer "is this room drifting?" beside
     the number that answers "where is it now?".
   *
   * An empty box when there is no history, never a flat line: a straight line
   * through the middle is a claim about the room, and "the recorder has
   * nothing" is not that claim. The box keeps its size either way so the
   * column of numbers to its right stays aligned. */
  _sparkSvg(id, scale) {
    const W = 56, H = 18;
    const empty = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"></svg>`;
    const raw = this._history[id];
    if (!raw || raw.length < 2) return empty;
    const pts = raw
      .map((p) => ({ t: p.t, v: parseFloat(p.s) }))
      .filter((p) => Number.isFinite(p.v));
    const poly = pcSparkPoly(pcDownsample(pts, 28), W, H, 3, null, scale);
    if (!poly) return empty;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <polyline fill="none" stroke="var(--ps-cool)" stroke-width="1.5" opacity=".75"
          stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"
          points="${poly}"/>
      </svg>`;
  },

  _waveSvg(sec) {
    const g = sec.graph || {};
    const inside = (this._history[g.inside] || []).map((p) => ({ t: p.t, v: parseFloat(p.s) })).filter((p) => Number.isFinite(p.v));
    const outside = (this._history[g.outside] || []).map((p) => ({ t: p.t, v: parseFloat(p.s) })).filter((p) => Number.isFinite(p.v));
    /* A graph that quietly disappears reads as "this card has no graph".
       Say which it is: the recorder has nothing yet, or it did not answer. */
    if (inside.length < 2 && outside.length < 2) {
      return `<div class="ps-nohist">${this._histErr
        ? "History unavailable — " + psEsc(this._histErr)
        : "Not enough history yet"}</div>`;
    }

    const hours = g.hours || 24;
    const t1 = Date.now();
    const t0 = t1 - hours * 3600 * 1000;
    const all = inside.concat(outside).filter((p) => p.t >= t0);
    if (all.length < 2) return "";
    const vlo = Math.min.apply(null, all.map((p) => p.v));
    const vhi = Math.max.apply(null, all.map((p) => p.v));
    let lo = vlo, hi = vhi;
    const pad = Math.max(1.5, (hi - lo) * 0.18);
    lo -= pad; hi += pad;
    /* What the plot actually spanned, so a shape can be read as a measurement.
       The legend carries the two current readings and nothing said what the
       vertical axis meant — the same line drawn over a two-degree night and a
       twenty-degree one looks identical. Stashed rather than drawn into the
       SVG because preserveAspectRatio="none" would stretch any text in it. */
    this._waveRange = { lo: vlo, hi: vhi };

    /* TOP was 24 of 74 — a third of the graph reserved as blank headroom for
       a label that does not live there, showing up as a gap between the
       legend and the plot. The lines get the room back. */
    const W = 360, H = 74, TOP = 8, BOT = 3;
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
  },

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

    /* The session ends when it ended. Running the axis to "now" regardless
       meant that as the day went on the night was squeezed into a shrinking
       slice with a growing empty tail — by evening the hypnogram was mostly
       blank. Only a session still in progress ends at now; a finished one ends
       where the sock stopped reporting a sleep state. */
    const last = live[live.length - 1];
    const li = rows.indexOf(last);
    const active = asleep(pcState(this._hass, sec.sleep_state));
    const ended = rows[li + 1] ? rows[li + 1].t : last.t;
    const to = active ? Date.now() : Math.max(ended, from + 60000);

    return { from, to, active, rows: rows.filter((r) => r.t >= from && r.t <= to) };
  },

  _hypnoSvg(sec) {
    const span = this._sleepSpan(sec);
    if (!span || span.to - span.from < 60000) {
      return `<div class="ps-nohist">${this._histErr
        ? "History unavailable — " + psEsc(this._histErr)
        : "No sleep session recorded"}</div>`;
    }
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
        <div class="ps-hypt" data-readout="hyp"><span class="ps-lbl">${span.active ? "Tonight" : "Last night"}</span><span>${rows.length} transitions</span></div>
        <div class="ps-hypplot" data-scrub="hyp">
          <div class="ps-cross" hidden></div>
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Sleep stages tonight">${out}</svg>
        </div>
        <div class="ps-hypt"><span>${fmt(span.from)}</span><span>${fmt(span.to)}</span></div>
      </div>`;
  },

  _chev() {
    return `<span class="ps-cv"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5l7 7-7 7"/></svg></span>`;
  },

  /* snake_case out of an integration is not a label. `manual_override` was
     rendering verbatim as the only such string on the screen. */
  _humanize(s) {
    const t = String(s == null ? "" : s).replace(/[_-]+/g, " ").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  },

  /* Why the goal is what it is. Humanising alone left a bare word sitting
     under the temperature — "Schedule" reads as a stray link rather than a
     status, where "Manual override" happened to read as a sentence. Say what
     the known reasons mean and fall back to humanising the rest. */
  _reasonText(raw) {
    const known = {
      schedule: "Following the schedule",
      manual_override: "Manual override — holding this goal",
      window_open: "Paused — a window is open",
      away: "Away setback",
      preset: "Set by the active preset",
    };
    const k = String(raw == null ? "" : raw).toLowerCase();
    return known[k] || this._humanize(raw);
  },

  /* One header treatment for every section.
   *
   * A fixed section used to render as a 9px uppercase caption while an
   * expandable one rendered as a 12.5px title — so scrolling the column, two
   * sections read as headings and five read as labels of the block above them.
   * And the early return DROPPED chipHtml: Systems computed its
   * `Healthy` / `N faults` summary, passed it in, and it was never displayed.
   * The chip is the whole reason to leave a section collapsed.
   */
  _head(sec, chipHtml) {
    const fixed = sec.expandable === false;
    const inner = `<span class="ps-nm">${psEsc(sec.title || "")}</span>
        ${chipHtml || ""}
        ${fixed ? "" : this._chev()}`;
    if (fixed) return `<div class="ps-sh">${inner}</div>`;
    return `<button class="ps-sh" type="button" data-open="${psEsc(sec.key)}">${inner}</button>`;
  },

  _secSleep(sec) {
    const h = this._hass;
    const state = pcState(h, sec.sleep_state);
    const active = state === "deep_sleep" || state === "light_sleep" || state === "awake";

    /* "Sock off" and "the sensor is not there" are different facts. The first
       is the normal daytime state; the second means nothing on this card can
       be trusted, and it used to render as the first. */
    const sockR = pcReading(h, sec.sleep_state);
    const gone = !sockR.ok && (sockR.why === "missing" || sockR.why === "offline");
    const label = { deep_sleep: "Deep sleep", light_sleep: "Light sleep", awake: "Awake" }[state]
      || (gone ? "Sensor unavailable" : "Sock off");
    const cls = { deep_sleep: "deep", light_sleep: "lt", awake: "warn" }[state] || (gone ? "warn" : "");

    /* Between sessions this section is the tallest thing on the screen and
       every number in it is eighteen hours old. Collapsed, it keeps the ring,
       the caption and the split — the vitals and the hypnogram move behind the
       expand, one tap away, rather than holding 140px all day. While the sock
       is on nothing is hidden: that is when it is worth the room. */
    const idle = !active && sec.idle_compact !== false;

    const r = sec.ring || {};
    /* Keep null distinct from zero all the way to the caption. */
    const deepN = active ? pcNum(h, r.deep) : pcNum(h, r.deep_last_night);
    const lightN = active ? pcNum(h, r.light) : pcNum(h, r.light_last_night);
    const noData = deepN == null && lightN == null;
    const deep = deepN || 0;
    const light = lightN || 0;
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
    /* Everything else in this section switches to the persisted value when the
       sock is off; this row alone always read the live counter, so the night
       the counter resets before the card is looked at it would show 0 wakeups
       beside a full ring of last night's sleep. */
    const wLast = pcNum(h, w.last_night);
    const wLive = active || wLast == null ? pcNum(h, w.live) : wLast;
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
          <div class="ps-rv">${noData
            ? `<b class="ps-nodata">—</b><small>no data</small>`
            : `<b>${total.toFixed(1)}h</b><small>of ${max}h</small>`}</div>
        </div>
        <div class="ps-grow">
          <div class="ps-jn">${psEsc(pcState(h, sec.age) || pcName(h, sec.person, sec.name))}</div>
          <div class="ps-js">${active
            ? `asleep ${elapsed || "—"}<br>since ${since}`
            : `last night<br>${since === "—" ? "no session" : "from " + since}`}</div>
          <div class="ps-chips" style="margin-top:9px">${noData
            ? `<span class="ps-chip">${gone ? "Sensor not reporting" : "Nothing recorded yet"}</span>`
            : `<span class="ps-chip deep">Deep ${deepN == null ? "—" : deep.toFixed(1) + "h"}</span>
            <span class="ps-chip lt">Light ${lightN == null ? "—" : light.toFixed(1) + "h"}</span>`}
          </div>
        </div>
      </div>
      ${idle ? "" : `<div class="ps-vits">${vitals}</div>${this._hypnoSvg(sec)}`}
      <div class="ps-xtra">${idle ? `<div class="ps-vits" style="margin-top:0">${vitals}</div>${this._hypnoSvg(sec)}` : ""}${rows}</div>`;
  },

  _secClimate(sec) {
    const h = this._hass;
    const th = h.states[sec.goal] || h.states[sec.thermostat];
    const cur = th && th.attributes.current_temperature;
    /* Reads the optimistic setpoint while one is in flight, so the number
       moves on the tap instead of five seconds later. */
    const goal = this._optGoal(sec.goal || sec.thermostat, th && th.attributes.temperature);
    const action = (th && th.attributes.hvac_action) || (th && th.state) || "idle";
    const reason = th && th.attributes.hvac_action_reason;
    const rng = sec.ring || { min: 60, max: 80 };
    const frac = cur == null ? 0 : Math.max(0, Math.min(1, (cur - rng.min) / (rng.max - rng.min)));
    /* The ring drew an absolute 60–80 position and nothing else, which answers
       a question nobody asks. With the goal marked, the same arc says at a
       glance whether the house is above or below where it is meant to be. */
    const goalFrac = goal == null ? null
      : Math.max(0, Math.min(1, (goal - rng.min) / (rng.max - rng.min)));
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

    const spark = sec.room_spark !== false;
    /* ONE scale down the column. Auto-scaling each room to its own data drew a
       bedroom drifting half a degree with the same amplitude as a room swinging
       four, so the list looked like five rooms in trouble and invited a
       comparison none of the pictures could support. A room genuinely steadier
       than its neighbours now looks it. */
    const sparkScale = spark ? (() => {
      let lo = Infinity, hi = -Infinity;
      (sec.rooms || []).forEach((r) => {
        (this._history[r.temp] || []).forEach((p) => {
          const v = parseFloat(p.s);
          if (!Number.isFinite(v)) return;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        });
      });
      return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? { lo, hi } : null;
    })() : null;
    const rooms = (sec.rooms || []).map((r) => {
      const t = pcNum(h, r.temp), hu = pcNum(h, r.humidity);
      return `<div class="ps-rml" data-info="${psEsc(r.temp)}">
          <span class="ps-rn ps-trunc">${psEsc(r.name || pcName(h, r.temp))}</span>
          ${spark ? `<span class="ps-spark">${this._sparkSvg(r.temp, sparkScale)}</span>` : ""}
          <span class="ps-v">${t == null ? "—" : t.toFixed(1) + "°"}</span>
          <span class="ps-h">${hu == null ? "" : hu.toFixed(1) + "%"}</span>
        </div>`;
    }).join("");

    const chips = (sec.chips || []).map((ch) => {
      /* `select.gttc_schedule_mode` names the BASE weekday/weekend lists, not
         the plan in force — GTTC runs a preset situationally and leaves
         active_preset null. A chip reading "Weekday/Weekend" while the `home`
         preset drives the house is worse than no chip. This one asks the
         schedule which scope actually owns the live window. */
      if (ch.source === "schedule_preset") {
        const scope = this._detectScope();
        const labels = (this._sched && this._sched.preset_labels) || {};
        if (!this._sched) return "";
        const txt = scope ? (labels[scope] || scope) : "Base";
        return `<span class="ps-chip">${psEsc(ch.name || "Running:")} ${psEsc(this._humanize(txt))}</span>`;
      }
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
        this._humanize(action))}</span>`)}
      <div class="ps-chero">
        <div class="ps-ring" style="width:92px;height:92px" data-info="${psEsc(sec.goal || sec.thermostat)}">
          ${this._ringSvg(92, 7.5, [[frac, col]], goalFrac, "var(--ps-text)")}
          ${/* "now" invited the reading that this is the house temperature,
                and then neither zone chip below it agreed — three numbers on
                one card with no stated relationship. It is the thermostat's
                own sensor, in ONE room (the kitchen, here), so naming that
                room is the entire explanation.

                `hero_label` rather than the word "thermostat": that was tried
                and it overflowed the ring, clipping to "HERMOSTAT". A ring
                caption has about seven characters, which a room name fits and
                a job title does not. Defaults to "now" so an install that
                does not set it is unchanged. */""}
          <div class="ps-rv"><b>${cur == null ? "—" : Number(cur).toFixed(1) + "°"}</b><small>${
            psEsc(sec.hero_label || "now")}</small></div>
        </div>
        <div class="ps-grow">
          <div class="ps-row">
            <button class="ps-step" type="button" data-step="-1" aria-label="Lower goal">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M5 12h14"/></svg></button>
            <div class="ps-goal"><b>${goal == null ? "—" : Math.round(goal) + "°"}</b><span>goal</span></div>
            <button class="ps-step" type="button" data-step="1" aria-label="Raise goal">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M12 5v14M5 12h14"/></svg></button>
          </div>
          ${reason ? `<div class="ps-reason">${psEsc(this._reasonText(reason))}</div>` : ""}
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
        ${this._waveRange ? `<span class="ps-wax hi">${this._waveRange.hi.toFixed(0)}°</span>
        <span class="ps-wax lo">${this._waveRange.lo.toFixed(0)}°</span>` : ""}
        ${wave}</div>` : ""}`;
  },

  /* Renders nothing at all when every television is off, the same way the
     conditional card it replaces disappeared from the old view. */
  /* One surface for everything currently playing, music and television alike.
   *
   * Music used to hold a permanent slot on the landing page whether or not
   * anything was playing, and the televisions had a separate self-hiding
   * section. Both are the same question — "what is on right now" — so they are
   * one section that renders nothing at all when the house is quiet, and the
   * full music controls moved behind the dock button.
   *
   * Music shows its album art, television shows the logo of whatever app is
   * open, so the row is identifiable before any text is read.
   */
  _secNowplaying(sec) {
    const h = this._hass;
    const rows = [];

    /* Every room that is playing, not just the first one. _nowPlaying answers
       with a single player because the dock bar has room for exactly one — but
       this section is the answer to "what is on right now", and while the
       foreign-app_id reject was in place multi-room simply never happened, so
       one row was always enough by accident. Two rooms now routinely play
       different things. */
    (this._config.now_playing || {}).players?.forEach((p) => {
      const st = this._hass.states[p.entity];
      if (!psLiveMusic(st)) return;
      const a = st.attributes;
      const np = { ...p, st, playing: st.state === "playing" };
      const art = a.entity_picture_local;
      /* The album is dropped when it merely restates the track, which is what
         a single reports — "Danza Kuduro X Beautiful" printed a line below
         itself. The room name is the fallback, never a second copy of the
         title. */
      const album = a.media_album_name && a.media_album_name !== a.media_title
        ? a.media_album_name : null;
      /* The room is always named. With one row it was implied and could be
         left out; with two it is the only thing telling them apart. */
      const sub = [[a.media_artist, album].filter(Boolean).join(" — "), np.name]
        .filter(Boolean).join(" · ");
      rows.push(`<div class="ps-npr" data-sheet="music" role="button" tabindex="0">
          <div class="ps-npart">${art
            ? `<img src="${psEsc(art)}" alt="" />`
            : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
          <div class="ps-grow">
            <div class="ps-npt ps-trunc">${psEsc(a.media_title || "Playing")}</div>
            <div class="ps-nps ps-trunc">${psEsc(sub)}</div>
          </div>
          <button class="ps-npb" type="button" data-mp="playpause" data-entity="${psEsc(np.entity)}"
            aria-label="${np.playing ? "Pause" : "Play"}">
            <svg viewBox="0 0 24 24" class="ps-ico">${np.playing
              ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
        </div>`);
    });

    (sec.tvs || []).forEach((t) => {
      const st = pcState(h, t.media_player);
      if (!st || st === "off" || st === "unavailable" || st === "unknown") return;
      const app = pcState(h, t.app_sensor);
      const shown = app && app !== "unknown" && app !== "unavailable" ? app : "On";
      /* Prefer a sheet when one is configured; a hash link is the older path
         and leaves a Bubble pop-up to be closed. */
      const open = sec.remote_sheet
        ? `data-sheet="${psEsc(sec.remote_sheet)}"`
        : `data-nav="${psEsc(sec.remote_link || "#tvs")}"`;
      rows.push(`<div class="ps-npr" ${open} role="button" tabindex="0">
          <div class="ps-npart ps-npapp">${this._appIcon(sec, app)}</div>
          <div class="ps-grow">
            <div class="ps-npt ps-trunc">${psEsc(shown)}</div>
            <div class="ps-nps ps-trunc">${psEsc(t.name)}</div>
          </div>
          <button class="ps-npb" type="button" data-tvoff="${psEsc(t.remote || t.media_player)}"
            aria-label="Turn off ${psEsc(t.name)}">
            <svg viewBox="0 0 24 24" class="ps-ico"><path d="M12 3.5v8"/><path d="M6.8 7.2a7.5 7.5 0 1 0 10.4 0"/></svg>
          </button>
        </div>`);
    });

    /* Nothing on: the section is dropped entirely, divider and all. */
    if (!rows.length) return "";
    return `${this._head(sec, `<span class="ps-chip good"><span class="ps-dot"></span>${rows.length}</span>`)}${rows.join("")}`;
  },

  /* Match the app sensor's text against the configured apps, by name or by the
     android activity, then fall back to a plain screen. */
  _appIcon(sec, app) {
    const tvGlyph = `<svg viewBox="0 0 24 24" class="ps-ico"><rect x="2.5" y="5" width="19" height="12" rx="2"/><path d="M8.5 20.5h7"/></svg>`;
    if (!app) return tvGlyph;
    const want = String(app).toLowerCase();
    const hit = (sec.apps || []).find((x) =>
      String(x.name || "").toLowerCase() === want ||
      String(x.activity || "").toLowerCase() === want);
    if (hit && PC_BRANDS[hit.brand]) return PC_BRANDS[hit.brand];
    /* The sensor sometimes reports the brand outright, with no app configured. */
    if (PC_BRANDS[want]) return PC_BRANDS[want];
    return tvGlyph;
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  /* Only days that have something on them get a row.
   *
   * Five fixed days meant five "Nothing scheduled" lines on a quiet week —
   * a hundred pixels of the column saying nothing. Today always renders,
   * because "today is clear" is itself worth knowing; every later empty day is
   * counted into one quiet line at the end instead. */
  _secCalendar(sec) {
    const days = sec.days || 5;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let out = "";
    let skipped = 0;
    for (let d = 0; d < days; d++) {
      const day = new Date(today.getTime() + d * 86400000);
      const next = day.getTime() + 86400000;
      const evs = this._events.filter((e) => e.t >= day.getTime() && e.t < next);
      if (!evs.length && d > 0) { skipped++; continue; }
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
    const tail = skipped
      ? `<div class="ps-cskip">${skipped === days - 1
          ? `Nothing else in the next ${days} days`
          : `${skipped} clear day${skipped > 1 ? "s" : ""} not shown`}</div>`
      : "";
    return `${this._head(sec)}${out}${tail}`;
  },

  _fired(list) {
    const h = this._hass;
    return (list || []).filter((f) => {
      const st = pcState(h, f.entity);
      if (f.state !== undefined) return st === f.state;
      if (f.state_not !== undefined) return st !== f.state_not && st !== "unavailable" && st !== "unknown";
      return false;
    });
  },

  _meterHtml(m) {
    const v = pcNum(this._hass, m.entity);
    const p = v == null ? 0 : Math.max(0, Math.min(100, v));
    const warn = m.warn_above == null ? 80 : m.warn_above;
    const crit = m.critical_above == null ? 95 : m.critical_above;
    const c = p >= crit ? "var(--ps-bad)" : p >= warn ? "var(--ps-warn)" : "var(--ps-good)";
    return `<div class="ps-sysrow" data-info="${psEsc(m.entity)}">
        <span class="ps-sn">${psEsc(m.label)}</span>
        <span class="ps-sv">${m.text ? psEsc(pcState(this._hass, m.entity))
          : (v == null ? "\u2014" : v.toFixed(1) + "%")}</span>
        <span class="ps-meter"><i style="width:${p.toFixed(0)}%;background:${c}"></i></span>
      </div>`;
  },

  _statsHtml(list) {
    const h = this._hass;
    return (list || []).map((x) => {
      const st = h.states[x.entity];
      const raw = st ? st.state : "";
      const unit = st && st.attributes.unit_of_measurement ? st.attributes.unit_of_measurement : "";
      const txt = x.map && x.map[raw] ? x.map[raw] : raw + (unit ? " " + unit : "");
      const good = x.good_when && x.good_when.indexOf(raw) >= 0;
      const bad = x.bad_when && x.bad_when.indexOf(raw) >= 0;
      return `<div class="ps-st" data-info="${psEsc(x.entity)}">
          <span class="ps-stk">${psEsc(x.label)}</span>
          <span class="ps-stv ${bad ? "ps-warnc" : good ? "ps-good" : ""}">${psEsc(txt || "\u2014")}</span>
        </div>`;
    }).join("");
  },

  _switchesHtml(items) {
    return (items || []).map((it) => {
      const on = pcState(this._hass, it.entity) === "on";
      const missing = !this._hass.states[it.entity];
      return `<div class="ps-sw ${missing ? "gone" : ""}">
          <ha-icon icon="${psEsc(it.icon || "mdi:application")}"></ha-icon>
          <span class="ps-trunc">${psEsc(it.name)}</span>
          ${it.url ? `<button class="ps-link" type="button" data-url="${psEsc(it.url)}"
            aria-label="Open ${psEsc(it.name)}">
            <svg viewBox="0 0 24 24" class="ps-ico"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
          </button>` : ""}
          ${missing ? `<span class="ps-chip">missing</span>`
            : `<button class="ps-knob ${on ? "on" : ""}" type="button" data-toggle="${psEsc(it.entity)}"
               role="switch" aria-checked="${on}" aria-label="${psEsc(it.name)}"><i></i></button>`}
        </div>`;
    }).join("");
  },

  /* A NAS, a floor robot and a litter box are three devices, not six peer
     groups — the robots were sitting at the same level as a Docker category,
     which made them read like a subsystem of the server. Each device owns its
     own header, health and meters, and only the NAS has groups inside it. */
  _devicesHtml(sec) {
    return (sec.devices || []).map((d, di) => {
      const key = sec.key + "|dev|" + (d.key || d.name);
      const open = !!this._openGroups[key];
      const faults = this._fired(d.faults);
      const sub = d.subtitle_entity ? pcState(this._hass, d.subtitle_entity) : (d.subtitle || "");
      const chip = d.chip ? pcState(this._hass, d.chip) : "";

      const groups = (d.groups || []).map((g) => {
        const gkey = key + "|" + g.name;
        const gopen = !!this._openGroups[gkey];
        const items = g.items || [];
        const on = items.filter((it) => pcState(this._hass, it.entity) === "on").length;
        return `<div class="ps-grp ${gopen ? "open" : ""}">
            <button class="ps-grph" type="button" data-group="${psEsc(gkey)}" aria-expanded="${gopen}">
              <ha-icon icon="${psEsc(g.icon || "mdi:folder-outline")}"></ha-icon>
              <span class="ps-gn">${psEsc(g.name)}</span>
              <span class="ps-chip ${on ? "good" : ""}">${on} of ${items.length}</span>
              <span class="ps-gcv"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5l7 7-7 7"/></svg></span>
            </button>
            <div class="ps-grpb"><div class="ps-swrap">${this._switchesHtml(items)}</div></div>
          </div>`;
      }).join("");

      const buttons = (d.buttons || []).map((b, i) =>
        `<button class="ps-btn" type="button" data-dbtn="${di}|${i}">${psEsc(b.name)}</button>`).join("");

      /* A device can hand its depth to the systems mode instead of expanding.
         PurdyNAS is five pages now, and a chevron that opens a stub of them
         beside the real thing is two answers to one question — so the row
         becomes the way in and drops the expand entirely. */
      const toMode = d.mode
        ? ` data-mode="${psEsc(d.mode)}"` : "";

      return `<div class="ps-dev ${open && !d.mode ? "open" : ""}">
          <button class="ps-devh" type="button"${d.mode ? toMode : ` data-group="${psEsc(key)}"`}
            aria-expanded="${d.mode ? "false" : open}">
            <span class="ps-devi ${faults.length ? "bad" : ""}"><ha-icon icon="${psEsc(d.icon || "mdi:devices")}"></ha-icon></span>
            <span class="ps-grow">
              <span class="ps-devn">${psEsc(d.name)}</span>
              <span class="ps-devs">${psEsc(sub)}</span>
            </span>
            ${faults.length
              ? `<span class="ps-chip bad"><span class="ps-dot"></span>${faults.length}</span>`
              : chip ? `<span class="ps-chip">${psEsc(chip)}</span>`
              : `<span class="ps-chip good"><span class="ps-dot"></span>OK</span>`}
            <span class="ps-gcv"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5l7 7-7 7"/></svg></span>
          </button>

          ${faults.length ? `<div class="ps-faults">${faults.map((f) =>
            `<div class="ps-fault" data-info="${psEsc(f.entity)}"><span class="ps-dotc bad"></span>
              <span class="ps-grow"><b>${psEsc(f.label)}</b> ${psEsc(f.detail || "")}</span></div>`).join("")}</div>` : ""}
          ${(d.meters || []).map((m) => this._meterHtml(m)).join("")}

          <div class="ps-devb">
            ${d.stats ? `<div class="ps-stats">${this._statsHtml(d.stats)}</div>` : ""}
            ${groups}
            ${buttons ? `<div class="ps-btns">${buttons}</div>` : ""}
          </div>
        </div>`;
    }).join("");
  },

  /* The section that got the most attention: collapsed shows meters, expanded
     shows every group's stats, every container switch and the robot controls
     that used to need the #devices popup. */
  _secSystems(sec) {
    const h = this._hass;
    if (sec.devices) {
      const all = (sec.devices || []).reduce((n, d) => n + this._fired(d.faults).length, 0);
      return `${this._head(sec, all
        ? `<span class="ps-chip bad"><span class="ps-dot"></span>${all} fault${all > 1 ? "s" : ""}</span>`
        : `<span class="ps-chip good"><span class="ps-dot"></span>Healthy</span>`)}
        ${this._devicesHtml(sec)}`;
    }

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
  },
});

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
      /* Close the editor but stay on the preset and day being looked at —
         a delete is not a reason to throw the user back to today. */
      this._schedEdit = null;
      this._schedNote = null;
      this._armed = null;
      await this._fetchSchedule();
    } catch (err) {
      this._schedNote = "Delete failed: " + ((err && err.message) || "unknown error");
      this._render();
    }
  },

  _scheduleHtml(sec) {
    const h = this._hass;
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

    const onId = (sec.schedule || {}).switch_entity;
    const on = onId ? pcState(h, onId) === "on" : null;

    /* The chip used to show select.gttc_schedule_mode, which names the base
       weekday/weekend lists — not the plan running the house. Say which of the
       four is in force, and whether you are currently looking at it. */
    const running = this._detectScope();
    const runLabel = running ? (labels[running] || running) : "Base";
    const viewing = scope === running;

    return `<div class="ps-sched">
        <div class="ps-schedh">
          <span class="ps-lbl">Schedule</span>
          <span class="ps-chip ${viewing ? "cool" : ""}">Running: ${
            psEsc(this._humanize(runLabel))}</span>
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

/* ============================================================================
 * purdy-shell-card — Music Assistant
 *
 * Music targets a room, not a card: _activePlayer() is whatever the user last
 * tapped, else whatever is actually playing, else default_player, so a stale
 * pick falls back rather than targeting a dead entity.
 *
 * PICKING A ROOM IS A RADIO, NOT A SET (v1.30.0). It used to toggle into a
 * multi-select array, and "play to N rooms" was N independent play_media calls
 * — N unsynchronised queues, not multi-room. Worse, the sheet's transport and
 * main volume never read the selection at all: they targeted
 * `nowPlaying || default_player`, so tapping Kitchen highlighted Kitchen and
 * then every control still drove the Living Room. That is what "selecting
 * devices gets stuck" was. One selected room now, and real grouping is
 * media_player.join, which these players do support (bit 524288 is set).
 *
 * Saved playlists live in a 255-character input_text, so the oldest saves are
 * dropped rather than the write failing.
 * ========================================================================== */

/* The order the search sheet offers, and the label on each chip. `all` is not
   a Music Assistant media_type — it means "send no media_type at all". */
const PS_MTYPES = [
  { key: "all", label: "All" },
  { key: "track", label: "Tracks" },
  { key: "album", label: "Albums" },
  { key: "artist", label: "Artists" },
  { key: "playlist", label: "Playlists" },
  { key: "radio", label: "Radio" },
];

Object.assign(PurdyShellCard.prototype, {
  _musicSec() {
    return (this._config.sections || []).find((x) => x.type === "music");
  },

  /* Recently listened comes from HA's recorder, not Music Assistant: MA's
     last_played / play_count are empty in this install, so its own
     "recently played" ordering is silently meaningless. Every MA player logs
     media_title, media_artist and a playable media_content_id per state
     change, so read it back from there. Bounded by recorder retention. */
  async _fetchRecent() {
    const sec = this._musicSec();
    if (!sec || !this._hass || !this._hass.callApi) return;
    const ids = (sec.players || []).map((p) => p.entity);
    if (!ids.length) return;
    const start = new Date(Date.now() - (sec.recent_hours || 48) * 3600 * 1000).toISOString();
    try {
      /* end_time is not optional — see pcNowIso. Without it a 48h window
         stopped 24h short, so "recently played" never showed today. */
      const res = await this._hass.callApi("GET",
        `history/period/${start}?filter_entity_id=${ids.join(",")}` +
        `&end_time=${encodeURIComponent(pcNowIso())}`);
      const rows = [];
      (res || []).forEach((series) => (series || []).forEach((e) => {
        const a = e.attributes || {};
        if (!a.media_title || !a.media_content_id) return;
        if (!pcIsMusicState(e)) return;
        rows.push({
          t: new Date(e.last_changed || e.last_updated).getTime(),
          uri: a.media_content_id,
          name: a.media_title,
          sub: a.media_artist || a.media_album_name || "",
          /* The recorder keeps entity_picture_local, and a row with a cover is
             recognisable at a glance where a row of identical note glyphs is
             not. It is HA's own authenticated same-origin proxy, so unlike
             entity_picture it actually loads. */
          image: a.entity_picture_local || null,
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
  },

  /* --- the queue ----------------------------------------------------------
     get_queue answers with the current item, the next item and how far through
     the list we are — not the whole list. That is exactly the useful part:
     "17 of 27, up next X" tells you whether to skip, and a full scrolling
     queue would not fit above the fold anyway. Shuffle and repeat come back
     in the same call, which is the only place their real state is visible
     (the media_player attributes do not carry them for these players). */
  async _fetchQueue() {
    const target = this._activePlayer();
    if (!target || !this._hass || !this._hass.callService) return;
    /* A queue read is per-player, so a stale answer for the room you just
       left must not paint over the room you just picked. */
    const token = (this._queueToken = (this._queueToken || 0) + 1);
    try {
      const r = await this._hass.callService(
        "music_assistant", "get_queue", { entity_id: target }, undefined, false, true
      );
      if (token !== this._queueToken) return;
      const q = ((r && r.response) || {})[target];
      this._queue = q ? { ...q, entity: target } : null;
    } catch (err) {
      /* A player with no queue (or an MA that will not answer) simply shows
         no up-next line. It must not read as "nothing is playing". */
      if (token !== this._queueToken) return;
      this._queue = null;
    }
    this._last = null;
    this._render();
  },

  /* The queue is only worth reading while the music sheet is open, and only
     when the answer could have changed: a new track, or a new target room. */
  _syncQueue() {
    if (this._sheet !== "music") { this._queueKey = null; return; }
    const target = this._activePlayer();
    const st = target && this._hass.states[target];
    const key = [target, st && st.state, st && st.attributes.media_title].join("|");
    if (key === this._queueKey) return;
    this._queueKey = key;
    this._fetchQueue();
  },

  /* --- search -------------------------------------------------------------
     Typed-into, not submitted. The old field only searched on Enter, which on
     a phone keyboard means the search was one deliberate extra action behind
     every thought. Debounced at 400ms so a fast typist makes one request. */
  _queueSearch(q) {
    this._query = q;
    if (this._searchT) clearTimeout(this._searchT);
    if (!q.trim()) {
      this._results = null;
      this._paintResults();
      return;
    }
    this._searchT = setTimeout(() => this._runSearch(), 400);
  },

  async _runSearch() {
    const sec = this._musicSec();
    const q = (this._query || "").trim();
    const entry = sec && sec.config_entry;
    if (!q || !entry) {
      this._results = q && !entry ? [] : null;
      this._paintResults();
      return;
    }
    const kind = this._mtype || "all";
    /* The field keeps focus while this runs, so a late answer for a query the
       user has already typed past must not replace the newer one. */
    const token = (this._searchToken = (this._searchToken || 0) + 1);
    this._searching = true;
    this._paintResults();
    const data = { config_entry_id: entry, name: q };
    if (kind !== "all") data.media_type = [kind];
    try {
      const r = await this._hass.callService(
        "music_assistant", "search", data, undefined, false, true
      );
      if (token !== this._searchToken) return;
      const d = (r && r.response) || {};
      const rows = [];
      const take = (arr, k, n) => (arr || []).slice(0, n).forEach((x) => rows.push({
        uri: x.uri, name: x.name, kind: k, image: x.image,
        sub: x.artists && x.artists.length
          ? x.artists.map((a) => a.name).join(", ")
          : (k === "album" && x.version ? x.version : k),
      }));
      /* Filtered means you already said what you wanted, so give it the room:
         a single deep list rather than four shallow ones. */
      if (kind === "all") {
        take(d.tracks, "track", 4);
        take(d.playlists, "playlist", 3);
        take(d.albums, "album", 3);
        take(d.artists, "artist", 2);
        take(d.radio, "radio", 1);
      } else {
        const bucket = { track: "tracks", album: "albums", artist: "artists",
                         playlist: "playlists", radio: "radio" }[kind];
        take(d[bucket], kind, 20);
      }
      this._results = rows;
    } catch (err) {
      if (token !== this._searchToken) return;
      this._results = [];
    }
    this._searching = false;
    this._paintResults();
  },

  /* Write the results straight into their own container instead of asking for
     a repaint. _render is gated by _dragging — which a focused search field
     sets, and must set, or the patch would destroy the input mid-word. So
     search-as-you-type is only possible if the results can be drawn without
     going through _render at all. Same reasoning as the scrub readouts. */
  _paintResults() {
    const box = this.shadowRoot && this.shadowRoot.getElementById("ps-res");
    if (!box) { this._render(); return; }
    const html = this._resultsHtml();
    if (box._psHtml === html) return;
    box._psHtml = html;
    box.innerHTML = html;
    this._bind();
  },

  _playUri(uri, kind) {
    const targets = this._targets();
    if (!uri || !targets.length) return;
    this._hass.callService("music_assistant", "play_media", {
      entity_id: targets, media_id: uri, media_type: kind || "track", enqueue: "replace",
    });
  },

  /* Queue behind what is playing rather than replacing it. Long-press already
     means "save", so this is the row's second button, not a second gesture. */
  _enqueueUri(uri, kind) {
    const targets = this._targets();
    if (!uri || !targets.length) return;
    this._hass.callService("music_assistant", "play_media", {
      entity_id: targets, media_id: uri, media_type: kind || "track", enqueue: "add",
    });
    this._toast(`Added to queue`);
  },

  /* A one-line, self-clearing confirmation. An action whose whole effect
     happens on a speaker in another room otherwise looks like it did nothing. */
  _toast(msg) {
    this._note = msg;
    if (this._noteT) clearTimeout(this._noteT);
    this._noteT = setTimeout(() => {
      this._note = null;
      this._last = null;
      this._render();
    }, 2600);
    this._last = null;
    this._render();
  },

  /* --- saved playlists ----------------------------------------------------
     A store is either a todo list (unbounded) or an input_text (`uri~name`
     pairs, and that helper caps at 255 characters, so the oldest pins fall
     off rather than the write failing). */
  _pinStore() {
    const sec = this._musicSec();
    return sec && sec.pins && sec.pins.store;
  },

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
  },

  _writePins(list) {
    const store = this._pinStore();
    if (!store) return;
    let pairs = list.map((p) => p.uri + "~" + p.name);
    while (pairs.length && pairs.join("|").length > 255) pairs.shift();
    this._hass.callService("input_text", "set_value", { entity_id: store, value: pairs.join("|") });
  },

  _isPinned(uri) {
    return this._pins.some((p) => p.uri === uri);
  },

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
    this._toast(existing ? "Removed from saved" : "Saved");
  },

  /* What is playing right now, as something that can be pinned. MA reports the
     queue item, so prefer the playlist it came from when there is one.
     It follows the TARGET room, because that is whose track the sheet header
     shows — a star that saved a different room's music than the one named
     above it would be saving something you cannot see. Falls back to whatever
     is playing anywhere, which is what the column section shows. */
  _pinnable() {
    const target = this._activePlayer();
    const tst = target && this._hass.states[target];
    const src = psLiveMusic(tst) ? { st: tst } : this._nowPlaying();
    if (!src) return null;
    const a = src.st.attributes;
    const uri = a.media_playlist_content_id || a.media_content_id;
    if (!uri) return null;
    const name = a.media_playlist || a.media_album_name || a.media_title;
    const kind = a.media_playlist ? "playlist" : (a.media_content_type || "track");
    return { uri, name, kind };
  },

  /* Which room a preset, a search result or the transport acts on: whatever
     the user last picked, else whatever is actually playing, else the default.
     One room — see the header note. Grouping is join, not a list of targets. */
  _targets() {
    const p = this._activePlayer();
    return p ? [p] : [];
  },

  _activePlayer() {
    const sec = this._musicSec();
    if (!sec) return null;
    const known = (sec.players || []).map((p) => p.entity);
    /* A pick survives only while the room still exists in config. */
    if (this._pick && known.indexOf(this._pick) >= 0) return this._pick;
    const np = this._nowPlaying();
    if (np && known.indexOf(np.entity) >= 0) return np.entity;
    return sec.default_player || known[0] || null;
  },

  _isPicked(entity) {
    return this._activePlayer() === entity;
  },

  /* Tapping a room makes it THE room. Tapping the one already active clears
     the pick, which hands control back to whatever is actually playing. */
  _togglePick(entity) {
    this._pick = this._pick === entity ? null : entity;
    this._queueKey = null;
    this._last = null;
    this._render();
    this._syncQueue();
  },

  /* --- grouping -----------------------------------------------------------
     These players carry the GROUPING bit, so media_player.join really does
     produce one synchronised stream across rooms — which is what tapping two
     rooms was pretending to do by starting two independent queues. */
  _groupOf(entity) {
    const st = entity && this._hass.states[entity];
    const g = (st && st.attributes.group_members) || [];
    return Array.isArray(g) ? g : [];
  },

  _isGrouped(entity) {
    const lead = this._activePlayer();
    if (!lead || lead === entity) return false;
    return this._groupOf(lead).indexOf(entity) >= 0;
  },

  _toggleJoin(entity) {
    const lead = this._activePlayer();
    if (!lead || lead === entity) return;
    if (this._isGrouped(entity)) {
      this._hass.callService("media_player", "unjoin", { entity_id: entity });
    } else {
      this._hass.callService("media_player", "join", {
        entity_id: lead, group_members: this._groupOf(lead).concat([entity]),
      });
    }
  },

  /* Move what is playing to the room you just picked, rather than making you
     find it again and start it over. */
  _moveHere() {
    const to = this._activePlayer();
    const np = this._nowPlaying();
    if (!to || !np || np.entity === to) return;
    this._hass.callService("music_assistant", "transfer_queue", {
      entity_id: to, source_player: np.entity, auto_play: true,
    });
    this._toast("Moving playback…");
  },

  /* Shuffle and repeat live in the queue answer, not in the entity, so both
     read from _queue and fall back to off until it lands. */
  _setShuffle() {
    const t = this._activePlayer();
    if (!t) return;
    const on = !!(this._queue && this._queue.shuffle_enabled);
    this._hass.callService("media_player", "shuffle_set", { entity_id: t, shuffle: !on });
    this._queueKey = null;
  },

  _cycleRepeat() {
    const t = this._activePlayer();
    if (!t) return;
    const cur = (this._queue && this._queue.repeat_mode) || "off";
    const next = cur === "off" ? "all" : cur === "all" ? "one" : "off";
    this._hass.callService("media_player", "repeat_set", { entity_id: t, repeat: next });
    this._queueKey = null;
  },

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
  },

  _secMusic(sec) {
    const h = this._hass;
    const np = this._nowPlaying();
    const art = np && np.st.attributes.entity_picture_local;
    const active = this._activePlayer();
    const players = (sec.players || []).map((p) => {
      const st = h.states[p.entity];
      const live = st && st.state === "playing" && psIsMusic(st);
      const on = p.entity === active;
      const grouped = this._isGrouped(p.entity);
      return `<button class="ps-mr ${on ? "sel" : ""} ${grouped ? "grp" : ""}" type="button"
        data-pick="${psEsc(p.entity)}" aria-pressed="${on}">
        ${live ? `<span class="ps-live"></span>` : ""}${psEsc(p.name)}</button>`;
    }).join("");

    const presets = (sec.presets || []).map((p, i) =>
      `<button class="ps-pr" type="button" data-preset="${i}">
        <ha-icon icon="${psEsc(p.icon || "mdi:playlist-music")}"></ha-icon>
        <span class="ps-trunc">${psEsc(p.name)}</span></button>`).join("");

    const grouped = this._groupOf(active).length;
    return `
      ${this._head(sec, grouped
        ? `<span class="ps-chip cool">${grouped + 1} rooms</span>`
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
  },

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
  },

  /* One row shape for anything playable — a recent track, a search hit, a
     queue peek. It carries its own enqueue button so "play now" stays the
     single obvious tap. */
  _mediaRow(r, i, from) {
    return `<div class="ps-mi">
        <button class="ps-miplay" type="button" data-play="${i}" data-from="${from}">
          <span class="ps-th">${r.image
            ? `<img src="${psEsc(r.image)}" alt="" />`
            : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</span>
          <span class="ps-grow"><span class="ps-min ps-trunc">${psEsc(r.name)}</span>
          <span class="ps-mis ps-trunc">${psEsc(r.sub || "")}</span></span>
          ${from === "results" && this._mtype === "all"
            /* Only where the list is mixed. With a filter chip lit, every row
               is that kind and the badge is just noise on every line. */
            ? `<span class="ps-kind">${psEsc(r.kind)}</span>` : ""}
        </button>
        <button class="ps-miq" type="button" data-queue="${i}" data-from="${from}"
          aria-label="Add ${psEsc(r.name)} to the queue">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M4 7h11M4 12h11M4 17h7M18 11v8M14 15h8"/></svg>
        </button>
      </div>`;
  },

  /* What you actually reach for is what you just played, so it leads. */
  _recentHtml() {
    if (!this._recent.length) return "";
    return `<div><span class="ps-lbl">Recently played</span>
      <div class="ps-mlist" style="margin-top:6px">${
        this._recent.map((r, i) => this._mediaRow(r, i, "recent")).join("")}</div></div>`;
  },

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
  },

  /* The results block is patched on its own — see _paintResults — so it has to
     render from state alone, chips included. */
  _resultsHtml() {
    const sec = this._musicSec();
    const cur = this._mtype || "all";
    const chips = PS_MTYPES.map((t) =>
      `<button class="ps-fc ${t.key === cur ? "on" : ""}" type="button" data-mtype="${t.key}"
        aria-pressed="${t.key === cur}">${t.label}</button>`).join("");

    let body = "";
    if (this._searching) {
      body = `<div class="ps-note">Searching…</div>`;
    } else if (this._results && this._results.length) {
      body = `<div class="ps-mlist">${
        this._results.map((r, i) => this._mediaRow(r, i, "results")).join("")}</div>`;
      if (this._pinStore()) {
        body += `<div class="ps-note">Hold a row to save it. The list icon queues it up next.</div>`;
      }
    } else if (this._results && !this._results.length) {
      body = `<div class="ps-note">${sec && sec.config_entry
        ? "No results." : "Search needs a Music Assistant config_entry."}</div>`;
    }
    return `<div class="ps-filters">${chips}</div>${body}`;
  },

  /* "17 of 27 · up next X" is the part of a queue worth the space. The whole
     list would not fit above the fold and is not what you came to check. */
  _queueHtml() {
    const q = this._queue;
    const target = this._activePlayer();
    if (!q || !q.active || q.entity !== target || !q.items) return "";
    const next = q.next_item && q.next_item.media_item;
    const pos = Number.isFinite(q.current_index) ? `${q.current_index + 1} of ${q.items}` : `${q.items} queued`;
    const shuf = !!q.shuffle_enabled;
    const rep = q.repeat_mode || "off";
    return `<div class="ps-qbar">
        <button class="ps-qb ${shuf ? "on" : ""}" type="button" id="ps-shuf"
          aria-pressed="${shuf}" aria-label="Shuffle">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M17 4l3 3-3 3M17 14l3 3-3 3M4 7h4l8 10h4M4 17h4l2.2-2.8M14 8.8L16 7h4"/></svg>
        </button>
        <button class="ps-qb ${rep !== "off" ? "on" : ""}" type="button" id="ps-rep"
          aria-label="Repeat: ${rep}">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5M17 7v4M7 17v-4"/></svg>
          ${rep === "one" ? `<span class="ps-qone">1</span>` : ""}
        </button>
        <span class="ps-grow ps-trunc ps-qup">${next
          ? `Up next · ${psEsc(next.name)}`
          : "Last in queue"}</span>
        <span class="ps-qpos">${psEsc(pos)}</span>
      </div>`;
  },
});
/* ============================================================================
 * purdy-shell-card — attention rules, dismissals and the notification log
 *
 * A dismissal is an acknowledgement, not a mute: a row is hidden only while
 * the triggering entity's last_changed is older than the dismissal, so a fault
 * that re-fires comes back.
 * ========================================================================== */

Object.assign(PurdyShellCard.prototype, {
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
  },

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
  },

  _dismiss(row) {
    const map = this._dismissals();
    map[row.key] = Math.floor(Date.now() / 1000);
    this._writeDismissals(map);
    if (this._config.log_to) this._closeLog(row);
    this._last = null;
    this._render();
  },

  async _logItems() {
    if (!this._config.log_to || !this._hass.callWS) return [];
    const res = await this._hass.callWS({ type: "todo/item/list", entity_id: this._config.log_to });
    return (res && res.items) || [];
  },

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
  },

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
  },

  /* One rule, one predicate. `state` / `state_not` / `above` / `below`, in that
     order, against a single entity's state. */
  _ruleHit(r, st) {
    if (!st) return false;
    const v = st.state;
    if (r.state !== undefined) return v === r.state;
    if (r.state_not !== undefined) return v !== r.state_not && v !== "unavailable" && v !== "unknown";
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return false;
    if (r.above !== undefined) return n > r.above;
    if (r.below !== undefined) return n < r.below;
    return false;
  },

  /* When did this rule's condition last change? A dismissal older than that
     means the fault re-fired, so the row comes back.

     The group branch used to ask `state !== (r.state || "on")` outright, which
     silently assumes every group rule is a boolean one. A numeric group rule —
     five consumables all below a threshold — has no `r.state`, so every member
     was compared against the string "on", nothing ever matched, and firedAt
     came back 0. A dismissal is always newer than 0, so dismissing such a rule
     would have hidden it FOREVER rather than for `dismiss_hours`. It shares
     _ruleHit with _raised now, so the two halves cannot disagree about what
     the rule means. */
  _firedAt(r) {
    const h = this._hass;
    if (r.entity && h.states[r.entity]) {
      return Math.floor(new Date(h.states[r.entity].last_changed).getTime() / 1000);
    }
    if (r.match) {
      const re = new RegExp(r.match);
      let newest = 0;
      Object.keys(h.states).forEach((id) => {
        if (!re.test(id) || !this._ruleHit(r, h.states[id])) return;
        const t = Math.floor(new Date(h.states[id].last_changed).getTime() / 1000);
        if (t > newest) newest = t;
      });
      return newest;
    }
    return 0;
  },

  /* The server's own fault rules, in the same shape as an attention rule —
     one vocabulary for "what counts as wrong". The desk wrote this first and
     the shell had a lesser copy inside the systems page that knew about
     `above` but not `below`; it lives here now and both views share it. */
  _serverFaults() {
    const srv = this._config.server;
    if (!srv || !this._hass) return [];
    return (srv.faults || []).filter((f) => this._ruleHit(f, this._hass.states[f.entity]));
  },

  /* Everything currently matching, before dismissals are applied.

     The server's faults are in here too, and that is the point. They used to
     raise only on the Systems overview, two taps inside a mode — so with disk1
     at 92.8% the landing page's header chip read "All clear" while the array
     was nearly full. The chip is the one place a fault is supposed to reach
     you; a fault it does not know about is a fault you find by going looking,
     which is the opposite of what it is for. Keys are prefixed `sv:` so they
     dismiss independently of a house rule that happens to share a name. */
  _raised() {
    const rules = this._config.attention || [];
    const hass = this._hass;
    if (!hass) return [];
    const out = [];
    this._serverFaults().forEach((f) => {
      out.push({
        key: "sv:" + (f.key || String(f.label || f.entity).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 8)),
        severity: f.severity || "warn",
        title: f.label || pcName(hass, f.entity),
        detail: f.detail || "",
        entity: f.entity,
        firedAt: this._firedAt(f),
      });
    });
    rules.forEach((r, i) => {
      const hit = (st) => this._ruleHit(r, st);
      if (r.match) {
        const re = new RegExp(r.match);
        const names = Object.keys(hass.states)
          .filter((id) => re.test(id) && hit(hass.states[id]))
          /* `strip` takes a list as well as a single string. One pattern only
             ever removed a prefix, so the Jeeves consumables rule came out as
             "Filter Left · Sensor Dirty Time Left · Wheel Dirty Time Left" —
             HA's friendly names leaking through the tail. Applied in order,
             then collapsed, so a rule can take both ends off a name. */
          .map((id) => {
            const pats = r.strip == null ? [] : [].concat(r.strip);
            let n = hass.states[id].attributes.friendly_name || id;
            pats.forEach((p) => { n = n.split(p).join(" "); });
            return n.replace(/\s+/g, " ").trim();
          })
          .filter(Boolean);
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
  },

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
  },

  /* One sheet, two contents. Both slide over the column rather than pushing
     it around, so opening either never moves what is under your thumb. */
  _sheetHtml(faults) {
    if (!this._sheet) return "";
    const close = `<button class="ps-x" type="button" id="ps-close" aria-label="Close">
        <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;

    /* A hosted sheet wraps a card that already exists rather than
       reimplementing it. The remote's d-pad and app grid are 300 lines that
       work; the point of moving the TV off a Bubble pop-up is the surface, not
       the contents. The element itself is attached after the patch — it cannot
       be expressed as a string — so this only leaves it a mount point. */
    const hosted = (this._config.sheets || {})[this._sheet];
    if (hosted && hosted.card) {
      /* `dim` is for a hosted card that hardcodes a light surface instead of
         reading HA's card variables — dreame-vacuum-map-card writes #fff in
         seventy places, so there is nothing to re-theme from out here and a
         floodlight in the middle of a dark sheet is the result. A filter is
         the only lever, so it is opt-in per sheet and never applied by
         default: it dims the map's own colours along with the background,
         which is a trade the config should make deliberately. */
      const dim = Number(hosted.dim);
      const dimStyle = Number.isFinite(dim) && dim > 0 && dim < 1
        ? ` style="filter:brightness(${dim.toFixed(2)})"` : "";
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall">
          <div class="ps-sheeth"><span class="ps-lbl">${psEsc(hosted.title || "")}</span>${close}</div>
          <div class="ps-host" id="ps-host"${dimStyle}></div>
        </div>`;
    }

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

    /* Lights live in a sheet, not in the column. The section is `sheet_only`,
       so this is the only path that renders it: a sheet slides over what is
       already there instead of pushing it down, which is the same reason the
       schedule and the music controls are sheets. Same body, same handlers —
       only the header differs, and the sheet chrome names itself rather than
       printing "Lights" twice. */
    if (this._sheet === "lights") {
      const sec = (this._config.sections || []).find((x) => x.type === "lights");
      if (!sec) return "";
      const lights = this._lightList(sec);
      if (!lights.length) return "";
      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet">
          <div class="ps-sheeth"><span class="ps-lbl">Lights</span>
            ${this._lightChip(lights)}${close}</div>
          ${this._lightsBody(sec, lights)}
        </div>`;
    }

    /* Every control in this sheet acts on _activePlayer(). It used to act on
       `nowPlaying || default_player` while the room list highlighted the
       user's pick \u2014 so picking a room changed the highlight and nothing else,
       which is what made choosing a speaker feel broken. One target, and the
       room list is what sets it. */
    if (this._sheet === "music") {
      const sec = (this._config.sections || []).find((x) => x.type === "music");
      const np = this._nowPlaying();
      if (!sec) return "";
      const target = this._activePlayer();
      const tst = target && this._hass.states[target];
      /* The header shows what the TARGET room is playing, not what some other
         room is: pointing the controls at Kitchen while the artwork shows the
         Living Room's track is how you skip the wrong song. */
      const tmusic = psLiveMusic(tst);
      const art = tmusic && tmusic.attributes.entity_picture_local;
      const vol = tst && tst.attributes.volume_level != null ? tst.attributes.volume_level : 0;
      const muted = !!(tst && tst.attributes.is_volume_muted);
      const tname = (sec.players || []).find((p) => p.entity === target);
      const playing = !!(tmusic && tst.state === "playing");
      /* Something is playing, but not here. Offer to bring it rather than
         making the user find it again from the start. */
      const elsewhere = np && target && np.entity !== target && !tmusic;
      const groupIds = this._groupOf(target);

      const rooms = (sec.players || []).map((p) => {
        const st = this._hass.states[p.entity];
        const live = st && st.state === "playing" && psIsMusic(st);
        const active = p.entity === target;
        const joined = groupIds.indexOf(p.entity) >= 0;
        const pv = st && st.attributes.volume_level != null ? st.attributes.volume_level : 0;
        return `<div class="ps-vrow ${active ? "on" : ""} ${joined ? "joined" : ""}">
            <button class="ps-vname" type="button" data-pick="${psEsc(p.entity)}"
              aria-pressed="${active}">
              ${live ? `<span class="ps-live"></span>` : ""}${psEsc(p.name)}</button>
            <input class="ps-vol" type="range" min="0" max="100" step="1"
              value="${Math.round(pv * 100)}" data-vol="${psEsc(p.entity)}"
              aria-label="${psEsc(p.name)} volume" />
            <span class="ps-vnum">${Math.round(pv * 100)}</span>
            ${active ? `<span class="ps-jspace"></span>` : `<button class="ps-jb ${joined ? "on" : ""}"
              type="button" data-join="${psEsc(p.entity)}" aria-pressed="${joined}"
              aria-label="${joined ? "Remove" : "Add"} ${psEsc(p.name)} ${joined ? "from" : "to"} the group">
              <svg viewBox="0 0 24 24" class="ps-ico">${joined
                ? `<path d="M9.5 14.5 14.5 9.5M8 11 6 13a3.5 3.5 0 0 0 5 5l2-2M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2"/>`
                : `<path d="M12 7v10M7 12h10"/>`}</svg></button>`}
          </div>`;
      }).join("");

      return `<div class="ps-scrim" id="ps-scrim"></div>
        <div class="ps-sheet tall">
          <div class="ps-sheeth"><span class="ps-lbl">Music${
            tname ? ` \u00B7 ${psEsc(tname.name)}` : ""}</span>${close}</div>
          <div class="ps-now" style="margin-bottom:12px">
            <div class="ps-art">${art
              ? `<img src="${psEsc(art)}" alt="" />`
              : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
            <div class="ps-grow">
              <div class="ps-nt ps-trunc">${tmusic
                ? psEsc(tmusic.attributes.media_title) : "Nothing playing here"}</div>
              <div class="ps-ns ps-trunc">${tmusic
                ? psEsc([tmusic.attributes.media_artist, tname && tname.name].filter(Boolean).join(" \u00B7 "))
                : (elsewhere ? psEsc(`Playing in ${np.name}`) : "Pick something below")}</div>
            </div>
            ${this._pinBtn()}
          </div>
          ${elsewhere ? `<button class="ps-move" type="button" id="ps-move">
            <svg viewBox="0 0 24 24" class="ps-ico"><path d="M4 12h13M13 7l5 5-5 5"/></svg>
            Move ${psEsc(np.name)} playback here</button>` : ""}
          <div class="ps-transport">
            <button class="ps-tb" type="button" data-mpc="media_previous_track" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Previous">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M18 5v14L8 12zM6 5v14"/></svg></button>
            <button class="ps-tb big" type="button" data-mp="playpause" data-entity="${psEsc(target || "")}" aria-label="Play or pause">
              <svg viewBox="0 0 24 24" class="ps-ico">${playing
                ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
            <button class="ps-tb" type="button" data-mpc="media_next_track" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Next">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 5v14l10-7zM18 5v14"/></svg></button>
            <button class="ps-tb" type="button" data-mpc="media_stop" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Stop">
              <svg viewBox="0 0 24 24" class="ps-ico"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg></button>
          </div>
          ${this._queueHtml()}
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
          ${this._note ? `<div class="ps-toast">${psEsc(this._note)}</div>` : ""}

          <span class="ps-lbl" style="display:block;margin:14px 0 6px">Rooms${
            groupIds.length ? ` \u00B7 ${groupIds.length + 1} grouped` : ""}</span>
          ${rooms}

          <span class="ps-lbl" style="display:block;margin:14px 0 6px">Search</span>
          <div class="ps-sbox">
            <svg viewBox="0 0 24 24" class="ps-ico"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/></svg>
            <input id="ps-q" type="search" placeholder="Tracks, albums, playlists\u2026"
              value="${psEsc(this._query)}" aria-label="Search music" />
            ${this._query ? `<button class="ps-sclear" type="button" id="ps-qclear" aria-label="Clear">
              <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ""}
          </div>
          <div id="ps-res">${this._resultsHtml()}</div>

          ${(sec.presets || []).length ? `<span class="ps-lbl" style="display:block;margin:14px 0 6px">Presets</span>
          <div class="ps-pres">${(sec.presets || []).map((p, i) =>
            `<button class="ps-pr" type="button" data-preset="${i}">
              <ha-icon icon="${psEsc(p.icon || "mdi:playlist-music")}"></ha-icon>
              <span class="ps-trunc">${psEsc(p.name)}</span></button>`).join("")}</div>` : ""}

          ${this._pinsHtml()}

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
  },
});

/* Nursery — sleep derived from the Hatch and the door, not from a wearable.
 *
 * The Owlet sock guessed at sleep state and every consumer of it inherited the
 * guess: a settling stir counted as a wakeup, waking for the day counted as a
 * wakeup, and a three-minute dropout restarted the night. All three were
 * heuristics standing in for a fact nobody could observe.
 *
 * Here the facts are observable. The sound machine is only ever on when sleep
 * is intended — they sit in his room awake, but never with it running — so a
 * `playing` span IS the session, start and end both. The door is who went in.
 *
 * Nothing is persisted. Sessions, durations, start times and intervention
 * counts are all derived from recorder history of two entities, which means a
 * bug in the derivation is fixed by editing this file and the PAST recomputes.
 * That was never true of `input_number.joel_wakeups_last_night`.
 */

/* Local YYYY-MM-DD. Not toISOString(), which is UTC and rolls the day over at
   the wrong moment for anyone west of Greenwich — an 8pm bedtime would file
   itself under tomorrow. */
function psDayKey(d) {
  const p = (n) => (n < 10 ? "0" + n : "" + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function psHM(mins) {
  if (mins == null || !Number.isFinite(mins)) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function psClock(t) {
  if (t == null) return "—";
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/* Derive sessions from the Hatch's playing spans, and interventions from door
   opens that fall inside them.
 *
 * Every threshold here earns its place against observed data:
 *
 *  - merge_gap_min   The Hatch can auto-off or be bumped mid-night. Two spans
 *                    separated by less than this are one night, not two. A
 *                    momentary `unavailable` closes a span too, so this also
 *                    absorbs connectivity blips. **A gap containing a door
 *                    event is never merged**, however short — that is someone
 *                    getting him up, which is a real boundary. Without that,
 *                    a 20-minute nap, twelve minutes awake and the next nap
 *                    fused into one bogus 50-minute session.
 *  - min_session_min Drops a Hatch switched on and straight off again. A run
 *                    that is STILL going is never dropped, however short — that
 *                    is a session in progress, not a stray.
 *  - door_min_sec    Mounting the sensor produced ten transitions in 34
 *                    seconds, five of them under 300ms. A magnet settling is
 *                    not a person; a person holds a door open for seconds.
 *  - door_merge_sec  A bounce guard: two opens within a minute are one physical
 *                    event. It is NOT what stops the in-and-out double count —
 *                    it was given that job and could not do it (see below).
 *  - visit_max_min   Going in and coming out is one visit, and a visit lasts as
 *                    long as you stay. The open that follows a counted entry
 *                    inside this window is that visit's exit, not a new
 *                    intervention. Absorbs exactly one open, never a chain.
 *  - exit_window_min The put-down. Someone has to be IN the room to start the
 *                    Hatch, so the first door-open of a session is almost
 *                    always them leaving — and counting it made every session
 *                    read one intervention high, which is the sock's settling
 *                    stir wearing a different hat. It is not discarded: the
 *                    door closing behind them is the moment he is actually
 *                    alone, so it becomes `settledAt`, and the gap from bedtime
 *                    to it is settling time. Bounded, because a first entry
 *                    three hours in is a real intervention, not an exit.
 *                    The window runs from the LAST visit, not from the session
 *                    start — a put-down is several trips, not one exit.
 *  - settle_max_min  The brake on that chain. Without a ceiling, a visit every
 *                    twenty minutes would make a whole night read as settling.
 */
function psNurserySessions(hatch, door, opts) {
  const o = opts || {};
  const doorMin = (o.door_min_sec == null ? 2 : o.door_min_sec) * 1000;
  const doorMerge = (o.door_merge_sec == null ? 60 : o.door_merge_sec) * 1000;
  /* Going in to GET HIM is not an intervention. The door opens moments before
     the sound machine stops — six seconds, on the 10:58 nap — so an event this
     close to the end is the retrieval: the far more precise cousin of the
     sock's hour-wide wake-for-the-day guess. Finished sessions only; a run
     still going has no end to be near. */
  const retrieval = (o.retrieval_window_min == null ? 5 : o.retrieval_window_min) * 60000;
  const nightAfter = o.night_after_hour == null ? 18 : o.night_after_hour;
  const morning = o.morning_hour == null ? 5 : o.morning_hour;
  const now = o.now == null ? Date.now() : o.now;

  /* Setting a contact sensor up, and switching the sound machine on to see
     what it reports, both look exactly like sleep to this function — the
     commissioning session read as a 40-minute nap with three interventions
     and would have skewed a week of averages. `ignore_before` draws a line
     under that without purging the recorder, which is destructive and takes
     the real data with it. Useful again any time a sensor is re-sited.
     An unparseable value is ignored rather than silently hiding everything. */
  const cut = o.ignore_before == null ? null : (() => {
    const v = typeof o.ignore_before === "number"
      ? o.ignore_before : Date.parse(o.ignore_before);
    return Number.isFinite(v) ? v : null;
  })();

  /* A nap and a night are not the same event at different lengths — they need
     their own numbers. Naps here run as short as twenty minutes, so a single
     45-minute exit window was longer than the whole nap: every door open would
     have been swallowed as the put-down and a short nap could never report an
     intervention at all. One set of thresholds cannot serve both. */
  const NAP = { min_session_min: 8, exit_window_min: 25, merge_gap_min: 5,
    settle_max_min: 30, visit_max_min: 20 };
  const NIGHT = { min_session_min: 20, exit_window_min: 30, merge_gap_min: 20,
    settle_max_min: 60, visit_max_min: 30 };
  const isNight = (t) => {
    const hr = new Date(t).getHours();
    return hr >= nightAfter || hr < morning;
  };
  /* Per-kind config wins, then a flat top-level override, then the default —
     so `nap: {exit_window_min: 4}` tunes one without disturbing the other. */
  const rule = (t, key) => {
    const kind = isNight(t) ? "night" : "nap";
    const scoped = o[kind] || {};
    const base = kind === "night" ? NIGHT : NAP;
    const v = scoped[key] != null ? scoped[key] : (o[key] != null ? o[key] : base[key]);
    return v * 60000;
  };

  /* 1 — door opens first: the merge step needs them */
  const opens = [];
  let dOpen = null;
  (door || []).forEach((p) => {
    if (p.s === "on") {
      if (dOpen == null) dOpen = p.t;
    } else if (dOpen != null) {
      opens.push({ from: dOpen, to: p.t });
      dOpen = null;
    }
  });
  if (dOpen != null) opens.push({ from: dOpen, to: now, held: true });
  const realOpens = opens.filter((op) => op.held || op.to - op.from >= doorMin);

  /* 2 — raw playing spans */
  const spans = [];
  let openAt = null;
  (hatch || []).forEach((p) => {
    if (p.s === "playing") {
      if (openAt == null) openAt = p.t;
    } else if (openAt != null) {
      spans.push({ from: openAt, to: p.t });
      openAt = null;
    }
  });
  if (openAt != null) spans.push({ from: openAt, to: now, active: true });

  /* 3 — merge across short gaps, but NEVER across a door event. Someone going
     in is the boundary: the Hatch stopping on its own with nobody entering is
     one session interrupted, whereas a door open in the gap means he was got
     up. Judging the gap by time alone fused a nap, twelve minutes awake and
     the next nap into one session. */
  const merged = [];
  spans.forEach((s) => {
    const last = merged[merged.length - 1];
    const gap = last ? s.from - last.to : Infinity;
    const entered = last && realOpens.some((op) => op.from >= last.to && op.from <= s.from);
    if (last && gap < rule(s.from, "merge_gap_min") && !entered) {
      last.to = s.to;
      if (s.active) last.active = true;
      last.splits = (last.splits || 1) + 1;
    } else {
      merged.push({ from: s.from, to: s.to, active: s.active, splits: 1 });
    }
  });

  /* 4 — drop strays, never drop a run in progress; then anything before the
     commissioning cut. A session STILL RUNNING is kept regardless — it is
     happening now, whatever the cut says about history. */
  const kept = merged
    .filter((s) => s.active || s.to - s.from >= rule(s.from, "min_session_min"))
    .filter((s) => s.active || cut == null || s.from >= cut);

  /* 5 — attach interventions and classify */
  return kept.map((s) => {
    const exitWindow = rule(s.from, "exit_window_min");
    /* Every door event inside the session that survives the chatter filter,
       before deciding which of them is the exit.
     *
     * An open that STRADDLES the start counts, clamped to it. The door is
     * often already cracked when the sound machine goes on, so that open
     * begins before the session and `from >= s.from` dropped it — and if the
     * parent simply pulls the cracked door shut on the way out, that close is
     * the only settling signal there is. Observed 2026-08-07: the door had
     * been open since before 12:30 and the Hatch started at 14:18:41.
     * The chatter filter still judges the door's REAL duration, not the
     * clamped one, so a straddling open can never look like a flicker. */
    const inside = realOpens
      .filter((op) => op.to > s.from && op.from <= s.to)
      .map((op) => (op.from < s.from ? { from: s.from, to: op.to, held: op.held } : op));

    /* The put-down: everything up to the LAST door event within the window is
     * settling, and its close is when he was left alone.
     *
     * Two earlier rules failed against real settles. "The first door-open is
     * them leaving" banked her ARRIVAL as the exit — the door was already open
     * when the Hatch went on and closed at 10:07:31 with her inside. Then
     * "settling ends at the first close followed by quiet" failed too: she sat
     * with him for fourteen silent minutes, and from door events alone that
     * quiet is indistinguishable from the quiet after she leaves. Only what
     * happens NEXT tells them apart, so no forward-looking gap rule works.
     *
     * The window swallows an intervention that lands inside it, and that is
     * deliberate rather than tolerated: an early intervention means he had not
     * started the nap yet, so it belongs to settling. Settling here typically
     * runs 10-20 minutes, hence the generous default.
     *
     * The window CHAINS off the last visit, it does not run from the session
     * start — a fixed window from bedtime assumes the put-down is one exit, and
     * it is not. On the 2026-08-07 night the Hatch went on at 19:06:19 and the
     * room was visited four times over 33 minutes; measured from the start, the
     * 30-minute window closed at 19:36:19 and the FOURTH visit missed it by two
     * and a half minutes. So the card marked him settled at 19:32 and called
     * the real final exit an intervention — and worse than a miscount, it
     * started `asleepMinutes` while someone was still in the room. Widening the
     * window to 40 would have fixed that night and broken on a 45-minute one;
     * chaining is the shape that scales.
     *
     * The chain runs from the CLOSE of the last visit, not its open: the question is
     * how long the room has been quiet since anyone was last in it.
     *
     * `settle_max_min` is the brake. Chaining alone is unbounded — a visit
     * every twenty minutes all night would make the entire night "settling" and
     * report zero interventions — so total settling is capped regardless of how
     * the chain runs. The nap cap is tight because swallowing thirty minutes of
     * a fifty-minute nap would be worse than the bug it fixes. */
    const settleMax = rule(s.from, "settle_max_min");
    let settledAt = s.from;
    let hadExit = false;
    let i = 0;
    let quietFrom = s.from;
    while (i < inside.length
           && inside[i].from - quietFrom <= exitWindow
           && inside[i].from - s.from <= settleMax) {
      settledAt = Math.min(inside[i].to, s.to);
      quietFrom = settledAt;
      hadExit = true;
      i += 1;
    }

    /* An intervention is a VISIT, and a visit is two door-opens: going in and
     * coming out again. Pairing them is the only way to count one.
     *
     * `door_merge_sec` was doing this job and could not. It merges opens within
     * 60 seconds of each other, which assumes the visit is over almost as soon
     * as it began — so any wake-up where someone actually settles him read as
     * two. Observed 2026-08-07: in at 22:05:13, out at 22:17:22, **12 minutes**
     * apart, counted twice. A visit is bounded by how long you STAY, not by how
     * fast you come back.
     *
     * So the first open is the entry and is counted; the next open within
     * `visit_max_min` is that visit's exit and is absorbed. It absorbs exactly
     * ONE open, never a chain — that is what keeps it from swallowing a whole
     * night the way an unbounded rule would, and it is the same asymmetry the
     * settle chain needed a cap for.
     *
     * The failure mode is now an UNDERCOUNT — a genuine second wake-up inside
     * the window reads as the first visit's exit. That is the better error:
     * visits longer than a minute are the norm, two wake-ups inside half an
     * hour are not. `door_merge_sec` stays as the bounce guard it always was.
     */
    const visitMax = rule(s.from, "visit_max_min");
    const events = [];
    let lastOp = hadExit ? inside[i - 1].from : -Infinity;
    let entryAt = null;   /* set while someone is in the room */
    inside.slice(i).forEach((op) => {
      if (op.from - lastOp < doorMerge) return;
      if (!s.active && s.to - op.from <= retrieval) return;   /* picking him up */
      lastOp = op.from;
      if (entryAt != null && op.from - entryAt <= visitMax) { entryAt = null; return; }
      entryAt = op.from;
      events.push(op.from);
    });

    const started = new Date(s.from);
    const hr = started.getHours();
    const night = hr >= nightAfter || hr < morning;
    /* A night that began after midnight belongs to the evening it started
       from, or "last night" would point at the wrong date all morning. */
    const anchor = new Date(s.from);
    if (night && hr < morning) anchor.setDate(anchor.getDate() - 1);

    return {
      from: s.from,
      to: s.to,
      active: !!s.active,
      splits: s.splits || 1,
      minutes: Math.max(0, Math.round((s.to - s.from) / 60000)),
      night,
      day: psDayKey(anchor),
      interventions: events.length,
      events,
      /* Three different quantities, kept apart because they answer different
         questions and only one of them is "how long did he sleep":
           minutes       the whole Hatch span — time in the sleep environment
           settleMinutes Hatch-on to the door shutting behind them
           asleepMinutes from being left alone to the end
         settledAt is when they LEFT, which is not exactly when he dropped off
         — he may well have gone under while they were still in the room — so
         asleepMinutes is a lower bound and minutes an upper one. The card
         shows the lower bound and names the settling beside it rather than
         quietly folding an ambiguous quarter of an hour into "slept". */
      settledAt,
      settleMinutes: Math.max(0, Math.round((settledAt - s.from) / 60000)),
      asleepMinutes: Math.max(0, Math.round((s.to - settledAt) / 60000)),
      hadExit,
      /* The longest run nobody had to go in. For a night this is the number
         that says whether anyone else slept, and it is not derivable from the
         count — three wake-ups spread evenly is a very different night from
         three in the last hour. */
      longestStretch: (() => {
        const marks = [settledAt, ...events, s.to];
        let best = 0;
        for (let k = 1; k < marks.length; k += 1) {
          best = Math.max(best, marks[k] - marks[k - 1]);
        }
        return Math.max(0, Math.round(best / 60000));
      })(),
    };
  });
}

/* Cross-session numbers: the ones worth having whether or not this card is
   what displays them.
 *
 *   wakeWindow      how long he has been up. For a baby this is what predicts
 *                   the next nap, and it is the difference between reporting
 *                   history and saying what happens next.
 *   longestStretch  per session above — surfaced here as the night's headline.
 *   bedtimeSpread   how consistent bedtime is across the window, as a ± in
 *                   minutes. Consistency is the thing sleep advice is actually
 *                   about, and a mean alone hides it.
 *
 * Bedtimes are shifted past midnight before averaging: a 00:20 bedtime is a
 * late night, not an early one, and treating it as minute 20 would drag the
 * mean back by eleven hours and report a wild spread on a settled week. */
function psNurseryStats(sessions, opts) {
  const o = opts || {};
  const now = o.now == null ? Date.now() : o.now;
  const all = sessions || [];

  const nights = all.filter((s) => s.night && !s.active).slice(-(o.days || 7));
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const avgNightMin = nights.length ? Math.round(mean(nights.map((s) => s.asleepMinutes))) : null;
  const avgIns = nights.length ? mean(nights.map((s) => s.interventions)) : null;
  const avgStretch = nights.length ? Math.round(mean(nights.map((s) => s.longestStretch))) : null;

  const beds = nights.map((s) => {
    const d = new Date(s.from);
    const m = d.getHours() * 60 + d.getMinutes();
    return m < 720 ? m + 1440 : m;      /* after midnight is late, not early */
  });
  const bedMean = beds.length ? Math.round(mean(beds)) % 1440 : null;
  const bedSpread = beds.length > 1
    ? Math.round(Math.sqrt(mean(beds.map((b) => (b - mean(beds)) ** 2))))
    : null;

  /* Awake since the last session ended — null while he is actually asleep,
     because "awake 0m" during a nap is a lie rather than a zero. */
  const live = all.find((s) => s.active);
  const ended = all.filter((s) => !s.active);
  const last = ended.length ? ended[ended.length - 1] : null;
  const wakeSince = live || !last ? null : last.to;
  const wakeWindowMin = wakeSince == null ? null : Math.max(0, Math.round((now - wakeSince) / 60000));

  return {
    nights: nights.length,
    avgNightMin, avgIns, avgStretch,
    bedMean, bedSpread,
    wakeSince, wakeWindowMin,
  };
}

Object.assign(PurdyShellCard.prototype, {

  /* A longer window than the shared 26h fetch, because this section is about
     comparing days. Kept as its own request rather than widening the shared
     one: the graphs and room sparklines have no use for a week of data, and
     two entities over seven days is a far smaller query than nine over one. */
  _nurserySection() {
    return (this._config.sections || []).find((s) => s.type === "nursery");
  },

  _startNursery() {
    const sec = this._nurserySection();
    if (!sec) return;
    const run = () => this._fetchNursery();
    run();
    if (this._nurseryTimer) clearInterval(this._nurseryTimer);
    this._nurseryTimer = setInterval(run, (this._config.history_refresh_minutes || 5) * 60 * 1000);
  },

  async _fetchNursery() {
    const sec = this._nurserySection();
    if (!sec || !this._hass || !this._hass.callApi) return;
    const ids = [sec.hatch, sec.door].filter(Boolean);
    if (!ids.length) return;
    const days = sec.days || 7;
    const start = new Date(Date.now() - days * 86400000).toISOString();
    try {
      const res = await this._hass.callApi(
        "GET",
        /* end_time is NOT optional. Without it the recorder defaults to
           start + 1 DAY, so a seven-day window would quietly stop six days
           ago and the newest sample would stretch to the right-hand edge.
           See pcNowIso() in 05-shared.js. */
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
      this._nursery = hist;
      this._nurseryErr = null;
      this._last = null;
      this._render();
    } catch (e) {
      this._nurseryErr = (e && e.message) || "recorder did not answer";
      this._last = null;
      this._render();
    }
  },

  /* One clock for the whole render path. Every nap fixture in the suite was
     anchored to `Date.now() - 3h`, which is a NAP in the afternoon and a NIGHT
     after nine — so six tests passed all day and failed every evening, and the
     suite could not be trusted at exactly the hour the nursery card matters
     most. An explicit seam is the fix; the fixtures set `_testNow`. */
  _nowMs() { return this._testNow == null ? Date.now() : this._testNow; },

  _nurserySessions(sec) {
    const h = this._nursery || {};
    return psNurserySessions(h[sec.hatch], h[sec.door],
      Object.assign({}, sec, { now: this._nowMs() }));
  },

  /* The night, scrubbable.
   *
   * The sock card drew sleep stages; there are none here, so this draws the
   * shape of the night — settling at the head, the sleep itself, and a tick
   * wherever someone went in. Dragging it names the time under your finger,
   * which is the whole point: "what time was that 2am wake-up" becomes a swipe
   * rather than a memory test.
   *
   * It rides the shell's existing scrub (data-scrub / .ps-cross / data-readout),
   * so it inherits the parts that were hard to get right: a ~340ms press before
   * touch is claimed, so a vertical swipe still scrolls the page, and a readout
   * written straight to the DOM instead of through a repaint.
   *
   * Deliberately NOT folded into `_hypnoSvg`. Same size, both bars on a time
   * axis — but that one samples a state series and this one plots intervals
   * with point events over them. Merging would mean picking one model and
   * changing how the other view reads.
   */
  _nurseryRail(night, loaded, err) {
    if (!loaded || err || !night) {
      const msg = err ? "Recorder did not answer"
        : !loaded ? "Loading…" : "No night recorded yet";
      return `<div class="ps-hyp">
          <div class="ps-hypt"><span class="ps-lbl">Night</span></div>
          <div class="ps-nohist">${psEsc(msg)}</div>
        </div>`;
    }

    const PAD = 3;
    const from = night.from;
    const to = night.to;
    const span = Math.max(60000, to - from);
    const x = (t) => PAD + ((t - from) / span) * (100 - PAD * 2);
    this._nightData = { from, to, settledAt: night.settledAt, events: night.events };

    const sx = x(night.settledAt);
    let bars = `<rect x="${PAD}" y="14" width="${Math.max(0.4, sx - PAD).toFixed(2)}"
        height="18" rx="2" fill="var(--ps-light)" opacity="0.5"/>
      <rect x="${sx.toFixed(2)}" y="10" width="${Math.max(0.4, (100 - PAD) - sx).toFixed(2)}"
        height="26" rx="2" fill="var(--ps-deep)" opacity="${night.active ? 0.95 : 0.8}"/>`;

    let ticks = "";
    night.events.forEach((t) => {
      ticks += `<rect x="${(x(t) - 0.32).toFixed(2)}" y="5" width="0.64" height="36"
        rx="0.3" fill="var(--ps-warn)"/>`;
    });

    let grid = "";
    const hours = span / 3600000;
    const step = hours > 8 ? 2 : 1;
    for (let h = step; h < hours; h += step) {
      const gx = x(from + h * 3600000);
      grid += `<line x1="${gx.toFixed(2)}" y1="4" x2="${gx.toFixed(2)}" y2="42"
        stroke="var(--ps-edge)" stroke-width="0.25"/>`;
    }

    const fmt = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    /* Labelled at the hours the gridlines actually fall on, with the true ends
       either side — evenly spacing three captions across a rail whose axis is
       not evenly divided points every one of them at the wrong time. */
    const marks = [fmt(from)];
    for (let hh = step; hh < hours; hh += step) {
      const at = new Date(from + hh * 3600000);
      marks.push(at.toLocaleTimeString([], { hour: "numeric" }));
    }
    marks.push(night.active ? "now" : fmt(to));
    const hourLabels = marks.map((m) => `<span>${psEsc(m)}</span>`).join("");
    return `<div class="ps-hyp">
        <div class="ps-hypt" data-readout="night">
          <span class="ps-lbl">${night.active ? "Tonight" : "Last night"}</span>
          <span><i style="background:var(--ps-light);opacity:.5"></i>settling<i style="background:var(--ps-deep);margin-left:9px"></i>asleep</span>
          <b>${night.interventions} in</b>
        </div>
        <div class="ps-railbox">
          <div class="ps-hypplot" data-scrub="night">
            <svg viewBox="0 0 100 46" preserveAspectRatio="none" aria-hidden="true">
              ${grid}${bars}${ticks}
            </svg>
            <div class="ps-cross" hidden></div>
          </div>
          <div class="ps-railticks">${hourLabels}</div>
        </div>
      </div>`;
  },

  /* Today at a glance: the tail of last night, each nap where it fell, now,
     and tonight's expected bedtime as a ghost. Answers "are we on schedule"
     without a single number. */
  _nurseryDayRail(sessions, todayKey, bedMean) {
    /* 6am to 10pm, not midnight to midnight: a whole-day axis spends a third
       of its width on hours nothing ever happens in, which squeezes the naps
       into slivers. The tail of last night and the head of tonight still land
       inside it. */
    const day = new Date(); day.setHours(0, 0, 0, 0);
    const t0 = day.getTime() + 6 * 3600000;
    const t1 = day.getTime() + 22 * 3600000;
    const x = (t) => Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100));

    let bars = "";
    (sessions || []).forEach((s) => {
      if (s.to < t0 || s.from > t1) return;
      const a = x(s.from);
      const b = x(s.to);
      const short = !s.night && s.asleepMinutes < 30;
      bars += `<rect x="${a.toFixed(2)}" y="6" width="${Math.max(0.5, b - a).toFixed(2)}"
        height="6" rx="2" fill="${s.night ? "var(--ps-deep)" : short ? "var(--ps-warn)" : "var(--ps-light)"}"
        opacity="${s.night ? 0.75 : 1}"/>`;
    });

    const ghost = bedMean == null ? "" : (() => {
      const gx = (bedMean / 1440) * 100;
      return `<rect x="${gx.toFixed(2)}" y="3.5" width="6" height="11" rx="1.6" fill="none"
        stroke="var(--ps-deep)" stroke-width="0.6" stroke-dasharray="1.6 1.4"/>`;
    })();

    const nx = x(this._nowMs());
    return `<div class="ps-hyp">
        <div class="ps-hypt"><span class="ps-lbl">Today</span></div>
        <div class="ps-railbox">
          <svg viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true"
            style="width:100%;height:18px;display:block">
            <rect x="0" y="6" width="100" height="6" rx="2" fill="rgba(255,255,255,.05)"/>
            ${bars}${ghost}
            <line x1="${nx.toFixed(2)}" y1="1.5" x2="${nx.toFixed(2)}" y2="16.5"
              stroke="var(--ps-text)" stroke-width="0.8"/>
          </svg>
          <div class="ps-railticks">
            <span>6 AM</span><span>10</span><span>2 PM</span><span>6</span><span>10 PM</span>
          </div>
        </div>
      </div>`;
  },

  _secNursery(sec) {
    const h = this._hass;
    const playing = pcState(h, sec.hatch) === "playing";
    const doorOpen = pcState(h, sec.door) === "on";

    const loaded = !!this._nursery;
    const err = this._nurseryErr;
    const sessions = loaded ? this._nurserySessions(sec) : [];
    const stats = psNurseryStats(sessions, { now: this._nowMs(), days: sec.days || 7 });

    const live = sessions.find((s) => s.active);
    const past = sessions.filter((s) => !s.active);
    const lastNight = [...past].reverse().find((s) => s.night) || null;
    const nightSession = live && live.night ? live : lastNight;

    const todayKey = psDayKey(new Date(this._nowMs()));
    const todayNaps = sessions.filter((s) => !s.night && s.day === todayKey);
    const napMins = todayNaps.reduce((a, s) => a + s.asleepMinutes, 0);
    const catnapUnder = sec.catnap_under_min == null ? 30 : sec.catnap_under_min;
    const napTarget = (sec.nap_target_min == null ? 60 : sec.nap_target_min) * 1;

    const wifiOk = !sec.hatch_wifi || pcState(h, sec.hatch_wifi) === "on";
    const clock = (m) => (m == null ? "—"
      : `${((Math.floor(m / 60) % 12) || 12)}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`);

    /* Chip - what is true right now, never what the history says.
     *
     * The door deliberately does NOT appear here. It is opened several times a
     * day for reasons nobody is tracking, and while it was a chip state it
     * displaced the one number that matters when he is up: how long he has
     * been awake and since when. That is what decides whether the next nap is
     * due, so that is what the chip carries. */
    let chipCls = "";
    let chipTxt = "Awake";
    if (playing && live) {
      chipCls = live.hadExit ? "deep" : "lt";
      chipTxt = live.hadExit ? `Asleep ${psHM(live.asleepMinutes)}` : `Settling ${psHM(live.minutes)}`;
    } else if (playing) {
      chipCls = "deep"; chipTxt = "Asleep";
    } else if (stats.wakeWindowMin != null) {
      chipTxt = `Awake ${psHM(stats.wakeWindowMin)} · since ${psClock(stats.wakeSince)}`;
    }

    /* The horseshoe is scaled to HIS OWN seven-day average, not a made-up
       twelve hours: the marker sits at his normal and the reading is
       above/below it, which keeps meaning as he grows. The 1.25 headroom is so
       a better-than-usual night has somewhere to go. */
    const avg = stats.avgNightMin;
    const maxMins = avg ? Math.round(avg * 1.25) : ((sec.ring || {}).max_hours || 12) * 60;
    const nightMins = nightSession ? nightSession.asleepMinutes : 0;
    /* A night that has not happened and a night of no sleep are different
       facts. The ring read "0m LAST NIGHT" on a day with no recorded night at
       all — the exact shape the sock taught us to avoid. */
    const nightNoData = !loaded || !nightSession;
    const noData = !loaded || (!nightSession && !todayNaps.length);
    const ring = this._ringSvg(120, 9,
      [[nightMins / maxMins, "var(--ps-deep)"]],
      avg ? Math.min(1, avg / maxMins) : null);

    /* Nap rings. No slot is drawn for a nap that has not happened — two short
       naps make a third possible, but only going down a third time makes it
       real, and the card has no business claiming more than it can see. */
    /* 52px was sized against "36m". An hour-crossing nap reads "1h19m" and
       needs the room; there is width for three at 58 in the row beside the
       night ring, so only a fourth nap forces the smaller ring. */
    const ringPx = todayNaps.length > 3 ? 46 : 58;
    const stroke = todayNaps.length > 3 ? 4.5 : 5.5;
    const napRings = todayNaps.map((s) => {
      const short = !s.active && s.asleepMinutes < catnapUnder;
      const col = short ? "var(--ps-warn)" : "var(--ps-light)";
      const sub = s.active ? "now" : psClock(s.from);
      const subCol = s.active ? "var(--ps-light)" : short ? "var(--ps-warn)" : "var(--ps-dim)";
      const val = psHM(s.asleepMinutes).replace(" ", "");
      const fit = val.length >= 5 ? " sm5" : val.length === 4 ? " sm4" : "";
      return `<div class="ps-napr">
          <div class="ps-ring" style="width:${ringPx}px;height:${ringPx}px" data-info="${psEsc(sec.hatch)}">
            ${this._ringSvg(ringPx, stroke, [[s.asleepMinutes / napTarget, col]], null)}
            <div class="ps-rv sm${fit}"><b>${psEsc(val)}</b></div>
          </div>
          <span style="color:${subCol}">${psEsc(sub)}</span>
        </div>`;
    }).join("");

    /* One line of live status, and nothing else. Predicted bedtime comes from
       his own average rather than a configured time. */
    /* The chip carries awake-and-since now, so this line must not repeat it. */
    const statusL = live ? `Down ${psClock(live.from)}` : "";
    const statusR = live
      ? (live.hadExit ? `settled ${psClock(live.settledAt)}` : "settling…")
      : (stats.bedMean != null ? `bedtime ~${clock(stats.bedMean)}` : "");

    return `
      ${this._head(sec, `<span class="ps-chip ${chipCls}"><span class="ps-dot"></span>${psEsc(chipTxt)}</span>`)}
      <div class="ps-jtop">
        <div class="ps-ring" style="width:120px;height:120px" data-info="${psEsc(sec.hatch)}">
          ${ring}
          <div class="ps-rv">${nightNoData
            ? `<b class="ps-nodata">—</b><small>${loaded ? "NO NIGHT YET" : "LOADING"}</small>`
            : `<b>${psHM(nightMins)}</b><small>${nightSession.active ? "TONIGHT" : "LAST NIGHT"}</small>`}</div>
        </div>
        <div class="ps-grow">
          <span class="ps-lbl">Naps${napMins ? ` · ${psHM(napMins)}` : ""}</span>
          <div class="ps-naps">${napRings || `<span class="ps-flat" style="font-size:var(--pc-fs-xs)">${
            noData ? (err ? "recorder unavailable" : loaded ? "none yet" : "loading…") : "none yet"}</span>`}</div>
        </div>
      </div>
      ${noData ? "" : `<div class="ps-jstat">
        <span>${psEsc(statusL)}</span>
        <span>${psEsc(statusR)}</span>
      </div>`}
      ${wifiOk ? "" : `<div class="ps-chips"><span class="ps-chip bad">Hatch offline</span></div>`}

      <div class="ps-xtra">
        ${this._nurseryRail(nightSession, loaded, err)}
        ${nightSession ? `
        <div class="ps-jrs">
          <div class="ps-jr"><span class="ps-l">Asleep</span>
            <span class="ps-v">${psHM(nightSession.asleepMinutes)}</span>
            <span class="${avg == null ? "ps-flat" : nightSession.asleepMinutes >= avg ? "ps-good" : "ps-warnc"}">${
              avg == null ? "" : psHM(avg) + " avg"}</span></div>
          <div class="ps-jr"><span class="ps-l">Longest stretch</span>
            <span class="ps-v">${psHM(nightSession.longestStretch)}</span>
            <span class="ps-flat">${stats.avgStretch == null ? "" : psHM(stats.avgStretch) + " avg"}</span></div>
          <div class="ps-jr"><span class="ps-l">Down / up</span>
            <span class="ps-v">${psClock(nightSession.from)} – ${
              nightSession.active ? "now" : psClock(nightSession.to)}</span>
            <span class="ps-flat">${stats.bedSpread == null ? "" : "±" + stats.bedSpread + "m"}</span></div>
          <div class="ps-jr"><span class="ps-l">Settled</span>
            <span class="ps-v">${nightSession.hadExit ? psClock(nightSession.settledAt) : "—"}</span>
            <span class="ps-flat">${nightSession.hadExit ? psHM(nightSession.settleMinutes) : "nobody went in"}</span></div>
          ${nightSession.events.length ? `<div class="ps-jr"><span class="ps-l">Went in at</span>
            <span class="ps-v">${nightSession.events.map((t) => psClock(t)).join(", ")}</span></div>` : ""}
        </div>` : ""}

        ${this._nurseryDayRail(sessions, todayKey, stats.bedMean)}
        <div class="ps-jrs">
          ${todayNaps.length ? todayNaps.map((s) => `
            <div class="ps-jr"><span class="ps-l">${psClock(s.from)} – ${s.active ? "now" : psClock(s.to)}</span>
              <span class="ps-v">${psHM(s.asleepMinutes)}${s.active ? " so far" : ""}</span>
              <span class="${!s.active && s.asleepMinutes < catnapUnder ? "ps-warnc" : "ps-flat"}">${
                !s.active && s.asleepMinutes < catnapUnder ? "short" : s.interventions ? s.interventions + " in" : ""}</span></div>`).join("")
            : `<div class="ps-jr"><span class="ps-l">No naps yet today</span></div>`}
          ${stats.wakeWindowMin == null ? "" : `<div class="ps-jr"><span class="ps-l">Awake for</span>
            <span class="ps-v">${psHM(stats.wakeWindowMin)}</span>
            <span class="ps-flat">since ${psClock(stats.wakeSince)}</span></div>`}
        </div>
      </div>`;
  },
});
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

/* Where the warmth knob sits, as one expression. The renderer and the live
   drag painter both read it, for the same reason _lightPaint is shared: two
   code paths drawing the same control would drift. */
const plWarmPct = (k, min, max) =>
  Math.max(0, Math.min(100, (k - min) / ((max - min) || 1) * 100));

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
      kelvin: this._optK(cfg.entity, a.color_temp_kelvin == null ? null : a.color_temp_kelvin),
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

  /* The optimistic colour temperature, on the same contract. The tolerance is
     wider than brightness's because a bulb quantises kelvin to mired steps and
     never echoes back the exact number asked for — at the blue end one step is
     already ~43K, so an exact-match test would keep the optimistic value up
     until it expired and then snap. */
  _optK(id, real) {
    const o = (this._kOpt || {})[id];
    if (!o) return real;
    if (Date.now() > o.until) { delete this._kOpt[id]; return real; }
    if (real != null && Math.abs(real - o.value) <= 75) { delete this._kOpt[id]; return real; }
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

  /* Paint the warmth track at a value, in place — the knob, the readout and
     the row's own hue, since hue IS the colour temperature the fixture
     reports. Exactly the rule the brightness drag already follows: a drag
     cannot go through _render(). It could not even try here, because
     pointerdown sets _dragging, so _render() was a no-op for the whole
     gesture and NOTHING moved — the knob sat still while the service calls
     went out. That is the "the slider does not slide" report. */
  _paintWarm(el, id, k) {
    const knob = el.querySelector(".pl-g");
    if (knob) knob.style.left = plWarmPct(k, +el.dataset.lmin, +el.dataset.lmax).toFixed(1) + "%";
    const row = el.closest(".pl-row");
    const em = row && row.querySelector(".pl-warmrow em");
    if (em) em.textContent = k + "K";
    const cfg = this._lightCfg(id);
    if (row && cfg) {
      const l = this._lightOf(cfg);          /* reads the optimistic kelvin */
      if (l.on) this._paintLight(row, id, l.bri);
    }
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
      warm = `<div class="pl-warmrow">
          <div class="pl-warm" data-lwarm="${psEsc(l.id)}" data-lmin="${l.minK}" data-lmax="${l.maxK}">
            <span class="pl-g" style="left:${plWarmPct(k, l.minK, l.maxK).toFixed(1)}%"></span>
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

  /* Same contract as _lightSetBri, and for the same reason: this fired a
     service call on EVERY pointermove — dozens a second at one bulb, which is
     how a warmth drag ended up queued behind its own traffic. Optimistic
     value is recorded synchronously so the knob and the row hue can be
     painted from it now; only the call is throttled. */
  _lightSetKelvin(id, k) {
    if (!this._kOpt) this._kOpt = {};
    this._kOpt[id] = { value: k, until: Date.now() + 12000 };
    if (!this._kSend) this._kSend = {};
    const s = this._kSend[id] || (this._kSend[id] = {});
    s.value = k;
    const gap = 150;
    const fire = () => {
      s.timer = null;
      s.last = Date.now();
      if (this._hass) {
        this._hass.callService("light", "turn_on",
          { entity_id: id, color_temp_kelvin: s.value });
      }
    };
    const since = s.last ? Date.now() - s.last : Infinity;
    if (since >= gap) { fire(); return; }
    if (!s.timer) s.timer = setTimeout(fire, gap - since);
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
        /* The whole expanded panel is a no-toggle zone, not just its controls.
           A tap that misses a lamp chip by a few pixels must do NOTHING —
           landing on the row behind it toggles the entire group, which is how
           "I tapped one lamp and they all went off" happened. Missing a
           control should never be the same as pressing a bigger one. */
        if (e.target.closest("[data-lkid],[data-lask],[data-lwarm],.pl-more")) return;
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
        const id = el.dataset.lwarm;
        const k = Math.round(min + p * (max - min));
        this._lightSetKelvin(id, k);   /* records the optimistic value now */
        this._paintWarm(el, id, k);    /* ...which this then draws from */
      };
      let warming = false;
      const mv = (e) => { if (warming) set(e); };
      const stop = () => {
        warming = false; this._dragging = false;
        this.shadowRoot.removeEventListener("pointermove", mv);
        this.shadowRoot.removeEventListener("pointerup", up);
        ["pointercancel", "lostpointercapture"].forEach((ev) =>
          this.shadowRoot.removeEventListener(ev, cancel));
      };
      const up = () => { stop(); this._render(); };
      /* A gesture that ends any way OTHER than a clean pointerup left
         _dragging stuck true, and _render() is gated on it — so the card
         stopped repainting for good. The brightness read frozen and a tap on
         the row toggled a light that never appeared to move. That is the
         second half of the report, and it is the same hazard the volume
         sliders carry a pointercancel guard for. */
      const cancel = () => { stop(); this._render(); };
      el.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        if (warming) stop();          /* never stack a second gesture's listeners */
        warming = true; this._dragging = true;
        this.shadowRoot.addEventListener("pointermove", mv);
        this.shadowRoot.addEventListener("pointerup", up);
        ["pointercancel", "lostpointercapture"].forEach((ev) =>
          this.shadowRoot.addEventListener(ev, cancel));
        set(e);
      });
    });
  },

  _lightCfg(id) {
    const sec = (this._config.sections || []).find((s) => s.type === "lights");
    return sec && (sec.lights || []).find((c) => c.entity === id);
  },
});
/* ============================================================================
 * purdy-shell-card — systems mode
 *
 * The Systems section was doing the job of a whole app inside one band on the
 * landing page. This is that app: five pages behind their own dock, with Home
 * on the far left.
 *
 * A MODE, not a view. Lovelace would happily hold a second view, but leaving
 * this one and coming back re-runs the landing page's whole first-render path,
 * and hash-driven Bubble pop-ups leak across views. A mode is a state flip on
 * the element that is already mounted: same gradient, same dock measurement,
 * same sheet slot, and the back button is ours.
 *
 * A mode, not a section, for a second reason: `sections:` is rendered in config
 * order into one scrolling column, and these pages are alternatives to each
 * other rather than neighbours.
 *
 * THE LISTS ARE DISCOVERED, NOT CONFIGURED. Containers, disks and shares come
 * out of `hass.states` by prefix. The hand-typed version of this had five
 * Docker groups naming eleven containers, and THREE of those entity ids did
 * not exist (`switch.purdynas_container_lancache`, `_lancache_dns`,
 * `_lancache_prefill`) — they had rendered as permanently-off toggles that did
 * nothing, for however long. A list that is derived cannot drift from the
 * server; a list that is typed always eventually has.
 * ========================================================================== */

/* Discovery scans every entity id, so it must not run on each state change —
   see _expandWatched, which runs it on first hass and on entering the mode. */
function psDiscover(hass, re) {
  if (!hass || !hass.states) return [];
  const out = [];
  Object.keys(hass.states).forEach((id) => {
    const m = re.exec(id);
    if (m) out.push({ id, key: m[1] });
  });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/* "2026-03-01T15:17:52+00:00" → "1 Mar". A parity check is months apart, so
   the year is noise and the time of day is not the fact being reported. */
function psShortDate(v) {
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
}

/* Every disk publishes its temperature as an ATTRIBUTE on its health sensor
   ("37.0 °C"), and only one of them also has a dedicated temperature entity —
   which HA has unit-converted to °F. Reading only the entity gave one disk a
   temperature and the rest none; reading only the attribute puts °C in a card
   where every other temperature is °F. So: parse both, and convert to whatever
   unit the dedicated sensors use, so the column is one unit or no unit. */
function psTempAttr(st) {
  const raw = st && st.attributes && st.attributes.temperature;
  if (!raw) return null;
  const m = /(-?[\d.]+)\s*°?\s*([CF])/i.exec(String(raw));
  if (!m) return null;
  return { v: parseFloat(m[1]), u: m[2].toUpperCase() };
}

function psConvTemp(t, to) {
  if (!t || !to || t.u === to) return t ? t.v : null;
  return to === "F" ? t.v * 9 / 5 + 32 : (t.v - 32) * 5 / 9;
}

/* Bytes-ish text straight off the integration ("7.3 TB") is already formatted,
   so this only exists for the numbers we compute ourselves. */
function psPct(v) {
  return v == null ? "—" : v.toFixed(1) + "%";
}

/* A sensor that is not reporting and a sensor reporting zero are different
   facts, and `pcNum(...) ?? 0` is the shape that hides it — the same mistake
   the sleep ring made. Every figure on these pages goes through one of these
   two rather than defaulting. */
function psFig(v, digits, unit) {
  if (v == null) return "\u2014";
  return `${v.toFixed(digits)}${unit ? `<small>${unit}</small>` : ""}`;
}

function psCount(v) {
  return v == null ? "\u2014" : String(v);
}

Object.assign(PurdyShellCard.prototype, {

  _sysCfg() {
    return this._config && this._config.server ? this._config.server : null;
  },

  /* A page whose config is absent is not drawn and gets no dock slot, so a
     partial `server:` block degrades to fewer pages rather than to empty ones. */
  _sysPages() {
    const s = this._sysCfg();
    if (!s) return [];
    const out = [{ key: "overview", name: "Overview", icon: "mdi:view-dashboard-outline" }];
    if (s.docker) out.push({ key: "docker", name: "Docker", icon: "mdi:docker" });
    if (s.storage) out.push({ key: "storage", name: "Storage", icon: "mdi:harddisk" });
    if (s.perf) out.push({ key: "perf", name: "Perf", icon: "mdi:speedometer" });
    if (s.notifications) out.push({ key: "alerts", name: "Alerts", icon: "mdi:bell-outline" });
    return out;
  },

  _sysPage() {
    const pages = this._sysPages();
    if (!pages.length) return null;
    return pages.find((p) => p.key === this._page) || pages[0];
  },

  /* ---------------------------------------------------------------- read --*/

  /* What a knob should READ as, which is not what HA says yet: starting a
     container takes seconds, and a toggle that stays put for three of them
     reads as a tap that missed. Same contract as _optGoal — the optimistic
     value yields the moment the real state agrees and expires after 12s, so a
     call that never lands shows the truth rather than a lie that looks fine. */
  _optSw(id, real) {
    const o = (this._swOpt || {})[id];
    if (!o) return real;
    if (Date.now() > o.until || o.value === real) {
      delete this._swOpt[id];
      return real;
    }
    return o.value;
  },

  _syToggle(id) {
    const real = pcState(this._hass, id);
    const next = real === "on" ? "off" : "on";
    if (!this._swOpt) this._swOpt = {};
    this._swOpt[id] = { value: next, until: Date.now() + 12000 };
    this._hass.callService("switch", next === "on" ? "turn_on" : "turn_off", { entity_id: id });
    this._render();
  },

  _syContainers() {
    const s = this._sysCfg();
    const d = (s && s.docker) || {};
    const pre = d.containers_prefix || `switch.${s.prefix || "server"}_container_`;
    const names = d.names || {};
    return psDiscover(this._hass, new RegExp(`^${pre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(.+)$`))
      .map((c) => {
        const st = this._hass.states[c.id];
        const over = names[c.key] || {};
        /* The friendly name is "PurdyNAS Container binhex-jellyfin" — the last
           segment is the container's real name, which is what to show. */
        const fn = (st && st.attributes.friendly_name) || c.key;
        const auto = fn.indexOf(" Container ") > 0 ? fn.split(" Container ").pop() : c.key;
        const ports = (st && st.attributes.container_ports) || [];
        const port = ports.length && ports[0].public_port ? ":" + ports[0].public_port : "";
        return {
          id: c.id,
          key: c.key,
          name: over.name || auto,
          icon: over.icon || "mdi:cube-outline",
          /* The switch already carries where the thing lives. Typing the URL
             into config is how it goes stale when a port changes. */
          url: over.url || (st && st.attributes.dashboard_url) || "",
          image: (st && st.attributes.container_image) || "",
          port,
          on: this._optSw(c.id, pcState(this._hass, c.id)) === "on",
          /* The agent publishes a restart button per container, keyed the same
             way the switch is — so it costs nothing to offer and saves a
             stop-wait-start round trip on a wedged container. */
          restart: this._hass.states[`${d.restart_prefix || ""}${c.key}`] && d.restart_prefix
            ? `${d.restart_prefix}${c.key}` : "",
        };
      });
  },

  _syVms() {
    const d = ((this._sysCfg() || {}).docker) || {};
    return (d.vms || []).map((id) => {
      const st = this._hass.states[id];
      const fn = (st && st.attributes.friendly_name) || id;
      return {
        id,
        name: fn.indexOf(" VM ") > 0 ? fn.split(" VM ").pop() : fn,
        on: this._optSw(id, pcState(this._hass, id)) === "on",
      };
    });
  },

  _syDisks() {
    const s = this._sysCfg();
    const st = (s && s.storage) || {};
    const pre = st.disks_prefix || `sensor.${s.prefix || "server"}_disk_`;
    const esc = pre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const h = this._hass;
    /* Health is the anchor rather than usage: a slot with no disk in it
       publishes a health of DISK_NP_DSBL and no usage at all, and it has to be
       drawn as absent rather than silently dropped or shown as 0%. */
    return psDiscover(h, new RegExp(`^${esc}(.+)_health$`)).map((d) => {
      const usage = h.states[`${pre}${d.key}_usage`];
      const temp = h.states[`${pre}${d.key}_temperature`];
      const health = pcState(h, d.id);
      const u = usage ? parseFloat(usage.state) : null;
      return {
        key: d.key,
        health,
        healthId: d.id,
        usageId: `${pre}${d.key}_usage`,
        /* Three different states, and only one of them is "fine".
           DISK_NP_DSBL is "no disk present" — an empty bar would claim a
           healthy empty drive, and there is no drive. But a PARITY disk is
           installed and publishes no usage sensor at all, so "no usage" is
           not the same as "no disk": folding them made the working parity
           drive read as an empty slot. */
        present: health !== "DISK_NP_DSBL",
        hasUsage: !!usage,
        usage: Number.isFinite(u) ? u : null,
        used: usage ? usage.attributes.used_size : null,
        total: usage ? usage.attributes.total_size : null,
        role: usage ? usage.attributes.role : null,
        /* The dedicated entity where there is one (HA has converted it to the
           user's unit); the health sensor's own attribute otherwise. */
        temp: temp ? parseFloat(temp.state) : null,
        tempUnit: temp ? String(temp.attributes.unit_of_measurement || "").replace("°", "") : null,
        tempAttr: psTempAttr(h.states[d.id]),
      };
    });
  },

  _syShares() {
    const s = this._sysCfg();
    const st = (s && s.storage) || {};
    const pre = st.shares_prefix;
    if (!pre) return [];
    const esc = pre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const h = this._hass;
    return psDiscover(h, new RegExp(`^${esc}(.+)_usage$`))
      /* The entity id has been slugified ("appdatabackups", "mslady_drive");
         the integration keeps the real name in an attribute. */
      .map((x) => ({
        id: x.id,
        name: (h.states[x.id] && h.states[x.id].attributes.share_name) || x.key.replace(/_/g, " "),
        v: pcNum(h, x.id),
      }))
      .filter((x) => x.v != null)
      .sort((a, b) => b.v - a.v);
  },

  /* Everything the mode reads that config does not name. Called on first hass
     and again on entering the mode — never per state change, because it walks
     every entity id in the instance. The 30s clock repaint is the backstop for
     a container that appears while the page is open. */
  _expandWatched() {
    if (!this._hass || !this._config) return;
    const s = this._sysCfg();
    if (!s) return;
    const ids = [];
    const add = (x) => { if (x) ids.push(x); };
    this._syContainers().forEach((c) => add(c.id));
    ((s.docker || {}).vms || []).forEach(add);
    this._syDisks().forEach((d) => { add(d.healthId); });
    /* Shares are twelve slow-moving percentages behind an expand; the clock is
       a good enough refresh for them and watching them would repaint the whole
       shell every time one ticks. */
    [s.status, s.uptime, s.version, s.registration, s.registration_type,
      s.plugins, s.plugin_updates, s.update_available].forEach(add);
    (s.faults || []).forEach((f) => add(f.entity));
    (s.meters || []).forEach((m) => add(m.entity));
    (s.stats || []).forEach((m) => add(m.entity));
    const p = s.parity || {};
    [p.problem, p.last_check, p.next_check, p.progress, p.running].forEach(add);
    const d = s.docker || {};
    [d.cpu, d.memory, d.vdisk, d.conflicts, d.running].forEach(add);
    const st = s.storage || {};
    [st.array, st.text, st.flash].forEach(add);
    (st.pools || []).forEach((x) => add(x.entity));
    const pf = s.perf || {};
    [pf.cpu, pf.ram, pf.gpu_util, pf.gpu_temp, pf.gpu_power, pf.board_temp, pf.governor].forEach(add);
    (pf.fans || []).forEach(add);
    (pf.network || []).forEach((n) => { add(n.rx); add(n.tx); });
    const pw = pf.power || {};
    [pw.watts, pw.voltage, pw.daily, pw.monthly, pw.cost].forEach(add);
    const n = s.notifications || {};
    [n.total, n.alert, n.warning, n.info, n.event].forEach(add);

    const base = this._collectWatched();
    const seen = new Set(base);
    ids.forEach((x) => { if (x && !seen.has(x)) { seen.add(x); base.push(x); } });
    this._watched = base;
    /* The signature just changed shape, so the next hass must not be compared
       against a signature built from the old list. */
    this._last = null;
  },

  /* -------------------------------------------------------------- render --*/

  _renderSystems(faults) {
    const s = this._sysCfg();
    const page = this._sysPage();
    if (!s || !page) { this._mode = null; return this._render(); }

    this._patch("ps-stat", `
        <div>
          <div class="ps-lbl">${psEsc(s.name || "Server")}</div>
          <h2 class="ps-syh">${psEsc(page.name)}</h2>
        </div>
        <div class="ps-rt">${this._syStatusChip(page)}</div>`);

    const html = {
      overview: () => this._syOverview(s),
      docker: () => this._syDocker(s),
      storage: () => this._syStorage(s),
      perf: () => this._syPerf(s),
      alerts: () => this._syAlerts(s),
    }[page.key]();

    /* One keyed node per page, through the same reconciler the column uses —
       so switching pages swaps the node rather than rewriting a shared one,
       and an unchanged page is left entirely alone between state changes. */
    this._patchSections([{ key: "sys-" + page.key, html, open: false, cls: "ps-sypage" }]);

    this._patch("ps-sheetslot", this._sheetHtml(faults));
    this._mountSheetCard();

    const pages = this._sysPages();
    const dock = `<button class="ps-db home" type="button" data-sysdock="__home">
        <ha-icon icon="mdi:home-variant"></ha-icon><span>Home</span></button>` +
      pages.map((p) => {
        /* The Alerts slot carries the same badge it carries on the home dock —
           it is the one entry that means the same thing in both. */
        const alert = p.key === "alerts" && pcNum(this._hass, (s.notifications || {}).alert) > 0;
        return `<button class="ps-db ${p.key === page.key ? "on" : ""} ${alert ? "alert" : ""}"
            type="button" data-sysdock="${psEsc(p.key)}">
            <ha-icon icon="${psEsc(p.icon)}"></ha-icon><span>${psEsc(p.name)}</span></button>`;
      }).join("");

    this._patch("ps-dockwrap", `${this._miniHtml()}<div class="ps-dock">${dock}</div>`);

    this._bind();
    this._bindScrub();
    this._bindSystems();
    this._reserve();
  },

  _syStatusChip(page) {
    const s = this._sysCfg();
    const h = this._hass;
    if (pcOffline(h)) return `<span class="ps-chip bad"><span class="ps-dot"></span>Reconnecting…</span>`;
    if (page.key === "docker") {
      const run = pcState(h, (s.docker || {}).running);
      return run && run !== "unknown"
        ? `<span class="ps-chip"><span class="ps-dot"></span>${psEsc(run)}</span>` : "";
    }
    if (page.key === "storage") {
      const v = pcNum(h, (s.storage || {}).array);
      if (v == null) return "";
      return `<span class="ps-chip ${v >= 95 ? "bad" : v >= 80 ? "warn" : "good"}">
        <span class="ps-dot"></span>${psPct(v)}</span>`;
    }
    if (page.key === "perf") {
      const w = pcNum(h, ((s.perf || {}).power || {}).watts);
      return w == null ? "" : `<span class="ps-chip">${Math.round(w)} W</span>`;
    }
    if (page.key === "alerts") {
      const n = pcNum(h, (s.notifications || {}).total);
      return n == null ? "" : `<span class="ps-chip ${n ? "bad" : "good"}"><span class="ps-dot"></span>${n}</span>`;
    }
    /* Overview: the connection itself. `unavailable` and `offline` are
       different facts — the first means HA lost the integration, the second
       means the integration says the box is down. */
    const r = pcReading(h, s.status);
    if (!r.ok) return `<span class="ps-chip warn"><span class="ps-dot"></span>No data</span>`;
    const raw = String(r.st.state);
    const online = raw.toLowerCase() === "online";
    return `<span class="ps-chip ${online ? "good" : "bad"}"><span class="ps-dot"></span>${
      psEsc(raw.charAt(0).toUpperCase() + raw.slice(1))}</span>`;
  },

  /* A meter that says what it is above a full-width bar. The 54px inline bar
     the Systems section uses is right for a row in a list of other things and
     wrong for a page whose subject IS the fill. */
  /* "84.1%" of what? Nearly every one of these sensors carries the answer in
     its attributes, so the sub-line is derived rather than typed — a figure
     written into config is one that goes stale silently. */
  _sySizes(entity) {
    const st = this._hass.states[entity];
    const a = st ? st.attributes : {};
    if (a.used_size && a.total_size) return `${a.used_size} of ${a.total_size}`;
    if (a.ram_used && a.ram_total) return `${a.ram_used} of ${a.ram_total}`;
    /* A pool that publishes a SIZE but no usage is present and not reporting —
       which is a different fact from an empty one, and the parity block three
       rows above already draws that distinction. cache2 reads 0.0% with
       total_size 465.8 GB and used_size null: as an unqualified "0.0%" that is
       a claim the pool is empty, made from an absence. Zero versus missing,
       one more time. */
    if (a.total_size && !a.used_size) return `of ${a.total_size} · no usage reported`;
    return "";
  },

  _syMeter(label, entity, opts) {
    const o = opts || {};
    const v = pcNum(this._hass, entity);
    const warn = o.warn == null ? 80 : o.warn;
    const crit = o.crit == null ? 95 : o.crit;
    const cls = v == null ? "" : v >= crit ? "bad" : v >= warn ? "warn" : "good";
    const p = v == null ? 0 : Math.max(0, Math.min(100, v));
    const sub = o.sub || this._sySizes(entity);
    /* A percentage derived from a usage figure that does not exist is not a
       measurement. Say so rather than printing a confident 0.0%. */
    const st = this._hass.states[entity];
    const noUse = !!(st && st.attributes.total_size && !st.attributes.used_size);
    return `<div class="ps-syb" data-info="${psEsc(entity || "")}">
        <span class="ps-sybk">${psEsc(label)}${sub ? ` <i>${psEsc(sub)}</i>` : ""}</span>
        <span class="ps-sybv ${noUse ? "" : cls}">${noUse ? "—" : psPct(v)}</span>
        <span class="ps-sybar"><i class="${cls}" style="width:${noUse ? 0 : p.toFixed(1)}%"></i></span>
      </div>`;
  },

  _syCell(label, value, cls, entity) {
    return `<div class="ps-vit"${entity ? ` data-info="${psEsc(entity)}"` : ""}>
        <span class="ps-vk">${psEsc(label)}</span>
        <span class="ps-vv ${cls || ""}">${value}</span></div>`;
  },

  /* ------------------------------------------------------------ overview --*/

  _syOverview(s) {
    const h = this._hass;
    const up = pcState(h, s.uptime);
    const ver = pcState(h, s.version);
    const plugins = pcState(h, s.plugins);
    const updates = pcNum(h, s.plugin_updates);
    /* There is no update ACTION anywhere in this integration — no update.*
       entity, no service — so an "Update" button would be a button that
       cannot update anything. What exists is the knowledge that one is
       waiting, so the row becomes a link to the page that does it. */
    const osUpd = pcState(h, s.update_available) === "on";
    const reg = pcState(h, s.registration);
    const regBad = reg && ["expired", "invalid", "eguard"].indexOf(String(reg).toLowerCase()) >= 0;

    /* Shared with the attention chip and the desk — this used to be a third
       copy of the predicate that knew about `above` and not `below`. */
    const faults = this._serverFaults();

    const idBlock = `<div class="ps-sycard">
        <div class="ps-syid">
          ${up ? `<div data-info="${psEsc(s.uptime)}"><span class="ps-syk">Uptime</span><b>${psEsc(up)}</b></div>` : ""}
          ${ver ? `<div${osUpd ? ` data-syurl="${psEsc(s.update_url || s.url || "")}"` : ` data-info="${psEsc(s.version)}"`}>
            <span class="ps-syk">Version</span><b>${psEsc(ver)}${
              osUpd ? ` <em>·update ↗</em>` : ""}</b></div>` : ""}
          ${plugins ? `<div${updates ? ` data-syurl="${psEsc(s.plugins_url || s.url || "")}"` : ` data-info="${psEsc(s.plugins)}"`}>
            <span class="ps-syk">Plugins</span><b>${psEsc(plugins)}${
            updates ? ` <em>·${updates} update${updates > 1 ? "s" : ""} ↗</em>` : ""}</b></div>` : ""}
        </div>
        ${regBad ? `<div class="ps-syreg" data-info="${psEsc(s.registration)}">
          <span class="ps-dotc warn"></span>Registration <b>${psEsc(reg)}</b>${
            pcState(h, s.registration_type) ? ` — ${psEsc(pcState(h, s.registration_type))} key` : ""}</div>` : ""}
      </div>`;

    const faultBlock = faults.length ? `<div class="ps-sycard">
        <span class="ps-lbl">Needs attention</span>
        <div class="ps-faults">${faults.map((f) => `<div class="ps-fault" data-info="${psEsc(f.entity)}">
          <span class="ps-dotc ${f.severity === "warn" ? "warn" : "bad"}"></span>
          <span class="ps-grow"><b>${psEsc(f.label)}</b> ${psEsc(f.detail || "")}</span></div>`).join("")}</div>
      </div>` : "";

    const meters = (s.meters || []).map((m) =>
      this._syMeter(m.label, m.entity, { warn: m.warn_above, crit: m.critical_above, sub: m.sub })).join("");

    const cells = (s.stats || []).map((x) => {
      const v = pcNum(h, x.entity);
      const raw = pcState(h, x.entity);
      /* CPU at 10.7% rounded to 11% throws away the only interesting digit;
         a fan at 85% does not need one. `digits` per stat, default none. */
      const txt = v == null
        ? psEsc(raw || "\u2014")
        : psFig(v, x.digits == null ? 0 : x.digits, x.unit);
      return this._syCell(x.label, txt, "", x.entity);
    }).join("");

    return `${idBlock}${faultBlock}
      ${meters ? `<div class="ps-sycard">${meters}</div>` : ""}
      ${cells ? `<div class="ps-vits">${cells}</div>` : ""}
      ${this._syParity(s)}
      ${this._syPower(s)}`;
  },

  _syParity(s) {
    const p = s.parity;
    if (!p) return "";
    const h = this._hass;
    /* `binary_sensor.*_parity_valid` carries device_class: problem, so ON is
       INVALID — the name reads the other way round and has caught people out.
       Config names it `problem` for exactly that reason. */
    const r = pcReading(h, p.problem);
    const bad = r.ok && r.st.state === "on";
    const running = pcState(h, p.running) === "on";
    const prog = pcNum(h, p.progress);
    const last = psShortDate(pcState(h, p.last_check));
    const next = psShortDate(pcState(h, p.next_check));

    const buttons = running
      ? [{ name: "Pause", entity: p.pause }, { name: "Stop", entity: p.stop, danger: true }]
      : [{ name: "Start check", entity: p.start }];

    return `<div class="ps-sycard">
        <div class="ps-syrow">
          <span class="ps-lbl">Parity</span>
          ${!r.ok
            ? `<span class="ps-chip warn"><span class="ps-dot"></span>No data</span>`
            : `<span class="ps-chip ${bad ? "bad" : "good"}"><span class="ps-dot"></span>${bad ? "Invalid" : "Valid"}</span>`}
        </div>
        ${running ? `<div class="ps-syb">
            <span class="ps-sybk">Check running</span>
            <span class="ps-sybv">${psPct(prog)}</span>
            <span class="ps-sybar"><i class="good" style="width:${(prog || 0).toFixed(1)}%"></i></span>
          </div>` : `<div class="ps-syrow ps-sysub">
            <span>Last <b>${last || "—"}</b></span><span>Next <b>${next || "—"}</b></span>
          </div>`}
        <div class="ps-btns">
          ${buttons.filter((b) => b.entity).map((b) =>
            `<button class="ps-btn ${b.danger ? "danger" : ""}" type="button"
              data-sybtn="${psEsc(b.entity)}">${psEsc(b.name)}</button>`).join("")}
          ${s.url ? `<button class="ps-btn" type="button" data-syurl="${psEsc(s.url)}">Unraid web UI ↗</button>` : ""}
        </div>
      </div>`;
  },

  /* Reboot and shut down are one tap from a scroll unless something stops
     them, so they take the same two-tap arm the schedule delete and the hold
     cancel already use — and they sit at the bottom, below everything worth
     reading, rather than beside the parity buttons. */
  _syPower(s) {
    const list = (s.power || []).filter((b) => b.entity);
    if (!list.length) return "";
    return `<div class="ps-sycard">
        <span class="ps-lbl">Power</span>
        <div class="ps-btns">${list.map((b) => {
          const k = "sy:" + b.entity;
          const armed = this._armed === k;
          return `<button class="ps-btn danger ${armed ? "armed" : ""}" type="button" data-arm="${psEsc(k)}">
            ${armed ? "Tap again" : psEsc(b.name)}</button>`;
        }).join("")}</div>
      </div>`;
  },

  _syArmedAction(entity) {
    const dom = String(entity).split(".")[0];
    this._hass.callService(dom === "switch" ? "switch" : "button",
      dom === "switch" ? "toggle" : "press", { entity_id: entity });
    this._render();
  },

  /* -------------------------------------------------------------- docker --*/

  _syDocker(s) {
    const h = this._hass;
    const d = s.docker || {};
    const all = this._syContainers();
    const vms = this._syVms();
    const q = (this._syq || "").trim().toLowerCase();
    const filter = this._syfilter || "all";

    const matched = all.filter((c) => !q || c.name.toLowerCase().indexOf(q) >= 0
      || c.image.toLowerCase().indexOf(q) >= 0);
    /* Discovery sorts by entity id, which is neither the displayed name nor
       anything the eye can use: "Agent Zero, Avidemux, Jellyfin, Crafty" is
       what `binhex_jellyfin` sorting between `avidemux` and `crafty_4` looks
       like. Running first — that is the question the page answers — then by
       what the row actually says. */
    matched.sort((a, b) => (b.on - a.on) || a.name.localeCompare(b.name));
    const shown = filter === "running" ? matched.filter((c) => c.on)
      : filter === "stopped" ? matched.filter((c) => !c.on)
        : filter === "vms" ? [] : matched;
    const onCount = all.filter((c) => c.on).length;

    const mem = pcNum(h, d.memory);
    const cells = [
      this._syCell("CPU", psFig(pcNum(h, d.cpu), 1, "%"), "", d.cpu),
      /* The sensor is megabytes; five significant digits of megabyte is not a
         number anyone reads. */
      this._syCell("Memory", mem == null ? "—" : `${(mem / 1024).toFixed(1)}<small>GB</small>`, "", d.memory),
      this._syCell("vDisk", psFig(pcNum(h, d.vdisk), 1, "%"), "", d.vdisk),
    ].join("");

    const chips = [
      ["all", `All ${all.length}`], ["running", `Running ${onCount}`],
      ["stopped", `Stopped ${all.length - onCount}`],
    ].concat(vms.length ? [["vms", `VMs ${vms.length}`]] : []);

    const rows = (filter === "vms" ? vms : shown).map((c) => `<div class="ps-sw ${c.on ? "" : "off"}">
        <ha-icon icon="${psEsc(c.icon || "mdi:desktop-tower")}"></ha-icon>
        <span class="ps-grow" data-info="${psEsc(c.id)}">
          <span class="ps-trunc">${psEsc(c.name)}</span>
          ${c.image || c.port ? `<span class="ps-symeta ps-trunc">${psEsc(c.image)}${
            c.image && c.port ? " · " : ""}${psEsc(c.port)}</span>` : ""}
        </span>
        ${c.on && c.restart ? `<button class="ps-link" type="button" data-sybtn="${psEsc(c.restart)}"
          aria-label="Restart ${psEsc(c.name)}">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/></svg>
        </button>` : ""}
        ${c.url ? `<button class="ps-link" type="button" data-syurl="${psEsc(c.url)}" aria-label="Open ${psEsc(c.name)}">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
        </button>` : ""}
        <button class="ps-knob ${c.on ? "on" : ""}" type="button" data-sysw="${psEsc(c.id)}"
          role="switch" aria-checked="${c.on}" aria-label="${psEsc(c.name)}"><i></i></button>
      </div>`).join("");

    /* An empty list after a search is a different fact from an empty server,
       and both are different from "the integration published nothing". */
    const empty = !all.length
      ? `<div class="ps-nohist">No containers found. Check the <code>containers_prefix</code>.</div>`
      : !rows
        ? `<div class="ps-nohist">Nothing matches ${q ? `“${psEsc(q)}”` : "this filter"}.</div>`
        : "";

    const conflicts = pcNum(h, d.conflicts);

    return `<div class="ps-vits">${cells}</div>
      <div class="ps-sbox">
        <svg viewBox="0 0 24 24" class="ps-ico"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/></svg>
        <input id="ps-syq" type="search" placeholder="Search containers" value="${psEsc(this._syq || "")}"
          autocomplete="off" aria-label="Search containers" />
        ${this._syq ? `<button class="ps-sclear" type="button" id="ps-syclear" aria-label="Clear">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ""}
      </div>
      <div class="ps-filters">${chips.map(([k, label]) =>
        `<button class="ps-fc ${filter === k ? "on" : ""}" type="button" data-syfilter="${k}">${psEsc(label)}</button>`).join("")}</div>
      <div class="ps-sycard">${rows || empty}</div>
      <div class="ps-syrow ps-sysub">
        <span data-info="${psEsc(d.conflicts || "")}">Port conflicts
          <b class="${conflicts ? "ps-warnc" : "ps-good"}">${conflicts == null ? "—" : conflicts ? conflicts : "none"}</b></span>
        ${vms.length && filter !== "vms" ? `<span>VMs <b>${vms.filter((v) => v.on).length} of ${vms.length} on</b></span>` : ""}
      </div>`;
  },

  /* ------------------------------------------------------------- storage --*/

  _syStorage(s) {
    const h = this._hass;
    const st = s.storage || {};
    const arr = h.states[st.array];
    const a = arr ? arr.attributes : {};
    const pct = pcNum(h, st.array);
    const text = pcState(h, st.text);
    const disks = this._syDisks();
    /* One unit for the whole column, taken from whichever disks have a real
       temperature entity. With none, the raw attribute unit stands. */
    const tUnit = (disks.find((d) => d.tempUnit) || {}).tempUnit
      || ((disks.find((d) => d.tempAttr) || {}).tempAttr || {}).u || null;
    disks.forEach((d) => {
      d.tempShow = d.temp != null ? d.temp : psConvTemp(d.tempAttr, tUnit);
    });
    const shares = this._syShares();
    const showShares = !!this._syShares_open;

    const head = `<div class="ps-sycard">
        <div class="ps-sytot">
          ${text && text.indexOf(" / ") > 0 ? `<div class="ps-sybig" data-info="${psEsc(st.text)}">${psEsc(text.split(" / ")[0])}
            <small>of ${psEsc(text.split(" / ")[1])}</small></div>`
          : `<div class="ps-sybig">${psPct(pct)}</div>`}
          <div class="ps-sysub">${a.free_space ? `${psEsc(a.free_space)} free` : ""}${
            a.num_data_disks ? ` · ${a.num_data_disks} data + ${a.num_parity_disks} parity` : ""}${
            a.array_state && a.array_state !== "STARTED" ? ` · ${psEsc(a.array_state)}` : ""}</div>
        </div>
        <span class="ps-sybar tall"><i class="${pct >= 95 ? "bad" : pct >= 80 ? "warn" : "good"}"
          style="width:${(pct || 0).toFixed(1)}%"></i></span>
      </div>`;

    /* The disk prefix also matches the pools (cache, cache2, vm), which are
       listed explicitly under `pools:` with labels of their own — so the array
       block takes only what the integration calls a data disk, plus parity. */
    const data = disks.filter((d) => d.role === "data");
    const parity = disks.filter((d) => d.key.indexOf("parity") === 0);

    const diskRow = (d) => {
      if (!d.present) {
        /* Absent, not empty. A 0% bar here would read as a healthy blank disk. */
        return `<div class="ps-sw off" data-info="${psEsc(d.healthId)}">
            <ha-icon icon="mdi:harddisk-remove"></ha-icon>
            <span class="ps-grow"><span class="ps-trunc">${psEsc(d.key)}</span>
            <span class="ps-symeta">not installed</span></span>
            <span class="ps-chip">—</span></div>`;
      }
      const ok = d.health === "PASSED";
      if (!d.hasUsage) {
        /* Parity: installed, healthy, and it has no usage to draw. A bar here
           would have to invent a number. */
        return `<div class="ps-sw" data-info="${psEsc(d.healthId)}">
            <ha-icon icon="mdi:shield-check-outline"></ha-icon>
            <span class="ps-grow"><span class="ps-trunc">${psEsc(d.key)}</span>
            <span class="ps-symeta">${d.tempShow != null
              ? `${Math.round(d.tempShow)}\u00B0${tUnit || ""} · ` : ""}no usage reported</span></span>
            <span class="ps-chip ${ok ? "good" : "bad"}">${psEsc(d.health)}</span></div>`;
      }
      const meta = [
        d.used && d.total ? `${d.used} of ${d.total}` : null,
        d.tempShow != null ? `${Math.round(d.tempShow)}°${tUnit || ""}` : null,
        psEsc(d.health),
      ].filter(Boolean).join(" · ");
      return this._syMeter(d.key, d.usageId, {
        warn: st.warn_above == null ? 80 : st.warn_above,
        crit: st.critical_above == null ? 90 : st.critical_above,
        sub: meta,
      }).replace(/^<div class="ps-syb"/, `<div class="ps-syb ${ok ? "" : "ps-syb-bad"}"`);
    };

    const pools = (st.pools || []).map((p) =>
      this._syMeter(p.label || p.entity, p.entity, { warn: p.warn_above, crit: p.critical_above, sub: p.sub })).join("");

    return `${head}
      ${data.length ? `<div class="ps-sycard"><span class="ps-lbl">Array disks</span>
        ${data.map(diskRow).join("")}
        ${parity.length ? `<div class="ps-syhair"></div>${parity.map(diskRow).join("")}` : ""}</div>` : ""}
      ${pools ? `<div class="ps-sycard"><span class="ps-lbl">Pools &amp; flash</span>${pools}</div>` : ""}
      ${shares.length ? `<div class="ps-sycard">
        <button class="ps-syrow ps-sytog" type="button" id="ps-syshares" aria-expanded="${showShares}">
          <span class="ps-lbl">Shares</span>
          <span class="ps-sysub">${shares.length} · ${showShares ? "hide" : "show"}</span>
        </button>
        ${(showShares ? shares : shares.slice(0, 3)).map((x) =>
          `<div class="ps-syrow ps-syshare" data-info="${psEsc(x.id)}"><span class="ps-trunc">${psEsc(x.name)}</span>
            <b class="${x.v >= 90 ? "ps-warnc" : ""}">${psPct(x.v)}</b></div>`).join("")}
      </div>` : ""}`;
  },

  /* --------------------------------------------------------- performance --*/

  _syPerf(s) {
    const h = this._hass;
    const pf = s.perf || {};
    const cpuSt = h.states[pf.cpu];
    const ca = cpuSt ? cpuSt.attributes : {};
    const cpu = pcNum(h, pf.cpu);
    const ramSt = h.states[pf.ram];
    const ra = ramSt ? ramSt.attributes : {};

    /* These entities are the PWM DUTY the controller is commanding, not a
       measured speed — the state tracks `pwm_value`/255 exactly. Only a header
       with a tach wire reports `rpm`, and a channel driven at 71% that reads
       0 rpm is not a stopped fan, it is a fan nobody can hear back from. On
       this box that is five of six. Printing "0 RPM" would be the same lie as
       drawing a missing reading as zero. */
    const fanRows = (pf.fans || []).map((id, i) => {
      const v = pcNum(h, id);
      if (v == null) return null;
      const st = h.states[id];
      const rpm = st && Number.isFinite(Number(st.attributes.rpm)) ? Number(st.attributes.rpm) : null;
      const mode = st && st.attributes.mode;
      return { id, n: i + 1, duty: Math.max(0, Math.min(100, v)), rpm, mode };
    }).filter(Boolean);
    const tachs = fanRows.filter((f) => f.rpm > 0).length;
    const fans = fanRows.map((f) => `<span class="ps-syfk">${f.n}</span>
        <span class="ps-sybar" data-info="${psEsc(f.id)}"><i class="fan" style="width:${f.duty}%"></i></span>
        <span class="ps-syfv">${Math.round(f.duty)}%${f.rpm > 0
          ? ` <b>${f.rpm}</b>`
          : f.duty > 0 ? ` <em>no tach</em>` : ""}</span>`).join("");

    const net = (pf.network || []).map((n) => {
      const rx = pcNum(h, n.rx), tx = pcNum(h, n.tx);
      if (rx == null && tx == null) return "";
      return `<div class="ps-syrow ps-sysub"><span>${psEsc(n.name)}</span>
        <b>↓ ${rx == null ? "—" : Math.round(rx)} &nbsp; ↑ ${tx == null ? "—" : Math.round(tx)}</b></div>`;
    }).join("");
    const netUnit = pf.network && pf.network.length && h.states[pf.network[0].rx]
      ? h.states[pf.network[0].rx].attributes.unit_of_measurement : "";

    const pw = pf.power || {};
    const cells = [
      ra.ram_used ? this._syCell("RAM used", `${psEsc(String(ra.ram_used).replace(" GB", ""))}<small> / ${psEsc(ra.ram_total || "")}</small>`, "", pf.ram) : "",
      ra.ram_cached ? this._syCell("Cached", psEsc(ra.ram_cached), "", pf.ram) : "",
      pf.gpu_util ? this._syCell(
        (ca.gpu_name ? "GPU" : "GPU"),
        `${pcNum(h, pf.gpu_util) == null ? "—" : Math.round(pcNum(h, pf.gpu_util))}<small>%${
          pcNum(h, pf.gpu_temp) != null ? ` · ${Math.round(pcNum(h, pf.gpu_temp))}${this._syUnit(pf.gpu_temp)}` : ""}</small>`,
        "", pf.gpu_util) : "",
      pf.board_temp && pcNum(h, pf.board_temp) != null
        ? this._syCell("Board", `${Math.round(pcNum(h, pf.board_temp))}<small>${this._syUnit(pf.board_temp)}</small>`, "", pf.board_temp) : "",
    ].filter(Boolean).join("");

    return `<div class="ps-sycard">
        <div class="ps-syrow">
          <div><b class="ps-sycpu">${psEsc(ca.cpu_model
            ? String(ca.cpu_model).replace(/\s+\d+-Core Processor$/, "") : "CPU")}</b>
            <div class="ps-sysub">${ca.cpu_threads ? `${ca.cpu_threads} threads` : ""}${
              ca.cpu_frequency ? ` · ${psEsc(ca.cpu_frequency)}` : ""}${
              pcState(h, pf.governor) ? ` · ${psEsc(pcState(h, pf.governor))}` : ""}</div></div>
          <div class="ps-syhero" data-readout="cpu">${cpu == null ? "—" : psPct(cpu)}</div>
        </div>
        ${this._syCpuGraph(pf)}
      </div>
      ${cells ? `<div class="ps-vits two">${cells}</div>` : ""}
      ${fans ? `<div class="ps-sycard">
        <div class="ps-syrow"><span class="ps-lbl">Fans <i class="ps-syq2">duty</i></span>
          <span class="ps-sysub">${tachs
            ? `${tachs} of ${fanRows.length} reporting rpm`
            : "no rpm feedback"}</span></div>
        <div class="ps-syfans">${fans}</div></div>` : ""}
      ${net ? `<div class="ps-sycard">
        <div class="ps-syrow"><span class="ps-lbl">Network</span><span class="ps-sysub">${psEsc(netUnit)}</span></div>
        ${net}</div>` : ""}
      ${pw.watts ? `<div class="ps-sycard">
        <div class="ps-syrow"><span class="ps-lbl">Power</span>${
          pcNum(h, pw.voltage) != null ? `<span class="ps-chip">${pcNum(h, pw.voltage).toFixed(1)} V</span>` : ""}</div>
        <div class="ps-syrow ps-sysub" data-info="${psEsc(pw.watts)}"><span>Now</span>
          <b>${pcNum(h, pw.watts) == null ? "—" : Math.round(pcNum(h, pw.watts)) + " W"}</b></div>
        ${pw.daily ? `<div class="ps-syrow ps-sysub" data-info="${psEsc(pw.daily)}"><span>Today</span>
          <b>${pcNum(h, pw.daily) == null ? "—" : pcNum(h, pw.daily).toFixed(2) + " kWh"}</b></div>` : ""}
        ${pw.monthly ? `<div class="ps-syrow ps-sysub" data-info="${psEsc(pw.monthly)}"><span>This month</span>
          <b>${pcNum(h, pw.monthly) == null ? "—" : pcNum(h, pw.monthly).toFixed(1) + " kWh"}${
            pcNum(h, pw.cost) != null ? ` · $${pcNum(h, pw.cost).toFixed(2)}` : ""}</b></div>` : ""}
      </div>` : ""}`;
  },

  _syUnit(id) {
    const st = this._hass.states[id];
    return st && st.attributes.unit_of_measurement ? st.attributes.unit_of_measurement : "";
  },

  /* The one thing Parity cannot draw, because it has no recorder: where the
     load has actually been. There is no per-core series in the integration —
     sixteen bars would be sixteen copies of one number — so this is the
     aggregate over time instead, which is the more useful picture anyway. */
  _syCpuGraph(pf) {
    const series = (this._history || {})[pf.cpu];
    if (!series || series.length < 2) {
      return `<div class="ps-nohist">${this._histErr
        ? psEsc("History unavailable — " + this._histErr)
        : "Waiting for history"}</div>`;
    }
    const pts = series
      .map((p) => ({ t: p.t, v: parseFloat(p.s) }))
      .filter((p) => Number.isFinite(p.v));
    if (pts.length < 2) return `<div class="ps-nohist">No numeric history yet</div>`;

    const W = 260, H = 46;
    const down = pcDownsample(pts, 90);
    /* minSpan 10: an idle box wanders between 7% and 11%, and auto-scaling
       that to full height draws a dramatic mountain range out of nothing. */
    const poly = pcSparkPoly(down, W, H, 5, 10);
    if (!poly) return `<div class="ps-nohist">No numeric history yet</div>`;
    const first = poly.split(" ")[0].split(",")[0];
    const lastPt = poly.split(" ").pop().split(",");

    this._cpuData = { t0: down[0].t, t1: down[down.length - 1].t, pts: down };

    return `<div class="ps-sygraph" data-scrub="cpu">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="ps-cpug" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--ps-cool)" stop-opacity=".38"/>
            <stop offset="1" stop-color="var(--ps-cool)" stop-opacity="0"/>
          </linearGradient></defs>
          <polygon points="${first},${H} ${poly} ${lastPt[0]},${H}" fill="url(#ps-cpug)"></polygon>
          <polyline points="${poly}" fill="none" stroke="var(--ps-cool)" stroke-width="1.6"
            stroke-linejoin="round" stroke-linecap="round"></polyline>
        </svg>
        <span class="ps-cross" hidden></span>
      </div>
      <div class="ps-sysub">${Math.round((Date.now() - down[0].t) / 3600000)}h · press and hold to scrub</div>`;
  },

  /* ------------------------------------------------------- notifications --*/

  _syAlerts(s) {
    const h = this._hass;
    const n = s.notifications || {};
    const src = h.states[n.total];
    const recent = (src && src.attributes.recent_notifications) || [];
    const counts = [
      ["all", `All ${psCount(pcNum(h, n.total))}`, ""],
      ["alert", `Alert ${psCount(pcNum(h, n.alert))}`, "bad"],
      ["warning", `Warning ${psCount(pcNum(h, n.warning))}`, "warn"],
      ["info", `Info ${psCount(pcNum(h, n.info))}`, ""],
    ];
    const filter = this._synf || "all";

    /* "Notice [PURDYNAS] - Version update 2026.08.07.1706" spends its first
       twenty characters saying what the dot beside it already says, on every
       row, and pushes the actual subject off the end of the line. */
    const subject = (x) => String(x.subject || "Notification")
      .replace(/^\s*(Notice|Alert|Warning|Info)\s*\[[^\]]*\]\s*-\s*/i, "");

    const rank = (x) => {
      const i = String(x.importance || "").toLowerCase();
      return i === "alert" ? "alert" : i === "warning" ? "warning" : "info";
    };
    const rows = recent
      .filter((x) => filter === "all" || rank(x) === filter)
      .map((x) => {
        const r = rank(x);
        return `<div class="ps-syn">
            <span class="ps-dotc ${r === "alert" ? "bad" : r === "warning" ? "warn" : "info"}"></span>
            <span class="ps-grow"><span class="ps-synt">${psEsc(subject(x))}</span>
            <span class="ps-symeta">${psEsc((x.importance || "info"))}</span></span>
          </div>`;
      }).join("");

    /* The sensor publishes only the five most recent. Saying so beats letting
       a list of five look like the whole of fifty-one. */
    const total = pcNum(h, n.total);
    const more = total != null && total > recent.length
      ? `<div class="ps-sysub">Showing the ${recent.length} most recent of ${total} unread. The full log is in the house notification centre.</div>`
      : "";

    return `<div class="ps-filters">${counts.map(([k, label, cls]) =>
        `<button class="ps-fc ${filter === k ? "on" : ""} ${cls}" type="button" data-synf="${k}">${psEsc(label)}</button>`).join("")}</div>
      <div class="ps-sycard">${rows || `<div class="ps-nohist">Nothing ${
        filter === "all" ? "to report" : "at this level"}.</div>`}</div>
      ${more}
      <div class="ps-btns">
        ${n.archive ? `<button class="ps-btn" type="button" data-sybtn="${psEsc(n.archive)}">Archive all</button>` : ""}
        ${this._config.log_to ? `<button class="ps-btn" type="button" data-sysheet="notifications">House notifications ↗</button>` : ""}
      </div>`;
  },

  /* ---------------------------------------------------------------- bind --*/

  /* Same rules as everything else here: bound once per element per selector,
     nothing closes over hass or config, and a focused field suppresses the
     repaint or the patch destroys the input mid-word. */
  _bindSystems() {
    this._each("[data-sysdock]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = el.dataset.sysdock;
        psClosePopup();
        if (k === "__home") {
          this._mode = null;
          this._sheet = null;
        } else {
          this._page = k;
        }
        this._last = null;
        this._render();
        if (this.scrollIntoView) this.scrollIntoView({ block: "start" });
      });
    });

    this._each("[data-sysw]", (el) => {
      el.addEventListener("click", (e) => { e.stopPropagation(); this._syToggle(el.dataset.sysw); });
    });

    this._each("[data-sybtn]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.dataset.sybtn;
        const dom = String(id).split(".")[0];
        this._hass.callService(dom === "switch" ? "switch" : "button",
          dom === "switch" ? "toggle" : "press", { entity_id: id });
      });
    });

    this._each("[data-syurl]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof window !== "undefined" && window.open) window.open(el.dataset.syurl, "_blank");
      });
    });

    this._each("[data-syfilter]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._syfilter = el.dataset.syfilter;
        this._render();
      });
    });

    this._each("[data-synf]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._synf = el.dataset.synf;
        this._render();
      });
    });

    this._each("[data-sysheet]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._sheet = el.dataset.sysheet;
        this._render();
      });
    });

    this._one("ps-syshares", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._syShares_open = !this._syShares_open;
        this._render();
      });
    });

    /* The search field keeps focus while you type, so the results CANNOT come
       back through _render — the patch would replace the input mid-word. Same
       rule the music search and the scrub readouts already follow: hold
       _dragging across the keystroke and paint the list directly. */
    this._one("ps-syq", (el) => {
      el.addEventListener("focus", () => { this._dragging = true; });
      el.addEventListener("blur", () => { this._dragging = false; });
      el.addEventListener("input", () => {
        this._syq = el.value;
        this._paintContainers();
      });
    });

    this._one("ps-syclear", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._syq = "";
        this._dragging = false;
        this._render();
      });
    });
  },

  /* Write the rows straight into the list rather than re-rendering the page,
     for the reason above, then rebind — the nodes are new, and _claim is per
     element so the fresh ones have not been claimed. */
  _paintContainers() {
    const s = this._sysCfg();
    if (!s) return;
    const page = this._sysPage();
    if (!page || page.key !== "docker") return;
    const node = this.shadowRoot.querySelector('[data-sect="sys-docker"]');
    if (!node) return;
    const was = this._dragging;
    this._dragging = false;
    const html = this._syDocker(s);
    this._dragging = was;
    /* Keep the field itself out of the rewrite: replacing it is exactly what
       this function exists to avoid. Only the list and the counts move. */
    const fresh = document.createElement("div");
    fresh.innerHTML = html;
    const listNew = fresh.querySelectorAll(".ps-sycard");
    const listOld = node.querySelectorAll(".ps-sycard");
    if (listNew.length && listOld.length) {
      listOld[listOld.length - 1].innerHTML = listNew[listNew.length - 1].innerHTML;
    }
    const chipsNew = fresh.querySelector(".ps-filters");
    const chipsOld = node.querySelector(".ps-filters");
    if (chipsNew && chipsOld) chipsOld.innerHTML = chipsNew.innerHTML;
    node._psHtml = null;   // the cache no longer matches the DOM
    this._bind();
    this._bindSystems();
  },
});
/* ============================================================================
 * purdy-shell-card — the `crew` section
 *
 * Replaces the `quick` tile grid AND the `systems` robot rows, which were two
 * views of the same three machines.
 *
 * TWO INDEPENDENT ZONES, not one section expand (v1.51.0). The robots share a
 * row but nothing else: one is a floor cleaner you dispatch to a room, the
 * other is a litter box you read trends off. A single section-level expand made
 * opening either one dump both control sets into a wall of chips — the
 * screenshot of v1.50.0 is a whole screen of room pills with the litter box's
 * two buttons stranded at the bottom. So each card owns its own open state and
 * its own panel, and both can be open, or neither.
 *
 * A NUMBER NEEDS ITS NOUN. The old tiles read "Jeeves 10 %" and "Litter 16 %" —
 * the dirty-water tank and the waste drawer, unlabelled, pointing opposite ways.
 * Every figure here is drawn next to what it measures.
 *
 * ZERO IS NOT MISSING. Everything reads through psCrewNum, which returns null
 * rather than 0 for an absent sensor; null renders as "—" and an empty ring.
 * ========================================================================== */

function psCrewNum(hass, id) {
  if (!id) return null;
  return pcNum(hass, id);
}

function psCrewPct(v) {
  return v == null ? "—" : `${Math.round(v)}%`;
}

/* Dreame publishes its selects as slugs — select.jeeves_cleaning_mode is
   "mopping", not "Mopping". Only rendering against real states caught it. */
function psCrewWords(s) {
  if (!s || s === "unknown" || s === "unavailable") return "";
  const t = String(s).replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

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

/* DISTANCE IS DERIVED, AND SAYS SO.
 *
 * Dreame publishes 233 entities for this vacuum and not one of them is a
 * distance — area, time and run count only. Miles therefore come from area
 * divided by the effective path width, which is an ASSUMPTION (`path_width_m`,
 * default 0.30 for a D10/L-series mop head), not a measurement. So the figure
 * carries a "≈" and the width stays in config where it can be corrected.
 * Presenting it bare would be a guess wearing a sensor's clothes. */
function psCrewMiles(areaValue, unit, widthM) {
  if (areaValue == null || !(widthM > 0)) return null;
  const m2 = /ft/i.test(unit || "") ? areaValue * 0.09290304 : areaValue;
  return (m2 / widthM) / 1609.344;
}

Object.assign(PurdyShellCard.prototype, {

  /* Two CONCENTRIC horseshoes, not two segments of one.
     _ringSvg stacks segments head-to-tail, which is right when the parts sum to
     a whole (deep + light = the night). These do not: they are independent and
     point opposite ways, and laid end-to-end they read as one arc that changes
     colour at an arbitrary point. Separate radii say "two things". */
  _crewRing(size, outer, inner) {
    const cx = size / 2;
    const ring = (r, stroke, frac, col) => {
      const c = 2 * Math.PI * r;
      const arc = pcRingArc(r);
      let out = `<circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="var(--ps-track)"
          stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${arc.toFixed(2)} ${c.toFixed(2)}"
          transform="rotate(${PC_RING_START} ${cx} ${cx})"/>`;
      if (frac == null) return out;          // no reading: track only, never zero
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
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        ${ring(ro, 7, outer.frac, outer.col)}
        ${ring(ro - 9, 4, inner.frac, inner.col)}
      </svg>`;
  },

  _crewLine(label, valueHtml) {
    return `<div class="ps-cwl"><em>${psEsc(label)}</em>${valueHtml}</div>`;
  },

  _crewCardHead(name, open, running, zone) {
    return `<div class="ps-cwtop">
        <span class="ps-cwdot ${running ? "on" : ""}"></span>
        <span class="ps-cwnm">${psEsc(name)}</span>
        <span class="ps-cwcv ${open ? "open" : ""}">${this._chev()}</span>
      </div>`;
  },

  /* ---- collapsed faces ---- */

  _crewVacCard(v, open) {
    const h = this._hass;
    const st = pcState(h, v.entity);
    const running = st === "cleaning" || st === "returning";
    const batt = psCrewNum(h, v.battery);
    const water = psCrewNum(h, v.dirty_water);
    const filter = psCrewNum(h, v.filter);

    /* While he is running the charge is not the interesting number — progress
       is. The ring keeps its shape and changes what it means, and the caption
       changes with it so the two can never disagree. */
    const prog = running ? psCrewNum(h, v.progress) : null;
    const outerVal = prog != null ? prog : batt;
    const outerLbl = prog != null ? "job" : "battery";

    const m = v.mileage || {};
    const areaSt = m.area && h.states[m.area];
    const miles = psCrewMiles(psCrewNum(h, m.area),
      areaSt && areaSt.attributes.unit_of_measurement, m.path_width_m || 0.3);
    const runs = psCrewNum(h, m.runs);

    return `<div class="ps-cwcard ${open ? "open" : ""}">
        <button class="ps-cwface" type="button" data-crewzone="vac">
          ${this._crewCardHead(v.name || "Jeeves", open, running)}
          <div class="ps-cwring">
            ${this._crewRing(92,
              { frac: outerVal == null ? null : outerVal / 100, col: "var(--ps-cool)" },
              { frac: water == null ? null : water / 100, col: "var(--ps-warn)" })}
            <div class="ps-cwrv"><b>${psCrewPct(outerVal)}</b><span>${outerLbl}</span></div>
          </div>
          ${this._crewLine("Distance", `<b>${miles == null ? "—" : `≈${miles.toFixed(1)} mi`}</b>`)}
          ${this._crewLine("Runs", `<b>${runs == null ? "—" : Math.round(runs).toLocaleString()}</b>`)}
          ${this._crewLine("Filter", `<b class="${filter != null && filter <= 20 ? "warn" : ""}">${psCrewPct(filter)}</b>`)}
        </button>
      </div>`;
  },

  _crewLitterCard(l, open) {
    const h = this._hass;
    const st = pcState(h, l.entity);
    const running = st === "cleaning";
    const litter = psCrewNum(h, l.litter_level);
    const drawer = psCrewNum(h, l.waste_drawer);
    const pet = l.pet || {};
    const weight = psCrewNum(h, pet.weight);
    const visits = psCrewNum(h, pet.visits);
    const scoops = psCrewNum(h, pet.scoops);
    const wUnit = (() => {
      const s = pet.weight && h.states[pet.weight];
      return s && s.attributes.unit_of_measurement ? s.attributes.unit_of_measurement : "lb";
    })();

    return `<div class="ps-cwcard ${open ? "open" : ""}">
        <button class="ps-cwface" type="button" data-crewzone="litter">
          ${this._crewCardHead(l.name || "Litter box", open, running)}
          <div class="ps-cwring">
            ${this._crewRing(92,
              { frac: litter == null ? null : litter / 100, col: "var(--ps-good)" },
              { frac: drawer == null ? null : drawer / 100, col: "var(--ps-warn)" })}
            <div class="ps-cwrv"><b>${psCrewPct(litter)}</b><span>litter</span></div>
          </div>
          ${this._crewLine("Scoops", `<b>${scoops == null ? "—" : Math.round(scoops).toLocaleString()}</b>`)}
          ${this._crewLine("Visits today", `<b>${visits == null ? "—" : Math.round(visits)}</b>`)}
          ${this._crewLine(pet.name || "Weight", `<b>${weight == null ? "—" : `${weight.toFixed(1)} ${wUnit}`}</b>`)}
        </button>
      </div>`;
  },

  /* ---- vacuum panel: dispatch ---- */

  /* Thirteen room pills over six rows was most of a phone screen. The rooms
     belong to a FLOOR, and the vacuum already knows which floor its map is on,
     so the floor is a tab and only that floor's rooms are drawn — six or seven
     chips, one or two rows. The prefix ("1F - ") is the grouping key AND is
     stripped from the chip, because printing it on every pill repeats the tab. */
  _crewRooms(v) {
    const h = this._hass;
    const sel = v.room_select && h.states[v.room_select];
    if (!sel || !Array.isArray(sel.attributes.options)) return "";
    const opts = sel.attributes.options;
    const cur = sel.state;

    const groups = [];
    opts.forEach((o) => {
      const i = String(o).indexOf(" - ");
      const g = i > 0 ? o.slice(0, i) : "";
      const label = i > 0 ? o.slice(i + 3) : o;
      let bucket = null;
      groups.forEach((x) => { if (x.name === g) bucket = x; });
      if (!bucket) { bucket = { name: g, rooms: [] }; groups.push(bucket); }
      bucket.rooms.push({ option: o, label });
    });

    /* Which tab is showing follows the SELECTION, so the chosen room is always
       visible — a tab that hid the current pick would look like nothing was
       selected at all. */
    let active = groups[0] && groups[0].name;
    groups.forEach((g) => { g.rooms.forEach((r) => { if (r.option === cur) active = g.name; }); });
    if (this._crewFloor != null) {
      groups.forEach((g) => { if (g.name === this._crewFloor) active = g.name; });
    }

    const tabs = groups.length > 1
      ? `<div class="ps-cwtabs">${groups.map((g) =>
        `<button class="ps-cwtab ${g.name === active ? "on" : ""}" type="button"
           data-crewfloor="${psEsc(g.name)}">${psEsc(g.name)}</button>`).join("")}</div>`
      : "";

    let chips = "";
    groups.forEach((g) => {
      if (g.name !== active) return;
      chips = g.rooms.map((r) =>
        `<button class="ps-cwroom ${r.option === cur ? "on" : ""}" type="button"
           data-crewroom="${psEsc(v.room_select)}" data-val="${psEsc(r.option)}">${psEsc(r.label)}</button>`).join("");
    });
    return `${tabs}<div class="ps-cwrooms">${chips}</div>`;
  },

  _crewBtn(label, icon, attrs) {
    return `<button class="ps-cwbtn" type="button" ${attrs}>
        <ha-icon icon="${psEsc(icon)}"></ha-icon><span>${psEsc(label)}</span>
      </button>`;
  },

  _crewVacPanel(v) {
    const h = this._hass;
    const st = pcState(h, v.entity);
    const busy = st === "cleaning" || st === "returning";
    const mode = psCrewWords(pcState(h, v.cleaning_mode));
    const suction = psCrewWords(pcState(h, v.suction));
    const sel = v.room_select && h.states[v.room_select];
    const pick = sel ? String(sel.state).replace(/^\S+ - /, "") : "";
    const sub = [mode, suction].filter(Boolean).join(" · ");

    /* Only the consumables that are actually low earn a line. "Filter 14%" is
       worth a nag; "Main brush 57%" is noise. Deep clean is gone — it named a
       house-cleaning routine that is no longer used. */
    const wear = [];
    (v.wear || []).forEach((w) => {
      const pct = psCrewNum(h, w.entity);
      if (pct != null && pct <= (w.warn_below == null ? 25 : w.warn_below)) {
        wear.push(`${w.label} ${Math.round(pct)}%`);
      }
    });

    return `<div class="ps-cwpanel">
        <button class="ps-cwhero" type="button" data-crewgo="${psEsc(v.entity)}"
          data-script="${psEsc(v.room_script || "")}">
          <span class="ps-cwplay">${busy
            ? `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M9 5v14M15 5v14"/></svg>`
            : `<svg viewBox="0 0 24 24" class="ps-ico"><path d="M7 4.5 19 12 7 19.5Z"/></svg>`}</span>
          <span class="ps-grow">
            <span class="ps-cwt">${busy ? "Pause" : pick ? `Clean ${psEsc(pick)}` : "Start cleaning"}</span>
            ${sub ? `<span class="ps-cwd ps-trunc">${psEsc(sub)}</span>` : ""}
          </span>
        </button>
        ${this._crewRooms(v)}
        <div class="ps-cwpair">
          ${/* The map's only door used to be the Quick tile's tap_action, and
                replacing that grid with this section left the sheet configured,
                mounted and unreachable. Anything that lived ONLY on a control
                being replaced needs a new way in, or it silently disappears —
                the same trap that stranded the music presets in v1.25.1.
                data-sheet is handled generically in core's _bind, so this needs
                no handler of its own. */
            v.map_sheet
              ? this._crewBtn("Map", "mdi:map-marker-radius",
                `data-sheet="${psEsc(v.map_sheet)}"`)
              : ""}
          ${this._crewBtn("Dock", "mdi:home-import-outline",
            `data-crewact="vacuum.return_to_base" data-target="${psEsc(v.entity)}"`)}
          ${v.emptied_button
            ? this._crewBtn("Emptied tank", "mdi:cup-water",
              `data-crewact="input_button.press" data-target="${psEsc(v.emptied_button)}"`)
            : ""}
        </div>
        ${wear.length ? `<div class="ps-cwnote">${psEsc(wear.join(" · "))}</div>` : ""}
      </div>`;
  },

  /* ---- litter panel: trends ---- */

  /* A weight line and a visits bar chart, both off the recorder. Weight is the
     one that matters — a cat losing weight quietly is the thing a litter box is
     uniquely able to notice — so it gets the line and its own min/max labels
     rather than a bare sparkline nobody can read a number off. */
  _crewTrend(id, days, kind, colour) {
    const rows = (this._crewHist || {})[id];
    if (rows == null) return `<div class="ps-cwempty">loading…</div>`;
    if (!rows.length) return `<div class="ps-cwempty">no history yet</div>`;

    const W = 300;
    const H = 56;
    if (kind === "bars") {
      /* Visits are counted per day, so they are bars — a line between daily
         totals would imply values in between that were never measured. */
      const buckets = {};
      const now = new Date();
      for (let d = days - 1; d >= 0; d--) {
        const day = new Date(now.getTime() - d * 86400000);
        buckets[`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`] = 0;
      }
      rows.forEach((r) => {
        const d = new Date(r.t);
        const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (k in buckets && r.v > buckets[k]) buckets[k] = r.v;
      });
      const keys = Object.keys(buckets);
      const vals = keys.map((k) => buckets[k]);
      const max = Math.max(1, ...vals);
      const bw = W / keys.length;
      const bars = vals.map((v, i) => {
        const bh = Math.max(1.5, (v / max) * (H - 10));
        return `<rect x="${(i * bw + bw * 0.18).toFixed(1)}" y="${(H - bh).toFixed(1)}"
          width="${(bw * 0.64).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"
          fill="${i === vals.length - 1 ? colour : "rgba(255,255,255,.22)"}"/>`;
      }).join("");
      return `<svg class="ps-cwchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
        aria-hidden="true">${bars}</svg>
        <div class="ps-cwaxis"><span>${days}d ago</span><span>max ${max}</span><span>today</span></div>`;
    }

    /* pcSparkPoly takes {t,v} rows, not bare numbers, and returns null rather
       than a flat line when there is nothing to draw — an invented straight
       line through an empty box is the same lie as a ring reading zero.
       minSpan is 0.5 lb, not the 1.0 the temperature callers use: half a pound
       on a ten-pound cat is a real change and must not be flattened away. */
    const pts = pcSparkPoly(pcDownsample(rows, 60), W, H - 8, 4, 0.5);
    if (!pts) return `<div class="ps-cwempty">not enough history yet</div>`;
    const vals = rows.map((r) => r.v);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return `<svg class="ps-cwchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="ps-cwaxis"><span>${lo.toFixed(1)}</span><span>${days}d</span><span>${hi.toFixed(1)}</span></div>`;
  },

  _crewLitterPanel(l) {
    const h = this._hass;
    const st = pcState(h, l.entity);
    const pet = l.pet || {};
    const days = l.trend_days || 30;
    return `<div class="ps-cwpanel">
        <div class="ps-cwpair">
          ${this._crewBtn(st === "cleaning" ? "Cycling…" : "Cycle now", "mdi:reload",
            `data-crewact="vacuum.start" data-target="${psEsc(l.entity)}"`)}
          ${l.reset_button
            ? this._crewBtn("Reset", "mdi:restart",
              `data-crewact="button.press" data-target="${psEsc(l.reset_button)}"`)
            : ""}
        </div>
        ${pet.weight ? `<div class="ps-cwsub">${psEsc(pet.name || "Cat")} weight · ${days}d</div>
          ${this._crewTrend(pet.weight, days, "line", "var(--ps-cool)")}` : ""}
        ${pet.visits ? `<div class="ps-cwsub">Visits per day · 14d</div>
          ${this._crewTrend(pet.visits, 14, "bars", "var(--ps-good)")}` : ""}
      </div>`;
  },

  /* ---- history for the litter trends ----
     Its own fetch, not the shared 26h one: the graphs and room sparklines have
     no use for a month, and two entities over 30 days is a smaller query than
     widening the window everything else already shares.
     `end_time` is ALWAYS sent — /api/history/period defaults it to start + 1 day,
     so every window longer than 24h silently stops short. See pcNowIso. */
  _fetchCrewHistory() {
    const c = this._config;
    if (!c || !this._hass) return;
    let sec = null;
    (c.sections || []).forEach((s) => { if (s.type === "crew") sec = s; });
    if (!sec) return;
    const pet = (sec.litter || {}).pet || {};
    const ids = [pet.weight, pet.visits].filter(Boolean);
    if (!ids.length) return;
    const days = sec.trend_days || (sec.litter || {}).trend_days || 30;
    const start = new Date(Date.now() - days * 86400000).toISOString();
    const url = `history/period/${start}?end_time=${encodeURIComponent(pcNowIso())}`
      + `&filter_entity_id=${ids.join(",")}&minimal_response&significant_changes_only`;
    this._hass.callApi("GET", url).then((res) => {
      const out = {};
      ids.forEach((id) => { out[id] = []; });
      (res || []).forEach((series) => {
        if (!series || !series.length) return;
        const id = series[0].entity_id;
        if (!(id in out)) return;
        series.forEach((row) => {
          const v = parseFloat(row.state);
          if (!isNaN(v)) out[id].push({ t: Date.parse(row.last_changed), v });
        });
      });
      this._crewHist = out;
      this._render();
    }).catch(() => {
      const out = {};
      ids.forEach((id) => { out[id] = []; });
      this._crewHist = out;
      this._render();
    });
  },

  _secCrew(sec) {
    const h = this._hass;
    if (!h) return "";
    const v = sec.vacuum || {};
    const l = sec.litter || {};
    const w = sec.washer || {};
    const open = this._crewOpen || {};

    const states = [v.entity, l.entity].filter(Boolean).map((e) => pcState(h, e));
    const busy = states.filter((s) => s === "cleaning" || s === "returning").length;
    const bad = states.filter((s) => s === "error").length;
    const chip = bad
      ? `<span class="ps-chip bad"><span class="ps-dot"></span>${bad} error${bad > 1 ? "s" : ""}</span>`
      : busy
        ? `<span class="ps-chip cool"><span class="ps-dot"></span>${busy} running</span>`
        : `<span class="ps-chip good"><span class="ps-dot"></span>All docked</span>`;

    const cards = [
      v.entity ? this._crewVacCard(v, !!open.vac) : "",
      l.entity ? this._crewLitterCard(l, !!open.litter) : "",
    ].filter(Boolean).join("");

    /* The panels sit BELOW the grid at full width, not inside the 50% card —
       a dispatch panel squeezed into half the screen is what made the room
       chips wrap six rows deep. */
    return `${this._head(sec, chip)}
      <div class="ps-cwgrid">${cards}</div>
      ${open.vac && v.entity ? this._crewVacPanel(v) : ""}
      ${open.litter && l.entity ? this._crewLitterPanel(l) : ""}
      ${w.entity ? this._crewWasher(w) : ""}`;
  },

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

  /* Bound once per element per selector — see _each. No handler closes over
     hass or config; they read this._hass live, because the shell patches and a
     handler outlives many repaints. */
  _bindCrew() {
    this._each("[data-crewzone]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const z = el.getAttribute("data-crewzone");
        if (!this._crewOpen) this._crewOpen = {};
        this._crewOpen[z] = !this._crewOpen[z];
        /* The trends are only worth fetching once someone opens the panel. */
        if (z === "litter" && this._crewOpen[z] && !this._crewHist) this._fetchCrewHistory();
        this._render();
      });
    });

    this._each("[data-crewfloor]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._crewFloor = el.getAttribute("data-crewfloor");
        this._render();
      });
    });

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
/* ============================================================================
 * purdy-shell-card — weather
 *
 * A min→max rail, not another forecast strip.
 *
 * The treatment is borrowed from a temperature-history card: each day is a
 * capsule spanning its low to its high, so the SHAPE of the week reads before
 * any single number does. Pointed at outside temperature it answers two
 * questions with one picture — what the week actually did (recorder statistics)
 * and what the week is going to do (the forecast provider) — which is why the
 * rail has a source toggle rather than there being two rails.
 *
 * The filename carries a letter because the shell tier 70-79 was full. Order
 * within the tier only matters in that 70-shell-core declares the class before
 * anything extends its prototype; this sorts after 78-shell-crew and before
 * 79-shell-styles, which is where it belongs.
 *
 * Three rules this section exists under:
 *
 * 1. THE HERO NUMBER IS THE MEASURED SENSOR, never the weather entity. On the
 *    day this was written `weather.forecast_home` reported 79°F while the
 *    thermometer in the yard read 93.4°F — a fourteen degree disagreement. A
 *    provider is authoritative about the future and merely opinionated about
 *    the present, so the present comes from the thing that measured it.
 *
 * 2. DAILY MIN/MAX COMES FROM LONG-TERM STATISTICS, not from history. The
 *    recorder's history endpoint would answer with every state change for a
 *    week and the card would then reduce it to 24 numbers;
 *    `recorder/statistics_during_period` answers with the 24 numbers. It also
 *    sidesteps the `end_time` trap entirely (it takes an explicit period
 *    rather than defaulting a window), and because long-term statistics are
 *    not purged with the recorder, this rail is not bound by the ~10 day
 *    retention that limits the hypnogram — `days:` could be 365.
 *
 * 3. NOT EVERY PROVIDER PUBLISHES A DAILY FORECAST. The National Weather
 *    Service — the most accurate free source for a US location, because the
 *    local forecast office edits the grid by hand — supports only `hourly` and
 *    `twice_daily`. Its day/night pairs ARE a high and a low, so they are
 *    folded into days rather than the section demanding a `daily` provider.
 *    The fold is honest about the ends it does not have: late in the day NWS
 *    drops the daytime period, so today arrives as a low with no high, and
 *    that draws as a stub rather than as a capsule from nowhere.
 * ========================================================================== */

/* HA condition → ground effect. Keyed on HA's CLOSED set of weather states, so
 * a provider cannot introduce one silently; anything unlisted draws nothing.
 *
 * The omissions are the argument. `cloudy` and `partlycloudy` are the commonest
 * states here by a wide margin, and an effect that is on almost always is one
 * nobody reads — it becomes the ground rather than a signal. `windy` and
 * `exceptional` have no honest picture at all: neither says whether anything is
 * falling. `sunny` and `clear-night` draw nothing on purpose, which is the same
 * rule as a missing reading never rendering as a zero. */
const PS_WXFX = {
  rainy: "rain",
  hail: "rain",
  "snowy-rainy": "rain",
  pouring: "pour",
  "lightning-rainy": "storm",
  lightning: "storm",
  snowy: "snow",
  fog: "fog",
};

/* Daily statistics rows → one record per day.
 *
 * `start` comes back as epoch ms from a modern recorder and as an ISO string
 * from an older one; both are accepted because the difference is invisible
 * until the day it is not.
 *
 * A row whose min/max did not survive is kept with nulls rather than dropped:
 * the rail has to draw a gap in the week where a gap happened, and dropping
 * the row would silently close it up and shift every later day left. */
function psWeatherDays(rows, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  const today = pcDayKey(now);
  const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  return (rows || [])
    .map((r) => {
      if (!r) return null;
      const ts = typeof r.start === "number" ? r.start : Date.parse(r.start);
      if (!Number.isFinite(ts)) return null;
      const key = pcDayKey(ts);
      return {
        key,
        ts,
        min: num(r.min),
        mean: num(r.mean),
        max: num(r.max),
        /* Today is still being measured. Its capsule is what has happened SO
           FAR, which is a different claim from a closed day's range, so it is
           flagged and the averages below leave it out. */
        partial: key === today,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);
}

/* Min / mean / max across the CLOSED days only.
 *
 * Today is excluded deliberately. A day in progress has a real min and a real
 * max — those readings happened — but its mean is the mean of a partial day,
 * and mixing it into a seven-day average silently weights whatever hours have
 * elapsed as if they were a whole day. Rather than compute two of the three one
 * way and the third another, all three describe the same set: the complete days
 * behind us. The day in progress is the hero number and its own capsule. */
function psWeatherStats(days) {
  const closed = (days || []).filter((d) => !d.partial);
  const mins = closed.map((d) => d.min).filter((v) => v != null);
  const maxs = closed.map((d) => d.max).filter((v) => v != null);
  const means = closed.map((d) => d.mean).filter((v) => v != null);
  return {
    days: closed.length,
    min: mins.length ? Math.min(...mins) : null,
    max: maxs.length ? Math.max(...maxs) : null,
    /* Mean of the daily means, not of the raw samples. The recorder already
       weighted each day's samples; this weights each DAY equally, which is
       what "the average day this week" means. */
    mean: means.length ? means.reduce((a, b) => a + b, 0) / means.length : null,
  };
}

/* Forecast entries → one record per day, whatever shape the provider speaks.
 *
 * `daily`       — one entry per day carrying `temperature` (the high) and
 *                 `templow`. met.no and OpenWeatherMap.
 * `twice_daily` — two entries per day, split by `is_daytime`. The daytime
 *                 entry's temperature is the high, the night entry's is the
 *                 low. NWS only.
 *
 * The condition comes from the DAYTIME half when there is one: a day labelled
 * by its night half is a day labelled "clear" because the sun set, and the row
 * is read as a description of the day.
 *
 * Precipitation probability is the HIGHER of the two halves rather than the
 * average — "will I need a coat today" is answered by the worse half. */
function psWeatherFc(list, kind, nowMs) {
  const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const now = nowMs == null ? Date.now() : nowMs;
  const today = pcDayKey(now);

  if (kind !== "twice_daily") {
    return (list || [])
      .map((e) => {
        if (!e) return null;
        const ts = Date.parse(e.datetime);
        if (!Number.isFinite(ts)) return null;
        const hi = num(e.temperature);
        const lo = num(e.templow);
        const key = pcDayKey(ts);
        return {
          key, ts, hi, lo,
          condition: e.condition || null,
          pop: num(e.precipitation_probability),
          precip: num(e.precipitation),
          partial: hi == null || lo == null,
          today: key === today,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.ts - b.ts);
  }

  const by = new Map();
  (list || []).forEach((e) => {
    if (!e) return;
    const ts = Date.parse(e.datetime);
    if (!Number.isFinite(ts)) return;
    const key = pcDayKey(ts);
    const rec = by.get(key) || {
      key, ts, hi: null, lo: null, condition: null, nightCondition: null,
      pop: null, precip: null,
    };
    /* Keep the earliest timestamp of the pair, so a day sorts by when it
       starts rather than by whichever half was read last. */
    if (ts < rec.ts) rec.ts = ts;
    const t = num(e.temperature);
    if (e.is_daytime === false) {
      rec.lo = t;
      rec.nightCondition = e.condition || rec.nightCondition;
    } else {
      rec.hi = t;
      rec.condition = e.condition || rec.condition;
    }
    const p = num(e.precipitation_probability);
    if (p != null) rec.pop = rec.pop == null ? p : Math.max(rec.pop, p);
    const mm = num(e.precipitation);
    if (mm != null) rec.precip = (rec.precip || 0) + mm;
    by.set(key, rec);
  });

  return [...by.values()]
    .map((r) => ({
      ...r,
      condition: r.condition || r.nightCondition,
      /* Late in the day NWS has no daytime period left to publish, so today
         comes back as a low alone. That is a real hole in the data, and it is
         drawn as one. */
      partial: r.hi == null || r.lo == null,
      today: r.key === today,
    }))
    .sort((a, b) => a.ts - b.ts);
}

Object.assign(PurdyShellCard.prototype, {

  _weatherSection() {
    return ((this._config || {}).sections || []).find((s) => s.type === "weather") || null;
  },

  /* Which forecast the provider actually has, read off supported_features
     rather than configured. FORECAST_DAILY is bit 0, HOURLY bit 1,
     TWICE_DAILY bit 2. Asking a provider for a type it does not support answers
     with an empty list and NO error — the rail would be blank forever and
     nothing would say why. */
  _wxKind(sec) {
    if (sec && sec.forecast_type) return sec.forecast_type;
    const st = sec && sec.forecast && this._hass && this._hass.states[sec.forecast];
    const f = Number((st && st.attributes.supported_features) || 0);
    if (f & 1) return "daily";
    if (f & 4) return "twice_daily";
    return "daily";
  },

  _startWeather() {
    const sec = this._weatherSection();
    if (!sec) return;
    const run = () => this._fetchWeather();
    run();
    if (this._wxTimer) clearInterval(this._wxTimer);
    /* The rail changes once a day and the forecast a few times an hour. Nothing
       here is worth a five minute poll, and the hero number does not come from
       this fetch at all — it is a watched state and repaints on its own. */
    this._wxTimer = setInterval(run, (this._config.weather_refresh_minutes || 15) * 60 * 1000);
  },

  async _fetchWeather() {
    const sec = this._weatherSection();
    if (!sec || !this._hass) return;
    await Promise.all([this._fetchWxStats(sec), this._fetchWxFc(sec)]);
    this._last = null;
    this._render();
  },

  async _fetchWxStats(sec) {
    if (!sec.sensor || !this._hass.callWS) return;
    const days = sec.days || 7;
    /* Start at LOCAL midnight `days` back, so the first bucket is a whole day
       rather than a sliver of one. Asking from "now minus N days" returns N+1
       buckets, the first a few hours wide — which reads as a freak cold morning
       beside six full days. */
    const from = new Date(this._nowMs());
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - days);
    try {
      const res = await this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: from.toISOString(),
        end_time: pcNowIso(),
        statistic_ids: [sec.sensor],
        period: "day",
        types: ["min", "mean", "max"],
        /* No `units`. The recorder answers in the sensor's own unit, and naming
           one here would convert a °C install into °F. */
      });
      this._wxStats = psWeatherDays((res || {})[sec.sensor] || [], this._nowMs());
      this._wxStatsErr = null;
    } catch (e) {
      /* An empty rail and a rail that would not load are different facts. The
         first says the week was flat, which is a claim about the weather. */
      this._wxStats = null;
      this._wxStatsErr = (e && e.message) || "the recorder did not answer";
    }
  },

  async _fetchWxFc(sec) {
    if (!sec.forecast || !this._hass.callService) return;
    const kind = this._wxKind(sec);
    const ask = async (type) => {
      const r = await this._hass.callService(
        "weather", "get_forecasts", { entity_id: sec.forecast, type },
        undefined, false, true
      );
      return (((r && r.response) || {})[sec.forecast] || {}).forecast || [];
    };
    try {
      this._wxFc = psWeatherFc(await ask(kind), kind, this._nowMs());
      this._wxFcErr = null;
    } catch (e) {
      this._wxFc = null;
      this._wxFcErr = (e && e.message) || "the provider did not answer";
    }
    /* Hourly is a second request and a second failure mode: a provider can
       publish a daily forecast and no hourly one, and the strip going missing
       must not take the rail down with it. */
    if (!sec.hourly && sec.hourly !== undefined) { this._wxHrs = null; return; }
    try {
      const hrs = await ask("hourly");
      this._wxHrs = (hrs || [])
        .map((e) => ({
          ts: Date.parse(e.datetime),
          t: Number(e.temperature),
          condition: e.condition,
          /* Kept because the strip scrolls now: over a full day "when does the
             rain start" is a real question, and it is answered by the hour
             column rather than by the daily probability. */
          pop: e.precipitation_probability == null || !Number.isFinite(Number(e.precipitation_probability))
            ? null : Number(e.precipitation_probability),
        }))
        .filter((x) => Number.isFinite(x.ts) && Number.isFinite(x.t))
        .sort((a, b) => a.ts - b.ts)
        /* A day, not half of one. NWS answers with 168 hours, so the only cost
           of a wider window is the width of a strip that scrolls anyway. */
        .slice(0, sec.hourly === true ? 24 : (sec.hourly || 24));
    } catch (e) {
      this._wxHrs = null;
    }
  },

  /* Which rail is showing. `null` means "whatever the config opens on", so a
     tap is remembered for the session without being persisted — the config
     stays the answer to what this section is FOR. */
  _wxRail(sec) {
    if (this._wxPick === "history" || this._wxPick === "forecast") return this._wxPick;
    return sec.rail === "forecast" ? "forecast" : "history";
  },

  /* The vertical domain, padded, with a floor on the span.
   *
   * Without a floor a week that never left the seventies auto-scales into a
   * mountain range — the same mistake `pcSparkPoly`'s minSpan exists to prevent
   * for an idle server's CPU. A twelve degree floor means a genuinely steady
   * week draws as short capsules in the middle of the track, which is what a
   * steady week looks like. */
  _wxDomain(rows, pick) {
    const vals = [];
    rows.forEach((r) => {
      const lo = pick === "fc" ? r.lo : r.min;
      const hi = pick === "fc" ? r.hi : r.max;
      if (lo != null) vals.push(lo);
      if (hi != null) vals.push(hi);
    });
    if (!vals.length) return null;
    let lo = Math.min(...vals) - 1.5;
    let hi = Math.max(...vals) + 1.5;
    const FLOOR = 12;
    if (hi - lo < FLOOR) {
      const mid = (hi + lo) / 2;
      lo = mid - FLOOR / 2;
      hi = mid + FLOOR / 2;
    }
    return { lo, hi, span: hi - lo };
  },

  /* The capsule, and the three states it has to tell apart.
   *
   * `p` is the class prefix, because the desk draws the same capsule from the
   * same numbers and each view owns its own class names. This is the
   * `_ringSvg` precedent — geometry is shared, the surface it lands on is not —
   * and it matters more here than for the ring: the rules encoded below (a hole
   * in the data draws as a stub, an absent day hatches, a flat day still shows)
   * are the zero-versus-missing rules, and a second copy of them on the desk
   * could regress on its own without anything saying so. */
  _wxCapsule(lo, hi, dom, markAt, p) {
    const c = p || "ps-wx";
    const pct = (v) => ((v - dom.lo) / dom.span) * 100;
    const clamp = (v) => Math.max(0, Math.min(100, v));
    const mark = markAt == null ? "" :
      `<i class="${c}mark" style="bottom:${clamp(pct(markAt)).toFixed(1)}%"></i>`;

    /* One end missing is a hole in the data, not a capsule reaching to the edge
       of the track. It draws as a stub at the end that IS known, so the column
       still says "the low was 67 and the high is not published". */
    if (lo == null || hi == null) {
      const known = lo == null ? hi : lo;
      if (known == null) return `<div class="${c}track empty"></div>`;
      return `<div class="${c}track">
          <i class="${c}cap stub" style="bottom:${clamp(pct(known) - 2).toFixed(1)}%"></i>${mark}
        </div>`;
    }
    const b = clamp(pct(lo));
    /* A day whose low equals its high is a real reading, so it gets a visible
       cap rather than a zero-height div. */
    const h = Math.max(5, clamp(pct(hi)) - b);
    return `<div class="${c}track">
        <i class="${c}cap" style="bottom:${b.toFixed(1)}%;height:${h.toFixed(1)}%"></i>${mark}
      </div>`;
  },

  _wxDow(ts, today) {
    if (today) return "Today";
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(ts).getDay()];
  },

  _wxDeg(v, digits) {
    return v == null ? "—" : `${v.toFixed(digits == null ? 0 : digits)}°`;
  },

  _wxBox(msg, retry) {
    return `<div class="ps-railbox"><div class="ps-wxempty">${msg}${
      retry ? `<button class="ps-wxretry" type="button" data-wxretry="1">Retry</button>` : ""}</div></div>`;
  },

  /* Today's bucket, widened to include the live reading.
   *
   * Long-term statistics are aggregated on a schedule, so the day in progress
   * lags the sensor by a few minutes. It reported a high of 92° while the
   * thermometer said 95.2°, and the live tick floated above the top of its own
   * capsule — a visible contradiction in which the tick was the honest half. The
   * live reading IS a reading from today, so today's range takes it in. Closed
   * days are never touched: yesterday's numbers are final.
   *
   * Shared with the desk, which drew the same contradiction until it was. */
  _wxHistRows(live) {
    return (this._wxStats || []).map((d) => (d.partial && live != null ? {
      ...d,
      min: d.min == null ? live : Math.min(d.min, live),
      max: d.max == null ? live : Math.max(d.max, live),
    } : d));
  },

  /* ------------------------------------------------------------- the rails --*/

  _wxHistoryRail(sec, live) {
    if (this._wxStatsErr) {
      return this._wxBox(`The week would not load — ${psEsc(this._wxStatsErr)}`, true);
    }
    /* null is "the recorder has not answered yet" and [] is "it answered and
       there is nothing" — a still-loading rail must not read as a flat week. */
    if (this._wxStats == null) return this._wxBox("Reading the week…");
    const rows = this._wxHistRows(live);
    if (!rows.length) {
      return this._wxBox(`No statistics for ${psEsc(sec.sensor || "this sensor")} yet — long-term
        statistics need a few hours of history before the first day appears.`);
    }
    const dom = this._wxDomain(rows, "hist");
    if (!dom) return this._wxBox("The recorder held no readings for these days.");

    const cells = rows.map((d) => {
      const isToday = d.partial;
      /* The live reading is a tick on today's capsule only. Painting it on a
         closed day would be marking yesterday with today's temperature. */
      const mark = isToday && live != null ? live : null;
      return `<div class="ps-wxday${isToday ? " now" : ""}">
          <span class="ps-wxhi">${this._wxDeg(d.max)}</span>
          ${this._wxCapsule(d.min, d.max, dom, mark)}
          <span class="ps-wxlo">${this._wxDeg(d.min)}</span>
          <span class="ps-wxdw">${psEsc(this._wxDow(d.ts, isToday))}</span>
        </div>`;
    }).join("");

    return `<div class="ps-railbox"><div class="ps-wxrail" style="--n:${rows.length}">${cells}</div></div>`;
  },

  _wxForecastRail(sec) {
    if (this._wxFcErr) {
      return this._wxBox(`The forecast would not load — ${psEsc(this._wxFcErr)}`, true);
    }
    const rows = this._wxFc;
    if (rows == null) return this._wxBox("Reading the forecast…");
    if (!rows.length) {
      return this._wxBox(`${psEsc(sec.forecast || "The provider")} returned no ${
        psEsc(this._wxKind(sec).replace("_", " "))} forecast.`);
    }
    const shown = rows.slice(0, sec.forecast_days || 7);
    const dom = this._wxDomain(shown, "fc");
    if (!dom) return this._wxBox("The forecast carried no temperatures.");

    const live = this._wxLive(sec);
    const cells = shown.map((d) => {
      const mark = d.today && live != null ? live : null;
      /* A probability of nothing and a probability of zero are different, and
         only the second deserves the row. The placeholder holds the line's
         height so the day labels stay in a row. */
      const pop = d.pop == null ? "" : `${Math.round(d.pop)}%`;
      return `<div class="ps-wxday${d.today ? " now" : ""}">
          <ha-icon class="ps-wxi" icon="${psEsc(pcWxIcon(d.condition))}"></ha-icon>
          <span class="ps-wxhi">${this._wxDeg(d.hi)}</span>
          ${this._wxCapsule(d.lo, d.hi, dom, mark)}
          <span class="ps-wxlo">${this._wxDeg(d.lo)}</span>
          <span class="ps-wxpcp${pop ? "" : " none"}">${pop || "0%"}</span>
          <span class="ps-wxdw">${psEsc(this._wxDow(d.ts, d.today))}</span>
        </div>`;
    }).join("");

    return `<div class="ps-railbox"><div class="ps-wxrail" style="--n:${shown.length}">${cells}</div></div>`;
  },

  /* --------------------------------------------------------------- the top --*/

  /* The measured reading. Not the weather entity: see rule 1 at the top. */
  _wxLive(sec) {
    return pcNum(this._hass, sec.sensor);
  },

  /* The hourly strip's scale.
   *
   * Two rules, and the second was only visible in a screenshot. A flat twelve
   * hours must not draw as a sawtooth, so the span has a floor — but the coolest
   * hour then lands exactly ON the baseline and draws as a hairline, which reads
   * as "no data for that hour" rather than "this is the coolest hour". Padding
   * below the minimum keeps the smallest bar a bar. */
  _wxHourDomain(hrs) {
    const temps = hrs.map((x) => x.t);
    let lo = Math.min(...temps);
    let hi = Math.max(...temps);
    if (hi - lo < 8) { const mid = (hi + lo) / 2; lo = mid - 4; hi = mid + 4; }
    return { lo: lo - (hi - lo) * 0.22, hi };
  },

  _wxClock(ms) {
    const d = new Date(ms);
    const h12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
    return `${h12}${d.getHours() >= 12 ? "p" : "a"}`;
  },

  /* The hourly columns, as data. Each carries its own bar height, so the shell
     and the desk cannot draw the same hour at two different heights. */
  _wxHourCols(hrs) {
    const { lo, hi } = this._wxHourDomain(hrs);
    let prevDay = null;
    return hrs.map((x, i) => {
      const day = pcDayKey(x.ts);
      /* A new local day gets a divider and takes the weekday in place of the
         hour — "12a" repeated every 24 columns says nothing about which day it
         is the midnight of, and a scrollable strip is exactly where you lose
         track. */
      const newDay = prevDay != null && day !== prevDay;
      prevDay = day;
      return {
        ts: x.ts,
        t: x.t,
        pop: x.pop,
        condition: x.condition,
        h: Math.max(6, ((x.t - lo) / (hi - lo)) * 100),
        now: i === 0,
        newDay,
        label: i === 0 ? "Now"
          : newDay ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(x.ts).getDay()]
            : this._wxClock(x.ts),
      };
    });
  },

  /* Scrollable, because twelve hours is not a day and the provider gives 168.
   *
   * `overflow-x: auto` and NOTHING ELSE. `touch-action` must not be set on a
   * sideways-scrolling strip: `pan-x pan-y` is not equivalent to the default
   * `auto` — it restricts the element to panning and makes the browser's
   * per-gesture axis commitment stickier, so a slightly diagonal swipe locks to
   * vertical and the strip goes dead. purdy-rooms-card's strip has always been
   * plain flex + overflow-x and has always worked. `overscroll-behavior-x`
   * keeps a fling at the end of the strip from becoming a page gesture.
   *
   * Phone v2 had deliberately gone to zero sideways-scrolling surfaces in
   * v1.20.0 (the music rooms and schedule tabs wrap; the room strip is a grid).
   * This is the one place where wrapping would be wrong rather than merely
   * different: a time axis that wraps to a second line is two axes, and the
   * eye reads the wrap as a jump back in time. */
  _wxHourly(sec) {
    const hrs = this._wxHrs;
    if (!hrs || hrs.length < 2) return "";
    const cols = this._wxHourCols(hrs);
    /* A probability row costs a line of height on every column, so it is drawn
       only if some hour in the window actually expects rain. */
    const wet = cols.some((c) => c.pop != null && c.pop >= 20);
    const body = cols.map((c) => `<div class="ps-wxhr${c.now ? " now" : ""}${c.newDay ? " nd" : ""}">
        <span class="ps-wxht">${this._wxDeg(c.t)}</span>
        <div class="ps-wxhbar"><i style="height:${c.h.toFixed(1)}%"></i></div>
        ${wet ? `<span class="ps-wxhp">${c.pop != null && c.pop >= 20 ? `${Math.round(c.pop)}%` : ""}</span>` : ""}
        <span class="ps-wxhl">${psEsc(c.label)}</span>
      </div>`).join("");

    const temps = cols.map((c) => c.t);
    return `<div>
        <div class="ps-wxrh"><span class="ps-wxlb">Next ${cols.length} hours</span>
          <span class="ps-wxrb">${this._wxDeg(Math.min(...temps))} – ${this._wxDeg(Math.max(...temps))}</span></div>
        <div class="ps-wxhrs">${body}</div>
      </div>`;
  },

  /* Detail rows. A row whose value is missing is DROPPED, not dashed: this is a
     list of things that are known, and the providers here disagree wildly about
     what they publish — NWS has no apparent temperature and no UV index at all,
     so a fixed row list would be half dashes on the most accurate provider
     available. */
  _wxRows(sec) {
    const h = this._hass;
    const fc = sec.forecast && h.states[sec.forecast];
    const feels = sec.feels_from && h.states[sec.feels_from];
    const a = (st, k) => (st ? pcNumOf(st, k) : null);
    /* `feels_from` wins where both publish a field: it is named in the config
       precisely because it is the provider trusted for the present. */
    const pick = (k) => {
      const v = a(feels, k);
      return v == null ? a(fc, k) : v;
    };

    const rows = [];
    const add = (k, v, cls) => { if (v != null && v !== "") rows.push([k, v, cls || ""]); };

    /* No "Feels like" row. It is the section's CHIP — and the chip is on screen
       whether this list is expanded or not, three centimetres above it. The desk
       card shipped this exact duplication once ("Up 2h 0m" beside "Awake 2h 0m")
       and it is the same mistake: the chip carries the number, so the list must
       carry something else. */
    const hum = pick("humidity");
    const dew = pick("dew_point");
    if (hum != null || dew != null) {
      add(dew != null ? "Humidity · dew point" : "Humidity",
        [hum == null ? null : `${Math.round(hum)}%`, dew == null ? null : this._wxDeg(dew)]
          .filter(Boolean).join(" · "));
    }

    const ws = pick("wind_speed");
    if (ws != null) {
      const bear = pick("wind_bearing");
      const gust = pick("wind_gust_speed");
      const unit = (((feels || fc || {}).attributes) || {}).wind_speed_unit || "";
      const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
      const dir = bear == null ? "" : ` ${dirs[Math.round((bear % 360) / 22.5) % 16]}`;
      add("Wind", `${Math.round(ws)}${unit ? ` ${unit}` : ""}${dir}` +
        (gust ? ` · gusts ${Math.round(gust)}` : ""));
    }

    const uv = pick("uv_index");
    if (uv != null) {
      const band = uv >= 8 ? "very high" : uv >= 6 ? "high" : uv >= 3 ? "moderate" : "low";
      add("UV index", `${uv.toFixed(1)} ${band}`, uv >= 8 ? "bad" : uv >= 6 ? "warn" : "");
    }

    /* GTTC already computes the one comparison nothing else here can: how far
       outside is from inside, which is what decides whether opening a window is
       a good idea. */
    const g = sec.gttc_outdoor && h.states[sec.gttc_outdoor];
    const diff = a(g, "outdoor_minus_indoor");
    if (diff != null) {
      add("Outside vs inside", `${diff > 0 ? "+" : ""}${diff.toFixed(1)}°`,
        diff > 0 ? "heat" : "cool");
    }

    const sun = sec.sun && h.states[sec.sun];
    if (sun) {
      const up = sun.state === "above_horizon";
      const when = up ? sun.attributes.next_setting : sun.attributes.next_rising;
      const d = when ? new Date(when) : null;
      if (d && !isNaN(d.getTime())) {
        add(up ? "Sunset" : "Sunrise", psMinsToClock(d.getHours() * 60 + d.getMinutes()));
      }
    }

    if (!rows.length) return "";
    return `<div class="ps-wxrows">${rows.map(([k, v, cls]) =>
      `<div class="ps-wxrow"><span class="k">${psEsc(k)}</span><span class="v ${cls}">${v}</span></div>`
    ).join("")}</div>`;
  },

  /* One line, and only if there is something worth a line in it.
   *
   * The first wet day and the size of the coming swing are the two things the
   * capsules do not say out loud. GTTC's own status is appended when it is
   * configured, because "mild (full setbacks allowed)" is the sentence that
   * explains what the house is about to do about all this. */
  _wxNoteText(sec) {
    const bits = [];
    const fc = this._wxFc || [];
    const wet = fc.find((d) => !d.today &&
      (/rain|pour|lightning|snow|hail|sleet/.test(String(d.condition || "")) ||
        (d.pop != null && d.pop >= 50)));
    if (wet) bits.push(`${pcWxText(wet.condition) || "Rain"} ${this._wxDow(wet.ts, false)}`);

    const his = fc.map((d) => d.hi).filter((v) => v != null);
    if (his.length >= 2) {
      const swing = Math.round(Math.max(...his) - Math.min(...his));
      if (swing >= 8) bits.push(`a ${swing}° swing across the week`);
    }
    const g = sec.gttc_outdoor && this._hass.states[sec.gttc_outdoor];
    const opt = g && g.attributes.optimization_status;
    if (opt) bits.push(String(opt));
    if (!bits.length) return "";
    const s = bits.join(" · ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  },

  /* The sentence is shared; the surface it lands on is each view's own. */
  _wxNote(sec) {
    const t = this._wxNoteText(sec);
    return t ? `<div class="ps-wxnote">${psEsc(t)}</div>` : "";
  },

  /* What to call the sensor under the reading.
   *
   * The real friendly name here is "Outside Thermometer & Humidity
   * Temperature", which wrapped to two lines of 10px uppercase under the hero
   * number and said "temperature" to label a temperature. A trailing
   * "temperature" is always redundant in this position, and the combined
   * thermometer-and-humidity naming is an artifact of one device publishing two
   * measurements. `source_label:` overrides it outright. */
  _wxSrcName(sec) {
    if (sec.source_label) return sec.source_label;
    const raw = (((this._hass.states[sec.sensor] || {}).attributes) || {}).friendly_name;
    if (!raw) return sec.sensor || "";
    return String(raw)
      .replace(/\s*&\s*humidity\b/i, "")
      .replace(/\s+temperature$/i, "")
      .trim() || String(raw);
  },

  _wxTile(label, v, cls) {
    return `<div class="ps-wxtile">
        <span>${psEsc(label)}</span>
        <b class="${cls || ""}">${v == null ? "—" : `${v.toFixed(1)}°`}</b>
      </div>`;
  },

  /* Attribution strings are a whole sentence ("Weather forecast from met.no,
     delivered by the Norwegian Meteorological Institute."). The rail's caption
     has room for a name, so name the ones this house can actually be pointed
     at and truncate anything else rather than printing a paragraph. */
  _wxAttrib(s) {
    const t = String(s || "").replace(/\.$/, "");
    if (!t) return "";
    if (/national weather service|noaa/i.test(t)) return "NWS";
    if (/met\.no|norwegian/i.test(t)) return "met.no";
    if (/openweather/i.test(t)) return "OpenWeatherMap";
    return t.length > 24 ? `${t.slice(0, 23)}…` : t;
  },

  /* ------------------------------------------------------------- motion fx --*/

  /* Drive the ground's precipitation layer.
   *
   * This is an ATTRIBUTE WRITE on a node _mount built once and no patch ever
   * rewrites. It sits in FRONT of the glass column: the column blurs whatever
   * is behind it by 26px, so a layer on .ps-ground is invisible under it — a
   * mockup with no frosted glass cannot show you that, and a shot of the real
   * card can — the same shape as the desk writing grid-template-columns onto
   * the surviving #pd-stage node, and the reason the animation is not drawn
   * inside the weather section: a section's innerHTML is replaced whenever its
   * rendered string changes, which for this section is every sensor tick, and
   * an animation on a replaced node restarts from zero every time (v1.45.2).
   *
   * Cloudy deliberately maps to nothing. It is by far the commonest condition
   * here, and a haze that is drawn almost always is one nobody reads — the
   * effect earns its place by marking weather that is an EVENT.
   */
  _paintWxFx() {
    const el = this.shadowRoot && this.shadowRoot.querySelector(".ps-wxfx");
    if (!el) return;
    const cfg = this._config.weather_fx;

    /* No config, no entity, an entity that is not reporting, or a condition
       with no effect all land in the same place: no attribute, so the CSS
       draws nothing. A missing reading must not render as a clear sky any
       more than it may render as a zero. */
    const id = cfg && cfg.entity;
    const st = id && this._hass && this._hass.states[id];
    const cond = cfg && (cfg.force || (st && st.state));
    const kind = (cfg && cond && PS_WXFX[cond]) || "";

    if (kind) {
      if (el.dataset.wx !== kind) el.dataset.wx = kind;
    } else if (el.hasAttribute("data-wx")) {
      el.removeAttribute("data-wx");
    }

    /* Clamped rather than trusted: a strength of 8 would paint the column out
       entirely, and there is no way to reach the config from the phone. */
    const raw = cfg && cfg.strength != null ? Number(cfg.strength) : 1;
    const str = String(Math.max(0, Math.min(1.5, isNaN(raw) ? 1 : raw)));
    if (el.style.getPropertyValue("--ps-wxstr") !== str) {
      el.style.setProperty("--ps-wxstr", str);
    }
  },

  /* --------------------------------------------------------------- section --*/

  _secWeather(sec) {
    const h = this._hass;
    const live = this._wxLive(sec);
    const reading = pcReading(h, sec.sensor);
    const st = psWeatherStats(this._wxStats || []);
    const rail = this._wxRail(sec);
    const fcSt = sec.forecast && h.states[sec.forecast];

    /* The chip carries the reading and, when they differ, how it feels — the
       pair worth having on a collapsed header in August. When they agree there
       is nothing to add, so the condition takes the second slot instead. */
    const app = sec.feels_from ? pcNumOf(h.states[sec.feels_from], "apparent_temperature") : null;
    const hot = live != null && app != null && Math.abs(app - live) >= 2;
    const chipBits = [live == null ? null : this._wxDeg(live)];
    if (hot) chipBits.push(`feels ${this._wxDeg(app)}`);
    else if (fcSt) chipBits.push(pcWxText(fcSt.state));
    const chip = `<span class="ps-chip ${hot && app > live ? "warn" : "cool"}"><span class="ps-dot"></span>${
      psEsc(chipBits.filter(Boolean).join(" · ")) || "—"}</span>`;

    /* Today's low is the honest anchor for the delta. "Since this morning" is
       what the reference card said, but it is only true if nothing colder
       happened later, and the daily minimum is the fact underneath it. */
    const today = (this._wxStats || []).find((d) => d.partial);
    const fromLow = today && today.min != null && live != null ? live - today.min : null;
    const delta = fromLow == null ? "" :
      `<div class="ps-wxdelta${fromLow < 0 ? " cool" : ""}">${fromLow >= 0 ? "↑" : "↓"} ${
        Math.abs(fromLow).toFixed(1)}° from today's low</div>`;

    /* A sensor that is not reporting must not print its last number as if it
       were current, and must not print a zero either. */
    const heroTxt = reading.ok && live != null ? `${live.toFixed(1)}<sup>°</sup>` : "—";
    const srcName = reading.ok ? this._wxSrcName(sec)
      : (reading.why === "missing" ? "Sensor not found" : "Sensor unavailable");

    const nHist = (this._wxStats || []).length;
    const nFc = (this._wxFc || []).slice(0, sec.forecast_days || 7).length;
    /* The counts come off the ARRAYS, never off `days:`. met.no answers with
       six days where the config asked for seven, and a label that reads "Next 7
       days" over six capsules has invented a day. */
    /* The history tab counts the CLOSED days, not the columns. Statistics
       answers with `days` complete buckets plus the one in progress, so the rail
       legitimately draws eight columns for `days: 7` — but a tab reading "Last 8
       days" beside a config that says 7 is just wrong, and the eighth column is
       labelled "Today" anyway. */
    const tabs = sec.tabs === false ? "" : `<div class="ps-wxtabs">
        <button class="ps-wxtab${rail === "history" ? " on" : ""}" type="button"
          data-wxrail="history">Last ${st.days || sec.days || 7} days</button>
        <button class="ps-wxtab${rail === "forecast" ? " on" : ""}" type="button"
          data-wxrail="forecast">Next ${nFc || 7} days</button>
      </div>`;

    const attrib = this._wxAttrib(fcSt && fcSt.attributes.attribution);
    const railLabel = rail === "forecast"
      ? `<span class="ps-wxlb">Forecast</span><span class="ps-wxrb">${
        psEsc(attrib ? `${attrib} · high–low` : "high–low")}</span>`
      : `<span class="ps-wxlb">Measured</span><span class="ps-wxrb">${
        psEsc(nHist > st.days ? "min–max, plus today so far" : "min–max range")}</span>`;

    return `${this._head(sec, chip)}
      <div class="ps-wxhero">
        <div class="ps-wxheronum">
          <div class="ps-wxbig${reading.ok ? "" : " off"}">${heroTxt}</div>
          ${delta}
          <div class="ps-wxsrc">${psEsc(srcName)}</div>
        </div>
        <div class="ps-wxtiles">
          ${this._wxTile("Min", st.min, "lo")}
          ${this._wxTile("Avg", st.mean, "")}
          ${this._wxTile("Max", st.max, "hi")}
        </div>
      </div>
      ${tabs}
      <div class="ps-wxrh">${railLabel}</div>
      ${rail === "forecast" ? this._wxForecastRail(sec) : this._wxHistoryRail(sec, live)}
      ${this._wxNote(sec)}
      <div class="ps-xtra">
        ${this._wxHourly(sec)}
        ${this._wxRows(sec)}
      </div>`;
  },
});
/* ============================================================================
 * purdy-shell-card — styles
 *
 * One sheet, kept whole and in source order. Splitting it by section would
 * re-order rules and quietly change the cascade.
 *
 * Sizes, radii and surface tints come from the scales in PC_TOKENS. There were
 * 17 font sizes, 15 radii and 13 white-alpha fills in here, most of them within
 * half a pixel or two percent of a neighbour — which reads as inconsistency
 * rather than hierarchy. Pick a step; do not invent one.
 * ========================================================================== */

const PS_STYLES = `
      :host {
        ${PC_TOKENS}
        --ps-text: #e8eef4;
        --ps-muted: #8792a0;
        /* Was #606b79 — 3.6:1 on the ground, under the 4.5:1 floor, and it was
           the colour of every 9px uppercase label on the screen. The smallest
           text must not also be the faintest. This measures ~4.9:1 and still
           sits a clear step below --ps-muted. */
        --ps-dim: #7c8797;
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
        --ps-fill: var(--pc-fill-1);
        --ps-track: rgba(255,255,255,.12);
        /* Measured from the real dock after every render — see _reserve(). The
           fallback is the dock alone; with a now-playing bar it grows by ~59px
           and the last section used to end up underneath it. */
        --ps-dockh: 74px;
        display: block;
        position: relative;
        /* A negative horizontal margin made the card wider than the view, and
           the page then scrolled sideways whenever a drag started on a graph.
           Stay inside the view and clip anything that still reaches past. */
        margin: 0;
        /* The dock is STICKY and therefore in flow, so it reserves its own room
           and the padding only has to hold the gap UNDER it at full scroll.
           --ps-dockh is still measured, because .ps-sheet is fixed and has to
           clear a dock whose height changes with the now-playing bar. */
        padding: 6px 6px calc(12px + env(safe-area-inset-bottom, 0px));
        max-width: 100%;
        overflow-x: clip;
        color: var(--ps-text);
        font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        -webkit-font-smoothing: antialiased;
        min-height: 100vh;
      }
      * { box-sizing: border-box; }
      button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; text-align: inherit; }
      button:focus-visible, [role="switch"]:focus-visible { outline: 2px solid var(--ps-cool); outline-offset: 2px; border-radius: var(--pc-r-xs); }
      img { display: block; width: 100%; height: 100%; object-fit: cover; }
      ha-icon { --mdc-icon-size: 20px; flex: 0 0 auto; }
      .ps-ico { width: 17px; height: 17px; flex: 0 0 auto; display: block; }
      .ps-ico path, .ps-ico circle, .ps-ico rect, .ps-ico line {
        fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round;
      }
      .ps-grow { flex: 1; min-width: 0; }
      .ps-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
      .ps-row { display: flex; align-items: center; gap: 9px; }
      .ps-lbl { font-size: var(--pc-fs-micro); letter-spacing: .13em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }

      /* Hit expansion. Every round control on this screen drew at 19–36px, well
         under the 44px a thumb needs; the fix must not change what is drawn, so
         the target grows behind the paint. Horizontal insets stay inside the
         row gap so a neighbour can never steal the tap. */
      .ps-step, .ps-knob, .ps-link, .ps-x, .ps-prx, .ps-vbtn,
      .ps-tvoff, .ps-mb, .ps-npb, .ps-pin, .ps-tb, .ps-sclear { position: relative; }
      .ps-step::after, .ps-knob::after, .ps-link::after, .ps-x::after, .ps-prx::after,
      .ps-vbtn::after, .ps-tvoff::after, .ps-mb::after, .ps-npb::after, .ps-pin::after,
      .ps-tb::after, .ps-sclear::after { content: ""; position: absolute; inset: -11px -4px; }

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
      .ps-stat h2 { font-size: var(--pc-fs-xl); font-weight: 640; letter-spacing: -.028em; margin: 0; line-height: 1.15; }
      .ps-d { font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums; margin-top: 3px; }
      .ps-rt { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
      .ps-wx { display: flex; align-items: center; gap: 7px; color: var(--ps-cool); font-size: var(--pc-fs-xl);
               font-weight: 640; font-variant-numeric: tabular-nums; letter-spacing: -.02em; cursor: pointer; }
      .ps-wx ha-icon { --mdc-icon-size: 22px; }

      .ps-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: var(--pc-r-pill);
                 font-size: var(--pc-fs-micro); font-weight: 650; background: var(--pc-fill-2); color: var(--ps-muted);
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
        border-radius: var(--pc-r-2xl); overflow: clip;
        background: linear-gradient(180deg, rgba(255,255,255,.062), rgba(255,255,255,.026));
        border: 1px solid rgba(255,255,255,.085);
        box-shadow: 0 24px 60px -18px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.075);
        backdrop-filter: blur(26px) saturate(1.25);
        -webkit-backdrop-filter: blur(26px) saturate(1.25);
      }
      .ps-sect { padding: 13px 15px 15px; overflow-x: clip; }
      .ps-sect + .ps-sect { border-top: 1px solid var(--ps-hair); }
      /* One header treatment for every section. A fixed section differs only by
         having no chevron — it used to be rendered as a 9px uppercase caption,
         so two sections looked like titles and five looked like labels of the
         thing above them. */
      .ps-sh { display: flex; align-items: center; gap: 8px; width: 100%; padding: 0 0 11px; }
      .ps-nm { font-size: var(--pc-fs-sm); font-weight: 680; letter-spacing: -.004em; flex: 1; min-width: 0; }
      .ps-cv { color: var(--ps-dim); transition: transform .3s; display: flex; }
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
      .ps-rv b { font-size: var(--pc-fs-2xl); font-weight: 640; letter-spacing: -.028em; line-height: 1; }
      /* A ring caption is centred over a filled arc, so anything wider than the
         ring's inner box does not merely look tight — it is clipped by the
         stroke, and a clipped label is a MISSING label ("THERMOSTAT" read
         "HERMOSTAT"). Capped and centred so a long caption wraps inside the
         ring instead of running out of it. */
      .ps-rv small { font-size: var(--pc-fs-micro); color: var(--ps-dim); margin-top: 3px; letter-spacing: .09em;
                     text-transform: uppercase; font-weight: 650;
                     max-width: 78%; text-align: center; line-height: 1.15; }

      /* climate */
      .ps-chero { display: flex; align-items: center; gap: 14px; }
      .ps-goal { display: flex; align-items: baseline; gap: 6px; }
      .ps-goal b { font-size: var(--pc-fs-2xl); font-weight: 660; font-variant-numeric: tabular-nums; }
      .ps-goal span { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .ps-step { width: 34px; height: 34px; border-radius: 50%; background: var(--pc-fill-2);
                 display: grid; place-items: center; flex: 0 0 auto; }
      .ps-step .ps-ico { width: 16px; height: 16px; }
      .ps-step:active { transform: scale(.93); }
      .ps-reason { font-size: var(--pc-fs-xs); color: var(--ps-muted); margin-top: 9px; line-height: 1.42; }
      .ps-zpair { display: flex; gap: 6px; margin-top: 11px; }
      .ps-zc { flex: 1; padding: 8px 10px; border-radius: var(--pc-r-sm); background: var(--ps-fill); font-size: var(--pc-fs-xs);
               color: var(--ps-muted); font-variant-numeric: tabular-nums; line-height: 1.3; cursor: pointer; }
      .ps-zc b { display: block; font-size: var(--pc-fs-lg); color: var(--ps-text); font-weight: 660; letter-spacing: -.02em; }
      .ps-zc.on { background: rgba(77,208,225,.15); color: var(--ps-cool); }
      .ps-zc.on b { color: var(--ps-cool); }
      .ps-wave { margin: 4px -15px -15px; position: relative; }
      /* The plotted range, so the line reads as a measurement rather than a
         shape. Inside the plot and out of the flow, so it cannot change the
         height it is describing. */
      .ps-wax {
        position: absolute; left: 15px; z-index: 1; pointer-events: none;
        font-size: var(--pc-fs-micro); color: var(--ps-dim);
        font-variant-numeric: tabular-nums;
      }
      .ps-wax.hi { top: 1px; }
      .ps-wax.lo { bottom: 16px; }
      .ps-wave-svg { width: 100%; height: 74px; display: block; }
      .ps-wlg { display: flex; gap: 12px; align-items: baseline; margin-top: 11px; min-height: 16px;
                font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .ps-wlg i { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px; }
      .ps-wlg b { color: var(--ps-text); font-weight: 640; margin-left: 3px; }
      .ps-wlg span { display: inline-flex; align-items: center; }
      .ps-rmlist { display: flex; flex-direction: column; }
      .ps-rml { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: var(--pc-fs-sm);
                border-top: 1px solid var(--ps-hair-soft); cursor: pointer; }
      .ps-rml:first-child { border-top: 0; }
      .ps-rn { flex: 1; min-width: 0; }
      /* Fixed width so the numbers to its right stay in a column whether or
         not a room has history yet. */
      .ps-spark { flex: 0 0 56px; height: 18px; display: block; }
      .ps-spark svg { width: 56px; height: 18px; display: block; }
      .ps-rml .ps-v { font-weight: 660; font-variant-numeric: tabular-nums; }
      .ps-rml .ps-h { color: var(--ps-dim); font-size: var(--pc-fs-xs); font-variant-numeric: tabular-nums;
                      width: 46px; text-align: right; }

      /* sleep */
      .ps-jtop { display: flex; align-items: center; gap: 13px; }
      .ps-jn { font-size: var(--pc-fs-md); font-weight: 660; }
      .ps-js { font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums; margin-top: 2px; line-height: 1.4; }
      .ps-vits { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 12px; }
      .ps-vit { background: var(--ps-fill); border-radius: var(--pc-r-md); padding: 9px 10px; display: flex;
                flex-direction: column; gap: 2px; min-width: 0; cursor: pointer; }
      .ps-vk { font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-vv { font-size: var(--pc-fs-xl); font-weight: 640; font-variant-numeric: tabular-nums; letter-spacing: -.022em; line-height: 1.1; }
      .ps-vv small { font-size: var(--pc-fs-micro); font-weight: 500; color: var(--ps-muted); margin-left: 1px; }
      .ps-vd { font-size: var(--pc-fs-micro); font-variant-numeric: tabular-nums; }
      .ps-good { color: var(--ps-good); }
      .ps-flat { color: var(--ps-dim); }
      .ps-warnc { color: var(--ps-warn); }
      .ps-hyp { margin-top: 12px; display: flex; flex-direction: column; gap: 5px; }
      .ps-hyp svg { width: 100%; height: 46px; display: block; }
      .ps-hypt { display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
                 font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; min-height: 13px; }
      .ps-hypt i { width: 7px; height: 7px; border-radius: var(--pc-r-hair); display: inline-block; margin-right: 5px; }
      .ps-hypt span { display: inline-flex; align-items: center; }
      .ps-hypt b { color: var(--ps-text); font-weight: 650; }
      /* While scrubbing the caption becomes the value line, so make it read
         like one rather than like a muted label. */
      [data-readout].live { color: var(--ps-text); }
      [data-readout].live b { color: var(--ps-text); }
      .ps-jrs { display: flex; flex-direction: column; gap: 5px; }
      .ps-jr { display: flex; align-items: center; gap: 9px; background: var(--ps-fill); border-radius: var(--pc-r-sm);
               padding: 9px 11px; font-size: var(--pc-fs-sm); font-variant-numeric: tabular-nums; cursor: pointer; }
      .ps-jr .ps-l { color: var(--ps-muted); flex: 1; }
      .ps-jr .ps-v { font-weight: 650; }

      /* people */
      .ps-ppl { display: flex; gap: 8px; }
      .ps-pw { flex: 1; display: flex; align-items: center; gap: 9px; padding: 9px 11px; border-radius: var(--pc-r-lg);
               background: var(--ps-fill); min-width: 0; cursor: pointer; }
      .ps-av { width: 32px; height: 32px; border-radius: 50%; background: var(--pc-fill-3); display: grid;
               place-items: center; font-size: var(--pc-fs-sm); font-weight: 700; color: var(--ps-muted);
               flex: 0 0 auto; overflow: hidden; }
      .ps-pn { font-size: var(--pc-fs-md); font-weight: 650; line-height: 1.2; }
      .ps-pb { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .ps-pb.low { color: var(--ps-warn); }

      /* music */
      .ps-now { display: flex; align-items: center; gap: 11px; }
      .ps-art { width: 50px; height: 50px; border-radius: var(--pc-r-md); background: var(--pc-fill-2);
                display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden; }
      .ps-art .ps-ico { width: 23px; height: 23px; }
      .ps-nt { font-size: var(--pc-fs-lg); font-weight: 650; letter-spacing: -.014em; }
      .ps-ns { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .ps-tb { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center;
               background: var(--pc-fill-2); flex: 0 0 auto; }
      .ps-tb .ps-ico { width: 18px; height: 18px; }
      .ps-mroom { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
      .ps-mr { flex: 0 0 auto; padding: 10px 14px; border-radius: var(--pc-r-sm); background: var(--ps-fill);
               color: var(--ps-muted); font-size: var(--pc-fs-xs); font-weight: 650;
               display: inline-flex; align-items: center; gap: 6px; position: relative; }
      .ps-mr::after { content: ""; position: absolute; inset: -5px -3px; }
      .ps-mr.sel { background: rgba(77,208,225,.16); color: var(--ps-cool);
                   box-shadow: inset 0 0 0 1px rgba(77,208,225,.4); }
      .ps-live { width: 6px; height: 6px; border-radius: 50%; background: var(--ps-good); }
      .ps-pres { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-top: 7px; }
      .ps-pr { padding: 12px 11px; border-radius: var(--pc-r-md); background: var(--ps-fill); font-size: var(--pc-fs-sm);
               font-weight: 650; display: flex; align-items: center; gap: 8px; min-width: 0; position: relative; }
      .ps-pr ha-icon { --mdc-icon-size: 16px; color: var(--ps-cool); }

      /* rooms */
      .ps-rstrip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .ps-rc { min-width: 0; background: var(--ps-fill); border-radius: var(--pc-r-md);
               padding: 9px 11px; cursor: pointer; }
      .ps-rc.acc { background: rgba(77,208,225,.12); }
      .ps-rn2 { font-size: var(--pc-fs-micro); letter-spacing: .11em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-rc b { display: block; font-size: var(--pc-fs-xl); font-weight: 660; font-variant-numeric: tabular-nums;
                 letter-spacing: -.028em; margin-top: 3px; }
      .ps-rh { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; }

      /* quick */
      .ps-qgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .ps-qt { background: var(--ps-fill); border-radius: var(--pc-r-lg); padding: 11px 10px 12px; display: flex;
               flex-direction: column; gap: 7px; min-width: 0; position: relative; overflow: hidden; }
      .ps-qt ha-icon { --mdc-icon-size: 22px; color: var(--ps-dim); }
      .ps-qn { font-size: var(--pc-fs-xs); font-weight: 650; line-height: 1.2; }
      .ps-qv { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .ps-qt.on { background: rgba(242,193,78,.15); }
      .ps-qt.on ha-icon, .ps-qt.on .ps-qn { color: var(--ps-warn); }
      .ps-qt.alert { background: rgba(239,106,106,.15); }
      .ps-qt.alert ha-icon, .ps-qt.alert .ps-qn { color: var(--ps-bad); }
      .ps-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--pc-fill-3); }
      .ps-bar i { display: block; height: 100%; }

      /* calendar */
      .ps-cday { display: flex; gap: 11px; padding: 7px 0; border-top: 1px solid var(--ps-hair-soft); }
      .ps-cday:first-of-type { border-top: 0; }
      .ps-cdt { flex: 0 0 34px; text-align: center; }
      .ps-dw { font-size: var(--pc-fs-micro); letter-spacing: .12em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-dn { font-size: var(--pc-fs-xl); font-weight: 660; font-variant-numeric: tabular-nums; line-height: 1.2; }
      .ps-cdt.today .ps-dn { color: var(--ps-cool); }
      .ps-cev { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; justify-content: center; }
      .ps-ev { display: flex; align-items: center; gap: 8px; font-size: var(--pc-fs-sm); }
      .ps-ev i { width: 3px; height: 14px; border-radius: var(--pc-r-hair); flex: 0 0 auto; }
      .ps-et { margin-left: auto; color: var(--ps-dim); font-size: var(--pc-fs-micro); font-variant-numeric: tabular-nums; }
      .ps-ev.none { color: var(--ps-dim); font-size: var(--pc-fs-xs); }
      /* Days with nothing on them are summarised rather than drawn: five empty
         rows is a hundred pixels saying nothing. */
      .ps-cskip { font-size: var(--pc-fs-xs); color: var(--ps-dim); padding: 9px 0 2px; }

      /* systems */
      .ps-sub2 { font-size: var(--pc-fs-xs); color: var(--ps-dim); margin: -4px 0 9px; font-variant-numeric: tabular-nums; }
      .ps-sysrow { display: flex; align-items: center; gap: 10px; font-size: var(--pc-fs-sm); padding: 6px 0; cursor: pointer; }
      .ps-sysrow ha-icon { --mdc-icon-size: 16px; color: var(--ps-dim); }
      .ps-sn { color: var(--ps-muted); }
      .ps-sv { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 650; }
      .ps-meter { width: 54px; height: 3px; border-radius: var(--pc-r-hair); background: var(--pc-fill-3);
                  overflow: hidden; flex: 0 0 auto; }
      .ps-meter i { display: block; height: 100%; }
      .ps-faults { display: flex; flex-direction: column; gap: 5px; margin-bottom: 9px; }
      .ps-fault { display: flex; align-items: center; gap: 9px; font-size: var(--pc-fs-sm);
                  background: rgba(239,106,106,.12); border-radius: var(--pc-r-sm); padding: 8px 10px; cursor: pointer; }
      .ps-dotc { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
      .ps-dotc.bad, .ps-dotc.critical { background: var(--ps-bad); }
      .ps-dotc.warn { background: var(--ps-warn); }
      .ps-dotc.info { background: var(--ps-dim); }
      .ps-grp { display: flex; flex-direction: column; gap: 8px; padding-top: 10px;
                border-top: 1px solid var(--ps-hair-soft); }
      .ps-grp:first-child { border-top: 0; padding-top: 0; }
      .ps-grph { display: flex; align-items: center; gap: 9px; width: 100%; padding: 4px 0; }
      .ps-grph ha-icon { --mdc-icon-size: 17px; color: var(--ps-dim); }
      .ps-gn { font-size: var(--pc-fs-sm); font-weight: 660; flex: 1; }
      .ps-gcv { color: var(--ps-dim); display: flex; transition: transform .25s; }
      .ps-gcv .ps-ico { width: 14px; height: 14px; }
      .ps-grp.open .ps-gcv { transform: rotate(90deg); color: var(--ps-cool); }
      .ps-grpb { display: none; flex-direction: column; gap: 8px; }
      .ps-grp.open .ps-grpb { display: flex; }
      .ps-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
      .ps-st { background: var(--ps-fill); border-radius: var(--pc-r-sm); padding: 8px 10px; min-width: 0; cursor: pointer; }
      .ps-stk { display: block; font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase;
                color: var(--ps-dim); font-weight: 650; }
      .ps-stv { display: block; font-size: var(--pc-fs-md); font-weight: 650; font-variant-numeric: tabular-nums;
                margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ps-swrap { display: flex; flex-direction: column; gap: 6px; }
      .ps-sw { display: flex; align-items: center; gap: 9px; background: var(--ps-fill); border-radius: var(--pc-r-sm);
               padding: 9px 11px; font-size: var(--pc-fs-sm); }
      .ps-sw ha-icon { --mdc-icon-size: 16px; color: var(--ps-dim); }
      .ps-sw .ps-trunc { flex: 1; }
      .ps-link { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
                 color: var(--ps-dim); flex: 0 0 auto; }
      .ps-link .ps-ico { width: 13px; height: 13px; }
      .ps-knob { width: 38px; height: 22px; border-radius: var(--pc-r-pill); background: var(--pc-fill-3);
                 flex: 0 0 auto; }
      .ps-knob i { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
                   background: var(--ps-muted); display: block; transition: left .18s, background .18s; }
      .ps-knob.on { background: rgba(77,208,225,.4); }
      .ps-knob.on i { left: 19px; background: var(--ps-cool); }
      .ps-btns { display: flex; gap: 6px; flex-wrap: wrap; }
      .ps-btn { display: inline-flex; align-items: center; gap: 7px;
                padding: 11px 14px; border-radius: var(--pc-r-sm); background: var(--ps-fill);
                font-size: var(--pc-fs-sm); font-weight: 650; }
      .ps-btn:active { background: var(--pc-fill-3); }

      /* schedule */
      .ps-sched { display: flex; flex-direction: column; gap: 8px; }
      .ps-schedh { display: flex; align-items: center; gap: 8px; }
      .ps-schedh .ps-lbl { flex: 1; }
      .ps-schednow { font-size: var(--pc-fs-sm); color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .ps-schednow b { color: var(--ps-text); font-weight: 660; }
      .ps-timeline { position: relative; height: 28px; border-radius: var(--pc-r-xs); background: var(--ps-fill);
                     overflow: hidden; }
      .ps-seg { position: absolute; top: 3px; bottom: 3px; border-radius: 6px;
                background: rgba(77,208,225,.22); border: 1px solid rgba(77,208,225,.4);
                font-size: var(--pc-fs-micro); font-weight: 650; color: var(--ps-text);
                display: flex; align-items: center; justify-content: center;
                font-variant-numeric: tabular-nums; overflow: hidden; }
      .ps-seg.live { background: rgba(77,208,225,.4); border-color: var(--ps-cool); }
      .ps-nowline { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ps-warn); }
      .ps-tscale { display: flex; justify-content: space-between; font-size: var(--pc-fs-micro); color: var(--ps-dim);
                   font-variant-numeric: tabular-nums; }
      .ps-srs { display: flex; flex-direction: column; gap: 4px; }
      .ps-sr { display: flex; align-items: center; gap: 9px; background: var(--ps-fill); border-radius: var(--pc-r-sm);
               padding: 11px 10px; font-size: var(--pc-fs-sm); font-variant-numeric: tabular-nums;
               width: 100%; text-align: left; }
      .ps-sr.live { background: rgba(77,208,225,.13); }
      .ps-sr[disabled] { cursor: default; }
      .ps-srt { font-weight: 650; flex: 0 0 128px; }
      .ps-srv { flex: 1; color: var(--ps-muted); }
      .ps-srv i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin: 0 4px 0 0; }
      .ps-srv i.h { background: var(--ps-heat); }
      .ps-srv i.c { background: var(--ps-cool); margin-left: 10px; }
      .ps-srz { margin-left: 8px; color: var(--ps-dim); font-size: var(--pc-fs-micro); }

      /* television */
      .ps-tvrow { display: flex; align-items: center; gap: 10px; padding: 7px 0;
                  border-top: 1px solid var(--ps-hair-soft); }
      .ps-tvrow:first-of-type { border-top: 0; }
      .ps-tvrow > .ps-ico { color: var(--ps-dim); }
      .ps-tvn { display: block; font-size: var(--pc-fs-md); font-weight: 650; }
      .ps-tva { display: block; font-size: var(--pc-fs-xs); color: var(--ps-dim); }
      .ps-tvoff { width: 32px; height: 32px; border-radius: 50%; background: var(--pc-fill-2);
                  display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-tvoff:active { color: var(--ps-bad); }

      /* hold */
      .ps-hold { display: flex; align-items: center; gap: 9px; width: 100%; margin-top: 10px;
                 background: rgba(242,193,78,.13); color: var(--ps-warn); border-radius: var(--pc-r-sm);
                 padding: 10px 11px; font-size: var(--pc-fs-sm); font-weight: 650; }
      .ps-hold.armed { background: var(--ps-warn); color: #1a1a1a; }
      .ps-holdx { font-size: var(--pc-fs-sm); font-weight: 700; }

      /* devices */
      .ps-dev { border-top: 1px solid var(--ps-hair-soft); padding-top: 10px; margin-top: 10px; }
      .ps-dev:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
      .ps-devh { display: flex; align-items: center; gap: 10px; width: 100%; padding: 4px 0; }
      .ps-devi { width: 32px; height: 32px; border-radius: var(--pc-r-sm); background: var(--pc-fill-2);
                 display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-devi ha-icon { --mdc-icon-size: 17px; }
      .ps-devi.bad { background: rgba(239,106,106,.16); color: var(--ps-bad); }
      .ps-devn { display: block; font-size: var(--pc-fs-md); font-weight: 660; }
      .ps-devs { display: block; font-size: var(--pc-fs-xs); color: var(--ps-dim);
                 font-variant-numeric: tabular-nums; }
      .ps-devb { display: none; flex-direction: column; gap: 9px; margin-top: 9px; }
      .ps-dev.open .ps-devb { display: flex; }
      .ps-dev.open .ps-devh .ps-gcv { transform: rotate(90deg); color: var(--ps-cool); }
      .ps-dev .ps-sysrow { padding: 4px 0 0; }
      .ps-dev .ps-grp { padding-top: 0; border-top: 0; }
      .ps-sw.gone { opacity: .45; }

      /* schedule tabs */
      .ps-tabs { display: flex; flex-wrap: wrap; gap: 3px; background: var(--ps-fill);
                 border-radius: var(--pc-r-sm); padding: 3px; }
      .ps-tab { flex: 1 1 auto; min-width: 40px; border-radius: var(--pc-r-xs); padding: 9px 10px; font-size: var(--pc-fs-xs);
                font-weight: 650; color: var(--ps-muted); text-align: center; white-space: nowrap; position: relative; }
      .ps-tab::after { content: ""; position: absolute; inset: -5px -1px; }
      .ps-tab.on { background: var(--pc-fill-3); color: var(--ps-text);
                   box-shadow: inset 0 0 0 1px var(--ps-hair); }

      /* schedule editor */
      .ps-sedit { display: flex; flex-direction: column; gap: 9px; background: var(--ps-fill);
                  border-radius: var(--pc-r-md); padding: 11px; }
      .ps-sform { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .ps-sform label { display: flex; flex-direction: column; gap: 4px; font-size: var(--pc-fs-micro);
                        letter-spacing: .08em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      /* 16px, not a scale step: iOS Safari zooms the whole page when a focused
         field is smaller, and the view never zooms back out. */
      .ps-sform input { background: var(--pc-fill-2); color: var(--ps-text);
                        border: 1px solid var(--ps-hair); border-radius: var(--pc-r-sm); padding: 9px;
                        font: inherit; font-size: 16px; font-variant-numeric: tabular-nums;
                        color-scheme: dark; min-width: 0; }
      .ps-sform input:focus { outline: 2px solid var(--ps-cool); outline-offset: 1px; }
      .ps-snote { font-size: var(--pc-fs-xs); color: var(--ps-warn); }
      .ps-btn.primary { background: var(--ps-cool); color: #0f1317; }
      .ps-btn.danger { color: var(--ps-bad); }
      .ps-btn.armed { background: var(--ps-warn); color: #1a1a1a; }

      /* graph scrubber */
      /* The small-ring modifier. It was used by the nursery nap rings from the
         start and never defined, so a 36m nap rendered its number at the 2xl
         step inside a 52px ring and spilled over the stroke. */
      .ps-rv.sm b { font-size: var(--pc-fs-md); }
      .ps-rv.sm small { font-size: var(--pc-fs-micro); margin-top: 1px; }
      /* And one step is not enough, because the string is not one width: "36m"
         and "1h19m" differ by two thirds and the ring does not. A nap that
         crossed the hour drew five characters at the md step and overhung the
         stroke on both sides. The step follows the reading's LENGTH, not the
         ring's size. */
      .ps-rv.sm4 b { font-size: var(--pc-fs-sm); }
      .ps-rv.sm5 b { font-size: var(--pc-fs-xs); letter-spacing: -.04em; }

      /* Both nursery rails sit in a box, like every other panel on the card.
         Without it a rail reads as a bare line floating on the ground rather
         than a plot with an axis. */
      .ps-railbox { background: var(--ps-fill); border-radius: var(--pc-r-sm);
                    padding: 9px 10px 7px; }
      .ps-railticks { display: flex; justify-content: space-between; margin-top: 5px;
                      font-size: var(--pc-fs-micro); color: var(--ps-dim);
                      font-variant-numeric: tabular-nums; }

      /* ---------------------------------------------------------- weather --*/
      /* The reading, the seven-day tiles, and a capsule per day.
         The capsule gradient runs cool at the low end to heat at the high end,
         which is the same two-pole temperature language the rings and the
         climate chips already speak — the reference card this is adapted from
         used its own blue-to-sand ramp, and importing that would have made
         temperature mean one thing here and another everywhere else. */
      .ps-wxhero { display: flex; align-items: flex-start; gap: 10px; }
      .ps-wxheronum { min-width: 0; }
      .ps-wxbig { font-size: var(--pc-fs-3xl); font-weight: 640; letter-spacing: -.045em;
                  line-height: .94; font-variant-numeric: tabular-nums; }
      .ps-wxbig sup { font-size: .42em; font-weight: 600; letter-spacing: 0;
                      vertical-align: top; position: relative; top: .25em; }
      /* An unreporting sensor must not print its last number in the hero
         colour as though it were current. */
      .ps-wxbig.off { color: var(--ps-dim); }
      .ps-wxdelta { font-size: var(--pc-fs-xs); color: var(--ps-heat); font-weight: 640;
                    margin-top: 7px; font-variant-numeric: tabular-nums; }
      .ps-wxdelta.cool { color: var(--ps-cool); }
      /* One line. The real sensor name here is "Outside Thermometer & Humidity
         Temperature", which wrapped to two lines of uppercase micro type under
         the hero number — see _wxSrcName, which shortens it; this is the guard
         for whatever the next sensor is called. */
      .ps-wxsrc { font-size: var(--pc-fs-micro); color: var(--ps-dim); letter-spacing: .06em;
                  text-transform: uppercase; font-weight: 660; margin-top: 5px;
                  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                  max-width: 190px; }
      .ps-wxtiles { margin-left: auto; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 6px; min-width: 0; }
      .ps-wxtile { background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                   border-radius: var(--pc-r-sm); padding: 7px 8px 8px; min-width: 58px; }
      /* A truncated label is a MISSING label, and a wrapped one is worse — the
         three tiles read "MIN / 7D", "AVG / 7D", "MAX / 7D" stacked when the
         window was in the label. The window is named once, on the rail caption. */
      .ps-wxtile span { display: block; font-size: var(--pc-fs-micro); letter-spacing: .09em;
                        text-transform: uppercase; color: var(--ps-dim); font-weight: 660;
                        white-space: nowrap; }
      .ps-wxtile b { display: block; font-size: var(--pc-fs-lg); font-weight: 640; margin-top: 3px;
                     letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
      .ps-wxtile b.lo { color: var(--ps-cool); }
      .ps-wxtile b.hi { color: var(--ps-heat); }

      .ps-wxtabs { display: flex; gap: 6px; margin: 14px 0 0; }
      .ps-wxtab { font-size: var(--pc-fs-micro); font-weight: 660; padding: 5px 11px;
                  border-radius: var(--pc-r-pill); background: var(--pc-fill-1);
                  color: var(--ps-dim); border: 1px solid transparent; position: relative; }
      .ps-wxtab.on { background: rgba(77,208,225,.16); color: var(--ps-cool);
                     border-color: rgba(77,208,225,.28); }
      /* The drawn size stays; the target grows behind the paint. */
      .ps-wxtab::after { content: ""; position: absolute; inset: -9px -4px; }

      .ps-wxrh { display: flex; align-items: baseline; gap: 8px; margin: 14px 0 8px; }
      .ps-wxlb { font-size: var(--pc-fs-micro); letter-spacing: .14em; text-transform: uppercase;
                 color: var(--ps-dim); font-weight: 660; }
      .ps-wxrb { margin-left: auto; font-size: var(--pc-fs-micro); color: var(--ps-dim); }

      .ps-wxrail { display: grid; grid-template-columns: repeat(var(--n, 7), minmax(0, 1fr)); gap: 5px; }
      .ps-wxday { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
      .ps-wxhi, .ps-wxlo { font-size: var(--pc-fs-xs); font-variant-numeric: tabular-nums;
                           font-weight: 620; line-height: 1; color: var(--ps-muted); }
      .ps-wxlo { color: var(--ps-dim); font-weight: 600; }
      .ps-wxdw { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-weight: 660;
                 letter-spacing: .04em; }
      .ps-wxday.now .ps-wxhi { color: var(--ps-heat); }
      .ps-wxday.now .ps-wxdw { color: var(--ps-text); }
      .ps-wxi { --mdc-icon-size: 14px; color: var(--ps-muted); }
      .ps-wxpcp { font-size: var(--pc-fs-micro); color: var(--ps-cool); font-weight: 620;
                  font-variant-numeric: tabular-nums; }
      /* Holds the line's height so the day labels stay in a row when a provider
         publishes no probability at all. */
      .ps-wxpcp.none { visibility: hidden; }

      .ps-wxtrack { position: relative; width: 100%; max-width: 20px; height: 116px;
                    border-radius: var(--pc-r-pill); background: var(--ps-track); overflow: hidden; }
      /* A day the recorder has nothing for is hatched and empty. A flat capsule
         at the middle of the axis would be a claim about the weather. */
      .ps-wxtrack.empty { background: repeating-linear-gradient(135deg,
                            rgba(255,255,255,.05) 0 4px, transparent 4px 8px); }
      .ps-wxcap { position: absolute; left: 0; right: 0; border-radius: var(--pc-r-pill);
                  background: linear-gradient(to top, var(--ps-cool), #8fb9d8 42%,
                              #e8c39a 72%, var(--ps-heat)); }
      /* One end published and the other not: a marker at what is known, never a
         capsule running off to the edge of the track. */
      .ps-wxcap.stub { height: 4px; opacity: .75; }
      .ps-wxmark { position: absolute; left: -3px; right: -3px; height: 2px; z-index: 2;
                   background: #fff; border-radius: var(--pc-r-hair);
                   box-shadow: 0 0 6px rgba(255,255,255,.7); }

      /* The hourly strip SCROLLS sideways — twelve hours is not a day, and the
         provider publishes 168. Plain overflow-x and nothing else: setting
         touch-action here (even pan-x pan-y) restricts the element to panning
         and makes the browser's axis commitment stickier, so a slightly diagonal
         swipe locks to vertical and the strip goes dead. purdy-rooms-card's
         strip has always been plain flex + overflow-x and has always worked.
         overscroll-behavior-x stops a fling at the end becoming a page gesture. */
      .ps-wxhrs { display: flex; gap: 2px; align-items: flex-end;
                  overflow-x: auto; overscroll-behavior-x: contain;
                  scrollbar-width: none; padding-bottom: 2px; }
      .ps-wxhrs::-webkit-scrollbar { display: none; }
      .ps-wxhr { flex: 0 0 auto; width: 30px; display: flex; flex-direction: column;
                 align-items: center; gap: 3px; }
      /* A midnight column reads as "12a" whichever day it is the midnight of,
         which is exactly what you lose track of in a strip you have scrolled. */
      .ps-wxhr.nd { border-left: 1px solid var(--ps-hair); margin-left: 3px; padding-left: 3px; }
      .ps-wxht { font-size: var(--pc-fs-micro); color: var(--ps-muted); font-weight: 620;
                 font-variant-numeric: tabular-nums; line-height: 1; }
      .ps-wxhbar { width: 100%; height: 46px; display: flex; align-items: flex-end; }
      .ps-wxhbar i { width: 100%; border-radius: var(--pc-r-hair) var(--pc-r-hair) 0 0;
                     background: linear-gradient(to top, rgba(77,208,225,.35), var(--ps-heat)); }
      .ps-wxhp { font-size: var(--pc-fs-micro); color: var(--ps-cool); font-weight: 600;
                 font-variant-numeric: tabular-nums; line-height: 1; min-height: 10px; }
      .ps-wxhl { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-weight: 620;
                 line-height: 1; white-space: nowrap; }
      .ps-wxhr.now .ps-wxht { color: var(--ps-heat); }
      .ps-wxhr.now .ps-wxhl { color: var(--ps-text); }
      .ps-wxrows { display: flex; flex-direction: column; }
      .ps-wxrow { display: flex; align-items: center; gap: 9px; padding: 8px 0;
                  border-top: 1px solid var(--ps-hair-soft); font-size: var(--pc-fs-sm); }
      .ps-wxrow:first-child { border-top: 0; }
      .ps-wxrow .k { color: var(--ps-muted); flex: 1; min-width: 0; }
      .ps-wxrow .v { font-weight: 640; font-variant-numeric: tabular-nums; }
      .ps-wxrow .v.heat { color: var(--ps-heat); }
      .ps-wxrow .v.cool { color: var(--ps-cool); }
      .ps-wxrow .v.warn { color: var(--ps-warn); }
      .ps-wxrow .v.bad { color: var(--ps-bad); }
      .ps-wxnote { font-size: var(--pc-fs-xs); color: var(--ps-muted); margin-top: 9px;
                   line-height: 1.5; }
      .ps-wxempty { font-size: var(--pc-fs-xs); color: var(--ps-dim); line-height: 1.5;
                    padding: 14px 2px; text-align: center; }
      .ps-wxretry { display: inline-block; margin-left: 7px; color: var(--ps-cool);
                    font-weight: 650; text-decoration: underline; }

      /* nursery: nap rings and the one line of live status */
      .ps-naps { display: flex; gap: 8px; margin-top: 7px; }
      .ps-napr { display: flex; flex-direction: column; align-items: center; gap: 3px; }
      .ps-napr > span { font-size: var(--pc-fs-micro); font-variant-numeric: tabular-nums; }
      .ps-jstat { display: flex; justify-content: space-between; gap: 10px;
                  font-size: var(--pc-fs-xs); color: var(--ps-muted);
                  font-variant-numeric: tabular-nums; padding: 0 2px; }
      .ps-hypplot { position: relative; }
      /* Default to letting the browser scroll; claim the gesture only once a
         long press has deliberately entered scrub mode. */
      [data-scrub] { touch-action: auto; }
      [data-scrub].scrubbing { touch-action: none; }
      .ps-cross { position: absolute; top: 0; bottom: 0; width: 1px; z-index: 2; pointer-events: none;
                  background: rgba(255,255,255,.4); }

      /* saved playlists */
      .ps-pin { width: 38px; height: 38px; border-radius: 50%; background: var(--pc-fill-2);
                display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-pin.on { background: rgba(242,193,78,.17); color: var(--ps-warn); }
      .ps-pin .ps-ico { width: 18px; height: 18px; }
      .ps-prplay { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0;
                   font-size: var(--pc-fs-sm); font-weight: 650; padding-right: 18px; }
      .ps-prplay ha-icon { --mdc-icon-size: 16px; color: var(--ps-warn); }
      .ps-prx { position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
                width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
                color: var(--ps-dim); }
      .ps-prx .ps-ico { width: 11px; height: 11px; }

      /* search + lists */
      .ps-sbox { display: flex; align-items: center; gap: 8px; background: var(--ps-fill);
                 border-radius: var(--pc-r-md); padding: 0 11px; height: 44px; color: var(--ps-dim); }
      .ps-sbox input { flex: 1; min-width: 0; border: 0; background: none; outline: none;
                       font: inherit; font-size: 16px; color: var(--ps-text); height: 100%; }
      .ps-sbox input::placeholder { color: var(--ps-dim); }
      .ps-sclear { display: flex; color: var(--ps-dim); }
      .ps-note { font-size: var(--pc-fs-sm); color: var(--ps-dim); padding: 9px 2px; }
      .ps-mlist { display: flex; flex-direction: column; gap: 1px; }
      /* Nothing in the view scrolls sideways any more; only the sheet scrolls,
         and only downwards. */
      /* A row is a play button plus a queue button, not one button — "play it"
         and "play it after this" are both one tap, and neither is a gesture
         you have to know about. */
      .ps-mi { display: flex; align-items: center; gap: 4px; width: 100%; }
      .ps-miplay { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;
                   padding: 7px 4px; border-radius: var(--pc-r-sm); text-align: left; }
      .ps-miplay:active { background: var(--pc-fill-1); }
      .ps-miq { flex: 0 0 auto; width: 32px; height: 32px; border-radius: 50%;
                display: grid; place-items: center; color: var(--ps-dim); position: relative; }
      .ps-miq::after { content: ""; position: absolute; inset: -7px -4px; }
      .ps-miq:active { color: var(--ps-cool); }
      .ps-th { width: 34px; height: 34px; border-radius: var(--pc-r-xs); background: var(--pc-fill-2);
               display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden; }
      .ps-th .ps-ico { width: 15px; height: 15px; }
      .ps-min { display: block; font-size: var(--pc-fs-md); font-weight: 650; }
      .ps-mis { display: block; font-size: var(--pc-fs-xs); color: var(--ps-dim); }
      .ps-kind { flex: 0 0 auto; font-size: var(--pc-fs-micro); letter-spacing: .09em; text-transform: uppercase;
                 color: var(--ps-dim); background: var(--pc-fill-2); padding: 3px 7px; border-radius: var(--pc-r-pill); }

      /* music controls */
      .ps-transport { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 14px; }
      .ps-tb.big { width: 50px; height: 50px; }
      .ps-tb.big .ps-ico { width: 24px; height: 24px; }
      .ps-volmain { display: flex; align-items: center; gap: 11px; }
      .ps-vbtn { width: 36px; height: 36px; border-radius: 50%; background: var(--pc-fill-2);
                 display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-vbtn.muted { color: var(--ps-bad); }
      .ps-vol { flex: 1; min-width: 0; -webkit-appearance: none; appearance: none; height: 6px;
                border-radius: var(--pc-r-pill); background: var(--ps-track); outline: none; touch-action: pan-y; }
      .ps-vol::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px;
                border-radius: 50%; background: var(--ps-text); cursor: pointer; }
      .ps-vol::-moz-range-thumb { width: 20px; height: 20px; border: 0; border-radius: 50%;
                background: var(--ps-text); cursor: pointer; }
      .ps-vol:focus-visible { outline: 2px solid var(--ps-cool); outline-offset: 3px; }
      .ps-vnum { flex: 0 0 26px; text-align: right; font-size: var(--pc-fs-xs); color: var(--ps-dim);
                 font-variant-numeric: tabular-nums; }
      .ps-vrow { display: flex; align-items: center; gap: 10px; padding: 8px 0;
                 border-top: 1px solid var(--ps-hair-soft); }
      .ps-vrow:first-of-type { border-top: 0; }
      .ps-vname { flex: 0 0 96px; font-size: var(--pc-fs-sm); font-weight: 650; color: var(--ps-muted);
                  display: flex; align-items: center; gap: 6px; position: relative; }
      .ps-vname::after { content: ""; position: absolute; inset: -8px -4px; }
      .ps-vrow.on .ps-vname { color: var(--ps-text); }
      /* The target room is the one every control in the sheet acts on, so it
         has to be legible as such at a glance, not just a shade brighter. */
      .ps-vrow.on { box-shadow: inset 2px 0 0 var(--ps-cool); padding-left: 8px; }
      .ps-vrow.joined .ps-vname { color: var(--ps-cool); }

      /* grouping, queue and the transient confirmation line */
      .ps-jb, .ps-jspace { flex: 0 0 26px; height: 26px; }
      .ps-jb { border-radius: 50%; display: grid; place-items: center; position: relative;
               background: var(--pc-fill-2); color: var(--ps-dim); }
      .ps-jb::after { content: ""; position: absolute; inset: -9px -4px; }
      .ps-jb .ps-ico { width: 14px; height: 14px; }
      .ps-jb.on { background: rgba(77,208,225,.16); color: var(--ps-cool); }
      .ps-mr.grp { box-shadow: inset 0 0 0 1px rgba(77,208,225,.22); color: var(--ps-cool); }
      .ps-move { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
                 padding: 11px; margin-bottom: 12px; border-radius: var(--pc-r-md);
                 background: rgba(77,208,225,.13); color: var(--ps-cool);
                 font-size: var(--pc-fs-sm); font-weight: 650; }
      .ps-qbar { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; padding: 8px 10px;
                 border-radius: var(--pc-r-md); background: var(--pc-fill-1); }
      .ps-qb { flex: 0 0 auto; width: 28px; height: 28px; border-radius: 50%; display: grid;
               place-items: center; background: var(--pc-fill-2); color: var(--ps-dim); position: relative; }
      .ps-qb::after { content: ""; position: absolute; inset: -10px -4px; }
      .ps-qb .ps-ico { width: 15px; height: 15px; }
      .ps-qb.on { background: rgba(77,208,225,.16); color: var(--ps-cool); }
      .ps-qone { position: absolute; right: 0; bottom: -1px; font-size: var(--pc-fs-micro);
                 font-weight: 700; line-height: 1; }
      .ps-qup { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .ps-qpos { flex: 0 0 auto; font-size: var(--pc-fs-micro); color: var(--ps-dim);
                 font-variant-numeric: tabular-nums; }
      .ps-toast { margin-top: 10px; padding: 8px 11px; border-radius: var(--pc-r-sm);
                  background: rgba(77,208,225,.13); color: var(--ps-cool);
                  font-size: var(--pc-fs-xs); font-weight: 650; }

      /* search filters */
      .ps-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 9px 0 4px; }
      .ps-fc { padding: 6px 11px; border-radius: var(--pc-r-pill); background: var(--pc-fill-1);
               color: var(--ps-dim); font-size: var(--pc-fs-xs); font-weight: 650; position: relative; }
      .ps-fc::after { content: ""; position: absolute; inset: -7px -2px; }
      .ps-fc.on { background: rgba(77,208,225,.16); color: var(--ps-cool);
                  box-shadow: inset 0 0 0 1px rgba(77,208,225,.35); }

      /* alert sheet */
      .ps-scrim { position: fixed; inset: 0; background: rgba(4,6,10,.6); z-index: 8; backdrop-filter: blur(2px); }
      .ps-sheet {
        position: fixed; left: 12px; right: 12px; z-index: 9;
        /* Clears the dock AND the now-playing bar. A fixed 96px put the bottom
           of every sheet behind the mini bar whenever music was playing. */
        bottom: calc(var(--ps-dockh) + 22px + env(safe-area-inset-bottom, 0px));
        background: rgba(20,23,32,.96); border: 1px solid var(--pc-edge); border-radius: var(--pc-r-xl);
        padding: 13px 15px; box-shadow: 0 24px 60px rgba(0,0,0,.6);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        max-height: 60vh; overflow-y: auto; overscroll-behavior: contain;
      }
      .ps-sheet.tall { max-height: 74vh; }
      .ps-sheeth { display: flex; align-items: center; margin-bottom: 6px; }
      .ps-sheeth .ps-lbl { flex: 1; }
      .ps-x { width: 28px; height: 28px; border-radius: 50%; background: var(--pc-fill-2);
              display: grid; place-items: center; color: var(--ps-muted); }
      .ps-x .ps-ico { width: 14px; height: 14px; }
      .ps-ar { display: flex; align-items: center; gap: 9px; padding: 9px 0;
               border-top: 1px solid var(--ps-hair-soft); cursor: pointer; }
      .ps-ar:first-of-type { border-top: 0; }
      .ps-at { display: block; font-size: var(--pc-fs-md); font-weight: 650; }
      .ps-ad { display: block; font-size: var(--pc-fs-xs); color: var(--ps-muted); }

      /* crew — two independently expanding zones plus the washer strip.
         Every size, radius and fill is a token step; nothing loose. */
      .ps-cwgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
      .ps-cwcard { background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                   border-radius: var(--pc-r-lg); overflow: hidden; }
      .ps-cwcard.open { background: var(--pc-fill-2); border-color: rgba(77,208,225,.28); }
      .ps-cwface { display: block; width: 100%; text-align: left; padding: 12px 12px 11px; }
      .ps-cwtop { display: flex; align-items: center; gap: 7px; margin-bottom: 9px; }
      .ps-cwdot { width: 6px; height: 6px; border-radius: 50%; background: var(--ps-dim); flex: 0 0 auto; }
      .ps-cwdot.on { background: var(--ps-good); }
      .ps-cwnm { font-size: var(--pc-fs-xs); font-weight: 680; flex: 1; min-width: 0; }
      .ps-cwcv { color: var(--ps-dim); display: flex; flex: 0 0 auto; }
      .ps-cwcard.open .ps-cwcv { color: var(--ps-cool); }
      .ps-cwcv svg { transform: rotate(90deg); }
      .ps-cwcard.open .ps-cwcv svg { transform: rotate(-90deg); }
      .ps-cwring { position: relative; width: 92px; height: 92px; margin: 2px auto 9px; }
      .ps-cwrv { position: absolute; inset: 0; display: flex; flex-direction: column;
                 align-items: center; justify-content: center; line-height: 1.05; }
      .ps-cwrv b { font-size: var(--pc-fs-xl); font-weight: 680; font-variant-numeric: tabular-nums; }
      .ps-cwrv span { font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase;
                      color: var(--ps-dim); font-weight: 650; margin-top: 3px; }
      .ps-cwl { display: flex; align-items: baseline; gap: 6px; font-size: var(--pc-fs-xs);
                padding-top: 4px; border-top: 1px solid var(--ps-hair-soft); }
      .ps-cwl em { font-style: normal; color: var(--ps-dim); flex: 1; min-width: 0; }
      .ps-cwl b { font-weight: 650; font-variant-numeric: tabular-nums; min-width: 0; }
      .ps-cwl b.warn { color: var(--ps-warn); }

      /* The panel is full width UNDER the grid, never inside a 50% card —
         squeezing dispatch into half the screen is what wrapped the room
         chips six rows deep. */
      .ps-cwpanel { margin-top: 11px; padding-top: 12px;
                    border-top: 1px solid var(--ps-hair); }
      .ps-cwsub { font-size: var(--pc-fs-micro); letter-spacing: .13em; text-transform: uppercase;
                  color: var(--ps-dim); font-weight: 650; padding: 13px 0 7px; }
      .ps-cwhero { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
                   background: linear-gradient(150deg, rgba(77,208,225,.14), rgba(77,208,225,.04));
                   border: 1px solid rgba(77,208,225,.22); border-radius: var(--pc-r-lg);
                   padding: 12px 13px; }
      .ps-cwplay { width: 40px; height: 40px; border-radius: 50%; flex: 0 0 auto;
                   background: var(--ps-cool); color: #06131a; display: grid; place-items: center; }
      .ps-cwplay .ps-ico { width: 18px; height: 18px; }
      .ps-cwplay .ps-ico path { fill: currentColor; stroke: none; }
      .ps-cwtabs { display: flex; gap: 6px; margin-top: 11px; }
      .ps-cwtab { font-size: var(--pc-fs-xs); font-weight: 680; padding: 5px 12px;
                  border-radius: var(--pc-r-pill); background: var(--pc-fill-1);
                  color: var(--ps-dim); }
      .ps-cwtab.on { background: var(--pc-fill-3); color: var(--ps-text); }
      .ps-cwrooms { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .ps-cwroom { font-size: var(--pc-fs-xs); font-weight: 650; padding: 6px 10px;
                   border-radius: var(--pc-r-pill); background: var(--pc-fill-2);
                   color: var(--ps-muted); border: 1px solid transparent; }
      .ps-cwroom.on { background: rgba(77,208,225,.15); color: var(--ps-cool);
                      border-color: rgba(77,208,225,.3); }
      /* auto-fit with a floor, not a fixed 1fr 1fr: a third button squeezed
         three into a 340px row and clipped "Emptied tank" to "Emptied ta…".
         A truncated label is a MISSING label, not a smaller one — same fix as
         the desk card's room and quick strips. */
      .ps-cwpair { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
                   gap: 9px; margin-top: 10px; }
      .ps-cwbtn { display: flex; align-items: center; gap: 9px; background: var(--pc-fill-2);
                  border: 1px solid var(--pc-edge); border-radius: var(--pc-r-md);
                  padding: 11px 12px; color: var(--ps-muted); font-size: var(--pc-fs-sm);
                  font-weight: 650; }
      .ps-cwbtn ha-icon { --mdc-icon-size: 17px; }
      .ps-cwnote { font-size: var(--pc-fs-xs); color: var(--ps-warn); margin-top: 10px; }

      .ps-cwchart { display: block; width: 100%; height: 56px; }
      .ps-cwaxis { display: flex; justify-content: space-between; font-size: var(--pc-fs-micro);
                   color: var(--ps-dim); font-variant-numeric: tabular-nums; margin-top: 2px; }
      /* An empty box, never a flat line — a straight line through the middle
         is a claim about the cat. */
      .ps-cwempty { height: 56px; border-radius: var(--pc-r-sm); background: var(--pc-fill-1);
                    display: grid; place-items: center; font-size: var(--pc-fs-xs);
                    color: var(--ps-dim); }

      .ps-cwwash { display: flex; align-items: center; gap: 10px; margin-top: 11px;
                   background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                   border-radius: var(--pc-r-md); padding: 10px 12px; }
      .ps-cwwash.alert { background: rgba(242,193,78,.10); border-color: rgba(242,193,78,.24); }
      .ps-cwbadge { width: 34px; height: 34px; border-radius: var(--pc-r-sm); display: grid;
                    place-items: center; background: var(--pc-fill-2); color: var(--ps-muted); flex: 0 0 auto; }
      .ps-cwbadge ha-icon { --mdc-icon-size: 18px; }
      .ps-cwt { font-size: var(--pc-fs-md); font-weight: 650; }
      .ps-cwd { font-size: var(--pc-fs-xs); color: var(--ps-dim); margin-top: 1px; }

      /* fade + dock
       *
       * The dock is STICKY, not fixed, and that is a bug fix rather than a
       * preference. Reported as the nav bar sitting a third of the way up the
       * screen with taps falling through to the tiles behind it — and the fade
       * had moved up with it, which is the tell: one composited layer glitching
       * moves alone, TWO fixed layers landing at the same wrong offset means
       * the fixed containing block itself was wrong. Something in HA's own
       * chrome (this install hides the header, so whatever does that is the
       * first suspect) establishes a containing block, and position:fixed then
       * resolves against it instead of against the viewport. Paint follows that
       * box; hit-testing did not, which is exactly the tap-through.
       *
       * Sticky has no containing-block chain to get wrong — it resolves against
       * the scrollport — so it is immune to the whole class of bug. It also
       * costs nothing here: :host is min-height 100vh, so the dock can always
       * travel to the bottom of the viewport, and being in flow means it
       * reserves its own room instead of :host guessing at it.
       *
       * The fade rides along as a pseudo-element for the same reason. Left as
       * its own fixed layer it would simply desync from the dock again.
       */
      .ps-dockwrap { position: sticky; z-index: 7;
                     bottom: calc(12px + env(safe-area-inset-bottom, 0px));
                     margin: 14px 6px 0;
                     display: flex; flex-direction: column; gap: 9px; }
      .ps-dockwrap::before {
        content: ""; position: absolute; z-index: -1; pointer-events: none;
        left: -12px; right: -12px; top: -76px;
        bottom: calc(-12px - env(safe-area-inset-bottom, 0px));
        background: linear-gradient(180deg, transparent, rgba(6,7,14,.72) 46%, rgba(6,7,14,.94)); }
      .ps-mini { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--pc-r-xl);
                 background: var(--pc-fill-2); border: 1px solid var(--pc-edge); cursor: pointer;
                 backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3);
                 box-shadow: 0 12px 30px -8px rgba(0,0,0,.6); }
      .ps-mart { width: 32px; height: 32px; border-radius: var(--pc-r-sm); background: var(--pc-fill-2);
                 display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden; }
      .ps-mart .ps-ico { width: 15px; height: 15px; }
      .ps-mt { font-size: var(--pc-fs-sm); font-weight: 650; line-height: 1.2; }
      .ps-ms { font-size: var(--pc-fs-micro); color: var(--ps-dim); }
      .ps-mb { width: 32px; height: 32px; border-radius: 50%; background: var(--pc-fill-3);
               display: grid; place-items: center; flex: 0 0 auto; }
      .ps-mb .ps-ico { width: 15px; height: 15px; }
      .ps-dock { display: flex; align-items: center; justify-content: space-between; gap: 2px;
                 padding: 9px 10px; border-radius: var(--pc-r-2xl);
                 background: var(--pc-fill-2); border: 1px solid var(--pc-edge);
                 backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3);
                 box-shadow: 0 16px 40px -10px rgba(0,0,0,.65); }
      .ps-db { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
               padding: 5px 0; border-radius: var(--pc-r-lg); color: var(--ps-dim); }
      .ps-db ha-icon { --mdc-icon-size: 20px; }
      .ps-db span { font-size: var(--pc-fs-micro); letter-spacing: .01em; font-weight: 650; }
      .ps-db.on { color: var(--ps-cool); background: rgba(77,208,225,.13); }
      .ps-db.alert { color: var(--ps-bad); }

      /* a sheet hosting an existing card — the card brings its own surface,
         so the host adds nothing but room */
      .ps-host { margin: 2px -4px 0; }
      .ps-host > * { display: block; }

      /* now playing — music and television in one list */
      .ps-npr {
        display: flex; align-items: center; gap: 11px; padding: 8px 2px;
        cursor: pointer;
      }
      .ps-npr + .ps-npr { border-top: 1px solid var(--ps-hair); }
      .ps-npart {
        width: 42px; height: 42px; flex: 0 0 42px; border-radius: var(--pc-r-xs); overflow: hidden;
        background: var(--pc-chip); display: flex; align-items: center; justify-content: center;
        color: var(--ps-dim);
      }
      .ps-npart img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .ps-npart svg { width: 20px; height: 20px; }
      /* App logos are authored full-bleed, so they fill the tile. */
      .ps-npapp { background: transparent; }
      .ps-npapp svg { width: 100%; height: 100%; }
      .ps-npt { font-size: var(--pc-fs-md); font-weight: 600; }
      .ps-nps { font-size: var(--pc-fs-xs); color: var(--ps-dim); margin-top: 1px; }
      .ps-npb {
        flex: 0 0 auto; width: 36px; height: 36px; border-radius: 50%;
        border: 1px solid var(--pc-line); background: var(--pc-chip);
        color: var(--ps-text); display: flex; align-items: center; justify-content: center;
        cursor: pointer;
      }
      .ps-npb svg { width: 15px; height: 15px; }

      /* missing data — deliberately quiet, but never mistakable for a value */
      .ps-nodata { color: var(--ps-dim); font-weight: 500; }
      .ps-nohist {
        padding: 14px 2px; text-align: center; font-size: var(--pc-fs-sm);
        color: var(--ps-dim); font-style: italic;
      }
      .ps-schedfail { padding: 4px 2px 8px; }
      .ps-schedfail p { margin: 8px 0 10px; font-size: var(--pc-fs-md); color: var(--ps-dim); }

      /* lights — the row is a lit room, not a progress bar. There is no fill
         and no track: a glow starts at the bulb and falls off, and an off
         light is dark rather than zero percent. */
      .pl-moods { display: flex; gap: 6px; margin-bottom: 9px; }
      .pl-mood { flex: 1; padding: 9px 4px 8px; border-radius: var(--pc-r-sm);
                 background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                 color: var(--ps-muted); display: flex; flex-direction: column;
                 align-items: center; gap: 5px; transition: .18s; }
      .pl-mood ha-icon { --mdc-icon-size: 17px; }
      .pl-mood span { font-size: var(--pc-fs-micro); font-weight: 650; letter-spacing: .02em; }
      .pl-mood.on { background: rgba(255,199,125,.14); border-color: rgba(255,199,125,.34);
                    color: #FFC77D; }

      .pl-rows { display: flex; flex-direction: column; gap: 5px; }
      /* pan-y, never none: the page has to keep scrolling until a deliberate
         horizontal drag starts, and a gesture cannot be reclaimed once the
         browser has decided it is a scroll. */
      .pl-row { position: relative; border-radius: var(--pc-r-md); overflow: hidden;
                background: rgba(255,255,255,.026); border: 1px solid rgba(255,255,255,.06);
                touch-action: pan-y; user-select: none; -webkit-user-select: none;
                transition: border-color .3s, box-shadow .3s, background .3s; }
      .pl-glow { position: absolute; inset: 0; opacity: 0; transform: scale(.94);
                 transform-origin: 22px 50%;
                 transition: opacity .32s cubic-bezier(.2,.7,.3,1),
                             transform .32s cubic-bezier(.2,.7,.3,1), background .25s; }
      .pl-row.on .pl-glow { opacity: 1; transform: none; }
      .pl-row.dragging .pl-glow { transition: background .05s; }
      .pl-face { position: relative; display: flex; align-items: center; gap: 12px;
                 padding: 0 14px; height: 58px; }
      .pl-clus { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; width: 26px; }
      .pl-pip { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.13);
                transition: background .3s, box-shadow .35s; }
      .pl-clus.solo .pl-pip { width: 11px; height: 11px; }
      .pl-txt { flex: 1; min-width: 0; }
      .pl-t1 { font-size: var(--pc-fs-md); font-weight: 620; letter-spacing: -.01em;
               color: var(--ps-muted); transition: color .3s;
               text-shadow: 0 1px 4px rgba(0,0,0,.6); }
      .pl-row.on .pl-t1 { color: var(--ps-text); }
      .pl-t2 { font-size: var(--pc-fs-micro); margin-top: 3px; letter-spacing: .05em;
               color: var(--ps-dim); text-shadow: 0 1px 4px rgba(0,0,0,.6); }
      .pl-row.on .pl-t2 { color: rgba(255,255,255,.6); }
      /* small at rest so the name leads, large while adjusting so it is precise */
      .pl-kv { font-size: var(--pc-fs-sm); font-weight: 660; font-variant-numeric: tabular-nums;
               color: rgba(255,255,255,.9); text-shadow: 0 1px 4px rgba(0,0,0,.7);
               opacity: 0; transition: opacity .3s, font-size .18s; }
      .pl-row.on .pl-kv { opacity: 1; }
      .pl-row.dragging .pl-kv { font-size: var(--pc-fs-2xl); letter-spacing: -.03em; }
      .pl-row.dragging .pl-txt { opacity: .35; transition: opacity .18s; }
      .pl-row.na { opacity: .4; }
      .pl-det { position: absolute; top: 0; bottom: 0; width: 1px;
                background: rgba(255,255,255,.16); opacity: 0; transition: opacity .18s; }
      .pl-row.dragging .pl-det { opacity: 1; }

      /* No height transition, and no height CAP.
       *
       * A max-height 0 -> 150px with a .3s transition looked right in the
       * mockup and was wrong in the card: the shell PATCHES, so every repaint
       * replaces this node and the transition restarts from zero. The panel
       * re-animated on every state change, the chips slid vertically under the
       * thumb, and a tap aimed at a lamp landed on the row behind it — which
       * toggles the whole GROUP. That is the "clicking a light turns them all
       * off" report; both members moving within 25ms in the recorder is the
       * signature of the group call.
       *
       * The cap was a second bug on its own: Basement has five members, so the
       * chips wrap past 150px and the warmth track was simply cut off. */
      .pl-more { position: relative; display: none; }
      .pl-row.open .pl-more { display: block; }
      .pl-mb { padding: 0 14px 13px; display: flex; flex-direction: column; gap: 11px; }
      .pl-kids { display: flex; flex-wrap: wrap; gap: 5px; }
      .pl-kid { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px;
                border-radius: var(--pc-r-pill); font-size: var(--pc-fs-xs); font-weight: 600;
                background: rgba(255,255,255,.07); border: 1px solid var(--pc-edge);
                color: var(--ps-muted); }
      .pl-kid.on { background: rgba(255,199,125,.18); border-color: rgba(255,199,125,.34);
                   color: #FFC77D; }
      .pl-kid.na { opacity: .42; text-decoration: line-through; }
      .pl-warmrow { display: flex; align-items: center; gap: 10px; }
      .pl-warm { flex: 1; height: 14px; border-radius: var(--pc-r-pill); position: relative;
                 touch-action: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,.28);
                 background: linear-gradient(90deg,#FF9536,#FFC489,#FFF0DC,#E4EFFF,#C6DDFF); }
      .pl-g { position: absolute; top: 50%; transform: translate(-50%,-50%); width: 16px;
              height: 16px; border-radius: 50%; background: #fff;
              box-shadow: 0 1px 6px rgba(0,0,0,.7); }
      .pl-warmrow em { font-style: normal; font-size: var(--pc-fs-micro);
                       color: rgba(255,255,255,.7); font-variant-numeric: tabular-nums;
                       min-width: 42px; text-align: right; letter-spacing: .03em; }
      .pl-warmrow em.pl-none { min-width: 0; text-align: left; color: var(--ps-dim); }

      /* the guard. Covers the LEVEL as well as the switch — a thumb dragging a
         guarded light to 80% at 2am is the likelier accident of the two. */
      .pl-row.on[data-guard="1"] { border-color: rgba(239,106,106,.32); }
      .pl-ask { margin-top: 5px; border-radius: var(--pc-r-md); overflow: hidden;
                background: rgba(239,106,106,.09); border: 1px solid rgba(239,106,106,.36); }
      .pl-ab { padding: 12px 14px 10px; display: flex; gap: 11px; }
      .pl-amk { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%; display: grid;
                place-items: center; background: rgba(239,106,106,.2); color: var(--ps-bad); }
      .pl-amk ha-icon { --mdc-icon-size: 16px; }
      .pl-ask b { display: block; font-size: var(--pc-fs-sm); font-weight: 660; color: #FFB4B4; }
      .pl-ask p { margin: 4px 0 0; font-size: var(--pc-fs-xs); line-height: 1.5;
                  color: rgba(255,255,255,.66); }
      .pl-arow { display: flex; gap: 7px; padding: 0 14px 12px; }
      .pl-abtn { flex: 1; padding: 9px; border-radius: var(--pc-r-sm); font-size: var(--pc-fs-xs);
                 font-weight: 650; border: 1px solid var(--pc-edge); background: var(--pc-fill-2);
                 color: var(--ps-text); }
      .pl-abtn.go { background: rgba(239,106,106,.2); border-color: rgba(239,106,106,.44);
                    color: #FFC2C2; }

      /* ---------------------------------------------------- systems mode --*/
      /* A page is not a section: no hairline between siblings (there is only
         ever one), and it owns its own vertical rhythm. */
      .ps-sypage { padding: 4px 13px 15px; display: flex; flex-direction: column; gap: 9px; overflow-x: clip; }
      .ps-syh { font-size: var(--pc-fs-2xl); font-weight: 640; letter-spacing: -.028em; margin: 1px 0 0; line-height: 1.1; }

      /* The glass sub-panel the pages are built from. One step darker than the
         column it sits in, so the page reads as blocks rather than as a wall. */
      .ps-sycard { background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                   border-radius: var(--pc-r-xl); padding: 11px 12px;
                   display: flex; flex-direction: column; gap: 8px; }
      .ps-syrow { display: flex; align-items: center; justify-content: space-between; gap: 9px; width: 100%; }
      .ps-sysub { font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .ps-sysub b { color: var(--ps-text); font-weight: 640; }
      .ps-syhair { height: 1px; background: var(--ps-hair); }
      .ps-symeta { display: block; font-size: var(--pc-fs-micro); color: var(--ps-dim);
                   font-variant-numeric: tabular-nums; margin-top: 1px; }

      .ps-syid { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
      .ps-syid > div { min-width: 0; cursor: pointer; }
      .ps-syk { display: block; font-size: var(--pc-fs-micro); letter-spacing: .1em;
                text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-syid b { font-size: var(--pc-fs-md); font-weight: 640; }
      .ps-syid em { font-style: normal; font-size: var(--pc-fs-xs); color: var(--ps-warn); }
      .ps-syreg { display: flex; align-items: center; gap: 8px; font-size: var(--pc-fs-sm);
                  color: var(--ps-warn); cursor: pointer; }
      .ps-syreg b { color: var(--ps-text); font-weight: 650; }

      /* A meter whose subject IS the fill gets the full width. The 54px inline
         bar is right for a row in a list of other things and wrong here. */
      .ps-syb { display: grid; grid-template-columns: 1fr auto; gap: 3px 9px; cursor: pointer; padding: 2px 0; }
      .ps-sybk { font-size: var(--pc-fs-sm); color: var(--ps-muted); min-width: 0;
                 overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ps-sybk i { font-style: normal; color: var(--ps-dim); font-size: var(--pc-fs-xs); }
      .ps-sybv { font-size: var(--pc-fs-sm); font-weight: 650; font-variant-numeric: tabular-nums; }
      .ps-sybv.warn { color: var(--ps-warn); } .ps-sybv.bad { color: var(--ps-bad); }
      /* A disk whose SMART is not PASSED: the number may be fine and the drive
         is not, so the colour goes on the name rather than on the fill. */
      .ps-syb-bad .ps-sybk { color: var(--ps-bad); }
      .ps-sybar { grid-column: 1 / -1; height: 5px; border-radius: var(--pc-r-pill);
                  background: var(--ps-track); overflow: hidden; position: relative; }
      .ps-sybar.tall { height: 7px; }
      .ps-sybar i { display: block; height: 100%; border-radius: var(--pc-r-pill); background: var(--ps-good); }
      .ps-sybar i.warn { background: var(--ps-warn); }
      .ps-sybar i.bad { background: var(--ps-bad); }
      .ps-sybar i.fan { background: var(--ps-deep); }

      .ps-sytot { display: flex; flex-direction: column; gap: 1px; }
      .ps-sybig { font-size: var(--pc-fs-2xl); font-weight: 640; letter-spacing: -.028em;
                  font-variant-numeric: tabular-nums; cursor: pointer; }
      .ps-sybig small { font-size: var(--pc-fs-sm); font-weight: 500; color: var(--ps-muted); margin-left: 3px; }
      .ps-sytog { cursor: pointer; }
      .ps-syshare { font-size: var(--pc-fs-sm); cursor: pointer; }
      .ps-syshare b { font-variant-numeric: tabular-nums; font-weight: 650; }

      .ps-vits.two { grid-template-columns: repeat(2, 1fr); }
      .ps-sw.off { opacity: .62; }
      .ps-sw .ps-grow { min-width: 0; cursor: pointer; }

      .ps-sycpu { font-size: var(--pc-fs-md); font-weight: 650; }
      .ps-syhero { font-size: var(--pc-fs-2xl); font-weight: 640; letter-spacing: -.028em;
                   font-variant-numeric: tabular-nums; text-align: right; }
      .ps-syhero.live { color: var(--ps-cool); }
      .ps-syhero span { display: block; font-size: var(--pc-fs-micro); font-weight: 500; color: var(--ps-muted); }
      /* No touch-action here. The graph must not claim the gesture until a
         deliberate press has completed — see _bindScrub. */
      .ps-sygraph { position: relative; width: 100%; }
      .ps-sygraph svg { width: 100%; height: 46px; display: block; }

      .ps-syfans { display: grid; grid-template-columns: auto 1fr auto; gap: 6px 10px; align-items: center; }
      .ps-syfk { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .ps-syfv { font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums;
                 white-space: nowrap; }
      .ps-syfv b { color: var(--ps-text); font-weight: 640; }
      /* A channel nobody can hear back from is not a stopped fan. */
      .ps-syfv em { font-style: normal; color: var(--ps-dim); }
      .ps-syq2 { font-style: normal; color: var(--ps-dim); letter-spacing: .06em; }

      .ps-syn { display: flex; align-items: flex-start; gap: 9px; padding: 5px 0; }
      .ps-syn + .ps-syn { border-top: 1px solid var(--ps-hair-soft); }
      .ps-synt { display: block; font-size: var(--pc-fs-sm); line-height: 1.4; }

      /* Home exits the mode rather than switching within it, so it must not
         read as a sixth peer. */
      .ps-db.home { color: var(--ps-text); }
      .ps-db.home ha-icon { background: var(--pc-fill-2); border-radius: var(--pc-r-xs); padding: 3px; }


      /* ------------------------------------------------------------ weather --
       * Condition-driven precipitation over the ground. Adapted from the
       * technique the open HA animated cards use: discrete elongated drops
       * scattered in a repeating tile, two layers at different speed and alpha
       * for parallax. NOT a repeating-linear-gradient hatch — that has no gaps,
       * so there are no individual drops to see, and its Ndeg argument sets the
       * gradient AXIS, which puts the stripes perpendicular to the angle asked
       * for (14deg draws near-horizontal bands, i.e. scanlines).
       *
       * Three rules are load-bearing:
       *
       *   - It rides .ps-ground, which _mount builds once and no patch ever
       *     rewrites, driven by one data-wx attribute write. An animation
       *     inside a patched string restarts from zero on every state change —
       *     that was the v1.45.2 lamp chip, and it is why this is not drawn
       *     inside the weather section.
       *
       *   - Travel is exactly one tile height, so the loop is seamless. A
       *     SLANTED tile cannot loop on a vertical translate: the skewed
       *     lattice lands off its own period and the pattern visibly jumps
       *     every cycle. So the drops fall straight down, which is also how
       *     rain reads through a window on a still day.
       *
       *   - .ps-ground is position:fixed, so both layers stay viewport-sized
       *     however tall the column grows. An absolute layer on a 3000px
       *     column would hand the compositor a 3400px texture twice over.
       */
      /* In FRONT of the glass column, not behind it. The column carries
         backdrop-filter: blur(26px), which turns a 1px rain streak into
         nothing at all — a ground layer is invisible under frosted glass,
         which a mockup without the blur cannot show you. z-index 6 puts it
         over the column but under the dock (7), the scrim (8) and the
         sheets (9), so opening a sheet covers the weather rather than
         competing with it. */
      .ps-wxfx {
        position: fixed; inset: 0; z-index: 6; pointer-events: none; overflow: hidden;
      --ps-wx-rain-near:
        radial-gradient(ellipse 1.24px 15.5px at 38.2px 182.7px,rgba(200,224,255,0.39) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.02px 9.5px at 136.9px 72.2px,rgba(200,224,255,0.62) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.18px 12.8px at 155.6px 106.3px,rgba(200,224,255,0.53) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.17px 12.3px at 124.4px 156.0px,rgba(200,224,255,0.58) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.04px 14.2px at 58.0px 96.3px,rgba(200,224,255,0.58) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.39px 9.9px at 57.3px 35.8px,rgba(200,224,255,0.49) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.05px 13.4px at 73.0px 21.6px,rgba(200,224,255,0.57) 0%,rgba(200,224,255,0) 100%);
      --ps-wx-rain-near-size: 160px 200px;
      --ps-wx-rain-far:
        radial-gradient(ellipse 0.81px 5.3px at 33.6px 55.3px,rgba(200,224,255,0.26) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.92px 5.4px at 118.5px 17.0px,rgba(200,224,255,0.19) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.81px 6.4px at 110.3px 54.1px,rgba(200,224,255,0.23) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.84px 7.7px at 89.9px 78.5px,rgba(200,224,255,0.22) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.93px 5.1px at 17.8px 146.6px,rgba(200,224,255,0.20) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.72px 6.4px at 17.6px 115.2px,rgba(200,224,255,0.29) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.99px 5.2px at 112.9px 145.7px,rgba(200,224,255,0.21) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.76px 8.4px at 108.6px 6.4px,rgba(200,224,255,0.18) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.93px 8.8px at 39.6px 174.3px,rgba(200,224,255,0.26) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.88px 7.3px at 21.6px 92.4px,rgba(200,224,255,0.22) 0%,rgba(200,224,255,0) 100%);
      --ps-wx-rain-far-size: 140px 200px;
      --ps-wx-pour-near:
        radial-gradient(ellipse 1.41px 21.3px at 35.8px 182.7px,rgba(200,224,255,0.43) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.13px 13.6px at 128.4px 72.2px,rgba(200,224,255,0.68) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.33px 17.9px at 145.9px 106.3px,rgba(200,224,255,0.58) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.31px 17.3px at 116.6px 156.0px,rgba(200,224,255,0.64) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.15px 19.7px at 54.4px 96.3px,rgba(200,224,255,0.64) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.59px 14.1px at 53.7px 35.8px,rgba(200,224,255,0.54) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.16px 18.6px at 68.4px 21.6px,rgba(200,224,255,0.62) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.56px 15.4px at 12.7px 121.1px,rgba(200,224,255,0.57) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.36px 19.4px at 52.9px 62.6px,rgba(200,224,255,0.50) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.41px 16.4px at 23.7px 174.8px,rgba(200,224,255,0.68) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.23px 21.3px at 72.7px 35.6px,rgba(200,224,255,0.57) 0%,rgba(200,224,255,0) 100%);
      --ps-wx-pour-near-size: 150px 200px;
      --ps-wx-pour-far:
        radial-gradient(ellipse 0.91px 7.4px at 31.2px 55.3px,rgba(200,224,255,0.30) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.02px 7.5px at 110.1px 17.0px,rgba(200,224,255,0.23) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.91px 8.8px at 102.4px 54.1px,rgba(200,224,255,0.27) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.94px 10.3px at 83.4px 78.5px,rgba(200,224,255,0.26) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.03px 7.2px at 16.5px 146.6px,rgba(200,224,255,0.24) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.82px 8.8px at 16.3px 115.2px,rgba(200,224,255,0.33) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.09px 7.2px at 104.9px 145.7px,rgba(200,224,255,0.25) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.86px 11.3px at 100.8px 6.4px,rgba(200,224,255,0.22) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.03px 11.7px at 36.8px 174.3px,rgba(200,224,255,0.30) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.98px 9.9px at 20.1px 92.4px,rgba(200,224,255,0.26) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.94px 7.2px at 33.0px 123.5px,rgba(200,224,255,0.31) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.01px 9.0px at 17.9px 7.1px,rgba(200,224,255,0.28) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.84px 7.8px at 36.4px 199.0px,rgba(200,224,255,0.21) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.90px 10.7px at 67.1px 55.6px,rgba(200,224,255,0.27) 0%,rgba(200,224,255,0) 100%);
      --ps-wx-pour-far-size: 130px 200px;
      --ps-wx-snow-near:
        radial-gradient(ellipse 2.48px 1.7px at 37.8px 199.5px,rgba(255,255,255,0.51) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.72px 1.9px at 41.7px 3.2px,rgba(255,255,255,0.56) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 2.23px 2.5px at 59.9px 163.0px,rgba(255,255,255,0.43) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 2.53px 2.2px at 93.7px 197.4px,rgba(255,255,255,0.34) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 2.47px 1.7px at 128.9px 123.5px,rgba(255,255,255,0.54) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.57px 2.2px at 57.0px 111.2px,rgba(255,255,255,0.45) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 2.45px 1.8px at 65.2px 76.4px,rgba(255,255,255,0.41) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 2.46px 2.4px at 68.7px 145.8px,rgba(255,255,255,0.48) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 2.09px 2.2px at 38.7px 112.0px,rgba(255,255,255,0.54) 0%,rgba(255,255,255,0) 100%);
      --ps-wx-snow-near-size: 150px 200px;
      --ps-wx-snow-far:
        radial-gradient(ellipse 1.00px 1.3px at 33.1px 108.3px,rgba(255,255,255,0.26) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.49px 1.3px at 99.3px 120.5px,rgba(255,255,255,0.20) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.37px 1.4px at 15.8px 184.7px,rgba(255,255,255,0.26) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.02px 1.3px at 54.8px 181.2px,rgba(255,255,255,0.21) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.63px 1.4px at 0.8px 198.9px,rgba(255,255,255,0.23) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.47px 1.4px at 4.0px 30.4px,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.45px 1.6px at 124.9px 62.6px,rgba(255,255,255,0.25) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.56px 1.1px at 129.3px 173.7px,rgba(255,255,255,0.22) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.63px 1.7px at 84.9px 179.6px,rgba(255,255,255,0.23) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.21px 1.2px at 15.9px 150.7px,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.19px 1.1px at 23.1px 114.2px,rgba(255,255,255,0.20) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.01px 1.3px at 122.0px 156.3px,rgba(255,255,255,0.27) 0%,rgba(255,255,255,0) 100%);
      --ps-wx-snow-far-size: 130px 200px;
      }

      .ps-wxfx::before, .ps-wxfx::after {
        content: ""; position: absolute; left: 0; right: 0; top: -200px; bottom: -200px;
        pointer-events: none; opacity: 0; background-repeat: repeat;
      }
      /* No data-wx means no layer at all. Clear weather, and a weather entity
         that is not reporting, both draw nothing — neither one draws "clear". */
      .ps-wxfx[data-wx]::before, .ps-wxfx[data-wx]::after { opacity: var(--ps-wxstr, 1); }

      @keyframes ps-wxfall {
        from { transform: translate3d(0, -200px, 0); }
        to   { transform: translate3d(0, 0, 0); }
      }
      @keyframes ps-wxsway {
        from { transform: translate3d(-7px, -200px, 0); }
        50%  { transform: translate3d(7px, -100px, 0); }
        to   { transform: translate3d(-7px, 0, 0); }
      }
      @keyframes ps-wxdrift {
        from { transform: translate3d(-25%, 0, 0); }
        to   { transform: translate3d(25%, 0, 0); }
      }
      /* Lightning brightens the ground rather than painting a white overlay:
         both pseudo-elements are already spent on the rain, and a flash that
         lifts the drops with it is what a real strike does. */
      @keyframes ps-wxflash {
        0%, 4%, 100% { background-color: transparent; }
        4.4%         { background-color: rgba(200, 220, 255, .15); }
        4.9%         { background-color: transparent; }
        5.5%         { background-color: rgba(200, 220, 255, .09); }
        6.1%         { background-color: transparent; }
      }

      .ps-wxfx[data-wx="rain"]::before {
        background-image: var(--ps-wx-rain-near); background-size: var(--ps-wx-rain-near-size);
        animation: ps-wxfall .75s linear infinite;
      }
      .ps-wxfx[data-wx="rain"]::after {
        background-image: var(--ps-wx-rain-far); background-size: var(--ps-wx-rain-far-size);
        animation: ps-wxfall 1.35s linear infinite;
      }
      .ps-wxfx[data-wx="pour"]::before, .ps-wxfx[data-wx="storm"]::before {
        background-image: var(--ps-wx-pour-near); background-size: var(--ps-wx-pour-near-size);
        animation: ps-wxfall .5s linear infinite;
      }
      .ps-wxfx[data-wx="pour"]::after, .ps-wxfx[data-wx="storm"]::after {
        background-image: var(--ps-wx-pour-far); background-size: var(--ps-wx-pour-far-size);
        animation: ps-wxfall .95s linear infinite;
      }
      .ps-wxfx[data-wx="storm"] { animation: ps-wxflash 9s linear infinite; }
      .ps-wxfx[data-wx="snow"]::before {
        background-image: var(--ps-wx-snow-near); background-size: var(--ps-wx-snow-near-size);
        animation: ps-wxsway 7s linear infinite;
      }
      .ps-wxfx[data-wx="snow"]::after {
        background-image: var(--ps-wx-snow-far); background-size: var(--ps-wx-snow-far-size);
        animation: ps-wxsway 11s linear infinite reverse;
      }
      .ps-wxfx[data-wx="fog"]::before {
        top: 0; bottom: 0; background-size: 200% 100%;
        background-image: linear-gradient(180deg, transparent 20%, rgba(180,195,215,.14) 45%, transparent 70%);
        animation: ps-wxdrift 18s linear infinite;
      }
      .ps-wxfx[data-wx="fog"]::after {
        top: 0; bottom: 0; background-size: 200% 100%;
        background-image: linear-gradient(180deg, transparent 45%, rgba(170,185,210,.10) 72%, transparent 95%);
        animation: ps-wxdrift 30s linear infinite reverse;
      }

      @media (prefers-reduced-motion: reduce) {
        * { transition: none !important; }
        .ps-wxfx, .ps-wxfx::before, .ps-wxfx::after { animation: none !important; }
      }
    `;

/* ============================================================================
 * purdy-desk-card
 *
 * The whole DESKTOP view as one element — the counterpart to purdy-shell-card,
 * not a wider copy of it.
 *
 * Why a second element rather than a `wide:` flag on the shell: the two views
 * disagree about the thing the shell is built around. The shell is ONE COLUMN
 * you scroll, where detail is bought by pushing everything below you further
 * down. The desk is ONE SHEET that never scrolls, where detail is bought with
 * WIDTH — a panel expands sideways and its neighbours fold to a headline. A
 * flag cannot straddle that: every layout rule, every "what does collapsed
 * mean", and every decision about what earns a permanent slot inverts.
 *
 * What the two DO share is everything that is not layout, and they share it by
 * borrowing rather than by copying — see PD_BORROW below. The derivations, the
 * fault engine, the recorder fetches, the optimistic setpoint and the
 * bind-once guards are the shell's, live, so a fix lands in both.
 *
 * The three rules the shell learned the hard way apply here unchanged:
 *   - it PATCHES, it does not repaint (see _patch / _patchKeyed)
 *   - no handler may close over `hass` or `config` — read this._hass live
 *   - a zero and a missing reading must never look the same
 * ========================================================================== */

/* Sections accepted in `sections:`. Same config language as purdy-shell-card,
   deliberately: a section body written for the phone pastes into the desktop
   view unchanged, and the two views cannot drift into two vocabularies.
   `sleep` is absent — the Owlet panel was retired and porting it to buy back a
   view nobody uses would be work in the wrong direction. Paste a `sleep`
   section here and setConfig says so by name rather than rendering a blank.

   As on the shell, a type has to be added HERE **and** to the dispatch in
   _panelHtml / _stripHtml / _dockHtml. Missing the list is not a broken
   section, it is a card replaced by "Configuration error" — Lovelace's answer
   to a throw from setConfig. A test asserts the two halves name the same set. */
const PD_SECTIONS = [
  "climate", "nursery", "music", "calendar", "lights",
  "people", "quick", "rooms", "systems", "nowplaying", "weather",
];

/* Which tier a section lands in when it does not say. The strip is a glance,
   the stage is what you study, the dock is what you press — Rule 03 from the
   design plan, expressed as a default rather than as required config. */
const PD_ZONE_DEFAULT = {
  climate: "stage", nursery: "stage", music: "stage", calendar: "stage",
  lights: "stage", nowplaying: "stage", weather: "stage",
  people: "strip",
  quick: "dock", rooms: "dock", systems: "dock",
};

const PD_ZONES = ["strip", "stage", "dock"];

/* Everything reused from purdy-shell-card, named in one place.
 *
 * These are the methods that are about DATA rather than about markup: the
 * recorder fetches, the fault engine and its dismissal store, the nursery
 * derivation, the music target resolution, the optimistic setpoint, and the
 * bind-once guards. None of them emit HTML, so none of them care which view is
 * asking. Copying them would have meant two fault engines and two settle-window
 * implementations, and this project already knows how that ends — the morning
 * recap and the nursery card are a second implementation of the same facts and
 * are explicitly logged as a drift risk to watch. This is the same risk
 * declined.
 *
 * The markup-emitting cousins are NOT here on purpose. `_secClimate` and
 * `_resultsHtml` describe a phone column; the desk writes its own.
 *
 * `_ringSvg` and `_sparkSvg` are the exception that proves the rule: they emit
 * SVG, but every colour in them is a CSS variable, so they are markup only in
 * the sense that geometry is. The desk declares the same `--ps-*` palette
 * NAMES in its :host for exactly this reason — the shared names are what let
 * the two rings be one function instead of two.
 */
const PD_BORROW = [
  /* recorder + calendar */
  "_collectWatched", "_historyEntities", "_startHistory", "_fetchHistory", "_fetchEvents",
  /* nursery — the derivation, the fetch and the single clock the fixtures pin */
  "_nurserySection", "_startNursery", "_fetchNursery", "_nowMs", "_nurserySessions",
  /* weather — the statistics fetch, the provider-shape detection and the rail's
     scale. `_wxCapsule` is here too, taking a class prefix: the three states it
     draws (a stub for a half-published day, a hatch for an absent one, a
     visible cap for a flat one) ARE the zero-versus-missing rules, and a second
     copy on the desk could regress on its own with nothing to say so. The
     markup-emitting cousins — `_secWeather`, `_wxRows`, `_wxHourly` — are not
     borrowed: they describe a phone column. */
  "_weatherSection", "_wxKind", "_startWeather", "_fetchWeather", "_fetchWxStats",
  "_fetchWxFc", "_wxLive", "_wxRail", "_wxDomain", "_wxCapsule", "_wxDow", "_wxDeg",
  "_wxAttrib", "_wxNoteText", "_wxHistRows", "_wxSrcName", "_wxHourDomain",
  "_wxHourCols", "_wxClock",
  /* faults, dismissals and the notification log */
  "_dismissals", "_writeDismissals", "_dismiss", "_ruleHit", "_firedAt", "_serverFaults",
  "_raised", "_faults", "_syncLog",
  /* Dependencies of the three above, added when a test started walking what
     borrowed methods CALL rather than only whether they resolve. All three
     were reachable and none of them worked: _dismiss threw on any desk
     dismissal with a log configured, _togglePick threw on picking a music
     room, and _syncLog's call to _logItems threw inside a try/catch that
     returns silently — so the desk had never once synced the notification
     log, and nothing said so. */
  "_closeLog", "_logItems", "_syncQueue", "_fetchQueue",
  /* music: which room is the target, and how a URI gets played there */
  "_musicSec", "_targets", "_activePlayer", "_isPicked", "_togglePick", "_nowPlaying",
  "_playUri", "_enqueueUri", "_toast", "_queueSearch", "_runSearch", "_paintResults",
  /* the optimistic setpoint — built for the shell's stepper, and the desk's
     stepper would have grown the identical bug without it */
  "_optGoal",
  /* render plumbing */
  "_patch", "_each", "_one", "_claim", "_mountSheetCard",
  /* greeting + name, and the state-string prettifier */
  "_greeting", "_who", "_humanize",
  /* geometry that is genuinely one picture at two sizes */
  "_ringSvg", "_sparkSvg",
];

/* Take the named methods off the shell's prototype.
 *
 * Loud rather than silent when a name stops resolving: a borrow that quietly
 * returns undefined would surface much later as "the desktop fault chip never
 * fires", which is precisely the shape of bug this project keeps writing tests
 * for (`_bindScrub` was fully written and never called for three releases).
 * The returned list of misses is what the smoke test asserts is empty. */
function pdBorrow(target, source, names) {
  const missing = [];
  names.forEach((n) => {
    const fn = source[n];
    if (typeof fn !== "function") { missing.push(n); return; }
    target[n] = fn;
  });
  if (missing.length) {
    console.warn(
      `[purdy-cards] purdy-desk-card could not borrow from purdy-shell-card: ` +
      `${missing.join(", ")}. The desktop view will be missing whatever they backed.`
    );
  }
  return missing;
}

/* A time of day, for the axis labels and the status line. */
function pdClock(t) {
  if (t == null || !Number.isFinite(t)) return "—";
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

class PurdyDeskCard extends PcBaseCard {
  static getStubConfig() {
    return {
      weather: "weather.home",
      sections: [{ type: "quick", tiles: [] }],
    };
  }

  constructor() {
    super();
    /* --- desk marker: constructor begins ---
       Three copies of the shell's constructor were once spliced into unrelated
       methods by a failed string replace, and one of them silently blanked the
       saved-playlist list. The markers are what a test counts. */
    this._open = null;         // key of the expanded stage panel, or null
    this._sheet = null;        // key of the open sheet, or null
    this._alertOpen = false;   // the strip's fault popover
    this._history = {};
    this._histErr = null;
    /* null, not {} — "the recorder has not answered yet" and "he has never
       slept" are different facts, and {} reads as the second. */
    this._nursery = null;
    this._nurseryErr = null;
    this._nurseryTimer = null;
    /* Weather, null for the same reason: the rail must tell "not answered yet"
       from "the week was flat". The borrowed fetch writes these. */
    this._wxStats = null;
    this._wxStatsErr = null;
    this._wxFc = null;
    this._wxFcErr = null;
    this._wxHrs = null;
    this._wxPick = null;
    this._wxTimer = null;
    this._events = [];
    this._goalOpt = null;      // optimistic setpoint, see _optGoal
    this._goalSend = null;
    this._briOpt = {};         // optimistic light brightness
    this._briSend = {};
    this._dragging = false;    // a drag or a focused field must survive a state change
    this._armed = null;        // a destructive control awaiting its second tap
    this._logged = {};
    this._pick = null;         // the music target room; null follows what plays
    this._results = null;      // search results, null until a query runs
    this._query = "";
    this._mtype = "all";
    this._note = null;
    this._searching = false;
    this._openGroups = {};     // "sectionKey|groupName" -> true
    this._guard = null;        // a protected light awaiting confirmation
    /* --- desk marker: constructor ends --- */
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.sections)) {
      throw new Error("purdy-desk-card: 'sections' (a list) is required");
    }
    config.sections.forEach((s) => {
      if (!s || PD_SECTIONS.indexOf(s.type) < 0) {
        throw new Error(
          `purdy-desk-card: unknown section type '${s && s.type}'. ` +
          `Expected one of: ${PD_SECTIONS.join(", ")}`
        );
      }
      const z = s.zone || PD_ZONE_DEFAULT[s.type];
      if (PD_ZONES.indexOf(z) < 0) {
        throw new Error(
          `purdy-desk-card: section '${s.type}' has zone '${s.zone}'. ` +
          `Expected one of: ${PD_ZONES.join(", ")}`
        );
      }
    });
    this._config = { ...config };
    this._watched = this._collectWatched();
    this._last = null;
    if (this._clock) clearInterval(this._clock);
    /* The clock is the one thing no entity change drives. */
    this._clock = setInterval(() => this._render(), 30000);
  }

  set hass(hass) {
    const first = !this._hass;
    super.hass = hass;
    if (first && this._config) this._start();
  }

  get hass() {
    return this._hass;
  }

  _start() {
    this._startHistory();
    this._startNursery();
    this._startWeather();
    this._fetchEvents();
  }

  /* Lovelace detaches a view's elements, it does not destroy them — so coming
     back to this view reconnects THIS element, with every timer that
     disconnectedCallback stopped still stopped. Without this the card looks
     frozen on return while still accepting clicks. */
  connectedCallback() {
    if (!this._config) return;
    if (!this._clock) this._clock = setInterval(() => this._render(), 30000);
    if (this._hass && !this._historyTimer) this._start();
    this._last = null;
    this._render();
  }

  disconnectedCallback() {
    if (this._clock) clearInterval(this._clock);
    if (this._historyTimer) clearInterval(this._historyTimer);
    if (this._eventTimer) clearInterval(this._eventTimer);
    if (this._nurseryTimer) clearInterval(this._nurseryTimer);
    if (this._wxTimer) clearInterval(this._wxTimer);
    clearTimeout(this._goalSend);
    this._goalSend = null;
    /* Nulled rather than merely cleared: connectedCallback tells "stopped"
       from "running" by the handle, so leaving one set stacks a second poller
       on every return to the view. */
    this._clock = null;
    this._historyTimer = null;
    this._eventTimer = null;
    this._nurseryTimer = null;
    this._wxTimer = null;
  }

  /* Sections in a zone, in config order. Re-ranking the screen is a config
     edit and never a code change — the shell's rule, kept. */
  _zone(name) {
    return (this._config.sections || [])
      .filter((s) => !s.sheet_only && (s.zone || PD_ZONE_DEFAULT[s.type]) === name)
      .map((s, i) => ({ key: s.key || s.type + i, ...s }));
  }

  _section(type) {
    return (this._config.sections || []).find((s) => s.type === type);
  }

  /* ---------------------------------------------------------------- mount --
   *
   * The skeleton is built once and everything after it is a patch into one of
   * these slots. Two things depend on that and both are load-bearing:
   *
   *   - the stylesheet is parsed once rather than on every state change, and
   *   - #pd-stage SURVIVES every repaint, which is the only reason it may
   *     carry a CSS transition at all. A transition on a node the renderer
   *     replaces re-runs from zero on every state change; that is what made
   *     the phone's lamp chips slide under the thumb constantly. The stage's
   *     grid-template-columns is written as a style property on the surviving
   *     node — never as part of an innerHTML string — so the expand animates
   *     once, when it is asked to.
   */
  _mount() {
    this.shadowRoot.innerHTML = `
      <style>${PurdyDeskCard.styles}</style>
      <div class="pd-ground"></div>
      <div class="pd-sheet">
        <div class="pd-tier pd-t1" id="pd-strip"></div>
        <div class="pd-tier pd-t2"><div class="pd-stage" id="pd-stage"></div></div>
        <div class="pd-tier pd-t3" id="pd-dock"></div>
      </div>
      <div id="pd-sheetslot"></div>`;
    this._mounted = true;
  }

  /* Keyed reconciliation for a container of panels.
   *
   * This is _patchSections' shape rather than _patchSections itself: that one
   * writes into the shell's single column and stamps `ps-sect` on what it
   * finds there. The container, the class base and the state carried per node
   * all differ here, and the honest way to share it would be to widen the
   * shell's signature — a change to shipped code for the benefit of a caller
   * that does not exist yet. Borrow the data, write the layout.
   */
  _patchKeyed(container, list, baseCls) {
    if (!container) return;
    const have = new Map();
    Array.from(container.children).forEach((n) => have.set(n.dataset.pkey, n));

    let prev = null;
    list.forEach((s) => {
      let node = have.get(s.key);
      if (node) {
        have.delete(s.key);
        /* The rendered string IS the cache key, so identical output cannot
           touch the DOM — which is what preserves focus, scroll position and
           the artwork <img> between repaints. */
        if (node._pdHtml !== s.html) {
          node._pdHtml = s.html;
          node.innerHTML = s.html;
        }
      } else {
        node = document.createElement("div");
        node.dataset.pkey = s.key;
        node._pdHtml = s.html;
        node.innerHTML = s.html;
      }
      const cls = [baseCls].concat(s.cls || []).join(" ");
      if (node.className !== cls) node.className = cls;
      /* Re-inserting a node already in place would detach and re-attach it,
         losing focus for no reason. */
      const want = prev ? prev.nextSibling : container.firstChild;
      if (node !== want) container.insertBefore(node, want);
      prev = node;
    });

    have.forEach((n) => n.remove());
  }

  /* Column widths for the stage.
   *
   * Balanced, every panel gets its configured `weight` (default 1). Expanded,
   * the open panel takes `expand_ratio` (default 2.9) and the rest fold to
   * `fold_ratio` (0.62) — enough width for a headline number and a chip, which
   * is the whole promise of folding rather than hiding: the other three stay
   * legible, so nothing you were reading disappears because you opened
   * something else.
   */
  _stageCols(panels) {
    const c = this._config;
    if (!panels.length) return "";
    if (!this._open) return panels.map((p) => `${p.weight || 1}fr`).join(" ");
    const open = c.expand_ratio || 2.9;
    const fold = c.fold_ratio || 0.62;
    return panels.map((p) => `${p.key === this._open ? open : fold}fr`).join(" ");
  }

  _render() {
    if (!this._hass || !this._config) return;
    /* Repainting mid-gesture would rip the control out from under the pointer
       and, on a focused field, destroy the input mid-word. */
    if (this._dragging) return;
    if (!this._mounted) this._mount();
    /* Written as a property rather than into the stylesheet so changing it is
       a config edit and not a rebuild of the bundle. */
    if (this._config.viewport_offset != null && this.style && this.style.setProperty) {
      this.style.setProperty("--pd-off", String(this._config.viewport_offset).replace(/^(\d+(\.\d+)?)$/, "$1px"));
    }

    const raised = this._raised();
    if (this._config.log_to) this._syncLog(raised);
    const faults = this._faults();

    this._patch("pd-strip", this._stripHtml(faults));

    const panels = this._zone("stage")
      .map((sec) => {
        const html = this._panelHtml(sec);
        /* A panel that renders nothing is dropped entirely, hairline and all —
           that is how `nowplaying` disappears when the house is quiet rather
           than leaving an empty column with a title in it. */
        if (!html) return null;
        const cls = ["pd-panel"];
        if (this._open === sec.key) cls.push("is-exp");
        else if (this._open) cls.push("is-min");
        return { key: sec.key, html, cls, weight: sec.weight };
      })
      .filter(Boolean);

    const stage = this.shadowRoot.getElementById("pd-stage");
    this._patchKeyed(stage, panels, "pd-panelwrap");
    if (stage) {
      /* Written as a property on the surviving node, never into an innerHTML
         string — see _mount. This is the one animated thing on the screen. */
      const cols = this._stageCols(panels);
      if (stage.style.gridTemplateColumns !== cols) stage.style.gridTemplateColumns = cols;
    }

    this._patch("pd-dock", this._dockHtml());
    this._patch("pd-sheetslot", this._sheetHtml(faults));
    this._mountSheetCard();

    this._bind();
    this._bindScrub();
    /* Attached AFTER the patch, because a patch may have replaced the node the
       last series was hanging on. The scrub reads these back rather than
       re-deriving, so the number under the pointer is the number that was
       actually drawn. */
    this._stash("pd-wave", this._waveSeries);
    this._stash("pd-nightrail", this._nightSeries);
  }

  /* ----------------------------------------------------------------- bind --
   *
   * Handlers are attached once per element and then outlive many repaints, so
   * nothing in here may close over `hass` or `config`. Every handler reads
   * this._hass / this._config live.
   */
  _bind() {
    /* expand / collapse a stage panel */
    this._each("[data-exp]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = el.dataset.exp;
        this._open = this._open === k ? null : k;
        this._last = null;
        this._render();
      });
    });

    /* open a sheet */
    this._each("[data-sheet]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._sheet = el.dataset.sheet;
        this._last = null;
        this._render();
      });
    });

    this._each("[data-close]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._sheet = null;
        this._last = null;
        this._render();
      });
    });

    /* more-info, the desktop's answer to the phone's long-press */
    this._each("[data-info]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        pcMoreInfo(this, el.dataset.info);
      });
    });

    this._each("[data-nav]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        pcNavigate(this, el.dataset.nav);
      });
    });

    /* the fault popover in the strip */
    this._one("pd-alert", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._alertOpen = !this._alertOpen;
        this._last = null;
        this._render();
      });
    });

    this._each("[data-dismiss]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = this._faults().find((f) => f.key === el.dataset.dismiss);
        if (row) this._dismiss(row);
      });
    });

    this._bindStrip();
    this._bindStage();
    this._bindDeskLights();
    this._bindDock();
  }

  /* -------------------------------------------------------------- scrub ----
   *
   * The desktop scrub is NOT the phone's, and the difference is deliberate.
   *
   * The shell's scrubber has to spend ~340ms deciding whether a finger on the
   * graph meant "read this" or "scroll the page", because on a phone both
   * gestures start identically. A desk view has a pointer that hovers without
   * committing to anything, and a sheet that never scrolls — so there is no
   * ambiguity to resolve and no reason to make anyone wait for it. Reading the
   * graph is hovering over it.
   *
   * The one rule kept verbatim is the important one: the readout is written
   * STRAIGHT TO THE DOM from the series stashed at render time, never through
   * _render. Re-rendering to move a crosshair would replace the node under the
   * pointer on every pixel of travel.
   */
  _bindScrub() {
    this._each("[data-scrub]", (box) => {
      const cross = box.querySelector(".pd-cross");
      /* The readout is not always INSIDE the scrub box. The night rail is a
         26px bar and its caption belongs in the railbox header above it — so
         looking only inside the box found nothing, returned early, and that
         rail silently never scrubbed. A handler that is wired but unreachable
         is the same failure as one that is written and never called. */
      const out = box.querySelector("[data-readout]")
        || (box.parentNode && box.parentNode.querySelector
          ? box.parentNode.querySelector("[data-readout]") : null);
      if (!cross || !out) return;

      const hide = () => {
        cross.style.opacity = "0";
        out.style.opacity = "0";
      };

      const read = (clientX) => {
        const r = box.getBoundingClientRect();
        if (!r.width) return;
        const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
        const series = box._pdSeries;
        if (!series || !series.length) return;
        const i = Math.min(series.length - 1, Math.round(f * (series.length - 1)));
        const pt = series[i];
        cross.style.opacity = "1";
        cross.style.left = (f * 100).toFixed(2) + "%";
        out.style.opacity = "1";
        out.textContent = pt.label;
      };

      box.addEventListener("pointermove", (e) => read(e.clientX));
      box.addEventListener("pointerleave", hide);
      box.addEventListener("pointercancel", hide);
    });
  }

  /* Stash the series a graph reads back, keyed to the element that owns it.
     Read back at scrub time rather than re-derived, so the number under the
     pointer is the number that was drawn. */
  _stash(id, series) {
    const el = this.shadowRoot && this.shadowRoot.getElementById(id);
    if (el) el._pdSeries = series;
  }

  /* --------------------------------------------------------------- sheets --
   *
   * The desktop inverts the phone's rule: what you LOOK AT is inline, what you
   * FIDDLE WITH is behind a sheet. Climate, Joel, music and the calendar are
   * on the glass; the TV remote, the notification log and the vacuum map stay
   * sheets, because a d-pad is a task and a log is read on demand.
   *
   * The host is `ps-host` on purpose — that is the id the shell's
   * _mountSheetCard looks for, and using it is what lets the hosted-card
   * plumbing be borrowed whole rather than reimplemented. It brings the parts
   * that were hard to get right: `bare: true` by default so a hosted card does
   * not draw a second surface, the blanked title so the chrome does not print
   * the name twice, the retry without `bare` for a card entitled not to know
   * our conventions, and an in-place error instead of a throw out of render.
   */
  _sheetHtml(faults) {
    if (!this._sheet) return "";
    const spec = (this._config.sheets || {})[this._sheet];
    const title = this._sheet === "alerts"
      ? (faults.length ? `${faults.length} need${faults.length > 1 ? "" : "s"} attention` : "All clear")
      : (spec && spec.title) || this._humanize(this._sheet);
    let body;
    if (this._sheet === "alerts") {
      body = this._alertListHtml(faults);
    } else if (spec && spec.section) {
      /* A sheet can host one of our own sections as well as a foreign card.
         That is how lights stays one click away without taking a permanent
         column on the stage — the phone reached the same answer from the other
         direction, and a `sheet_only` section keeps supplying its config while
         rendering nothing in the column. */
      const sec = (this._config.sections || []).find((s) => (s.key || s.type) === spec.section);
      this._inSheet = true;
      body = sec ? this._panelHtml({ key: sec.key || sec.type, ...sec }) : "";
      this._inSheet = false;
      if (!body) body = `<div class="pd-empty">Nothing to show.</div>`;
    } else {
      /* `dim` exists for a hosted card that hardcodes a light surface and
         never reads HA's card variables — a filter is the only lever there is,
         so it is opt-in per sheet and an out-of-range value is ignored rather
         than blanking the sheet. */
      const d = spec && Number(spec.dim);
      body = `<div id="ps-host" class="pd-host"${d > 0 && d <= 1 ? ` style="filter:brightness(${d})"` : ""}></div>`;
    }
    return `
      <div class="pd-scrim" data-close="1"></div>
      <div class="pd-sheet-panel" role="dialog" aria-label="${psEsc(title)}">
        <div class="pd-sheet-head">
          <span class="pd-sheet-title">${psEsc(title)}</span>
          <button class="pd-x" type="button" data-close="1" aria-label="Close">
            <svg viewBox="0 0 24 24" class="pd-ico"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <div class="pd-sheet-body">${body}</div>
      </div>`;
  }

  getCardSize() {
    return 30;
  }

  /* Pure helpers, exposed so the smoke test can exercise them without reaching
     into the bundle's module scope — the bundle is one concatenated script, so
     its free functions are not otherwise reachable from a test that evals it. */
  static get helpers() {
    return {
      sections: PD_SECTIONS,
      zones: PD_ZONES,
      zoneDefault: PD_ZONE_DEFAULT,
      borrowed: PD_BORROW,
      /* Empty, or the borrow silently lost something. A test asserts it. */
      borrowMissing: PD_BORROW_MISSING,
      /* Exposed so a test can walk what the borrowed methods actually CALL —
         the list names methods, not their dependencies. */
      borrowed: PD_BORROW,
      clock: pdClock,
    };
  }

  static get styles() {
    return PD_STYLES;
  }
}

/* Do the borrowing once, at definition time, and remember what failed so a
   test can assert nothing did. */
const PD_BORROW_MISSING = pdBorrow(PurdyDeskCard.prototype, PurdyShellCard.prototype, PD_BORROW);
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
/* ============================================================================
 * purdy-desk-card — Tier 2, the stage
 *
 * The middle tier is the whole idea of the view: the panels you actually study,
 * side by side, where DETAIL IS BOUGHT WITH WIDTH RATHER THAN WITH A POP-UP.
 *
 * Every panel has three faces and shows exactly one of them:
 *
 *   full   the balanced state — what it looks like when nothing is expanded
 *   xtra   revealed underneath `full` when this panel is the expanded one
 *   mini   the folded headline, shown when a DIFFERENT panel is expanded
 *
 * `mini` is why this is folding and not hiding. Opening climate must not make
 * Joel disappear — it makes him a number you can still read. That is the whole
 * difference between this and the phone's pop-ups, which black out everything
 * behind them.
 *
 * All three faces are `display` swaps driven by a class on the panel wrapper.
 * NONE of them animates. The only transition on the screen is the stage's
 * grid-template-columns, on a node the renderer never replaces — see _mount.
 * An entry/exit animation on a patched node re-runs from zero on every state
 * change, which is how the phone's lamp chips ended up sliding under the thumb
 * constantly. Assume any such animation is wrong until proven against a
 * patching renderer.
 * ========================================================================== */

Object.assign(PurdyDeskCard.prototype, {

  /* The dispatch half of the two-places rule. PD_SECTIONS is the other half,
     and a test asserts the stage types here are exactly the stage-defaulted
     types there — either half alone is a card that throws out of setConfig. */
  _panelHtml(sec) {
    const fn = {
      climate: () => this._pnlClimate(sec),
      nursery: () => this._pnlNursery(sec),
      music: () => this._pnlMusic(sec),
      calendar: () => this._pnlCalendar(sec),
      lights: () => this._pnlLights(sec),
      nowplaying: () => this._pnlNowplaying(sec),
      weather: () => this._pnlWeather(sec),
      /* A section parked on the stage that has no stage renderer falls back to
         its dock treatment rather than vanishing — moving a section between
         tiers is a `zone:` edit and must never be a blank column. */
      systems: () => this._pnlSystems(sec),
      people: () => `<div class="pd-pbody pd-full">${this._stripSection(sec)}</div>`,
      quick: () => `<div class="pd-pbody pd-full">${this._dockSection(sec)}</div>`,
      rooms: () => `<div class="pd-pbody pd-full">${this._dockSection(sec)}</div>`,
    }[sec.type];
    return fn ? fn() : "";
  },

  /* The header is a button whenever the panel has anything more to show.
   *
   * `expandable: false` renders the same header — same size, same weight, same
   * chip — minus the chevron and the click. It is NOT a smaller, quieter
   * treatment: on the phone that mistake turned five of seven section titles
   * into captions, and a title that shrinks because it happens to have no
   * detail behind it is a hierarchy that means nothing. */
  _head(sec, chip) {
    /* Inside a sheet the chrome has already named itself beside the close
       button, and there is nothing to expand into — a second title printed
       the name twice on the phone and would here too. */
    if (this._inSheet) return "";
    const open = this._open === sec.key;
    const can = sec.expandable !== false;
    const inner = `<span class="pd-nm">${psEsc(sec.title || this._humanize(sec.type))}</span>
        ${chip || ""}
        ${can ? `<span class="pd-cv"><svg viewBox="0 0 24 24" class="pd-ico"><path d="M9 5l7 7-7 7"/></svg></span>` : ""}`;
    return can
      ? `<button class="pd-ph" type="button" data-exp="${psEsc(sec.key)}"
           aria-expanded="${open ? "true" : "false"}">${inner}</button>`
      : `<div class="pd-ph static">${inner}</div>`;
  },

  _chip(text, cls) {
    return `<span class="pd-chip ${cls || ""}">${cls ? `<span class="pd-dot"></span>` : ""}${psEsc(text)}</span>`;
  },

  _mstat(value, key, small) {
    return `<div class="pd-mstat">
        <span class="pd-mv">${value}${small ? `<small>${psEsc(small)}</small>` : ""}</span>
        <span class="pd-mk">${psEsc(key)}</span>
      </div>`;
  },

  /* ------------------------------------------------------------- climate --*/

  _pnlClimate(sec) {
    const h = this._hass;
    const goalSt = sec.goal && h.states[sec.goal];
    const thermo = sec.thermostat && h.states[sec.thermostat];
    const src = goalSt || thermo;
    const action = (thermo && thermo.attributes.hvac_action) || (src && src.state) || "";
    const cool = /cool/i.test(action);
    const heat = /heat/i.test(action);
    const col = cool ? "var(--ps-cool)" : heat ? "var(--ps-heat)" : "var(--ps-good)";

    const cur = pcNumOf(thermo, "current_temperature");
    const real = pcNumOf(src, "temperature");
    const goalId = sec.goal || sec.thermostat;
    const goal = this._optGoal(goalId, real);

    const lo = (sec.ring || {}).min == null ? 60 : sec.ring.min;
    const hi = (sec.ring || {}).max == null ? 80 : sec.ring.max;
    const frac = (v) => (v == null ? null : Math.max(0, Math.min(1, (v - lo) / (hi - lo))));

    /* A missing current temperature draws an EMPTY ring, not a ring at zero —
       a thermostat that has dropped off and a house at 60° must not look the
       same. */
    const segs = cur == null ? [] : [[frac(cur), col]];
    const ring = this._ringSvg(112, 9, segs, frac(goal), "var(--ps-warn)");

    const mini = `<div class="pd-mini">
        ${this._mstat(cur == null ? "—" : cur.toFixed(1), "inside", "°")}
        ${this._mstat(goal == null ? "—" : Math.round(goal), "goal", "°")}
        ${this._chip(cool ? "Cooling" : heat ? "Heating" : "Idle", cool ? "cool" : heat ? "heat" : "")}
      </div>`;

    const chip = this._chip(cool ? "Cooling" : heat ? "Heating" : "Idle", cool ? "cool" : heat ? "heat" : "");

    return `${this._head(sec, chip)}
      ${mini}
      <div class="pd-pbody pd-full">
        <div class="pd-cwrap">
          <div class="pd-ring" style="width:112px;height:112px">
            ${ring}
            <div class="pd-rv">
              <b>${cur == null ? "—" : cur.toFixed(1) + "°"}</b>
              <small>${cur == null ? "no reading" : "now"}</small>
            </div>
          </div>
          <div class="pd-grow">
            <div class="pd-steprow">
              <button class="pd-step" type="button" data-goal="-1" aria-label="Lower the goal"
                ${goal == null ? "disabled" : ""}>
                <svg viewBox="0 0 24 24" class="pd-ico"><path d="M5 12h14"/></svg></button>
              <div class="pd-goal"><b>${goal == null ? "—" : Math.round(goal) + "°"}</b><span>goal</span></div>
              <button class="pd-step" type="button" data-goal="1" aria-label="Raise the goal"
                ${goal == null ? "disabled" : ""}>
                <svg viewBox="0 0 24 24" class="pd-ico"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
            <div class="pd-cnote">${psEsc(this._climateNote(sec, action))}</div>
          </div>
        </div>
        ${this._wave(sec)}
        <div class="pd-xtra">
          ${this._climateRooms(sec)}
          ${this._climateChips(sec)}
        </div>
      </div>`;
  },

  /* What window the schedule is holding.
   *
   * GTTC's `current_schedule_entry` is `{time_start, time_end, target_temp,
   * cooling_temp, effective_temp}` — NOT the `{start, heat_temp, cool_temp}`
   * shape a reasonable person would guess, and which this first read from.
   * Guessing produced no error and no gap: `win.start` was undefined, the
   * branch fell through, and the panel quietly printed "HVAC is cooling"
   * forever instead of the window. Both shapes are accepted so a different
   * thermostat integration is not a silent blank. */
  _climateNote(sec, action) {
    const h = this._hass;
    const st = sec.goal && h.states[sec.goal];
    const win = st && st.attributes.current_schedule_entry;
    const start = win && (win.time_start || win.start);
    if (start) {
      const end = win.time_end || win.end;
      const clock = (hhmm) => (/^\d{1,2}:\d{2}$/.test(String(hhmm))
        ? psMinsToClock(psMins(hhmm)) : String(hhmm));
      const heat = win.target_temp != null ? win.target_temp : win.heat_temp;
      const cool = win.cooling_temp != null ? win.cooling_temp : win.cool_temp;
      const range = end ? `${clock(start)}–${clock(end)}` : clock(start);
      const pair = heat != null && cool != null
        ? ` ${Math.round(heat)}° heat / ${Math.round(cool)}° cool.` : "";
      return `Holding the ${range} window.${pair}`;
    }
    return action ? `HVAC is ${this._humanize(action).toLowerCase()}.` : "";
  },

  /* Every room, its 24h shape and its number. The sparkline rides the same
     26h fetch the graph makes rather than asking for its own. */
  _climateRooms(sec) {
    const h = this._hass;
    const rows = (sec.rooms || []).map((r) => {
      const t = pcReading(h, r.temp);
      const hu = pcReading(h, r.humidity);
      return `<div class="pd-rml" data-info="${psEsc(r.temp || "")}" role="button" tabindex="0">
          <span class="pd-rmn">${psEsc(r.name)}</span>
          ${sec.room_spark === false ? "" : `<span class="pd-spark">${this._sparkSvg(r.temp)}</span>`}
          <span class="pd-rmv">${t.ok && t.n != null ? t.n.toFixed(1) + "°" : "—"}</span>
          <span class="pd-rmh">${hu.ok && hu.n != null ? hu.n.toFixed(0) + "%" : "—"}</span>
        </div>`;
    }).join("");
    return rows ? `<div class="pd-rmlist">${rows}</div>` : "";
  },

  _climateChips(sec) {
    const h = this._hass;
    const out = (sec.chips || []).map((c) => {
      if (c.visible && c.visible.entity) {
        if (pcState(h, c.visible.entity) !== c.visible.state) return "";
      }
      /* `source: schedule_preset` asks which of GTTC's four schedules owns the
         live window. select.gttc_schedule_mode describes the BASE lists only
         and is not a reliable guide, so it is never put on a dashboard. */
      const val = c.source === "schedule_preset"
        ? this._preset(sec)
        : (c.show_state && c.entity ? this._humanize(pcState(h, c.entity)) : "");
      /* A chip that asked for a value and did not get one is dropped whole —
         printing just its label is a question with no answer. */
      if ((c.source || c.show_state) && !val) return "";
      const label = [c.name, val].filter(Boolean).join(" ");
      if (!label) return "";
      return this._chip(label, c.style || "");
    }).filter(Boolean).join("");
    const hold = this._holdRow(sec);
    return (out || hold) ? `<div class="pd-chiprow">${out}</div>${hold}` : "";
  },

  /* Which schedule is actually running. `active_preset` is null whenever GTTC
     picks one situationally, so there is no flag to follow — the live window
     has to be matched against each preset's plan. The schedule fetch is the
     phone's job; here the chip reports the thermostat's own answer or says it
     does not know, rather than printing the base list's name as if it were it. */
  /* GTTC keeps four schedules at once and `active_preset` is null whenever it
     picks one situationally, so there is often no flag to follow — telling
     which owns the live window means matching it against each preset's plan
     over the websocket, which this panel does not do.
     Returning null DROPS the chip. The rejected alternative was a placeholder
     word, which is what the first pass shipped: the chip read "Running:
     schedule", which is not an answer, and `select.gttc_schedule_mode` is
     worse than nothing because it describes the base lists only. */
  _preset(sec) {
    const st = sec.goal && this._hass.states[sec.goal];
    const p = st && (st.attributes.active_preset || st.attributes.preset_mode);
    return p ? this._humanize(p) : null;
  },

  _holdRow(sec) {
    const rem = (sec.hold || {}).remaining;
    if (!rem) return "";
    const r = pcReading(this._hass, rem);
    if (!r.ok || !r.st || !r.st.state || r.st.state === "0") return "";
    const armed = this._armed === "hold";
    return `<div class="pd-hold">
        <span>Hold · ${psEsc(r.st.state)} left</span>
        <button class="pd-mini-btn ${armed ? "arm" : ""}" type="button" data-hold="1">${
          armed ? "Tap again to cancel" : "Cancel hold"}</button>
      </div>`;
  },

  /* ---------------------------------------------------------------- wave --
   *
   * Inside and outside on ONE shared vertical scale — two independently scaled
   * lines in the same box would put a 70° room and a 95° afternoon on top of
   * each other and read as agreement.
   *
   * Deliberately not the phone's `_waveSvg`. That one is 320px wide with no
   * axis at all, because a phone has nowhere to put one; this draws six-hourly
   * gridlines and names them, which is most of what the picture is for at this
   * size. Same data, different picture — the hypnogram/temperature precedent.
   */
  _wave(sec) {
    const g = sec.graph || {};
    const W = 400, H = 96;
    const err = this._histErr;
    const pick = (id) => {
      const raw = this._history[id];
      if (!raw) return [];
      return raw.map((p) => ({ t: p.t, v: parseFloat(p.s) })).filter((p) => Number.isFinite(p.v));
    };
    const ins = pcDownsample(pick(g.inside), 120);
    const out = pcDownsample(pick(g.outside), 120);

    if ((!ins.length && !out.length)) {
      /* "The recorder did not answer" and "there is nothing here yet" are
         different facts and the graph says which. Neither is a flat line. */
      return `<div class="pd-graph"><div class="pd-nohist">${
        err ? "Recorder did not answer" : "No history yet"}</div></div>`;
    }

    const all = ins.concat(out);
    let vmin = Infinity, vmax = -Infinity, t0 = Infinity, t1 = -Infinity;
    all.forEach((p) => {
      vmin = Math.min(vmin, p.v); vmax = Math.max(vmax, p.v);
      t0 = Math.min(t0, p.t); t1 = Math.max(t1, p.t);
    });
    if (vmax - vmin < 4) { const grow = (4 - (vmax - vmin)) / 2; vmax += grow; vmin -= grow; }
    const span = t1 - t0 || 1;
    const x = (t) => ((t - t0) / span) * W;
    const y = (v) => 6 + (1 - (v - vmin) / (vmax - vmin)) * (H - 12);
    const poly = (pts) => pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

    /* Gridlines on real hours, labelled where they actually fall. Three
       captions spread evenly across an axis that is not evenly divided point
       at the wrong times — the nursery rail learned that the hard way. */
    const marks = [];
    const step = 6 * 3600 * 1000;
    const first = Math.ceil(t0 / step) * step;
    for (let t = first; t <= t1; t += step) {
      marks.push(`<line x1="${x(t).toFixed(1)}" y1="0" x2="${x(t).toFixed(1)}" y2="${H}"
        stroke="var(--ps-hair)" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
    }
    const labels = [];
    for (let t = first; t <= t1; t += step) {
      labels.push(`<span style="left:${((x(t) / W) * 100).toFixed(2)}%">${psEsc(
        new Date(t).toLocaleTimeString([], { hour: "numeric" }))}</span>`);
    }

    const lastIn = ins.length ? ins[ins.length - 1].v : null;
    const lastOut = out.length ? out[out.length - 1].v : null;

    /* What the scrub reads back — stashed after the patch, from the same
       series that was drawn rather than re-derived. */
    this._waveSeries = (ins.length ? ins : out).map((p, i) => {
      const o = out.length ? out[Math.min(out.length - 1, Math.round(i * (out.length / (ins.length || 1))))] : null;
      return {
        t: p.t,
        label: `${pdClock(p.t)} · ${ins.length ? p.v.toFixed(1) + "° in" : ""}${
          ins.length && o ? " · " : ""}${o ? o.v.toFixed(1) + "° out" : ""}`,
      };
    });

    return `<div class="pd-graph" id="pd-wave" data-scrub="wave">
        <div class="pd-cross"></div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="pd-wavesvg"
             aria-label="Inside and outside temperature">
          ${marks.join("")}
          ${out.length ? `<polyline fill="none" stroke="var(--ps-heat)" stroke-width="1.8"
            stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"
            points="${poly(out)}"/>` : ""}
          ${ins.length ? `<polyline fill="none" stroke="var(--ps-cool)" stroke-width="2"
            stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"
            points="${poly(ins)}"/>` : ""}
        </svg>
        <div class="pd-axis">${labels.join("")}</div>
        <div class="pd-glg">
          <span><i style="background:var(--ps-cool)"></i>Inside<b>${lastIn == null ? "—" : lastIn.toFixed(1) + "°"}</b></span>
          <span><i style="background:var(--ps-heat)"></i>Outside<b>${lastOut == null ? "—" : lastOut.toFixed(1) + "°"}</b></span>
          <span class="pd-readout" data-readout="1"></span>
        </div>
      </div>`;
  },

  /* ------------------------------------------------------------- nursery --*/

  _pnlNursery(sec) {
    const loaded = this._nursery != null;
    const err = this._nurseryErr;
    const sessions = loaded ? this._nurserySessions(sec) : [];
    const stats = psNurseryStats(sessions, { now: this._nowMs(), days: sec.days || 7 });
    const now = this._nowMs();
    const todayKey = psDayKey(new Date(now));

    const live = sessions.find((s) => s.active);
    const nights = sessions.filter((s) => s.night);
    const night = nights.length ? nights[nights.length - 1] : null;
    const naps = sessions.filter((s) => !s.night && s.day === todayKey);

    /* The ring scales to HIS OWN average, never a fixed goal: the reading is
       "above or below normal", which keeps meaning as he grows. The configured
       max is only the fallback until an average exists. */
    const avg = stats.avgNightMin;
    const maxMin = avg ? avg * 1.25 : (sec.ring || {}).max_hours ? sec.ring.max_hours * 60 : 12 * 60;
    const nightMin = night ? night.asleepMinutes : null;
    const frac = nightMin == null ? 0 : Math.max(0, Math.min(1, nightMin / maxMin));
    const goalFrac = avg ? Math.max(0, Math.min(1, avg / maxMin)) : null;

    /* A night that has not happened and a night of no sleep are different
       facts. The ring reads "—" and says which. */
    const ringLabel = night ? psDur(nightMin) : "—";
    const ringSub = night
      ? (night.active ? "tonight" : "last night")
      : (loaded ? "no night yet" : err ? "unavailable" : "loading");

    const napRings = naps.map((n, i) => {
      const short = n.asleepMinutes < (sec.catnap_under_min || 30);
      const f = Math.max(0.04, Math.min(1, n.asleepMinutes / (sec.nap_full_min || 120)));
      return `<div class="pd-nap">
          <div class="pd-ring sm" style="width:54px;height:54px">
            ${this._ringSvg(54, 5, [[f, short ? "var(--ps-warn)" : "var(--ps-light)"]], null)}
            <div class="pd-rv sm"><b>${psEsc(psHM(n.asleepMinutes))}</b></div>
          </div>
          <span class="pd-napt">${psEsc(pdClock(n.from))}</span>
        </div>`;
    }).join("");

    const chip = live
      ? this._chip(live.settledAt && live.settledAt <= now ? "Asleep" : "Settling", "deep")
      : stats.wakeWindowMin != null
        ? this._chip(`Up ${psHM(stats.wakeWindowMin)}`, "")
        : this._chip(loaded ? "Idle" : "…", "");

    const mini = `<div class="pd-mini">
        ${this._mstat(nightMin == null ? "—" : (nightMin / 60).toFixed(1), "night", nightMin == null ? "" : "h")}
        ${this._mstat(String(naps.length), naps.length === 1 ? "nap today" : "naps today")}
        ${chip}
      </div>`;

    return `${this._head(sec, chip)}
      ${mini}
      <div class="pd-pbody pd-full">
        <div class="pd-jwrap">
          <div class="pd-ring" style="width:112px;height:112px">
            ${this._ringSvg(112, 9, night ? [[frac, "var(--ps-light)"]] : [], goalFrac, "var(--ps-warn)")}
            <div class="pd-rv"><b>${psEsc(ringLabel)}</b><small>${psEsc(ringSub)}</small></div>
          </div>
          <div class="pd-grow">
            <div class="pd-naps">${napRings || `<span class="pd-dimtext">No naps yet today</span>`}</div>
            <div class="pd-jstatus">${this._nurseryStatus(sec, live, stats, night, now)}</div>
          </div>
        </div>
        ${this._nightRail(sec, night, loaded, err)}
        <div class="pd-xtra">
          ${this._nurseryRows(sec, night, stats, naps)}
        </div>
      </div>`;
  },

  /* One line of live status. When he is up it carries how long and since when
     — the number that decides whether the next nap is due. The door is
     deliberately not a state here: it opens several times a day for reasons
     nobody is tracking, and while it was a state it displaced the one thing
     worth reading. */
  _nurseryStatus(sec, live, stats, night, now) {
    if (!this._nursery) {
      return this._nurseryErr
        ? `Recorder did not answer — <button class="pd-mini-btn" type="button" data-retry="nursery">retry</button>`
        : "Loading his week…";
    }
    if (live) {
      const settled = live.settledAt && live.settledAt <= now;
      if (!settled) return `Down ${pdClock(live.from)} · settling ${psHM(Math.round((now - live.from) / 60000))}`;
      return `Down ${pdClock(live.from)} · settled ${pdClock(live.settledAt)} · asleep ${
        psHM(Math.round((now - live.settledAt) / 60000))}`;
    }
    if (stats.wakeWindowMin == null) return "Nothing recorded yet.";
    /* The CHIP carries how long he has been up; this line must not say it
       again. Printing "Up 2h 0m" beside "Awake 2h 0m · since 11:47 AM" spends
       the one free line on a number that is already on screen — when he is up,
       what is not on screen is when he last went down and when he next will. */
    const bed = stats.bedMean != null ? ` · usually down ${psMinsToClock(stats.bedMean)}` : "";
    return `Since ${pdClock(stats.wakeSince)}${bed}`;
  },

  /* The night as a plot with an axis, inside a box — a bare line on the card
     ground does not read as one. Two segments (settling, asleep) with a tick
     wherever someone went in, and hourly gridlines. */
  _nightRail(sec, night, loaded, err) {
    if (!loaded) {
      return `<div class="pd-railbox"><div class="pd-nohist">${
        err ? "Recorder did not answer" : "Loading…"}</div></div>`;
    }
    if (!night) {
      return `<div class="pd-railbox"><div class="pd-nohist">No night recorded yet</div></div>`;
    }
    const from = night.from;
    /* A finished night ends where the Hatch stopped. Running it to now
       regardless would leave the sleep as a narrow band on the left with hours
       of blank to the right, and the end label reading the current time. */
    const to = night.active ? this._nowMs() : night.to;
    const span = to - from || 1;
    const pct = (t) => (((t - from) / span) * 100).toFixed(2);
    const settled = Math.min(Math.max(night.settledAt, from), to);

    const ticks = (night.events || []).map((t) =>
      `<i class="pd-tick" style="left:${pct(t)}%"></i>`).join("");

    const marks = [];
    const step = 3600 * 1000;
    for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
      marks.push(`<i class="pd-grid" style="left:${pct(t)}%"></i>`);
    }

    this._nightSeries = [];
    const N = 120;
    for (let i = 0; i < N; i++) {
      const t = from + (span * i) / (N - 1);
      const state = t < settled ? "settling" : "asleep";
      this._nightSeries.push({ t, label: `${pdClock(t)} · ${state}` });
    }

    return `<div class="pd-railbox">
        <div class="pd-railhead">
          <span>${psEsc(night.active ? "Tonight" : "Last night")}</span>
          <span class="pd-readout" data-readout="1"></span>
        </div>
        <div class="pd-rail" id="pd-nightrail" data-scrub="night">
          <div class="pd-cross"></div>
          ${marks.join("")}
          <i class="pd-seg settle" style="left:0;width:${pct(settled)}%"></i>
          <i class="pd-seg sleep" style="left:${pct(settled)}%;width:${(100 - pct(settled)).toFixed(2)}%"></i>
          ${ticks}
        </div>
        <div class="pd-railfoot">
          <span>${psEsc(pdClock(from))}</span>
          <span>${psEsc(pdClock(to))}</span>
        </div>
      </div>`;
  },

  _nurseryRows(sec, night, stats, naps) {
    const row = (l, v, c) => `<div class="pd-jr"><span class="pd-l">${psEsc(l)}</span>
        <span class="pd-v">${psEsc(v)}</span><span class="pd-c">${psEsc(c || "")}</span></div>`;
    const napRows = naps.map((n) => row(
      pdClock(n.from) + " – " + pdClock(n.to),
      psHM(n.asleepMinutes),
      n.interventions ? `${n.interventions} in` : ""
    )).join("");

    const nightRows = night ? [
      row("Asleep", psDur(night.asleepMinutes),
        stats.avgNightMin ? `7d ${psDur(stats.avgNightMin)}` : "no average yet"),
      row("Down / up", `${pdClock(night.from)} – ${pdClock(night.to)}`, ""),
      row("Settled", pdClock(night.settledAt), `+${psHM(night.settleMinutes)} settling`),
      row("Interventions", String(night.interventions),
        (night.events || []).map((t) => pdClock(t)).join(" · ")),
      row("Longest stretch", psDur(night.longestStretch),
        stats.avgStretch ? `7d ${psDur(stats.avgStretch)}` : ""),
    ].join("") : "";

    const spread = stats.bedSpread != null
      ? row("Bedtime", psMinsToClock(stats.bedMean), `± ${stats.bedSpread}m over ${stats.nights} nights`)
      : "";

    return `${naps.length ? `<div class="pd-sub2">Naps today · ${naps.length}</div>${napRows}` : ""}
      ${night ? `<div class="pd-sub2">${night.active ? "Tonight" : "Last night"}</div>${nightRows}` : ""}
      ${spread}`;
  },

  /* -------------------------------------------------------------- weather --*/

  /* Measured in the balanced face; the forecast when the panel is expanded.
   *
   * This was built showing BOTH rails at once, on the reasoning that width is
   * what a stage panel buys. A screenshot at 1440 killed it: a stage column
   * among five panels is about 290px wide, so the two rails stacked, the
   * forecast's day labels were clipped off the bottom of the panel, and the
   * caption truncated mid-word. Width is what EXPANDING buys — the balanced
   * face has no more room than the phone does.
   *
   * So the measured week is the `full` face, because it is the thing nothing
   * else on this screen says (the strip already carries current conditions), and
   * the forecast rides `xtra` with the hourly strip beside it, where there is
   * genuinely room for both. No tabs: on the desk the second rail is a chevron
   * away rather than a toggle away.
   *
   * Everything numeric comes off borrowed methods — the statistics fetch, the
   * provider-shape detection, the domain floor, today's live widening and the
   * capsule's three states. Only the markup is the desk's. */
  _pnlWeather(sec) {
    const h = this._hass;
    const live = this._wxLive(sec);
    const reading = pcReading(h, sec.sensor);
    const st = psWeatherStats(this._wxStats || []);
    const fcSt = sec.forecast && h.states[sec.forecast];
    const app = sec.feels_from ? pcNumOf(h.states[sec.feels_from], "apparent_temperature") : null;
    const feels = live != null && app != null && Math.abs(app - live) >= 2;

    const chip = feels
      ? this._chip(`Feels ${this._wxDeg(app)}`, app > live ? "heat" : "cool")
      : (fcSt ? this._chip(pcWxText(fcSt.state), "") : "");

    /* Folded, not hidden: opening Climate turns the weather into a number that
       can still be read. The rails are what goes — a capsule column at a
       hundred pixels wide is unreadable, and pretending otherwise is worse than
       dropping it. */
    const mini = `<div class="pd-mini">
        ${fcSt ? `<ha-icon class="pd-wxmi" icon="${psEsc(pcWxIcon(fcSt.state))}"></ha-icon>` : ""}
        ${this._mstat(live == null ? "—" : live.toFixed(1), "outside", "°")}
        ${st.max == null ? "" : this._mstat(Math.round(st.max), `max ${st.days}d`, "°")}
        ${chip}
      </div>`;

    const hero = `<div class="pd-wxhero">
        <div>
          <div class="pd-wxbig${reading.ok ? "" : " off"}">${
            reading.ok && live != null ? `${live.toFixed(1)}<sup>°</sup>` : "—"}</div>
          ${this._wxDeltaHtml(sec, live)}
          <div class="pd-wxsrc">${psEsc(reading.ok ? this._wxSrcName(sec)
            : (reading.why === "missing" ? "Sensor not found" : "Sensor unavailable"))}</div>
        </div>
        <div class="pd-wxtiles">
          ${this._mstat(st.min == null ? "—" : st.min.toFixed(1), `min ${st.days}d`, "°")}
          ${this._mstat(st.mean == null ? "—" : st.mean.toFixed(1), `avg ${st.days}d`, "°")}
          ${this._mstat(st.max == null ? "—" : st.max.toFixed(1), `max ${st.days}d`, "°")}
        </div>
      </div>`;

    const note = this._wxNoteText(sec);
    /* The window comes off the CLOSED days, never off the column count.
       Statistics answers with `days` complete buckets plus the one in progress,
       so reading the array's length printed "last 8 days" for `days: 7` — and at
       this panel width it truncated to "last 8 day" as well. */
    const closed = st.days || sec.days || 7;

    return `${this._head(sec, chip)}
      ${mini}
      <div class="pd-pbody pd-full">
        ${hero}
        <div class="pd-wxcol">
          <div class="pd-wxrh"><span class="pd-wxlb">Measured</span>
            <span class="pd-wxrb">${closed} days</span></div>
          ${this._deskWxRail(sec, "hist", live)}
        </div>
        ${note ? `<div class="pd-wxnote">${psEsc(note)}</div>` : ""}
        <div class="pd-xtra">
          <div class="pd-wxrails">
            <div class="pd-wxcol">
              <div class="pd-wxrh"><span class="pd-wxlb">Forecast</span>
                <span class="pd-wxrb">${psEsc(this._wxAttrib(fcSt && fcSt.attributes.attribution) || "high–low")}</span></div>
              ${this._deskWxRail(sec, "fc", live)}
            </div>
            <div class="pd-wxcol">
              ${this._deskWxHourly(sec)}
              ${this._deskWxRows(sec)}
            </div>
          </div>
        </div>
      </div>`;
  },

  _wxDeltaHtml(sec, live) {
    const today = (this._wxStats || []).find((d) => d.partial);
    const from = today && today.min != null && live != null ? live - today.min : null;
    if (from == null) return "";
    return `<div class="pd-wxdelta${from < 0 ? " cool" : ""}">${from >= 0 ? "↑" : "↓"} ${
      Math.abs(from).toFixed(1)}° from today's low</div>`;
  },

  _deskWxRail(sec, which, live) {
    const err = which === "fc" ? this._wxFcErr : this._wxStatsErr;
    if (err) return `<div class="pd-wxbox">${psEsc(err)}</div>`;
    const raw = which === "fc" ? this._wxFc : this._wxStats;
    /* null is still loading; [] is an answer with nothing in it. */
    if (raw == null) return `<div class="pd-wxbox">Reading…</div>`;
    /* `_wxHistRows` is borrowed rather than reimplemented: it is what stops the
       live tick floating above the top of today's own capsule. */
    const rows = which === "fc" ? raw.slice(0, sec.forecast_days || 7) : this._wxHistRows(live);
    if (!rows.length) {
      return `<div class="pd-wxbox">${which === "fc"
        ? `No ${psEsc(this._wxKind(sec).replace("_", " "))} forecast published.`
        : "No statistics for this sensor yet."}</div>`;
    }
    const dom = this._wxDomain(rows, which);
    if (!dom) return `<div class="pd-wxbox">No temperatures in this range.</div>`;

    const cells = rows.map((d) => {
      const isNow = which === "fc" ? d.today : d.partial;
      const hi = which === "fc" ? d.hi : d.max;
      const lo = which === "fc" ? d.lo : d.min;
      const pop = which === "fc" && d.pop != null ? `${Math.round(d.pop)}%` : "";
      return `<div class="pd-wxday${isNow ? " now" : ""}">
          ${which === "fc"
            ? `<ha-icon class="pd-wxi" icon="${psEsc(pcWxIcon(d.condition))}"></ha-icon>` : ""}
          <span class="pd-wxhi">${this._wxDeg(hi)}</span>
          ${this._wxCapsule(lo, hi, dom, isNow && live != null ? live : null, "pd-wx")}
          <span class="pd-wxlo">${this._wxDeg(lo)}</span>
          ${which === "fc" ? `<span class="pd-wxpcp${pop ? "" : " none"}">${pop || "0%"}</span>` : ""}
          <span class="pd-wxdw">${psEsc(this._wxDow(d.ts, isNow))}</span>
        </div>`;
    }).join("");
    return `<div class="pd-wxbox plot"><div class="pd-wxrail"
      style="--n:${rows.length}">${cells}</div></div>`;
  },

  /* Same columns as the phone, from the borrowed derivation, so the two views
     cannot draw the same hour at two different heights. It scrolls here too: a
     stage panel is not wide enough for a day of hours either, and a desk has a
     trackpad. */
  _deskWxHourly(sec) {
    const hrs = this._wxHrs;
    if (!hrs || hrs.length < 2) return "";
    const cols = this._wxHourCols(hrs);
    const wet = cols.some((c) => c.pop != null && c.pop >= 20);
    const body = cols.map((c) => `<div class="pd-wxhr${c.now ? " now" : ""}${c.newDay ? " nd" : ""}">
        <span class="pd-wxht">${this._wxDeg(c.t)}</span>
        <div class="pd-wxhbar"><i style="height:${c.h.toFixed(1)}%"></i></div>
        ${wet ? `<span class="pd-wxhp">${c.pop != null && c.pop >= 20 ? `${Math.round(c.pop)}%` : ""}</span>` : ""}
        <span class="pd-wxhl">${psEsc(c.label)}</span>
      </div>`).join("");
    const temps = cols.map((c) => c.t);
    return `<div>
        <div class="pd-wxrh"><span class="pd-wxlb">Next ${cols.length} hours</span>
          <span class="pd-wxrb">${this._wxDeg(Math.min(...temps))} – ${this._wxDeg(Math.max(...temps))}</span></div>
        <div class="pd-wxhrs">${body}</div>
      </div>`;
  },

  /* A row whose value is missing is dropped, not dashed — NWS publishes no
     apparent temperature and no UV index at all, so a fixed list would be half
     dashes on the most accurate provider available. */
  _deskWxRows(sec) {
    const h = this._hass;
    const fc = sec.forecast && h.states[sec.forecast];
    const feels = sec.feels_from && h.states[sec.feels_from];
    const pick = (k) => {
      const v = feels ? pcNumOf(feels, k) : null;
      return v == null ? (fc ? pcNumOf(fc, k) : null) : v;
    };
    const out = [];
    const hum = pick("humidity");
    const dew = pick("dew_point");
    if (hum != null) out.push(["Humidity", `${Math.round(hum)}%`]);
    if (dew != null) out.push(["Dew point", this._wxDeg(dew)]);
    const ws = pick("wind_speed");
    if (ws != null) {
      const unit = (((feels || fc || {}).attributes) || {}).wind_speed_unit || "";
      out.push(["Wind", `${Math.round(ws)}${unit ? ` ${unit}` : ""}`]);
    }
    const uv = pick("uv_index");
    if (uv != null) out.push(["UV", uv.toFixed(1)]);
    const g = sec.gttc_outdoor && h.states[sec.gttc_outdoor];
    const diff = g ? pcNumOf(g, "outdoor_minus_indoor") : null;
    if (diff != null) out.push(["vs inside", `${diff > 0 ? "+" : ""}${diff.toFixed(1)}°`]);
    if (!out.length) return "";
    return `<div class="pd-wxfacts">${out.map(([k, v]) =>
      this._mstat(v, k)).join("")}</div>`;
  },

  /* ---------------------------------------------------------------- music --*/

  _pnlMusic(sec) {
    const h = this._hass;
    const target = this._activePlayer();
    const st = target && h.states[target];
    const playing = st && st.state === "playing";
    /* An idle MA player KEEPS its media_title and its artwork — the living
       room reports "Bluey Theme Tune" hours after it stopped. psLiveMusic is
       the shared rule; this used to be written out here, which is how the
       shell's copies stayed broken after this one was fixed. */
    const live = !!psLiveMusic(st);
    const title = live ? st.attributes.media_title : null;
    const art = live ? st.attributes.entity_picture_local : null;
    const artist = live ? (st.attributes.media_artist || st.attributes.media_album_name) : null;

    const rooms = (sec.players || []).map((p) => {
      const ps = h.states[p.entity];
      const live = ps && psIsMusic(ps) && ps.state === "playing";
      return `<button class="pd-mr ${this._isPicked(p.entity) ? "sel" : ""} ${live ? "live" : ""}"
          type="button" data-pick="${psEsc(p.entity)}">${psEsc(p.name)}</button>`;
    }).join("");

    const presets = (sec.presets || []).map((p) => `
      <button class="pd-pr" type="button" data-uri="${psEsc(p.uri)}" data-kind="playlist">
        <ha-icon icon="${psEsc(p.icon || "mdi:playlist-music")}"></ha-icon>
        <span class="pd-trunc">${psEsc(p.name)}</span>
      </button>`).join("");

    const idle = (sec.players || []).filter((p) => {
      const ps = h.states[p.entity];
      return !(ps && psIsMusic(ps) && ps.state === "playing");
    }).length;

    const chip = title
      ? this._chip(playing ? "Playing" : "Paused", playing ? "cool" : "")
      : this._chip(`${idle} idle`, "");

    const mini = `<div class="pd-mini">
        ${title
          ? `${this._mstat(psEsc(title), psEsc(artist || "playing"))}`
          : this._mstat("—", "nothing playing")}
        ${chip}
      </div>`;

    return `${this._head(sec, chip)}
      ${mini}
      <div class="pd-pbody pd-full">
        <div class="pd-now">
          <div class="pd-art">${art
            /* entity_picture_local, never entity_picture: MA publishes an
               absolute plain-HTTP URL to its own port, which an HTTPS
               dashboard blocks as mixed content and which is unreachable off
               the LAN. The image simply never loads and nothing says why. */
            ? `<img src="${psEsc(art)}" alt="" />`
            : `<svg viewBox="0 0 24 24" class="pd-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
          <div class="pd-grow">
            <div class="pd-nt pd-trunc">${psEsc(title || "Nothing playing")}</div>
            <div class="pd-ns pd-trunc">${psEsc(artist || this._roomName(sec, target))}</div>
          </div>
          <div class="pd-tbs">
            <button class="pd-tb" type="button" data-mp="prev" ${target ? "" : "disabled"} aria-label="Previous">
              <svg viewBox="0 0 24 24" class="pd-ico"><path d="M18 5v14L8 12zM6 5v14"/></svg></button>
            <button class="pd-tb pp" type="button" data-mp="playpause" ${target ? "" : "disabled"} aria-label="Play or pause">
              <svg viewBox="0 0 24 24" class="pd-ico">${playing
                ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
            <button class="pd-tb" type="button" data-mp="next" ${target ? "" : "disabled"} aria-label="Next">
              <svg viewBox="0 0 24 24" class="pd-ico"><path d="M6 5v14l10-7zM18 5v14"/></svg></button>
          </div>
        </div>
        <div class="pd-lbl">Rooms</div>
        <div class="pd-mroom">${rooms}</div>
        <div class="pd-lbl">Presets</div>
        <div class="pd-pres">${presets}</div>
        <div class="pd-xtra">
          <div class="pd-lbl">Search</div>
          <input class="pd-search" id="pd-q" type="search" placeholder="Tracks, albums, playlists, radio…"
            value="${psEsc(this._query)}" />
          <div class="pd-mtypes">${["all", "track", "album", "artist", "playlist", "radio"].map((k) =>
            `<button class="pd-mt ${this._mtype === k ? "on" : ""}" type="button" data-mtype="${k}">${
              k === "all" ? "All" : this._humanize(k)}</button>`).join("")}</div>
          <div id="ps-res" class="pd-res">${this._resultsHtml()}</div>
          ${this._note ? `<div class="pd-note">${psEsc(this._note)}</div>` : ""}
        </div>
      </div>`;
  },

  /* The ROOM, as config named it. The entity's friendly name is Music
     Assistant's mirror of the source device — the living room speaker answers
     to "Living Room TV", which is both wrong and confusing next to a TV row.
     Config already says what the room is called. */
  _roomName(sec, entity) {
    if (!entity) return "";
    const p = (sec.players || []).find((x) => x.entity === entity);
    return (p && p.name) || pcName(this._hass, entity);
  },

  /* Overrides the shell's, which speaks in ps- classes. The borrowed
     _paintResults calls whichever the instance has, so search-as-you-type
     writes desk markup straight into #ps-res without a repaint — which is what
     keeps the focused field alive mid-word. The id is `ps-res` precisely so
     that borrowed painter finds it. */
  _resultsHtml() {
    if (this._searching) return `<div class="pd-dimtext">Searching…</div>`;
    if (this._results == null) return "";
    if (!this._results.length) return `<div class="pd-dimtext">Nothing found.</div>`;
    return this._results.map((r) => `
      <div class="pd-mi">
        <div class="pd-th">${r.image
          ? `<img src="${psEsc(r.image)}" alt="" />`
          : `<svg viewBox="0 0 24 24" class="pd-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
        <div class="pd-grow">
          <div class="pd-n pd-trunc">${psEsc(r.name)}</div>
          <div class="pd-s pd-trunc">${psEsc(r.sub || r.kind)}</div>
        </div>
        <button class="pd-mini-btn" type="button" data-uri="${psEsc(r.uri)}" data-kind="${psEsc(r.kind)}">Play</button>
        <button class="pd-mini-btn" type="button" data-enq="${psEsc(r.uri)}" data-kind="${psEsc(r.kind)}">Queue</button>
      </div>`).join("");
  },

  /* ------------------------------------------------------------ calendar --*/

  _pnlCalendar(sec) {
    const days = sec.days || 5;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const byDay = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const next = d.getTime() + 86400000;
      byDay.push({
        d,
        events: this._events.filter((e) => e.t >= d.getTime() && e.t < next),
      });
    }
    /* Today always. After that only days that have something, with the empty
       ones counted into one line rather than drawn as five "Nothing scheduled"
       rows — five identical negatives is not information, it is height. */
    const shown = byDay.filter((x, i) => i === 0 || x.events.length);
    const emptyCount = byDay.length - shown.length;
    const next = this._events.find((e) => e.t >= Date.now());

    const dayRow = (x) => `
      <div class="pd-cday">
        <div class="pd-cdt ${x.d.toDateString() === new Date().toDateString() ? "today" : ""}">
          <div class="pd-dw">${x.d.toLocaleDateString([], { weekday: "short" })}</div>
          <div class="pd-dn">${x.d.getDate()}</div>
        </div>
        <div class="pd-cev">${x.events.length
          ? x.events.map((e) => `<div class="pd-ev"><i style="background:${psEsc(e.color)}"></i>
              <span class="pd-trunc">${psEsc(e.name)}</span>
              <span class="pd-et">${e.allDay ? "all day" : psEsc(pdClock(e.t))}</span></div>`).join("")
          : `<div class="pd-ev none">Nothing scheduled</div>`}</div>
      </div>`;

    const chip = this._chip(
      this._events.length ? `${this._events.length} event${this._events.length > 1 ? "s" : ""}` : "clear", "");

    const mini = `<div class="pd-mini">
        ${next
          ? this._mstat(psEsc(new Date(next.t).toLocaleDateString([], { weekday: "short", day: "numeric" })), "next")
          : this._mstat("—", "nothing ahead")}
        ${next ? `<div class="pd-mstat"><span class="pd-mv sm">${psEsc(next.name)}</span>
            <span class="pd-mk">${next.allDay ? "all day" : psEsc(pdClock(next.t))}</span></div>` : ""}
      </div>`;

    return `${this._head(sec, chip)}
      ${mini}
      <div class="pd-pbody pd-full">
        ${shown.map(dayRow).join("")}
        ${emptyCount ? `<div class="pd-dimtext">${emptyCount} more day${
          emptyCount > 1 ? "s" : ""} with nothing scheduled</div>` : ""}
        <div class="pd-xtra">
          ${byDay.filter((x, i) => i > 0 && !x.events.length).map(dayRow).join("")}
          <div class="pd-chiprow">${(sec.entities || []).map((e) => typeof e === "string" ? "" :
            `<span class="pd-chip" style="color:${psEsc(e.color)}"><span class="pd-dot"></span>${
              psEsc(pcName(this._hass, e.entity).replace(/ calendar$/i, ""))}</span>`).join("")}</div>
        </div>
      </div>`;
  },

  /* --------------------------------------------------------- now playing --*/

  _pnlNowplaying(sec) {
    const h = this._hass;
    const rows = [];
    (sec.tvs || []).forEach((tv) => {
      const st = tv.media_player && h.states[tv.media_player];
      if (!st || (st.state !== "playing" && st.state !== "on")) return;
      const app = tv.app_sensor ? pcState(h, tv.app_sensor) : "";
      rows.push(`<div class="pd-npr" data-info="${psEsc(tv.media_player)}" role="button" tabindex="0">
          <div class="pd-th"><svg viewBox="0 0 24 24" class="pd-ico"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 20.5h8"/></svg></div>
          <div class="pd-grow">
            <div class="pd-n pd-trunc">${psEsc(st.attributes.media_title || app || "On")}</div>
            <div class="pd-s pd-trunc">${psEsc(tv.name)}</div>
          </div>
          ${sec.remote_sheet ? `<button class="pd-mini-btn" type="button" data-sheet="${psEsc(sec.remote_sheet)}">Remote</button>` : ""}
        </div>`);
    });
    const np = this._nowPlaying();
    if (np) {
      rows.push(`<div class="pd-npr" data-info="${psEsc(np.entity)}" role="button" tabindex="0">
          <div class="pd-th">${np.st.attributes.entity_picture_local
            ? `<img src="${psEsc(np.st.attributes.entity_picture_local)}" alt="" />`
            : `<svg viewBox="0 0 24 24" class="pd-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
          <div class="pd-grow">
            <div class="pd-n pd-trunc">${psEsc(np.st.attributes.media_title)}</div>
            <div class="pd-s pd-trunc">${psEsc(np.name)} · ${np.playing ? "playing" : "paused"}</div>
          </div>
        </div>`);
    }
    /* Nothing on means no panel at all — the renderer drops a section that
       returns "", hairline and all, rather than leaving an empty column. */
    if (!rows.length) return "";
    return `${this._head(sec, this._chip(`${rows.length} on`, "cool"))}
      <div class="pd-mini">${this._mstat(String(rows.length), rows.length === 1 ? "playing" : "playing")}</div>
      <div class="pd-pbody pd-full">${rows.join("")}</div>`;
  },

  /* ----------------------------------------------------------------- bind --*/

  _bindStage() {
    /* The setpoint moves on the TAP, not on the round trip.
     *
     * Two bugs in one, both of which the phone's stepper shipped with: waiting
     * for HA to echo the value back takes seconds with GTTC, and computing the
     * next value from the LIVE attribute means a second tap inside that window
     * reads the same unchanged temperature and recomputes the same number — so
     * tapping + three times raised the goal by one degree. The optimistic value
     * is what BOTH the display and the next tap read, and a burst of taps sends
     * one call carrying the last value. */
    this._each("[data-goal]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = this._section("climate");
        if (!sec) return;
        const id = sec.goal || sec.thermostat;
        const st = this._hass.states[id];
        const base = this._optGoal(id, pcNumOf(st, "temperature"));
        if (base == null) return;
        const next = Math.round(base + Number(el.dataset.goal));
        /* Expires after 12s so a call that never lands shows the truth again
           rather than leaving an unbacked number on screen. */
        this._goalOpt = { id, value: next, until: Date.now() + 12000 };
        this._last = null;
        this._render();
        clearTimeout(this._goalSend);
        this._goalSend = setTimeout(() => {
          this._hass.callService("climate", "set_temperature", { entity_id: id, temperature: next });
        }, 400);
      });
    });

    /* Cancelling a hold is destructive, so it arms rather than asking. The arm
       lapses after 5s — a modal for this would be heavier than the action. */
    this._each("[data-hold]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = this._section("climate");
        if (this._armed !== "hold") {
          this._armed = "hold";
          this._last = null;
          this._render();
          clearTimeout(this._armTimer);
          this._armTimer = setTimeout(() => {
            this._armed = null; this._last = null; this._render();
          }, 5000);
          return;
        }
        clearTimeout(this._armTimer);
        this._armed = null;
        const svc = (sec.hold || {}).cancel_service;
        if (svc && svc.indexOf(".") > 0) {
          const p = svc.split(".");
          this._hass.callService(p[0], p[1], {});
        }
        this._last = null;
        this._render();
      });
    });

    this._each("[data-retry]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (el.dataset.retry === "nursery") this._fetchNursery();
        else this._fetchHistory();
      });
    });

    /* transport */
    this._each("[data-mp]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const target = this._activePlayer();
        if (!target) return;
        const st = this._hass.states[target];
        const svc = { prev: "media_previous_track", next: "media_next_track" }[el.dataset.mp]
          || (st && st.state === "playing" ? "media_pause" : "media_play");
        this._hass.callService("media_player", svc, { entity_id: target });
      });
    });

    /* Picking a room is a radio, not a set. "Play to two rooms" as two
       play_media calls is two unsynchronised queues, not multi-room — real
       grouping is media_player.join. Every control in this panel acts on the
       one target, including the artwork and the title. */
    this._each("[data-pick]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._togglePick(el.dataset.pick);
        this._render();
      });
    });

    this._each("[data-uri]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._playUri(el.dataset.uri, el.dataset.kind);
      });
    });

    this._each("[data-enq]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._enqueueUri(el.dataset.enq, el.dataset.kind);
      });
    });

    this._each("[data-mtype]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._mtype = el.dataset.mtype;
        this._last = null;
        this._render();
        if ((this._query || "").trim()) this._runSearch();
      });
    });

    /* A focused field must keep _dragging set or the next state change patches
       the input away mid-word. The results are painted straight into their own
       container for the same reason — see _paintResults. */
    this._one("pd-q", (el) => {
      el.addEventListener("focus", () => { this._dragging = true; });
      el.addEventListener("blur", () => { this._dragging = false; });
      el.addEventListener("input", () => this._queueSearch(el.value));
    });
  },
});
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
/* ============================================================================
 * purdy-desk-card — Tier 3, the dock
 *
 * The bottom band is what you PRESS, plus the two readings that are pure
 * ambience: room temperatures and how the server is doing.
 *
 * Everything here is deliberately one line tall. These are the surfaces that
 * grew into whole pop-ups on the phone because a phone has one screen to spend;
 * given a band across the bottom they are a strip of numbers and a row of
 * tiles, and the depth stays one click away in a sheet rather than taking
 * permanent height from the stage.
 * ========================================================================== */

Object.assign(PurdyDeskCard.prototype, {

  _dockHtml() {
    const zones = this._zone("dock").map((sec) => {
      const body = this._dockSection(sec);
      if (!body) return "";
      return `<div class="pd-z pd-z-${psEsc(sec.type)}" style="flex:${sec.weight || 1}">
          <span class="pd-lbl">${psEsc(sec.title || this._humanize(sec.type))}</span>
          ${body}
        </div>`;
    }).join("");
    const links = (this._config.links || []).map((d) => {
      const attr = d.sheet ? `data-sheet="${psEsc(d.sheet)}"` : `data-nav="${psEsc(d.link || "")}"`;
      /* `alert_when_faults` is a BADGE, not a destination. Treating the flag as
         an action meant that with any fault raised — and the low-battery rule
         means there almost always is one — the button stopped going where it
         said it went. It only becomes an action for an entry with nothing of
         its own to open. */
      const faults = d.alert_when_faults ? this._faults().length : 0;
      const dest = (d.sheet || d.link) ? attr : (d.alert_when_faults ? `data-sheet="alerts"` : "");
      return `<button class="pd-link ${faults ? "alert" : ""}" type="button" ${dest}>
          <ha-icon icon="${psEsc(d.icon)}"></ha-icon><span>${psEsc(d.name)}</span>
          ${faults ? `<i class="pd-badge">${faults}</i>` : ""}
        </button>`;
    }).join("");
    return zones + (links ? `<div class="pd-z pd-z-links">${links}</div>` : "");
  },

  _dockSection(sec) {
    const fn = {
      rooms: () => this._dockRooms(sec),
      quick: () => this._dockQuick(sec),
      systems: () => this._dockSystems(sec),
      nowplaying: () => this._dockNowplaying(sec),
      people: () => this._stripSection(sec),
    }[sec.type];
    return fn ? fn() : "";
  },

  /* The room strip. Falls back to the climate section's room list when the
     section carries none of its own — the same rooms written twice in config
     is two lists to keep in step, and they would not stay in step. */
  _dockRooms(sec) {
    const h = this._hass;
    const clim = this._section("climate") || {};
    const rooms = (sec.rooms && sec.rooms.length) ? sec.rooms : (clim.rooms || []);
    const out = (clim.outside || {});
    const cells = [];
    if (out.temp) {
      const t = pcReading(h, out.temp);
      const hu = pcReading(h, out.humidity);
      cells.push(this._roomCell("Outside", t, hu, out.temp, true));
    }
    rooms.forEach((r) => {
      cells.push(this._roomCell(r.name, pcReading(h, r.temp), pcReading(h, r.humidity), r.temp));
    });
    return cells.length ? `<div class="pd-rstrip">${cells.join("")}</div>` : "";
  },

  _roomCell(name, t, hu, id, accent) {
    return `<div class="pd-rc ${accent ? "acc" : ""}" data-info="${psEsc(id || "")}" role="button" tabindex="0">
        <span class="pd-rn">${psEsc(name)}</span>
        <b>${t.ok && t.n != null ? t.n.toFixed(1) + "°" : "—"}</b>
        <span class="pd-rh">${hu.ok && hu.n != null ? hu.n.toFixed(0) + "%" : ""}</span>
      </div>`;
  },

  _dockQuick(sec) {
    const h = this._hass;
    const tiles = (sec.tiles || []).map((t, i) => {
      const st = t.entity && h.states[t.entity];
      const raw = st ? st.state : "";
      const on = (t.on_when || ["on", "home", "playing", "cleaning"]).indexOf(raw) >= 0;
      const alert = (t.alert_when || []).indexOf(raw) >= 0;
      const vr = t.value_entity ? pcReading(h, t.value_entity) : null;
      const value = vr
        ? (vr.ok && vr.n != null ? Math.round(vr.n) + "%" : vr.ok ? this._humanize(vr.st.state) : "—")
        : this._humanize(raw);
      const bar = t.bar_entity ? pcReading(h, t.bar_entity) : null;
      const barPct = bar && bar.ok && bar.n != null ? Math.max(0, Math.min(100, bar.n)) : null;
      const warn = t.bar_warn_above != null && barPct != null && barPct > t.bar_warn_above;
      return `<button class="pd-qt ${alert ? "alert" : on ? "on" : ""}" type="button" data-tile="${i}">
          <ha-icon icon="${psEsc(t.icon || "mdi:toggle-switch")}"></ha-icon>
          <div class="pd-qn">${psEsc(t.name || pcName(h, t.entity))}</div>
          <div class="pd-qv">${psEsc(value || "")}</div>
          ${barPct == null ? "" : `<span class="pd-qbar"><i style="width:${barPct.toFixed(0)}%;background:${
            warn ? "var(--ps-warn)" : "var(--ps-cool)"}"></i></span>`}
        </button>`;
    }).join("");
    return tiles ? `<div class="pd-qstrip">${tiles}</div>` : "";
  },

  /* One line per device group: its worst fault if it has one, otherwise its
     headline meter. A group that is fine says so in three words and takes one
     line; a group that is not says which. */
  _dockSystems(sec) {
    const h = this._hass;
    const rows = (sec.devices || []).map((d) => {
      const fired = (d.faults || []).filter((f) => {
        const st = h.states[f.entity];
        if (!st) return false;
        if (f.state !== undefined) return st.state === f.state;
        if (f.state_not !== undefined) return st.state !== f.state_not
          && st.state !== "unavailable" && st.state !== "unknown";
        return false;
      });
      const m = (d.meters || [])[0];
      const r = m ? pcReading(h, m.entity) : null;
      const pct = r && r.ok && r.n != null ? r.n : null;
      const crit = m && m.critical_above != null && pct != null && pct > m.critical_above;
      const warn = m && m.warn_above != null && pct != null && pct > m.warn_above;
      const col = fired.length || crit ? "var(--ps-bad)" : warn ? "var(--ps-warn)" : "var(--ps-good)";
      const chip = d.chip ? pcState(h, d.chip) : "";
      return `<div class="pd-sysrow ${d.mode || d.sheet ? "tappable" : ""}" ${
          d.sheet ? `data-sheet="${psEsc(d.sheet)}"` : d.link ? `data-nav="${psEsc(d.link)}"` : ""}>
          <ha-icon icon="${psEsc(d.icon || "mdi:chip")}"></ha-icon>
          <span class="pd-sn">${psEsc(d.name)}</span>
          <span class="pd-sv">${fired.length
            ? psEsc(fired[0].label + " " + (fired[0].detail || ""))
            : psEsc(chip || (pct == null ? "—" : pct.toFixed(1) + "%"))}</span>
          ${pct == null ? "" : `<span class="pd-meter"><i style="width:${
            Math.max(0, Math.min(100, pct)).toFixed(0)}%;background:${col}"></i></span>`}
        </div>`;
    }).join("");
    return rows || "";
  },

  _bindDock() {
    this._each("[data-tile]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = this._zone("dock").find((s) => s.type === "quick")
          || this._zone("stage").find((s) => s.type === "quick");
        const t = ((sec && sec.tiles) || [])[Number(el.dataset.tile)];
        if (!t) return;
        /* `sheet` is our own action, so it is handled before pcAction — which
           knows navigate/toggle/perform-action/more-info and rightly nothing
           about this card's sheets. */
        if (t.tap_action && t.tap_action.action === "sheet") {
          this._sheet = t.tap_action.sheet;
          this._last = null;
          this._render();
          return;
        }
        pcAction(this, this._hass, t.tap_action, t.entity);
      });
    });
  },
});
/* ============================================================================
 * purdy-desk-card — the systems panel, and now-playing in the dock
 *
 * These two arrived together because they are one decision: the server is worth
 * a stage panel and the music is not.
 *
 * Music held a full column whether or not anything was playing — six idle rooms
 * and a preset grid, permanently, at the same weight as the climate and the
 * baby. The server had one line in the dock reading "4 of 11", which is not
 * system information, it is a number. So they swap: the panel that answers
 * "how is the server" goes on the stage, and the one that answers "what is
 * playing" becomes a strip in the dock that says nothing when nothing plays.
 * Everything music could do it can still do — the panel moves to a sheet behind
 * the dock's Music button, which is exactly where the phone put it.
 *
 * The rich detail comes from the top-level `server:` block — the same one the
 * phone's systems MODE reads. The desk does not have a mode: it has a wide
 * panel, which is enough room for the meters, the faults and the CPU trend
 * without taking the whole screen over.
 * ========================================================================== */

Object.assign(PurdyDeskCard.prototype, {

  /* The borrowed _collectWatched walks `sections:` and knows nothing about the
     top-level `server:` block, so without this a container starting or an array
     filling up would not repaint until the 30s clock came round. Extends rather
     than replaces — the section walk is still the shell's. */
  _collectWatched() {
    const ids = PurdyShellCard.prototype._collectWatched.call(this);
    const srv = this._config && this._config.server;
    if (!srv) return ids;
    const push = (x) => { if (x && ids.indexOf(x) < 0) ids.push(x); };
    push(srv.status); push(srv.uptime); push(srv.version);
    push(srv.update_available);
    (srv.meters || []).forEach((m) => push(m.entity));
    (srv.stats || []).forEach((s) => push(s.entity));
    (srv.faults || []).forEach((f) => push(f.entity));
    if (srv.docker) { push(srv.docker.running); push(srv.docker.conflicts); }
    if (srv.perf) { push(srv.perf.cpu); push(srv.perf.ram); push(srv.perf.gpu_util); }
    return ids;
  },

  /* A labelled bar. A meter with no reading draws an EMPTY track and says so —
     a bar at zero is a claim that the disk is empty. */
  _meterRow(m) {
    const r = pcReading(this._hass, m.entity);
    const n = r.ok ? r.n : null;
    const crit = m.critical_above != null && n != null && n > m.critical_above;
    const warn = m.warn_above != null && n != null && n > m.warn_above;
    const col = crit ? "var(--ps-bad)" : warn ? "var(--ps-warn)" : "var(--ps-cool)";
    return `<div class="pd-mrow" data-info="${psEsc(m.entity)}" role="button" tabindex="0">
        <span class="pd-ml">${psEsc(m.label)}</span>
        <span class="pd-mbar">${n == null ? ""
          : `<i style="width:${Math.max(0, Math.min(100, n)).toFixed(1)}%;background:${col}"></i>`}</span>
        <span class="pd-mv2" style="${n != null && (crit || warn) ? `color:${col}` : ""}">${
          n == null ? "—" : n.toFixed(1) + "%"}</span>
      </div>`;
  },

  _pnlSystems(sec) {
    const h = this._hass;
    const srv = this._config.server;
    /* No server block: fall back to the dock treatment rather than an empty
       column — a section moved between tiers must never render blank. */
    if (!srv) {
      const body = this._dockSystems(sec);
      return body ? `${this._head(sec, "")}<div class="pd-pbody pd-full">${body}</div>` : "";
    }

    const faults = this._serverFaults();
    const worst = faults.some((f) => f.severity === "critical") ? "bad"
      : faults.length ? "warn" : "good";
    const chip = this._chip(
      faults.length ? `${faults.length} fault${faults.length > 1 ? "s" : ""}` : "Healthy", worst);

    const status = srv.status ? pcState(h, srv.status) : "";
    const uptime = srv.uptime ? pcState(h, srv.uptime) : "";
    const running = srv.docker && srv.docker.running ? pcState(h, srv.docker.running) : "";
    const arr = (srv.meters || [])[0];
    const arrR = arr ? pcReading(h, arr.entity) : null;

    const cpuId = srv.perf && srv.perf.cpu;
    const cpu = cpuId ? pcReading(h, cpuId) : null;

    const stats = (srv.stats || []).map((s) => {
      const r = pcReading(h, s.entity);
      const v = r.ok && r.n != null
        ? r.n.toFixed(s.digits == null ? 0 : s.digits) + (s.unit || "")
        : (r.ok ? this._humanize(r.st.state) : "—");
      return `<div class="pd-sstat"><span class="pd-sv2">${psEsc(v)}</span>
          <span class="pd-sk">${psEsc(s.label)}</span></div>`;
    }).join("");

    const faultRows = faults.map((f) => `
      <div class="pd-ar">
        <span class="pd-sev ${psEsc(f.severity || "warn")}"></span>
        <div class="pd-grow">
          <div class="pd-at">${psEsc(f.label)}</div>
          <div class="pd-ad">${psEsc(f.detail || "")}</div>
        </div>
        <button class="pd-mini-btn" type="button" data-info="${psEsc(f.entity)}">Open</button>
      </div>`).join("");

    /* The other things in the house that are "systems" — the vacuum and the
       litter box. Secondary to the server, not absent. */
    const others = (sec.devices || [])
      .filter((d) => d.key !== "nas" && d.name !== srv.name)
      .map((d) => {
        const m = (d.meters || [])[0];
        const r = m ? pcReading(h, m.entity) : null;
        const n = r && r.ok ? r.n : null;
        return `<div class="pd-sysrow">
            <ha-icon icon="${psEsc(d.icon || "mdi:chip")}"></ha-icon>
            <span class="pd-sn">${psEsc(d.name)}</span>
            <span class="pd-sv">${psEsc(d.chip ? this._humanize(pcState(h, d.chip)) : "")}</span>
            ${n == null ? "" : `<span class="pd-meter"><i style="width:${
              Math.max(0, Math.min(100, n)).toFixed(0)}%;background:${
              m.warn_above != null && n > m.warn_above ? "var(--ps-warn)" : "var(--ps-good)"}"></i></span>`}
          </div>`;
      }).join("");

    const update = srv.update_available && pcState(h, srv.update_available) === "on";

    return `${this._head(sec, chip)}
      <div class="pd-mini">
        ${this._mstat(arrR && arrR.ok && arrR.n != null ? arrR.n.toFixed(0) : "—", "array", "%")}
        ${running ? this._mstat(psEsc(running), "containers") : ""}
        ${chip}
      </div>
      <div class="pd-pbody pd-full">
        <div class="pd-srvhead">
          <div class="pd-grow">
            <div class="pd-srvn">${psEsc(srv.name || "Server")}</div>
            <div class="pd-srvs">${psEsc([status && this._humanize(status), uptime].filter(Boolean).join(" · ") || "—")}</div>
          </div>
          ${cpu && cpu.ok && cpu.n != null
            ? `<div class="pd-cpu"><span class="pd-cpuv">${cpu.n.toFixed(1)}<small>%</small></span>
                 <span class="pd-cpuk">CPU</span></div>` : ""}
          ${cpuId ? `<span class="pd-spark wide">${this._sparkSvg(cpuId)}</span>` : ""}
        </div>
        <div class="pd-meters">${(srv.meters || []).map((m) => this._meterRow(m)).join("")}</div>
        ${stats ? `<div class="pd-sstats">${stats}</div>` : ""}
        ${running ? `<div class="pd-srow"><span>Containers</span><b>${psEsc(running)}</b></div>` : ""}
        <div class="pd-xtra">
          ${faultRows || `<div class="pd-dimtext">Nothing wrong with ${psEsc(srv.name || "the server")}.</div>`}
          ${update ? `<div class="pd-srow"><span>Update available</span>${srv.update_url
            ? `<a class="pd-mini-btn" href="${psEsc(srv.update_url)}" target="_blank" rel="noreferrer">Open</a>` : ""}</div>` : ""}
          ${others ? `<div class="pd-sub2">Also</div>${others}` : ""}
          ${srv.url ? `<a class="pd-mini-btn" href="${psEsc(srv.url)}" target="_blank" rel="noreferrer">Open ${psEsc(srv.name || "server")}</a>` : ""}
        </div>
      </div>`;
  },

  /* --------------------------------------------------- now playing, docked --
   *
   * Says nothing when nothing plays. The strip keeps its slot so the dock does
   * not reflow every time the music stops, but it draws only a dimmed prompt —
   * a transport with nothing behind it is a row of dead buttons.
   */
  _dockNowplaying(sec) {
    const h = this._hass;
    const target = this._activePlayer();
    const st = target && h.states[target];
    const live = !!psLiveMusic(st);
    const playing = !!st && st.state === "playing";
    const title = live ? st.attributes.media_title : null;
    const art = live ? st.attributes.entity_picture_local : null;
    const artist = live ? (st.attributes.media_artist || st.attributes.media_album_name) : null;

    if (!title) {
      return `<div class="pd-npbar idle" data-sheet="${psEsc(sec.sheet || "music")}" role="button" tabindex="0">
          <div class="pd-th"><svg viewBox="0 0 24 24" class="pd-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg></div>
          <div class="pd-grow"><div class="pd-n pd-trunc">Nothing playing</div>
            <div class="pd-s pd-trunc">${psEsc(this._roomName(this._musicSec() || {}, target) || "")}</div></div>
        </div>`;
    }

    return `<div class="pd-npbar">
        <div class="pd-th" data-sheet="${psEsc(sec.sheet || "music")}" role="button" tabindex="0">${art
          ? `<img src="${psEsc(art)}" alt="" />`
          : `<svg viewBox="0 0 24 24" class="pd-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
        <div class="pd-grow" data-sheet="${psEsc(sec.sheet || "music")}" role="button" tabindex="0">
          <div class="pd-n pd-trunc">${psEsc(title)}</div>
          <div class="pd-s pd-trunc">${psEsc([artist, this._roomName(this._musicSec() || {}, target)].filter(Boolean).join(" · "))}</div>
        </div>
        <div class="pd-tbs">
          <button class="pd-tb" type="button" data-mp="prev" aria-label="Previous">
            <svg viewBox="0 0 24 24" class="pd-ico"><path d="M18 5v14L8 12zM6 5v14"/></svg></button>
          <button class="pd-tb pp" type="button" data-mp="playpause" aria-label="Play or pause">
            <svg viewBox="0 0 24 24" class="pd-ico">${playing
              ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
          <button class="pd-tb" type="button" data-mp="next" aria-label="Next">
            <svg viewBox="0 0 24 24" class="pd-ico"><path d="M6 5v14l10-7zM18 5v14"/></svg></button>
        </div>
      </div>`;
  },
});
/* ============================================================================
 * purdy-desk-card — styles
 *
 * Kept whole and in source order, like the shell's. Splitting a sheet by
 * section re-orders rules and quietly changes the cascade.
 *
 * Two rules govern this file:
 *
 *   1. Sizes, radii and surface tints come from the scales in PC_TOKENS. Pick a
 *      step; do not invent one. The three desk-only steps below are declared as
 *      tokens for the same reason — a desk is read from three feet rather than
 *      one, so the display sizes genuinely differ, and the way to express that
 *      is to extend the scale rather than to sprinkle loose pixels.
 *
 *   2. Exactly ONE property animates on this screen: the stage's
 *      grid-template-columns, on a node the renderer never replaces. Every
 *      other state change is a display swap. A transition on a patched node
 *      re-runs from zero on every repaint.
 *
 * The palette is declared with the SHELL's variable names on purpose. The ring
 * and sparkline helpers are borrowed verbatim from purdy-shell-card and write
 * var(--ps-track) and var(--ps-warn) into their SVG; sharing the names is what
 * lets those be one function instead of two.
 * ========================================================================== */

const PD_STYLES = `
      :host {
        ${PC_TOKENS}

        --ps-text: #e8eef4;
        --ps-muted: #8792a0;
        /* The smallest text must not also be the faintest. #606b79 measures
           3.6:1 on this ground — under the 4.5:1 floor — and it would colour
           every uppercase micro label on the screen. This is ~4.9:1. */
        --ps-dim: #7c8797;
        --ps-cool: #4dd0e1;
        --ps-heat: #ff9557;
        --ps-good: #81c995;
        --ps-warn: #f2c14e;
        --ps-bad: #ef6a6a;
        --ps-deep: #aa78ff;
        --ps-light: #50a0ff;
        --ps-track: rgba(255, 255, 255, 0.12);
        --ps-hair: rgba(255, 255, 255, 0.075);
        --ps-hair-soft: rgba(255, 255, 255, 0.045);

        /* Desk display steps. Read at arm's length rather than at reading
           distance, so the clock and the hero numbers sit above the shared
           scale's top step rather than borrowing it. */
        --pd-fs-clock: 34px;
        --pd-fs-hero: 26px;
        --pd-fs-big: 21px;

        display: block;
        position: relative;
        /* Never wider than the view. The shell once carried a negative
           horizontal margin to fight view padding and the whole page scrolled
           sideways whenever a drag started. */
        max-width: 100%;
        overflow: hidden;
        /* The desk is a fixed sheet: the page does not scroll, the panels do.
           The offset is what the HA header, the view padding and any kiosk-mode
           setting take off the top — which differs per install and is the first
           thing that will need tuning, so it is the viewport_offset config key
           rather than a number baked into the sheet. */
        height: calc(100dvh - var(--pd-off, 88px));
        min-height: 560px;
        color: var(--ps-text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        border-radius: var(--pc-r-2xl);
      }

      * { box-sizing: border-box; }
      button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; }
      button:disabled { opacity: .35; cursor: default; }
      img { max-width: 100%; display: block; }

      /* ---------------------------------------------------------- ground --*/

      /* One gradient under everything. The melded look depends on there being
         no per-panel backgrounds — twelve cards with a margin read as a list of
         boxes however they are styled, because the boxes ARE the gaps. */
      .pd-ground {
        position: absolute; inset: 0; pointer-events: none;
        border-radius: inherit;
        background:
          radial-gradient(95% 78% at 88% -14%, rgba(122, 86, 255, .40), transparent 62%),
          radial-gradient(80% 70% at 4% 108%, rgba(26, 128, 142, .42), transparent 60%),
          radial-gradient(60% 50% at 46% 46%, rgba(60, 44, 120, .30), transparent 70%),
          linear-gradient(168deg, #0B0D16 0%, #080A12 55%, #06070E 100%);
      }

      /* One continuous glass sheet, subdivided by hairlines. */
      .pd-sheet {
        position: relative;
        height: 100%;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        background: linear-gradient(180deg, rgba(255,255,255,.058), rgba(255,255,255,.028));
        border: 1px solid var(--pc-edge);
        border-radius: var(--pc-r-2xl);
        overflow: hidden;
        box-shadow: 0 30px 80px -20px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.07);
        backdrop-filter: blur(28px) saturate(1.25);
        -webkit-backdrop-filter: blur(28px) saturate(1.25);
      }

      .pd-tier { display: flex; min-width: 0; }
      .pd-tier + .pd-tier { border-top: 1px solid var(--ps-hair); }
      .pd-t1, .pd-t3 { flex: 0 0 auto; }
      .pd-t2 { min-height: 0; }

      .pd-z {
        padding: 12px 18px; min-width: 0;
        display: flex; flex-direction: column; justify-content: center;
      }
      .pd-z + .pd-z { border-left: 1px solid var(--ps-hair-soft); }

      /* ----------------------------------------------------------- atoms --*/

      .pd-lbl {
        font-size: var(--pc-fs-micro); letter-spacing: .14em; text-transform: uppercase;
        color: var(--ps-dim); font-weight: 600; margin-bottom: 6px;
      }
      .pd-grow { flex: 1; min-width: 0; }
      .pd-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pd-dimtext { font-size: var(--pc-fs-xs); color: var(--ps-dim); }
      .pd-ico { width: 18px; height: 18px; display: block; flex: 0 0 auto; }
      .pd-ico path, .pd-ico circle, .pd-ico rect, .pd-ico line, .pd-ico polyline {
        fill: none; stroke: currentColor; stroke-width: 1.7;
        stroke-linecap: round; stroke-linejoin: round;
      }
      ha-icon { --mdc-icon-size: 18px; flex: 0 0 auto; }

      .pd-chip {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 3px 9px; border-radius: var(--pc-r-pill);
        font-size: var(--pc-fs-xs); font-weight: 600;
        background: var(--pc-fill-2); color: var(--ps-muted);
        font-variant-numeric: tabular-nums; white-space: nowrap;
      }
      .pd-chip.good { background: rgba(129,201,149,.16); color: var(--ps-good); }
      .pd-chip.warn { background: rgba(242,193,78,.16); color: var(--ps-warn); }
      .pd-chip.bad  { background: rgba(239,106,106,.16); color: var(--ps-bad); }
      .pd-chip.cool { background: rgba(77,208,225,.15); color: var(--ps-cool); }
      .pd-chip.heat { background: rgba(255,149,87,.15); color: var(--ps-heat); }
      .pd-chip.deep { background: rgba(170,120,255,.17); color: var(--ps-deep); }
      .pd-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }

      .pd-mini-btn {
        font-size: var(--pc-fs-xs); font-weight: 600; color: var(--ps-muted);
        background: var(--pc-fill-2); border-radius: var(--pc-r-xs);
        padding: 4px 10px; white-space: nowrap;
      }
      .pd-mini-btn:hover { background: var(--pc-fill-3); color: var(--ps-text); }
      .pd-mini-btn.arm { background: rgba(239,106,106,.2); color: var(--ps-bad); }
      .pd-note { font-size: var(--pc-fs-micro); color: var(--ps-dim); margin-top: 6px; }
      .pd-empty { font-size: var(--pc-fs-sm); color: var(--ps-muted); padding: 6px 0; }

      /* Focus has to be visible on a view driven by a keyboard as often as a
         mouse — a desk view is the one place tabbing is normal. */
      button:focus-visible, [tabindex]:focus-visible, input:focus-visible {
        outline: 2px solid var(--ps-cool); outline-offset: 2px; border-radius: var(--pc-r-hair);
      }

      /* --------------------------------------------------- tier 1 · strip --*/

      .pd-z-id { flex: 0 0 clamp(200px, 17%, 290px); }
      .pd-z-id h2 {
        margin: 0; font-size: var(--pc-fs-xl); font-weight: 640;
        letter-spacing: -.024em; line-height: 1.15;
      }
      .pd-sub { font-size: var(--pc-fs-xs); color: var(--ps-muted); margin-top: 2px; }

      .pd-z-clock { flex: 0 0 130px; align-items: center; text-align: center; }
      .pd-time {
        font-size: var(--pd-fs-clock); font-weight: 200; letter-spacing: -.035em;
        font-variant-numeric: tabular-nums; line-height: 1;
      }
      .pd-mer {
        font-size: var(--pc-fs-micro); letter-spacing: .15em; text-transform: uppercase;
        color: var(--ps-dim); margin-top: 5px; font-weight: 600;
      }

      .pd-z-wx { flex: 0 0 clamp(190px, 15%, 250px); cursor: pointer; }
      .pd-wxmain { display: flex; align-items: center; gap: 11px; }
      .pd-wxmain ha-icon { --mdc-icon-size: 30px; color: var(--ps-cool); }
      .pd-wxt {
        font-size: var(--pd-fs-hero); font-weight: 600;
        letter-spacing: -.025em; font-variant-numeric: tabular-nums; line-height: 1.1;
      }
      .pd-wxs { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .pd-wxout {
        display: flex; gap: 14px; margin-top: 6px;
        font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums;
      }
      .pd-wxout b { color: var(--ps-text); font-weight: 600; }

      .pd-z-hvac { flex: 1; }
      .pd-hv { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
      .pd-hvbig {
        font-size: var(--pd-fs-hero); font-weight: 600;
        letter-spacing: -.025em; font-variant-numeric: tabular-nums; line-height: 1.1;
      }
      .pd-zpair { display: flex; gap: 6px; }
      .pd-zc {
        padding: 5px 10px; border-radius: var(--pc-r-xs); background: var(--pc-fill-1);
        font-size: var(--pc-fs-xs); color: var(--ps-muted);
        font-variant-numeric: tabular-nums; line-height: 1.3;
      }
      .pd-zc b { display: block; font-size: var(--pc-fs-md); color: var(--ps-text); font-weight: 650; }
      .pd-zc.on { background: rgba(77,208,225,.15); color: var(--ps-cool); }
      .pd-zc.on b { color: var(--ps-cool); }

      .pd-z-sec { flex: 0 0 auto; }
      .pd-ppl { display: flex; gap: 8px; }
      .pd-pw {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 12px 6px 6px; border-radius: var(--pc-r-pill);
        background: var(--pc-fill-1); cursor: pointer;
      }
      .pd-pw:hover { background: var(--pc-fill-2); }
      .pd-av {
        width: 27px; height: 27px; border-radius: 50%; background: var(--pc-fill-3);
        display: grid; place-items: center;
        font-size: var(--pc-fs-xs); font-weight: 700; color: var(--ps-muted); flex: 0 0 auto;
      }
      .pd-pw.home .pd-av { background: rgba(129,201,149,.2); color: var(--ps-good); }
      .pd-pn { font-size: var(--pc-fs-sm); font-weight: 600; line-height: 1.15; }
      .pd-pb { font-size: var(--pc-fs-micro); color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .pd-pb.low { color: var(--ps-warn); }

      .pd-z-alert { flex: 0 0 auto; justify-content: center; position: relative; }
      .pd-pop {
        position: absolute; top: calc(100% + 8px); right: 12px; width: 340px; z-index: 9;
        background: rgba(20,23,32,.97); border: 1px solid var(--pc-edge);
        border-radius: var(--pc-r-lg); padding: 10px 12px;
        box-shadow: 0 24px 60px rgba(0,0,0,.6);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      }
      .pd-ar { display: flex; align-items: center; gap: 9px; padding: 7px 0; }
      .pd-ar + .pd-ar { border-top: 1px solid var(--ps-hair-soft); }
      .pd-at { font-size: var(--pc-fs-sm); font-weight: 600; }
      .pd-ad { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .pd-sev { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: var(--ps-dim); }
      .pd-sev.critical { background: var(--ps-bad); }
      .pd-sev.warn { background: var(--ps-warn); }

      /* --------------------------------------------------- tier 2 · stage --*/

      .pd-stage {
        display: grid; flex: 1; min-width: 0; min-height: 0;
        /* THE one animated property on this screen. It is safe only because
           #pd-stage is mounted once and never replaced — see _mount. */
        transition: grid-template-columns .42s cubic-bezier(.4, 0, .2, 1);
      }
      .pd-panelwrap {
        display: flex; flex-direction: column;
        min-width: 0; min-height: 0; overflow: hidden;
        padding: 13px 17px 15px;
      }
      .pd-panelwrap + .pd-panelwrap { border-left: 1px solid var(--ps-hair-soft); }
      .pd-panel.is-min { padding-left: 12px; padding-right: 12px; }

      .pd-ph {
        display: flex; align-items: center; gap: 8px; width: 100%;
        padding: 0 0 9px; text-align: left; flex: 0 0 auto;
      }
      .pd-ph.static { cursor: default; }
      .pd-nm { font-size: var(--pc-fs-md); font-weight: 650; letter-spacing: -.005em; }
      .pd-cv { margin-left: auto; color: var(--ps-dim); }
      .pd-cv .pd-ico { width: 15px; height: 15px; }
      .pd-panel.is-exp .pd-cv { color: var(--ps-cool); transform: rotate(90deg); }

      /* The three faces. Display swaps only — never a height or opacity
         animation, which would re-run on every repaint. */
      .pd-mini { display: none; flex-direction: column; gap: 9px; min-height: 0; }
      .pd-panel.is-min .pd-mini { display: flex; }
      .pd-panel.is-min .pd-full { display: none; }
      .pd-xtra { display: none; flex-direction: column; gap: 10px; }
      .pd-panel.is-exp .pd-xtra { display: flex; }

      .pd-pbody {
        flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 11px;
        /* The PAGE never scrolls; a panel that has more than fits does. */
        overflow-y: auto; overflow-x: hidden;
        scrollbar-width: thin; scrollbar-color: var(--pc-fill-3) transparent;
      }
      .pd-pbody::-webkit-scrollbar { width: 6px; }
      .pd-pbody::-webkit-scrollbar-thumb { background: var(--pc-fill-3); border-radius: var(--pc-r-pill); }

      .pd-mstat { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .pd-mv {
        font-size: var(--pd-fs-big); font-weight: 600; letter-spacing: -.028em;
        font-variant-numeric: tabular-nums; line-height: 1.08;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pd-mv.sm { font-size: var(--pc-fs-md); }
      .pd-mv small { font-size: var(--pc-fs-xs); font-weight: 500; color: var(--ps-muted); margin-left: 2px; }
      .pd-mk {
        font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase;
        color: var(--ps-dim); font-weight: 600;
      }

      /* rings, shared markup with the shell */
      .pd-ring { position: relative; flex: 0 0 auto; }
      .pd-rv {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; font-variant-numeric: tabular-nums;
      }
      .pd-rv b { font-size: var(--pd-fs-big); font-weight: 640; letter-spacing: -.025em; line-height: 1; }
      .pd-rv small {
        font-size: var(--pc-fs-micro); color: var(--ps-dim); margin-top: 3px;
        letter-spacing: .06em; text-transform: uppercase; font-weight: 600;
      }
      /* The small modifier is DEFINED, not merely used. A nap ring asking for a
         size that does not exist draws its number at the hero step inside a
         54px ring and spills over the stroke. */
      .pd-rv.sm b { font-size: var(--pc-fs-xs); }

      /* climate */
      .pd-cwrap { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }
      .pd-steprow { display: flex; align-items: center; gap: 10px; }
      .pd-step {
        width: 30px; height: 30px; border-radius: 50%; background: var(--pc-fill-2);
        display: grid; place-items: center; flex: 0 0 auto; position: relative;
      }
      .pd-step:hover:not(:disabled) { background: var(--pc-fill-3); }
      .pd-step .pd-ico { width: 15px; height: 15px; }
      .pd-goal { display: flex; align-items: baseline; gap: 6px; }
      .pd-goal b { font-size: var(--pd-fs-big); font-weight: 650; font-variant-numeric: tabular-nums; }
      .pd-goal span { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .pd-cnote { font-size: var(--pc-fs-xs); color: var(--ps-muted); margin-top: 8px; line-height: 1.45; }

      /* Stretches into the space it is given, but only so far. Uncapped it grew
         to ~340px on a 1440 desktop — a 24-hour trend line taking a third of
         the screen height, which is not what the panel is about. */
      .pd-graph {
        position: relative; flex: 1 1 auto;
        min-height: 110px; max-height: 240px;
        display: flex; flex-direction: column;
      }
      .pd-wavesvg { width: 100%; flex: 1; min-height: 60px; display: block; }
      .pd-nohist {
        font-size: var(--pc-fs-xs); color: var(--ps-dim);
        display: grid; place-items: center; min-height: 60px; text-align: center;
      }
      .pd-axis { position: relative; height: 12px; }
      .pd-axis span {
        position: absolute; transform: translateX(-50%);
        font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums;
      }
      .pd-glg {
        display: flex; gap: 13px; align-items: center;
        font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums;
      }
      .pd-glg i { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 5px; }
      .pd-glg b { color: var(--ps-text); font-weight: 600; margin-left: 3px; }
      .pd-readout {
        margin-left: auto; opacity: 0; color: var(--ps-text); font-weight: 600;
        font-size: var(--pc-fs-xs); white-space: nowrap;
      }
      .pd-cross {
        position: absolute; top: 0; bottom: 24px; width: 1px;
        background: var(--ps-text); opacity: 0; pointer-events: none;
      }

      .pd-rmlist { display: flex; flex-direction: column; }
      .pd-rml {
        display: flex; align-items: center; gap: 10px; padding: 6px 0;
        border-top: 1px solid var(--ps-hair-soft); font-size: var(--pc-fs-sm); cursor: pointer;
      }
      .pd-rmn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pd-spark { width: 56px; height: 18px; flex: 0 0 auto; opacity: .8; }
      .pd-spark svg { width: 56px; height: 18px; display: block; }
      .pd-rmv { font-weight: 650; font-variant-numeric: tabular-nums; }
      .pd-rmh {
        color: var(--ps-dim); font-size: var(--pc-fs-micro);
        font-variant-numeric: tabular-nums; width: 42px; text-align: right;
      }
      .pd-chiprow { display: flex; gap: 6px; flex-wrap: wrap; }
      .pd-hold {
        display: flex; align-items: center; gap: 9px; margin-top: 6px;
        font-size: var(--pc-fs-xs); color: var(--ps-muted);
      }
      .pd-hold button { margin-left: auto; }

      /* nursery */
      .pd-jwrap { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }
      .pd-naps { display: flex; gap: 10px; flex-wrap: wrap; }
      .pd-nap { display: flex; flex-direction: column; align-items: center; gap: 3px; }
      .pd-napt { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .pd-jstatus { font-size: var(--pc-fs-xs); color: var(--ps-muted); margin-top: 9px; line-height: 1.45; }

      /* Both rails live in a box. They are plots with an axis, and a bare line
         on the card ground does not read as one. */
      .pd-railbox {
        background: var(--pc-fill-1); border-radius: var(--pc-r-md);
        padding: 9px 11px 7px; flex: 0 0 auto;
      }
      .pd-railhead, .pd-railfoot {
        display: flex; justify-content: space-between; align-items: center;
        font-size: var(--pc-fs-micro); color: var(--ps-dim);
        font-variant-numeric: tabular-nums; letter-spacing: .1em; text-transform: uppercase;
        font-weight: 600;
      }
      .pd-railfoot { margin-top: 5px; letter-spacing: 0; text-transform: none; }
      .pd-rail {
        position: relative; height: 26px; margin-top: 6px;
        border-radius: var(--pc-r-hair); overflow: hidden; background: var(--pc-fill-1);
      }
      .pd-seg { position: absolute; top: 0; bottom: 0; display: block; }
      .pd-seg.settle { background: rgba(170,120,255,.45); }
      .pd-seg.sleep { background: rgba(80,160,255,.55); }
      .pd-tick {
        position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px;
        background: var(--ps-warn); display: block;
      }
      .pd-grid { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--ps-hair); display: block; }

      .pd-sub2 {
        font-size: var(--pc-fs-micro); letter-spacing: .12em; text-transform: uppercase;
        color: var(--ps-dim); font-weight: 600; margin-top: 4px;
      }
      .pd-jr {
        display: flex; align-items: center; gap: 9px; background: var(--pc-fill-1);
        border-radius: var(--pc-r-xs); padding: 6px 10px;
        font-size: var(--pc-fs-xs); font-variant-numeric: tabular-nums;
      }
      .pd-jr .pd-l { color: var(--ps-muted); flex: 1; min-width: 0; }
      .pd-jr .pd-v { font-weight: 640; }
      .pd-jr .pd-c { color: var(--ps-dim); text-align: right; max-width: 46%;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      /* music */
      .pd-now { display: flex; align-items: center; gap: 11px; flex: 0 0 auto; }
      .pd-art {
        width: 54px; height: 54px; border-radius: var(--pc-r-md); background: var(--pc-fill-2);
        display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden;
      }
      .pd-art img { width: 100%; height: 100%; object-fit: cover; }
      .pd-nt { font-size: var(--pc-fs-lg); font-weight: 640; letter-spacing: -.012em; }
      .pd-ns { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .pd-tbs { display: flex; gap: 4px; align-items: center; }
      .pd-tb {
        width: 32px; height: 32px; border-radius: 50%;
        display: grid; place-items: center; color: var(--ps-text);
      }
      .pd-tb:hover:not(:disabled) { background: var(--pc-fill-2); }
      .pd-tb.pp { background: var(--pc-fill-2); width: 36px; height: 36px; }
      .pd-tb .pd-ico { width: 17px; height: 17px; }
      .pd-mroom { display: flex; flex-wrap: wrap; gap: 5px; }
      .pd-mr {
        padding: 6px 10px; border-radius: var(--pc-r-xs); background: var(--pc-fill-1);
        color: var(--ps-muted); font-size: var(--pc-fs-xs); font-weight: 600;
      }
      .pd-mr:hover { background: var(--pc-fill-2); }
      .pd-mr.sel { background: var(--pc-fill-3); color: var(--ps-text); }
      .pd-mr.live { color: var(--ps-cool); }
      .pd-pres { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
      .pd-pr {
        padding: 8px 10px; border-radius: var(--pc-r-sm); background: var(--pc-fill-1);
        font-size: var(--pc-fs-xs); font-weight: 600;
        display: flex; align-items: center; gap: 7px; min-width: 0; text-align: left;
      }
      .pd-pr:hover { background: var(--pc-fill-2); }
      .pd-pr ha-icon { --mdc-icon-size: 15px; color: var(--ps-cool); }
      .pd-search {
        width: 100%; background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
        border-radius: var(--pc-r-sm); padding: 8px 11px; color: var(--ps-text);
        /* 16px exactly: below that iOS Safari zooms the page on focus and never
           zooms back. A desk view still gets opened on a tablet. */
        font-size: 16px;
      }
      .pd-mtypes { display: flex; gap: 5px; flex-wrap: wrap; }
      .pd-mt {
        font-size: var(--pc-fs-micro); font-weight: 600; color: var(--ps-dim);
        background: var(--pc-fill-1); border-radius: var(--pc-r-pill); padding: 4px 9px;
      }
      .pd-mt.on { background: rgba(77,208,225,.15); color: var(--ps-cool); }
      .pd-res { display: flex; flex-direction: column; gap: 1px; }
      .pd-mi, .pd-npr { display: flex; align-items: center; gap: 9px; padding: 6px 2px; }
      .pd-npr { cursor: pointer; border-radius: var(--pc-r-xs); }
      .pd-npr:hover { background: var(--pc-fill-1); }
      .pd-th {
        width: 34px; height: 34px; border-radius: var(--pc-r-xs); background: var(--pc-fill-2);
        display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden;
      }
      .pd-th img { width: 100%; height: 100%; object-fit: cover; }
      .pd-mi .pd-n, .pd-npr .pd-n { font-size: var(--pc-fs-sm); font-weight: 600; }
      .pd-mi .pd-s, .pd-npr .pd-s { font-size: var(--pc-fs-micro); color: var(--ps-dim); }

      /* calendar */
      .pd-cday { display: flex; gap: 10px; padding: 6px 0; }
      .pd-cday + .pd-cday { border-top: 1px solid var(--ps-hair-soft); }
      .pd-cdt { flex: 0 0 32px; text-align: center; }
      .pd-dw {
        font-size: var(--pc-fs-micro); letter-spacing: .11em; text-transform: uppercase;
        color: var(--ps-dim); font-weight: 600;
      }
      .pd-dn { font-size: var(--pc-fs-lg); font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.2; }
      .pd-cdt.today .pd-dn { color: var(--ps-cool); }
      .pd-cev { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; justify-content: center; }
      .pd-ev { display: flex; align-items: center; gap: 7px; font-size: var(--pc-fs-xs); }
      .pd-ev i { width: 3px; height: 13px; border-radius: 2px; flex: 0 0 auto; }
      .pd-et { margin-left: auto; color: var(--ps-dim); font-size: var(--pc-fs-micro);
        font-variant-numeric: tabular-nums; white-space: nowrap; }
      .pd-ev.none { color: var(--ps-dim); }

      /* lights */
      .pd-moods { display: flex; gap: 6px; flex-wrap: wrap; }
      .pd-mood {
        display: flex; align-items: center; gap: 6px; padding: 7px 11px;
        border-radius: var(--pc-r-sm); background: var(--pc-fill-1);
        font-size: var(--pc-fs-xs); font-weight: 600; color: var(--ps-muted); min-width: 0;
      }
      .pd-mood:hover { background: var(--pc-fill-2); color: var(--ps-text); }
      .pd-mood ha-icon { --mdc-icon-size: 15px; }
      .pd-lights { display: flex; flex-direction: column; gap: 4px; }
      .pd-lrow {
        position: relative; display: flex; align-items: center; gap: 10px;
        padding: 10px 12px; border-radius: var(--pc-r-sm);
        background: var(--pc-fill-1); overflow: hidden;
        cursor: pointer; touch-action: pan-y; user-select: none;
      }
      /* The glow IS the brightness: it starts at the bulb and falls off across
         the row. No fill, no track — an off light is dark, not 0%. */
      .pd-lglow {
        position: absolute; inset: 0; pointer-events: none; opacity: 0;
        background: linear-gradient(90deg,
          hsl(var(--l-hue) var(--l-sat) 62% / .30) 0%,
          hsl(var(--l-hue) var(--l-sat) 62% / .10) calc(var(--l-reach) * .6),
          transparent var(--l-reach));
      }
      .pd-lrow.on .pd-lglow { opacity: 1; }
      .pd-lrow.on { background: var(--pc-fill-2); }
      .pd-lico { color: var(--ps-dim); position: relative; }
      .pd-lrow.on .pd-lico { color: hsl(var(--l-hue) var(--l-sat) 72%); }
      .pd-ln { font-size: var(--pc-fs-sm); font-weight: 600; position: relative; }
      .pd-ls { font-size: var(--pc-fs-micro); color: var(--ps-dim); position: relative; }
      .pd-lclu { display: flex; gap: 3px; position: relative; }
      .pd-mdot, .pd-orb {
        width: 5px; height: 5px; border-radius: 50%; display: block;
        background: var(--pc-fill-3);
      }
      .pd-orb { width: 8px; height: 8px; }
      .pd-mdot.lit, .pd-orb.lit {
        background: hsl(var(--l-hue) var(--l-sat) 70%);
        box-shadow: 0 0 6px hsl(var(--l-hue) var(--l-sat) 70% / .8);
      }
      .pd-lpct {
        font-size: var(--pc-fs-xs); font-weight: 650; color: var(--ps-muted);
        font-variant-numeric: tabular-nums; min-width: 38px; text-align: right; position: relative;
      }
      .pd-lrow.on .pd-lpct { color: var(--ps-text); }
      .pd-lrow.off-line { opacity: .5; }
      .pd-guard {
        display: flex; align-items: center; gap: 9px; padding: 9px 11px;
        border-radius: var(--pc-r-sm); background: rgba(242,193,78,.12);
        font-size: var(--pc-fs-xs); flex-wrap: wrap;
      }
      .pd-gq b { display: block; color: var(--ps-warn); font-weight: 650; }
      .pd-gq span { color: var(--ps-muted); }
      .pd-grow2 { flex: 1; min-width: 0; color: var(--ps-text); font-weight: 600; }

      /* ---------------------------------------------------- tier 3 · dock --*/

      .pd-z-rooms { flex: 1.5; }
      /* Wraps rather than squeezing.
         Six cells sharing one flex row came out ~72px each on a 1440 desktop,
         which truncated every room to "LIVIN…" / "KITC…" / "BEDR…" — a label
         that has lost the word is not a smaller label, it is a missing one.
         auto-fit + a floor means the strip is one row when it fits and two when
         it does not; the dock is auto-height, so it simply grows. */
      .pd-rstrip {
        display: grid; gap: 7px;
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
      }
      .pd-rc {
        background: var(--pc-fill-1); border-radius: var(--pc-r-sm);
        padding: 6px 10px; min-width: 0; cursor: pointer;
      }
      .pd-rc:hover { background: var(--pc-fill-2); }
      .pd-rc.acc { background: rgba(77,208,225,.11); }
      .pd-rn {
        display: block; font-size: var(--pc-fs-micro); letter-spacing: .1em;
        text-transform: uppercase; color: var(--ps-dim); font-weight: 600;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pd-rc b {
        display: block; font-size: var(--pc-fs-lg); font-weight: 650;
        font-variant-numeric: tabular-nums; letter-spacing: -.025em; margin-top: 2px;
      }
      .pd-rh { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; }

      .pd-z-quick { flex: 1.2; }
      /* Same reason as the room strip: six tiles in a shared flex row clipped
         every name to "Ligh…" / "Occ…" / "Was…". */
      .pd-qstrip {
        display: grid; gap: 7px;
        grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
      }
      .pd-qt {
        background: var(--pc-fill-1); border-radius: var(--pc-r-sm);
        padding: 7px 8px 9px; display: flex; flex-direction: column; gap: 4px;
        align-items: flex-start; min-width: 0; position: relative; overflow: hidden; text-align: left;
      }
      .pd-qt:hover { background: var(--pc-fill-2); }
      .pd-qt ha-icon { --mdc-icon-size: 19px; color: var(--ps-dim); }
      .pd-qn {
        font-size: var(--pc-fs-micro); font-weight: 600; line-height: 1.2;
        max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pd-qv {
        font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums;
        max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pd-qt.on { background: rgba(242,193,78,.14); }
      .pd-qt.on ha-icon, .pd-qt.on .pd-qn { color: var(--ps-warn); }
      .pd-qt.alert { background: rgba(239,106,106,.16); }
      .pd-qt.alert ha-icon, .pd-qt.alert .pd-qn { color: var(--ps-bad); }
      .pd-qbar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--pc-fill-2); }
      .pd-qbar i { display: block; height: 100%; }

      /* systems, on the stage */
      .pd-srvhead { display: flex; align-items: center; gap: 11px; flex: 0 0 auto; }
      .pd-srvn { font-size: var(--pc-fs-lg); font-weight: 650; letter-spacing: -.012em; }
      .pd-srvs {
        font-size: var(--pc-fs-xs); color: var(--ps-muted);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pd-cpu { text-align: right; flex: 0 0 auto; }
      .pd-cpuv {
        display: block; font-size: var(--pd-fs-big); font-weight: 640;
        letter-spacing: -.025em; font-variant-numeric: tabular-nums; line-height: 1;
      }
      .pd-cpuv small { font-size: var(--pc-fs-xs); font-weight: 500; color: var(--ps-muted); }
      .pd-cpuk {
        font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase;
        color: var(--ps-dim); font-weight: 600;
      }
      .pd-spark.wide, .pd-spark.wide svg { width: 78px; height: 26px; }
      .pd-meters { display: flex; flex-direction: column; gap: 5px; }
      .pd-mrow { display: flex; align-items: center; gap: 9px; font-size: var(--pc-fs-xs); cursor: pointer; }
      .pd-ml { color: var(--ps-muted); flex: 0 0 92px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pd-mbar {
        flex: 1; height: 5px; border-radius: var(--pc-r-pill);
        background: var(--pc-fill-2); overflow: hidden; min-width: 0;
      }
      .pd-mbar i { display: block; height: 100%; }
      .pd-mv2 {
        flex: 0 0 52px; text-align: right; font-weight: 650;
        font-variant-numeric: tabular-nums; color: var(--ps-text);
      }
      /* ---------------------------------------------------------- weather --*/
      /* Both rails side by side. Width is what a stage panel buys, so the desk
         shows what the week did AND what it is about to do without a toggle;
         the phone needs the toggle because it has one column to spend. Below
         720px of panel the two stack, because six capsules across half of a
         narrow panel is the truncated-label bug in a new costume. */
      .pd-wxhero { display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
      .pd-wxbig {
        font-size: var(--pc-fs-3xl); font-weight: 620; letter-spacing: -.045em;
        line-height: .94; font-variant-numeric: tabular-nums;
      }
      .pd-wxbig sup { font-size: .42em; font-weight: 600; vertical-align: top;
                      position: relative; top: .25em; }
      .pd-wxbig.off { color: var(--ps-dim); }
      .pd-wxdelta { font-size: var(--pc-fs-xs); color: var(--ps-heat); font-weight: 620;
                    margin-top: 6px; font-variant-numeric: tabular-nums; }
      .pd-wxdelta.cool { color: var(--ps-cool); }
      .pd-wxsrc { font-size: var(--pc-fs-micro); color: var(--ps-dim); letter-spacing: .08em;
                  text-transform: uppercase; font-weight: 620; margin-top: 5px; }
      .pd-wxtiles { margin-left: auto; display: flex; gap: 16px; align-items: flex-start; }
      .pd-wxmi { --mdc-icon-size: 20px; color: var(--ps-muted); }

      .pd-wxrails { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
                    gap: 14px; }
      .pd-wxcol { min-width: 0; }
      .pd-wxrh { display: flex; align-items: baseline; gap: 8px; margin: 0 0 7px; }
      .pd-wxlb { font-size: var(--pc-fs-micro); letter-spacing: .12em; text-transform: uppercase;
                 color: var(--ps-dim); font-weight: 620; }
      .pd-wxrb { margin-left: auto; font-size: var(--pc-fs-micro); color: var(--ps-dim); }
      .pd-wxbox { background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                  border-radius: var(--pc-r-sm); padding: 12px 10px;
                  font-size: var(--pc-fs-xs); color: var(--ps-dim); text-align: center; }
      .pd-wxbox.plot { padding: 10px 9px 8px; text-align: left; }
      .pd-wxrail { display: grid; grid-template-columns: repeat(var(--n, 7), minmax(0, 1fr)); gap: 5px; }
      .pd-wxday { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
      .pd-wxhi, .pd-wxlo { font-size: var(--pc-fs-xs); font-variant-numeric: tabular-nums;
                           font-weight: 620; line-height: 1; color: var(--ps-muted); }
      .pd-wxlo { color: var(--ps-dim); font-weight: 600; }
      .pd-wxdw { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-weight: 620;
                 letter-spacing: .04em; }
      .pd-wxday.now .pd-wxhi { color: var(--ps-heat); }
      .pd-wxday.now .pd-wxdw { color: var(--ps-text); }
      .pd-wxi { --mdc-icon-size: 15px; color: var(--ps-muted); }
      .pd-wxpcp { font-size: var(--pc-fs-micro); color: var(--ps-cool); font-weight: 600;
                  font-variant-numeric: tabular-nums; }
      .pd-wxpcp.none { visibility: hidden; }
      .pd-wxtrack { position: relative; width: 100%; max-width: 22px; height: 104px;
                    border-radius: var(--pc-r-pill); background: var(--ps-track); overflow: hidden; }
      .pd-wxtrack.empty { background: repeating-linear-gradient(135deg,
                            rgba(255,255,255,.05) 0 4px, transparent 4px 8px); }
      .pd-wxcap { position: absolute; left: 0; right: 0; border-radius: var(--pc-r-pill);
                  background: linear-gradient(to top, var(--ps-cool), #8fb9d8 42%,
                              #e8c39a 72%, var(--ps-heat)); }
      .pd-wxcap.stub { height: 4px; opacity: .75; }
      .pd-wxmark { position: absolute; left: -3px; right: -3px; height: 2px; z-index: 2;
                   background: #fff; border-radius: var(--pc-r-hair);
                   box-shadow: 0 0 6px rgba(255,255,255,.7); }
      /* Scrolls, like the phone's. Plain overflow-x and no touch-action — see
         the note on .ps-wxhrs; the rule is the same on a trackpad. */
      .pd-wxhrs { display: flex; gap: 2px; align-items: flex-end;
                  overflow-x: auto; overscroll-behavior-x: contain;
                  scrollbar-width: thin; scrollbar-color: var(--pc-fill-3) transparent;
                  padding-bottom: 3px; }
      .pd-wxhr { flex: 0 0 auto; width: 30px; display: flex; flex-direction: column;
                 align-items: center; gap: 3px; }
      .pd-wxhr.nd { border-left: 1px solid var(--ps-hair); margin-left: 3px; padding-left: 3px; }
      .pd-wxht { font-size: var(--pc-fs-micro); color: var(--ps-muted); font-weight: 620;
                 font-variant-numeric: tabular-nums; line-height: 1; }
      .pd-wxhbar { width: 100%; height: 44px; display: flex; align-items: flex-end; }
      .pd-wxhbar i { width: 100%; border-radius: var(--pc-r-hair) var(--pc-r-hair) 0 0;
                     background: linear-gradient(to top, rgba(77,208,225,.35), var(--ps-heat)); }
      .pd-wxhp { font-size: var(--pc-fs-micro); color: var(--ps-cool); font-weight: 600;
                 font-variant-numeric: tabular-nums; line-height: 1; min-height: 10px; }
      .pd-wxhl { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-weight: 620;
                 line-height: 1; white-space: nowrap; }
      .pd-wxhr.now .pd-wxht { color: var(--ps-heat); }
      .pd-wxhr.now .pd-wxhl { color: var(--ps-text); }
      .pd-wxfacts { display: flex; gap: 18px; flex-wrap: wrap; }
      .pd-wxnote { font-size: var(--pc-fs-xs); color: var(--ps-muted); line-height: 1.5; }

      .pd-sstats { display: flex; gap: 8px; flex-wrap: wrap; }
      .pd-sstat {
        flex: 1; min-width: 62px; background: var(--pc-fill-1);
        border-radius: var(--pc-r-xs); padding: 6px 9px;
      }
      .pd-sv2 {
        display: block; font-size: var(--pc-fs-lg); font-weight: 650;
        font-variant-numeric: tabular-nums; letter-spacing: -.02em;
      }
      .pd-sk {
        font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase;
        color: var(--ps-dim); font-weight: 600;
      }
      .pd-srow {
        display: flex; align-items: center; gap: 9px;
        font-size: var(--pc-fs-xs); color: var(--ps-muted);
      }
      .pd-srow b { margin-left: auto; color: var(--ps-text); font-variant-numeric: tabular-nums; }
      .pd-srow a { margin-left: auto; text-decoration: none; }
      .pd-xtra a.pd-mini-btn { align-self: flex-start; text-decoration: none; }

      /* now playing, in the dock */
      .pd-z-nowplaying { flex: 1.1; justify-content: center; }
      .pd-npbar { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .pd-npbar .pd-th { cursor: pointer; }
      .pd-npbar .pd-grow { cursor: pointer; }
      .pd-npbar .pd-n { font-size: var(--pc-fs-sm); font-weight: 600; }
      .pd-npbar .pd-s { font-size: var(--pc-fs-micro); color: var(--ps-dim); }
      /* Nothing playing keeps the slot so the dock does not reflow, but draws
         no transport — a row of buttons with nothing behind them is worse than
         no row at all. */
      .pd-npbar.idle { opacity: .55; cursor: pointer; }
      .pd-npbar.idle:hover { opacity: .85; }

      .pd-z-systems { flex: .95; }
      .pd-sysrow { display: flex; align-items: center; gap: 9px; font-size: var(--pc-fs-xs); padding: 3px 0; }
      .pd-sysrow.tappable { cursor: pointer; }
      .pd-sysrow ha-icon { --mdc-icon-size: 15px; color: var(--ps-dim); }
      .pd-sn { color: var(--ps-muted); }
      .pd-sv {
        margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 600;
        max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pd-meter {
        width: 52px; height: 3px; border-radius: 2px; background: var(--pc-fill-2);
        overflow: hidden; flex: 0 0 auto;
      }
      .pd-meter i { display: block; height: 100%; }

      .pd-z-links { flex: 0 0 auto; flex-direction: row; align-items: center; gap: 6px; }
      .pd-link {
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        padding: 8px 12px; border-radius: var(--pc-r-sm); position: relative;
        font-size: var(--pc-fs-micro); font-weight: 600; color: var(--ps-muted);
      }
      .pd-link:hover { background: var(--pc-fill-1); color: var(--ps-text); }
      .pd-link ha-icon { --mdc-icon-size: 20px; }
      .pd-badge {
        position: absolute; top: 4px; right: 6px; min-width: 15px; height: 15px;
        border-radius: var(--pc-r-pill); background: var(--ps-bad); color: #0b0d13;
        font-size: var(--pc-fs-micro); font-weight: 700; font-style: normal;
        display: grid; place-items: center; padding: 0 4px;
      }

      /* --------------------------------------------------------- sheets ---*/

      .pd-scrim {
        position: absolute; inset: 0; z-index: 30;
        background: rgba(5, 6, 10, .55);
        backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
      }
      .pd-sheet-panel {
        position: absolute; z-index: 31; top: 5%; bottom: 5%; right: 3%;
        width: min(640px, 62%);
        display: flex; flex-direction: column;
        background: rgba(12, 14, 21, .94);
        border: 1px solid var(--pc-edge); border-radius: var(--pc-r-xl);
        box-shadow: 0 40px 90px -20px rgba(0,0,0,.8);
        backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
        overflow: hidden;
      }
      .pd-sheet-head {
        display: flex; align-items: center; gap: 10px;
        padding: 13px 16px; border-bottom: 1px solid var(--ps-hair); flex: 0 0 auto;
      }
      /* The chrome names itself, which is why the hosted card's own title is
         blanked — left set it printed twice. */
      .pd-sheet-title { font-size: var(--pc-fs-md); font-weight: 650; flex: 1; min-width: 0; }
      .pd-x { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: var(--ps-muted); }
      .pd-x:hover { background: var(--pc-fill-2); color: var(--ps-text); }
      .pd-sheet-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px; }
      .pd-host { min-height: 100%; }
      /* A section hosted in a sheet has no folded or expanded state — there is
         nothing beside it to fold, so it shows everything it has. */
      .pd-sheet-body .pd-xtra { display: flex; }
      .pd-sheet-body .pd-pbody { overflow: visible; }

      @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }

      /* How it folds down. Bands merge rather than reflow, so the reading order
         survives at every width. Below 1100 the strip wraps and the stage
         becomes two rows of two; the phone view exists for the phone case and
         this never tries to become it. */
      @media (max-width: 1400px) {
        .pd-z-clock { flex: 0 0 108px; }
        .pd-z-wx { flex: 0 0 180px; }
      }
      @media (max-width: 1180px) {
        :host { height: auto; min-height: 0; }
        .pd-sheet { height: auto; }
        .pd-t1 { flex-wrap: wrap; }
        .pd-z-id { flex: 1 1 100%; }
        .pd-stage { grid-template-columns: 1fr 1fr !important; }
        .pd-panelwrap:nth-child(n + 3) { border-top: 1px solid var(--ps-hair-soft); }
        .pd-panelwrap:nth-child(odd) { border-left: 0; }
        .pd-t3 { flex-wrap: wrap; }
        .pd-sheet-panel { width: 92%; right: 4%; }
      }
      @media (max-width: 820px) {
        .pd-stage { grid-template-columns: 1fr !important; }
        .pd-panelwrap { border-left: 0 !important; border-top: 1px solid var(--ps-hair-soft); }
      }
    `;
pcDefine("climate-panel-card", ClimatePanelCard);
pcDefine("sleep-panel-card", SleepPanelCard);
pcDefine("purdy-header-card", PurdyHeaderCard);
pcDefine("purdy-attention-card", PurdyAttentionCard);
pcDefine("purdy-people-card", PurdyPeopleCard);
pcDefine("purdy-rooms-card", PurdyRoomsCard);
pcDefine("purdy-quick-card", PurdyQuickCard);
pcDefine("purdy-notifications-card", PurdyNotificationsCard);
pcDefine("purdy-remote-card", PurdyRemoteCard);
pcDefine("purdy-devices-card", PurdyDevicesCard);
pcDefine("purdy-music-card", PurdyMusicCard);
pcDefine("purdy-shell-card", PurdyShellCard);
pcDefine("purdy-desk-card", PurdyDeskCard);

window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: "climate-panel-card",
    name: "Climate Panel Card",
    description: "Cohesive climate panel: weather, temp ring with hold steppers, trend graph, zones, status chips, and room rows. Set compact: true for the home-screen summary.",
    preview: false,
    documentationURL: "https://github.com/mbwp1234/purdy-cards",
  },
  {
    type: "sleep-panel-card",
    name: "Sleep Panel Card",
    description: "Cohesive infant sleep panel: composition ring with 7-day goal, vitals with baseline deltas, hypnogram, and recap rows. Set ribbon: true for the home-screen summary.",
    preview: false,
    documentationURL: "https://github.com/mbwp1234/purdy-cards",
  },
  { type: "purdy-header-card", name: "Purdy Header Card", description: "Greeting, date, weather and occupancy.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-attention-card", name: "Purdy Attention Card", description: "Rule-driven fault list. Renders nothing when the house is clean.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-people-card", name: "Purdy People Card", description: "Presence with battery and step counts, side by side.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-rooms-card", name: "Purdy Rooms Card", description: "Scrolling strip of room temperatures and humidity.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-quick-card", name: "Purdy Quick Card", description: "Grid of state-coloured action tiles.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-notifications-card", name: "Purdy Notifications Card", description: "Notification centre backed by a todo list; keeps dismissed items readable.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-remote-card", name: "Purdy Remote Card", description: "Android TV remote with a device selector, brand app grid and circular d-pad.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-devices-card", name: "Purdy Devices Card", description: "Collapsible device groups with summary lines; faults stay visible while collapsed.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-music-card", name: "Purdy Music Card", description: "Music Assistant now-playing with transport, room switching and playlist presets. Set compact: true for the self-hiding home-screen headline.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-shell-card", name: "Purdy Shell Card", description: "The whole phone view as one element: gradient ground, one glass column of expanding sections, and a fixed dock with a now-playing bar.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" },
  { type: "purdy-desk-card", name: "Purdy Desk Card", description: "The whole desktop view as one element: one glass sheet on one gradient, a status strip, a stage of panels that expand sideways, and a dock. Same section config as the shell.", preview: false, documentationURL: "https://github.com/mbwp1234/purdy-cards" }
);

console.info(
  `%c PURDY-CARDS %c v${PC_VERSION} %c climate v${CPC_VERSION} · sleep v${SPC_VERSION} `,
  "background:#4dd0e1;color:#0f1317;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px;",
  "background:#232d38;color:#e6ecf2;padding:2px 6px;",
  "background:#151b22;color:#8b96a3;border-radius:0 4px 4px 0;padding:2px 6px;"
);
