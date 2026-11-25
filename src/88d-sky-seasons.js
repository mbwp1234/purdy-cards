/* ============================================================================
 * purdy-sky-card — the arc and the seasons (v1.103.0)
 *
 * Off the approved "Skyline hero — sun arc & seasons" canvas.
 *
 * THE ARC is one track, left to right, for whichever half of the day we are
 * in. By day the sun rides it high and the moon a shallow trough under the
 * horizon; after sunset they swap — the moon rides a shallow arc above and
 * the sun the trough below. Left is where the period began (sunrise by day,
 * sunset by night), right is where it ends, and that end carries the
 * countdown: an elapsed time, so it is allowed under the chip rule. The
 * part already travelled is solid with a glow under it; the rest is dashed.
 *
 * The moon's place on its arc is how far through the NIGHT we are, not where
 * the real moon is — sun.sun publishes no moonrise. Its PHASE is real,
 * computed from the date (no moon integration is installed).
 *
 * THE SKY BAND follows sunrise and sunset here, not the clock: in November
 * the sun sets at 4:56 and the hour bands still painted "day" until 17:00.
 * Only this card's hero and rail orb use it; the shell's ground and the
 * greeting keep their own clock, which is the 22:00 night rule.
 *
 * SEASONS live in their own slot (#sk-fx), NOT in the hero's string. The
 * hero repaints every 30s tick because its clock changes, and a repaint
 * restarts every CSS animation in it — snow would jump back to the top of
 * the sky twice a minute. The fx string depends only on the season, the
 * period and the weather, so the patcher leaves it alone for hours.
 *
 *   - leaves     Oct 15 → Thanksgiving, any hour, not while it snows
 *   - halloween  Oct 24 → Nov 1, after dark: bats, an orange moon
 *   - christmas  the day after Thanksgiving → Jan 6: the tree on the
 *                horizon all day; lights strung on the sun's path after dark.
 *                `sky.tree` names the real tree's switch — while it reads
 *                "off" the tree is drawn dark. Unavailable is not "off": the
 *                tree is unplugged all year, and the season still stands.
 *   - santa      nights of Dec 23–25: a big moon with the sleigh across it;
 *                the arc's marker becomes a star so there are not two moons
 *   - fireworks  Jul 1–5 after dark; New Year's Eve in gold
 *   - snow       the WEATHER, never the date: flakes and a bank on the
 *                horizon only while the condition is snowy
 *
 * The greeting's key word changes on the day itself only. Everything stops
 * under prefers-reduced-motion. `sky: {seasons: false}` turns it all off.
 *
 * NOTE: SK_SKY_STYLES is a template literal. No backticks inside it.
 * ========================================================================== */

/* The moon's age as a fraction of a lunation, 0 = new, .5 = full. Mean
   synodic month from a known new moon (2000-01-06 18:14 UTC): good to well
   under a day, which is finer than a 16px glyph can show. */
function skMoonPhase(ms) {
  const syn = 29.530588853 * 864e5;
  const p = ((ms - Date.UTC(2000, 0, 6, 18, 14)) % syn) / syn;
  return p < 0 ? p + 1 : p;
}

/* The lit part of a moon of radius r at phase p, as one SVG path centred on
   0,0. Waxing is lit on the right (northern hemisphere). The terminator is a
   half-ellipse whose width is |cos 2πp| of the radius. */
function skMoonPath(p, r) {
  const k = Math.cos(2 * Math.PI * p), rx = Math.abs(k) * r;
  const waxing = p < 0.5;
  const s1 = waxing ? 1 : 0;
  const viaRight = (waxing && k > 0) || (!waxing && k < 0);
  return `M0 ${-r} A${r} ${r} 0 0 ${s1} 0 ${r} A${rx.toFixed(2)} ${r} 0 0 ${viaRight ? 0 : 1} 0 ${-r} Z`;
}

/* Thanksgiving: the fourth Thursday of November. */
function skThanksgiving(y) {
  const d = new Date(y, 10, 1);
  return new Date(y, 10, 1 + ((4 - d.getDay() + 7) % 7) + 21);
}

/* Which season, from the local date and whether it is dark. Pure, so the
   tests can walk a year through it. */
