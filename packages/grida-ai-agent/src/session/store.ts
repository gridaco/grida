/**
 * `SessionsStore` — CRUD + streaming-write API over the chat-sessions
 * DB. Agent-agnostic: the `agent` column is a free-form string and the
 * `metadata_json` + `data_json` blobs accept any JSON-serializable
 * extension a particular agent wants to attach.
 *
 * Read paths return camelCase row objects with JSON columns already
 * parsed (`model`, `metadata`, `data`). Write paths accept the same
 * camelCase shape; the store handles JSON.stringify and id minting.
 *
 * Stream-write ergonomics: `upsertPart` is keyed by `(messageId,
 * index)` so the recorder can call it repeatedly as `text-delta` chunks
 * arrive. Tool parts are additionally keyed by `toolCallId` so a tool
 * result that arrives long after the input-start can find the same row.
 */

import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  or,
  sql,
} from "drizzle-orm";
import type { OpenedSessionsDb } from "./db";
import { chatMessages, chatParts, chatSessions } from "./schema";
import { asAgentMode, type AgentMode } from "../protocol/mode";
import { HUMAN_INPUT_PART_TYPES } from "../tools/names";
import { newMessageId, newPartId, newSessionId } from "./ids";
import { session_title } from "./title";
import { compactionBoundary } from "./boundary";
// Row + filter types are wire-shape — owned by `./protocol` (single
// source). Imported here for the store's input/output signatures, and
// re-exported at the bottom of this module so consumers get one import
// path for both the CRUD surface and the row shapes it emits.
import type {
  AssistantTurnAccounting,
  ForkSessionOptions,
  ChatMessageRow,
  ChatModel,
  ChatPartRow,
  ChatSessionRow,
  CreateSessionOptions,
  MessageUsage,
  PermissionRule,
  RewindResult,
  SessionListFilter,
  SessionListPage,
} from "./rows";
import { models } from "@grida/ai-models";
import { baseCostUsdFromMessageUsage, usageTokenTotal } from "./cost";

export type AppendMessageInput = {
  id?: string;
  role: "user" | "assistant" | "system";
  metadata?: Record<string, unknown>;
};

export type UpsertPartInput = {
  id?: string;
  index: number;
  type: string;
  data: unknown;
  tool_call_id?: string | null;
  tool_state?: string | null;
  /**
   * Caller-provided session id for the owning message. When known
   * (which is true for every recorder call), passing it skips an
   * extra SELECT on the insert path. Optional so external callers
   * that only have a `messageId` can omit it.
   */
  session_id?: string;
};

export type UpdateUsageDelta = {
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  cache_read?: number;
  cache_write?: number;
  total_tokens?: number;
};

/**
 * Optimistic token returned by the queue's conditional fire transition.
 * Runtime code may restore it only when the synchronous stream reservation
 * fails before a turn starts.
 */
export type QueuedMessageClaim = Readonly<{
  session_id: string;
  message_id: string;
  queued_at: number;
  original_metadata_json: string;
  claimed_metadata_json: string;
  original_created_at: number;
  original_updated_at: number;
  claimed_created_at: number;
}>;

export type ApprovalAnswerInput = Readonly<{
  tool_call_id: string;
  approval_id: string;
  approved: boolean;
  reason?: string;
}>;

/**
 * Exact persisted human-interaction continuation owned by one model run.
 *
 * This covers both explicit supervised approvals and client-resolved
 * question/design-search results. The host-only run marker keeps a failed
 * commit→reserve handoff retryable and prevents queued work from overtaking an
 * answer whose continuation has not settled.
 */
export type HumanInputContinuation = Readonly<{
  message_id: string;
  tool_call_id: string;
  run_id: string;
}>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function isHumanInputPartType(
  type: string
): type is (typeof HUMAN_INPUT_PART_TYPES)[number] {
  return HUMAN_INPUT_PART_TYPES.includes(
    type as (typeof HUMAN_INPUT_PART_TYPES)[number]
  );
}

export type CreateSessionInput = CreateSessionOptions & {
  /** Internal AgentHost metadata; never returned on the public session wire. */
  workspace_root?: string;
  /** Fork lineage — set by {@link SessionsStore.fork}. */
  parent_id?: string;
  parent_message_id?: string;
  /** Initial session-scoped permission rules. */
  permissions?: PermissionRule[];
};

export class SessionsStore {
  private readonly db: OpenedSessionsDb["db"];

  /**
   * `catalog_view` supplies the catalogue costs are estimated against.
   * Optional — omitted, rollups price from the bundled catalogue exactly
   * as they did before the store existed.
   */
  constructor(
    private readonly opened: OpenedSessionsDb,
    private readonly opts?: { catalog_view?: () => models.snapshot.View }
  ) {
    this.db = opened.db;
  }

