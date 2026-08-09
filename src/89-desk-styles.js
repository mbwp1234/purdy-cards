/* ============================================================================
 * purdy-desk-card — styles
 *
 * Kept whole and in source order, like the shell's. Splitting a sheet by
 * section re-orders rules and quietly changes the cascade.
 *
 * Two rules govern this file:
 *
 *   1. Sizes, radii and surface tints come from the scales in PC_TOKENS. Pick a
 *      step; do not invent one. The three desk-only steps below are declared as
 *      tokens for the same reason — a desk is read from three feet rather than
 *      one, so the display sizes genuinely differ, and the way to express that
 *      is to extend the scale rather than to sprinkle loose pixels.
 *
 *   2. Exactly ONE property animates on this screen: the stage's
 *      grid-template-columns, on a node the renderer never replaces. Every
 *      other state change is a display swap. A transition on a patched node
 *      re-runs from zero on every repaint.
 *
 * The palette is declared with the SHELL's variable names on purpose. The ring
 * and sparkline helpers are borrowed verbatim from purdy-shell-card and write
 * var(--ps-track) and var(--ps-warn) into their SVG; sharing the names is what
 * lets those be one function instead of two.
 * ========================================================================== */

const PD_STYLES = `
      :host {
        ${PC_TOKENS}

        --ps-text: #e8eef4;
        --ps-muted: #8792a0;
        /* The smallest text must not also be the faintest. #606b79 measures
           3.6:1 on this ground — under the 4.5:1 floor — and it would colour
           every uppercase micro label on the screen. This is ~4.9:1. */
        --ps-dim: #7c8797;
        --ps-cool: #4dd0e1;
        --ps-heat: #ff9557;
        --ps-good: #81c995;
        --ps-warn: #f2c14e;
        --ps-bad: #ef6a6a;
        --ps-deep: #aa78ff;
        --ps-light: #50a0ff;
        --ps-track: rgba(255, 255, 255, 0.12);
        --ps-hair: rgba(255, 255, 255, 0.075);
        --ps-hair-soft: rgba(255, 255, 255, 0.045);

        /* Desk display steps. Read at arm's length rather than at reading
           distance, so the clock and the hero numbers sit above the shared
           scale's top step rather than borrowing it. */
        --pd-fs-clock: 34px;
        --pd-fs-hero: 26px;
        --pd-fs-big: 21px;

        display: block;
        position: relative;
        /* Never wider than the view. The shell once carried a negative
           horizontal margin to fight view padding and the whole page scrolled
           sideways whenever a drag started. */
        max-width: 100%;
        overflow: hidden;
        /* The desk is a fixed sheet: the page does not scroll, the panels do.
           The offset is what the HA header, the view padding and any kiosk-mode
           setting take off the top — which differs per install and is the first
           thing that will need tuning, so it is the viewport_offset config key
           rather than a number baked into the sheet. */
        height: calc(100dvh - var(--pd-off, 88px));
        min-height: 560px;
        color: var(--ps-text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        border-radius: var(--pc-r-2xl);
      }

      * { box-sizing: border-box; }
      button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; }
      button:disabled { opacity: .35; cursor: default; }
      img { max-width: 100%; display: block; }

      /* ---------------------------------------------------------- ground --*/

      /* One gradient under everything. The melded look depends on there being
         no per-panel backgrounds — twelve cards with a margin read as a list of
         boxes however they are styled, because the boxes ARE the gaps. */
      .pd-ground {
        position: absolute; inset: 0; pointer-events: none;
        border-radius: inherit;
        background:
          radial-gradient(95% 78% at 88% -14%, rgba(122, 86, 255, .40), transparent 62%),
          radial-gradient(80% 70% at 4% 108%, rgba(26, 128, 142, .42), transparent 60%),
          radial-gradient(60% 50% at 46% 46%, rgba(60, 44, 120, .30), transparent 70%),
          linear-gradient(168deg, #0B0D16 0%, #080A12 55%, #06070E 100%);
      }

      /* One continuous glass sheet, subdivided by hairlines. */
      .pd-sheet {
        position: relative;
        height: 100%;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        background: linear-gradient(180deg, rgba(255,255,255,.058), rgba(255,255,255,.028));
        border: 1px solid var(--pc-edge);
        border-radius: var(--pc-r-2xl);
        overflow: hidden;
        box-shadow: 0 30px 80px -20px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.07);
        backdrop-filter: blur(28px) saturate(1.25);
        -webkit-backdrop-filter: blur(28px) saturate(1.25);
      }

      .pd-tier { display: flex; min-width: 0; }
      .pd-tier + .pd-tier { border-top: 1px solid var(--ps-hair); }
      .pd-t1, .pd-t3 { flex: 0 0 auto; }
      .pd-t2 { min-height: 0; }

      .pd-z {
        padding: 12px 18px; min-width: 0;
        display: flex; flex-direction: column; justify-content: center;
      }
      .pd-z + .pd-z { border-left: 1px solid var(--ps-hair-soft); }

      /* ----------------------------------------------------------- atoms --*/

      .pd-lbl {
        font-size: var(--pc-fs-micro); letter-spacing: .14em; text-transform: uppercase;
        color: var(--ps-dim); font-weight: 600; margin-bottom: 6px;
      }
      .pd-grow { flex: 1; min-width: 0; }
      .pd-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pd-dimtext { font-size: var(--pc-fs-xs); color: var(--ps-dim); }
      .pd-ico { width: 18px; height: 18px; display: block; flex: 0 0 auto; }
      .pd-ico path, .pd-ico circle, .pd-ico rect, .pd-ico line, .pd-ico polyline {
        fill: none; stroke: currentColor; stroke-width: 1.7;
        stroke-linecap: round; stroke-linejoin: round;
      }
      ha-icon { --mdc-icon-size: 18px; flex: 0 0 auto; }

      .pd-chip {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 3px 9px; border-radius: var(--pc-r-pill);
        font-size: var(--pc-fs-xs); font-weight: 600;
        background: var(--pc-fill-2); color: var(--ps-muted);
        font-variant-numeric: tabular-nums; white-space: nowrap;
      }
      .pd-chip.good { background: rgba(129,201,149,.16); color: var(--ps-good); }
      .pd-chip.warn { background: rgba(242,193,78,.16); color: var(--ps-warn); }
      .pd-chip.bad  { background: rgba(239,106,106,.16); color: var(--ps-bad); }
      .pd-chip.cool { background: rgba(77,208,225,.15); color: var(--ps-cool); }
      .pd-chip.heat { background: rgba(255,149,87,.15); color: var(--ps-heat); }
      .pd-chip.deep { background: rgba(170,120,255,.17); color: var(--ps-deep); }
      .pd-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }

      .pd-mini-btn {
        font-size: var(--pc-fs-xs); font-weight: 600; color: var(--ps-muted);
        background: var(--pc-fill-2); border-radius: var(--pc-r-xs);
        padding: 4px 10px; white-space: nowrap;
      }
      .pd-mini-btn:hover { background: var(--pc-fill-3); color: var(--ps-text); }
      .pd-mini-btn.arm { background: rgba(239,106,106,.2); color: var(--ps-bad); }
      .pd-note { font-size: var(--pc-fs-micro); color: var(--ps-dim); margin-top: 6px; }
      .pd-empty { font-size: var(--pc-fs-sm); color: var(--ps-muted); padding: 6px 0; }

      /* Focus has to be visible on a view driven by a keyboard as often as a
         mouse — a desk view is the one place tabbing is normal. */
      button:focus-visible, [tabindex]:focus-visible, input:focus-visible {
        outline: 2px solid var(--ps-cool); outline-offset: 2px; border-radius: var(--pc-r-hair);
      }

      /* --------------------------------------------------- tier 1 · strip --*/

      .pd-z-id { flex: 0 0 clamp(200px, 17%, 290px); }
      .pd-z-id h2 {
        margin: 0; font-size: var(--pc-fs-xl); font-weight: 640;
        letter-spacing: -.024em; line-height: 1.15;
      }
      .pd-sub { font-size: var(--pc-fs-xs); color: var(--ps-muted); margin-top: 2px; }

      .pd-z-clock { flex: 0 0 130px; align-items: center; text-align: center; }
      .pd-time {
        font-size: var(--pd-fs-clock); font-weight: 200; letter-spacing: -.035em;
        font-variant-numeric: tabular-nums; line-height: 1;
      }
      .pd-mer {
        font-size: var(--pc-fs-micro); letter-spacing: .15em; text-transform: uppercase;
        color: var(--ps-dim); margin-top: 5px; font-weight: 600;
      }

      .pd-z-wx { flex: 0 0 clamp(190px, 15%, 250px); cursor: pointer; }
      .pd-wxmain { display: flex; align-items: center; gap: 11px; }
      .pd-wxmain ha-icon { --mdc-icon-size: 30px; color: var(--ps-cool); }
      .pd-wxt {
        font-size: var(--pd-fs-hero); font-weight: 600;
        letter-spacing: -.025em; font-variant-numeric: tabular-nums; line-height: 1.1;
      }
      .pd-wxs { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .pd-wxout {
        display: flex; gap: 14px; margin-top: 6px;
        font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums;
      }
      .pd-wxout b { color: var(--ps-text); font-weight: 600; }

      .pd-z-hvac { flex: 1; }
      .pd-hv { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
      .pd-hvbig {
        font-size: var(--pd-fs-hero); font-weight: 600;
        letter-spacing: -.025em; font-variant-numeric: tabular-nums; line-height: 1.1;
      }
      .pd-zpair { display: flex; gap: 6px; }
      .pd-zc {
        padding: 5px 10px; border-radius: var(--pc-r-xs); background: var(--pc-fill-1);
        font-size: var(--pc-fs-xs); color: var(--ps-muted);
        font-variant-numeric: tabular-nums; line-height: 1.3;
      }
      .pd-zc b { display: block; font-size: var(--pc-fs-md); color: var(--ps-text); font-weight: 650; }
      .pd-zc.on { background: rgba(77,208,225,.15); color: var(--ps-cool); }
      .pd-zc.on b { color: var(--ps-cool); }

      .pd-z-sec { flex: 0 0 auto; }
      .pd-ppl { display: flex; gap: 8px; }
      .pd-pw {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 12px 6px 6px; border-radius: var(--pc-r-pill);
        background: var(--pc-fill-1); cursor: pointer;
      }
      .pd-pw:hover { background: var(--pc-fill-2); }
      .pd-av {
        width: 27px; height: 27px; border-radius: 50%; background: var(--pc-fill-3);
        display: grid; place-items: center;
        font-size: var(--pc-fs-xs); font-weight: 700; color: var(--ps-muted); flex: 0 0 auto;
      }
      .pd-pw.home .pd-av { background: rgba(129,201,149,.2); color: var(--ps-good); }
      .pd-pn { font-size: var(--pc-fs-sm); font-weight: 600; line-height: 1.15; }
      .pd-pb { font-size: var(--pc-fs-micro); color: var(--ps-muted); font-variant-numeric: tabular-nums; }
      .pd-pb.low { color: var(--ps-warn); }

      .pd-z-alert { flex: 0 0 auto; justify-content: center; position: relative; }
      .pd-pop {
        position: absolute; top: calc(100% + 8px); right: 12px; width: 340px; z-index: 9;
        background: rgba(20,23,32,.97); border: 1px solid var(--pc-edge);
        border-radius: var(--pc-r-lg); padding: 10px 12px;
        box-shadow: 0 24px 60px rgba(0,0,0,.6);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      }
      .pd-ar { display: flex; align-items: center; gap: 9px; padding: 7px 0; }
      .pd-ar + .pd-ar { border-top: 1px solid var(--ps-hair-soft); }
      .pd-at { font-size: var(--pc-fs-sm); font-weight: 600; }
      .pd-ad { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .pd-sev { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: var(--ps-dim); }
      .pd-sev.critical { background: var(--ps-bad); }
      .pd-sev.warn { background: var(--ps-warn); }

      /* --------------------------------------------------- tier 2 · stage --*/

      .pd-stage {
        display: grid; flex: 1; min-width: 0; min-height: 0;
        /* THE one animated property on this screen. It is safe only because
           #pd-stage is mounted once and never replaced — see _mount. */
        transition: grid-template-columns .42s cubic-bezier(.4, 0, .2, 1);
      }
      .pd-panelwrap {
        display: flex; flex-direction: column;
        min-width: 0; min-height: 0; overflow: hidden;
        padding: 13px 17px 15px;
      }
      .pd-panelwrap + .pd-panelwrap { border-left: 1px solid var(--ps-hair-soft); }
      .pd-panel.is-min { padding-left: 12px; padding-right: 12px; }

      .pd-ph {
        display: flex; align-items: center; gap: 8px; width: 100%;
        padding: 0 0 9px; text-align: left; flex: 0 0 auto;
      }
      .pd-ph.static { cursor: default; }
      .pd-nm { font-size: var(--pc-fs-md); font-weight: 650; letter-spacing: -.005em; }
      .pd-cv { margin-left: auto; color: var(--ps-dim); }
      .pd-cv .pd-ico { width: 15px; height: 15px; }
      .pd-panel.is-exp .pd-cv { color: var(--ps-cool); transform: rotate(90deg); }

      /* The three faces. Display swaps only — never a height or opacity
         animation, which would re-run on every repaint. */
      .pd-mini { display: none; flex-direction: column; gap: 9px; min-height: 0; }
      .pd-panel.is-min .pd-mini { display: flex; }
      .pd-panel.is-min .pd-full { display: none; }
      .pd-xtra { display: none; flex-direction: column; gap: 10px; }
      .pd-panel.is-exp .pd-xtra { display: flex; }

      .pd-pbody {
        flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 11px;
        /* The PAGE never scrolls; a panel that has more than fits does. */
        overflow-y: auto; overflow-x: hidden;
        scrollbar-width: thin; scrollbar-color: var(--pc-fill-3) transparent;
      }
      .pd-pbody::-webkit-scrollbar { width: 6px; }
      .pd-pbody::-webkit-scrollbar-thumb { background: var(--pc-fill-3); border-radius: var(--pc-r-pill); }

      .pd-mstat { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .pd-mv {
        font-size: var(--pd-fs-big); font-weight: 600; letter-spacing: -.028em;
        font-variant-numeric: tabular-nums; line-height: 1.08;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pd-mv.sm { font-size: var(--pc-fs-md); }
      .pd-mv small { font-size: var(--pc-fs-xs); font-weight: 500; color: var(--ps-muted); margin-left: 2px; }
      .pd-mk {
        font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase;
        color: var(--ps-dim); font-weight: 600;
      }

      /* rings, shared markup with the shell */
      .pd-ring { position: relative; flex: 0 0 auto; }
      .pd-rv {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; font-variant-numeric: tabular-nums;
      }
      .pd-rv b { font-size: var(--pd-fs-big); font-weight: 640; letter-spacing: -.025em; line-height: 1; }
      .pd-rv small {
        font-size: var(--pc-fs-micro); color: var(--ps-dim); margin-top: 3px;
        letter-spacing: .06em; text-transform: uppercase; font-weight: 600;
      }
      /* The small modifier is DEFINED, not merely used. A nap ring asking for a
         size that does not exist draws its number at the hero step inside a
         54px ring and spills over the stroke. */
      .pd-rv.sm b { font-size: var(--pc-fs-xs); }

      /* climate */
      .pd-cwrap { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }
      .pd-steprow { display: flex; align-items: center; gap: 10px; }
      .pd-step {
        width: 30px; height: 30px; border-radius: 50%; background: var(--pc-fill-2);
        display: grid; place-items: center; flex: 0 0 auto; position: relative;
      }
      .pd-step:hover:not(:disabled) { background: var(--pc-fill-3); }
      .pd-step .pd-ico { width: 15px; height: 15px; }
      .pd-goal { display: flex; align-items: baseline; gap: 6px; }
      .pd-goal b { font-size: var(--pd-fs-big); font-weight: 650; font-variant-numeric: tabular-nums; }
      .pd-goal span { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .pd-cnote { font-size: var(--pc-fs-xs); color: var(--ps-muted); margin-top: 8px; line-height: 1.45; }

      /* Stretches into the space it is given, but only so far. Uncapped it grew
         to ~340px on a 1440 desktop — a 24-hour trend line taking a third of
         the screen height, which is not what the panel is about. */
      .pd-graph {
        position: relative; flex: 1 1 auto;
        min-height: 110px; max-height: 240px;
        display: flex; flex-direction: column;
      }
      .pd-wavesvg { width: 100%; flex: 1; min-height: 60px; display: block; }
      .pd-nohist {
        font-size: var(--pc-fs-xs); color: var(--ps-dim);
        display: grid; place-items: center; min-height: 60px; text-align: center;
      }
      .pd-axis { position: relative; height: 12px; }
      .pd-axis span {
        position: absolute; transform: translateX(-50%);
        font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums;
      }
      .pd-glg {
        display: flex; gap: 13px; align-items: center;
        font-size: var(--pc-fs-xs); color: var(--ps-muted); font-variant-numeric: tabular-nums;
      }
      .pd-glg i { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 5px; }
      .pd-glg b { color: var(--ps-text); font-weight: 600; margin-left: 3px; }
      .pd-readout {
        margin-left: auto; opacity: 0; color: var(--ps-text); font-weight: 600;
        font-size: var(--pc-fs-xs); white-space: nowrap;
      }
      .pd-cross {
        position: absolute; top: 0; bottom: 24px; width: 1px;
        background: var(--ps-text); opacity: 0; pointer-events: none;
      }

      .pd-rmlist { display: flex; flex-direction: column; }
      .pd-rml {
        display: flex; align-items: center; gap: 10px; padding: 6px 0;
        border-top: 1px solid var(--ps-hair-soft); font-size: var(--pc-fs-sm); cursor: pointer;
      }
      .pd-rmn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pd-spark { width: 56px; height: 18px; flex: 0 0 auto; opacity: .8; }
      .pd-spark svg { width: 56px; height: 18px; display: block; }
      .pd-rmv { font-weight: 650; font-variant-numeric: tabular-nums; }
      .pd-rmh {
        color: var(--ps-dim); font-size: var(--pc-fs-micro);
        font-variant-numeric: tabular-nums; width: 42px; text-align: right;
      }
      .pd-chiprow { display: flex; gap: 6px; flex-wrap: wrap; }
      .pd-hold {
        display: flex; align-items: center; gap: 9px; margin-top: 6px;
        font-size: var(--pc-fs-xs); color: var(--ps-muted);
      }
      .pd-hold button { margin-left: auto; }

      /* nursery */
      .pd-jwrap { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }
      .pd-naps { display: flex; gap: 10px; flex-wrap: wrap; }
      .pd-nap { display: flex; flex-direction: column; align-items: center; gap: 3px; }
      .pd-napt { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      .pd-jstatus { font-size: var(--pc-fs-xs); color: var(--ps-muted); margin-top: 9px; line-height: 1.45; }

      /* Both rails live in a box. They are plots with an axis, and a bare line
         on the card ground does not read as one. */
      .pd-railbox {
        background: var(--pc-fill-1); border-radius: var(--pc-r-md);
        padding: 9px 11px 7px; flex: 0 0 auto;
      }
      .pd-railhead, .pd-railfoot {
        display: flex; justify-content: space-between; align-items: center;
        font-size: var(--pc-fs-micro); color: var(--ps-dim);
        font-variant-numeric: tabular-nums; letter-spacing: .1em; text-transform: uppercase;
        font-weight: 600;
      }
      .pd-railfoot { margin-top: 5px; letter-spacing: 0; text-transform: none; }
      .pd-rail {
        position: relative; height: 26px; margin-top: 6px;
        border-radius: var(--pc-r-hair); overflow: hidden; background: var(--pc-fill-1);
      }
      .pd-seg { position: absolute; top: 0; bottom: 0; display: block; }
      .pd-seg.settle { background: rgba(170,120,255,.45); }
      .pd-seg.sleep { background: rgba(80,160,255,.55); }
      .pd-tick {
        position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px;
        background: var(--ps-warn); display: block;
      }
      .pd-grid { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--ps-hair); display: block; }

      .pd-sub2 {
        font-size: var(--pc-fs-micro); letter-spacing: .12em; text-transform: uppercase;
        color: var(--ps-dim); font-weight: 600; margin-top: 4px;
      }
      .pd-jr {
        display: flex; align-items: center; gap: 9px; background: var(--pc-fill-1);
        border-radius: var(--pc-r-xs); padding: 6px 10px;
        font-size: var(--pc-fs-xs); font-variant-numeric: tabular-nums;
      }
      .pd-jr .pd-l { color: var(--ps-muted); flex: 1; min-width: 0; }
      .pd-jr .pd-v { font-weight: 640; }
      .pd-jr .pd-c { color: var(--ps-dim); text-align: right; max-width: 46%;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      /* music */
      .pd-now { display: flex; align-items: center; gap: 11px; flex: 0 0 auto; }
      .pd-art {
        width: 54px; height: 54px; border-radius: var(--pc-r-md); background: var(--pc-fill-2);
        display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden;
      }
      .pd-art img { width: 100%; height: 100%; object-fit: cover; }
      .pd-nt { font-size: var(--pc-fs-lg); font-weight: 640; letter-spacing: -.012em; }
      .pd-ns { font-size: var(--pc-fs-xs); color: var(--ps-muted); }
      .pd-tbs { display: flex; gap: 4px; align-items: center; }
      .pd-tb {
        width: 32px; height: 32px; border-radius: 50%;
        display: grid; place-items: center; color: var(--ps-text);
      }
      .pd-tb:hover:not(:disabled) { background: var(--pc-fill-2); }
      .pd-tb.pp { background: var(--pc-fill-2); width: 36px; height: 36px; }
      .pd-tb .pd-ico { width: 17px; height: 17px; }
      .pd-mroom { display: flex; flex-wrap: wrap; gap: 5px; }
      .pd-mr {
        padding: 6px 10px; border-radius: var(--pc-r-xs); background: var(--pc-fill-1);
        color: var(--ps-muted); font-size: var(--pc-fs-xs); font-weight: 600;
      }
      .pd-mr:hover { background: var(--pc-fill-2); }
      .pd-mr.sel { background: var(--pc-fill-3); color: var(--ps-text); }
      .pd-mr.live { color: var(--ps-cool); }
      .pd-pres { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
      .pd-pr {
        padding: 8px 10px; border-radius: var(--pc-r-sm); background: var(--pc-fill-1);
        font-size: var(--pc-fs-xs); font-weight: 600;
        display: flex; align-items: center; gap: 7px; min-width: 0; text-align: left;
      }
      .pd-pr:hover { background: var(--pc-fill-2); }
      .pd-pr ha-icon { --mdc-icon-size: 15px; color: var(--ps-cool); }
      .pd-search {
        width: 100%; background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
        border-radius: var(--pc-r-sm); padding: 8px 11px; color: var(--ps-text);
        /* 16px exactly: below that iOS Safari zooms the page on focus and never
           zooms back. A desk view still gets opened on a tablet. */
        font-size: 16px;
      }
      .pd-mtypes { display: flex; gap: 5px; flex-wrap: wrap; }
      .pd-mt {
        font-size: var(--pc-fs-micro); font-weight: 600; color: var(--ps-dim);
        background: var(--pc-fill-1); border-radius: var(--pc-r-pill); padding: 4px 9px;
      }
      .pd-mt.on { background: rgba(77,208,225,.15); color: var(--ps-cool); }
      .pd-res { display: flex; flex-direction: column; gap: 1px; }
      .pd-mi, .pd-npr { display: flex; align-items: center; gap: 9px; padding: 6px 2px; }
      .pd-npr { cursor: pointer; border-radius: var(--pc-r-xs); }
      .pd-npr:hover { background: var(--pc-fill-1); }
      .pd-th {
        width: 34px; height: 34px; border-radius: var(--pc-r-xs); background: var(--pc-fill-2);
        display: grid; place-items: center; color: var(--ps-dim); flex: 0 0 auto; overflow: hidden;
      }
      .pd-th img { width: 100%; height: 100%; object-fit: cover; }
      .pd-mi .pd-n, .pd-npr .pd-n { font-size: var(--pc-fs-sm); font-weight: 600; }
      .pd-mi .pd-s, .pd-npr .pd-s { font-size: var(--pc-fs-micro); color: var(--ps-dim); }

      /* calendar */
      .pd-cday { display: flex; gap: 10px; padding: 6px 0; }
      .pd-cday + .pd-cday { border-top: 1px solid var(--ps-hair-soft); }
      .pd-cdt { flex: 0 0 32px; text-align: center; }
      .pd-dw {
        font-size: var(--pc-fs-micro); letter-spacing: .11em; text-transform: uppercase;
        color: var(--ps-dim); font-weight: 600;
      }
      .pd-dn { font-size: var(--pc-fs-lg); font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.2; }
      .pd-cdt.today .pd-dn { color: var(--ps-cool); }
      .pd-cev { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; justify-content: center; }
      .pd-ev { display: flex; align-items: center; gap: 7px; font-size: var(--pc-fs-xs); }
      .pd-ev i { width: 3px; height: 13px; border-radius: 2px; flex: 0 0 auto; }
      .pd-et { margin-left: auto; color: var(--ps-dim); font-size: var(--pc-fs-micro);
        font-variant-numeric: tabular-nums; white-space: nowrap; }
      .pd-ev.none { color: var(--ps-dim); }

      /* lights */
      .pd-moods { display: flex; gap: 6px; flex-wrap: wrap; }
      .pd-mood {
        display: flex; align-items: center; gap: 6px; padding: 7px 11px;
        border-radius: var(--pc-r-sm); background: var(--pc-fill-1);
        font-size: var(--pc-fs-xs); font-weight: 600; color: var(--ps-muted); min-width: 0;
      }
      .pd-mood:hover { background: var(--pc-fill-2); color: var(--ps-text); }
      .pd-mood ha-icon { --mdc-icon-size: 15px; }
      .pd-lights { display: flex; flex-direction: column; gap: 4px; }
      .pd-lrow {
        position: relative; display: flex; align-items: center; gap: 10px;
        padding: 10px 12px; border-radius: var(--pc-r-sm);
        background: var(--pc-fill-1); overflow: hidden;
        cursor: pointer; touch-action: pan-y; user-select: none;
      }
      /* The glow IS the brightness: it starts at the bulb and falls off across
         the row. No fill, no track — an off light is dark, not 0%. */
      .pd-lglow {
        position: absolute; inset: 0; pointer-events: none; opacity: 0;
        background: linear-gradient(90deg,
          hsl(var(--l-hue) var(--l-sat) 62% / .30) 0%,
          hsl(var(--l-hue) var(--l-sat) 62% / .10) calc(var(--l-reach) * .6),
          transparent var(--l-reach));
      }
      .pd-lrow.on .pd-lglow { opacity: 1; }
      .pd-lrow.on { background: var(--pc-fill-2); }
      .pd-lico { color: var(--ps-dim); position: relative; }
      .pd-lrow.on .pd-lico { color: hsl(var(--l-hue) var(--l-sat) 72%); }
      .pd-ln { font-size: var(--pc-fs-sm); font-weight: 600; position: relative; }
      .pd-ls { font-size: var(--pc-fs-micro); color: var(--ps-dim); position: relative; }
      .pd-lclu { display: flex; gap: 3px; position: relative; }
      .pd-mdot, .pd-orb {
        width: 5px; height: 5px; border-radius: 50%; display: block;
        background: var(--pc-fill-3);
      }
      .pd-orb { width: 8px; height: 8px; }
      .pd-mdot.lit, .pd-orb.lit {
        background: hsl(var(--l-hue) var(--l-sat) 70%);
        box-shadow: 0 0 6px hsl(var(--l-hue) var(--l-sat) 70% / .8);
      }
      .pd-lpct {
        font-size: var(--pc-fs-xs); font-weight: 650; color: var(--ps-muted);
        font-variant-numeric: tabular-nums; min-width: 38px; text-align: right; position: relative;
      }
      .pd-lrow.on .pd-lpct { color: var(--ps-text); }
      .pd-lrow.off-line { opacity: .5; }
      .pd-guard {
        display: flex; align-items: center; gap: 9px; padding: 9px 11px;
        border-radius: var(--pc-r-sm); background: rgba(242,193,78,.12);
        font-size: var(--pc-fs-xs); flex-wrap: wrap;
      }
      .pd-gq b { display: block; color: var(--ps-warn); font-weight: 650; }
      .pd-gq span { color: var(--ps-muted); }
      .pd-grow2 { flex: 1; min-width: 0; color: var(--ps-text); font-weight: 600; }

      /* ---------------------------------------------------- tier 3 · dock --*/

      .pd-z-rooms { flex: 1.5; }
      /* Wraps rather than squeezing.
         Six cells sharing one flex row came out ~72px each on a 1440 desktop,
         which truncated every room to "LIVIN…" / "KITC…" / "BEDR…" — a label
         that has lost the word is not a smaller label, it is a missing one.
         auto-fit + a floor means the strip is one row when it fits and two when
         it does not; the dock is auto-height, so it simply grows. */
      .pd-rstrip {
        display: grid; gap: 7px;
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
      }
      .pd-rc {
        background: var(--pc-fill-1); border-radius: var(--pc-r-sm);
        padding: 6px 10px; min-width: 0; cursor: pointer;
      }
      .pd-rc:hover { background: var(--pc-fill-2); }
      .pd-rc.acc { background: rgba(77,208,225,.11); }
      .pd-rn {
        display: block; font-size: var(--pc-fs-micro); letter-spacing: .1em;
        text-transform: uppercase; color: var(--ps-dim); font-weight: 600;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pd-rc b {
        display: block; font-size: var(--pc-fs-lg); font-weight: 650;
        font-variant-numeric: tabular-nums; letter-spacing: -.025em; margin-top: 2px;
      }
      .pd-rh { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums; }

      .pd-z-quick { flex: 1.2; }
      /* Same reason as the room strip: six tiles in a shared flex row clipped
         every name to "Ligh…" / "Occ…" / "Was…". */
      .pd-qstrip {
        display: grid; gap: 7px;
        grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
      }
      .pd-qt {
        background: var(--pc-fill-1); border-radius: var(--pc-r-sm);
        padding: 7px 8px 9px; display: flex; flex-direction: column; gap: 4px;
        align-items: flex-start; min-width: 0; position: relative; overflow: hidden; text-align: left;
      }
      .pd-qt:hover { background: var(--pc-fill-2); }
      .pd-qt ha-icon { --mdc-icon-size: 19px; color: var(--ps-dim); }
      .pd-qn {
        font-size: var(--pc-fs-micro); font-weight: 600; line-height: 1.2;
        max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pd-qv {
        font-size: var(--pc-fs-micro); color: var(--ps-dim); font-variant-numeric: tabular-nums;
        max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pd-qt.on { background: rgba(242,193,78,.14); }
      .pd-qt.on ha-icon, .pd-qt.on .pd-qn { color: var(--ps-warn); }
      .pd-qt.alert { background: rgba(239,106,106,.16); }
      .pd-qt.alert ha-icon, .pd-qt.alert .pd-qn { color: var(--ps-bad); }
      .pd-qbar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--pc-fill-2); }
      .pd-qbar i { display: block; height: 100%; }

      /* systems, on the stage */
      .pd-srvhead { display: flex; align-items: center; gap: 11px; flex: 0 0 auto; }
      .pd-srvn { font-size: var(--pc-fs-lg); font-weight: 650; letter-spacing: -.012em; }
      .pd-srvs {
        font-size: var(--pc-fs-xs); color: var(--ps-muted);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pd-cpu { text-align: right; flex: 0 0 auto; }
      .pd-cpuv {
        display: block; font-size: var(--pd-fs-big); font-weight: 640;
        letter-spacing: -.025em; font-variant-numeric: tabular-nums; line-height: 1;
      }
      .pd-cpuv small { font-size: var(--pc-fs-xs); font-weight: 500; color: var(--ps-muted); }
      .pd-cpuk {
        font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase;
        color: var(--ps-dim); font-weight: 600;
      }
      .pd-spark.wide, .pd-spark.wide svg { width: 78px; height: 26px; }
      .pd-meters { display: flex; flex-direction: column; gap: 5px; }
      .pd-mrow { display: flex; align-items: center; gap: 9px; font-size: var(--pc-fs-xs); cursor: pointer; }
      .pd-ml { color: var(--ps-muted); flex: 0 0 92px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pd-mbar {
        flex: 1; height: 5px; border-radius: var(--pc-r-pill);
        background: var(--pc-fill-2); overflow: hidden; min-width: 0;
      }
      .pd-mbar i { display: block; height: 100%; }
      .pd-mv2 {
        flex: 0 0 52px; text-align: right; font-weight: 650;
        font-variant-numeric: tabular-nums; color: var(--ps-text);
      }
      /* ---------------------------------------------------------- weather --*/
      /* Both rails side by side. Width is what a stage panel buys, so the desk
         shows what the week did AND what it is about to do without a toggle;
         the phone needs the toggle because it has one column to spend. Below
         720px of panel the two stack, because six capsules across half of a
         narrow panel is the truncated-label bug in a new costume. */
      .pd-wxhero { display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
      .pd-wxbig {
        font-size: var(--pc-fs-3xl); font-weight: 620; letter-spacing: -.045em;
        line-height: .94; font-variant-numeric: tabular-nums;
      }
      .pd-wxbig sup { font-size: .42em; font-weight: 600; vertical-align: top;
                      position: relative; top: .25em; }
      .pd-wxbig.off { color: var(--ps-dim); }
      .pd-wxdelta { font-size: var(--pc-fs-xs); color: var(--ps-heat); font-weight: 620;
                    margin-top: 6px; font-variant-numeric: tabular-nums; }
      .pd-wxdelta.cool { color: var(--ps-cool); }
      .pd-wxsrc { font-size: var(--pc-fs-micro); color: var(--ps-dim); letter-spacing: .08em;
                  text-transform: uppercase; font-weight: 620; margin-top: 5px; }
      .pd-wxtiles { margin-left: auto; display: flex; gap: 16px; align-items: flex-start; }
      .pd-wxmi { --mdc-icon-size: 20px; color: var(--ps-muted); }

      .pd-wxrails { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
                    gap: 14px; }
      .pd-wxcol { min-width: 0; }
      .pd-wxrh { display: flex; align-items: baseline; gap: 8px; margin: 0 0 7px; }
      .pd-wxlb { font-size: var(--pc-fs-micro); letter-spacing: .12em; text-transform: uppercase;
                 color: var(--ps-dim); font-weight: 620; }
      .pd-wxrb { margin-left: auto; font-size: var(--pc-fs-micro); color: var(--ps-dim); }
      .pd-wxbox { background: var(--pc-fill-1); border: 1px solid var(--pc-edge);
                  border-radius: var(--pc-r-sm); padding: 12px 10px;
                  font-size: var(--pc-fs-xs); color: var(--ps-dim); text-align: center; }
      .pd-wxbox.plot { padding: 10px 9px 8px; text-align: left; }
      .pd-wxrail { display: grid; grid-template-columns: repeat(var(--n, 7), minmax(0, 1fr)); gap: 5px; }
      .pd-wxday { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
      .pd-wxhi, .pd-wxlo { font-size: var(--pc-fs-xs); font-variant-numeric: tabular-nums;
                           font-weight: 620; line-height: 1; color: var(--ps-muted); }
      .pd-wxlo { color: var(--ps-dim); font-weight: 600; }
      .pd-wxdw { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-weight: 620;
                 letter-spacing: .04em; }
      .pd-wxday.now .pd-wxhi { color: var(--ps-heat); }
      .pd-wxday.now .pd-wxdw { color: var(--ps-text); }
      .pd-wxi { --mdc-icon-size: 15px; color: var(--ps-muted); }
      .pd-wxpcp { font-size: var(--pc-fs-micro); color: var(--ps-cool); font-weight: 600;
                  font-variant-numeric: tabular-nums; }
      .pd-wxpcp.none { visibility: hidden; }
      .pd-wxtrack { position: relative; width: 100%; max-width: 22px; height: 104px;
                    border-radius: var(--pc-r-pill); background: var(--ps-track); overflow: hidden; }
      .pd-wxtrack.empty { background: repeating-linear-gradient(135deg,
                            rgba(255,255,255,.05) 0 4px, transparent 4px 8px); }
      .pd-wxcap { position: absolute; left: 0; right: 0; border-radius: var(--pc-r-pill);
                  background: linear-gradient(to top, var(--ps-cool), #8fb9d8 42%,
                              #e8c39a 72%, var(--ps-heat)); }
      .pd-wxcap.stub { height: 4px; opacity: .75; }
      .pd-wxmark { position: absolute; left: -3px; right: -3px; height: 2px; z-index: 2;
                   background: #fff; border-radius: var(--pc-r-hair);
                   box-shadow: 0 0 6px rgba(255,255,255,.7); }
      /* Scrolls, like the phone's. Plain overflow-x and no touch-action — see
         the note on .ps-wxhrs; the rule is the same on a trackpad. */
      .pd-wxhrs { display: flex; gap: 2px; align-items: flex-end;
                  overflow-x: auto; overscroll-behavior-x: contain;
                  scrollbar-width: thin; scrollbar-color: var(--pc-fill-3) transparent;
                  padding-bottom: 3px; }
      .pd-wxhr { flex: 0 0 auto; width: 30px; display: flex; flex-direction: column;
                 align-items: center; gap: 3px; }
      .pd-wxhr.nd { border-left: 1px solid var(--ps-hair); margin-left: 3px; padding-left: 3px; }
      .pd-wxht { font-size: var(--pc-fs-micro); color: var(--ps-muted); font-weight: 620;
                 font-variant-numeric: tabular-nums; line-height: 1; }
      .pd-wxhbar { width: 100%; height: 44px; display: flex; align-items: flex-end; }
      .pd-wxhbar i { width: 100%; border-radius: var(--pc-r-hair) var(--pc-r-hair) 0 0;
                     background: linear-gradient(to top, rgba(77,208,225,.35), var(--ps-heat)); }
      .pd-wxhp { font-size: var(--pc-fs-micro); color: var(--ps-cool); font-weight: 600;
                 font-variant-numeric: tabular-nums; line-height: 1; min-height: 10px; }
      .pd-wxhl { font-size: var(--pc-fs-micro); color: var(--ps-dim); font-weight: 620;
                 line-height: 1; white-space: nowrap; }
      .pd-wxhr.now .pd-wxht { color: var(--ps-heat); }
      .pd-wxhr.now .pd-wxhl { color: var(--ps-text); }
      .pd-wxfacts { display: flex; gap: 18px; flex-wrap: wrap; }
      .pd-wxnote { font-size: var(--pc-fs-xs); color: var(--ps-muted); line-height: 1.5; }

      .pd-sstats { display: flex; gap: 8px; flex-wrap: wrap; }
      .pd-sstat {
        flex: 1; min-width: 62px; background: var(--pc-fill-1);
        border-radius: var(--pc-r-xs); padding: 6px 9px;
      }
      .pd-sv2 {
        display: block; font-size: var(--pc-fs-lg); font-weight: 650;
        font-variant-numeric: tabular-nums; letter-spacing: -.02em;
      }
      .pd-sk {
        font-size: var(--pc-fs-micro); letter-spacing: .1em; text-transform: uppercase;
        color: var(--ps-dim); font-weight: 600;
      }
      .pd-srow {
        display: flex; align-items: center; gap: 9px;
        font-size: var(--pc-fs-xs); color: var(--ps-muted);
      }
      .pd-srow b { margin-left: auto; color: var(--ps-text); font-variant-numeric: tabular-nums; }
      .pd-srow a { margin-left: auto; text-decoration: none; }
      .pd-xtra a.pd-mini-btn { align-self: flex-start; text-decoration: none; }

      /* now playing, in the dock */
      .pd-z-nowplaying { flex: 1.1; justify-content: center; }
      .pd-npbar { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .pd-npbar .pd-th { cursor: pointer; }
      .pd-npbar .pd-grow { cursor: pointer; }
      .pd-npbar .pd-n { font-size: var(--pc-fs-sm); font-weight: 600; }
      .pd-npbar .pd-s { font-size: var(--pc-fs-micro); color: var(--ps-dim); }
      /* Nothing playing keeps the slot so the dock does not reflow, but draws
         no transport — a row of buttons with nothing behind them is worse than
         no row at all. */
      .pd-npbar.idle { opacity: .55; cursor: pointer; }
      .pd-npbar.idle:hover { opacity: .85; }

      .pd-z-systems { flex: .95; }
      .pd-sysrow { display: flex; align-items: center; gap: 9px; font-size: var(--pc-fs-xs); padding: 3px 0; }
      .pd-sysrow.tappable { cursor: pointer; }
      .pd-sysrow ha-icon { --mdc-icon-size: 15px; color: var(--ps-dim); }
      .pd-sn { color: var(--ps-muted); }
      .pd-sv {
        margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 600;
        max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pd-meter {
        width: 52px; height: 3px; border-radius: 2px; background: var(--pc-fill-2);
        overflow: hidden; flex: 0 0 auto;
      }
      .pd-meter i { display: block; height: 100%; }

      .pd-z-links { flex: 0 0 auto; flex-direction: row; align-items: center; gap: 6px; }
      .pd-link {
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        padding: 8px 12px; border-radius: var(--pc-r-sm); position: relative;
        font-size: var(--pc-fs-micro); font-weight: 600; color: var(--ps-muted);
      }
      .pd-link:hover { background: var(--pc-fill-1); color: var(--ps-text); }
      .pd-link ha-icon { --mdc-icon-size: 20px; }
      .pd-badge {
        position: absolute; top: 4px; right: 6px; min-width: 15px; height: 15px;
        border-radius: var(--pc-r-pill); background: var(--ps-bad); color: #0b0d13;
        font-size: var(--pc-fs-micro); font-weight: 700; font-style: normal;
        display: grid; place-items: center; padding: 0 4px;
      }

      /* --------------------------------------------------------- sheets ---*/

      .pd-scrim {
        position: absolute; inset: 0; z-index: 30;
        background: rgba(5, 6, 10, .55);
        backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
      }
      .pd-sheet-panel {
        position: absolute; z-index: 31; top: 5%; bottom: 5%; right: 3%;
        width: min(640px, 62%);
        display: flex; flex-direction: column;
        background: rgba(12, 14, 21, .94);
        border: 1px solid var(--pc-edge); border-radius: var(--pc-r-xl);
        box-shadow: 0 40px 90px -20px rgba(0,0,0,.8);
        backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
        overflow: hidden;
      }
      .pd-sheet-head {
        display: flex; align-items: center; gap: 10px;
        padding: 13px 16px; border-bottom: 1px solid var(--ps-hair); flex: 0 0 auto;
      }
      /* The chrome names itself, which is why the hosted card's own title is
         blanked — left set it printed twice. */
      .pd-sheet-title { font-size: var(--pc-fs-md); font-weight: 650; flex: 1; min-width: 0; }
      .pd-x { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: var(--ps-muted); }
      .pd-x:hover { background: var(--pc-fill-2); color: var(--ps-text); }
      .pd-sheet-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px; }
      .pd-host { min-height: 100%; }
      /* A section hosted in a sheet has no folded or expanded state — there is
         nothing beside it to fold, so it shows everything it has. */
      .pd-sheet-body .pd-xtra { display: flex; }
      .pd-sheet-body .pd-pbody { overflow: visible; }

      @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }

      /* How it folds down. Bands merge rather than reflow, so the reading order
         survives at every width. Below 1100 the strip wraps and the stage
         becomes two rows of two; the phone view exists for the phone case and
         this never tries to become it. */
      @media (max-width: 1400px) {
        .pd-z-clock { flex: 0 0 108px; }
        .pd-z-wx { flex: 0 0 180px; }
      }
      @media (max-width: 1180px) {
        :host { height: auto; min-height: 0; }
        .pd-sheet { height: auto; }
        .pd-t1 { flex-wrap: wrap; }
        .pd-z-id { flex: 1 1 100%; }
        .pd-stage { grid-template-columns: 1fr 1fr !important; }
        .pd-panelwrap:nth-child(n + 3) { border-top: 1px solid var(--ps-hair-soft); }
        .pd-panelwrap:nth-child(odd) { border-left: 0; }
        .pd-t3 { flex-wrap: wrap; }
        .pd-sheet-panel { width: 92%; right: 4%; }
      }
      @media (max-width: 820px) {
        .pd-stage { grid-template-columns: 1fr !important; }
        .pd-panelwrap { border-left: 0 !important; border-top: 1px solid var(--ps-hair-soft); }
      }
    `;
