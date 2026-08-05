/* Concatenates src/ into purdy-cards.js.
 *
 * The bundle is a single file because HACS serves one file, not because the
 * source should be one. Edit src/, then run: node build.mjs
 */
import fs from "fs";
import path from "path";

const SRC = "src";
const OUT = "purdy-cards.js";

const parts = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith(".js"))
  .sort();                       // numeric prefixes define load order

if (!parts.length) {
  console.error("no sources in " + SRC);
  process.exit(1);
}

const body = parts.map((f) => fs.readFileSync(path.join(SRC, f), "utf8")).join("");
fs.writeFileSync(OUT, body);

const version = (/const PC_VERSION = "([^"]+)"/.exec(body) || [])[1] || "?";
console.log(`built ${OUT}  v${version}  ${parts.length} parts  ${body.split("\n").length} lines`);
