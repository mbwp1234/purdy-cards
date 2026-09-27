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
        align-self: center; width: 72px; flex: 0 0 72px; border-radius: var(--pc-r-2xl);
        padding: 12px 0; display: flex; flex-direction: column; align-items: center; gap: 8px;
        background: linear-gradient(180deg, rgba(16,20,34,.42), rgba(10,12,22,.50));
        backdrop-filter: blur(28px) saturate(1.5); -webkit-backdrop-filter: blur(28px) saturate(1.5);
        border: 1px solid rgba(255,255,255,.09);
        box-shadow: 0 20px 50px -20px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.09);
      }
      .pd2-rb { width: 60px; height: 52px; border-radius: var(--pc-r-md); color: var(--ps-muted);
        display: flex; flex-direction: column; gap: 3px; align-items: center; justify-content: center; position: relative; }
      .pd2-rb span { font-size: var(--pc-fs-micro); font-weight: 600; letter-spacing: .02em; white-space: nowrap; }
      .pd2-rb:focus-visible { outline: 2px solid var(--ps-cool); outline-offset: 1px; }
      .pd2-badge { position: absolute; top: 3px; right: 9px; min-width: 15px; height: 15px; padding: 0 4px;
        border-radius: var(--pc-r-pill); background: var(--ps-bad); color: #fff; font-style: normal;
        font-size: var(--pc-fs-micro); font-weight: 700; line-height: 15px; text-align: center; }
      .pd2-badge.log { background: var(--ps-warn); color: #1b1300; }
      .pd2-rb:hover { background: var(--pc-fill-1); color: var(--ps-text); }
      .pd2-rb ha-icon { --mdc-icon-size: 20px; }
      .pd2-rb.on { color: #fff; background: rgba(139,124,255,.14); }
      .pd2-rb.on::after { content: ""; position: absolute; left: -6px; top: 12px; bottom: 12px; width: 3px;
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
      /* The faults, named, in the header's middle. Empty when nothing is
         raised — the absence of chips is the all-clear. */
      .pd2-att { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
      .pd2-att .ps-chip { margin: 0; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
        .pd2-col.pd2-wx .ps-wxi { display: none; }
        .pd2-col.pd2-wx .ps-wxday { gap: 3px; }
        .pd2-hl h1 { font-size: var(--pc-fs-2xl); }
        .pd2-room { padding: 4px 0; }
      }
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

      /* tall: 1000px of glass and more. The extra height goes to real content
         — the night's own rail under Joel, the 24h graph in Climate, the
         crew's rings under House — rather than to gaps above each column's
         last row. */
      .pd2-tall { display: none; }
      @container pd2 (min-height: 1000px) {
        .pd2-tall { display: block; }
        .pd2-clim .pd2-wide.pd2-graph { display: flex; flex-direction: column; }
      }
      .pd2-crewmini { cursor: pointer; border-radius: var(--pc-r-lg); }
      .pd2-crewmini > * { pointer-events: none; }
      .pd2-crewmini:hover { background: rgba(255,255,255,.02); }

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
        /* The climate column is the one that runs out. The reason line is
           what the ring and the chip already say in other words, so it goes
           first; the season switch shrinks to the Schedule link's height. */
        .pd2-reason { display: none; }
        .pd2-cbtns .ps-sbtn { padding: 4px 12px; }
        .pd2-room { padding: 1px 0; }
        .pd2-spark { height: 18px; }
        .pd2-goal > .pd2-cap { display: none; }
        .pd2-rooms .pd2-room.hd { padding-bottom: 0; }
        .pd2-col.pd2-wx .ps-wxi { display: none; }
      }

      /* doors: a label or a whole column that opens its phone section */
      button.pd2-lbl { padding: 0; }
      .pd2-lbl em { font-style: normal; font-size: var(--pc-fs-sm); color: var(--ps-dim); margin-left: 2px; transition: transform .15s; }
      .pd2-open:hover, .pd2-colbtn:hover .pd2-lbl { color: var(--ps-text); }
      .pd2-open:hover em, .pd2-colbtn:hover .pd2-lbl em { color: var(--ps-cool); transform: translateX(2px); }
      .pd2-open:focus-visible, .pd2-colbtn:focus-visible, .pd2-hwx:focus-visible { outline: 2px solid var(--ps-cool); outline-offset: 3px; border-radius: var(--pc-r-xs); }
      .pd2-colbtn { display: flex; flex-direction: column; gap: inherit; flex: 1; min-height: 0; cursor: pointer;
        border-radius: var(--pc-r-lg); margin: -6px; padding: 6px; }
      .pd2-colbtn:hover { background: rgba(255,255,255,.02); }
      .pd2-chips { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; min-width: 0; }
      .pd2-lblrow .pd2-chips .ps-chip { margin-left: 0; }
      .pd2-reason { font-size: var(--pc-fs-sm); color: var(--ps-muted); }
      /* His week at every height — hidden, it left the Joel column an 80px
         gap above the verdict on exactly the windows used most. Below 880px
         it draws thin: bars without the legend. */
      .pd2-week { display: block; }
      @container pd2 (max-height: 819px) {
        .pd2-week .ps-jrsl { height: 10px; }
        .pd2-week .ps-jrsb, .pd2-week .ps-jrsgh { height: 8px; top: 1px; }
        .pd2-week .ps-jrsw { gap: 2px; }
        .pd2-week .ps-jrsd { line-height: 10px; }
        .pd2-week .ps-jrslg, .pd2-week .ps-jrsx { display: none; }
        .pd2-week .ps-hypt { display: none; }
      }
      .pd2-week .ps-lbl { font-size: var(--pc-fs-micro); }
      .pd2-mode .ps-sygraph svg { height: 110px; }
      .pd2-cbtns { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .pd2-cbtns .ps-season { background: var(--pc-fill-1); }
      .pd2-cbtns .ps-sbtn { padding: 6px 13px; }
      .pd2-wlg { margin: 0 0 0 auto; font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .pd2-more { display: flex; justify-content: space-between; width: 100%; margin-top: 14px; padding: 12px 14px;
        border-radius: var(--pc-r-md); background: var(--pc-fill-1); font-size: var(--pc-fs-sm); color: var(--ps-muted); }
      .pd2-more span:last-child { color: var(--ps-cool); font-weight: 600; }
      .pd2-shchips { display: flex; gap: 6px; margin-left: auto; margin-right: 10px; }

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
      .pd2-rv small.pd2-rv2 { margin-top: 2px; }
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
      .pd2-rn small { display: block; font-size: var(--pc-fs-micro); color: var(--ps-dim); margin-top: 1px; }
      .pd2-room.via .pd2-spark { background: repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 3px, transparent 3px 7px); }
      .pd2-room.off .pd2-rn { color: var(--ps-muted); }
      .pd2-room.off .pd2-rt { color: var(--ps-warn); font-size: var(--pc-fs-sm); white-space: nowrap; }
      .pd2-room.off .pd2-spark { background: repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 3px, transparent 3px 7px); }
      .pd2-graph .ps-wave { max-height: 240px; margin: 6px 0 0; }
      .pd2-hourly { min-width: 0; }

      /* weather: the phone rail, sized for a column */
      /* The phone's track is a fixed 116px; here the column's own height
         decides, so the rail fills what the row leaves and never clips. */
      .pd2-col.pd2-wx .ps-railbox { padding: 8px 6px; flex: 1 1 auto; min-height: 0; display: flex; }
      .pd2-col.pd2-wx .ps-wxrail { flex: 1; min-height: 0; }
      .pd2-col.pd2-wx .ps-wxday { min-height: 0; }
      .pd2-col.pd2-wx .ps-wxtrack { flex: 1 1 auto; height: auto; min-height: 36px; max-height: 260px; }
      .ps-wxpcp.wet { color: var(--ps-warn); }
      @container pd2 (min-width: 1800px) {
        .pd2-col.pd2-wx .ps-railbox { flex: 0 0 auto; }
        .pd2-col.pd2-wx .ps-wxtrack { flex: 0 0 auto; height: 220px; max-height: none; }
      }
      .pd2-wxrows { display: none; gap: 2px; padding: 6px 10px; border-radius: var(--pc-r-md); background: var(--pc-fill-1); }
      .pd2-wxr { display: grid; grid-template-columns: 44px 30px minmax(0, 1fr) 30px 34px; align-items: center; gap: 8px;
        height: 20px; font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .pd2-wxr > span:first-child { color: var(--ps-text); font-weight: 600; }
      .pd2-wxr.now > span:first-child { color: var(--ps-cool); }
      .pd2-wxr b { color: var(--ps-text); font-weight: 600; text-align: right; }
      .pd2-wxr .lo { text-align: right; }
      .pd2-wxr .rng { position: relative; height: 6px; border-radius: var(--pc-r-pill); background: rgba(255,255,255,.06); }
      .pd2-wxr .rng i { position: absolute; top: 0; bottom: 0; border-radius: var(--pc-r-pill);
        background: linear-gradient(90deg, var(--ps-cool), var(--ps-heat)); }
      .pd2-wxr .rng i.stub { width: 4%; opacity: .75; }
      .pd2-wxr .rng i.none { display: none; }
      .pd2-wxr .rng i.meas { outline: 1px dashed rgba(255,255,255,.5); outline-offset: 1px; }
      .pd2-wxr .pp { color: var(--ps-cool); font-weight: 600; text-align: right; }
      .pd2-wxr .pp.wet { color: var(--ps-warn); }
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
      .pd2-npw { font-size: var(--pc-fs-micro); font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
        color: var(--ps-cool); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pd2-npt { font-size: var(--pc-fs-lg); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      /* Two lines rather than an ellipsis: a truncated line is a missing one. */
      .pd2-nps { font-size: var(--pc-fs-sm); color: var(--ps-dim); margin-top: 2px; line-height: 1.3;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .pd2-pill { padding: 9px 12px; border-radius: var(--pc-r-sm); background: var(--pc-fill-2); font-size: var(--pc-fs-sm); font-weight: 650; }
      .pd2-ahead { display: flex; flex-direction: column; gap: 10px; }
      .pd2-aday { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 10px; }
      .pd2-aday > span { font-size: var(--pc-fs-xs); font-weight: 700; letter-spacing: .06em; color: var(--ps-muted); padding-top: 2px; }
      .pd2-aday > span.today { color: var(--ps-text); }
      .pd2-aday > span em { display: block; font-style: normal; font-weight: 600; letter-spacing: .06em; color: var(--ps-dim);
        font-size: var(--pc-fs-micro); margin-top: 2px; text-transform: lowercase; }
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
      .pd2-hrow i { font-style: normal; }
      .pd2-short { display: none; }
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
      .pd2-jsheet .ps-sect, .pd2-csheet .ps-sect { padding: 0; }
      .pd2-jsheet .ps-sect > .ps-sh, .pd2-csheet .ps-sect > .ps-sh { display: none; }
      /* Joel's drawer is twice a phone: the section flows into two columns,
         today and his week on the left, last night and the naps on the right.
         Multicol rather than a grid, because the section's children are one
         flat list and a grid would align unrelated rows across the gutter. */
      .ps-sheet.pd2-jsheet { width: min(940px, calc(100% - 150px)); }
      .pd2-jsheet .ps-sect.open { columns: 2 380px; column-gap: 32px; column-rule: 1px solid rgba(255,255,255,.07); }
      .pd2-jsheet .ps-sect.open > .ps-xtra { display: contents; }
      .pd2-jsheet .ps-sect.open > *, .pd2-jsheet .ps-sect.open > .ps-xtra > * { break-inside: avoid; margin: 0 0 14px; }
      .ps-sheet.pd2-csheet { width: 520px; }
      .pd2-trends { display: flex; flex-direction: column; gap: 12px; }
      .pd2-tvs { display: grid; gap: 7px; padding: 12px 14px; border-radius: var(--pc-r-md); background: var(--pc-fill-1); }
      .pd2-tvs > div { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: baseline; font-size: var(--pc-fs-sm); }
      .pd2-tvs > div span { color: var(--ps-muted); }
      .pd2-tvs > div b { font-weight: 600; font-variant-numeric: tabular-nums; }
      .pd2-tvs > div em { font-style: normal; color: var(--ps-dim); font-size: var(--pc-fs-xs); min-width: 92px; text-align: right; }
      .pd2-tbox { padding: 12px 14px 10px; border-radius: var(--pc-r-md); background: var(--pc-fill-1); }
      .pd2-thd { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
      .pd2-thd em { font-style: normal; font-size: var(--pc-fs-xs); color: var(--ps-dim); }
      .pd2-tplot { position: relative; height: 96px; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; align-items: end; }
      .pd2-tplot.sm { height: 56px; }
      .pd2-tfloor { position: absolute; left: 2px; bottom: 2px; z-index: 1; font-size: var(--pc-fs-micro); color: var(--ps-dim); pointer-events: none; }
      .pd2-tband { position: absolute; left: 0; right: 0; background: rgba(127,216,164,.10);
        border-top: 1px dashed rgba(127,216,164,.45); border-bottom: 1px dashed rgba(127,216,164,.45); pointer-events: none; }
      .pd2-tc { display: block; position: relative; border-radius: 3px 3px 1px 1px; min-height: 3px; }
      .pd2-tc.night { background: var(--ps-deep); }
      .pd2-tc.night.edited { box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.35); }
      .pd2-tc.nap { background: var(--ps-light); }
      .pd2-tc.none { height: 100%; background: repeating-linear-gradient(135deg, rgba(255,255,255,.06) 0 3px, transparent 3px 7px); }
      .pd2-tc.away { height: 100%; border: 1px dashed rgba(255,255,255,.18); background: none; }
      .pd2-tdots { height: 46px; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; align-items: end; }
      .pd2-td { display: flex; flex-direction: column-reverse; gap: 3px; font-style: normal; }
      .pd2-td u { display: block; height: 5px; border-radius: 2px; background: var(--ps-warn); text-decoration: none; }
      .pd2-td u.q { background: none; border: 1px solid rgba(242,193,78,.55); }
      .pd2-td.none { height: 100%; background: repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 3px, transparent 3px 7px); border-radius: 3px; }
      .pd2-tax { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; margin-top: 5px;
        font-size: var(--pc-fs-micro); color: var(--ps-dim); text-align: center; }

      /* the server, as tabs across the top of the panel instead of a dock */
      .pd2-mode .ps-stat { padding: 22px 30px 6px; }
      .pd2-mode .ps-dockwrap { position: static; padding: 0 26px 10px; }
      .pd2-mode .ps-dockwrap::before { display: none; }
      /* Walking into a mode must not take the pause button away — the phone
         keeps its now-playing bar across modes, and so does the desk: at the
         right-hand end of the tab row. */
      .pd2-mode .ps-dockwrap { display: flex; flex-direction: row-reverse; justify-content: space-between; align-items: center; gap: 16px; }
      .pd2-mode .ps-mini { flex: 0 1 340px; min-width: 0; margin: 0; }
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
      /* The server's pages were a phone column stretched to 1100px. At a desk
         the cards flow into columns; the container list is one card of rows,
         so it becomes a grid of rows instead. */
      .pd2-mode .ps-sypage:not([data-sect="sys-docker"]):not([data-sect="sys-alerts"]):not([data-sect="sys-overview"]) { display: block; columns: 2 440px; column-gap: 14px; }
      .pd2-mode .ps-sypage:not([data-sect="sys-docker"]):not([data-sect="sys-alerts"]):not([data-sect="sys-overview"]) > * { break-inside: avoid; margin: 0 0 12px; }
      /* Overview is the server on one page: three columns, each a stack. */
      .pd2-nas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
      .pd2-nas > div { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
      .pd2-nas > div > * { margin: 0; }
      @container pd2 (max-width: 1366px) { .pd2-nas { grid-template-columns: repeat(2, minmax(0, 1fr)); } .pd2-nas > div:last-child { grid-column: 1 / -1; } }
      .pd2-ctr .ps-syrow { cursor: pointer; }
      .pd2-ctr .ps-dotc { margin-right: 8px; }
      .pd2-ctroff { line-height: 1.45; }
      .pd2-powbtn { align-self: flex-start; }
      .pd2-mode [data-sect="sys-docker"] .ps-sycard:has(.ps-sw) { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 8px; }
      .pd2-mode [data-sect="sys-docker"] .ps-sycard .ps-sw { margin: 0; }

      /* A SHORT window — the laptop with the HA header showing, ~650px of
         glass. Declared LAST on purpose: every rule here overrides a base
         rule of equal specificity, and the first cut of this block sat
         mid-sheet, where the base rules below it quietly won. */
      @container pd2 (max-height: 700px) {
        /* The week's capsules need ~250px to read; here they get rows. */
        .pd2-col.pd2-wx .ps-railbox { display: none; }
        .pd2-wxrows { display: grid; }
        /* House rows at one line each, carrying the first fact only: seven
           full rows, two of them wrapping, ran off the bottom of the glass. */
        .pd2-hrow { padding-top: 4px; padding-bottom: 4px; align-items: center; }
        .pd2-hrow .pd2-dot { margin-top: 0; }
        .pd2-hrow > span:last-child { -webkit-line-clamp: 1; }
        .pd2-long { display: none; }
        .pd2-short { display: inline; }
        /* The card explains itself; the heading and the artist are height it
           cannot spare. The room stays — it is the point of the card. */
        .pd2-nplbl { display: none; }
        .pd2-nps { display: none; }
        .pd2-wxr { height: 16px; }
        .pd2-wxrows { padding: 4px 10px; gap: 1px; }
        .pd2-col.pd2-wx { padding-bottom: 10px; }
        .pd2-clim .pd2-ring svg { width: 110px; height: 110px; }
        .pd2-rn small { display: inline; margin-left: 6px; }
        .pd2-offage { display: none; }
        /* The day rail is his week's bottom row; at this height it goes and
           the week stays. */
        .pd2-jbtn > .ps-hyp { display: none; }
      }
    `;
