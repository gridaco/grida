/**
 * Notification policy for native chat lifecycle facts — the PURE half of
 * `agent-notifications.ts` (RFC `docs/wg/ai/agent/events.md` §the first
 * consumer). Which facts become a notification and the copy. No electron
 * imports — this module is the contract, unit-tested headless in
 * `agent-notifications-policy.test.ts`; the Electron wiring (window
 * resolution, focus gate, Notification, click routing) stays in
 * `agent-notifications.ts`.
 */

import type {
  NativeChatCompletionPreview,
  NativeChatLifecycle,
} from "./native-agent-chat";

/** Default title for lifecycle notifications without a chat title. */
export const FALLBACK_TITLE = "Grida Agent";
const MAX_PREVIEW_LENGTH = 180;

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
   * The mapping is exhaustive over lifecycle kinds and settled statuses,
   * so growing either vocabulary fails the desktop build until this table decides
   * notify-or-silent for it. At runtime an unknown value (version skew)
   * falls through to SILENT — never to a wrong notification.
   */
  export function decideNative(
    event: NativeChatLifecycle,
    preview?: NativeChatCompletionPreview
  ): Decision | null {
    const title = FALLBACK_TITLE;
    if (event.kind === "question_asked")
      return {
        title: event.title ?? (event.side ? "Side chat" : title),
        body: event.question,
      };
    if (event.kind === "approval_required")
      return { title, body: "Waiting for your approval" };
    if (event.kind === "automatic_compaction_settled") return null;
    if (event.kind !== "settled") return silentOnUnknown(event);
    switch (event.status) {
      case "succeeded":
        return {
          title: preview?.title?.trim() || title,
          body: responsePreview(preview?.text) || "Turn completed",
        };
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

  function responsePreview(text: string | null | undefined): string {
    const line = (text ?? "").replace(/[\s\p{Cc}]+/gu, " ").trim();
    const characters = Array.from(line);
    if (characters.length <= MAX_PREVIEW_LENGTH) return line;
    return (
      characters
        .slice(0, MAX_PREVIEW_LENGTH - 1)
        .join("")
        .trimEnd() + "…"
    );
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
