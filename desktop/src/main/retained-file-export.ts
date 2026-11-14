// GRIDA-SEC-004 — export only retained bytes to a destination chosen in Main.
import { randomUUID } from "node:crypto";
import { linkSync, type BigIntStats } from "node:fs";
import { lstat, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";

export class RetainedFileExport {
  static extension(fileName: string): string | null {
    const extension = path.extname(fileName).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : null;
  }

  static async publish(
    destination: string,
    extension: string,
    bytes: Uint8Array,
    requireCurrent: () => void
  ): Promise<void> {
    const name = path.basename(destination);
    if (
      !path.isAbsolute(destination) ||
      this.extension(name) !== extension ||
      /[<>:"/\\|?*]/.test(name)
    )
      throw new Error("retained_file_destination_invalid");

    const directory = await realpath(path.dirname(destination));
    const identity = await lstat(directory, { bigint: true });
    if (!identity.isDirectory())
      throw new Error("retained_file_destination_invalid");
    const staged = path.join(directory, `.grida-export-${randomUUID()}.tmp`);
    requireCurrent();
    const file = await open(staged, "wx", 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
      const [currentDirectory, currentFile, openedFile] = await Promise.all([
        lstat(directory, { bigint: true }),
        lstat(staged, { bigint: true }),
        file.stat({ bigint: true }),
      ]);
      if (
        !currentDirectory.isDirectory() ||
        !sameFile(identity, currentDirectory) ||
        !currentFile.isFile() ||
        !sameFile(openedFile, currentFile)
      )
        throw new Error("retained_file_destination_changed");

      // No renderer navigation can interleave with the final scope check.
      requireCurrent();
      linkSync(staged, path.join(directory, name));
    } finally {
      // Remove only the name we staged, even if a destination changed mid-save.
      try {
        const [currentFile, openedFile] = await Promise.all([
          lstat(staged, { bigint: true }),
          file.stat({ bigint: true }),
        ]);
        if (sameFile(openedFile, currentFile)) await unlink(staged);
      } catch {
        // The publication result is already known. Cleanup is best effort.
      } finally {
        await file.close().catch(() => undefined);
      }
    }
  }
}

function sameFile(first: BigIntStats, second: BigIntStats): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}
