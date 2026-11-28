/* Screenshot the harness with headless Chrome over CDP.
 *
 * Why CDP and not `chrome --screenshot`: that flag fires on a guessed delay, so
 * it photographs whatever happened to be on screen -- usually a half-loaded
 * view, which is the one thing this harness must never produce. The page sets
 * document.title to "READY ..." only once its fetches have settled, so we poll
 * for that and shoot then. It also reports what it could not draw, and those
 * notes are printed beside each shot so an image is never mistaken for a
 * complete one.
 *
 * Needs the server running:  node dev/shoot/server.mjs
 *
 *   node dev/shoot/shoot.mjs                       # every preset
 *   node dev/shoot/shoot.mjs phone desk            # named presets
 *   node dev/shoot/shoot.mjs --dpr 2 phone         # retina (4x the tokens)
 *   node dev/shoot/shoot.mjs --shot me:390x844:'tag=custom:purdy-shell-card&view=phone2&open=clim'
 *   node dev/shoot/shoot.mjs --js "$('#ps-alert').click(); return !!$('.ps-sheet')" desk2-1440
 *
 * TOKEN DIET. An image costs ~(w*h)/750 tokens to look at, so every line ends
 * with `~N tok`, and the cheap options come first:
 *   --text                 no PNG at all: status, notes, --js and --measure only
 *   --measure [sel]        heights of sel's children as text (default: the
 *                          phone column, Skylight's page, or the desk grid)
 *   --clip <sel>           photograph ONE element, not the whole viewport
 *   --js-file <path>       --js read from a file, so a probe is written once
 *   --quiet                print only BAD shots and their notes
 *   --shot name:390x844:@mockup.html   a local mockup file, same pipeline
 * The server is started for you if nothing answers on --base.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* Chrome, else any Playwright-cached Chrome for Testing (a Mac without Chrome
 * installed usually has one of those lying around). */
function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const sys = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (fs.existsSync(sys)) return sys;
  const pw = path.join(os.homedir(), "Library/Caches/ms-playwright");
  const dirs = fs.existsSync(pw) ? fs.readdirSync(pw).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) for (const arch of ["chrome-mac-arm64", "chrome-mac"]) {
    const p = path.join(pw, d, arch, "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
    if (fs.existsSync(p)) return p;
  }
  return sys;
}
const CHROME = findChrome();
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = flag("base", "http://127.0.0.1:8099");
const OUT = path.resolve(flag("out", path.join(os.homedir(), "purdy-shots")));
const DPR = Number(flag("dpr", 1));
const JS_FILE = flag("js-file", null);
const JS = JS_FILE ? fs.readFileSync(JS_FILE, "utf8") : flag("js", null);
const has = (k) => argv.includes("--" + k);
const CLIP = flag("clip", null);
const TEXT = has("text");
const QUIET = has("quiet");


