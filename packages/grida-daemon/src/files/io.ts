/**
 * GRIDA-SEC-004 — atomic file I/O behind the agent host's `/files/*` routes.
 *
 * Reads return `{content, mtime}`; the client can compare `mtime` on
 * subsequent reads/writes to detect external changes (the file was
 * edited from outside Grida between two reads). The agent host doesn't
 * own conflict resolution — that's a UI decision — it just gives the
 * client the freshness token it needs to ask.
 *
 * Writes are atomic — we write to a sibling temp file in the same
 * directory, then `rename` into place. `rename` is atomic on POSIX
 * within the same filesystem, so a reader never sees a half-written
 * file. We do NOT fsync — power-loss durability is sacrificed for
 * write throughput; acceptable for user `.svg`/`.grida` content where
 * the user can re-save. The temp file is mode 0o600 so an orphaned
 * tmp left by a process kill isn't world-readable. Critically, we DO
 * NOT truncate-in-place with `fs.writeFile` on the real path: a crash
 * between the truncate and the final write would leave the user's
 * document permanently empty.
 *
 * UTF-8 is the only supported encoding for V1. Both `.svg` and
 * `.grida` (FlatBuffers-in-JSON wrapper) are text formats. If we ever
 * support a true binary `.grida` archive, this module gets a sibling
 * `readBytes` / `writeBytes` — don't try to overload `content: string`.
 *
 * `watch` is not implemented — the external-watcher SSE wants chokidar
 * and is its own slice of work. The route returns 501 with a clear
 * marker.
 */

import fs from "node:fs/promises";
import os from "node:os";
import { atomicWrite } from "../storage/atomic-write";
import path from "node:path";
import type { FileRegistry } from "./registry";

export namespace filesIo {
  export class DocIdNotFoundError extends Error {
    constructor(public readonly docId: string) {
      super(`docId not registered: ${docId}`);
      this.name = "DocIdNotFoundError";
    }
  }

  export type ReadResult = {
    content: string;
    mtime: number;
    /**
     * Basename — the last segment of the registered path, e.g.
     * `"logo.svg"`. Exposed so the client's title bar can show the
     * honest file name instead of an opaque docId. Display-only — the
     * client still cannot ask for a path; it just learns the name of
     * the one it's already authorized to read.
     */
    filename: string;
    /**
     * Home-tilde-shortened absolute path, e.g.
     * `"~/Documents/Designs/logo.svg"`. The home-prefix strip is
     * deliberate: it gives the user an unambiguous "this is the real
     * file on disk" tooltip without leaking their OS username into
     * logs or error reports the client might emit. On Windows the
     * tilde rewrite doesn't apply and the full path comes through.
     */
    display_path: string;
  };
  export type WriteResult = { mtime: number };

  /**
   * Reads the file at the registered path. Updates the registry's
   * cached `mtime` so subsequent writes can detect a concurrent
   * external edit (cheap freshness token; not a full lock).
   */
  export async function readFile(
    registry: FileRegistry,
    docId: string
  ): Promise<ReadResult> {
    const entry = registry.getEntry(docId);
    if (!entry) throw new DocIdNotFoundError(docId);
    // Read content + stat in parallel — they're independent.
    const [content, stat] = await Promise.all([
      fs.readFile(entry.path, "utf8"),
      fs.stat(entry.path),
    ]);
    const mtime = stat.mtimeMs;
    registry._setMtime(docId, mtime);
    return {
      content,
      mtime,
      filename: path.basename(entry.path),
      display_path: toDisplayPath(entry.path),
    };
  }

  /**
   * Writes atomically via temp-file + rename. Sequence:
   *
   *   1. write to `<dir>/.<basename>.<randomHex>.tmp` with mode 0o600
   *      (caller-only readable — partial artifact is never world-visible).
   *   2. close the handle (rename works without it, but be explicit).
   *   3. `rename` to the final path. `rename` is atomic on POSIX within
   *      the same filesystem; we keep the temp in the same directory
   *      precisely to satisfy that constraint.
   *   4. stat the final path to get the new mtime.
   *
   * On error after the temp file is created, we best-effort unlink it
   * so we don't leak dot-files into the user's directory.
   */
  export async function writeFile(
    registry: FileRegistry,
    docId: string,
    content: string
  ): Promise<WriteResult> {
    const entry = registry.getEntry(docId);
    if (!entry) throw new DocIdNotFoundError(docId);
    // 0o600 is the atomicWrite default — owner-only, set at open-time
    // so a half-written tmp never lands world-readable.
    await atomicWrite(entry.path, content, { ensure_dir: false });
    const stat = await fs.stat(entry.path);
    const mtime = stat.mtimeMs;
    registry._setMtime(docId, mtime);
    return { mtime };
  }
}

/**
 * Project an absolute fs path into a friendly display form.
 *
 * On POSIX, strips the user's home prefix and replaces it with `~/`
 * (matching the convention most local tools use).
 * On Windows, returns the path unchanged — Windows users don't expect
 * `~` to mean their profile dir in chrome.
 *
 * Pure string manipulation — no fs calls, no normalization. The
 * registry has already canonicalized via `realpath` at register time,
 * so the input here is already absolute.
 */
function toDisplayPath(absPath: string): string {
  const home = os.homedir();
  if (!home) return absPath;
  if (absPath === home) return "~";
  // `home + path.sep` so we don't accidentally rewrite `/Users/alice2/...`
  // when the home is `/Users/alice` (prefix match must end on a separator).
  const prefix = home + path.sep;
  if (absPath.startsWith(prefix)) {
    return "~" + path.sep + absPath.slice(prefix.length);
  }
  return absPath;
}
