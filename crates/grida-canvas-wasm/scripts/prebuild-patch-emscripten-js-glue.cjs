/**
 * Patch the vendored Emscripten JS glue (`lib/bin/grida-canvas-wasm.js`) so
 * that downstream bundlers (Next.js Turbopack) don't try to resolve Node built-ins
 * from client bundles when using `-sENVIRONMENT=web,node`.
 *
 * Why:
 * - When Emscripten outputs a dual-env loader (web + node), it includes Node-only
 *   branches that use `require("fs")` / `require("path")` / `require("crypto")`.
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

function patchNodeBuiltinsToNodeColon(src) {
  // Rewrite `nodeRequire("fs")` / `nodeRequire("path")` → `nodeRequire("node:fs")` etc.
  src = src.replaceAll('nodeRequire("fs")', 'nodeRequire("node:fs")');
  src = src.replaceAll('nodeRequire("path")', 'nodeRequire("node:path")');
  src = src.replaceAll('nodeRequire("crypto")', 'nodeRequire("node:crypto")');
  src = src.replaceAll("nodeRequire('fs')", "nodeRequire('node:fs')");
  src = src.replaceAll("nodeRequire('path')", "nodeRequire('node:path')");
  src = src.replaceAll("nodeRequire('crypto')", "nodeRequire('node:crypto')");

  // Rewrite direct requires used in Node-only branches
  src = src.replaceAll('require("fs")', 'require("node:fs")');
  src = src.replaceAll('require("path")', 'require("node:path")');
  src = src.replaceAll('require("crypto")', 'require("node:crypto")');
  src = src.replaceAll("require('fs')", "require('node:fs')");
  src = src.replaceAll("require('path')", "require('node:path')");
  src = src.replaceAll("require('crypto')", "require('node:crypto')");

  return src;
}

function patchFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) return;

  let src = fs.readFileSync(filePath, "utf8");
  const next = patchNodeBuiltinsToNodeColon(src);
  if (next !== src) {
    fs.writeFileSync(filePath, next);
  }
}

// Patch the vendored Emscripten glue (input to tsup)
patchFileIfExists(
  path.join(__dirname, "..", "lib", "bin", "grida-canvas-wasm.js")
);

// Patch the bundled output too: tsup/esbuild may normalize `node:*` back to bare builtins.
patchFileIfExists(path.join(__dirname, "..", "dist", "index.js"));

