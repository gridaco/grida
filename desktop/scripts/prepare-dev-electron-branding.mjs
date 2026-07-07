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

// Two dev-only patches to node_modules/electron/dist/Electron.app — the bundle
// `electron-forge start` actually launches (full rebranding is otherwise a
// packaging step, and macOS keys off this live bundle):
//
//   1. Dock icon + name (insiders only) — best-effort cosmetic.
//   2. A unique CFBundleIdentifier per channel — FUNCTIONAL: it fixes `grida://`
//      deep-link routing (GRIDA-SEC-005; see the block near the bottom).
//
// Calling this script without --insiders restores the original icon/name;
// normal dev/package/make/publish scripts do that first so cosmetic insiders
// branding cannot leak. Packaged builds are unaffected either way — forge
// packages from the @electron/get cache with its own appBundleId
// (co.grida.desktop), not this node_modules bundle.
// See:
// https://www.electronjs.org/docs/latest/tutorial/application-distribution#rebranding-with-downloaded-binaries
// https://www.electronjs.org/docs/latest/api/dock#dockseticonimage-macos
// Nothing to brand or restore without a local Electron bundle. Electron 42+
// no longer auto-downloads it on install (the pre-42 `postinstall` hook is
// gone), and electron-forge packages from the @electron/get cache — not
// node_modules/electron/dist — so on a clean checkout (e.g. CI) there is no
// branding to apply and none that could leak. Skip instead of crashing on a
// missing source.
if (process.platform !== "darwin" || !fs.existsSync(appBundle)) {
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

// GRIDA-SEC-005 / #955 — make the DEV Electron a proper `grida-dev://` deep-link
// handler. Dev (and insiders) use their OWN scheme — `grida-dev`, NOT the
// packaged production `grida` — so the two builds can never fight over one
// scheme in LaunchServices when both are installed. Full context/history: #955.
// Two Info.plist patches are needed because the runtime
// `app.setAsDefaultProtocolClient(...)` is documented to take effect only for
// PACKAGED apps on macOS — in `electron-forge start` it silently no-ops, so the
// OS would otherwise have no handler ("There is no application set to open …").
//
//   (a) CFBundleURLTypes — the DECLARATIVE scheme registration LaunchServices
//       actually reads (exactly what forge's `protocols` config bakes into
//       packaged builds). This is what registers the app as a handler at all,
//       and it declares `grida-dev` (prod isolation).
//   (b) A globally-unique CFBundleIdentifier per channel — so the scheme
//       resolves to THIS app, not another Electron project (all un-rebranded
//       dev Electrons share `com.github.Electron`). Belt-and-suspenders with the
//       dev scheme above.
//
// Applied after the branding branch above so the non-insiders restore can't
// clobber them.
const devBundleId = isInsiders
  ? "co.grida.insiders.dev"
  : "co.grida.desktop.dev";
setPlistValue("CFBundleIdentifier", devBundleId);

// (a) Declare the `grida-dev` scheme. Idempotent: drop any prior block first
// (this script re-runs every `pnpm dev`), then add ours. Mirrors the packaged
// insiders `protocols: [{ name: "Grida", schemes: ["grida-dev"] }]`.
try {
  execFileSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Delete :CFBundleURLTypes", plist],
    { stdio: "ignore" }
  );
} catch {
  // no prior CFBundleURLTypes — nothing to clear
}
execFileSync("/usr/libexec/PlistBuddy", [
  "-c",
  "Add :CFBundleURLTypes array",
  "-c",
  "Add :CFBundleURLTypes:0 dict",
  "-c",
  "Add :CFBundleURLTypes:0:CFBundleURLName string Grida",
  "-c",
  "Add :CFBundleURLTypes:0:CFBundleURLSchemes array",
  "-c",
  "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string grida-dev",
  plist,
]);

// Re-sign ad-hoc so the signature matches the patched Info.plist (id + scheme).
// The stock bundle is ad-hoc/linker-signed (`Identifier=Electron`); editing
// Info.plist alone leaves the signature stale, which macOS can prefer over
// Info.plist when registering the handler. `--sign -` re-derives the identifier
// from the (now unique) CFBundleIdentifier. Must run AFTER all plist edits.
// Best-effort: a codesign failure must not break `pnpm dev`.
try {
  execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", appBundle], {
    stdio: "ignore",
  });
} catch (err) {
  console.warn(
    `[dev-branding] ad-hoc re-sign failed (${err.message}); continuing.`
  );
}

// Force LaunchServices to register the patched bundle NOW. `electron-forge
// start` launches the raw binary, which doesn't trigger LS registration on its
// own, so without this the freshly-declared scheme isn't picked up until a
// later system scan. Best-effort.
try {
  execFileSync(
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    ["-f", appBundle],
    { stdio: "ignore" }
  );
} catch (err) {
  console.warn(
    `[dev-branding] lsregister refresh failed (${err.message}); ` +
      `LaunchServices will re-scan later.`
  );
}
