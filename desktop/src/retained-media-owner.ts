// GRIDA-SEC-004 — one strict sidecar holds the retained settings writer.
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

export namespace RetainedMediaOwner {
  let lock: DatabaseSync | undefined;

  export async function acquire(settings: string): Promise<void> {
    const { DatabaseSync } = await import("node:sqlite");
    const filename = path.join(settings, ".sidecar-owner.sqlite");
    const denied = new Error("retained_media_owner_unavailable");
    const fd = fs.openSync(
      filename,
      fs.constants.O_RDWR |
        fs.constants.O_CREAT |
        fs.constants.O_NOFOLLOW |
        fs.constants.O_NONBLOCK,
      0o600
    );
    const before = (() => {
      try {
        return fs.fstatSync(fd, { bigint: true });
      } finally {
        fs.closeSync(fd);
      }
    })();
    if (
      lock ||
      !before.isFile() ||
      before.uid !== BigInt(process.geteuid!()) ||
      before.nlink !== 1n ||
      (before.mode & 0o7777n) !== 0o600n ||
      before.size !== 0n
    )
      throw denied;
    const owner = new DatabaseSync(filename);
    try {
      // The database has no data. Hold the kernel-backed SQLite write lock
      // through process exit, even if the supervising Electron Main dies.
      owner.exec("PRAGMA busy_timeout = 0; BEGIN IMMEDIATE;");
      const current = fs.lstatSync(filename, { bigint: true });
      if (
        current.dev !== before.dev ||
        current.ino !== before.ino ||
        current.birthtimeNs !== before.birthtimeNs ||
        current.nlink !== 1n
      )
        throw denied;
      lock = owner;
    } catch {
      owner.close();
      throw denied;
    }
  }
}
