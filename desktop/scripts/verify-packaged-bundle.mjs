#!/usr/bin/env node
// GRIDA-DESKTOP-BUILD-GUARD (boot oracle) — see desktop/vite.guards.ts.
//
// The electron-forge Vite plugin ships only the `.vite` bundle and drops
// node_modules, assuming the main process is fully self-contained. Any
// dependency the bundles leave EXTERNAL (`require("x")`) must therefore be
// physically present in the packaged app, or it crashes on launch with
// "Cannot find module" — while every other CI check stays green. We
// learned this the expensive way, one missing module per release
// (@grida/desktop-bridge, then @anthropic-ai/sandbox-runtime, ...).
//
// This oracle inspects the ACTUAL packaged bundles, discovers every
// external require, and verifies each one resolves in the packaged
// context. It is the catch-all: a newly-externalized dependency that
// isn't shipped fails here, not in a user's crash report.
//
// Usage: node scripts/verify-packaged-bundle.mjs [path/to/app.asar]
//   (defaults to the first app.asar found under ./out)

import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const builtins = new Set(require_builtins());
function require_builtins() {
  // node:module exposes the canonical list.
  return createRequire(import.meta.url)("node:module").builtinModules;
}

function findAsar() {
  const arg = process.argv[2];
  // arg may be an app.asar file, a directory to search, or omitted (search ./out)
  let searchRoot;
  if (arg) {
    const resolved = path.resolve(arg);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile())
      return resolved;
    searchRoot = resolved;
  } else {
    searchRoot = path.join(root, "out");
  }
  const stack = [searchRoot];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isFile() && e.name === "app.asar") return p;
      if (e.isDirectory()) stack.push(p);
    }
  }
  return null;
}

// An external is a bare specifier (not relative, not a node builtin, not
// electron, which the runtime always provides). `hono/cors` -> base `hono`.
function isExternalSpecifier(id) {
  if (id.startsWith(".") || id.startsWith("/") || id.startsWith("node:")) {
    return false;
  }
  const base = id.startsWith("@")
    ? id.split("/").slice(0, 2).join("/")
    : id.split("/")[0];
  if (builtins.has(base)) return false;
  if (base === "electron" || base.startsWith("electron/")) return false;
  return true;
}

