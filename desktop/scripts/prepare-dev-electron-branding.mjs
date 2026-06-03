import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appBundle = path.join(root, "node_modules/electron/dist/Electron.app");
const plist = path.join(appBundle, "Contents/Info.plist");
const resources = path.join(appBundle, "Contents/Resources");
const backup = path.join(root, ".electron/electron-dist-backup");
const backupPlist = path.join(backup, "Info.plist");
const backupIcon = path.join(backup, "electron.icns");
const insidersIcon = path.join(root, "images/insiders/icon.icns");
const isInsiders = process.argv.includes("--insiders");

// Electron's macOS docs describe full rebranding as a packaging step:
// rename Electron.app plus CFBundleDisplayName / CFBundleIdentifier /
// CFBundleName and the helper apps. In `electron-forge start`, the
// launched bundle is still node_modules/electron/dist/Electron.app, so
// this dev patch is intentionally best-effort for the Dock icon only.
// Calling this script without --insiders restores the original Electron
// bundle; normal dev/package/make/publish scripts do that first so this
// dev-only branding cannot leak into non-insiders or packaged builds.
// See:
// https://www.electronjs.org/docs/latest/tutorial/application-distribution#rebranding-with-downloaded-binaries
// https://www.electronjs.org/docs/latest/api/dock#dockseticonimage-macos
if (process.platform !== "darwin") {
  process.exit(0);
}

fs.mkdirSync(backup, { recursive: true });
if (!fs.existsSync(backupPlist)) {
  fs.copyFileSync(plist, backupPlist);
}
if (!fs.existsSync(backupIcon)) {
  fs.copyFileSync(path.join(resources, "electron.icns"), backupIcon);
}

function setPlistValue(key, value) {
  execFileSync("/usr/libexec/PlistBuddy", [
    "-c",
    `Set :${key} ${value}`,
    plist,
  ]);
}

if (isInsiders) {
  setPlistValue("CFBundleName", "Grida (Insiders)");
  setPlistValue("CFBundleDisplayName", "Grida (Insiders)");
  setPlistValue("CFBundleIconFile", "electron.icns");

  fs.copyFileSync(insidersIcon, path.join(resources, "electron.icns"));
} else {
  fs.copyFileSync(backupPlist, plist);
  fs.copyFileSync(backupIcon, path.join(resources, "electron.icns"));
}
