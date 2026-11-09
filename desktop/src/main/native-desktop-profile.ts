// GRIDA-SEC-004 / GRIDA-SEC-005 — isolated development profile for native chat.
import fs from "node:fs/promises";
import path from "node:path";
import type { App } from "electron";

export namespace NativeDesktopProfile {
  export function selected(): boolean {
    return (
      process.argv.includes("--native-chat") &&
      !process.argv.includes("--disable-agent") &&
      (process.defaultApp === true ||
        (typeof INSIDERS !== "undefined" && INSIDERS === 1))
    );
  }

  export function mediaRoot(): string | undefined {
    const agentData = process.env.GRIDA_AGENT_USER_DATA;
    return selected() && agentData && path.isAbsolute(agentData)
      ? path.join(path.dirname(agentData), "media")
      : undefined;
  }

  export async function configure(
    app: Pick<App, "getPath" | "setPath"> & {
      commandLine: Pick<App["commandLine"], "getSwitchValue">;
    }
  ): Promise<void> {
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
    const root = path.dirname(agentData);
    const systemTemp = await fs.realpath(app.getPath("temp"));
    const relative = path.relative(systemTemp, root);
    const reserved = new Set(["media", "projects", "temp"]);
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
