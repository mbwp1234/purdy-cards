/* Visual render harness for the purdy-cards bundle.
 *
 * WHY THIS EXISTS
 * The text harness (render each page to stripped text) catches data bugs and
 * has caught plenty. It cannot catch the other half: a label clipped to
 * "LIVIN...", a graph that eats a third of the screen, a contrast floor, a row
 * that wraps. Those shipped past 950 assertions AND past the text render, twice
 * (desk v1.48.1, nursery v1.39.1). This serves the real bundle to a real
 * browser at a real viewport so a screenshot can find them BEFORE a release.
 *
 * READ-ONLY BY CONSTRUCTION. It points at the live house, so it must never be
 * able to change it:
 *   - callService is refused in the page and never reaches the network.
 *   - the REST proxy allows GET only, on an allowlist of paths.
 *   - the websocket bridge allows an allowlist of read-only commands, so a
 *     stray _syncLog() cannot append to todo.notification_center.
 * Everything refused is logged, so a screenshot is never quietly missing data.
 *
 * No credentials live here: HOMEASSISTANT_URL / HOMEASSISTANT_TOKEN are read
 * from a .env found by walking up from cwd, and are never served to the page.
 *
 *   node dev/shoot/server.mjs [--port 8099] [--bundle path] [--env path]
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

/* fileURLToPath, not url.pathname: this project lives under a directory with a
 * space in it, and pathname keeps it percent-encoded ("Claude%20Home"), which
 * then fails to open with a 500 that looks like a missing file. */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(arg("port", 8099));

/* --- credentials: walk up for a .env that actually has them --------------- */
function findEnv(start) {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    const p = path.join(dir, ".env");
    if (fs.existsSync(p) && /HOMEASSISTANT_URL/.test(fs.readFileSync(p, "utf8"))) return p;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}
const envPath = arg("env", findEnv(process.cwd()));
if (!envPath) {
  console.error("no .env with HOMEASSISTANT_URL found above " + process.cwd() + " — pass --env");
  process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const HA = (env.HOMEASSISTANT_URL || "").replace(/\/+$/, "");
const TOKEN = env.HOMEASSISTANT_TOKEN;
if (!HA || !TOKEN) { console.error("env is missing HOMEASSISTANT_URL or HOMEASSISTANT_TOKEN"); process.exit(1); }

/* --- bundle --------------------------------------------------------------- */
function findBundle() {
  const cli = arg("bundle", null);
  if (cli) return path.resolve(cli);
  for (const c of [path.join(process.cwd(), "purdy-cards.js"), path.resolve(HERE, "../../purdy-cards.js")])
    if (fs.existsSync(c)) return c;
  return null;
}
const BUNDLE = findBundle();
if (!BUNDLE) { console.error("purdy-cards.js not found — pass --bundle"); process.exit(1); }

/* --- what the harness is allowed to ask HA for ---------------------------- */
/* A screenshot needs to READ. Anything that writes is a bug in the harness,
 * not a feature of it, so the refusal is here rather than in the page. */
const REST_OK = [/^history\/period\//, /^calendars(\/|$)/, /^states$/, /^states\//, /^template$/];
const WS_OK = new Set([
  "lovelace/config",
  "gttc/get_schedule",
  "gttc/list_window_sensors",
  "todo/item/list",
  "config/entity_registry/list",
  "config/area_registry/list",
]);
/* Services that only ANSWER. music_assistant.search and get_queue are how the
 * music sheet gets its results and its up-next line, so refusing them would
 * photograph an empty sheet and call it a layout. They change nothing. */
const SERVICE_OK = new Set([
  "music_assistant.get_queue",
  "music_assistant.search",
  "music_assistant.get_library",
  "weather.get_forecasts",
  "calendar.get_events",
  "todo.get_items",
]);
const refused = [];
const noteRefusal = (what) => {
  refused.push(what);
  console.log("  refused (read-only harness): " + what);
};

/* --- websocket bridge ----------------------------------------------------- */
/* One connection, multiplexed by id. HA's handshake is auth_required -> auth
 * -> auth_ok before any command is accepted. */
class HaWs {
  constructor() { this._id = 1; this._pending = new Map(); this._conn = null; }
  ready() { return (this._conn ||= this._connect()); }
  _connect() {
    const url = HA.replace(/^http/, "ws") + "/api/websocket";
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const fail = (e) => { this._conn = null; reject(e); };
      ws.addEventListener("error", fail);
      ws.addEventListener("close", () => { this._conn = null; });
      ws.addEventListener("message", (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
        if (m.type === "auth_ok") { this.ws = ws; return resolve(ws); }
        if (m.type === "auth_invalid") return fail(new Error("HA rejected the token"));
        const p = this._pending.get(m.id);
        if (!p) return;
        this._pending.delete(m.id);
        m.success === false ? p.reject(new Error(m.error && m.error.message || "ws error")) : p.resolve(m.result);
      });
    });
  }
  async send(msg) {
    if (!WS_OK.has(msg.type)) { noteRefusal("ws " + msg.type); throw new Error("blocked by harness: " + msg.type); }
    const ws = await this.ready();
    const id = this._id++;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ ...msg, id }));
      setTimeout(() => { if (this._pending.delete(id)) reject(new Error("ws timeout: " + msg.type)); }, 15000);
    });
  }
}
const haws = new HaWs();

