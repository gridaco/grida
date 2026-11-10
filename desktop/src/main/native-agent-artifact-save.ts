// GRIDA-SEC-004 — export only retained bytes to a destination chosen in Main.
import { randomUUID } from "node:crypto";
import { linkSync, type BigIntStats } from "node:fs";
import { lstat, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";

export class NativeAgentArtifactSave {
  static async publish(
    destination: string,
    bytes: ArrayBuffer,
    requireCurrent: () => void
  ): Promise<void> {
    const name = path.basename(destination);
    if (
      !path.isAbsolute(destination) ||
      path.extname(name).toLowerCase() !== ".png" ||
      /[<>:"/\\|?*]/.test(name)
    )
      throw new Error("native_chat_artifact_destination_invalid");

    const directory = await realpath(path.dirname(destination));
    const identity = await lstat(directory, { bigint: true });
    if (!identity.isDirectory())
      throw new Error("native_chat_artifact_destination_invalid");
    const staged = path.join(directory, `.grida-crop-${randomUUID()}.tmp`);
    requireCurrent();
    const file = await open(staged, "wx", 0o600);
    try {
      await file.writeFile(new Uint8Array(bytes));
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
        throw new Error("native_chat_artifact_destination_changed");

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
