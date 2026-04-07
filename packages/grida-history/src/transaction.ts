// ---------------------------------------------------------------------------
// Transaction — groups Deltas into a single undo/redo step
// ---------------------------------------------------------------------------

import type {
  Delta,
  Transaction,
  TransactionState,
  TransactionOptions,
  CommittedTransaction,
  TransactionOrigin,
} from "./types";

let nextId = 1;

export class TransactionImpl implements Transaction {
  readonly id: string;
  readonly label: string;
  readonly opts: TransactionOptions;

  private _state: TransactionState = "open";
  private _deltas: Delta[] = [];
  private _parent: TransactionImpl | null;

  /** Callback set by History to receive committed result. */
  onCommit: ((tx: CommittedTransaction) => void) | null = null;
  /** Callback set by History to receive error during abort. */
  onError: ((tx: TransactionImpl, error: unknown) => void) | null = null;

  constructor(
    label: string,
    opts: TransactionOptions,
    parent: TransactionImpl | null
  ) {
    this.id = `tx_${nextId++}`;
    this.label = label;
    this.opts = opts;
    this._parent = parent;
  }

  get state(): TransactionState {
    return this._state;
  }

  get deltas(): ReadonlyArray<Delta> {
    return this._deltas;
  }

  get parent(): TransactionImpl | null {
    return this._parent;
  }

  push(delta: Delta): void {
    if (this._state !== "open") {
      throw new Error(
        `Cannot push to ${this._state} transaction "${this.label}"`
      );
    }
    this._deltas.push(delta);
  }

  commit(): void {
    if (this._state !== "open") {
      throw new Error(
        `Cannot commit ${this._state} transaction "${this.label}"`
      );
    }
    this._state = "committed";

    if (this._parent) {
      // Nested: merge deltas into parent
      for (const d of this._deltas) {
        this._parent.push(d);
      }
    } else {
      // Top-level: notify History
      if (this._deltas.length > 0 && this.onCommit) {
        const origin: TransactionOrigin = this.opts.origin ?? {
          type: "local",
        };
        const committed: CommittedTransaction = {
          id: this.id,
          label: this.label,
          deltas: [...this._deltas],
          origin,
          opts: this.opts,
        };
        this.onCommit(committed);
      }
    }
  }

  abort(): void {
    if (this._state !== "open") {
      throw new Error(
        `Cannot abort ${this._state} transaction "${this.label}"`
      );
    }
    this._state = "aborted";

    // Revert in reverse order — best effort
    for (let i = this._deltas.length - 1; i >= 0; i--) {
      try {
        this._deltas[i].revert();
      } catch (err) {
        // Invariant 13: on failure, remaining reverts are skipped
        if (this.onError) {
          this.onError(this, err);
        }
        break;
      }
    }
  }
}

/** Reset the ID counter (for deterministic tests). */
export function __resetTransactionIdCounter(): void {
  nextId = 1;
}
