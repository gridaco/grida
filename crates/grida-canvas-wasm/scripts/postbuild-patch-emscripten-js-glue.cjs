/**
 * Patch the generated `dist/index.js` to avoid static `require("fs")` / `require("path")`.
 *
 * Why:
 * - When Emscripten outputs a dual-env loader (web + node), it includes Node-only
 *   branches that use `require("fs")`.
 * - Next.js (Turbopack) may try to resolve those built-ins even for the browser
 *   client bundle and fail with "Can't resolve 'fs'".
 *
 * Reference: https://github.com/emscripten-core/emscripten/issues/26134
 *
 * This patch keeps Node support (still requires fs/path at runtime in Node)
 * while preventing the bundler from statically resolving built-ins for the client.
 */

const fs = require("node:fs");
const path = require("node:path");

const distIndexJs = path.join(__dirname, "..", "dist", "index.js");

let src = fs.readFileSync(distIndexJs, "utf8");

// Already patched
if (
  src.includes(
    'var nodeRequire = typeof require !== "undefined" ? require : void 0;'
  )
) {
  process.exit(0);
}

const nodeRequireBlock =
  'if (ENVIRONMENT_IS_NODE) {\n' +
  "          // Avoid static Node-builtins requires so browser bundlers\n" +
  "          // (e.g. Next.js Turbopack) don\\'t try to resolve Node built-ins for the\n" +
  "          // client bundle. This branch only executes in Node anyway.\n" +
  '          var nodeRequire = typeof require !== "undefined" ? require : void 0;\n' +
  '          var fs = nodeRequire("fs");\n' +
  '          var nodePath = nodeRequire("path");\n';

const pattern =
  /if \(ENVIRONMENT_IS_NODE\) \{\n(\s*)var fs = require\("fs"\);\n\1var nodePath = require\("path"\);\n/;

if (!pattern.test(src)) {
  // Nothing to patch (e.g. artifacts built with `-sENVIRONMENT=web` only).
  process.exit(0);
}

src = src.replace(pattern, nodeRequireBlock);
fs.writeFileSync(distIndexJs, src);

