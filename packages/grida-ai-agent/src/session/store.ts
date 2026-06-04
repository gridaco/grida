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

import { and, asc, desc, eq, gt, isNull, like, lt, or, sql } from "drizzle-orm";
import type { OpenedSessionsDb } from "./db";
import { chatMessages, chatParts, chatSessions } from "./schema";
import { newMessageId, newPartId, newSessionId } from "./ids";
import { session_title } from "./title";
import { compactionBoundary } from "./boundary";
// Row + filter types are wire-shape — owned by `./protocol` (single
// source). Imported here for the store's input/output signatures, and
// re-exported at the bottom of this module so consumers get one import
// path for both the CRUD surface and the row shapes it emits.
import type {
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
  total_tokens?: number;
  cost_usd?: number;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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

  constructor(private readonly opened: OpenedSessionsDb) {
    this.db = opened.db;
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
    return rows[0] ? rowToSession(rows[0]) : null;
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
    const items = rows.slice(0, limit).map(rowToSession);
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
    if (delta.total_tokens !== undefined) {
      parts.total_tokens = sql`${chatSessions.total_tokens} + ${delta.total_tokens}`;
    }
    if (delta.cost_usd !== undefined) {
      parts.cost_usd = sql`${chatSessions.cost_usd} + ${delta.cost_usd}`;
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
    if (usage.total_tokens !== undefined)
      parts.total_tokens = usage.total_tokens;
    if (usage.cost_usd !== undefined) parts.cost_usd = usage.cost_usd;
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
        // (the persist-tail dedup must still see queued ids).
        .filter((m) => !isQueued(m.metadata))
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
        // is cleared by {@link dequeueMessage}). See {@link listMessages}.
        .filter((m) => !isQueued(m.metadata))
    );
  }

  // ──────────────────────────── queue ────────────────────────────
  // Queued sends (RFC `queue`): a queued message is a normal `user` row
  // carrying `metadata.queued_at`. It is held out of the model view and the
  // transcript until it fires; `listQueuedMessages` surfaces it for the host's
  // queued region. Firing clears `queued_at` ({@link dequeueMessage}); the X
  // affordance hard-deletes it ({@link deleteMessage}).

  /**
   * Persist a queued user message: a `user` row stamped with
   * `metadata.queued_at` plus its single text part (written in the same
   * AI-SDK part shape a fired turn consumes, so the row can later be fired
   * directly). Uses {@link appendMessage} (not the idempotent variant) — a
   * queued id collision is a real bug, not a resend race.
   */
  async appendQueuedMessage(
    sessionId: string,
    input: { id?: string; text: string; queued_at?: number }
  ): Promise<ChatMessageRow & { parts: ChatPartRow[] }> {
    const queuedAt = input.queued_at ?? Date.now();
    const msg = await this.appendMessage(sessionId, {
      id: input.id,
      role: "user",
      metadata: { queued_at: queuedAt },
    });
    const part = await this.upsertPart(msg.id, {
      index: 0,
      type: "text",
      data: { type: "text", text: input.text },
      session_id: sessionId,
    });
    return { ...msg, parts: [part] };
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
   * Fire a queued message: clear `metadata.queued_at` so it becomes a normal
   * visible user message (RFC `queue / the run-state machine`). No-op if the
   * row is gone or was not queued. Merges metadata so sibling keys survive
   * (mirrors {@link setMessageUsage}).
   */
  async dequeueMessage(messageId: string): Promise<void> {
    const existing = await this.getMessage(messageId);
    if (!existing || !isQueued(existing.metadata)) return;
    const metadata = { ...existing.metadata };
    delete metadata.queued_at;
    const now = Date.now();
    await this.db
      .update(chatMessages)
      .set({
        metadata_json: JSON.stringify(metadata),
        // Re-stamp `created_at` to fire time. A queued message's original
        // `created_at` is its ENQUEUE time, which can predate the in-flight
        // assistant message (created lazily on its first chunk). Since the
        // model view orders by `created_at`, leaving it would sort the fired
        // user message BEFORE that assistant turn — the conversation would end
        // on an assistant message and the provider rejects it ("must end with
        // a user message"). Firing IS the message entering the conversation as
        // the next turn, so its position is the end.
        created_at: now,
        updated_at: now,
      })
      .where(eq(chatMessages.id, messageId));
  }

  /**
   * Cancel a queued message: hard-delete the row and its parts (RFC
   * `queue / operating on queued messages`). Doubly guarded — the row must
   * (a) belong to `sessionId` (the DELETE route is session-scoped; a
   * messageId must not reach across sessions) and (b) STILL carry
   * `metadata.queued_at`, so it can never remove a fired/recorded turn
   * (defends a cancel/fire race). No-op otherwise. This is the store's only
   * hard delete; every other removal is a soft `hidden_at` rewind.
   */
  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    const existing = await this.getMessage(messageId);
    if (
      !existing ||
      existing.session_id !== sessionId ||
      !isQueued(existing.metadata)
    ) {
      return;
    }
    await this.db.delete(chatParts).where(eq(chatParts.message_id, messageId));
    await this.db.delete(chatMessages).where(eq(chatMessages.id, messageId));
  }

  /**
   * Stamp per-turn token usage onto an assistant message's metadata
   * (RFC `persistency / chat_messages` `usage` convention). Merges into
   * existing metadata so a `model` / `agent` key set elsewhere survives.
   */
  async setMessageUsage(messageId: string, usage: MessageUsage): Promise<void> {
    const existing = await this.getMessage(messageId);
    if (!existing) return;
    const metadata = { ...existing.metadata, usage };
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
    if (rows[0]) await this.setMessageUsage(rows[0].id, usage);
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
    // Queued sends (RFC `queue`) are PENDING, not history — a rewind must not
    // touch them. A queued row's `created_at` is its (recent) enqueue time, so
    // it sorts after the rewind target and the old code stamped `hidden_at` on
    // it, which dropped it from `listQueuedMessages` forever (it requires
    // `hidden_at IS NULL`) while its `queued_at` lingered → an unreclaimable
    // lost message. Excluding them here keeps the pending queue invariant
    // across a rewind.
    const rows = allRows.filter(
      (r) =>
        !isQueued(parseJsonOr(r.metadata_json, {}) as Record<string, unknown>)
    );
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
      .where(and(eq(chatMessages.session_id, sessionId), boundary!));
    await this.recomputeRollups(sessionId);
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
   */
  async recomputeRollups(sessionId: string): Promise<void> {
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
      const u = (m.metadata as { usage?: MessageUsage } | undefined)?.usage;
      if (!u) continue;
      promptTokens += u.input ?? 0;
      completionTokens += u.output ?? 0;
      reasoningTokens += u.reasoning ?? 0;
      cacheRead += u.cache_read ?? 0;
      cacheWrite += u.cache_write ?? 0;
    }
    const totalTokens =
      promptTokens +
      completionTokens +
      reasoningTokens +
      cacheRead +
      cacheWrite;
    await this.db
      .update(chatSessions)
      .set({
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        reasoning_tokens: reasoningTokens,
        cache_read: cacheRead,
        cache_write: cacheWrite,
        total_tokens: totalTokens,
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
        metadata: { ...parent.metadata, ...opts.metadata },
        permissions: parent.permissions,
        parent_id: parent.id,
        parent_message_id: opts.from_message_id,
      });

      // Copy visible messages up to and including the fork point, in order.
      for (const msg of source) {
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
            created_at: part.created_at,
            updated_at: part.updated_at,
          });
        }
        if (msg.id === opts.from_message_id) break;
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

// ───────────────────────── row deserialization ─────────────────────────

type ChatSessionDbRow = {
  id: string;
  title: string;
  agent: string;
  workspace_id: string | null;
  workspace_root: string | null;
  model_json: string | null;
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
 * every list filter and the dequeue/cancel guards route through it so they
 * can never disagree about what counts as queued (e.g. on the `queued_at: 0`
 * boundary).
 */
function isQueued(metadata: Record<string, unknown> | undefined): boolean {
  return typeof metadata?.queued_at === "number";
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
