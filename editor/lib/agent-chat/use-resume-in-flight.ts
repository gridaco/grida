/**
 * `useResumeInFlight` — reconnect a desktop chat surface to its
 * still-running agent turn after a renderer remount / page refresh
 * (RFC [session / abort-vs-tcp-close](../../../docs/wg/ai/agent/session.md)).
 *
 * ## Why this exists (the bug it replaces)
 *
 * Both surfaces previously used `useChat({ resume: true })`. That option
 * compiles to a single mount effect with deps `[resume, chatRef]`:
 *
 *   useEffect(() => { if (resume) chatRef.current.resumeStream(); },
 *             [resume, chatRef]);   // chatRef is a STABLE ref — never changes
 *
 * so `resumeStream()` fires **exactly once, on mount**, and never again
 * even when the SDK swaps `chatRef.current` to a new `Chat`. On a real
 * page refresh the active session id is restored ASYNCHRONOUSLY from
 * localStorage (an IPC `sessions.get` round-trip — see
 * `use-chat-session.ts`), so that single mount-time resume runs against the
 * placeholder `Chat` (`id: undefined`, transport `session_id: undefined`)
 * and `reconnectToStream` returns null → no-op. When the `Chat` is then
 * rebuilt with the real session id, the SDK's resume effect does NOT
 * re-fire — so the in-flight run is never reconnected. The transcript only
 * advances when the user manually refreshes again and re-hydrates a
 * fresher DB snapshot. The server stream was resumable the whole time; the
 * client just never asked.
 *
 * ## What this does instead
 *
 * Fires `resumeStream()` **once per `Chat` instance that carries a real
 * session id** — so the resume tracks the rebuilt instance, not just the
 * mount. Session SWITCHES get the same treatment (selecting a busy session
 * now attaches to its live turn), which `resume: true` never did.
 *
 * ## The "never resume over a live send" guard
 *
 * A fresh chat adopts its server session id MID-STREAM without rebuilding
 * the `Chat` (`apply_resolved_session_id` deliberately keeps the streaming
 * instance — see `use-chat-session.ts`). So `sessionId` can flip
 * null→known while THIS client is the one streaming the turn. Resuming
 * there would open a second `reconnectToStream` over the live send and run
 * `onResumeStart` (which drops the in-progress assistant) — the same
 * cut-off hazard `useCoreTurnSync` guards against. When `isStreaming`, we
 * therefore CLAIM the instance without resuming: this client already holds
 * the live turn, and the claim ensures we never reconnect that instance
 * later (e.g. after the stream settles). `isStreaming` is read through a
 * ref so the effect keys only on `[chat, sessionId]` and never re-fires on
 * a stream-end edge.
 */

"use client";

import { useEffect, useRef } from "react";

/** What to do for the current `(chat, sessionId, isStreaming)` tuple. */
export type ResumeInFlightDecision =
  /** Reconnect to the session's in-flight run (and claim the instance). */
  | "resume"
  /** Claim the instance WITHOUT resuming — this client is streaming the
   *  turn itself (fresh-chat mid-stream id adoption). Prevents a later
   *  spurious reconnect over what was a live send. */
  | "claim-only"
  /** Nothing to do: no session yet, or this instance is already claimed. */
  | "skip";

/**
 * Pure decision core (no React, no transport) so the resume rule is
 * provable in a plain unit test — mirrors `decideSubmit` / `coreTurnSyncAction`.
 */
export function decideResumeInFlight(input: {
  /** Is a real (server) session id known for this chat instance? */
  hasSession: boolean;
  /** Is a turn streaming THROUGH THIS CLIENT right now? */
  isStreaming: boolean;
  /** Has this exact `Chat` instance already been claimed by a prior run? */
  alreadyClaimed: boolean;
}): ResumeInFlightDecision {
  if (!input.hasSession) return "skip";
  if (input.alreadyClaimed) return "skip";
  if (input.isStreaming) return "claim-only";
  return "resume";
}

export type UseResumeInFlightArgs<TChat> = {
  /** The live `Chat` instance — identity is the claim key. */
  chat: TChat;
  /** Active server session id, or `null` before it is known/restored. */
  sessionId: string | null;
  /** `useChat` status projected to "a turn is streaming through this client". */
  isStreaming: boolean;
  /** `useChat`'s `resumeStream` — reconnects to the in-flight run (no-op on 404). */
  resumeStream: () => void | Promise<void>;
};

export function useResumeInFlight<TChat>(
  args: UseResumeInFlightArgs<TChat>
): void {
  const { chat, sessionId, resumeStream } = args;
  // Streaming is read through a ref so the effect keys on `[chat, sessionId]`
  // only — adding `isStreaming` as a dep would re-run it on the stream-end
  // edge and reconnect a just-finished turn.
  const streamingRef = useRef(args.isStreaming);
  streamingRef.current = args.isStreaming;
  // Per-instance claim: at most one resume attempt per `Chat`.
  const claimedRef = useRef<TChat | null>(null);

  useEffect(() => {
    const decision = decideResumeInFlight({
      hasSession: sessionId != null,
      isStreaming: streamingRef.current,
      alreadyClaimed: claimedRef.current === chat,
    });
    if (decision === "skip") return;
    // Both "resume" and "claim-only" take ownership of the instance so it is
    // never (re-)resumed. The claim is synchronous and happens before the
    // async `resumeStream`, so a concurrent effect run can't double-fire.
    claimedRef.current = chat;
    if (decision === "resume") void resumeStream();
  }, [chat, sessionId, resumeStream]);
}
