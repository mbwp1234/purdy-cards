/*
 * Purdy Cards
 * One bundle, one resource, one version — the custom Lovelace cards for this house.
 *
 *   climate-panel-card   full climate panel, plus a `compact:` mode for the home screen
 *   sleep-panel-card     full infant sleep panel, plus a `ribbon:` mode for the home screen
 *
 * Both cards keep their original type strings, so existing dashboard config
 * needs no changes when migrating from the standalone repos.
 *
 * No dependencies — plain web components. One build step, and it takes no
 * packages: `node build.mjs` concatenates src/ and strips the comments.
 * https://github.com/mbwp1234/purdy-cards
 */

const PC_VERSION = "1.70.0";

/* Shared design tokens. Every card derives its own prefixed variables from
   these, so a colour or radius changes in exactly one place.
 *
 * The three SCALES below exist because the shell had grown 17 distinct font
 * sizes, 15 radii and 13 near-identical surface tints — differences of half a
 * pixel or two percent of alpha that nobody reads as hierarchy, only as slight
 * inconsistency. Anything new picks a step; it does not invent one.
 */
const PC_TOKENS = `
        --pc-panel: var(--ha-card-background, var(--card-background-color, #181f26));
        --pc-panel-2: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.07);
        --pc-line: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.10);
        --pc-track: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.12);
        --pc-chip: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.08);
        --pc-text: var(--primary-text-color, #e6ecf2);
        --pc-muted: var(--secondary-text-color, #8b96a3);
        --pc-heat: #ff9557;
        --pc-cool: #56D4E4;
        --pc-good: #7FD8A4;
        --pc-warn: #f2c14e;
        --pc-bad: #F27A83;
        /* The cool, as bare channels, so a translucent tint of it derives from
           the same value the solid one does.

           Skyline moved --pc-cool from #4dd0e1 to #56D4E4 and every text colour
           in the bundle followed it, because they all read the token. The
           forty-odd BACKGROUNDS did not: they were written as 77, 208, 225 with
           an alpha — the OLD cool spelled out in channels — so every "on" chip
           in the shell, the desk and the climate panel wore a tint one hue off
           the text sitting on it. Nobody reads that as two colours; it reads as
           the chip looking slightly dirty, which is exactly the failure a single
           token block exists to make impossible. A hex cannot be given an alpha
           inside a variable, so the channels have to be their own token.

           NOTE: this comment lives inside a template literal. No backticks. */
        --pc-cool-rgb: 86, 212, 228;
        /* The one aurora accent (Skyline). Cyan to violet owns everything
           non-semantic: dock active slot, ring strokes, the greeting word,
           section-label ticks. Semantic colours stay the five above. */
        --pc-aur-a: #56D4E4;
        --pc-aur-b: #8B7CFF;
        --pc-radius: 24px;
        /* The cool wash across the top of a panel, lifted from the climate
           card's weather strip so every panel opens the same way. */
        --pc-tint: rgba(var(--pc-cool-rgb), 0.10);

        /* type — seven steps. micro is the floor: 8.5px uppercase was below
           what a phone at arm's length in daylight can resolve. */
        --pc-fs-micro: 10px;
        --pc-fs-xs: 11px;
        --pc-fs-sm: 12px;
        --pc-fs-md: 13px;
        --pc-fs-lg: 15px;
        --pc-fs-xl: 18px;
        --pc-fs-2xl: 22px;
        /* One step above the scale's old ceiling, added deliberately rather
           than as a loose pixel. Every other big number on the card sits inside
           a ring, which is what gives it its weight; the weather section's
           reading has no ring, so the numeral itself has to carry the hero
           role. 2xl at 22px reads as a chip beside the min/avg/max tiles. */
        --pc-fs-3xl: 40px;

        /* radius */
        --pc-r-hair: 2px;
        --pc-r-xs: 9px;
        --pc-r-sm: 11px;
        --pc-r-md: 14px;
        --pc-r-lg: 17px;
        --pc-r-xl: 20px;
        --pc-r-2xl: 26px;
        --pc-r-pill: 999px;

        /* surfaces, on a dark ground — three fills and one hairline */
        --pc-fill-1: rgba(255, 255, 255, 0.055);
        --pc-fill-2: rgba(255, 255, 255, 0.08);
        --pc-fill-3: rgba(255, 255, 255, 0.11);
        --pc-edge: rgba(255, 255, 255, 0.10);
`;

/* Define an element only once. If a standalone build of the same card is still
   registered as a dashboard resource, defining again would throw and take the
   whole bundle down — so warn instead, and say how to fix it. */
function pcDefine(name, cls) {
  if (customElements.get(name)) {
    console.warn(
      `[purdy-cards] <${name}> is already defined by another resource. ` +
      `Remove the standalone card's HACS entry and its dashboard resource — ` +
      `until then the older card wins and compact/ribbon modes will not work.`
    );
    return;
  }
  customElements.define(name, cls);
}

/* Navigate to a dashboard path or open a Bubble Card hash popup. */
function pcNavigate(node, path) {
  if (!path) return;
  if (path.charAt(0) === "#") {
    window.location.hash = path;
    return;
  }
  history.pushState(null, "", path);
  const ev = new Event("location-changed", { bubbles: true, composed: true });
  ev.detail = { replace: false };
  node.dispatchEvent(ev);
}