/* --- icons ---------------------------------------------------------------- */
/* <ha-icon> is HA's, so outside HA it is a zero-size unknown element and every
 * row measures too narrow. @mdi/js (dev-only, --no-save) supplies the real
 * paths; without it the page draws correctly-sized placeholders instead, which
 * keeps the layout honest even when the glyphs are not. */
let mdi = null, mdiTried = false;
async function iconMap(requested) {
  if (!mdiTried) {
    mdiTried = true;
    try { mdi = await import("@mdi/js"); }
    catch { console.log("  @mdi/js not installed — placeholder icons (npm i --no-save @mdi/js)"); }
  }
  /* The bundle hardcodes plenty of icons the config never mentions, so scan it
   * too rather than trusting the caller's list. */
  const fromBundle = fs.readFileSync(BUNDLE, "utf8").match(/mdi:[a-z0-9-]+/g) || [];
  const names = [...new Set([...(requested || []), ...fromBundle])].filter(Boolean);
  const icons = {}, missing = [];
  for (const n of names) {
    const key = "mdi" + n.slice(4).replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
    const d = mdi && mdi[key];
    d ? (icons[n] = d) : missing.push(n);
  }
  return { icons, missing, source: mdi ? "@mdi/js" : "none" };
}

/* --- helpers -------------------------------------------------------------- */
const send = (res, code, type, body) => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
};
const json = (res, code, obj) => send(res, code, "application/json", JSON.stringify(obj));
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });

