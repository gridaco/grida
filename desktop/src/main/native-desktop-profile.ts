// GRIDA-SEC-004 / GRIDA-SEC-005 — isolated Desktop profiles for native chat.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { App } from "electron";
import { buildDaemonSandboxPolicy } from "@grida/daemon/sandbox";
import { ProtectedRoots } from "@grida/daemon/server";
import { home } from "@grida/home";
import { isValidEndpointProviderId } from "@grida/ai-host";
import { DesktopProfile } from "./desktop-profile";

export namespace NativeDesktopProfile {
  export const chatStateDirectory = "chats";

  export type Provider =
    | "gateway"
    | "chatgpt"
    | Readonly<{
        kind: "byok";
        id: "openrouter" | "vercel";
        model: string;
      }>
    | Readonly<{ kind: "endpoint"; id: string; model?: string }>;
  type HostApp = Pick<App, "getPath" | "setPath"> & {
    commandLine: Pick<App["commandLine"], "getSwitchValue">;
  };
  const admitted = new WeakMap<
    Pick<App, "getPath">,
    { installed: ProtectedRoots; all: ProtectedRoots; launch: ProtectedRoots }
  >();

  export type ChatProtection = Readonly<{
    workspace: readonly string[];
    launch: readonly string[];
  }>;

  export function ordinaryChatProtection(
    app: Pick<App, "getPath" | "isPackaged">,
    resourcesPath = process.resourcesPath
  ): ChatProtection {
    const userHome = app.getPath("home");
    const { filesystem } = buildDaemonSandboxPolicy({
      user_data: path.join(home.dir({ home: userHome }), "agent"),
      home: userHome,
    });
    const launch = [
      ...filesystem.deny_read,
      ...new ProtectedRoots([
        ...installedAppData(app),
        ...additionalDesktopHome(userHome),
      ]).metadataPaths(),
      // Source runs use Electron from the checkout's dependencies. Only a
      // packaged launch has an installed application to exclude from grants.
      ...(app.isPackaged && resourcesPath ? [path.dirname(resourcesPath)] : []),
    ];
    return {
      workspace: [
        ...new ProtectedRoots(gridaHomes(app)).metadataPaths(),
        ...launch,
      ],
      launch,
    };
  }

  /** Installed state and the preview config, outside workspace authority. */
  export function protectedRoots(app: Pick<App, "getPath">): ProtectedRoots {
    const roots = admitted.get(app);
    if (!roots) throw invalidProfile();
    return roots.all;
  }

  /** App-specific native profile denials alongside host-owned home rules. */
  export function launchProtectedRoots(
    app: Pick<App, "getPath">
  ): ProtectedRoots {
    const roots = admitted.get(app);
    if (!roots) throw invalidProfile();
    return roots.launch;
  }

  /** Recheck isolation from existing installations before starting services. */
  export function assertPreviewIsolation(
    app: Pick<App, "getPath">,
    root: string
  ): void {
    const roots = admitted.get(app);
    if (!roots || roots.installed.overlaps(root)) throw invalidProfile();
  }

  export function installedRootsForDevelopment(
    app: Pick<App, "getPath">,
    profile: Pick<DesktopProfile, "isPackaged">
  ): ProtectedRoots | undefined {
    if (profile.isPackaged) return;
    return new ProtectedRoots([...gridaHomes(app), ...packagedAppData(app)]);
  }