function skSeason(now, dark) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const day = new Date(y, m, d).getTime();
  const tg = skThanksgiving(y).getTime();
  /* A night belongs to the evening it started on: 1 AM on the 25th is still
     Christmas Eve night. */
  const eve = new Date(now.getTime() - 6 * 36e5);
  const em = eve.getMonth(), ed = eve.getDate();
  const out = { leaves: false, halloween: false, christmas: false, santa: false, fireworks: "" };
  out.leaves = day >= new Date(y, 9, 15).getTime() && day <= tg;
  out.halloween = dark && em === 9 && ed >= 24 || dark && m === 10 && d === 1 && now.getHours() < 5;
  out.christmas = day > tg || (m === 0 && d <= 6);
  out.santa = dark && em === 11 && ed >= 23 && ed <= 25;
  if (dark && em === 6 && ed >= 1 && ed <= 5) out.fireworks = "usa";
  if (dark && ((m === 11 && d === 31 && now.getHours() >= 18) || (m === 0 && d === 1 && now.getHours() < 2))) out.fireworks = "gold";
  if (out.halloween) out.leaves = false;
  return out;
}

/* The greeting's key word on the day itself, or null for the clock's own. */
function skHoliday(now) {
  const m = now.getMonth(), d = now.getDate(), y = now.getFullYear();
  const tg = skThanksgiving(y);
  if (m === 9 && d === 31) return "Happy <b>Halloween</b>";
  if (m === 10 && d === tg.getDate()) return "Happy <b>Thanksgiving</b>";
  if (m === 11 && d === 24) return "Merry <b>Christmas Eve</b>";
  if (m === 11 && d === 25) return "Merry <b>Christmas</b>";
  if (m === 11 && d === 31) return "Happy <b>New Year's Eve</b>";
  if (m === 0 && d === 1) return "Happy <b>New Year</b>";
  if (m === 6 && d === 4) return "Happy <b>Fourth</b>";
  return null;
}

/* The geometry, in the arc's own 400x140 box (stretched to the hero's width,
   so markers are HTML on top in percent and stay round). */
const SK_ARC = { W: 400, H: 140, L: 20, R: 380, base: 100, hi: 76, lo: 30, dip: 20 };
const skArcPt = (q, h) => [SK_ARC.L + q * (SK_ARC.R - SK_ARC.L), SK_ARC.base - Math.sin(Math.PI * skClamp(q)) * h];
function skArcPath(a, b, h) {
  let d = "";
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const [x, y] = skArcPt(a + (b - a) * i / n, h);
    d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d;
}
const skPctX = (x) => (x / SK_ARC.W * 100).toFixed(2) + "%";
const skPctY = (y) => (y / SK_ARC.H * 100).toFixed(2) + "%";

const SK_UP = "M3 10 A5 5 0 0 1 13 10 M1 10 L15 10 M8 1 L8 4.5 M6.3 2.6 L8 1 L9.7 2.6";
const SK_DN = "M3 10 A5 5 0 0 1 13 10 M1 10 L15 10 M8 1 L8 4.5 M6.3 2.9 L8 4.5 L9.7 2.9";
const SK_BULBS = ["#FF5A5F", "#FFD43B", "#51CF66", "#4DABF7", "#F783AC"];

