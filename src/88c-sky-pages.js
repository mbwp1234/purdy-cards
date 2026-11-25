/* ============================================================================
 * purdy-sky-card — the Skylight components
 *
 * The mockup's own designs, built from the shell's data rather than borrowing
 * the shell's section markup: the night rail and its event list, the week and
 * nap rasters, the zoomed climate dial and the room chart, the week capsules,
 * the Listen player and its volume ladder, the vacuum card, and the server
 * pages. What the mockup never drew but the house relies on — the nap and
 * bedtime predictions, corrections, the thermostat schedule and plans, music
 * search and presets, the vacuum's map and tonight's mode, the server's power
 * actions — is carried INTO these designs, reusing the shell's handlers, so a
 * tap here does exactly what the same tap did on the phone.
 *
 * Every SVG is drawn in a fixed viewBox and scaled by width, so nothing here
 * has to measure the DOM to render.
 * ========================================================================== */

let skUid = 0;
const skAvg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const skClk = (ts) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const skClkHtml = (ts) => {
  const s = skClk(ts);
  const m = /^(.*?)\s?([AP]M)$/i.exec(s);
  return m ? `${psEsc(m[1])}<small>${psEsc(m[2])}</small>` : psEsc(s);
};
const skHMHtml = (mins) => {
  if (mins == null) return `<span class="ps-nodata">—</span>`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}<small>h</small> ${m}<small>m</small>` : `${m}<small>m</small>`;
};
const skDayName = (ts, night) => {
  const d = new Date(ts);
  if (night && d.getHours() < 12) d.setDate(d.getDate() - 1);
  return d.toLocaleDateString([], { weekday: "short" });
};
/* Minutes after noon, so a 6:30 PM and a 7:10 PM bedtime average sensibly
   and a 1 AM wake sits after midnight rather than before noon. */
const skMinOfNight = (ts) => { const d = new Date(ts); const m = d.getHours() * 60 + d.getMinutes(); return m < 720 ? m + 1440 : m; };
const skMinText = (m) => {
  if (m == null) return "—";
  const d = new Date(2000, 0, 1, 0, 0); d.setMinutes(Math.round(m) % 1440);
  return skClk(d.getTime());
};
const SK_ROOM_COLS = ["var(--ps-deep)", "var(--sk-r2)", "var(--sk-r3)", "var(--ps-heat)", "var(--sk-lamp)", "var(--sk-media)"];

Object.assign(PurdySkyCard.prototype, {

  /* ============================================================ NURSERY === */

  _skNurse() {
    const sec = this._skSec("nursery");
    if (!sec) return null;
    let m = null;
    try { m = this._nurseryModel(sec); } catch (e) { m = null; }
    if (!m) return null;
    const nights = m.sessions.filter((s) => s.night);
    const past = nights.filter((s) => !s.active);
    return { sec, m, nights, past };
  },

  /* The night as a picture: settling, asleep, each time someone went in.
     6 PM to 8 AM of the evening it began. */
  _skRail(s, big, opts) {
    const o = opts || {};
    /* The week's rails draw in a ~150px column, so a 340-wide viewBox scaled
       them to under half size: a 3.6px bar with 1.3px wake marks. The small
       rail's viewBox is its drawn width, so its strokes are the size written. */
    /* From 700px a rail is drawn two to three times wider than the phone's,
       and a viewBox that wide keeps its marks and its hour labels at the size
       they were designed at instead of blowing them up. The phone keeps 340/160. */
    const wideW = this._skHas && this._skHas("tab");
    const W = o.w || (big ? (wideW ? 440 : 340) : (wideW ? 300 : 160)), id = "skjg" + (++skUid);
    const th = big ? 14 : 10, y = big ? 24 : 9, H = big ? 58 : 21;
    const t0d = new Date(s.from);
    if (t0d.getHours() < 12) t0d.setDate(t0d.getDate() - 1);
    t0d.setHours(18, 0, 0, 0);
    let T0 = t0d.getTime();
    if (s.from < T0) T0 = s.from - 30 * 60000;
    const T1 = T0 + 14 * 3600000;
    const x = (t) => skClamp((t - T0) / (T1 - T0)) * W;
    const end = s.active ? Math.min(this._nowMs(), T1) : (s.wokeAt || s.to);
    let out = `<svg class="sk-rail${big ? " big" : ""}" viewBox="0 0 ${W} ${H}" role="img"
        aria-label="${psEsc(skDayName(s.from, true))} night: settled ${psEsc(skClk(s.settledAt))}, ${s.interventions} wake-ups">
      <defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="var(--sk-j2)"/><stop offset="1" stop-color="var(--ps-deep)"/></linearGradient></defs>
      <rect x="0" y="${y}" width="${W}" height="${th}" rx="${th / 2}" class="trk"/>`;
    const xs = x(s.from), xa = x(s.settledAt), xe = x(end);
    if (xa > xs) out += `<rect x="${xs.toFixed(1)}" y="${y}" width="${Math.max(th, xa - xs + th / 2).toFixed(1)}" height="${th}" rx="${th / 2}" class="set"/>`;
    out += `<rect x="${xa.toFixed(1)}" y="${y}" width="${Math.max(th, xe - xa).toFixed(1)}" height="${th}" rx="${th / 2}" fill="url(#${id})"${s.active ? ` class="live"` : ""}/>`;
    (s.events || []).forEach((t) => {
      const xv = x(t);
      out += big
        ? `<rect x="${(xv - 1.5).toFixed(1)}" y="${y}" width="3" height="${th}" class="vis"/>`
        : `<rect x="${(xv - 1.75).toFixed(1)}" y="${y - 1}" width="3.5" height="${th + 2}" rx="1.75" class="vis vcut"/>`;
      out += big
        ? `<line x1="${xv.toFixed(1)}" x2="${xv.toFixed(1)}" y1="${y - 9}" y2="${y}" class="visl"/><circle cx="${xv.toFixed(1)}" cy="${y - 12}" r="3.6" class="visd"/>`
        : "";
    });
    if (big) {
      [[0, "6p"], [3, "9p"], [6, "12a"], [9, "3a"], [12, "6a"]].forEach(([hh, l]) => {
        const xv = x(T0 + hh * 3600000);
        out += `<text x="${Math.min(W - 10, Math.max(2, xv)).toFixed(1)}" y="${H - 2}" text-anchor="${hh === 0 ? "start" : "middle"}" class="ax">${l}</text>`;
      });
    }
    if (o.avg != null) {
      const xv = x(o.avg);
      out += `<line x1="${xv.toFixed(1)}" x2="${xv.toFixed(1)}" y1="${y - 3}" y2="${y + th + 3}" class="avg"/>`;
    }
    out += `</svg>`;
    return { svg: out, T0, T1 };
  },

  /* Delta against his own previous nights — a comparison, so it earns a chip. */
  _skNightDelta(n, past) {
    const others = past.filter((s) => s.from !== n.from).slice(-7).map((s) => s.asleepMinutes);
    const a = skAvg(others);
    if (a == null || n.active) return "";
    const d = Math.round(n.asleepMinutes - a);
    return `<span class="ps-chip ${d >= 0 ? "good" : "warn"}">${d >= 0 ? "+" : "−"}${psHM(Math.abs(d))} vs avg</span>`;
  },

  _skJoelHome() {
    const N = this._skNurse();
    if (!N) return "";
    const { sec, m, past } = N;
    const n = m.nightSession;
    const status = m.chipTxt ? `<span class="sk-status ${m.chipCls || ""}">${psEsc(m.chipTxt)}</span>` : "";
    const head = `<div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-deep)"><ha-icon icon="mdi:weather-night"></ha-icon></span>
        <span class="sk-hn">${psEsc(sec.name || sec.title || "Joel")}</span>${status}${n ? this._skNightDelta(n, past) : ""}</div>`;
    if (!n) {
      return `${head}<div class="sk-empty">${m.loaded ? "No night recorded yet" : "Loading the nights…"}</div>`;
    }
    const rail = this._skRail(n, true);
    /* Each tile carries a fact the big number does not. With no wake-up the
       longest stretch IS the night, so it gives way to when he went down; a
       night still running has no "Up" yet, so that tile is not drawn rather
       than drawn empty. */
    const longest = n.interventions > 0 && !n.blindMin && n.longestStretch != null && n.longestStretch !== n.asleepMinutes;
    const tiles = [
      n.active || !longest ? `<div class="st3"><b>${skClkHtml(n.from)}</b><span>Put down</span></div>` : "",
      `<div class="st3"><b>${skClkHtml(n.settledAt)}</b><span>Settled</span></div>`,
      longest ? `<div class="st3"><b>${psHM(n.longestStretch)}</b><span>Longest sleep</span></div>` : "",
      n.active ? "" : `<div class="st3"><b>${skClkHtml(n.wokeAt || n.to)}</b><span>Up</span></div>`,
    ].filter(Boolean);
    /* The status line is the live session's put-down and settle — the tiles
       above say both when that session is this night. It stays for a live
       nap, which this card does not otherwise show. */
    const line = (m.statusL || m.statusR) && !(m.live && m.live.from === n.from);
    return `${head}
      <div class="sk-big"><span class="sk-num">${skHMHtml(n.asleepMinutes)}</span>
        <span class="sk-wk"><ha-icon icon="mdi:door-open"></ha-icon>${n.blindMin ? `${n.interventions}+` : n.interventions}</span>
        <span class="sk-cap2">${n.active ? "tonight" : "last night"}</span></div>
      <div class="sk-railbox">${rail.svg}</div>
      ${this._skHas("desk") ? this._skJoelWeekStrip(n, past) : ""}
      <div class="sk-st3" style="--n:${tiles.length}">${tiles.join("")}</div>
      ${line ? `<div class="sk-line"><span>${psEsc(m.statusL || "")}</span><span>${psEsc(m.statusR || "")}</span></div>` : ""}`;
  },

  /* From 1100px the Joel card is as tall as the Climate card beside it, and
     the room under its rail holds the six nights before, small — so the
     shape of the week sits under the night it is compared with. */
  _skJoelWeekStrip(n, past) {
    const prev = past.filter((s) => s.from !== n.from).slice(-6);
    if (!prev.length) return "";
    return `<div class="sk-jwk" aria-label="The nights before">${prev.map((s) => `<span class="sk-jr"><b>${psEsc(skDayName(s.from, true).slice(0, 2))}</b>${
      this._skRail(s, false, { w: 560 }).svg}</span>`).join("")}</div>`;
  },

  /* Columns for the two- and three-pane layouts. Each is its own flex stack,
     so a tall card in one never stretches a row in another. The phone never
     calls this: its markup is exactly what it was. */
  _skCols(cols, cls) {
    const live = cols.map((c) => c.filter(Boolean).join("")).filter(Boolean);
    return `<div class="sk-cols n${live.length} ${cls || ""}">${live.map((c, i) => `<div class="sk-col c${i}">${c}</div>`).join("")}</div>`;
  },

  _skJoel() {
    const N = this._skNurse();
    const name = this._skTabName("joel");
    if (!N) return this._skTitle(name) + `<div class="sk-card sk-pad"><div class="sk-empty">No nursery section is configured.</div></div>`;
    const { sec, m, nights, past } = N;
    const pick = nights.find((s) => s.from === this._skNight) || m.nightSession || nights[nights.length - 1];
    const status = m.chipTxt ? `<span class="sk-status big ${m.chipCls || ""}">${psEsc(m.chipTxt)}</span>` : "";
    const parts = [this._skTitle(name, status)];
    const P = {};

    /* TODAY first: the predictions are the question asked of this tab at
       eleven in the morning. The shell's day rail is the drawing that answers
       it, with the nap window and the bedtime guess on it. */
    const norms = psNurseryNorms(m.sessions, { days: sec.days || 7 });
    const dayRail = m.loaded && (m.sessions.length || m.stats.bedMean != null)
      ? this._nurseryDayRail(m.sessions, m.todayKey, m.stats.bedMean, norms) : "";
    const playing = m.playing;
    const lineDup = !!(pick && m.live && m.live.from === pick.from);
    P.today = (`<div class="sk-card sk-pad" id="sk-c-jtoday">
        <div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-j2)"><ha-icon icon="mdi:white-balance-sunny"></ha-icon></span><span class="sk-hn">Today</span>
          ${m.todayNaps.length ? `<span class="ps-chip lt">${m.todayNaps.length} nap${m.todayNaps.length > 1 ? "s" : ""} · ${psHM(m.napMins)}</span>` : ""}</div>
        ${dayRail ? `<div class="sk-dayrail">${dayRail}</div>` : ""}
        ${(m.statusL || m.statusR) && !lineDup ? `<div class="sk-line"><span>${psEsc(m.statusL || "")}</span><span>${psEsc(m.statusR || "")}</span></div>` : ""}
        <div class="sk-btnrow">
          ${sec.hatch ? `<button class="sk-bigbtn ${playing ? "" : "pri"} ${this._armed === "hatch" ? "armed" : ""}" type="button"
              data-arm="${playing ? "hatch" : ""}" data-hatch="${playing ? "" : "start"}">
              <ha-icon icon="${playing ? "mdi:stop" : "mdi:play"}"></ha-icon>${this._armed === "hatch" ? "Stop the Hatch?" : playing ? "Stop Hatch" : "Start Hatch"}</button>` : ""}
          ${this._manualStore(sec) ? `<button class="sk-bigbtn" type="button" data-jlog="1"><ha-icon icon="mdi:clock-plus-outline"></ha-icon>Log by hand</button>` : ""}
        </div>
      </div>`);
    parts.push(P.today);

    if (pick) {
      const rail = this._skRail(pick, true);
      const isLast = m.nightSession && pick.from === m.nightSession.from;
      const label = pick.active ? "Tonight" : isLast ? "Last night" : `${skDayName(pick.from, true)} night`;
      const canFix = pick.manual ? !!this._manualStore(sec) : !!this._napEditStore(sec);
      P.night = (`<div class="sk-nightwrap" id="sk-nightwrap">
        <div class="sk-card sk-pad sk-nighthero" id="sk-c-night">
          <div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-deep)"><ha-icon icon="mdi:weather-night"></ha-icon></span>
            <span class="sk-hn">${psEsc(label)}</span>${pick.edited ? `<span class="ps-chip">corrected</span>` : pick.manual ? `<span class="ps-chip">logged by hand</span>` : ""}${this._skNightDelta(pick, past)}</div>
          <div class="sk-big"><span class="sk-num">${skHMHtml(pick.asleepMinutes)}</span>
            <span class="sk-wk"><ha-icon icon="mdi:door-open"></ha-icon>${pick.blindMin ? `${pick.interventions}+` : pick.interventions}</span></div>
          <div class="sk-railbox" id="sk-bigrail" data-t0="${rail.T0}" data-t1="${rail.T1}">${rail.svg}<span class="sk-cursor" id="sk-cursor"><b></b></span></div>
        </div>
        <div class="sk-evs" id="sk-evs">${this._skEvents(pick)}</div>
        ${canFix ? `<button class="sk-bigbtn wide" type="button" data-napopen="${pick.from}" data-entity="${psEsc(sec.hatch || "")}">
            <ha-icon icon="mdi:pencil-outline"></ha-icon>Fix this night's times</button>` : ""}
      </div>`);
      P.vs = this._skVsUsual(pick, past);
      parts.push(P.night, P.vs);
    } else {
      P.night = `<div class="sk-card sk-pad"><div class="sk-empty">${m.loaded ? "No night recorded yet" : "Loading the nights…"}</div></div>`;
      parts.push(P.night);
    }

    /* The week, one rail a night, with the wake-ups beside each. Tap a night
       to read it above. */
    const week = nights.slice(-7);
    if (week.length) {
      const avgLen = skAvg(past.slice(-7).map((s) => s.asleepMinutes));
      const avgW = skAvg(past.slice(-7).filter((s) => !s.blindMin).map((s) => s.interventions));
      P.week = (`<div class="sk-card sk-pad" id="sk-c-week">
          <div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-deep)"><ha-icon icon="mdi:calendar-week"></ha-icon></span><span class="sk-hn">Nights</span>
            ${avgLen == null ? "" : `<span class="ps-chip">avg ${psHM(Math.round(avgLen))}${avgW == null ? "" : ` · ${avgW.toFixed(1)} wake-ups`}</span>`}</div>
          <div class="sk-wks">${week.map((s) => `<button class="sk-wkrow ${pick && s.from === pick.from ? "sel" : ""}" type="button" data-sknight="${s.from}" aria-pressed="${!!(pick && s.from === pick.from)}">
              <span class="d">${psEsc(skDayName(s.from, true))}</span>${this._skRail(s, false).svg}
              <span class="w ${s.interventions ? "" : "z"}">${s.interventions ? `<ha-icon icon="mdi:door-open"></ha-icon>${s.blindMin ? s.interventions + "+" : s.interventions}` : s.active ? "" : `<ha-icon icon="mdi:check"></ha-icon>`}</span>
              <span class="l">${s.active ? "now" : psHM(s.asleepMinutes)}</span></button>`).join("")}</div>
        </div>`);
      parts.push(P.week);
    }
    P.naps = this._skNaps(sec, m);
    P.hatch = this._skHatchCard(sec, m);
    parts.push(P.naps, P.hatch);
    /* Two panes: the night and its events on the left (the cursor still
       follows the row under the pinned rail), everything else on the right.
       Three: the week's two rasters get a column of their own. */
    if (this._skHas("wide")) return parts[0] + this._skCols([[P.night, P.vs], [P.week, P.naps], [P.today, P.hatch]], "sk-joelcols");
    if (this._skHas("split")) return parts[0] + this._skCols([[P.night, P.vs], [P.today, P.week, P.naps, P.hatch]], "sk-joelcols");
    return parts.join("");
  },

  /* Every event of the night as a row; the cursor on the rail above follows
     whichever row is under it. */
  _skEvents(s) {
    const ev = [{ t: s.from, w: "Down", c: "sk-j2" }];
    if (s.settledAt > s.from) ev.push({ t: s.settledAt, w: "Settled", sub: s.settleMinutes ? `${s.settleMinutes}m to settle` : "", c: "deep" });
    (s.events || []).forEach((t, i) => ev.push({ t, w: "Went in", sub: i === 0 ? "first wake" : "", c: "visit" }));
    if (s.active) ev.push({ t: this._nowMs(), w: "Asleep now", c: "deep" });
    else ev.push({ t: s.wokeAt || s.to, w: "Up", sub: psHM(s.asleepMinutes) + " asleep", c: "deep" });
    return ev.map((e, i) => `<button class="sk-ev ${e.c}" type="button" data-skev="${i}" data-t="${e.t}">
        <span class="dot"></span><span class="tm">${skClkHtml(e.t)}</span><span class="w">${psEsc(e.w)}${e.sub ? `<small>${psEsc(e.sub)}</small>` : ""}</span></button>`).join("");
  },

  _skVsUsual(n, past) {
    const others = past.filter((s) => s.from !== n.from && !s.manual).slice(-7);
    if (others.length < 2) return "";
    const put = skAvg(others.map((s) => skMinOfNight(s.from)));
    const set = skAvg(others.map((s) => s.settleMinutes));
    const fw = skAvg(others.filter((s) => (s.events || []).length).map((s) => skMinOfNight(s.events[0])));
    const row = (k, v, u) => `<div class="sk-vs"><span>${k}</span><b>${v}</b><small>usual ${u}</small></div>`;
    return `<div class="sk-card sk-pad">
        <div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-deep)"><ha-icon icon="mdi:compare-horizontal"></ha-icon></span><span class="sk-hn">Against his usual</span></div>
        ${row("Put down", psEsc(skClk(n.from)), psEsc(skMinText(put)))}
        ${row("Settled in", `${n.settleMinutes}m`, `${Math.round(set)}m`)}
        ${row("First wake", (n.events || []).length ? psEsc(skClk(n.events[0])) : n.active ? "none yet" : "slept through", fw == null ? "—" : psEsc(skMinText(fw)))}
      </div>`;
  },

  /* Naps, 7 AM to 7 PM, one row a day. A past day with nothing on the Hatch
     is hatched — nothing recorded is not the same as no nap. */
  _skNaps(sec, m) {
    const T0h = 7, T1h = 19;
    const now = this._nowMs();
    const rows = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const key = psDayKey(d);
      const naps = m.sessions.filter((s) => !s.night && s.day === key);
      const today = i === 0;
      const away = this._isAwayDay && this._isAwayDay(sec, key);
      const pos = (t) => { const h = (t - d.getTime()) / 3600000; return skClamp((h - T0h) / (T1h - T0h)) * 100; };
      let inner;
      if (!naps.length && !today) {
        inner = `<span class="sk-napbar hatch" role="img" aria-label="${psEsc(d.toLocaleDateString([], { weekday: "long" }))}: ${away ? "away" : "nothing recorded"}">${away ? `<em>away</em>` : ""}</span>`;
      } else {
        const segs = naps.map((s) => {
          const a = pos(s.from), b = pos(s.active ? now : s.to), st = pos(s.settledAt);
          const can = s.manual ? !!this._manualStore(sec) : !!this._napEditStore(sec);
          return `<i class="seg${s.active ? " live" : ""}" style="left:${a.toFixed(1)}%;width:${Math.max(1.5, b - a).toFixed(1)}%;--set:${Math.max(0, st - a).toFixed(1)}%"${
            can ? ` data-napopen="${s.from}" data-entity="${psEsc(sec.hatch || "")}" role="button" tabindex="0"` : ""} title="${psEsc(skClk(s.from))} · ${psHM(s.asleepMinutes)}"></i>`;
        }).join("");
        const nowM = today ? `<i class="now" style="left:${pos(now).toFixed(1)}%"></i><i class="fut" style="left:${pos(now).toFixed(1)}%"></i>` : "";
        inner = `<span class="sk-napbar">${segs}${nowM}</span>`;
      }
      rows.push(`<div class="sk-nap"><span class="${today ? "td" : ""}">${today ? "Today" : psEsc(d.toLocaleDateString([], { weekday: "short" }))}</span>${inner}</div>`);
    }
    return `<div class="sk-card sk-pad" id="sk-c-naps">
        <div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-j2)"><ha-icon icon="mdi:sleep"></ha-icon></span><span class="sk-hn">Naps</span>
          ${this._napEditStore(sec) ? `<span class="sk-hint">tap a nap to correct it</span>` : ""}</div>
        <div class="sk-naps">${rows.join("")}
          <div class="sk-nap ax"><span></span><span class="sk-napax"><span>7a</span><span>10a</span><span>1p</span><span>4p</span><span>7p</span></span></div></div>
      </div>`;
  },

  _skHatchCard(sec, m) {
    const h = this._hass;
    const lt = sec.light && h.states[sec.light];
    const on = lt && lt.state === "on";
    const bri = on && lt.attributes.brightness != null ? Math.round(lt.attributes.brightness / 2.55) : null;
    const k = lt && lt.attributes.color_temp_kelvin;
    const rgb = skKelvin(k || 2200);
    if (!sec.hatch && !sec.light) return "";
    return `<div class="sk-card sk-pad">
        <div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-deep)"><ha-icon icon="mdi:speaker"></ha-icon></span><span class="sk-hn">Hatch</span>
          ${m.wifiOk ? "" : `<span class="ps-chip bad"><span class="ps-dot"></span>Offline</span>`}</div>
        <div class="sk-hatch">
          ${sec.hatch ? `<button class="sk-htile ${m.playing ? "on" : ""} ${this._armed === "hatch" ? "armed" : ""}" type="button"
              data-arm="${m.playing ? "hatch" : ""}" data-hatch="${m.playing ? "" : "start"}">
              <span class="sk-hplay"><ha-icon icon="${m.playing ? "mdi:pause" : "mdi:play"}"></ha-icon></span>
              <span class="n">${this._armed === "hatch" ? "Stop?" : m.playing ? "Playing" : "Sound"}</span></button>` : ""}
          ${sec.light ? this._skNightLightTile(sec, m, on, bri, rgb) : ""}
        </div></div>`;
  },

  /* The night light is guarded while he is asleep — the Lights section's
     `protect:` rule, gated on the same session (the Hatch playing). One tap
     here used to toggle it outright, the only place in the card the guard
     did not reach. Asleep, it is a two-tap arm that says what it will do. */
  _skNightLightTile(sec, m, on, bri, rgb) {
    const guard = !!m.playing;
    const armed = guard && this._skArmed === "nl";
    const act = guard ? `data-skarm="nl" data-sktog="${psEsc(sec.light)}"` : `data-sktoggle="${psEsc(sec.light)}"`;
    return `<button class="sk-htile lt ${on ? "on" : ""} ${armed ? "armed" : ""}" type="button" ${act}
        aria-label="Night light${guard ? ", Joel is asleep" : ""}" style="${on ? `--g:rgb(${rgb});--b:${bri || 30}` : ""}">
        <span class="sk-tglow"></span>
        <span class="sk-hb"><ha-icon icon="mdi:lightbulb-night-outline"></ha-icon>${bri == null ? "" : `<b>${bri}%</b>`}</span>
        <span class="n">${armed ? (on ? "Turn it off?" : "Turn it on?") : "Night light"}</span></button>`;
  },

  /* ============================================================ CLIMATE === */

  _skClim() {
    const sec = this._skSec("climate");
    if (!sec) return null;
    const h = this._hass;
    const id = sec.goal || sec.thermostat;
    const th = h.states[sec.goal] || h.states[sec.thermostat];
    const ct = th ? th.attributes.current_temperature : null;
    /* GTTC publishes the active zone's temperature ROUNDED (72 against the
       zone sensor's 72.3), and the dial printed it as "72.0° 2nd Floor" right
       above a 2nd Floor tile reading 72.3°. The zone sensor is the reading
       the label names, so the dial reads it; GTTC's figure is the fallback. */
    const zc = sec.zones || {};
    const zAct = (zc.options || []).find((z) => z.temp && pcState(h, zc.select) === z.option);
    const zt = zAct ? pcNum(h, zAct.temp) : null;
    const cur = zt != null ? zt : ct == null || ct === "" ? null : Number(ct);   // Number(null) is 0
    const goal = th ? this._optGoal(id, this._climGoalReal(th)) : null;
    const band = this._climateBand(sec);
    const action = th ? String(th.attributes.hvac_action || "idle") : "";
    const mode = th ? th.state : "unavailable";
    const outside = this._config.weather_temp ? pcNum(h, this._config.weather_temp) : null;
    const rooms = (sec.rooms || []).map((r, i) => ({ r, i, ...this._roomRead(r), col: SK_ROOM_COLS[i % SK_ROOM_COLS.length] }));
    return { sec, th, id, cur: Number.isFinite(cur) ? cur : null, goal, band, action, mode, outside, rooms };
  },

  /* The dial, zoomed to the band the house actually lives in, so a tenth of a
     degree moves the dot. The reading is a dot ON the track at the end of the
     fill; the goal is a notch OUTSIDE it, so the two can sit 0.2° apart and
     both still read. The stroke is heat or cool — colour carries the mode. */
  _skGauge(size, stroke, o) {
    const mid = o.goal != null ? o.goal : (o.inside != null ? o.inside : 70);
    const LO = Math.floor(mid - 6), HI = LO + 13;
    const c = size / 2, r = c - stroke / 2 - (o.pad == null ? 14 : o.pad);
    const ang = (v) => -120 + skClamp((v - LO) / (HI - LO)) * 240;
    const P = (a, rr) => { const t = a * Math.PI / 180; return [c + rr * Math.sin(t), c - rr * Math.cos(t)]; };
    const arc = (a0, a1) => { const [x0, y0] = P(a0, r), [x1, y1] = P(a1, r); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
    const cool = /cool/.test(o.mode || "") && !/heat/.test(o.mode || "");
    const col = cool ? "var(--ps-cool)" : "var(--ps-heat)";
    const id = "skg" + (++skUid);
    let s = `<svg viewBox="0 0 ${size} ${size}" class="sk-gauge" role="img" aria-label="Inside ${o.inside == null ? "unknown" : o.inside.toFixed(1)}°, goal ${o.goal == null ? "none" : o.goal}°">
      <defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${col}" stop-opacity=".45"/><stop offset="1" stop-color="${col}"/></linearGradient></defs>
      <path d="${arc(-120, 120)}" fill="none" stroke="var(--ps-track)" stroke-width="${stroke}" stroke-linecap="round"/>`;
    if (o.inside != null && o.mode !== "off") s += `<path d="${arc(-120, Math.max(-119, ang(o.inside)))}" fill="none" stroke="url(#${id})" stroke-width="${stroke}" stroke-linecap="round" opacity="${o.active ? 1 : .85}"/>`;
    if (o.ticks) {
      for (let v = LO; v <= HI; v++) {
        const a = ang(v), major = v % 5 === 0;
        const [x1, y1] = P(a, r - stroke / 2 - 5), [x2, y2] = P(a, r - stroke / 2 - (major ? 13 : 8));
        s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--ps-dim)" stroke-width="${major ? 2 : 1.2}" stroke-linecap="round" opacity="${major ? .7 : .35}"/>`;
      }
      [[LO, -120], [HI, 120]].forEach(([v, a]) => { const [tx, ty] = P(a, r); s += `<text x="${tx.toFixed(1)}" y="${(ty + stroke + 13).toFixed(1)}" text-anchor="middle" class="ax">${v}°</text>`; });
    }
    if (o.goal != null && !o.noGoal) {
      const ga = ang(o.goal), [n1x, n1y] = P(ga, r + stroke / 2 + 3), [n2x, n2y] = P(ga - 4, r + stroke / 2 + 12), [n3x, n3y] = P(ga + 4, r + stroke / 2 + 12);
      s += `<path d="M${n1x.toFixed(1)} ${n1y.toFixed(1)} L${n2x.toFixed(1)} ${n2y.toFixed(1)} L${n3x.toFixed(1)} ${n3y.toFixed(1)} Z" fill="${col}"/>`;
    }
    if (o.inside != null) {
      const [ix, iy] = P(ang(o.inside), r);
      s += `<circle cx="${ix.toFixed(1)}" cy="${iy.toFixed(1)}" r="${(stroke * .62).toFixed(1)}" fill="var(--sk-card)" stroke="var(--ps-text)" stroke-width="${Math.max(2.5, stroke * .3).toFixed(1)}"/>`;
    }
    return s + `</svg>`;
  },

  _skHist(id) {
    const raw = (this._history || {})[id];
    if (!raw || raw.length < 2) return null;
    const pts = raw.map((p) => ({ t: p.t, v: parseFloat(p.s) })).filter((p) => Number.isFinite(p.v));
    return pts.length >= 2 ? pts : null;
  },

  _skSpark(r, W, H) {
    if (r.t == null && !r.via) return `<span class="sk-spk hatch" style="width:${W}px;height:${H}px" role="img" aria-label="No reading"></span>`;
    const pts = this._skHist(r.r.temp);
    if (!pts) return `<span class="sk-spk none" style="width:${W}px;height:${H}px" role="img" aria-label="No history"></span>`;
    const poly = pcSparkPoly(pcDownsample(pts, 28), W, H, 3, null, null);
    return `<svg class="sk-spk" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><polyline fill="none" stroke="${r.col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${poly}"/></svg>`;
  },

  _skRoomVal(r) {
    if (r.t == null) return `<span class="sk-rv off">${r.offSince ? "offline" : "—"}</span>`;
    return `<span class="sk-rv">${r.t.toFixed(1)}°</span>`;
  },

  _skClimateHome() {
    const C = this._skClim();
    if (!C) return "";
    const { sec, cur, goal, band, action, mode, rooms } = C;
    const vals = rooms.filter((x) => x.t != null).map((x) => x.t);
    const spread = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : null;
    const goalTxt = band ? `${band[0]}–${band[1]}°` : goal == null ? "—" : `${goal}°`;
    return `<div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-heat)"><ha-icon icon="mdi:fire"></ha-icon></span><span class="sk-hn">${psEsc(sec.title || "Climate")}</span>
        <span class="sk-status ${action === "heating" ? "heat" : action === "cooling" ? "cool" : ""}">${psEsc(this._humanize(mode))} · ${psEsc(this._humanize(action))}</span></div>
      <div class="sk-climrow">
        <div class="sk-dialsm">${this._skGauge(132, 10, { inside: cur, goal, mode, noGoal: true, pad: 10 })}
          <div class="sk-dialc"><b>${cur == null ? "—" : cur.toFixed(1) + "°"}</b><span>${psEsc(this._climateSource(sec, cur))}</span></div></div>
        <div class="sk-ctiles">
          <div class="st3"><b class="heat">${psEsc(goalTxt)}</b><span>Goal</span></div>
          <div class="st3"><b>${spread == null ? "—" : spread.toFixed(1) + "°"}</b><span>Room spread</span></div>
        </div>
      </div>
      <div class="sk-rooms">${rooms.map((x) => `<div class="sk-crow" style="--c:${x.col}"><span class="sw${x.t == null ? " off" : ""}"></span><span class="nm">${psEsc(x.r.name)}</span>${this._skSpark(x, 72, 22)}${this._skRoomVal(x)}</div>`).join("")}</div>`;
  },

  _skClimate() {
    const C = this._skClim();
    if (!C) return this._skTitle("Climate") + `<div class="sk-card sk-pad"><div class="sk-empty">No climate section is configured.</div></div>`;
    const { sec, cur, goal, band, action, mode, outside, rooms } = C;
    const chips = this._climateChips ? this._climateChips(sec) : "";
    const status = `<span class="sk-status big ${action === "heating" ? "heat" : action === "cooling" ? "cool" : ""}">${psEsc(this._humanize(mode))} · ${psEsc(this._humanize(action))}</span>`;
    const zc = sec.zones || {};
    const zones = (zc.options || []).map((z) => ({ label: z.label || z.option, t: pcNum(this._hass, z.temp), on: pcState(this._hass, zc.select) === z.option }));
    const parts = [this._skTitle(sec.title || "Climate", status)];
    const P = {};
    P.dial = (`<div class="sk-card sk-pad sk-dialcard">
        ${chips ? `<div class="sk-chiprow">${chips}</div>` : ""}
        <div class="sk-dial">${this._skGauge(280, 18, { inside: cur, goal, mode, ticks: true, active: action === "heating" || action === "cooling" })}
          <div class="sk-dialc big"><b>${cur == null ? "—" : cur.toFixed(1)}<sup>°</sup></b><span>${psEsc(this._climateSource(sec, cur))}</span></div></div>
        <div class="sk-goalrow">
          <button class="sk-pm" type="button" data-step="-1" aria-label="Lower goal"><ha-icon icon="mdi:minus"></ha-icon></button>
          <div class="g"><b>${band ? `${band[0]}–${band[1]}°` : goal == null ? "—" : goal + "°"}</b><span>Goal</span></div>
          <button class="sk-pm" type="button" data-step="1" aria-label="Raise goal"><ha-icon icon="mdi:plus"></ha-icon></button>
        </div>
        <div class="sk-ctlrows">${this._seasonHtml(sec)}${this._planHtml(sec)}${this._holdHtml(sec)}</div>
      </div>`);
    parts.push(P.dial);
    const strip = sec.schedule ? this._schedStripHtml(sec) : "";
    if (strip) { P.sched = `<div class="sk-card sk-pad sk-sched">${strip}</div>`; parts.push(P.sched); }
    if (zones.length || outside != null) {
      P.zones = (`<div class="sk-zones">${zones.map((z) => `<div class="st3${z.on ? " on" : ""}"><b>${z.t == null ? "—" : z.t.toFixed(1) + "°"}</b><span>${psEsc(z.label)}</span></div>`).join("")}${
        outside == null ? "" : `<div class="st3"><b>${outside.toFixed(1)}°</b><span>Outside</span></div>`}</div>`);
      parts.push(P.zones);
    }
    P.chart = (`<div class="sk-chartwrap" id="sk-chartwrap">
        <div class="sk-card sk-pad sk-chartcard" id="sk-c-chart">
          <div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-heat)"><ha-icon icon="mdi:chart-bell-curve-cumulative"></ha-icon></span><span class="sk-hn" id="sk-chartt">Rooms</span><span class="ps-chip" id="sk-chartv">24h</span></div>
          ${this._skRoomChart(rooms, goal)}
        </div>
        <div class="sk-roomlist">${rooms.map((x) => `<button class="sk-room" type="button" data-skroom="${x.i}" data-info="${psEsc(x.r.temp)}" style="--c:${x.col}">
            <span class="sw${x.t == null ? " off" : ""}"></span>
            <span class="nm">${psEsc(x.r.name)}<small>${x.via ? `via ${psEsc(x.via)}` : x.hu != null ? `${Math.round(x.hu)}% humidity` : x.t == null ? "not reporting" : "&nbsp;"}</small></span>
            ${this._skSpark(x, 64, 26)}${this._skRoomVal(x)}</button>`).join("")}</div>
      </div>`);
    parts.push(P.chart);
    if (sec.graph) { P.wave = this._skWaveCard(sec); parts.push(P.wave); }
    /* The dial and its controls hold still on the left (pinned while they
       fit the window) while the rooms scroll past on the right. */
    const pin = (x) => `<div class="sk-pin">${x.filter(Boolean).join("")}</div>`;
    if (this._skHas("wide")) return parts[0] + this._skCols([[pin([P.dial, P.zones])], [P.chart], [P.sched, P.wave]], "sk-climcols");
    if (this._skHas("split")) return parts[0] + this._skCols([[pin([P.dial, P.zones])], [P.sched, P.chart, P.wave]], "sk-climcols");
    return parts.join("");
  },

  /* Inside and out over the graph's window. The shell's wave is a bare
     picture — on the phone its legend and range sit in the section around
     it, and here they were never drawn: two unlabelled lines with no scale
     and no clock. The key names each line with its reading now, the range
     says what the height spans, and the axis says when. */
  _skWaveCard(sec) {
    const svg = this._waveSvg(sec);
    const head = `<div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-cool)"><ha-icon icon="mdi:home-thermometer-outline"></ha-icon></span><span class="sk-hn">Inside and out</span>${
      svg && this._waveRange ? `<span class="ps-chip">${Math.round(this._waveRange.lo)}–${Math.round(this._waveRange.hi)}°</span>` : ""}</div>`;
    if (!svg) return `<div class="sk-card sk-pad">${head}<div class="sk-empty">${this._histErr ? "History would not load" : "No history yet"}</div></div>`;
    const g = sec.graph || {};
    const inNow = pcNum(this._hass, g.inside), outNow = pcNum(this._hass, g.outside);
    const key = (col, name, v) => `<span class="sk-key" style="--c:${col}"><i></i>${name}<b>${v == null ? "—" : pcDeg(Math.round(v * 10) / 10) + "°"}</b></span>`;
    const hours = g.hours || 24, now = this._nowMs();
    const ax = [0, 1, 2, 3, 4].map((k) => {
      if (k === 4) return "<span>now</span>";
      const t = now - hours * 3600000 + k * hours / 4 * 3600000;
      return `<span>${psEsc(new Date(t).toLocaleTimeString([], { hour: "numeric" }).replace(/\s?([AP])M/i, (m, x) => x.toLowerCase()))}</span>`;
    }).join("");
    return `<div class="sk-card sk-pad">${head}
        <div class="sk-keys">${key("var(--ps-cool)", "Inside", inNow)}${key("var(--ps-heat)", "Outside", outNow)}</div>
        <div class="sk-wave">${svg}</div><div class="sk-wax">${ax}</div></div>`;
  },

  /* All rooms over 24 hours on one scale. The row under the chart lights its
     line and dims the rest (see _skFrame). */
  _skRoomChart(rooms, goal) {
    const W = 340, H = 150, top = 10, bot = 124;
    const now = this._nowMs(), t0 = now - 24 * 3600000;
    const series = rooms.map((x) => ({ x, pts: (this._skHist(x.r.temp) || []).filter((p) => p.t >= t0) })).filter((s) => s.pts.length > 1);
    if (!series.length) return `<div class="sk-empty">No history yet</div>`;
    const all = series.flatMap((s) => s.pts.map((p) => p.v)).concat(goal == null ? [] : [goal]);
    let lo = Math.floor(Math.min(...all) - .5), hi = Math.ceil(Math.max(...all) + .5);
    if (hi - lo < 4) { const m = (hi + lo) / 2; lo = Math.floor(m - 2); hi = Math.ceil(m + 2); }
    const xx = (t) => skClamp((t - t0) / (now - t0)) * W, yy = (v) => top + (hi - v) / (hi - lo) * (bot - top);
    let s = `<svg class="sk-chart" id="sk-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rooms over 24 hours">`;
    for (let v = Math.ceil(lo); v <= hi; v += (hi - lo > 6 ? 2 : 1)) s += `<line x1="0" x2="${W}" y1="${yy(v).toFixed(1)}" y2="${yy(v).toFixed(1)}" class="gr"/><text x="${W}" y="${(yy(v) - 3).toFixed(1)}" text-anchor="end" class="ax">${v}</text>`;
    if (goal != null) s += `<line x1="0" x2="${W}" y1="${yy(goal).toFixed(1)}" y2="${yy(goal).toFixed(1)}" class="goal"/>`;
    series.forEach(({ x, pts }) => {
      const d = pcDownsample(pts, 60).map((p, i) => `${i ? "L" : "M"}${xx(p.t).toFixed(1)} ${yy(p.v).toFixed(1)}`).join("");
      const e = pts[pts.length - 1];
      s += `<path class="ln r${x.i}" d="${d}" fill="none" stroke="${x.col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
      s += `<circle class="ev r${x.i}" cx="${xx(e.t).toFixed(1)}" cy="${yy(e.v).toFixed(1)}" r="4" fill="${x.col}" stroke="var(--sk-card)" stroke-width="2"/>`;
    });
    for (let k = 0; k <= 4; k++) {
      const t = t0 + k * 6 * 3600000;
      const l = new Date(t).toLocaleTimeString([], { hour: "numeric" }).replace(/\s?([AP])M/i, (a, b) => b.toLowerCase());
      s += `<text x="${Math.min(W - 12, Math.max(4, xx(t))).toFixed(1)}" y="${H - 4}" text-anchor="${k === 0 ? "start" : k === 4 ? "end" : "middle"}" class="ax">${k === 4 ? "now" : l}</text>`;
    }
    return s + `</svg>`;
  },

  /* ============================================================ WEATHER === */

  /* The week as capsules on one shared scale: the shape before any number. */
  _skWeekRail() {
    const sec = this._weatherSection();
    const rows = (this._wxFc || []).slice(0, (sec && sec.days) || 7);
    if (!rows.length) return `<div class="sk-empty">${this._wxFcErr ? "The forecast would not load" : "Reading the forecast…"}</div>`;
    const W = 340, H = 196, top = 22, bot = 148;
    const vals = rows.flatMap((d) => [d.lo, d.hi]).filter((v) => v != null);
    if (!vals.length) return `<div class="sk-empty">The forecast carried no temperatures</div>`;
    const live = sec ? this._wxLive(sec) : null;
    const lo = Math.min(...vals, live == null ? Infinity : live) - 3, hi = Math.max(...vals, live == null ? -Infinity : live) + 3;
    const y = (t) => top + (hi - t) / (hi - lo) * (bot - top), cw = W / rows.length;
    let s = `<svg class="sk-weekrail" viewBox="0 0 ${W} ${H}" role="img" aria-label="Week ahead, lows and highs">`;
    rows.forEach((d, i) => {
      const cx = cw * i + cw / 2, id = "skw" + (++skUid);
      const a = d.lo == null ? d.hi : d.lo, b = d.hi == null ? d.lo : d.hi;
      s += `<rect x="${(cx - 6).toFixed(1)}" y="${top}" width="12" height="${bot - top}" rx="6" class="trk"/>`;
      /* Where the drawn capsule actually ends. A day with one end (NWS drops
         today's high in the evening) draws a 12px stub CENTRED on its value;
         the labels used to hang off the value itself, so the low's number sat
         on top of its own stub. */
      let cTop = b == null ? null : y(b), cBot = a == null ? null : y(a);
      if (a != null && b != null) {
        if (cBot - cTop < 12) { const m = (cTop + cBot) / 2; cTop = m - 6; cBot = m + 6; }
        s += `<defs><linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${skTempCol(a)}"/><stop offset="1" stop-color="${skTempCol(b)}"/></linearGradient></defs>`;
        s += `<rect x="${(cx - 6).toFixed(1)}" y="${cTop.toFixed(1)}" width="12" height="${(cBot - cTop).toFixed(1)}" rx="6" fill="url(#${id})"/>`;
      }
      if (d.hi != null) s += `<text x="${cx.toFixed(1)}" y="${(cTop - 7).toFixed(1)}" text-anchor="middle" class="hi">${Math.round(d.hi)}</text>`;
      if (d.lo != null) s += `<text x="${cx.toFixed(1)}" y="${(cBot + 15).toFixed(1)}" text-anchor="middle" class="lo">${Math.round(d.lo)}</text>`;
      if (d.today && live != null) s += `<circle cx="${cx.toFixed(1)}" cy="${y(live).toFixed(1)}" r="6.5" fill="var(--sk-card)" stroke="var(--ps-text)" stroke-width="3"/>`;
      s += `<text x="${cx.toFixed(1)}" y="${H - 22}" text-anchor="middle" class="dw${d.today ? " td" : ""}">${psEsc(this._wxDow(d.ts, d.today))}</text>`;
      if (d.pop != null && d.pop >= 40) s += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" class="pop">${Math.round(d.pop)}%</text>`;
    });
    return s + `</svg>`;
  },

  /* ============================================================== MEDIA === */

  _skMediaHome(only) {
    const np = this._skSec("nowplaying");
    const h = this._hass;
    const rows = [];
    (np && only !== "music" ? np.tvs || [] : []).forEach((t) => {
      const st = pcState(h, t.media_player || t.remote);
      const on = st && st !== "off" && st !== "unavailable" && st !== "unknown";
      const app = pcState(h, t.app_sensor);
      const appOk = app && app !== "unknown" && app !== "unavailable";
      rows.push(`<button class="sk-mrow" type="button" data-sktab="media" data-face="watch">
          <span class="sk-apptile${on ? " on" : ""}">${this._appIcon(np, appOk ? app : null)}</span>
          <span class="sk-mt"><b>${psEsc(t.name)} TV</b><small>${on ? psEsc(appOk ? app : "On") : appOk ? `Off · ${psEsc(app)} last` : "Off"}</small></span>
          <span class="sk-dotst ${on ? "on" : ""}">${on ? "On" : "Off"}</span></button>`);
    });
    const live = ((this._config.now_playing || {}).players || []).map((p) => ({ p, st: h.states[p.entity] })).filter((x) => this._liveMusic(x.st));
    if (live.length) {
      const first = live.find((x) => x.st.state === "playing") || live[0];
      const a = first.st.attributes;
      const rest = live.filter((x) => x !== first);
      if (rows.length) rows.push(`<div class="sk-sep"></div>`);
      rows.push(`<button class="sk-mrow" type="button" data-sktab="media" data-face="listen">
          <span class="sk-art sm">${a.entity_picture_local ? `<img src="${psEsc(a.entity_picture_local)}" alt=""/>` : `<ha-icon icon="mdi:music-note"></ha-icon>`}${first.st.state === "playing" ? `<span class="sk-eq"><i></i><i></i><i></i></span>` : ""}</span>
          <span class="sk-mt"><b>${psEsc(a.media_title || "Playing")}</b><small>${psEsc(first.p.name || pcName(h, first.p.entity))}${a.media_artist ? ` · ${psEsc(a.media_artist)}` : ""}</small></span>
          <span class="sk-pile">${rest.slice(0, 3).map((x) => x.st.attributes.entity_picture_local ? `<img src="${psEsc(x.st.attributes.entity_picture_local)}" alt=""/>` : `<i></i>`).join("")}</span></button>`);
    }
    if (!rows.length) return "";
    return `<div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-media)"><ha-icon icon="mdi:play-box-outline"></ha-icon></span><span class="sk-hn">${only === "music" ? "Playing elsewhere" : "Media"}</span>
        ${this._skPlayingChip(live)}</div>${rows.join("")}`;
  },

  /* Paused is not playing: two paused rooms read "2 paused", not "2 playing". */
  _skPlayingChip(live) {
    if (!live.length) return "";
    const n = live.filter((x) => x.st.state === "playing").length;
    return n ? `<span class="ps-chip good"><span class="ps-dot"></span>${n} playing</span>` : `<span class="ps-chip">${live.length} paused</span>`;
  },

  _skMedia() {
    const face = this._skFaceNow();
    const live = this._mediaLive ? this._mediaLive() : { tv: false, music: false };
    const dot = (o) => (o ? `<span class="sk-live"></span>` : "");
    const seg = `<div class="sk-seg" role="tablist" aria-label="Watch or listen">
        <button type="button" role="tab" data-skface="watch" aria-selected="${face === "watch"}">${dot(live.tv)}Watch</button>
        <button type="button" role="tab" data-skface="listen" aria-selected="${face === "listen"}">${dot(live.music)}Listen</button></div>`;
    const title = this._skTitle("Media");
    const sheets0 = this._config.sheets || {};
    const spec0 = (sheets0.media && sheets0.media.card) ? sheets0.media : sheets0.tv;
    /* From 1100px there is room for both faces at once, so the switch goes:
       Watch on the left, Listen on the right, each under its own name with
       the same live dot the switch carried. */
    if (this._skHas("desk")) {
      const hd = (t, on) => `<h2 class="sk-facehd">${on ? `<span class="sk-live"></span>` : ""}${t}</h2>`;
      const watch = spec0 && spec0.card
        ? `<div class="sk-card sk-remotecard"><div class="ps-host" id="sk-remote"></div></div>`
        : `<div class="sk-card sk-pad"><div class="sk-empty">No television is configured.</div></div>`;
      return title + this._skCols([[hd("Watch", live.tv), watch], [hd("Listen", live.music), this._skListen()]], "sk-mediacols");
    }
    if (face === "watch") {
      const sheets = this._config.sheets || {};
      const spec = (sheets.media && sheets.media.card) ? sheets.media : sheets.tv;
      const music = this._skMediaHome("music");
      return title + seg + (spec && spec.card
        ? `<div class="sk-card sk-remotecard"><div class="ps-host" id="sk-remote"></div></div>`
        : `<div class="sk-card sk-pad"><div class="sk-empty">No television is configured.</div></div>`)
        + (live.music && music ? `<div class="sk-card sk-pad">${music}</div>` : "");
    }
    return title + seg + this._skListen();
  },

  /* Listen, as the mockup drew it: the cover, the transport, a ladder for
     the volume and a grid of rooms — then everything the old sheet could do
     that the mockup never drew: every room's level, grouping, search,
     presets, saved and recent. */
  _skListen() {
    const sec = (this._config.sections || []).find((x) => x.type === "music");
    if (!sec) return `<div class="sk-card sk-pad"><div class="sk-empty">No music section is configured.</div></div>`;
    const h = this._hass;
    const target = this._activePlayer();
    const tst = target && h.states[target];
    const tm = this._liveMusic(tst);
    const a = (tm && tm.attributes) || {};
    const playing = !!(tm && tst.state === "playing");
    const vol = tst && tst.attributes.volume_level != null ? Math.round(tst.attributes.volume_level * 100) : null;
    const tname = (sec.players || []).find((p) => p.entity === target);
    const np = this._nowPlaying();
    const elsewhere = np && target && np.entity !== target && !tm;
    const groupIds = this._groupOf(target);
    const rungs = 16;
    const ladder = `<div class="sk-ladder" id="sk-ladder" data-entity="${psEsc(target || "")}" role="slider" aria-label="Volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${vol == null ? 0 : vol}" tabindex="0">${
      Array.from({ length: rungs }, (_, i) => `<i class="${vol != null && i < Math.round(vol / 100 * rungs) ? "on" : ""}" style="height:${30 + i * 4.4}%"></i>`).join("")}</div>`;
    const roomsGrid = (sec.players || []).map((p) => {
      const st = h.states[p.entity];
      const lv = st && this._liveMusic(st);
      const stt = lv ? (st.state === "playing" ? "Playing" : "Paused") : st && st.state === "unavailable" ? "Offline" : "Idle";
      return `<button class="sk-rm" type="button" data-pick="${psEsc(p.entity)}" aria-pressed="${p.entity === target}">
          <span class="n">${psEsc(p.name)}</span><span class="s"><i class="${lv ? (st.state === "playing" ? "play" : "pause") : ""}"></i>${stt}</span></button>`;
    }).join("");
    const levels = (sec.players || []).map((p) => {
      const st = h.states[p.entity];
      /* A player that is off publishes no volume at all — that is not 0. */
      const pv = st && st.attributes.volume_level != null ? st.attributes.volume_level : null;
      const active = p.entity === target, joined = groupIds.indexOf(p.entity) >= 0;
      return `<div class="ps-vrow ${active ? "on" : ""} ${joined ? "joined" : ""}">
          <button class="ps-vname" type="button" data-pick="${psEsc(p.entity)}" aria-pressed="${active}">${psEsc(p.name)}</button>
          ${pv == null ? `<span class="sk-novol">no volume reported</span>` : `<input class="ps-vol" type="range" min="0" max="100" step="1" value="${Math.round(pv * 100)}" data-vol="${psEsc(p.entity)}" aria-label="${psEsc(p.name)} volume" />`}
          <span class="ps-vnum">${pv == null ? "—" : Math.round(pv * 100)}</span>
          ${active ? `<span class="ps-jspace"></span>` : `<button class="ps-jb ${joined ? "on" : ""}" type="button" data-join="${psEsc(p.entity)}" aria-pressed="${joined}"
            aria-label="${joined ? "Remove" : "Add"} ${psEsc(p.name)} ${joined ? "from" : "to"} the group"><ha-icon icon="${joined ? "mdi:link-variant-off" : "mdi:plus"}"></ha-icon></button>`}</div>`;
    }).join("");
    return `
      <div class="sk-card sk-player">
        <div class="sk-art big" id="sk-art">${a.entity_picture_local ? `<img src="${psEsc(a.entity_picture_local)}" alt=""/>` : `<ha-icon icon="mdi:music-note"></ha-icon>`}${playing ? `<span class="sk-eq"><i></i><i></i><i></i><i></i><i></i></span>` : ""}</div>
        <div class="sk-trk"><div><b>${psEsc(tm ? a.media_title : "Nothing playing here")}</b>
          <small>${tm ? psEsc([a.media_artist, tname && tname.name].filter(Boolean).join(" · ")) : elsewhere ? `Playing in ${psEsc(np.name)}` : "Pick something below"}</small></div>${this._pinBtn()}</div>
        ${elsewhere ? `<button class="ps-move" type="button" id="ps-move"><ha-icon icon="mdi:arrow-right"></ha-icon>Move ${psEsc(np.name)} playback here</button>` : ""}
        <div class="sk-transport">
          <button type="button" data-mpc="media_previous_track" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Previous"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
          <button class="pp" type="button" data-mp="playpause" data-entity="${psEsc(target || "")}" aria-label="${playing ? "Pause" : "Play"}"><ha-icon icon="${playing ? "mdi:pause" : "mdi:play"}"></ha-icon></button>
          <button type="button" data-mpc="media_next_track" data-all="1" data-entity="${psEsc(target || "")}" aria-label="Next"><ha-icon icon="mdi:skip-next"></ha-icon></button>
        </div>
        <div class="sk-volrow"><button class="sk-mute ${tst && tst.attributes.is_volume_muted ? "on" : ""}" type="button" data-mute="${psEsc(target || "")}" data-muted="${!!(tst && tst.attributes.is_volume_muted)}" aria-label="Mute"><ha-icon icon="${tst && tst.attributes.is_volume_muted ? "mdi:volume-off" : "mdi:volume-high"}"></ha-icon></button>
          ${ladder}<span class="sk-volv" id="sk-volv">${vol == null ? "—" : vol}</span></div>
        ${this._queueHtml()}
        ${this._note ? `<div class="ps-toast">${psEsc(this._note)}</div>` : ""}
      </div>
      <div class="sk-rms">${roomsGrid}</div>
      <div class="sk-card sk-pad">
        <div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-media)"><ha-icon icon="mdi:speaker-multiple"></ha-icon></span><span class="sk-hn">Every room</span>
          ${groupIds.length ? `<span class="ps-chip">${groupIds.length + 1} grouped</span>` : ""}</div>${levels}</div>
      <div class="sk-card sk-pad">
        <div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-media)"><ha-icon icon="mdi:magnify"></ha-icon></span><span class="sk-hn">Find something</span></div>
        <div class="ps-sbox"><ha-icon icon="mdi:magnify"></ha-icon>
          <input id="ps-q" type="search" placeholder="Tracks, albums, playlists…" value="${psEsc(this._query || "")}" aria-label="Search music" />
          ${this._query ? `<button class="ps-sclear" type="button" id="ps-qclear" aria-label="Clear"><ha-icon icon="mdi:close"></ha-icon></button>` : ""}</div>
        <div id="ps-res">${this._resultsHtml()}</div>
        ${(sec.presets || []).length ? `<span class="ps-lbl" style="display:block;margin:14px 0 6px">Presets</span>
          <div class="ps-pres">${(sec.presets || []).map((p, i) => `<button class="ps-pr" type="button" data-preset="${i}"><ha-icon icon="${psEsc(p.icon || "mdi:playlist-music")}"></ha-icon><span class="ps-trunc">${psEsc(p.name)}</span></button>`).join("")}</div>` : ""}
        ${this._pinsHtml()}
        <div style="margin-top:14px">${this._recentHtml()}</div>
      </div>`;
  },

  /* ============================================================== HOUSE === */

  _skHouse() {
    const parts = [this._skTitle("House")];
    const P = {};
    const lsec = this._skSec("lights");
    if (lsec) {
      const lights = this._lightList(lsec);
      if (lights.length) {
        parts.push(P.lights = this._skCard("lights", `<div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-lamp)"><ha-icon icon="mdi:lightbulb-outline"></ha-icon></span><span class="sk-hn">Lights</span>${this._lightChip(lights)}</div>
          <div class="sk-lights">${this._lightsBody(lsec, lights)}</div>`, null, "sk-pad"));
      }
    }
    const crew = this._skSec("crew");
    if (crew && crew.vacuum && crew.vacuum.entity) parts.push(P.vac = this._skCard("crew", this._skVacuum(crew.vacuum), null, "sk-pad"));
    if (crew && crew.litter && crew.litter.entity) parts.push(P.litter = this._skCard("litter", this._skLitter(crew.litter), null, "sk-pad"));
    if (crew && crew.washer && crew.washer.entity) parts.push(P.washer = this._skCard("washer", this._skWasher(crew.washer), null, "sk-pad"));
    const s = this._sysCfg && this._sysCfg();
    if (s) parts.push(P.nas = this._skCard("nas", this._skNasCard(s)));
    const veh = this._skVehicleRow();
    if (veh) parts.push(P.veh = veh);
    if ((this._config.sheets || {}).notifications) {
      const n = this._logOpenCount();
      parts.push(P.notes = `<button class="sk-card sk-rowcard" type="button" data-sheet="notifications">
          <span class="sk-ico" style="--c:var(--ps-warn)"><ha-icon icon="mdi:bell-outline"></ha-icon></span>
          <span class="ps-grow"><b>Notifications</b><small>${n ? `${n} unread` : "Everything read"}</small></span><ha-icon icon="mdi:chevron-right"></ha-icon></button>`);
    }
    const sit = this._skSitter();
    if (sit) parts.push(P.sit = sit);
    /* The vacuum is the tallest thing in the house, so it gets a column of
       its own and the rest stack beside it. */
    if (this._skHas("wide")) return parts[0] + this._skCols([[P.lights, P.litter, P.washer], [P.vac], [P.nas, P.veh, P.notes, P.sit]], "sk-housecols");
    if (this._skHas("split")) return parts[0] + this._skCols([[P.lights, P.litter, P.washer, P.nas], [P.vac, P.veh, P.notes, P.sit]], "sk-housecols");
    return parts.join("");
  },

  /* Sitter mode: one switch and one number. The automation that tracks the
     visit owns every derivation (door opens in pairs, 15 min quiet, the 3h
     backstop) and writes its answers to helpers, so this row only reads
     them — a second "is the sitter here" rule in the card would drift from
     the one that sends the message. `sitter: {mode, visits, last, opens,
     arrived}`; only `mode` is required. Mid-visit the number is the live
     minutes since the door first opened; otherwise the last visit's length,
     and the trip's visit count as the caption. Off with no visits logged,
     it says nothing beyond "Off". */
  _skSitter() {
    const c = this._config.sitter;
    const h = this._hass;
    if (!c || !c.mode || !h.states[c.mode]) return "";
    const on = h.states[c.mode].state === "on";
    const visits = pcNum(h, c.visits), last = pcNum(h, c.last), opens = pcNum(h, c.opens);
    const arr = c.arrived && h.states[c.arrived] ? Number(h.states[c.arrived].attributes.timestamp) : null;
    const here = on && opens != null && opens > 0 && arr;
    const dur = (m) => m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`;
    let num = "", sub;
    if (here) {
      const m = Math.max(0, (Date.now() / 1000 - arr) / 60);
      num = dur(m);
      sub = `Here now · since ${skClk(arr * 1000)}`;
    } else if (visits) {
      num = last ? dur(last) : "";
      sub = `${visits} visit${visits === 1 ? "" : "s"}${last ? " · last" : ""}`;
      if (!on) sub = `Off · ${sub}`;
    } else sub = on ? "Waiting for the door" : "Off";
    return `<button class="sk-card sk-rowcard sk-sitter ${on ? "on" : ""} ${here ? "here" : ""}" type="button" data-sktoggle="${psEsc(c.mode)}"
        role="switch" aria-checked="${on}" aria-label="Sitter mode ${on ? "on" : "off"}">
        <span class="sk-ico" style="--c:var(--sk-litter)"><ha-icon icon="mdi:cat"></ha-icon></span>
        <span class="ps-grow"><b>Sitter mode</b><small>${psEsc(sub)}</small></span>
        ${num ? `<span class="sk-sitn">${psEsc(num)}</span>` : ""}
        <span class="sk-sitsw" aria-hidden="true"><i></i></span></button>`;
  },

  _skRing(v, size, stroke, col) {
    const r = size / 2 - stroke / 2, C = 2 * Math.PI * r;
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="sk-ringsvg" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ps-track)" stroke-width="${stroke}"/>${
      v == null || v <= 0 ? "" : `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(C * skClamp(v / 100)).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`}</svg>`;
  },

  /* A select's options as a segmented row — the vacuum's mode, suction, mop
     water and route are all selects, so one control draws them all, and an
     entity that does not exist draws no row at all. */
  _skSelSeg(id, label) {
    const st = id && this._hass.states[id];
    if (!st || !Array.isArray(st.attributes.options) || st.state === "unavailable") return "";
    const opts = st.attributes.options.filter((o) => o !== "unavailable");
    if (opts.length < 2 || opts.length > 5) return "";
    return `<div class="sk-optrow"><span class="ps-lbl">${psEsc(label)}</span><div class="sk-seg sm">${opts.map((o) =>
      `<button type="button" data-sksel="${psEsc(id)}" data-val="${psEsc(o)}" aria-selected="${o === st.state}">${psEsc(SK_SHORT[o] || psCrewWords(o) || o)}</button>`).join("")}</div></div>`;
  },

  _skVacuum(v) {
    const h = this._hass;
    const st = pcState(h, v.entity) || "unavailable";
    const busy = psVacBusy(st);
    const bat = pcNum(h, v.battery), prog = pcNum(h, v.progress);
    const room = pcState(h, v.current_room);
    const sib = (suffix) => {
      const base = v.cleaning_mode ? v.cleaning_mode.replace(/cleaning_mode$/, "") : null;
      return base && h.states[base + suffix] ? base + suffix : null;
    };
    const dirty = pcNum(h, v.dirty_water), clean = pcNum(h, v.clean_water);
    const wear = (v.wear || []).map((w) => ({ ...w, v: pcNum(h, w.entity) }));
    const mi = v.mileage || {};
    const area = pcNum(h, mi.area), runs = pcNum(h, mi.runs);
    const miles = area != null && mi.path_width_m ? (area * 0.092903 / mi.path_width_m) / 1609.34 : null;
    const sel = v.room_select && h.states[v.room_select];
    const pick = sel ? String(sel.state).replace(/^\S+ - /, "") : "";
    const go = v.room_multi && sel && v.room_script ? this._crewGoMulti(v) : null;
    return `<div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-good)"><ha-icon icon="mdi:robot-vacuum"></ha-icon></span><span class="sk-hn">${psEsc(v.name || "Vacuum")}</span>
        <span class="sk-status ${busy ? "good" : st === "error" ? "bad" : ""}">${psEsc(this._humanize(st))}${room && room !== "unknown" ? ` · ${psEsc(room)}` : ""}</span></div>
      <div class="sk-vtop">
        <div class="sk-vring">${this._skRing(busy && prog != null ? prog : bat, 104, 10, "var(--ps-good)")}<div><b>${busy && prog != null ? Math.round(prog) : bat == null ? "—" : Math.round(bat)}<small>%</small></b><span>${busy && prog != null ? "done" : "battery"}</span></div></div>
        <div class="sk-ctiles">
          <div class="st3"><b>${dirty == null ? "—" : Math.round(dirty) + "%"}</b><span>Dirty tank</span></div>
          <div class="st3"><b>${clean == null ? "—" : Math.round(clean) + "%"}</b><span>Clean water</span></div>
          <div class="st3 wide"><b>${miles == null ? "—" : "≈" + miles.toFixed(1) + " mi"}</b><span>${runs == null ? "Lifetime" : `${Math.round(runs)} runs`}</span></div>
        </div>
      </div>
      ${wear.length ? `<div class="sk-wear" style="--n:${wear.length}">${wear.map((w, i) => `<div class="sk-wr${w.v != null && w.v <= (w.warn_below == null ? 20 : w.warn_below) ? " due" : ""}"
          data-skpart="${i}" role="button" tabindex="0" aria-label="${psEsc(w.label)} ${w.v == null ? "no reading" : Math.round(w.v) + "%"}, hold to clean">
          <span class="r">${w.v == null ? `<span class="hatch"></span>` : this._skRing(w.v, 44, 5, w.v <= (w.warn_below == null ? 20 : w.warn_below) ? "var(--ps-warn)" : "var(--ps-good)")}<b>${w.v == null ? "—" : Math.round(w.v) + "%"}</b></span>
          <span>${psEsc(w.label)}</span></div>`).join("")}</div>
        <div class="sk-wearhint">hold a part to clean it</div>` : ""}
      ${this._skVacOpts(v, sib)}
      <div class="sk-vrooms">${this._crewRooms(v)}</div>
      <button class="sk-bigbtn pri wide vac" type="button" data-crewgo="${psEsc(v.entity)}" data-script="${psEsc(v.room_script || "")}"${go ? go.attrs : ""}>
        <ha-icon icon="${busy ? "mdi:pause" : "mdi:play"}"></ha-icon>${busy ? "Pause" : go ? psEsc(go.text) : pick ? `Clean ${psEsc(pick)}` : "Start cleaning"}</button>
      <div class="sk-btnrow three">
        ${v.map_sheet ? `<button class="sk-bigbtn" type="button" data-sheet="${psEsc(v.map_sheet)}"><ha-icon icon="mdi:map-marker-radius"></ha-icon>Map</button>` : ""}
        <button class="sk-bigbtn" type="button" data-crewact="vacuum.return_to_base" data-target="${psEsc(v.entity)}"><ha-icon icon="mdi:home-import-outline"></ha-icon>Dock</button>
        ${v.emptied_button ? `<button class="sk-bigbtn" type="button" data-crewact="input_button.press" data-target="${psEsc(v.emptied_button)}"><ha-icon icon="mdi:cup-water"></ha-icon>Emptied</button>` : ""}
      </div>
      <div class="sk-shellbits">${this._crewNightly(v)}${this._crewDeep(v)}</div>`;
  },

  /* The four selects are set once and read every day, so at rest they are ONE
     line of what is chosen, and the segmented rows open in place on a tap.
     Four stacked selectors were most of the card's height. */
  _skVacOpts(v, sib) {
    /* Each value carries its noun except the mode, which names itself —
       "Standard · Standard" was suction and route, and said neither. */
    const ids = [[v.cleaning_mode, "Mode", ""], [v.suction, "Suction", "suction"], [sib("mop_pad_humidity"), "Mop water", "water"], [sib("cleaning_route"), "Route", "route"]]
      .filter(([id]) => this._skSelSeg(id, ""));
    if (!ids.length) return "";
    const open = !!this._skVacOpen;
    const now = ids.map(([id, , noun]) => { const st = this._hass.states[id].state; const w = SK_SHORT[st] || psCrewWords(st) || st; return noun ? `${w} ${noun}` : w; });
    return `<div class="sk-opts ${open ? "open" : ""}">
        <button class="sk-optsum" type="button" data-skvacopts aria-expanded="${open}">
          <ha-icon icon="mdi:tune-variant"></ha-icon><span class="ps-grow">${now.map(psEsc).join(" · ")}</span><ha-icon icon="${open ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon></button>
        ${open ? ids.map(([id, label]) => this._skSelSeg(id, label)).join("") : ""}
      </div>`;
  },

  /* The part sheet, opened by holding a wear ring: how to clean that part and
     the vacuum's own reset for it. Holding is the gesture because the rings
     sit in a scrolling card — a tap on one would be one stray thumb away from
     resetting a counter. The sheet IS the confirmation, so its button needs
     no second arm. `reset:` names the Dreame button per part; a part without
     one still gets the instructions, and says it cannot be marked done here. */
  _skPartSheet() {
    const crew = this._skSec("crew");
    const v = crew && crew.vacuum;
    const w = v && (v.wear || [])[this._skPart];
    if (!w) return "";
    const h = this._hass;
    const val = pcNum(h, w.entity);
    const lim = w.warn_below == null ? 20 : w.warn_below;
    const due = val != null && val <= lim;
    const how = w.how || SK_PART_HOW[String(w.label || "").toLowerCase()] || "Clean it, then mark it done here.";
    const reset = w.reset && h.states[w.reset] ? w.reset : null;
    const close = `<button class="ps-x" type="button" id="ps-close" aria-label="Close">
        <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    return `<div class="ps-scrim" id="ps-scrim"></div>
      <div class="ps-sheet">
        <div class="ps-sheeth"><span class="ps-lbl">${psEsc(v.name || "Vacuum")} · ${psEsc(w.label)}</span>${close}</div>
        <div class="sk-part">
          <span class="r">${val == null ? `<span class="hatch"></span>` : this._skRing(val, 96, 9, due ? "var(--ps-warn)" : "var(--ps-good)")}<b class="${due ? "due" : ""}">${val == null ? "—" : Math.round(val) + "%"}</b></span>
          <p>${psEsc(how)}</p>
          ${reset ? `<button class="sk-bigbtn pri wide" type="button" data-skpartdone="${psEsc(reset)}"><ha-icon icon="mdi:check"></ha-icon>Cleaned · reset to 100%</button>`
            : `<div class="sk-empty">This part has no reset button configured.</div>`}
        </div>
      </div>`;
  },

  _skLitter(l) {
    const h = this._hass;
    const st = pcState(h, l.entity) || "unavailable";
    const dr = pcNum(h, l.waste_drawer), lv = pcNum(h, l.litter_level);
    const pet = l.pet || {};
    const w = pcNum(h, pet.weight), visits = pcNum(h, pet.visits), scoops = pcNum(h, pet.scoops);
    const err = st === "error";
    const tank = (v, cls, name) => `<div class="sk-tankw"><div class="sk-tankb ${cls}${v == null ? " none" : ""}"><i style="height:${v == null ? 0 : skClamp(v / 100) * 100}%"></i></div>
        <div class="tl"><span>${name}</span><b>${v == null ? "—" : `${Math.round(v)}<small>%</small>`}</b></div></div>`;
    return `<div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-litter)"><ha-icon icon="mdi:cat"></ha-icon></span><span class="sk-hn">${psEsc(l.name || "Litter box")}</span>
        <span class="sk-status ${err ? "bad" : ""}">${psEsc(this._humanize(st))}</span></div>
      <div class="sk-tanks2">${tank(dr, "dr", "Drawer")}${tank(lv, "lv", "Litter")}</div>
      <div class="sk-st3">
        <div class="st3"><b>${w == null ? "—" : w.toFixed(1)}<small>lb</small></b><span>${psEsc(pet.name || "Cat")}</span></div>
        <div class="st3"><b>${visits == null ? "—" : Math.round(visits)}</b><span>Visits today</span></div>
        <div class="st3"><b>${scoops == null ? "—" : Math.round(scoops).toLocaleString()}</b><span>Cycles</span></div>
      </div>
      ${l.reset_button ? `<button class="sk-bigbtn wide ${err ? "pri" : ""} ${this._skArmed === "lr" ? "armed" : ""}" type="button" data-skarm="lr" data-skpress="${psEsc(l.reset_button)}">
          <ha-icon icon="mdi:restart"></ha-icon>${this._skArmed === "lr" ? "Tap again to reset" : err ? "Reset after clearing it" : "Reset"}</button>` : ""}`;
  },

  _skWasher(w) {
    const h = this._hass;
    const st = String(pcState(h, w.entity) || "unknown");
    const started = w.start_time && h.states[w.start_time] ? h.states[w.start_time].state : null;
    const d = started ? new Date(started.replace(" ", "T")) : null;
    const done = /done|finish|complete/i.test(st), run = /run|wash|spin|rinse/i.test(st);
    return `<div class="sk-hd"><span class="sk-ico" style="--c:var(--ps-cool)"><ha-icon icon="${psEsc(w.icon || "mdi:washing-machine")}"></ha-icon></span><span class="sk-hn">${psEsc(w.name || "Washer")}</span>
        <span class="sk-status ${done ? "warn" : run ? "good" : ""}">${psEsc(this._humanize(st))}</span></div>
      ${d && !isNaN(d) ? `<div class="sk-line"><span>${run ? "Started" : "Last run"} ${psEsc(d.toLocaleDateString([], { month: "short", day: "numeric" }))} · ${psEsc(skClk(d.getTime()))}</span></div>` : ""}`;
  },

  /* ============================================================= SERVER === */

  _skSysPage() {
    const pages = this._sysPages ? this._sysPages() : [];
    const want = this._page || "overview";
    return (pages.find((p) => p.key === want) || pages[0] || { key: "overview", name: "Overview" });
  },

  _skSys(faults) {
    const s = this._sysCfg();
    if (!s) return this._skTitle("Server");
    const page = this._skSysPage();
    const pages = this._sysPages();
    const r = pcReading(this._hass, s.status);
    const online = r.ok && String(r.st.state).toLowerCase() === "online";
    const up = pcState(this._hass, s.uptime);
    const tabs = `<div class="sk-subtabs"><div class="sk-seg sm">${pages.map((p) => `<button type="button" data-sksys="${psEsc(p.key)}" aria-selected="${p.key === page.key}">${psEsc(p.name)}</button>`).join("")}</div></div>`;
    const body = {
      overview: () => this._skSysOverview(s),
      docker: () => this._skSysDocker(s),
      storage: () => this._skSysStorage(s),
      perf: () => `<div class="sk-card sk-pad sk-shellpage">${this._syPerf(s)}</div>`,
      alerts: () => `<div class="sk-card sk-pad sk-shellpage">${this._syAlerts(s)}</div>`,
    }[page.key];
    return `<button class="sk-back" type="button" data-skback="1"><ha-icon icon="mdi:chevron-left"></ha-icon>House</button>
      ${this._skTitle(s.name || "Server", `<span class="sk-status big ${online ? "good" : "bad"}">${online ? `Up ${psEsc(up && up !== "unknown" ? up : "")}` : r.ok ? psEsc(String(r.st.state)) : "No data"}</span>`)}
      ${tabs}${body ? (this._skHas("tab") ? `<div class="sk-sysbody pg-${psEsc(page.key)}">${body()}</div>` : body()) : ""}`;
  },

  _skSysOverview(s) {
    const h = this._hass;
    const meters = (s.meters || []).map((m) => ({ ...m, v: pcNum(h, m.entity) }));
    const arr = meters[0];
    const disks = this._syDisks().filter((d) => d.present && d.hasUsage && /^disk\d/.test(d.key));
    const sizes = disks.map((d) => skTB(d.total));
    const R = 66, C = 2 * Math.PI * R;
    let ring = `<circle cx="78" cy="78" r="${R}" fill="none" stroke="var(--ps-track)" stroke-width="14"/>`;
    const totalT = sizes.every((x) => x) ? sizes.reduce((a, b) => a + b, 0) : null;
    if (totalT) {
      let off = 0;
      disks.forEach((d, i) => {
        const a = off / totalT, b = (off + sizes[i] * (d.usage || 0) / 100) / totalT;
        ring += `<circle cx="78" cy="78" r="${R}" fill="none" stroke="var(--sk-nas)" stroke-width="14" opacity="${.6 + .4 * (i / Math.max(1, disks.length - 1))}"
          stroke-dasharray="${(C * (b - a)).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-C * a).toFixed(1)}" transform="rotate(-90 78 78)"/>`;
        off += sizes[i];
      });
    } else if (arr && arr.v != null) {
      ring += `<circle cx="78" cy="78" r="${R}" fill="none" stroke="var(--sk-nas)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(C * arr.v / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 78 78)"/>`;
    }
    const stats = (s.stats || []).map((x) => {
      const v = pcNum(h, x.entity);
      return `<div class="st3"><b>${v == null ? "—" : (x.digits != null ? Number(v).toFixed(x.digits) : Math.round(v))}${v != null && x.unit ? `<small>${psEsc(x.unit)}</small>` : ""}</b><span>${psEsc(x.label)}</span></div>`;
    }).join("");
    return `<div class="sk-card sk-pad">
        <div class="sk-ovtop"><div class="sk-ovring"><svg viewBox="0 0 156 156" role="img" aria-label="${psEsc(arr ? arr.label : "Array")} ${arr && arr.v != null ? arr.v + "%" : "no reading"}">${ring}</svg>
          <div><b>${arr && arr.v != null ? `${arr.v.toFixed(1)}<small>%</small>` : "—"}</b><span>${psEsc(arr ? arr.label : "Array")}</span></div></div>
          <div class="sk-meters col">${meters.slice(1).map((m) => `<div class="sk-meter${m.v == null ? "" : m.critical_above != null && m.v >= m.critical_above ? " bad" : m.warn_above != null && m.v >= m.warn_above ? " warn" : ""}"><span>${psEsc(m.label)}</span><span class="sk-mbar${m.v == null ? " none" : ""}"><i style="width:${m.v == null ? 0 : m.v}%"></i></span><b>${m.v == null ? "—" : psPct(m.v)}</b></div>`).join("")}</div></div>
        ${stats ? `<div class="sk-stats" style="padding:12px 0 0">${stats}</div>` : ""}
      </div>
      <div class="sk-card sk-pad sk-shellpage">${this._syParity(s)}${this._syPower(s)}</div>`;
  },

  _skSysDocker(s) {
    const all = this._syContainers().slice().sort((a, b) => (b.on - a.on) || a.name.localeCompare(b.name));
    const vms = this._syVms();
    const cols = ["var(--sk-nas)", "var(--ps-deep)", "var(--sk-media)", "var(--ps-good)", "var(--ps-heat)", "var(--ps-light)"];
    const run = all.filter((c) => c.on).length;
    return `<div class="sk-dsum"><span class="ps-chip good"><span class="ps-dot"></span>${run} running</span><span class="ps-chip">${all.length - run} stopped</span></div>`
      + vms.map((v) => `<div class="sk-ct vm"><span class="av" style="--c:var(--ps-light)"><ha-icon icon="mdi:lock-outline"></ha-icon></span>
          <span class="nm">${psEsc(v.name)}<small>Virtual machine · locked here</small></span><span></span><span class="sk-dotst ${v.on ? "on" : ""}">${v.on ? "On" : "Off"}</span></div>`).join("")
      + all.map((c, i) => `<div class="sk-ct${c.on ? "" : " off"}"><span class="av" style="--c:${cols[i % cols.length]}"><ha-icon icon="${psEsc(c.icon)}"></ha-icon></span>
          <span class="nm">${c.url ? `<button type="button" class="sk-ctlink" data-syurl="${psEsc(c.url)}">${psEsc(c.name)} ↗</button>` : psEsc(c.name)}<small>${psEsc(c.image)}${c.image && c.port ? " · " : ""}${psEsc(c.port)}</small></span>
          ${c.on && c.restart ? `<button class="sk-rst" type="button" data-sybtn="${psEsc(c.restart)}" aria-label="Restart ${psEsc(c.name)}"><ha-icon icon="mdi:restart"></ha-icon></button>` : `<span></span>`}
          <button class="sk-tog" type="button" data-sysw="${psEsc(c.id)}" aria-pressed="${c.on}" aria-label="${psEsc(c.name)}"></button></div>`).join("");
  },

  _skSysStorage(s) {
    const disks = this._syDisks();
    const tempC = (d) => {
      if (d.temp != null && Number.isFinite(d.temp)) return /F/i.test(d.tempUnit || "") ? (d.temp - 32) / 1.8 : d.temp;
      const t = d.tempAttr;
      if (t == null) return null;
      const n = typeof t === "number" ? t : parseFloat(t);
      return Number.isFinite(n) ? n : null;
    };
    const row = (d, sub) => {
      const t = tempC(d);
      const name = d.key.replace(/^disk/, "Disk ").replace(/_/g, " ").replace(/\b([a-z])/g, (m) => m.toUpperCase());
      const bar = !d.present ? `<span class="sk-mbar empty"></span>`
        : d.hasUsage ? `<span class="sk-mbar${d.usage == null ? " none" : ""}"><i style="width:${d.usage || 0}%"></i></span>`
          : `<span class="sk-hl ${/PASS/i.test(d.health) ? "good" : "bad"}">${psEsc(this._humanize(String(d.health).toLowerCase()))}</span>`;
      return `<div class="sk-dsk"><span class="nm">${psEsc(name)}<small>${psEsc(sub(d))}</small></span>${bar}<span class="tp${t != null && t >= 45 ? " hot" : ""}">${!d.present ? "—" : t == null ? "" : Math.round(t) + "°C"}</span></div>`;
    };
    const data = disks.filter((d) => /^disk\d/.test(d.key));
    const parity = disks.filter((d) => /parity/.test(d.key));
    const pools = disks.filter((d) => !/^disk\d/.test(d.key) && !/parity/.test(d.key));
    const sz = (d) => (d.used && d.total ? `${d.used} of ${d.total}` : d.hasUsage ? (d.usage == null ? "no reading" : psPct(d.usage)) : "");
    const shares = this._syShares();
    return `<div class="sk-card sk-pad"><div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-nas)"><ha-icon icon="mdi:harddisk"></ha-icon></span><span class="sk-hn">Array</span></div>
        ${data.map((d) => row(d, sz)).join("")}${parity.map((d) => row(d, (x) => (!x.present ? "Not installed" : "Health only"))).join("")}</div>
      ${pools.length ? `<div class="sk-card sk-pad"><div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-nas)"><ha-icon icon="mdi:database-outline"></ha-icon></span><span class="sk-hn">Pools</span></div>${pools.map((d) => row(d, sz)).join("")}</div>` : ""}
      ${shares.length ? `<div class="sk-card sk-pad"><div class="sk-hd"><span class="sk-ico" style="--c:var(--sk-nas)"><ha-icon icon="mdi:folder-network-outline"></ha-icon></span><span class="sk-hn">Shares</span><span class="ps-chip">${shares.length}</span></div>
        <div class="sk-shares">${shares.map((x) => `<span>${psEsc(x.name)}<small>${psPct(x.v)}</small></span>`).join("")}</div></div>` : ""}`;
  },
});

/* Temperature colour for the week capsules: colour is data here. */
function skTempCol(t) {
  const st = [[20, [77, 171, 247]], [50, [165, 216, 255]], [62, [255, 212, 160]], [80, [255, 146, 43]], [95, [240, 62, 62]]];
  let a = st[0], b = st[st.length - 1];
  for (let i = 0; i < st.length - 1; i++) if (t >= st[i][0] && t <= st[i + 1][0]) { a = st[i]; b = st[i + 1]; }
  if (t < st[0][0]) { a = b = st[0]; }
  const f = skClamp((t - a[0]) / ((b[0] - a[0]) || 1));
  return `rgb(${a[1].map((v, i) => Math.round(v + (b[1][i] - v) * f)).join(",")})`;
}

/* "6.4 TB" / "465.8 GB" to terabytes, or null — the disk sizes ride on the
   usage sensor as text. */
function skTB(str) {
  const m = /([\d.]+)\s*([KMGT])i?B/i.exec(String(str || ""));
  if (!m) return null;
  const n = parseFloat(m[1]);
  return n * ({ K: 1e-9, M: 1e-6, G: 1e-3, T: 1 }[m[2].toUpperCase()]);
}

/* One line on cleaning each part, keyed by its label. Config `how:` wins. */
const SK_PART_HOW = {
  "filter": "Tap the dust out over a bin. Replace it if it is torn or still clogged.",
  "side brush": "Pull off wrapped hair. Replace it if the bristles are bent.",
  "main brush": "Lift it out, cut away the hair, and clear both end caps.",
  "wheel": "Wipe the wheels and pull out any hair around the axles.",
  "sensors": "Wipe the cliff and wall sensors with a dry cloth.",
};

/* Short words for the vacuum's select options, so a segmented row fits a phone. */
const SK_SHORT = {
  sweeping: "Vacuum", mopping: "Mop", sweeping_and_mopping: "Both", mopping_after_sweeping: "Mop after",
  slightly_dry: "Dry", moist: "Moist", wet: "Wet", quick: "Quick", standard: "Standard",
  quiet: "Quiet", strong: "Strong", turbo: "Turbo",
};
