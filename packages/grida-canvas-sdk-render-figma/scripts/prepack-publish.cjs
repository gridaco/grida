/**
 * prepack: strip workspace:* deps from package.json before pack/publish.
 * Internal packages (@grida/io-figma, @grida/schema) are bundled by tsup and
 * not published; workspace: protocol breaks npm consumers.
 */
const fs = require("fs");
const path = require("path");

const pkgDir = path.resolve(__dirname, "..");
const pkgPath = path.join(pkgDir, "package.json");
const bakPath = path.join(pkgDir, ".package.json.prepack.bak");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

function stripWorkspaceDeps(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === "string" && val.startsWith("workspace:")) {
      delete obj[key];
    }
  }
}

// Backup original
fs.writeFileSync(bakPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

// Strip from dependencies and devDependencies
stripWorkspaceDeps(pkg.dependencies);
stripWorkspaceDeps(pkg.devDependencies);

// Write modified manifest
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