const SHELL = "tag=custom:purdy-shell-card&view=phone2";
const PHONE = [390, 844];
const DESK = [1440, 900];
const D2 = "tag=custom:purdy-desk2-card&view=desk2";
const SKY = "tag=custom:purdy-sky-card&dash=skylight-phone&view=home";
/* One entry per thing worth looking at. Phone first: it is the view that ships. */
const PRESETS = {
  /* Section keys are the live config's: joel · clim · now · people · crew ·
   * ahead, plus the sheet_only music and lights. Systems is a MODE here, not a
   * section, so it is reached with mode= rather than open=. */
  phone:          [PHONE, SHELL],
  /* The living sky. The band comes off the wall clock, so three of the four
     are unphotographable at any one moment; `sky=` pins it in the harness so
     the palette can be reviewed without waiting twelve hours for dawn. */
  "phone-sky-dawn":  [PHONE, SHELL + "&sky=dawn"],
  "phone-sky-day":   [PHONE, SHELL + "&sky=day"],
  "phone-sky-dusk":  [PHONE, SHELL + "&sky=dusk"],
  "phone-sky-night": [PHONE, SHELL + "&sky=night"],
  "phone-joel":   [PHONE, SHELL + "&open=joel"],
  /* The header avatars and the sheet behind them. `patch=people` supplies the
     step sensors, which are not deployed yet — a section that is not deployed
     cannot be photographed, and deploying it to find out is the loop this
     replaces. `sheet=person` opens the sheet on _personPick's default, 0. */
  "phone-people":       [PHONE, SHELL + "&patch=people"],
  "phone-person":       [PHONE, SHELL + "&patch=people&sheet=person"],
  "phone-person-two":   [PHONE, SHELL + "&patch=people&sheet=person&person=1"],
  /* Correcting a session. The list with its long-press targets, then the sheet
     itself — which is opened by a press-and-hold, the one entry point a URL
     cannot express, so `napedit=` picks a session out of the card's own
     derived list. */
  /* Away from the sensors. The patch turns on the log and away stores before
     they are deployed, and `away=` is a live helper write away — so the away
     face is shot by writing the helper, not by a knob. */
  "phone-joellog":      [PHONE, SHELL + "&patch=joellog&open=joel&joellog=1"],
  "phone-joel-away":    [PHONE, SHELL + "&patch=joellog&open=joel"],
  "phone-napedit":      [PHONE, SHELL + "&patch=napedit&open=joel"],
  "phone-napedit-sheet":[PHONE, SHELL + "&patch=napedit&open=joel&napedit=last"],
  "phone-napedit-night":[PHONE, SHELL + "&patch=napedit&open=joel&napedit=night"],
  "phone-climate":[PHONE, SHELL + "&open=clim"],
  "phone-crew":   [PHONE, SHELL + "&open=crew"],
  /* The crew SHEET, which is where the vacuum panel actually lives — the
     column carries alerts only. The sheet opens with Jeeves expanded, so this
     is the one route that photographs tonight's mode switch and the deep-clean
     button. `patch=crew` supplies both blocks; a missing patch renders
     unpatched, which is the deployed section and still a valid shot. */
  "phone-crew-sheet": [PHONE, SHELL + "&patch=crew&sheet=crew"],
  /* The Body section against live Apple Health and Garmin data. Collapsed is
     three meters and a door; there is no open= face any more, because the
     expand became a MODE — four pages behind their own dock, each with its own
     slot below. The patch carries `$user`, without which the section is
     correctly invisible and every one of these shots is of an empty column. */
  "phone-health":         [PHONE, SHELL + "&patch=health"],
  "phone-health-today":   [PHONE, SHELL + "&patch=health&mode=health&hpage=today"],
  "phone-health-sleep":   [PHONE, SHELL + "&patch=health&mode=health&hpage=sleep"],
  "phone-health-heart":   [PHONE, SHELL + "&patch=health&mode=health&hpage=heart"],
  "phone-health-fitness": [PHONE, SHELL + "&patch=health&mode=health&hpage=fitness"],
  /* The same column with no `$user` — the section and its dock button both
     gone, which is the thing `visible_to` actually promises and the only way
     to see that the column closes over the gap rather than leaving one. */
  "phone-health-hidden":  [PHONE, SHELL + "&patch=health-hidden"],
  /* The weather rail, both faces and both sources. `patch=` previews the
     section against LIVE data before it is deployed — the whole point of
     shooting rather than releasing to find out.
     Face C moved the week behind a SHEET rather than an expand, so these are
     `sheet=wx`, not `open=wx`. An `open=` against a section that no longer
     expands is not an error — it photographs the collapsed face and looks
     exactly like the sheet failing to render. */
  "phone-weather":     [PHONE, SHELL + "&patch=weather&sheet=wx"],
  "phone-weather-fc":  [PHONE, SHELL + "&patch=weather&sheet=wx&wxrail=forecast"],
  "phone-weather-cold":[PHONE, SHELL + "&patch=weather"],
  /* The ground's precipitation layer. force: in the patch previews rain on a
     cloudy day — the effect is deliberately quiet in the common conditions, so
     waiting for real weather is not a verification strategy. */
  "phone-rain":     [PHONE, SHELL + "&patch=weather-fx"],
  "phone-rain-joel":[PHONE, SHELL + "&patch=weather-fx&open=joel"],
  lights:         [PHONE, SHELL + "&sheet=lights"],
  music:          [PHONE, SHELL + "&sheet=music"],
  /* The two faces of the media sheet. Both are worth a slot because they are
     the TALLEST things the card puts on screen, and the sheet's height is the
     one measurement that has now been got wrong twice. media= forces the face:
     Watch is unphotographable whenever the televisions are off. */
  "media-listen": [PHONE, SHELL + "&sheet=media&media=listen"],
  "media-watch":  [PHONE, SHELL + "&sheet=media&media=watch"],
  /* The remote driving the PANEL rather than the box. The mode is entered by
     a service call, which the harness refuses by construction, so `panel=1`
     writes the mounted card's own field instead — the hot key and the hint are
     otherwise unphotographable without sending a key to a real television. */
  "media-panel":  [PHONE, SHELL + "&sheet=media&media=watch&panel=1"],
  /* The volume rail. Drawn only for a television that is ON and only where a
     level exists behind it, so both halves come from the patch: `$states`
     switches a set on and gives it a reading, the config half puts
     `volume_player` on it. Without that the rail is photographable only on an
     evening when somebody happens to be watching. */
  "media-vol":    [PHONE, SHELL + "&sheet=media&media=watch&patch=tvvol"],
  alerts:         [PHONE, SHELL + "&sheet=alerts"],
  "sys-overview": [PHONE, SHELL + "&mode=systems&page=overview"],
  "sys-docker":   [PHONE, SHELL + "&mode=systems&page=docker"],
  "sys-storage":  [PHONE, SHELL + "&mode=systems&page=storage"],
  "sys-perf":     [PHONE, SHELL + "&mode=systems&page=perf"],
  "sys-alerts":   [PHONE, SHELL + "&mode=systems&page=alerts"],
  desk:           [DESK, "tag=custom:purdy-desk-card&view=desktop"],
  /* purdy-desk2-card, the desk as a subclass of the shell, rendered from the
     deployed desk2 view's own config. */
  "desk2-1280":   [[1280, 800],  D2],
  "desk2-1440":   [DESK,         D2],
  "desk2-1920":   [[1920, 1080], D2],
  "desk2-joel":   [DESK, D2 + "&sheet=joel"],
  "desk2-drawer-lights": [DESK, D2 + "&sheet=lights"],
  "desk2-drawer-media":  [DESK, D2 + "&sheet=media&media=watch"],
  "desk2-drawer-listen": [DESK, D2 + "&sheet=media&media=listen"],
  "desk2-drawer-crew":   [DESK, D2 + "&sheet=crew"],
  "desk2-drawer-alerts": [DESK, D2 + "&sheet=notifications"],
  "desk2-nas":    [DESK, D2 + "&mode=systems&page=overview"],
  "desk2-nas-docker":  [DESK, D2 + "&mode=systems&page=docker"],
  "desk2-nas-storage": [DESK, D2 + "&mode=systems&page=storage"],
  "desk2-nas-perf":    [DESK, D2 + "&mode=systems&page=perf"],
  "desk2-climate": [DESK, D2 + "&sheet=climate"],
  "desk2-wx":      [DESK, D2 + "&sheet=wx"],
  "desk2-short":   [[1400, 666], D2],
  /* Skylight, from its own dashboard. theme= pins the palette (the harness
     sets no HA dark mode), tab= the page, face= the Media face. */
  "sky-home":         [PHONE, SKY + "&theme=light"],
  "sky-home-dark":    [PHONE, SKY + "&theme=dark"],
  "sky-joel":         [PHONE, SKY + "&theme=light&tab=joel"],
  "sky-climate":      [PHONE, SKY + "&theme=light&tab=climate"],
  "sky-watch":        [PHONE, SKY + "&theme=light&tab=media&face=watch"],
  "sky-listen":       [PHONE, SKY + "&theme=light&tab=media&face=listen"],
  "sky-house":        [PHONE, SKY + "&theme=light&tab=house"],
  "sky-house-dark":   [PHONE, SKY + "&theme=dark&tab=house"],
  /* The Garage card on Home and its House row. patches/vehicle.json names the
     Garage sensors (see vehicle.example.json). */
  "sky-veh":          [PHONE, SKY + "&theme=light&patch=vehicle"],
  "sky-veh-dark":     [PHONE, SKY + "&theme=dark&patch=vehicle"],
  "sky-veh-house":    [PHONE, SKY + "&theme=light&tab=house&patch=vehicle"],
  /* Two vehicles: one Garage card, a House row each (patches/vehicle2.json). */
  "sky-veh2":         [PHONE, SKY + "&theme=light&patch=vehicle2"],
  "sky-veh2-dark":    [PHONE, SKY + "&theme=dark&patch=vehicle2"],
  "sky-veh2-house":   [PHONE, SKY + "&theme=light&tab=house&patch=vehicle2"],
  "sky-house-multi":  [PHONE, SKY + "&theme=light&tab=house&patch=vacmulti"],
  "sky-house-multi2": [PHONE, SKY + "&theme=light&tab=house&patch=vacmulti&vacpick=" + encodeURIComponent("1F - Kitchen|1F - Living Room")],
  "sky-nas":          [PHONE, SKY + "&theme=light&mode=systems&page=overview"],
  "sky-nas-docker":   [PHONE, SKY + "&theme=light&mode=systems&page=docker"],
  "sky-nas-storage":  [PHONE, SKY + "&theme=light&mode=systems&page=storage"],
  "sky-alerts":       [PHONE, SKY + "&theme=light&sheet=alerts"],
  "sky-notes":        [PHONE, SKY + "&theme=light&sheet=notifications"],
  "desk-weather": [DESK, "tag=custom:purdy-desk-card&view=desktop&patch=weather-desk"],
};

