/**
 * Per-window dirty-state tracker for the dirty-close prompt.
 *
 * The renderer owns dirty truth (it knows when the editor state has
 * diverged from the last saved content) and informs main via
 * `bridge.window.setDocumentEdited(b)` — both the macOS traffic-light
 * dot AND this tracker get updated by the same IPC handler.
 *
 * `dirtyState.takeForceClose` is the "user has already confirmed,
 * don't ask again" escape hatch for the close-and-discard path.
 *
 * Keyed by `webContents.id` (stable for the lifetime of the
 * WebContents). The window's `closed` handler calls `forget` so the
 * sets don't grow across the session.
 */

export namespace dirtyState {
  const dirty = new Set<number>();
  const forceClose = new Set<number>();

  /**
   * Set the dirty flag for a webContents. Returns `true` iff the flag
   * actually changed — callers (the IPC handler) can use this to skip
   * the per-keystroke native `setDocumentEdited` round-trip when the
   * doc is already dirty.
   */
  export function set(webContentsId: number, isDirty: boolean): boolean {
    const was = dirty.has(webContentsId);
    if (isDirty === was) return false;
    if (isDirty) dirty.add(webContentsId);
    else dirty.delete(webContentsId);
    return true;
  }

  export function is(webContentsId: number): boolean {
    return dirty.has(webContentsId);
  }

  export function markForceClose(webContentsId: number): void {
    forceClose.add(webContentsId);
  }

  /** Consumes the force-close flag if set. Returns true iff the flag was set. */
  export function takeForceClose(webContentsId: number): boolean {
    const flag = forceClose.has(webContentsId);
    forceClose.delete(webContentsId);
    return flag;
  }

  export function forget(webContentsId: number): void {
    dirty.delete(webContentsId);
    forceClose.delete(webContentsId);
  }
}
