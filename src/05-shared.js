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
function pcSparkPoly(points, w, h, pad) {
  if (!points || points.length < 2) return null;
  const p = pad == null ? 4 : pad;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  let vmin = Infinity, vmax = -Infinity;
  points.forEach((q) => { vmin = Math.min(vmin, q.v); vmax = Math.max(vmax, q.v); });
  if (vmax - vmin < 1) { vmax += 0.5; vmin -= 0.5; }
  const span = t1 - t0 || 1;
  return points.map((q) => {
    const x = ((q.t - t0) / span) * w;
    const y = p + (1 - (q.v - vmin) / (vmax - vmin)) * (h - p * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

/* An MA player also proxies whatever else its source device is doing, so a
   player is showing *music* only when the app or the content type says so —
   otherwise a TV episode raises a phantom now-playing row. */
const PC_MUSIC_TYPES = ["music", "playlist", "track", "album", "radio"];
function pcIsMusicState(st) {
  if (!st) return false;
  const a = st.attributes || {};
  if (a.app_id === "music_assistant") return true;
  /* The content type alone is not enough. A Twitch stream on the living room
     television comes back through its MA mirror as media_content_type "music"
     with app_id "twitch" — only the missing media_title kept it from raising a
     phantom now-playing row beside the real one. A foreign app_id is the source
     device saying outright that this is not the music queue. */
  if (a.app_id) return false;
  return PC_MUSIC_TYPES.indexOf(a.media_content_type) >= 0;
}