/* --measure takes an optional selector; a following preset name is not one. */
const MEASURE = has("measure") ? (() => {
  const v = argv[argv.indexOf("--measure") + 1];
  return v && !v.startsWith("--") && !PRESETS[v] ? v : "";
})() : null;
const named = argv.filter((a) => !a.startsWith("--") && PRESETS[a]);
const tok = (w, h) => Math.ceil((w * DPR) * (h * DPR) / 750);
const custom = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "--shot") continue;
  const [name, size, ...rest] = argv[i + 1].split(":");
  const [w, h] = size.split("x").map(Number);
  custom.push([name, [w, h], rest.join(":")]);
}
const shots = custom.length || named.length
  ? [...named.map((n) => [n, ...PRESETS[n]]), ...custom]
  : Object.entries(PRESETS).map(([n, v]) => [n, ...v]);

/* --- the server ---------------------------------------------------------- */
/* Start it if nothing answers, detached so the next run reuses it; and say so
 * when the one answering serves a different bundle than this run would. */
async function ensureServer() {
  const info = async () => (await fetch(BASE + "/h/info")).json();
  let i = await info().catch(() => null);
  if (!i) {
    if (!/127\.0\.0\.1:8099$|localhost:8099$/.test(BASE)) {
      console.error(`harness server is not answering on ${BASE}`); process.exit(1);
    }
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/%20/g, " "));
    const log = path.join(os.tmpdir(), "purdy-shoot-server.log");
    const out = fs.openSync(log, "a");
    /* --env / --url pass through: a clone in a scratchpad has no .env above it. */
    const pass = ["env", "url"].flatMap((k) => flag(k, null) ? ["--" + k, flag(k, null)] : []);
    spawn(process.execPath, [path.join(here, "server.mjs"), ...pass], { detached: true, stdio: ["ignore", out, out] }).unref();
    for (let n = 0; n < 40 && !i; n++) { await sleep(250); i = await info().catch(() => null); }
    if (!i) { console.error("server did not start — see " + log); process.exit(1); }
    console.log(`  (started server, log ${log})`);
  }
  if (!i.bundle) return; /* an older server without /h/info */
  const mine = path.resolve("purdy-cards.js");
  if (fs.existsSync(mine) && path.resolve(i.bundle) !== mine)
    console.log(`  WARNING server is serving ${i.bundle}\n          not ${mine} — pkill -f dev/shoot/server.mjs to switch`);
}

