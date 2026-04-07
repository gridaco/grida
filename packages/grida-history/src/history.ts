// ---------------------------------------------------------------------------
// History — public facade. Owns Stack, manages Transaction/Preview lifecycles.
// ---------------------------------------------------------------------------

import type {
  History,
  HistoryEvents,
  HistoryProvider,
  TransactionOptions,
  Transaction,
  Preview,
  CommittedTransaction,
  Disposable,
  Delta,
} from "./types";
import { StackImpl, type StackOptions } from "./stack";
import { TransactionImpl } from "./transaction";
import { PreviewImpl } from "./preview";
import { EventEmitter } from "./events";

export interface HistoryOptions extends StackOptions {}

export class HistoryImpl implements History {
  private _stack: StackImpl;
  private _events = new EventEmitter<HistoryEvents>();

  private _providers = new Map<string, HistoryProvider>();
  private _activeTransactions: TransactionImpl[] = []; // outermost first
  private _activePreviews = new Set<PreviewImpl>();

  private _busy = false;
  private _undoQueue: Promise<void> = Promise.resolve();

  constructor(opts?: HistoryOptions) {
    this._stack = new StackImpl(opts);
  }

  // -- Stack (public readonly) ----------------------------------------------

  get stack(): StackImpl {
    return this._stack;
  }

  get busy(): boolean {
    return this._busy;
  }

  // -- Transaction lifecycle ------------------------------------------------

  begin(label: string, opts?: TransactionOptions): Transaction {
    const parent =
      this._activeTransactions.length > 0
        ? this._activeTransactions[this._activeTransactions.length - 1]
        : null;

    const tx = new TransactionImpl(label, opts ?? {}, parent);

    tx.onCommit = (committed) => {
      this._handleTransactionCommit(tx, committed);
    };

    // When aborted, also remove from active list
    const origAbort = tx.abort.bind(tx);
    tx.abort = () => {
      origAbort();
      this._removeTransaction(tx);
    };

    // When a nested transaction commits, it merges deltas into its parent
    // but does not call onCommit (only top-level commits do). We still need
    // to remove it from _activeTransactions so the next begin() doesn't
    // pick a committed child as parent.
    const origCommit = tx.commit.bind(tx);
    tx.commit = () => {
      origCommit();
      if (tx.parent) {
        this._removeTransaction(tx);
      }
    };

    this._activeTransactions.push(tx);
    return tx;
  }

  atomic(
    label: string,
    fn: (tx: Transaction) => void,
    opts?: TransactionOptions
  ): void {
    const tx = this.begin(label, opts);
    try {
      fn(tx);
      tx.commit();
    } catch (err) {
      if ((tx as TransactionImpl).state === "open") {
        tx.abort();
      }
      throw err;
    }
  }

  private _handleTransactionCommit(
    tx: TransactionImpl,
    committed: CommittedTransaction
  ): void {
    // Remove from active list
    const idx = this._activeTransactions.indexOf(tx);
    if (idx !== -1) {
      this._activeTransactions.splice(idx, 1);
    }

    const record = committed.opts.record !== false;
    const clearsFuture = committed.opts.clearsFuture !== false;

    if (record) {
      this._stack.push(committed, clearsFuture);
    }

    this._events.emit("onChange", committed);
  }

  // Called when a transaction is committed or aborted — clean up tracking.
  // We hook into commit via onCommit. For abort, we must also remove from list.
  // We override abort behavior by wrapping:
  private _removeTransaction(tx: TransactionImpl): void {
    const idx = this._activeTransactions.indexOf(tx);
    if (idx !== -1) {
      this._activeTransactions.splice(idx, 1);
    }
  }

  // -- Preview --------------------------------------------------------------

  preview(label: string): Preview {
    const p = new PreviewImpl(label);

    p.onCommit = (committed) => {
      this._activePreviews.delete(p);
      // Push as a normal committed transaction
      this._stack.push(committed, true);
      this._events.emit("onChange", committed);
    };

    p.onDiscard = () => {
      this._activePreviews.delete(p);
    };

    this._activePreviews.add(p);
    return p;
  }

  // -- Provider registration ------------------------------------------------

  register(provider: HistoryProvider): Disposable {
    this._providers.set(provider.id, provider);
    return {
      dispose: () => {
        this._providers.delete(provider.id);
      },
    };
  }

  // -- Undo / Redo ----------------------------------------------------------

  undo(): boolean | Promise<boolean> {
    // Sync fast-reject: blocked while transaction is open
    if (this._hasOpenTransaction()) return false;
    return this._enqueue(() => this._doUndo());
  }

  redo(): boolean | Promise<boolean> {
    if (this._hasOpenTransaction()) return false;
    return this._enqueue(() => this._doRedo());
  }

