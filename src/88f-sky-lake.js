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
 * `lake: {entity, name, short, full, normal, floats, range: [lo, hi],
 *         also: [{entity, name, full}]}`
 * ========================================================================== */

const SK_LAKE_RANGES = { w: 7, m: 30, y: 365 };

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
    Promise.all([ask(SK_LAKE_RANGES.m, "hour"), ask(SK_LAKE_RANGES.y, "day")]).then(([hr, day]) => {
      Object.assign(S, { hr, day, err: null });
    }, (e) => {
      S.err = (e && e.message) || "the recorder did not answer";
    }).then(() => {
      S.at = Date.now();
      S.busy = false;
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
    const t0 = now - SK_LAKE_RANGES[rk] * 864e5;
    const src = S ? (rk === "y" ? S.day : S.hr) : null;
    if (src == null) return null;
    const pts = src.filter((p) => p.t >= t0);
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
    return { d: live - ref.v, hrs, rate: (live - ref.v) / hrs };
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
          <span class="sk-tl">${psEsc(name)}${word ? ` · ${word}` : ""}</span>
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
      ? `<span class="ps-chip cool sk-lkchip"><ha-icon icon="${d2.d > 0 ? "mdi:arrow-up" : "mdi:arrow-down"}"></ha-icon>${Math.abs(d2.d).toFixed(1)} ft · ${this._skLakeSpan(d2.hrs)}</span>` : "";
    const seg = `<div class="sk-seg sm sk-lkseg" role="tablist">${["w", "m", "y"].map((k) =>
      `<button type="button" role="tab" data-sklkr="${k}" aria-selected="${k === rk}">${k.toUpperCase()}</button>`).join("")}</div>`;
    const tiles = [];
    tiles.push(`<div class="st3"><b>${tr == null ? "—" : `${skLakeFt(tr.rate, 2)}<small>ft/h</small>`}</b><span>Rate</span></div>`);
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
          <div class="sk-lktop"><div class="sk-tv">${v == null ? `<b class="ps-nodata">—</b>` : `<b>${v.toFixed(2)}</b><small>ft</small>`}</div>${chip}</div>
          ${seg}
          ${this._skLakeChart(rk, c)}
          <div class="sk-st3 sk-lkst3" style="--n:${Math.min(3, tiles.length)}">${tiles.join("")}</div>
        </div>
      </div>`;
  },

  _skLakeChart(rk, c) {
    const S = this._skLk;
    if (S && S.err) return `<div class="sk-empty">The history would not load — ${psEsc(S.err)}</div>`;
    const ser = this._skLakeSeries(rk);
    if (!ser) return `<div class="sk-lkchart wait" role="img" aria-label="Loading"></div>`;
    const W = 326, H = 150, P = 22;
    const full = Number(c.full == null ? 795 : c.full);
    const normal = c.normal == null ? null : Number(c.normal);
    const floats = c.floats == null ? null : Number(c.floats);
    /* The live point is kept whole: downsampling would average it into the
       last bucket and the dot would sit off the reading on the sheet. */
    const pts = ser.pts.length > 160 ? pcDownsample(ser.pts.slice(0, -1), 159).concat(ser.pts.slice(-1)) : ser.pts;
    const vals = pts.map((p) => p.v);
    const mn = vals.length ? Math.min(...vals) : full - 4;
    const mx = vals.length ? Math.max(...vals) : full;
    let lo = Math.floor((mn - 0.5) * 2) / 2;
    let hi = Math.max(full + 0.5, mx + 0.3);
    if (floats != null && mx >= full) hi = Math.max(hi, floats + 0.3);
    const X = (t) => ((t - ser.t0) / (ser.t1 - ser.t0)) * W;
    const Y = (x) => P + (1 - (x - lo) / (hi - lo)) * (H - P);
    const ref = (x, cls, label) => x == null || x < lo || x > hi ? "" :
      `<line class="${cls}" x1="0" x2="${W}" y1="${Y(x).toFixed(1)}" y2="${Y(x).toFixed(1)}"/><text class="rl" x="0" y="${(Y(x) - 5).toFixed(1)}">${label}</text>`;
    const refs = ref(full, "full", `FULL ${full}`) + (normal != null && Y(normal) - Y(full) >= 16 ? ref(normal, "norm", `NORMAL ${normal}`) : "")
      + (floats != null && floats <= hi ? ref(floats, "flt", `LIFTS FLOAT ${floats}`) : "");
    const fmt = (t) => new Date(t).toLocaleDateString([], rk === "y" ? { month: "short" } : rk === "m" ? { month: "short", day: "numeric" } : { weekday: "short" }).toUpperCase();
    const defs = `<defs><pattern id="sk-lkh" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0 V6"/></pattern></defs>`;
    const axis = `<text class="ax" x="0" y="${H + 18}">${psEsc(fmt(ser.t0))}</text><text class="ax" x="${W}" y="${H + 18}" text-anchor="end">NOW</text>`;
    if (pts.length < 2) {
      const one = pts[0] ? `<circle class="dot" cx="${X(pts[0].t).toFixed(1)}" cy="${Y(pts[0].v).toFixed(1)}" r="5"/>` : "";
      return `<svg class="sk-lkchart" viewBox="0 -4 ${W} ${H + 26}" role="img" aria-label="No history yet">${defs}
          <rect class="hatch" x="0" y="${P}" width="${W}" height="${H - P}" rx="8"/>${refs}${one}${axis}</svg>`;
    }
    const xy = pts.map((p) => [X(p.t), Y(p.v)]);
    const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const x0 = xy[0][0];
    const gap = x0 > 6 ? `<rect class="hatch" x="0" y="${P}" width="${(x0 - 2).toFixed(1)}" height="${H - P}" rx="6"/>` : "";
    const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${H} L${x0.toFixed(1)},${H} Z`;
    const last = xy[xy.length - 1];
    const words = `${c.name || "Lake"} level, ${{ w: "past week", m: "past month", y: "past year" }[rk]}, ${mn.toFixed(1)} to ${mx.toFixed(1)} feet; full pond ${full}`;
    return `<svg class="sk-lkchart" viewBox="0 -4 ${W} ${H + 26}" role="img" aria-label="${psEsc(words)}">${defs}
        ${gap}${refs}
        <path class="ar" d="${area}"/><path class="ln" d="${line}"/>
        <line class="base" x1="0" x2="${W}" y1="${H}" y2="${H}"/>
        <circle class="dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="5"/>${axis}</svg>`;
  },

  _skLakeBind() {
    this._each("[data-sklkr]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._skLkR = el.dataset.sklkr;
      this._render();
    }));
  },
});
