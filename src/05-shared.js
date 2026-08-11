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

/* ============================================================================
 * Haptics — the companion app's Taptic bridge.
 *
 * The iOS and Android companion apps listen on `window` for an event of type
 * "haptic" whose `detail` is one of seven names, and re-interpret it as
 * physical feedback. Nothing in Home Assistant's own frontend fires it except
 * <ha-switch>, so a card that wants a control to FEEL like a control has to
 * fire it itself.
 *
 * TWO THINGS THAT LOOK WRONG AND ARE NOT:
 *
 *   1. `new Event(...)` with `.detail` assigned AFTERWARDS — not
 *      `new CustomEvent(type, { detail })`, which reads better, is what every
 *      instinct reaches for, and does not work. This is HA's own fireEvent
 *      shape and the app is matched to it. Do not modernise it.
 *   2. The detail is a bare STRING, not `{ hapticType }` or any object.
 *
 * Outside the companion app nothing is listening: a desktop browser, a wall
 * tablet and `dev/shoot` all run this and feel nothing, silently. That is why
 * the smoke test has to carry this feature by itself — a screenshot cannot see
 * a buzz, and a haptic that never fires looks exactly like a phone that does
 * not do haptics. There is no visible gap for anyone to notice.
 *
 * THE RATE FLOOR IS NOT A NICETY. iOS maps the seven types onto the Taptic
 * Engine distinctly; Android maps them onto whatever motor the handset has,
 * which is coarser and slower. A drag that outruns the motor does not drop the
 * extras, it QUEUES them — so the buzzing carries on after the finger has
 * stopped, which reads as the card being stuck rather than as feedback.
 * ========================================================================== */

const PC_HAPTIC_TYPES = ["success", "warning", "failure", "light", "medium", "heavy", "selection"];
const PC_HAPTIC_FLOOR_MS = 40;
let pcHapticOn = true;
let pcHapticLast = 0;

/* Config's opt-out, held at module scope because the firing sites are plain
   handlers rather than render code with `this` to hand — and because a haptic
   fired from a borrowed method must not depend on which card borrowed it. */
function pcHapticEnable(on) {
  pcHapticOn = on !== false;
}

function pcHaptic(type) {
  if (!pcHapticOn) return false;
  if (PC_HAPTIC_TYPES.indexOf(type) < 0) return false;
  /* Node, and any host without a real window: nothing to dispatch to and
     nothing to feel. */
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return false;
  const now = Date.now();
  if (now - pcHapticLast < PC_HAPTIC_FLOOR_MS) return false;
  pcHapticLast = now;
  const ev = new Event("haptic", { bubbles: true, cancelable: false, composed: true });
  ev.detail = type;
  window.dispatchEvent(ev);
  return true;
}

/* Fire once per STEP CROSSED, never once per pointer event.
 *
 * A dial with thirty stops can tick per stop. A brightness drag across 300px
 * of row cannot: at one tick per percent that is a hundred buzzes in a second,
 * which the motor cannot deliver and the thumb cannot read as anything but
 * noise. So a continuous control quantises first and remembers the value it
 * last ticked at — `holder[prop]` — rather than leaning on the rate floor,
 * which is a backstop against a queue and not a way of choosing what to say.
 *
 * The first sample of a gesture sets the baseline and stays silent: until
 * something has been crossed there is no step to announce. Callers reset the
 * holder to null on gesture start.
 */
function pcHapticStep(holder, prop, value, type) {
  const had = holder[prop];
  if (had === value) return false;
  holder[prop] = value;
  if (had == null || value == null) return false;
  return pcHaptic(type || "selection");
}
