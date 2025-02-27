import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import * as dotenv from "dotenv";

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
    osxSign: {},
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },
    extendInfo: "./Info.plist",
    appCategoryType: "public.app-category.developer-tools",
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: appBundleId,
      title: productName,
      loadingGif: "./images/loadingGif.gif",
      setupIcon: "./images/icon.ico",
    }),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({
      options: {
        productName: productName,
        name: productName,
        icon: "./images/icon.png",
      },
    }),
    new MakerDeb({
      options: {
        productName: productName,
        name: productName,
        icon: "./images/icon.png",
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
      name: "@electron-forge/publisher-github",
      platforms: ["darwin", "win32", "linux"],
      config: {
        force: true,
        repository: {
          owner: "gridaco",
          name: "grida",
        },
        prerelease: true,
      },
    },
  ],
};

export default config;
