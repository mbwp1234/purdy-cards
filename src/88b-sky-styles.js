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
        --sk-glow: .42;
        --sk-barh: calc(56px + env(safe-area-inset-top, 0px));
        display: block;
        max-width: 560px;
        margin: 0 auto;
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
        --sk-glow: .62;

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

      .sk { position: relative; min-height: 100dvh; display: flex; flex-direction: column; }
      .sk-view { display: none; padding: 0 14px 18px; }
      .sk-view.on { display: block; flex: 1; }
      .sk-view[data-v="home"] { padding: 0 0 18px; }
      .sk-stack { display: flex; flex-direction: column; gap: 14px; }
      .sk-homecards { padding: 0 14px; margin-top: -30px; position: relative; z-index: 2; }

      /* ---- top bar ---- */
      .sk-bar { position: sticky; top: 0; z-index: 20; pointer-events: none;
                padding-top: env(safe-area-inset-top, 0px); }
      .sk-barbg { position: absolute; inset: 0; opacity: var(--solid, 0); background: var(--sk-bar);
                  -webkit-backdrop-filter: blur(22px) saturate(1.6); backdrop-filter: blur(22px) saturate(1.6);
                  border-bottom: 1px solid var(--sk-edge); transition: opacity .15s linear; }
      .sk-barrow { position: relative; height: 56px; display: flex; align-items: center; gap: 10px; padding: 0 14px 0 18px; }
      .sk-bart { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; opacity: var(--titlep, 0);
                 transform: translateY(calc((1 - var(--titlep, 0)) * 6px));
                 font-size: 17px; font-weight: 650; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; }
      .sk-bart small { font-size: 13px; font-weight: 500; color: var(--ps-dim); }
      .sk-bnum { font-size: 24px; font-weight: 300; letter-spacing: -.03em; }
      .sk-bell { pointer-events: auto; position: relative; width: 42px; height: 42px; border-radius: 21px; display: grid; place-items: center;
                 background: color-mix(in srgb, var(--sk-card) 72%, transparent); color: var(--ps-text);
                 -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); box-shadow: var(--sk-shadow); }
      .sk-bell .ps-ico { width: 20px; height: 20px; }
      .sk-bell i { position: absolute; top: -2px; right: -2px; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 10px;
                   font-style: normal; font-size: 11px; font-weight: 750; line-height: 19px; text-align: center; color: #fff;
                   background: var(--ps-dim); border: 2px solid var(--sk-bg); }
      .sk-bell.bad i { background: var(--ps-bad); }
      .sk-bell.warn i { background: var(--ps-warn); }
      .sk-bell.log i { background: var(--ps-warn); }
      .sk-pills { position: relative; display: flex; gap: 6px; padding: 0 14px; height: 0; overflow: hidden; overflow-x: auto; scrollbar-width: none;
                  transition: height .3s cubic-bezier(.2,.8,.2,1); }
      .sk-bar.pilled .sk-pills { height: 46px; }
      .sk-pill { pointer-events: auto; display: inline-flex; align-items: center; gap: 6px; height: 34px; border-radius: 17px;
                 background: var(--sk-card); box-shadow: var(--sk-shadow); font-size: 13px; font-weight: 650; white-space: nowrap;
                 max-width: 0; padding: 0; opacity: 0; transform: translateY(12px) scale(.7);
                 transition: max-width .35s cubic-bezier(.2,.8,.2,1), padding .35s, opacity .25s, transform .35s cubic-bezier(.2,.9,.3,1.3); }
      .sk-pill.on { max-width: 170px; padding: 0 12px 0 9px; opacity: 1; transform: none; }
      .sk-pill ha-icon { --mdc-icon-size: 16px; color: var(--pc); }
      .sk-pill span { overflow: hidden; text-overflow: ellipsis; }

      /* ---- the sky ---- */
      .sk-hero { position: relative; margin-top: calc(-1 * var(--sk-barh)); padding-top: var(--sk-barh); min-height: 400px; overflow: hidden; }
      .sk-sky { position: absolute; inset: 0; --s1: #9CC9F2; --s2: #DCEBFA; --si: #101623; --si2: #44506A; --stars: 0;
                background: linear-gradient(180deg, var(--s1) 0%, var(--s2) 62%, var(--sk-bg) 100%); }
      :host([data-sk-theme="light"]) .sk-sky.sky-dawn  { --s1: #B9CDE8; --s2: #F7D9C6; }
      :host([data-sk-theme="light"]) .sk-sky.sky-day   { --s1: #94C3F0; --s2: #DDEBFA; }
      :host([data-sk-theme="light"]) .sk-sky.sky-dusk  { --s1: #ADA3DF; --s2: #F4C6A8; }
      :host([data-sk-theme="light"]) .sk-sky.sky-night { --s1: #222D52; --s2: #5D6896; --si: #F3F5FA; --si2: #C5CCE0; --stars: 1; }
      :host([data-sk-theme="dark"]) .sk-sky { --si: #EDF1F7; --si2: #B4BDCC; }
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
      .sk-arc { position: absolute; left: 0; right: 0; bottom: 40px; height: 78px; pointer-events: none; }
      .sk-arc svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
      .sk-arc .sk-hz { stroke: var(--si); stroke-opacity: .14; stroke-width: 1; vector-effect: non-scaling-stroke; }
      .sk-arc .sk-path { fill: none; stroke: var(--si); stroke-opacity: .25; stroke-width: 1.3; stroke-dasharray: 1 6; stroke-linecap: round; vector-effect: non-scaling-stroke; }
      .sk-sun { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #FFB347;
                box-shadow: 0 0 0 10px rgba(255,200,120,.28), 0 0 30px 10px rgba(255,190,100,.35); }
      .sk-moon { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: transparent;
                 box-shadow: inset -5px -2px 0 0 #E7ECFF; transform: rotate(-20deg); }
      .sk-st { position: absolute; top: calc(100% - 9px); font-size: 10.5px; font-weight: 600; color: var(--si2); font-variant-numeric: tabular-nums; }
      .sk-st.l { left: 18px; } .sk-st.r { right: 18px; }
      .sk-heroin { position: relative; z-index: 1; padding: 0 18px 112px; color: var(--si); display: flex; flex-direction: column; gap: 2px; will-change: transform; }
      .sk-htop { display: flex; align-items: center; height: 44px; margin: -50px 0 14px; padding-right: 56px; }
      .sk-hero .ps-pav { gap: 6px; }
      .sk-greet { transition: opacity .1s linear; }
      .sk-hi { font-size: 17px; font-weight: 520; letter-spacing: -.01em; }
      .sk-hi b { font-weight: 700; background: linear-gradient(90deg, var(--ps-aur-a), var(--ps-aur-b)); -webkit-background-clip: text; background-clip: text; color: transparent; }
      :host([data-sk-theme="light"]) .sk-sky.sky-night ~ .sk-heroin .sk-hi b { background: linear-gradient(90deg, #66D9E8, #B197FC); -webkit-background-clip: text; background-clip: text; }
      .sk-date { font-size: 13px; color: var(--si2); margin-top: 2px; }
      .sk-temp { display: flex; align-items: flex-start; gap: 10px; margin-top: 14px; transform-origin: left top; color: inherit; align-self: flex-start; }
      .sk-tn { font-size: 96px; font-weight: 200; line-height: .9; letter-spacing: -.055em; font-variant-numeric: tabular-nums; }
      .sk-tn sup { font-size: .5em; font-weight: 250; vertical-align: top; position: relative; top: .1em; margin-left: 2px; }
      .sk-tc { display: flex; flex-direction: column; gap: 3px; padding-top: 10px; font-size: 14px; font-weight: 550; color: var(--si2); }
      .sk-tc ha-icon { --mdc-icon-size: 24px; color: var(--si); }
      .sk-feels { font-weight: 500; font-size: 12.5px; }
      .sk-today { display: flex; align-items: center; gap: 10px; margin-top: 16px; font-size: 13px; font-variant-numeric: tabular-nums; }
      .sk-today b { font-weight: 700; } .sk-today .lo { color: var(--ps-cool); } .sk-today .hi { color: var(--ps-heat); }
      :host([data-sk-theme="light"]) .sk-sky.sky-night ~ .sk-heroin .sk-today .lo { color: #66D9E8; }
      :host([data-sk-theme="light"]) .sk-sky.sky-night ~ .sk-heroin .sk-today .hi { color: #FFA94D; }
      .sk-cap { position: relative; flex: 0 1 170px; height: 8px; border-radius: 4px; background: rgba(var(--sk-fg), .12); }
      .sk-capfill { position: absolute; top: 0; bottom: 0; border-radius: 4px; background: linear-gradient(90deg, #4DABF7, #FFC078 70%, #FF922B); }
      .sk-cap i { position: absolute; top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%;
                  background: var(--sk-card); border: 3px solid var(--si); box-shadow: 0 0 0 4px rgba(255,255,255,.25); }
      .sk-hchips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
      .sk-hchips .ps-chip { font-size: 11.5px; padding: 5px 10px; background: color-mix(in srgb, var(--sk-card) 78%, transparent);
                            -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }

      /* ---- cards ---- */
      .sk-card { position: relative; background: var(--sk-card); border: 1px solid var(--sk-edge); border-radius: 26px;
                 box-shadow: var(--sk-shadow); overflow: clip; }
      .sk-card > .ps-sect { padding: 16px 18px 18px; }
      .sk-card.sk-pad { padding: 16px 18px 14px; }
      .sk-card .ps-sh { padding-bottom: 12px; }
      .sk-card .ps-nm { font-size: 15px; font-weight: 680; }
      .sk-psh { padding-bottom: 8px !important; }
      .sk-psh .ps-nm { display: none; }
      .sk-psh { justify-content: flex-start; }
      .sk-cardh { display: flex; align-items: center; gap: 10px; padding: 16px 18px 4px; font-size: 15px; font-weight: 680; }
      .sk-cardh .ps-chip { margin-left: auto; }
      .sk-flush { padding: 8px 18px 18px !important; }
      .sk-ico { flex: none; width: 32px; height: 32px; border-radius: 11px; display: grid; place-items: center;
                color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
      .sk-ico ha-icon { --mdc-icon-size: 18px; }
      .sk-ttl { padding: 18px 4px 6px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
      .sk-ttl h1 { margin: 0; font-size: 34px; font-weight: 720; letter-spacing: -.03em; color: var(--ps-text); }
      .sk-week { cursor: pointer; }
      .sk-rowcard { display: flex; align-items: center; gap: 12px; padding: 14px 18px; text-align: left; width: 100%; }
      .sk-rowcard b { display: block; font-size: 15px; font-weight: 650; }
      .sk-rowcard small { display: block; font-size: 12.5px; color: var(--ps-dim); }

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
      .sk-tv b { font-size: 32px; font-weight: 300; letter-spacing: -.035em; line-height: 1; }
      .sk-tv small { font-size: 15px; color: var(--ps-dim); font-weight: 500; margin-left: 2px; }
      .sk-tl { font-size: 12.5px; color: var(--ps-dim); font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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

      /* ---- server card ---- */
      .sk-meters { display: flex; flex-direction: column; gap: 8px; padding: 10px 18px 4px; }
      .sk-meter { display: grid; grid-template-columns: 56px minmax(0, 1fr) 54px; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; color: var(--ps-muted); }
      .sk-meter b { text-align: right; color: var(--ps-text); font-variant-numeric: tabular-nums; }
      .sk-mbar { display: block; height: 10px; border-radius: 5px; background: var(--ps-track); overflow: hidden; }
      .sk-mbar i { display: block; height: 100%; border-radius: 5px; background: var(--sk-nas); }
      .sk-meter.warn i { background: var(--ps-warn); } .sk-meter.bad i { background: var(--ps-bad); }
      .sk-mbar.none { background-image: repeating-linear-gradient(135deg, var(--ps-track) 0 2px, transparent 2px 6px); }
      .sk-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 10px 18px 0; }
      .st3 { padding: 10px 12px; border-radius: 16px; background: var(--sk-card2); display: flex; flex-direction: column; gap: 1px; }
      .st3 b { font-size: 17px; font-weight: 620; font-variant-numeric: tabular-nums; }
      .st3 b small { font-size: 12px; font-weight: 500; color: var(--ps-dim); margin-left: 2px; }
      .st3 span { font-size: 12px; color: var(--ps-dim); font-weight: 550; }
      .sk-btn { display: flex; align-items: center; justify-content: center; gap: 8px; height: 50px; margin: 14px 18px 18px;
                border-radius: 25px; background: var(--sk-nas); color: #fff; font-weight: 650; font-size: 15px; width: calc(100% - 36px); }
      .sk-btn ha-icon { --mdc-icon-size: 18px; }

      /* ---- media ---- */
      .sk-seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; padding: 4px; border-radius: 22px; background: var(--sk-card2); }
      .sk-seg button { height: 40px; border-radius: 18px; font-weight: 650; font-size: 14px; color: var(--ps-dim);
                       display: flex; align-items: center; justify-content: center; gap: 7px; }
      .sk-seg button[aria-selected="true"] { background: var(--sk-card); color: var(--ps-text); box-shadow: var(--sk-shadow); }
      .sk-live { width: 7px; height: 7px; border-radius: 4px; background: var(--sk-media); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sk-media) 22%, transparent); }
      .sk-musiccard { padding: 8px 16px 16px; }
      .sk-musichead { padding: 8px 2px 4px; }
      /* The remote is a device in the hand, so it stays a dark object on either
         page — and it is a card of its own whose styles read HA's dark tokens. */
      .sk-remotecard { background: #121722; border-color: rgba(255,255,255,.06); padding: 10px 8px 12px;
        --primary-text-color: #E6ECF2; --secondary-text-color: #9AA5B4; --rgb-primary-text-color: 230, 236, 242;
        --ha-card-background: transparent; --card-background-color: transparent; color: #E6ECF2; color-scheme: dark; }

      /* ---- pages reuse the shell's sections: quieten the glass ---- */
      .sk .ps-col { background: none; border: 0; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; border-radius: 0; overflow: visible; }
      .sk .ps-col::before { display: none; }

      /* ---- server pages (the shell's systems mode, inside the House tab) ---- */
      .sk-back { display: inline-flex; align-items: center; gap: 2px; height: 36px; margin: 10px 0 0 -4px; padding: 0 12px 0 4px; border-radius: 18px;
                 color: var(--sk-nas); font-weight: 650; font-size: 15px; }
      .sk-back .ps-ico { width: 20px; height: 20px; }
      .sk-sys .ps-stat { padding: 4px 4px 12px; }
      .sk-sys .ps-stat h2 { font-size: 30px; font-weight: 720; letter-spacing: -.03em; margin: 2px 0 0; }
      .sk-sys .ps-dockwrap { position: sticky; top: var(--sk-barh); bottom: auto; z-index: 6; margin: 0 -14px 12px; padding: 6px 14px 10px;
                             background: linear-gradient(var(--sk-bg) 72%, transparent); }
      .sk-sys .ps-dockwrap::before { display: none; }
      .sk-sys .ps-mini { display: none !important; }
      .sk-sys .ps-dock { background: var(--sk-card2); border: 0; box-shadow: none; padding: 4px; border-radius: 22px;
                         -webkit-backdrop-filter: none; backdrop-filter: none; }
      .sk-sys .ps-db { flex-direction: row; justify-content: center; padding: 9px 0; border-radius: 18px; gap: 0; }
      .sk-sys .ps-db span { font-size: 12.5px; letter-spacing: 0; }
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
      .sk-mini { transition: transform .35s cubic-bezier(.2,.8,.2,1), opacity .25s, margin .35s; }
      .sk-mini:empty { display: none; }
      .sk-mini.slim { transform: translateY(30px) scale(.94); opacity: 0; pointer-events: none; margin-bottom: -62px; }
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
               font-size: 11px; font-weight: 650; color: var(--ps-dim); border-radius: 28px; }
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
      .sk-mini.np { opacity: 0; pointer-events: none; transform: translateY(20px); margin-bottom: -62px; }

      @media (prefers-reduced-motion: reduce) {
        .sk-pill, .sk-pills, .sk-lens, .sk-mini, .sk-barbg { transition: none !important; }
      }
`;
