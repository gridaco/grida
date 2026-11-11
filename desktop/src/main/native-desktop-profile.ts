// GRIDA-SEC-004 / GRIDA-SEC-005 — isolated Desktop profiles for native chat.
import { lstatSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { App } from "electron";
import { buildDaemonSandboxPolicy } from "@grida/daemon/sandbox";
import { ProtectedRoots } from "@grida/daemon/server";
import { home } from "@grida/home";
import { isValidEndpointProviderId } from "@grida/agent";
import { defaultScratchBase } from "@grida/agent/sandbox";
import { NativeFirstProfile } from "./native-first-profile";

export namespace NativeDesktopProfile {
  export const chatStateDirectory = "native-chat";

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
  let first: NativeFirstProfile.Paths | undefined;
  let firstMediaOnly = false;

  /** Runs before Electron chooses the browser/session store and instance lock. */
  export function prepareFirst(
    app: HostApp,
    allowBirth: boolean,
    legacyPredecessor = false
  ): void {
    if (first) throw invalidProfile();
    if (allowBirth && legacyPredecessor) throw invalidProfile();
    const mediaOnly = process.argv.includes("--disable-agent");
    const supported =
      process.platform === "darwin" &&
      process.arch === "arm64" &&
      !app.commandLine.getSwitchValue("user-data-dir") &&
      !process.env.GRIDA_AGENT_USER_DATA &&
      !process.argv.some(
        (arg) =>
          arg === "--native-chat" ||
          arg.startsWith("--native-chat-") ||
          arg === "--user-data-dir" ||
          arg.startsWith("--user-data-dir=")
      );
    let protectedLegacy: ProtectedRoots | undefined;
    let locations: string[] | undefined;
    const legacyLocations = () =>
      (locations ??= legacyCandidates(
        app,
        realpathSync.native(app.getPath("temp"))
      ));
    const scope = NativeFirstProfile.open(
      app.getPath("appData"),
      () => (protectedLegacy ??= new ProtectedRoots(legacyLocations())),
      {
        supported,
        allowBirth:
          !mediaOnly && (legacyPredecessor || (supported && allowBirth)),
        legacyPredecessor,
        hasLegacyInstall: legacyPredecessor
          ? undefined
          : () => legacyLocations().some(presentOrUnverified),
      }
    );
    if (!scope || !protectedLegacy) return;
    // A promotion can select its storage paths. The media launcher separately
    // verifies completion before granting the sidecar access to those paths.
    if (
      mediaOnly &&
      scope.mode !== "native" &&
      (scope.mode !== "cutover" || !NativeFirstProfile.hasPromotion(scope))
    )
      throw invalidProfile();
    app.setPath("userData", scope.browser);
    app.setPath("sessionData", scope.browser);
    app.setPath("temp", scope.temp);
    app.setPath("documents", scope.projects);
    admitted.set(app, protectedLegacy);
    first = scope;
    firstMediaOnly = mediaOnly;
  }

  export function firstSelected(): boolean {
    return first !== undefined;
  }

  export function mediaOnly(): boolean {
    return firstMediaOnly;
  }

  export function managedPredecessor(): boolean {
    return first?.mode === "legacy";
  }

  export function managedCutover(): boolean {
    return first?.mode === "cutover";
  }

  export function beginPromotion(
    promotion: NativeFirstProfile.Promotion
  ): void {
    if (!first) throw invalidProfile();
    NativeFirstProfile.beginPromotion(first, promotion);
  }

  export function verifyPromotion(
    promotion: NativeFirstProfile.Promotion
  ): void {
    if (!first) throw invalidProfile();
    NativeFirstProfile.verifyPromotion(first, promotion);
  }

  export function managedCutoverControls(): readonly string[] {
    return first && first.mode !== "native"
      ? NativeFirstProfile.controlFiles(first)
      : [];
  }

  export function agentData(): string | undefined {
    return first?.agent ?? process.env.GRIDA_AGENT_USER_DATA;
  }

  export function selected(): boolean {
    return (
      (first !== undefined && first.mode !== "legacy") ||
      (process.argv.includes("--native-chat") &&
        !process.argv.includes("--disable-agent") &&
        (process.defaultApp === true ||
          (typeof INSIDERS !== "undefined" && INSIDERS === 1)))
    );
  }

  /** Ordinary chat keeps the browser and non-chat service owners in place. */
  export function ordinaryChat(): boolean {
    return (
      (process.platform === "darwin" || process.platform === "linux") &&
      !first &&
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
      ...new ProtectedRoots(
        legacyCandidates(app, realpathSync.native(app.getPath("temp")))
      ).metadataPaths(),
      ...(process.resourcesPath ? [path.dirname(process.resourcesPath)] : []),
    ];
  }

  export function mediaRoot(): string | undefined {
    if (first) return first.media;
    const agentData = process.env.GRIDA_AGENT_USER_DATA;
    return selected() && agentData && path.isAbsolute(agentData)
      ? path.join(path.dirname(agentData), "media")
      : undefined;
  }

  /** Shared live path denials for this admitted preview profile. */
  export function legacyRoots(app: Pick<App, "getPath">): ProtectedRoots {
    const roots = admitted.get(app);
    if ((!first && !selected()) || !roots) throw invalidProfile();
    return roots;
  }

  export async function configure(app: HostApp): Promise<Provider> {
    if (first) {
      const scope = NativeFirstProfile.open(
        app.getPath("appData"),
        () => legacyRoots(app),
        {
          supported: true,
          allowBirth: false,
          legacyPredecessor: managedPredecessor(),
        }
      );
      if (
        !scope ||
        scope.root !== first.root ||
        scope.mode !== first.mode ||
        app.getPath("userData") !== first.browser ||
        app.getPath("sessionData") !== first.browser ||
        app.getPath("temp") !== first.temp ||
        app.getPath("documents") !== first.projects
      )
        throw invalidProfile();
      return "gateway";
    }
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
    const protectedLegacy = new ProtectedRoots(
      legacyCandidates(app, systemTemp)
    );
    if (protectedLegacy.overlaps(root)) throw invalidProfile();
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
    admitted.set(app, protectedLegacy);
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

  function legacyCandidates(
    app: Pick<App, "getPath">,
    systemTemp: string
  ): string[] {
    const userHome = app.getPath("home");
    const appData = app.getPath("appData");
    const gridaHomes = [
      path.join(userHome, ".grida"),
      home.dir({ home: userHome }),
    ];
    const roots = [
      ...gridaHomes,
      ...gridaHomes.map((directory) =>
        defaultScratchBase(path.join(directory, "agent"), systemTemp)
      ),
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

  function presentOrUnverified(location: string): boolean {
    try {
      lstatSync(location);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== "ENOENT";
    }
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
