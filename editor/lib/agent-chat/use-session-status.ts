/**
 * `useSessionStatus` + `useCoreTurnSync` — the renderer's read-only window onto
 * the CORE run-state (RFC [`session` §Session status](../../../docs/wg/ai/agent/session.md)
 * + [`queue`](../../../docs/wg/ai/agent/queue.md)).
 *
 * The queue drain lives in the core now; the UI is a **dumb projection**. These
 * hooks give the surface two things:
 *
 *  - {@link useSessionStatus} — subscribe to the authoritative `SessionStatus`
 *    (idle/busy/error). This is the fact the composer renders Stop/Send from
 *    and the queue gate reads, NOT the AI-SDK client's optimistic per-request
 *    `status`.
 *  - {@link useCoreTurnSync} — when the core fires a queued turn (a busy edge
 *    THIS client did not start), PROMOTE the fired message from the tray into
 *    the transcript and attach to its stream. Owning that whole step here keeps
 *    the two desktop surfaces from drifting (an earlier regression came from
 *    duplicating it).
 */

"use client";

import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import {
  sessions as bridgeSessions,
  type ChatMessageWithParts,
  type SessionStatus,
} from "@/lib/desktop/bridge";
import { queuedMessageText } from "./use-queued-messages";

/**
 * Subscribe to a session's authoritative `SessionStatus`. Returns `null` until
 * the first frame (or when there is no session / no desktop bridge). Re-subscribes
 * on `sessionId` change and unsubscribes on unmount.
 */
export function useSessionStatus(
  sessionId: string | null
): SessionStatus | null {
  const [status, setStatus] = useState<SessionStatus | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    let subscriptionId: string | null = null;
    setStatus(null); // reset until the new session's first frame
    void bridgeSessions
      .subscribeStatus(sessionId, (s) => {
        if (!cancelled) setStatus(s);
      })
      .then((handle) => {
        subscriptionId = handle.subscriptionId;
        // The effect already cleaned up before the subscribe resolved.
        if (cancelled) void bridgeSessions.unsubscribeStatus(subscriptionId);
      })
      .catch(() => {
        // No bridge (web) or a transient failure — status stays null, the
        // surface falls back to the AI-SDK status for its own optimism.
      });

    return () => {
      cancelled = true;
      if (subscriptionId) {
        void bridgeSessions.unsubscribeStatus(subscriptionId);
      }
    };
  }, [sessionId]);

  return status;
}

export type CoreRunState = NonNullable<SessionStatus>["state"];

export type UseCoreTurnSyncArgs = {
  /** Authoritative core run-state (from {@link useSessionStatus}). */
  coreState: CoreRunState | null;
  /** The AI-SDK client's streaming flag — true when THIS client started a
   *  turn (so the core turn is one it owns, not a drain to attach to). */
  isStreaming: boolean;
  /** The tray mirror; its FIFO head is the row the core fires next. */
  queued: ChatMessageWithParts[];
  /** `useChat`'s setMessages — promote the fired row into the transcript. */
  setMessages: (updater: (prev: UIMessage[]) => UIMessage[]) => void;
  /** Drop the promoted row from the tray (atomic with the append). */
  dropQueued: (messageId: string) => void;
  /** `useChat`'s resumeStream — attach to the core-started run. */
  resumeStream: () => void;
  /** Reconcile the tray against the server queue after the drain. */
  refetchQueue: () => void;
};

/**
 * On a **busy** edge that THIS client did not start (`!isStreaming` → the core
 * fired a queued turn, not us), promote the fired message — the FIFO head of
 * the tray, which matches the core's drain order — into the transcript by its
 * OWN id (so a later hydrate can't duplicate it), drop it from the tray in the
 * same tick, then attach to the core's stream. A turn this client started is
 * skipped (it has its own optimistic message + stream), as is the mount frame
 * (`resume: true` covers an already-in-flight run).
 *
 * Keyed on `coreState` alone; everything else is read through a ref so an
 * unrelated re-render never re-fires an edge.
 */
export function useCoreTurnSync(args: UseCoreTurnSyncArgs): void {
  const { coreState } = args;
  const prevRef = useRef<CoreRunState | null>(null);
  const ref = useRef(args);
  ref.current = args;

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = coreState;
    if (coreState === null || coreState === prev) return;
    // Skip the mount frame — `resume: true` already covers an in-flight run.
    if (prev === null) return;
    if (coreState !== "busy") return;
    const a = ref.current;
    if (a.isStreaming) return; // a turn THIS client started — not a drain

    const fired = a.queued[0];
    if (fired) {
      a.setMessages((messages) => [
        ...messages,
        {
          id: fired.id,
          role: "user",
          parts: [{ type: "text", text: queuedMessageText(fired) }],
        } as UIMessage,
      ]);
      a.dropQueued(fired.id);
    }
    a.resumeStream();
    a.refetchQueue();
  }, [coreState]);
}
