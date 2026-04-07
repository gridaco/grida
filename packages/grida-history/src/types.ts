// ---------------------------------------------------------------------------
// @grida/history — public type definitions
// Design spec: docs/wg/feat-editor/history.plan.md
// ---------------------------------------------------------------------------

/** Minimal disposable pattern. */
export interface Disposable {
  dispose(): void;
}

// ---- Delta ----------------------------------------------------------------

/**
 * The atomic unit of change.
 *
 * `providerId` identifies the owning provider (used for `prepare()` dispatch).
 * `descriptor` is optional structured metadata (for debugging, collaboration,
 * persistence). History never reads it.
 * `apply()` / `revert()` are synchronous, opaque mutations.
 */
export interface Delta<D = unknown> {
  readonly providerId: string;
  readonly descriptor?: D;
  apply(): void;
  revert(): void;
}

// ---- Transaction ----------------------------------------------------------

export type TransactionState = "open" | "committed" | "aborted";

export interface Transaction {
  readonly id: string;
  readonly label: string;
  readonly state: TransactionState;

  push(delta: Delta): void;
  commit(): void;
  abort(): void;
}

// ---- Preview --------------------------------------------------------------

export type PreviewState = "active" | "committed" | "discarded";

export interface Preview {
  readonly id: string;
  readonly state: PreviewState;

  /** Apply a tentative change. Reverts the previous tentative change first. */
  set(delta: Delta): void;

  /** Accept the current tentative change as a real committed transaction. */
  commit(): void;

  /** Revert the current tentative change. Nothing touches the stack. */
  discard(): void;
}

// ---- Origin ---------------------------------------------------------------

export type TransactionOrigin =
  | { type: "local" }
  | { type: "remote"; peerId: string }
  | { type: "ai"; agentId: string };

// ---- TransactionOptions ---------------------------------------------------

export interface TransactionOptions {
  /** Default: { type: "local" } */
  origin?: TransactionOrigin;

  /** Default: true. Set false for remote/collaboration changes. */
  record?: boolean;

  /** Default: true. Set false for operations that should preserve redo. */
  clearsFuture?: boolean;
}

// ---- Committed Transaction ------------------------------------------------

export interface CommittedTransaction {
  readonly id: string;
  readonly label: string;
  readonly deltas: ReadonlyArray<Delta>;
  readonly origin: TransactionOrigin;
  readonly opts: TransactionOptions;
}

// ---- Stack ----------------------------------------------------------------

export interface Stack {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  readonly pastCount: number;
  readonly futureCount: number;

  clear(): void;
}

// ---- Provider -------------------------------------------------------------

export interface HistoryProvider {
  readonly id: string;
  prepare?(): Disposable | Promise<Disposable>;
  reset?(): void;
}

// ---- Events ---------------------------------------------------------------

export type HistoryEvents = {
  onChange(tx: CommittedTransaction): void;
  onUndo(tx: CommittedTransaction): void;
  onRedo(tx: CommittedTransaction): void;
  onError(tx: CommittedTransaction, error: unknown): void;
};

// ---- History (public API) -------------------------------------------------

export interface History {
  readonly stack: Stack;
  readonly busy: boolean;

  begin(label: string, opts?: TransactionOptions): Transaction;
  atomic(
    label: string,
    fn: (tx: Transaction) => void,
    opts?: TransactionOptions
  ): void;

  preview(label: string): Preview;

  register(provider: HistoryProvider): Disposable;

  undo(): boolean | Promise<boolean>;
  redo(): boolean | Promise<boolean>;

  /** Subscribe to history events. Returns Disposable to unsubscribe. */
  on<K extends keyof HistoryEvents>(
    event: K,
    handler: HistoryEvents[K]
  ): Disposable;
}
