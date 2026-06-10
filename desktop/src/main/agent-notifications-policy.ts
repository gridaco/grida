/**
 * Notification policy for agent lifecycle events — the PURE half of
 * `agent-notifications.ts` (RFC `docs/wg/ai/agent/events.md` §the first
 * consumer). Which events become a notification, the copy, and the
 * focus gate. No electron imports — like `open-handoff.ts`, this module
 * is the contract, unit-tested headless in
 * `agent-notifications-policy.test.ts`; the Electron wiring (window
 * resolution, Notification, click routing) stays in
 * `agent-notifications.ts`.
 */

import type { AgentLifecycleEvent } from "@grida/agent";

/** Title shown when the session row is unreadable or untitled. */
export const FALLBACK_TITLE = "Grida Agent";

export namespace agent_notifications {
  export type Decision = {
    title: string;
    body: string;
  };

  /**
   * The session facts the policy reads — a projection of the row so this
   * pure half never depends on the full transport row shape.
   */
  export type SessionFacts = {
    title: string | null;
    workspace_id: string | null;
  };

  /**
   * The window/focus facts the wiring resolves. "Target" is the window
   * presenting the session's workspace; an unbound session has none.
   */
  export type FocusFacts = {
    /** True iff a window presenting the session exists. */
    target_exists: boolean;
    /** True iff that window has OS focus. */
    target_focused: boolean;
    /** True iff ANY app window has OS focus. */
    app_focused: boolean;
  };

  /**
   * Which events become a notification, and the copy (RFC `events`
   * §when-to-notify). Returns null for the silent cases: turn-started
   * (not an attention moment), abort (the user did it themselves), and
   * a blocked finish (the approval-requested event already covers it).
   */
  export function decide(
    event: AgentLifecycleEvent,
    session: SessionFacts | null
  ): Decision | null {
    const title = session?.title?.trim() || FALLBACK_TITLE;
    switch (event.type) {
      case "approval-requested":
        return { title, body: "Waiting for your approval" };
      case "turn-finished": {
        if (event.reason === "abort") return null;
        if (event.pending_approval) return null;
        if (event.reason === "error") return { title, body: "Run failed" };
        return { title, body: "Turn completed" };
      }
      default:
        return null;
    }
  }

  /**
   * The focus gate (RFC `events` §focus-gating): suppress what the user
   * is already watching.
   *
   *   - session's window exists and IS focused → suppress;
   *   - session's window exists but unfocused → notify;
   *   - workspace-bound session with NO window → notify (nobody can be
   *     watching it);
   *   - unresolvable (unbound session) → fall back to app focus.
   */
  export function suppressed(
    session: SessionFacts | null,
    focus: FocusFacts
  ): boolean {
    if (session?.workspace_id) {
      return focus.target_exists && focus.target_focused;
    }
    return focus.app_focused;
  }
}
