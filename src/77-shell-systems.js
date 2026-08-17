/* ============================================================================
 * purdy-shell-card — systems mode
 *
 * The Systems section was doing the job of a whole app inside one band on the
 * landing page. This is that app: five pages behind their own dock, with Home
 * on the far left.
 *
 * A MODE, not a view. Lovelace would happily hold a second view, but leaving
 * this one and coming back re-runs the landing page's whole first-render path,
 * and hash-driven Bubble pop-ups leak across views. A mode is a state flip on
 * the element that is already mounted: same gradient, same dock measurement,
 * same sheet slot, and the back button is ours.
 *
 * A mode, not a section, for a second reason: `sections:` is rendered in config
 * order into one scrolling column, and these pages are alternatives to each
 * other rather than neighbours.
 *
 * THE LISTS ARE DISCOVERED, NOT CONFIGURED. Containers, disks and shares come
 * out of `hass.states` by prefix. The hand-typed version of this had five
 * Docker groups naming eleven containers, and THREE of those entity ids did
 * not exist (`switch.homeserver_container_lancache`, `_lancache_dns`,
 * `_lancache_prefill`) — they had rendered as permanently-off toggles that did
 * nothing, for however long. A list that is derived cannot drift from the
 * server; a list that is typed always eventually has.
 * ========================================================================== */

/* Discovery scans every entity id, so it must not run on each state change —
   see _expandWatched, which runs it on first hass and on entering the mode. */
