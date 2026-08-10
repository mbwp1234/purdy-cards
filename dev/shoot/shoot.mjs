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
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_BIN
  || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = flag("base", "http://127.0.0.1:8099");
const OUT = path.resolve(flag("out", path.join(os.homedir(), "purdy-shots")));
const DPR = Number(flag("dpr", 1));

const SHELL = "tag=custom:purdy-shell-card&view=phone2";
const PHONE = [390, 844];
const DESK = [1440, 900];
/* One entry per thing worth looking at. Phone first: it is the view that ships. */
const PRESETS = {
  /* Section keys are the live config's: joel · clim · now · people · crew ·
   * ahead, plus the sheet_only music and lights. Systems is a MODE here, not a
   * section, so it is reached with mode= rather than open=. */
  phone:          [PHONE, SHELL],
  "phone-joel":   [PHONE, SHELL + "&open=joel"],
  /* Correcting a session. The list with its long-press targets, then the sheet
     itself — which is opened by a press-and-hold, the one entry point a URL
     cannot express, so `napedit=` picks a session out of the card's own
     derived list. */
  "phone-napedit":      [PHONE, SHELL + "&patch=napedit&open=joel"],
  "phone-napedit-sheet":[PHONE, SHELL + "&patch=napedit&open=joel&napedit=last"],
  "phone-napedit-night":[PHONE, SHELL + "&patch=napedit&open=joel&napedit=night"],
  "phone-climate":[PHONE, SHELL + "&open=clim"],
  "phone-crew":   [PHONE, SHELL + "&open=crew"],
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
     shooting rather than releasing to find out. */
  "phone-weather":     [PHONE, SHELL + "&patch=weather&open=wx"],
  "phone-weather-fc":  [PHONE, SHELL + "&patch=weather&open=wx&wxrail=forecast"],
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
  alerts:         [PHONE, SHELL + "&sheet=alerts"],
  "sys-overview": [PHONE, SHELL + "&mode=systems&page=overview"],
  "sys-docker":   [PHONE, SHELL + "&mode=systems&page=docker"],
  "sys-storage":  [PHONE, SHELL + "&mode=systems&page=storage"],
  "sys-perf":     [PHONE, SHELL + "&mode=systems&page=perf"],
  "sys-alerts":   [PHONE, SHELL + "&mode=systems&page=alerts"],
  desk:           [DESK, "tag=custom:purdy-desk-card&view=desktop"],
  "desk-weather": [DESK, "tag=custom:purdy-desk-card&view=desktop&patch=weather-desk"],
};

const named = argv.filter((a) => !a.startsWith("--") && PRESETS[a]);
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
  try { await fetch(BASE + "/h/refused"); }
  catch { console.error(`harness server is not answering on ${BASE}\nstart it:  node dev/shoot/server.mjs`); process.exit(1); }

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
    const url = `${BASE}/?${query}`;
    await cdp("Page.navigate", { url }, sessionId);

    /* Wait for the page's own signal, not a delay of our choosing. */
    let title = "", ok = false;
    for (let i = 0; i < 160; i++) {
      await sleep(250);
      const r = await cdp("Runtime.evaluate", { expression: "document.title", returnByValue: true }, sessionId);
      title = (r.result && r.result.value) || "";
      if (/^READY|^ERROR/.test(title)) { ok = title.startsWith("READY"); break; }
    }
    const notesRes = await cdp("Runtime.evaluate", {
      expression: "JSON.stringify(typeof notes!=='undefined'?notes:[])", returnByValue: true,
    }, sessionId).catch(() => null);
    const notes = JSON.parse((notesRes && notesRes.result && notesRes.result.value) || "[]");

    const shot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));

    results.push({ name, ok, title, notes, file });
    console.log(`${ok ? "ok  " : "BAD "} ${name.padEnd(14)} ${String(w).padStart(4)}x${h}  ${title.slice(0, 72)}`);
    for (const n of notes) console.log(`       · ${n}`);
  }

  const { refused } = await (await fetch(BASE + "/h/refused")).json();
  if (refused.length) {
    console.log("\nrefused by the read-only harness (expected — nothing was written):");
    for (const r of [...new Set(refused)]) console.log("  · " + r);
  }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} shots  ->  ${OUT}`);

  ws.close(); chrome.kill();
  /* Chrome writes to its profile as it exits, so a rm straight after kill()
   * loses a race with it. The temp dir is disposable either way. */
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
main();
