/* ============================================================================
 * purdy-shell-card — styles
 *
 * One sheet, kept whole and in source order. Splitting it by section would
 * re-order rules and quietly change the cascade.
 * ========================================================================== */

const PS_STYLES = `
      :host {
        ${PC_TOKENS}
        --ps-text: #e8eef4;
        --ps-muted: #8792a0;
        --ps-dim: #606b79;
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
        --ps-fill: rgba(255,255,255,.055);
        --ps-track: rgba(255,255,255,.12);
        display: block;
        position: relative;
        /* A negative horizontal margin made the card wider than the view, and
           the page then scrolled sideways whenever a drag started on a graph.
           Stay inside the view and clip anything that still reaches past. */
        margin: 0;
        padding: 6px 6px 132px;
        max-width: 100%;
        overflow-x: clip;
        color: var(--ps-text);
        font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        -webkit-font-smoothing: antialiased;
        min-height: 100vh;
      }
      * { box-sizing: border-box; }
      button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; text-align: inherit; }
      button:focus-visible, [role="switch"]:focus-visible { outline: 2px solid var(--ps-cool); outline-offset: 2px; border-radius: 8px; }
      img { display: block; width: 100%; height: 100%; object-fit: cover; }
      ha-icon { --mdc-icon-size: 20px; flex: 0 0 auto; }
      .ps-ico { width: 17px; height: 17px; flex: 0 0 auto; display: block; }
      .ps-ico path, .ps-ico circle, .ps-ico rect, .ps-ico line {
        fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round;
      }
      .ps-grow { flex: 1; min-width: 0; }
      .ps-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
      .ps-row { display: flex; align-items: center; gap: 9px; }
      .ps-lbl { font-size: 9px; letter-spacing: .15em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-solo { display: block; margin-bottom: 9px; }

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
      .ps-stat h2 { font-size: 22px; font-weight: 640; letter-spacing: -.028em; margin: 0; line-height: 1.12; }
      .ps-d { font-size: 11.5px; color: var(--ps-muted); font-variant-numeric: tabular-nums; margin-top: 3px; }
      .ps-rt { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
      .ps-wx { display: flex; align-items: center; gap: 7px; color: var(--ps-cool); font-size: 17px;
               font-weight: 640; font-variant-numeric: tabular-nums; letter-spacing: -.02em; cursor: pointer; }
      .ps-wx ha-icon { --mdc-icon-size: 22px; }

      .ps-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px;
                 font-size: 10.5px; font-weight: 650; background: rgba(255,255,255,.08); color: var(--ps-muted);
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
        border-radius: 26px; overflow: clip;
        background: linear-gradient(180deg, rgba(255,255,255,.062), rgba(255,255,255,.026));
        border: 1px solid rgba(255,255,255,.085);
        box-shadow: 0 24px 60px -18px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.075);
        backdrop-filter: blur(26px) saturate(1.25);
        -webkit-backdrop-filter: blur(26px) saturate(1.25);
      }
      .ps-sect { padding: 13px 15px 15px; overflow-x: clip; }
      .ps-sect + .ps-sect { border-top: 1px solid var(--ps-hair); }
      .ps-sh { display: flex; align-items: center; gap: 8px; width: 100%; padding: 0 0 11px; }
      .ps-nm { font-size: 12.5px; font-weight: 680; letter-spacing: -.004em; }
      .ps-cv { margin-left: auto; color: var(--ps-dim); transition: transform .3s; display: flex; }
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
      .ps-rv b { font-size: 22px; font-weight: 640; letter-spacing: -.028em; line-height: 1; }
      .ps-rv small { font-size: 9px; color: var(--ps-dim); margin-top: 3px; letter-spacing: .09em;
                     text-transform: uppercase; font-weight: 650; }

      /* climate */
      .ps-chero { display: flex; align-items: center; gap: 14px; }
      .ps-goal { display: flex; align-items: baseline; gap: 6px; }
      .ps-goal b { font-size: 20px; font-weight: 660; font-variant-numeric: tabular-nums; }
      .ps-goal span { font-size: 11px; color: var(--ps-muted); }
      .ps-step { width: 31px; height: 31px; border-radius: 50%; background: rgba(255,255,255,.08);
                 display: grid; place-items: center; flex: 0 0 auto; }
      .ps-step .ps-ico { width: 16px; height: 16px; }
      .ps-step:active { transform: scale(.93); }
      .ps-reason { font-size: 11px; color: var(--ps-muted); margin-top: 9px; line-height: 1.42; }
      .ps-zpair { display: flex; gap: 6px; margin-top: 11px; }
      .ps-zc { flex: 1; padding: 7px 10px; border-radius: 12px; background: var(--ps-fill); font-size: 10.5px;
               color: var(--ps-muted); font-variant-numeric: tabular-nums; line-height: 1.3; cursor: pointer; }
      .ps-zc b { display: block; font-size: 15px; color: var(--ps-text); font-weight: 660; letter-spacing: -.02em; }
      .ps-zc.on { background: rgba(77,208,225,.15); color: var(--ps-cool); }
      .ps-zc.on b { color: var(--ps-cool); }
      .ps-wave { margin: 4px -15px -15px; position: relative; }
      .ps-wave-svg { width: 100%; height: 74px; display: block; }
      .ps-wlg { display: flex; gap: 12px; align-items: baseline; margin-top: 11px; min-height: 16px;
                font-size: 10.5px; color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .ps-wlg i { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px; }
      .ps-wlg b { color: var(--ps-text); font-weight: 640; margin-left: 3px; }
      .ps-wlg span { display: inline-flex; align-items: center; }
      .ps-rmlist { display: flex; flex-direction: column; }
      .ps-rml { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 12px;
                border-top: 1px solid var(--ps-hair-soft); cursor: pointer; }
      .ps-rml:first-child { border-top: 0; }
      .ps-rn { flex: 1; min-width: 0; }
      .ps-rml .ps-v { font-weight: 660; font-variant-numeric: tabular-nums; }
      .ps-rml .ps-h { color: var(--ps-dim); font-size: 10.5px; font-variant-numeric: tabular-nums;
                      width: 44px; text-align: right; }

      /* sleep */
      .ps-jtop { display: flex; align-items: center; gap: 13px; }
      .ps-jn { font-size: 13px; font-weight: 660; }
      .ps-js { font-size: 11px; color: var(--ps-muted); font-variant-numeric: tabular-nums; margin-top: 2px; line-height: 1.4; }
      .ps-vits { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 12px; }
      .ps-vit { background: var(--ps-fill); border-radius: 13px; padding: 9px 10px; display: flex;
                flex-direction: column; gap: 2px; min-width: 0; cursor: pointer; }
      .ps-vk { font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-vv { font-size: 17px; font-weight: 640; font-variant-numeric: tabular-nums; letter-spacing: -.022em; line-height: 1.1; }
      .ps-vv small { font-size: 9.5px; font-weight: 500; color: var(--ps-muted); margin-left: 1px; }
      .ps-vd { font-size: 9px; font-variant-numeric: tabular-nums; }
      .ps-good { color: var(--ps-good); }
      .ps-flat { color: var(--ps-dim); }
      .ps-warnc { color: var(--ps-warn); }
      .ps-hyp { margin-top: 12px; display: flex; flex-direction: column; gap: 5px; }
      .ps-hyp svg { width: 100%; height: 46px; display: block; }
      .ps-hypt { display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
                 font-size: 9.5px; color: var(--ps-dim); font-variant-numeric: tabular-nums; min-height: 13px; }
      .ps-hypt i { width: 7px; height: 7px; border-radius: 2px; display: inline-block; margin-right: 5px; }
      .ps-hypt span { display: inline-flex; align-items: center; }
      .ps-hypt b { color: var(--ps-text); font-weight: 650; }
      /* While scrubbing the caption becomes the value line, so make it read
         like one rather than like a muted label. */
      [data-readout].live { color: var(--ps-text); }
      [data-readout].live b { color: var(--ps-text); }
      .ps-jrs { display: flex; flex-direction: column; gap: 5px; }
      .ps-jr { display: flex; align-items: center; gap: 9px; background: var(--ps-fill); border-radius: 11px;
               padding: 8px 11px; font-size: 11.5px; font-variant-numeric: tabular-nums; cursor: pointer; }
      .ps-jr .ps-l { color: var(--ps-muted); flex: 1; }
      .ps-jr .ps-v { font-weight: 650; }

      /* people */
      .ps-ppl { display: flex; gap: 8px; }
      .ps-pw { flex: 1; display: flex; align-items: center; gap: 9px; padding: 9px 11px; border-radius: 16px;
               background: var(--ps-fill); min-width: 0; cursor: pointer; }
      .ps-av { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,.1); display: grid;
               place-items: center; font-size: 12px; font-weight: 700; color: var(--ps-muted);
               flex: 0 0 auto; overflow: hidden; }
      .ps-pn { font-size: 13px; font-weight: 650; line-height: 1.2; }
      .ps-pb { font-size: 10px; color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .ps-pb.low { color: var(--ps-warn); }

      /* music */
      .ps-now { display: flex; align-items: center; gap: 11px; }
      .ps-art { width: 50px; height: 50px; border-radius: 14px; background: rgba(255,255,255,.075);
                display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden; }
      .ps-art .ps-ico { width: 23px; height: 23px; }
      .ps-nt { font-size: 14px; font-weight: 650; letter-spacing: -.014em; }
      .ps-ns { font-size: 11px; color: var(--ps-muted); }
      .ps-tb { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
               background: rgba(255,255,255,.09); flex: 0 0 auto; }
      .ps-tb .ps-ico { width: 18px; height: 18px; }
      .ps-mroom { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
      .ps-mr { flex: 0 0 auto; padding: 7px 12px; border-radius: 12px; background: var(--ps-fill);
               color: var(--ps-muted); font-size: 11px; font-weight: 650;
               display: inline-flex; align-items: center; gap: 6px; }
      .ps-mr.sel { background: rgba(77,208,225,.16); color: var(--ps-cool);
                   box-shadow: inset 0 0 0 1px rgba(77,208,225,.4); }
      .ps-live { width: 6px; height: 6px; border-radius: 50%; background: var(--ps-good); }
      .ps-pres { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-top: 7px; }
      .ps-pr { padding: 10px 11px; border-radius: 14px; background: var(--ps-fill); font-size: 11.5px;
               font-weight: 650; display: flex; align-items: center; gap: 8px; min-width: 0; }
      .ps-pr ha-icon { --mdc-icon-size: 16px; color: var(--ps-cool); }

      /* rooms */
      .ps-rstrip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .ps-rc { min-width: 0; background: var(--ps-fill); border-radius: 15px;
               padding: 9px 11px; cursor: pointer; }
      .ps-rc.acc { background: rgba(77,208,225,.12); }
      .ps-rn2 { font-size: 8.5px; letter-spacing: .11em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-rc b { display: block; font-size: 18px; font-weight: 660; font-variant-numeric: tabular-nums;
                 letter-spacing: -.028em; margin-top: 3px; }
      .ps-rh { font-size: 9.5px; color: var(--ps-dim); font-variant-numeric: tabular-nums; }

      /* quick */
      .ps-qgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .ps-qt { background: var(--ps-fill); border-radius: 17px; padding: 11px 10px 12px; display: flex;
               flex-direction: column; gap: 7px; min-width: 0; position: relative; overflow: hidden; }
      .ps-qt ha-icon { --mdc-icon-size: 22px; color: var(--ps-dim); }
      .ps-qn { font-size: 11px; font-weight: 650; line-height: 1.2; }
      .ps-qv { font-size: 9.5px; color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .ps-qt.on { background: rgba(242,193,78,.15); }
      .ps-qt.on ha-icon, .ps-qt.on .ps-qn { color: var(--ps-warn); }
      .ps-qt.alert { background: rgba(239,106,106,.15); }
      .ps-qt.alert ha-icon, .ps-qt.alert .ps-qn { color: var(--ps-bad); }
      .ps-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.1); }
      .ps-bar i { display: block; height: 100%; }

      /* calendar */
      .ps-cday { display: flex; gap: 11px; padding: 7px 0; border-top: 1px solid var(--ps-hair-soft); }
      .ps-cday:first-of-type { border-top: 0; }
      .ps-cdt { flex: 0 0 34px; text-align: center; }
      .ps-dw { font-size: 8.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-dn { font-size: 17px; font-weight: 660; font-variant-numeric: tabular-nums; line-height: 1.2; }
      .ps-cdt.today .ps-dn { color: var(--ps-cool); }
      .ps-cev { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; justify-content: center; }
      .ps-ev { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
      .ps-ev i { width: 3px; height: 14px; border-radius: 2px; flex: 0 0 auto; }
      .ps-et { margin-left: auto; color: var(--ps-dim); font-size: 10px; font-variant-numeric: tabular-nums; }
      .ps-ev.none { color: var(--ps-dim); font-size: 11px; }

      /* systems */
      .ps-sub2 { font-size: 11px; color: var(--ps-dim); margin: -4px 0 9px; font-variant-numeric: tabular-nums; }
      .ps-sysrow { display: flex; align-items: center; gap: 10px; font-size: 11.5px; padding: 5px 0; cursor: pointer; }
      .ps-sysrow ha-icon { --mdc-icon-size: 16px; color: var(--ps-dim); }
      .ps-sn { color: var(--ps-muted); }
      .ps-sv { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 650; }
      .ps-meter { width: 54px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.11);
                  overflow: hidden; flex: 0 0 auto; }
      .ps-meter i { display: block; height: 100%; }
      .ps-faults { display: flex; flex-direction: column; gap: 5px; margin-bottom: 9px; }
      .ps-fault { display: flex; align-items: center; gap: 9px; font-size: 11.5px;
                  background: rgba(239,106,106,.12); border-radius: 10px; padding: 7px 10px; cursor: pointer; }
      .ps-dotc { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
      .ps-dotc.bad, .ps-dotc.critical { background: var(--ps-bad); }
      .ps-dotc.warn { background: var(--ps-warn); }
      .ps-dotc.info { background: var(--ps-dim); }
      .ps-grp { display: flex; flex-direction: column; gap: 8px; padding-top: 10px;
                border-top: 1px solid var(--ps-hair-soft); }
      .ps-grp:first-child { border-top: 0; padding-top: 0; }
      .ps-grph { display: flex; align-items: center; gap: 9px; width: 100%; }
      .ps-grph ha-icon { --mdc-icon-size: 17px; color: var(--ps-dim); }
      .ps-gn { font-size: 12px; font-weight: 660; flex: 1; }
      .ps-gcv { color: var(--ps-dim); display: flex; transition: transform .25s; }
      .ps-gcv .ps-ico { width: 14px; height: 14px; }
      .ps-grp.open .ps-gcv { transform: rotate(90deg); color: var(--ps-cool); }
      .ps-grpb { display: none; flex-direction: column; gap: 8px; }
      .ps-grp.open .ps-grpb { display: flex; }
      .ps-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
      .ps-st { background: var(--ps-fill); border-radius: 11px; padding: 7px 10px; min-width: 0; cursor: pointer; }
      .ps-stk { display: block; font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase;
                color: var(--ps-dim); font-weight: 650; }
      .ps-stv { display: block; font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums;
                margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ps-swrap { display: flex; flex-direction: column; gap: 6px; }
      .ps-sw { display: flex; align-items: center; gap: 9px; background: var(--ps-fill); border-radius: 12px;
               padding: 8px 11px; font-size: 11.5px; }
      .ps-sw ha-icon { --mdc-icon-size: 16px; color: var(--ps-dim); }
      .ps-sw .ps-trunc { flex: 1; }
      .ps-link { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
                 color: var(--ps-dim); flex: 0 0 auto; }
      .ps-link .ps-ico { width: 13px; height: 13px; }
      .ps-knob { width: 34px; height: 19px; border-radius: 999px; background: rgba(255,255,255,.13);
                 position: relative; flex: 0 0 auto; }
      .ps-knob i { position: absolute; top: 2.5px; left: 2.5px; width: 14px; height: 14px; border-radius: 50%;
                   background: var(--ps-muted); display: block; transition: left .18s, background .18s; }
      .ps-knob.on { background: rgba(77,208,225,.4); }
      .ps-knob.on i { left: 17.5px; background: var(--ps-cool); }
      .ps-btns { display: flex; gap: 6px; flex-wrap: wrap; }
      .ps-btn { padding: 8px 13px; border-radius: 12px; background: var(--ps-fill); font-size: 11.5px; font-weight: 650; }
      .ps-btn:active { background: rgba(255,255,255,.1); }

      /* schedule */
      .ps-sched { display: flex; flex-direction: column; gap: 8px; }
      .ps-schedh { display: flex; align-items: center; gap: 8px; }
      .ps-schedh .ps-lbl { flex: 1; }
      .ps-schednow { font-size: 11.5px; color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .ps-schednow b { color: var(--ps-text); font-weight: 660; }
      .ps-timeline { position: relative; height: 28px; border-radius: 9px; background: var(--ps-fill);
                     overflow: hidden; }
      .ps-seg { position: absolute; top: 3px; bottom: 3px; border-radius: 6px;
                background: rgba(77,208,225,.22); border: 1px solid rgba(77,208,225,.4);
                font-size: 9.5px; font-weight: 650; color: var(--ps-text);
                display: flex; align-items: center; justify-content: center;
                font-variant-numeric: tabular-nums; overflow: hidden; }
      .ps-seg.live { background: rgba(77,208,225,.4); border-color: var(--ps-cool); }
      .ps-nowline { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ps-warn); }
      .ps-tscale { display: flex; justify-content: space-between; font-size: 9px; color: var(--ps-dim);
                   font-variant-numeric: tabular-nums; }
      .ps-srs { display: flex; flex-direction: column; gap: 4px; }
      .ps-sr { display: flex; align-items: center; gap: 9px; background: var(--ps-fill); border-radius: 10px;
               padding: 7px 10px; font-size: 11.5px; font-variant-numeric: tabular-nums; }
      .ps-sr.live { background: rgba(77,208,225,.13); }
      .ps-srt { font-weight: 650; flex: 0 0 74px; }
      .ps-srv { flex: 1; color: var(--ps-muted); }
      .ps-srv i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin: 0 4px 0 0; }
      .ps-srv i.h { background: var(--ps-heat); }
      .ps-srv i.c { background: var(--ps-cool); margin-left: 10px; }

      /* television */
      .ps-tvrow { display: flex; align-items: center; gap: 10px; padding: 7px 0;
                  border-top: 1px solid var(--ps-hair-soft); }
      .ps-tvrow:first-of-type { border-top: 0; }
      .ps-tvrow > .ps-ico { color: var(--ps-dim); }
      .ps-tvn { display: block; font-size: 12.5px; font-weight: 650; }
      .ps-tva { display: block; font-size: 10.5px; color: var(--ps-dim); }
      .ps-tvoff { width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,.08);
                  display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-tvoff:active { color: var(--ps-bad); }

      /* hold */
      .ps-hold { display: flex; align-items: center; gap: 9px; width: 100%; margin-top: 10px;
                 background: rgba(242,193,78,.13); color: var(--ps-warn); border-radius: 12px;
                 padding: 8px 11px; font-size: 11.5px; font-weight: 650; }
      .ps-hold.armed { background: var(--ps-warn); color: #1a1a1a; }
      .ps-holdx { font-size: 12px; font-weight: 700; }

      /* devices */
      .ps-dev { border-top: 1px solid var(--ps-hair-soft); padding-top: 10px; margin-top: 10px; }
      .ps-dev:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
      .ps-devh { display: flex; align-items: center; gap: 10px; width: 100%; }
      .ps-devi { width: 30px; height: 30px; border-radius: 10px; background: rgba(255,255,255,.07);
                 display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-devi ha-icon { --mdc-icon-size: 17px; }
      .ps-devi.bad { background: rgba(239,106,106,.16); color: var(--ps-bad); }
      .ps-devn { display: block; font-size: 13px; font-weight: 660; }
      .ps-devs { display: block; font-size: 10.5px; color: var(--ps-dim);
                 font-variant-numeric: tabular-nums; }
      .ps-devb { display: none; flex-direction: column; gap: 9px; margin-top: 9px; }
      .ps-dev.open .ps-devb { display: flex; }
      .ps-dev.open .ps-devh .ps-gcv { transform: rotate(90deg); color: var(--ps-cool); }
      .ps-dev .ps-sysrow { padding: 4px 0 0; }
      .ps-dev .ps-grp { padding-top: 0; border-top: 0; }
      .ps-sw.gone { opacity: .45; }

      /* schedule tabs */
      .ps-tabs { display: flex; flex-wrap: wrap; gap: 3px; background: var(--ps-fill);
                 border-radius: 11px; padding: 3px; }
      .ps-tab { flex: 1 1 auto; min-width: 40px; border-radius: 9px; padding: 7px 10px; font-size: 11px;
                font-weight: 650; color: var(--ps-muted); text-align: center; white-space: nowrap; }
      .ps-tab.on { background: rgba(255,255,255,.1); color: var(--ps-text);
                   box-shadow: inset 0 0 0 1px var(--ps-hair); }
      .ps-srz { margin-left: 8px; color: var(--ps-dim); font-size: 10px; }
      .ps-srt { flex: 0 0 128px; }

      /* schedule editor */
      .ps-sedit { display: flex; flex-direction: column; gap: 9px; background: var(--ps-fill);
                  border-radius: 14px; padding: 11px; }
      .ps-sform { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .ps-sform label { display: flex; flex-direction: column; gap: 4px; font-size: 10px;
                        letter-spacing: .08em; text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-sform input { background: rgba(255,255,255,.07); color: var(--ps-text);
                        border: 1px solid var(--ps-hair); border-radius: 10px; padding: 8px 9px;
                        font: inherit; font-size: 14px; font-variant-numeric: tabular-nums;
                        color-scheme: dark; min-width: 0; }
      .ps-sform input:focus { outline: 2px solid var(--ps-cool); outline-offset: 1px; }
      .ps-snote { font-size: 11px; color: var(--ps-warn); }
      .ps-btn.primary { background: var(--ps-cool); color: #0f1317; }
      .ps-btn.danger { color: var(--ps-bad); }
      .ps-btn.armed { background: var(--ps-warn); color: #1a1a1a; }
      .ps-btn { display: inline-flex; align-items: center; gap: 7px; }
      .ps-sr { width: 100%; text-align: left; }
      .ps-sr[disabled] { cursor: default; }

      /* graph scrubber */
      .ps-hypplot { position: relative; }
      /* Default to letting the browser scroll; claim the gesture only once a
         long press has deliberately entered scrub mode. */
      [data-scrub] { touch-action: auto; }
      [data-scrub].scrubbing { touch-action: none; }
      .ps-cross { position: absolute; top: 0; bottom: 0; width: 1px; z-index: 2; pointer-events: none;
                  background: rgba(255,255,255,.4); }

      /* saved playlists */
      .ps-pin { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,.08);
                display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-pin.on { background: rgba(242,193,78,.17); color: var(--ps-warn); }
      .ps-pin .ps-ico { width: 18px; height: 18px; }
      .ps-pr { position: relative; }
      .ps-prplay { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0;
                   font-size: 11.5px; font-weight: 650; padding-right: 18px; }
      .ps-prplay ha-icon { --mdc-icon-size: 16px; color: var(--ps-warn); }
      .ps-prx { position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
                width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
                color: var(--ps-dim); }
      .ps-prx .ps-ico { width: 11px; height: 11px; }

      /* search + lists */
      .ps-sbox { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.06);
                 border-radius: 13px; padding: 0 11px; height: 40px; color: var(--ps-dim); }
      .ps-sbox input { flex: 1; min-width: 0; border: 0; background: none; outline: none;
                       font: inherit; font-size: 13.5px; color: var(--ps-text); height: 100%; }
      .ps-sbox input::placeholder { color: var(--ps-dim); }
      .ps-sclear { display: flex; color: var(--ps-dim); }
      .ps-note { font-size: 11.5px; color: var(--ps-dim); padding: 9px 2px; }
      .ps-mlist { display: flex; flex-direction: column; gap: 1px; }
      /* Nothing in the view scrolls sideways any more; only the sheet scrolls,
         and only downwards. */
      .ps-mi { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 4px;
               border-radius: 11px; text-align: left; }
      .ps-mi:active { background: rgba(255,255,255,.06); }
      .ps-th { width: 34px; height: 34px; border-radius: 9px; background: rgba(255,255,255,.07);
               display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden; }
      .ps-th .ps-ico { width: 15px; height: 15px; }
      .ps-min { display: block; font-size: 12.5px; font-weight: 650; }
      .ps-mis { display: block; font-size: 10.5px; color: var(--ps-dim); }
      .ps-kind { flex: 0 0 auto; font-size: 8.5px; letter-spacing: .09em; text-transform: uppercase;
                 color: var(--ps-dim); background: rgba(255,255,255,.07); padding: 3px 7px; border-radius: 999px; }

      /* music controls */
      .ps-transport { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 14px; }
      .ps-tb.big { width: 48px; height: 48px; }
      .ps-tb.big .ps-ico { width: 24px; height: 24px; }
      .ps-volmain { display: flex; align-items: center; gap: 11px; }
      .ps-vbtn { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.08);
                 display: grid; place-items: center; color: var(--ps-muted); flex: 0 0 auto; }
      .ps-vbtn.muted { color: var(--ps-bad); }
      .ps-vol { flex: 1; min-width: 0; -webkit-appearance: none; appearance: none; height: 6px;
                border-radius: 999px; background: var(--ps-track); outline: none; touch-action: pan-y; }
      .ps-vol::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px;
                border-radius: 50%; background: var(--ps-text); cursor: pointer; }
      .ps-vol::-moz-range-thumb { width: 18px; height: 18px; border: 0; border-radius: 50%;
                background: var(--ps-text); cursor: pointer; }
      .ps-vol:focus-visible { outline: 2px solid var(--ps-cool); outline-offset: 3px; }
      .ps-vnum { flex: 0 0 26px; text-align: right; font-size: 11px; color: var(--ps-dim);
                 font-variant-numeric: tabular-nums; }
      .ps-vrow { display: flex; align-items: center; gap: 10px; padding: 7px 0;
                 border-top: 1px solid var(--ps-hair-soft); }
      .ps-vrow:first-of-type { border-top: 0; }
      .ps-vname { flex: 0 0 96px; font-size: 11.5px; font-weight: 650; color: var(--ps-muted);
                  display: flex; align-items: center; gap: 6px; }
      .ps-vrow.on .ps-vname { color: var(--ps-text); }
      .ps-mini { cursor: pointer; }

      /* alert sheet */
      .ps-scrim { position: fixed; inset: 0; background: rgba(4,6,10,.6); z-index: 8; backdrop-filter: blur(2px); }
      .ps-sheet {
        position: fixed; left: 12px; right: 12px; bottom: 96px; z-index: 9;
        background: rgba(20,23,32,.96); border: 1px solid rgba(255,255,255,.1); border-radius: 20px;
        padding: 13px 15px; box-shadow: 0 24px 60px rgba(0,0,0,.6);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        max-height: 60vh; overflow-y: auto; overscroll-behavior: contain;
      }
      .ps-sheet.tall { max-height: 74vh; }
      .ps-sheeth { display: flex; align-items: center; margin-bottom: 6px; }
      .ps-sheeth .ps-lbl { flex: 1; }
      .ps-x { width: 26px; height: 26px; border-radius: 50%; background: rgba(255,255,255,.08);
              display: grid; place-items: center; color: var(--ps-muted); }
      .ps-x .ps-ico { width: 14px; height: 14px; }
      .ps-ar { display: flex; align-items: center; gap: 9px; padding: 8px 0;
               border-top: 1px solid var(--ps-hair-soft); cursor: pointer; }
      .ps-ar:first-of-type { border-top: 0; }
      .ps-at { display: block; font-size: 12.5px; font-weight: 650; }
      .ps-ad { display: block; font-size: 11px; color: var(--ps-muted); }

      /* fade + dock */
      .ps-fade { position: fixed; left: 0; right: 0; bottom: 0; height: 150px; pointer-events: none; z-index: 5;
                 background: linear-gradient(180deg, transparent, rgba(6,7,14,.72) 46%, rgba(6,7,14,.94)); }
      .ps-dockwrap { position: fixed; left: 12px; right: 12px; z-index: 7;
                     bottom: calc(12px + env(safe-area-inset-bottom, 0px));
                     display: flex; flex-direction: column; gap: 9px; }
      .ps-mini { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 20px;
                 background: rgba(255,255,255,.075); border: 1px solid rgba(255,255,255,.1);
                 backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3);
                 box-shadow: 0 12px 30px -8px rgba(0,0,0,.6); }
      .ps-mart { width: 32px; height: 32px; border-radius: 10px; background: rgba(255,255,255,.09);
                 display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden; }
      .ps-mart .ps-ico { width: 15px; height: 15px; }
      .ps-mt { font-size: 11.5px; font-weight: 650; line-height: 1.2; }
      .ps-ms { font-size: 9.5px; color: var(--ps-dim); }
      .ps-mb { width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,.1);
               display: grid; place-items: center; flex: 0 0 auto; }
      .ps-mb .ps-ico { width: 15px; height: 15px; }
      .ps-dock { display: flex; align-items: center; justify-content: space-between; gap: 2px;
                 padding: 9px 10px; border-radius: 24px;
                 background: rgba(255,255,255,.075); border: 1px solid rgba(255,255,255,.1);
                 backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3);
                 box-shadow: 0 16px 40px -10px rgba(0,0,0,.65); }
      .ps-db { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
               padding: 5px 0; border-radius: 16px; color: var(--ps-dim); }
      .ps-db ha-icon { --mdc-icon-size: 20px; }
      .ps-db span { font-size: 8.5px; letter-spacing: .03em; font-weight: 650; }
      .ps-db.on { color: var(--ps-cool); background: rgba(77,208,225,.13); }
      .ps-db.alert { color: var(--ps-bad); }

      /* now playing — music and television in one list */
      .ps-npr {
        display: flex; align-items: center; gap: 11px; padding: 8px 2px;
        cursor: pointer;
      }
      .ps-npr + .ps-npr { border-top: 1px solid var(--ps-hair); }
      .ps-npart {
        width: 42px; height: 42px; flex: 0 0 42px; border-radius: 9px; overflow: hidden;
        background: var(--ps-chip); display: flex; align-items: center; justify-content: center;
        color: var(--ps-dim);
      }
      .ps-npart img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .ps-npart svg { width: 20px; height: 20px; }
      /* App logos are authored full-bleed, so they fill the tile. */
      .ps-npapp { background: transparent; }
      .ps-npapp svg { width: 100%; height: 100%; }
      .ps-npt { font-size: 13.5px; font-weight: 600; }
      .ps-nps { font-size: 11px; color: var(--ps-dim); margin-top: 1px; }
      .ps-npb {
        flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%;
        border: 1px solid var(--ps-line); background: var(--ps-chip);
        color: var(--ps-text); display: flex; align-items: center; justify-content: center;
        cursor: pointer;
      }
      .ps-npb svg { width: 15px; height: 15px; }

      /* missing data — deliberately quiet, but never mistakable for a value */
      .ps-nodata { color: var(--ps-dim); font-weight: 500; }
      .ps-nohist {
        padding: 14px 2px; text-align: center; font-size: 11.5px;
        color: var(--ps-dim); font-style: italic;
      }
      .ps-schedfail { padding: 4px 2px 8px; }
      .ps-schedfail p { margin: 8px 0 10px; font-size: 12.5px; color: var(--ps-dim); }

      @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
    `;

