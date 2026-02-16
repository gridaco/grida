/**
 * postpack: restore package.json from backup after pack/publish.
 */
const fs = require("fs");
const path = require("path");

const pkgDir = path.resolve(__dirname, "..");
const pkgPath = path.join(pkgDir, "package.json");
const bakPath = path.join(pkgDir, ".package.json.prepack.bak");

if (fs.existsSync(bakPath)) {
  fs.copyFileSync(bakPath, pkgPath);
  fs.unlinkSync(bakPath);
}
