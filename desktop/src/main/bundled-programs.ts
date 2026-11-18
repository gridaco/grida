// GRIDA-SEC-004 — native code is resolved from app-owned resources.
import fs from "node:fs/promises";
import path from "node:path";
import { pinExecutable } from "./native-agent-hooks";

export namespace BundledPrograms {
  export type Program = Readonly<{
    path: string;
    sha256: number[];
    version: string;
  }>;

  /** The installed artifact is authoritative for host-owned FX invocations. */
  export async function resolve(
    resources: string,
    name: "grida-fx"
  ): Promise<Program | undefined> {
    if (process.platform !== "darwin" && process.platform !== "linux")
      return undefined;
    const carrier = path.join(await fs.realpath(resources), "bundled-programs");
    try {
      for (const directory of [carrier, path.join(carrier, "bin")]) {
        const stat = await fs.lstat(directory);
        if (!stat.isDirectory() || (stat.mode & 0o022) !== 0)
          throw new Error("bundled_program_directory_invalid");
      }
      const executable = path.join(carrier, "bin", name);
      const pin = await pinExecutable(executable);
      if (pin.path !== executable)
        throw new Error("bundled_program_path_invalid");
      const versionPath = path.join(carrier, "fx-version");
      const stat = await fs.lstat(versionPath);
      if (!stat.isFile() || stat.size > 64 || (stat.mode & 0o022) !== 0)
        throw new Error("bundled_program_version_invalid");
      const version = (await fs.readFile(versionPath, "utf8")).trim();
      if (!/^\d+\.\d+\.\d+$/.test(version))
        throw new Error("bundled_program_version_invalid");
      return { ...pin, version };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
}
