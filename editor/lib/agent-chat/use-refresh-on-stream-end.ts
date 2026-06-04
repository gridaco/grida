/**
 * `useRefreshOnStreamEnd(status, refresh)` — tiny edge wire that calls
 * `refresh()` whenever the AI SDK `status` transitions out of an
 * active state (`"submitted"` / `"streaming"`) back to `"ready"` or
 * `"error"`.
 *
 * Why: the agent sidecar writes several things AFTER the chat stream's
 * `[DONE]` frame — most importantly, the auto-generated session title
 * lands when the titler's parallel `nano` call resolves, which can be
 * later than the chat's own completion. The dropdown only re-reads the
 * list via `useChatSession`'s `applyResolvedSessionId` on the first
 * send. Without this hook, the picker keeps showing "New Chat" until
 * the user reloads the renderer.
 *
 * Both chat panels (`ai-sidebar/chat.tsx` + `workspace/workspace-chat.tsx`)
 * call this with the same `refresh` they got from `useChatSession()`.
 * Identical wiring → identical helper.
 */

"use client";

import { useEffect, useRef } from "react";

/**
 * Lift only the subset of `useChat()`'s `status` literal we care about.
 * `"streaming"` / `"submitted"` mean the run is in flight; anything
 * else (`"ready"`, `"error"`) is terminal-for-the-turn.
 */
export type ChatStreamStatus = "submitted" | "streaming" | "ready" | "error";

export function useRefreshOnStreamEnd(
  status: ChatStreamStatus | string,
  refresh: () => Promise<void> | void
): void {
  const prevRef = useRef<string>(status);
  useEffect(() => {
    const prev = prevRef.current;
    const wasActive = prev === "streaming" || prev === "submitted";
    const isInactive = status !== "streaming" && status !== "submitted";
    if (wasActive && isInactive) {
      // Fire-and-forget. `refresh` swallows transient errors on its
      // own (see `use-chat-session.ts` — list is preserved on failure).
      void refresh();
    }
    prevRef.current = status;
  }, [status, refresh]);
}
