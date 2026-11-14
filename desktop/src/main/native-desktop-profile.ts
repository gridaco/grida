// GRIDA-SEC-004 / GRIDA-SEC-005 — isolated Desktop profiles for native chat.
import fs from "node:fs/promises";
import path from "node:path";
import type { App } from "electron";
import { buildDaemonSandboxPolicy } from "@grida/daemon/sandbox";
import { ProtectedRoots } from "@grida/daemon/server";
import { home } from "@grida/home";
import { isValidEndpointProviderId } from "@grida/ai-host";

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
  const admitted = new WeakMap<Pick<App, "getPath">, ProtectedRoots>();

  export function agentData(): string | undefined {
    return process.env.GRIDA_AGENT_USER_DATA;
  }

  export function selected(): boolean {
    return (
      process.argv.includes("--native-chat") &&
      !process.argv.includes("--disable-agent") &&
      (process.defaultApp === true ||
        (typeof INSIDERS !== "undefined" && INSIDERS === 1))
    );
  }

  /** Ordinary chat keeps the browser and non-chat service owners in place. */
  export function ordinaryChat(): boolean {
    return (
      (process.platform === "darwin" || process.platform === "linux") &&
      !process.argv.some(
        (arg) =>
          arg === "--disable-agent" ||
          arg === "--native-chat" ||
          arg.startsWith("--native-chat-")
      )
    );
  }

  /** Development stages the same resource layout without modifying Electron. */
  export function resourcesPath(
    app: Pick<App, "isPackaged" | "getAppPath">
  ): string {
    return app.isPackaged
      ? process.resourcesPath
      : path.join(app.getAppPath(), ".native-resources");
  }

  export function ordinaryChatProtectedPaths(app: HostApp): readonly string[] {
    const userHome = app.getPath("home");
    const { filesystem } = buildDaemonSandboxPolicy({
      user_data: path.join(home.dir({ home: userHome }), "agent"),
      home: userHome,
    });
    return [
      ...filesystem.deny_read,
      ...new ProtectedRoots(installRoots(app)).metadataPaths(),
      ...(process.resourcesPath ? [path.dirname(process.resourcesPath)] : []),
    ];
  }

  export function mediaRoot(): string | undefined {
    const agentData = process.env.GRIDA_AGENT_USER_DATA;
    return selected() && agentData && path.isAbsolute(agentData)
      ? path.join(path.dirname(agentData), "media")
      : undefined;
  }

  /**
   * Grida homes and installed Desktop data this admitted preview profile must
   * not reach.
   */
  export function protectedRoots(app: Pick<App, "getPath">): ProtectedRoots {
    const roots = admitted.get(app);
    if (!selected() || !roots) throw invalidProfile();
    return roots;
  }

  export async function configure(app: HostApp): Promise<Provider> {
    const agentData = process.env.GRIDA_AGENT_USER_DATA;
    const browserData = app.commandLine.getSwitchValue("user-data-dir");
    if (
      !selected() ||
      !agentData ||
      !path.isAbsolute(agentData) ||
      !path.isAbsolute(browserData) ||
      browserData !== app.getPath("userData")
    )
      throw invalidProfile();
    const provider = selectedProvider(process.argv);
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
      agentData === browserData ||
      path.dirname(browserData) !== root ||
      reserved.has(path.basename(agentData).toLowerCase()) ||
      reserved.has(path.basename(browserData).toLowerCase())
    )
      throw invalidProfile();
    const installed = new ProtectedRoots(installRoots(app));
    if (installed.overlaps(root)) throw invalidProfile();
    await checkDirectory(root);
    const browser = await checkDirectory(browserData);
    const occupied = new Set([`${browser.dev}:${browser.ino}`]);
    const temp = path.join(root, "temp");
    const projects = path.join(root, "projects");
    for (const folder of [
      agentData,
      temp,
      projects,
      path.join(root, "media"),
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
    app.setPath("temp", temp);
    app.setPath("documents", projects);
    admitted.set(app, installed);
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

  /** Grida homes and every Desktop edition's application data. */
  function installRoots(app: Pick<App, "getPath">): string[] {
    const userHome = app.getPath("home");
    const appData = app.getPath("appData");
    const roots = [
      path.join(userHome, ".grida"),
      home.dir({ home: userHome }),
      ...["Grida", "Grida Insiders", "Grida (Insiders)", "desktop"].map(
        (name) => path.join(appData, name)
      ),
    ];
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
