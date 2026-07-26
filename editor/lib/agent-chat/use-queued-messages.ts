/**
 * `useQueuedMessages(sessionId)` — the renderer's view of a session's
 * **turn queue** (RFC [`queue`](../../../docs/wg/ai/agent/queue.md)).
 *
 * Queued messages are CORE state — persisted `user` rows carrying
 * `metadata.queued_at`, held out of the model view and the transcript until
 * the CORE fires them. This hook is the thin client over the three bridge ops
 * (`enqueue` / `list_queued` / `cancel_queued`); it owns no queue authority,
 * only an optimistic mirror for instant feedback.
 *
 * The mirror reconciles against the server (`refetch`) WITHOUT clobbering an
 * in-flight optimistic enqueue, via `optimisticIds` — rows added locally that
 * the server has not confirmed yet; a refetch keeps them (they would otherwise
 * vanish in the window between the optimistic add and the enqueue POST
 * committing). A drained row needs no special handling: the scheduler clears
 * `queued_at` BEFORE the status edge that triggers `refetch`, so the row is
 * simply absent from the server queue by the time the mirror reconciles.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sessions as bridgeSessions,
  type ChatMessageWithParts,
} from "@/lib/desktop/bridge";

export type UseQueuedMessagesResult = {
  /** Pending messages, FIFO by `queued_at`. */
  queued: ChatMessageWithParts[];
  /**
   * Enqueue a message while a turn is occupied. `messageId` is normally
   * omitted; recovery supplies the rejected optimistic user id so the move
   * from transcript to queue remains one durable identity.
   */
  enqueue: (
    sessionId: string,
    text: string,
    messageId?: string
  ) => Promise<ChatMessageWithParts>;
  /** Remove a queued message before it fires (the X affordance). */
  cancel: (messageId: string) => Promise<void>;
  /**
   * Local-only removal from the mirror — NO server delete. Used to PROMOTE a
   * row the core just fired: the surface appends it to the transcript and drops
   * it from the tray in the same tick (atomic move). The core already cleared
   * its `queued_at`, so a concurrent refetch won't re-add it.
   */
  drop: (messageId: string) => void;
  /**
   * Re-read the queue from the core — reconcile the mirror after the CORE
   * drains a row (the scheduler clears its `queued_at`, so it drops out of the
   * server queue) or for cross-window sync. Non-destructive to an in-flight
   * optimistic enqueue.
   */
  refetch: () => Promise<void>;
  /**
   * Legacy-sidecar drain confirmation. Returns true only when the named local
   * queue row is authoritatively absent from the server queue, reconciling the
   * mirror with the same read.
   */
  confirmDequeued: (messageId: string) => Promise<boolean>;
};

/** Mint the row's id client-side; the same id promotes the core-fired row
 *  into the transcript, so a later hydrate can't duplicate it. */