Object.assign(PurdySkyCard.prototype, {
  /* The clock the sky reads. `_skAt` is a pin for dev/shoot only: a season
     is unphotographable eleven months of the year. */
  _skClock(now) {
    return this._skAt ? new Date(this._skAt) : now;
  },

  /* The period we are in. sun.sun publishes only the NEXT rise and set, so
     their clock times are laid onto the local date — a minute out at worst,
     and it means a pinned date still gets a sensible day. */
  _skSunFrame(now) {
    const s = this._hass && this._hass.states["sun.sun"];
    if (!s) return null;
    const nr = new Date(s.attributes.next_rising), ns = new Date(s.attributes.next_setting);
    if (!Number.isFinite(nr.getTime()) || !Number.isFinite(ns.getTime())) return null;
    const at = (src, dayOff) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOff, src.getHours(), src.getMinutes(), src.getSeconds());
      return d.getTime();
    };
    const t = now.getTime();
    const rise = at(nr, 0), set = at(ns, 0);
    let F;
    if (t < rise) F = { night: true, a: at(ns, -1), b: rise };
    else if (t < set) F = { night: false, a: rise, b: set };
    else F = { night: true, a: set, b: at(nr, 1) };
    F.f = skClamp((t - F.a) / (F.b - F.a));
    F.t = t;
    return F;
  },

  /* dawn / day / dusk / night from the sun, falling back to the hour bands
     without sun.sun. */
  _skBand(now) {
    const F = this._skSunFrame(now);
    if (!F) return this._skyBand(now.getHours()).replace("sky-", "");
    const M = 6e4;
    if (!F.night) return F.t < F.a + 60 * M ? "dawn" : F.t > F.b - 45 * M ? "dusk" : "day";
    return F.t < F.a + 80 * M ? "dusk" : F.t > F.b - 45 * M ? "dawn" : "night";
  },

  _skSeasonsOn() {
    return (this._config.sky || {}).seasons !== false;
  },

  /* The hero's greeting: the holiday's word on the day, else the clock's. */
  _skGreeting(now) {
    return (this._skSeasonsOn() && skHoliday(this._skClock(now))) || this._greeting();
  },

  _skTreeLit() {
    const id = (this._config.sky || {}).tree;
    const s = id && this._hass && this._hass.states[id];
    return !(s && s.state === "off");
  },

  _skSnowing() {
    const st = pcState(this._hass, this._config.weather);
    return /^(snowy|snowy-rainy)$/.test(String(st || ""));
  },

  _skSeason(now) {
    if (!this._skSeasonsOn()) return { leaves: false, halloween: false, christmas: false, santa: false, fireworks: "" };
    const F = this._skSunFrame(now);
    const dark = F ? F.night : (now.getHours() >= 18 || now.getHours() < 6);
    return skSeason(now, dark);
  },

  /* A moon glyph: the dark disc faintly, the lit part from the real phase. */
  _skMoonSvg(now, tint) {
    const p = skMoonPhase(now.getTime());
    const lit = tint === "harvest" ? "#FFB066" : "#EEF2FF";
    return `<svg viewBox="-10 -10 20 20"><circle r="9" class="sk-moondk"/><path d="${skMoonPath(p, 9)}" fill="${lit}"/></svg>`;
  },

  /* The arc. Repaints with the hero every tick — it carries the clock. */
  _skArc(now) {
    const F = this._skSunFrame(now);
    if (!F) return "";
    const A = SK_ARC;
    const night = F.night;
    const upH = night ? A.lo : A.hi;
    const [ux, uy] = skArcPt(F.f, upH);
    const [lx, ly] = skArcPt(F.f, -A.dip);
    const done = skArcPath(0, F.f, upH), ahead = skArcPath(F.f, 1, upH);
    const lDone = skArcPath(0, F.f, -A.dip), lAhead = skArcPath(F.f, 1, -A.dip);
    const area = `${done}L${ux.toFixed(1)} ${A.base}L${A.L} ${A.base}Z`;
    const glow = night ? 0 : Math.max(0, 1 - Math.sin(Math.PI * F.f) * 2.2) * 0.9;
    const season = this._skSeason(now);
    const clk = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");
    const left = Math.max(0, Math.round((F.b - F.t) / 6e4));
    const note = `in ${psHM(left)}`;
    const sun = (cls, x, y) => `<span class="sk-sun${cls}" style="left:${skPctX(x)};top:${skPctY(y)}"></span>`;
    const moon = (cls, x, y) => `<span class="sk-moon${cls}" style="left:${skPctX(x)};top:${skPctY(y)}">${
      season.santa && !cls ? `<svg viewBox="-10 -10 20 20"><path d="M0 -9 L2.4 -2.4 L9 0 L2.4 2.4 L0 9 L-2.4 2.4 L-9 0 L-2.4 -2.4 Z" fill="#FFE066"/></svg>`
        : this._skMoonSvg(now, season.halloween ? "harvest" : "")}</span>`;
    const upper = night ? moon("", ux, uy) : sun("", ux, uy);
    const lower = night ? sun(" lo", lx, ly) : moon(" lo", lx, ly);
    /* One row: the first card rides up over the hero's foot, so a second
       line under the time was drawn and then covered. */
    const lab = (side, ms, glyph, n) => `<span class="sk-st ${side}">${side === "r" ? `${n ? `<span class="sk-stn">${n}</span>` : ""}<b>${clk(ms)}</b>` : ""}<svg viewBox="0 0 16 12"><path d="${glyph}"/></svg>${side === "l" ? `<b>${clk(ms)}</b>` : ""}</span>`;
    return `<div class="sk-arc${night ? " night" : ""}" aria-hidden="true">
        <svg viewBox="0 0 ${A.W} ${A.H}" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sk-g-done" gradientUnits="userSpaceOnUse" x1="${A.L}" y1="0" x2="${Math.max(A.L + 1, ux).toFixed(1)}" y2="0">${
              night ? `<stop offset="0" stop-color="#66D9E8"/><stop offset="1" stop-color="#B197FC"/>` : `<stop offset="0" stop-color="#FF7A45"/><stop offset="1" stop-color="#FFD36E"/>`}</linearGradient>
            <linearGradient id="sk-g-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sk-areac"/><stop offset="1" class="sk-areac" stop-opacity="0"/></linearGradient>
            <radialGradient id="sk-g-hz"><stop offset="0" stop-color="#FFB070" stop-opacity=".9"/><stop offset="1" stop-color="#FF8A4C" stop-opacity="0"/></radialGradient>
          </defs>
          ${glow > 0.01 ? `<ellipse cx="${ux.toFixed(1)}" cy="${A.base}" rx="100" ry="18" fill="url(#sk-g-hz)" opacity="${glow.toFixed(2)}"/>` : ""}
          <path d="${area}" class="sk-area" fill="url(#sk-g-area)"/>
          <line x1="0" x2="${A.W}" y1="${A.base}" y2="${A.base}" class="sk-hz"/>
          <path d="${lAhead}" class="sk-lahead"/>
          <path d="${lDone}" class="sk-ldone"/>
          <path d="${ahead}" class="sk-ahead"/>
          <path d="${done}" class="sk-done" stroke="url(#sk-g-done)"/>
          <circle cx="${A.L}" cy="${A.base}" r="2.6" class="sk-end0"/>
          <circle cx="${A.R}" cy="${A.base}" r="2.6" class="sk-end1"/>
        </svg>
        ${upper}${lower}
        ${lab("l", F.a, night ? SK_DN : SK_UP, "")}${lab("r", F.b, night ? SK_UP : SK_DN, note)}
      </div>`;
  },

  /* The season layer. MUST NOT carry anything that changes on the clock's
     tick — see the header. */
  _skFx(now) {
    if (!this._skSeasonsOn()) return "";
    const F = this._skSunFrame(now);
    const dark = F ? F.night : false;
    const S = this._skSeason(now);
    const snow = this._skSnowing();
    const out = [];
    const pctL = (i, k, span) => ((i * k) % span);
    if (S.santa) {
      out.push(`<div class="sk-bigmoon"><i></i><i></i><i></i></div>
        <div class="sk-santa"><svg viewBox="0 0 104 30">${[[0, 1], [16, 4], [32, 7], [48, 10]].map(([x, y]) =>
          `<g transform="translate(${x} ${y})"><ellipse cx="8" cy="6" rx="5" ry="2.2"/><path d="M4 5.5 L2 3 L0.4 3.2 L0 2.5 L2.3 1.9 Z"/><path class="ln" d="M2 2 L1.4 0 M2 2 L3 0.1 M1.6 0.9 L0.5 0.5 M5 7 L1.6 8.6 M5.4 7.4 L2.6 9.6 M11.5 7 L15 8 M11 7.4 L14 9.7 M13 5.4 L14.6 4.7"/></g>`).join("")}
          <path class="ln thin" d="M73 18 L60 16.5 L44 13.5 L28 10.5 L12 7.5"/>
          <g transform="translate(70 15)"><path d="M2 3 L22 3 L24 -2 L26 -2 L24 8 L5 8 C2 8 1 6 2 3 Z"/><path class="ln" d="M0 11 L25 11 C28 11 29.4 9 28.4 7 M6 8 L6 11 M19 8 L19 11"/><path d="M10 3 C10 -3 18 -3 18 3 Z"/><circle cx="14" cy="-4.6" r="2.3"/><path d="M11.6 -6 L16.4 -6.6 L19.6 -3.4 Z"/><circle cx="21.4" cy="-0.4" r="3.6"/></g>
        </svg></div>`);
    }
    if (S.halloween) {
      const bat = `<svg viewBox="0 0 24 10"><path d="M12 9 L11 8 L9 6 L7 8 L5 6 L3 7 L0 3 L5 2.6 L9 3.6 L11 4 L11.3 2.4 L12 3.4 L12.7 2.4 L13 4 L15 3.6 L19 2.6 L24 3 L21 7 L19 6 L17 8 L15 6 L13 8 Z"/></svg>`;
      out.push([[76, 24, 32, 0, 14], [86, 36, 24, 3, 17], [66, 40, 20, 6, 12], [54, 20, 26, 2, 19], [90, 18, 18, 9, 15]].map(([x, y, w, dl, d]) =>
        `<div class="sk-bat" style="left:${x}%;top:${y}%;width:${w}px;animation-delay:-${dl}s;animation-duration:${d}s">${bat}</div>`).join(""));
    }
    if (S.fireworks) {
      let rays = "", sparks = "";
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        rays += `M${(c * 9).toFixed(1)} ${(s * 9).toFixed(1)} L${(c * 34).toFixed(1)} ${(s * 34).toFixed(1)} `;
        sparks += `M${(c * 42).toFixed(1)} ${(s * 42).toFixed(1)} L${(c * 43).toFixed(1)} ${(s * 43).toFixed(1)} `;
      }
      const cols = S.fireworks === "gold" ? [["#FFD43B", "#FFF3BF"], ["#FFE8A3", "#FFFFFF"], ["#FAB005", "#FFEC99"], ["#FFD43B", "#FFFFFF"]]
        : [["#FF6B6B", "#FFC9C9"], ["#F8F9FA", "#FFFFFF"], ["#74C0FC", "#D0EBFF"], ["#FFD43B", "#FFF3BF"]];
      out.push([[76, 22], [54, 12], [87, 44], [64, 40]].map(([x, y], i) =>
        `<svg class="sk-burst" viewBox="-52 -52 104 104" style="left:${x}%;top:${y}%;animation-delay:${[0, 1, 2, 1.5][i]}s"><path d="${rays}" stroke="${cols[i][0]}"/><path d="${sparks}" stroke="${cols[i][1]}" class="sp"/></svg>`).join(""));
    }
    if (S.leaves && !snow) {
      const LEAF = ["#E8590C", "#F08C00", "#C2410C", "#FAB005", "#A9480F"];
      out.push(Array.from({ length: 12 }, (_, i) => {
        const s = 9 + (i % 3) * 2;
        return `<i class="sk-leaf" style="left:${pctL(i, 16, 97)}%;width:${s}px;height:${s}px;background:${LEAF[i % 5]};animation-duration:${(10 + (i % 4) * 2.2).toFixed(1)}s;animation-delay:-${((i * 1.7) % 12).toFixed(2)}s;--dx:${i % 2 ? 28 : -24}px"></i>`;
      }).join(""));
    }
    if (snow) {
      out.push(Array.from({ length: 42 }, (_, i) => {
        const s = 2 + (i % 3);
        return `<i class="sk-flake" style="left:${pctL(i, 12.1, 100).toFixed(1)}%;width:${s}px;height:${s}px;opacity:${(.45 + (i % 4) * .14).toFixed(2)};animation-duration:${(7 + (i % 5) * 1.4).toFixed(1)}s;animation-delay:-${((i * .83) % 10).toFixed(2)}s;--dx:${i % 2 ? 16 : -14}px"></i>`;
      }).join(""));
    }
    /* Things that stand on the horizon share the arc's box. */
    const ground = [];
    if (snow) {
      const A = SK_ARC;
      let cap = "";
      for (let x = 0; x <= A.W; x += 8) cap += (x ? "L" : "M") + x + " " + (A.base - 3 - 2.4 * Math.sin(x / 23) - 1.6 * Math.sin(x / 9 + 1)).toFixed(1);
      ground.push(`<svg viewBox="0 0 ${A.W} ${A.H}" preserveAspectRatio="none"><path d="${cap} L${A.W} ${A.H} L0 ${A.H} Z" class="sk-bank"/><path d="${cap}" class="sk-cap"/></svg>`);
    }
    if (S.christmas) {
      const lit = this._skTreeLit();
      if (dark && lit) {
        ground.push(`<svg viewBox="0 0 ${SK_ARC.W} ${SK_ARC.H}" preserveAspectRatio="none"><path d="${skArcPath(0, 1, SK_ARC.hi)}" class="sk-wire"/></svg>`);
        ground.push(Array.from({ length: 23 }, (_, i) => {
          const [x, y] = skArcPt((i + 1) / 24, SK_ARC.hi);
          const c = SK_BULBS[i % 5];
          return `<i class="sk-bulb" style="left:${skPctX(x)};top:calc(${skPctY(y)} + 2px);--c:${c};animation-delay:-${((i * .37) % 2.4).toFixed(2)}s;animation-duration:${(1.6 + (i % 3) * .5).toFixed(1)}s"></i>`;
        }).join(""));
      }
      const bulbs = [];
      [[20, 3], [32, 4], [45, 5], [57, 6]].forEach(([y0, n], r) => {
        const hw = (y0 - 10) / 53 * 22 - 3;
        for (let j = 0; j < n; j++) {
          const t = n === 1 ? .5 : j / (n - 1), x = 23 - hw + t * 2 * hw, y = y0 + t * 5 - 2;
          bulbs.push(`<i class="sk-tb" style="left:${(x / 46 * 100).toFixed(1)}%;top:${(y / 70 * 100).toFixed(1)}%;--c:${SK_BULBS[(j + r * 2) % 5]};animation-delay:-${(((j + 1) * (r + 2) * .41) % 2.2).toFixed(2)}s;animation-duration:${(1.5 + ((j + r) % 3) * .45).toFixed(2)}s"></i>`);
        }
      });
      ground.push(`<div class="sk-tree${lit ? " lit" : ""}"><svg viewBox="0 0 46 70"><rect x="20" y="62" width="6" height="8" rx="1" class="tk"/><path d="M23 10 L9 30 L16 30 L5 46 L13 46 L1 63 L45 63 L33 46 L41 46 L30 30 L37 30 Z" class="fr"/><path d="M23 10 L23 63 L45 63 L33 46 L41 46 L30 30 L37 30 Z" class="sh"/><circle cx="23" cy="7" r="9" class="gl"/><path d="M23 1.5 L24.6 5.4 L28.8 5.6 L25.5 8.2 L26.7 12.2 L23 9.9 L19.3 12.2 L20.5 8.2 L17.2 5.6 L21.4 5.4 Z" class="st"/></svg>${bulbs.join("")}</div>`);
    }
    if (ground.length) out.push(`<div class="sk-fxarc">${ground.join("")}</div>`);
    return out.join("");
  },
});

