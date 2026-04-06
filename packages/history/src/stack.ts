// ---------------------------------------------------------------------------
// Stack — past / future transaction lists
// ---------------------------------------------------------------------------

import type { CommittedTransaction, Stack } from "./types";

export interface StackOptions {
  maxDepth?: number;
}

export class StackImpl implements Stack {
  private past: CommittedTransaction[] = [];
  private future: CommittedTransaction[] = [];
  private readonly maxDepth: number;

  constructor(opts?: StackOptions) {
    this.maxDepth = opts?.maxDepth ?? 100;
  }

  // -- public readonly getters (Stack interface) ----------------------------

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string | null {
    const top = this.past[this.past.length - 1];
    return top ? top.label : null;
  }

  get redoLabel(): string | null {
    const top = this.future[this.future.length - 1];
    return top ? top.label : null;
  }

  get pastCount(): number {
    return this.past.length;
  }

  get futureCount(): number {
    return this.future.length;
  }

  // -- internal mutation methods (used by HistoryImpl) ----------------------

  push(tx: CommittedTransaction, clearsFuture: boolean): void {
    this.past.push(tx);
    if (clearsFuture) {
      this.future.length = 0;
    }
    // evict oldest if over capacity
    while (this.past.length > this.maxDepth) {
      this.past.shift();
    }
  }

  popUndo(): CommittedTransaction | null {
    const tx = this.past.pop() ?? null;
    if (tx) {
      this.future.push(tx);
    }
    return tx;
  }

  popRedo(): CommittedTransaction | null {
    const tx = this.future.pop() ?? null;
    if (tx) {
      this.past.push(tx);
    }
    return tx;
  }

  /** Remove a specific transaction from whichever list it's in. */
  remove(tx: CommittedTransaction): void {
    let idx = this.past.indexOf(tx);
    if (idx !== -1) {
      this.past.splice(idx, 1);
      return;
    }
    idx = this.future.indexOf(tx);
    if (idx !== -1) {
      this.future.splice(idx, 1);
    }
  }

  /** Move a transaction from past back to future (for redo failure rollback). */
  undoPopRedo(tx: CommittedTransaction): void {
    const idx = this.past.indexOf(tx);
    if (idx !== -1) {
      this.past.splice(idx, 1);
      this.future.push(tx);
    }
  }

  /** Move a transaction from future back to past (for undo failure rollback). */
  undoPopUndo(tx: CommittedTransaction): void {
    const idx = this.future.indexOf(tx);
    if (idx !== -1) {
      this.future.splice(idx, 1);
      this.past.push(tx);
    }
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }
}