function extractExternals(jsFile) {
  const code = fs.readFileSync(jsFile, "utf8");
  const found = new Set();
  // matches require("x") and dynamic import("x") — Rollup keeps external
  // dynamic imports as `import(...)` even in CJS output (dynamicImportInCjs),
  // so lazily-loaded externals like node-pty never appear as require().
  const re = /(?:require|import)\(\s*[`"']([^`"']+)[`"']\s*\)/g;
  let m;
  while ((m = re.exec(code))) {
    if (isExternalSpecifier(m[1])) found.add(m[1]);
  }
  return found;
}

const asar = findAsar();
if (!asar || !fs.existsSync(asar)) {
  console.error(
    `[verify-packaged-bundle] no app.asar found` +
      (process.argv[2]
        ? ` at ${process.argv[2]}`
        : ` under ${path.join(root, "out")}`) +
      `\nRun \`pnpm package\` first.`
  );
  process.exit(2);
}

// Extract the asar so we can resolve modules against the packaged tree
// with a plain Node resolver (createRequire). asar.unpack'd files are
// still listed in the archive, so extraction is sufficient to answer
// "is this module present".
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grida-pkg-verify-"));
const { extractAll } = createRequire(import.meta.url)("@electron/asar");
extractAll(asar, tmp);

// Find a package dir by walking up node_modules (exports-proof — modern
// packages block require.resolve("<pkg>/package.json")).
function findPackageDir(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const buildDir = path.join(tmp, ".vite", "build");
const bundles = fs
  .readdirSync(buildDir)
  .filter((f) => f.endsWith(".js"))
  .map((f) => path.join(buildDir, f));

// Verify the FULL transitive closure of every external is present in the
// packaged tree — not just the top-level requires. A direct external can
// resolve while one of ITS runtime deps is missing (e.g. sandbox-runtime
// present but `commander` pruned), which still crashes on launch.
const missing = [];
const closure = new Set(); // package names that legitimately ship
const visited = new Set();

function verify(name, fromDir, requiredBy) {
  const dir = findPackageDir(name, fromDir);
  if (!dir) {
    missing.push({ spec: name, requiredBy });
    return;
  }
  if (visited.has(dir)) return;
  visited.add(dir);
  closure.add(name);
  const pj = JSON.parse(
    fs.readFileSync(path.join(dir, "package.json"), "utf8")
  );
  // Follow dependencies + optionalDependencies — both can be installed and ship
  // alongside the package, so both are legitimate members of the closure.
  const deps = { ...pj.dependencies, ...pj.optionalDependencies };
  for (const dep of Object.keys(deps)) {
    verify(dep, dir, name);
  }
}

for (const bundle of bundles) {
  for (const spec of extractExternals(bundle)) {
    // a subpath like "hono/cors" ships with its base package "hono"
    const base = spec.startsWith("@")
      ? spec.split("/").slice(0, 2).join("/")
      : spec.split("/")[0];
    verify(base, path.dirname(bundle), path.basename(bundle));
  }
}

// Names of every package (dir with a package.json) shipped at the top level of
// the packaged node_modules. Empty dirs left behind by the pruner have no
// package.json and are ignored.
function shippedPackages(nmDir) {
  const out = [];
  if (!fs.existsSync(nmDir)) return out;
  for (const entry of fs.readdirSync(nmDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || !entry.isDirectory()) continue;
    if (entry.name.startsWith("@")) {
      const scope = path.join(nmDir, entry.name);
      for (const sub of fs.readdirSync(scope, { withFileTypes: true })) {
        if (fs.existsSync(path.join(scope, sub.name, "package.json"))) {
          out.push(`${entry.name}/${sub.name}`);
        }
      }
    } else if (fs.existsSync(path.join(nmDir, entry.name, "package.json"))) {
      out.push(entry.name);
    }
  }
  return out;
}

// Bloat gate: the package must ship EXACTLY the runtime closure. Anything with
// real content outside it means prune misbehaved (electron/forge#4045) and we'd
// ship a bloated binary — fail loudly instead of silently.
const extra = shippedPackages(path.join(tmp, "node_modules")).filter(
  (name) => !closure.has(name)
);

fs.rmSync(tmp, { recursive: true, force: true });

if (missing.length > 0) {
  const lines = missing.map(
    (f) => `  - ${f.spec}  (needed by ${f.requiredBy})`
  );
  console.error(
    `\n✖ GRIDA-DESKTOP-BUILD-GUARD: the packaged app is missing ` +
      `${missing.length} module(s) from the runtime-external closure. It WILL ` +
      `crash on launch with "Cannot find module":\n${lines.join("\n")}\n\n` +
      `These are left external by the Vite config but not shipped. Add them to ` +
      `package.json "dependencies" (the ships-on-disk set). See forge.config.ts.\n`
  );
  process.exit(1);
}

if (extra.length > 0) {
  const lines = extra.map((name) => `  - ${name}`);
  console.error(
    `\n✖ GRIDA-DESKTOP-BUILD-GUARD: the packaged app ships ` +
      `${extra.length} package(s) outside the runtime closure (bloat — prune ` +
      `misbehaved):\n${lines.join("\n")}\n\n` +
      `Everything bundled by Vite must be a devDependency. Move these out of ` +
      `package.json "dependencies". See forge.config.ts.\n`
  );
  process.exit(1);
}

console.log(
  `✔ packaged bundle verified: ships EXACTLY the runtime closure ` +
    `(${closure.size} packages), every externalized require resolves ` +
    `(${path.relative(root, asar)}).`
);