/* --- minimal CDP client --------------------------------------------------- */
let ws, msgId = 0;
const pending = new Map();
const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++msgId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  setTimeout(() => { if (pending.delete(id)) reject(new Error("cdp timeout: " + method)); }, 30000);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!fs.existsSync(CHROME)) { console.error("no Chrome at " + CHROME + " (set CHROME_BIN)"); process.exit(1); }
  await ensureServer();

  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "purdy-shoot-"));
  const port = 9500 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none",
    "about:blank",
  ], { stdio: "ignore" });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch {}
  }
  if (!wsUrl) { chrome.kill(); console.error("Chrome never opened a debugging port"); process.exit(1); }

  ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  });

  const { targetId } = await cdp("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true });
  await cdp("Page.enable", {}, sessionId);
  await cdp("Runtime.enable", {}, sessionId);

  const results = [];
  let warnedInsets = false;
  for (const [name, [w, h], query] of shots) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: w, height: h, deviceScaleFactor: DPR, mobile: w < 700,
    }, sessionId);
    /* The phone's safe-area insets, or the harness photographs a screen that
     * does not exist. Every fixed layer on this card positions itself against
     * env(safe-area-inset-*), and with those all zero the arithmetic comes out
     * ~93px kinder than the real thing: the media sheet measured a 22px gap
     * above its header here while sitting 12px OFF THE TOP of a real iPhone,
     * with the status bar over what was left. A bug the harness is blind to is
     * worse than one it merely renders badly, so the insets are emulated on
     * every phone-sized shot. 59/34 is the notched iPhone; a desk shot gets
     * none, which is also what a desktop reports.
     * Chrome added this command relatively recently — an older build simply
     * shoots without insets rather than failing the whole run. */
    await cdp("Emulation.setSafeAreaInsetsOverride", {
      insets: w < 700 ? { top: 59, left: 0, bottom: 34, right: 0 }
                      : { top: 0, left: 0, bottom: 0, right: 0 },
    }, sessionId).catch((e) => {
      if (!warnedInsets) console.log("  (no safe-area emulation in this Chrome: " + e.message + ")");
      warnedInsets = true;
    });
    /* `@file.html` is a local mockup: same viewport, insets, clip and measure,
     * but no READY signal, so it waits for load plus a beat for fonts. */
    const isFile = query.startsWith("@");
    const url = isFile ? "file://" + path.resolve(query.slice(1)) : `${BASE}/?${query}`;
    await cdp("Page.navigate", { url }, sessionId);

    /* Wait for the page's own signal, not a delay of our choosing. */
    let title = "", ok = false;
    if (isFile) {
      for (let i = 0; i < 40; i++) {
        await sleep(150);
        const r = await cdp("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }, sessionId);
        if (r.result && r.result.value === "complete") { ok = true; break; }
      }
      await cdp("Runtime.evaluate", { expression: "document.fonts && document.fonts.ready.then(() => 1)", awaitPromise: true }, sessionId).catch(() => {});
      title = "file " + path.basename(query.slice(1));
    }
    for (let i = 0; !isFile && i < 160; i++) {
      await sleep(250);
      const r = await cdp("Runtime.evaluate", { expression: "document.title", returnByValue: true }, sessionId);
      title = (r.result && r.result.value) || "";
      if (/^READY|^ERROR/.test(title)) { ok = title.startsWith("READY"); break; }
    }
    /* `--js` drives the page after READY and before the shot: a click on a
     * real control exercises the real handler, which a preset that writes the
     * card's fields directly never does. Its return value is printed, so an
     * assertion can ride along for free. The expression may be async. */
    if (JS) {
      const r = await cdp("Runtime.evaluate", {
        expression: `(async () => { const c = window.__card, R = (c && c.shadowRoot) || document, $ = (s) => R.querySelector(s); ${JS} })()`,
        awaitPromise: true, returnByValue: true,
      }, sessionId).catch((e) => ({ exceptionDetails: { text: e.message } }));
      await sleep(600);
      const v = r.exceptionDetails ? "THREW " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)
        : JSON.stringify(r.result && r.result.value);
      console.log(`  js ${name}: ${String(v).slice(0, 4000)}`);
    }
    const notesRes = await cdp("Runtime.evaluate", {
      expression: "JSON.stringify(typeof notes!=='undefined'?notes:[])", returnByValue: true,
    }, sessionId).catch(() => null);
    const notes = JSON.parse((notesRes && notesRes.result && notesRes.result.value) || "[]");

    /* Heights as text: what the throwaway CDP probes used to be written for.
     * Each child is named by its id, else its first class, else its tag. */
    let measured = null;
    if (MEASURE !== null) {
      const r = await cdp("Runtime.evaluate", { returnByValue: true, expression: `(() => {
        const c = window.__card, R = (c && c.shadowRoot) || document;
        const sel = ${JSON.stringify(MEASURE)} || ["#ps-col", ".sk-view.on .sk-stack", "#pd-grid", "main", "body"].find((s) => { const e = R.querySelector(s); return e && e.getBoundingClientRect().height > 0; });
        const el = sel && R.querySelector(sel);
        if (!el) return "no " + (sel || "default container");
        const nm = (e) => e.id ? "#" + e.id
          : e.dataset.sect || e.dataset.skc || e.dataset.key
          || ((typeof e.className === "string" && e.className.trim()) ? "." + e.className.trim().split(" ")[0] : e.tagName.toLowerCase());
        const kids = [...el.children].filter((e) => e.getBoundingClientRect().height > 0)
          .map((e) => nm(e) + " " + Math.round(e.getBoundingClientRect().height));
        return sel + " " + Math.round(el.getBoundingClientRect().height) + "px: " + kids.join(" · ");
      })()` }, sessionId).catch((e) => ({ result: { value: "THREW " + e.message } }));
      measured = r.result && r.result.value;
    }

    /* --clip scrolls the element into view and photographs only its box.
     * Taller than the viewport is cut at the viewport, and says so. */
    let file = null, cw = w, ch = h, clipNote = null;
    if (!TEXT) {
      let clip;
      if (CLIP) {
        const r = await cdp("Runtime.evaluate", { returnByValue: true, expression: `(() => {
          const c = window.__card, R = (c && c.shadowRoot) || document, el = R.querySelector(${JSON.stringify(CLIP)});
          if (!el) return null;
          /* centred when it fits, so a fixed header does not paint over its top */
          el.scrollIntoView({ block: el.getBoundingClientRect().height < innerHeight * 0.7 ? "center" : "start" });
          return new Promise((ok) => setTimeout(() => { const b = el.getBoundingClientRect();
            ok({ x: b.left, y: b.top, width: b.width, height: b.height, sx: scrollX, sy: scrollY }); }, 250));
        })()`, awaitPromise: true }, sessionId).catch(() => null);
        const b = r && r.result && r.result.value;
        if (!b) clipNote = `no ${CLIP} — full viewport`;
        else {
          const x = Math.max(0, b.x), y = Math.max(0, b.y);
          const cwid = Math.min(w - x, b.width), chgt = Math.min(h - y, b.height);
          if (chgt < b.height - 1) clipNote = `clip cut at viewport (${Math.round(b.height)}px tall)`;
          /* CDP's clip is in DOCUMENT coordinates: add the scroll back. */
          clip = { x: x + b.sx, y: y + b.sy, width: Math.max(1, cwid), height: Math.max(1, chgt), scale: 1 };
          cw = Math.round(clip.width); ch = Math.round(clip.height);
        }
      }
      const shot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, ...(clip ? { clip } : {}) }, sessionId);
      file = path.join(OUT, `${name}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    }

    results.push({ name, ok, title, notes, file });
    if (!QUIET || !ok) {
      const cost = TEXT ? "text" : `${cw}x${ch} ~${tok(cw, ch)} tok`;
      console.log(`${ok ? "ok  " : "BAD "} ${name.padEnd(14)} ${String(w).padStart(4)}x${h}  ${cost}  ${title.replace(/^READY \S+ \d+x\d+ /, "").slice(0, 60)}`);
    }
    if (clipNote) console.log(`       · ${clipNote}`);
    if (measured) console.log(`       ⇕ ${measured}`);
    if (!QUIET || !ok) for (const n of notes) console.log(`       · ${n}`);
  }

  const { refused } = await (await fetch(BASE + "/h/refused")).json();
  if (refused.length) {
    console.log("\nrefused by the read-only harness (expected — nothing was written):");
    for (const r of [...new Set(refused)]) console.log("  · " + r);
  }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} shots${TEXT ? "" : "  ->  " + OUT}`);

  ws.close(); chrome.kill();
  /* Chrome writes to its profile as it exits, so a rm straight after kill()
   * loses a race with it. The temp dir is disposable either way. */
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
main();
