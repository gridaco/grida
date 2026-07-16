import type { ForgeConfig } from "@electron-forge/shared-types";
import {
  MakerSquirrel,
  type MakerSquirrelConfig,
} from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import * as dotenv from "dotenv";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// cli flags
const IS_INSIDERS = process.argv.includes("--insiders");
if (IS_INSIDERS) {
  console.log("=== INSIDERS BUILD ===");
  process.env.INSIDERS = "1";
}

// .env
dotenv.config();

// variable build config
const productName = IS_INSIDERS ? "Grida Insiders" : "Grida";
const appBundleId = IS_INSIDERS ? "co.grida.insiders" : "co.grida.desktop";
const icon = IS_INSIDERS ? "./images/insiders/icon" : "./images/icon";
// GRIDA-SEC-005 / #955 — deep-link scheme. Insiders targets the localhost editor
// (like dev) and so registers `grida-dev` to match the editor's dev redirect
// target; production owns `grida`. Must agree with `DEEP_LINK_SCHEME` in
// `src/env.ts` and the editor's `DESKTOP_AUTH_REDIRECT`.
const deepLinkScheme = IS_INSIDERS ? "grida-dev" : "grida";

const signingIdentity = process.env.APPLE_SIGNING_IDENTITY;
const entitlementsPath = path.join(
  __dirname,
  "build",
  "entitlements.mac.plist"
);

const osxSign = signingIdentity
  ? {
      identity: signingIdentity,
      optionsForFile: () => ({
        hardenedRuntime: true,
        entitlements: entitlementsPath,
        "entitlements-inherit": entitlementsPath,
        "gatekeeper-assess": false,
      }),
    }
  : undefined;

const osxNotarize =
  process.env.APPLE_API_KEY &&
  process.env.APPLE_API_KEY_ID &&
  process.env.APPLE_API_ISSUER
    ? {
        appleApiKey: process.env.APPLE_API_KEY,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER,
      }
    : undefined;

// ───────────────────────────────────────────────────────────────────────────
// GRIDA-DESKTOP-BUILD-GUARD — ship the runtime-external dependencies.
//
// The Vite plugin bundles main/preload/sidecar and, by default, sets
// `packagerConfig.ignore` to drop everything except `.vite` — so NO
// node_modules ships, and anything the bundles leave `external` crashes the app
// on launch with "Cannot find module" (0.0.3: @grida/desktop-bridge; 0.0.4:
// @anthropic-ai/sandbox-runtime). This is a known forge bug
// (electron/forge#3738, #3917, #4045).
//
// Idiomatic fix: package.json `dependencies` are EXACTLY the modules left
// `external` in vite.*.config.ts; everything bundled lives in devDependencies.
// electron-packager's `prune` (default) then ships exactly the production
// dependency closure — no hand-rolled walker. We only override `ignore` to undo
// the Vite plugin's node_modules strip. scripts/verify-packaged-bundle.mjs (the
// postPackage hook) fails the build if any external is still missing, so a
// misclassified dependency can't ship.
//
// `@grida/*` are bundled (devDependencies, never external — enforced by
// vite.guards.ts); keeping them out of `dependencies` also keeps their `link:`
// symlinks out of the pruner's path.
function packageIgnore(file: string): boolean {
  if (!file) return false; // app root
  if (file === "/package.json") return false;
  if (file.startsWith("/.vite")) return false;
  // `@grida/*` are bundled (devDependencies); their node_modules entries are
  // `link:` symlinks to ../../packages that point out of the package and make
  // asar fail ("links out of the package"). Exclude them explicitly.
  if (file.startsWith("/node_modules/@grida")) return true;
  // pnpm internals (.pnpm store, .bin shims, lockfile metadata) — not needed at
  // runtime; the hoisted prod deps are real dirs at the top level.
  if (file.startsWith("/node_modules/.")) return true;
  if (file.startsWith("/node_modules")) return false; // pruner keeps only prod deps
  return true; // src, tsconfig, configs — Vite already bundled what's needed
}

