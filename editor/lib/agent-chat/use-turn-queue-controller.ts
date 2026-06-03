/**
 * `useTurnQueueController` — the single owner of host-side queued-sends
 * wiring (RFC [Turn Queue](../../../docs/wg/ai/agent/queue.md)).
 *
 * Both desktop chat surfaces (the standalone-doc `ai-sidebar/chat.tsx` and the
 * workspace `workbench/agent-pane.tsx`) drive the queue through this one hook.
 * It composes the optimistic mirror ({@link useQueuedMessages}) with the pure
 * submit decision ({@link decideSubmit}) and turns it into the one side effect
 * the surface owns: `send` (start a turn now). A submit while the session is
 * busy enqueues instead.
 *
 * The DRAIN is NOT here. Firing the next queued turn is CORE state now (the
 * `SessionScheduler` fires it on a clean idle edge); the surface only reacts to
 * the resulting `SessionStatus` (see `use-session-status.ts`). This hook keeps
 * no drain authority — it just gates submit-vs-enqueue and mirrors the queue.
 */

"use client";

import { useCallback, useRef } from "react";
import { decideSubmit } from "./turn-queue";
import { useQueuedMessages } from "./use-queued-messages";
import type { ChatMessageWithParts } from "@/lib/desktop/bridge";

export type UseTurnQueueControllerArgs = {
  /** Active session id, or `null` for a fresh (unsent) chat. */
  sessionId: string | null;
  /**
   * Is the session occupied — the surface's COMBINED busy signal: a streaming
   * turn or a maintenance op (client-local), OR the authoritative core
   * `SessionStatus` being busy. While true, submits enqueue.
   */
  busy: boolean;
  /**
   * Start a brand-new turn NOW (the session is idle). The surface owns the
   * request body (model, skills, session id). Called by {@link submit} when
   * the session is not busy.
   */
  send: (text: string) => void | Promise<void>;
};

export type UseTurnQueueControllerResult = {
  /** Pending messages, FIFO (server-ordered) — render above the composer. */
  queued: ChatMessageWithParts[];
  /** Remove a queued message before it fires (the X affordance). */
  cancel: (messageId: string) => void;
  /** Local-only tray removal — used to PROMOTE a row the core just fired into
   *  the transcript (atomic move, no server delete). */
  drop: (messageId: string) => void;
  /** The composer's submit handler: enqueue while busy, else send now. */
  submit: (text: string) => Promise<void>;
  /** Re-read the queue from the core (reconcile the mirror after a drain). */
  refetch: () => Promise<void>;
};

export function useTurnQueueController(
  args: UseTurnQueueControllerArgs
): UseTurnQueueControllerResult {
  const queue = useQueuedMessages(args.sessionId);

  // Read submit-time state through refs so `submit` stays a stable callback.
  const busyRef = useRef(args.busy);
  busyRef.current = args.busy;
  const sessionIdRef = useRef(args.sessionId);
  sessionIdRef.current = args.sessionId;
  const enqueueRef = useRef(queue.enqueue);
  enqueueRef.current = queue.enqueue;
  const sendRef = useRef(args.send);
  sendRef.current = args.send;

  const submit = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    const sid = sessionIdRef.current;
    if (decideSubmit({ busy: busyRef.current }) === "enqueue") {
      // Queue behind the busy session. A null session can't be mid-turn (the
      // first turn is never in flight), so there is nothing to queue against —
      // drop it rather than enqueue into the void.
      if (sid) await enqueueRef.current(sid, t);
      return;
    }
    await sendRef.current(t);
  }, []);

  return {
    queued: queue.queued,
    cancel: queue.cancel,
    drop: queue.drop,
    submit,
    refetch: queue.refetch,
  };
}
