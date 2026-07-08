"use client";

/**
 * Welcome → workspace prompt handoff.
 *
 * The desktop welcome page hosts a composer that targets a selected
 * workspace. Submitting it navigates (same window) to
 * `/desktop/workspace?id=<id>` and the workspace chat picks the prompt
 * up here and sends it as the first turn of a fresh session.
 *
 * The payload carries the prompt AND the model the composer was set to,
 * so the home picker's choice survives the navigation and runs the first
 * turn (otherwise the fresh session would silently fall back to the
 * default tier and the picker would be decorative).
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

/** One file to seed into the session's scratch dir on the first turn (WG
 *  `scratch.md`) — a picked template's unzipped `.canvas` bundle entry (or an
 *  upload). Flat single-segment `path` (the daemon's `writeScratchFile`
 *  enforces containment). */
export type ScratchSeedFile = { path: string; text: string };

/** The prompt + composer settings stashed for the workspace chat. */
export type WelcomeHandoff = {
  /** The user's RAW composer text — sent verbatim as the first turn, NEVER
   * fabricated (a picked template rides `template_context`, not this string).
   * Empty string when the home only wants to open the workspace primed (a picked
   * reference, or a template pick with no typed ask) without auto-sending a
   * plain-text turn. */
  prompt: string;
  /** The model the home composer was set to. Applied to that first
   * turn so the picker's choice survives the navigation; omitted when
   * the workspace chat should fall back to its own default. */
  model_id?: string;
  /**
   * Files to land in the session's SCRATCH dir before the first turn — agent-only
   * reference material (a picked slides template's unzipped bundle), NOT written
   * to the user's workspace. The agent-pane threads these onto the first send's
   * body (`scratch_seed`); the daemon writes them into scratch (WG `scratch.md`).
   */
  scratch_seed?: ScratchSeedFile[];
  /**
   * Metadata for a picked slides template (WG `compositor.md` §"Templating: user
   * view vs model view"). The agent-pane lowers this to a first-turn
   * `user_template_selection` context part — a CHIP in the user view, a
   * `<user_template_selection>` block in the model view — so the template is
   * referenced honestly, never narrated into `prompt`. Its `.canvas` bundle rides
   * `scratch_seed`. First turn only.
   */
  template_context?: {
    name: string;
    title: string;
    slides: number;
    system?: string;
  };
};

export namespace welcome_handoff {
  /** Stash a handoff for `workspaceId`, to be consumed after navigation. */
  export function set(workspaceId: string, handoff: WelcomeHandoff): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        storageKey(workspaceId),
        JSON.stringify(handoff)
      );
    } catch {
      // private mode / quota / disabled — drop silently; the workspace
      // just opens without an auto-sent prompt.
    }
  }

  /** Read without consuming. Used at mount to decide forceNew. Returns
   * null for a missing or malformed entry — the workspace then just
   * opens without an auto-sent prompt. */
  export function peek(workspaceId: string): WelcomeHandoff | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(storageKey(workspaceId));
      if (raw == null) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof (parsed as WelcomeHandoff).prompt === "string"
      ) {
        return parsed as WelcomeHandoff;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Drop the stashed handoff once it has been sent (or abandoned). */
  export function clear(workspaceId: string): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(storageKey(workspaceId));
    } catch {
      // ignore — a stale entry is harmless and clears on app restart.
    }
  }
}