  /**
   * Run a short store mutation as one SQLite transaction. The opened DB's
   * re-entrant owner gate lets ordinary store methods be called inside `fn`
   * without interleaving another operation on the shared connection.
   */
  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return await this.opened.withTx(fn);
  }

  // ──────────────────────────── sessions ────────────────────────────

  async create(input: CreateSessionInput): Promise<ChatSessionRow> {
    const now = Date.now();
    const id = newSessionId();
    const row = {
      id,
      title: input.title ?? session_title.DEFAULT,
      agent: input.agent,
      workspace_id: input.workspace_id ?? null,
      workspace_root: input.workspace_root ?? null,
      model_json: input.model ? JSON.stringify(input.model) : null,
      mode: input.mode ?? null,
      parent_id: input.parent_id ?? null,
      parent_message_id: input.parent_message_id ?? null,
      permissions_json: JSON.stringify(input.permissions ?? []),
      metadata_json: JSON.stringify(input.metadata ?? {}),
      prompt_tokens: 0,
      completion_tokens: 0,
      reasoning_tokens: 0,
      cache_read: 0,
      cache_write: 0,
      total_tokens: 0,
      cost_usd: 0,
      created_at: now,
      updated_at: now,
      archived_at: null as number | null,
    };
    await this.db.insert(chatSessions).values(row);
    return rowToSession(row);
  }

  async get(id: string): Promise<ChatSessionRow | null> {
    const rows = await this.db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, id))
      .limit(1);
    return rows[0] ? await this.rowToSessionWithDerivedCost(rows[0]) : null;
  }

  /**
   * The session's internal workspace root — the filesystem the agent is bound
   * to, or `null` for an unbound (standalone) session. Not on the public
   * {@link ChatSessionRow} (it's host-internal); read directly for a core
   * queue drain, which has no client request to carry it.
   */
  async getWorkspaceRoot(id: string): Promise<string | null> {
    const rows = await this.db
      .select({ workspace_root: chatSessions.workspace_root })
      .from(chatSessions)
      .where(eq(chatSessions.id, id))
      .limit(1);
    return rows[0]?.workspace_root ?? null;
  }

  async list(filter: SessionListFilter = {}): Promise<SessionListPage> {
    const limit = clampLimit(filter.limit);
    const conditions = [] as Array<ReturnType<typeof eq>>;
    if (filter.agent !== undefined) {
      conditions.push(eq(chatSessions.agent, filter.agent));
    }
    if (filter.workspace_id !== undefined) {
      conditions.push(eq(chatSessions.workspace_id, filter.workspace_id));
    }
    if (filter.query !== undefined && filter.query.length > 0) {
      conditions.push(like(chatSessions.title, `%${filter.query}%`));
    }
    if (!filter.include_archived) {
      conditions.push(isNull(chatSessions.archived_at));
    }
    if (filter.cursor !== undefined) {
      // Keyset pagination MUST filter on the same key it orders by
      // (updatedAt, then id as the tiebreak). A cursor on id alone would
      // skip/duplicate rows whenever updatedAt diverges from id order
      // (e.g. an old session bumped to the top by a recent run).
      const cur = parseCursor(filter.cursor);
      if (cur) {
        conditions.push(
          or(
            lt(chatSessions.updated_at, cur.updated_at),
            and(
              eq(chatSessions.updated_at, cur.updated_at),
              lt(chatSessions.id, cur.id)
            )
          )!
        );
      }
    }
    const where =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
          ? conditions[0]
          : and(...conditions);
    const query = this.db
      .select()
      .from(chatSessions)
      .orderBy(desc(chatSessions.updated_at), desc(chatSessions.id))
      .limit(limit + 1);
    const rows = where ? await query.where(where) : await query;
    const pageRows = rows.slice(0, limit);
    const costs = await this.sessionCostsUsd(pageRows.map((row) => row.id));
    const items = pageRows.map((row) => ({
      ...rowToSession(row),
      cost_usd: costs.get(row.id) ?? 0,
    }));
    const last = rows[limit - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeCursor(last.updated_at, last.id)
        : null;
    return { items, next_cursor: nextCursor };
  }

  async rename(id: string, title: string): Promise<ChatSessionRow> {
    const now = Date.now();
    await this.db
      .update(chatSessions)
      .set({ title, updated_at: now })
      .where(eq(chatSessions.id, id));
    const next = await this.get(id);
    if (!next) throw new SessionNotFoundError(id);
    return next;
  }

  async archive(id: string): Promise<ChatSessionRow> {
    const now = Date.now();
    await this.db
      .update(chatSessions)
      .set({ archived_at: now, updated_at: now })
      .where(eq(chatSessions.id, id));
    const next = await this.get(id);
    if (!next) throw new SessionNotFoundError(id);
    return next;
  }

  async unarchive(id: string): Promise<ChatSessionRow> {
    const now = Date.now();
    await this.db
      .update(chatSessions)
      .set({ archived_at: null, updated_at: now })
      .where(eq(chatSessions.id, id));
    const next = await this.get(id);
    if (!next) throw new SessionNotFoundError(id);
    return next;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(chatSessions).where(eq(chatSessions.id, id));
  }

  async updateModel(id: string, model: ChatModel): Promise<void> {
    const now = Date.now();
    await this.db
      .update(chatSessions)
      .set({ model_json: JSON.stringify(model), updated_at: now })
      .where(eq(chatSessions.id, id));
  }

  /**
   * Persist the EXTERNAL agent-provider's own session id (issue #813) under
   * `metadata.agent_provider.session_id`, so the next turn can RESUME that
   * agent's conversation instead of starting fresh. The external agent keeps
   * the history; Grida only sends the new user message. Read-modify-write of
   * the metadata bag (single-flight per session, so no concurrent-write race).
   */
  async setAgentProviderSessionId(
    id: string,
    providerSessionId: string
  ): Promise<void> {
    const row = await this.get(id);
    if (!row) throw new SessionNotFoundError(id);
    const metadata = {
      ...row.metadata,
      agent_provider: { session_id: providerSessionId },
    };
    await this.db
      .update(chatSessions)
      .set({ metadata_json: JSON.stringify(metadata), updated_at: Date.now() })
      .where(eq(chatSessions.id, id));
  }

  /** Persist the session's permission mode (RFC `permission modes`). The
   *  runtime calls this when an incoming run carries a mode that differs from
   *  the stored one, so a later queued-turn drain (which has no client request)
   *  rebuilds the turn with the user's last-chosen mode. */
  async updateMode(id: string, mode: AgentMode): Promise<void> {
    const now = Date.now();
    await this.db
      .update(chatSessions)
      .set({ mode, updated_at: now })
      .where(eq(chatSessions.id, id));
  }

  /**
   * Accumulate token usage deltas into the session row. Each `finish-step`
   * chunk during a stream calls this once with that step's incremental
   * usage; the `finish` chunk usually carries `totalUsage` which we set
   * absolute via {@link setUsage}.
   */
  async updateUsage(id: string, delta: UpdateUsageDelta): Promise<void> {
    const now = Date.now();
    const parts: Record<string, unknown> = { updated_at: now };
    if (delta.prompt_tokens !== undefined) {
      parts.prompt_tokens = sql`${chatSessions.prompt_tokens} + ${delta.prompt_tokens}`;
    }
    if (delta.completion_tokens !== undefined) {
      parts.completion_tokens = sql`${chatSessions.completion_tokens} + ${delta.completion_tokens}`;
    }
    if (delta.reasoning_tokens !== undefined) {
      parts.reasoning_tokens = sql`${chatSessions.reasoning_tokens} + ${delta.reasoning_tokens}`;
    }
    if (delta.cache_read !== undefined) {
      parts.cache_read = sql`${chatSessions.cache_read} + ${delta.cache_read}`;
    }
    if (delta.cache_write !== undefined) {
      parts.cache_write = sql`${chatSessions.cache_write} + ${delta.cache_write}`;
    }
    if (delta.total_tokens !== undefined) {
      parts.total_tokens = sql`${chatSessions.total_tokens} + ${delta.total_tokens}`;
    }
    await this.db
      .update(chatSessions)
      .set(parts)
      .where(eq(chatSessions.id, id));
  }

  /**
   * Replace the cumulative usage counters with absolute values. Used on
   * the `finish` chunk which carries `totalUsage` for the whole run —
   * setting absolute avoids drift if individual step deltas were lossy.
   */
  async setUsage(id: string, usage: UpdateUsageDelta): Promise<void> {
    const now = Date.now();
    const parts: Record<string, unknown> = { updated_at: now };
    if (usage.prompt_tokens !== undefined)
      parts.prompt_tokens = usage.prompt_tokens;
    if (usage.completion_tokens !== undefined) {
      parts.completion_tokens = usage.completion_tokens;
    }
    if (usage.reasoning_tokens !== undefined)
      parts.reasoning_tokens = usage.reasoning_tokens;
    if (usage.cache_read !== undefined) parts.cache_read = usage.cache_read;
    if (usage.cache_write !== undefined) parts.cache_write = usage.cache_write;
    if (usage.total_tokens !== undefined)
      parts.total_tokens = usage.total_tokens;
    await this.db
      .update(chatSessions)
      .set(parts)
      .where(eq(chatSessions.id, id));
  }

  /** Bump `updated_at` only; used by abort paths so the run still
   *  surfaces in "recent" lists even if no message landed. */
  async touch(id: string): Promise<void> {
    const now = Date.now();
    await this.db
      .update(chatSessions)
      .set({ updated_at: now })
      .where(eq(chatSessions.id, id));
  }

  // ──────────────────────────── messages ────────────────────────────

  async appendMessage(
    sessionId: string,
    msg: AppendMessageInput
  ): Promise<ChatMessageRow> {
    const now = Date.now();
    const id = msg.id ?? newMessageId();
    const row = {
      id,
      session_id: sessionId,
      role: msg.role,
      metadata_json: JSON.stringify(msg.metadata ?? {}),
      hidden_at: null as number | null,
      created_at: now,
      updated_at: now,
    };
    await this.db.insert(chatMessages).values(row);
    // Bump session updated_at so list ordering reflects activity.
    await this.touch(sessionId);
    return rowToMessage(row);
  }

  /**
   * Idempotent message insert — `INSERT … ON CONFLICT DO NOTHING` keyed
   * on the primary key `id`. Used by `persistIncomingTail` for the
   * client-minted user/system message ids: the AI SDK client resends the
   * full message history with stable ids every turn and may re-POST a run
   * while another is still in flight, so two runs can race to insert the
   * same id (and one request can even carry the same id twice after a
   * client-side DB-hydration race). A plain {@link appendMessage}
   * (unconditional INSERT) turns that into a `UNIQUE constraint failed:
   * chat_messages.id` 500; here the loser is a silent no-op.
   *
   * Deliberately distinct from {@link appendMessage}, which the recorder
   * uses for SERVER-minted assistant ids where a collision is a real bug
   * and must surface. Returns nothing: the sqlite-proxy `run` path does
   * not expose a row count, and callers only need "did not throw".
   */
  async appendMessageIfAbsent(
    sessionId: string,
    msg: AppendMessageInput
  ): Promise<void> {
    const now = Date.now();
    const id = msg.id ?? newMessageId();
    await this.db
      .insert(chatMessages)
      .values({
        id,
        session_id: sessionId,
        role: msg.role,
        metadata_json: JSON.stringify(msg.metadata ?? {}),
        created_at: now,
        updated_at: now,
      })
      .onConflictDoNothing({ target: chatMessages.id });
    // Bump session updated_at so list ordering reflects activity. Safe
    // even when the insert was a no-op — the session is active either way.
    await this.touch(sessionId);
  }

  async getMessage(id: string): Promise<ChatMessageRow | null> {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, id))
      .limit(1);
    return rows[0] ? rowToMessage(rows[0]) : null;
  }

  /**
   * The next free part index for a message — its highest existing `index` + 1,
   * or 0 when it has no parts yet. The recorder uses this when it RESUMES an
   * assistant message across the supervised-approval pause (the stream
   * re-advertises the original message id, so the resume turn appends to the
   * SAME message): new continuation parts must land AFTER the parts written in
   * the pausing turn, never overwrite index 0.
   */
  async nextPartIndex(messageId: string): Promise<number> {
    const rows = await this.db
      .select({ index: chatParts.index })
      .from(chatParts)
      .where(eq(chatParts.message_id, messageId))
      .orderBy(desc(chatParts.index))
      .limit(1);
    return rows[0] ? rows[0].index + 1 : 0;
  }

  /**
   * Lightweight id-only listing for the persist-incoming-tail dedup.
   * The full `listMessages` loads every part for every message — a
   * 100-turn session pays that cost on every new send when all the
   * route handler actually needs is "which message ids do we already
   * have a row for?"
   */
  async listMessageIds(sessionId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(eq(chatMessages.session_id, sessionId));
    return rows.map((r) => r.id);
  }

  async listMessages(
    sessionId: string
  ): Promise<Array<ChatMessageRow & { parts: ChatPartRow[] }>> {
    const messages = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.session_id, sessionId))
      .orderBy(asc(chatMessages.created_at), asc(chatMessages.id));
    const parts = await this.db
      .select()
      .from(chatParts)
      .where(eq(chatParts.session_id, sessionId))
      .orderBy(asc(chatParts.message_id), asc(chatParts.index));
    const partsByMessage = new Map<string, ChatPartRow[]>();
    for (const p of parts) {
      const row = rowToPart(p);
      const bucket = partsByMessage.get(row.message_id);
      if (bucket) bucket.push(row);
      else partsByMessage.set(row.message_id, [row]);
    }
    return (
      messages
        .map((m) => ({
          ...rowToMessage(m),
          parts: partsByMessage.get(m.id) ?? [],
        }))
        // Queued sends (RFC `queue`): rows carrying `metadata.queued_at` are
        // pending — not part of the transcript until they fire. Excluded here
        // and from `listVisibleMessages` (the model view); surfaced only via
        // `listQueuedMessages`. `listMessageIds` deliberately does NOT filter
        // (the persist-tail dedup must still see queued ids). Canceled queue
        // tombstones are likewise durable for enqueue idempotency, but are not
        // conversation history.
        .filter((m) => !isQueued(m.metadata) && !isQueueCanceled(m.metadata))
    );
  }

  /**
   * The live transcript: every non-hidden row in creation order, with parts.
   * Only a **rewind** hides rows (`hidden_at` is the truncation pointer); a
   * compaction leaves its summarized head visible here and is resolved at
   * read-time. This is the input both the model-view assembler
   * (`buildModelMessages`) and the token rollup apply the compaction boundary
   * to — so it is the linear history, not yet the compacted model view.
   */
  async listVisibleMessages(
    sessionId: string
  ): Promise<Array<ChatMessageRow & { parts: ChatPartRow[] }>> {
    const messages = await this.db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.session_id, sessionId),
          isNull(chatMessages.hidden_at)
        )
      )
      .orderBy(asc(chatMessages.created_at), asc(chatMessages.id));
    const parts = await this.db
      .select()
      .from(chatParts)
      .where(eq(chatParts.session_id, sessionId))
      .orderBy(asc(chatParts.message_id), asc(chatParts.index));
    const partsByMessage = new Map<string, ChatPartRow[]>();
    for (const p of parts) {
      const row = rowToPart(p);
      const bucket = partsByMessage.get(row.message_id);
      if (bucket) bucket.push(row);
      else partsByMessage.set(row.message_id, [row]);
    }
    return (
      messages
        .map((m) => ({
          ...rowToMessage(m),
          parts: partsByMessage.get(m.id) ?? [],
        }))
        // Queued sends (RFC `queue`): a pending `metadata.queued_at` row must
        // not reach the model — it is excluded until it fires (its `queued_at`
        // is cleared by {@link claimQueuedMessage}). See {@link listMessages}.
        // Canceled queue tombstones are also excluded permanently.
        .filter((m) => !isQueued(m.metadata) && !isQueueCanceled(m.metadata))
    );
  }

  // ──────────────────────────── queue ────────────────────────────
  // Queued sends (RFC `queue`): a queued message is a normal `user` row
  // carrying `metadata.queued_at`. It is held out of the model view and the
  // transcript until it fires; `listQueuedMessages` surfaces it for the host's
  // queued region. Firing conditionally clears `queued_at`
  // ({@link claimQueuedMessage}); the X affordance conditionally removes it
  // from the queue while retaining a hidden idempotency tombstone
  // ({@link deleteMessage}).

  /**
   * Persist a queued user message: a `user` row stamped with
   * `metadata.queued_at` plus its single text part (written in the same
   * AI-SDK part shape a fired turn consumes, so the row can later be fired
   * directly).
   *
   * A caller-provided id is an idempotency key. Repeating the same
   * `(session, id, text)` returns the original row — including when the row
   * already fired between the first response being lost and the retry. Reusing
   * the id for a different payload is a conflict. The message + part insert is
   * one synchronous SQLite transaction, so neither the scheduler nor another
   * window can observe a half-written queued message.
   */
  async appendQueuedMessage(
    sessionId: string,
    input: { id?: string; text: string; queued_at?: number }
  ): Promise<ChatMessageRow & { parts: ChatPartRow[] }> {
    const id = input.id ?? newMessageId();
    const queuedAt = input.queued_at ?? Date.now();
    const now = Date.now();
    const partId = newPartId();
    const metadataJson = JSON.stringify({
      queued_at: queuedAt,
      // Durable provenance survives fire/cancel after `queued_at` is removed,
      // so an ordinary direct user row can never impersonate an enqueue retry.
      queue_enqueued_at: queuedAt,
    });
    const dataJson = JSON.stringify({ type: "text", text: input.text });
    const sqlite = this.opened.sqlite;

    // The shared connection gate owns the transaction across this callback.
    // No unrelated Drizzle or raw-store operation can enter the connection
    // between the message and part inserts.
    return this.opened.withTx(async () => {
      const existing = sqlite
        .prepare(
          `SELECT id, session_id, role, metadata_json, hidden_at,
                  created_at, updated_at
           FROM chat_messages
           WHERE id = ?`
        )
        .get(id) as ChatMessageDbRow | undefined;
      if (existing) {
        const parts = sqlite
          .prepare(
            `SELECT id, message_id, session_id, "index", type, data_json,
                    tool_call_id, tool_state, created_at, updated_at
             FROM chat_parts
             WHERE message_id = ?
             ORDER BY "index", id`
          )
          .all(id) as ChatPartDbRow[];
        if (
          !isSameQueuedMessageRequest(
            existing,
            parts,
            sessionId,
            input.text,
            input.queued_at
          )
        ) {
          throw new QueueMessageConflictError(id);
        }
        return {
          ...rowToMessage(existing),
          parts: parts.map(rowToPart),
        };
      }

      sqlite
        .prepare(
          `INSERT INTO chat_messages
             (id, session_id, role, metadata_json, hidden_at, created_at, updated_at)
           VALUES (?, ?, 'user', ?, NULL, ?, ?)`
        )
        .run(id, sessionId, metadataJson, now, now);
      sqlite
        .prepare(
          `INSERT INTO chat_parts
             (id, message_id, session_id, "index", type, data_json,
              tool_call_id, tool_state, created_at, updated_at)
           VALUES (?, ?, ?, 0, 'text', ?, NULL, NULL, ?, ?)`
        )
        .run(partId, id, sessionId, dataJson, now, now);
      sqlite
        .prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?")
        .run(now, sessionId);

      return {
        id,
        session_id: sessionId,
        role: "user",
        metadata: {
          queued_at: queuedAt,
          queue_enqueued_at: queuedAt,
        },
        hidden_at: null,
        created_at: now,
        updated_at: now,
        parts: [
          {
            id: partId,
            message_id: id,
            session_id: sessionId,
            index: 0,
            type: "text",
            data: { type: "text", text: input.text },
            tool_call_id: null,
            tool_state: null,
            created_at: now,
            updated_at: now,
          },
        ],
      };
    });
  }

  /**
   * The queue: pending `metadata.queued_at` rows with parts, FIFO by
   * `queued_at` with a deterministic `id` tiebreak (RFC `queue / order`).
   */
  async listQueuedMessages(
    sessionId: string
  ): Promise<Array<ChatMessageRow & { parts: ChatPartRow[] }>> {
    const messages = await this.db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.session_id, sessionId),
          isNull(chatMessages.hidden_at)
        )
      );
    const parts = await this.db
      .select()
      .from(chatParts)
      .where(eq(chatParts.session_id, sessionId))
      .orderBy(asc(chatParts.message_id), asc(chatParts.index));
    const partsByMessage = new Map<string, ChatPartRow[]>();
    for (const p of parts) {
      const row = rowToPart(p);
      const bucket = partsByMessage.get(row.message_id);
      if (bucket) bucket.push(row);
      else partsByMessage.set(row.message_id, [row]);
    }
    return messages
      .map((m) => ({
        ...rowToMessage(m),
        parts: partsByMessage.get(m.id) ?? [],
      }))
      .filter((m) => isQueued(m.metadata))
      .sort((a, b) => {
        const qa = a.metadata.queued_at as number;
        const qb = b.metadata.queued_at as number;
        return qa - qb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      });
  }

  /**
   * Discover sessions with at least one live queued user row. This is the
   * trusted host-start recovery index: status hydration remains read-only,
   * while the host may explicitly kick these durable queues after restart.
   */
  async listQueuedSessionIds(): Promise<string[]> {
    const rows = await this.db
      .select({ session_id: chatMessages.session_id })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.role, "user"),
          isNull(chatMessages.hidden_at),
          sql`json_type(${chatMessages.metadata_json}, '$.queued_at') IN ('integer', 'real')`
        )
      )
      .groupBy(chatMessages.session_id)
      .orderBy(asc(chatMessages.session_id));
    return rows.map((row) => row.session_id);
  }

  /**
   * Close visible tool calls and every marked human-interaction continuation
   * that a dead host could not finish.
   *
   * This is a STARTUP-ONLY repair edge. A normal run may legitimately have a
   * non-human tool at `input-streaming`, `input-available`, or
   * `approval-responded`, so calling this while live streams exist could race
   * real execution. Any human interaction whose `continuation_run_id` is still
   * set is likewise an interrupted live turn, even when rewind has hidden its
   * message: no continuation from the prior host can still own that marker.
   * Terminalize and clear it rather than replaying model/tool side effects or
   * letting a later unhide expose a permanently unsettled marker. Human-input
   * tools at `input-available` are intentional durable waits and unanswered
   * supervised approvals use `approval-requested`; both remain untouched.
   * Historical completed results have a null marker and are never selected.
   *
   * Returns the number of rows advanced to `output-error`.
   */
  finalizeRestartOrphanedTools(): number {
    const attempt = this.opened.tryWithConnectionSync(() => {
      const humanTypeParams = HUMAN_INPUT_PART_TYPES.map(() => "?").join(", ");
      const rows = this.opened.sqlite
        .prepare(
          `SELECT chat_parts.id, chat_parts.session_id, chat_parts.type,
                  chat_parts.tool_call_id, chat_parts.tool_state,
                  chat_parts.data_json, chat_parts.continuation_run_id
           FROM chat_parts
           INNER JOIN chat_messages
             ON chat_messages.id = chat_parts.message_id
           WHERE chat_parts.continuation_run_id IS NOT NULL
              OR (
                chat_messages.hidden_at IS NULL
                AND (
                  chat_parts.tool_state IN ('input-streaming', 'approval-responded')
                  OR (
                    chat_parts.tool_state = 'input-available'
                    AND chat_parts.type NOT IN (${humanTypeParams})
                  )
               )
             )
           ORDER BY chat_parts.id`
        )
        .all(...HUMAN_INPUT_PART_TYPES) as Array<{
        id: string;
        session_id: string;
        type: string;
        tool_call_id: string | null;
        tool_state: string;
        data_json: string;
        continuation_run_id: string | null;
      }>;

      const update = this.opened.sqlite.prepare(
        `UPDATE chat_parts
         SET data_json = ?, tool_state = 'output-error',
             continuation_run_id = NULL, updated_at = ?
         WHERE id = ?
           AND session_id = ?
           AND tool_state = ?
           AND data_json = ?
           AND continuation_run_id IS ?`
      );
      const now = Date.now();
      let finalized = 0;
      for (const row of rows) {
        const parsed = parseJsonOr(row.data_json, null);
        const nextData: Record<string, unknown> =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? { ...(parsed as Record<string, unknown>) }
            : {
                type: row.type,
                ...(row.tool_call_id ? { toolCallId: row.tool_call_id } : {}),
              };
        nextData.state = "output-error";
        nextData.errorText = "aborted by host restart";
        delete nextData.error_text;
        delete nextData.output;
        const result = update.run(
          JSON.stringify(nextData),
          now,
          row.id,
          row.session_id,
          row.tool_state,
          row.data_json,
          row.continuation_run_id
        );
        finalized += Number(result.changes);
      }
      return finalized;
    });
    if (!attempt.acquired) {
      throw new Error(
        "cannot repair restart-orphaned tools while the sessions DB is busy"
      );
    }
    return attempt.value;
  }

  /**
   * Atomically claim one queued row for firing. The conditional UPDATE is the
   * cancel/fire serialization point: it succeeds only while this exact row
   * still belongs to `sessionId`, is visible, and carries the queued metadata
   * snapshot read immediately before it. Returns null when cancel or another
   * claimant won; no busy edge should be emitted in that case.
   *
   * This method is deliberately synchronous even though most store methods use
   * drizzle's async facade. Queue claim and the following stream reserve run on
   * one JavaScript stack, with no await/interleaving between them.
   */
  claimQueuedMessage(
    sessionId: string,
    messageId: string
  ): QueuedMessageClaim | null {
    const attempt = this.opened.tryWithConnectionSync(() => {
      const existing = this.opened.sqlite
        .prepare(
          `SELECT metadata_json, created_at, updated_at
           FROM chat_messages
           WHERE id = ? AND session_id = ? AND role = 'user' AND hidden_at IS NULL`
        )
        .get(messageId, sessionId) as
        | {
            metadata_json: string;
            created_at: number;
            updated_at: number;
          }
        | undefined;
      if (!existing) return null;

      const parsed = parseJsonOr(existing.metadata_json, null);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        !isQueued(parsed as Record<string, unknown>)
      ) {
        return null;
      }
      const metadata = { ...(parsed as Record<string, unknown>) };
      const queuedAt = metadata.queued_at as number;
      // Upgrade a pre-provenance queued row at the fire boundary. Once
      // `queued_at` is removed, this durable marker is the only fact that lets an
      // exact lost-response retry distinguish the fired enqueue from an ordinary
      // direct user row with the same id/text.
      if (typeof metadata.queue_enqueued_at !== "number") {
        metadata.queue_enqueued_at = queuedAt;
      }
      delete metadata.queued_at;
      const claimedMetadataJson = JSON.stringify(metadata);
      const now = Date.now();
      const result = this.opened.sqlite
        .prepare(
          `UPDATE chat_messages
           SET metadata_json = ?, created_at = ?, updated_at = ?
           WHERE id = ? AND session_id = ? AND role = 'user'
             AND hidden_at IS NULL AND metadata_json = ?`
        )
        .run(
          claimedMetadataJson,
          now,
          now,
          messageId,
          sessionId,
          existing.metadata_json
        );
      if (result.changes !== 1) return null;
      return {
        session_id: sessionId,
        message_id: messageId,
        queued_at: queuedAt,
        original_metadata_json: existing.metadata_json,
        claimed_metadata_json: claimedMetadataJson,
        original_created_at: existing.created_at,
        original_updated_at: existing.updated_at,
        claimed_created_at: now,
      };
    });
    return attempt.acquired ? attempt.value : null;
  }

  /**
   * Restore a claim whose synchronous stream reserve failed. The claimed
   * metadata + fire timestamp are re-asserted in the UPDATE, so stale cleanup
   * cannot put a row back after any later mutation.
   */
  restoreQueuedMessage(claim: QueuedMessageClaim): boolean {
    const attempt = this.opened.tryWithConnectionSync(() => {
      const result = this.opened.sqlite
        .prepare(
          `UPDATE chat_messages
           SET metadata_json = ?, created_at = ?, updated_at = ?
           WHERE id = ? AND session_id = ? AND role = 'user'
             AND hidden_at IS NULL AND metadata_json = ? AND created_at = ?`
        )
        .run(
          claim.original_metadata_json,
          claim.original_created_at,
          claim.original_updated_at,
          claim.message_id,
          claim.session_id,
          claim.claimed_metadata_json,
          claim.claimed_created_at
        );
      return result.changes === 1;
    });
    return attempt.acquired ? attempt.value : false;
  }

  /**
   * Cancel a queued message by replacing `queued_at` with a durable canceled
   * tombstone and hiding the row (RFC `queue / operating on queued messages`).
   * Retaining the id + payload is load-bearing idempotency: a retry whose
   * first response was lost cannot resurrect a message another window already
   * canceled. Doubly guarded — the row must (a) belong to `sessionId` and
   * (b) STILL carry the exact queued metadata snapshot, so cancel and fire
   * serialize and a fired/recorded turn can never be hidden.
   */
  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    await this.opened.withConnection(() => {
      const existing = this.opened.sqlite
        .prepare(
          `SELECT metadata_json
           FROM chat_messages
           WHERE id = ? AND session_id = ? AND role = 'user' AND hidden_at IS NULL`
        )
        .get(messageId, sessionId) as { metadata_json: string } | undefined;
      if (!existing) return;
      const parsed = parseJsonOr(existing.metadata_json, null);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        !isQueued(parsed as Record<string, unknown>)
      ) {
        return;
      }
      const metadata = { ...(parsed as Record<string, unknown>) };
      const queuedAt = metadata.queued_at as number;
      // Same legacy upgrade as the fire path: cancel removes `queued_at`, so copy
      // its provenance before leaving the durable tombstone.
      if (typeof metadata.queue_enqueued_at !== "number") {
        metadata.queue_enqueued_at = queuedAt;
      }
      delete metadata.queued_at;
      const now = Date.now();
      metadata.queue_canceled_at = now;
      // The one conditional UPDATE is atomic. If claim changed metadata after
      // the read, this matches zero rows and the fired turn remains untouched.
      this.opened.sqlite
        .prepare(
          `UPDATE chat_messages
           SET metadata_json = ?, hidden_at = ?, updated_at = ?
           WHERE id = ? AND session_id = ? AND role = 'user'
             AND hidden_at IS NULL AND metadata_json = ?`
        )
        .run(
          JSON.stringify(metadata),
          now,
          now,
          messageId,
          sessionId,
          existing.metadata_json
        );
    });
  }

  /**
   * Stamp per-turn token usage onto an assistant message's metadata
   * (RFC `persistency / chat_messages` `usage` convention). Merges into
   * existing metadata so a `model` / `agent` key set elsewhere survives.
   */
  async setMessageUsage(messageId: string, usage: MessageUsage): Promise<void> {
    await this.setMessageAccounting(messageId, { usage });
  }

  async setMessageAccounting(
    messageId: string,
    accounting: AssistantTurnAccounting
  ): Promise<void> {
    const existing = await this.getMessage(messageId);
    if (!existing) return;
    const next: Partial<AssistantTurnAccounting> = {};
    if (accounting.model !== undefined) next.model = accounting.model;
    if (accounting.usage !== undefined) next.usage = accounting.usage;
    const metadata = { ...existing.metadata, ...next };
    await this.db
      .update(chatMessages)
      .set({ metadata_json: JSON.stringify(metadata), updated_at: Date.now() })
      .where(eq(chatMessages.id, messageId));
  }

  /**
   * Stamp usage onto the most recent assistant message of a session.
   * The runtime calls this once a run finishes — the recorder owns
   * assistant-message creation, so the runtime can't address the row by
   * id, only "the latest assistant turn."
   */
  async setLatestAssistantUsage(
    sessionId: string,
    usage: MessageUsage
  ): Promise<void> {
    await this.setLatestAssistantAccounting(sessionId, { usage });
  }

  async setLatestAssistantAccounting(
    sessionId: string,
    accounting: AssistantTurnAccounting
  ): Promise<void> {
    const rows = await this.db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.session_id, sessionId),
          eq(chatMessages.role, "assistant")
        )
      )
      .orderBy(desc(chatMessages.created_at), desc(chatMessages.id))
      .limit(1);
    if (rows[0]) await this.setMessageAccounting(rows[0].id, accounting);
  }

  /**
   * Rewind to a prior message (RFC `session / rewinding`): the conversation
   * becomes "everything up to and including `fromMessageId`." History is
   * preserved — hidden rows stay in the DB.
   *
   * Since a compaction no longer hides anything (its boundary is resolved at
   * read-time from `tail_start_id`), `hidden_at` is now a pure truncation
   * pointer: hide every message after the target, re-expose the target and
   * everything before it. Rewinding past a compaction therefore hides the
   * summary marker (it sorts after the target) — which simply removes the
   * boundary, re-exposing the full pre-target history to the model. Nothing is
   * deleted, so an `unhideAfter` un-rewind restores it.
   */
  async rewind(
    sessionId: string,
    fromMessageId: string
  ): Promise<RewindResult> {
    const allRows = await this.db
      .select({
        id: chatMessages.id,
        created_at: chatMessages.created_at,
        hidden_at: chatMessages.hidden_at,
        metadata_json: chatMessages.metadata_json,
      })
      .from(chatMessages)
      .where(eq(chatMessages.session_id, sessionId))
      .orderBy(asc(chatMessages.created_at), asc(chatMessages.id));
    // Queued sends are PENDING, not history; canceled queue tombstones exist
    // only for idempotency. A rewind must touch neither. A queued row's
    // `created_at` sorts after the target, so hiding it would drop it from
    // `listQueuedMessages` forever while leaving `queued_at` stranded.
    const rows = allRows.filter((r) => {
      const metadata = parseJsonOr(r.metadata_json, {}) as Record<
        string,
        unknown
      >;
      return !isQueued(metadata) && !isQueueCanceled(metadata);
    });
    const targetIdx = rows.findIndex((r) => r.id === fromMessageId);
    if (targetIdx < 0) throw new MessageNotFoundError(fromMessageId);

    const now = Date.now();
    let hiddenCount = 0;
    // Atomic: the per-row hide/un-hide stamps are one truncation. A crash
    // mid-loop must not leave a partially-truncated view (some rows hidden,
    // others not). The plan was computed from the read above; the derived
    // rollup recompute stays outside the tx (keeps it short — see withTx).
    await this.opened.withTx(async () => {
      for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i];
        if (i > targetIdx) {
          if (r.hidden_at === null) {
            hiddenCount += 1;
            await this.db
              .update(chatMessages)
              .set({ hidden_at: now, updated_at: now })
              .where(eq(chatMessages.id, r.id));
          }
        } else if (r.hidden_at !== null) {
          await this.db
            .update(chatMessages)
            .set({ hidden_at: null, updated_at: now })
            .where(eq(chatMessages.id, r.id));
        }
      }
    });
    await this.recomputeRollups(sessionId);
    return {
      session_id: sessionId,
      to_message_id: fromMessageId,
      hidden_count: hiddenCount,
    };
  }

  /**
   * Un-hide every message created at or after `fromMessageId` (the
   * inverse of {@link rewind} — "un-rewind", and the un-hide a rewind
   * past a compaction performs). Recomputes rollups.
   */
  async unhideAfter(
    sessionId: string,
    fromMessageId: string,
    opts: { inclusive?: boolean } = {}
  ): Promise<void> {
    const target = await this.getMessage(fromMessageId);
    if (!target || target.session_id !== sessionId) {
      throw new MessageNotFoundError(fromMessageId);
    }
    const now = Date.now();
    const boundary = opts.inclusive
      ? or(
          gt(chatMessages.created_at, target.created_at),
          and(
            eq(chatMessages.created_at, target.created_at),
            sql`${chatMessages.id} >= ${target.id}`
          )
        )
      : or(
          gt(chatMessages.created_at, target.created_at),
          and(
            eq(chatMessages.created_at, target.created_at),
            gt(chatMessages.id, target.id)
          )
        );
    await this.db
      .update(chatMessages)
      .set({ hidden_at: null, updated_at: now })
      .where(
        and(
          eq(chatMessages.session_id, sessionId),
          boundary!,
          // A canceled queue row is a durable idempotency tombstone, not a
          // rewound turn. Un-rewind must never surface it as conversation.
          sql`json_extract(${chatMessages.metadata_json}, '$.queue_canceled_at') IS NULL`
        )
      );
    await this.recomputeRollups(sessionId);
  }

  private async rowToSessionWithDerivedCost(
    row: ChatSessionDbRow
  ): Promise<ChatSessionRow> {
    const session = rowToSession(row);
    return {
      ...session,
      // `chat_sessions.cost_usd` is a legacy persisted column. Public session
      // rows expose a cumulative base-rate estimate from every assistant
      // turn's model+usage. Unlike context rollups, the estimate does not
      // disappear after a rewind or compaction. Request-level bands cannot be
      // reconstructed because one assistant turn may aggregate model steps.
      cost_usd: await this.sessionCostUsd(row.id),
    };
  }

  private async sessionCostUsd(sessionId: string): Promise<number> {
    return (await this.sessionCostsUsd([sessionId])).get(sessionId) ?? 0;
  }

  private async sessionCostsUsd(
    sessionIds: readonly string[]
  ): Promise<Map<string, number>> {
    if (sessionIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        session_id: chatMessages.session_id,
        metadata_json: chatMessages.metadata_json,
      })
      .from(chatMessages)
      .where(
        and(
          inArray(chatMessages.session_id, [...sessionIds]),
          eq(chatMessages.role, "assistant")
        )
      );
    const costs = new Map<string, number>();
    for (const row of rows) {
      const meta = parseJsonOr(row.metadata_json, {}) as
        | ({ usage?: MessageUsage } & Partial<AssistantTurnAccounting>)
        | undefined;
      if (!meta?.usage) continue;
      costs.set(
        row.session_id,
        (costs.get(row.session_id) ?? 0) +
          (baseCostUsdFromMessageUsage(
            meta.model,
            meta.usage,
            this.opts?.catalog_view?.()
          ) ?? 0)
      );
    }
    return costs;
  }

  private async visibleUsageRollup(sessionId: string): Promise<{
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
  }> {
    const visible = await this.listVisibleMessages(sessionId);
    const boundary = compactionBoundary(visible);
    // Auto: count from the verbatim tail. Manual (no tail): count from the
    // summary itself, so only its token cost remains. No compaction: count all.
    let from = 0;
    if (boundary) {
      const tailIdx =
        boundary.tail_start_id !== null
          ? visible.findIndex((m) => m.id === boundary.tail_start_id)
          : -1;
      from = tailIdx >= 0 ? tailIdx : boundary.index;
    }
    let promptTokens = 0;
    let completionTokens = 0;
    let reasoningTokens = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    for (let i = from; i < visible.length; i += 1) {
      const m = visible[i];
      if (m.role !== "assistant") continue;
      const meta = m.metadata as
        | ({ usage?: MessageUsage } & Partial<AssistantTurnAccounting>)
        | undefined;
      const u = meta?.usage;
      if (!u) continue;
      promptTokens += u.input ?? 0;
      completionTokens += u.output ?? 0;
      reasoningTokens += u.reasoning ?? 0;
      cacheRead += u.cache_read ?? 0;
      cacheWrite += u.cache_write ?? 0;
    }
    const totalTokens = usageTokenTotal({
      input: promptTokens,
      output: completionTokens,
      reasoning: reasoningTokens,
      cache_read: cacheRead,
      cache_write: cacheWrite,
    });
    return {
      promptTokens,
      completionTokens,
      reasoningTokens,
      cacheRead,
      cacheWrite,
      totalTokens,
    };
  }

  /**
   * Recompute the session-row token rollups to reflect what the MODEL sees.
   * Called after a rewind/compaction/fork changes the live view.
   *
   * A compaction does not hide the summarized head, so a naive "sum every
   * visible assistant" would over-count the turns that are no longer in the
   * model's context. Instead, sum assistant `metadata.usage` from the latest
   * compaction boundary onward (the verbatim tail + the summary's own token
   * cost); rewind-hidden rows are already excluded by `listVisibleMessages`.
   *
   * Cost is deliberately not persisted. Public session rows derive cumulative
   * spend from every assistant turn's `{ model, usage }` and the current model
   * catalog, independent of the current context-window boundary.
   */
  async recomputeRollups(sessionId: string): Promise<void> {
    const rollup = await this.visibleUsageRollup(sessionId);
    await this.db
      .update(chatSessions)
      .set({
        prompt_tokens: rollup.promptTokens,
        completion_tokens: rollup.completionTokens,
        reasoning_tokens: rollup.reasoningTokens,
        cache_read: rollup.cacheRead,
        cache_write: rollup.cacheWrite,
        total_tokens: rollup.totalTokens,
        updated_at: Date.now(),
      })
      .where(eq(chatSessions.id, sessionId));
  }

  /**
   * Fork a session at a message (RFC `session / fork`). Copies every
   * VISIBLE message up to and including `fromMessageId` into a new
   * session with fresh ids (parts verbatim), recomputes rollups from the
   * copied turns, and records the lineage on `parent_id` /
   * `parent_message_id`. Side effects are NOT copied — a fork duplicates
   * the conversation, not the workspace.
   *
   * The in-flight guard ("reject if the parent has a run in flight") lives
   * at the runtime boundary that owns the stream registry, not here.
   */
  async fork(opts: ForkSessionOptions): Promise<ChatSessionRow> {
    const parent = await this.get(opts.parent_session_id);
    if (!parent) throw new SessionNotFoundError(opts.parent_session_id);
    const forkPoint = await this.getMessage(opts.from_message_id);
    if (!forkPoint || forkPoint.session_id !== opts.parent_session_id) {
      throw new MessageNotFoundError(opts.from_message_id);
    }

    // Internal fields (workspaceRoot, parent permissions) aren't on the
    // public ChatSessionRow; read them straight from the row.
    const parentDb = (
      await this.db
        .select({
          workspace_root: chatSessions.workspace_root,
        })
        .from(chatSessions)
        .where(eq(chatSessions.id, opts.parent_session_id))
        .limit(1)
    )[0];

    // Read the source transcript before opening the tx (keeps the tx short —
    // no long read while holding the write lock; see withTx).
    const source = await this.listVisibleMessages(opts.parent_session_id);
    const forkPointIndex = source.findIndex(
      (message) => message.id === opts.from_message_id
    );
    if (forkPointIndex < 0) {
      // Raw message lookup also sees pending queue rows and canceled
      // tombstones. Neither is conversation history, so neither can anchor a
      // fork or cause the whole visible transcript to be copied accidentally.
      throw new MessageNotFoundError(opts.from_message_id);
    }
    const sourceThroughForkPoint = source.slice(0, forkPointIndex + 1);

    // Atomic: the new session row and its copied messages/parts are one unit.
    // A crash mid-copy must not leave a fork session with a partial transcript
    // (a session row whose history is truncated). The derived rollup recompute
    // stays outside the tx.
    const forkRow = await this.opened.withTx(async () => {
      const created = await this.create({
        agent: parent.agent,
        workspace_id: parent.workspace_id ?? undefined,
        workspace_root: parentDb?.workspace_root ?? undefined,
        // Fork title rule: docs/wg/ai/agent/session.md §Forking.
        title: session_title.forFork(parent.title),
        model: parent.model ?? undefined,
        mode: parent.mode ?? undefined,
        metadata: { ...parent.metadata, ...opts.metadata },
        permissions: parent.permissions,
        parent_id: parent.id,
        parent_message_id: opts.from_message_id,
      });

      // Copy visible messages up to and including the fork point, in order.
      for (const msg of sourceThroughForkPoint) {
        const newMsgId = newMessageId();
        await this.db.insert(chatMessages).values({
          id: newMsgId,
          session_id: created.id,
          role: msg.role,
          metadata_json: JSON.stringify(msg.metadata ?? {}),
          hidden_at: null,
          created_at: msg.created_at,
          updated_at: msg.updated_at,
        });
        for (const part of msg.parts) {
          await this.db.insert(chatParts).values({
            id: newPartId(),
            message_id: newMsgId,
            session_id: created.id,
            index: part.index,
            type: part.type,
            data_json: JSON.stringify(part.data ?? null),
            tool_call_id: part.tool_call_id ?? null,
            tool_state: part.tool_state ?? null,
            // A fork copies transcript history, never an in-flight host
            // continuation lease from the parent process.
            continuation_run_id: null,
            created_at: part.created_at,
            updated_at: part.updated_at,
          });
        }
      }
      return created;
    });

    await this.recomputeRollups(forkRow.id);
    return (await this.get(forkRow.id))!;
  }

  /**
   * Apply a compaction (RFC `session / compaction / what compaction
   * produces`): append a synthetic assistant message carrying a
   * `data-compaction` part, then recompute the rollups.
   *
   * The summarized head is NOT hidden or deleted — the log stays linear and
   * complete, and the model boundary is resolved at read-time from the part's
   * `tail_start_id` (see `session/boundary.ts`). The marker is stamped at the
   * moment of compaction (`createdAt = now`) so it sorts at the BOTTOM of the
   * transcript, where the user/loop invoked it. `tailStartId` is `null` when
   * the compaction summarized everything (no verbatim tail — manual compact).
   */
  async applyCompaction(opts: {
    session_id: string;
    summary: string;
    /** First message kept verbatim, or `null` when nothing is kept. */
    tail_start_id: string | null;
    auto: boolean;
    summary_tokens: number;
  }): Promise<{ summary_message_id: string }> {
    const now = Date.now();
    const msgId = newMessageId();
    // Atomic: the marker message and its `data-compaction` part are one unit. A
    // crash between the two inserts would leave a compaction message with no
    // compaction part — the boundary silently vanishes and the summarized head
    // re-enters the model's context. The derived rollup recompute stays outside
    // the tx (keeps it short — see withTx).
    await this.opened.withTx(async () => {
      await this.db.insert(chatMessages).values({
        id: msgId,
        session_id: opts.session_id,
        role: "assistant",
        // The synthetic summary's `usage.input` is the summary's token cost — what
        // it adds to every future prompt — so the boundary-aware recomputeRollups
        // reflects the freed context (the summarized head drops out of the count).
        metadata_json: JSON.stringify({
          compaction: true,
          usage: { input: opts.summary_tokens },
        }),
        hidden_at: null,
        created_at: now,
        updated_at: now,
      });
      await this.db.insert(chatParts).values({
        id: newPartId(),
        message_id: msgId,
        session_id: opts.session_id,
        index: 0,
        type: "data-compaction",
        data_json: JSON.stringify({
          type: "data-compaction",
          data: {
            summary: opts.summary,
            tail_start_id: opts.tail_start_id,
            auto: opts.auto,
            summary_tokens: opts.summary_tokens,
          },
        }),
        tool_call_id: null,
        tool_state: null,
        created_at: now,
        updated_at: now,
      });
    });
    await this.recomputeRollups(opts.session_id);
    return { summary_message_id: msgId };
  }

  /** Replace the session-scoped permission rules. */
  async setPermissions(
    sessionId: string,
    permissions: PermissionRule[]
  ): Promise<void> {
    await this.db
      .update(chatSessions)
      .set({
        permissions_json: JSON.stringify(permissions),
        updated_at: Date.now(),
      })
      .where(eq(chatSessions.id, sessionId));
  }

  async finalizeMessage(messageId: string): Promise<void> {
    const now = Date.now();
    await this.db
      .update(chatMessages)
      .set({ updated_at: now })
      .where(eq(chatMessages.id, messageId));
  }

  // ──────────────────────────── parts ───────────────────────────────

  /**
   * Upsert a part keyed by `(messageId, index)`. If a `toolCallId` is
   * provided and a row with that toolCallId already exists for this
   * message, that row is updated regardless of `index` — matches the AI SDK
   * tool-state transition flow (`tool-input-start` → `tool-input-delta` →
   * `tool-input-available` → `tool-output-available`).
   *
   * NOTE: `data` REPLACES the row's `data_json` wholesale — it is not merged.
   * A field set on an earlier chunk (e.g. `input`, which arrives on
   * `tool-input-available` but not on the later `tool-output-available`) is
   * erased unless the caller re-includes it. The recorder owns this: it
   * remembers per-tool state and passes the COMPLETE part on every write.
   */
  async upsertPart(
    messageId: string,
    input: UpsertPartInput
  ): Promise<ChatPartRow> {
    const now = Date.now();
    const dataJson = JSON.stringify(input.data ?? null);
    // Tool parts are keyed by toolCallId (the row migrates across indexes as the
    // AI SDK tool-state flow advances), so resolve that row first and update it
    // in place. This leg is single-writer per toolCallId, so read-then-write is
    // safe here; the index-keyed leg below is the one that races.
    if (input.tool_call_id) {
      const byTool = await this.db
        .select()
        .from(chatParts)
        .where(
          and(
            eq(chatParts.message_id, messageId),
            eq(chatParts.tool_call_id, input.tool_call_id)
          )
        )
        .limit(1);
      const existing = byTool[0];
      if (existing) {
        const next = {
          type: input.type,
          data_json: dataJson,
          tool_call_id: input.tool_call_id ?? existing.tool_call_id,
          tool_state: input.tool_state ?? existing.tool_state,
          index: input.index,
          updated_at: now,
        };
        await this.db
          .update(chatParts)
          .set(next)
          .where(eq(chatParts.id, existing.id));
        return rowToPart({ ...existing, ...next });
      }
    }

    // Index-keyed leg: a single atomic `INSERT … ON CONFLICT(message_id,
    // "index") DO UPDATE`. The old read-then-write let two racing writers both
    // miss the SELECT and INSERT duplicate rows for the same (message_id,
    // index) — the unique index (schema.ts) + this upsert collapse that to one
    // row. COALESCE preserves the existing toolCallId/toolState when the caller
    // omits them, matching the prior fall-back-to-existing behavior. Read the
    // row back afterward to return its authoritative id/createdAt (the conflict
    // path keeps the EXISTING row's, which the sqlite-proxy `run` doesn't echo).
    const session =
      input.session_id ?? (await this.messageSessionId(messageId));
    await this.db
      .insert(chatParts)
      .values({
        id: input.id ?? newPartId(),
        message_id: messageId,
        session_id: session,
        index: input.index,
        type: input.type,
        data_json: dataJson,
        tool_call_id: input.tool_call_id ?? null,
        tool_state: input.tool_state ?? null,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: [chatParts.message_id, chatParts.index],
        set: {
          type: input.type,
          data_json: dataJson,
          tool_call_id: sql`coalesce(${input.tool_call_id ?? null}, ${chatParts.tool_call_id})`,
          tool_state: sql`coalesce(${input.tool_state ?? null}, ${chatParts.tool_state})`,
          updated_at: now,
        },
      });
    const stored = await this.db
      .select()
      .from(chatParts)
      .where(
        and(
          eq(chatParts.message_id, messageId),
          eq(chatParts.index, input.index)
        )
      )
      .limit(1);
    return rowToPart(stored[0]);
  }

  /**
   * GRIDA-SEC-004 — read-only preflight for an approval continuation.
   *
   * A resume request must be able to validate all later fallible work (scratch
   * staging, incoming persistence) BEFORE it consumes the approval. This
   * predicate verifies that the exact visible pending approval exists without
   * changing it; {@link commitApprovalContinuation} remains the atomic commit.
   */
  async matchesPendingApproval(
    sessionId: string,
    answer: {
      tool_call_id: string;
      approval_id: string;
    }
  ): Promise<boolean> {
    const rows = await this.db
      .select({
        data_json: chatParts.data_json,
        tool_call_id: chatParts.tool_call_id,
        tool_state: chatParts.tool_state,
      })
      .from(chatParts)
      .innerJoin(chatMessages, eq(chatMessages.id, chatParts.message_id))
      .where(
        and(
          eq(chatParts.session_id, sessionId),
          eq(chatParts.tool_call_id, answer.tool_call_id),
          eq(chatParts.tool_state, "approval-requested"),
          isNull(chatMessages.hidden_at)
        )
      )
      .limit(2);
    // Parallel tool calls may legitimately leave several approvals pending.
    // Require one exact correlated block; unrelated pending calls do not make
    // this answer impossible, while duplicate identities still fail closed.
    if (rows.length !== 1) return false;
    const existing = rows[0];
    if (
      existing.tool_state !== "approval-requested" ||
      existing.tool_call_id !== answer.tool_call_id
    ) {
      return false;
    }
    let data: Record<string, unknown> | null;
    try {
      data = JSON.parse(existing.data_json) as Record<string, unknown>;
    } catch {
      return false;
    }
    const approval = data?.approval as { id?: unknown } | undefined;
    return approval?.id === answer.approval_id;
  }

  /**
   * GRIDA-SEC-004 — answer a PENDING tool approval (RFC `permission modes`,
   * Phase 2). The renderer may only ANSWER an approval the server actually
   * asked. This flips a persisted tool part to `approval-responded` ONLY when
   * it is currently `approval-requested` AND its stamped approval id matches the
   * answer — never creating a part, never touching input/output/tool_call_id.
   * A non-pending, unknown, or id-mismatched answer is a silent no-op. That
   * keeps the server authoritative: a forged client message cannot inject a
   * tool call, approve something that was never asked, or rewrite assistant
   * history — it can only supply the boolean the server is waiting on.
   * Returns true iff a pending approval was answered.
   */
  async answerApproval(
    sessionId: string,
    answer: ApprovalAnswerInput
  ): Promise<boolean> {
    return (await this.writeApprovalAnswer(sessionId, answer, null)) !== null;
  }

  /**
   * Commit an approval answer together with the exact model run that must
   * consume it. The marker is written in the same conditional UPDATE as
   * `approval-responded`, so there is no durable state where the answer looks
   * complete while its continuation ownership is missing.
   */
  async commitApprovalContinuation(
    sessionId: string,
    answer: ApprovalAnswerInput,
    continuationRunId: string
  ): Promise<HumanInputContinuation | null> {
    if (continuationRunId.length === 0) return null;
    const committed = await this.writeApprovalAnswer(
      sessionId,
      answer,
      continuationRunId
    );
    return committed
      ? {
          message_id: committed.message_id,
          tool_call_id: answer.tool_call_id,
          run_id: continuationRunId,
        }
      : null;
  }

  /**
   * Undo an exact approval commit when synchronous stream reservation fails.
   * The run marker is the stale-callback fence: a failure from an older attempt
   * cannot reopen a newer decision.
   */
  async rollbackApprovalContinuation(
    sessionId: string,
    continuation: HumanInputContinuation
  ): Promise<boolean> {
    if (continuation.run_id.length === 0) return false;
    return this.opened.withConnection(() => {
      const existing = this.opened.sqlite
        .prepare(
          `SELECT id, data_json
           FROM chat_parts
           WHERE session_id = ?
             AND message_id = ?
             AND tool_call_id = ?
             AND tool_state = 'approval-responded'
             AND continuation_run_id = ?
             AND EXISTS (
               SELECT 1
               FROM chat_messages
               WHERE chat_messages.id = chat_parts.message_id
                 AND chat_messages.session_id = ?
                 AND chat_messages.hidden_at IS NULL
             )`
        )
        .get(
          sessionId,
          continuation.message_id,
          continuation.tool_call_id,
          continuation.run_id,
          sessionId
        ) as { id: string; data_json: string } | undefined;
      if (!existing) return false;
      const parsed = parseJsonOr(existing.data_json, null);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return false;
      }
      const approval = (parsed as Record<string, unknown>).approval as
        | { id?: unknown }
        | undefined;
      if (typeof approval?.id !== "string") return false;
      const pendingData = {
        ...(parsed as Record<string, unknown>),
        state: "approval-requested",
        approval: { id: approval.id },
      };
      const updated = this.opened.sqlite
        .prepare(
          `UPDATE chat_parts
           SET data_json = ?, tool_state = 'approval-requested',
               continuation_run_id = NULL, updated_at = ?
           WHERE id = ?
             AND session_id = ?
             AND message_id = ?
             AND tool_call_id = ?
             AND tool_state = 'approval-responded'
             AND data_json = ?
             AND continuation_run_id = ?`
        )
        .run(
          JSON.stringify(pendingData),
          Date.now(),
          existing.id,
          sessionId,
          continuation.message_id,
          continuation.tool_call_id,
          existing.data_json,
          continuation.run_id
        );
      return updated.changes === 1;
    });
  }

  private async writeApprovalAnswer(
    sessionId: string,
    answer: ApprovalAnswerInput,
    continuationRunId: string | null
  ): Promise<{ message_id: string } | null> {
    return this.opened.withConnection(() => {
      const existing = this.opened.sqlite
        .prepare(
          `SELECT chat_parts.id, chat_parts.message_id, chat_parts.data_json
           FROM chat_parts
           INNER JOIN chat_messages
             ON chat_messages.id = chat_parts.message_id
           WHERE chat_parts.session_id = ?
             AND chat_parts.tool_call_id = ?
             AND chat_parts.tool_state = 'approval-requested'
             AND chat_messages.hidden_at IS NULL
           ORDER BY chat_parts.id
           LIMIT 1`
        )
        .get(sessionId, answer.tool_call_id) as
        | { id: string; message_id: string; data_json: string }
        | undefined;
      if (!existing) return null;
      const data = parseJsonOr(existing.data_json, null);
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return null;
      }
      const approval = (data as Record<string, unknown>).approval as
        | { id?: unknown }
        | undefined;
      // The answer must carry the exact approval id the server issued.
      if (approval?.id !== answer.approval_id) return null;
      const nextData = {
        ...(data as Record<string, unknown>),
        state: "approval-responded",
        approval: {
          id: answer.approval_id,
          approved: answer.approved,
          ...(answer.reason ? { reason: answer.reason } : {}),
        },
      };
      // Single-writer: re-assert the exact pending JSON and state in the UPDATE.
      // If two answers race past the read, only the first can flip the row.
      const result = this.opened.sqlite
        .prepare(
          `UPDATE chat_parts
           SET data_json = ?, tool_state = 'approval-responded',
               continuation_run_id = ?, updated_at = ?
           WHERE id = ?
             AND session_id = ?
             AND message_id = ?
             AND tool_call_id = ?
             AND tool_state = 'approval-requested'
             AND data_json = ?
             AND EXISTS (
               SELECT 1
               FROM chat_messages
               WHERE chat_messages.id = chat_parts.message_id
                 AND chat_messages.session_id = ?
                 AND chat_messages.hidden_at IS NULL
             )`
        )
        .run(
          JSON.stringify(nextData),
          continuationRunId,
          Date.now(),
          existing.id,
          sessionId,
          existing.message_id,
          answer.tool_call_id,
          existing.data_json,
          sessionId
        );
      return result.changes === 1 ? { message_id: existing.message_id } : null;
    });
  }

  /**
   * GRIDA-SEC-004 — read-only preflight for a client-carried human-input
   * result. The exact visible assistant message + tool call must still be a
   * pending human-input tool. This lets the runtime validate/stage the request
   * before {@link fillToolResult} commits the answer.
   */
  async canFillPendingHumanInputResult(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    resultType: string
  ): Promise<boolean> {
    const rows = await this.db
      .select({
        message_id: chatParts.message_id,
        tool_call_id: chatParts.tool_call_id,
        tool_state: chatParts.tool_state,
        type: chatParts.type,
      })
      .from(chatParts)
      .innerJoin(chatMessages, eq(chatMessages.id, chatParts.message_id))
      .where(
        and(
          eq(chatParts.session_id, sessionId),
          eq(chatParts.message_id, messageId),
          eq(chatParts.tool_call_id, toolCallId),
          eq(chatParts.type, resultType),
          eq(chatParts.tool_state, "input-available"),
          inArray(chatParts.type, HUMAN_INPUT_PART_TYPES),
          isNull(chatMessages.hidden_at)
        )
      )
      .limit(2);
    if (rows.length !== 1) return false;
    const pending = rows[0];
    return (
      pending.message_id === messageId &&
      pending.tool_call_id === toolCallId &&
      pending.type === resultType &&
      pending.tool_state === "input-available" &&
      HUMAN_INPUT_PART_TYPES.includes(
        pending.type as (typeof HUMAN_INPUT_PART_TYPES)[number]
      )
    );
  }

  /**
   * Fill in a CLIENT-resolved tool result — the desktop file-window sidebar's
   * single-file mode resolves fs tools in the renderer, so the result reaches
   * the server only on the next request's assistant message (see
   * `persistResolvedToolResults` in `runtime/run-input.ts`). Flips a tool part
   * from the called-but-unresolved state (`input-available`) to its terminal
   * result, IN PLACE — keyed by `tool_call_id`, **never touching the part's
   * `index`** (so it can't collide with a sibling part's slot — the bug that
   * 500'd turn 2 once decks went server-bound and produced many tool parts) and
   * **never overwriting an already-resolved row** (a server-executed tool, or a
   * re-send of an already-filled one — those stay `output-available`, so the
   * conditional `WHERE` matches 0 rows and is a no-op). A missing row is also a
   * no-op, which keeps the server authoritative: the renderer can only supply a
   * result for a call the server delegated to it and is still waiting on.
   * The incoming type must match, and only the terminal output/error is merged;
   * persisted tool identity and input remain server-owned. Returns true iff
   * the conditional fill committed.
   *
   * GRIDA-SEC-004: scoped by `sessionId` so a client-authored resend can only
   * fill a pending row in its OWN session — `message_id` already pins the
   * session, but the explicit predicate makes the boundary part of the query.
   */
  async fillToolResult(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    result: { type: string; data: unknown; tool_state: string }
  ): Promise<boolean> {
    // Human-input results carry a stronger contract: consuming the answer must
    // atomically record which resumed run owes its continuation. Force those
    // callers through `commitHumanInputContinuation` so a future generic fill
    // cannot recreate the restart hole.
    if (isHumanInputPartType(result.type)) return false;
    return this.fillToolResultInternal(
      sessionId,
      messageId,
      toolCallId,
      result,
      null
    );
  }

  /**
   * GRIDA-SEC-004 — atomically consume one exact client-resolved human-input
   * result and bind it to the run that will continue the model turn.
   *
   * The marker shares the same conditional UPDATE as the terminal tool result:
   * there is never a durable `output-available`/`output-error` answer with no
   * record that its continuation is still owed. Only the exact visible
   * question/design-search row can be consumed. The marker stays internal to
   * the host DB rather than leaking into renderer/model-visible `data_json`.
   */
  async commitHumanInputContinuation(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    continuationRunId: string,
    result: { type: string; data: unknown; tool_state: string }
  ): Promise<boolean> {
    if (continuationRunId.length === 0 || !isHumanInputPartType(result.type)) {
      return false;
    }
    return this.fillToolResultInternal(
      sessionId,
      messageId,
      toolCallId,
      result,
      continuationRunId
    );
  }

  private async fillToolResultInternal(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    result: { type: string; data: unknown; tool_state: string },
    continuationRunId: string | null
  ): Promise<boolean> {
    if (
      result.tool_state !== "output-available" &&
      result.tool_state !== "output-error"
    ) {
      return false;
    }
    return this.opened.withConnection(() => {
      const existing = this.opened.sqlite
        .prepare(
          `SELECT id, type, data_json
           FROM chat_parts
           WHERE session_id = ?
             AND message_id = ?
             AND tool_call_id = ?
             AND tool_state = 'input-available'
             AND EXISTS (
               SELECT 1
               FROM chat_messages
               WHERE chat_messages.id = chat_parts.message_id
                 AND chat_messages.session_id = ?
                 AND chat_messages.hidden_at IS NULL
             )`
        )
        .get(sessionId, messageId, toolCallId, sessionId) as
        | { id: string; type: string; data_json: string }
        | undefined;
      if (!existing || existing.type !== result.type) return false;

      const persistedData = parseJsonOr(existing.data_json, null);
      const suppliedData = result.data;
      if (
        !persistedData ||
        typeof persistedData !== "object" ||
        Array.isArray(persistedData) ||
        !suppliedData ||
        typeof suppliedData !== "object" ||
        Array.isArray(suppliedData)
      ) {
        return false;
      }
      const supplied = suppliedData as Record<string, unknown>;
      const nextData: Record<string, unknown> = {
        ...(persistedData as Record<string, unknown>),
        state: result.tool_state,
      };
      if (result.tool_state === "output-available") {
        if (!Object.hasOwn(supplied, "output")) return false;
        nextData.output = supplied.output;
        delete nextData.errorText;
        delete nextData.error_text;
      } else {
        const errorText = supplied.errorText ?? supplied.error_text;
        if (typeof errorText !== "string") return false;
        nextData.errorText = errorText;
        delete nextData.output;
      }
      const nextDataJson = JSON.stringify(nextData);
      const updated = this.opened.sqlite
        .prepare(
          `UPDATE chat_parts
           SET data_json = ?, tool_state = ?, continuation_run_id = ?,
               updated_at = ?
           WHERE id = ?
             AND session_id = ?
             AND message_id = ?
             AND tool_call_id = ?
             AND type = ?
             AND tool_state = 'input-available'
             AND data_json = ?
             AND EXISTS (
               SELECT 1
               FROM chat_messages
               WHERE chat_messages.id = chat_parts.message_id
                 AND chat_messages.session_id = ?
                 AND chat_messages.hidden_at IS NULL
             )`
        )
        .run(
          nextDataJson,
          result.tool_state,
          continuationRunId,
          Date.now(),
          existing.id,
          sessionId,
          messageId,
          toolCallId,
          existing.type,
          existing.data_json,
          sessionId
        );
      return updated.changes === 1;
    });
  }

  /**
   * Undo a just-committed human-input result when synchronous stream
   * reservation fails before the correlated run starts. Identity is guarded by
   * session/message/tool/run id and the exact stored JSON snapshot, so a stale
   * failure cannot reopen a newer answer.
   */
  async rollbackHumanInputContinuation(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    continuationRunId: string
  ): Promise<boolean> {
    if (continuationRunId.length === 0) return false;
    return this.opened.withConnection(() => {
      const humanTypeParams = HUMAN_INPUT_PART_TYPES.map(() => "?").join(", ");
      const existing = this.opened.sqlite
        .prepare(
          `SELECT id, type, tool_state, data_json
           FROM chat_parts
           WHERE session_id = ?
             AND message_id = ?
             AND tool_call_id = ?
             AND continuation_run_id = ?
             AND type IN (${humanTypeParams})
             AND tool_state IN ('output-available', 'output-error')
             AND EXISTS (
               SELECT 1
               FROM chat_messages
               WHERE chat_messages.id = chat_parts.message_id
                 AND chat_messages.session_id = ?
                 AND chat_messages.hidden_at IS NULL
             )`
        )
        .get(
          sessionId,
          messageId,
          toolCallId,
          continuationRunId,
          ...HUMAN_INPUT_PART_TYPES,
          sessionId
        ) as
        | {
            id: string;
            type: string;
            tool_state: string;
            data_json: string;
          }
        | undefined;
      if (!existing) return false;
      const parsed = parseJsonOr(existing.data_json, null);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return false;
      }
      const pendingData: Record<string, unknown> = {
        ...(parsed as Record<string, unknown>),
        state: "input-available",
      };
      delete pendingData.output;
      delete pendingData.errorText;
      delete pendingData.error_text;
      const pendingDataJson = JSON.stringify(pendingData);
      const updated = this.opened.sqlite
        .prepare(
          `UPDATE chat_parts
           SET data_json = ?, tool_state = 'input-available',
               continuation_run_id = NULL, updated_at = ?
           WHERE id = ?
             AND session_id = ?
             AND message_id = ?
             AND tool_call_id = ?
             AND type = ?
             AND tool_state = ?
             AND data_json = ?
             AND continuation_run_id = ?`
        )
        .run(
          pendingDataJson,
          Date.now(),
          existing.id,
          sessionId,
          messageId,
          toolCallId,
          existing.type,
          existing.tool_state,
          existing.data_json,
          continuationRunId
        );
      return updated.changes === 1;
    });
  }

  /**
   * Clear the exact run's human-interaction marker after its recorder has
   * flushed at the terminal finish/error/abort barrier. The approval/result
   * transcript remains unchanged.
   */
  async settleHumanInputContinuation(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    continuationRunId: string
  ): Promise<boolean> {
    if (continuationRunId.length === 0) return false;
    return this.opened.withConnection(() => {
      const updated = this.opened.sqlite
        .prepare(
          `UPDATE chat_parts
           SET continuation_run_id = NULL, updated_at = ?
           WHERE session_id = ?
             AND message_id = ?
             AND tool_call_id = ?
             AND continuation_run_id = ?
             AND EXISTS (
               SELECT 1
               FROM chat_messages
               WHERE chat_messages.id = chat_parts.message_id
                 AND chat_messages.session_id = ?
                 AND chat_messages.hidden_at IS NULL
             )`
        )
        .run(
          Date.now(),
          sessionId,
          messageId,
          toolCallId,
          continuationRunId,
          sessionId
        );
      return updated.changes === 1;
    });
  }

  /**
   * GRIDA-SEC-004 — does this session have an UNANSWERED supervised approval?
   * True iff a persisted tool part is still `approval-requested` (RFC
   * `permission modes`, Phase 2). A turn blocked awaiting the user's Allow/Deny
   * is NOT a completed turn: the queue drain consults this to stay paused until
   * the user resolves it (RFC `queue` § drain-pause — the same class as a hard
   * error pausing the drain). Read-only existence check against the
   * authoritative persisted state (restart-durable); reads no input / output /
   * tool args / message content.
   */
  async hasPendingApproval(sessionId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: chatParts.id })
      .from(chatParts)
      .innerJoin(chatMessages, eq(chatMessages.id, chatParts.message_id))
      .where(
        and(
          eq(chatParts.session_id, sessionId),
          eq(chatParts.tool_state, "approval-requested"),
          isNull(chatMessages.hidden_at)
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Classify this session's UNSETTLED human-in-the-loop block. A persisted
   * supervised approval (`approval-requested`, or a marked
   * `approval-responded`) maps to `approval`; a human-input tool (e.g.
   * `question`) paused at `input-available` maps to `user-input`. Any committed
   * human interaction whose exact continuation marker has not settled remains
   * classified as a fail-closed block.
   * In normal operation that marker is cleared inside the stream's terminal
   * settlement barrier before idle/error projection, so this extra leg is
   * observable only after a commit→reserve failure or failed marker clear.
   * `null` means no visible human block is open or unsettled.
   *
   * This is the authoritative, restart-durable source for both the projected
   * session status and the drain-pause predicate (RFC `queue` § drain-pause):
   * the queue waits while either class is open, so a later turn never fires
   * ahead of the user's pending decision. If malformed history contains both,
   * approval wins; either result still keeps the session safely blocked.
   *
   * The `input-available` leg is keyed on the {@link HUMAN_INPUT_PART_TYPES}
   * *trait*, NOT a literal name — a future richer human-block tool joins by
   * being added to that set. The trait clause is REQUIRED to distinguish a real
   * human block from a *transient* client-resolved fs call (which also sits at
   * `input-available` for the moment between the stream finishing and the
   * renderer filling its result, and must NOT pause the drain). Read-only
   * existence check; reads no input/output/args/content.
   *
   * Scoped to VISIBLE messages (`hidden_at IS NULL`): a rewind only hides
   * messages, it does not delete their parts. Without this join, rewinding past
   * a paused approval/question would leave the block "pending" forever — the
   * gate would keep returning `human-input-pending` for a prompt the user can no
   * longer see (the same visibility rule as `listVisibleMessages`).
   */
  async pendingHumanInputKind(
    sessionId: string
  ): Promise<"approval" | "user-input" | null> {
    const rows = await this.db
      .select({
        continuation_run_id: chatParts.continuation_run_id,
        type: chatParts.type,
        tool_state: chatParts.tool_state,
      })
      .from(chatParts)
      .innerJoin(chatMessages, eq(chatMessages.id, chatParts.message_id))
      .where(
        and(
          eq(chatParts.session_id, sessionId),
          isNull(chatMessages.hidden_at),
          or(
            eq(chatParts.tool_state, "approval-requested"),
            and(
              eq(chatParts.tool_state, "input-available"),
              inArray(chatParts.type, HUMAN_INPUT_PART_TYPES)
            ),
            isNotNull(chatParts.continuation_run_id)
          )
        )
      );
    if (
      rows.some(
        (row) =>
          row.tool_state === "approval-requested" ||
          row.tool_state === "approval-responded"
      )
    ) {
      return "approval";
    }
    return rows.length > 0 ? "user-input" : null;
  }

  /**
   * Does this session have any unanswered human-in-the-loop block?
   * Compatibility predicate for admission checks; classification lives in
   * {@link pendingHumanInputKind} so status and admission cannot drift.
   */
  async hasPendingHumanInput(sessionId: string): Promise<boolean> {
    return (await this.pendingHumanInputKind(sessionId)) !== null;
  }

  /**
   * Find the FIRST persisted part for a tool call in a session (by `created_at`)
   * — the original tool-call part. Used by the recorder to resolve a tool whose
   * input/output land on DIFFERENT turns: a command approved in `accept-edits`
   * is CALLED in the pausing turn but EXECUTED on the later resume turn (a fresh
   * recorder that never saw the input). Without this, the result is persisted as
   * a nameless `tool` part on the resume message instead of completing the
   * original `tool-run_command` part — and the model-view rebuild drops it,
   * re-asking forever. Returns the part's slot + decoded data, or null.
   */
  async findToolPart(
    sessionId: string,
    toolCallId: string
  ): Promise<{
    message_id: string;
    index: number;
    type: string;
    data: unknown;
  } | null> {
    const rows = await this.db
      .select()
      .from(chatParts)
      .where(
        and(
          eq(chatParts.session_id, sessionId),
          eq(chatParts.tool_call_id, toolCallId)
        )
      )
      .orderBy(chatParts.created_at)
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    let data: unknown = null;
    try {
      data = JSON.parse(r.data_json);
    } catch {
      data = null;
    }
    return { message_id: r.message_id, index: r.index, type: r.type, data };
  }

  private async messageSessionId(messageId: string): Promise<string> {
    const rows = await this.db
      .select({ session_id: chatMessages.session_id })
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1);
    if (!rows[0]) throw new MessageNotFoundError(messageId);
    return rows[0].session_id;
  }

  // ──────────────────────────── lifecycle ───────────────────────────

  close(): void {
    this.opened.close();
  }
}

