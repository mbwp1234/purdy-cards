/* ============================================================================
 * purdy-shell-card — styles
 *
 * One sheet, kept whole and in source order. Splitting it by section would
 * re-order rules and quietly change the cascade.
 *
 * Sizes, radii and surface tints come from the scales in PC_TOKENS. There were
 * 17 font sizes, 15 radii and 13 white-alpha fills in here, most of them within
 * half a pixel or two percent of a neighbour — which reads as inconsistency
 * rather than hierarchy. Pick a step; do not invent one.
 * ========================================================================== */

const PS_STYLES = `
      :host {
        ${PC_TOKENS}
        --ps-text: #e8eef4;
        --ps-muted: #8792a0;
        /* Was #606b79 — 3.6:1 on the ground, under the 4.5:1 floor, and it was
           the colour of every 9px uppercase label on the screen. The smallest
           text must not also be the faintest. This measures ~4.9:1 and still
           sits a clear step below --ps-muted. */
        --ps-dim: #7c8797;
        --ps-cool: var(--pc-cool);
        --ps-heat: var(--pc-heat);
        --ps-good: var(--pc-good);
        --ps-warn: var(--pc-warn);
        --ps-bad: var(--pc-bad);
        --ps-deep: #AA78FF;
        --ps-light: #50A0FF;
        --ps-awake: #FFA74E;
        --ps-hair: rgba(255,255,255,.075);
        --ps-hair-soft: rgba(255,255,255,.05);
        --ps-fill: var(--pc-fill-1);
        --ps-track: rgba(255,255,255,.12);
        /* Measured from the real dock after every render — see _reserve(). The
           fallback is the dock alone; with a now-playing bar it grows by ~59px
           and the last section used to end up underneath it. */
        --ps-dockh: 74px;
        display: block;
        position: relative;
        /* A negative horizontal margin made the card wider than the view, and
           the page then scrolled sideways whenever a drag started on a graph.
           Stay inside the view and clip anything that still reaches past. */
        margin: 0;
        padding: 6px 6px calc(var(--ps-dockh) + 28px + env(safe-area-inset-bottom, 0px));
        max-width: 100%;
        overflow-x: clip;
        color: var(--ps-text);
        font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        -webkit-font-smoothing: antialiased;
        min-height: 100vh;
      }
      * { box-sizing: border-box; }
      button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; text-align: inherit; }
      button:focus-visible, [role="switch"]:focus-visible { outline: 2px solid var(--ps-cool); outline-offset: 2px; border-radius: var(--pc-r-xs); }
      img { display: block; width: 100%; height: 100%; object-fit: cover; }
      ha-icon { --mdc-icon-size: 20px; flex: 0 0 auto; }
      .ps-ico { width: 17px; height: 17px; flex: 0 0 auto; display: block; }
      .ps-ico path, .ps-ico circle, .ps-ico rect, .ps-ico line {
        fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round;
      }
      .ps-grow { flex: 1; min-width: 0; }
      .ps-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
      .ps-row { display: flex; align-items: center; gap: 9px; }
      .ps-lbl { font-size: var(--pc-fs-micro); letter-spacing: .13em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }

      /* Hit expansion. Every round control on this screen drew at 19–36px, well
         under the 44px a thumb needs; the fix must not change what is drawn, so
         the target grows behind the paint. Horizontal insets stay inside the
         row gap so a neighbour can never steal the tap. */
      .ps-step, .ps-knob, .ps-link, .ps-x, .ps-prx, .ps-vbtn,
      .ps-tvoff, .ps-mb, .ps-npb, .ps-pin, .ps-tb, .ps-sclear { position: relative; }
      .ps-step::after, .ps-knob::after, .ps-link::after, .ps-x::after, .ps-prx::after,
      .ps-vbtn::after, .ps-tvoff::after, .ps-mb::after, .ps-npb::after, .ps-pin::after,
      .ps-tb::after, .ps-sclear::after { content: ""; position: absolute; inset: -11px -4px; }

      /* the ground — one gradient behind everything */
      .ps-ground {
        position: fixed; inset: 0; z-index: -1; pointer-events: none;
        background:
          radial-gradient(120% 58% at 92% -8%, rgba(122,86,255,.46), transparent 62%),
          radial-gradient(110% 52% at 4% 104%, rgba(26,128,142,.44), transparent 60%),
          radial-gradient(90% 40% at 50% 44%, rgba(60,44,120,.28), transparent 72%),
          linear-gradient(170deg, #0B0D16 0%, #080A12 55%, #06070E 100%);
      }

      /* status strip — no box, floats on the ground */
      .ps-stat { display: flex; align-items: flex-start; gap: 10px; padding: 2px 8px 14px; }
      .ps-stat h2 { font-size: var(--pc-fs-2xl); font-weight: 640; letter-spacing: -.028em; margin: 0; line-height: 1.12; }
      .ps-d { font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums; margin-top: 3px; }
      .ps-rt { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
      .ps-wx { display: flex; align-items: center; gap: 7px; color: var(--ps-cool); font-size: var(--pc-fs-xl);
               font-weight: 640; font-variant-numeric: tabular-nums; letter-spacing: -.02em; cursor: pointer; }
      .ps-wx ha-icon { --mdc-icon-size: 22px; }

      .ps-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: var(--pc-r-pill);
                 font-size: var(--pc-fs-micro); font-weight: 650; background: var(--pc-fill-2); color: var(--ps-muted);
                 font-variant-numeric: tabular-nums; white-space: nowrap; }
      .ps-chip.good { background: rgba(129,201,149,.17); color: var(--ps-good); }
      .ps-chip.warn { background: rgba(242,193,78,.17); color: var(--ps-warn); }
      .ps-chip.bad  { background: rgba(239,106,106,.17); color: var(--ps-bad); }
      .ps-chip.cool { background: rgba(77,208,225,.16); color: var(--ps-cool); }
      .ps-chip.deep { background: rgba(170,120,255,.18); color: var(--ps-deep); }
      .ps-chip.lt   { background: rgba(80,160,255,.18); color: var(--ps-light); }
      .ps-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }
      .ps-chips { display: flex; flex-wrap: wrap; gap: 6px; }

      /* one glass column */
      .ps-col {
        border-radius: var(--pc-r-2xl); overflow: clip;
        background: linear-gradient(180deg, rgba(255,255,255,.062), rgba(255,255,255,.026));
        border: 1px solid rgba(255,255,255,.085);
        box-shadow: 0 24px 60px -18px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.075);
        backdrop-filter: blur(26px) saturate(1.25);
        -webkit-backdrop-filter: blur(26px) saturate(1.25);
      }
      .ps-sect { padding: 13px 15px 15px; overflow-x: clip; }
      .ps-sect + .ps-sect { border-top: 1px solid var(--ps-hair); }
      /* One header treatment for every section. A fixed section differs only by
         having no chevron — it used to be rendered as a 9px uppercase caption,
         so two sections looked like titles and five looked like labels of the
         thing above them. */
      .ps-sh { display: flex; align-items: center; gap: 8px; width: 100%; padding: 0 0 11px; }
      .ps-nm { font-size: var(--pc-fs-sm); font-weight: 680; letter-spacing: -.004em; flex: 1; min-width: 0; }
      .ps-cv { color: var(--ps-dim); transition: transform .3s; display: flex; }
      .ps-cv .ps-ico { width: 15px; height: 15px; }
      .ps-sect.open .ps-cv { transform: rotate(90deg); color: var(--ps-cool); }
      .ps-xtra { display: none; flex-direction: column; gap: 10px; margin-top: 11px;
                 padding-top: 11px; border-top: 1px solid var(--ps-hair-soft); }
      .ps-sect.open .ps-xtra { display: flex; }

      /* rings shared by climate + sleep */
      .ps-ring { position: relative; flex: 0 0 auto; cursor: pointer; }
      .ps-ring svg { display: block; }
      .ps-rv { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
               justify-content: center; font-variant-numeric: tabular-nums; }
      .ps-rv b { font-size: var(--pc-fs-2xl); font-weight: 640; letter-spacing: -.028em; line-height: 1; }
      .ps-rv small { font-size: var(--pc-fs-micro); color: var(--ps-dim); margin-top: 3px; letter-spacing: .09em;
                     text-transform: uppercase; font-weight: 650; }

      /* climate */
      .ps-chero { display: flex; align-items: center; gap: 14px; }
      .ps-goal { display: flex; align-items: baseline; gap: 6px; }
      .ps-goal b { font-size: var(--pc-fs-2xl); font-weight: 660; font-variant-numeric: tabular-nums; }
      .ps-goal span { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .ps-step { width: 34px; height: 34px; border-radius: 50%; background: var(--pc-fill-2);
                 display: grid; place-items: center; flex: 0 0 auto; }
      .ps-step .ps-ico { width: 16px; height: 16px; }
      .ps-step:active { transform: scale(.93); }
      .ps-reason { font-size: var(--pc-fs-xs); color: var(--ps-muted); margin-top: 9px; line-height: 1.42; }
      .ps-zpair { display: flex; gap: 6px; margin-top: 11px; }
      .ps-zc { flex: 1; padding: 8px 10px; border-radius: var(--pc-r-sm); background: var(--ps-fill); font-size: var(--pc-fs-xs);
               color: var(--ps-muted); font-variant-numeric: tabular-nums; line-height: 1.3; cursor: pointer; }
      .ps-zc b { display: block; font-size: var(--pc-fs-lg); color: var(--ps-text); font-weight: 660; letter-spacing: -.02em; }
      .ps-zc.on { background: rgba(77,208,225,.15); color: var(--ps-cool); }
      .ps-zc.on b { color: var(--ps-cool); }
      .ps-wave { margin: 4px -15px -15px; position: relative; }
      .ps-wave-svg { width: 100%; height: 74px; display: block; }
      .ps-wlg { display: flex; gap: 12px; align-items: baseline; margin-top: 11px; min-height: 16px;
                font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .ps-wlg i { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px; }
      .ps-wlg b { color: var(--ps-text); font-weight: 640; margin-left: 3px; }
      .ps-wlg span { display: inline-flex; align-items: center; }
      .ps-rmlist { display: flex; flex-direction: column; }
      .ps-rml { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: var(--pc-fs-sm);
                border-top: 1px solid var(--ps-hair-soft); cursor: pointer; }
      .ps-rml:first-child { border-top: 0; }
      .ps-rn { flex: 1; min-width: 0; }
      /* Fixed width so the numbers to its right stay in a column whether or
         not a room has history yet. */
      .ps-spark { flex: 0 0 56px; height: 18px; display: block; }
      .ps-spark svg { width: 56px; height: 18px; display: block; }
      .ps-rml .ps-v { font-weight: 660; font-variant-numeric: tabular-nums; }
      .ps-rml .ps-h { color: var(--ps-dim); font-size: var(--pc-fs-xs); font-variant-numeric: tabular-nums;
                      width: 46px; text-align: right; }

      /* sleep */
      .ps-jtop { display: flex; align-items: center; gap: 13px; }
      .ps-jn { font-size: var(--pc-fs-md); font-weight: 660; }
      .ps-js { font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums; margin-top: 2px; line-height: 1.4; }
      .ps-vits { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 12px; }
      .ps-vit { background: var(--ps-fill); border-radius: var(--pc-r-md); padding: 9px 10px; display: flex;
                flex-direction: column; gap: 2px; min-width: 0; cursor: pointer; }
      .ps-vk { font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-vv { font-size: var(--pc-fs-xl); font-weight: 640; font-variant-numeric: tabular-nums; letter-spacing: -.022em; line-height: 1.1; }
      .ps-vv small { font-size: var(--pc-fs-micro); font-weight: 500; color: var(--ps-muted); margin-left: 1px; }
      .ps-vd { font-size: var(--pc-fs-micro); font-variant-numeric: tabular-nums; }
      .ps-good { color: var(--ps-good); }
      .ps-flat { color: var(--ps-dim); }
      .ps-warnc { color: var(--ps-warn); }
      .ps-hyp { margin-top: 12px; display: flex; flex-direction: column; gap: 5px; }
      .ps-hyp svg { width: 100%; height: 46px; display: block; }
      .ps-hypt { display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
                 font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; min-height: 13px; }
      .ps-hypt i { width: 7px; height: 7px; border-radius: var(--pc-r-hair); display: inline-block; margin-right: 5px; }
      .ps-hypt span { display: inline-flex; align-items: center; }
      .ps-hypt b { color: var(--ps-text); font-weight: 650; }
      /* While scrubbing the caption becomes the value line, so make it read
         like one rather than like a muted label. */
      [data-readout].live { color: var(--ps-text); }
      [data-readout].live b { color: var(--ps-text); }
      .ps-jrs { display: flex; flex-direction: column; gap: 5px; }
      .ps-jr { display: flex; align-items: center; gap: 9px; background: var(--ps-fill); border-radius: var(--pc-r-sm);
               padding: 9px 11px; font-size: var(--pc-fs-sm); font-variant-numeric: tabular-nums; cursor: pointer; }
      .ps-jr .ps-l { color: var(--ps-muted); flex: 1; }
      .ps-jr .ps-v { font-weight: 650; }

      /* people */
      .ps-ppl { display: flex; gap: 8px; }
      .ps-pw { flex: 1; display: flex; align-items: center; gap: 9px; padding: 9px 11px; border-radius: var(--pc-r-lg);
               background: var(--ps-fill); min-width: 0; cursor: pointer; }
      .ps-av { width: 32px; height: 32px; border-radius: 50%; background: var(--pc-fill-3); display: grid;
               place-items: center; font-size: var(--pc-fs-sm); font-weight: 700; color: var(--ps-muted);
               flex: 0 0 auto; overflow: hidden; }
      .ps-pn { font-size: var(--pc-fs-md); font-weight: 650; line-height: 1.2; }
      .ps-pb { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .ps-pb.low { color: var(--ps-warn); }

      /* music */
      .ps-now { display: flex; align-items: center; gap: 11px; }
      .ps-art { width: 50px; height: 50px; border-radius: var(--pc-r-md); background: var(--pc-fill-2);
                display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden; }
      .ps-art .ps-ico { width: 23px; height: 23px; }
      .ps-nt { font-size: var(--pc-fs-lg); font-weight: 650; letter-spacing: -.014em; }
      .ps-ns { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .ps-tb { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center;
               background: var(--pc-fill-2); flex: 0 0 auto; }
      .ps-tb .ps-ico { width: 18px; height: 18px; }
      .ps-mroom { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
      .ps-mr { flex: 0 0 auto; padding: 10px 14px; border-radius: var(--pc-r-sm); background: var(--ps-fill);
               color: var(--ps-muted); font-size: var(--pc-fs-xs); font-weight: 650;
               display: inline-flex; align-items: center; gap: 6px; position: relative; }
      .ps-mr::after { content: ""; position: absolute; inset: -5px -3px; }
      .ps-mr.sel { background: rgba(77,208,225,.16); color: var(--ps-cool);
                   box-shadow: inset 0 0 0 1px rgba(77,208,225,.4); }
      .ps-live { width: 6px; height: 6px; border-radius: 50%; background: var(--ps-good); }
      .ps-pres { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-top: 7px; }
      .ps-pr { padding: 12px 11px; border-radius: var(--pc-r-md); background: var(--ps-fill); font-size: var(--pc-fs-sm);
               font-weight: 650; display: flex; align-items: center; gap: 8px; min-width: 0; position: relative; }
      .ps-pr ha-icon { --mdc-icon-size: 16px; color: var(--ps-cool); }

      /* rooms */
      .ps-rstrip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .ps-rc { min-width: 0; background: var(--ps-fill); border-radius: var(--pc-r-md);
               padding: 9px 11px; cursor: pointer; }
      .ps-rc.acc { background: rgba(77,208,225,.12); }
      .ps-rn2 { font-size: var(--pc-fs-micro); letter-spacing: .11em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-rc b { display: block; font-size: var(--pc-fs-xl); font-weight: 660; font-variant-numeric: tabular-nums;
                 letter-spacing: -.028em; margin-top: 3px; }
      .ps-rh { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; }

      /* quick */
      .ps-qgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .ps-qt { background: var(--ps-fill); border-radius: var(--pc-r-lg); padding: 11px 10px 12px; display: flex;
               flex-direction: column; gap: 7px; min-width: 0; position: relative; overflow: hidden; }
      .ps-qt ha-icon { --mdc-icon-size: 22px; color: var(--ps-dim); }
      .ps-qn { font-size: var(--pc-fs-xs); font-weight: 650; line-height: 1.2; }
      .ps-qv { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .ps-qt.on { background: rgba(242,193,78,.15); }
      .ps-qt.on ha-icon, .ps-qt.on .ps-qn { color: var(--ps-warn); }
      .ps-qt.alert { background: rgba(239,106,106,.15); }
      .ps-qt.alert ha-icon, .ps-qt.alert .ps-qn { color: var(--ps-bad); }
      .ps-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--pc-fill-3); }
      .ps-bar i { display: block; height: 100%; }

      /* calendar */
      .ps-cday { display: flex; gap: 11px; padding: 7px 0; border-top: 1px solid var(--ps-hair-soft); }
      .ps-cday:first-of-type { border-top: 0; }
      .ps-cdt { flex: 0 0 34px; text-align: center; }
      .ps-dw { font-size: var(--pc-fs-micro); letter-spacing: .12em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-dn { font-size: var(--pc-fs-xl); font-weight: 660; font-variant-numeric: tabular-nums; line-height: 1.2; }
      .ps-cdt.today .ps-dn { color: var(--ps-cool); }
      .ps-cev { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; justify-content: center; }
      .ps-ev { display: flex; align-items: center; gap: 8px; font-size: var(--pc-fs-sm); }
      .ps-ev i { width: 3px; height: 14px; border-radius: var(--pc-r-hair); flex: 0 0 auto; }
      .ps-et { margin-left: auto; color: var(--ps-dim); font-size: var(--pc-fs-micro); font-variant-numeric: tabular-nums; }
      .ps-ev.none { color: var(--ps-dim); font-size: var(--pc-fs-xs); }
      /* Days with nothing on them are summarised rather than drawn: five empty
         rows is a hundred pixels saying nothing. */
      .ps-cskip { font-size: var(--pc-fs-xs); color: var(--ps-dim); padding: 9px 0 2px; }

      /* systems */
      .ps-sub2 { font-size: var(--pc-fs-xs); color: var(--ps-dim); margin: -4px 0 9px; font-variant-numeric: tabular-nums; }
      .ps-sysrow { display: flex; align-items: center; gap: 10px; font-size: var(--pc-fs-sm); padding: 6px 0; cursor: pointer; }
      .ps-sysrow ha-icon { --mdc-icon-size: 16px; color: var(--ps-dim); }
      .ps-sn { color: var(--ps-muted); }
      .ps-sv { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 650; }
      .ps-meter { width: 54px; height: 3px; border-radius: var(--pc-r-hair); background: var(--pc-fill-3);
                  overflow: hidden; flex: 0 0 auto; }
      .ps-meter i { display: block; height: 100%; }
      .ps-faults { display: flex; flex-direction: column; gap: 5px; margin-bottom: 9px; }
      .ps-fault { display: flex; align-items: center; gap: 9px; font-size: var(--pc-fs-sm);
                  background: rgba(239,106,106,.12); border-radius: var(--pc-r-sm); padding: 8px 10px; cursor: pointer; }
      .ps-dotc { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
      .ps-dotc.bad, .ps-dotc.critical { background: var(--ps-bad); }
      .ps-dotc.warn { background: var(--ps-warn); }
      .ps-dotc.info { background: var(--ps-dim); }
      .ps-grp { display: flex; flex-direction: column; gap: 8px; padding-top: 10px;
                border-top: 1px solid var(--ps-hair-soft); }
      .ps-grp:first-child { border-top: 0; padding-top: 0; }
      .ps-grph { display: flex; align-items: center; gap: 9px; width: 100%; padding: 4px 0; }
      .ps-grph ha-icon { --mdc-icon-size: 17px; color: var(--ps-dim); }
      .ps-gn { font-size: var(--pc-fs-sm); font-weight: 660; flex: 1; }
      .ps-gcv { color: var(--ps-dim); display: flex; transition: transform .25s; }
      .ps-gcv .ps-ico { width: 14px; height: 14px; }
      .ps-grp.open .ps-gcv { transform: rotate(90deg); color: var(--ps-cool); }
      .ps-grpb { display: none; flex-direction: column; gap: 8px; }
      .ps-grp.open .ps-grpb { display: flex; }
      .ps-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
      .ps-st { background: var(--ps-fill); border-radius: var(--pc-r-sm); padding: 8px 10px; min-width: 0; cursor: pointer; }
      .ps-stk { display: block; font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase;
                color: var(--ps-dim); font-weight: 650; }
      .ps-stv { display: block; font-size: var(--pc-fs-md); font-weight: 650; font-variant-numeric: tabular-nums;
                margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ps-swrap { display: flex; flex-direction: column; gap: 6px; }
      .ps-sw { display: flex; align-items: center; gap: 9px; background: var(--ps-fill); border-radius: var(--pc-r-sm);
               padding: 9px 11px; font-size: var(--pc-fs-sm); }
      .ps-sw ha-icon { --mdc-icon-size: 16px; color: var(--ps-dim); }
      .ps-sw .ps-trunc { flex: 1; }
      .ps-link { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
                 color: var(--ps-dim); flex: 0 0 auto; }
      .ps-link .ps-ico { width: 13px; height: 13px; }
      .ps-knob { width: 38px; height: 22px; border-radius: var(--pc-r-pill); background: var(--pc-fill-3);
                 flex: 0 0 auto; }
      .ps-knob i { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
                   background: var(--ps-muted); display: block; transition: left .18s, background .18s; }
      .ps-knob.on { background: rgba(77,208,225,.4); }
      .ps-knob.on i { left: 19px; background: var(--ps-cool); }
      .ps-btns { display: flex; gap: 6px; flex-wrap: wrap; }
      .ps-btn { display: inline-flex; align-items: center; gap: 7px;
                padding: 11px 14px; border-radius: var(--pc-r-sm); background: var(--ps-fill);
                font-size: var(--pc-fs-sm); font-weight: 650; }
      .ps-btn:active { background: var(--pc-fill-3); }

      /* schedule */
      .ps-sched { display: flex; flex-direction: column; gap: 8px; }
      .ps-schedh { display: flex; align-items: center; gap: 8px; }
      .ps-schedh .ps-lbl { flex: 1; }
      .ps-schednow { font-size: var(--pc-fs-sm); color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .ps-schednow b { color: var(--ps-text); font-weight: 660; }
      .ps-timeline { position: relative; height: 28px; border-radius: var(--pc-r-xs); background: var(--ps-fill);
                     overflow: hidden; }
      .ps-seg { position: absolute; top: 3px; bottom: 3px; border-radius: 6px;
                background: rgba(77,208,225,.22); border: 1px solid rgba(77,208,225,.4);
                font-size: var(--pc-fs-micro); font-weight: 650; color: var(--ps-text);
                display: flex; align-items: center; justify-content: center;
                font-variant-numeric: tabular-nums; overflow: hidden; }
      .ps-seg.live { background: rgba(77,208,225,.4); border-color: var(--ps-cool); }
      .ps-nowline { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ps-warn); }
      .ps-tscale { display: flex; justify-content: space-between; font-size: var(--pc-fs-micro); color: var(--ps-dim);
                   font-variant-numeric: tabular-nums; }
      .ps-srs { display: flex; flex-direction: column; gap: 4px; }
      .ps-sr { display: flex; align-items: center; gap: 9px; background: var(--ps-fill); border-radius: var(--pc-r-sm);
               padding: 11px 10px; font-size: var(--pc-fs-sm); font-variant-numeric: tabular-nums;
               width: 100%; text-align: left; }
      .ps-sr.live { background: rgba(77,208,225,.13); }
      .ps-sr[disabled] { cursor: default; }
      .ps-srt { font-weight: 650; flex: 0 0 128px; }
      .ps-srv { flex: 1; color: var(--ps-muted); }
      .ps-srv i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin: 0 4px 0 0; }
      .ps-srv i.h { background: var(--ps-heat); }
      .ps-srv i.c { background: var(--ps-cool); margin-left: 10px; }
      .ps-srz { margin-left: 8px; color: var(--ps-dim); font-size: var(--pc-fs-micro); }

      /* television */
      .ps-tvrow { display: flex; align-items: center; gap: 10px; padding: 7px 0;
                  border-top: 1px solid var(--ps-hair-soft); }
      .ps-tvrow:first-of-type { border-top: 0; }
      .ps-tvrow > .ps-ico { color: var(--ps-dim); }
      .ps-tvn { display: block; font-size: var(--pc-fs-md); font-weight: 650; }
      .ps-tva { display: block; font-size: var(--pc-fs-xs); color: var(--ps-dim); }
      .ps-tvoff { width: 32px; height: 32px; border-radius: 50%; background: var(--pc-fill-2);
                  display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-tvoff:active { color: var(--ps-bad); }

      /* hold */
      .ps-hold { display: flex; align-items: center; gap: 9px; width: 100%; margin-top: 10px;
                 background: rgba(242,193,78,.13); color: var(--ps-warn); border-radius: var(--pc-r-sm);
                 padding: 10px 11px; font-size: var(--pc-fs-sm); font-weight: 650; }
      .ps-hold.armed { background: var(--ps-warn); color: #1a1a1a; }
      .ps-holdx { font-size: var(--pc-fs-sm); font-weight: 700; }

      /* devices */
      .ps-dev { border-top: 1px solid var(--ps-hair-soft); padding-top: 10px; margin-top: 10px; }
      .ps-dev:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
      .ps-devh { display: flex; align-items: center; gap: 10px; width: 100%; padding: 4px 0; }
      .ps-devi { width: 32px; height: 32px; border-radius: var(--pc-r-sm); background: var(--pc-fill-2);
                 display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-devi ha-icon { --mdc-icon-size: 17px; }
      .ps-devi.bad { background: rgba(239,106,106,.16); color: var(--ps-bad); }
      .ps-devn { display: block; font-size: var(--pc-fs-md); font-weight: 660; }
      .ps-devs { display: block; font-size: var(--pc-fs-xs); color: var(--ps-dim);
                 font-variant-numeric: tabular-nums; }
      .ps-devb { display: none; flex-direction: column; gap: 9px; margin-top: 9px; }
      .ps-dev.open .ps-devb { display: flex; }
      .ps-dev.open .ps-devh .ps-gcv { transform: rotate(90deg); color: var(--ps-cool); }
      .ps-dev .ps-sysrow { padding: 4px 0 0; }
      .ps-dev .ps-grp { padding-top: 0; border-top: 0; }
      .ps-sw.gone { opacity: .45; }

      /* schedule tabs */
      .ps-tabs { display: flex; flex-wrap: wrap; gap: 3px; background: var(--ps-fill);
                 border-radius: var(--pc-r-sm); padding: 3px; }
      .ps-tab { flex: 1 1 auto; min-width: 40px; border-radius: var(--pc-r-xs); padding: 9px 10px; font-size: var(--pc-fs-xs);
                font-weight: 650; color: var(--ps-muted); text-align: center; white-space: nowrap; position: relative; }
      .ps-tab::after { content: ""; position: absolute; inset: -5px -1px; }
      .ps-tab.on { background: var(--pc-fill-3); color: var(--ps-text);
                   box-shadow: inset 0 0 0 1px var(--ps-hair); }

      /* schedule editor */
      .ps-sedit { display: flex; flex-direction: column; gap: 9px; background: var(--ps-fill);
                  border-radius: var(--pc-r-md); padding: 11px; }
      .ps-sform { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .ps-sform label { display: flex; flex-direction: column; gap: 4px; font-size: var(--pc-fs-micro);
                        letter-spacing: .08em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      /* 16px, not a scale step: iOS Safari zooms the whole page when a focused
         field is smaller, and the view never zooms back out. */
      .ps-sform input { background: var(--pc-fill-2); color: var(--ps-text);
                        border: 1px solid var(--ps-hair); border-radius: var(--pc-r-sm); padding: 9px;
                        font: inherit; font-size: 16px; font-variant-numeric: tabular-nums;
                        color-scheme: dark; min-width: 0; }
      .ps-sform input:focus { outline: 2px solid var(--ps-cool); outline-offset: 1px; }
      .ps-snote { font-size: var(--pc-fs-xs); color: var(--ps-warn); }
      .ps-btn.primary { background: var(--ps-cool); color: #0f1317; }
      .ps-btn.danger { color: var(--ps-bad); }
      .ps-btn.armed { background: var(--ps-warn); color: #1a1a1a; }

      /* graph scrubber */
      /* The small-ring modifier. It was used by the nursery nap rings from the
         start and never defined, so a 36m nap rendered its number at the 2xl
         step inside a 52px ring and spilled over the stroke. */
      .ps-rv.sm b { font-size: var(--pc-fs-md); }
      .ps-rv.sm small { font-size: var(--pc-fs-micro); margin-top: 1px; }

      /* Both nursery rails sit in a box, like every other panel on the card.
         Without it a rail reads as a bare line floating on the ground rather
         than a plot with an axis. */
      .ps-railbox { background: var(--ps-fill); border-radius: var(--pc-r-sm);
                    padding: 9px 10px 7px; }
      .ps-railticks { display: flex; justify-content: space-between; margin-top: 5px;
                      font-size: var(--pc-fs-micro); color: var(--ps-dim);
                      font-variant-numeric: tabular-nums; }

      /* nursery: nap rings and the one line of live status */
      .ps-naps { display: flex; gap: 8px; margin-top: 7px; }
      .ps-napr { display: flex; flex-direction: column; align-items: center; gap: 3px; }
      .ps-napr > span { font-size: var(--pc-fs-micro); font-variant-numeric: tabular-nums; }
      .ps-jstat { display: flex; justify-content: space-between; gap: 10px;
                  font-size: var(--pc-fs-xs); color: var(--ps-muted);
                  font-variant-numeric: tabular-nums; padding: 0 2px; }
      .ps-hypplot { position: relative; }
      /* Default to letting the browser scroll; claim the gesture only once a
         long press has deliberately entered scrub mode. */
      [data-scrub] { touch-action: auto; }
      [data-scrub].scrubbing { touch-action: none; }
      .ps-cross { position: absolute; top: 0; bottom: 0; width: 1px; z-index: 2; pointer-events: none;
                  background: rgba(255,255,255,.4); }

      /* saved playlists */
      .ps-pin { width: 38px; height: 38px; border-radius: 50%; background: var(--pc-fill-2);
                display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-pin.on { background: rgba(242,193,78,.17); color: var(--ps-warn); }
      .ps-pin .ps-ico { width: 18px; height: 18px; }
      .ps-prplay { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0;
                   font-size: var(--pc-fs-sm); font-weight: 650; padding-right: 18px; }
      .ps-prplay ha-icon { --mdc-icon-size: 16px; color: var(--ps-warn); }
      .ps-prx { position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
                width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
                color: var(--ps-dim); }
      .ps-prx .ps-ico { width: 11px; height: 11px; }

      /* search + lists */
      .ps-sbox { display: flex; align-items: center; gap: 8px; background: var(--ps-fill);
                 border-radius: var(--pc-r-md); padding: 0 11px; height: 44px; color: var(--ps-dim); }
      .ps-sbox input { flex: 1; min-width: 0; border: 0; background: none; outline: none;
                       font: inherit; font-size: 16px; color: var(--ps-text); height: 100%; }
      .ps-sbox input::placeholder { color: var(--ps-dim); }
      .ps-sclear { display: flex; color: var(--ps-dim); }
      .ps-note { font-size: var(--pc-fs-sm); color: var(--ps-dim); padding: 9px 2px; }
      .ps-mlist { display: flex; flex-direction: column; gap: 1px; }
      /* Nothing in the view scrolls sideways any more; only the sheet scrolls,
         and only downwards. */
      /* A row is a play button plus a queue button, not one button — "play it"
         and "play it after this" are both one tap, and neither is a gesture
         you have to know about. */
      .ps-mi { display: flex; align-items: center; gap: 4px; width: 100%; }
      .ps-miplay { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;
                   padding: 7px 4px; border-radius: var(--pc-r-sm); text-align: left; }
      .ps-miplay:active { background: var(--pc-fill-1); }
      .ps-miq { flex: 0 0 auto; width: 32px; height: 32px; border-radius: 50%;
                display: grid; place-items: center; color: var(--ps-dim); position: relative; }
      .ps-miq::after { content: ""; position: absolute; inset: -7px -4px; }
      .ps-miq:active { color: var(--ps-cool); }
      .ps-th { width: 34px; height: 34px; border-radius: var(--pc-r-xs); background: var(--pc-fill-2);
               display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden; }
      .ps-th .ps-ico { width: 15px; height: 15px; }
      .ps-min { display: block; font-size: var(--pc-fs-md); font-weight: 650; }
      .ps-mis { display: block; font-size: var(--pc-fs-xs); color: var(--ps-dim); }
      .ps-kind { flex: 0 0 auto; font-size: var(--pc-fs-micro); letter-spacing: .09em; text-transform: uppercase;
                 color: var(--ps-dim); background: var(--pc-fill-2); padding: 3px 7px; border-radius: var(--pc-r-pill); }

      /* music controls */
      .ps-transport { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 14px; }
      .ps-tb.big { width: 50px; height: 50px; }
      .ps-tb.big .ps-ico { width: 24px; height: 24px; }
      .ps-volmain { display: flex; align-items: center; gap: 11px; }
      .ps-vbtn { width: 36px; height: 36px; border-radius: 50%; background: var(--pc-fill-2);
                 display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-vbtn.muted { color: var(--ps-bad); }
      .ps-vol { flex: 1; min-width: 0; -webkit-appearance: none; appearance: none; height: 6px;
                border-radius: var(--pc-r-pill); background: var(--ps-track); outline: none; touch-action: pan-y; }
      .ps-vol::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px;
                border-radius: 50%; background: var(--ps-text); cursor: pointer; }
      .ps-vol::-moz-range-thumb { width: 20px; height: 20px; border: 0; border-radius: 50%;
                background: var(--ps-text); cursor: pointer; }
      .ps-vol:focus-visible { outline: 2px solid var(--ps-cool); outline-offset: 3px; }
      .ps-vnum { flex: 0 0 26px; text-align: right; font-size: var(--pc-fs-xs); color: var(--ps-dim);
                 font-variant-numeric: tabular-nums; }
      .ps-vrow { display: flex; align-items: center; gap: 10px; padding: 8px 0;
                 border-top: 1px solid var(--ps-hair-soft); }
      .ps-vrow:first-of-type { border-top: 0; }
      .ps-vname { flex: 0 0 96px; font-size: var(--pc-fs-sm); font-weight: 650; color: var(--ps-muted);
                  display: flex; align-items: center; gap: 6px; position: relative; }
      .ps-vname::after { content: ""; position: absolute; inset: -8px -4px; }
      .ps-vrow.on .ps-vname { color: var(--ps-text); }
      /* The target room is the one every control in the sheet acts on, so it
         has to be legible as such at a glance, not just a shade brighter. */
      .ps-vrow.on { box-shadow: inset 2px 0 0 var(--ps-cool); padding-left: 8px; }
      .ps-vrow.joined .ps-vname { color: var(--ps-cool); }

      /* grouping, queue and the transient confirmation line */
      .ps-jb, .ps-jspace { flex: 0 0 26px; height: 26px; }
      .ps-jb { border-radius: 50%; display: grid; place-items: center; position: relative;
               background: var(--pc-fill-2); color: var(--ps-dim); }
      .ps-jb::after { content: ""; position: absolute; inset: -9px -4px; }
      .ps-jb .ps-ico { width: 14px; height: 14px; }
      .ps-jb.on { background: rgba(77,208,225,.16); color: var(--ps-cool); }
      .ps-mr.grp { box-shadow: inset 0 0 0 1px rgba(77,208,225,.22); color: var(--ps-cool); }
      .ps-move { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
                 padding: 11px; margin-bottom: 12px; border-radius: var(--pc-r-md);
                 background: rgba(77,208,225,.13); color: var(--ps-cool);
                 font-size: var(--pc-fs-sm); font-weight: 650; }
      .ps-qbar { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; padding: 8px 10px;
                 border-radius: var(--pc-r-md); background: var(--pc-fill-1); }
      .ps-qb { flex: 0 0 auto; width: 28px; height: 28px; border-radius: 50%; display: grid;
               place-items: center; background: var(--pc-fill-2); color: var(--ps-dim); position: relative; }
      .ps-qb::after { content: ""; position: absolute; inset: -10px -4px; }
      .ps-qb .ps-ico { width: 15px; height: 15px; }
      .ps-qb.on { background: rgba(77,208,225,.16); color: var(--ps-cool); }
      .ps-qone { position: absolute; right: 0; bottom: -1px; font-size: var(--pc-fs-micro);
                 font-weight: 700; line-height: 1; }
      .ps-qup { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .ps-qpos { flex: 0 0 auto; font-size: var(--pc-fs-micro); color: var(--ps-dim);
                 font-variant-numeric: tabular-nums; }
      .ps-toast { margin-top: 10px; padding: 8px 11px; border-radius: var(--pc-r-sm);
                  background: rgba(77,208,225,.13); color: var(--ps-cool);
                  font-size: var(--pc-fs-xs); font-weight: 650; }

      /* search filters */
      .ps-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 9px 0 4px; }
      .ps-fc { padding: 6px 11px; border-radius: var(--pc-r-pill); background: var(--pc-fill-1);
               color: var(--ps-dim); font-size: var(--pc-fs-xs); font-weight: 650; position: relative; }
      .ps-fc::after { content: ""; position: absolute; inset: -7px -2px; }
      .ps-fc.on { background: rgba(77,208,225,.16); color: var(--ps-cool);
                  box-shadow: inset 0 0 0 1px rgba(77,208,225,.35); }

      /* alert sheet */
      .ps-scrim { position: fixed; inset: 0; background: rgba(4,6,10,.6); z-index: 8; backdrop-filter: blur(2px); }
      .ps-sheet {
        position: fixed; left: 12px; right: 12px; z-index: 9;
        /* Clears the dock AND the now-playing bar. A fixed 96px put the bottom
           of every sheet behind the mini bar whenever music was playing. */
        bottom: calc(var(--ps-dockh) + 22px + env(safe-area-inset-bottom, 0px));
        background: rgba(20,23,32,.96); border: 1px solid var(--pc-edge); border-radius: var(--pc-r-xl);
        padding: 13px 15px; box-shadow: 0 24px 60px rgba(0,0,0,.6);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        max-height: 60vh; overflow-y: auto; overscroll-behavior: contain;
      }
      .ps-sheet.tall { max-height: 74vh; }
      .ps-sheeth { display: flex; align-items: center; margin-bottom: 6px; }
      .ps-sheeth .ps-lbl { flex: 1; }
      .ps-x { width: 28px; height: 28px; border-radius: 50%; background: var(--pc-fill-2);
              display: grid; place-items: center; color: var(--ps-muted); }
      .ps-x .ps-ico { width: 14px; height: 14px; }
      .ps-ar { display: flex; align-items: center; gap: 9px; padding: 9px 0;
               border-top: 1px solid var(--ps-hair-soft); cursor: pointer; }
      .ps-ar:first-of-type { border-top: 0; }
      .ps-at { display: block; font-size: var(--pc-fs-md); font-weight: 650; }
      .ps-ad { display: block; font-size: var(--pc-fs-xs); color: var(--ps-muted); }

      /* fade + dock */
      .ps-fade { position: fixed; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 5;
                 height: calc(var(--ps-dockh) + 76px);
                 background: linear-gradient(180deg, transparent, rgba(6,7,14,.72) 46%, rgba(6,7,14,.94)); }
      .ps-dockwrap { position: fixed; left: 12px; right: 12px; z-index: 7;
                     bottom: calc(12px + env(safe-area-inset-bottom, 0px));
                     display: flex; flex-direction: column; gap: 9px; }
      .ps-mini { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--pc-r-xl);
                 background: var(--pc-fill-2); border: 1px solid var(--pc-edge); cursor: pointer;
                 backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3);
                 box-shadow: 0 12px 30px -8px rgba(0,0,0,.6); }
      .ps-mart { width: 32px; height: 32px; border-radius: var(--pc-r-sm); background: var(--pc-fill-2);
                 display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden; }
      .ps-mart .ps-ico { width: 15px; height: 15px; }
      .ps-mt { font-size: var(--pc-fs-sm); font-weight: 650; line-height: 1.2; }
      .ps-ms { font-size: var(--pc-fs-micro); color: var(--ps-dim); }
      .ps-mb { width: 32px; height: 32px; border-radius: 50%; background: var(--pc-fill-3);
               display: grid; place-items: center; flex: 0 0 auto; }
      .ps-mb .ps-ico { width: 15px; height: 15px; }
      .ps-dock { display: flex; align-items: center; justify-content: space-between; gap: 2px;
                 padding: 9px 10px; border-radius: var(--pc-r-2xl);
                 background: var(--pc-fill-2); border: 1px solid var(--pc-edge);
                 backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3);
                 box-shadow: 0 16px 40px -10px rgba(0,0,0,.65); }
      .ps-db { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
               padding: 5px 0; border-radius: var(--pc-r-lg); color: var(--ps-dim); }
      .ps-db ha-icon { --mdc-icon-size: 20px; }
      .ps-db span { font-size: var(--pc-fs-micro); letter-spacing: .01em; font-weight: 650; }
      .ps-db.on { color: var(--ps-cool); background: rgba(77,208,225,.13); }
      .ps-db.alert { color: var(--ps-bad); }

      /* a sheet hosting an existing card — the card brings its own surface,
         so the host adds nothing but room */
      .ps-host { margin: 2px -4px 0; }
      .ps-host > * { display: block; }

      /* now playing — music and television in one list */
      .ps-npr {
        display: flex; align-items: center; gap: 11px; padding: 8px 2px;
        cursor: pointer;
      }
      .ps-npr + .ps-npr { border-top: 1px solid var(--ps-hair); }
      .ps-npart {
        width: 42px; height: 42px; flex: 0 0 42px; border-radius: var(--pc-r-xs); overflow: hidden;
        background: var(--pc-chip); display: flex; align-items: center; justify-content: center;
        color: var(--ps-dim);
      }
      .ps-npart img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .ps-npart svg { width: 20px; height: 20px; }
      /* App logos are authored full-bleed, so they fill the tile. */
      .ps-npapp { background: transparent; }
      .ps-npapp svg { width: 100%; height: 100%; }
      .ps-npt { font-size: var(--pc-fs-md); font-weight: 600; }
      .ps-nps { font-size: var(--pc-fs-xs); color: var(--ps-dim); margin-top: 1px; }
      .ps-npb {
        flex: 0 0 auto; width: 36px; height: 36px; border-radius: 50%;
        border: 1px solid var(--pc-line); background: var(--pc-chip);
        color: var(--ps-text); display: flex; align-items: center; justify-content: center;
        cursor: pointer;
      }
      .ps-npb svg { width: 15px; height: 15px; }

      /* missing data — deliberately quiet, but never mistakable for a value */
      .ps-nodata { color: var(--ps-dim); font-weight: 500; }
      .ps-nohist {
        padding: 14px 2px; text-align: center; font-size: var(--pc-fs-sm);
        color: var(--ps-dim); font-style: italic;
      }
      .ps-schedfail { padding: 4px 2px 8px; }
      .ps-schedfail p { margin: 8px 0 10px; font-size: var(--pc-fs-md); color: var(--ps-dim); }

      @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
    `;

