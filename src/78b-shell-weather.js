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
