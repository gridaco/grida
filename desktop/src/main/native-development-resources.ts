// GRIDA-SEC-004 — a development checkout can be a workspace, so it cannot
// also own the executables trusted by the active native launch.
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import fx from "../../../extensions/desktop-fx/extension.json";
import type { DesktopProfile } from "./desktop-profile";
import { requirePrivateDirectory } from "./native-agent-hooks";

export namespace NativeDevelopmentResources {
  /** Main holds the instance lock before publishing this profile's runtime. */
  export async function prepare(
    profile: DesktopProfile
  ): Promise<DesktopProfile> {
    if (
      profile.isPackaged ||
      profile.nativeChat === "disabled" ||
      process.platform === "win32"
    )
      return profile;

    const browserData = await fs.realpath(profile.userData);
    const browser = await fs.lstat(browserData);
    if (
      !browser.isDirectory() ||
      browser.uid !== process.geteuid?.() ||
      (browser.mode & 0o022) !== 0
    )
      throw invalid();
    const resourcesPath = path.join(browserData, "native-resources");
    // Keep the published paths stable because native captures include the
    // paths protected from writes. Build and validate before replacing them.
    const staging = await fs.mkdtemp(
      path.join(browserData, ".native-resources-")
    );
    try {
      await requirePrivateDirectory(staging);
      await checkSourceDirectory(profile.resourcesPath);
      const agent = path.join(profile.resourcesPath, "native-agent");
      await checkSourceDirectory(agent);
      const stagedAgent = path.join(staging, "native-agent");
      await fs.mkdir(stagedAgent, { mode: 0o700 });
      for (const name of ["grida-agent", "agent-kit-sandbox-helper"])
        await copy(path.join(agent, name), path.join(stagedAgent, name), true);
      await copyBundledProgram(profile.resourcesPath, staging);

      if (await exists(resourcesPath)) {
        await requirePrivateDirectory(resourcesPath);
        await fs.rm(resourcesPath, { recursive: true });
      }
      await fs.rename(staging, resourcesPath);
      return Object.freeze({ ...profile, resourcesPath });
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }

  async function copyBundledProgram(source: string, staging: string) {
    const carrier = path.join(source, fx.resourceDirectory);
    if (!(await exists(carrier))) return;
    const bin = path.join(carrier, "bin");
    await checkSourceDirectory(carrier);
    await checkSourceDirectory(bin);
    const destination = path.join(staging, fx.resourceDirectory);
    const stagedBin = path.join(destination, "bin");
    await fs.mkdir(stagedBin, { recursive: true, mode: 0o700 });
    await copy(
      path.join(bin, fx.command),
      path.join(stagedBin, fx.command),
      true
    );
    for (const name of [fx.versionFile, fx.licenseFile])
      await copy(path.join(carrier, name), path.join(destination, name));
  }

  async function exists(location: string): Promise<boolean> {
    try {
      await fs.lstat(location);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async function checkSourceDirectory(directory: string) {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || (stat.mode & 0o022) !== 0) throw invalid();
  }

  async function copy(source: string, destination: string, executable = false) {
    const file = await fs.open(
      source,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    try {
      const stat = await file.stat();
      const limit = executable ? 128 * 1024 * 1024 : 64 * 1024;
      if (
        !stat.isFile() ||
        (stat.mode & 0o022) !== 0 ||
        (executable && (stat.mode & 0o111) === 0) ||
        stat.size < 1 ||
        stat.size > limit
      )
        throw invalid();
      const bytes = Buffer.alloc(stat.size);
      for (let offset = 0; offset < bytes.length; ) {
        const { bytesRead } = await file.read(
          bytes,
          offset,
          bytes.length - offset,
          offset
        );
        if (!bytesRead) throw invalid();
        offset += bytesRead;
      }
      const after = await file.stat();
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
        throw invalid();
      await fs.writeFile(destination, bytes, {
        flag: "wx",
        mode: executable ? 0o500 : 0o400,
      });
    } finally {
      await file.close();
    }
  }

  function invalid() {
    return new Error("native_development_resources_invalid");
  }
}
