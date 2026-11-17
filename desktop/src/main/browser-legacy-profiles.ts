/** GRIDA-SEC-016 — explicit removal of recognized experimental browser stores. */
import fs from "node:fs/promises";
import path from "node:path";

/** No discovery, merging or deletion occurs until the confirmed global clear. */
export class BrowserLegacyProfiles {
  static async clear(sharedStoragePath: string | null): Promise<void> {
    if (!sharedStoragePath) return;
    const partitions = path.dirname(sharedStoragePath);
    if (
      !path.isAbsolute(sharedStoragePath) ||
      path.basename(sharedStoragePath) !== "grida-browser" ||
      path.basename(partitions) !== "Partitions"
    )
      throw new Error("browser_legacy_profile_root_invalid");
    let parent;
    try {
      parent = await fs.lstat(partitions);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (!parent.isDirectory() || parent.isSymbolicLink()) return;
    for (const entry of await fs.readdir(partitions, { withFileTypes: true })) {
      if (
        !/^grida-browser-workspace-[a-f0-9]{16}$/.test(entry.name) ||
        !entry.isDirectory() ||
        entry.isSymbolicLink()
      )
        continue;
      const target = path.join(partitions, entry.name);
      let info;
      try {
        info = await fs.lstat(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (!info.isDirectory() || info.isSymbolicLink()) continue;
      // fs.rm removes links themselves, including nested links; it does not
      // traverse their targets. Names and the parent are native-owned inputs.
      await fs.rm(target, { recursive: true, force: true });
    }
  }
}