async function haRest(method, apiPath) {
  const r = await fetch(`${HA}/api/${apiPath}`, { headers: { authorization: "Bearer " + TOKEN } });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

/* Pull one card's config straight out of Lovelace, so the harness renders what
 * is actually deployed rather than a copy that can drift from it. */
async function cardConfig(view, tag, index) {
  const cfg = await haws.send({ type: "lovelace/config", url_path: null });
  const v = (cfg.views || []).find((x) => x.path === view) || (cfg.views || [])[Number(view) || 0];
  if (!v) throw new Error("no view " + view);
  const cards = v.cards || [];
  const hits = cards.filter((c) => c.type === tag);
  const picked = index != null ? cards[Number(index)] : hits[0];
  if (!picked) throw new Error(`no ${tag} in view ${view} (found: ${cards.map((c) => c.type).join(", ")})`);
  return picked;
}

/* --- routes --------------------------------------------------------------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  try {
    if (u.pathname === "/" || u.pathname === "/index.html")
      return send(res, 200, "text/html; charset=utf-8", fs.readFileSync(path.join(HERE, "harness.html"), "utf8"));

    if (u.pathname === "/purdy-cards.js")
      return send(res, 200, "text/javascript; charset=utf-8", fs.readFileSync(BUNDLE, "utf8"));

    if (u.pathname === "/h/states") {
      const r = await haRest("GET", "states");
      return send(res, r.status, "application/json", r.text);
    }

    if (u.pathname === "/h/config") {
      const cfg = await cardConfig(u.searchParams.get("view") || "phone2",
        u.searchParams.get("tag") || "custom:purdy-shell-card",
        u.searchParams.get("index"));
      return json(res, 200, cfg);
    }

    /* entity_picture_local is an absolute /api/... path, so the page requests it
     * from US, not from HA. Without this every avatar and every piece of album
     * art is a broken image -- and artwork is a big part of what a music or
     * people row LOOKS like, so the screenshot would be judging a layout that
     * does not exist. Images only, and GET only. */
    if (u.pathname.startsWith("/api/")) {
      const p = u.pathname.slice(5) + (u.search || "");
      const isImage = /^(image\/|media_player_proxy\/|camera_proxy\/|tts_proxy\/|person\/)/.test(p);
      if (req.method !== "GET" || !isImage) { noteRefusal(`${req.method} /api/${p}`); return send(res, 403, "text/plain", "read-only harness"); }
      const r = await fetch(`${HA}/api/${p}`, { headers: { authorization: "Bearer " + TOKEN } });
      const buf = Buffer.from(await r.arrayBuffer());
      return send(res, r.status, r.headers.get("content-type") || "application/octet-stream", buf);
    }

    if (u.pathname === "/h/icons")
      return json(res, 200, await iconMap((u.searchParams.get("names") || "").split(",")));

    if (u.pathname === "/h/api" && req.method === "POST") {
      const { method = "GET", path: p = "" } = JSON.parse(await readBody(req) || "{}");
      if (method !== "GET") { noteRefusal(`${method} /api/${p}`); return json(res, 403, { error: "read-only harness" }); }
      if (!REST_OK.some((re) => re.test(p))) { noteRefusal("GET /api/" + p); return json(res, 403, { error: "path not allowlisted" }); }
      const r = await haRest("GET", p);
      return send(res, r.status, "application/json", r.text);
    }

    if (u.pathname === "/h/service" && req.method === "POST") {
      const { domain, service, data } = JSON.parse(await readBody(req) || "{}");
      const key = `${domain}.${service}`;
      if (!SERVICE_OK.has(key)) { noteRefusal("service " + key); return json(res, 403, { error: "not a read-only service" }); }
      const r = await fetch(`${HA}/api/services/${domain}/${service}?return_response`, {
        method: "POST",
        headers: { authorization: "Bearer " + TOKEN, "content-type": "application/json" },
        body: JSON.stringify(data || {}),
      });
      const out = await r.json().catch(() => ({}));
      return json(res, r.status, { response: out.service_response ?? out });
    }

    if (u.pathname === "/h/ws" && req.method === "POST") {
      const msg = JSON.parse(await readBody(req) || "{}");
      try { return json(res, 200, { result: await haws.send(msg) }); }
      catch (e) { return json(res, 200, { error: String(e.message || e) }); }
    }

    /* The page reports what it refused and what it could not draw, so the
     * console is one place to check a screenshot's provenance. */
    if (u.pathname === "/h/note" && req.method === "POST") {
      const b = JSON.parse(await readBody(req) || "{}");
      console.log("  page: " + (b.text || ""));
      return json(res, 200, { ok: true });
    }

    if (u.pathname === "/h/refused") return json(res, 200, { refused });

    return send(res, 404, "text/plain", "not found");
  } catch (e) {
    console.error("  500 " + u.pathname + ": " + (e && e.stack || e));
    return json(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`harness  http://127.0.0.1:${PORT}/`);
  console.log(`bundle   ${BUNDLE}`);
  console.log(`HA       ${HA.replace(/\/\/([^@/]*@)?/, "//")}  (read-only)`);
  console.log("");
  console.log(`  phone   http://127.0.0.1:${PORT}/?tag=custom:purdy-shell-card&view=phone2`);
  console.log(`  desk    http://127.0.0.1:${PORT}/?tag=custom:purdy-desk-card&view=desk`);
  console.log(`  systems http://127.0.0.1:${PORT}/?tag=custom:purdy-shell-card&view=phone2&mode=systems`);
  console.log("");
});
