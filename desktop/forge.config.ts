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

const config: ForgeConfig = {
  packagerConfig: {
    extraResource: [
      // .grida file preview icon for macOS
      "mac/dotgrida.icns",
    ],
    name: productName,
    executableName: "desktop",
    asar: true,
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
        schemes: ["grida"],
      },
    ],
    extendInfo: "./Info.plist",
    appCategoryType: "public.app-category.developer-tools",
  },
  rebuildConfig: {},
  hooks: {},
  makers: [
    new MakerSquirrel((arch) => {
      const version = process.env.npm_package_version;
      return {
        setupExe: `${productName} Setup ${version} ${arch}.exe`,
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
          // grida:// deep linking
          "x-scheme-handler/grida",
        ],
      },
    }),
    new MakerDeb({
      options: {
        productName: productName,
        name: productName,
        icon: "./images/icon.png",
        mimeType: [
          // grida:// deep linking
          "x-scheme-handler/grida",
        ],
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
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mjs",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    {
      // https://js.electronforge.io/interfaces/_electron_forge_publisher_github.PublisherGitHubConfig.html
      name: "@electron-forge/publisher-github",
      platforms: ["darwin", "win32", "linux"],
      config: {
        force: true,
        repository: {
          owner: "gridaco",
          name: "grida",
        },
        prerelease: process.env.PRERELEASE === "true",
      },
    },
  ],
};

export default config;
