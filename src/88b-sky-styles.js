/* ============================================================================
 * purdy-sky-card — styles
 *
 * APPENDED to the shell's sheet (after its white-alpha literals are rewritten
 * through --sk-fg), never interleaved, so these win at equal specificity and
 * the phone's own cascade is untouched.
 *
 * Two palettes. Light is the default and is not an inversion: paper ground,
 * white cards, and every semantic colour darkened until it reads as TEXT on
 * white — the dark palette's cyan is 1.6:1 on paper. Dark keeps the shell's
 * own tokens and only swaps the ground and the card surfaces.
 *
 * NOTE: this file is a template literal. No backticks anywhere in it.
 * ========================================================================== */

const SK_STYLES = `
      :host {
        --sk-fg: 255, 255, 255;
        --sk-bg: #0A0E17;
        --sk-card: #131A26;
        --sk-card2: #1A2231;
        --sk-edge: rgba(255,255,255,.06);
        --sk-shadow: 0 0 0 1px rgba(255,255,255,.03), 0 18px 40px -24px rgba(0,0,0,.8);
        --sk-bar: rgba(10,14,23,.78);
        --sk-dock: rgba(24,31,44,.80);
        --sk-ink: #EDF1F7;
        --sk-lamp: #FFB547;
        --sk-litter: #C77DFF;
        --sk-nas: #3BC9DB;
        --sk-media: #F06595;
        --sk-truck: #8EA9C6;
        --sk-vbg: #0B0F16;
        --sk-glow: .42;
        --sk-j2: #C0A8FF;
        --sk-r2: #3BC9DB;
        --sk-r3: #A9E34B;
        --sk-visit: #FFA94D;
        /* The bar takes only the part of the notch nothing else already covers
           (--sk-inset, written by _skSafe). HA's own toolbar sits over the notch
           at the top of the page and scrolls away below it, so a fixed
           env() pad doubled it: 47pt of empty band under the toolbar, and the
           bar's title half-faded over the page's own. */
        --sk-barh: calc(56px + var(--sk-inset, 0px));
        /* The card takes whatever width the view gives it, so it can measure
           a desktop; the PHONE column is still capped at 560 and centred —
           on .sk now, not here, which on a phone is the same box. */
        display: block;
        padding: 0;
        min-height: 100dvh;
        color: var(--ps-text);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, var(--paper-font-body1_-_font-family, sans-serif);
      }
      :host([data-sk-theme="light"]) {
        --sk-fg: 17, 24, 39;
        --sk-bg: #EEF2F7;
        --sk-card: #FFFFFF;
        --sk-card2: #F2F4F8;
        --sk-edge: rgba(16,24,40,.07);
        --sk-shadow: 0 1px 2px rgba(16,24,40,.05), 0 14px 34px -18px rgba(16,24,40,.22);
        --sk-bar: rgba(238,242,247,.84);
        --sk-dock: rgba(255,255,255,.86);
        --sk-ink: #111827;
        --sk-lamp: #D9822B;
        --sk-litter: #9C36B5;
        --sk-nas: #0B7285;
        --sk-media: #C2255C;
        --sk-truck: #46617E;
        --sk-vbg: #E8EDF3;
        --sk-glow: .62;
        --sk-j2: #9775FA;
        --sk-r2: #0C8599;
        --sk-r3: #5C940D;
        --sk-visit: #E67700;

        --ps-text: #111827;
        --ps-muted: #3F4A5C;
        --ps-dim: #5B6577;
        --ps-hair: rgba(17,24,39,.08);
        --ps-hair-soft: rgba(17,24,39,.05);
        --ps-track: rgba(17,24,39,.10);
        --ps-band: rgba(17,24,39,.12);
        --ps-deep: #7048E8;
        --ps-light: #1C7ED6;
        --ps-awake: #E8590C;
        --pc-panel: #FFFFFF;
        --pc-panel-2: rgba(17,24,39,.05);
        --pc-line: rgba(17,24,39,.09);
        --pc-track: rgba(17,24,39,.10);
        --pc-chip: rgba(17,24,39,.06);
        --pc-text: #111827;
        --pc-muted: #5B6577;
        --pc-heat: #E8590C;
        --pc-cool: #0C8599;
        --pc-cool-rgb: 12, 133, 153;
        --pc-good: #2B8A3E;
        --pc-warn: #B76E00;
        --pc-bad: #E03131;
        --pc-aur-a: #1098AD;
        --pc-aur-b: #6741D9;
        --pc-tint: rgba(12,133,153,.08);
        --pc-fill-1: rgba(17,24,39,.035);
        --pc-fill-2: rgba(17,24,39,.06);
        --pc-fill-3: rgba(17,24,39,.09);
        --pc-edge: rgba(17,24,39,.08);
        --primary-text-color: #111827;
        --secondary-text-color: #5B6577;
        --rgb-primary-text-color: 17, 24, 39;
        color-scheme: light;
      }

      /* The ground is the page itself; the sky lives in the Home header. */
      .ps-ground, .ps-ground[class] { background: var(--sk-bg) !important; }
      .ps-ground::before { display: none; }

      .sk { position: relative; min-height: 100dvh; display: flex; flex-direction: column; max-width: 560px; margin: 0 auto; }
      .sk-brand:empty { display: none; }
      .sk-view { display: none; padding: 0 14px 18px; }
      .sk-view.on { display: block; flex: 1; }
      .sk-view[data-v="home"] { padding: 0 0 18px; }
      /* A page's title shares the bar's row with the bell rather than starting
         under it: the row held nothing else, and a 56pt band of empty sky
         above every title was the "too much space at the top". */
      .sk-view:not([data-v="home"]) { margin-top: -56px; }
      .sk-view:not([data-v="home"]) > .sk-stack > .sk-ttl:first-child { padding-right: 56px; min-height: 56px; }
      .sk-stack { display: flex; flex-direction: column; gap: 14px; }
      .sk-homecards { padding: 0 14px; margin-top: -30px; position: relative; z-index: 2; }

      /* ---- top bar ---- */
      .sk-safepad { height: var(--sk-safepad, 0px); }
      /* The inset is a TRANSFORM, never padding: it changes with the scroll,
         and an in-flow bar that grew 47px as the toolbar left would shove the
         page under the thumb — the v1.96.1 feedback loop by another route. */
      .sk-bar { position: sticky; top: 0; z-index: 20; pointer-events: none;
                transform: translateY(var(--sk-inset, 0px)); }
      .sk-barbg { position: absolute; inset: 0; top: calc(-1 * var(--sk-inset, 0px)); opacity: var(--solid, 0); background: var(--sk-bar);
                  -webkit-backdrop-filter: blur(22px) saturate(1.6); backdrop-filter: blur(22px) saturate(1.6);
                  border-bottom: 1px solid var(--sk-edge); transition: opacity .15s linear, bottom .3s cubic-bezier(.2,.8,.2,1); }
      .sk-barrow { position: relative; height: 56px; display: flex; align-items: center; gap: 10px; padding: 0 14px 0 18px; }
      .sk-bart { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; opacity: var(--titlep, 0);
                 transform: translateY(calc((1 - var(--titlep, 0)) * 6px));
                 font-size: var(--pc-fs-xl); font-weight: 650; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; }
      .sk-bart small { font-size: var(--pc-fs-md); font-weight: 500; color: var(--ps-dim); }
      .sk-bnum { font-size: var(--pc-fs-2xl); font-weight: 300; letter-spacing: -.03em; }
      .sk-bell { pointer-events: auto; position: relative; width: 42px; height: 42px; border-radius: 21px; display: grid; place-items: center;
                 background: color-mix(in srgb, var(--sk-card) 72%, transparent); color: var(--ps-text);
                 -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); box-shadow: var(--sk-shadow); }
      .sk-bell .ps-ico { width: 20px; height: 20px; }
      .sk-bell i { position: absolute; top: -2px; right: -2px; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 10px;
                   font-style: normal; font-size: var(--pc-fs-xs); font-weight: 750; line-height: 19px; text-align: center; color: #fff;
                   background: var(--ps-dim); border: 2px solid var(--sk-bg); }
      .sk-bell.bad i { background: var(--ps-bad); }
      .sk-bell.warn i { background: var(--ps-warn); }
      .sk-bell.log i { background: var(--ps-warn); }
      /* The pill row hangs BELOW the bar rather than growing it. The bar is
         sticky, so it is in flow: a bar that grew 46px pushed every card down
         46px, the card that had just passed under it came back out, its pill
         went off, the bar shrank — a feedback loop that flickered the pill on
         every 3px of a slow scroll, and on Chrome scroll anchoring shoved the
         page 20px at each flip. Out of flow, a pill changes nothing it is
         measured against. The bar's ground grows down to cover it instead. */
      /* The row WRAPS, it does not scroll. Six cards fold into six pills and a
         390px phone fits about four, so the fifth and sixth sat past the
         right edge with nothing to say they were there (v1.113.2). A second
         row is free here: the row is out of flow, and the bar's ground is
         grown to whatever height the lit pills actually reach (--sk-pillh,
         measured in _skPillFit). The gap is a MARGIN on lit pills, so an
         unlit one takes no room at all and cannot start a row on its own. */
      .sk-pills { position: absolute; left: 0; right: 0; top: 100%; display: flex; flex-wrap: wrap; align-content: flex-start;
                  padding: 0 8px 0 14px; }
      .sk-bar.pilled .sk-barbg { bottom: calc(-1 * var(--sk-pillh, 46px)); }
      .sk-pill { pointer-events: auto; display: inline-flex; align-items: center; gap: 6px; height: 34px; border-radius: 17px;
                 background: var(--sk-card); box-shadow: var(--sk-shadow); font-size: var(--pc-fs-md); font-weight: 650; white-space: nowrap;
                 max-width: 0; padding: 0; margin: 0; opacity: 0; transform: translateY(12px) scale(.7);
                 transition: max-width .35s cubic-bezier(.2,.8,.2,1), padding .35s, margin .35s, opacity .25s, transform .35s cubic-bezier(.2,.9,.3,1.3); }
      .sk-pill.on { max-width: 170px; padding: 0 12px 0 9px; margin: 0 6px 6px 0; opacity: 1; transform: none; }
      .sk-pill ha-icon { --mdc-icon-size: 16px; color: var(--pc); }
      .sk-pill span { overflow: hidden; text-overflow: ellipsis; }

      /* ---- the sky ---- */
      .sk-hero { position: relative; margin-top: -56px; padding-top: 56px; min-height: 400px; overflow: hidden; }
      .sk-sky { position: absolute; inset: 0; --s1: #9CC9F2; --s2: #DCEBFA; --si: #101623; --si2: #44506A; --stars: 0;
                background: linear-gradient(180deg, var(--s1) 0%, var(--s2) 62%, var(--sk-bg) 100%); }
      :host([data-sk-theme="light"]) .sk-sky.sky-dawn  { --s1: #B9CDE8; --s2: #F7D9C6; }
      :host([data-sk-theme="light"]) .sk-sky.sky-day   { --s1: #94C3F0; --s2: #DDEBFA; }
      :host([data-sk-theme="light"]) .sk-sky.sky-dusk  { --s1: #ADA3DF; --s2: #F4C6A8; }
      :host([data-sk-theme="light"]) .sk-sky.sky-night { --s1: #222D52; --s2: #5D6896; --si: #F3F5FA; --si2: #C5CCE0; --stars: 1; }
      :host([data-sk-theme="dark"]) .sk-sky { --si: #EDF1F7; --si2: #B4BDCC; }
      /* The hero's text is the sky's SIBLING, so it cannot inherit the ink the
         sky defines — it read the host's colour instead, which is dark ink on
         paper: the light theme's night band (22:00-05:00) drew "Good night"
         and the temperature navy-on-navy. The hero carries the band too. */
      .sk-heroin { --si: #101623; --si2: #44506A; }
      :host([data-sk-theme="light"]) .sk-heroin.sky-night { --si: #F3F5FA; --si2: #C5CCE0; }
      :host([data-sk-theme="dark"]) .sk-heroin { --si: #EDF1F7; --si2: #B4BDCC; }
      :host([data-sk-theme="dark"]) .sk-sky.sky-dawn  { --s1: #17213B; --s2: #5A3F56; --stars: .25; }
      :host([data-sk-theme="dark"]) .sk-sky.sky-day   { --s1: #15304F; --s2: #2A5079; }
      :host([data-sk-theme="dark"]) .sk-sky.sky-dusk  { --s1: #211943; --s2: #5C334E; --stars: .55; }
      :host([data-sk-theme="dark"]) .sk-sky.sky-night { --s1: #04070F; --s2: #111933; --stars: 1; }
      .sk-stars { position: absolute; inset: 0 0 35% 0; opacity: var(--stars);
        background-image:
          radial-gradient(1.2px 1.2px at 12% 18%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 27% 42%, #fff 50%, transparent 51%),
          radial-gradient(1.4px 1.4px at 44% 12%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 63% 33%, #fff 50%, transparent 51%),
          radial-gradient(1.2px 1.2px at 78% 9%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 88% 46%, #fff 50%, transparent 51%),
          radial-gradient(1px 1px at 6% 60%, #fff 50%, transparent 51%), radial-gradient(1.3px 1.3px at 54% 58%, #fff 50%, transparent 51%),
          radial-gradient(1px 1px at 35% 70%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 93% 66%, #fff 50%, transparent 51%); }
      .sk-heroin { position: relative; z-index: 1; padding: 0 18px 140px; color: var(--si); display: flex; flex-direction: column; gap: 2px; will-change: transform; }
      /* v1.109.0: the people sit at the RIGHT, beside the bell, so the
         greeting owns the top-left; 46px faces, a full steps ring. */
      .sk-htop { display: flex; align-items: center; justify-content: flex-end; height: 48px; margin: -52px 0 10px; padding-right: 56px; }
      .sk-hero .ps-pav { gap: 8px; }
      .sk-hero .ps-pv.sky { width: 36px; height: 36px; font-size: var(--pc-fs-sm); }
      .sk-hero .ps-pv.sky.big { width: 46px; height: 46px; }
      .sk-hero .ps-pv.sky img, .sk-hero .ps-pv.sky .ps-pvi { width: 36px; height: 36px; font-size: var(--pc-fs-sm); }
      .sk-hero .ps-pv.sky::before { inset: -2px; }
      .sk-hero .ps-pv.sky.low::after { display: none; }
      .ps-pvbat { position: absolute; right: -4px; bottom: -1px; height: 16px; padding: 0 4px; border-radius: 8px; display: flex; align-items: center;
                  background: var(--ps-bad); box-shadow: 0 0 0 2px var(--sk-card); }
      .ps-pvbat svg { width: 12px; height: 8px; fill: none; stroke: #fff; stroke-width: 1; }
      .ps-pvbat svg .f { fill: #fff; stroke: none; }
      .sk-greet { transition: opacity .1s linear; }
      .sk-hi { font-size: var(--pc-fs-xl); font-weight: 520; letter-spacing: -.01em; }
      .sk-hi b { font-weight: 700; background: linear-gradient(90deg, var(--ps-aur-a), var(--ps-aur-b)); -webkit-background-clip: text; background-clip: text; color: transparent; }
      :host([data-sk-theme="light"]) .sk-sky.sky-night ~ .sk-heroin .sk-hi b { background: linear-gradient(90deg, #66D9E8, #B197FC); -webkit-background-clip: text; background-clip: text; }
      .sk-date { font-size: var(--pc-fs-md); color: var(--si2); margin-top: 2px; }
      .sk-temp { display: flex; align-items: flex-start; gap: 10px; margin-top: 14px; transform-origin: left top; color: inherit; align-self: flex-start; }
      .sk-tn { font-size: var(--pc-fs-6xl); font-weight: 200; line-height: .9; letter-spacing: -.055em; font-variant-numeric: tabular-nums; }
      .sk-tn sup { font-size: .5em; font-weight: 250; vertical-align: top; position: relative; top: .1em; margin-left: 2px; }
      .sk-tc { display: flex; flex-direction: column; gap: 3px; padding-top: 10px; font-size: var(--pc-fs-lg); font-weight: 550; color: var(--si2); }
      .sk-tc ha-icon { --mdc-icon-size: 24px; color: var(--si); }
      .sk-feels { font-weight: 500; font-size: var(--pc-fs-sm); }
      .sk-today { display: flex; align-items: center; gap: 10px; margin-top: 16px; font-size: var(--pc-fs-md); font-variant-numeric: tabular-nums; }
      .sk-today b { font-weight: 700; } .sk-today .lo { color: var(--ps-cool); } .sk-today .hi { color: var(--ps-heat); }
      :host([data-sk-theme="light"]) .sk-sky.sky-night ~ .sk-heroin .sk-today .lo { color: #66D9E8; }
      :host([data-sk-theme="light"]) .sk-sky.sky-night ~ .sk-heroin .sk-today .hi { color: #FFA94D; }
      .sk-cap { position: relative; flex: 0 1 170px; height: 8px; border-radius: 4px; background: rgba(var(--sk-fg), .12); }
      .sk-capfill { position: absolute; top: 0; bottom: 0; border-radius: 4px; background: linear-gradient(90deg, #4DABF7, #FFC078 70%, #FF922B); }
      .sk-cap i { position: absolute; top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%;
                  background: var(--sk-card); border: 3px solid var(--si); box-shadow: 0 0 0 4px rgba(255,255,255,.25); }
      /* One row, never two (v1.109.0): a wrapped second row grew into the
         arc, which sits a fixed distance off the hero's foot. */
      .sk-hchips { display: flex; flex-wrap: nowrap; gap: 6px; margin-top: 14px; min-width: 0; }
      .sk-hchips .ps-chip { font-size: var(--pc-fs-sm); padding: 5px 10px; background: color-mix(in srgb, var(--sk-card) 78%, transparent);
                            -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
      /* The paper theme's semantic chips tint at 12% alpha, which outranks the
         rule above and left a warn or bad chip nearly see-through on the sky:
         amber text on the night band was unreadable. Over the sky the chip keeps
         its own card. */
      :host([data-sk-theme]) .sk-hchips .ps-chip.warn,
      :host([data-sk-theme]) .sk-hchips .ps-chip.bad,
      :host([data-sk-theme]) .sk-hchips .ps-chip.cool { background: color-mix(in srgb, var(--sk-card) 88%, transparent); }
      .sk-hchips .sk-ichip { height: 34px; padding: 0 11px 0 9px; gap: 5px; display: inline-flex; align-items: center; flex: none;
                             font-weight: 650; font-variant-numeric: tabular-nums; }
      .sk-hchips .sk-ichip ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; }
      .sk-hchips .sk-ichip.solo { width: 34px; padding: 0; justify-content: center; }
      .sk-hchips .sk-ichip.more { color: var(--ps-muted); }
      .sk-hchips .sk-wet { margin-left: auto; }

      /* ---- cards ---- */
      .sk-card { position: relative; background: var(--sk-card); border: 1px solid var(--sk-edge); border-radius: 26px;
                 box-shadow: var(--sk-shadow); overflow: clip; }
      .sk-card > .ps-sect { padding: 16px 18px 18px; }
      .sk-card.sk-pad { padding: 16px 18px 14px; }
      .sk-card .ps-sh { padding-bottom: 12px; }
      .sk-card .ps-nm { font-size: var(--pc-fs-lg); font-weight: 680; }
      .sk-psh { padding-bottom: 8px !important; }
      .sk-psh .ps-nm { display: none; }
      .sk-psh { justify-content: flex-start; }
      .sk-cardh { display: flex; align-items: center; gap: 10px; padding: 16px 18px 4px; font-size: var(--pc-fs-lg); font-weight: 680; }
      .sk-cardh .ps-chip { margin-left: auto; }
      .sk-flush { padding: 8px 18px 18px !important; }
      .sk-ico { flex: none; width: 32px; height: 32px; border-radius: 11px; display: grid; place-items: center;
                color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
      .sk-ico ha-icon { --mdc-icon-size: 18px; }
      .sk-ttl { padding: 4px 4px 6px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
      .sk-ttl h1 { margin: 0; font-size: var(--pc-fs-4xl); font-weight: 720; letter-spacing: -.03em; color: var(--ps-text); }
      .sk-week { cursor: pointer; }
      .sk-vbody { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: end; gap: 16px; margin-top: 10px; cursor: pointer; }
      .sk-vnum b { display: block; font-size: var(--pc-fs-5xl); font-weight: 250; letter-spacing: -.045em; line-height: .9; }
      .sk-vnum span { display: block; margin-top: 6px; font-size: var(--pc-fs-md); font-weight: 600; color: var(--ps-dim); }
      .sk-vnum.over b { color: var(--ps-bad); } .sk-vnum.soon b { color: var(--ps-warn); } .sk-vnum.ok b { color: var(--ps-good); }
      .sk-vart { position: relative; display: block; aspect-ratio: 3 / 2; border-radius: 18px; overflow: hidden; background: var(--sk-vbg); }
      .sk-vart img { display: block; width: 100%; height: 100%; object-fit: cover; }
      .sk-vart.none { display: grid; place-items: center; color: var(--ps-dim); }
      .sk-vgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
      .sk-vcol { display: flex; flex-direction: column; gap: 8px; min-width: 0; cursor: pointer; }
      .sk-vcol .sk-vart { border-radius: 16px; }
      .sk-vcol .sk-vfuel { margin-top: 2px; }
      .sk-vname { font-size: var(--pc-fs-md); font-weight: 650; color: var(--ps-muted); }
      .sk-vnum.sm b { font-size: var(--pc-fs-3xl); }
      .sk-vnum.sm span { margin-top: 2px; }
      .sk-vnum.nolog b, .sk-vnum.sm.nolog b { color: var(--ps-text); font-size: var(--pc-fs-2xl); font-weight: 500; letter-spacing: -.01em; line-height: 1.1; }
      .sk-vnum.sm.nolog b { padding-top: 12px; }
      .sk-vnum b small { margin-left: 4px; font-size: var(--pc-fs-sm); font-weight: 600; letter-spacing: 0; color: var(--ps-dim); }
      .sk-vnum em { font-style: normal; color: var(--ps-text); }
      .sk-vdot { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; border: 2px solid #fff; box-sizing: border-box;
                 background: var(--ps-bad); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ps-bad) 30%, transparent); }
      .sk-vdot.soon { background: var(--ps-warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ps-warn) 30%, transparent); }
      .sk-vfuel { display: flex; align-items: center; gap: 10px; margin-top: 14px; font-size: var(--pc-fs-sm); font-weight: 600; color: var(--ps-muted); }
      .sk-vfuel ha-icon { --mdc-icon-size: 16px; color: var(--ps-dim); }
      .sk-vfuel > span:last-child { color: var(--ps-text); }
      .sk-vfuel.low ha-icon { color: var(--ps-warn); }
      .sk-vfuel.low .sk-vcap i { background: var(--ps-warn); }
      .sk-vcap { position: relative; flex: 1; height: 8px; border-radius: 4px; background: var(--ps-track); overflow: hidden; }
      .sk-vcap i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: var(--sk-truck); }
      .sk-vcap.none { background-image: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 6px); }
      .sk-rowcard { display: flex; align-items: center; gap: 12px; padding: 14px 18px; text-align: left; width: 100%; }
      .sk-rowcard b { display: block; font-size: var(--pc-fs-lg); font-weight: 650; }
      .sk-rowcard small { display: block; font-size: var(--pc-fs-sm); color: var(--ps-dim); }
      .sk-sitgo { flex: none; padding: 8px 14px; border-radius: 18px; background: var(--sk-card2); font-size: var(--pc-fs-sm); font-weight: 650; color: var(--sk-litter); }
      .sk-sithd { margin-left: auto; font-size: var(--pc-fs-md); font-weight: 650; color: var(--sk-litter); }
      .sk-sittop { display: flex; align-items: center; gap: 16px; margin-top: 14px; }
      .sk-sitring { position: relative; flex: none; width: 108px; height: 108px; }
      .sk-sitring .tr { fill: none; stroke: var(--ps-track); stroke-width: 10; }
      .sk-sitring .fl { fill: none; stroke: var(--sk-litter); stroke-width: 10; stroke-linecap: round; }
      .sk-sitring.late .fl { stroke: var(--ps-warn); }
      .sk-sitring > div { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
      .sk-sitring b { font-size: var(--pc-fs-4xl); font-weight: 300; letter-spacing: -.035em; line-height: 1; font-variant-numeric: tabular-nums; }
      .sk-sitring.live b { color: var(--sk-litter); font-size: var(--pc-fs-2xl); }
      .sk-sitring b small { font-size: var(--pc-fs-md); font-weight: 500; color: var(--ps-dim); margin-left: 1px; }
      .sk-sitring span { font-size: var(--pc-fs-sm); font-weight: 600; color: var(--ps-dim); }
      .sk-sitst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
      .sk-sitst > div { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 16px; background: var(--sk-card2); }
      .sk-sitst b { font-size: var(--pc-fs-xl); font-weight: 620; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .sk-sitst b small { font-size: var(--pc-fs-sm); font-weight: 500; color: var(--ps-dim); margin-left: 1px; }
      .sk-sitst > div > span:last-child { flex: none; width: 50px; font-size: var(--pc-fs-sm); font-weight: 550; color: var(--ps-dim); }
      .sk-sitst .sk-sitpips { flex: 1; justify-content: flex-start; max-width: none; }
      .sk-pips.sk-sitpips i.on { background: var(--sk-litter); box-shadow: none; }
      .sk-sitbar { position: relative; flex: 1; min-width: 30px; height: 6px; border-radius: 3px; background: var(--ps-track); }
      .sk-sitbar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: var(--sk-litter); }
      .sk-sitbar i.dot { top: -2px; bottom: auto; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%;
                         box-shadow: 0 0 0 3px color-mix(in srgb, var(--sk-litter) 20%, transparent); }
      .sk-sittrip { display: flex; flex-direction: column; gap: 9px; margin-top: 18px; }
      .sk-sitrow { display: grid; grid-template-columns: 26px minmax(0, 1fr) 40px; align-items: center; gap: 8px;
                   font-size: var(--pc-fs-sm); font-weight: 600; color: var(--ps-dim); }
      .sk-sitrow > span:last-child { text-align: right; }
      .sk-sitrow.today { color: var(--ps-text); font-weight: 700; }
      .sk-sittr { position: relative; height: 12px; border-radius: 6px; background: var(--ps-track); }
      .sk-sitrow.fut .sk-sittr { background: none; border: 1.5px dashed var(--ps-track); box-sizing: border-box; }
      .sk-sittr i { position: absolute; }
      .sk-sittr .hatch { top: 0; bottom: 0; border-radius: 6px; background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 6px); }
      .sk-sittr .cap { top: 1px; bottom: 1px; border-radius: 5px; background: linear-gradient(90deg, var(--sk-litter), var(--pc-aur-b, #6741D9));
                       box-shadow: 0 0 10px color-mix(in srgb, var(--sk-litter) 55%, transparent); }
      .sk-sittr .op { top: -5px; width: 3px; height: 3px; border-radius: 50%; background: var(--sk-litter); }
      .sk-sittr .now { top: -4px; bottom: -4px; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--ps-text); }
      .sk-sitrow.ax { margin-top: -3px; }
      .sk-sitrow.ax > span:nth-child(2) { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .sk-sithome { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 50px; margin-top: 16px;
                    border-radius: 25px; background: var(--sk-card2); color: var(--ps-text); font-weight: 650; font-size: var(--pc-fs-lg); }
      .sk-sithome ha-icon { --mdc-icon-size: 19px; }
      .sk-sittile .sk-ring { color: var(--sk-litter); }
      .sk-sittile .sk-ring .fl { stroke: var(--sk-litter); }
      .sk-sittile.late .sk-ring .fl { stroke: var(--ps-warn); }
      .sk-sittile.lit .sk-tv b { color: var(--sk-litter); }
      .sk-sitglow { background: radial-gradient(150px 120px at 18% 82%, color-mix(in srgb, var(--sk-litter) 20%, transparent), transparent),
                    radial-gradient(120px 90px at 90% 10%, color-mix(in srgb, var(--pc-aur-b, #6741D9) 16%, transparent), transparent); }

      /* ---- tiles ---- */
      .sk-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .sk-tile { position: relative; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; min-height: 146px;
                 padding: 15px 16px; text-align: left; border-radius: 24px; background: var(--sk-card); border: 1px solid var(--sk-edge);
                 box-shadow: var(--sk-shadow); overflow: hidden; }
      .sk-tile.wide { grid-column: 1 / -1; min-height: 0; }
      .sk-tile > *:not(.sk-tglow) { position: relative; }
      .sk-tglow { position: absolute; inset: 0; pointer-events: none; }
      .sk-trow { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; }
      .sk-tv { display: flex; align-items: baseline; gap: 2px; }
      .sk-tv b { font-size: var(--pc-fs-4xl); font-weight: 300; letter-spacing: -.035em; line-height: 1; }
      .sk-tv small { font-size: var(--pc-fs-lg); color: var(--ps-dim); font-weight: 500; margin-left: 2px; }
      .sk-tlab { font-size: var(--pc-fs-sm); color: var(--ps-dim); font-weight: 550; overflow-wrap: anywhere; }
      .sk-pips { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; max-width: 70%; }
      .sk-pips i { width: 8px; height: 8px; border-radius: 4px; background: var(--ps-track); }
      .sk-pips i.on { background: var(--g); box-shadow: 0 0 6px var(--g); }
      .sk-pips i.x { background: transparent; border: 1.5px dashed var(--ps-dim); width: 7px; height: 7px; }
      .sk-ring { position: relative; width: 44px; height: 44px; color: var(--ps-good); display: grid; place-items: center; }
      .sk-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
      .sk-ring .tr { fill: none; stroke: var(--ps-track); stroke-width: 4; }
      .sk-ring .fl { fill: none; stroke: var(--ps-good); stroke-width: 4; stroke-linecap: round; }
      .sk-ring ha-icon { --mdc-icon-size: 18px; }
      .sk-warn { width: 9px; height: 9px; border-radius: 5px; background: var(--ps-warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ps-warn) 25%, transparent); }
      .sk-tanks { display: flex; gap: 5px; align-items: flex-end; height: 44px; }
      .sk-tank { position: relative; width: 16px; height: 44px; border-radius: 6px; background: var(--ps-track); overflow: hidden; }
      .sk-tank i { position: absolute; left: 0; right: 0; bottom: 0; background: var(--sk-litter); }
      .sk-tank.lv i { background: color-mix(in srgb, var(--sk-litter) 45%, var(--sk-card)); }
      .sk-tank.nas i { background: var(--sk-nas); }
      .sk-tank.warn i { background: var(--ps-warn); } .sk-tank.bad i { background: var(--ps-bad); }
      .sk-tank.none { background-image: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 6px); }

      /* ---- the lake: a depth post beside the gap to full pond ---- */
      .sk-lktile { flex-direction: row; align-items: stretch; }
      .sk-lkcol { display: flex; flex-direction: column; justify-content: space-between; gap: 10px; min-width: 0; flex: 1; }
      .sk-lkdir { --mdc-icon-size: 20px; color: var(--ps-cool); }
      .sk-lkdir.flat { color: var(--ps-dim); }
      .sk-lkpost { flex: none; align-self: center; }
      .sk-lkpost .tr { fill: var(--ps-track); }
      .sk-lkpost.none .tr { fill: none; stroke: var(--ps-dim); stroke-width: 1.5; stroke-dasharray: 3 3; }
      .sk-lkpost .w { fill: var(--ps-cool); }
      .sk-lkpost .full { stroke: var(--ps-text); stroke-width: 2; stroke-linecap: round; }
      .sk-lkpost .fl { stroke: var(--ps-warn); stroke-width: 2; stroke-linecap: round; }
      .sk-lktile.high .sk-tv b { color: var(--ps-warn); }
      .sk-lake { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 6px; }
      .sk-lktop { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
      .sk-lkchip ha-icon { --mdc-icon-size: 14px; }
      .sk-lkseg { align-self: stretch; }
      .sk-lkchart { display: block; width: 100%; height: auto; overflow: visible; }
      .sk-lkwrap { position: relative; }
      .sk-lkwrap .ps-cross { top: 10%; bottom: 13%; background: var(--ps-text); opacity: .5; }
      .sk-lkwrap.scrubbing { -webkit-user-select: none; user-select: none; }
      .sk-lktop.live .sk-lkchip { color: var(--ps-text); }
      .sk-lkspan { margin-left: 8px; font-size: var(--pc-fs-sm); color: var(--ps-dim); font-weight: 500; }
      .sk-lkrefs { position: absolute; inset: 0; pointer-events: none; }
      .sk-lkrefs span { position: absolute; left: 0; transform: translateY(-100%); padding: 0 4px 0 0; border-radius: 4px;
                        background: color-mix(in srgb, var(--sk-card) 82%, transparent);
                        color: var(--ps-dim); font-size: var(--pc-fs-xs); font-weight: 600; letter-spacing: .04em; }
      .sk-lkchart .tk { stroke: var(--ps-track); stroke-width: 1; }
      .sk-lkchart.wait { aspect-ratio: 326 / 176; border-radius: 12px; background: var(--ps-track); opacity: .5; }
      .sk-lkchart rect.hatch { fill: url(#sk-lkh); }
      .sk-lkchart #sk-lkh path { stroke: var(--ps-track); stroke-width: 2; }
      .sk-lkchart .ln { fill: none; stroke: var(--ps-cool); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
      .sk-lkchart .ar.band { fill: color-mix(in srgb, var(--ps-cool) 22%, transparent); }
      .sk-lkchart .ln.est { stroke-dasharray: 2 5; opacity: .8; }
      .sk-lkchart .ar { fill: color-mix(in srgb, var(--ps-cool) 16%, transparent); }
      .sk-lkchart .dot { fill: var(--ps-cool); stroke: var(--sk-card); stroke-width: 2; }
      .sk-lkchart .base { stroke: var(--ps-track); stroke-width: 1; }
      .sk-lkchart .full { stroke: var(--ps-dim); stroke-width: 1; stroke-dasharray: 3 4; }
      .sk-lkchart .norm { stroke: var(--ps-track); stroke-width: 1; }
      .sk-lkchart .flt { stroke: var(--ps-warn); stroke-width: 1; stroke-dasharray: 3 4; }
      .sk-lkchart .ax { fill: var(--ps-dim); font-size: var(--pc-fs-xs); font-weight: 600; letter-spacing: .04em; }
      .sk-lkst3 { margin-top: 0; }

      /* ---- server card ---- */
      .sk-meters { display: flex; flex-direction: column; gap: 8px; padding: 10px 18px 4px; }
      .sk-meter { display: grid; grid-template-columns: 56px minmax(0, 1fr) 54px; align-items: center; gap: 10px; font-size: var(--pc-fs-md); font-weight: 600; color: var(--ps-muted); }
      .sk-meter b { text-align: right; color: var(--ps-text); font-variant-numeric: tabular-nums; }
      .sk-mbar { display: block; height: 10px; border-radius: 5px; background: var(--ps-track); overflow: hidden; }
      .sk-mbar i { display: block; height: 100%; border-radius: 5px; background: var(--sk-nas); }
      .sk-meter.warn i { background: var(--ps-warn); } .sk-meter.bad i { background: var(--ps-bad); }
      .sk-mbar.none { background-image: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 6px); }
      .sk-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 10px 18px 0; }
      .st3 { padding: 10px 12px; border-radius: 16px; background: var(--sk-card2); display: flex; flex-direction: column; gap: 1px; }
      .st3 b { font-size: var(--pc-fs-xl); font-weight: 620; font-variant-numeric: tabular-nums; }
      .st3 b small { font-size: var(--pc-fs-sm); font-weight: 500; color: var(--ps-dim); margin-left: 2px; }
      .st3 span { font-size: var(--pc-fs-sm); color: var(--ps-dim); font-weight: 550; }
      .sk-btn { display: flex; align-items: center; justify-content: center; gap: 8px; height: 50px; margin: 14px 18px 18px;
                border-radius: 25px; background: var(--sk-nas); color: #fff; font-weight: 650; font-size: var(--pc-fs-lg); width: calc(100% - 36px); }
      .sk-btn ha-icon { --mdc-icon-size: 18px; }

      /* ---- media ---- */
      .sk-seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; padding: 4px; border-radius: 22px; background: var(--sk-card2); }
      .sk-seg button { height: 40px; border-radius: 18px; font-weight: 650; font-size: var(--pc-fs-lg); color: var(--ps-dim);
                       display: flex; align-items: center; justify-content: center; gap: 7px; }
      .sk-seg button[aria-selected="true"] { background: var(--sk-card); color: var(--ps-text); box-shadow: var(--sk-shadow); }
      .sk-live { width: 7px; height: 7px; border-radius: 4px; background: var(--sk-media); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sk-media) 22%, transparent); }
      .sk-musiccard { padding: 8px 16px 16px; }
      .sk-musichead { padding: 8px 2px 4px; }
      .sk-remotecard { padding: 10px 8px 12px; }

      /* ---- pages reuse the shell's sections: quieten the glass ---- */
      .sk .ps-col { background: none; border: 0; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; border-radius: 0; overflow: visible; }
      .sk .ps-col::before { display: none; }

      /* ---- server pages (the shell's systems mode, inside the House tab) ---- */
      .sk-back { display: inline-flex; align-items: center; gap: 2px; height: 36px; margin: 10px 0 0 -4px; padding: 0 12px 0 4px; border-radius: 18px;
                 color: var(--sk-nas); font-weight: 650; font-size: var(--pc-fs-lg); }
      .sk-back .ps-ico { width: 20px; height: 20px; }
      .sk-sys .ps-stat { padding: 4px 4px 12px; }
      .sk-sys .ps-stat h2 { font-size: var(--pc-fs-4xl); font-weight: 720; letter-spacing: -.03em; margin: 2px 0 0; }
      .sk-sys .ps-dockwrap { position: sticky; top: var(--sk-barh); bottom: auto; z-index: 6; margin: 0 -14px 12px; padding: 6px 14px 10px;
                             background: linear-gradient(var(--sk-bg) 72%, transparent); }
      .sk-sys .ps-dockwrap::before { display: none; }
      .sk-sys .ps-mini { display: none !important; }
      .sk-sys .ps-dock { background: var(--sk-card2); border: 0; box-shadow: none; padding: 4px; border-radius: 22px;
                         -webkit-backdrop-filter: none; backdrop-filter: none; }
      .sk-sys .ps-db { flex-direction: row; justify-content: center; padding: 9px 0; border-radius: 18px; gap: 0; }
      .sk-sys .ps-db span { font-size: var(--pc-fs-sm); letter-spacing: 0; }
      .sk-sys .ps-db ha-icon { display: none; }
      .sk-sys .ps-db.home { display: none; }
      .sk-sys .ps-db.on { background: var(--sk-card); box-shadow: var(--sk-shadow); color: var(--ps-text); }
      .sk-sys .ps-db.on::after { display: none; }
      .sk-sys .ps-col { display: flex; flex-direction: column; gap: 14px; }
      .sk-sys .ps-sypage { background: var(--sk-card); border: 1px solid var(--sk-edge); border-radius: 26px; box-shadow: var(--sk-shadow); padding: 16px 16px 18px; }

      /* ---- foot: mini player and dock ---- */
      .sk-foot { position: sticky; bottom: 0; z-index: 20; padding: 18px 12px calc(10px + env(safe-area-inset-bottom, 0px));
                 display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
      .sk-foot::before { content: ""; position: absolute; inset: 0; z-index: -1;
                         background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--sk-bg) 70%, transparent) 55%, var(--sk-bg)); }
      .sk-foot > * { pointer-events: auto; }
      /* Stepping aside is paint only — transform and opacity, never a margin.
         The foot is sticky and therefore in flow: a -62px margin made the page
         62px shorter, so at the bottom the browser clamped the scroll, which
         read as scrolling up, which brought the bar back and lengthened the
         page again. */
      .sk-mini { transition: transform .35s cubic-bezier(.2,.8,.2,1), opacity .25s; }
      .sk-mini:empty { display: none; }
      .sk-mini.slim { transform: translateY(30px) scale(.94); opacity: 0; pointer-events: none; }
      .sk-mini .ps-mini { background: var(--sk-dock); border: 1px solid var(--sk-edge); box-shadow: var(--sk-shadow); border-radius: 26px; padding: 7px 8px 7px 7px; }
      .sk-mini .ps-mart { width: 40px; height: 40px; border-radius: 20px; }
      .sk-mini .ps-mb { width: 40px; height: 40px; }
      .sk-dock { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; height: 64px; padding: 4px; border-radius: 32px;
                 background: var(--sk-dock); border: 1px solid var(--sk-edge); box-shadow: 0 16px 36px -16px rgba(0,0,0,.35);
                 -webkit-backdrop-filter: blur(24px) saturate(1.7); backdrop-filter: blur(24px) saturate(1.7); }
      .sk-lens { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / var(--n)); border-radius: 28px;
                 background: color-mix(in srgb, var(--ps-deep) 13%, transparent); transform: translateX(calc(var(--i) * 100%));
                 transition: transform .4s cubic-bezier(.2,.9,.25,1.15); }
      .sk-db { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
               font-size: var(--pc-fs-xs); font-weight: 650; color: var(--ps-dim); border-radius: 28px; }
      .sk-db ha-icon { --mdc-icon-size: 22px; }
      .sk-db.on { color: var(--ps-deep); }

      /* ---- sheets on paper ---- */
      .ps-scrim { background: rgba(10,14,22,.32); z-index: 40; }
      .ps-sheet { z-index: 41; }
      :host([data-sk-theme="light"]) .ps-sheet { background: var(--sk-bg); border: 1px solid var(--sk-edge);
        box-shadow: 0 -10px 40px -10px rgba(16,24,40,.28); -webkit-backdrop-filter: none; backdrop-filter: none; }
      .ps-sheet { border-radius: 26px; }
      .ps-sheet .ps-host { border-radius: 18px; }
      /* Hosted cards (the notification list, the vacuum map) are cards of their
         own with their own styles; they get the dark object treatment on paper
         rather than half-reading the light tokens. */
      :host([data-sk-theme="light"]) .ps-sheet .ps-host:not(.sk-paper) { background: #121722; padding: 6px; color: #E6ECF2; color-scheme: dark;
        --primary-text-color: #E6ECF2; --secondary-text-color: #9AA5B4; --rgb-primary-text-color: 230, 236, 242;
        --ha-card-background: transparent; --card-background-color: transparent; }
      @media (min-width: 600px) {
        .ps-sheet { left: calc(50% - 268px); right: calc(50% - 268px); }
      }

      /* ---- light-mode repairs to the shell's dark vocabulary ---- */
      :host([data-sk-theme="light"]) .ps-chip.good { background: rgba(43,138,62,.12); }
      :host([data-sk-theme="light"]) .ps-chip.warn { background: rgba(183,110,0,.12); }
      :host([data-sk-theme="light"]) .ps-chip.bad  { background: rgba(224,49,49,.11); }
      :host([data-sk-theme="light"]) .ps-chip.deep { background: rgba(112,72,232,.12); }
      :host([data-sk-theme="light"]) .ps-chip.lt   { background: rgba(28,126,214,.12); }
      :host([data-sk-theme="light"]) .ps-chip .ps-dot { box-shadow: none !important; }
      :host([data-sk-theme="light"]) .ps-mini { background: var(--sk-dock); }

      :host([data-sk-theme="light"]) .pl-t1, :host([data-sk-theme="light"]) .pl-t2, :host([data-sk-theme="light"]) .pl-kv { text-shadow: none; }
      :host([data-sk-theme="light"]) .pl-kv, :host([data-sk-theme="light"]) .pl-row.on .pl-t2 { color: var(--ps-text); }
      :host([data-sk-theme="light"]) .pl-mood.on { background: rgba(217,130,43,.12); border-color: rgba(217,130,43,.36); color: #B5651D; }
      .sk-mini.np { opacity: 0; pointer-events: none; transform: translateY(20px); }

      /* ===== Skylight components ===== */
      .sk-hd { display: flex; align-items: center; gap: 10px; min-height: 34px; flex-wrap: wrap; }
      .sk-hd > .ps-chip { margin-left: auto; }
      .sk-hn { font-size: var(--pc-fs-lg); font-weight: 680; }
      .sk-hint { margin-left: auto; font-size: var(--pc-fs-sm); color: var(--ps-dim); font-weight: 550; }
      .sk-status { font-size: var(--pc-fs-md); font-weight: 650; color: var(--ps-dim); }
      .sk-status.big { font-size: var(--pc-fs-lg); }
      .sk-status.good { color: var(--ps-good); } .sk-status.warn { color: var(--ps-warn); } .sk-status.bad { color: var(--ps-bad); }
      .sk-status.heat { color: var(--ps-heat); } .sk-status.cool { color: var(--ps-cool); } .sk-status.deep, .sk-status.lt { color: var(--ps-deep); }
      .sk-empty { padding: 18px 4px; text-align: center; color: var(--ps-dim); font-size: var(--pc-fs-md); }
      .sk-tap { cursor: pointer; }
      .sk-big { display: flex; align-items: baseline; gap: 12px; margin-top: 12px; }
      .sk-num { font-size: var(--pc-fs-3xl); font-weight: 300; letter-spacing: -.04em; line-height: 1; font-variant-numeric: tabular-nums; }
      .sk-num small { font-size: .48em; font-weight: 450; color: var(--ps-muted); margin: 0 3px 0 1px; letter-spacing: 0; }
      .sk-wk { display: inline-flex; align-items: center; gap: 4px; color: var(--sk-visit); font-weight: 700; font-size: var(--pc-fs-lg); }
      .sk-wk ha-icon { --mdc-icon-size: 17px; }
      .sk-cap2 { margin-left: auto; font-size: var(--pc-fs-sm); color: var(--ps-dim); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
      .sk-railbox { position: relative; margin-top: 12px; }
      .sk-rail { display: block; width: 100%; height: auto; overflow: visible; }
      .sk-rail .trk { fill: var(--ps-track); } .sk-rail .set { fill: color-mix(in srgb, var(--sk-j2) 35%, var(--sk-card)); }
      .sk-rail .vis { fill: var(--sk-visit); } .sk-rail .vis.vcut { stroke: var(--sk-card); stroke-width: 1; } .sk-rail .visl { stroke: var(--sk-visit); stroke-width: 2; } .sk-rail .visd { fill: var(--sk-visit); }
      .sk-rail .ax, .sk-chart .ax, .sk-gauge .ax { font-size: var(--pc-fs-xs); font-weight: 600; fill: var(--ps-dim); }
      .sk-rail .avg { stroke: var(--ps-text); stroke-width: 1.5; stroke-dasharray: 2 2; opacity: .5; }
      .sk-st3, .sk-ctiles { display: grid; grid-template-columns: repeat(var(--n, 3), minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
      .sk-ctiles { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 0; flex: 1; }
      .st3.wide { grid-column: 1 / -1; }
      .st3 b small { font-size: .7em; }
      .st3 b.heat { color: var(--ps-heat); }
      .st3.on { box-shadow: inset 0 0 0 1.5px var(--ps-cool); }
      .sk-line { display: flex; justify-content: space-between; gap: 10px; margin-top: 12px; font-size: var(--pc-fs-sm); color: var(--ps-dim); font-weight: 550; }
      .sk-btnrow { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 10px; margin-top: 14px; }
      .sk-btnrow:empty { display: none; }
      .sk-bigbtn { height: 50px; border-radius: 25px; background: var(--sk-card2); font-weight: 650; font-size: var(--pc-fs-lg); display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--ps-text); }
      .sk-bigbtn ha-icon { --mdc-icon-size: 19px; }
      .sk-bigbtn.pri { background: var(--ps-deep); color: #fff; }
      .sk-bigbtn.vac { background: var(--ps-good); }
      .sk-bigbtn.armed { background: var(--ps-bad); color: #fff; }
      .sk-bigbtn.wide { width: 100%; margin-top: 12px; }
      .sk-bigbtn:active, .sk-pm:active, .sk-transport button:active { transform: scale(.97); }
      .sk-dayrail { margin-top: 10px; }
      .sk-dayrail .ps-hypt { display: none; }

      /* Joel: the pinned night and its events */
      .sk-nightwrap { position: relative; }
      .sk-nighthero { position: sticky; top: calc(var(--sk-barh) + 6px); z-index: 6; }
      .sk-cursor { position: absolute; top: 0; bottom: 18px; left: 0; width: 0; pointer-events: none; transition: left .45s cubic-bezier(.2,.8,.2,1); }
      .sk-cursor::before { content: ""; position: absolute; top: 14px; bottom: 0; left: -1px; width: 2px; border-radius: 1px; background: var(--ps-text); opacity: .75; }
      .sk-cursor b { position: absolute; top: -8px; left: 0; transform: translateX(-50%); padding: 2px 8px; border-radius: 9px; background: var(--ps-text); color: var(--sk-card); font-size: var(--pc-fs-sm); font-weight: 650; white-space: nowrap; }
      .sk-evs { padding: 6px 0 0; }
      .sk-ev { position: relative; display: grid; grid-template-columns: 34px 1fr auto; align-items: center; width: 100%; height: 64px; padding: 0 6px; text-align: left; color: var(--ps-dim); transition: color .3s; }
      .sk-ev::before { content: ""; position: absolute; left: 22px; top: 0; bottom: 0; width: 2px; background: var(--ps-track); }
      .sk-ev:first-child::before { top: 50%; } .sk-ev:last-child::before { bottom: 50%; }
      .sk-ev .dot { position: relative; z-index: 1; justify-self: center; width: 11px; height: 11px; border-radius: 50%; background: var(--ps-track); border: 3px solid var(--sk-bg); box-sizing: content-box; transition: transform .3s, background .3s; }
      .sk-ev .tm { font-size: var(--pc-fs-2xl); font-weight: 400; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
      .sk-ev .tm small { font-size: var(--pc-fs-sm); margin-left: 3px; font-weight: 550; }
      .sk-ev .w { text-align: right; font-size: var(--pc-fs-md); font-weight: 650; }
      .sk-ev .w small { display: block; font-weight: 500; color: var(--ps-dim); }
      .sk-ev.on { color: var(--ps-text); }
      .sk-ev.on .dot { transform: scale(1.3); background: var(--ps-deep); }
      .sk-ev.visit.on .dot { background: var(--sk-visit); } .sk-ev.sk-j2.on .dot { background: var(--sk-j2); }
      .sk-wks { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
      .sk-wkrow { display: grid; grid-template-columns: 38px minmax(0, 1fr) 44px 62px; align-items: center; gap: 8px; height: 42px; padding: 0 8px; border-radius: 14px; text-align: left; }
      .sk-wkrow.sel { background: var(--sk-card2); }
      .sk-wkrow .d { font-size: var(--pc-fs-md); font-weight: 650; color: var(--ps-muted); }
      .sk-wkrow .w { display: flex; align-items: center; justify-content: flex-end; gap: 2px; font-size: var(--pc-fs-md); font-weight: 700; color: var(--sk-visit); }
      .sk-wkrow .w.z { color: var(--ps-good); }
      .sk-wkrow .w ha-icon { --mdc-icon-size: 15px; }
      .sk-wkrow .l { font-size: var(--pc-fs-md); font-weight: 650; text-align: right; font-variant-numeric: tabular-nums; }
      .sk-vs { display: grid; grid-template-columns: 1fr auto 104px; align-items: baseline; gap: 10px; padding: 9px 2px; border-top: 1px solid var(--sk-edge); font-size: var(--pc-fs-lg); color: var(--ps-muted); }
      .sk-vs:first-of-type { border-top: 0; margin-top: 6px; }
      .sk-vs b { color: var(--ps-text); font-weight: 650; }
      .sk-vs small { text-align: right; color: var(--ps-dim); font-size: var(--pc-fs-sm); }
      .sk-naps { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; }
      .sk-nap { display: grid; grid-template-columns: 42px minmax(0, 1fr); align-items: center; gap: 8px; height: 24px; font-size: var(--pc-fs-sm); font-weight: 650; color: var(--ps-muted); }
      .sk-nap .td { color: var(--ps-text); }
      .sk-nap.ax { height: 16px; }
      .sk-napax { display: flex; justify-content: space-between; font-size: var(--pc-fs-xs); color: var(--ps-dim); font-weight: 550; }
      .sk-napbar { position: relative; display: block; height: 12px; border-radius: 6px; background: var(--ps-track); }
      .sk-napbar.hatch { background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 7px); }
      .sk-napbar.hatch em { position: absolute; right: 6px; top: -2px; font-size: var(--pc-fs-micro); font-style: normal; color: var(--ps-dim); }
      .sk-napbar .seg { position: absolute; top: 0; bottom: 0; border-radius: 6px; background: linear-gradient(90deg, color-mix(in srgb, var(--sk-j2) 45%, var(--sk-card)) var(--set), var(--sk-j2) var(--set), var(--ps-deep)); cursor: pointer; }
      .sk-napbar .seg.live { box-shadow: 0 0 0 2px color-mix(in srgb, var(--ps-deep) 30%, transparent); }
      .sk-napbar .now { position: absolute; top: -3px; bottom: -3px; width: 2px; border-radius: 1px; background: var(--ps-text); }
      .sk-napbar .fut { position: absolute; top: 0; bottom: 0; right: 0; border-radius: 0 6px 6px 0; background: var(--sk-card); opacity: .55; }
      .sk-hatch { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
      .sk-htile { position: relative; height: 96px; border-radius: 22px; background: var(--sk-card2); padding: 14px; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start; overflow: hidden; text-align: left; }
      .sk-htile .n { font-weight: 650; font-size: var(--pc-fs-lg); }
      .sk-htile.armed { background: var(--ps-bad); color: #fff; }
      .sk-hplay { width: 40px; height: 40px; border-radius: 20px; background: var(--ps-deep); color: #fff; display: grid; place-items: center; }
      .sk-hplay ha-icon { --mdc-icon-size: 20px; }
      .sk-htile.lt .sk-tglow { background: none; }
      .sk-htile.lt.on .sk-tglow { background: radial-gradient(calc(60px + var(--b) * 1.6px) calc(46px + var(--b) * 1px) at 26px 30px, rgba(255,190,120,var(--sk-glow)), transparent); }
      .sk-hb { position: relative; display: flex; align-items: center; justify-content: space-between; width: 100%; color: var(--ps-dim); }
      .sk-htile.on .sk-hb { color: var(--g, var(--sk-lamp)); }
      .sk-hb b { color: var(--ps-text); font-size: var(--pc-fs-lg); }
      .sk-htile > .n { position: relative; }

      /* Climate */
      .sk-climrow { display: flex; align-items: center; gap: 14px; margin-top: 8px; }
      .sk-dialsm { position: relative; width: 128px; height: 128px; flex: none; }
      .sk-dialsm .sk-gauge { width: 100%; height: 100%; }
      .sk-dialc { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 4px; }
      .sk-dialc b { font-size: var(--pc-fs-4xl); font-weight: 300; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
      .sk-dialc span { font-size: var(--pc-fs-xs); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ps-dim); }
      .sk-dialc.big b { font-size: var(--pc-fs-5xl); font-weight: 200; line-height: 1; }
      .sk-dialc.big b sup { font-size: .42em; vertical-align: top; }
      .sk-rooms { display: flex; flex-direction: column; margin-top: 12px; }
      .sk-crow { display: grid; grid-template-columns: 10px minmax(0, 1fr) 72px 48px; align-items: center; gap: 10px; height: 32px; }
      .sk-crow .sw, .sk-room .sw { width: 8px; height: 8px; border-radius: 4px; background: var(--c); }
      .sk-crow .sw.off, .sk-room .sw.off { background: transparent; border: 1.5px dashed var(--ps-dim); }
      .sk-crow .nm { font-size: var(--pc-fs-md); font-weight: 600; color: var(--ps-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sk-rv { text-align: right; font-size: var(--pc-fs-lg); font-weight: 620; font-variant-numeric: tabular-nums; }
      .sk-rv.off { color: var(--ps-warn); font-size: var(--pc-fs-sm); }
      .sk-spk { display: block; }
      .sk-spk.none { border: 1.5px dashed var(--ps-track); border-radius: 7px; }
      .sk-spk.hatch { border-radius: 7px; background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 7px); }
      .sk-dialcard { display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .sk-chiprow { display: flex; flex-wrap: wrap; gap: 6px; align-self: stretch; }
      .sk-dial { position: relative; width: min(280px, 100%); aspect-ratio: 1 / .9; }
      .sk-dial .sk-gauge { position: absolute; left: 0; top: 0; width: 100%; height: auto; }
      .sk-goalrow { display: grid; grid-template-columns: 56px 1fr 56px; align-items: center; gap: 12px; width: 100%; }
      .sk-goalrow .g { display: flex; flex-direction: column; align-items: center; }
      .sk-goalrow .g b { font-size: var(--pc-fs-4xl); font-weight: 300; color: var(--ps-heat); letter-spacing: -.03em; }
      .sk-goalrow .g span { font-size: var(--pc-fs-xs); font-weight: 700; color: var(--ps-dim); text-transform: uppercase; letter-spacing: .08em; }
      .sk-pm { width: 56px; height: 56px; border-radius: 28px; background: var(--sk-card2); display: grid; place-items: center; }
      .sk-pm ha-icon { --mdc-icon-size: 22px; }
      .sk-ctlrows { width: 100%; display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
      .sk-zones { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 10px; }
      .sk-zones .st3 { background: var(--sk-card); border: 1px solid var(--sk-edge); box-shadow: var(--sk-shadow); }
      .sk-chartwrap { position: relative; }
      .sk-chartcard { position: sticky; top: calc(var(--sk-barh) + 6px); z-index: 6; }
      .sk-chart { display: block; width: 100%; height: auto; margin-top: 8px; }
      .sk-chart .gr { stroke: var(--ps-text); stroke-opacity: .07; }
      .sk-chart .goal { stroke: var(--ps-heat); stroke-width: 1.5; stroke-dasharray: 2 5; stroke-linecap: round; }
      .sk-chart .ln, .sk-chart .ev { transition: opacity .3s, stroke-width .3s; }
      .sk-chart[data-act] .ln, .sk-chart[data-act] .ev { opacity: .14; }
      .sk-chart[data-act="0"] .r0, .sk-chart[data-act="1"] .r1, .sk-chart[data-act="2"] .r2, .sk-chart[data-act="3"] .r3,
      .sk-chart[data-act="4"] .r4, .sk-chart[data-act="5"] .r5, .sk-chart[data-act="6"] .r6 { opacity: 1; stroke-width: 3.2; }
      .sk-roomlist { display: flex; flex-direction: column; gap: 6px; padding-top: 12px; }
      .sk-room { display: grid; grid-template-columns: 10px minmax(0, 1fr) 64px 62px; align-items: center; gap: 12px; height: 72px; padding: 0 16px; border-radius: 22px; text-align: left; transition: background .3s; }
      .sk-room.on { background: var(--sk-card); box-shadow: var(--sk-shadow); }
      .sk-room .nm { font-size: var(--pc-fs-lg); font-weight: 620; }
      .sk-room .nm small { display: block; font-size: var(--pc-fs-sm); font-weight: 500; color: var(--ps-dim); }
      .sk-room .sk-rv { font-size: var(--pc-fs-2xl); font-weight: 300; }

      /* Week */
      .sk-week { cursor: pointer; margin-top: 8px; }
      .sk-weekrail { display: block; width: 100%; height: auto; }
      .sk-weekrail .trk { fill: var(--sk-card2); }
      .sk-weekrail .hi { font-size: var(--pc-fs-sm); font-weight: 700; fill: var(--ps-text); }
      .sk-weekrail .lo { font-size: var(--pc-fs-sm); font-weight: 550; fill: var(--ps-dim); }
      .sk-weekrail .dw { font-size: var(--pc-fs-sm); font-weight: 600; fill: var(--ps-muted); }
      .sk-weekrail .dw.td { font-weight: 800; fill: var(--ps-text); }
      .sk-weekrail .pop { font-size: var(--pc-fs-xs); font-weight: 700; fill: var(--ps-cool); }

      /* Media */
      .sk-mrow { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 8px 0; }
      .sk-mt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .sk-mt b { font-size: var(--pc-fs-lg); font-weight: 640; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sk-mt small { font-size: var(--pc-fs-sm); color: var(--ps-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sk-apptile { width: 48px; height: 48px; border-radius: 14px; background: var(--sk-card2); display: grid; place-items: center; flex: none; overflow: hidden; color: var(--ps-dim); }
      .sk-apptile svg { width: 26px; height: 26px; }
      .sk-apptile:not(.on) { filter: saturate(.4); opacity: .8; }
      .sk-dotst { display: inline-flex; align-items: center; gap: 6px; font-size: var(--pc-fs-sm); font-weight: 650; color: var(--ps-dim); }
      .sk-dotst::before { content: ""; width: 7px; height: 7px; border-radius: 4px; background: var(--ps-track); }
      .sk-dotst.on::before { background: var(--ps-good); }
      .sk-sep { height: 1px; background: var(--sk-edge); margin: 4px 0; }
      .sk-art { position: relative; flex: none; overflow: hidden; background: var(--sk-card2); display: grid; place-items: center; color: var(--ps-dim); }
      .sk-art img { width: 100%; height: 100%; object-fit: cover; }
      .sk-art.sm { width: 48px; height: 48px; border-radius: 14px; }
      .sk-art.big { width: 100%; aspect-ratio: 1; border-radius: 28px; transform-origin: center top; box-shadow: 0 30px 60px -30px rgba(0,0,0,.5); }
      .sk-art.big ha-icon { --mdc-icon-size: 64px; }
      .sk-eq { position: absolute; right: 8px; bottom: 8px; display: flex; gap: 3px; align-items: flex-end; height: 16px; }
      .sk-art.big .sk-eq { right: 18px; bottom: 18px; height: 34px; gap: 4px; }
      .sk-eq i { width: 3px; border-radius: 2px; background: rgba(255,255,255,.9); height: 30%; animation: skeq 1.1s ease-in-out infinite; }
      .sk-art.big .sk-eq i { width: 5px; }
      .sk-eq i:nth-child(2) { animation-delay: -.3s; } .sk-eq i:nth-child(3) { animation-delay: -.6s; } .sk-eq i:nth-child(4) { animation-delay: -.15s; } .sk-eq i:nth-child(5) { animation-delay: -.8s; }
      @keyframes skeq { 0%, 100% { height: 25%; } 50% { height: 100%; } }
      .sk-pile { display: flex; margin-right: 2px; }
      .sk-pile img, .sk-pile i { width: 26px; height: 26px; border-radius: 9px; border: 2px solid var(--sk-card); margin-left: -10px; object-fit: cover; background: var(--sk-card2); }
      .sk-player { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
      .sk-trk { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
      .sk-trk > div { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .sk-trk b { font-size: var(--pc-fs-2xl); font-weight: 650; letter-spacing: -.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sk-trk small { font-size: var(--pc-fs-lg); color: var(--ps-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sk-transport { display: flex; align-items: center; justify-content: center; gap: 34px; }
      .sk-transport button { width: 52px; height: 52px; border-radius: 26px; display: grid; place-items: center; color: var(--ps-text); }
      .sk-transport button ha-icon { --mdc-icon-size: 30px; }
      .sk-transport .pp { width: 74px; height: 74px; border-radius: 37px; background: var(--ps-text); color: var(--sk-card); }
      .sk-volrow { display: flex; align-items: center; gap: 12px; padding: 4px 4px 0; }
      .sk-mute { width: 40px; height: 40px; border-radius: 20px; display: grid; place-items: center; background: var(--sk-card2); color: var(--sk-media); flex: none; }
      .sk-mute.on { background: var(--sk-media); color: #fff; }
      .sk-ladder { flex: 1; display: flex; align-items: flex-end; gap: 4px; height: 42px; touch-action: pan-y; cursor: pointer; }
      .sk-ladder i { flex: 1; border-radius: 3px; background: var(--ps-track); transition: background .12s; }
      .sk-ladder i.on { background: var(--sk-media); }
      .sk-volv { min-width: 30px; text-align: right; font-weight: 650; font-size: var(--pc-fs-xl); font-variant-numeric: tabular-nums; }
      .sk-rms { display: grid; grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); gap: 10px; }
      .sk-rm { height: 76px; border-radius: 22px; background: var(--sk-card); border: 1px solid var(--sk-edge); box-shadow: var(--sk-shadow); padding: 12px 14px; display: flex; flex-direction: column; justify-content: space-between; text-align: left; }
      .sk-rm .n { font-weight: 650; font-size: var(--pc-fs-md); }
      .sk-rm .s { display: flex; align-items: center; gap: 6px; font-size: var(--pc-fs-sm); color: var(--ps-dim); font-weight: 550; }
      .sk-rm .s i { width: 7px; height: 7px; border-radius: 50%; background: var(--ps-track); }
      .sk-rm .s i.play { background: var(--sk-media); animation: skping 1.8s infinite; }
      .sk-rm .s i.pause { background: var(--ps-dim); }
      @keyframes skping { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--sk-media) 50%, transparent); } 100% { box-shadow: 0 0 0 8px transparent; } }
      .sk-rm[aria-pressed="true"] { border-color: var(--sk-media); box-shadow: inset 0 0 0 1.5px var(--sk-media), var(--sk-shadow); }
      .sk-card .ps-vrow { margin-top: 2px; }
      .sk-keys { display: flex; gap: 16px; margin: 2px 0 8px; font-size: var(--pc-fs-sm); color: var(--ps-dim); font-weight: 600; }
      .sk-key { display: inline-flex; align-items: center; gap: 6px; }
      .sk-key i { width: 12px; height: 3px; border-radius: 2px; background: var(--c); }
      .sk-key b { color: var(--ps-text); font-weight: 650; margin-left: 2px; font-variant-numeric: tabular-nums; }
      .sk-wave .ps-wave-svg { display: block; width: 100%; height: 96px; }
      .sk-wax { display: flex; justify-content: space-between; margin-top: 6px; font-size: var(--pc-fs-xs); color: var(--ps-dim); font-weight: 600; font-variant-numeric: tabular-nums; }
      .sk-novol { flex: 1; font-size: var(--pc-fs-sm); color: var(--ps-dim); font-style: italic; }

      /* House */
      .sk-lights { margin-top: 10px; }
      .sk-vtop { display: flex; align-items: center; gap: 14px; margin-top: 10px; }
      .sk-vring { position: relative; width: 104px; height: 104px; flex: none; }
      .sk-vring > div { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .sk-vring b { font-size: var(--pc-fs-2xl); font-weight: 300; } .sk-vring b small { font-size: .5em; color: var(--ps-dim); }
      .sk-vring span { font-size: var(--pc-fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--ps-dim); }
      .sk-wear { display: grid; grid-template-columns: repeat(var(--n, 5), minmax(0, 1fr)); gap: 4px; margin-top: 14px; }
      .sk-wr { display: flex; flex-direction: column; align-items: center; gap: 5px; font-size: var(--pc-fs-sm); font-weight: 650; color: var(--ps-dim); text-align: center; }
      .sk-wr .r { position: relative; width: 44px; height: 44px; }
      .sk-wr .r b { position: absolute; inset: 0; display: grid; place-items: center; font-size: var(--pc-fs-sm); color: var(--ps-text); }
      .sk-wr .r .hatch { position: absolute; inset: 3px; border-radius: 50%; background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 6px); }
      .sk-wr.due, .sk-wr.due .r b { color: var(--ps-warn); }
      .sk-wr { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; cursor: pointer; }
      .sk-wr .r { transition: transform .38s ease-out; }
      .sk-wr.hold .r { transform: scale(.9); }
      .sk-wearhint { margin-top: 6px; text-align: center; font-size: var(--pc-fs-xs); color: var(--ps-dim); font-weight: 550; }
      .sk-part { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 10px 18px 18px; text-align: center; }
      .sk-part .r { position: relative; width: 96px; height: 96px; }
      .sk-part .r b { position: absolute; inset: 0; display: grid; place-items: center; font-size: var(--pc-fs-2xl); font-weight: 600; color: var(--ps-text); }
      .sk-part .r b.due { color: var(--ps-warn); }
      .sk-part .r .hatch { position: absolute; inset: 4px; border-radius: 50%; background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 6px); }
      .sk-part p { margin: 0; font-size: var(--pc-fs-lg); color: var(--ps-text); line-height: 1.4; max-width: 300px; }
      .sk-part .sk-bigbtn { width: 100%; }
      .sk-wr small { display: block; font-size: var(--pc-fs-xs); color: var(--ps-warn); text-transform: uppercase; letter-spacing: .05em; }
      .sk-opts { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
      .sk-opts:empty { display: none; }
      .sk-optsum { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 10px 14px; border-radius: 22px; line-height: 1.3; background: var(--sk-card2); font-size: var(--pc-fs-md); font-weight: 650; color: var(--ps-text); text-align: left; }
      .sk-optsum ha-icon { --mdc-icon-size: 18px; color: var(--ps-dim); flex: none; }
      .sk-optrow { display: flex; flex-direction: column; gap: 6px; }
      .sk-optrow .ps-lbl { padding-left: 4px; }
      .sk-seg.sm button { height: 34px; font-size: var(--pc-fs-sm); }
      .sk-vrooms { margin-top: 14px; }
      .sk-btnrow.three { grid-auto-columns: 1fr; }
      .sk-shellbits { margin-top: 10px; }
      .sk-tanks2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
      .sk-tankw { display: flex; flex-direction: column; gap: 8px; }
      .sk-tankb { position: relative; height: 84px; border-radius: 20px; background: var(--ps-track); overflow: hidden; }
      .sk-tankb i { position: absolute; left: 0; right: 0; bottom: 0; background: var(--sk-litter); opacity: .9; }
      .sk-tankb.lv i { background: color-mix(in srgb, var(--sk-litter) 42%, var(--sk-card)); }
      .sk-tankb.none { background: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 7px); }
      .sk-tankw .tl { display: flex; align-items: baseline; justify-content: space-between; padding: 0 4px; }
      .sk-tankw .tl span { font-size: var(--pc-fs-md); font-weight: 650; color: var(--ps-dim); }
      .sk-tankw .tl b { font-size: var(--pc-fs-2xl); font-weight: 300; } .sk-tankw .tl b small { font-size: .5em; color: var(--ps-dim); }
      .sk-ringsvg { display: block; }

      /* Server */
      .sk-subtabs { position: sticky; top: var(--sk-barh); z-index: 6; margin: 0 -14px; padding: 6px 14px 10px; background: linear-gradient(var(--sk-bg) 72%, transparent); }
      .sk-ovtop { display: flex; align-items: center; gap: 16px; }
      .sk-ovring { position: relative; width: 140px; height: 140px; flex: none; }
      .sk-ovring svg { width: 100%; height: 100%; }
      .sk-ovring > div { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .sk-ovring b { font-size: var(--pc-fs-4xl); font-weight: 300; letter-spacing: -.03em; } .sk-ovring b small { font-size: .5em; color: var(--ps-dim); }
      .sk-ovring span { font-size: var(--pc-fs-xs); font-weight: 700; color: var(--ps-dim); text-transform: uppercase; letter-spacing: .06em; }
      .sk-meters.col { flex: 1; padding: 0; }
      .sk-dsum { display: flex; gap: 6px; padding: 0 2px; }
      .sk-ct { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto auto; align-items: center; gap: 12px; min-height: 66px; padding: 8px 12px; border-radius: 22px; background: var(--sk-card); border: 1px solid var(--sk-edge); box-shadow: var(--sk-shadow); }
      .sk-ct .av { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: var(--c); }
      .sk-ct .av ha-icon { --mdc-icon-size: 20px; }
      .sk-ct.off .av { background: var(--ps-track); color: var(--ps-dim); }
      .sk-ct .nm { min-width: 0; font-weight: 650; font-size: var(--pc-fs-lg); }
      .sk-ct .nm small { display: block; font-size: var(--pc-fs-sm); font-weight: 500; color: var(--ps-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sk-ctlink { font-weight: 650; font-size: var(--pc-fs-lg); color: var(--ps-text); }
      .sk-rst { width: 36px; height: 36px; border-radius: 18px; display: grid; place-items: center; background: var(--sk-card2); color: var(--ps-muted); }
      .sk-rst ha-icon { --mdc-icon-size: 18px; }
      .sk-tog { width: 52px; height: 32px; border-radius: 16px; background: var(--ps-track); position: relative; transition: background .25s; }
      .sk-tog::after { content: ""; position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 13px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .25s cubic-bezier(.2,.9,.3,1.2); }
      .sk-tog[aria-pressed="true"] { background: var(--ps-good); } .sk-tog[aria-pressed="true"]::after { transform: translateX(20px); }
      .sk-dsk { display: grid; grid-template-columns: 108px minmax(0, 1fr) 46px; align-items: center; gap: 12px; min-height: 46px; }
      .sk-dsk .nm { font-weight: 650; font-size: var(--pc-fs-lg); } .sk-dsk .nm small { display: block; font-size: var(--pc-fs-sm); color: var(--ps-dim); font-weight: 500; }
      .sk-dsk .sk-mbar { height: 14px; border-radius: 7px; }
      .sk-dsk .sk-mbar.empty { background: none; border: 1.5px dashed var(--ps-track); }
      .sk-dsk .tp { text-align: right; font-size: var(--pc-fs-sm); font-weight: 650; color: var(--ps-muted); } .sk-dsk .tp.hot { color: var(--ps-warn); }
      .sk-dhl { font-size: var(--pc-fs-md); font-weight: 650; } .sk-dhl.good { color: var(--ps-good); } .sk-dhl.bad { color: var(--ps-bad); }
      .sk-shares { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
      .sk-shares span { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 16px; background: var(--sk-card2); font-size: var(--pc-fs-sm); font-weight: 600; color: var(--ps-muted); }
      .sk-shares small { color: var(--ps-dim); font-weight: 500; }
      .sk-shellpage .ps-btns { display: flex; flex-wrap: wrap; gap: 8px; }

      /* ================= one page, any width =================
         Every rule below is gated on a tier token that _skSize writes from the
         card's OWN width, so below 700px not one of them applies and the
         phone is exactly what it was.
           tab    700  the dock stands up into a rail, sheets become a drawer,
                       the mini player floats bottom-right, the pills go
           split  940  the detail tabs go two-pane
           desk  1100  a labelled sidebar with each tab's roll-up, Home as a
                       grid, the week up in the sky, Watch and Listen together
           wide  1500  three columns, content caps at 1320 and centres */
      .sk-dv, .sk-bt { display: none; }
      .sk-orb { position: relative; display: block; width: 44px; height: 44px; border-radius: 15px; overflow: hidden;
                background: linear-gradient(180deg, var(--s1, #94C3F0), var(--s2, #DDEBFA)); box-shadow: inset 0 0 0 1px rgba(255,255,255,.2); }
      .sk-orb i { position: absolute; left: 50%; top: 56%; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%;
                  background: #FFB347; box-shadow: 0 0 0 7px rgba(255,216,168,.35); }
      .sk-orb.sky-dawn  { --s1: #B9CDE8; --s2: #F7D9C6; }
      .sk-orb.sky-day   { --s1: #94C3F0; --s2: #DDEBFA; }
      .sk-orb.sky-dusk  { --s1: #ADA3DF; --s2: #F4C6A8; }
      .sk-orb.sky-night { --s1: #222D52; --s2: #5D6896; }
      :host([data-sk-theme="dark"]) .sk-orb.sky-dawn  { --s1: #17213B; --s2: #5A3F56; }
      :host([data-sk-theme="dark"]) .sk-orb.sky-day   { --s1: #15304F; --s2: #2A5079; }
      :host([data-sk-theme="dark"]) .sk-orb.sky-dusk  { --s1: #211943; --s2: #5C334E; }
      :host([data-sk-theme="dark"]) .sk-orb.sky-night { --s1: #04070F; --s2: #111933; }
      .sk-orb.sky-night i, .sk-orb.sky-dusk i { top: 28%; left: 66%; width: 11px; height: 11px; background: #E7ECFF; box-shadow: 0 0 0 6px rgba(231,236,255,.14); }

      :host([data-sk-w~="tab"]) { --sk-railw: 88px; --sk-gut: 28px; --sk-maxw: 1320px; --sk-dbh: 62px;
        --sk-padx: max(var(--sk-gut), calc((100% - var(--sk-maxw)) / 2)); }
      :host([data-sk-w~="desk"]) { --sk-railw: 248px; --sk-gut: 32px; --sk-dbh: 50px; }
      :host([data-sk-w~="wide"]) { --sk-gut: 40px; }

      /* The frame: rail | page. The foot (brand, mini player, dock) becomes the
         rail, sticky for a whole screen beside a page that scrolls. */
      :host([data-sk-w~="tab"]) .sk { max-width: none; margin: 0; display: grid;
        grid-template-columns: var(--sk-railw) minmax(0, 1fr); grid-template-rows: auto auto 1fr; }
      :host([data-sk-w~="tab"]) .sk > * { grid-column: 2; }
      :host([data-sk-w~="tab"]) .sk-safepad { grid-row: 1; }
      :host([data-sk-w~="tab"]) .sk-bar { grid-row: 2; }
      :host([data-sk-w~="tab"]) .sk-view { grid-row: 3; padding: 0 var(--sk-gut) 120px; }
      :host([data-sk-w~="tab"]) .sk-view[data-v="home"] { padding: 0 0 120px; }
      :host([data-sk-w~="tab"]) .sk-view:not([data-v="home"]) > .sk-stack { max-width: var(--sk-maxw); margin: 0 auto; gap: 16px; }
      :host([data-sk-w~="tab"]) .sk-barrow { padding: 0 var(--sk-padx); }
      :host([data-sk-w~="tab"]) .sk-pills { display: none; }
      :host([data-sk-w~="tab"]) .sk-bar.pilled .sk-barbg { bottom: 0; }
      :host([data-sk-w~="tab"]) .sk-ttl h1 { font-size: var(--pc-fs-3xl); }

      :host([data-sk-w~="tab"]) .sk-foot { grid-column: 1; grid-row: 1 / 4; align-self: start; position: sticky; top: 0; bottom: auto;
        height: 100vh; height: 100dvh; padding: 12px; gap: 0; z-index: 22; }
      :host([data-sk-w~="tab"]) .sk-foot::before { inset: 12px; border-radius: 30px; background: var(--sk-dock); border: 1px solid var(--sk-edge);
        box-shadow: 0 16px 36px -18px rgba(0,0,0,.3); }
      :host([data-sk-w~="tab"]) .sk-brand { display: grid; place-items: center; height: 74px; padding: 14px 0 8px; }
      :host([data-sk-w~="tab"]) .sk-brandb { display: grid; place-items: center; color: var(--ps-text); }
      :host([data-sk-w~="tab"]) .sk-dock { display: grid; grid-auto-flow: row; grid-template-columns: minmax(0, 1fr); grid-auto-rows: var(--sk-dbh);
        height: auto; padding: 5px; background: none; border: 0; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; border-radius: 0; }
      :host([data-sk-w~="tab"]) .sk-lens { top: 5px; left: 5px; right: 5px; bottom: auto; width: auto; height: var(--sk-dbh); border-radius: 22px;
        transform: translateY(calc(var(--i) * var(--sk-dbh))); }
      :host([data-sk-w~="tab"]) .sk-db { border-radius: 22px; }

      /* The mini player floats bottom-right of the page, and stays put: there
         is no thumb to step aside from. */
      :host([data-sk-w~="tab"]) .sk-mini { position: fixed; right: 24px; bottom: 20px; width: 340px; z-index: 30; }
      :host([data-sk-w~="tab"]) .sk-mini.slim { transform: none; opacity: 1; pointer-events: auto; }
      :host([data-sk-w~="tab"]) .sk-mini.np { transform: translateY(20px); opacity: 0; pointer-events: none; }

      /* Sheets become a drawer from the right, the full height of the window. */
      :host([data-sk-w~="tab"]) .ps-sheet, :host([data-sk-w~="tab"]) .ps-sheet.tall {
        left: auto; right: 16px; top: 16px; bottom: 16px; width: min(440px, calc(100vw - 32px)); max-height: none; border-radius: 28px; }

      /* Home: the sky across the page, the cards in a grid under it. */
      :host([data-sk-w~="tab"]) .sk-hero { min-height: 400px; }
      :host([data-sk-w~="tab"]) .sk-heroin { padding-left: var(--sk-padx); padding-right: var(--sk-padx); padding-bottom: 164px; }
      :host([data-sk-w~="tab"]) .sk-st.l { left: var(--sk-padx); } :host([data-sk-w~="tab"]) .sk-st.r { right: var(--sk-padx); }
      :host([data-sk-w~="tab"]) .sk-homecards { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; grid-auto-flow: row dense;
        max-width: calc(var(--sk-maxw) + 2 * var(--sk-gut)); margin: -40px auto 0; padding: 0 var(--sk-gut); }
      :host([data-sk-w~="tab"]) .sk-homecards > * { grid-column: 1 / -1; }
      :host([data-sk-w~="split"]) .sk-homecards > #sk-c-clim, :host([data-sk-w~="split"]) .sk-homecards > #sk-c-now { grid-column: span 3; }
      :host([data-sk-w~="split"]) .sk-homecards > .sk-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      :host([data-sk-w~="split"]) .sk-tile.wide { grid-column: 1 / -1; }

      /* Two and three panes: independent stacks, so one tall card never
         stretches a row of the other. */
      .sk-cols { display: grid; gap: 16px 24px; align-items: start; }
      .sk-cols.n2 { grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr); }
      .sk-cols.n3 { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr) minmax(0, .95fr); }
      .sk-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
      .sk-pin.stuck { position: sticky; top: calc(var(--sk-barh) + 6px); z-index: 5; }
      .sk-pin { display: flex; flex-direction: column; gap: 16px; }
      .sk-climcols.n2 { grid-template-columns: minmax(320px, .85fr) minmax(0, 1.15fr); }
      .sk-mediacols.n2 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 32px; }
      .sk-facehd { margin: 0; padding: 4px 4px 0; display: flex; align-items: center; gap: 8px; font-size: var(--pc-fs-xl); font-weight: 650; letter-spacing: -.02em; color: var(--ps-text); }
      .sk-sysbody { display: grid; gap: 16px; align-items: start; }
      .sk-sysbody.pg-docker { grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
      .sk-sysbody.pg-docker > .sk-dsum { grid-column: 1 / -1; }
      .sk-sysbody.pg-storage, .sk-sysbody.pg-overview { grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); }
      :host([data-sk-w~="tab"]) .sk-subtabs { margin: 0; padding: 6px 0 10px; }
      :host([data-sk-w~="tab"]) .sk-subtabs .sk-seg { max-width: 560px; }
      :host([data-sk-w~="tab"]) .sk-view:not([data-v="home"]) > .sk-stack > .sk-seg { max-width: 560px; width: 100%; }

      /* Listen beside its cover wherever its column can hold the transport
         next to it: a lone Listen face on a tablet, or the right half of a
         wide screen. */
      :host([data-sk-w~="tab"]:not([data-sk-w~="desk"])) .sk-player, :host([data-sk-w~="wide"]) .sk-player {
        display: grid; grid-template-columns: minmax(0, 260px) minmax(0, 1fr); column-gap: 28px; row-gap: 14px; align-items: center; }
      :host([data-sk-w~="tab"]:not([data-sk-w~="desk"])) .sk-player > *, :host([data-sk-w~="wide"]) .sk-player > * { grid-column: 2; }
      :host([data-sk-w~="tab"]:not([data-sk-w~="desk"])) .sk-player > .sk-art.big, :host([data-sk-w~="wide"]) .sk-player > .sk-art.big { grid-column: 1; grid-row: 1 / span 4; align-self: start; }
      :host([data-sk-w~="tab"]:not([data-sk-w~="desk"])) .sk-player > .ps-qbar, :host([data-sk-w~="wide"]) .sk-player > .ps-qbar,
      :host([data-sk-w~="tab"]:not([data-sk-w~="desk"])) .sk-player > .ps-toast, :host([data-sk-w~="wide"]) .sk-player > .ps-toast { grid-column: 1 / -1; }
      :host([data-sk-w~="tab"]:not([data-sk-w~="desk"])) .sk-transport, :host([data-sk-w~="wide"]) .sk-transport { justify-content: flex-start; }
      :host([data-sk-w~="tab"]) .sk-art.big { box-shadow: 0 24px 50px -30px rgba(0,0,0,.45); }
      :host([data-sk-w~="desk"]:not([data-sk-w~="wide"])) .sk-art.big { width: min(100%, 360px); margin-inline: auto; }
      :host([data-sk-w~="desk"]:not([data-sk-w~="wide"])) .sk-trk { text-align: center; }
      :host([data-sk-w~="desk"]:not([data-sk-w~="wide"])) .sk-trk > div { align-items: center; }

      /* desk: the labelled sidebar */
      :host([data-sk-w~="desk"]) .sk-foot { padding: 12px 12px 12px; display: flex; flex-direction: column; }
      :host([data-sk-w~="desk"]) .sk-brand { height: auto; padding: 16px 14px 10px; place-items: stretch; }
      :host([data-sk-w~="desk"]) .sk-brandb { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; column-gap: 12px; text-align: left; padding: 0 6px; }
      :host([data-sk-w~="desk"]) .sk-bt { display: flex; flex-direction: column; min-width: 0; }
      :host([data-sk-w~="desk"]) .sk-bt b { font-size: var(--pc-fs-lg); font-weight: 680; letter-spacing: -.015em; }
      :host([data-sk-w~="desk"]) .sk-bt small { font-size: var(--pc-fs-sm); color: var(--ps-dim); font-weight: 550; }
      :host([data-sk-w~="desk"]) .sk-dock { padding: 6px 11px; }
      :host([data-sk-w~="desk"]) .sk-lens { left: 11px; right: 11px; top: 6px; border-radius: 16px; }
      :host([data-sk-w~="desk"]) .sk-db { flex-direction: row; justify-content: flex-start; gap: 14px; padding: 0 14px; font-size: var(--pc-fs-md); border-radius: 16px; }
      :host([data-sk-w~="desk"]) .sk-db ha-icon { --mdc-icon-size: 20px; }
      :host([data-sk-w~="desk"]) .sk-dv { display: block; margin-left: auto; min-width: 0; max-width: 46%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        font-size: var(--pc-fs-sm); font-weight: 600; color: var(--ps-dim); font-variant-numeric: tabular-nums; }
      :host([data-sk-w~="desk"]) .sk-db.on .sk-dv { color: var(--ps-deep); }
      :host([data-sk-w~="desk"]) .sk-mini { position: relative; right: auto; bottom: auto; width: auto; order: 3; margin: auto 11px 11px; z-index: 1; }
      :host([data-sk-w~="desk"]) .sk-mini .ps-mini { background: var(--sk-card); }

      /* desk: Home, with the week up in the sky */
      :host([data-sk-w~="desk"]) .sk-hero { min-height: 440px; }
      :host([data-sk-w~="desk"]) .sk-heroin { display: grid; grid-template-columns: minmax(300px, 1fr) minmax(340px, 1.15fr); column-gap: 48px; row-gap: 2px; align-content: start; }
      :host([data-sk-w~="desk"]) .sk-heroin > * { grid-column: 1; }
      :host([data-sk-w~="desk"]) .sk-heroin > .sk-htop { grid-column: 1 / -1; }
      :host([data-sk-w~="desk"]) .sk-heroin > .sk-hweek { grid-column: 2; grid-row: 2 / span 5; align-self: start; justify-self: end; }
      .sk-hweek { width: 100%; max-width: 460px; padding: 12px 18px 4px; border-radius: 28px; color: var(--ps-text); cursor: pointer;
        background: color-mix(in srgb, var(--sk-card) 74%, transparent); border: 1px solid color-mix(in srgb, var(--sk-card) 50%, transparent);
        -webkit-backdrop-filter: blur(20px) saturate(1.4); backdrop-filter: blur(20px) saturate(1.4); box-shadow: 0 20px 50px -30px rgba(0,0,0,.35); }
      .sk-hweek .sk-week { margin-top: 2px; }
      :host([data-sk-w~="desk"]) .sk-homecards { grid-template-columns: repeat(12, minmax(0, 1fr)); margin-top: -48px; }
      :host([data-sk-w~="desk"]) .sk-homecards > #sk-c-joel  { grid-column: span 7; order: 1; display: flex; flex-direction: column; }
      :host([data-sk-w~="desk"]) .sk-homecards > #sk-c-clim  { grid-column: span 5; order: 2; display: flex; flex-direction: column; }
      :host([data-sk-w~="desk"]) .sk-homecards > #sk-c-now   { grid-column: span 5; order: 3; }
      :host([data-sk-w~="desk"]) .sk-homecards > .sk-tiles   { grid-column: span 7; order: 4; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      :host([data-sk-w~="desk"]) .sk-homecards > #sk-c-needs { order: 5; }
      :host([data-sk-w~="desk"]) .sk-homecards > #sk-c-truck { order: 6; }
      :host([data-sk-w~="desk"]) #sk-c-joel .sk-st3 { margin-top: auto; padding-top: 14px; }
      :host([data-sk-w~="desk"]) #sk-c-clim .sk-rooms { margin-top: auto; padding-top: 8px; }
      :host([data-sk-w~="desk"]) #sk-c-clim .sk-dialsm { width: 156px; height: 156px; }
      :host([data-sk-w~="desk"]) .sk-tiles .sk-tile { min-height: 0; }
      :host([data-sk-w~="desk"]) .sk-vgrid { gap: 20px; }
      :host([data-sk-w~="desk"]) .sk-vcol { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: auto auto 1fr; column-gap: 16px; row-gap: 4px; align-items: start; }
      :host([data-sk-w~="desk"]) .sk-vcol > .sk-vart { grid-column: 1; grid-row: 1 / span 3; }
      :host([data-sk-w~="desk"]) .sk-vcol > :not(.sk-vart) { grid-column: 2; }
      :host([data-sk-w~="desk"]) .sk-vcol > .sk-vfuel { align-self: end; }
      :host([data-sk-w~="desk"]) .sk-vbody { grid-template-columns: auto minmax(0, 360px); justify-content: space-between; }
      .sk-jwk { display: grid; gap: 7px; margin-top: 14px; }
      .sk-jr { display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: center; column-gap: 10px; opacity: .72; }
      .sk-jr b { font-size: var(--pc-fs-xs); font-weight: 650; color: var(--ps-dim); }

      /* wide */
      :host([data-sk-w~="wide"]) .sk-homecards > #sk-c-joel { grid-column: span 5; }
      :host([data-sk-w~="wide"]) .sk-homecards > #sk-c-clim { grid-column: span 4; }
      :host([data-sk-w~="wide"]) .sk-homecards > #sk-c-now  { grid-column: span 3; }
      :host([data-sk-w~="wide"]) .sk-homecards > .sk-tiles  { grid-column: 1 / -1; grid-template-columns: repeat(4, minmax(0, 1fr)); }

      /* A pointer can hover, a thumb cannot: hover states only where they mean something. */
      @media (hover: hover) {
        :host([data-sk-w~="tab"]) .sk-db:hover:not(.on) { color: var(--ps-text); }
        :host([data-sk-w~="tab"]) .sk-tile, :host([data-sk-w~="tab"]) .sk-card.sk-tap, :host([data-sk-w~="tab"]) .sk-rowcard,
        :host([data-sk-w~="tab"]) .sk-rm { transition: box-shadow .2s; }
        :host([data-sk-w~="tab"]) .sk-tile:hover, :host([data-sk-w~="tab"]) .sk-card.sk-tap:hover, :host([data-sk-w~="tab"]) .sk-rowcard:hover,
        :host([data-sk-w~="tab"]) .sk-rm:hover { box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--ps-deep) 30%, transparent), var(--sk-shadow); }
        :host([data-sk-w~="tab"]) .sk-wkrow:hover:not(.sel), :host([data-sk-w~="tab"]) .sk-room:hover:not(.on), :host([data-sk-w~="tab"]) .sk-ev:hover { background: var(--sk-card2); }
        :host([data-sk-w~="tab"]) .sk-ev { border-radius: 16px; }
        :host([data-sk-w~="tab"]) .sk-hweek:hover { box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--ps-deep) 30%, transparent), 0 20px 50px -30px rgba(0,0,0,.35); }
      }
      :host([data-sk-w~="tab"]) .sk-db:focus-visible, :host([data-sk-w~="tab"]) .sk-tile:focus-visible, :host([data-sk-w~="tab"]) .sk-card:focus-visible {
        outline: 2px solid var(--ps-deep); outline-offset: 2px; }

      @media (prefers-reduced-motion: reduce) {
        .sk-eq i, .sk-rm .s i.play { animation: none !important; }
        .sk-pill, .sk-pills, .sk-lens, .sk-mini, .sk-barbg { transition: none !important; }
      }
`;
