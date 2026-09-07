/* ------------------------------------------------------------------ remote --*/

/* Brand marks drawn inline. The cbi:/si:/phu: iconsets are not reliably
   present, and a missing icon renders as an empty box — so the card owns
   its artwork rather than depending on an iconset being installed. */
const PC_BRANDS = {
  netflix: `<svg viewBox="0 0 24 24"><path fill="#B20710" d="M6.6 2h3.9l7 20h-3.9z"/><path fill="#E50914" d="M6.6 2h3.9v20H6.6zM13.5 2h3.9v20h-3.9z"/></svg>`,
  disney: `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#0C204A"/><text x="12" y="16.4" text-anchor="middle" font-family="Georgia,serif" font-size="11" font-style="italic" font-weight="700" fill="#fff">D+</text></svg>`,
  prime: `<svg viewBox="0 0 24 24"><rect x="2" y="3.5" width="20" height="17" rx="4" fill="#1399FF"/><path fill="#fff" d="M9.8 8.2l6 3.4-6 3.4z"/><path d="M6.6 17.4c3.1 1.7 7.7 1.7 10.8 0" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  peacock: `<svg viewBox="0 0 24 24"><g fill="none" stroke-width="2.4" stroke-linecap="round"><path stroke="#0089CF" d="M12 21C8.2 18.2 6.3 13 7.3 8"/><path stroke="#6E3FA3" d="M12 21c-1.9-3.9-2.4-9-1.4-13"/><path stroke="#E4002B" d="M12 21c0-4 .5-9 1.5-13"/><path stroke="#F6A800" d="M12 21c1.9-3.9 4-7.9 5.5-10.6"/><path stroke="#FFD100" d="M12 21c2.9-3 5.9-5.9 7.9-7.7"/></g></svg>`,
  twitch: `<svg viewBox="0 0 24 24"><path fill="#9146FF" d="M4.4 3h15.2v10.6l-3.6 3.6h-3L10 20.4H8.1v-3.2H4.4z"/><path fill="#fff" d="M10.4 6.9h1.8v5.2h-1.8zM14.6 6.9h1.8v5.2h-1.8z"/></svg>`,
  f1: `<svg viewBox="0 0 24 24"><text x="12" y="16.2" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="11" font-style="italic" font-weight="900" fill="#E10600">F1</text></svg>`,
  jellyfin: `<svg viewBox="0 0 24 24"><path fill="#AA5CC3" d="M12 3.4c1.7 0 6.4 8.4 5.5 9.9-.9 1.5-10.1 1.5-11 0C5.6 11.8 10.3 3.4 12 3.4z"/><path fill="#00A4DC" d="M12 9.6c1.2 0 4.6 6.1 4 7.2-.6 1.1-7.4 1.1-8 0-.6-1.1 2.8-7.2 4-7.2z"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="4.2" fill="#FF0000"/><path fill="#fff" d="M10.2 8.6l6 3.4-6 3.4z"/></svg>`,
  plex: `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#1F1F1F"/><path fill="#E5A00D" d="M8 4h4.6l4.6 8-4.6 8H8l4.6-8z"/></svg>`,
};

/* Hold-to-repeat.
 *
 * A physical remote repeats while it is held down; this card only ever counted
 * presses, so turning the volume down ten notches was ten separate taps and
 * scrolling a row of forty titles was forty. The leading edge fires at once so
 * a single tap is still instant, then a grace period passes before the repeat
 * starts — the grace is the whole reason a normal tap never runs away. The
 * repeat interval is deliberately slower than the haptic rate floor (40ms), so
 * a held key buzzes per step rather than becoming one continuous vibration. */
const PC_RPT_DELAY = 420;
const PC_RPT_EVERY = 130;

/* Optimistic display, on the same contract as the shell's _optGoal: hold the
   value we just asked for, let the real state supersede it, and expire after
   12s so a failure shows the truth rather than a lie that never lapses. */
const PC_OPT_MS = 12000;

/* The trackpad's range. It is the only element on this card with no intrinsic
   size of its own, so it is the one that gives when the sheet is shorter than
   the remote would like — see _fitPad. */
const PC_PAD_MAX = 200;
/* Below this the trackpad stops being a surface you can swipe on and becomes a
   fourth row of keys with a hole in the middle. Where the volume rail is
   present the row floors higher on its own — 44 + 36 + 44 plus padding is
   ~150px of min-content that a flex item will not shrink past — so 132 is only
   ever reached on a TV with no media_player beside it. */
