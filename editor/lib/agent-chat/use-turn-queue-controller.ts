/**
 * `useTurnQueueController` — the single owner of host-side queued-sends
 * wiring (RFC [Turn Queue](../../../docs/wg/ai/agent/queue.md)).
 *
 * Both desktop chat surfaces (the standalone-doc `ai-sidebar/chat.tsx` and the
 * workspace `workbench/agent-pane.tsx`) drive the queue through this one hook.
 * It composes the optimistic mirror ({@link useQueuedMessages}) with the pure
 * submit decision ({@link decideSubmit}) and turns it into the one side effect
 * the surface owns: `send` (start a turn now). A submit while the session is
 * busy OR waiting on human input enqueues instead.
 *
 * The DRAIN is NOT here. Firing the next queued turn is CORE state now (the
 * `SessionScheduler` fires it on a clean idle edge); the surface only reacts to
 * the resulting `SessionStatus` (see `use-session-status.ts`). This hook keeps
 * no drain authority — it just gates submit-vs-enqueue and mirrors the queue.
 */

"use client";

import { useCallback, useRef } from "react";
import type { FileUIPart } from "ai";
import { decideSubmit } from "./turn-queue";
import { useQueuedMessages } from "./use-queued-messages";
import type { SendExtras } from "./build-agent-send";
import type { ChatMessageWithParts } from "@/lib/desktop/bridge";
import type { StreamRecovery } from "./stream-recovery";

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
   * Is a new direct turn unsafe even though no active run is known? True while
   * paused on approval/question and while the authoritative status channel is
   * reconnecting. Deliberately separate from `busy`: there may be no run for
   * the surface's Stop control to abort. Ordinary text queues safely.
   */
  admissionBlocked: boolean;
  /** Whether the connected core supports same-id enqueue retry. */
  idempotentEnqueue?: boolean;
  /**
   * Start a brand-new turn NOW (the session is idle). The surface owns the
   * request body (model, skills, session id). Called by {@link submit} when
   * the session is not busy. `files` carries provider-native attachments and
   * `extras` carries operable scratch copies + their marker — a raster upload
   * may intentionally appear in both. Both use the immediate-send path only.
   */
  send: (
    text: string,
    files?: FileUIPart[],
    extras?: SendExtras
  ) => void | Promise<void>;
  /**
   * True when the send closure carries non-text context parts (for example a
   * picked template). In that case empty text is still a real immediate send.
   */
  hasSendContext?: boolean;
};

export type UseTurnQueueControllerResult = {
  /** Pending messages, FIFO (server-ordered) — render above the composer. */
  queued: ChatMessageWithParts[];
  /** Remove a queued message before it fires (the X affordance). */
  cancel: (messageId: string) => void;
  /** Local-only tray removal — used to PROMOTE a row the core just fired into
   *  the transcript (atomic move, no server delete). */
  drop: (messageId: string) => void;
  /** The composer's submit handler: enqueue while busy/human-blocked, else send.
   *  `files` (provider-native media) and `extras` (operable scratch copies)
   *  only flow on the send-now path — the queue is text-only. */
  submit: (
    text: string,
    files?: FileUIPart[],
    extras?: SendExtras
  ) => Promise<void>;
  /** Re-read the queue from the core (reconcile the mirror after a drain). */
  refetch: () => Promise<void>;
  /** Confirm a legacy-sidecar drain by checking that the candidate left the
   * authoritative queue. */
  confirmDequeued: (messageId: string) => Promise<boolean>;
  /**
   * Move a text-only optimistic user tail rejected by the pending-human-input
   * race into the durable queue under the same message id.
   */
  recoverPendingHumanInputTail: (
    tail: StreamRecovery.PendingUserTail
  ) => Promise<boolean>;
};

/** Pure controller action; the hook below only applies its side effect. */
export type TurnQueueSubmitAction =
  | { type: "ignore" }
  | { type: "enqueue"; sessionId: string; text: string }
  | {
      type: "send";
      text: string;
      files?: FileUIPart[];
      extras?: SendExtras;
    };

/**
 * Lower one composer submit to the controller action it authorizes.
 *
 * The durable queue currently carries ordinary text only. A blocked/busy
 * session therefore queues non-empty text and never direct-sends file/context
 * payloads into the pending turn.
 */
export function turnQueueSubmitAction(input: {
  text: string;
  files?: FileUIPart[];
  extras?: SendExtras;
  sessionId: string | null;
  busy: boolean;
  admissionBlocked: boolean;
  hasSendContext: boolean;
}): TurnQueueSubmitAction {
  const t = input.text.trim();
  const hasFiles = !!input.files && input.files.length > 0;
  const hasExtras =
    !!input.extras &&
    ((input.extras.scratchSeed?.length ?? 0) > 0 ||
      (input.extras.contexts?.length ?? 0) > 0);
  if (!t && !hasFiles && !input.hasSendContext && !hasExtras) {
    return { type: "ignore" };
  }

  if (
    decideSubmit({
      busy: input.busy,
      admissionBlocked: input.admissionBlocked,
    }) === "enqueue"
  ) {
    return input.sessionId && t
      ? { type: "enqueue", sessionId: input.sessionId, text: t }
      : { type: "ignore" };
  }

  return {
    type: "send",
    text: t,
    files: input.files,
    extras: input.extras,
  };
}

export function useTurnQueueController(
  args: UseTurnQueueControllerArgs
): UseTurnQueueControllerResult {
  const queue = useQueuedMessages(args.sessionId, {
    idempotentEnqueue: args.idempotentEnqueue,
  });

  // Read submit-time state through refs so `submit` stays a stable callback.
  const busyRef = useRef(args.busy);
  busyRef.current = args.busy;
  const admissionBlockedRef = useRef(args.admissionBlocked);
  admissionBlockedRef.current = args.admissionBlocked;
  const sessionIdRef = useRef(args.sessionId);
  sessionIdRef.current = args.sessionId;
  const enqueueRef = useRef(queue.enqueue);
  enqueueRef.current = queue.enqueue;
  const sendRef = useRef(args.send);
  sendRef.current = args.send;
  const hasSendContextRef = useRef(args.hasSendContext === true);
  hasSendContextRef.current = args.hasSendContext === true;

  const submit = useCallback(
    async (text: string, files?: FileUIPart[], extras?: SendExtras) => {
      const action = turnQueueSubmitAction({
        text,
        files,
        extras,
        sessionId: sessionIdRef.current,
        busy: busyRef.current,
        admissionBlocked: admissionBlockedRef.current,
        hasSendContext: hasSendContextRef.current,
      });
      if (action.type === "ignore") return;
      if (action.type === "enqueue") {
        // Queue behind the occupied/human-blocked session. A null session
        // cannot be either, so the action gate drops it rather than enqueueing
        // into the void. The queue is text-only; file/context-only submissions
        // have no durable queue payload and are ignored by that gate.
        await enqueueRef.current(action.sessionId, action.text);
        return;
      }
      await sendRef.current(action.text, action.files, action.extras);
    },
    []
  );

  const recoverPendingHumanInputTail = useCallback(
    async (tail: StreamRecovery.PendingUserTail): Promise<boolean> => {
      const sid = sessionIdRef.current;
      if (!sid || !tail.text.trim()) return false;
      await enqueueRef.current(sid, tail.text, tail.id);
      return true;
    },
    []
  );

  return {
    queued: queue.queued,
    cancel: queue.cancel,
    drop: queue.drop,
    submit,
    refetch: queue.refetch,
    confirmDequeued: queue.confirmDequeued,
    recoverPendingHumanInputTail,
  };
}
