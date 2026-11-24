// GRIDA-SEC-004 / GRIDA-SEC-005 / GRIDA-SEC-014 — Main owns launch identity and storage paths.
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { App } from "electron";
import { home } from "@grida/home";
import type { DeepLinkScheme } from "../deep-link";

export type DesktopProfile = Readonly<
  DesktopProfile.Launch & {
    userHome: string;
    userData: string;
    sessionData: string;
    gridaHome: string;
    configHome: string;
    providerHome: string;
    agentData: string;
    agentDataOverride: string | undefined;
    mediaRoot: string;
    documents: string;
    projectsRoot: string;
    temp: string;
    resourcesPath: string;
    catalogueDirectory: string;
  }
>;

export namespace DesktopProfile {
  export type Launch = Readonly<{
    isPackaged: boolean;
    isInsiders: boolean;
    appName: string;
    editorBaseUrl: string;
    deepLinkScheme: DeepLinkScheme;
    nativeChat: NativeChat;
    agentDisabled: boolean;
  }>;

  export type NativeChat = "ordinary" | "preview" | "disabled";

  type LaunchInput = Readonly<{
    platform: NodeJS.Platform;
    argv: readonly string[];
    defaultApp?: boolean;
  }>;

  type PathInput = Readonly<{
    platform: NodeJS.Platform;
    home: string;
    environment: Readonly<NodeJS.ProcessEnv>;
    resourcesPath: string;
  }>;

  export function developmentName(insiders: boolean): string {
    return insiders ? "Grida Insiders Dev" : "Grida Dev";
  }

  export function launch(
    isPackaged: boolean,
    isInsiders: boolean,
    input: LaunchInput = process
  ): Launch {
    const local = !isPackaged || isInsiders;
    return Object.freeze({
      isPackaged,
      isInsiders,
      appName: isPackaged ? "Grida" : developmentName(isInsiders),
      editorBaseUrl: local ? "http://localhost:3000" : "https://grida.co",
      deepLinkScheme: local ? "grida-dev" : "grida",
      nativeChat: nativeChat(isInsiders, input),
      agentDisabled: input.argv.includes("--disable-agent"),
    });
  }

  function nativeChat(
    insiders: boolean,
    { argv, platform, defaultApp }: LaunchInput
  ): NativeChat {
    if (argv.includes("--disable-agent")) return "disabled";
    if (argv.includes("--native-chat"))
      return defaultApp === true || insiders ? "preview" : "disabled";
    return (platform === "darwin" || platform === "linux") &&
      !argv.some((arg) => arg.startsWith("--native-chat-"))
      ? "ordinary"
      : "disabled";
  }

  /** Apply the choice before Electron initializes its session and instance lock. */
  export function applyBrowserProfile(
    app: Pick<App, "getPath" | "setPath" | "setName"> & {
      commandLine: Pick<App["commandLine"], "getSwitchValue">;
    },
    launch: Launch
  ): void {
    app.setName(launch.appName);
    if (launch.isPackaged || app.commandLine.getSwitchValue("user-data-dir"))
      return;
    const browser = path.join(
      app.getPath("appData"),
      launch.appName,
      "Browser"
    );
    mkdirSync(browser, { recursive: true, mode: 0o700 });
    app.setPath("userData", browser);
    app.setPath("sessionData", browser);
  }

  /** After the lock, capture the paths Main and its children will use. */
  export function resolve(
    app: Pick<App, "getPath" | "getAppPath">,
    launch: Launch,
    host: PathInput = {
      platform: process.platform,
      home: os.homedir(),
      environment: process.env,
      resourcesPath: process.resourcesPath,
    }
  ): DesktopProfile {
    const paths = host.platform === "win32" ? path.win32 : path.posix;
    const mode = launch.nativeChat;
    const userData = app.getPath("userData");
    const development = launch.isPackaged
      ? undefined
      : paths.join(app.getPath("appData"), launch.appName);
    const agentDataOverride = host.environment.GRIDA_AGENT_USER_DATA;
    // Preview admission validates this layout before any service uses it.
    const preview =
      mode === "preview" &&
      agentDataOverride &&
      paths.isAbsolute(agentDataOverride)
        ? paths.dirname(agentDataOverride)
        : undefined;
    const override = host.environment.GRIDA_HOME;
    if (mode !== "disabled" && override && !paths.isAbsolute(override))
      throw new Error("config_home_must_be_absolute");
    const selectedHome = home.dir({ home: host.home, env: host.environment });
    const configHome =
      mode === "preview" ? paths.normalize(selectedHome) : selectedHome;
    const gridaHome = development
      ? paths.join(development, "Home")
      : paths.normalize(selectedHome);
    const providerHome = agentDataOverride ?? gridaHome;
    const documents = preview
      ? paths.join(preview, "projects")
      : app.getPath("documents");
    const projectName =
      development && mode !== "preview" ? launch.appName : "Grida";
    return Object.freeze({
      ...launch,
      userHome: app.getPath("home"),
      userData,
      sessionData: app.getPath("sessionData"),
      gridaHome,
      configHome,
      providerHome,
      agentData: agentDataOverride ?? paths.join(gridaHome, "agent"),
      agentDataOverride,
      mediaRoot: preview
        ? paths.join(preview, "media")
        : development
          ? paths.join(development, "Media")
          : packagedMedia(host, launch.isInsiders),
      documents,
      projectsRoot: paths.join(documents, `${projectName} Projects`),
      temp: preview ? paths.join(preview, "temp") : app.getPath("temp"),
      resourcesPath: launch.isPackaged
        ? host.resourcesPath
        : paths.join(app.getAppPath(), ".native-resources"),
      catalogueDirectory: paths.join(
        (mode === "preview" && agentDataOverride) || userData,
        "model-catalogue"
      ),
    });
  }

  function packagedMedia(
    host: Pick<PathInput, "platform" | "home" | "environment">,
    insiders: boolean
  ): string {
    const paths = host.platform === "win32" ? path.win32 : path.posix;
    if (!paths.isAbsolute(host.home))
      throw new TypeError("media-home-must-be-absolute");
    const name = insiders ? "Grida Insiders" : "Grida";
    if (host.platform === "darwin")
      return paths.join(
        host.home,
        "Library",
        "Application Support",
        name,
        "Media"
      );
    if (host.platform === "win32") {
      const local = host.environment.LOCALAPPDATA?.trim();
      const data =
        local && paths.isAbsolute(local)
          ? local
          : paths.join(host.home, "AppData", "Local");
      return paths.join(data, name, "Media");
    }
    const xdg = host.environment.XDG_DATA_HOME?.trim();
    const data =
      xdg && paths.isAbsolute(xdg)
        ? xdg
        : paths.join(host.home, ".local", "share");
    return paths.join(data, insiders ? "grida-insiders" : "grida", "media");
  }
}
