/* ============================================================================
 * purdy-sky-card — the litter box sheet (v1.114.0)
 *
 * Off the approved "Litter box — stats sheet" canvas: tap the House card and
 * a sheet opens with the cat's weight (10 days of weigh-ins, or three months
 * of weekly bands), visits per day, when in the day they happen, the drawer's
 * fill-and-empty history with a forecast of when it is full, and three small
 * facts. Cycle now and Reset come along so nothing on the card is orphaned.
 *
 * WHERE EACH SERIES COMES FROM.
 *   weight, 3 mo    recorder statistics, period day, min/mean/max. A day whose
 *                   MIN is under 75% of the cat's median is dropped whole: the
 *                   LR4 logs half-steps (5.09 lb against a 10 lb cat in early
 *                   October) and those dragged two weekly means to 9.7.
 *   weight, 10 d    history/period, every weigh-in, the same floor applied.
 *   visits          history of `pet.visits` (a per-day counter): each rise is
 *                   a visit at that time. It counts the cat, not the drum —
 *                   the cycles counter also moves for a manual cycle, which is
 *                   why Nov 25 reads 3 visits against 4 cycles. Falls back to
 *                   the cycles counter when no visits entity is configured.
 *   drawer          statistics, period hour, mean, 60 days: a sawtooth. The
 *                   forecast is the fill rate over every complete run between
 *                   two emptyings (net rise over time), never the run in
 *                   progress alone — the first two days after an empty read
 *                   7%/day against a long-run 3–4.
 *   cycles          statistics, period day, `state` of the lifetime counter:
 *                   per-week counts from the differences.
 *   faults          the litter box entity entering `error` in the 10 days.
 *
 * A series that has not loaded waits; one that failed says so; a day before
 * the record begins is hatched. None of them is ever drawn as a zero.
 * ========================================================================== */

const SK_LT_W = 326;

function skLtHour(h) {
  const x = ((Math.round(h) % 24) + 24) % 24;
  return x === 0 ? "12a" : x < 12 ? `${x}a` : x === 12 ? "12p" : `${x - 12}p`;
}

