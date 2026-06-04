"use client";

/**
 * Welcome → workspace prompt handoff.
 *
 * The desktop welcome page hosts a composer that targets a selected
 * workspace. Submitting it navigates (same window) to
 * `/desktop/workspace?id=<id>` and the workspace chat picks the prompt
 * up here and sends it as the first turn of a fresh session.
 *
 * sessionStorage (not query string) because the prompt is free text —
 * multi-line, arbitrary length — and the navigation is same-window, so
 * sessionStorage survives the route change and is naturally scoped to
 * this window. Keyed by workspace id so two windows opening different
 * workspaces don't cross wires.
 *
 * Single owner of the storage key: the welcome page only `set`s, the
 * workspace chat `peek`s (to decide it's a fresh-session start) then
 * `clear`s once it actually sends. Keep both sides importing this
 * module rather than re-deriving the key.
 */

const KEY_PREFIX = "grida.welcome.pendingPrompt";

function storageKey(workspaceId: string): string {
  return `${KEY_PREFIX}.${workspaceId}`;
}

export namespace welcome_handoff {
  /** Stash a prompt for `workspaceId`, to be consumed after navigation. */
  export function set(workspaceId: string, prompt: string): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(storageKey(workspaceId), prompt);
    } catch {
      // private mode / quota / disabled — drop silently; the workspace
      // just opens without an auto-sent prompt.
    }
  }

  /** Read without consuming. Used at mount to decide forceNew. */
  export function peek(workspaceId: string): string | null {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem(storageKey(workspaceId));
    } catch {
      return null;
    }
  }

  /** Drop the stashed prompt once it has been sent (or abandoned). */
  export function clear(workspaceId: string): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(storageKey(workspaceId));
    } catch {
      // ignore — a stale entry is harmless and clears on app restart.
    }
  }
}
