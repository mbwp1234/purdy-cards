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
        /* The dock is STICKY and therefore in flow, so it reserves its own room
           and the padding only has to hold the gap UNDER it at full scroll.
           --ps-dockh is still measured, because .ps-sheet is fixed and has to
           clear a dock whose height changes with the now-playing bar. */
        padding: 6px 6px calc(12px + env(safe-area-inset-bottom, 0px));
        max-width: 100%;
        overflow-x: clip;
        color: var(--ps-text);
        font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        -webkit-font-smoothing: antialiased;
        /* dvh, not vh. vh is the LARGE viewport — the height the window would
           have with every piece of browser chrome retracted — so on a phone it
           is reliably TALLER than the scrollport the card is actually sitting
           in. That surplus is pure dead height at the end of the page: the
           column stops, the dock rests, and you can still scroll. dvh is the
           viewport as it currently is, which is the one question being asked
           here (can the sticky dock reach the bottom of the screen). */
        min-height: 100dvh;
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
      .ps-stat h2 { font-size: var(--pc-fs-xl); font-weight: 640; letter-spacing: -.028em; margin: 0; line-height: 1.15; }
      .ps-d { font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums; margin-top: 3px;
              display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

      /* Presence, in the chrome rather than in a section of its own.
         The occupancy helper says "Brian Only"; two avatars with a ring say the
         same thing without a heading, a card and 105px — and they say WHICH one
         without being read. The tap target is padded out behind the paint, the
         same way every round control on this card is.
         (No backticks anywhere in this file's comments: it is one template
         literal, and a single one terminates the whole stylesheet.) */
      .ps-pav { display: flex; align-items: center; gap: 4px; }
      /* No overflow:hidden on the avatar itself — it would clip the padded tap
         target below. The image rounds itself instead. */
      .ps-pv { position: relative; width: 21px; height: 21px; border-radius: 50%; cursor: pointer;
               display: flex; align-items: center; justify-content: center;
               background: var(--pc-fill-2); color: var(--ps-dim); font-size: var(--pc-fs-micro); font-weight: 700;
               box-shadow: 0 0 0 1.5px var(--pc-fill-1); }
      .ps-pv img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
      .ps-pv.home { box-shadow: 0 0 0 1.5px var(--ps-good); color: var(--ps-text); }
      .ps-pv.low::after { content: ""; position: absolute; right: -1px; bottom: -1px; width: 7px; height: 7px;
                          border-radius: 50%; background: var(--ps-bad); box-shadow: 0 0 0 1.5px #10141f; }
      .ps-pv::before { content: ""; position: absolute; inset: -7px -3px; }
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
      /* A ring caption is centred over a filled arc, so anything wider than the
         ring's inner box does not merely look tight — it is clipped by the
         stroke, and a clipped label is a MISSING label ("THERMOSTAT" read
         "HERMOSTAT"). Capped and centred so a long caption wraps inside the
         ring instead of running out of it. */
      .ps-rv small { font-size: var(--pc-fs-micro); color: var(--ps-dim); margin-top: 3px; letter-spacing: .09em;
                     text-transform: uppercase; font-weight: 650;
                     max-width: 78%; text-align: center; line-height: 1.15; }

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
      /* The plotted range, so the line reads as a measurement rather than a
         shape. Inside the plot and out of the flow, so it cannot change the
         height it is describing. */
      .ps-wax {
        position: absolute; left: 15px; z-index: 1; pointer-events: none;
        font-size: var(--pc-fs-micro); color: var(--ps-dim);
        font-variant-numeric: tabular-nums;
      }
      .ps-wax.hi { top: 1px; }
      .ps-wax.lo { bottom: 16px; }
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
      /* And one step is not enough, because the string is not one width: "36m"
         and "1h19m" differ by two thirds and the ring does not. A nap that
         crossed the hour drew five characters at the md step and overhung the
         stroke on both sides. The step follows the reading's LENGTH, not the
         ring's size. */
      .ps-rv.sm4 b { font-size: var(--pc-fs-sm); }
      .ps-rv.sm5 b { font-size: var(--pc-fs-xs); letter-spacing: -.04em; }

      /* Both nursery rails sit in a box, like every other panel on the card.
         Without it a rail reads as a bare line floating on the ground rather
         than a plot with an axis. */
      .ps-railbox { background: var(--ps-fill); border-radius: var(--pc-r-sm);
                    padding: 9px 10px 7px; }
      .ps-railticks { display: flex; justify-content: space-between; margin-top: 5px;
                      font-size: var(--pc-fs-micro); color: var(--ps-dim);
                      font-variant-numeric: tabular-nums; }

      /* ---------------------------------------------------------- weather --*/
      /* The reading, the seven-day tiles, and a capsule per day.
         The capsule gradient runs cool at the low end to heat at the high end,
         which is the same two-pole temperature language the rings and the
         climate chips already speak — the reference card this is adapted from
         used its own blue-to-sand ramp, and importing that would have made
         temperature mean one thing here and another everywhere else. */
      .ps-wxhero { display: flex; align-items: flex-start; gap: 10px; }
      .ps-wxheronum { min-width: 0; }
      .ps-wxbig { font-size: var(--pc-fs-3xl); font-weight: 640; letter-spacing: -.045em;
                  line-height: .94; font-variant-numeric: tabular-nums; }
      .ps-wxbig sup { font-size: .42em; font-weight: 600; letter-spacing: 0;
                      vertical-align: top; position: relative; top: .25em; }
      /* An unreporting sensor must not print its last number in the hero
         colour as though it were current. */
      .ps-wxbig.off { color: var(--ps-dim); }
      .ps-wxdelta { font-size: var(--pc-fs-xs); color: var(--ps-heat); font-weight: 640;
                    margin-top: 7px; font-variant-numeric: tabular-nums; }
      .ps-wxdelta.cool { color: var(--ps-cool); }
      /* One line. The real sensor name here is "Outside Thermometer & Humidity
         Temperature", which wrapped to two lines of uppercase micro type under
         the hero number — see _wxSrcName, which shortens it; this is the guard
         for whatever the next sensor is called. */
      .ps-wxsrc { font-size: var(--pc-fs-micro); color: var(--ps-dim); letter-spacing: .06em;
                  text-transform: uppercase; font-weight: 660; margin-top: 5px;
                  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                  max-width: 190px; }
      /* Today, beside the reading. The week's capsules run vertically because
         seven of them share an axis; today is one span with a live position on
         it, so it runs the way a day runs. */
      .ps-wxtodaybox { margin-left: auto; flex: 1; min-width: 0; max-width: 208px; }
      .ps-wxtodaybox .ps-wxrh { margin: 0 0 7px; }
      .ps-wxtb { display: flex; align-items: center; gap: 7px; }
      .ps-wxtbend { font-size: var(--pc-fs-xs); font-weight: 640; font-variant-numeric: tabular-nums;
                    white-space: nowrap; }
      .ps-wxtbend.lo { color: var(--ps-cool); }
      .ps-wxtbend.hi { color: var(--ps-heat); }
      .ps-wxtbtrack { position: relative; flex: 1; min-width: 0; height: 10px;
                      border-radius: var(--pc-r-pill); background: var(--ps-track); }
      .ps-wxtbfill { position: absolute; top: 0; bottom: 0; border-radius: var(--pc-r-pill);
                     background: linear-gradient(90deg, var(--ps-cool), var(--ps-heat)); }
      /* Only one end of the day is published — a stub, the same claim the week
         rail's stub makes, not a bar reaching to an edge it does not know. */
      .ps-wxtbfill.part { background: linear-gradient(90deg, var(--ps-cool), var(--ps-cool)); opacity: .55; }
      .ps-wxtbnow { position: absolute; top: -4px; bottom: -4px; width: 3px; margin-left: -1.5px;
                    border-radius: var(--pc-r-hair); background: var(--ps-text);
                    box-shadow: 0 0 0 2px rgba(10,12,21,.85); z-index: 2; }

      .ps-wxfacts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 11px; }
      .ps-wxf { background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                border-radius: var(--pc-r-sm); padding: 6px 9px; min-width: 0; }
      .ps-wxf span { display: block; font-size: var(--pc-fs-micro); letter-spacing: .09em;
                     text-transform: uppercase; color: var(--ps-dim); white-space: nowrap;
                     overflow: hidden; text-overflow: ellipsis; }
      .ps-wxf b { display: block; font-size: var(--pc-fs-md); font-weight: 640; margin-top: 2px;
                  font-variant-numeric: tabular-nums; }
      .ps-wxf b.wet { color: var(--ps-cool); }

      .ps-wxtiles { margin-left: auto; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 6px; min-width: 0; }
      .ps-wxtile { background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                   border-radius: var(--pc-r-sm); padding: 7px 8px 8px; min-width: 58px; }
      /* A truncated label is a MISSING label, and a wrapped one is worse — the
         three tiles read "MIN / 7D", "AVG / 7D", "MAX / 7D" stacked when the
         window was in the label. The window is named once, on the rail caption. */
      .ps-wxtile span { display: block; font-size: var(--pc-fs-micro); letter-spacing: .09em;
                        text-transform: uppercase; color: var(--ps-dim); font-weight: 660;
                        white-space: nowrap; }
      .ps-wxtile b { display: block; font-size: var(--pc-fs-lg); font-weight: 640; margin-top: 3px;
                     letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
      .ps-wxtile b.lo { color: var(--ps-cool); }
      .ps-wxtile b.hi { color: var(--ps-heat); }
      /* Inside the expand the tiles own the full width rather than sharing the
         hero's row, so they stop being a strip squeezed beside a numeral. */
      .ps-wxtiles.wide { margin-left: 0; width: 100%; }

      /* Watch / Listen. A segmented control rather than two chips, because the
         two are alternatives to each other — the same reason the systems pages
         share a dock instead of stacking. */
      .ps-mtabs { display: flex; gap: 3px; padding: 3px; margin: 0 0 12px;
                  background: var(--pc-fill-1); border-radius: var(--pc-r-md); }
      .ps-mtab { flex: 1; border: 0; cursor: pointer; font-family: inherit;
                 padding: 8px 6px; border-radius: var(--pc-r-sm); background: none;
                 text-align: center; color: var(--ps-muted);
                 font-size: var(--pc-fs-sm); font-weight: 660; }
      .ps-mtab.on { background: var(--pc-fill-3); color: var(--ps-text); }

      /* The crew's landing-page face: one row per thing that needs a human, and
         no row at all otherwise. */
      .ps-cwneed { display: flex; align-items: center; gap: 11px; cursor: pointer;
                   padding: 10px 12px; border-radius: var(--pc-r-lg);
                   background: var(--pc-fill-1); border: 1px solid var(--pc-edge); }
      .ps-cwneed + .ps-cwneed { margin-top: 7px; }
      .ps-cwneed.warn { background: rgba(242,193,78,.10); border-color: rgba(242,193,78,.28); }
      .ps-cwneed.bad { background: rgba(239,106,106,.10); border-color: rgba(239,106,106,.30); }
      .ps-cwneed.warn .ps-cwbadge ha-icon { color: var(--ps-warn); }
      .ps-cwneed.bad .ps-cwbadge ha-icon { color: var(--ps-bad); }

      .ps-wxtabs { display: flex; gap: 6px; margin: 14px 0 0; }
      .ps-wxtab { font-size: var(--pc-fs-micro); font-weight: 660; padding: 5px 11px;
                  border-radius: var(--pc-r-pill); background: var(--pc-fill-1);
                  color: var(--ps-dim); border: 1px solid transparent; position: relative; }
      .ps-wxtab.on { background: rgba(77,208,225,.16); color: var(--ps-cool);
                     border-color: rgba(77,208,225,.28); }
      /* The drawn size stays; the target grows behind the paint. */
      .ps-wxtab::after { content: ""; position: absolute; inset: -9px -4px; }

      .ps-wxrh { display: flex; align-items: baseline; gap: 8px; margin: 14px 0 8px; }
      .ps-wxlb { font-size: var(--pc-fs-micro); letter-spacing: .14em; text-transform: uppercase;
                 color: var(--ps-dim); font-weight: 660; }
      .ps-wxrb { margin-left: auto; font-size: var(--pc-fs-micro); color: var(--ps-dim); }

      .ps-wxrail { display: grid; grid-template-columns: repeat(var(--n, 7), minmax(0, 1fr)); gap: 5px; }
      .ps-wxday { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
      .ps-wxhi, .ps-wxlo { font-size: var(--pc-fs-xs); font-variant-numeric: tabular-nums;
                           font-weight: 620; line-height: 1; color: var(--ps-muted); }
      .ps-wxlo { color: var(--ps-dim); font-weight: 600; }
      .ps-wxdw { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-weight: 660;
                 letter-spacing: .04em; }
      .ps-wxday.now .ps-wxhi { color: var(--ps-heat); }
      .ps-wxday.now .ps-wxdw { color: var(--ps-text); }
      .ps-wxi { --mdc-icon-size: 14px; color: var(--ps-muted); }
      .ps-wxpcp { font-size: var(--pc-fs-micro); color: var(--ps-cool); font-weight: 620;
                  font-variant-numeric: tabular-nums; }
      /* Holds the line's height so the day labels stay in a row when a provider
         publishes no probability at all. */
      .ps-wxpcp.none { visibility: hidden; }

      .ps-wxtrack { position: relative; width: 100%; max-width: 20px; height: 116px;
                    border-radius: var(--pc-r-pill); background: var(--ps-track); overflow: hidden; }
      /* A day the recorder has nothing for is hatched and empty. A flat capsule
         at the middle of the axis would be a claim about the weather. */
      .ps-wxtrack.empty { background: repeating-linear-gradient(135deg,
                            rgba(255,255,255,.05) 0 4px, transparent 4px 8px); }
      .ps-wxcap { position: absolute; left: 0; right: 0; border-radius: var(--pc-r-pill);
                  background: linear-gradient(to top, var(--ps-cool), #8fb9d8 42%,
                              #e8c39a 72%, var(--ps-heat)); }
      /* One end published and the other not: a marker at what is known, never a
         capsule running off to the edge of the track. */
      .ps-wxcap.stub { height: 4px; opacity: .75; }
      .ps-wxmark { position: absolute; left: -3px; right: -3px; height: 2px; z-index: 2;
                   background: #fff; border-radius: var(--pc-r-hair);
                   box-shadow: 0 0 6px rgba(255,255,255,.7); }

      /* The hourly strip SCROLLS sideways — twelve hours is not a day, and the
         provider publishes 168. Plain overflow-x and nothing else: setting
         touch-action here (even pan-x pan-y) restricts the element to panning
         and makes the browser's axis commitment stickier, so a slightly diagonal
         swipe locks to vertical and the strip goes dead. purdy-rooms-card's
         strip has always been plain flex + overflow-x and has always worked.
         overscroll-behavior-x stops a fling at the end becoming a page gesture. */
      .ps-wxhrs { display: flex; gap: 2px; align-items: flex-end;
                  overflow-x: auto; overscroll-behavior-x: contain;
                  scrollbar-width: none; padding-bottom: 2px; }
      .ps-wxhrs::-webkit-scrollbar { display: none; }
      .ps-wxhr { flex: 0 0 auto; width: 30px; display: flex; flex-direction: column;
                 align-items: center; gap: 3px; }
      /* A midnight column reads as "12a" whichever day it is the midnight of,
         which is exactly what you lose track of in a strip you have scrolled. */
      .ps-wxhr.nd { border-left: 1px solid var(--ps-hair); margin-left: 3px; padding-left: 3px; }
      .ps-wxht { font-size: var(--pc-fs-micro); color: var(--ps-muted); font-weight: 620;
                 font-variant-numeric: tabular-nums; line-height: 1; }
      .ps-wxhbar { width: 100%; height: 46px; display: flex; align-items: flex-end; }
      .ps-wxhbar i { width: 100%; border-radius: var(--pc-r-hair) var(--pc-r-hair) 0 0;
                     background: linear-gradient(to top, rgba(77,208,225,.35), var(--ps-heat)); }
      .ps-wxhp { font-size: var(--pc-fs-micro); color: var(--ps-cool); font-weight: 600;
                 font-variant-numeric: tabular-nums; line-height: 1; min-height: 10px; }
      .ps-wxhl { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-weight: 620;
                 line-height: 1; white-space: nowrap; }
      .ps-wxhr.now .ps-wxht { color: var(--ps-heat); }
      .ps-wxhr.now .ps-wxhl { color: var(--ps-text); }
      .ps-wxrows { display: flex; flex-direction: column; }
      .ps-wxrow { display: flex; align-items: center; gap: 9px; padding: 8px 0;
                  border-top: 1px solid var(--ps-hair-soft); font-size: var(--pc-fs-sm); }
      .ps-wxrow:first-child { border-top: 0; }
      .ps-wxrow .k { color: var(--ps-muted); flex: 1; min-width: 0; }
      .ps-wxrow .v { font-weight: 640; font-variant-numeric: tabular-nums; }
      .ps-wxrow .v.heat { color: var(--ps-heat); }
      .ps-wxrow .v.cool { color: var(--ps-cool); }
      .ps-wxrow .v.warn { color: var(--ps-warn); }
      .ps-wxrow .v.bad { color: var(--ps-bad); }
      .ps-wxnote { font-size: var(--pc-fs-xs); color: var(--ps-muted); margin-top: 9px;
                   line-height: 1.5; }
      .ps-wxempty { font-size: var(--pc-fs-xs); color: var(--ps-dim); line-height: 1.5;
                    padding: 14px 2px; text-align: center; }
      .ps-wxretry { display: inline-block; margin-left: 7px; color: var(--ps-cool);
                    font-weight: 650; text-decoration: underline; }

      /* nursery: nap rings and the one line of live status */
      .ps-naps { display: flex; gap: 8px; margin-top: 7px; }
      .ps-napr { display: flex; flex-direction: column; align-items: center; gap: 3px; }
      .ps-napr > span { font-size: var(--pc-fs-micro); font-variant-numeric: tabular-nums; }
      .ps-jstat { display: flex; align-items: center; gap: 10px;
                  font-size: var(--pc-fs-xs); color: var(--ps-muted);
                  font-variant-numeric: tabular-nums; padding: 0 2px; }
      /* Start / stop the Hatch, which is start / stop the sleep session. */
      .ps-jhatch { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%;
                   border: 0; cursor: pointer; position: relative;
                   background: var(--pc-fill-2); color: var(--ps-muted);
                   display: flex; align-items: center; justify-content: center; }
      .ps-jhatch.on { background: rgba(170,120,255,.18); color: var(--ps-deep); }
      .ps-jhatch.armed { width: auto; border-radius: var(--pc-r-pill); padding: 0 10px;
                         background: rgba(239,106,106,.16); color: var(--ps-bad); }
      .ps-jhx { font-size: var(--pc-fs-micro); font-weight: 700; white-space: nowrap; }
      .ps-jhatch .ps-ico { width: 15px; height: 15px; }
      .ps-jhatch::after { content: ""; position: absolute; inset: -11px -4px; }
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
        --ps-sheetbot: calc(var(--ps-dockh) + 22px + env(safe-area-inset-bottom, 0px));
        bottom: var(--ps-sheetbot);
        /* The room actually left above the sheet: the viewport, less what the
           dock takes off the bottom, less the status bar, less the gap that
           keeps the greeting visible behind it. A vh cap alone measures the
           WHOLE viewport and knows nothing about the offset it is sitting on,
           so 80vh + a 181px bottom on an 844pt phone put the sheet's header
           12px ABOVE the top of the screen and the status bar ate the rest.
           Whichever of the two is smaller wins. */
        --ps-sheettop: calc(100dvh - var(--ps-sheetbot) - env(safe-area-inset-top, 0px));
        background: rgba(20,23,32,.96); border: 1px solid var(--pc-edge); border-radius: var(--pc-r-xl);
        padding: 13px 15px; box-shadow: 0 24px 60px rgba(0,0,0,.6);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        max-height: min(60vh, calc(var(--ps-sheettop) - 72px));
        overflow-y: auto; overscroll-behavior: contain;
      }
      /* 74vh left the Watch face's transport row hanging 33px past the bottom
         edge — the play button, which is the thing you open the remote for.
         The height was the right lever rather than shaving the controls: a
         sheet slides OVER the column and there was ~120px of unused ground
         above it, so this costs nothing that was being looked at. It stays
         short of full-screen on purpose; seeing the greeting and the time
         behind it is what makes a sheet read as a sheet — which is what the
         24px is buying, and it is measured from below the status bar. */
      .ps-sheet.tall { max-height: min(80vh, calc(var(--ps-sheettop) - 24px)); }
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

      /* crew — two independently expanding zones plus the washer strip.
         Every size, radius and fill is a token step; nothing loose. */
      .ps-cwgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
      .ps-cwcard { background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                   border-radius: var(--pc-r-lg); overflow: hidden; }
      .ps-cwcard.open { background: var(--pc-fill-2); border-color: rgba(77,208,225,.28); }
      .ps-cwface { display: block; width: 100%; text-align: left; padding: 12px 12px 11px; }
      .ps-cwtop { display: flex; align-items: center; gap: 7px; margin-bottom: 9px; }
      .ps-cwdot { width: 6px; height: 6px; border-radius: 50%; background: var(--ps-dim); flex: 0 0 auto; }
      .ps-cwdot.on { background: var(--ps-good); }
      .ps-cwnm { font-size: var(--pc-fs-xs); font-weight: 680; flex: 1; min-width: 0; }
      .ps-cwcv { color: var(--ps-dim); display: flex; flex: 0 0 auto; }
      .ps-cwcard.open .ps-cwcv { color: var(--ps-cool); }
      .ps-cwcv svg { transform: rotate(90deg); }
      .ps-cwcard.open .ps-cwcv svg { transform: rotate(-90deg); }
      .ps-cwring { position: relative; width: 92px; height: 92px; margin: 2px auto 9px; }
      .ps-cwrv { position: absolute; inset: 0; display: flex; flex-direction: column;
                 align-items: center; justify-content: center; line-height: 1.05; }
      .ps-cwrv b { font-size: var(--pc-fs-xl); font-weight: 680; font-variant-numeric: tabular-nums; }
      /* The caption lives INSIDE the horseshoe, so it is bounded by the ring's
         bore and not by the card. A one-word caption never showed it; "dirty
         tank" ran out past the stroke on both sides and the arc drew straight
         through the lettering. Wrapping is the fix rather than a shorter word,
         because the word is the noun the number needs — and the bore is wide
         enough for two lines when it is not wide enough for one. */
      .ps-cwrv span { font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase;
                      color: var(--ps-dim); font-weight: 650; margin-top: 3px;
                      max-width: 62px; text-align: center; line-height: 1.15;
                      text-wrap: balance; }
      .ps-cwl { display: flex; align-items: baseline; gap: 6px; font-size: var(--pc-fs-xs);
                padding-top: 4px; border-top: 1px solid var(--ps-hair-soft); }
      .ps-cwl em { font-style: normal; color: var(--ps-dim); flex: 1; min-width: 0; }
      .ps-cwl b { font-weight: 650; font-variant-numeric: tabular-nums; min-width: 0; }
      .ps-cwl b.warn { color: var(--ps-warn); }
      .ps-cwl b.bad { color: var(--ps-bad); }
      /* The footnote under a derived figure. Dim and small, because it explains
         a number rather than being one — but it clears 4.5:1 like every other
         label, since an explanation nobody can read is not one. */
      .ps-cwfine { font-size: var(--pc-fs-micro); color: var(--ps-dim); line-height: 1.45;
                   margin: 6px 0 2px; }

      /* The panel is full width UNDER the grid, never inside a 50% card —
         squeezing dispatch into half the screen is what wrapped the room
         chips six rows deep. */
      .ps-cwpanel { margin-top: 11px; padding-top: 12px;
                    border-top: 1px solid var(--ps-hair); }
      .ps-cwsub { font-size: var(--pc-fs-micro); letter-spacing: .13em; text-transform: uppercase;
                  color: var(--ps-dim); font-weight: 650; padding: 13px 0 7px; }
      .ps-cwhero { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
                   background: linear-gradient(150deg, rgba(77,208,225,.14), rgba(77,208,225,.04));
                   border: 1px solid rgba(77,208,225,.22); border-radius: var(--pc-r-lg);
                   padding: 12px 13px; }
      .ps-cwplay { width: 40px; height: 40px; border-radius: 50%; flex: 0 0 auto;
                   background: var(--ps-cool); color: #06131a; display: grid; place-items: center; }
      .ps-cwplay .ps-ico { width: 18px; height: 18px; }
      .ps-cwplay .ps-ico path { fill: currentColor; stroke: none; }
      .ps-cwtabs { display: flex; gap: 6px; margin-top: 11px; }
      .ps-cwtab { font-size: var(--pc-fs-xs); font-weight: 680; padding: 5px 12px;
                  border-radius: var(--pc-r-pill); background: var(--pc-fill-1);
                  color: var(--ps-dim); }
      .ps-cwtab.on { background: var(--pc-fill-3); color: var(--ps-text); }
      .ps-cwrooms { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .ps-cwroom { font-size: var(--pc-fs-xs); font-weight: 650; padding: 6px 10px;
                   border-radius: var(--pc-r-pill); background: var(--pc-fill-2);
                   color: var(--ps-muted); border: 1px solid transparent; }
      .ps-cwroom.on { background: rgba(77,208,225,.15); color: var(--ps-cool);
                      border-color: rgba(77,208,225,.3); }
      /* auto-fit with a floor, not a fixed 1fr 1fr: a third button squeezed
         three into a 340px row and clipped "Emptied tank" to "Emptied ta…".
         A truncated label is a MISSING label, not a smaller one — same fix as
         the desk card's room and quick strips. */
      .ps-cwpair { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
                   gap: 9px; margin-top: 10px; }
      .ps-cwbtn { display: flex; align-items: center; gap: 9px; background: var(--pc-fill-2);
                  border: 1px solid var(--pc-edge); border-radius: var(--pc-r-md);
                  padding: 11px 12px; color: var(--ps-muted); font-size: var(--pc-fs-sm);
                  font-weight: 650; }
      .ps-cwbtn ha-icon { --mdc-icon-size: 17px; }
      .ps-cwnote { font-size: var(--pc-fs-xs); color: var(--ps-warn); margin-top: 10px; }

      .ps-cwchart { display: block; width: 100%; height: 56px; }
      .ps-cwaxis { display: flex; justify-content: space-between; font-size: var(--pc-fs-micro);
                   color: var(--ps-dim); font-variant-numeric: tabular-nums; margin-top: 2px; }
      /* An empty box, never a flat line — a straight line through the middle
         is a claim about the cat. */
      .ps-cwempty { height: 56px; border-radius: var(--pc-r-sm); background: var(--pc-fill-1);
                    display: grid; place-items: center; font-size: var(--pc-fs-xs);
                    color: var(--ps-dim); }

      .ps-cwwash { display: flex; align-items: center; gap: 10px; margin-top: 11px;
                   background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                   border-radius: var(--pc-r-md); padding: 10px 12px; }
      .ps-cwwash.alert { background: rgba(242,193,78,.10); border-color: rgba(242,193,78,.24); }
      .ps-cwbadge { width: 34px; height: 34px; border-radius: var(--pc-r-sm); display: grid;
                    place-items: center; background: var(--pc-fill-2); color: var(--ps-muted); flex: 0 0 auto; }
      .ps-cwbadge ha-icon { --mdc-icon-size: 18px; }
      .ps-cwt { font-size: var(--pc-fs-md); font-weight: 650; }
      .ps-cwd { font-size: var(--pc-fs-xs); color: var(--ps-dim); margin-top: 1px; }

      /* fade + dock
       *
       * The dock is STICKY, not fixed, and that is a bug fix rather than a
       * preference. Reported as the nav bar sitting a third of the way up the
       * screen with taps falling through to the tiles behind it — and the fade
       * had moved up with it, which is the tell: one composited layer glitching
       * moves alone, TWO fixed layers landing at the same wrong offset means
       * the fixed containing block itself was wrong. Something in HA's own
       * chrome (this install hides the header, so whatever does that is the
       * first suspect) establishes a containing block, and position:fixed then
       * resolves against it instead of against the viewport. Paint follows that
       * box; hit-testing did not, which is exactly the tap-through.
       *
       * Sticky has no containing-block chain to get wrong — it resolves against
       * the scrollport — so it is immune to the whole class of bug. It also
       * costs nothing here: :host is min-height 100vh, so the dock can always
       * travel to the bottom of the viewport, and being in flow means it
       * reserves its own room instead of :host guessing at it.
       *
       * The fade rides along as a pseudo-element for the same reason. Left as
       * its own fixed layer it would simply desync from the dock again.
       */
      .ps-dockwrap { position: sticky; z-index: 7;
                     bottom: calc(12px + env(safe-area-inset-bottom, 0px));
                     margin: 14px 6px 0;
                     display: flex; flex-direction: column; gap: 9px; }
      .ps-dockwrap::before {
        content: ""; position: absolute; z-index: -1; pointer-events: none;
        left: -12px; right: -12px; top: -76px;
        bottom: calc(-12px - env(safe-area-inset-bottom, 0px));
        background: linear-gradient(180deg, transparent, rgba(6,7,14,.72) 46%, rgba(6,7,14,.94)); }
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

      /* lights — the row is a lit room, not a progress bar. There is no fill
         and no track: a glow starts at the bulb and falls off, and an off
         light is dark rather than zero percent. */
      .pl-moods { display: flex; gap: 6px; margin-bottom: 9px; }
      .pl-mood { flex: 1; padding: 9px 4px 8px; border-radius: var(--pc-r-sm);
                 background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                 color: var(--ps-muted); display: flex; flex-direction: column;
                 align-items: center; gap: 5px; transition: .18s; }
      .pl-mood ha-icon { --mdc-icon-size: 17px; }
      .pl-mood span { font-size: var(--pc-fs-micro); font-weight: 650; letter-spacing: .02em; }
      .pl-mood.on { background: rgba(255,199,125,.14); border-color: rgba(255,199,125,.34);
                    color: #FFC77D; }

      .pl-rows { display: flex; flex-direction: column; gap: 5px; }
      /* pan-y, never none: the page has to keep scrolling until a deliberate
         horizontal drag starts, and a gesture cannot be reclaimed once the
         browser has decided it is a scroll. */
      .pl-row { position: relative; border-radius: var(--pc-r-md); overflow: hidden;
                background: rgba(255,255,255,.026); border: 1px solid rgba(255,255,255,.06);
                touch-action: pan-y; user-select: none; -webkit-user-select: none;
                transition: border-color .3s, box-shadow .3s, background .3s; }
      .pl-glow { position: absolute; inset: 0; opacity: 0; transform: scale(.94);
                 transform-origin: 22px 50%;
                 transition: opacity .32s cubic-bezier(.2,.7,.3,1),
                             transform .32s cubic-bezier(.2,.7,.3,1), background .25s; }
      .pl-row.on .pl-glow { opacity: 1; transform: none; }
      .pl-row.dragging .pl-glow { transition: background .05s; }
      .pl-face { position: relative; display: flex; align-items: center; gap: 12px;
                 padding: 0 14px; height: 58px; }
      .pl-clus { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; width: 26px; }
      .pl-pip { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.13);
                transition: background .3s, box-shadow .35s; }
      .pl-clus.solo .pl-pip { width: 11px; height: 11px; }
      .pl-txt { flex: 1; min-width: 0; }
      .pl-t1 { font-size: var(--pc-fs-md); font-weight: 620; letter-spacing: -.01em;
               color: var(--ps-muted); transition: color .3s;
               text-shadow: 0 1px 4px rgba(0,0,0,.6); }
      .pl-row.on .pl-t1 { color: var(--ps-text); }
      .pl-t2 { font-size: var(--pc-fs-micro); margin-top: 3px; letter-spacing: .05em;
               color: var(--ps-dim); text-shadow: 0 1px 4px rgba(0,0,0,.6); }
      .pl-row.on .pl-t2 { color: rgba(255,255,255,.6); }
      /* small at rest so the name leads, large while adjusting so it is precise */
      .pl-kv { font-size: var(--pc-fs-sm); font-weight: 660; font-variant-numeric: tabular-nums;
               color: rgba(255,255,255,.9); text-shadow: 0 1px 4px rgba(0,0,0,.7);
               opacity: 0; transition: opacity .3s, font-size .18s; }
      .pl-row.on .pl-kv { opacity: 1; }
      .pl-row.dragging .pl-kv { font-size: var(--pc-fs-2xl); letter-spacing: -.03em; }
      .pl-row.dragging .pl-txt { opacity: .35; transition: opacity .18s; }
      .pl-row.na { opacity: .4; }
      .pl-det { position: absolute; top: 0; bottom: 0; width: 1px;
                background: rgba(255,255,255,.16); opacity: 0; transition: opacity .18s; }
      .pl-row.dragging .pl-det { opacity: 1; }

      /* No height transition, and no height CAP.
       *
       * A max-height 0 -> 150px with a .3s transition looked right in the
       * mockup and was wrong in the card: the shell PATCHES, so every repaint
       * replaces this node and the transition restarts from zero. The panel
       * re-animated on every state change, the chips slid vertically under the
       * thumb, and a tap aimed at a lamp landed on the row behind it — which
       * toggles the whole GROUP. That is the "clicking a light turns them all
       * off" report; both members moving within 25ms in the recorder is the
       * signature of the group call.
       *
       * The cap was a second bug on its own: Basement has five members, so the
       * chips wrap past 150px and the warmth track was simply cut off. */
      .pl-more { position: relative; display: none; }
      .pl-row.open .pl-more { display: block; }
      .pl-mb { padding: 0 14px 13px; display: flex; flex-direction: column; gap: 11px; }
      .pl-kids { display: flex; flex-wrap: wrap; gap: 5px; }
      .pl-kid { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px;
                border-radius: var(--pc-r-pill); font-size: var(--pc-fs-xs); font-weight: 600;
                background: rgba(255,255,255,.07); border: 1px solid var(--pc-edge);
                color: var(--ps-muted); }
      .pl-kid.on { background: rgba(255,199,125,.18); border-color: rgba(255,199,125,.34);
                   color: #FFC77D; }
      .pl-kid.na { opacity: .42; text-decoration: line-through; }
      .pl-warmrow { display: flex; align-items: center; gap: 10px; }
      .pl-warm { flex: 1; height: 14px; border-radius: var(--pc-r-pill); position: relative;
                 touch-action: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,.28);
                 background: linear-gradient(90deg,#FF9536,#FFC489,#FFF0DC,#E4EFFF,#C6DDFF); }
      .pl-g { position: absolute; top: 50%; transform: translate(-50%,-50%); width: 16px;
              height: 16px; border-radius: 50%; background: #fff;
              box-shadow: 0 1px 6px rgba(0,0,0,.7); }
      .pl-warmrow em { font-style: normal; font-size: var(--pc-fs-micro);
                       color: rgba(255,255,255,.7); font-variant-numeric: tabular-nums;
                       min-width: 42px; text-align: right; letter-spacing: .03em; }
      .pl-warmrow em.pl-none { min-width: 0; text-align: left; color: var(--ps-dim); }

      /* the guard. Covers the LEVEL as well as the switch — a thumb dragging a
         guarded light to 80% at 2am is the likelier accident of the two. */
      .pl-row.on[data-guard="1"] { border-color: rgba(239,106,106,.32); }
      .pl-ask { margin-top: 5px; border-radius: var(--pc-r-md); overflow: hidden;
                background: rgba(239,106,106,.09); border: 1px solid rgba(239,106,106,.36); }
      .pl-ab { padding: 12px 14px 10px; display: flex; gap: 11px; }
      .pl-amk { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%; display: grid;
                place-items: center; background: rgba(239,106,106,.2); color: var(--ps-bad); }
      .pl-amk ha-icon { --mdc-icon-size: 16px; }
      .pl-ask b { display: block; font-size: var(--pc-fs-sm); font-weight: 660; color: #FFB4B4; }
      .pl-ask p { margin: 4px 0 0; font-size: var(--pc-fs-xs); line-height: 1.5;
                  color: rgba(255,255,255,.66); }
      .pl-arow { display: flex; gap: 7px; padding: 0 14px 12px; }
      .pl-abtn { flex: 1; padding: 9px; border-radius: var(--pc-r-sm); font-size: var(--pc-fs-xs);
                 font-weight: 650; border: 1px solid var(--pc-edge); background: var(--pc-fill-2);
                 color: var(--ps-text); }
      .pl-abtn.go { background: rgba(239,106,106,.2); border-color: rgba(239,106,106,.44);
                    color: #FFC2C2; }

      /* ---------------------------------------------------- systems mode --*/
      /* A page is not a section: no hairline between siblings (there is only
         ever one), and it owns its own vertical rhythm. */
      .ps-sypage { padding: 4px 13px 15px; display: flex; flex-direction: column; gap: 9px; overflow-x: clip; }
      .ps-syh { font-size: var(--pc-fs-2xl); font-weight: 640; letter-spacing: -.028em; margin: 1px 0 0; line-height: 1.1; }

      /* The glass sub-panel the pages are built from. One step darker than the
         column it sits in, so the page reads as blocks rather than as a wall. */
      .ps-sycard { background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                   border-radius: var(--pc-r-xl); padding: 11px 12px;
                   display: flex; flex-direction: column; gap: 8px; }
      .ps-syrow { display: flex; align-items: center; justify-content: space-between; gap: 9px; width: 100%; }
      .ps-sysub { font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .ps-sysub b { color: var(--ps-text); font-weight: 640; }
      .ps-syhair { height: 1px; background: var(--ps-hair); }
      .ps-symeta { display: block; font-size: var(--pc-fs-micro); color: var(--ps-dim);
                   font-variant-numeric: tabular-nums; margin-top: 1px; }

      .ps-syid { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
      .ps-syid > div { min-width: 0; cursor: pointer; }
      .ps-syk { display: block; font-size: var(--pc-fs-micro); letter-spacing: .1em;
                text-transform: uppercase; color: var(--ps-dim); font-weight: 650; }
      .ps-syid b { font-size: var(--pc-fs-md); font-weight: 640; }
      .ps-syid em { font-style: normal; font-size: var(--pc-fs-xs); color: var(--ps-warn); }
      .ps-syreg { display: flex; align-items: center; gap: 8px; font-size: var(--pc-fs-sm);
                  color: var(--ps-warn); cursor: pointer; }
      .ps-syreg b { color: var(--ps-text); font-weight: 650; }

      /* A meter whose subject IS the fill gets the full width. The 54px inline
         bar is right for a row in a list of other things and wrong here. */
      .ps-syb { display: grid; grid-template-columns: 1fr auto; gap: 3px 9px; cursor: pointer; padding: 2px 0; }
      .ps-sybk { font-size: var(--pc-fs-sm); color: var(--ps-muted); min-width: 0;
                 overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ps-sybk i { font-style: normal; color: var(--ps-dim); font-size: var(--pc-fs-xs); }
      .ps-sybv { font-size: var(--pc-fs-sm); font-weight: 650; font-variant-numeric: tabular-nums; }
      .ps-sybv.warn { color: var(--ps-warn); } .ps-sybv.bad { color: var(--ps-bad); }
      /* A disk whose SMART is not PASSED: the number may be fine and the drive
         is not, so the colour goes on the name rather than on the fill. */
      .ps-syb-bad .ps-sybk { color: var(--ps-bad); }
      .ps-sybar { grid-column: 1 / -1; height: 5px; border-radius: var(--pc-r-pill);
                  background: var(--ps-track); overflow: hidden; position: relative; }
      .ps-sybar.tall { height: 7px; }
      .ps-sybar i { display: block; height: 100%; border-radius: var(--pc-r-pill); background: var(--ps-good); }
      .ps-sybar i.warn { background: var(--ps-warn); }
      .ps-sybar i.bad { background: var(--ps-bad); }
      .ps-sybar i.fan { background: var(--ps-deep); }

      .ps-sytot { display: flex; flex-direction: column; gap: 1px; }
      .ps-sybig { font-size: var(--pc-fs-2xl); font-weight: 640; letter-spacing: -.028em;
                  font-variant-numeric: tabular-nums; cursor: pointer; }
      .ps-sybig small { font-size: var(--pc-fs-sm); font-weight: 500; color: var(--ps-muted); margin-left: 3px; }
      .ps-sytog { cursor: pointer; }
      .ps-syshare { font-size: var(--pc-fs-sm); cursor: pointer; }
      .ps-syshare b { font-variant-numeric: tabular-nums; font-weight: 650; }

      .ps-vits.two { grid-template-columns: repeat(2, 1fr); }
      .ps-sw.off { opacity: .62; }
      .ps-sw .ps-grow { min-width: 0; cursor: pointer; }

      .ps-sycpu { font-size: var(--pc-fs-md); font-weight: 650; }
      .ps-syhero { font-size: var(--pc-fs-2xl); font-weight: 640; letter-spacing: -.028em;
                   font-variant-numeric: tabular-nums; text-align: right; }
      .ps-syhero.live { color: var(--ps-cool); }
      .ps-syhero span { display: block; font-size: var(--pc-fs-micro); font-weight: 500; color: var(--ps-muted); }
      /* No touch-action here. The graph must not claim the gesture until a
         deliberate press has completed — see _bindScrub. */
      .ps-sygraph { position: relative; width: 100%; }
      .ps-sygraph svg { width: 100%; height: 46px; display: block; }

      .ps-syfans { display: grid; grid-template-columns: auto 1fr auto; gap: 6px 10px; align-items: center; }
      .ps-syfk { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .ps-syfv { font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums;
                 white-space: nowrap; }
      .ps-syfv b { color: var(--ps-text); font-weight: 640; }
      /* A channel nobody can hear back from is not a stopped fan. */
      .ps-syfv em { font-style: normal; color: var(--ps-dim); }
      .ps-syq2 { font-style: normal; color: var(--ps-dim); letter-spacing: .06em; }

      .ps-syn { display: flex; align-items: flex-start; gap: 9px; padding: 5px 0; }
      .ps-syn + .ps-syn { border-top: 1px solid var(--ps-hair-soft); }
      .ps-synt { display: block; font-size: var(--pc-fs-sm); line-height: 1.4; }

      /* Home exits the mode rather than switching within it, so it must not
         read as a sixth peer. */
      .ps-db.home { color: var(--ps-text); }
      .ps-db.home ha-icon { background: var(--pc-fill-2); border-radius: var(--pc-r-xs); padding: 3px; }


      /* ------------------------------------------------------------ weather --
       * Condition-driven precipitation over the ground. Adapted from the
       * technique the open HA animated cards use: discrete elongated drops
       * scattered in a repeating tile, two layers at different speed and alpha
       * for parallax. NOT a repeating-linear-gradient hatch — that has no gaps,
       * so there are no individual drops to see, and its Ndeg argument sets the
       * gradient AXIS, which puts the stripes perpendicular to the angle asked
       * for (14deg draws near-horizontal bands, i.e. scanlines).
       *
       * Three rules are load-bearing:
       *
       *   - It rides .ps-ground, which _mount builds once and no patch ever
       *     rewrites, driven by one data-wx attribute write. An animation
       *     inside a patched string restarts from zero on every state change —
       *     that was the v1.45.2 lamp chip, and it is why this is not drawn
       *     inside the weather section.
       *
       *   - Travel is exactly one tile height, so the loop is seamless. A
       *     SLANTED tile cannot loop on a vertical translate: the skewed
       *     lattice lands off its own period and the pattern visibly jumps
       *     every cycle. So the drops fall straight down, which is also how
       *     rain reads through a window on a still day.
       *
       *   - .ps-ground is position:fixed, so both layers stay viewport-sized
       *     however tall the column grows. An absolute layer on a 3000px
       *     column would hand the compositor a 3400px texture twice over.
       */
      /* In FRONT of the glass column, not behind it. The column carries
         backdrop-filter: blur(26px), which turns a 1px rain streak into
         nothing at all — a ground layer is invisible under frosted glass,
         which a mockup without the blur cannot show you. z-index 6 puts it
         over the column but under the dock (7), the scrim (8) and the
         sheets (9), so opening a sheet covers the weather rather than
         competing with it. */
      .ps-wxfx {
        position: fixed; inset: 0; z-index: 6; pointer-events: none; overflow: hidden;
      --ps-wx-rain-near:
        radial-gradient(ellipse 1.24px 15.5px at 38.2px 182.7px,rgba(200,224,255,0.39) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.02px 9.5px at 136.9px 72.2px,rgba(200,224,255,0.62) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.18px 12.8px at 155.6px 106.3px,rgba(200,224,255,0.53) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.17px 12.3px at 124.4px 156.0px,rgba(200,224,255,0.58) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.04px 14.2px at 58.0px 96.3px,rgba(200,224,255,0.58) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.39px 9.9px at 57.3px 35.8px,rgba(200,224,255,0.49) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.05px 13.4px at 73.0px 21.6px,rgba(200,224,255,0.57) 0%,rgba(200,224,255,0) 100%);
      --ps-wx-rain-near-size: 160px 200px;
      --ps-wx-rain-far:
        radial-gradient(ellipse 0.81px 5.3px at 33.6px 55.3px,rgba(200,224,255,0.26) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.92px 5.4px at 118.5px 17.0px,rgba(200,224,255,0.19) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.81px 6.4px at 110.3px 54.1px,rgba(200,224,255,0.23) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.84px 7.7px at 89.9px 78.5px,rgba(200,224,255,0.22) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.93px 5.1px at 17.8px 146.6px,rgba(200,224,255,0.20) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.72px 6.4px at 17.6px 115.2px,rgba(200,224,255,0.29) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.99px 5.2px at 112.9px 145.7px,rgba(200,224,255,0.21) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.76px 8.4px at 108.6px 6.4px,rgba(200,224,255,0.18) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.93px 8.8px at 39.6px 174.3px,rgba(200,224,255,0.26) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.88px 7.3px at 21.6px 92.4px,rgba(200,224,255,0.22) 0%,rgba(200,224,255,0) 100%);
      --ps-wx-rain-far-size: 140px 200px;
      --ps-wx-pour-near:
        radial-gradient(ellipse 1.41px 21.3px at 35.8px 182.7px,rgba(200,224,255,0.43) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.13px 13.6px at 128.4px 72.2px,rgba(200,224,255,0.68) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.33px 17.9px at 145.9px 106.3px,rgba(200,224,255,0.58) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.31px 17.3px at 116.6px 156.0px,rgba(200,224,255,0.64) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.15px 19.7px at 54.4px 96.3px,rgba(200,224,255,0.64) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.59px 14.1px at 53.7px 35.8px,rgba(200,224,255,0.54) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.16px 18.6px at 68.4px 21.6px,rgba(200,224,255,0.62) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.56px 15.4px at 12.7px 121.1px,rgba(200,224,255,0.57) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.36px 19.4px at 52.9px 62.6px,rgba(200,224,255,0.50) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.41px 16.4px at 23.7px 174.8px,rgba(200,224,255,0.68) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.23px 21.3px at 72.7px 35.6px,rgba(200,224,255,0.57) 0%,rgba(200,224,255,0) 100%);
      --ps-wx-pour-near-size: 150px 200px;
      --ps-wx-pour-far:
        radial-gradient(ellipse 0.91px 7.4px at 31.2px 55.3px,rgba(200,224,255,0.30) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.02px 7.5px at 110.1px 17.0px,rgba(200,224,255,0.23) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.91px 8.8px at 102.4px 54.1px,rgba(200,224,255,0.27) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.94px 10.3px at 83.4px 78.5px,rgba(200,224,255,0.26) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.03px 7.2px at 16.5px 146.6px,rgba(200,224,255,0.24) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.82px 8.8px at 16.3px 115.2px,rgba(200,224,255,0.33) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.09px 7.2px at 104.9px 145.7px,rgba(200,224,255,0.25) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.86px 11.3px at 100.8px 6.4px,rgba(200,224,255,0.22) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.03px 11.7px at 36.8px 174.3px,rgba(200,224,255,0.30) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.98px 9.9px at 20.1px 92.4px,rgba(200,224,255,0.26) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.94px 7.2px at 33.0px 123.5px,rgba(200,224,255,0.31) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 1.01px 9.0px at 17.9px 7.1px,rgba(200,224,255,0.28) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.84px 7.8px at 36.4px 199.0px,rgba(200,224,255,0.21) 0%,rgba(200,224,255,0) 100%),
        radial-gradient(ellipse 0.90px 10.7px at 67.1px 55.6px,rgba(200,224,255,0.27) 0%,rgba(200,224,255,0) 100%);
      --ps-wx-pour-far-size: 130px 200px;
      --ps-wx-snow-near:
        radial-gradient(ellipse 2.48px 1.7px at 37.8px 199.5px,rgba(255,255,255,0.51) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.72px 1.9px at 41.7px 3.2px,rgba(255,255,255,0.56) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 2.23px 2.5px at 59.9px 163.0px,rgba(255,255,255,0.43) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 2.53px 2.2px at 93.7px 197.4px,rgba(255,255,255,0.34) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 2.47px 1.7px at 128.9px 123.5px,rgba(255,255,255,0.54) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.57px 2.2px at 57.0px 111.2px,rgba(255,255,255,0.45) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 2.45px 1.8px at 65.2px 76.4px,rgba(255,255,255,0.41) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 2.46px 2.4px at 68.7px 145.8px,rgba(255,255,255,0.48) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 2.09px 2.2px at 38.7px 112.0px,rgba(255,255,255,0.54) 0%,rgba(255,255,255,0) 100%);
      --ps-wx-snow-near-size: 150px 200px;
      --ps-wx-snow-far:
        radial-gradient(ellipse 1.00px 1.3px at 33.1px 108.3px,rgba(255,255,255,0.26) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.49px 1.3px at 99.3px 120.5px,rgba(255,255,255,0.20) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.37px 1.4px at 15.8px 184.7px,rgba(255,255,255,0.26) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.02px 1.3px at 54.8px 181.2px,rgba(255,255,255,0.21) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.63px 1.4px at 0.8px 198.9px,rgba(255,255,255,0.23) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.47px 1.4px at 4.0px 30.4px,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.45px 1.6px at 124.9px 62.6px,rgba(255,255,255,0.25) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.56px 1.1px at 129.3px 173.7px,rgba(255,255,255,0.22) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.63px 1.7px at 84.9px 179.6px,rgba(255,255,255,0.23) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.21px 1.2px at 15.9px 150.7px,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.19px 1.1px at 23.1px 114.2px,rgba(255,255,255,0.20) 0%,rgba(255,255,255,0) 100%),
        radial-gradient(ellipse 1.01px 1.3px at 122.0px 156.3px,rgba(255,255,255,0.27) 0%,rgba(255,255,255,0) 100%);
      --ps-wx-snow-far-size: 130px 200px;
      }

      .ps-wxfx::before, .ps-wxfx::after {
        content: ""; position: absolute; left: 0; right: 0; top: -200px; bottom: -200px;
        pointer-events: none; opacity: 0; background-repeat: repeat;
      }
      /* No data-wx means no layer at all. Clear weather, and a weather entity
         that is not reporting, both draw nothing — neither one draws "clear". */
      .ps-wxfx[data-wx]::before, .ps-wxfx[data-wx]::after { opacity: var(--ps-wxstr, 1); }

      @keyframes ps-wxfall {
        from { transform: translate3d(0, -200px, 0); }
        to   { transform: translate3d(0, 0, 0); }
      }
      @keyframes ps-wxsway {
        from { transform: translate3d(-7px, -200px, 0); }
        50%  { transform: translate3d(7px, -100px, 0); }
        to   { transform: translate3d(-7px, 0, 0); }
      }
      @keyframes ps-wxdrift {
        from { transform: translate3d(-25%, 0, 0); }
        to   { transform: translate3d(25%, 0, 0); }
      }
      /* Lightning brightens the ground rather than painting a white overlay:
         both pseudo-elements are already spent on the rain, and a flash that
         lifts the drops with it is what a real strike does. */
      @keyframes ps-wxflash {
        0%, 4%, 100% { background-color: transparent; }
        4.4%         { background-color: rgba(200, 220, 255, .15); }
        4.9%         { background-color: transparent; }
        5.5%         { background-color: rgba(200, 220, 255, .09); }
        6.1%         { background-color: transparent; }
      }

      .ps-wxfx[data-wx="rain"]::before {
        background-image: var(--ps-wx-rain-near); background-size: var(--ps-wx-rain-near-size);
        animation: ps-wxfall .75s linear infinite;
      }
      .ps-wxfx[data-wx="rain"]::after {
        background-image: var(--ps-wx-rain-far); background-size: var(--ps-wx-rain-far-size);
        animation: ps-wxfall 1.35s linear infinite;
      }
      .ps-wxfx[data-wx="pour"]::before, .ps-wxfx[data-wx="storm"]::before {
        background-image: var(--ps-wx-pour-near); background-size: var(--ps-wx-pour-near-size);
        animation: ps-wxfall .5s linear infinite;
      }
      .ps-wxfx[data-wx="pour"]::after, .ps-wxfx[data-wx="storm"]::after {
        background-image: var(--ps-wx-pour-far); background-size: var(--ps-wx-pour-far-size);
        animation: ps-wxfall .95s linear infinite;
      }
      .ps-wxfx[data-wx="storm"] { animation: ps-wxflash 9s linear infinite; }
      .ps-wxfx[data-wx="snow"]::before {
        background-image: var(--ps-wx-snow-near); background-size: var(--ps-wx-snow-near-size);
        animation: ps-wxsway 7s linear infinite;
      }
      .ps-wxfx[data-wx="snow"]::after {
        background-image: var(--ps-wx-snow-far); background-size: var(--ps-wx-snow-far-size);
        animation: ps-wxsway 11s linear infinite reverse;
      }
      .ps-wxfx[data-wx="fog"]::before {
        top: 0; bottom: 0; background-size: 200% 100%;
        background-image: linear-gradient(180deg, transparent 20%, rgba(180,195,215,.14) 45%, transparent 70%);
        animation: ps-wxdrift 18s linear infinite;
      }
      .ps-wxfx[data-wx="fog"]::after {
        top: 0; bottom: 0; background-size: 200% 100%;
        background-image: linear-gradient(180deg, transparent 45%, rgba(170,185,210,.10) 72%, transparent 95%);
        animation: ps-wxdrift 30s linear infinite reverse;
      }

      /* ------------------------------------------------------ health / Body

         The METER is the only unit here. A missing reading gets .ps-hmn and no
         .ps-hmt at all, so there is no rail to read as a low value - the rule
         is enforced in the renderer, and there is deliberately no "empty rail"
         style for it to fall back to. */
      .ps-hmg { display: grid; gap: 13px 10px; }
      .ps-hmg.g2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .ps-hmg.g3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .ps-hmg.g4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .ps-hm { min-width: 0; }
      .ps-hmk { font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase;
                color: var(--ps-dim); font-weight: 650; margin-bottom: 3px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ps-hmv { font-size: var(--pc-fs-lg); font-weight: 700; letter-spacing: -.03em;
                font-variant-numeric: tabular-nums; line-height: 1.15; }
      .ps-hmv u { text-decoration: none; font-size: var(--pc-fs-xs); color: var(--ps-dim);
                  margin-left: 1px; letter-spacing: 0; font-weight: 600; }
      .ps-hmv.none { color: var(--ps-dim); }
      .ps-hmn { margin-top: 8px; font-size: var(--pc-fs-micro); letter-spacing: .08em;
                text-transform: uppercase; color: var(--ps-dim); }
      .ps-hmt { position: relative; height: 12px; margin-top: 6px; }
      .ps-hmt::before { content: ""; position: absolute; left: 0; right: 0; top: 5px; height: 2px;
                        background: var(--ps-track); border-radius: var(--pc-r-hair); }
      .ps-hmb { position: absolute; top: 3px; height: 6px; border-radius: var(--pc-r-hair);
                background: var(--pc-fill-3); border: 1px solid var(--pc-edge); }
      .ps-hmb.cap { background: rgba(129,201,149,.16); border-color: rgba(129,201,149,.30); }
      .ps-hmd { position: absolute; top: 1px; width: 10px; height: 10px; border-radius: var(--pc-r-pill);
                background: var(--ps-good); border: 2px solid #0b0f16; transform: translateX(-50%); }
      .ps-hmd.out { background: var(--ps-warn); }
      .ps-hmd.high { background: var(--ps-cool); }
      .ps-hmd.q { background: var(--ps-dim); }

      .ps-hblk { display: flex; flex-direction: column; gap: 9px; }
      .ps-hbh { display: flex; align-items: center; gap: 8px; }
      .ps-hbt { font-size: var(--pc-fs-md); font-weight: 700; letter-spacing: -.01em; }
      .ps-hbw { font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase;
                color: var(--ps-dim); font-weight: 650; flex: 1; min-width: 0; }
      .ps-hsyn { font-size: var(--pc-fs-sm); color: var(--ps-muted); margin-top: 10px; line-height: 1.45; }
      .ps-hsyn b { color: var(--ps-text); font-weight: 650; }
      .ps-hsyn em { font-style: normal; color: var(--ps-good); font-weight: 650; }
      .ps-hsyn em.w { color: var(--ps-warn); }
      .ps-hcap { font-size: var(--pc-fs-micro); letter-spacing: .08em; text-transform: uppercase;
                 color: var(--ps-dim); }
      .ps-hnote { font-size: var(--pc-fs-xs); color: var(--ps-dim); line-height: 1.45; }
      .ps-hnote b { color: var(--ps-muted); font-weight: 650; }

      .ps-hstage { display: flex; height: 15px; border-radius: var(--pc-r-xs); overflow: hidden; gap: 1.5px; }
      .ps-hstage i { display: block; height: 100%; }
      .ps-hstage i.d { background: var(--ps-deep); }
      .ps-hstage i.c { background: var(--ps-light); }
      .ps-hstage i.r { background: var(--ps-cool); }
      .ps-hstage i.a { background: var(--ps-awake); }
      .ps-hslg { display: flex; flex-wrap: wrap; gap: 6px 13px; }
      .ps-hslg span { font-size: var(--pc-fs-xs); color: var(--ps-muted); display: flex;
                      align-items: center; gap: 5px; }
      .ps-hslg i { width: 7px; height: 7px; border-radius: var(--pc-r-hair); flex: 0 0 auto; }
      .ps-hslg i.d { background: var(--ps-deep); }
      .ps-hslg i.c { background: var(--ps-light); }
      .ps-hslg i.r { background: var(--ps-cool); }
      .ps-hslg i.a { background: var(--ps-awake); }
      .ps-hslg b { color: var(--ps-text); font-weight: 650; font-variant-numeric: tabular-nums; }

      .ps-htrace { display: block; width: 100%; height: 62px; }

      .ps-hctr { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
      .ps-hct { background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                border-radius: var(--pc-r-xs); padding: 9px 7px; min-width: 0; text-align: center; }
      .ps-hct b { display: block; font-size: var(--pc-fs-lg); font-weight: 700; letter-spacing: -.03em;
                  font-variant-numeric: tabular-nums; }
      .ps-hct b u { text-decoration: none; font-size: var(--pc-fs-xs); color: var(--ps-dim); margin-left: 1px; }
      .ps-hct span { display: block; font-size: var(--pc-fs-micro); letter-spacing: .07em;
                     text-transform: uppercase; color: var(--ps-dim); margin-top: 3px; }

      @media (prefers-reduced-motion: reduce) {
        * { transition: none !important; }
        .ps-wxfx, .ps-wxfx::before, .ps-wxfx::after { animation: none !important; }
      }
    `;