  export async function configure(
    app: HostApp,
    profile: DesktopProfile,
    argv: readonly string[] = process.argv
  ): Promise<Provider> {
    const agentData = profile.agentDataOverride;
    const browserData = app.commandLine.getSwitchValue("user-data-dir");
    const configHome = profile.configHome;
    if (
      profile.nativeChat !== "preview" ||
      !agentData ||
      !path.isAbsolute(agentData) ||
      !path.isAbsolute(browserData) ||
      !process.env.GRIDA_HOME ||
      path.normalize(process.env.GRIDA_HOME) !== configHome ||
      browserData !== profile.userData
    )
      throw invalidProfile();
    const provider = selectedProvider(argv);
    const root = path.dirname(agentData);
    const systemTemp = await fs.realpath(app.getPath("temp"));
    const relative = path.relative(systemTemp, root);
    const reserved = new Set([
      "media",
      "projects",
      "temp",
      "workspace-catalog",
    ]);
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative) ||
      new Set([agentData, browserData, configHome]).size !== 3 ||
      path.dirname(browserData) !== root ||
      path.dirname(configHome) !== root ||
      profile.temp !== path.join(root, "temp") ||
      profile.documents !== path.join(root, "projects") ||
      profile.mediaRoot !== path.join(root, "media") ||
      reserved.has(path.basename(agentData).toLowerCase()) ||
      reserved.has(path.basename(browserData).toLowerCase()) ||
      reserved.has(path.basename(configHome).toLowerCase())
    )
      throw invalidProfile();
    const installedAppPaths = installedAppData(app);
    const installedPaths = [
      ...gridaHomes(app, configHome),
      ...installedAppPaths,
    ];
    const installed = new ProtectedRoots(installedPaths);
    if (installed.overlaps(root)) throw invalidProfile();
    await checkDirectory(root);
    const browser = await checkDirectory(browserData);
    const occupied = new Set([`${browser.dev}:${browser.ino}`]);
    for (const folder of [
      agentData,
      configHome,
      profile.temp,
      profile.documents,
      profile.mediaRoot,
    ]) {
      await fs
        .mkdir(folder, { mode: 0o700 })
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "EEXIST") throw error;
        });
      const metadata = await checkDirectory(folder);
      const identity = `${metadata.dev}:${metadata.ino}`;
      if (occupied.has(identity)) throw invalidProfile();
      occupied.add(identity);
    }
    app.setPath("temp", profile.temp);
    app.setPath("documents", profile.documents);
    admitted.set(app, {
      installed,
      all: new ProtectedRoots([...installedPaths, configHome]),
      launch: new ProtectedRoots([
        ...installedAppPaths,
        ...additionalDesktopHome(app.getPath("home")),
      ]),
    });
    return provider;
  }

  function selectedProvider(argv: readonly string[]): Provider {
    const separator = argv.indexOf("--");
    const options = separator < 0 ? argv : argv.slice(0, separator);
    const provider = option(options, "--native-chat-provider") ?? "gateway";
    const model = option(options, "--native-chat-model");
    if (model && !/^[A-Za-z0-9_.:/@-]{1,256}$/.test(model))
      throw invalidProfile();
    if ((provider === "gateway" || provider === "chatgpt") && !model)
      return provider;
    if ((provider === "openrouter" || provider === "vercel") && model)
      return { kind: "byok", id: provider, model };
    if (provider.startsWith("endpoint:")) {
      const id = provider.slice("endpoint:".length);
      if (isValidEndpointProviderId(id)) return { kind: "endpoint", id, model };
    }
    throw invalidProfile();
  }

  function option(argv: readonly string[], name: string): string | undefined {
    const matches = argv.filter(
      (arg) => arg === name || arg.startsWith(`${name}=`)
    );
    if (matches.length === 0) return;
    const value = matches[0].slice(name.length + 1);
    if (matches.length !== 1 || !value || value !== value.trim())
      throw invalidProfile();
    return value;
  }

  function installedAppData(app: Pick<App, "getPath">): string[] {
    const appData = app.getPath("appData");
    return [
      ...packagedAppData(app),
      path.join(appData, DesktopProfile.developmentName(false)),
      path.join(appData, DesktopProfile.developmentName(true)),
    ];
  }

  function gridaHomes(
    app: Pick<App, "getPath">,
    previewConfigHome?: string
  ): string[] {
    const userHome = app.getPath("home");
    const configured = home.dir({ home: userHome });
    return [
      path.join(userHome, ".grida"),
      ...(path.normalize(configured) === previewConfigHome ? [] : [configured]),
    ];
  }

  function additionalDesktopHome(userHome: string): string[] {
    // The native child starts without HOME and resolves the account home.
    // Preserve the Desktop home separately if that lookup cannot cover it.
    try {
      const accountHome = os.userInfo().homedir;
      if (
        path.isAbsolute(accountHome) &&
        path.resolve(accountHome) === path.resolve(userHome)
      )
        return [];
    } catch {
      // An unavailable account lookup keeps the Desktop home protected.
    }
    return [path.join(userHome, home.DIRNAME)];
  }

  function packagedAppData(app: Pick<App, "getPath">): string[] {
    const userHome = app.getPath("home");
    const appData = app.getPath("appData");
    const roots = [
      "Grida",
      "Grida Insiders",
      "Grida (Insiders)",
      "desktop",
    ].map((name) => path.join(appData, name));
    if (process.platform === "linux") {
      const xdg = process.env.XDG_DATA_HOME?.trim();
      const data =
        xdg && path.isAbsolute(xdg)
          ? xdg
          : path.join(userHome, ".local", "share");
      roots.push(path.join(data, "grida"), path.join(data, "grida-insiders"));
    }
    return roots;
  }

  async function checkDirectory(directory: string) {
    const stat = await fs.lstat(directory);
    if (
      !stat.isDirectory() ||
      stat.uid !== process.geteuid?.() ||
      (stat.mode & 0o7777) !== 0o700 ||
      (await fs.realpath(directory)) !== directory
    )
      throw invalidProfile();
    return stat;
  }

  function invalidProfile() {
    return new Error("native_desktop_profile_invalid");
  }
}