function newQueuedId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `q_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

/** FIFO by `queued_at`, deterministic `id` tiebreak — matches the server. */
function byQueuedAt(a: ChatMessageWithParts, b: ChatMessageWithParts): number {
  const qa = (a.metadata.queued_at as number | undefined) ?? 0;
  const qb = (b.metadata.queued_at as number | undefined) ?? 0;
  return qa - qb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Merge the server queue truth with the local optimistic mirror: server items,
 * plus only those previous rows whose enqueue POST is still **pending** (in
 * `pendingIds`) and that the server hasn't surfaced yet. FIFO by `queued_at`.
 *
 * The load-bearing rule is the `pendingIds` gate: a row the server **dropped**
 * (the core drained it — its `queued_at` cleared, so it left `list_queued`) is
 * NOT pending, so it is not re-added. Without the gate, a row drained before
 * any refetch confirmed it would linger forever as a phantom optimistic entry.
 * Pure so that exact bug is pinned in a unit test (`use-queued-messages.test.ts`).
 */
export function mergeQueuedMirror(
  serverItems: ChatMessageWithParts[],
  prev: ChatMessageWithParts[],
  pendingIds: ReadonlySet<string>
): ChatMessageWithParts[] {
  const serverIds = new Set(serverItems.map((m) => m.id));
  const pendingKept = prev.filter(
    (m) => pendingIds.has(m.id) && !serverIds.has(m.id)
  );
  return [...serverItems, ...pendingKept].sort(byQueuedAt);
}

/** Upsert one optimistic/server row by durable message identity. */
export function upsertQueuedMirrorRow(
  rows: ChatMessageWithParts[],
  row: ChatMessageWithParts
): ChatMessageWithParts[] {
  return [...rows.filter((message) => message.id !== row.id), row].sort(
    byQueuedAt
  );
}

/** A type-correct placeholder shown until the core confirms the enqueue. */
function optimisticRow(
  sessionId: string,
  id: string,
  text: string
): ChatMessageWithParts {
  const now = Date.now();
  return {
    id,
    session_id: sessionId,
    role: "user",
    metadata: { queued_at: now },
    hidden_at: null,
    created_at: now,
    updated_at: now,
    parts: [
      {
        id: `${id}-0`,
        message_id: id,
        session_id: sessionId,
        index: 0,
        type: "text",
        data: { type: "text", text },
        tool_call_id: null,
        tool_state: null,
        created_at: now,
        updated_at: now,
      },
    ],
  };
}

/** Only ambiguous transport/server failures are safe for an automatic retry. */
export function shouldRetryQueuedEnqueue(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const candidate = err as {
    name?: unknown;
    status?: unknown;
    message?: unknown;
  };
  if (candidate.name === "AbortError") return false;
  if (typeof candidate.status === "number") {
    return candidate.status >= 500 && candidate.status < 600;
  }
  if (err instanceof TypeError) return true;
  return (
    typeof candidate.message === "string" &&
    /(?:failed to fetch|fetch failed|network error|connection (?:closed|reset)|socket hang up|ECONNRESET|EPIPE|response lost|sidecar not ready)/i.test(
      candidate.message
    )
  );
}

/**
 * Retry one enqueue with the exact same client-minted id. The queue endpoint
 * treats `(session, id, text)` as an idempotency key, so this closes the
 * commit-then-response-loss window without creating a second message.
 */
export async function enqueueQueuedMessageWithRetry(
  enqueue: (
    sessionId: string,
    message: { id: string; text: string }
  ) => Promise<ChatMessageWithParts>,
  sessionId: string,
  message: { id: string; text: string },
  options: {
    /** New sidecars make `(session, id, text)` a durable idempotency key. */
    retrySupported: boolean;
    /**
     * Rolling-upgrade reconciliation for released sidecars that reject id
     * reuse. Returns the already-committed queued/fired row when the first
     * response was lost.
     */
    findCommitted?: () => Promise<ChatMessageWithParts | null>;
  }
): Promise<ChatMessageWithParts> {
  try {
    return await enqueue(sessionId, message);
  } catch (err) {
    if (!shouldRetryQueuedEnqueue(err)) throw err;
    try {
      const committed = await options.findCommitted?.();
      if (committed) return committed;
    } catch {
      // Inspection is best-effort. Only a capability-confirmed core may fall
      // through to same-id retry; a legacy core preserves the draft instead.
    }
    if (!options.retrySupported) throw err;
    return await enqueue(sessionId, message);
  }
}

export function useQueuedMessages(
  sessionId: string | null,
  options: { idempotentEnqueue?: boolean } = {}
): UseQueuedMessagesResult {
  const [queued, setQueued] = useState<ChatMessageWithParts[]>([]);
  // Render-fresh identity guard for every async queue result. The hook instance
  // survives session switches; a request issued for session A must never
  // reconcile, append, or remove rows in session B's tray.
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  // Generation counter so an out-of-order list response can't clobber a
  // fresher one (mirrors the swr-by-hand pattern in use-chat-session).
  const genRef = useRef(0);
  // Rows added locally but not yet confirmed by a server fetch — kept on
  // refetch so an in-flight enqueue isn't wiped by a concurrent list response.
  const optimisticIdsRef = useRef<Set<string>>(new Set());
  // A recovery edge can fire twice (status + stream error). Coalesce the same
  // id/payload into one POST/retry sequence; mismatched reuse fails locally.
  const inflightEnqueuesRef = useRef<
    Map<
      string,
      {
        sessionId: string;
        text: string;
        promise: Promise<ChatMessageWithParts>;
      }
    >
  >(new Map());

  const reconcile = useCallback((serverItems: ChatMessageWithParts[]) => {
    const serverIds = new Set(serverItems.map((m) => m.id));
    // A server-confirmed optimistic row is no longer "pending only".
    // (Deleting the current element during a Set for-of is spec-safe.)
    for (const id of optimisticIdsRef.current) {
      if (serverIds.has(id)) optimisticIdsRef.current.delete(id);
    }
    setQueued((prev) =>
      mergeQueuedMirror(serverItems, prev, optimisticIdsRef.current)
    );
  }, []);

  const refetch = useCallback(async () => {
    const requestedSessionId = sessionId;
    if (sessionIdRef.current !== requestedSessionId) return;
    const gen = ++genRef.current;
    if (!requestedSessionId) {
      optimisticIdsRef.current.clear();
      setQueued([]);
      return;
    }
    try {
      const items = await bridgeSessions.listQueued(requestedSessionId);
      if (
        gen !== genRef.current ||
        sessionIdRef.current !== requestedSessionId
      ) {
        return;
      }
      reconcile(items);
    } catch {
      // Keep the last-known queue on a transient failure; the next refetch
      // (stream-end, or another mutation) reconciles.
    }
  }, [sessionId, reconcile]);

  // Reload when the active session changes. Optimistic tracking is per
  // session, so reset it on the switch (refetch bumps the generation so a
  // pending list response for the OLD session can't reconcile into the new).
  useEffect(() => {
    optimisticIdsRef.current.clear();
    void refetch();
  }, [refetch]);

  const enqueue = useCallback(
    (
      sid: string,
      text: string,
      messageId?: string
    ): Promise<ChatMessageWithParts> => {
      const id = messageId ?? newQueuedId();
      const inflight = inflightEnqueuesRef.current.get(id);
      if (inflight) {
        if (inflight.sessionId !== sid || inflight.text !== text) {
          return Promise.reject(
            new Error(
              `queued message id already in flight with a different payload: ${id}`
            )
          );
        }
        return inflight.promise;
      }

      if (sessionIdRef.current === sid) {
        optimisticIdsRef.current.add(id);
        setQueued((prev) =>
          upsertQueuedMirrorRow(prev, optimisticRow(sid, id, text))
        );
      }
      let operation!: Promise<ChatMessageWithParts>;
      operation = (async () => {
        try {
          const row = await enqueueQueuedMessageWithRetry(
            bridgeSessions.enqueue,
            sid,
            { id, text },
            {
              retrySupported: options.idempotentEnqueue === true,
              findCommitted: async () => {
                const matches = (row: ChatMessageWithParts) =>
                  row.id === id &&
                  row.session_id === sid &&
                  queuedMessageText(row) === text;
                try {
                  const queued = await bridgeSessions.listQueued(sid);
                  const found = queued.find(matches);
                  if (found) return found;
                } catch {
                  // The transcript read below may still recover a fired row.
                }
                try {
                  const transcript = await bridgeSessions.listMessages(sid);
                  return transcript.find(matches) ?? null;
                } catch {
                  return null;
                }
              },
            }
          );
          // The server now owns this row: drop its optimistic protection so a
          // later refetch reflects server truth — INCLUDING the core draining it.
          // Without this, a row drained BEFORE its first refetch-confirmation
          // would linger forever as a phantom "optimistic" entry (it left the
          // server queue but is still in `optimisticIds`, so `reconcile` keeps
          // re-adding it).
          if (sessionIdRef.current === sid) {
            optimisticIdsRef.current.delete(id);
            setQueued((prev) => {
              // A lost-response retry can arrive after the scheduler fired or
              // another window canceled the exact row. Both durable outcomes
              // lack queued_at; neither belongs back in the queue tray.
              if (typeof row.metadata.queued_at !== "number") {
                return prev.filter((m) => m.id !== id);
              }
              return upsertQueuedMirrorRow(prev, row);
            });
          }
          return row;
        } catch (err) {
          if (sessionIdRef.current === sid) {
            optimisticIdsRef.current.delete(id);
            setQueued((prev) => prev.filter((m) => m.id !== id));
          }
          throw err;
        } finally {
          if (inflightEnqueuesRef.current.get(id)?.promise === operation) {
            inflightEnqueuesRef.current.delete(id);
          }
        }
      })();
      inflightEnqueuesRef.current.set(id, {
        sessionId: sid,
        text,
        promise: operation,
      });
      return operation;
    },
    [options.idempotentEnqueue]
  );

  const confirmDequeued = useCallback(
    async (messageId: string): Promise<boolean> => {
      const requestedSessionId = sessionId;
      if (!requestedSessionId || sessionIdRef.current !== requestedSessionId) {
        return false;
      }
      const gen = ++genRef.current;
      try {
        const items = await bridgeSessions.listQueued(requestedSessionId);
        if (
          gen !== genRef.current ||
          sessionIdRef.current !== requestedSessionId
        ) {
          return false;
        }
        reconcile(items);
        return !items.some((item) => item.id === messageId);
      } catch {
        return false;
      }
    },
    [sessionId, reconcile]
  );

  // Local-only removal from the mirror (the promote/atomic-move primitive).
  const drop = useCallback((messageId: string) => {
    optimisticIdsRef.current.delete(messageId);
    setQueued((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  // Cancel = drop locally, then remove it from the server queue (the core
  // retains a hidden idempotency tombstone); revert the mirror on failure.
  const cancel = useCallback(
    async (messageId: string): Promise<void> => {
      drop(messageId);
      if (!sessionId) return;
      try {
        await bridgeSessions.cancelQueued(sessionId, messageId);
      } catch {
        void refetch();
      }
    },
    [sessionId, refetch, drop]
  );

  return { queued, enqueue, cancel, drop, refetch, confirmDequeued };
}

/** The plain text of a queued message (joins its text parts). */
export function queuedMessageText(msg: ChatMessageWithParts): string {
  return msg.parts
    .filter((p) => p.type === "text")
    .map((p) => (p.data as { text?: string })?.text ?? "")
    .join("");
}
