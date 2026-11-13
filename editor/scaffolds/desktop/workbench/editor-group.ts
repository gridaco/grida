/**
 * The workbench's **editor group** — the tab model behind the editor pane,
 * modeled on VSCode's `EditorGroupModel`. It owns the ordered list of open tabs,
 * the active tab, and the reopen-closed history.
 *
 * This is load-bearing UX logic — the "which tab becomes active when I close the
 * active one" rule and the trash-a-folder-closes-its-subtree rule — so per the
 * `code-react` doctrine it
 * lives in a plain class where the execution order is explicit and every rule is
 * unit-testable, NOT smeared across React effects + refs + nested state setters
 * (where a missed dep silently drops a tuned behavior with no failing test). The
 * React binding is reduced to a `useSyncExternalStore` wire.
 *
 * Invariant: `active === null` means no tabs are open; otherwise `active` is
 * always one of `tabs`. Every mutation preserves it.
 *
 * Framework-agnostic (no React, no Electron): unit-tested directly.
 */

/** An immutable snapshot for the render layer. Its identity is stable between
 *  mutations (cached), so `useSyncExternalStore` neither loops nor over-renders. */
export type EditorGroupState = {
  /** The visible left-to-right tab strip. */
  readonly tabs: readonly string[];
  /** The focused tab, or `null` when the group is empty. */
  readonly active: string | null;
};

/** Default reopen-closed history depth (Cmd/Ctrl+Shift+T). */
const DEFAULT_HISTORY_LIMIT = 25;

export class EditorGroup {
  private _tabs: string[] = [];
  private _active: string | null = null;
  /** Reopen-closed stack, most-recent last. */
  private readonly closed: string[] = [];
  private snapshot: EditorGroupState = { tabs: [], active: null };
  private readonly listeners = new Set<() => void>();

  /** @param historyLimit Max reopen-closed depth. */
  constructor(private readonly historyLimit: number = DEFAULT_HISTORY_LIMIT) {}

  // ── snapshots ──────────────────────────────────────────────────────
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): EditorGroupState => this.snapshot;

  /** Rebuild the cached snapshot (new identity) and notify subscribers. */
  private commit(): void {
    this.snapshot = { tabs: this._tabs, active: this._active };
    for (const l of this.listeners) l();
  }

  // ── mutations ──────────────────────────────────────────────────────

  /** Open `id` (append if new) and focus it. No-op if it's already the active
   *  tab — so a redundant open doesn't churn the render layer. */
  open(id: string): void {
    const prevTabs = this._tabs;
    if (!prevTabs.includes(id)) this._tabs = [...prevTabs, id];
    if (this._active === id && this._tabs === prevTabs) return;
    this._active = id;
    this.commit();
  }

  /**
   * Replace the group with a validated persisted snapshot in one mutation.
   *
   * Restoration is intentionally a first-class model operation rather than a
   * loop of `open()` calls: the render layer never observes intermediate active
   * tabs, and reopen-closed history remains a property of this live session.
   */
  restore(state: EditorGroupState): void {
    const tabs = [...new Set(state.tabs)];
    const active =
      state.active !== null && tabs.includes(state.active)
        ? state.active
        : (tabs.at(-1) ?? null);
    if (
      active === this._active &&
      tabs.length === this._tabs.length &&
      tabs.every((id, index) => id === this._tabs[index])
    ) {
      return;
    }
    this._tabs = tabs;
    this._active = active;
    this.closed.length = 0;
    this.commit();
  }

  /** Focus an already-open tab. No-op if `id` isn't open or already active. */
  activate(id: string): void {
    if (this._active === id || !this._tabs.includes(id)) return;
    this._active = id;
    this.commit();
  }

  /**
   * Close `id`. If it was active, focus the left neighbor (else the right, else
   * null) — VSCode's rule. Records the tab for reopen-closed. No-op if `id`
   * isn't open.
   */
  close(id: string): void {
    const idx = this._tabs.indexOf(id);
    if (idx < 0) return;
    const prev = this._tabs;
    this._tabs = prev.filter((_, i) => i !== idx);
    if (this._active === id) {
      this._active = prev[idx - 1] ?? prev[idx + 1] ?? null;
    }
    this.pushClosed(id);
    this.commit();
  }

  /**
   * Close every tab matching `predicate` (a trashed file → its own tab; a
   * trashed folder → its whole subtree). If the active tab is among them, focus
   * the nearest surviving tab to its left, else the leftmost survivor, else null.
   * NEVER recorded for reopen — a deleted entry must not be resurrectable.
   * No-op (no notify) when nothing matches.
   */
  closeMatching(predicate: (id: string) => boolean): void {
    const prev = this._tabs;
    if (!prev.some(predicate)) return;
    this._tabs = prev.filter((t) => !predicate(t));
    if (this._active !== null && predicate(this._active)) {
      const activeIdx = prev.indexOf(this._active);
      let survivor: string | null = null;
      for (let i = activeIdx - 1; i >= 0; i--) {
        if (!predicate(prev[i])) {
          survivor = prev[i];
          break;
        }
      }
      this._active = survivor ?? this._tabs[0] ?? null;
    }
    this.commit();
  }

  /** Reopen the most-recently closed tab that isn't already open
   *  (Cmd/Ctrl+Shift+T). Skips ones reopened by hand, matching VSCode. */
  reopenClosed(): void {
    while (this.closed.length > 0) {
      const id = this.closed.pop();
      if (id === undefined) return;
      if (this._tabs.includes(id)) continue;
      this.open(id);
      return;
    }
  }

  private pushClosed(id: string): void {
    this.closed.push(id);
    if (this.closed.length > this.historyLimit) this.closed.shift();
  }
}
