/* ============================================================================
 * purdy-desk2-card — styles
 *
 * APPENDED to the shell's sheet, never interleaved with it: the drawer is
 * shell markup, so the shell's rules must all be present, and these must come
 * after them to win at equal specificity. Re-ordering the shell sheet would
 * quietly change the cascade for the phone.
 *
 * Sizes, radii and fills come from PC_TOKENS. Pick a step; do not invent one.
 * ========================================================================== */

const PD2_STYLES = `
      :host {
        --pd-off: 16px;
        display: block;
        height: calc(100dvh - var(--pd-off));
        min-height: 0;
        padding: 0;
        overflow: hidden;
        container-type: size;
        container-name: pd2;
      }
      .pd2-frame { position: relative; height: 100%; display: flex; gap: 16px; padding: 20px 20px 20px 16px; }

      /* the rail: the phone's dock, stood on end */
      .pd2-rail {
        align-self: center; width: 64px; flex: 0 0 64px; border-radius: var(--pc-r-2xl);
        padding: 12px 0; display: flex; flex-direction: column; align-items: center; gap: 8px;
        background: linear-gradient(180deg, rgba(16,20,34,.42), rgba(10,12,22,.50));
        backdrop-filter: blur(28px) saturate(1.5); -webkit-backdrop-filter: blur(28px) saturate(1.5);
        border: 1px solid rgba(255,255,255,.09);
        box-shadow: 0 20px 50px -20px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.09);
      }
      .pd2-rb { width: 44px; height: 44px; border-radius: var(--pc-r-md); color: var(--ps-muted);
        display: flex; align-items: center; justify-content: center; position: relative; }
      .pd2-rb:hover { background: var(--pc-fill-1); color: var(--ps-text); }
      .pd2-rb ha-icon { --mdc-icon-size: 21px; }
      .pd2-rb.on { color: #fff; background: rgba(139,124,255,.14); }
      .pd2-rb.on::after { content: ""; position: absolute; left: -12px; top: 12px; bottom: 12px; width: 3px;
        border-radius: var(--pc-r-hair); background: linear-gradient(180deg, var(--ps-aur-a), var(--ps-aur-b));
        box-shadow: 0 0 12px rgba(139,124,255,.9); }
      .pd2-rb.alert { color: var(--ps-bad); }
      .pd2-rb.alert ha-icon { filter: drop-shadow(0 0 6px rgba(242,122,131,.6)); }
      .pd2-rsep { width: 24px; height: 1px; background: var(--pc-edge); margin: 4px 0; }

      /* the glass: one smoked sheet, hairlines only, no per-panel backgrounds */
      .pd2-glass {
        flex: 1; min-width: 0; position: relative; border-radius: 28px; overflow: hidden;
        display: flex; flex-direction: column;
        background:
          linear-gradient(0deg, rgba(9,11,20,.52), transparent 140px),
          linear-gradient(180deg, rgba(16,20,34,.34), rgba(10,12,22,.28));
        backdrop-filter: blur(30px) saturate(1.5); -webkit-backdrop-filter: blur(30px) saturate(1.5);
        border: 1px solid rgba(255,255,255,.09);
        box-shadow: 0 30px 70px -24px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.09);
      }
      .pd2-glass::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 120px; pointer-events: none;
        background: linear-gradient(180deg, rgba(139,124,255,.07), transparent 85%); }
      .pd2-hhair { height: 1px; flex: 0 0 1px; margin: 0 24px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.10) 10%, rgba(255,255,255,.10) 90%, transparent); }
      .pd2-hhair.in { margin: 2px -8px; }
      .pd2-vhair { width: 1px; background: linear-gradient(180deg, transparent, rgba(255,255,255,.10) 12%, rgba(255,255,255,.10) 88%, transparent); }

      /* header — one line */
      .pd2-head { display: flex; align-items: center; gap: 26px; padding: 22px 30px 18px; position: relative; flex: 0 0 auto; }
      .pd2-hl h1 { margin: 0; font-size: var(--pc-fs-3xl); font-weight: 300; letter-spacing: -.025em; line-height: 1.05; white-space: nowrap; }
      .pd2-hl h1 b { font-weight: 650; background: linear-gradient(90deg, var(--ps-aur-a), var(--ps-aur-b));
        -webkit-background-clip: text; background-clip: text; color: transparent; }
      .pd2-date { margin-top: 7px; font-size: var(--pc-fs-md); color: var(--ps-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .pd2-date i, .pd2-status i { font-style: normal; color: var(--ps-dim); margin: 0 6px; }
      .pd2-ppl .ps-pav { gap: 12px; }
      .pd2-hr { margin-left: auto; display: flex; align-items: center; gap: 16px; }
      .pd2-hwx { display: flex; align-items: center; gap: 10px; cursor: pointer; }
      .pd2-hwx ha-icon { --mdc-icon-size: 30px; color: #9fb3c6; }
      .pd2-hwx b { display: block; font-size: var(--pc-fs-3xl); font-weight: 200; letter-spacing: -.03em; color: #BDEBF2; line-height: 1; font-variant-numeric: tabular-nums; }
      .pd2-hwx span { display: block; margin-top: 4px; font-size: var(--pc-fs-micro); font-weight: 650; letter-spacing: .1em;
        text-transform: uppercase; color: var(--ps-dim); white-space: nowrap; }

      /* the stage */
      .pd2-stage { flex: 1; min-height: 0; display: grid;
        grid-template-columns: minmax(0, 1.3fr) 1px minmax(0, 1fr) 1px minmax(0, .85fr);
        grid-template-rows: auto minmax(0, 1fr);
        grid-template-areas: "joel h1 clim h2 side" "joel h1 wx h2 side"; }
      .pd2-joel { grid-area: joel; } .pd2-clim { grid-area: clim; } .pd2-wx { grid-area: wx; }
      .pd2-side { grid-area: side; }
      .pd2-vhair.h1 { grid-area: h1; } .pd2-vhair.h2 { grid-area: h2; } .pd2-vhair.h3 { grid-area: h3; display: none; }
      .pd2-col { min-width: 0; min-height: 0; padding: 22px 26px; display: flex; flex-direction: column; gap: 16px; overflow: hidden; }
      .pd2-col.pd2-wx { border-top: 1px solid rgba(255,255,255,.07); padding-top: 16px; gap: 10px; }
      .pd2-wide { display: none; }
      .pd2-glass.moded .pd2-stage, .pd2-glass.moded .pd2-head, .pd2-glass.moded > .pd2-hhair { display: none; }
      .pd2-mode { display: none; }
      .pd2-glass.moded .pd2-mode { display: flex; flex-direction: column; flex: 1; min-height: 0; }

      /* compact: 1366 and under */
      @container pd2 (max-width: 1366px) {
        .pd2-stage { grid-template-columns: minmax(0, 1.2fr) 1px minmax(0, 1fr) 1px minmax(0, .8fr); }
        .pd2-col { padding: 18px 22px; gap: 13px; }
        .pd2-side .pd2-ahead, .pd2-side .pd2-ahead + .pd2-hhair { display: none; }
        .pd2-col.pd2-wx .ps-wxi { display: none; }
        .pd2-col.pd2-wx .ps-wxday { gap: 3px; }
        .pd2-hl h1 { font-size: var(--pc-fs-2xl); }
        .pd2-room { padding: 4px 0; }
      }
      .pd2-hrow.compact-only { display: none; }
      @container pd2 (max-width: 1366px) { .pd2-hrow.compact-only { display: flex; } }
      /* wide: 1800 and over — weather gets its own column */
      @container pd2 (min-width: 1800px) {
        .pd2-stage { grid-template-columns: minmax(0, 1.25fr) 1px minmax(0, 1fr) 1px minmax(0, 1fr) 1px minmax(0, .9fr);
          grid-template-areas: "joel h1 clim h2 wx h3 side" "joel h1 clim h2 wx h3 side"; }
        .pd2-vhair.h3 { display: block; }
        .pd2-col.pd2-wx { border-top: 0; padding-top: 22px; }
        .pd2-wide { display: flex; flex-direction: column; }
        .pd2-col.pd2-wx .ps-railbox { flex: 0 0 auto; }
        .pd2-col.pd2-wx .ps-wxtrack { flex: 0 0 auto; height: 240px; }
      }

      /* short: the width queries above pick the columns, these pick the
         vertical rhythm. A laptop with the HA header showing leaves ~660px,
         and every column clipped its last row — the verdict, the forecast,
         the last House row. Squeeze the air first, the rings second. */
      @container pd2 (max-height: 820px) {
        .pd2-frame { padding-top: 14px; padding-bottom: 14px; }
        .pd2-head { padding: 16px 28px 13px; }
        .pd2-date { margin-top: 4px; }
        .pd2-col { padding-top: 16px; padding-bottom: 16px; gap: 12px; }
        .pd2-col.pd2-wx { padding-top: 12px; gap: 8px; }
        .pd2-jbtn { gap: 12px; }
        .pd2-clim .pd2-ring svg { width: 136px; height: 136px; }
        .pd2-room { padding: 3px 0; }
        .pd2-last { padding: 10px 16px; }
        .pd2-verdict { padding: 9px 16px; }
        .pd2-np { padding: 8px; }
        .pd2-hrow { padding-top: 6px; padding-bottom: 6px; }
      }
      @container pd2 (max-height: 700px) {
        /* The Joel column has air to spare; the climate column is the one
           that runs out, so its ring gives the most. Each ring's figure
           steps down with it so "11h 23m" stays inside the arc. */
        .pd2-hl h1 { font-size: var(--pc-fs-2xl); }
        .pd2-joel .pd2-ring svg { width: 156px; height: 156px; }
        .pd2-clim .pd2-ring svg { width: 120px; height: 120px; }
        .pd2-rv b { font-size: var(--pc-fs-2xl); }
        .pd2-rv small { margin-top: 3px; }
        .pd2-clim .pd2-rv small { letter-spacing: .04em; }
        .pd2-jtop { gap: 18px; }
        .pd2-goal { gap: 6px; }
        .pd2-step .ps-step { width: 34px; height: 34px; }
        .pd2-seg { padding: 5px 4px; }
        .pd2-last b { font-size: var(--pc-fs-lg); }
        .pd2-ahead { gap: 6px; }
      }

      /* labels */
      .pd2-lblrow { display: flex; align-items: center; gap: 10px; }
      .pd2-lblrow .ps-chip { margin-left: auto; }
      .pd2-lbl { font-size: var(--pc-fs-micro); letter-spacing: .15em; text-transform: uppercase; font-weight: 700;
        color: var(--ps-dim); display: flex; align-items: center; gap: 7px; }
      .pd2-lbl::before { content: ""; width: 10px; height: 2px; border-radius: var(--pc-r-hair);
        background: linear-gradient(90deg, var(--ps-aur-a), var(--ps-aur-b)); }
      .pd2-cap { font-size: var(--pc-fs-micro); font-weight: 700; letter-spacing: .12em; color: var(--ps-dim); }
      .pd2-src { margin-left: auto; font-size: var(--pc-fs-xs); color: var(--ps-dim); white-space: nowrap; }
      .pd2-ring { position: relative; flex: 0 0 auto; }
      .pd2-ring svg { display: block; }
      .pd2-rv { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .pd2-rv b { font-size: var(--pc-fs-3xl); font-weight: 250; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; }
      .pd2-rv small { font-size: var(--pc-fs-micro); font-weight: 700; letter-spacing: .14em; color: var(--ps-dim); margin-top: 6px; white-space: nowrap; }
      .pd2-ring.sm .pd2-rv b { font-weight: 200; }
      .pd2-rv b u { text-decoration: none; font-size: var(--pc-fs-xl); font-weight: 400; margin: 0 1px; color: var(--ps-muted); }
      .pd2-ppl .ps-pv { transform: scale(1.35); margin: 0 4px; }

      /* joel */
      .pd2-jbtn { display: flex; flex-direction: column; gap: 18px; cursor: pointer; min-height: 0; flex: 1;
        border-radius: var(--pc-r-lg); margin: -6px; padding: 6px; }
      .pd2-jbtn:hover { background: rgba(255,255,255,.02); }
      .pd2-jbtn:focus-visible { outline: 2px solid var(--ps-cool); outline-offset: 2px; }
      .pd2-jtop { display: flex; align-items: center; gap: 24px; }
      .pd2-naps { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
      .pd2-nap { display: flex; align-items: center; gap: 12px; }
      .pd2-nap b { display: block; font-size: var(--pc-fs-lg); font-weight: 500; font-variant-numeric: tabular-nums; }
      .pd2-nap span { display: block; font-size: var(--pc-fs-xs); color: var(--ps-dim); margin-top: 1px; white-space: nowrap; }
      .pd2-flat { font-size: var(--pc-fs-sm); color: var(--ps-dim); }
      .pd2-status { font-size: var(--pc-fs-md); color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .pd2-last { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 13px 16px;
        border-radius: var(--pc-r-lg); background: var(--pc-fill-1); }
      .pd2-last span { display: block; font-size: var(--pc-fs-micro); font-weight: 700; letter-spacing: .12em;
        text-transform: uppercase; color: var(--ps-dim); white-space: nowrap; }
      .pd2-last b { display: block; margin-top: 4px; font-size: var(--pc-fs-xl); font-weight: 300; font-variant-numeric: tabular-nums; }
      .pd2-verdict { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--pc-r-md);
        background: linear-gradient(90deg, rgba(86,212,228,.10), rgba(139,124,255,.13)); border: 1px solid rgba(139,124,255,.18);
        font-size: var(--pc-fs-md); margin-top: auto; }
      .pd2-verdict b { font-weight: 600; }
      .pd2-verdict > span:last-child { color: var(--ps-muted); }
      .pd2-verdict.good .ps-dot { background: var(--ps-good); box-shadow: 0 0 8px rgba(127,216,164,.8); }
      .pd2-verdict.warn .ps-dot { background: var(--ps-warn); }

      /* climate */
      .pd2-chero { display: flex; align-items: center; gap: 20px; }
      .pd2-goal { display: flex; flex-direction: column; gap: 9px; flex: 1; min-width: 0; }
      .pd2-step { display: flex; align-items: center; gap: 8px; }
      .pd2-step b { flex: 1; text-align: center; font-size: var(--pc-fs-2xl); font-weight: 300; font-variant-numeric: tabular-nums; }
      .pd2-step .ps-step { width: 40px; height: 40px; border-radius: var(--pc-r-sm); background: var(--pc-fill-2);
        display: flex; align-items: center; justify-content: center; }
      .pd2-segs { display: grid; grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); gap: 3px; padding: 3px;
        border-radius: var(--pc-r-sm); background: var(--pc-fill-1); }
      .pd2-seg { padding: 7px 4px; font-size: var(--pc-fs-sm); font-weight: 600; color: var(--ps-muted);
        border-radius: var(--pc-r-xs); text-align: center; white-space: nowrap; }
      .pd2-seg.on { background: rgba(86,212,228,.16); color: var(--ps-cool); }
      .pd2-link { align-self: flex-start; font-size: var(--pc-fs-sm); font-weight: 600; color: var(--ps-cool); padding: 2px 0; }
      .pd2-rooms { display: flex; flex-direction: column; min-height: 0; }
      .pd2-room { display: grid; grid-template-columns: minmax(0, 1fr) 60px 56px 38px; align-items: center; gap: 10px;
        padding: 6px 0; font-size: var(--pc-fs-md); cursor: pointer; }
      .pd2-room.hd { font-size: var(--pc-fs-micro); font-weight: 700; letter-spacing: .12em; color: var(--ps-dim); cursor: default; padding-bottom: 2px; }
      .pd2-room.hd span:nth-child(3), .pd2-room.hd span:nth-child(4) { text-align: right; }
      .pd2-rn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pd2-spark { height: 22px; border-radius: 5px; background: rgba(255,255,255,.035); display: block; overflow: hidden; }
      .pd2-spark svg { width: 100%; height: 100%; display: block; }
      .pd2-rt { text-align: right; font-size: var(--pc-fs-lg); font-variant-numeric: tabular-nums; }
      .pd2-rh { text-align: right; color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .pd2-room.off .pd2-rn { color: var(--ps-muted); }
      .pd2-room.off .pd2-rt { color: var(--ps-dim); font-size: var(--pc-fs-sm); }
      .pd2-room.off .pd2-spark { background: repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 3px, transparent 3px 7px); }
      .pd2-graph .ps-wave { max-height: 240px; }

      /* weather: the phone rail, sized for a column */
      /* The phone's track is a fixed 116px; here the column's own height
         decides, so the rail fills what the row leaves and never clips. */
      .pd2-col.pd2-wx .ps-railbox { padding: 8px 6px; flex: 1 1 auto; min-height: 0; display: flex; }
      .pd2-col.pd2-wx .ps-wxrail { flex: 1; min-height: 0; }
      .pd2-col.pd2-wx .ps-wxday { min-height: 0; }
      .pd2-col.pd2-wx .ps-wxtrack { flex: 1 1 auto; height: auto; min-height: 36px; max-height: 260px; }
      .ps-wxpcp.wet { color: var(--ps-warn); }
      .pd2-facts { gap: 8px; font-size: var(--pc-fs-md); margin-top: 4px; }
      .pd2-facts div { display: flex; justify-content: space-between; gap: 12px; }
      .pd2-facts span { color: var(--ps-muted); }
      .pd2-facts b { font-weight: 500; text-align: right; font-variant-numeric: tabular-nums; }

      /* side */
      .pd2-np { display: flex; align-items: center; gap: 13px; padding: 11px; border-radius: var(--pc-r-lg);
        background: var(--pc-fill-1); cursor: pointer; }
      .pd2-np + .pd2-np { margin-top: -8px; }
      .pd2-np.quiet { background: transparent; padding: 4px 0; }
      .pd2-art { width: 46px; height: 46px; flex: 0 0 46px; border-radius: var(--pc-r-sm); overflow: hidden;
        background: var(--pc-fill-2); display: flex; align-items: center; justify-content: center; color: var(--ps-dim); }
      .pd2-art.app img, .pd2-art.app svg { width: 70%; height: 70%; object-fit: contain; }
      .pd2-npt { font-size: var(--pc-fs-lg); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pd2-nps { font-size: var(--pc-fs-sm); color: var(--ps-dim); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pd2-pill { padding: 9px 12px; border-radius: var(--pc-r-sm); background: var(--pc-fill-2); font-size: var(--pc-fs-sm); font-weight: 650; }
      .pd2-ahead { display: flex; flex-direction: column; gap: 10px; }
      .pd2-aday { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 10px; }
      .pd2-aday > span { font-size: var(--pc-fs-xs); font-weight: 700; letter-spacing: .06em; color: var(--ps-muted); padding-top: 2px; }
      .pd2-aday > span.today { color: var(--ps-text); }
      .pd2-ev { display: flex; gap: 8px; align-items: baseline; font-size: var(--pc-fs-sm); line-height: 1.35; }
      .pd2-ev + .pd2-ev { margin-top: 4px; }
      .pd2-ev i { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 6px; transform: translateY(-1px); }
      .pd2-ev em { font-style: normal; color: var(--ps-dim); width: 54px; flex: 0 0 54px; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .pd2-ev span { min-width: 0; }
      .pd2-ev.none { color: var(--ps-dim); }
      .pd2-house { display: flex; flex-direction: column; margin: -6px -12px 0; }
      .pd2-hrow { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: var(--pc-r-sm); text-align: left; min-width: 0; }
      button.pd2-hrow:hover { background: var(--pc-fill-1); }
      .pd2-hrow b { font-size: var(--pc-fs-md); font-weight: 600; width: 76px; flex: 0 0 76px; white-space: nowrap; }
      /* Wraps to a second line rather than ellipsising: a truncated detail is a
         MISSING detail ("F1 RACE…" said nothing about which race). */
      .pd2-hrow { align-items: flex-start; }
      .pd2-hrow .pd2-dot { margin-top: 6px; }
      .pd2-hrow > span:last-child { font-size: var(--pc-fs-sm); color: var(--ps-muted); flex: 1; min-width: 0;
        line-height: 1.4; padding-top: 1px; font-variant-numeric: tabular-nums;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .pd2-hrow > span.warn { color: var(--ps-warn); }
      .pd2-hrow > span.bad { color: var(--ps-bad); }
      .pd2-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: rgba(255,255,255,.25); }
      .pd2-dot.good { background: var(--ps-good); }
      .pd2-dot.warn { background: var(--ps-warn); }
      .pd2-dot.bad { background: var(--ps-bad); }
      .pd2-dot.cool { background: var(--ps-cool); }
      .pd2-dot.lit { background: #ffc27d; box-shadow: 0 0 8px rgba(255,178,102,.7); }
      .pd2-dot.aur { background: var(--ps-aur-b); }

      /* the drawer: the shell's sheet, moved to the right edge at full stage
         height. It slides over the side column; the scrim over the rest of the
         stage is what a click outside it lands on. */
      .ps-scrim { background: rgba(4,5,11,.40); backdrop-filter: none; }
      .ps-sheet, .ps-sheet.tall {
        left: auto; right: 24px; top: calc(var(--pd-off) + 24px); bottom: 24px; width: 460px; max-width: calc(100vw - 48px);
        max-height: none; border-radius: 28px; padding: 20px 22px;
        background: linear-gradient(180deg, rgba(18,22,38,.86), rgba(10,12,22,.93));
        box-shadow: -30px 0 80px -20px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.09);
      }
      .ps-sheeth { margin-bottom: 12px; }
      .pd2-jsheet .ps-sect { padding: 0; }
      .pd2-jsheet .ps-sect > .ps-sh { display: none; }

      /* the server, as tabs across the top of the panel instead of a dock */
      .pd2-mode .ps-stat { padding: 22px 30px 6px; }
      .pd2-mode .ps-dockwrap { position: static; padding: 0 26px 10px; }
      .pd2-mode .ps-dockwrap::before, .pd2-mode .ps-mini { display: none; }
      .pd2-mode .ps-dock { justify-content: flex-start; gap: 6px; background: none; border: 0; box-shadow: none;
        backdrop-filter: none; -webkit-backdrop-filter: none; padding: 0; }
      .pd2-mode .ps-db { flex: 0 0 auto; flex-direction: row; gap: 8px; padding: 9px 14px; border-radius: var(--pc-r-sm); }
      .pd2-mode .ps-db span { font-size: var(--pc-fs-sm); }
      .pd2-mode .ps-db.on { background: rgba(139,124,255,.14); }
      .pd2-mode .ps-db.on::after { display: none; }
      .pd2-mode .ps-db.home { display: none; }
      .pd2-mode .ps-col { flex: 1; min-height: 0; overflow-y: auto; background: none; border: 0; box-shadow: none;
        backdrop-filter: none; -webkit-backdrop-filter: none; border-radius: 0; padding: 0 16px 16px; }
      .pd2-mode .ps-col::before { display: none; }
      .pd2-mode .ps-sypage { max-width: 1100px; }
    `;