export class SessionNotFoundError extends Error {
  readonly code = "session_not_found" as const;
  constructor(public readonly id: string) {
    super(`session not found: ${id}`);
    this.name = "SessionNotFoundError";
  }
}

export class MessageNotFoundError extends Error {
  readonly code = "message_not_found" as const;
  constructor(public readonly id: string) {
    super(`message not found: ${id}`);
    this.name = "MessageNotFoundError";
  }
}

/** A client-minted queue id already names a different durable payload. */
export class QueueMessageConflictError extends Error {
  readonly code = "queue_message_conflict" as const;
  constructor(public readonly id: string) {
    super(`queued message id already exists with a different payload: ${id}`);
    this.name = "QueueMessageConflictError";
  }
}

// ───────────────────────── row deserialization ─────────────────────────

type ChatSessionDbRow = {
  id: string;
  title: string;
  agent: string;
  workspace_id: string | null;
  workspace_root: string | null;
  model_json: string | null;
  mode: string | null;
  parent_id: string | null;
  parent_message_id: string | null;
  permissions_json: string;
  metadata_json: string;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  cache_read: number;
  cache_write: number;
  total_tokens: number;
  cost_usd: number;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
};

function rowToSession(row: ChatSessionDbRow): ChatSessionRow {
  return {
    id: row.id,
    title: row.title,
    agent: row.agent,
    workspace_id: row.workspace_id,
    model: parseJsonOr(row.model_json, null) as ChatModel | null,
    mode: asAgentMode(row.mode) ?? null,
    parent_id: row.parent_id ?? null,
    parent_message_id: row.parent_message_id ?? null,
    permissions: parseJsonOr(
      row.permissions_json ?? "[]",
      []
    ) as PermissionRule[],
    metadata: parseJsonOr(row.metadata_json, {}) as Record<string, unknown>,
    prompt_tokens: row.prompt_tokens,
    completion_tokens: row.completion_tokens,
    reasoning_tokens: row.reasoning_tokens ?? 0,
    cache_read: row.cache_read ?? 0,
    cache_write: row.cache_write ?? 0,
    total_tokens: row.total_tokens,
    cost_usd: row.cost_usd,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at,
  };
}