const SK_SKY_STYLES = `
      /* ---- the arc (v1.103.0) ---- */
      .sk-heroslot { display: contents; }
      .sk-arc { position: absolute; left: 0; right: 0; bottom: 38px; height: 92px; pointer-events: none; }
      .sk-arc svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
      .sk-arc .sk-hz { stroke: var(--si); stroke-opacity: .26; stroke-width: 1; vector-effect: non-scaling-stroke; }
      .sk-arc .sk-ahead { fill: none; stroke: var(--si); stroke-opacity: .38; stroke-width: 1.6; stroke-dasharray: 2 5; stroke-linecap: round; vector-effect: non-scaling-stroke; }
      .sk-arc .sk-done { fill: none; stroke-width: 2.6; stroke-linecap: round; vector-effect: non-scaling-stroke; }
      .sk-arc.night .sk-done { stroke-width: 2.4; }
      .sk-arc .sk-areac { stop-color: #FFC46E; stop-opacity: .26; }
      .sk-arc.night .sk-areac { stop-color: #A5B8FF; stop-opacity: .22; }
      :host([data-sk-theme="light"]) .sk-arc .sk-areac { stop-opacity: .34; }
      .sk-arc .sk-lahead { fill: none; stroke: var(--si); stroke-opacity: .22; stroke-width: 1.2; stroke-dasharray: 2 5; stroke-linecap: round; vector-effect: non-scaling-stroke; }
      .sk-arc .sk-ldone { fill: none; stroke: #B197FC; stroke-opacity: .7; stroke-width: 1.8; stroke-linecap: round; vector-effect: non-scaling-stroke; }
      .sk-arc.night .sk-ldone { stroke: #FF9F5A; stroke-opacity: .6; }
      .sk-arc .sk-end0 { fill: #FF7A45; } .sk-arc.night .sk-end0 { fill: #66D9E8; }
      .sk-arc .sk-end1 { fill: none; stroke: var(--si); stroke-opacity: .5; stroke-width: 1.2; vector-effect: non-scaling-stroke; }
      .sk-sun { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #FFB347;
                box-shadow: 0 0 0 10px rgba(255,200,120,.28), 0 0 30px 10px rgba(255,190,100,.35); }
      .sk-sun.lo { width: 8px; height: 8px; margin: -4px 0 0 -4px; opacity: .75; box-shadow: 0 0 10px 3px rgba(255,160,80,.35); }
      .sk-moon { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%;
                 box-shadow: 0 0 0 7px rgba(200,212,255,.10), 0 0 22px 6px rgba(190,205,255,.32); }
      .sk-moon svg { display: block; width: 100%; height: 100%; overflow: visible; }
      .sk-moon .sk-moondk { fill: rgba(12,18,34,.85); stroke: rgba(230,236,255,.35); stroke-width: .8; }
      .sk-moon.lo { width: 12px; height: 12px; margin: -6px 0 0 -6px; opacity: .6; box-shadow: none; }
      /* On glass, like the hero's chips: the labels sit where the sky fades
         into the page, which in the paper theme after dark is a mid-grey that
         neither ink reads on — and the lower body passes right under them. */
      .sk-st { position: absolute; top: calc(71.4% + 5px); display: flex; align-items: center; gap: 5px; padding: 2px 7px; border-radius: 999px;
               font-size: var(--pc-fs-xs); font-weight: 650; color: var(--ps-muted); font-variant-numeric: tabular-nums;
               background: color-mix(in srgb, var(--sk-card) 78%, transparent); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
      .sk-st.l { left: 10px; } .sk-st.r { right: 10px; }
      .sk-st svg { position: static; width: 16px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
      .sk-stn { font-weight: 600; color: var(--ps-text); margin-right: 3px; }
      :host([data-sk-w~="tab"]) .sk-arc { bottom: 62px; }

      /* ---- the seasons ---- */
      .sk-fx { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
      .sk-fx:empty { display: none; }
      .sk-fxarc { position: absolute; left: 0; right: 0; bottom: 38px; height: 92px; }
      :host([data-sk-w~="tab"]) .sk-fxarc { bottom: 62px; }
      .sk-fxarc svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
      .sk-bank { fill: rgba(244,248,255,.16); }
      .sk-cap { fill: none; stroke: #F4F8FF; stroke-opacity: .85; stroke-width: 2.4; stroke-linecap: round; vector-effect: non-scaling-stroke; }
      .sk-wire { fill: none; stroke: #2F6B4A; stroke-opacity: .95; stroke-width: 1.4; vector-effect: non-scaling-stroke; }
      .sk-bulb { position: absolute; width: 6px; height: 8px; margin-left: -3px; border-radius: 50% 50% 45% 45% / 40% 40% 60% 60%;
                 background: var(--c); box-shadow: 0 0 6px 2px color-mix(in srgb, var(--c) 55%, transparent), 0 0 14px 4px color-mix(in srgb, var(--c) 20%, transparent);
                 animation: sk-bulb 2s ease-in-out infinite; }
      @keyframes sk-bulb { 0%, 100% { opacity: 1; filter: brightness(1.15); } 45% { opacity: .3; filter: brightness(.6); } }
      .sk-tree { position: absolute; right: 8%; bottom: 28.6%; width: 46px; height: 70px; }
      .sk-tree svg { position: absolute; inset: 0; width: 100%; height: 100%; }
      .sk-tree .tk { fill: #5A3A22; } .sk-tree .fr { fill: #1E5A3C; } .sk-tree .sh { fill: #000; fill-opacity: .18; }
      .sk-tree .gl { fill: #FFE066; fill-opacity: 0; } .sk-tree .st { fill: #8C8A70; }
      .sk-tree.lit .gl { fill-opacity: .35; } .sk-tree.lit .st { fill: #FFD43B; }
      .sk-tb { position: absolute; width: 4px; height: 5px; margin-left: -2px; border-radius: 50%; background: #3A4A42; }
      .sk-tree.lit .sk-tb { background: var(--c); box-shadow: 0 0 5px 1px color-mix(in srgb, var(--c) 65%, transparent), 0 0 10px 3px color-mix(in srgb, var(--c) 20%, transparent);
                            animation: sk-bulb 2s ease-in-out infinite; }
      .sk-flake { position: absolute; top: 0; border-radius: 50%; background: #fff; box-shadow: 0 0 4px rgba(255,255,255,.6); animation: sk-fall 9s linear infinite; }
      @keyframes sk-fall { 0% { transform: translate(0, -20px); } 50% { transform: translate(var(--dx), 220px); } 100% { transform: translate(0, 480px); } }
      .sk-leaf { position: absolute; top: 0; border-radius: 0 80% 0 80%; opacity: .9; animation: sk-leaf 12s linear infinite; }
      @keyframes sk-leaf { 0% { transform: translate(0, -20px) rotate(0deg); } 25% { transform: translate(var(--dx), 110px) rotate(90deg); }
        50% { transform: translate(0, 230px) rotate(200deg); } 75% { transform: translate(calc(var(--dx) * -1), 350px) rotate(280deg); } 100% { transform: translate(0, 480px) rotate(360deg); } }
      .sk-bat { position: absolute; animation: sk-batfly 14s linear infinite; }
      .sk-bat svg { display: block; width: 100%; fill: #1A0F1F; filter: drop-shadow(0 0 2px rgba(255,150,70,.9)) drop-shadow(0 0 6px rgba(255,120,40,.45)); transform-origin: 50% 40%; animation: sk-flap .3s ease-in-out infinite alternate; }
      @keyframes sk-flap { from { transform: scaleY(1); } to { transform: scaleY(-.45); } }
      @keyframes sk-batfly { 0% { transform: translate(0, 0); } 25% { transform: translate(-40px, -12px); } 50% { transform: translate(-92px, 6px); } 75% { transform: translate(-40px, 14px); } 100% { transform: translate(0, 0); } }
      .sk-burst { position: absolute; width: 104px; height: 104px; margin: -52px 0 0 -52px; opacity: 0; animation: sk-burst 3s ease-out infinite; }
      .sk-burst path { fill: none; stroke-width: 2.2; stroke-linecap: round; } .sk-burst path.sp { stroke-width: 2.6; }
      @keyframes sk-burst { 0% { transform: scale(.12); opacity: 0; } 8% { opacity: 1; } 55% { transform: scale(1); opacity: .9; } 100% { transform: scale(1.1) translateY(10px); opacity: 0; } }
      .sk-bigmoon { position: absolute; right: 7%; top: 96px; width: 84px; height: 84px; border-radius: 50%;
                    background: radial-gradient(circle at 38% 35%, #FFFDF2, #F1EACC 60%, #D9CDA4);
                    box-shadow: 0 0 0 14px rgba(255,248,220,.06), 0 0 70px 24px rgba(255,240,200,.20); }
      .sk-bigmoon i { position: absolute; border-radius: 50%; background: rgba(120,100,60,.09); }
      .sk-bigmoon i:nth-child(1) { left: 22px; top: 30px; width: 14px; height: 14px; }
      .sk-bigmoon i:nth-child(2) { left: 50px; top: 18px; width: 9px; height: 9px; }
      .sk-bigmoon i:nth-child(3) { left: 46px; top: 52px; width: 17px; height: 17px; }
      .sk-santa { position: absolute; right: calc(7% - 22px); top: 120px; width: 124px; height: 36px; animation: sk-bob 5s ease-in-out infinite; }
      .sk-santa svg { width: 100%; height: 100%; fill: #0B1022; stroke: #0B1022; stroke-linecap: round; stroke-linejoin: round; }
      .sk-santa svg .ln { fill: none; stroke-width: .9; } .sk-santa svg .ln.thin { stroke-width: .5; }
      @keyframes sk-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      :host([data-sk-w~="desk"]) .sk-bigmoon, :host([data-sk-w~="desk"]) .sk-santa { right: auto; left: 44%; }
      @media (prefers-reduced-motion: reduce) {
        .sk-fx *, .sk-fx { animation: none !important; }
        .sk-flake, .sk-leaf { display: none; }
      }
`;
