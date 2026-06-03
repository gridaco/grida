/**
 * Deterministic session-title policy — the single home for the rules that
 * decide a session's title without calling a model. The LLM-based titler
 * (`./titler`) is the *non*-deterministic counterpart and reuses
 * {@link session_title.isDefault} here so the "untitled" sentinel has one
 * definition.
 *
 * Kept as a leaf (no imports from `./store` or `./titler`) so `store.ts` can
 * import it without a cycle.
 *
 * Fork title rule: docs/wg/ai/agent/session.md §Forking.
 */

export namespace session_title {
  /**
   * Sentinel title applied to freshly created sessions. The titler treats
   * this exact string as "untitled" — sessions with any other title are
   * considered already named (the user renamed manually, or a previous
   * titler run succeeded). Keep this stable across releases: changing the
   * literal would orphan in-flight title gen on existing DBs.
   */
  export const DEFAULT = "New Chat";

  /** True while the session is still on the {@link DEFAULT} sentinel. */
  export function isDefault(title: string): boolean {
    return title === DEFAULT;
  }

  /**
   * Initial title for a forked (duplicated) session. A real parent title
   * gets a " (copy)" marker so the duplicate is distinguishable in the
   * picker. An untitled parent stays untitled so the auto-titler still names
   * the copy from its own first turn (it only runs while the title is still
   * {@link DEFAULT}) instead of pinning "New Chat (copy)" forever.
   *
   * The result is only a *starting* title — there is no maintained link to
   * the parent. Lineage lives in `parent_id` / `parent_message_id`.
   */
  export function forFork(parentTitle: string): string {
    return isDefault(parentTitle) ? DEFAULT : `${parentTitle} (copy)`;
  }
}
