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
  /** Enqueue a message while a turn is in flight. Returns the persisted row. */
  enqueue: (sessionId: string, text: string) => Promise<ChatMessageWithParts>;
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

export function useQueuedMessages(
  sessionId: string | null
): UseQueuedMessagesResult {
  const [queued, setQueued] = useState<ChatMessageWithParts[]>([]);
  // Generation counter so an out-of-order list response can't clobber a
  // fresher one (mirrors the swr-by-hand pattern in use-chat-session).
  const genRef = useRef(0);
  // Rows added locally but not yet confirmed by a server fetch — kept on
  // refetch so an in-flight enqueue isn't wiped by a concurrent list response.
  const optimisticIdsRef = useRef<Set<string>>(new Set());

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
    if (!sessionId) {
      optimisticIdsRef.current.clear();
      setQueued([]);
      return;
    }
    const gen = ++genRef.current;
    try {
      const items = await bridgeSessions.listQueued(sessionId);
      if (gen !== genRef.current) return;
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
    async (sid: string, text: string): Promise<ChatMessageWithParts> => {
      const id = newQueuedId();
      optimisticIdsRef.current.add(id);
      setQueued((prev) =>
        [...prev, optimisticRow(sid, id, text)].sort(byQueuedAt)
      );
      try {
        const row = await bridgeSessions.enqueue(sid, { id, text });
        // The server now owns this row: drop its optimistic protection so a
        // later refetch reflects server truth — INCLUDING the core draining it.
        // Without this, a row drained BEFORE its first refetch-confirmation
        // would linger forever as a phantom "optimistic" entry (it left the
        // server queue but is still in `optimisticIds`, so `reconcile` keeps
        // re-adding it).
        optimisticIdsRef.current.delete(id);
        setQueued((prev) =>
          prev.map((m) => (m.id === id ? row : m)).sort(byQueuedAt)
        );
        return row;
      } catch (err) {
        optimisticIdsRef.current.delete(id);
        setQueued((prev) => prev.filter((m) => m.id !== id));
        throw err;
      }
    },
    []
  );

  // Local-only removal from the mirror (the promote/atomic-move primitive).
  const drop = useCallback((messageId: string) => {
    optimisticIdsRef.current.delete(messageId);
    setQueued((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  // Cancel = drop locally, then hard-delete on the server (revert on failure).
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

  return { queued, enqueue, cancel, drop, refetch };
}

/** The plain text of a queued message (joins its text parts). */
export function queuedMessageText(msg: ChatMessageWithParts): string {
  return msg.parts
    .filter((p) => p.type === "text")
    .map((p) => (p.data as { text?: string })?.text ?? "")
    .join("");
}
