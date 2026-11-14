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
 * The owning store serializes reads and mutations through atomic
 * publication. Hosts sharing a data directory must share one store owner.
 */

import { constants } from "node:fs";
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
const MAX_PRIVATE_FILE_BYTES = 2 * 1024 * 1024;

export class RecentStore {
  private entries: RecentEntry[] = [];
  private loaded = false;
  private tail = Promise.resolve();
  private readonly file_path: string;

  constructor(
    userDataPath: string,
    private readonly options: { privateFile?: true } = {}
  ) {
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
    const raw = await this.read().catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
    try {
      const parsed: unknown = raw === null ? null : JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries = parsed
          .filter(
            (e): e is RecentEntry =>
              e !== null &&
              typeof e === "object" &&
              typeof e.path === "string" &&
              typeof e.pinned === "boolean" &&
              typeof e.opened_at === "number"
          )
          .map(({ path, pinned, opened_at }) => ({ path, pinned, opened_at }));
      }
    } catch {
      // A malformed recent list starts empty.
      this.entries = [];
    }
    this.loaded = true;
  }

  private async read(): Promise<string> {
    if (!this.options.privateFile) return fs.readFile(this.file_path, "utf8");
    const file = await fs.open(
      this.file_path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.uid !== process.geteuid?.() ||
        stat.nlink !== 1 ||
        (stat.mode & 0o7777) !== 0o600 ||
        stat.size > MAX_PRIVATE_FILE_BYTES
      ) {
        throw new Error("recent_file_unavailable");
      }
      const bytes = Buffer.alloc(stat.size + 1);
      const { bytesRead } = await file.read(bytes);
      if (bytesRead !== stat.size) throw new Error("recent_file_unavailable");
      return bytes.toString("utf8", 0, bytesRead);
    } finally {
      await file.close();
    }
  }

  private async persist(entries: RecentEntry[]): Promise<void> {
    await atomicWrite(this.file_path, JSON.stringify(entries));
    this.entries = entries;
  }

  private serialize<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      await this.ensureLoaded();
      return operation();
    });
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  /** Most-recent first. Pinned entries are NOT special-ordered here —
   * the client can group them visually if it wants. */
  list(): Promise<RecentEntry[]> {
    return this.serialize(() => this.entries.map((entry) => ({ ...entry })));
  }

  /**
   * Move (or insert) `filePath` to position 0 with the current
   * timestamp. Preserves the `pinned` flag if the entry already
   * existed. Trims to `MAX_ENTRIES`, evicting un-pinned entries
   * first (pinned items are guaranteed to survive).
   */
  touch(filePath: string): Promise<void> {
    return this.serialize(() => {
      const pinned =
        this.entries.find((entry) => entry.path === filePath)?.pinned ?? false;
      return this.persist(
        this.trim([
          { path: filePath, pinned, opened_at: Date.now() },
          ...this.entries.filter((entry) => entry.path !== filePath),
        ])
      );
    });
  }

  pin(filePath: string, pinned: boolean): Promise<void> {
    return this.serialize(() => {
      const index = this.entries.findIndex((entry) => entry.path === filePath);
      if (index < 0 || this.entries[index]!.pinned === pinned) return;
      const next = this.entries.slice();
      next[index] = { ...next[index]!, pinned };
      return this.persist(next);
    });
  }

  forget(filePath: string): Promise<void> {
    return this.serialize(() => {
      const next = this.entries.filter((entry) => entry.path !== filePath);
      if (next.length !== this.entries.length) return this.persist(next);
    });
  }

  /**
   * Cap to `MAX_ENTRIES`. Eviction policy: keep all pinned entries;
   * among un-pinned, keep the most-recently-opened. (Array is
   * already most-recent-first thanks to `touch` semantics.)
   */
  private trim(entries: RecentEntry[]): RecentEntry[] {
    if (entries.length <= MAX_ENTRIES) return entries;
    const pinned = entries.filter((entry) => entry.pinned);
    const unpinned = entries.filter((entry) => !entry.pinned);
    const room = Math.max(0, MAX_ENTRIES - pinned.length);
    const keptUnpinned = unpinned.slice(0, room);
    // Re-order: stable insertion order is "MRU within each group",
    // but visually we want one mixed list. We restore the original
    // most-recent-first by sorting on openedAt.
    return [...pinned, ...keptUnpinned].sort(
      (a, b) => b.opened_at - a.opened_at
    );
  }
}
