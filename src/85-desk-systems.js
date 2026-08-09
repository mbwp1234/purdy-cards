/* ============================================================================
 * purdy-desk-card — the systems panel, and now-playing in the dock
 *
 * These two arrived together because they are one decision: the server is worth
 * a stage panel and the music is not.
 *
 * Music held a full column whether or not anything was playing — six idle rooms
 * and a preset grid, permanently, at the same weight as the climate and the
 * baby. The server had one line in the dock reading "4 of 11", which is not
 * system information, it is a number. So they swap: the panel that answers
 * "how is the server" goes on the stage, and the one that answers "what is
 * playing" becomes a strip in the dock that says nothing when nothing plays.
 * Everything music could do it can still do — the panel moves to a sheet behind
 * the dock's Music button, which is exactly where the phone put it.
 *
 * The rich detail comes from the top-level `server:` block — the same one the
 * phone's systems MODE reads. The desk does not have a mode: it has a wide
 * panel, which is enough room for the meters, the faults and the CPU trend
 * without taking the whole screen over.
 * ========================================================================== */

Object.assign(PurdyDeskCard.prototype, {

  /* The borrowed _collectWatched walks `sections:` and knows nothing about the
     top-level `server:` block, so without this a container starting or an array
     filling up would not repaint until the 30s clock came round. Extends rather
     than replaces — the section walk is still the shell's. */
  _collectWatched() {
    const ids = PurdyShellCard.prototype._collectWatched.call(this);
    const srv = this._config && this._config.server;
    if (!srv) return ids;
    const push = (x) => { if (x && ids.indexOf(x) < 0) ids.push(x); };
    push(srv.status); push(srv.uptime); push(srv.version);
    push(srv.update_available);
    (srv.meters || []).forEach((m) => push(m.entity));
    (srv.stats || []).forEach((s) => push(s.entity));
    (srv.faults || []).forEach((f) => push(f.entity));
    if (srv.docker) { push(srv.docker.running); push(srv.docker.conflicts); }
    if (srv.perf) { push(srv.perf.cpu); push(srv.perf.ram); push(srv.perf.gpu_util); }
    return ids;
  },

  /* A labelled bar. A meter with no reading draws an EMPTY track and says so —
     a bar at zero is a claim that the disk is empty. */
  _meterRow(m) {
    const r = pcReading(this._hass, m.entity);
    const n = r.ok ? r.n : null;
    const crit = m.critical_above != null && n != null && n > m.critical_above;
    const warn = m.warn_above != null && n != null && n > m.warn_above;
    const col = crit ? "var(--ps-bad)" : warn ? "var(--ps-warn)" : "var(--ps-cool)";
    return `<div class="pd-mrow" data-info="${psEsc(m.entity)}" role="button" tabindex="0">
        <span class="pd-ml">${psEsc(m.label)}</span>
        <span class="pd-mbar">${n == null ? ""
          : `<i style="width:${Math.max(0, Math.min(100, n)).toFixed(1)}%;background:${col}"></i>`}</span>
        <span class="pd-mv2" style="${n != null && (crit || warn) ? `color:${col}` : ""}">${
          n == null ? "—" : n.toFixed(1) + "%"}</span>
      </div>`;
  },

  _pnlSystems(sec) {
    const h = this._hass;
    const srv = this._config.server;
    /* No server block: fall back to the dock treatment rather than an empty
       column — a section moved between tiers must never render blank. */
    if (!srv) {
      const body = this._dockSystems(sec);
      return body ? `${this._head(sec, "")}<div class="pd-pbody pd-full">${body}</div>` : "";
    }

    const faults = this._serverFaults();
    const worst = faults.some((f) => f.severity === "critical") ? "bad"
      : faults.length ? "warn" : "good";
    const chip = this._chip(
      faults.length ? `${faults.length} fault${faults.length > 1 ? "s" : ""}` : "Healthy", worst);

    const status = srv.status ? pcState(h, srv.status) : "";
    const uptime = srv.uptime ? pcState(h, srv.uptime) : "";
    const running = srv.docker && srv.docker.running ? pcState(h, srv.docker.running) : "";
    const arr = (srv.meters || [])[0];
    const arrR = arr ? pcReading(h, arr.entity) : null;

    const cpuId = srv.perf && srv.perf.cpu;
    const cpu = cpuId ? pcReading(h, cpuId) : null;

    const stats = (srv.stats || []).map((s) => {
      const r = pcReading(h, s.entity);
      const v = r.ok && r.n != null
        ? r.n.toFixed(s.digits == null ? 0 : s.digits) + (s.unit || "")
        : (r.ok ? this._humanize(r.st.state) : "—");
      return `<div class="pd-sstat"><span class="pd-sv2">${psEsc(v)}</span>
          <span class="pd-sk">${psEsc(s.label)}</span></div>`;
    }).join("");

    const faultRows = faults.map((f) => `
      <div class="pd-ar">
        <span class="pd-sev ${psEsc(f.severity || "warn")}"></span>
        <div class="pd-grow">
          <div class="pd-at">${psEsc(f.label)}</div>
          <div class="pd-ad">${psEsc(f.detail || "")}</div>
        </div>
        <button class="pd-mini-btn" type="button" data-info="${psEsc(f.entity)}">Open</button>
      </div>`).join("");

    /* The other things in the house that are "systems" — the vacuum and the
       litter box. Secondary to the server, not absent. */
    const others = (sec.devices || [])
      .filter((d) => d.key !== "nas" && d.name !== srv.name)
      .map((d) => {
        const m = (d.meters || [])[0];
        const r = m ? pcReading(h, m.entity) : null;
        const n = r && r.ok ? r.n : null;
        return `<div class="pd-sysrow">
            <ha-icon icon="${psEsc(d.icon || "mdi:chip")}"></ha-icon>
            <span class="pd-sn">${psEsc(d.name)}</span>
            <span class="pd-sv">${psEsc(d.chip ? this._humanize(pcState(h, d.chip)) : "")}</span>
            ${n == null ? "" : `<span class="pd-meter"><i style="width:${
              Math.max(0, Math.min(100, n)).toFixed(0)}%;background:${
              m.warn_above != null && n > m.warn_above ? "var(--ps-warn)" : "var(--ps-good)"}"></i></span>`}
          </div>`;
      }).join("");

    const update = srv.update_available && pcState(h, srv.update_available) === "on";

    return `${this._head(sec, chip)}
      <div class="pd-mini">
        ${this._mstat(arrR && arrR.ok && arrR.n != null ? arrR.n.toFixed(0) : "—", "array", "%")}
        ${running ? this._mstat(psEsc(running), "containers") : ""}
        ${chip}
      </div>
      <div class="pd-pbody pd-full">
        <div class="pd-srvhead">
          <div class="pd-grow">
            <div class="pd-srvn">${psEsc(srv.name || "Server")}</div>
            <div class="pd-srvs">${psEsc([status && this._humanize(status), uptime].filter(Boolean).join(" · ") || "—")}</div>
          </div>
          ${cpu && cpu.ok && cpu.n != null
            ? `<div class="pd-cpu"><span class="pd-cpuv">${cpu.n.toFixed(1)}<small>%</small></span>
                 <span class="pd-cpuk">CPU</span></div>` : ""}
          ${cpuId ? `<span class="pd-spark wide">${this._sparkSvg(cpuId)}</span>` : ""}
        </div>
        <div class="pd-meters">${(srv.meters || []).map((m) => this._meterRow(m)).join("")}</div>
        ${stats ? `<div class="pd-sstats">${stats}</div>` : ""}
        ${running ? `<div class="pd-srow"><span>Containers</span><b>${psEsc(running)}</b></div>` : ""}
        <div class="pd-xtra">
          ${faultRows || `<div class="pd-dimtext">Nothing wrong with ${psEsc(srv.name || "the server")}.</div>`}
          ${update ? `<div class="pd-srow"><span>Update available</span>${srv.update_url
            ? `<a class="pd-mini-btn" href="${psEsc(srv.update_url)}" target="_blank" rel="noreferrer">Open</a>` : ""}</div>` : ""}
          ${others ? `<div class="pd-sub2">Also</div>${others}` : ""}
          ${srv.url ? `<a class="pd-mini-btn" href="${psEsc(srv.url)}" target="_blank" rel="noreferrer">Open ${psEsc(srv.name || "server")}</a>` : ""}
        </div>
      </div>`;
  },

  /* --------------------------------------------------- now playing, docked --
   *
   * Says nothing when nothing plays. The strip keeps its slot so the dock does
   * not reflow every time the music stops, but it draws only a dimmed prompt —
   * a transport with nothing behind it is a row of dead buttons.
   */
  _dockNowplaying(sec) {
    const h = this._hass;
    const target = this._activePlayer();
    const st = target && h.states[target];
    const live = !!psLiveMusic(st);
    const playing = !!st && st.state === "playing";
    const title = live ? st.attributes.media_title : null;
    const art = live ? st.attributes.entity_picture_local : null;
    const artist = live ? (st.attributes.media_artist || st.attributes.media_album_name) : null;

    if (!title) {
      return `<div class="pd-npbar idle" data-sheet="${psEsc(sec.sheet || "music")}" role="button" tabindex="0">
          <div class="pd-th"><svg viewBox="0 0 24 24" class="pd-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg></div>
          <div class="pd-grow"><div class="pd-n pd-trunc">Nothing playing</div>
            <div class="pd-s pd-trunc">${psEsc(this._roomName(this._musicSec() || {}, target) || "")}</div></div>
        </div>`;
    }

    return `<div class="pd-npbar">
        <div class="pd-th" data-sheet="${psEsc(sec.sheet || "music")}" role="button" tabindex="0">${art
          ? `<img src="${psEsc(art)}" alt="" />`
          : `<svg viewBox="0 0 24 24" class="pd-ico"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>`}</div>
        <div class="pd-grow" data-sheet="${psEsc(sec.sheet || "music")}" role="button" tabindex="0">
          <div class="pd-n pd-trunc">${psEsc(title)}</div>
          <div class="pd-s pd-trunc">${psEsc([artist, this._roomName(this._musicSec() || {}, target)].filter(Boolean).join(" · "))}</div>
        </div>
        <div class="pd-tbs">
          <button class="pd-tb" type="button" data-mp="prev" aria-label="Previous">
            <svg viewBox="0 0 24 24" class="pd-ico"><path d="M18 5v14L8 12zM6 5v14"/></svg></button>
          <button class="pd-tb pp" type="button" data-mp="playpause" aria-label="Play or pause">
            <svg viewBox="0 0 24 24" class="pd-ico">${playing
              ? `<path d="M9 5v14M15 5v14"/>` : `<path d="M7 4.5 19 12 7 19.5Z"/>`}</svg></button>
          <button class="pd-tb" type="button" data-mp="next" aria-label="Next">
            <svg viewBox="0 0 24 24" class="pd-ico"><path d="M6 5v14l10-7zM18 5v14"/></svg></button>
        </div>
      </div>`;
  },
});
