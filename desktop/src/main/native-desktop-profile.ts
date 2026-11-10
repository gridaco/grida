// GRIDA-SEC-004 / GRIDA-SEC-005 — isolated Desktop profiles for native chat.
import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { App } from "electron";
import { ProtectedRoots } from "@grida/daemon/server";
import { home } from "@grida/home";
import { defaultScratchBase } from "@grida/agent/sandbox";
import { NativeFirstProfile } from "./native-first-profile";

export namespace NativeDesktopProfile {
  export type Provider = "gateway" | "chatgpt";
  type HostApp = Pick<App, "getPath" | "setPath"> & {
    commandLine: Pick<App["commandLine"], "getSwitchValue">;
  };
  const admitted = new WeakMap<Pick<App, "getPath">, ProtectedRoots>();
  let first: NativeFirstProfile.Paths | undefined;

  /** Runs before Electron chooses the browser/session store and instance lock. */
  export function prepareFirst(app: HostApp, allowBirth: boolean): void {
    if (first) throw invalidProfile();
    const supported =
      process.platform === "darwin" &&
      process.arch === "arm64" &&
      !app.commandLine.getSwitchValue("user-data-dir") &&
      !process.env.GRIDA_AGENT_USER_DATA &&
      !process.argv.some(
        (arg) =>
          arg === "--disable-agent" ||
          arg === "--native-chat" ||
          arg.startsWith("--native-chat-") ||
          arg === "--user-data-dir" ||
          arg.startsWith("--user-data-dir=")
      );
    let protectedLegacy: ProtectedRoots | undefined;
    const scope = NativeFirstProfile.open(
      app.getPath("appData"),
      () =>
        (protectedLegacy ??= captureLegacyRoots(
          app,
          realpathSync.native(app.getPath("temp"))
        )),
      { supported, allowBirth }
    );
    if (!scope || !protectedLegacy) return;
    app.setPath("userData", scope.browser);
    app.setPath("sessionData", scope.browser);
    app.setPath("temp", scope.temp);
    app.setPath("documents", scope.projects);
    admitted.set(app, protectedLegacy);
    first = scope;
  }

  export function firstSelected(): boolean {
    return first !== undefined;
  }

  export function agentData(): string | undefined {
    return first?.agent ?? process.env.GRIDA_AGENT_USER_DATA;
  }

  export function selected(): boolean {
    return (
      first !== undefined ||
      (process.argv.includes("--native-chat") &&
        !process.argv.includes("--disable-agent") &&
        (process.defaultApp === true ||
          (typeof INSIDERS !== "undefined" && INSIDERS === 1)))
    );
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
    if (!selected() || !roots) throw invalidProfile();
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
        }
      );
      if (
        !scope ||
        scope.root !== first.root ||
        app.getPath("userData") !== first.browser ||
        app.getPath("sessionData") !== first.browser
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
    const choices = process.argv.filter(
      (arg) =>
        arg === "--native-chat-provider" ||
        arg.startsWith("--native-chat-provider=")
    );
    if (
      choices.length > 1 ||
      (choices[0] !== undefined &&
        choices[0] !== "--native-chat-provider=gateway" &&
        choices[0] !== "--native-chat-provider=chatgpt")
    )
      throw invalidProfile();
    const provider =
      choices[0] === "--native-chat-provider=chatgpt" ? "chatgpt" : "gateway";
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
    const protectedLegacy = captureLegacyRoots(app, systemTemp);
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

  function captureLegacyRoots(
    app: Pick<App, "getPath">,
    systemTemp: string
  ): ProtectedRoots {
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
    return new ProtectedRoots(roots);
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
