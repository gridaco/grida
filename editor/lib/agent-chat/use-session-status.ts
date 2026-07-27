/**
 * `useSessionStatus` + `useCoreTurnSync` — the renderer's read-only window onto
 * the CORE run-state (RFC [`session` §Session status](../../../docs/wg/ai/agent/session.md)
 * + [`queue`](../../../docs/wg/ai/agent/queue.md)).
 *
 * The queue drain lives in the core now; the UI is a **dumb projection**. These
 * hooks give the surface two things:
 *
 *  - {@link useSessionStatus} — subscribe to the authoritative `SessionStatus`
 *    (idle/busy/waiting/error). This is the fact the composer renders
 *    Stop/Send and admission from, NOT the AI-SDK client's optimistic
 *    per-request `status`.
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

/** Bounded reconnect cadence for the long-lived status SSE. */
export function sessionStatusReconnectDelay(attempt: number): number {
  return Math.min(250 * 2 ** Math.max(0, attempt), 5_000);
}

type SessionStatusFrame = SessionStatus | null;
type ScheduleStatusFrame = (flush: () => void) => void;

/**
 * Serialize status frames one macrotask at a time.
 *
 * The bridge reader can parse several SSE frames in one read. React batches
 * state writes from that callback, so a synchronous `busy → idle` pair would
 * otherwise render only `idle` and erase the attach edge. The channel-ending
 * `null` sentinel uses the same queue, preserving every frame that preceded it.
 *
 * `schedule` is injectable so the ordering contract can be tested without a
 * renderer or fake timers.
 */
export function createSessionStatusFramePump(
  emit: (frame: SessionStatusFrame) => void,
  schedule: ScheduleStatusFrame = (flush) => {
    setTimeout(flush, 0);
  }
): {
  enqueue: (frame: SessionStatusFrame) => void;
  dispose: () => void;
} {
  const frames: SessionStatusFrame[] = [];
  let scheduled = false;
  let disposed = false;

  const scheduleNext = (): void => {
    if (disposed || scheduled || frames.length === 0) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      if (disposed) return;
      const frame = frames.shift();
      if (frame === undefined) return;
      emit(frame);
      scheduleNext();
    });
  };

  return {
    enqueue: (frame) => {
      if (disposed) return;
      frames.push(frame);
      scheduleNext();
    },
    dispose: () => {
      disposed = true;
      frames.length = 0;
    },
  };
}

/**
 * Subscribe to a session's authoritative `SessionStatus`. Returns `null` until
 * the first frame (or when there is no session / no desktop bridge).
 *
 * A status SSE is allowed to end when the sidecar restarts or its socket drops.
 * Such an end is not a terminal snapshot: keeping the last frame could strand
 * the UI forever in `waiting_on_approval`. Clear that stale fact and reconnect
 * with bounded backoff; the transcript remains the temporary human-input
 * fallback until the replacement stream delivers its hydrated first frame.
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
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    const framePump = createSessionStatusFramePump(setStatus);
    setStatus(null); // reset until the new session's first frame

    const scheduleReconnect = (): void => {
      if (cancelled || reconnectTimer !== null) return;
      const delay = sessionStatusReconnectDelay(reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void subscribe();
      }, delay);
    };

    const subscribe = async (): Promise<void> => {
      try {
        const handle = await bridgeSessions.subscribeStatus(sessionId, (s) => {
          if (cancelled) return;
          reconnectAttempt = 0;
          framePump.enqueue(s);
        });
        if (cancelled) {
          void bridgeSessions.unsubscribeStatus(handle.subscriptionId);
          return;
        }
        subscriptionId = handle.subscriptionId;
        const onDone = () => {
          if (cancelled || subscriptionId !== handle.subscriptionId) return;
          subscriptionId = null;
          // The final frame is no longer authoritative after its channel dies.
          framePump.enqueue(null);
          scheduleReconnect();
        };
        void handle.done.then(onDone, onDone);
      } catch {
        // No bridge (web), a sidecar restart, or a transient connection
        // failure. The surface uses local stream/transcript fallbacks while
        // this bounded loop waits for the authoritative channel to return.
        if (!cancelled) {
          framePump.enqueue(null);
          scheduleReconnect();
        }
      }
    };

    void subscribe();

    return () => {
      cancelled = true;
      framePump.dispose();
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (subscriptionId) {
        void bridgeSessions.unsubscribeStatus(subscriptionId);
      }
    };
  }, [sessionId]);

  return status;
}

export type CoreRunState = NonNullable<SessionStatus>["state"];

export type CoreStatusEdge = {
  readonly sessionId: string | null;
  readonly state: CoreRunState | null;
  readonly messageId: string | null;
  readonly isStreaming: boolean;
};

/**
 * Monotonic render-time revision for the authoritative status edge.
 *
 * Async hydration must never use tuple equality alone: `idle → busy → idle`
 * can return to the same values while an older idle fetch is still pending.
 * Observing the edge during render invalidates the old token before effects
 * run, so a late fetch cannot overwrite a newer live/promoted transcript.
 */