function skLtDay0(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

Object.assign(PurdySkyCard.prototype, {

  _skLtCfg() {
    const crew = this._skSec("crew");
    const l = crew && crew.litter;
    return l && l.entity ? l : null;
  },

  /* Three asks, refreshed every 20 minutes while the sheet is open. */
  _skLtLoad() {
    const l = this._skLtCfg();
    const h = this._hass;
    if (!l || !h || !h.callWS || !h.callApi) return;
    const S = this._skLt || (this._skLt = { at: 0, busy: false });
    const now = Date.now();
    if (S.busy || now - S.at < 20 * 60000) return;
    S.busy = true;
    const pet = l.pet || {};
    const stat = (ids, days, period, types) => ids.length ? h.callWS({
      type: "recorder/statistics_during_period",
      start_time: new Date(now - days * 864e5).toISOString(),
      end_time: pcNowIso(),
      statistic_ids: ids,
      period,
      types,
    }) : Promise.resolve({});
    const rows = (r, id, f) => ((r || {})[id] || []).map((p) => ({ t: typeof p.start === "number" ? p.start : Date.parse(p.start), ...f(p) }))
      .filter((p) => Number.isFinite(p.t));
    const histIds = [pet.weight, pet.visits || pet.scoops, l.entity].filter(Boolean);
    const start = new Date(skLtDay0(now) - 9 * 864e5).toISOString();
    const hist = h.callApi("GET", `history/period/${start}?end_time=${encodeURIComponent(pcNowIso())}`
      + `&filter_entity_id=${histIds.join(",")}&minimal_response&no_attributes`);
    const tasks = [
      stat([pet.weight, pet.scoops].filter(Boolean), 98, "day", ["mean", "min", "max", "state"]).then((r) => {
        S.wday = pet.weight ? rows(r, pet.weight, (p) => ({ v: Number(p.mean), lo: Number(p.min), hi: Number(p.max) })).filter((p) => Number.isFinite(p.v)) : null;
        S.cday = pet.scoops ? rows(r, pet.scoops, (p) => ({ v: Number(p.state) })).filter((p) => Number.isFinite(p.v)) : null;
      }),
      stat(l.waste_drawer ? [l.waste_drawer] : [], 60, "hour", ["mean"]).then((r) => {
        S.dr = l.waste_drawer ? rows(r, l.waste_drawer, (p) => ({ v: Number(p.mean) })).filter((p) => Number.isFinite(p.v)) : null;
      }),
      hist.then((res) => {
        const out = {};
        (res || []).forEach((series) => {
          if (!series || !series.length) return;
          const id = series[0].entity_id;
          out[id] = series.map((row) => ({ t: Date.parse(row.last_changed || row.last_updated), s: row.state }));
        });
        S.w10 = pet.weight ? (out[pet.weight] || []).map((p) => ({ t: p.t, v: parseFloat(p.s) })).filter((p) => Number.isFinite(p.v)) : null;
        S.vis = out[pet.visits || pet.scoops] || [];
        S.vac = out[l.entity] || [];
        S.h0 = Date.parse(start);
      }),
    ];
    Promise.all(tasks.map((p) => p.then(() => null, (e) => (e && e.message) || "the recorder did not answer"))).then((errs) => {
      S.err = errs.find(Boolean) || null;
      S.at = Date.now();
      S.busy = false;
      this._last = null;
      this._render();
    });
  },

  /* The cat's median weight, the scale the half-step floor hangs off. */
  _skLtFloor(vals) {
    const v = vals.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    if (!v.length) return 0;
    return v[Math.floor(v.length / 2)] * 0.75;
  },

  /* Weekly buckets ending today: mean of the kept days' means, band = the
     kept days' min and max. */
  _skLtWeeks(days, now) {
    const floor = this._skLtFloor(days.map((d) => d.hi));
    const kept = days.filter((d) => !(d.lo < floor));
    const out = [];
    for (let i = 12; i >= 0; i--) {
      const hi = now - i * 7 * 864e5, lo = hi - 7 * 864e5;
      const in7 = kept.filter((d) => d.t >= lo && d.t < hi);
      if (!in7.length) { out.push(null); continue; }
      out.push({ t: hi, v: in7.reduce((s, d) => s + d.v, 0) / in7.length,
        lo: Math.min(...in7.map((d) => d.lo)), hi: Math.max(...in7.map((d) => d.hi)) });
    }
    return out;
  },

  _skLtWeight(l, S, now) {
    const pet = l.pet || {};
    if (!pet.weight) return "";
    const h = this._hass;
    const w = pcNum(h, pet.weight);
    const rk = this._skLtR === "10" ? "10" : "90";
    const seg = `<div class="sk-seg sm sk-ltseg" role="tablist">${[["10", "10d"], ["90", "3 mo"]].map(([k, t]) =>
      `<button type="button" role="tab" data-skltr="${k}" aria-selected="${k === rk}">${t}</button>`).join("")}</div>`;
    const W = SK_LT_W, H = 104, P = 8;
    let body, chip = "";
    const src = rk === "90" ? S && S.wday : S && S.w10;
    if (S && S.err && src == null) body = `<div class="sk-empty">The history would not load — ${psEsc(S.err)}</div>`;
    else if (src == null) body = `<div class="sk-ltchart wait" role="img" aria-label="Loading"></div>`;
    else {
      let pts, t0, t1 = now, band = false;
      if (rk === "90") {
        const wk = this._skLtWeeks(src, now);
        pts = wk.map((p, i) => p && { ...p, i }).filter(Boolean);
        t0 = now - 13 * 7 * 864e5;
        band = true;
        if (pts.length >= 8) {
          const a = pts.slice(0, 4), b = pts.slice(-4);
          const d = b.reduce((s, p) => s + p.v, 0) / 4 - a.reduce((s, p) => s + p.v, 0) / 4;
          chip = Math.abs(d) < 0.05 ? "Steady · 3 mo" : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} lb · 3 mo`;
        }
      } else {
        const floor = this._skLtFloor(src.map((p) => p.v));
        pts = src.filter((p) => p.v >= floor).map((p) => ({ t: Math.max(p.t, S.h0 || p.t), v: p.v }));
        t0 = S.h0 || now - 10 * 864e5;
        if (pts.length >= 2) {
          const vs = pts.map((p) => p.v);
          chip = `${Math.min(...vs).toFixed(2)}–${Math.max(...vs).toFixed(2)}`;
        }
      }
      if (pts.length < 2) {
        body = `<svg class="sk-ltchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="No history yet"><rect class="hatch" x="0" y="0" width="${W}" height="${H}" rx="10"/></svg>`;
      } else {
        const X = (t) => ((t - t0) / (t1 - t0)) * W;
        const vals = pts.flatMap((p) => band ? [p.lo, p.hi, p.v] : [p.v]).filter(Number.isFinite);
        let lo = Math.min(...vals), hi = Math.max(...vals);
        /* Half a pound is a real change on a ten-pound cat: never auto-scale
           a quiet week into a mountain range, never flatten a real drift. */
        if (hi - lo < 0.5) { const c = (hi + lo) / 2; lo = c - 0.25; hi = c + 0.25; }
        const Y = (v) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
        const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
        const area = band ? `${pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.hi).toFixed(1)}`).join(" ")} ${
          pts.slice().reverse().map((p) => `L${X(p.t).toFixed(1)},${Y(p.lo).toFixed(1)}`).join(" ")} Z` : "";
        const dots = band ? "" : pts.map((p) => `<circle class="pt" cx="${X(p.t).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.6"/>`).join("");
        const last = pts[pts.length - 1];
        const ax = rk === "90"
          ? this._skLtMonths(t0, t1, W, H)
          : `<text class="ax" x="0" y="${H + 18}">${psEsc(new Date(t0).toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase())}</text>`;
        const words = rk === "90"
          ? `${pet.name || "Cat"}'s weight by week for three months, each week's range shaded`
          : `Every weigh-in for ten days, ${chip.replace("–", " to ")} lb`;
        body = `<svg class="sk-ltchart" viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="${psEsc(words)}">
            ${area ? `<path class="band" d="${area}"/>` : ""}<path class="ln" d="${line}"/>${dots}
            <circle class="dot" cx="${X(last.t).toFixed(1)}" cy="${Y(last.v).toFixed(1)}" r="5"/>
            ${ax}<text class="ax" x="${W}" y="${H + 18}" text-anchor="end">NOW</text></svg>`;
      }
    }
    return `<div class="sk-ltc">
        <div class="sk-lth"><span class="sk-ico" style="--c:var(--sk-litter)"><ha-icon icon="mdi:scale-bathroom"></ha-icon></span><span class="sk-hn">${psEsc(pet.name || "Cat")}</span>${seg}</div>
        <div class="sk-lttop"><div class="sk-tv">${w == null ? `<b class="ps-nodata">—</b>` : `<b>${w.toFixed(2)}</b><small>lb</small>`}</div>${chip ? `<span class="ps-chip">${psEsc(chip)}</span>` : ""}</div>
        ${body}
      </div>`;
  },

  /* Month ticks for a long axis, each label right of its line. */
  _skLtMonths(t0, t1, W, H) {
    const out = [];
    const d = new Date(t0);
    d.setHours(0, 0, 0, 0); d.setDate(1); d.setMonth(d.getMonth() + 1);
    for (let i = 0; i < 12 && d.getTime() < t1; i++) {
      const x = ((d.getTime() - t0) / (t1 - t0)) * W;
      if (W - x > 40) out.push(`<line class="tk" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="0" y2="${H}"/><text class="ax" x="${(x + 4).toFixed(1)}" y="${H + 18}">${psEsc(d.toLocaleDateString([], { month: "short" }).toUpperCase())}</text>`);
      d.setMonth(d.getMonth() + 1);
    }
    return out.join("");
  },

  /* Visits, one per rise of the counter, filed by LOCAL day. */
  _skLtVisits(S, now) {
    if (!S || !S.vis) return null;
    const today = skLtDay0(now);
    const days = [];
    for (let i = 9; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push({ t: d.getTime(), times: [] }); }
    const first = S.vis.length ? S.vis[0].t : null;
    let prev = null;
    S.vis.forEach((p) => {
      const v = parseFloat(p.s);
      if (!Number.isFinite(v)) return;
      if (prev != null && v > prev) {
        const k = days.findIndex((d, i) => p.t >= d.t && (i === days.length - 1 || p.t < days[i + 1].t));
        if (k >= 0) for (let n = 0; n < Math.min(v - prev, 6); n++) days[k].times.push(p.t);
      }
      prev = v;
    });
    /* A day the record does not reach is unknown, not a day of no visits. */
    days.forEach((d, i) => { d.known = first != null && first < (i === days.length - 1 ? now : days[i + 1].t); });
    return days;
  },

  _skLtVisitsCard(S, now) {
    const days = this._skLtVisits(S, now);
    if (!days) {
      return `<div class="sk-ltc">${this._skLtHead("mdi:paw", "Visits", "")}${S && S.err
        ? `<div class="sk-empty">The history would not load — ${psEsc(S.err)}</div>` : `<div class="sk-ltbars wait"></div>`}</div>`;
    }
    const full = days.slice(0, -1).filter((d) => d.known);
    const avg = full.length ? full.reduce((s, d) => s + d.times.length, 0) / full.length : null;
    const td = days[days.length - 1];
    const sel = Number.isInteger(this._skLtDay) && this._skLtDay >= 0 && this._skLtDay < days.length ? this._skLtDay : days.length - 1;
    const mx = Math.max(4, ...days.map((d) => d.times.length));
    const bars = days.map((d, i) => {
      const n = d.times.length;
      const lab = new Date(d.t).toLocaleDateString([], { weekday: "narrow" });
      const name = i === days.length - 1 ? "Today" : new Date(d.t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
      return `<button type="button" class="sk-ltbar${i === days.length - 1 ? " td" : ""}${i === sel ? " on" : ""}${d.known ? "" : " none"}" data-skltday="${i}"
          aria-pressed="${i === sel}" aria-label="${psEsc(name)}: ${d.known ? `${n} visit${n === 1 ? "" : "s"}` : "no record"}">
          <i style="height:${d.known ? Math.max(4, (n / mx) * 64).toFixed(0) : 64}px"></i><b>${psEsc(lab)}</b></button>`;
    }).join("");
    const chip = td.known ? `${td.times.length} today` : "";
    return `<div class="sk-ltc">
        ${this._skLtHead("mdi:paw", "Visits", chip)}
        <div class="sk-lttop"><div class="sk-tv">${avg == null ? `<b class="ps-nodata">—</b>` : `<b>${avg.toFixed(1)}</b><small>a day</small>`}</div></div>
        <div class="sk-ltbars">${bars}</div>
      </div>
      ${this._skLtClock(days, sel)}`;
  },

  /* Ten days on a 24-hour line, a dot per visit, the picked day lit. The chip
     is the busiest three-hour stretch, once there are enough visits to say. */
  _skLtClock(days, sel) {
    const all = days.flatMap((d) => d.times.map((t) => { const x = new Date(t); return x.getHours() + x.getMinutes() / 60; }));
    let chip = "";
    if (all.length >= 6) {
      let best = 0, bh = 0;
      for (let h = 0; h < 24; h++) {
        const n = all.filter((x) => ((x - h + 24) % 24) < 3).length;
        if (n > best) best = n, bh = h;
      }
      chip = `Peak ${skLtHour(bh)}–${skLtHour(bh + 3)}`;
    }
    const rows = days.map((d, i) => `<div class="sk-ltrow${i === sel ? " on" : ""}${d.known ? "" : " none"}">${d.times.map((t) => {
      const x = new Date(t);
      return `<i style="left:${(((x.getHours() + x.getMinutes() / 60) / 24) * 100).toFixed(1)}%"></i>`;
    }).join("")}</div>`).join("");
    return `<div class="sk-ltc">
        ${this._skLtHead("mdi:clock-outline", "When", chip)}
        <div class="sk-ltclk" role="img" aria-label="Every visit for ten days on a 24-hour line${chip ? `; busiest ${psEsc(chip.slice(5))}` : ""}">${rows}</div>
        <div class="sk-ltax"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div>
      </div>`;
  },

  _skLtHead(icon, name, chip) {
    return `<div class="sk-lth"><span class="sk-ico" style="--c:var(--sk-litter)"><ha-icon icon="${icon}"></ha-icon></span><span class="sk-hn">${psEsc(name)}</span>${chip ? `<span class="ps-chip">${psEsc(chip)}</span>` : ""}</div>`;
  },

  /* The fill rate over every complete run between two emptyings: net rise
     over time, runs shorter than two days ignored. A drop of 15 points or
     more within an hour is an emptying. */
  _skLtRate(pts) {
    let rise = 0, span = 0, a = 0;
    for (let i = 1; i <= pts.length; i++) {
      const end = i === pts.length || pts[i].v < pts[i - 1].v - 15;
      if (!end) continue;
      const run = pts.slice(a, i);
      if (i < pts.length && run.length > 1) {
        const dt = (run[run.length - 1].t - run[0].t) / 864e5;
        if (dt >= 2) { rise += run[run.length - 1].v - run[0].v; span += dt; }
      }
      a = i;
    }
    return span >= 2 && rise > 0 ? rise / span : null;
  },

  _skLtDrawer(l, S, now) {
    if (!l.waste_drawer) return "";
    const v = pcNum(this._hass, l.waste_drawer);
    const fullAt = Number(l.drawer_full == null ? 100 : l.drawer_full);
    let body, chip = "";
    if (S && S.err && S.dr == null) body = `<div class="sk-empty">The history would not load — ${psEsc(S.err)}</div>`;
    else if (!S || S.dr == null) body = `<div class="sk-ltchart wait" role="img" aria-label="Loading"></div>`;
    else {
      const pts = S.dr.slice();
      if (v != null) pts.push({ t: now, v });
      const rate = this._skLtRate(pts);
      const cur = v != null ? v : pts.length ? pts[pts.length - 1].v : null;
      let eta = null;
      if (cur != null && cur >= fullAt) chip = "Full";
      else if (rate && cur != null) {
        eta = now + ((fullAt - cur) / rate) * 864e5;
        chip = `Full ≈ ${new Date(eta).toLocaleDateString([], { month: "short", day: "numeric" })}`;
      }
      const W = SK_LT_W, H = 104, P = 6;
      const t0 = now - 60 * 864e5;
      const t1 = Math.max(now + 7 * 864e5, Math.min(eta || 0, now + 40 * 864e5));
      const X = (t) => ((t - t0) / (t1 - t0)) * W;
      const ymax = Math.max(fullAt + 10, ...pts.map((p) => p.v));
      const Y = (x) => P + (1 - Math.max(0, x) / ymax) * (H - P);
      if (pts.length < 2) {
        body = `<svg class="sk-ltchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="No history yet"><rect class="hatch" x="0" y="0" width="${W}" height="${H}" rx="10"/></svg>`;
      } else {
        /* Thinned to the LAST reading of each bucket, so an emptying stays a
           cliff rather than being averaged into a slope. */
        const k = Math.max(1, Math.ceil(pts.length / 180));
        const thin = pts.filter((p, i) => i % k === k - 1 || i === pts.length - 1);
        const xy = thin.map((p) => [X(p.t), Y(p.v)]);
        const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        const x0 = xy[0][0], xl = xy[xy.length - 1][0], yl = xy[xy.length - 1][1];
        const area = `${line} L${xl.toFixed(1)},${H} L${x0.toFixed(1)},${H} Z`;
        const gap = x0 > 6 ? `<rect class="hatch" x="0" y="${P}" width="${(x0 - 2).toFixed(1)}" height="${H - P}" rx="6"/>` : "";
        const ex = eta ? Math.min(W, X(eta)) : null;
        const ey = eta && X(eta) > W ? Y(cur + rate * ((t1 - now) / 864e5)) : Y(fullAt);
        const proj = eta ? `<line class="proj" x1="${xl.toFixed(1)}" y1="${yl.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"/>${
          X(eta) <= W ? `<circle class="eta" cx="${ex.toFixed(1)}" cy="${Y(fullAt).toFixed(1)}" r="4"/>` : ""}` : "";
        const words = `Drawer fill for two months${chip ? `, ${chip.replace("≈", "about")}` : ""}`;
        body = `<svg class="sk-ltchart" viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="${psEsc(words)}">
            ${this._skLtMonths(t0, t1, W, H)}${gap}
            <line class="full" x1="0" x2="${W}" y1="${Y(fullAt).toFixed(1)}" y2="${Y(fullAt).toFixed(1)}"/>
            <path class="ar" d="${area}"/><path class="ln" d="${line}"/>${proj}
            <circle class="dot" cx="${xl.toFixed(1)}" cy="${yl.toFixed(1)}" r="5"/></svg>`;
      }
    }
    return `<div class="sk-ltc">
        ${this._skLtHead("mdi:tray-full", "Drawer", chip)}
        <div class="sk-lttop"><div class="sk-tv">${v == null ? `<b class="ps-nodata">—</b>` : `<b>${Math.round(v)}</b><small>%</small>`}</div></div>
        ${body}
      </div>`;
  },

  /* Three facts, each a small picture and one number. */
  _skLtTiles(l, S, now) {
    const h = this._hass;
    const pet = l.pet || {};
    const tiles = [];
    if (l.litter_level) {
      const lv = pcNum(h, l.litter_level);
      tiles.push(`<div class="st3 sk-ltt"><span class="sk-ltank${lv == null ? " none" : ""}"><i style="height:${lv == null ? 0 : skClamp(lv / 100) * 100}%"></i></span>
          <b>${lv == null ? "—" : `${Math.round(lv)}<small>%</small>`}</b><span>Litter</span></div>`);
    }
    if (pet.scoops) {
      const n = pcNum(h, pet.scoops);
      let wk = "";
      if (S && S.cday && S.cday.length > 7) {
        const c = S.cday, per = [];
        for (let i = 12; i >= 0; i--) {
          const hi = now - i * 7 * 864e5, lo = hi - 7 * 864e5;
          const a = c.filter((p) => p.t < lo).pop(), b = c.filter((p) => p.t < hi).pop();
          per.push(a && b && b.v >= a.v ? b.v - a.v : null);
        }
        const mx = Math.max(1, ...per.filter((x) => x != null));
        wk = per.map((x) => `<i class="${x == null ? "none" : ""}" style="height:${x == null ? 30 : Math.max(2, (x / mx) * 30).toFixed(0)}px"></i>`).join("");
      }
      tiles.push(`<div class="st3 sk-ltt"><span class="sk-ltcyc">${wk}</span><b>${n == null ? "—" : Math.round(n).toLocaleString()}</b><span>Cycles</span></div>`);
    }
    if (S && S.vac) {
      const h0 = S.h0 || now - 10 * 864e5;
      const hits = [];
      S.vac.forEach((p, i) => { if (p.s === "error" && (i === 0 ? false : S.vac[i - 1].s !== "error")) hits.push(p.t); });
      /* The line is the ten days; each fault sits at its day. A date in the
         label wrapped to two lines in a third-width tile. */
      const marks = hits.map((t) => `<i style="left:${(((t - h0) / (now - h0)) * 100).toFixed(1)}%"></i>`).join("");
      tiles.push(`<div class="st3 sk-ltt"><span class="sk-ltflt">${marks}</span><b>${hits.length}</b><span>Faults</span></div>`);
    }
    return tiles.length ? `<div class="sk-st3 sk-ltst3" style="--n:${tiles.length}">${tiles.join("")}</div>` : "";
  },

  _skLitterSheet() {
    const l = this._skLtCfg();
    if (!l) return "";
    this._skLtLoad();
    const S = this._skLt;
    const now = Date.now();
    const st = pcState(this._hass, l.entity) || "unavailable";
    const run = st === "cleaning";
    const close = `<button class="ps-x" type="button" id="ps-close" aria-label="Close">
        <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    const btns = `<div class="sk-ltbtns">
        <button class="sk-bigbtn pri" type="button" data-skltcycle="1"${run || st === "unavailable" ? " disabled" : ""}><ha-icon icon="mdi:reload"></ha-icon>${run ? "Cycling…" : "Cycle now"}</button>
        ${l.reset_button ? `<button class="sk-bigbtn ${this._skArmed === "lrs" ? "armed" : ""}" type="button" data-skarm="lrs" data-skpress="${psEsc(l.reset_button)}">
          <ha-icon icon="mdi:restart"></ha-icon>${this._skArmed === "lrs" ? "Tap again" : "Reset"}</button>` : ""}
      </div>`;
    return `<div class="ps-scrim" id="ps-scrim"></div>
      <div class="ps-sheet tall">
        <div class="ps-sheeth"><span class="ps-lbl">${psEsc(l.name || "Litter box")} · ${psEsc(this._humanize(st))}</span>${close}</div>
        <div class="sk-lt">
          ${this._skLtWeight(l, S, now)}
          ${this._skLtVisitsCard(S, now)}
          ${this._skLtDrawer(l, S, now)}
          ${this._skLtTiles(l, S, now)}
          ${btns}
        </div>
      </div>`;
  },

  _skLitterBind() {
    this._each("[data-skltr]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._skLtR = el.dataset.skltr;
      this._render();
    }));
    this._each("[data-skltday]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      this._skLtDay = Number(el.dataset.skltday);
      this._render();
    }));
    this._each("[data-skltcycle]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const l = this._skLtCfg();
      if (!l || el.disabled) return;
      pcHaptic("medium");
      this._hass.callService("vacuum", "start", { entity_id: l.entity });
    }));
  },
});

const SK_LITTER_STYLES = `
      .sk-ltopen { display: block; width: 100%; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
      .sk-ltopen .sk-tankb { display: block; }
      .sk-ltopen .sk-status { margin-left: auto; }
      .sk-ltopen .sk-ltgo { --mdc-icon-size: 20px; color: var(--ps-dim); margin-left: 2px; }
      .sk-lt { display: flex; flex-direction: column; gap: 12px; padding: 4px 2px 10px; }
      .sk-ltc { padding: 14px 14px 12px; border-radius: 22px; background: var(--sk-card2); display: flex; flex-direction: column; gap: 10px; }
      .sk-lth { display: flex; align-items: center; gap: 10px; min-height: 32px; }
      .sk-lth .sk-hn { font-size: var(--pc-fs-md); }
      .sk-lth > .ps-chip, .sk-lth > .sk-ltseg { margin-left: auto; }
      .sk-lttop { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
      .sk-lt .sk-tv b { font-size: var(--pc-fs-3xl); }
      .sk-ltseg { padding: 3px; }
      .sk-ltseg button { padding: 0 12px; }
      .sk-ltchart { display: block; width: 100%; height: auto; overflow: visible; }
      .sk-ltchart.wait { aspect-ratio: 326 / 128; border-radius: 12px; background: var(--ps-track); opacity: .5; }
      .sk-ltchart rect.hatch { fill: none; stroke: var(--ps-track); stroke-width: 2; stroke-dasharray: 3 5; }
      .sk-ltchart .ln { fill: none; stroke: var(--sk-litter); stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }
      .sk-ltchart .band { fill: color-mix(in srgb, var(--sk-litter) 18%, transparent); }
      .sk-ltchart .ar { fill: color-mix(in srgb, var(--sk-litter) 12%, transparent); }
      .sk-ltchart .pt { fill: var(--sk-litter); }
      .sk-ltchart .dot { fill: var(--sk-litter); stroke: var(--sk-card2); stroke-width: 2.5; }
      .sk-ltchart .proj { stroke: var(--sk-litter); stroke-width: 2.2; stroke-dasharray: 2 5; stroke-linecap: round; }
      .sk-ltchart .eta { fill: var(--sk-card2); stroke: var(--ps-warn); stroke-width: 2; }
      .sk-ltchart .full { stroke: var(--ps-warn); stroke-width: 1.2; stroke-dasharray: 3 4; opacity: .6; }
      .sk-ltchart .tk { stroke: var(--ps-track); stroke-width: 1; }
      .sk-ltchart .ax { fill: var(--ps-dim); font-size: var(--pc-fs-xs); font-weight: 600; letter-spacing: .04em; }
      .sk-ltbars { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 6px; align-items: end; height: 86px; }
      .sk-ltbars.wait { border-radius: 12px; background: var(--ps-track); opacity: .5; }
      .sk-ltbar { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 5px; height: 100%; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
      .sk-ltbar i { display: block; width: 100%; border-radius: 7px; background: var(--ps-track); }
      .sk-ltbar.on i { background: color-mix(in srgb, var(--sk-litter) 55%, var(--ps-track)); }
      .sk-ltbar.td i { background: var(--sk-litter); }
      .sk-ltbar.none i { background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 6px); }
      .sk-ltbar b { font-size: var(--pc-fs-xs); font-weight: 650; color: var(--ps-dim); }
      .sk-ltbar.on b { color: var(--ps-text); }
      .sk-ltclk { display: flex; flex-direction: column; gap: 7px; padding: 4px 0 0; }
      .sk-ltrow { position: relative; height: 8px; border-radius: 4px; background: var(--ps-track); }
      .sk-ltrow.on { background: color-mix(in srgb, var(--sk-litter) 22%, var(--ps-track)); }
      .sk-ltrow.none { background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 6px); }
      .sk-ltrow i { position: absolute; top: -2px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%;
                    background: color-mix(in srgb, var(--sk-litter) 45%, var(--sk-card2)); box-shadow: 0 0 0 2px var(--sk-card2); }
      .sk-ltrow.on i { background: var(--sk-litter); }
      .sk-ltax { display: flex; justify-content: space-between; font-size: var(--pc-fs-xs); font-weight: 600; color: var(--ps-dim); letter-spacing: .04em; }
      .sk-ltst3 { margin-top: 0; }
      .sk-ltt { gap: 6px; padding: 12px; background: var(--sk-card2); }
      .sk-ltank { position: relative; width: 18px; height: 30px; border-radius: 6px; background: var(--ps-track); overflow: hidden; }
      .sk-ltank i { position: absolute; left: 0; right: 0; bottom: 0; background: color-mix(in srgb, var(--sk-litter) 55%, var(--sk-card2)); }
      .sk-ltank.none { background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 6px); }
      .sk-ltcyc { display: flex; gap: 2px; align-items: flex-end; height: 30px; }
      .sk-ltcyc i { flex: 1; max-width: 5px; border-radius: 2px; background: color-mix(in srgb, var(--sk-litter) 55%, var(--sk-card2)); }
      .sk-ltcyc i.none { background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 4px); }
      .sk-ltflt { position: relative; display: block; height: 30px; }
      .sk-ltflt::before { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 3px; margin-top: -1.5px; border-radius: 2px; background: var(--ps-track); }
      .sk-ltflt i { position: absolute; top: 50%; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--ps-warn); }
      .sk-ltbtns { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 10px; }
      .sk-ltbtns .sk-bigbtn[disabled] { opacity: .5; }
`;
