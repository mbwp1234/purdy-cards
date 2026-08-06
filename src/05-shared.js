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

/* An MA player also proxies whatever else its source device is doing, so a
   player is showing *music* only when the app or the content type says so —
   otherwise a TV episode raises a phantom now-playing row. */
const PC_MUSIC_TYPES = ["music", "playlist", "track", "album", "radio"];
function pcIsMusicState(st) {
  if (!st) return false;
  const a = st.attributes || {};
  if (a.app_id === "music_assistant") return true;
  return PC_MUSIC_TYPES.indexOf(a.media_content_type) >= 0;
}

