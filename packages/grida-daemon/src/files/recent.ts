/**
 * GRIDA-SEC-004 — persistent recent-files list.
 *
 * Lives at `${userData}/recent.json` (the path is supplied by the host
 * adapter; the package never computes host-specific profile paths).
 * Stored as a most-recent-first array capped at `MAX_ENTRIES`. Each entry
 * carries:
 *
 *   - `path`     — absolute fs path. NOT exposed through the bridge
 *                  surface that crosses to the client untouched;
 *                  the client welcome-page list passes paths back
 *                  to the main process for `Open` actions, which
 *                  becomes a `/files/register` call.
 *   - `pinned`   — true → never evicted by the cap. Pin survives
 *                  across launches.
 *   - `openedAt` — last-opened wall-clock ms; used for ordering.
 *
 * Persistence model: read on startup (lazy — first call triggers
 * load), every mutation re-serializes the whole array to disk via
 * the same atomic write pattern as `io.ts`. Cheap because the file
 * is small (50 entries × small JSON objects).
 *
 * No global locking — within a single agent host process the mutations
 * are sequenced on the JS event loop. Two agent host instances against
 * the same userData would race; hosts should enforce one DaemonServer per
 * profile until a file lock lands.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "../storage/atomic-write";

export type RecentEntry = {
  path: string;
  pinned: boolean;
  opened_at: number;
};

const MAX_ENTRIES = 50;
const FILE_NAME = "recent.json";

export class RecentStore {
  private entries: RecentEntry[] = [];
  private loaded = false;
  private readonly file_path: string;

  constructor(userDataPath: string) {
    this.file_path = path.join(userDataPath, FILE_NAME);
  }

  /**
   * Lazy-load on first access so a agent host that never gets a recent
   * call doesn't pay the disk hit. Corrupt files silently reset to
   * an empty list — a recent-files list is not load-bearing, and
   * forcing the user to manually edit JSON to fix it would be
   * hostile.
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.file_path, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries = parsed.filter(
          (e): e is RecentEntry =>
            e !== null &&
            typeof e === "object" &&
            typeof e.path === "string" &&
            typeof e.pinned === "boolean" &&
            typeof e.opened_at === "number"
        );
      }
    } catch {
      // ENOENT or malformed JSON — start empty. Not an error.
      this.entries = [];
    }
  }

  private async persist(): Promise<void> {
    await atomicWrite(this.file_path, JSON.stringify(this.entries));
  }

  /** Most-recent first. Pinned entries are NOT special-ordered here —
   * the client can group them visually if it wants. */
  async list(): Promise<RecentEntry[]> {
    await this.ensureLoaded();
    return this.entries.slice();
  }

  /**
   * Move (or insert) `filePath` to position 0 with the current
   * timestamp. Preserves the `pinned` flag if the entry already
   * existed. Trims to `MAX_ENTRIES`, evicting un-pinned entries
   * first (pinned items are guaranteed to survive).
   */
  async touch(filePath: string): Promise<void> {
    await this.ensureLoaded();
    const now = Date.now();
    const idx = this.entries.findIndex((e) => e.path === filePath);
    let entry: RecentEntry;
    if (idx >= 0) {
      entry = { ...this.entries[idx], opened_at: now };
      this.entries.splice(idx, 1);
    } else {
      entry = { path: filePath, pinned: false, opened_at: now };
    }
    this.entries.unshift(entry);
    this.trim();
    await this.persist();
  }

  async pin(filePath: string, pinned: boolean): Promise<void> {
    await this.ensureLoaded();
    const idx = this.entries.findIndex((e) => e.path === filePath);
    if (idx < 0) return; // pinning a not-yet-seen path is a no-op
    this.entries[idx] = { ...this.entries[idx], pinned };
    await this.persist();
  }

  async forget(filePath: string): Promise<void> {
    await this.ensureLoaded();
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.path !== filePath);
    if (this.entries.length !== before) await this.persist();
  }

  /**
   * Cap to `MAX_ENTRIES`. Eviction policy: keep all pinned entries;
   * among un-pinned, keep the most-recently-opened. (Array is
   * already most-recent-first thanks to `touch` semantics.)
   */
  private trim(): void {
    if (this.entries.length <= MAX_ENTRIES) return;
    const pinned = this.entries.filter((e) => e.pinned);
    const unpinned = this.entries.filter((e) => !e.pinned);
    const room = Math.max(0, MAX_ENTRIES - pinned.length);
    const keptUnpinned = unpinned.slice(0, room);
    // Re-order: stable insertion order is "MRU within each group",
    // but visually we want one mixed list. We restore the original
    // most-recent-first by sorting on openedAt.
    this.entries = [...pinned, ...keptUnpinned].sort(
      (a, b) => b.opened_at - a.opened_at
    );
  }
}
