/* =====================================================================
 * Skylight's own person, weather and notification sheets (v1.116.0).
 *
 * All three were still the shell's sheets inside Skylight — a horseshoe
 * gauge with three captions, a page of boxed facts and a sentence, and a
 * hosted card with its own dots and chips — beside the litter and lake
 * sheets, which are drawn from Skylight's cards. Picked from a board of real
 * renders (2026-11-27): person B (the face carries the ring), weather A (now
 * and the next 24 hours, then the week), notifications A (Needs you / FYI).
 *
 * Nothing that was reachable is dropped. The person's device page is the
 * face itself (a tap, as well as the avatar's hold); the measured week is the
 * Week card's Past tab; the log keeps restore, clear-history and the folded
 * update row the hosted card had.
 * ===================================================================== */

const SK_NT_ICON = { batt: "mdi:battery-low", off: "mdi:wifi-off", unraid: "mdi:server", truck: "mdi:car-wrench" };
const SK_NT_COL = { critical: "var(--ps-bad)", warn: "var(--ps-warn)", info: "var(--sk-nas)" };

function skShortTime(d) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
}

Object.assign(PurdySkyCard.prototype, {
  _skSheetClose() {
    return `<button class="ps-x" type="button" id="ps-close" aria-label="Close">
        <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  },

  _skShHead(icon, name, right, col) {
    return `<div class="sk-lth"><span class="sk-ico" style="--c:${col || "var(--sk-litter)"}"><ha-icon icon="${icon}"></ha-icon></span><span class="sk-hn">${psEsc(name)}</span>${right || ""}</div>`;
  },

  /* A tile: glyph, value, one-word label. A missing reading is a dash, never a zero. */
  _skShTile(glyph, value, label) {
    return `<div class="st3 sk-ltt">${glyph}<b>${value == null ? "—" : value}</b><span>${psEsc(label)}</span></div>`;
  },

  _skShGlyph(icon) {
    return `<span class="sk-tg"><ha-icon icon="${icon}"></ha-icon></span>`;
  },

  /* ============================================================ PERSON === */

  _skPersonSheet() {
    const p = (this._config.people || [])[this._personPick];
    if (!p || !p.steps) return "";
    const h = this._hass;
    const st = this._personStats(p);
    const nm = pcName(h, p.entity, p.name);
    const raw = pcState(h, p.entity) || "";
    const home = raw === "home";
    const pv = h.states[p.entity];
    const since = pv && pv.last_changed ? new Date(pv.last_changed) : null;
    const where = home ? "Home" : raw === "not_home" || !raw ? "Away" : raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, " ");
    const pill = `<span class="ps-chip">${psEsc(where)}${since && !isNaN(since) ? ` · ${psEsc(skShortTime(since))}` : ""}</span>`;

    const num = st.today == null ? `<b class="ps-nodata">—</b>` : `<b>${Math.round(st.today).toLocaleString()}</b>`;
    /* The marker is their own average (or the configured goal before there is
       a week): a dashed line across the bars, at the bars' own scale. */
    const hi = Math.max(st.goal || 0, ...st.week.map((d) => d.steps || 0), 1) * 1.08;
    const bars = st.week.map((d) => {
      const lab = d.today ? "Today" : new Date(d.at).toLocaleDateString([], { weekday: "narrow" });
      const hgt = d.steps == null ? 64 : Math.max(4, (d.steps / hi) * 64);
      return `<span class="sk-ltbar${d.today ? " td on" : ""}${d.steps == null ? " none" : ""}"
          aria-label="${psEsc(d.today ? "Today" : d.key)}: ${d.steps == null ? "nothing reported" : `${Math.round(d.steps).toLocaleString()} steps`}"><i style="height:${hgt.toFixed(0)}px"></i><b>${psEsc(lab)}</b></span>`;
    }).join("");
    const avg = st.goal ? `<span class="sk-pavg" style="bottom:${(19 + (st.goal / hi) * 64).toFixed(0)}px"></span>` : "";

    const dist = this._pDist(p);
    const fl = p.floors ? pcNum(h, p.floors) : null;
    const bat = p.battery ? pcNum(h, p.battery) : null;
    const tiles = [];
    if (p.distance) tiles.push(this._skShTile(this._skShGlyph("mdi:map-marker-distance"), dist ? `${dist.v.toFixed(1)}<small>${dist.u}</small>` : null, "Distance"));
    if (p.floors) tiles.push(this._skShTile(this._skShGlyph("mdi:stairs-up"), fl == null ? null : Math.round(fl), "Floors"));
    if (p.battery) {
      tiles.push(this._skShTile(`<span class="sk-ltank${bat == null ? " none" : bat < 25 ? " low" : ""}"><i style="height:${bat == null ? 0 : skClamp(bat / 100) * 100}%"></i></span>`,
        bat == null ? null : `${Math.round(bat)}<small>%</small>`, "Phone"));
    }

    return `<div class="ps-scrim" id="ps-scrim"></div>
      <div class="ps-sheet">
        <div class="ps-sheeth"><span class="ps-lbl">${psEsc(nm.split(" ")[0])}</span>${this._skSheetClose()}</div>
        <div class="sk-lt">
          <div class="sk-ltc">
            <div class="sk-pphero">
              <button class="sk-ppface ${home ? "home" : "away"}" type="button" data-info="${psEsc(p.entity)}" aria-label="${psEsc(nm)}'s device page">
                ${this._pvRing(st, { size: 112, full: true, stroke: 7 })}${this._pvFace(p, nm)}</button>
              <div class="sk-ppnum"><div class="sk-tv">${num}</div>${pill}</div>
            </div>
            <div class="sk-pwk" role="img" aria-label="Steps for the last seven days${st.goal ? `; marker at ${Math.round(st.goal).toLocaleString()}` : ""}">${bars}${avg}</div>
          </div>
          ${tiles.length ? `<div class="sk-st3 sk-ltst3" style="--n:${tiles.length}">${tiles.join("")}</div>` : ""}
        </div>
      </div>`;
  },

  /* =========================================================== WEATHER === */

  _skWxSheet() {
    const sec = this._weatherSection();
    if (!sec) return "";
    const h = this._hass;
    const live = this._wxLive(sec);
    const fcSt = sec.forecast && h.states[sec.forecast];
    const cond = fcSt ? fcSt.state : null;
    const fc = this._wxFc || [];
    const wet = fc.find((d) => (d.pop != null && d.pop >= 40) || /rain|pour|lightning|snow|hail|sleet/.test(String(d.condition || "")));
    const chip = wet ? `<span class="ps-chip sk-wxwet"><ha-icon icon="mdi:umbrella"></ha-icon>${psEsc(this._wxDow(wet.ts, wet.today))}${
      wet.pop != null ? ` ${Math.round(wet.pop)}%` : ""}</span>` : "";

    const now = `<div class="sk-ltc">
        ${this._skShHead(pcWxIcon(cond), pcWxText(cond) || "Weather", chip, "var(--ps-heat)")}
        <div class="sk-lttop"><div class="sk-tv">${live == null ? `<b class="ps-nodata">—</b>` : `<b>${Math.round(live)}°</b>`}</div></div>
        ${this._skWxHours()}
      </div>`;

    /* The week, both tenses: the forecast by default, the measured record
       behind Past. The tab is the shell's own data-wxrail, so the pick is the
       same session-scoped _wxPick the column used. */
    const rail = this._wxRail(sec);
    const seg = `<div class="sk-seg sm sk-ltseg" role="tablist">
        <button type="button" role="tab" data-wxrail="history" aria-selected="${rail === "history"}">Past</button>
        <button type="button" role="tab" data-wxrail="forecast" aria-selected="${rail === "forecast"}">Next</button></div>`;
    let body;
    if (rail === "history") {
      const rows = this._wxHistRows(live).map((d) => ({ ts: d.ts, lo: d.min, hi: d.max, today: !!d.partial }));
      body = rows.length ? this._skWeekRail(rows)
        : `<div class="sk-empty">${this._wxStatsErr ? `The record would not load — ${psEsc(this._wxStatsErr)}` : "Reading the record…"}</div>`;
    } else {
      body = this._skWeekRail();
    }
    const week = `<div class="sk-ltc">${this._skShHead("mdi:calendar-week", "Week", seg, "var(--sk-nas)")}${body}</div>`;

    /* Feels and wind come from whichever provider publishes them (NWS has
       no apparent temperature); the sun tile is the NEXT event. */
    const feels = sec.feels_from && h.states[sec.feels_from];
    const pick = (k) => {
      const v = feels ? pcNumOf(feels, k) : null;
      return v == null ? (fcSt ? pcNumOf(fcSt, k) : null) : v;
    };
    const tiles = [];
    const app = pick("apparent_temperature");
    if (app != null) tiles.push(this._skShTile(this._skShGlyph("mdi:thermometer"), `${Math.round(app)}°`, "Feels"));
    const hum = pick("humidity");
    if (hum != null) tiles.push(this._skShTile(this._skShGlyph("mdi:water-percent"), `${Math.round(hum)}<small>%</small>`, "Humidity"));
    const ws = pick("wind_speed");
    if (ws != null) {
      const unit = (((feels || fcSt || {}).attributes) || {}).wind_speed_unit || "";
      tiles.push(this._skShTile(this._skShGlyph("mdi:weather-windy"), `${Math.round(ws)}${unit ? `<small>${psEsc(unit)}</small>` : ""}`, "Wind"));
    }
    const sun = sec.sun && h.states[sec.sun];
    if (sun) {
      const up = sun.state === "above_horizon";
      const d = new Date(up ? sun.attributes.next_setting : sun.attributes.next_rising);
      if (!isNaN(d.getTime())) {
        const t = skShortTime(d).replace(/(am|pm)$/, "<small>$1</small>");
        tiles.push(this._skShTile(this._skShGlyph(up ? "mdi:weather-sunset-down" : "mdi:weather-sunset-up"), t, up ? "Sunset" : "Sunrise"));
      }
    }

    return `<div class="ps-scrim" id="ps-scrim"></div>
      <div class="ps-sheet tall">
        <div class="ps-sheeth"><span class="ps-lbl">${psEsc(sec.title || "Weather")}</span>${this._skSheetClose()}</div>
        <div class="sk-lt">${now}${week}
          ${tiles.length ? `<div class="sk-st3 sk-ltst3" style="--n:${tiles.length}">${tiles.join("")}</div>` : ""}
        </div>
      </div>`;
  },

  /* The next 24 hours as one line, rain as bars along the foot, the high and
     the low labelled where they fall. Midnight takes the weekday. */
  _skWxHours() {
    const hrs = (this._wxHrs || []).filter((x) => x && Number.isFinite(x.t));
    if (hrs.length < 2) {
      return `<div class="sk-empty">${this._wxFcErr ? "The forecast would not load" : this._wxHrs ? "No hourly forecast" : "Reading the forecast…"}</div>`;
    }
    const W = SK_LT_W, H = 96, n = hrs.length;
    const ts = hrs.map((x) => x.t);
    const mn = Math.min(...ts), mx = Math.max(...ts);
    /* A flat day must not draw as a mountain range: the span has a floor. */
    const pad = Math.max(2, (6 - (mx - mn)) / 2);
    const lo = mn - pad, hi = mx + pad;
    const X = (i) => (i / (n - 1)) * W, Y = (t) => 6 + ((hi - t) / (hi - lo)) * (H - 12);
    const line = hrs.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(x.t).toFixed(1)}`).join(" ");
    const rain = hrs.map((x, i) => x.pop != null && x.pop >= 20
      ? `<rect class="rn" x="${(X(i) - 4).toFixed(1)}" y="${(H - (x.pop / 100) * 30).toFixed(1)}" width="8" height="${((x.pop / 100) * 30).toFixed(1)}" rx="3"/>` : "").join("");
    const iMax = ts.indexOf(mx), iMin = ts.indexOf(mn);
    const lab = (i, up) => `<text class="ext" x="${Math.min(W - 14, Math.max(14, X(i))).toFixed(1)}" y="${(Y(hrs[i].t) + (up ? -8 : 16)).toFixed(1)}" text-anchor="middle">${Math.round(hrs[i].t)}°</text>`;
    const ax = hrs.map((x, i) => {
      if (i % 6) return "";
      const d = new Date(x.ts);
      const t = d.getHours() === 0 ? d.toLocaleDateString([], { weekday: "short" }).toUpperCase()
        : d.toLocaleTimeString([], { hour: "numeric" }).replace(/\s/g, "").replace(/M$/i, "").toLowerCase();
      return `<line class="tk" x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="0" y2="${H}"/><text class="ax" x="${(X(i) + 4).toFixed(1)}" y="${H + 18}">${psEsc(t)}</text>`;
    }).join("");
    return `<svg class="sk-ltchart sk-wxh" viewBox="0 -14 ${W} ${H + 38}" role="img" aria-label="Next 24 hours, ${Math.round(mn)}° to ${Math.round(mx)}°">
        ${ax}<path class="area" d="${line} L${W} ${H} L0 ${H} Z"/><path class="ln" d="${line}"/>${rain}
        <circle class="dot" cx="0" cy="${Y(hrs[0].t).toFixed(1)}" r="5"/>${lab(iMax, true)}${iMin !== iMax && iMin !== 0 ? lab(iMin, false) : ""}</svg>`;
  },

  /* ===================================================== NOTIFICATIONS === */

  _skNtEntity() {
    const spec = (this._config.sheets || {}).notifications || {};
    return (spec.card && spec.card.entity) || spec.entity || this._config.log_to || null;
  },

  /* The list is fetched once per change of the todo entity (its state is the
     open count), not per render. */
  _skNtLoad(force) {
    const ent = this._skNtEntity();
    if (!ent || !this._hass || !this._hass.callWS) return;
    const sig = pcState(this._hass, ent);
    const S = this._skNt;
    if (!force && S && (S.busy || S.sig === sig)) return;
    this._skNt = { ...(S || {}), busy: true, sig };
    this._hass.callWS({ type: "todo/item/list", entity_id: ent }).then((r) => {
      this._skNt = { items: (r && r.items) || [], busy: false, sig, err: null };
      this._last = null;
      this._render();
    }, (e) => {
      this._skNt = { items: (S && S.items) || null, busy: false, sig, err: (e && e.message) || "no answer" };
      this._render();
    });
  },

  /* A title that says what the thing is, and a second line that says what is
     wrong with it — short enough never to be cut off. */
  _skNtTidy(p, key) {
    let t = p.summary, d = p.detail;
    const ver = /new (.+?) version is available:?\s*(\S+)/i.exec(d);
    if (ver) { t = `${ver[1]} ${ver[2]}`; d = "Update"; }
    else if (/^1 low batter/i.test(t) && d && d.indexOf(" · ") < 0) { t = d; d = "Battery low"; }
    else if (/^1 (.+)$/.test(t) && d && d.indexOf(" · ") < 0) { const w = /^1 (.+)$/.exec(t)[1]; t = d; d = w.charAt(0).toUpperCase() + w.slice(1); }
    else if (/ offline$/i.test(t)) { t = t.replace(/ offline$/i, ""); d = `Offline${/since (.+)$/.exec(d) ? ` since ${/since (.+)$/.exec(d)[1]}` : ""}`; }
    else if (/ overdue$/i.test(t)) { t = t.replace(/ overdue$/i, ""); d = "Overdue"; }
    const rule = (this._config.attention || []).find((r) => r && r.key === key && r.icon);
    const icon = (rule && rule.icon) || SK_NT_ICON[key] || (d === "Update" ? "mdi:package-up" : "mdi:bell-outline");
    return { t, d, icon };
  },

  _skNtAgo(ms) {
    if (!ms) return "";
    const m = (Date.now() - ms) / 6e4;
    return m < 1 ? "now" : m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
  },

  /* Rows, deduplicated: the same title, line and severity twice (two screens
     logging the same fault) is one row whose dismiss closes both. Update
     notices fold into one row, as the hosted card folded them. */
  _skNtRows(items, done) {
    const parse = (it) => {
      const p = PurdyNotificationsCard.prototype._parse(it);
      const k = /^\[([^\]]+)\]/.exec(it.description || "");
      return { ...p, key: k ? k[1] : "" };
    };
    const ps = items.map(parse).filter((p) => p.done === done).sort((a, b) => (b.at || 0) - (a.at || 0));
    const isUpd = (p) => !done && p.severity === "info" && /^(version update|plugins?)\b/i.test(p.summary);
    const upd = ps.filter(isUpd);
    const rows = [];
    const by = new Map();
    ps.filter((p) => !isUpd(p)).forEach((p) => {
      const x = this._skNtTidy(p, p.key);
      const k = `${x.t}|${x.d}|${p.severity}`;
      if (by.has(k)) { by.get(k).uids.push(p.uid); return; }
      const r = { ...x, sev: p.severity, at: p.at, uids: [p.uid] };
      by.set(k, r); rows.push(r);
    });
    if (upd.length) {
      const names = [...new Set(upd.map((p) => {
        const m = /new version of (.+?) is available/i.exec(p.detail) || /available for:?\s*(.+)$/i.exec(p.detail);
        return m ? m[1].trim() : null;
      }).filter(Boolean))];
      const one = upd.length === 1 && names.length === 1;
      const r = { t: one ? names[0] : `${upd.length} updates`, d: one ? "Update" : names.slice(0, 4).join(" · ") + (names.length > 4 ? ` · +${names.length - 4}` : ""),
        icon: "mdi:package-up", sev: "info", at: upd[0].at, uids: upd.map((p) => p.uid) };
      const i = rows.findIndex((x) => (x.at || 0) < (r.at || 0));
      rows.splice(i < 0 ? rows.length : i, 0, r);
    }
    return rows;
  },

  _skNtRow(r, done) {
    const x = done
      ? `<button class="sk-ntx" type="button" data-sknt="${psEsc(r.uids.join(","))}" data-skntst="needs_action" aria-label="Restore ${psEsc(r.t)}"><ha-icon icon="mdi:restore"></ha-icon></button>`
      : `<button class="sk-ntx" type="button" data-sknt="${psEsc(r.uids.join(","))}" data-skntst="completed" aria-label="Dismiss ${psEsc(r.t)}"><svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    return `<div class="sk-nt${done ? " done" : ""}"><span class="sk-ico" style="--c:${SK_NT_COL[r.sev] || SK_NT_COL.info}"><ha-icon icon="${psEsc(r.icon)}"></ha-icon></span>
        <span class="sk-ntt"><b>${psEsc(r.t)}</b>${r.d ? `<small>${psEsc(r.d)}</small>` : ""}</span>
        <span class="sk-ntage">${psEsc(this._skNtAgo(r.at))}</span>${x}</div>`;
  },

  _skNotesSheet() {
    if (!this._skNtEntity()) return "";
    this._skNtLoad();
    const S = this._skNt || {};
    const head = `<div class="ps-scrim" id="ps-scrim"></div>
      <div class="ps-sheet tall">
        <div class="ps-sheeth"><span class="ps-lbl">Notifications</span>${this._skSheetClose()}</div>`;
    if (!S.items) {
      return `${head}<div class="sk-lt"><div class="sk-ltc"><div class="sk-empty">${S.err ? `The log would not load — ${psEsc(S.err)}` : "Reading the log…"}</div></div></div></div>`;
    }
    const open = this._skNtRows(S.items, false);
    const done = this._skNtRows(S.items, true).slice(0, 30);
    const need = open.filter((r) => r.sev !== "info"), fyi = open.filter((r) => r.sev === "info");
    const cnt = (n) => `<span class="ps-chip">${n}</span>`;
    const uids = (rs) => rs.flatMap((r) => r.uids).join(",");
    const armBtn = (k, label, icon, list, pri) => `<button class="sk-bigbtn${pri ? " pri" : ""}${this._skArmed === k ? " armed" : ""}" type="button"
        data-skntall="${k}" data-uids="${psEsc(list)}"><ha-icon icon="${icon}"></ha-icon>${this._skArmed === k ? "Tap again" : label}</button>`;
    const cards = [];
    if (need.length) cards.push(`<div class="sk-ltc">${this._skShHead("mdi:alert-circle-outline", "Needs you", cnt(need.length), "var(--ps-warn)")}${need.map((r) => this._skNtRow(r)).join("")}</div>`);
    if (fyi.length) cards.push(`<div class="sk-ltc">${this._skShHead("mdi:information-outline", "FYI", cnt(fyi.length), "var(--sk-nas)")}${fyi.map((r) => this._skNtRow(r)).join("")}</div>`);
    if (!open.length) cards.push(`<div class="sk-ltc">${this._skShHead("mdi:bell-check-outline", "All clear", "", "var(--ps-good)")}</div>`);
    if (open.length) {
      cards.push(`<div class="sk-ltbtns">${need.length && fyi.length ? armBtn("nt:fyi", "Clear FYI", "mdi:check-all", uids(fyi)) : ""}${armBtn("nt:all", "Clear all", "mdi:check-all", uids(open), true)}</div>`);
    }
    if (done.length) {
      cards.push(`<div class="sk-ltc">${this._skShHead("mdi:history", "Dismissed", cnt(done.length), "var(--ps-dim)")}${done.map((r) => this._skNtRow(r, true)).join("")}
        <div class="sk-ltbtns">${armBtn("nt:hist", "Clear history", "mdi:delete-sweep-outline", "")}</div></div>`);
    }
    return `${head}<div class="sk-lt">${cards.join("")}</div></div>`;
  },

  /* Changes are shown at once on the local copy, then the list is re-read. */
  _skNtSet(list, status) {
    const ent = this._skNtEntity();
    if (!ent || !list.length) return;
    list.forEach((uid) => this._hass.callService("todo", "update_item", { entity_id: ent, item: uid, status }));
    const S = this._skNt;
    if (S && S.items) S.items = S.items.map((it) => (list.indexOf(it.uid) >= 0 ? { ...it, status } : it));
    this._render();
    setTimeout(() => this._skNtLoad(true), 700);
  },

  _skSheetsBind() {
    this._each("[data-sknt]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      pcHaptic("light");
      this._skNtSet(el.dataset.sknt.split(",").filter(Boolean), el.dataset.skntst);
    }));
    /* Two-tap arm: clearing a list cannot be taken back. Lapses after 5s. */
    this._each("[data-skntall]", (el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      const k = el.dataset.skntall;
      if (this._skArmed !== k) {
        this._skArmed = k;
        clearTimeout(this._skArmT);
        this._skArmT = setTimeout(() => { this._skArmed = null; this._render(); }, 5000);
        this._render();
        return;
      }
      clearTimeout(this._skArmT); this._skArmed = null;
      pcHaptic("medium");
      if (k === "nt:hist") {
        const ent = this._skNtEntity();
        if (ent) this._hass.callService("todo", "remove_completed_items", { entity_id: ent });
        const S = this._skNt;
        if (S && S.items) S.items = S.items.filter((it) => it.status !== "completed");
        this._render();
        setTimeout(() => this._skNtLoad(true), 700);
        return;
      }
      this._skNtSet(el.dataset.uids.split(",").filter(Boolean), "completed");
    }));
  },
});

const SK_SHEETS_STYLES = `
      .sk-tg { display: flex; align-items: center; height: 30px; color: var(--ps-dim); --mdc-icon-size: 26px; }
      .sk-ltank.low i { background: var(--ps-bad); }
      .sk-pphero { display: flex; align-items: center; gap: 18px; }
      .sk-ppface { position: relative; flex: none; width: 112px; height: 112px; padding: 0; border: 0; border-radius: 50%; background: none; cursor: pointer; }
      .sk-ppface .ps-pvr { position: absolute; inset: 0; }
      .sk-ppface img, .sk-ppface .ps-pvi { position: absolute; inset: 15px; width: 82px; height: 82px; border-radius: 50%; object-fit: cover; display: grid; place-items: center; font-size: var(--pc-fs-2xl); background: var(--sk-card2); }
      .sk-ppface.away img { filter: grayscale(.35); }
      .sk-ppface:focus-visible { outline: 2px solid var(--ps-aur-b, #8B7CFF); outline-offset: 2px; }
      .sk-ppnum { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
      .sk-pwk { position: relative; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; align-items: end; height: 86px; }
      .sk-pwk .sk-ltbar { cursor: default; }
      .sk-pavg { position: absolute; left: 0; right: 0; border-top: 2px dashed var(--ps-warn); opacity: .8; pointer-events: none; }
      .sk-wxwet { display: inline-flex; align-items: center; gap: 4px; }
      .sk-wxwet ha-icon { --mdc-icon-size: 14px; }
      .sk-ltchart.sk-wxh .area { fill: var(--ps-cool); opacity: .14; stroke: none; }
      .sk-ltchart.sk-wxh .ln { fill: none; stroke: var(--ps-heat); stroke-width: 2.5; stroke-linejoin: round; }
      .sk-ltchart.sk-wxh .rn { fill: var(--ps-cool); opacity: .55; }
      .sk-ltchart.sk-wxh .dot { fill: var(--ps-heat); stroke: none; }
      .sk-ltchart.sk-wxh .ext { fill: var(--ps-text); font-weight: 700; font-size: var(--pc-fs-xs); }
      .sk-nt { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 4px 0; }
      .sk-ntt { display: flex; flex-direction: column; min-width: 0; }
      .sk-ntt b { font-size: var(--pc-fs-md); font-weight: 650; overflow-wrap: anywhere; }
      .sk-ntt small { font-size: var(--pc-fs-sm); color: var(--ps-dim); overflow-wrap: anywhere; }
      .sk-nt.done .sk-ntt b { color: var(--ps-dim); font-weight: 550; }
      .sk-nt.done .sk-ico { opacity: .5; }
      .sk-ntage { font-size: var(--pc-fs-sm); font-weight: 650; color: var(--ps-dim); white-space: nowrap; font-variant-numeric: tabular-nums; }
      .sk-ntx { position: relative; width: 28px; height: 28px; border-radius: 50%; border: 0; padding: 0; display: grid; place-items: center; background: var(--ps-track); color: var(--ps-dim); cursor: pointer; --mdc-icon-size: 16px; }
      .sk-ntx::after { content: ""; position: absolute; inset: -11px -4px; }
      .sk-ntx .ps-ico { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2.2; fill: none; }
`;
