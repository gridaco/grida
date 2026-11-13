/**
 * Notification policy for native chat lifecycle facts — the PURE half of
 * `agent-notifications.ts` (RFC `docs/wg/ai/agent/events.md` §the first
 * consumer). Which facts become a notification and the copy. No electron
 * imports — this module is the contract, unit-tested headless in
 * `agent-notifications-policy.test.ts`; the Electron wiring (window
 * resolution, focus gate, Notification, click routing) stays in
 * `agent-notifications.ts`.
 */

import type { NativeChatLifecycle } from "./native-agent-chat";

/** Title shown on native chat notifications; chat content stays private. */
export const FALLBACK_TITLE = "Grida Agent";

export namespace agent_notifications {
  export type Decision = {
    title: string;
    body: string;
  };

  /**
   * Which lifecycle facts become a notification, and the copy — this
   * function IS the RFC `events` §when-to-notify table; if they disagree,
   * one of them drifted. A cancelled turn is silent: the user did it.
   *
   * The switch is EXHAUSTIVE over the settled statuses, so growing that
   * vocabulary fails the desktop build here until this table decides
   * notify-or-silent for it. At runtime an unknown value (version skew)
   * falls through to SILENT — never to a wrong notification.
   */
  export function decideNative(event: NativeChatLifecycle): Decision | null {
    const title = FALLBACK_TITLE;
    if (event.kind === "approval_required")
      return { title, body: "Waiting for your approval" };
    switch (event.status) {
      case "succeeded":
        return { title, body: "Turn completed" };
      case "failed":
        return { title, body: "Run failed" };
      case "uncertain":
        return { title, body: "Turn outcome needs review" };
      case "cancelled":
        return null;
      default:
        return silentOnUnknown(event.status);
    }
  }

  /**
   * The exhaustiveness alarm + the skew fallback in one place: `value` is
   * `never` when the switch covers the whole union (so a union growth is a
   * COMPILE error at the call site), and the runtime return is null (a fact
   * this build doesn't know stays silent, RFC `events` §when-to-notify).
   */
  function silentOnUnknown(value: never): null;
  function silentOnUnknown(): null {
    return null;
  }
}
