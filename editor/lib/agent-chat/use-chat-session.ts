/**
 * `useChatSession()` — picker / lifecycle helper for the desktop's
 * agentic chat panels.
 *
 * Owns:
 *   - the `currentId` of the active session,
 *   - the list of recent sessions (lazy-loaded from the agent sidecar, refreshed
 *     when the active session changes or the caller explicitly refreshes),
 *   - hydrated UIMessages for the active session, ready to seed an
 *     `@ai-sdk/react` `Chat` instance.
 *
 * The panel composes this with `desktopAgentTransport.create({ sessionId })`
 * so each turn lands under the right session row. `select(null)` or
 * `startNew()` lets the next send create a new row server-side; the
 * resolved id comes back via `applyResolvedSessionId(...)` (called from
 * the chat panel's `onFinish` / first chunk).
 *
 * Filter (`agent`, `workspaceId`) is stable per panel instance: desktop
 * chat panels pass the shared Grida agent bucket; the workspace pane
 * adds `workspaceId`.
 *
 * Last-session memory lives in **localStorage**, keyed by filter scope:
 * `grida.lastChatSession.<agent>[.<workspaceId>]`. On mount the hook
 * reads that key, validates the session still exists on the agent sidecar
 * (and discards stale ids cleanly), and sets `currentId`. Streaming
 * continuity is then automatic: the chat panel's `useResumeInFlight`
 * calls `transport.reconnectToStream` once the rebuilt chat carries the
 * restored session id; the agent sidecar serves replay + live tail if the
 * run is still in flight, or 404s into a clean no-op. (The SDK's own
 * `resume: true` can't do this — it fires once on mount, before the async
 * restore resolves the id.) The DB is the snapshot;
 * localStorage is the "what was I last looking at" — pure UX state, by
 * design not in SQL.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import {
  sessions as bridgeSessions,
  type ChatMessageWithParts,
  type ChatSessionRow,
  type SessionListFilter,
} from "@/lib/desktop/bridge";

// The AI SDK's `UIMessagePart` is generic over data + tool maps. Our
// hydration code doesn't know either, so we widen to the message's
// own `parts` element type via `UIMessage["parts"][number]` and let
// the consumer's `UIMessage` types tighten as far as they need.
type UIMessagePartUnknown = UIMessage["parts"][number];

export type UseChatSessionFilter = {
  agent: string;
  workspaceId?: string;
  /** Hard cap on the picker list. Default 50. */
  limit?: number;
  /**
   * Skip the localStorage last-session restore on mount so the panel
   * starts on a brand-new (null) session regardless of history. Used
   * when a prompt was handed off (e.g. from the welcome composer) and
   * must open a fresh chat deterministically — relying on the restore
   * timing instead would race the first send into the previous session.
   * The fresh session's id is adopted on first send via
   * `applyResolvedSessionId` and persisted from there as usual.
   */
  force_new?: boolean;
};

export type UseChatSessionResult = {
  /** Current active session id, or `null` if none selected (new chat). */
  current_id: string | null;
  /** Recent sessions in the filter scope. */
  sessions: ChatSessionRow[];
  /** Initial UIMessages hydrated for `currentId`; empty when `currentId` is null. */
  initial_messages: UIMessage[];
  /** True until the first list load resolves; the picker can show a hint. */
  loading: boolean;
  /** Pick `null` to start a new chat that will create a session on send. */
  select: (id: string | null) => void;
  /** Force a fresh `null` session — alias of `select(null)`. */
  start_new: () => void;
  /** Re-fetch the session list. Call after rename / archive / delete. */
  refresh: () => Promise<void>;
  /**
   * Re-hydrate `initialMessages` for the active session WITHOUT changing
   * `currentId`. Use after a rewind, which mutates server-side visibility
   * for the same session — the chat panel rebuilds its `Chat` from the
   * fresh (truncated) message set.
   */
  rehydrate: () => void;
  /**
   * Awaitable {@link rehydrate}: fetch + apply the active session's messages
   * and resolve once `initialMessages` has been set. Compaction awaits this
   * before clearing its busy flag so the compacted transcript reconciles
   * BEFORE the turn queue drains — otherwise a queued message would fire
   * against the pre-compaction view and the late hydration would clobber the
   * in-flight turn (RFC `queue`; see `agent-pane.tsx` / `ai-sidebar/chat.tsx`
   * onCompact).
   */
  rehydrate_async: () => Promise<void>;
  /** Inline rename helper that updates list state optimistically. */
  rename: (id: string, title: string) => Promise<void>;
  /** Archive + drop from list. */
  archive: (id: string) => Promise<void>;
  /** Hard-delete + drop from list. */
  remove: (id: string) => Promise<void>;
  /**
   * Tell the hook the agent sidecar resolved a new session id (the first send
   * of a `currentId === null` flow). Adopts the id and refreshes the
   * list. Idempotent.
   */
  apply_resolved_session_id: (id: string) => void;
};

