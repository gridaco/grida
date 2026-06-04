/**
 * Atomic file write — `writeFile(tmp) → rename(tmp, final)` so a
 * reader never sees a half-written file. Used everywhere the agent host
 * persists state under `userData`: `recent.json`, `workspaces.json`,
 * `auth.json`, plus user-owned `*.svg` / `*.grida` content.
 *
 * The tmp file is created with `0o600` so secrets in `auth.json` never
 * touch disk world-readable. Callers that need a different mode pass
 * one in via `opts.mode`; callers that don't get safe-by-default.
 *
 * If `rename` fails (e.g. cross-device, disk full), we best-effort
 * `unlink` the tmp file so we don't leave debris under the user's
 * data dir. The original error propagates to the caller — that's the
 * one the route handler wants to surface.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type AtomicWriteOptions = {
  /** File mode for the tmp file. Defaults to `0o600` (owner-only). */
  mode?: number;
  /**
   * When true, ensure the parent directory exists before writing.
   * Defaults to `true` because most agent host writes are to lazily-
   * created paths under `userData`.
   */
  ensure_dir?: boolean;
};

export async function atomicWrite(
  filePath: string,
  content: string | Uint8Array,
  opts: AtomicWriteOptions = {}
): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const rand = crypto.randomBytes(8).toString("hex");
  const tmpPath = path.join(dir, `.${base}.${rand}.tmp`);

  if (opts.ensure_dir !== false) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // mkdir errors resurface on writeFile below.
    }
  }

  let tmpCreated = false;
  try {
    await fs.writeFile(tmpPath, content, { mode: opts.mode ?? 0o600 });
    tmpCreated = true;
    await fs.rename(tmpPath, filePath);
    tmpCreated = false;
  } catch (err) {
    if (tmpCreated) {
      try {
        await fs.unlink(tmpPath);
      } catch {
        // ignored — best-effort cleanup
      }
    }
    throw err;
  }
}
