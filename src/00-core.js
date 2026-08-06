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
 * No build step, no dependencies — plain web components.
 * https://github.com/mbwp1234/purdy-cards
 */

const PC_VERSION = "1.12.0";

/* Shared design tokens. Every card derives its own prefixed variables from
   these, so a colour or radius changes in exactly one place. */
const PC_TOKENS = `
        --pc-panel: var(--ha-card-background, var(--card-background-color, #181f26));
        --pc-panel-2: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.07);
        --pc-line: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.10);
        --pc-track: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.12);
        --pc-chip: rgba(var(--rgb-primary-text-color, 230, 236, 242), 0.08);
        --pc-text: var(--primary-text-color, #e6ecf2);
        --pc-muted: var(--secondary-text-color, #8b96a3);
        --pc-heat: #ff9557;
        --pc-cool: #4dd0e1;
        --pc-good: #81c995;
        --pc-warn: #f2c14e;
        --pc-bad: #ef6a6a;
        --pc-radius: 24px;
        /* The cool wash across the top of a panel, lifted from the climate
           card's weather strip so every panel opens the same way. */
        --pc-tint: rgba(77, 208, 225, 0.10);
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