  private _enqueue(
    op: () => boolean | Promise<boolean>
  ): boolean | Promise<boolean> {
    // If there's nothing pending, try sync fast-path
    if (!this._busy) {
      const result = op();
      if (result instanceof Promise) {
        this._busy = true;
        this._undoQueue = result.then(
          () => {},
          () => {}
        );
        return result.finally(() => {
          this._busy = false;
        });
      }
      return result;
    }

    // Queue behind current operation
    this._busy = true;
    const p = new Promise<boolean>((resolve) => {
      this._undoQueue = this._undoQueue.then(async () => {
        try {
          const r = await op();
          resolve(r);
        } catch {
          resolve(false);
        }
      });
    });
    this._undoQueue = this._undoQueue.finally(() => {
      this._busy = false;
    });
    return p;
  }

  private _doUndo(): boolean | Promise<boolean> {
    // Invariant 2: blocked while transaction is open
    if (this._hasOpenTransaction()) {
      return false;
    }

    // Invariant 3: discard all active previews first
    this._discardAllPreviews();

    const tx = this._stack.popUndo();
    if (!tx) return false;

    // Prepare providers
    const prepareResult = this._prepareProviders(tx);

    if (prepareResult instanceof Promise) {
      return prepareResult.then((prepared) => this._finishUndo(tx, prepared));
    }

    return this._finishUndo(tx, prepareResult);
  }

  private _finishUndo(
    tx: CommittedTransaction,
    prepared: Disposable | null
  ): boolean {
    if (!prepared) {
      this._stack.undoPopUndo(tx);
      return false;
    }

    const success = this._revertDeltas(tx);
    prepared.dispose();

    if (success) {
      this._events.emit("onUndo", tx);
      this._events.emit("onChange", tx);
    }

    return success;
  }

  private _doRedo(): boolean | Promise<boolean> {
    if (this._hasOpenTransaction()) {
      return false;
    }

    this._discardAllPreviews();

    const tx = this._stack.popRedo();
    if (!tx) return false;

    const prepareResult = this._prepareProviders(tx);

    if (prepareResult instanceof Promise) {
      return prepareResult.then((prepared) => this._finishRedo(tx, prepared));
    }

    return this._finishRedo(tx, prepareResult);
  }

  private _finishRedo(
    tx: CommittedTransaction,
    prepared: Disposable | null
  ): boolean {
    if (!prepared) {
      this._stack.undoPopRedo(tx);
      return false;
    }

    const success = this._applyDeltas(tx);
    prepared.dispose();

    if (success) {
      this._events.emit("onRedo", tx);
      this._events.emit("onChange", tx);
    }

    return success;
  }

  private _hasOpenTransaction(): boolean {
    return this._activeTransactions.some((tx) => tx.state === "open");
  }

  private _discardAllPreviews(): void {
    // Copy the set since discard modifies it
    for (const p of [...this._activePreviews]) {
      if (p.state === "active") {
        p.discard();
      }
    }
  }

  private _prepareProviders(
    tx: CommittedTransaction
  ): Disposable | null | Promise<Disposable | null> {
    // Collect unique provider IDs
    const providerIds = new Set<string>();
    for (const d of tx.deltas) {
      providerIds.add(d.providerId);
    }

    const disposables: Disposable[] = [];
    const promises: Promise<Disposable>[] = [];

    try {
      for (const pid of providerIds) {
        const provider = this._providers.get(pid);
        if (provider?.prepare) {
          const result = provider.prepare();
          if (result instanceof Promise) {
            promises.push(result);
          } else {
            disposables.push(result);
          }
        }
      }
    } catch {
      for (const d of disposables) {
        d.dispose();
      }
      return null;
    }

    const makeDisposable = (all: Disposable[]): Disposable => ({
      dispose: () => {
        for (const d of all) {
          d.dispose();
        }
      },
    });

    // Sync fast path: no async providers
    if (promises.length === 0) {
      return makeDisposable(disposables);
    }

    // Async path: wait for all promises
    return Promise.all(promises)
      .then((asyncDisposables) => {
        return makeDisposable([...disposables, ...asyncDisposables]);
      })
      .catch(() => {
        for (const d of disposables) {
          d.dispose();
        }
        return null;
      });
  }

  private _revertDeltas(tx: CommittedTransaction): boolean {
    const deltas = tx.deltas;
    for (let i = deltas.length - 1; i >= 0; i--) {
      try {
        deltas[i].revert();
      } catch (err) {
        // Invariant 13: already-reverted stand, remaining skipped, tx removed
        this._stack.remove(tx);
        this._events.emit("onError", tx, err);
        return false;
      }
    }
    return true;
  }

  private _applyDeltas(tx: CommittedTransaction): boolean {
    const deltas = tx.deltas;
    for (let i = 0; i < deltas.length; i++) {
      try {
        deltas[i].apply();
      } catch (err) {
        this._stack.remove(tx);
        this._events.emit("onError", tx, err);
        return false;
      }
    }
    return true;
  }

  // -- Events ---------------------------------------------------------------

  on<K extends keyof HistoryEvents>(
    event: K,
    handler: HistoryEvents[K]
  ): Disposable {
    return this._events.on(event, handler);
  }

  // -- Cleanup (for clearing all state, e.g. new document) ------------------

  clear(): void {
    this._stack.clear();
    for (const provider of this._providers.values()) {
      provider.reset?.();
    }
    this._events.clear();
  }
}