const DEFAULT_LIMIT = 50;

/** Per-scope localStorage key for the last-active session id. UX
 *  state only — never put DB-source-of-truth here. */
const STORAGE_PREFIX = "grida.lastChatSession";
function lastSessionKey(agent: string, workspaceId?: string): string {
  return workspaceId
    ? `${STORAGE_PREFIX}.${agent}.${workspaceId}`
    : `${STORAGE_PREFIX}.${agent}`;
}
function readLastSession(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLastSession(key: string, id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(key, id);
    else window.localStorage.removeItem(key);
  } catch {
    // private mode / quota / disabled — just drop the write
  }
}

function rowMatchesFilter(
  row: ChatSessionRow,
  filter: UseChatSessionFilter
): boolean {
  return (
    row.agent === filter.agent &&
    (row.workspace_id ?? undefined) === filter.workspaceId
  );
}

export function useChatSession(
  filter: UseChatSessionFilter
): UseChatSessionResult {
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [sessionsList, setSessionsList] = useState<ChatSessionRow[]>([]);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loading, setLoading] = useState(true);
  // Bumped by `rehydrate()` to force a re-fetch of the active session's
  // messages without a currentId change (rewind keeps the same session).
  const [hydrateNonce, setHydrateNonce] = useState(0);
  // Generation counter so out-of-order list / hydrate responses don't
  // clobber a fresher request. Pattern matches Vercel's swr-by-hand.
  const listGenRef = useRef(0);
  const hydrateGenRef = useRef(0);
  // Gate the persistence effect so the initial currentId=null render
  // doesn't blow away the localStorage entry before the restore effect
  // has a chance to read it.
  const persistReadyRef = useRef(false);
  // One-shot guard: when the active *fresh* chat resolves its server session
  // id on the first send (`applyResolvedSessionId`), we adopt the id WITHOUT
  // re-hydrating. The live, still-streaming chat already holds those messages;
  // re-hydrating would swap it for a DB snapshot mid-turn and drop the first
  // response. A later explicit re-open of the same id hydrates normally.
  const skipHydrateIdRef = useRef<string | null>(null);

  const storageKey = useMemo(
    () => lastSessionKey(filter.agent, filter.workspaceId),
    [filter.agent, filter.workspaceId]
  );

  const filterArgs = useMemo<SessionListFilter>(
    () => ({
      agent: filter.agent,
      workspaceId: filter.workspaceId,
      limit: filter.limit ?? DEFAULT_LIMIT,
    }),
    [filter.agent, filter.workspaceId, filter.limit]
  );

  const refresh = useCallback(async () => {
    const gen = ++listGenRef.current;
    try {
      const page = await bridgeSessions.list(filterArgs);
      if (gen !== listGenRef.current) return;
      setSessionsList(page.items);
    } catch {
      // Keep the last-known list on transient failures (network blip,
      // agent sidecar restart). Wiping it would leave the picker empty until
      // the user manually reloaded — which is exactly the bug we used
      // to ship. The next successful refresh repopulates.
      if (gen !== listGenRef.current) return;
    } finally {
      if (gen === listGenRef.current) setLoading(false);
    }
  }, [filterArgs]);

  // Initial + on-filter-change list load. Doesn't auto-select — the
  // panel decides whether to default to "newest" or start blank.
  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // Restore last-session-id from localStorage on mount (and whenever
  // the scope key changes — e.g. user opens a different workspace).
  // We validate via `sessions.get` so a stale id (the row was deleted
  // by another window, or by a DB wipe) gets cleaned up cleanly
  // instead of leaving the panel pointed at a 404.
  useEffect(() => {
    let cancelled = false;
    persistReadyRef.current = false;
    setCurrentId(null);
    setInitialMessages([]);
    // forceNew: skip the restore entirely and stay on a fresh null
    // session. Mark persistence ready so the id adopted on first send
    // still gets written back to localStorage as the new "last session".
    if (filterRef.current.force_new) {
      persistReadyRef.current = true;
      return;
    }
    void (async () => {
      try {
        const stored = readLastSession(storageKey);
        if (!stored) {
          persistReadyRef.current = true;
          return;
        }
        const row = await bridgeSessions.get(stored);
        if (cancelled) return;
        if (row && rowMatchesFilter(row, filterRef.current)) {
          // `applyResolvedSessionId`-equivalent: set currentId only if
          // we haven't drifted (e.g. user clicked into a different
          // chat already by the time the validation roundtrip finished).
          setCurrentId((cur) => cur ?? stored);
        } else {
          writeLastSession(storageKey, null);
        }
      } finally {
        if (!cancelled) persistReadyRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Persist currentId changes back to localStorage. Gated so the
  // initial null render doesn't pre-empt the restore effect above.
  useEffect(() => {
    if (!persistReadyRef.current) return;
    writeLastSession(storageKey, currentId);
  }, [currentId, storageKey]);

  // Hydrate initial messages for the active session.
  useEffect(() => {
    if (currentId === null) {
      setInitialMessages([]);
      return;
    }
    // Adoption (first send of a fresh chat): the live chat already holds the
    // messages — skip this one hydrate so we don't swap the streaming
    // instance for a DB snapshot and drop the in-flight first response.
    // Self-clearing one-shot: consumed on the very next hydrate run whether
    // or not it matched, so a stale marker can never suppress a later
    // explicit re-open of the same id.
    if (skipHydrateIdRef.current !== null) {
      const skipId = skipHydrateIdRef.current;
      skipHydrateIdRef.current = null;
      if (skipId === currentId) return;
    }
    const gen = ++hydrateGenRef.current;
    void (async () => {
      try {
        const rows = await bridgeSessions.listMessages(currentId);
        if (gen !== hydrateGenRef.current) return;
        setInitialMessages(toUIMessages(rows));
      } catch {
        if (gen !== hydrateGenRef.current) return;
        setInitialMessages([]);
      }
    })();
  }, [currentId, hydrateNonce]);

  const rehydrate = useCallback(() => setHydrateNonce((n) => n + 1), []);

  // Awaitable hydration: fetch the active session's messages and apply them,
  // resolving once `setInitialMessages` has been called. Shares
  // `hydrateGenRef` with the hydrate effect so the latest request wins
  // regardless of which path issued it. Reads `currentId` from a ref so the
  // callback stays identity-stable (no spurious effect re-runs downstream).
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;
  const rehydrateAsync = useCallback(async () => {
    const cur = currentIdRef.current;
    if (cur === null) {
      setInitialMessages([]);
      return;
    }
    const gen = ++hydrateGenRef.current;
    try {
      const rows = await bridgeSessions.listMessages(cur);
      if (gen !== hydrateGenRef.current) return;
      setInitialMessages(toUIMessages(rows));
    } catch {
      // Keep the last-known transcript on a transient failure.
    }
  }, []);

  const select = useCallback((id: string | null) => {
    setCurrentId(id);
  }, []);

  const startNew = useCallback(() => setCurrentId(null), []);

  const rename = useCallback(async (id: string, title: string) => {
    const updated = await bridgeSessions.rename(id, title);
    setSessionsList((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }, []);

  const archive = useCallback(
    async (id: string) => {
      await bridgeSessions.archive(id);
      setSessionsList((prev) => prev.filter((s) => s.id !== id));
      if (currentId === id) setCurrentId(null);
    },
    [currentId]
  );

  const remove = useCallback(
    async (id: string) => {
      await bridgeSessions.remove(id);
      setSessionsList((prev) => prev.filter((s) => s.id !== id));
      if (currentId === id) setCurrentId(null);
    },
    [currentId]
  );

  const applyResolvedSessionId = useCallback(
    (id: string) => {
      if (!id) return;
      // Refresh only on a real id change — the agent sidecar's first response
      // header surfaced a freshly-created session and the picker needs
      // to see it. Title/usage landing for subsequent turns is already
      // covered by `useRefreshOnStreamEnd`; refetching every turn paid
      // a agent sidecar round-trip per send for no visible delta.
      if (currentId === id) return;
      // Adopt the id for the *live* chat: skip the hydrate this triggers so
      // the streaming instance is preserved (see `skipHydrateIdRef`). Panels
      // also drop `currentId` from their `Chat` `useMemo` deps so adoption
      // doesn't rebuild the instance; continuity rides the per-send body.
      skipHydrateIdRef.current = id;
      setCurrentId(id);
      void refresh();
    },
    [currentId, refresh]
  );

  return {
    current_id: currentId,
    sessions: sessionsList,
    initial_messages: initialMessages,
    loading,
    select,
    start_new: startNew,
    refresh,
    rehydrate,
    rehydrate_async: rehydrateAsync,
    rename,
    archive,
    remove,
    apply_resolved_session_id: applyResolvedSessionId,
  };
}

function toUIMessages(rows: ChatMessageWithParts[]): UIMessage[] {
  // Parts arrive sorted by index; the AI SDK expects an ordered array
  // of UIMessageParts. New recorder rows store `data_json` in that SDK shape.
  // Legacy rows may still carry the older server-shaped snake_case tool fields;
  // normalize those at the hydration boundary so `Chat.addToolResult` can
  // mutate a re-opened pending tool call by `toolCallId`.
  //
  // Hidden rows (soft-truncated by a rewind, or summarized by a
  // compaction) are excluded — the transcript shows the live, visible
  // conversation, matching what the model sees. After a rewind, a
  // re-hydrate drops the now-hidden tail.
  return rows
    .filter((row) => row.hidden_at == null)
    .map((row) => ({
      id: row.id,
      role: row.role,
      parts: row.parts.map(toUIMessagePart),
      metadata: row.metadata,
    })) as UIMessage[];
}

export function toUIMessagePart(
  part: ChatMessageWithParts["parts"][number]
): UIMessagePartUnknown {
  const data = part.data;
  if (!isRecord(data)) return data as UIMessagePartUnknown;
  const type = typeof data.type === "string" ? data.type : part.type;
  if (!type.startsWith("tool-") && type !== "dynamic-tool") {
    return data as UIMessagePartUnknown;
  }
  const out: Record<string, unknown> = { ...data };
  const toolCallId = out.toolCallId ?? out.tool_call_id ?? part.tool_call_id;
  delete out.tool_call_id;
  delete out.tool_name;
  delete out.input_text_delta;
  delete out.error_text;
  delete out.provider_executed;
  if (typeof toolCallId === "string") out.toolCallId = toolCallId;
  if (typeof out.toolName !== "string" && typeof data.tool_name === "string") {
    out.toolName = data.tool_name;
  }
  if (
    typeof out.inputTextDelta !== "string" &&
    typeof data.input_text_delta === "string"
  ) {
    out.inputTextDelta = data.input_text_delta;
  }
  if (
    typeof out.errorText !== "string" &&
    typeof data.error_text === "string"
  ) {
    out.errorText = data.error_text;
  }
  if (
    typeof out.providerExecuted !== "boolean" &&
    typeof data.provider_executed === "boolean"
  ) {
    out.providerExecuted = data.provider_executed;
  }
  return out as UIMessagePartUnknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
