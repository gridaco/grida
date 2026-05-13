/**
 * Session-internal undo/redo stack with merge-by-EditKind grouping.
 *
 * Mirrors `crates/grida/src/text_edit/history.rs`. Same `EditKind`
 * vocabulary, same 2-second merge timeout. Stores snapshots, not
 * diffs — fine at our text lengths.
 *
 * When the orchestrator dispatches a mutation, it classifies the
 * change as an `EditKind`. Mergeable kinds (typing, backspace,
 * delete) within the timeout extend the current run; non-mergeable
 * kinds (paste, ime_commit, cut) always push discrete entries. Style
 * mutations (V2) are also discrete.
 */

import type { EditKind } from "./edit-command";
import type { SessionSnapshot } from "./session";

/**
 * Non-null subset of `EditKind` — every history entry corresponds to a
 * real mutation. `apply_command` returns `EditKind | null`; the
 * orchestrator only pushes when the kind is non-null, so the stack
 * itself never sees `null`.
 */
type RecordedEditKind = Exclude<EditKind, null>;

const MERGE_TIMEOUT_MS = 2000;
/** Hard cap on session-history entries. Prevents unbounded growth
 *  during long edit sessions; the oldest entry is dropped on overflow.
 *  Document-level history (host's HistoryProvider) is the canonical
 *  durable record. */
const MAX_ENTRIES = 100;

const MERGEABLE: ReadonlySet<RecordedEditKind> = new Set<RecordedEditKind>([
  "typing",
  "backspace",
  "delete",
]);

type Entry = {
  before: SessionSnapshot;
  after: SessionSnapshot;
  kind: RecordedEditKind;
  /** ms timestamp of the latest event that contributed to this entry. */
  last_at: number;
};

export class HistoryStack {
  private entries: Entry[] = [];
  /** Index of the next entry to undo. `entries.length` = at head. */
  private cursor = 0;
  /** Test/seam: pluggable clock for deterministic tests. */
  constructor(private readonly now: () => number = () => Date.now()) {}

  get canUndo(): boolean {
    return this.cursor > 0;
  }
  get canRedo(): boolean {
    return this.cursor < this.entries.length;
  }
  get size(): number {
    return this.entries.length;
  }

  /**
   * Record a mutation. `before` is the snapshot *before* the change,
   * `after` is the snapshot *after*. The stack decides whether to
   * merge with the previous entry or push a new one.
   */
  push(
    before: SessionSnapshot,
    after: SessionSnapshot,
    kind: RecordedEditKind
  ): void {
    // Truncate any redo tail.
    if (this.cursor < this.entries.length) {
      this.entries.length = this.cursor;
    }
    const t = this.now();
    const top = this.entries[this.entries.length - 1];
    if (
      top &&
      top.kind === kind &&
      MERGEABLE.has(kind) &&
      t - top.last_at <= MERGE_TIMEOUT_MS
    ) {
      // Merge: keep `before` from the oldest entry (so undo goes back
      // to the start of the run), update `after` and `last_at`.
      top.after = after;
      top.last_at = t;
      return;
    }
    this.entries.push({ before, after, kind, last_at: t });
    if (this.entries.length > MAX_ENTRIES) {
      const drop = this.entries.length - MAX_ENTRIES;
      this.entries.splice(0, drop);
      this.cursor = Math.max(0, this.cursor - drop);
    }
    this.cursor = this.entries.length;
  }

  /** Returns the snapshot to restore, or null if nothing to undo. */
  undo(): SessionSnapshot | null {
    if (!this.canUndo) return null;
    this.cursor--;
    return this.entries[this.cursor].before;
  }

  /** Returns the snapshot to restore, or null if nothing to redo. */
  redo(): SessionSnapshot | null {
    if (!this.canRedo) return null;
    const e = this.entries[this.cursor];
    this.cursor++;
    return e.after;
  }

  clear(): void {
    this.entries = [];
    this.cursor = 0;
  }
}