export class CoreStatusEdgeRevision {
  private edge: CoreStatusEdge | null = null;
  private revision = 0;

  observe(edge: CoreStatusEdge): number {
    if (!sameCoreStatusEdge(this.edge, edge)) {
      this.edge = edge;
      this.revision += 1;
    }
    return this.revision;
  }

  isCurrent(revision: number): boolean {
    return revision === this.revision;
  }
}

export type UseCoreTurnSyncArgs = {
  /** Active session identity; guards async hydration across a session switch. */
  sessionId: string | null;
  /** Authoritative core run-state (from {@link useSessionStatus}). */
  coreState: CoreRunState | null;
  /** Exact user message the core fired, present on message-fired busy states. */
  coreMessageId: string | null;
  /** The AI-SDK client's streaming flag — true when THIS client started a
   *  turn (so the core turn is one it owns, not a drain to attach to). */
  isStreaming: boolean;
  /** The tray mirror; its FIFO head is the row the core fires next. */
  queued: ChatMessageWithParts[];
  /** Current transcript. A direct send already contains its fired user id;
   * a remote drain does not, which is how the hook avoids a second attach. */
  messages: UIMessage[];
  /** Rehydrate a remotely fired row that this window never held locally. */
  rehydrate: () => Promise<UIMessage[] | null>;
  /** `useChat`'s setMessages — promote the fired row into the transcript. */
  setMessages: (updater: (prev: UIMessage[]) => UIMessage[]) => void;
  /** Drop the promoted row from the tray (atomic with the append). */
  dropQueued: (messageId: string) => void;
  /** `useChat`'s resumeStream — attach to the core-started run. */
  resumeStream: () => void;
  /** Reconcile the tray against the server queue after the drain. */
  refetchQueue: () => void;
  /**
   * Compatibility fallback for a sidecar that predates `message_id`: confirm
   * the candidate actually left the authoritative queue before promotion.
   */
  confirmDequeued: (messageId: string) => Promise<boolean>;
};

/** What a `coreState` edge means for the surface (pure — the hook is a wire). */
export type CoreTurnSyncAction =
  | { type: "ignore" }
  | { type: "rehydrate" }
  | { type: "confirm"; candidate: ChatMessageWithParts }
  | { type: "drain"; fired: ChatMessageWithParts }
  | { type: "attach"; firedMessageId: string | null };