const PC_PAD_MIN = 132;

class PurdyRemoteCard extends PcBaseCard {
  static getStubConfig(hass) {
    const r = Object.keys(hass.states).find((e) => e.startsWith("remote."));
    return { tvs: [{ name: "TV", remote: r || "remote.tv" }], apps: [] };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.tvs) || !config.tvs.length) {
      throw new Error("purdy-remote-card: 'tvs' (a list) is required");
    }
    this._config = { title: "Televisions", apps: [], ...config };
    const ids = [];
    config.tvs.forEach((t) => {
      [t.remote, t.app_sensor, t.media_player].forEach((x) => x && ids.push(x));
    });
    this._watched = ids;
    this._last = null;
    this._sel = 0;
    this._opt = {};
  }

  _tv() {
    return this._config.tvs[this._sel] || this._config.tvs[0];
  }

  _isOn(t) {
    if (t.media_player && this._hass.states[t.media_player]) {
      const ms = pcState(this._hass, t.media_player);
      return ms !== "off" && ms !== "unavailable" && ms !== "unknown" && ms !== "";
    }
    return pcState(this._hass, t.remote) === "on";
  }

  /* Default to whichever television is actually on. */
  _autoSelect() {
    if (this._touched) return;
    const i = this._config.tvs.findIndex((t) => this._isOn(t));
    if (i >= 0) this._sel = i;
  }

  _send(command) {
    const t = this._tv();
    if (!t.remote) return;
    this._hass.callService("remote", "send_command", {
      entity_id: t.remote, command,
    });
  }

  /* One call powers the set on AND opens the app, which is why the app grid is
     drawn on a cold television rather than replaced by a sentence about
     turning it on first. Both remotes here advertise supported_features 4. */
  _launch(activity) {
    const t = this._tv();
    if (!t.remote) return;
    this._hass.callService("remote", "turn_on", { entity_id: t.remote, activity });
  }

  /* ---- optimistic attribute reads -------------------------------------
   * PcBaseCard's re-render signature is built from watched entity STATES, so
   * an attribute that changes without the state changing never repaints the
   * card. Mute and source are both attributes: pressing mute called the
   * service correctly and then drew the old icon until something unrelated
   * moved, which is indistinguishable from the button not working. */
  _opt_get(key, real) {
    const o = this._opt[key];
    if (!o) return real;
    if (Date.now() - o.at > PC_OPT_MS) { delete this._opt[key]; return real; }
    if (o.v === real) { delete this._opt[key]; return real; }
    return o.v;
  }

  _opt_set(key, v) {
    this._opt[key] = { v, at: Date.now() };
  }

  _muted(t) {
    const st = this._hass.states[t.media_player];
    return !!this._opt_get("mute:" + t.media_player, !!(st && st.attributes.is_volume_muted));
  }

  /* Volume steps rather than sets. Samsung's Tizen websocket advertises
     VOLUME_SET but never honours it and reports its level as 0 forever, so
     an absolute slider is meaningless — and so is a level readout. The rail
     therefore draws no ticks and no number: a zero and a missing reading must
     never look the same, and inventing a position would be worse than both. */
  _step(dir) {
    const t = this._tv();
    if (!t.media_player) return;
    this._hass.callService("media_player", dir > 0 ? "volume_up" : "volume_down", {
      entity_id: t.media_player,
    });
  }

  _toggleMute() {
    const t = this._tv();
    if (!t.media_player) return;
    const next = !this._muted(t);
    this._opt_set("mute:" + t.media_player, next);
    this._hass.callService("media_player", "volume_mute", {
      entity_id: t.media_player, is_volume_muted: next,
    });
    this._render();
  }

  /* ---- source ---------------------------------------------------------
   * Both Samsungs carry SELECT_SOURCE with a real source_list (TV, HDMI) and
   * the card had no route to it at all.
   *
   * It was first built as a cycle key labelled with the input it would switch
   * TO — which the render pass killed: Tizen publishes source_list and NEVER
   * publishes `source`, so the key read "TV" on a set that was already on TV
   * and every press would have selected TV again. A cycle needs to know where
   * it is standing. This is the "a chip that asks for a value and does not get
   * one is dropped, not filled with a placeholder" rule at a control rather
   * than a caption: the answer is not a better guess, it is a picker, which
   * selects DIRECTLY and so needs no current value at all. Where `source` does
   * come through, the live one is marked. */
  _sourceList(t) {
    const st = t.media_player && this._hass.states[t.media_player];
    const list = st && st.attributes.source_list;
    return Array.isArray(list) && list.length > 1 ? list : null;
  }

  _source(t) {
    const st = t.media_player && this._hass.states[t.media_player];
    return this._opt_get("src:" + t.media_player, st ? st.attributes.source : undefined);
  }

  _selectSource(name) {
    const t = this._tv();
    if (!name) return;
    this._opt_set("src:" + t.media_player, name);
    this._srcOpen = false;
    this._hass.callService("media_player", "select_source", {
      entity_id: t.media_player, source: name,
    });
    this._render();
  }

  _power() {
    const t = this._tv();
    const on = this._isOn(t);
    if (t.media_player && this._hass.states[t.media_player]) {
      this._hass.callService("media_player", on ? "turn_off" : "turn_on", {
        entity_id: t.media_player,
      });
      return;
    }
    if (!t.remote) return;
    this._hass.callService("remote", on ? "turn_off" : "turn_on", { entity_id: t.remote });
  }

  /* ---- binding --------------------------------------------------------- */

  /* A key that fires once on press, then repeats while it is held. No pointer
     capture: touch pointer events are not retargeted so it buys nothing there,
     and on the mouse path a release outside the button would never fire
     pointerup at all — the repeat would run on with nothing to stop it. Leaving
     the element ends the hold instead. */
  _bindRepeat(el, fn, type) {
    let delay = null, timer = null, down = false;
    const stop = () => {
      clearTimeout(delay); clearInterval(timer);
      delay = timer = null; down = false;
    };
    el.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      if (down) return;
      down = true;
      fn(); pcHaptic(type || "light");
      delay = setTimeout(() => {
        timer = setInterval(() => { fn(); pcHaptic("selection"); }, PC_RPT_EVERY);
      }, PC_RPT_DELAY);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((k) => {
      el.addEventListener(k, stop);
    });
  }

  /* The trackpad.
   *
   * The d-pad's four chevrons were past the touch floor and still wrong: a
   * target you have to AIM at is a target you have to LOOK at, which defeats
   * the one thing a remote is for. The whole block is now the control — swipe
   * to move, tap to select — and the rim keeps working as four discrete keys
   * for anyone who wants a single precise step.
   *
   * Touch is handled with raw, non-passive touch events and pointer events are
   * left to the mouse, the same split the shell's scrubber uses: touch-action
   * is read at gesture start and cannot be taken back, so preventDefault() on
   * a non-passive touchmove is the only thing that holds a gesture mid-flight.
   *
   * One handler owns all three verbs rather than overlaying edge buttons on a
   * swipe surface, because two handlers competing for the same pointer is how
   * a gesture goes dead diagonally. */
  _bindPad(el) {
    const STEP = 30;      /* px of travel per DPAD step */
    const EDGE = 52;      /* how far in from a rim still counts as that key */
    const TAP_PX = 9, TAP_MS = 600;
    let sx = 0, sy = 0, ax = 0, ay = 0, t0 = 0, moved = false, zone = null;
    let hold = null, rpt = null;

    const zoneAt = (x, y) => {
      const r = el.getBoundingClientRect();
      const dx = x - r.left, dy = y - r.top;
      if (dx < EDGE) return "DPAD_LEFT";
      if (r.width - dx < EDGE) return "DPAD_RIGHT";
      if (dy < EDGE) return "DPAD_UP";
      if (r.height - dy < EDGE) return "DPAD_DOWN";
      return null;
    };
    const stopHold = () => { clearTimeout(hold); clearInterval(rpt); hold = rpt = null; };

    const down = (x, y) => {
      this._dragging = true;
      sx = ax = x; sy = ay = y; t0 = Date.now(); moved = false;
      zone = zoneAt(x, y);
      el.classList.add("live");
      if (!zone) return;
      /* Resting on a rim is "keep going". It arms only after the tap window
         has passed, so an ordinary edge tap can never repeat. */
      hold = setTimeout(() => {
        moved = true;   /* consumed here — the release must not send another */
        this._send(zone); pcHaptic("selection");
        rpt = setInterval(() => { this._send(zone); pcHaptic("selection"); }, PC_RPT_EVERY);
      }, PC_RPT_DELAY);
    };

    const move = (x, y) => {
      if (!this._dragging) return;
      if (!moved && (Math.abs(x - sx) > TAP_PX || Math.abs(y - sy) > TAP_PX)) {
        stopHold();
        moved = true;
      }
      let dx = x - ax, dy = y - ay;
      /* Each step commits to one axis and resets the other, so a swipe that
         drifts diagonally still reads as the line it was mostly travelling. */
      while (Math.abs(dx) >= STEP || Math.abs(dy) >= STEP) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          this._send(dx > 0 ? "DPAD_RIGHT" : "DPAD_LEFT");
          ax += dx > 0 ? STEP : -STEP; ay = y;
        } else {
          this._send(dy > 0 ? "DPAD_DOWN" : "DPAD_UP");
          ay += dy > 0 ? STEP : -STEP; ax = x;
        }
        pcHaptic("selection");
        dx = x - ax; dy = y - ay;
      }
    };

    const up = () => {
      stopHold();
      el.classList.remove("live");
      if (this._dragging && !moved && Date.now() - t0 < TAP_MS) {
        this._send(zone || "DPAD_CENTER");
        pcHaptic(zone ? "light" : "medium");
      }
      this._dragging = false;
      /* Repaints held off during the gesture land now. Re-rendering mid-swipe
         detaches the node under the finger: the handler keeps its stale el,
         getBoundingClientRect() reads zero and every later move is discarded. */
      if (this._pending) { this._pending = false; this._render(); }
    };

    el.addEventListener("touchstart", (e) => {
      e.preventDefault(); const t = e.touches[0]; down(t.clientX, t.clientY);
    }, { passive: false });
    el.addEventListener("touchmove", (e) => {
      e.preventDefault(); const t = e.touches[0]; move(t.clientX, t.clientY);
    }, { passive: false });
    el.addEventListener("touchend", (e) => { e.preventDefault(); up(); }, { passive: false });
    el.addEventListener("touchcancel", () => {
      stopHold(); el.classList.remove("live"); this._dragging = false;
    });

    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return;
      down(e.clientX, e.clientY);
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      move(e.clientX, e.clientY);
    });
    /* pointerleave ends the mouse drag as surely as pointerup does. Without it
       a button released off the pad never fires pointerup, _dragging stays true
       and the card stops repainting for the rest of the session. */
    ["pointerup", "pointerleave"].forEach((k) => {
      el.addEventListener(k, (e) => {
        if (e.pointerType === "touch") return;
        up();
      });
    });

    /* The four chevrons used to be real buttons, so replacing them with a
       surface would have taken the keyboard route away with them. */
    const KEYS = {
      ArrowUp: "DPAD_UP", ArrowDown: "DPAD_DOWN", ArrowLeft: "DPAD_LEFT",
      ArrowRight: "DPAD_RIGHT", Enter: "DPAD_CENTER", " ": "DPAD_CENTER",
    };
    el.addEventListener("keydown", (e) => {
      const cmd = KEYS[e.key];
      if (!cmd) return;
      e.preventDefault();
      this._send(cmd);
    });
  }

  _render() {
    if (!this._hass || !this._config) return;
    /* Never repaint under a live gesture. */
    if (this._dragging) { this._pending = true; return; }
    this._autoSelect();
    const tvs = this._config.tvs;
    const t = this._tv();
    const on = this._isOn(t);
    const app = pcState(this._hass, t.app_sensor);
    const onCount = tvs.filter((x) => this._isOn(x)).length;
    const hasPlayer = !!(t.media_player && this._hass.states[t.media_player]);
    const srcList = on && hasPlayer ? this._sourceList(t) : null;
    const srcNow = srcList ? this._source(t) : undefined;
    const apps = this._config.apps || [];

    const key = (icon, cmd, label) =>
      `<button class="k" type="button" data-cmd="${cmd}" aria-label="${label}">
         <ha-icon icon="${icon}"></ha-icon><em>${label}</em></button>`;

    this.shadowRoot.innerHTML = `
      <style>
        ${PC_BASE}
        .card { display: flex; flex-direction: column; gap: 10px; }
        .hd { display: flex; align-items: center; gap: 8px; padding: 0 4px 2px; }
        .hd b { font-size: var(--pc-fs-2xl); font-weight: 650; letter-spacing: -0.02em; }
        .hd .spacer { flex: 1; }
        .chip.good { background: rgba(127,216,164,0.15); color: var(--pc-good); }
        .chip .cdot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

        .seg { display: flex; background: var(--pc-chip); border-radius: var(--pc-r-md); padding: 3px; gap: 3px; }
        .seg button {
          flex: 1; border: 0; background: none; cursor: pointer; font-family: inherit;
          padding: 8px 6px; border-radius: var(--pc-r-sm); color: var(--pc-muted);
          font-size: var(--pc-fs-sm); font-weight: 640; display: flex;
          align-items: center; justify-content: center; gap: 5px;
        }
        .seg button.sel { background: var(--pc-fill-2); color: var(--pc-text); }
        .seg .live { width: 6px; height: 6px; border-radius: 50%; background: var(--pc-good);
                     box-shadow: 0 0 7px rgba(127,216,164,0.8); }

        .now { display: flex; align-items: center; gap: 11px; }
        .art {
          width: 44px; height: 44px; border-radius: var(--pc-r-md); flex: 0 0 auto;
          display: flex; align-items: center; justify-content: center; overflow: hidden;
          background: var(--pc-fill-1); color: var(--pc-muted);
        }
        .art svg { width: 26px; height: 26px; }
        .now .t { font-size: var(--pc-fs-lg); font-weight: 650; letter-spacing: -0.015em; }
        .now .s { font-size: var(--pc-fs-xs); color: var(--pc-muted); letter-spacing: 0.05em;
                  text-transform: uppercase; font-weight: 640; }
        .pwr {
          flex: 0 0 auto; width: 42px; height: 42px; border-radius: 50%;
          border: 1px solid var(--pc-edge); cursor: pointer; background: var(--pc-fill-1);
          display: flex; align-items: center; justify-content: center;
        }
        .pwr ha-icon { color: var(--pc-bad); }
        .pwr.off ha-icon { color: var(--pc-good); }

        /* A 26px logo and a 9px label do not need an 80px square around them.
           Deliberately still a WRAPPING grid rather than the scrolling strip
           the mockup drew: an app is an app wherever it falls on the line, and
           a horizontal scroller inside a vertical sheet loses the axis lock.
           Eight apps are two rows here and nothing is hidden behind a swipe. */
        .apps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .app {
          height: 58px; border: 0; cursor: pointer; font-family: inherit;
          border-radius: var(--pc-r-lg); background: var(--pc-fill-1);
          border: 1px solid var(--pc-edge);
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 4px; padding: 0;
          font-size: 9px; letter-spacing: 0.04em; color: var(--pc-muted);
        }
        .app:active { background: var(--pc-fill-3); }
        .app svg { width: 24px; height: 24px; }
        /* The app that is actually open. Nothing else on the card says it once
           the header row is blanked by the sheet. */
        .app.live { border-color: rgba(var(--pc-cool-rgb), 0.55); color: var(--pc-text); }

        /* ---- trackpad + volume rail ---- */
        .padwrap { display: flex; gap: 9px; }
        .pad {
          flex: 1; position: relative; height: ${PC_PAD_MAX}px; border-radius: var(--pc-r-2xl);
          background:
            radial-gradient(88% 70% at 50% 46%, rgba(255,255,255,0.052), transparent 74%),
            var(--pc-fill-1);
          border: 1px solid var(--pc-edge); cursor: pointer;
          /* The one place in the bundle that takes touch-action: none up front.
             It is a dedicated gesture surface with nothing scrollable beneath
             it, which is exactly the case the rule against pan-x pan-y is not
             about — the danger there is restricting a strip that still has to
             scroll. Touch is preventDefault()ed from touchstart regardless. */
          touch-action: none;
          -webkit-user-select: none; user-select: none;
        }
        .pad.live { background:
            radial-gradient(88% 70% at 50% 46%, rgba(var(--pc-cool-rgb), 0.10), transparent 74%),
            var(--pc-fill-2); }
        .pad .ok {
          position: absolute; inset: 0; display: flex; align-items: center;
          justify-content: center; font-size: var(--pc-fs-md); font-weight: 700;
          letter-spacing: 0.18em; color: rgba(230, 236, 242, 0.38); pointer-events: none;
        }
        /* The rim chevrons are the affordance that says the edges are keys, so
           they have to survive the shot rather than merely exist in the DOM. */
        .pad .arw { position: absolute; color: rgba(230, 236, 242, 0.34); pointer-events: none; }
        .pad .arw ha-icon { --mdc-icon-size: 20px; display: block; }
        .pad .arw.u { top: 9px; left: 50%; transform: translateX(-50%); }
        .pad .arw.d { bottom: 9px; left: 50%; transform: translateX(-50%); }
        .pad .arw.l { left: 9px; top: 50%; transform: translateY(-50%); }
        .pad .arw.r { right: 9px; top: 50%; transform: translateY(-50%); }

        .vrail {
          flex: 0 0 auto; width: 62px; border-radius: var(--pc-r-2xl);
          background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
          display: flex; flex-direction: column; align-items: center;
          justify-content: space-between; padding: 12px 0;
          touch-action: none;
        }
        .vrail button {
          border: 0; background: none; cursor: pointer; padding: 0; font-family: inherit;
          display: flex; align-items: center; justify-content: center; color: var(--pc-text);
        }
        .vrail .vstep { width: 44px; height: 44px; border-radius: 50%; }
        .vrail .vstep:active { background: var(--pc-fill-3); }
        .vrail .vstep ha-icon { --mdc-icon-size: 24px; }
        .vrail .mute {
          width: 36px; height: 36px; border-radius: 50%; background: var(--pc-fill-2);
          color: var(--pc-muted);
        }
        .vrail .mute ha-icon { --mdc-icon-size: 18px; }
        .vrail .mute.on { color: var(--pc-bad); background: rgba(242,122,131,0.16); }

        .hint { font-size: var(--pc-fs-micro); color: var(--pc-muted); text-align: center;
                letter-spacing: 0.02em; }
        /* Sits in the hint's slot rather than below it, so opening the picker
           does not shove the pad and the keys under the thumb that opened it. */
        .srcs { display: flex; gap: 8px; }
        .srcs button {
          flex: 1; height: 34px; border: 1px solid var(--pc-edge); border-radius: var(--pc-r-sm);
          cursor: pointer; background: var(--pc-fill-1); color: var(--pc-muted);
          font-family: inherit; font-size: var(--pc-fs-sm); font-weight: 640;
        }
        .srcs button.sel { background: var(--pc-fill-3); color: var(--pc-text); }

        /* ---- bottom keys ---- */
        .krow { display: flex; gap: 8px; }
        .krow button {
          flex: 1; height: 52px; border: 1px solid var(--pc-edge); border-radius: var(--pc-r-lg);
          cursor: pointer; background: var(--pc-fill-1); color: var(--pc-text);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 3px; font-family: inherit; padding: 0;
        }
        .krow button:active { background: var(--pc-fill-3); }
        /* Borrowed from face C: the key you press most is the one you should be
           able to find without reading it, so it is visibly the widest. */
        .krow button.hero { flex: 1.5; background: var(--pc-fill-3); }
        .krow button.hot { background: var(--pc-fill-3); border-color: rgba(var(--pc-cool-rgb), 0.5); }
        .krow em { font-style: normal; font-size: 9px; letter-spacing: 0.06em;
                   text-transform: uppercase; color: var(--pc-muted); font-weight: 640; }
        .krow ha-icon { --mdc-icon-size: 21px; }

        button:focus-visible { outline: 2px solid var(--pc-cool); outline-offset: 2px; }
        .off-note { text-align: center; color: var(--pc-muted); font-size: var(--pc-fs-sm); }
      </style>

      <div class="card tint${this._config.glass ? " glass" : ""}${this._config.bare ? " bare" : ""}">
        ${/* Hosted in a sheet, the shell blanks the title because its own chrome
              already names the card — which left this row as nothing but an
              "N on" chip, floating alone above a selector whose live dots say
              the same thing. So the header row goes with the title rather than
              becoming a 31px restatement. Standalone, with a title, it renders
              exactly as before. */""}
        ${!this._config.title ? "" : `<div class="hd">
          <b>${this._config.title}</b>
          <span class="spacer"></span>
          <span class="chip ${onCount ? "good" : ""}">
            ${onCount ? '<span class="cdot"></span>' : ""}${onCount} on
          </span>
        </div>`}

        ${tvs.length > 1 ? `
          <div class="seg">
            ${tvs.map((x, i) => `
              <button type="button" data-sel="${i}" class="${i === this._sel ? "sel" : ""}">
                ${this._isOn(x) ? '<span class="live"></span>' : ""}${x.name}
              </button>`).join("")}
          </div>` : ""}

        <div class="now">
          <div class="art">${on && app && PC_BRANDS[this._brandFor(app)]
            ? PC_BRANDS[this._brandFor(app)]
            : '<ha-icon icon="mdi:television"></ha-icon>'}</div>
          <div class="grow">
            <div class="t trunc">${on ? (app && app !== "Idle" ? app : "Home screen") : "Off"}</div>
            <div class="s trunc">${t.name}${on && srcNow ? " · " + srcNow : ""}</div>
          </div>
          <button class="pwr ${on ? "" : "off"}" type="button" id="pwr" aria-label="Power">
            <ha-icon icon="mdi:power"></ha-icon>
          </button>
        </div>

        ${!apps.length ? "" : `
          <span class="lbl">${on ? "Apps" : "Turn on and open"}</span>
          <div class="apps">
            ${apps.map((a) => `
              <button class="app ${on && a.name && app === a.name ? "live" : ""}"
                      type="button" data-app="${a.activity}">
                ${PC_BRANDS[a.brand] || '<ha-icon icon="mdi:application"></ha-icon>'}
                ${(a.name || "").toUpperCase()}
              </button>`).join("")}
          </div>`}

        ${!on ? `<div class="off-note">${t.name} is off. Tap an app to turn it on and open it.</div>` : `
          <div class="padwrap">
            <div class="pad" id="pad" tabindex="0" role="group" aria-label="Navigation trackpad">
              <div class="arw u"><ha-icon icon="mdi:chevron-up"></ha-icon></div>
              <div class="arw l"><ha-icon icon="mdi:chevron-left"></ha-icon></div>
              <div class="arw r"><ha-icon icon="mdi:chevron-right"></ha-icon></div>
              <div class="arw d"><ha-icon icon="mdi:chevron-down"></ha-icon></div>
              <div class="ok">OK</div>
            </div>
            ${hasPlayer ? `
              <div class="vrail">
                <button class="vstep" type="button" id="volup" aria-label="Volume up">
                  <ha-icon icon="mdi:plus"></ha-icon>
                </button>
                <button class="mute ${this._muted(t) ? "on" : ""}" type="button" id="mute" aria-label="Mute">
                  <ha-icon icon="${this._muted(t) ? "mdi:volume-off" : "mdi:volume-high"}"></ha-icon>
                </button>
                <button class="vstep" type="button" id="voldown" aria-label="Volume down">
                  <ha-icon icon="mdi:minus"></ha-icon>
                </button>
              </div>` : ""}
          </div>

          ${this._srcOpen && srcList ? `
            <div class="srcs">
              ${srcList.map((n) => `
                <button type="button" data-src="${n}" class="${n === srcNow ? "sel" : ""}">${n}</button>
              `).join("")}
            </div>`
            : `<div class="hint">swipe to move · tap to select · hold an edge to repeat</div>`}

          <div class="krow">
            ${key("mdi:arrow-u-left-top", "BACK", "Back")}
            ${key("mdi:home", "HOME", "Home")}
            <button class="hero" type="button" data-cmd="MEDIA_PLAY_PAUSE" aria-label="Play or pause">
              <ha-icon icon="mdi:play-pause"></ha-icon><em>Play</em>
            </button>
            ${srcList ? `
              <button type="button" id="src" class="${this._srcOpen ? "hot" : ""}"
                      aria-expanded="${this._srcOpen ? "true" : "false"}" aria-label="Choose input">
                <ha-icon icon="mdi:video-input-hdmi"></ha-icon><em>Input</em>
              </button>` : key("mdi:menu", "MENU", "Menu")}
          </div>
        `}
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-sel]").forEach((el) => {
      el.addEventListener("click", () => {
        this._touched = true;
        this._sel = parseInt(el.dataset.sel, 10);
        pcHaptic("light");
        this._render();
      });
    });
    /* Deliberately NOT _bindRepeat. Repeat belongs to the two controls whose
       job is to travel — the pad and the volume rail. A held Back that spammed
       Back, or a held Play that toggled play/pause twenty times, is the repeat
       feature doing damage rather than work. */
    this.shadowRoot.querySelectorAll("[data-cmd]").forEach((el) => {
      el.addEventListener("click", () => { pcHaptic("light"); this._send(el.dataset.cmd); });
    });
    this.shadowRoot.querySelectorAll("[data-app]").forEach((el) => {
      el.addEventListener("click", () => { pcHaptic("medium"); this._launch(el.dataset.app); });
    });
    const pad = this.shadowRoot.getElementById("pad");
    if (pad) this._bindPad(pad);
    const p = this.shadowRoot.getElementById("pwr");
    if (p) p.addEventListener("click", () => { pcHaptic("heavy"); this._power(); });
    const m = this.shadowRoot.getElementById("mute");
    if (m) m.addEventListener("click", () => { pcHaptic("medium"); this._toggleMute(); });
    const s = this.shadowRoot.getElementById("src");
    if (s) s.addEventListener("click", () => {
      pcHaptic("light");
      this._srcOpen = !this._srcOpen;
      this._render();
    });
    this.shadowRoot.querySelectorAll("[data-src]").forEach((el) => {
      el.addEventListener("click", () => { pcHaptic("medium"); this._selectSource(el.dataset.src); });
    });
    const vu = this.shadowRoot.getElementById("volup");
    if (vu) this._bindRepeat(vu, () => this._step(1), "light");
    const vd = this.shadowRoot.getElementById("voldown");
    if (vd) this._bindRepeat(vd, () => this._step(-1), "light");

    this._fitPad();
  }

  /* ---- fitting the remote to the sheet it is hosted in --------------------
   *
   * Hosted in the Media sheet the Watch face overflowed by 13px on a 390x844
   * phone and by more on a shorter one: a scrollbar down the side of a REMOTE,
   * where the whole point is that every key is under the thumb without
   * hunting for it. The sheet is already at its own ceiling — .ps-sheet.tall
   * is min(80vh, sheettop - 24px) and the 24px is what keeps the greeting
   * visible behind it — so the height has to come out of the card.
   *
   * It is MEASURED rather than shaved to a number that fits this house. The
   * chrome above and below the pad is whatever the config makes it: one TV or
   * three (the selector appears only above one), apps or none, the source
   * picker open (34px) or the hint (12px). A constant tuned on one of those
   * shapes is wrong for all the others, and wrong again on the next phone.
   *
   * One read and one write per render, no re-render, so it cannot loop: the
   * innerHTML rewrite puts the pad back at PC_PAD_MAX every time, which means
   * every pass measures the same starting point rather than compounding.
   * Positive slack grows it back, so closing the source picker returns the
   * pad to full size rather than leaving it shrunk. */
  _fitPad() {
    const pad = this.shadowRoot.getElementById("pad");
    if (!pad) return;
    const sc = this._scroller();
    if (!sc) return;
    const slack = sc.clientHeight - sc.scrollHeight;
    if (!slack) return;
    const cur = pad.getBoundingClientRect().height;
    /* Zero means we are not laid out yet — a detached render, or the harness
       measuring before the sheet is attached. Guessing from zero would pin the
       pad at its minimum and leave it there. */
    if (!cur) return;
    const next = Math.max(PC_PAD_MIN, Math.min(PC_PAD_MAX, Math.round(cur + slack)));
    if (Math.abs(next - cur) >= 1) pad.style.height = next + "px";
  }

  /* The nearest scrolling ancestor, crossing shadow boundaries — the card sits
     inside the shell's shadow root, so parentElement runs out before the sheet
     does. html/body are deliberately NOT accepted: standing alone on a page the
     card should keep its full-size pad and let the page scroll. */
  _scroller() {
    let n = this;
    for (let i = 0; i < 12; i++) {
      const root = n.getRootNode ? n.getRootNode() : null;
      n = n.parentElement || (root && root.host) || null;
      if (!n || n === document.body || n === document.documentElement) return null;
      const ov = getComputedStyle(n).overflowY;
      if (ov === "auto" || ov === "scroll") return n;
    }
    return null;
  }

  /* Rotating the phone with the sheet open changes the height the pad was fitted
     to, and nothing else would repaint until the next state change. Nulled on
     disconnect so a reconnect can tell it is stopped rather than stacking a
     second listener — Lovelace detaches this element, it does not destroy it. */
  connectedCallback() {
    /* The sheet builds this card once and ATTACHES it after the patch, so the
       first _render runs on a detached element: nothing is laid out, the
       measurement reads zero and the fit is skipped. Refit on the frame after
       attach, when the sheet has its height and --ps-dockh has been written. */
    requestAnimationFrame(() => this._fitPad());
    if (this._onResize) return;
    this._onResize = () => this._fitPad();
    window.addEventListener("resize", this._onResize);
  }

  disconnectedCallback() {
    if (!this._onResize) return;
    window.removeEventListener("resize", this._onResize);
    this._onResize = null;
  }

  /* The app sensor reports a friendly name ("Twitch"); the config knows which
     brand mark goes with it. Matched by name so the artwork tile and the grid
     agree about what is open. */
  _brandFor(app) {
    const hit = (this._config.apps || []).find((a) => a.name === app);
    return hit ? hit.brand : null;
  }

  getCardSize() {
    return 12;
  }
}
