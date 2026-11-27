/* ============================================================================
 * purdy-sky-card — the lake (v1.110.0)
 *
 * Off the approved "Lake level — Skylight mockups" canvas: B's half tile (a
 * depth post) carrying A's number (how far below full pond), and C's sheet.
 *
 * THE NUMBER IS THE GAP TO FULL POND, not the elevation. "791.8 ft" is a
 * survey figure; "−3.2 ft" is what anyone at the lake says, and it is the
 * thing a dock owner does arithmetic with. The elevation is on the sheet.
 *
 * THE SOURCE is a scrape config entry against AEP's own feed
 * (aepcom-api.aep.com/api/hydro/plant-levels — the JSON behind smithmtn.com),
 * not the card: the feed sends no CORS headers, so a browser cannot read it,
 * and the history has to live in the recorder anyway. The sensors carry
 * `state_class: measurement`, so long-term statistics accrue from the day
 * they were made and the year view grows into itself.
 *
 * HISTORY comes from `recorder/statistics_during_period` — hourly means for
 * the week and month, daily for the year — never `history/period`: one call,
 * never purged. The live state is appended as the last point, because hourly
 * statistics lag the sensor by up to an hour.
 *
 * MISSING IS NOT FLAT. The window before the first statistic is hatched, a
 * sensor that will not read draws a hatched post and "—", and a trend that
 * cannot be computed draws no arrow rather than a level one.
 *
 * AN ESTIMATE IS NEVER DRAWN AS A MEASUREMENT. `estimated_before` (ISO) names
 * where back-filled history ends — a year read off another site's chart
 * images, imported as statistics. Before it the line is dashed, and a change
 * or rate measured against a point before it carries an ≈.
 *
 * `lake: {entity, name, short, full, normal, floats, range: [lo, hi], estimated_before, since,
 *         also: [{entity, name, full}]}`
 * ========================================================================== */

const SK_LAKE_RANGES = { w: 7, m: 30, y: 365, y5: 1826, all: 365 * 40 };
/* The long views are fetched only when asked for: a day per point over a
   year and five years, a week per point back to the first reading. They
   carry min and max as well, drawn as a band, because a weekly mean of a
   lake that swings a foot a day would otherwise read as a calm one. */
const SK_LAKE_LONG = { y: "day", y5: "day", all: "week" };
const SK_LAKE_TABS = [["w", "W"], ["m", "M"], ["y", "Y"], ["y5", "5Y"], ["all", "All"]];

function skLakeFt(v, dp) {
  const s = Math.abs(v).toFixed(dp == null ? 1 : dp);
  return (v < 0 && Number(s) !== 0 ? "−" : v > 0 && Number(s) !== 0 ? "+" : "") + s;
}

