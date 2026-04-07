// ---------------------------------------------------------------------------
// Preview — tentative single-delta, never committed to the stack directly
// ---------------------------------------------------------------------------

import type {
  Delta,
  Preview,
  PreviewState,
  CommittedTransaction,
  TransactionOrigin,
} from "./types";

let nextPreviewId = 1;

export class PreviewImpl implements Preview {
  readonly id: string;
  readonly label: string;

  private _state: PreviewState = "active";
  private _currentDelta: Delta | null = null;

  /** Callback set by History to receive committed result. */
  onCommit: ((tx: CommittedTransaction) => void) | null = null;
  onDiscard: (() => void) | null = null;

  constructor(label: string) {
    this.id = `preview_${nextPreviewId++}`;
    this.label = label;
  }

  get state(): PreviewState {
    return this._state;
  }

  get currentDelta(): Delta | null {
    return this._currentDelta;
  }

  set(delta: Delta): void {
    if (this._state !== "active") {
      throw new Error(`Cannot set on ${this._state} preview "${this.label}"`);
    }
    // Revert previous tentative delta first
    const prev = this._currentDelta;
    if (prev) {
      prev.revert();
      // Clear after successful revert so we don't double-revert on error below
      this._currentDelta = null;
    }
    // Apply new — if this throws, bookkeeping is consistent (no current delta)
    delta.apply();
    this._currentDelta = delta;
  }

  commit(): void {
    if (this._state !== "active") {
      throw new Error(`Cannot commit ${this._state} preview "${this.label}"`);
    }
    this._state = "committed";

    if (this._currentDelta && this.onCommit) {
      const origin: TransactionOrigin = { type: "local" };
      const committed: CommittedTransaction = {
        id: this.id,
        label: this.label,
        deltas: [this._currentDelta],
        origin,
        opts: {},
      };
      this.onCommit(committed);
    }
  }

  discard(): void {
    if (this._state !== "active") {
      throw new Error(`Cannot discard ${this._state} preview "${this.label}"`);
    }

    // Revert the current delta before changing state so that if revert()
    // throws, the preview remains "active" and can be retried or committed.
    if (this._currentDelta) {
      this._currentDelta.revert();
      this._currentDelta = null;
    }

    this._state = "discarded";

    if (this.onDiscard) {
      this.onDiscard();
    }
  }
}

/** Reset the ID counter (for deterministic tests). */
export function __resetPreviewIdCounter(): void {
  nextPreviewId = 1;
}
