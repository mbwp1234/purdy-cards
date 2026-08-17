/* Concatenates src/ into purdy-cards.js, and strips the JS comments on the way.
 *
 * The bundle is a single file because HACS serves one file, not because the
 * source should be one. Edit src/, then run: node build.mjs
 *
 * WHY THE STRIP. The comments in src/ are the best thing in this repo — they are
 * where every "only a render against live data caught this" lives, and none of
 * them are coming out. But they are 27% of a 1MB file that a phone downloads
 * before it can draw anything, and a comment explaining a bug to a reader is of
 * no use to a browser. So they stay in src/ and do not ship.
 *
 * `node build.mjs --keep-comments` emits the unstripped bundle, which is what to
 * reach for when a stack trace from a phone needs reading against the shipped
 * file rather than against src/.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";

const SRC = "src";
const OUT = "purdy-cards.js";
const KEEP = process.argv.includes("--keep-comments");

/* Strip JS comments, knowing where the parser would be.
 *
 * A regex strip corrupts this bundle. ~160KB of it is CSS living inside template
 * literals, and a `/*` inside a string is string CONTENT, not a comment — as is
 * the `//` in a URL. So this walks one character at a time and tracks context:
 * plain code, single/double-quoted string, template literal, `${}` inside a
 * template literal (which may itself contain any of the above), and regex
 * literal.
 *
 * Template literals are left BYTE-IDENTICAL. CSS comments inside them are
 * another 14KB gzipped, and taking them would mean rewriting the strings the
 * browser actually parses to save 8% — the wrong side of that trade for a file
 * that runs a house.
 *
 * Newlines inside a block comment are preserved, so every line number in the
 * stripped bundle still matches src/ and a stack trace stays readable.
 */
function stripComments(s) {
  let out = "";
  let i = 0;
  const n = s.length;
  /* One entry per open template literal. `inString` says whether we are in its
     text or inside a `${...}`; `depth` is the brace depth the `${` opened at, so
     the matching `}` is unambiguous. */
  const tmpl = [];
  let braceDepth = 0;
  let prev = "";                       // last significant char, for regex-vs-division

  const prevWord = () => {
    const m = /([A-Za-z0-9_$]+)\s*$/.exec(out);
    return m ? m[1] : "";
  };
  /* A `/` opens a regex unless what precedes it could end an expression. */
  const REGEX_OK_AFTER_WORD = [
    "return", "typeof", "instanceof", "in", "of", "new", "delete",
    "void", "case", "do", "else", "yield", "await",
  ];

  while (i < n) {
    const c = s[i];
    const c2 = s[i + 1];

    /* --- inside a template literal's text --- */
    if (tmpl.length && tmpl[tmpl.length - 1].inString) {
      if (c === "\\") { out += c + (c2 || ""); i += 2; continue; }
      if (c === "`") { tmpl.pop(); out += c; prev = c; i++; continue; }
      if (c === "$" && c2 === "{") {
        const t = tmpl[tmpl.length - 1];
        t.inString = false;
        t.depth = braceDepth;
        braceDepth++;
        out += "${"; prev = "{"; i += 2; continue;
      }
      out += c; i++; continue;
    }

    /* --- code --- */
    if (c === "`") { tmpl.push({ inString: true, depth: braceDepth }); out += c; prev = c; i++; continue; }

    if (c === '"' || c === "'") {
      const q = c;
      out += c; i++;
      while (i < n) {
        if (s[i] === "\\") { out += s[i] + (s[i + 1] || ""); i += 2; continue; }
        if (s[i] === q) { out += s[i]; i++; break; }
        out += s[i]; i++;
      }
      prev = q;
      continue;
    }

    if (c === "{") { braceDepth++; out += c; prev = c; i++; continue; }
    if (c === "}") {
      braceDepth--;
      const t = tmpl[tmpl.length - 1];
      if (t && !t.inString && braceDepth === t.depth) t.inString = true;
      out += c; prev = c; i++; continue;
    }

    if (c === "/" && c2 === "/") {
      while (i < n && s[i] !== "\n") i++;      // leave the newline itself
      continue;
    }

    if (c === "/" && c2 === "*") {
      const end = s.indexOf("*/", i + 2);
      if (end < 0) break;                      // unterminated: drop the tail
      out += "\n".repeat(s.slice(i, end + 2).split("\n").length - 1);
      i = end + 2;
      continue;
    }

    if (c === "/") {
      const w = prevWord();
      const couldEndExpression = /[A-Za-z0-9_$)\]]/.test(prev)
        && !(w && REGEX_OK_AFTER_WORD.includes(w));
      if (couldEndExpression) { out += c; prev = c; i++; continue; }   // division
      out += c; i++;                                                   // regex literal
      let inClass = false;
      while (i < n) {
        const d = s[i];
        if (d === "\\") { out += d + (s[i + 1] || ""); i += 2; continue; }
        if (d === "\n") break;
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) { out += d; i++; break; }
        out += d; i++;
      }
      while (i < n && /[a-z]/.test(s[i])) { out += s[i]; i++; }        // flags
      prev = "/";
      continue;
    }

    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

const parts = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith(".js"))
  .sort();                       // numeric prefixes define load order

if (!parts.length) {
  console.error("no sources in " + SRC);
  process.exit(1);
}

const body = parts.map((f) => fs.readFileSync(path.join(SRC, f), "utf8")).join("");
const version = (/const PC_VERSION = "([^"]+)"/.exec(body) || [])[1] || "?";

/* A stripped file still has to say what it is and where the readable copy
   lives — it is served from a CDN path and read by whoever finds it there. */
const banner = `/* Purdy Cards v${version} — https://github.com/mbwp1234/purdy-cards
 * Generated by build.mjs from src/. Comments are stripped here and kept there;
 * read src/ rather than this file. Line numbers match src/ concatenated.
 */
`;

const outBody = KEEP ? body : banner + stripComments(body);
fs.writeFileSync(OUT, outBody);

const gz = (x) => zlib.gzipSync(Buffer.from(x)).length;
const kb = (x) => (x / 1024).toFixed(0) + "KB";
const note = KEEP
  ? "comments kept"
  : `${kb(body.length)}→${kb(outBody.length)} raw, ${kb(gz(body))}→${kb(gz(outBody))} gzip`;
console.log(
  `built ${OUT}  v${version}  ${parts.length} parts  ` +
  `${outBody.split("\n").length} lines  (${note})`
);