Object.assign(PurdySkyCard.prototype, {

  _skLakeCfg() {
    const c = this._config.lake;
    return c && typeof c === "object" && c.entity ? c : null;
  },

  /* Hourly means for a month and daily means for a year, refreshed every 20
     minutes while anything that draws them is on screen. A failure is kept as
     a fact, not as an empty series — an empty chart says the lake was flat. */
  _skLakeLoad() {
    const c = this._skLakeCfg();
    const h = this._hass;
    if (!c || !h || !h.callWS) return;
    const S = this._skLk || (this._skLk = { at: 0, busy: false, hr: null, day: null, err: null });
    const now = Date.now();
    if (S.busy || now - S.at < 20 * 60000) return;
    S.busy = true;
    const ask = (days, period) => h.callWS({
      type: "recorder/statistics_during_period",
      start_time: new Date(now - days * 864e5).toISOString(),
      end_time: pcNowIso(),
      statistic_ids: [c.entity],
      period,
      types: ["mean"],
    }).then((r) => ((r || {})[c.entity] || [])
      .map((p) => ({ t: typeof p.start === "number" ? p.start : Date.parse(p.start), v: Number(p.mean) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v)));
    ask(SK_LAKE_RANGES.m, "hour").then((hr) => {
      Object.assign(S, { hr, err: null });
    }, (e) => {
      S.err = (e && e.message) || "the recorder did not answer";
    }).then(() => {
      S.at = Date.now();
      S.busy = false;
      this._last = null;
      this._render();
    });
  },

  /* A long view, fetched once and kept for six hours. `since` (ISO) is where
     the record begins, so All does not ask for forty years of nothing. */
  _skLakeLoadLong(rk) {
    const c = this._skLakeCfg();
    const h = this._hass;
    if (!c || !h || !h.callWS || !SK_LAKE_LONG[rk]) return;
    const S = this._skLk || (this._skLk = { at: 0, busy: false, hr: null, day: null, err: null });
    const L = (S.long = S.long || {})[rk] || (S.long[rk] = { at: 0, busy: false, pts: null, err: null });
    const now = Date.now();
    if (L.busy || now - L.at < 6 * 36e5) return;
    L.busy = true;
    const since = Date.parse(c.since || "");
    const from = rk === "all" && Number.isFinite(since) ? since : now - SK_LAKE_RANGES[rk] * 864e5;
    h.callWS({
      type: "recorder/statistics_during_period",
      start_time: new Date(from).toISOString(),
      end_time: pcNowIso(),
      statistic_ids: [c.entity],
      period: SK_LAKE_LONG[rk],
      types: ["mean", "min", "max"],
    }).then((r) => {
      L.pts = ((r || {})[c.entity] || [])
        .map((p) => ({ t: typeof p.start === "number" ? p.start : Date.parse(p.start), v: Number(p.mean), lo: Number(p.min), hi: Number(p.max) }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
      L.err = null;
    }, (e) => {
      L.err = (e && e.message) || "the recorder did not answer";
    }).then(() => {
      L.at = Date.now();
      L.busy = false;
      this._last = null;
      this._render();
    });
  },

  /* The series for a range, with the live reading as its last point. */
  _skLakeSeries(rk) {
    const S = this._skLk;
    const c = this._skLakeCfg();
    const live = c ? pcNum(this._hass, c.entity) : null;
    const now = Date.now();
    let t0 = now - SK_LAKE_RANGES[rk] * 864e5;
    const L = SK_LAKE_LONG[rk] && S && S.long ? S.long[rk] : null;
    const src = SK_LAKE_LONG[rk] ? (L ? L.pts : null) : S ? S.hr : null;
    if (src == null) return null;
    const pts = src.filter((p) => p.t >= t0);
    /* All starts where the record does, not forty years back. */
    if (rk === "all" && pts.length) t0 = pts[0].t;
    if (live != null) pts.push({ t: now, v: live });
    return { pts, t0, t1: now };
  },

  /* Rise or fall since a point at least `minH` hours back, nearest to
     `wantH` hours back. Null when the record is too short to say. */
  _skLakeDelta(wantH, minH) {
    const c = this._skLakeCfg();
    const S = this._skLk;
    const live = c ? pcNum(this._hass, c.entity) : null;
    if (live == null || !S || !S.hr || !S.hr.length) return null;
    const now = Date.now();
    const old = S.hr.filter((p) => now - p.t >= minH * 36e5);
    if (!old.length) return null;
    const want = now - wantH * 36e5;
    const ref = old.reduce((a, p) => (Math.abs(p.t - want) < Math.abs(a.t - want) ? p : a), old[0]);
    const hrs = (now - ref.t) / 36e5;
    const est = this._skLakeEst();
    return { d: live - ref.v, hrs, rate: (live - ref.v) / hrs, est: est != null && ref.t < est };
  },

  _skLakeEst() {
    const c = this._skLakeCfg();
    const t = c && c.estimated_before ? Date.parse(c.estimated_before) : NaN;
    return Number.isFinite(t) ? t : null;
  },

  _skLakeSpan(hrs) {
    return hrs >= 36 ? `${Math.round(hrs / 24)}d` : `${Math.round(hrs)}h`;
  },

  /* The Home tile: the depth post, and the gap to full pond. */
  _skLakeTile() {
    const c = this._skLakeCfg();
    if (!c) return "";
    this._skLakeLoad();
    const h = this._hass;
    const v = pcNum(h, c.entity);
    const full = Number(c.full == null ? 795 : c.full);
    const gap = v == null ? null : v - full;
    const tr = this._skLakeDelta(6, 3);
    const dir = tr == null ? null : Math.abs(tr.rate) < 0.003 ? "flat" : tr.rate > 0 ? "up" : "down";
    const floats = c.floats == null ? null : Number(c.floats);
    const high = v != null && floats != null && v >= floats;
    /* The tile names it in one short word: beside the post there is room
       for "Lake · rising" and not for "Smith Mountain", which wrapped
       mid-word. The sheet carries the full name. */
    const name = c.short || "Lake";
    const word = dir === "up" ? "rising" : dir === "down" ? "falling" : dir === "flat" ? "steady" : "";
    const arrow = dir == null ? "" : `<ha-icon class="sk-lkdir ${dir}" icon="${dir === "up" ? "mdi:arrow-up" : dir === "down" ? "mdi:arrow-down" : "mdi:arrow-right"}"></ha-icon>`;
    const lbl = `${name}${v == null ? ", no reading" : `, ${skLakeFt(gap)} feet from full${word ? ", " + word : ""}`}`;
    return `<button class="sk-tile sk-lktile${high ? " high" : ""}" type="button" data-sheet="lake" aria-label="${psEsc(lbl)}">
        <span class="sk-lkcol">
          <span class="sk-trow"><span class="sk-ico" style="--c:var(--ps-cool)"><ha-icon icon="mdi:waves"></ha-icon></span>${arrow}</span>
          <span class="sk-tv">${v == null ? `<b class="ps-nodata">—</b>` : `<b>${skLakeFt(gap)}</b><small>ft</small>`}</span>
          <span class="sk-tlab">${psEsc(name)}${word ? ` · ${word}` : ""}</span>
        </span>${this._skLakePost(v, c)}</button>`;
  },

  /* A gauge board: the lake's whole working range, the water to its level,
     a tick at full pond and, warm, the level where lifts let go. */
  _skLakePost(v, c) {
    const full = Number(c.full == null ? 795 : c.full);
    const rg = Array.isArray(c.range) && c.range.length === 2 ? c.range.map(Number) : [full - 9, full + 3];
    const H = 112, top = 4, y = (x) => top + H - skClamp((x - rg[0]) / (rg[1] - rg[0])) * H;
    const floats = c.floats == null ? null : Number(c.floats);
    const fill = v == null ? "" : `<rect class="w" x="9" y="${y(v).toFixed(1)}" width="14" height="${(top + H - y(v)).toFixed(1)}"/>`;
    return `<svg class="sk-lkpost${v == null ? " none" : ""}" viewBox="0 0 32 120" width="32" height="120" aria-hidden="true">
        <defs><clipPath id="sk-lktube"><rect x="9" y="${top}" width="14" height="${H}" rx="7"/></clipPath></defs>
        <rect class="tr" x="9" y="${top}" width="14" height="${H}" rx="7"/>
        <g clip-path="url(#sk-lktube)">${fill}</g>
        <line class="full" x1="4" x2="28" y1="${y(full).toFixed(1)}" y2="${y(full).toFixed(1)}"/>
        ${floats != null && floats < rg[1] ? `<line class="fl" x1="3" x2="9" y1="${y(floats).toFixed(1)}" y2="${y(floats).toFixed(1)}"/>` : ""}</svg>`;
  },

  /* The sheet: the elevation, the change, the chart, and the rate. */
  _skLakeSheet() {
    const c = this._skLakeCfg();
    if (!c) return "";
    this._skLakeLoad();
    const h = this._hass;
    const v = pcNum(h, c.entity);
    const rk = SK_LAKE_RANGES[this._skLkR] ? this._skLkR : "w";
    const d2 = this._skLakeDelta(48, 6);
    const tr = this._skLakeDelta(6, 3);
    const close = `<button class="ps-x" type="button" id="ps-close" aria-label="Close">
        <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    const chip = d2 && Math.abs(d2.d) >= 0.05
      ? `<span class="ps-chip cool sk-lkchip"><ha-icon icon="${d2.d > 0 ? "mdi:arrow-up" : "mdi:arrow-down"}"></ha-icon>${d2.est ? "≈" : ""}${Math.abs(d2.d).toFixed(1)} ft · ${this._skLakeSpan(d2.hrs)}</span>` : "";
    const seg = `<div class="sk-seg sm sk-lkseg" role="tablist">${SK_LAKE_TABS.map(([k, l]) =>
      `<button type="button" role="tab" data-sklkr="${k}" aria-selected="${k === rk}">${l}</button>`).join("")}</div>`;
    const tiles = [];
    tiles.push(`<div class="st3"><b>${tr == null ? "—" : `${tr.est ? "≈" : ""}${skLakeFt(tr.rate, 2)}<small>ft/h</small>`}</b><span>Rate</span></div>`);
    (Array.isArray(c.also) ? c.also : []).forEach((a) => {
      if (!a || !a.entity) return;
      const av = pcNum(h, a.entity);
      const af = Number(a.full);
      tiles.push(`<div class="st3"><b>${av == null ? "—" : Number.isFinite(af) ? `${skLakeFt(av - af)}<small>ft</small>` : `${av.toFixed(1)}<small>ft</small>`}</b><span>${psEsc(a.name || a.entity)}</span></div>`);
    });
    return `<div class="ps-scrim" id="ps-scrim"></div>
      <div class="ps-sheet">
        <div class="ps-sheeth"><span class="ps-lbl">${psEsc(c.name || "Lake")}</span>${close}</div>
        <div class="sk-lake">
          <div class="sk-lktop" data-readout="lake"><div class="sk-tv">${v == null ? `<b class="ps-nodata">—</b>` : `<b>${v.toFixed(2)}</b><small>ft</small>`}</div>${chip}</div>
          ${seg}
          ${this._skLakeChart(rk, c)}
          <div class="sk-st3 sk-lkst3" style="--n:${Math.min(3, tiles.length)}">${tiles.join("")}</div>
        </div>
      </div>`;
  },

  /* THE CHART READS BACK. It fits the sheet, and the shell's own scrub
     (`data-scrub="lake"`) reads it: hover with a mouse; on touch, hold and
     slide. The readout is the sheet's big number — the value under the
     finger replaces today's, with its date in the chip — because a tooltip
     at the touch point is under the thumb by definition. The scrub reads the
     FULL series stashed here, not the thinned line, so All answers for a
     week rather than for a two-month bucket. (v1.112.0 tried a sideways
     scrolling strip instead; it was not what was asked for.) */
  _skLakeChart(rk, c) {
    const S = this._skLk;
    if (SK_LAKE_LONG[rk]) this._skLakeLoadLong(rk);
    const L = SK_LAKE_LONG[rk] && S && S.long ? S.long[rk] : null;
    const err = L ? L.err : S && S.err;
    if (err) return `<div class="sk-empty">The history would not load — ${psEsc(err)}</div>`;
    const ser = this._skLakeSeries(rk);
    if (!ser) return `<div class="sk-lkchart wait" role="img" aria-label="Loading"></div>`;
    const SW = 326, H = 150, P = 22, VH = H + 26;
    const W = SW;
    const full = Number(c.full == null ? 795 : c.full);
    const normal = c.normal == null ? null : Number(c.normal);
    const floats = c.floats == null ? null : Number(c.floats);
    /* The live point is kept whole: downsampling would average it into the
       last bucket and the dot would sit off the reading on the sheet. */
    const thin = (a, n) => {
      if (a.length <= n) return a;
      const out = [], k = a.length / n;
      for (let i = 0; i < n; i++) {
        const sl = a.slice(Math.floor(i * k), Math.floor((i + 1) * k));
        if (!sl.length) continue;
        const los = sl.map((p) => p.lo).filter(Number.isFinite), his = sl.map((p) => p.hi).filter(Number.isFinite);
        out.push({ t: sl[Math.floor(sl.length / 2)].t, v: sl.reduce((x, p) => x + p.v, 0) / sl.length,
          lo: los.length ? Math.min(...los) : NaN, hi: his.length ? Math.max(...his) : NaN });
      }
      return out;
    };
    const cap = Math.round(W / 2.5);
    const pts = ser.pts.length > cap ? thin(ser.pts.slice(0, -1), cap - 1).concat(ser.pts.slice(-1)) : ser.pts;
    const band = !!SK_LAKE_LONG[rk];
    const vals = pts.map((p) => p.v).concat(band ? pts.filter((p) => Number.isFinite(p.lo)).flatMap((p) => [p.lo, p.hi]) : []);
    const mn = vals.length ? Math.min(...vals) : full - 4;
    const mx = vals.length ? Math.max(...vals) : full;
    let lo = Math.floor((mn - 0.5) * 2) / 2;
    let hi = Math.max(full + 0.5, mx + 0.3);
    if (floats != null && mx >= full) hi = Math.max(hi, floats + 0.3);
    const X = (t) => ((t - ser.t0) / (ser.t1 - ser.t0)) * W;
    this._lakeData = { rk, t0: ser.t0, t1: ser.t1, pts: ser.pts, est: this._skLakeEst(), band: !!SK_LAKE_LONG[rk] };
    const Y = (x) => P + (1 - (x - lo) / (hi - lo)) * (H - P);
    const pct = (y) => (((y + 4) / VH) * 100).toFixed(2);
    const refl = [];
    const ref = (x, cls, label) => {
      if (x == null || x < lo || x > hi) return "";
      refl.push(`<span class="${cls}" style="top:${pct(Y(x) - 5)}%">${label}</span>`);
      return `<line class="${cls}" x1="0" x2="${W}" y1="${Y(x).toFixed(1)}" y2="${Y(x).toFixed(1)}"/>`;
    };
    const refs = ref(full, "full", `FULL ${full}`) + (normal != null && Y(normal) - Y(full) >= 16 ? ref(normal, "norm", `NORMAL ${normal}`) : "")
      + (floats != null && floats <= hi ? ref(floats, "flt", `LIFTS FLOAT ${floats}`) : "");
    /* Ticks: a year on the long views, a month on Y, a week on M; the week
       view keeps its two ends. Each label sits right of its tick. */
    const ticks = [];
    if (rk === "w") {
      ticks.push(`<text class="ax" x="0" y="${H + 18}">${psEsc(new Date(ser.t0).toLocaleDateString([], { weekday: "short" }).toUpperCase())}</text>`);
    } else {
      const d = new Date(ser.t0);
      d.setHours(0, 0, 0, 0);
      if (rk === "m") d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); else if (rk === "y") { d.setDate(1); d.setMonth(d.getMonth() + 1); } else { d.setMonth(0, 1); d.setFullYear(d.getFullYear() + 1); }
      let lastX = -99;
      for (let i = 0; i < 400 && d.getTime() < ser.t1; i++) {
        const x = X(d.getTime());
        const lbl = rk === "m" ? d.toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase()
          : rk === "y" ? d.toLocaleDateString([], { month: "short" }).toUpperCase() + (d.getMonth() === 0 ? ` ${d.getFullYear()}` : "")
          : String(d.getFullYear());
        if (W - x > 44 && x - lastX >= 46) lastX = x, ticks.push(`<line class="tk" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${P}" y2="${H}"/><text class="ax" x="${(x + 4).toFixed(1)}" y="${H + 18}">${psEsc(lbl)}</text>`);
        if (rk === "m") d.setDate(d.getDate() + 7); else if (rk === "y") d.setMonth(d.getMonth() + 1); else d.setFullYear(d.getFullYear() + 1);
      }
    }
    ticks.push(`<text class="ax" x="${W}" y="${H + 18}" text-anchor="end">NOW</text>`);
    const defs = `<defs><pattern id="sk-lkh" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0 V6"/></pattern></defs>`;
    const wrap = (svg, label, scrub) => `<div class="sk-lkwrap"${scrub ? ` data-scrub="lake"` : ""}>${scrub ? `<div class="ps-cross" hidden></div>` : ""}
          <svg class="sk-lkchart" viewBox="0 -4 ${W} ${VH}" role="img" aria-label="${psEsc(label)}">${defs}${svg}</svg>
          <div class="sk-lkrefs" aria-hidden="true">${refl.join("")}</div></div>`;
    if (pts.length < 2) {
      const one = pts[0] ? `<circle class="dot" cx="${X(pts[0].t).toFixed(1)}" cy="${Y(pts[0].v).toFixed(1)}" r="5"/>` : "";
      return wrap(`<rect class="hatch" x="0" y="${P}" width="${W}" height="${H - P}" rx="8"/>${refs}${one}${ticks.join("")}`, "No history yet", false);
    }
    const xy = pts.map((p) => [X(p.t), Y(p.v)]);
    const path = (a) => a.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const line = path(xy);
    /* Split at the end of the estimate: dashed before, solid after, the two
       sharing the boundary point so the line does not break. */
    const est = this._skLakeEst();
    const k = est == null ? 0 : pts.findIndex((p) => p.t >= est);
    const cut = k < 0 ? xy.length : k;
    const lines = cut === 0 ? `<path class="ln" d="${line}"/>`
      : `<path class="ln est" d="${path(xy.slice(0, Math.min(xy.length, cut + 1)))}"/>${cut < xy.length ? `<path class="ln" d="${path(xy.slice(Math.max(0, cut - 1)))}"/>` : ""}`;
    const x0 = xy[0][0];
    const gap = x0 > 6 ? `<rect class="hatch" x="0" y="${P}" width="${(x0 - 2).toFixed(1)}" height="${H - P}" rx="6"/>` : "";
    /* Short views fill under the line; long ones draw the span each point
       covered, low to high, so a day's or a week's swing is not averaged away. */
    const bp = band ? pts.filter((p) => Number.isFinite(p.lo) && Number.isFinite(p.hi)) : [];
    const area = bp.length > 1
      ? `${bp.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.hi).toFixed(1)}`).join(" ")} ${bp.slice().reverse().map((p) => `L${X(p.t).toFixed(1)},${Y(p.lo).toFixed(1)}`).join(" ")} Z`
      : `${line} L${xy[xy.length - 1][0].toFixed(1)},${H} L${x0.toFixed(1)},${H} Z`;
    const last = xy[xy.length - 1];
    const since = String(new Date(ser.t0).getFullYear());
    const words = `${c.name || "Lake"} level, ${{ w: "past week", m: "past month", y: "past year", y5: "past five years", all: "since " + since }[rk]}, ${mn.toFixed(1)} to ${mx.toFixed(1)} feet; full pond ${full}${cut > 0 ? "; earlier part estimated" : ""}; hold and slide to read a value`;
    return wrap(`${gap}${ticks.slice(0, -1).join("")}${refs}
        <path class="ar${bp.length > 1 ? " band" : ""}" d="${area}"/>${lines}
        <line class="base" x1="0" x2="${W}" y1="${H}" y2="${H}"/>
        <circle class="dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="5"/>${ticks[ticks.length - 1]}`, words, true);
  },

  /* The scrub's answer for a fraction across the plot: the nearest real
     point, its value (≈ when it is from the estimated stretch) and when. */
  _skLakeReadout(f) {
    const d = this._lakeData;
    if (!d || !d.pts || !d.pts.length) return null;
    const t = d.t0 + f * (d.t1 - d.t0);
    let best = d.pts[0];
    for (const p of d.pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    const est = d.est != null && best.t < d.est;
    const when = new Date(best.t);
    const lbl = d.rk === "w" || d.rk === "m"
      ? `${when.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${when.toLocaleTimeString([], { hour: "numeric" })}`
      : when.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    const span = d.band && Number.isFinite(best.lo) && Number.isFinite(best.hi) && best.hi - best.lo >= 0.05
      ? `<small class="sk-lkspan">${best.lo.toFixed(1)}–${best.hi.toFixed(1)}</small>` : "";
    return `<div class="sk-tv"><b>${est ? "≈" : ""}${best.v.toFixed(2)}</b><small>ft</small>${span}</div><span class="ps-chip sk-lkchip">${psEsc(lbl)}</span>`;
  },

  _skLakeBind() {
    this._each("[data-sklkr]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._skLkR = el.dataset.sklkr;
      this._render();
    }));
  },
});
