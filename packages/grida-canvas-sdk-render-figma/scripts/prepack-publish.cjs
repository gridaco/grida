/**
 * prepack: rewrite workspace:* deps in package.json before pack/publish.
 *
 * - devDependencies with workspace:* are stripped (bundled by tsup, not needed
 *   at runtime).
 * - dependencies with workspace:* are resolved to the actual version from the
 *   linked package.json so npm consumers can install them from the registry.
 */
const fs = require("fs");
const path = require("path");

const pkgDir = path.resolve(__dirname, "..");
const pkgPath = path.join(pkgDir, "package.json");
const bakPath = path.join(pkgDir, ".package.json.prepack.bak");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

/** Strip all workspace:* entries (for devDependencies). */
function stripWorkspaceDeps(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === "string" && val.startsWith("workspace:")) {
      delete obj[key];
    }
  }
}

/**
 * Resolve workspace:* entries to the actual version from the linked package
 * (for runtime dependencies that must remain in the published manifest).
 */
function resolveWorkspaceDeps(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === "string" && val.startsWith("workspace:")) {
      // pnpm resolves workspace:* to the version in the linked package.json.
      // We do the same manually for `npm pack` / `npm publish`.
      const linkedPkgJson = require.resolve(`${key}/package.json`, {
        paths: [pkgDir],
      });
      const linkedPkg = JSON.parse(fs.readFileSync(linkedPkgJson, "utf8"));
      obj[key] = linkedPkg.version;
    }
  }
}

// Backup original
fs.writeFileSync(bakPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

// Resolve runtime workspace deps to real versions, strip dev workspace deps
resolveWorkspaceDeps(pkg.dependencies);
stripWorkspaceDeps(pkg.devDependencies);

// Write modified manifest
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