const config: ForgeConfig = {
  packagerConfig: {
    extraResource: [
      // .grida file preview icon for macOS
      "mac/dotgrida.icns",
      // The host-bundled agent skills tree (repo-root `skills/`). Lands at
      // `<resources>/skills` (see AgentSidecarSupervisor.skillsRootPath). The
      // agent advertises these built-in skills and loads them on demand.
      "../skills",
    ],
    name: productName,
    // @electron/packager couples CFBundleDisplayName to `executableName`
    // (mac.ts updatePlist), so a fixed "desktop" here makes macOS attribute
    // the app — Dock, Notification Center banners, the notification
    // permission prompt — as "desktop" instead of the product name. On
    // macOS, omit it so executable + display name follow `name`; nothing
    // references Contents/MacOS/<binary> by literal path (the sidecar
    // respawns via process.execPath), and Squirrel.Mac replaces the whole
    // bundle on update. Windows/Linux keep "desktop": the exe name is
    // load-bearing for Squirrel shortcuts/updates and package paths.
    executableName: process.platform === "darwin" ? undefined : "desktop",
    // Undo the Vite plugin's node_modules strip so the production deps
    // (package.json `dependencies` = the vite externals) ship; `prune` then
    // keeps just those. See GRIDA-DESKTOP-BUILD-GUARD above.
    ignore: packageIgnore,
    // @anthropic-ai/sandbox-runtime ships executable vendored binaries
    // (vendor/seccomp/*/apply-seccomp) that cannot run from inside an asar —
    // unpack it so they land on a real filesystem. node-pty likewise: its
    // native `pty.node` addon and `spawn-helper` executable cannot load/run
    // from inside an asar. @parcel/watcher (issue #805) is the same: its
    // per-platform prebuild package (`@parcel/watcher-<platform>-<arch>`)
    // carries the `.node` addon, which must load from the real filesystem.
    asar: {
      unpack:
        "**/node_modules/{@anthropic-ai/sandbox-runtime,node-pty,@parcel/watcher,@parcel/watcher-*}/**",
    },
    appBundleId: appBundleId,
    icon: icon,
    osxSign,
    osxNotarize,
    win32metadata: {
      CompanyName: "Grida Inc.",
    },
    protocols: [
      {
        name: "Grida",
        schemes: [deepLinkScheme],
      },
    ],
    extendInfo: "./Info.plist",
    appCategoryType: "public.app-category.developer-tools",
  },
  // Native dependencies and their @electron/rebuild policy:
  //
  // - node-pty ships N-API prebuilt binaries for darwin/win32 (its loader
  //   falls back to prebuilds/<platform>-<arch>), so rebuilding there is pure
  //   waste — and would force every dev machine to carry a C++ toolchain.
  //   Linux has no upstream prebuild, so it is the one platform where it must
  //   compile from source (GitHub's ubuntu runners ship the toolchain).
  //   node-abi is overridden in pnpm-workspace.yaml so the rebuild recognizes
  //   current Electron versions.
  // - @parcel/watcher (issue #805) ships N-API prebuilds for EVERY platform as
  //   separate `@parcel/watcher-<os>-<arch>` packages, so it must never be
  //   compiled from source. Rebuilding it is not just waste — it fails on the
  //   windows runner (no configured VS C++ build tools), and the N-API prebuild
  //   loads under Electron without an ABI-specific rebuild. Always ignore it;
  //   the shipped per-platform prebuild package provides the addon.
  rebuildConfig: {
    ignoreModules: [
      "@parcel/watcher",
      ...(process.platform === "linux" ? [] : ["node-pty"]),
    ],
  },
  hooks: {
    // node-pty's npm tarball ships the darwin prebuilt `spawn-helper`
    // with mode 0644 (no exec bit) and never chmods it, so PTY spawn
    // fails with `posix_spawnp failed`. Fix the bit BEFORE asar packing:
    // the installed app can be mounted read-only (macOS app
    // translocation), so a runtime chmod can't be the only fix. asar
    // preserves the mode into app.asar.unpacked. The dev tree is handled
    // at runtime by terminal-host.ts `ensureSpawnHelperExecutable`.
    packageAfterPrune: async (_forgeConfig, buildPath) => {
      const prebuilds = path.join(
        buildPath,
        "node_modules",
        "node-pty",
        "prebuilds"
      );
      if (!fs.existsSync(prebuilds)) return;
      for (const dir of fs.readdirSync(prebuilds)) {
        const helper = path.join(prebuilds, dir, "spawn-helper");
        if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
      }
    },
    // GRIDA-DESKTOP-BUILD-GUARD — after packaging, verify every externalized
    // require (and its full transitive closure) actually resolves in the
    // packaged app. A missing dependency fails the build HERE instead of
    // crashing on a user's machine with "Cannot find module". Runs on
    // package / make / publish, locally and in CI.
    postPackage: async (_forgeConfig, { outputPaths }) => {
      const script = path.join(
        __dirname,
        "scripts",
        "verify-packaged-bundle.mjs"
      );
      for (const outputPath of outputPaths) {
        execFileSync(process.execPath, [script, outputPath], {
          stdio: "inherit",
        });
      }
    },
  },
  makers: [
    new MakerSquirrel((arch) => {
      const version = process.env.npm_package_version;
      return {
        setupExe: `${productName}.Setup.${version}.${arch}.exe`,
        name: appBundleId + `.${arch}`,
        title: productName,
        iconUrl: "https://grida.co/favicon.ico",
        loadingGif: "./images/loadingGif.gif",
        setupIcon: "./images/icon.ico",
      } satisfies MakerSquirrelConfig;
    }),
    new MakerZIP({}, ["darwin"]),
    new MakerDMG(() => {
      return {
        overwrite: true,
        icon: icon + ".icns",
        title: productName,
        background: "./images/dmg-background.png",
      };
    }, ["darwin"]),
    new MakerRpm({
      options: {
        productName: productName,
        name: productName,
        icon: "./images/icon.png",
        mimeType: [
          // grida:// (prod) / grida-dev:// (insiders) deep linking
          `x-scheme-handler/${deepLinkScheme}`,
        ],
        // GRIDA-SEC-004 — srt's Linux backend shells out to these.
        // bubblewrap = namespace+seccomp sandbox; socat = unix-socket
        // bridge for the HTTP/SOCKS5 proxies; ripgrep = mandatory
        // deny-set search helper. Without them, srt initialize()
        // throws and the supervisor refuses to boot.
        requires: ["bubblewrap", "socat", "ripgrep"],
      },
    }),
    new MakerDeb({
      options: {
        productName: productName,
        name: productName,
        icon: "./images/icon.png",
        mimeType: [
          // grida:// (prod) / grida-dev:// (insiders) deep linking
          `x-scheme-handler/${deepLinkScheme}`,
        ],
        // GRIDA-SEC-004 — see MakerRpm comment above.
        depends: ["bubblewrap", "socat", "ripgrep"],
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
        {
          // Agent sidecar. Runs in Electron-as-Node and constructs
          // AgentHost. Forge emits `.vite/build/agent-sidecar.js`
          // next to `main.js`. GRIDA-SEC-004.
          entry: "src/agent-sidecar.ts",
          config: "vite.agent-sidecar.config.ts",
          target: "main",
        },
      ],
      // URL-loaded model — main BrowserWindow `loadURL`s
      // `${EDITOR_BASE_URL}/desktop/...` directly; no local renderer
      // bundle is built. The preload (above) is the only renderer-side
      // code we ship. GRIDA-SEC-004.
      renderer: [],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      // GRIDA-SEC-004 — must be `true` so the supervisor can
      // `child_process.spawn(process.execPath, ..., { env: {
      // ELECTRON_RUN_AS_NODE: '1' } })` to boot the agent sidecar
      // inside an srt wrap. Residual risk: a local attacker who
      // already controls the binary can pass the same env var to
      // run arbitrary JS — but they already own the binary, so this
      // is not a new vector.
      [FuseV1Options.RunAsNode]: true,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