type ChatMessageDbRow = {
  id: string;
  session_id: string;
  role: string;
  metadata_json: string;
  hidden_at: number | null;
  created_at: number;
  updated_at: number;
};

function rowToMessage(row: ChatMessageDbRow): ChatMessageRow {
  return {
    id: row.id,
    session_id: row.session_id,
    role: row.role as ChatMessageRow["role"],
    metadata: parseJsonOr(row.metadata_json, {}) as Record<string, unknown>,
    hidden_at: row.hidden_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

type ChatPartDbRow = {
  id: string;
  message_id: string;
  session_id: string;
  index: number;
  type: string;
  data_json: string;
  tool_call_id: string | null;
  tool_state: string | null;
  created_at: number;
  updated_at: number;
};

function rowToPart(row: ChatPartDbRow): ChatPartRow {
  return {
    id: row.id,
    message_id: row.message_id,
    session_id: row.session_id,
    index: row.index,
    type: row.type,
    data: parseJsonOr(row.data_json, null),
    tool_call_id: row.tool_call_id,
    tool_state: row.tool_state,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Validate an enqueue retry against the durable row behind its idempotency
 * key. `queued_at` may be absent because the scheduler can fire the row before
 * a lost-response retry arrives; that is still the same completed operation.
 */
function isSameQueuedMessageRequest(
  message: ChatMessageDbRow,
  parts: ChatPartDbRow[],
  sessionId: string,
  text: string,
  requestedQueuedAt: number | undefined
): boolean {
  if (message.session_id !== sessionId || message.role !== "user") return false;
  if (parts.length !== 1) return false;

  const metadata = parseJsonOr(message.metadata_json, null);
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return false;
  }
  const durableMetadata = metadata as Record<string, unknown>;
  const durableQueuedAt = durableMetadata.queued_at;
  const durableEnqueuedAt = durableMetadata.queue_enqueued_at;
  if (
    durableQueuedAt !== undefined &&
    (typeof durableQueuedAt !== "number" || !Number.isFinite(durableQueuedAt))
  ) {
    return false;
  }
  if (
    durableEnqueuedAt !== undefined &&
    (typeof durableEnqueuedAt !== "number" ||
      !Number.isFinite(durableEnqueuedAt))
  ) {
    return false;
  }
  // New rows retain queue_enqueued_at after fire/cancel. A still-queued legacy
  // row proves provenance through queued_at; once fired, a legacy row cannot be
  // distinguished from an ordinary direct user row and therefore fails closed.
  const provenanceAt =
    typeof durableEnqueuedAt === "number"
      ? durableEnqueuedAt
      : typeof durableQueuedAt === "number"
        ? durableQueuedAt
        : undefined;
  if (
    provenanceAt === undefined ||
    (requestedQueuedAt !== undefined && provenanceAt !== requestedQueuedAt)
  ) {
    return false;
  }

  const part = parts[0];
  return (
    part.message_id === message.id &&
    part.session_id === sessionId &&
    part.index === 0 &&
    part.type === "text" &&
    part.data_json === JSON.stringify({ type: "text", text }) &&
    part.tool_call_id === null &&
    part.tool_state === null
  );
}

function parseJsonOr<T>(raw: string | null, fallback: T): unknown | T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * A message is QUEUED — pending, held out of the transcript AND the model
 * view until it fires — iff its metadata carries a numeric `queued_at`
 * (RFC `queue`). This is the single source of the queue-visibility rule:
 * every list filter and the claim/cancel guards route through it so they
 * can never disagree about what counts as queued (e.g. on the `queued_at: 0`
 * boundary).
 */
function isQueued(metadata: Record<string, unknown> | undefined): boolean {
  return typeof metadata?.queued_at === "number";
}

/** Durable tombstone left by queue cancel so an enqueue retry cannot revive it. */
function isQueueCanceled(
  metadata: Record<string, unknown> | undefined
): boolean {
  return typeof metadata?.queue_canceled_at === "number";
}

function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_LIMIT;
  const n = Math.floor(raw);
  if (n <= 0) return DEFAULT_LIMIT;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return n;
}

/**
 * Opaque keyset cursor encoding `(updatedAt, id)` — the exact tuple the
 * list query orders by. `updatedAt` is a numeric epoch (no separator
 * char), so the first ":" always delimits it from the id (which may
 * itself contain ":").
 */
function encodeCursor(updatedAt: number, id: string): string {
  return `${updatedAt}:${id}`;
}

function parseCursor(
  cursor: string
): { updated_at: number; id: string } | null {
  const idx = cursor.indexOf(":");
  if (idx === -1) return null;
  const updatedAt = Number(cursor.slice(0, idx));
  const id = cursor.slice(idx + 1);
  if (!Number.isFinite(updatedAt) || id.length === 0) return null;
  return { updated_at: updatedAt, id };
}

// Re-export tail removed (de-barreled): the session layer's split files
// (recorder, titler, db, ids) and the row types (./rows) are imported
// directly by consumers, not funneled through the store.
