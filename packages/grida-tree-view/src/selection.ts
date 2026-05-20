import type { Listener, NodeId, SelectionMode, ModifierState } from "./types";

/**
 * Selection state. Pluggable so editors that already own a selection store
 * can plug it in via a thin adapter, and stand-alone consumers can use the
 * default in-memory adapter.
 */
export interface SelectionAdapter {
  get(): readonly NodeId[];
  /**
   * Apply a selection change. For `"range"`, `ids` is already the fully
   * expanded run — the controller resolves the anchor→target range against
   * the flat row list before calling this, since the adapter has no view
   * of row order.
   */
  set(ids: readonly NodeId[], mode: SelectionMode): void;
  subscribe(listener: Listener): () => void;
}

export class InMemorySelectionAdapter implements SelectionAdapter {
  private _selection: readonly NodeId[] = [];
  private _listeners = new Set<Listener>();

  get(): readonly NodeId[] {
    return this._selection;
  }

  set(ids: readonly NodeId[], mode: SelectionMode): void {
    const next = applySelection(this._selection, ids, mode);
    if (sameSelection(this._selection, next)) return;
    this._selection = next;
    for (const l of this._listeners) l();
  }

  /** Overwrite to an explicit list. Bypasses mode dispatch. */
  replace(ids: readonly NodeId[]): void {
    this.set(ids, "replace");
  }

  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
}

/**
 * Pure: given the current selection, a list of newly-clicked ids and a
 * mode, compute the next selection.
 *
 * - `replace` — selection becomes exactly `ids`.
 * - `add`     — union with `ids` (additive, no toggling).
 * - `toggle`  — per-id symmetric difference.
 * - `range`   — selection becomes exactly `ids` (the caller is responsible
 *               for expanding the range into the flat id list, since the
 *               adapter has no view of the flat row order).
 */
export function applySelection(
  current: readonly NodeId[],
  ids: readonly NodeId[],
  mode: SelectionMode
): readonly NodeId[] {
  switch (mode) {
    case "replace":
    case "range":
      return ids.slice();
    case "add": {
      const set = new Set(current);
      for (const id of ids) set.add(id);
      return [...set];
    }
    case "toggle": {
      const set = new Set(current);
      for (const id of ids) {
        if (set.has(id)) set.delete(id);
        else set.add(id);
      }
      return [...set];
    }
  }
}

export function sameSelection(
  a: readonly NodeId[],
  b: readonly NodeId[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Pure: derive a selection mode from a click/key modifier set.
 *
 * - Shift              → `range`
 * - Meta/Ctrl (no Shift) → `toggle`
 * - none                → `replace`
 *
 * Editors are free to ignore this and apply their own house style; we ship
 * the platform-standard mapping.
 */
export function modeFromEvent(e: ModifierState): SelectionMode {
  if (e.shiftKey) return "range";
  if (e.metaKey || e.ctrlKey) return "toggle";
  return "replace";
}