function psDiscover(hass, re) {
  if (!hass || !hass.states) return [];
  const out = [];
  Object.keys(hass.states).forEach((id) => {
    const m = re.exec(id);
    if (m) out.push({ id, key: m[1] });
  });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/* "2026-03-01T15:17:52+00:00" → "1 Mar". A parity check is months apart, so
   the year is noise and the time of day is not the fact being reported. */
function psShortDate(v) {
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
}

/* Every disk publishes its temperature as an ATTRIBUTE on its health sensor
   ("37.0 °C"), and only one of them also has a dedicated temperature entity —
   which HA has unit-converted to °F. Reading only the entity gave one disk a
   temperature and the rest none; reading only the attribute puts °C in a card
   where every other temperature is °F. So: parse both, and convert to whatever
   unit the dedicated sensors use, so the column is one unit or no unit. */
function psTempAttr(st) {
  const raw = st && st.attributes && st.attributes.temperature;
  if (!raw) return null;
  const m = /(-?[\d.]+)\s*°?\s*([CF])/i.exec(String(raw));
  if (!m) return null;
  return { v: parseFloat(m[1]), u: m[2].toUpperCase() };
}

function psConvTemp(t, to) {
  if (!t || !to || t.u === to) return t ? t.v : null;
  return to === "F" ? t.v * 9 / 5 + 32 : (t.v - 32) * 5 / 9;
}

/* Bytes-ish text straight off the integration ("7.3 TB") is already formatted,
   so this only exists for the numbers we compute ourselves. */
function psPct(v) {
  return v == null ? "—" : v.toFixed(1) + "%";
}

/* A sensor that is not reporting and a sensor reporting zero are different
   facts, and `pcNum(...) ?? 0` is the shape that hides it — the same mistake
   the sleep ring made. Every figure on these pages goes through one of these
   two rather than defaulting. */
function psFig(v, digits, unit) {
  if (v == null) return "\u2014";
  return `${v.toFixed(digits)}${unit ? `<small>${unit}</small>` : ""}`;
}

function psCount(v) {
  return v == null ? "\u2014" : String(v);
}

Object.assign(PurdyShellCard.prototype, {

  _sysCfg() {
    return this._config && this._config.server ? this._config.server : null;
  },

  /* A page whose config is absent is not drawn and gets no dock slot, so a
     partial `server:` block degrades to fewer pages rather than to empty ones. */
  _sysPages() {
    const s = this._sysCfg();
    if (!s) return [];
    const out = [{ key: "overview", name: "Overview", icon: "mdi:view-dashboard-outline" }];
    if (s.docker) out.push({ key: "docker", name: "Docker", icon: "mdi:docker" });
    if (s.storage) out.push({ key: "storage", name: "Storage", icon: "mdi:harddisk" });
    if (s.perf) out.push({ key: "perf", name: "Perf", icon: "mdi:speedometer" });
    if (s.notifications) out.push({ key: "alerts", name: "Alerts", icon: "mdi:bell-outline" });
    return out;
  },

  _sysPage() {
    const pages = this._sysPages();
    if (!pages.length) return null;
    return pages.find((p) => p.key === this._page) || pages[0];
  },

  /* ---------------------------------------------------------------- read --*/

  /* What a knob should READ as, which is not what HA says yet: starting a
     container takes seconds, and a toggle that stays put for three of them
     reads as a tap that missed. Same contract as _optGoal — the optimistic
     value yields the moment the real state agrees and expires after 12s, so a
     call that never lands shows the truth rather than a lie that looks fine. */
  _optSw(id, real) {
    const o = (this._swOpt || {})[id];
    if (!o) return real;
    if (Date.now() > o.until || o.value === real) {
      delete this._swOpt[id];
      return real;
    }
    return o.value;
  },

  _syToggle(id) {
    const real = pcState(this._hass, id);
    const next = real === "on" ? "off" : "on";
    if (!this._swOpt) this._swOpt = {};
    this._swOpt[id] = { value: next, until: Date.now() + 12000 };
    this._hass.callService("switch", next === "on" ? "turn_on" : "turn_off", { entity_id: id });
    this._render();
  },

  _syContainers() {
    const s = this._sysCfg();
    const d = (s && s.docker) || {};
    const pre = d.containers_prefix || `switch.${s.prefix || "server"}_container_`;
    const names = d.names || {};
    return psDiscover(this._hass, new RegExp(`^${pre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(.+)$`))
      .map((c) => {
        const st = this._hass.states[c.id];
        const over = names[c.key] || {};
        /* The friendly name is "HomeServer Container binhex-jellyfin" — the last
           segment is the container's real name, which is what to show. */
        const fn = (st && st.attributes.friendly_name) || c.key;
        const auto = fn.indexOf(" Container ") > 0 ? fn.split(" Container ").pop() : c.key;
        const ports = (st && st.attributes.container_ports) || [];
        const port = ports.length && ports[0].public_port ? ":" + ports[0].public_port : "";
        return {
          id: c.id,
          key: c.key,
          name: over.name || auto,
          icon: over.icon || "mdi:cube-outline",
          /* The switch already carries where the thing lives. Typing the URL
             into config is how it goes stale when a port changes. */
          url: over.url || (st && st.attributes.dashboard_url) || "",
          image: (st && st.attributes.container_image) || "",
          port,
          on: this._optSw(c.id, pcState(this._hass, c.id)) === "on",
          /* The agent publishes a restart button per container, keyed the same
             way the switch is — so it costs nothing to offer and saves a
             stop-wait-start round trip on a wedged container. */
          restart: this._hass.states[`${d.restart_prefix || ""}${c.key}`] && d.restart_prefix
            ? `${d.restart_prefix}${c.key}` : "",
        };
      });
  },

  _syVms() {
    const d = ((this._sysCfg() || {}).docker) || {};
    return (d.vms || []).map((id) => {
      const st = this._hass.states[id];
      const fn = (st && st.attributes.friendly_name) || id;
      return {
        id,
        name: fn.indexOf(" VM ") > 0 ? fn.split(" VM ").pop() : fn,
        on: this._optSw(id, pcState(this._hass, id)) === "on",
      };
    });
  },

  _syDisks() {
    const s = this._sysCfg();
    const st = (s && s.storage) || {};
    const pre = st.disks_prefix || `sensor.${s.prefix || "server"}_disk_`;
    const esc = pre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const h = this._hass;
    /* Health is the anchor rather than usage: a slot with no disk in it
       publishes a health of DISK_NP_DSBL and no usage at all, and it has to be
       drawn as absent rather than silently dropped or shown as 0%. */
    return psDiscover(h, new RegExp(`^${esc}(.+)_health$`)).map((d) => {
      const usage = h.states[`${pre}${d.key}_usage`];
      const temp = h.states[`${pre}${d.key}_temperature`];
      const health = pcState(h, d.id);
      const u = usage ? parseFloat(usage.state) : null;
      return {
        key: d.key,
        health,
        healthId: d.id,
        usageId: `${pre}${d.key}_usage`,
        /* Three different states, and only one of them is "fine".
           DISK_NP_DSBL is "no disk present" — an empty bar would claim a
           healthy empty drive, and there is no drive. But a PARITY disk is
           installed and publishes no usage sensor at all, so "no usage" is
           not the same as "no disk": folding them made the working parity
           drive read as an empty slot. */
        present: health !== "DISK_NP_DSBL",
        hasUsage: !!usage,
        usage: Number.isFinite(u) ? u : null,
        used: usage ? usage.attributes.used_size : null,
        total: usage ? usage.attributes.total_size : null,
        role: usage ? usage.attributes.role : null,
        /* The dedicated entity where there is one (HA has converted it to the
           user's unit); the health sensor's own attribute otherwise. */
        temp: temp ? parseFloat(temp.state) : null,
        tempUnit: temp ? String(temp.attributes.unit_of_measurement || "").replace("°", "") : null,
        tempAttr: psTempAttr(h.states[d.id]),
      };
    });
  },

  _syShares() {
    const s = this._sysCfg();
    const st = (s && s.storage) || {};
    const pre = st.shares_prefix;
    if (!pre) return [];
    const esc = pre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const h = this._hass;
    return psDiscover(h, new RegExp(`^${esc}(.+)_usage$`))
      /* The entity id has been slugified ("appdatabackups", "mslady_drive");
         the integration keeps the real name in an attribute. */
      .map((x) => ({
        id: x.id,
        name: (h.states[x.id] && h.states[x.id].attributes.share_name) || x.key.replace(/_/g, " "),
        v: pcNum(h, x.id),
      }))
      .filter((x) => x.v != null)
      .sort((a, b) => b.v - a.v);
  },

  /* Everything the mode reads that config does not name. Called on first hass
     and again on entering the mode — never per state change, because it walks
     every entity id in the instance. The 30s clock repaint is the backstop for
     a container that appears while the page is open. */
  _expandWatched() {
    if (!this._hass || !this._config) return;
    const s = this._sysCfg();
    if (!s) return;
    const ids = [];
    const add = (x) => { if (x) ids.push(x); };
    this._syContainers().forEach((c) => add(c.id));
    ((s.docker || {}).vms || []).forEach(add);
    this._syDisks().forEach((d) => { add(d.healthId); });
    /* Shares are twelve slow-moving percentages behind an expand; the clock is
       a good enough refresh for them and watching them would repaint the whole
       shell every time one ticks. */
    [s.status, s.uptime, s.version, s.registration, s.registration_type,
      s.plugins, s.plugin_updates, s.update_available].forEach(add);
    (s.faults || []).forEach((f) => add(f.entity));
    (s.meters || []).forEach((m) => add(m.entity));
    (s.stats || []).forEach((m) => add(m.entity));
    const p = s.parity || {};
    [p.problem, p.last_check, p.next_check, p.progress, p.running].forEach(add);
    const d = s.docker || {};
    [d.cpu, d.memory, d.vdisk, d.conflicts, d.running].forEach(add);
    const st = s.storage || {};
    [st.array, st.text, st.flash].forEach(add);
    (st.pools || []).forEach((x) => add(x.entity));
    const pf = s.perf || {};
    [pf.cpu, pf.ram, pf.gpu_util, pf.gpu_temp, pf.gpu_power, pf.board_temp, pf.governor].forEach(add);
    (pf.fans || []).forEach(add);
    (pf.network || []).forEach((n) => { add(n.rx); add(n.tx); });
    const pw = pf.power || {};
    [pw.watts, pw.voltage, pw.daily, pw.monthly, pw.cost].forEach(add);
    const n = s.notifications || {};
    [n.total, n.alert, n.warning, n.info, n.event].forEach(add);

    const base = this._collectWatched();
    const seen = new Set(base);
    ids.forEach((x) => { if (x && !seen.has(x)) { seen.add(x); base.push(x); } });
    this._watched = base;
    /* The signature just changed shape, so the next hass must not be compared
       against a signature built from the old list. */
    this._last = null;
  },

  /* -------------------------------------------------------------- render --*/

  _renderSystems(faults) {
    const s = this._sysCfg();
    const page = this._sysPage();
    if (!s || !page) { this._mode = null; return this._render(); }

    this._patch("ps-stat", `
        <div>
          <div class="ps-lbl">${psEsc(s.name || "Server")}</div>
          <h2 class="ps-syh">${psEsc(page.name)}</h2>
        </div>
        <div class="ps-rt">${this._syStatusChip(page)}</div>`);

    const html = {
      overview: () => this._syOverview(s),
      docker: () => this._syDocker(s),
      storage: () => this._syStorage(s),
      perf: () => this._syPerf(s),
      alerts: () => this._syAlerts(s),
    }[page.key]();

    /* One keyed node per page, through the same reconciler the column uses —
       so switching pages swaps the node rather than rewriting a shared one,
       and an unchanged page is left entirely alone between state changes. */
    this._patchSections([{ key: "sys-" + page.key, html, open: false, cls: "ps-sypage" }]);

    this._patch("ps-sheetslot", this._sheetHtml(faults));
    this._mountSheetCard();

    const pages = this._sysPages();
    const dock = `<button class="ps-db home" type="button" data-sysdock="__home">
        <ha-icon icon="mdi:home-variant"></ha-icon><span>Home</span></button>` +
      pages.map((p) => {
        /* The Alerts slot carries the same badge it carries on the home dock —
           it is the one entry that means the same thing in both. */
        const alert = p.key === "alerts" && pcNum(this._hass, (s.notifications || {}).alert) > 0;
        return `<button class="ps-db ${p.key === page.key ? "on" : ""} ${alert ? "alert" : ""}"
            type="button" data-sysdock="${psEsc(p.key)}">
            <ha-icon icon="${psEsc(p.icon)}"></ha-icon><span>${psEsc(p.name)}</span></button>`;
      }).join("");

    this._patch("ps-dockwrap", `${this._miniHtml()}<div class="ps-dock">${dock}</div>`);

    this._bind();
    this._bindScrub();
    this._bindSystems();
    this._reserve();
  },

  _syStatusChip(page) {
    const s = this._sysCfg();
    const h = this._hass;
    if (pcOffline(h)) return `<span class="ps-chip bad"><span class="ps-dot"></span>Reconnecting…</span>`;
    if (page.key === "docker") {
      const run = pcState(h, (s.docker || {}).running);
      return run && run !== "unknown"
        ? `<span class="ps-chip"><span class="ps-dot"></span>${psEsc(run)}</span>` : "";
    }
    if (page.key === "storage") {
      const v = pcNum(h, (s.storage || {}).array);
      if (v == null) return "";
      return `<span class="ps-chip ${v >= 95 ? "bad" : v >= 80 ? "warn" : "good"}">
        <span class="ps-dot"></span>${psPct(v)}</span>`;
    }
    if (page.key === "perf") {
      const w = pcNum(h, ((s.perf || {}).power || {}).watts);
      return w == null ? "" : `<span class="ps-chip">${Math.round(w)} W</span>`;
    }
    if (page.key === "alerts") {
      const n = pcNum(h, (s.notifications || {}).total);
      return n == null ? "" : `<span class="ps-chip ${n ? "bad" : "good"}"><span class="ps-dot"></span>${n}</span>`;
    }
    /* Overview: the connection itself. `unavailable` and `offline` are
       different facts — the first means HA lost the integration, the second
       means the integration says the box is down. */
    const r = pcReading(h, s.status);
    if (!r.ok) return `<span class="ps-chip warn"><span class="ps-dot"></span>No data</span>`;
    const raw = String(r.st.state);
    const online = raw.toLowerCase() === "online";
    return `<span class="ps-chip ${online ? "good" : "bad"}"><span class="ps-dot"></span>${
      psEsc(raw.charAt(0).toUpperCase() + raw.slice(1))}</span>`;
  },

  /* A meter that says what it is above a full-width bar. The 54px inline bar
     the Systems section uses is right for a row in a list of other things and
     wrong for a page whose subject IS the fill. */
  /* "84.1%" of what? Nearly every one of these sensors carries the answer in
     its attributes, so the sub-line is derived rather than typed — a figure
     written into config is one that goes stale silently. */
  _sySizes(entity) {
    const st = this._hass.states[entity];
    const a = st ? st.attributes : {};
    if (a.used_size && a.total_size) return `${a.used_size} of ${a.total_size}`;
    if (a.ram_used && a.ram_total) return `${a.ram_used} of ${a.ram_total}`;
    /* A pool that publishes a SIZE but no usage is present and not reporting —
       which is a different fact from an empty one, and the parity block three
       rows above already draws that distinction. cache2 reads 0.0% with
       total_size 465.8 GB and used_size null: as an unqualified "0.0%" that is
       a claim the pool is empty, made from an absence. Zero versus missing,
       one more time. */
    if (a.total_size && !a.used_size) return `of ${a.total_size} · no usage reported`;
    return "";
  },

  _syMeter(label, entity, opts) {
    const o = opts || {};
    const v = pcNum(this._hass, entity);
    const warn = o.warn == null ? 80 : o.warn;
    const crit = o.crit == null ? 95 : o.crit;
    const cls = v == null ? "" : v >= crit ? "bad" : v >= warn ? "warn" : "good";
    const p = v == null ? 0 : Math.max(0, Math.min(100, v));
    const sub = o.sub || this._sySizes(entity);
    /* A percentage derived from a usage figure that does not exist is not a
       measurement. Say so rather than printing a confident 0.0%. */
    const st = this._hass.states[entity];
    const noUse = !!(st && st.attributes.total_size && !st.attributes.used_size);
    return `<div class="ps-syb" data-info="${psEsc(entity || "")}">
        <span class="ps-sybk">${psEsc(label)}${sub ? ` <i>${psEsc(sub)}</i>` : ""}</span>
        <span class="ps-sybv ${noUse ? "" : cls}">${noUse ? "—" : psPct(v)}</span>
        <span class="ps-sybar"><i class="${cls}" style="width:${noUse ? 0 : p.toFixed(1)}%"></i></span>
      </div>`;
  },

  _syCell(label, value, cls, entity) {
    return `<div class="ps-vit"${entity ? ` data-info="${psEsc(entity)}"` : ""}>
        <span class="ps-vk">${psEsc(label)}</span>
        <span class="ps-vv ${cls || ""}">${value}</span></div>`;
  },

  /* ------------------------------------------------------------ overview --*/

  _syOverview(s) {
    const h = this._hass;
    const up = pcState(h, s.uptime);
    const ver = pcState(h, s.version);
    const plugins = pcState(h, s.plugins);
    const updates = pcNum(h, s.plugin_updates);
    /* There is no update ACTION anywhere in this integration — no update.*
       entity, no service — so an "Update" button would be a button that
       cannot update anything. What exists is the knowledge that one is
       waiting, so the row becomes a link to the page that does it. */
    const osUpd = pcState(h, s.update_available) === "on";
    const reg = pcState(h, s.registration);
    const regType = pcState(h, s.registration_type);
    /* An alert a human action clears is fine; one no action clears is noise.
     *
     * `sensor.homeserver_registration_state` reads `expired` on this Plus key and
     * always will — what has lapsed is the free-update window, not the licence,
     * and the server is working exactly as bought. So it drew a permanent amber
     * dot on Overview for a condition with nothing to do about it, which is the
     * same mistake as the disk1-at-92% rule that lit the dock bell forever.
     *
     * It is not deleted: the state is still a fact about the server, so it
     * takes a plain row beside Uptime and Version. `registration_alert: true`
     * puts the warn row back for an install where an expiry IS actionable. */
    const regBad = !!s.registration_alert && reg
      && ["expired", "invalid", "eguard"].indexOf(String(reg).toLowerCase()) >= 0;

    /* Shared with the attention chip and the desk — this used to be a third
       copy of the predicate that knew about `above` and not `below`. */
    const faults = this._serverFaults();

    const idBlock = `<div class="ps-sycard">
        <div class="ps-syid">
          ${up ? `<div data-info="${psEsc(s.uptime)}"><span class="ps-syk">Uptime</span><b>${psEsc(up)}</b></div>` : ""}
          ${ver ? `<div${osUpd ? ` data-syurl="${psEsc(s.update_url || s.url || "")}"` : ` data-info="${psEsc(s.version)}"`}>
            <span class="ps-syk">Version</span><b>${psEsc(ver)}${
              osUpd ? ` <em>·update ↗</em>` : ""}</b></div>` : ""}
          ${plugins ? `<div${updates ? ` data-syurl="${psEsc(s.plugins_url || s.url || "")}"` : ` data-info="${psEsc(s.plugins)}"`}>
            <span class="ps-syk">Plugins</span><b>${psEsc(plugins)}${
            updates ? ` <em>·${updates} update${updates > 1 ? "s" : ""} ↗</em>` : ""}</b></div>` : ""}
          ${/* The licence as a FACT. Drawn only when it is not already being
                shouted about below, or the same string would appear twice. */""}
          ${reg && !regBad ? `<div data-info="${psEsc(s.registration)}">
            <span class="ps-syk">Licence</span><b>${psEsc(regType || reg)}</b></div>` : ""}
        </div>
        ${regBad ? `<div class="ps-syreg" data-info="${psEsc(s.registration)}">
          <span class="ps-dotc warn"></span>Registration <b>${psEsc(reg)}</b>${
            regType ? ` — ${psEsc(regType)} key` : ""}</div>` : ""}
      </div>`;

    const faultBlock = faults.length ? `<div class="ps-sycard">
        <span class="ps-lbl">Needs attention</span>
        <div class="ps-faults">${faults.map((f) => `<div class="ps-fault" data-info="${psEsc(f.entity)}">
          <span class="ps-dotc ${f.severity === "warn" ? "warn" : "bad"}"></span>
          <span class="ps-grow"><b>${psEsc(f.label)}</b> ${psEsc(f.detail || "")}</span></div>`).join("")}</div>
      </div>` : "";

    const meters = (s.meters || []).map((m) =>
      this._syMeter(m.label, m.entity, { warn: m.warn_above, crit: m.critical_above, sub: m.sub })).join("");

    const cells = (s.stats || []).map((x) => {
      const v = pcNum(h, x.entity);
      const raw = pcState(h, x.entity);
      /* CPU at 10.7% rounded to 11% throws away the only interesting digit;
         a fan at 85% does not need one. `digits` per stat, default none. */
      const txt = v == null
        ? psEsc(raw || "\u2014")
        : psFig(v, x.digits == null ? 0 : x.digits, x.unit);
      return this._syCell(x.label, txt, "", x.entity);
    }).join("");

    return `${idBlock}${faultBlock}
      ${meters ? `<div class="ps-sycard">${meters}</div>` : ""}
      ${cells ? `<div class="ps-vits">${cells}</div>` : ""}
      ${this._syParity(s)}
      ${this._syPower(s)}`;
  },

  _syParity(s) {
    const p = s.parity;
    if (!p) return "";
    const h = this._hass;
    /* `binary_sensor.*_parity_valid` carries device_class: problem, so ON is
       INVALID — the name reads the other way round and has caught people out.
       Config names it `problem` for exactly that reason. */
    const r = pcReading(h, p.problem);
    const bad = r.ok && r.st.state === "on";
    const running = pcState(h, p.running) === "on";
    const prog = pcNum(h, p.progress);
    const last = psShortDate(pcState(h, p.last_check));
    const next = psShortDate(pcState(h, p.next_check));

    const buttons = running
      ? [{ name: "Pause", entity: p.pause }, { name: "Stop", entity: p.stop, danger: true }]
      : [{ name: "Start check", entity: p.start }];

    return `<div class="ps-sycard">
        <div class="ps-syrow">
          <span class="ps-lbl">Parity</span>
          ${!r.ok
            ? `<span class="ps-chip warn"><span class="ps-dot"></span>No data</span>`
            : `<span class="ps-chip ${bad ? "bad" : "good"}"><span class="ps-dot"></span>${bad ? "Invalid" : "Valid"}</span>`}
        </div>
        ${running ? `<div class="ps-syb">
            <span class="ps-sybk">Check running</span>
            <span class="ps-sybv">${psPct(prog)}</span>
            <span class="ps-sybar"><i class="good" style="width:${(prog || 0).toFixed(1)}%"></i></span>
          </div>` : `<div class="ps-syrow ps-sysub">
            <span>Last <b>${last || "—"}</b></span><span>Next <b>${next || "—"}</b></span>
          </div>`}
        <div class="ps-btns">
          ${buttons.filter((b) => b.entity).map((b) =>
            `<button class="ps-btn ${b.danger ? "danger" : ""}" type="button"
              data-sybtn="${psEsc(b.entity)}">${psEsc(b.name)}</button>`).join("")}
          ${s.url ? `<button class="ps-btn" type="button" data-syurl="${psEsc(s.url)}">Unraid web UI ↗</button>` : ""}
        </div>
      </div>`;
  },

  /* Reboot and shut down are one tap from a scroll unless something stops
     them, so they take the same two-tap arm the schedule delete and the hold
     cancel already use — and they sit at the bottom, below everything worth
     reading, rather than beside the parity buttons. */
  _syPower(s) {
    const list = (s.power || []).filter((b) => b.entity);
    if (!list.length) return "";
    return `<div class="ps-sycard">
        <span class="ps-lbl">Power</span>
        <div class="ps-btns">${list.map((b) => {
          const k = "sy:" + b.entity;
          const armed = this._armed === k;
          return `<button class="ps-btn danger ${armed ? "armed" : ""}" type="button" data-arm="${psEsc(k)}">
            ${armed ? "Tap again" : psEsc(b.name)}</button>`;
        }).join("")}</div>
      </div>`;
  },

  _syArmedAction(entity) {
    const dom = String(entity).split(".")[0];
    this._hass.callService(dom === "switch" ? "switch" : "button",
      dom === "switch" ? "toggle" : "press", { entity_id: entity });
    this._render();
  },

  /* -------------------------------------------------------------- docker --*/

  _syDocker(s) {
    const h = this._hass;
    const d = s.docker || {};
    const all = this._syContainers();
    const vms = this._syVms();
    const q = (this._syq || "").trim().toLowerCase();
    const filter = this._syfilter || "all";

    const matched = all.filter((c) => !q || c.name.toLowerCase().indexOf(q) >= 0
      || c.image.toLowerCase().indexOf(q) >= 0);
    /* Discovery sorts by entity id, which is neither the displayed name nor
       anything the eye can use: "Agent Zero, Avidemux, Jellyfin, Crafty" is
       what `binhex_jellyfin` sorting between `avidemux` and `crafty_4` looks
       like. Running first — that is the question the page answers — then by
       what the row actually says. */
    matched.sort((a, b) => (b.on - a.on) || a.name.localeCompare(b.name));
    const shown = filter === "running" ? matched.filter((c) => c.on)
      : filter === "stopped" ? matched.filter((c) => !c.on)
        : filter === "vms" ? [] : matched;
    const onCount = all.filter((c) => c.on).length;

    const mem = pcNum(h, d.memory);
    const cells = [
      this._syCell("CPU", psFig(pcNum(h, d.cpu), 1, "%"), "", d.cpu),
      /* The sensor is megabytes; five significant digits of megabyte is not a
         number anyone reads. */
      this._syCell("Memory", mem == null ? "—" : `${(mem / 1024).toFixed(1)}<small>GB</small>`, "", d.memory),
      this._syCell("vDisk", psFig(pcNum(h, d.vdisk), 1, "%"), "", d.vdisk),
    ].join("");

    const chips = [
      ["all", `All ${all.length}`], ["running", `Running ${onCount}`],
      ["stopped", `Stopped ${all.length - onCount}`],
    ].concat(vms.length ? [["vms", `VMs ${vms.length}`]] : []);

    const rows = (filter === "vms" ? vms : shown).map((c) => `<div class="ps-sw ${c.on ? "" : "off"}">
        <ha-icon icon="${psEsc(c.icon || "mdi:desktop-tower")}"></ha-icon>
        <span class="ps-grow" data-info="${psEsc(c.id)}">
          <span class="ps-trunc">${psEsc(c.name)}</span>
          ${c.image || c.port ? `<span class="ps-symeta ps-trunc">${psEsc(c.image)}${
            c.image && c.port ? " · " : ""}${psEsc(c.port)}</span>` : ""}
        </span>
        ${c.on && c.restart ? `<button class="ps-link" type="button" data-sybtn="${psEsc(c.restart)}"
          aria-label="Restart ${psEsc(c.name)}">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/></svg>
        </button>` : ""}
        ${c.url ? `<button class="ps-link" type="button" data-syurl="${psEsc(c.url)}" aria-label="Open ${psEsc(c.name)}">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
        </button>` : ""}
        <button class="ps-knob ${c.on ? "on" : ""}" type="button" data-sysw="${psEsc(c.id)}"
          role="switch" aria-checked="${c.on}" aria-label="${psEsc(c.name)}"><i></i></button>
      </div>`).join("");

    /* An empty list after a search is a different fact from an empty server,
       and both are different from "the integration published nothing". */
    const empty = !all.length
      ? `<div class="ps-nohist">No containers found. Check the <code>containers_prefix</code>.</div>`
      : !rows
        ? `<div class="ps-nohist">Nothing matches ${q ? `“${psEsc(q)}”` : "this filter"}.</div>`
        : "";

    const conflicts = pcNum(h, d.conflicts);

    return `<div class="ps-vits">${cells}</div>
      <div class="ps-sbox">
        <svg viewBox="0 0 24 24" class="ps-ico"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/></svg>
        <input id="ps-syq" type="search" placeholder="Search containers" value="${psEsc(this._syq || "")}"
          autocomplete="off" aria-label="Search containers" />
        ${this._syq ? `<button class="ps-sclear" type="button" id="ps-syclear" aria-label="Clear">
          <svg viewBox="0 0 24 24" class="ps-ico"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ""}
      </div>
      <div class="ps-filters">${chips.map(([k, label]) =>
        `<button class="ps-fc ${filter === k ? "on" : ""}" type="button" data-syfilter="${k}">${psEsc(label)}</button>`).join("")}</div>
      <div class="ps-sycard">${rows || empty}</div>
      <div class="ps-syrow ps-sysub">
        <span data-info="${psEsc(d.conflicts || "")}">Port conflicts
          <b class="${conflicts ? "ps-warnc" : "ps-good"}">${conflicts == null ? "—" : conflicts ? conflicts : "none"}</b></span>
        ${vms.length && filter !== "vms" ? `<span>VMs <b>${vms.filter((v) => v.on).length} of ${vms.length} on</b></span>` : ""}
      </div>`;
  },

  /* ------------------------------------------------------------- storage --*/

  _syStorage(s) {
    const h = this._hass;
    const st = s.storage || {};
    const arr = h.states[st.array];
    const a = arr ? arr.attributes : {};
    const pct = pcNum(h, st.array);
    const text = pcState(h, st.text);
    const disks = this._syDisks();
    /* One unit for the whole column, taken from whichever disks have a real
       temperature entity. With none, the raw attribute unit stands. */
    const tUnit = (disks.find((d) => d.tempUnit) || {}).tempUnit
      || ((disks.find((d) => d.tempAttr) || {}).tempAttr || {}).u || null;
    disks.forEach((d) => {
      d.tempShow = d.temp != null ? d.temp : psConvTemp(d.tempAttr, tUnit);
    });
    const shares = this._syShares();
    const showShares = !!this._syShares_open;

    const head = `<div class="ps-sycard">
        <div class="ps-sytot">
          ${text && text.indexOf(" / ") > 0 ? `<div class="ps-sybig" data-info="${psEsc(st.text)}">${psEsc(text.split(" / ")[0])}
            <small>of ${psEsc(text.split(" / ")[1])}</small></div>`
          : `<div class="ps-sybig">${psPct(pct)}</div>`}
          <div class="ps-sysub">${a.free_space ? `${psEsc(a.free_space)} free` : ""}${
            a.num_data_disks ? ` · ${a.num_data_disks} data + ${a.num_parity_disks} parity` : ""}${
            a.array_state && a.array_state !== "STARTED" ? ` · ${psEsc(a.array_state)}` : ""}</div>
        </div>
        <span class="ps-sybar tall"><i class="${pct >= 95 ? "bad" : pct >= 80 ? "warn" : "good"}"
          style="width:${(pct || 0).toFixed(1)}%"></i></span>
      </div>`;

    /* The disk prefix also matches the pools (cache, cache2, vm), which are
       listed explicitly under `pools:` with labels of their own — so the array
       block takes only what the integration calls a data disk, plus parity. */
    const data = disks.filter((d) => d.role === "data");
    const parity = disks.filter((d) => d.key.indexOf("parity") === 0);

    const diskRow = (d) => {
      if (!d.present) {
        /* Absent, not empty. A 0% bar here would read as a healthy blank disk. */
        return `<div class="ps-sw off" data-info="${psEsc(d.healthId)}">
            <ha-icon icon="mdi:harddisk-remove"></ha-icon>
            <span class="ps-grow"><span class="ps-trunc">${psEsc(d.key)}</span>
            <span class="ps-symeta">not installed</span></span>
            <span class="ps-chip">—</span></div>`;
      }
      const ok = d.health === "PASSED";
      if (!d.hasUsage) {
        /* Parity: installed, healthy, and it has no usage to draw. A bar here
           would have to invent a number. */
        return `<div class="ps-sw" data-info="${psEsc(d.healthId)}">
            <ha-icon icon="mdi:shield-check-outline"></ha-icon>
            <span class="ps-grow"><span class="ps-trunc">${psEsc(d.key)}</span>
            <span class="ps-symeta">${d.tempShow != null
              ? `${Math.round(d.tempShow)}\u00B0${tUnit || ""} · ` : ""}no usage reported</span></span>
            <span class="ps-chip ${ok ? "good" : "bad"}">${psEsc(d.health)}</span></div>`;
      }
      const meta = [
        d.used && d.total ? `${d.used} of ${d.total}` : null,
        d.tempShow != null ? `${Math.round(d.tempShow)}°${tUnit || ""}` : null,
        psEsc(d.health),
      ].filter(Boolean).join(" · ");
      return this._syMeter(d.key, d.usageId, {
        warn: st.warn_above == null ? 80 : st.warn_above,
        crit: st.critical_above == null ? 90 : st.critical_above,
        sub: meta,
      }).replace(/^<div class="ps-syb"/, `<div class="ps-syb ${ok ? "" : "ps-syb-bad"}"`);
    };

    const pools = (st.pools || []).map((p) =>
      this._syMeter(p.label || p.entity, p.entity, { warn: p.warn_above, crit: p.critical_above, sub: p.sub })).join("");

    return `${head}
      ${data.length ? `<div class="ps-sycard"><span class="ps-lbl">Array disks</span>
        ${data.map(diskRow).join("")}
        ${parity.length ? `<div class="ps-syhair"></div>${parity.map(diskRow).join("")}` : ""}</div>` : ""}
      ${pools ? `<div class="ps-sycard"><span class="ps-lbl">Pools &amp; flash</span>${pools}</div>` : ""}
      ${shares.length ? `<div class="ps-sycard">
        <button class="ps-syrow ps-sytog" type="button" id="ps-syshares" aria-expanded="${showShares}">
          <span class="ps-lbl">Shares</span>
          <span class="ps-sysub">${shares.length} · ${showShares ? "hide" : "show"}</span>
        </button>
        ${(showShares ? shares : shares.slice(0, 3)).map((x) =>
          `<div class="ps-syrow ps-syshare" data-info="${psEsc(x.id)}"><span class="ps-trunc">${psEsc(x.name)}</span>
            <b class="${x.v >= 90 ? "ps-warnc" : ""}">${psPct(x.v)}</b></div>`).join("")}
      </div>` : ""}`;
  },

  /* --------------------------------------------------------- performance --*/

  _syPerf(s) {
    const h = this._hass;
    const pf = s.perf || {};
    const cpuSt = h.states[pf.cpu];
    const ca = cpuSt ? cpuSt.attributes : {};
    const cpu = pcNum(h, pf.cpu);
    const ramSt = h.states[pf.ram];
    const ra = ramSt ? ramSt.attributes : {};

    /* These entities are the PWM DUTY the controller is commanding, not a
       measured speed — the state tracks `pwm_value`/255 exactly. Only a header
       with a tach wire reports `rpm`, and a channel driven at 71% that reads
       0 rpm is not a stopped fan, it is a fan nobody can hear back from. On
       this box that is five of six. Printing "0 RPM" would be the same lie as
       drawing a missing reading as zero. */
    const fanRows = (pf.fans || []).map((id, i) => {
      const v = pcNum(h, id);
      if (v == null) return null;
      const st = h.states[id];
      const rpm = st && Number.isFinite(Number(st.attributes.rpm)) ? Number(st.attributes.rpm) : null;
      const mode = st && st.attributes.mode;
      return { id, n: i + 1, duty: Math.max(0, Math.min(100, v)), rpm, mode };
    }).filter(Boolean);
    const tachs = fanRows.filter((f) => f.rpm > 0).length;
    const fans = fanRows.map((f) => `<span class="ps-syfk">${f.n}</span>
        <span class="ps-sybar" data-info="${psEsc(f.id)}"><i class="fan" style="width:${f.duty}%"></i></span>
        <span class="ps-syfv">${Math.round(f.duty)}%${f.rpm > 0
          ? ` <b>${f.rpm}</b>`
          : f.duty > 0 ? ` <em>no tach</em>` : ""}</span>`).join("");

    const net = (pf.network || []).map((n) => {
      const rx = pcNum(h, n.rx), tx = pcNum(h, n.tx);
      if (rx == null && tx == null) return "";
      return `<div class="ps-syrow ps-sysub"><span>${psEsc(n.name)}</span>
        <b>↓ ${rx == null ? "—" : Math.round(rx)} &nbsp; ↑ ${tx == null ? "—" : Math.round(tx)}</b></div>`;
    }).join("");
    const netUnit = pf.network && pf.network.length && h.states[pf.network[0].rx]
      ? h.states[pf.network[0].rx].attributes.unit_of_measurement : "";

    const pw = pf.power || {};
    const cells = [
      ra.ram_used ? this._syCell("RAM used", `${psEsc(String(ra.ram_used).replace(" GB", ""))}<small> / ${psEsc(ra.ram_total || "")}</small>`, "", pf.ram) : "",
      ra.ram_cached ? this._syCell("Cached", psEsc(ra.ram_cached), "", pf.ram) : "",
      pf.gpu_util ? this._syCell(
        (ca.gpu_name ? "GPU" : "GPU"),
        `${pcNum(h, pf.gpu_util) == null ? "—" : Math.round(pcNum(h, pf.gpu_util))}<small>%${
          pcNum(h, pf.gpu_temp) != null ? ` · ${Math.round(pcNum(h, pf.gpu_temp))}${this._syUnit(pf.gpu_temp)}` : ""}</small>`,
        "", pf.gpu_util) : "",
      pf.board_temp && pcNum(h, pf.board_temp) != null
        ? this._syCell("Board", `${Math.round(pcNum(h, pf.board_temp))}<small>${this._syUnit(pf.board_temp)}</small>`, "", pf.board_temp) : "",
    ].filter(Boolean).join("");

    return `<div class="ps-sycard">
        <div class="ps-syrow">
          <div><b class="ps-sycpu">${psEsc(ca.cpu_model
            ? String(ca.cpu_model).replace(/\s+\d+-Core Processor$/, "") : "CPU")}</b>
            <div class="ps-sysub">${ca.cpu_threads ? `${ca.cpu_threads} threads` : ""}${
              ca.cpu_frequency ? ` · ${psEsc(ca.cpu_frequency)}` : ""}${
              pcState(h, pf.governor) ? ` · ${psEsc(pcState(h, pf.governor))}` : ""}</div></div>
          <div class="ps-syhero" data-readout="cpu">${cpu == null ? "—" : psPct(cpu)}</div>
        </div>
        ${this._syCpuGraph(pf)}
      </div>
      ${cells ? `<div class="ps-vits two">${cells}</div>` : ""}
      ${fans ? `<div class="ps-sycard">
        <div class="ps-syrow"><span class="ps-lbl">Fans <i class="ps-syq2">duty</i></span>
          <span class="ps-sysub">${tachs
            ? `${tachs} of ${fanRows.length} reporting rpm`
            : "no rpm feedback"}</span></div>
        <div class="ps-syfans">${fans}</div></div>` : ""}
      ${net ? `<div class="ps-sycard">
        <div class="ps-syrow"><span class="ps-lbl">Network</span><span class="ps-sysub">${psEsc(netUnit)}</span></div>
        ${net}</div>` : ""}
      ${pw.watts ? `<div class="ps-sycard">
        <div class="ps-syrow"><span class="ps-lbl">Power</span>${
          pcNum(h, pw.voltage) != null ? `<span class="ps-chip">${pcNum(h, pw.voltage).toFixed(1)} V</span>` : ""}</div>
        <div class="ps-syrow ps-sysub" data-info="${psEsc(pw.watts)}"><span>Now</span>
          <b>${pcNum(h, pw.watts) == null ? "—" : Math.round(pcNum(h, pw.watts)) + " W"}</b></div>
        ${pw.daily ? `<div class="ps-syrow ps-sysub" data-info="${psEsc(pw.daily)}"><span>Today</span>
          <b>${pcNum(h, pw.daily) == null ? "—" : pcNum(h, pw.daily).toFixed(2) + " kWh"}</b></div>` : ""}
        ${pw.monthly ? `<div class="ps-syrow ps-sysub" data-info="${psEsc(pw.monthly)}"><span>This month</span>
          <b>${pcNum(h, pw.monthly) == null ? "—" : pcNum(h, pw.monthly).toFixed(1) + " kWh"}${
            pcNum(h, pw.cost) != null ? ` · $${pcNum(h, pw.cost).toFixed(2)}` : ""}</b></div>` : ""}
      </div>` : ""}`;
  },

  _syUnit(id) {
    const st = this._hass.states[id];
    return st && st.attributes.unit_of_measurement ? st.attributes.unit_of_measurement : "";
  },

  /* The one thing Parity cannot draw, because it has no recorder: where the
     load has actually been. There is no per-core series in the integration —
     sixteen bars would be sixteen copies of one number — so this is the
     aggregate over time instead, which is the more useful picture anyway. */
  _syCpuGraph(pf) {
    const series = (this._history || {})[pf.cpu];
    if (!series || series.length < 2) {
      return `<div class="ps-nohist">${this._histErr
        ? psEsc("History unavailable — " + this._histErr)
        : "Waiting for history"}</div>`;
    }
    const pts = series
      .map((p) => ({ t: p.t, v: parseFloat(p.s) }))
      .filter((p) => Number.isFinite(p.v));
    if (pts.length < 2) return `<div class="ps-nohist">No numeric history yet</div>`;

    const W = 260, H = 46;
    const down = pcDownsample(pts, 90);
    /* minSpan 10: an idle box wanders between 7% and 11%, and auto-scaling
       that to full height draws a dramatic mountain range out of nothing. */
    const poly = pcSparkPoly(down, W, H, 5, 10);
    if (!poly) return `<div class="ps-nohist">No numeric history yet</div>`;
    const first = poly.split(" ")[0].split(",")[0];
    const lastPt = poly.split(" ").pop().split(",");

    this._cpuData = { t0: down[0].t, t1: down[down.length - 1].t, pts: down };

    return `<div class="ps-sygraph" data-scrub="cpu">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="ps-cpug" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--ps-cool)" stop-opacity=".38"/>
            <stop offset="1" stop-color="var(--ps-cool)" stop-opacity="0"/>
          </linearGradient></defs>
          <polygon points="${first},${H} ${poly} ${lastPt[0]},${H}" fill="url(#ps-cpug)"></polygon>
          <polyline points="${poly}" fill="none" stroke="var(--ps-cool)" stroke-width="1.6"
            stroke-linejoin="round" stroke-linecap="round"></polyline>
        </svg>
        <span class="ps-cross" hidden></span>
      </div>
      <div class="ps-sysub">${Math.round((Date.now() - down[0].t) / 3600000)}h · press and hold to scrub</div>`;
  },

  /* ------------------------------------------------------- notifications --*/

  _syAlerts(s) {
    const h = this._hass;
    const n = s.notifications || {};
    const src = h.states[n.total];
    const recent = (src && src.attributes.recent_notifications) || [];
    const counts = [
      ["all", `All ${psCount(pcNum(h, n.total))}`, ""],
      ["alert", `Alert ${psCount(pcNum(h, n.alert))}`, "bad"],
      ["warning", `Warning ${psCount(pcNum(h, n.warning))}`, "warn"],
      ["info", `Info ${psCount(pcNum(h, n.info))}`, ""],
    ];
    const filter = this._synf || "all";

    /* "Notice [HOMESERVER] - Version update 2026.08.07.1706" spends its first
       twenty characters saying what the dot beside it already says, on every
       row, and pushes the actual subject off the end of the line. */
    const subject = (x) => String(x.subject || "Notification")
      .replace(/^\s*(Notice|Alert|Warning|Info)\s*\[[^\]]*\]\s*-\s*/i, "");

    const rank = (x) => {
      const i = String(x.importance || "").toLowerCase();
      return i === "alert" ? "alert" : i === "warning" ? "warning" : "info";
    };
    const rows = recent
      .filter((x) => filter === "all" || rank(x) === filter)
      .map((x) => {
        const r = rank(x);
        return `<div class="ps-syn">
            <span class="ps-dotc ${r === "alert" ? "bad" : r === "warning" ? "warn" : "info"}"></span>
            <span class="ps-grow"><span class="ps-synt">${psEsc(subject(x))}</span>
            <span class="ps-symeta">${psEsc((x.importance || "info"))}</span></span>
          </div>`;
      }).join("");

    /* The sensor publishes only the five most recent. Saying so beats letting
       a list of five look like the whole of fifty-one. */
    const total = pcNum(h, n.total);
    const more = total != null && total > recent.length
      ? `<div class="ps-sysub">Showing the ${recent.length} most recent of ${total} unread. The full log is in the house notification centre.</div>`
      : "";

    return `<div class="ps-filters">${counts.map(([k, label, cls]) =>
        `<button class="ps-fc ${filter === k ? "on" : ""} ${cls}" type="button" data-synf="${k}">${psEsc(label)}</button>`).join("")}</div>
      <div class="ps-sycard">${rows || `<div class="ps-nohist">Nothing ${
        filter === "all" ? "to report" : "at this level"}.</div>`}</div>
      ${more}
      <div class="ps-btns">
        ${n.archive ? `<button class="ps-btn" type="button" data-sybtn="${psEsc(n.archive)}">Archive all</button>` : ""}
        ${this._config.log_to ? `<button class="ps-btn" type="button" data-sysheet="notifications">House notifications ↗</button>` : ""}
      </div>`;
  },

  /* ---------------------------------------------------------------- bind --*/

  /* Same rules as everything else here: bound once per element per selector,
     nothing closes over hass or config, and a focused field suppresses the
     repaint or the patch destroys the input mid-word. */
  _bindSystems() {
    this._each("[data-sysdock]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = el.dataset.sysdock;
        psClosePopup();
        if (k === "__home") {
          this._mode = null;
          this._sheet = null;
        } else {
          this._page = k;
        }
        this._last = null;
        this._render();
        if (this.scrollIntoView) this.scrollIntoView({ block: "start" });
      });
    });

    this._each("[data-sysw]", (el) => {
      el.addEventListener("click", (e) => { e.stopPropagation(); this._syToggle(el.dataset.sysw); });
    });

    this._each("[data-sybtn]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.dataset.sybtn;
        const dom = String(id).split(".")[0];
        this._hass.callService(dom === "switch" ? "switch" : "button",
          dom === "switch" ? "toggle" : "press", { entity_id: id });
      });
    });

    this._each("[data-syurl]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof window !== "undefined" && window.open) window.open(el.dataset.syurl, "_blank");
      });
    });

    this._each("[data-syfilter]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._syfilter = el.dataset.syfilter;
        this._render();
      });
    });

    this._each("[data-synf]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._synf = el.dataset.synf;
        this._render();
      });
    });

    this._each("[data-sysheet]", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._sheet = el.dataset.sysheet;
        this._render();
      });
    });

    this._one("ps-syshares", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._syShares_open = !this._syShares_open;
        this._render();
      });
    });

    /* The search field keeps focus while you type, so the results CANNOT come
       back through _render — the patch would replace the input mid-word. Same
       rule the music search and the scrub readouts already follow: hold
       _dragging across the keystroke and paint the list directly. */
    this._one("ps-syq", (el) => {
      el.addEventListener("focus", () => { this._dragging = true; });
      el.addEventListener("blur", () => { this._dragging = false; });
      el.addEventListener("input", () => {
        this._syq = el.value;
        this._paintContainers();
      });
    });

    this._one("ps-syclear", (el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this._syq = "";
        this._dragging = false;
        this._render();
      });
    });
  },

  /* Write the rows straight into the list rather than re-rendering the page,
     for the reason above, then rebind — the nodes are new, and _claim is per
     element so the fresh ones have not been claimed. */
  _paintContainers() {
    const s = this._sysCfg();
    if (!s) return;
    const page = this._sysPage();
    if (!page || page.key !== "docker") return;
    const node = this.shadowRoot.querySelector('[data-sect="sys-docker"]');
    if (!node) return;
    const was = this._dragging;
    this._dragging = false;
    const html = this._syDocker(s);
    this._dragging = was;
    /* Keep the field itself out of the rewrite: replacing it is exactly what
       this function exists to avoid. Only the list and the counts move. */
    const fresh = document.createElement("div");
    fresh.innerHTML = html;
    const listNew = fresh.querySelectorAll(".ps-sycard");
    const listOld = node.querySelectorAll(".ps-sycard");
    if (listNew.length && listOld.length) {
      listOld[listOld.length - 1].innerHTML = listNew[listNew.length - 1].innerHTML;
    }
    const chipsNew = fresh.querySelector(".ps-filters");
    const chipsOld = node.querySelector(".ps-filters");
    if (chipsNew && chipsOld) chipsOld.innerHTML = chipsNew.innerHTML;
    node._psHtml = null;   // the cache no longer matches the DOM
    this._bind();
    this._bindSystems();
  },
});