/**
 * Decide whether a `coreState` transition is a CORE queue-drain this client
 * must attach to. New cores name the exact fired message; the client never
 * infers identity from its FIFO mirror. An older core without that field gets
 * a read-back confirmation before the candidate can be promoted.
 *
 *   - no transition,
 *   - `isStreaming` — a turn THIS client started,
 *   - a fired id already present in this client's transcript (its own send or
 *     an already-synchronized attach).
 *
 * A named fired id absent from both the transcript and queue mirror is a
 * remote drain this window learned about before its queue fetch. It must
 * rehydrate and attach; waiting for the mirror would miss the one status edge.
 * Named identity is authoritative even on the first frame after a status
 * reconnect, so its decision runs before the no-previous-state fallback.
 *
 * A waiting→busy continuation has no fired user id because approval/question
 * resumes the existing turn. Rehydrate removes the now-stale human-input
 * control, then the owner-gated resume callback attaches to the continuation.
 * The same recovery is safe for a first-frame busy/no-id snapshot after a
 * status reconnect: the attach owner coalesces it with any already-live stream.
 *
 * A first authoritative idle/error frame, or a remote run settling there,
 * rehydrates without attaching. This clears transcript-local controls that a
 * different window may already have answered.
 */
export function coreTurnSyncAction(input: {
  coreState: CoreRunState | null;
  coreMessageId: string | null;
  prevState: CoreRunState | null;
  prevIsStreaming: boolean;
  isStreaming: boolean;
  queued: ChatMessageWithParts[];
  messages: UIMessage[];
}): CoreTurnSyncAction {
  const {
    coreState,
    coreMessageId,
    prevState,
    prevIsStreaming,
    isStreaming,
    queued,
    messages,
  } = input;
  if (coreState === null) return { type: "ignore" };
  // A waiting/idle/error frame can beat the local stream's final status
  // update. Defer its hydration while this client is live, then treat the
  // local streaming→settled edge as the missed reconciliation trigger even
  // though authoritative state itself did not change.
  const clientSettledAtAuthoritativeRest =
    coreState === prevState &&
    prevIsStreaming &&
    !isStreaming &&
    coreState !== "busy" &&
    coreState !== "retrying";
  if (coreState === prevState && !clientSettledAtAuthoritativeRest) {
    return { type: "ignore" };
  }
  if (coreState !== "busy") {
    if (
      !isStreaming &&
      (coreState === "waiting_on_approval" ||
        coreState === "waiting_on_user_input")
    ) {
      // Status carries only the waiting KIND; the actionable ids/input live in
      // persisted tool parts. Rehydrate on first/reconnected/remote waiting
      // edges so an empty or stale transcript cannot hide the controls.
      return { type: "rehydrate" };
    }
    if (
      !isStreaming &&
      (coreState === "idle" || coreState === "error") &&
      (prevState === null ||
        prevState === "busy" ||
        prevState === "retrying" ||
        prevState === "waiting_on_approval" ||
        prevState === "waiting_on_user_input")
    ) {
      return { type: "rehydrate" };
    }
    return { type: "ignore" };
  }
  if (isStreaming) return { type: "ignore" };
  if (coreMessageId) {
    if (messages.some((message) => message.id === coreMessageId)) {
      return { type: "ignore" };
    }
    const fired = queued.find((message) => message.id === coreMessageId);
    return fired
      ? { type: "drain", fired }
      : { type: "attach", firedMessageId: coreMessageId };
  }

  // Compatibility with sidecars that predate fired-message identity. Only an
  // idle→busy candidate can be a drain, and even then the effect confirms the
  // row is gone from the server queue before promoting it. Every other id-less
  // remote busy edge rehydrates and requests an owner-gated attach. That is
  // safe for a local send too: its transport/approval intent already occupies
  // the owner, so the duplicate request is synchronously denied.
  const candidate = queued[0];
  return prevState === "idle" && candidate
    ? { type: "confirm", candidate }
    : { type: "attach", firedMessageId: null };
}

/**
 * On a real core queue-drain (see {@link coreTurnSyncAction}), promote the
 * fired message — the FIFO head of the tray — into the transcript by its OWN id
 * (so a later hydrate can't duplicate it), drop it from the tray in the same
 * tick, then attach to the core's stream and reconcile the tray.
 *
 * Keyed on the authoritative state and fired-message identity; everything else
 * is read through a ref so an unrelated re-render never re-fires an edge.
 */
export function useCoreTurnSync(args: UseCoreTurnSyncArgs): void {
  const { coreState, coreMessageId } = args;
  const prevRef = useRef<{
    sessionId: string | null;
    state: CoreRunState | null;
    isStreaming: boolean;
  }>({ sessionId: null, state: null, isStreaming: false });
  const mountedRef = useRef(false);
  const ref = useRef(args);
  ref.current = args;
  const edgeRevisionRef = useRef<CoreStatusEdgeRevision | null>(null);
  if (edgeRevisionRef.current === null) {
    edgeRevisionRef.current = new CoreStatusEdgeRevision();
  }
  const edgeRevision = edgeRevisionRef.current.observe({
    sessionId: args.sessionId,
    state: coreState,
    messageId: coreMessageId,
    isStreaming: args.isStreaming,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const a = ref.current;
    const previous = prevRef.current;
    const prev = previous.sessionId === args.sessionId ? previous.state : null;
    const prevIsStreaming =
      previous.sessionId === args.sessionId ? previous.isStreaming : false;
    prevRef.current = {
      sessionId: args.sessionId,
      state: coreState,
      isStreaming: a.isStreaming,
    };
    const action = coreTurnSyncAction({
      coreState,
      coreMessageId,
      prevState: prev,
      prevIsStreaming,
      isStreaming: a.isStreaming,
      queued: a.queued,
      messages: a.messages,
    });
    if (action.type === "ignore") return;

    const promote = (fired: ChatMessageWithParts) => {
      const latest = ref.current;
      latest.setMessages((messages) =>
        messages.some((message) => message.id === fired.id)
          ? messages
          : [
              ...messages,
              {
                id: fired.id,
                role: "user",
                parts: [{ type: "text", text: queuedMessageText(fired) }],
              } as UIMessage,
            ]
      );
      latest.dropQueued(fired.id);
      latest.resumeStream();
      latest.refetchQueue();
    };

    if (action.type === "drain") {
      promote(action.fired);
      return;
    }

    if (action.type === "attach" || action.type === "rehydrate") {
      const actionSessionId = a.sessionId;
      const shouldResume = action.type === "attach";
      void a
        .rehydrate()
        .then((restored) => {
          const latest = ref.current;
          if (
            !mountedRef.current ||
            latest.sessionId !== actionSessionId ||
            !edgeRevisionRef.current?.isCurrent(edgeRevision)
          ) {
            return;
          }
          if (restored) latest.setMessages(() => restored);
          if (
            shouldResume &&
            (latest.coreState === "busy" || latest.coreState === "retrying")
          ) {
            latest.resumeStream();
          }
          latest.refetchQueue();
        })
        .catch(() => {
          // Hydration is presentation recovery, not permission to attach. The
          // stream is still authoritative and may replay enough state to make
          // progress; a later transcript refresh can fill the fired user row.
          const latest = ref.current;
          if (
            !mountedRef.current ||
            latest.sessionId !== actionSessionId ||
            !edgeRevisionRef.current?.isCurrent(edgeRevision)
          ) {
            return;
          }
          if (
            shouldResume &&
            (latest.coreState === "busy" || latest.coreState === "retrying")
          ) {
            latest.resumeStream();
          }
          latest.refetchQueue();
        });
      return;
    }

    let live = true;
    void a.confirmDequeued(action.candidate.id).then((dequeued) => {
      if (live && dequeued) promote(action.candidate);
    });
    return () => {
      live = false;
    };
  }, [
    args.sessionId,
    args.isStreaming,
    coreState,
    coreMessageId,
    edgeRevision,
  ]);
}

function sameCoreStatusEdge(
  a: CoreStatusEdge | null,
  b: CoreStatusEdge
): boolean {
  return (
    a !== null &&
    a.sessionId === b.sessionId &&
    a.state === b.state &&
    a.messageId === b.messageId &&
    a.isStreaming === b.isStreaming
  );
}
