/**
 * `/sessions/*` HTTP routes — list / get / create / patch / delete /
 * list-messages over the chat-sessions store.
 *
 * The existing Basic-Auth + Referer middleware applies; we add no
 * extra guards beyond the ones in `http/server.ts`.
 *
 * Wire-format note: the client never sees raw `*_json` strings — the
 * store already parses them into `ChatModel`, `Record<string, unknown>`,
 * and `unknown` blobs. Routes pass those through.
 */

import type { Context, Hono } from "hono";
import type { SessionsStore } from "../../session/store";
import type { ChatModel, SessionListFilter } from "../../session/rows";
import type { AgentRuntime } from "../../runtime";

export function registerSessionsRoutes(
  app: Hono,
  deps: { store: SessionsStore; runtime?: AgentRuntime }
): void {
  const { store, runtime } = deps;

  app.get("/sessions", async (c) => {
    const url = new URL(c.req.url);
    const filter: SessionListFilter = {};
    const agent = url.searchParams.get("agent");
    if (agent) filter.agent = agent;
    const workspaceId = url.searchParams.get("workspaceId");
    if (workspaceId) filter.workspace_id = workspaceId;
    const q = url.searchParams.get("q");
    if (q) filter.query = q;
    const includeArchived = url.searchParams.get("includeArchived");
    if (includeArchived === "1" || includeArchived === "true") {
      filter.include_archived = true;
    }
    const limit = url.searchParams.get("limit");
    if (limit) filter.limit = Number.parseInt(limit, 10);
    const cursor = url.searchParams.get("cursor");
    if (cursor) filter.cursor = cursor;
    const page = await store.list(filter);
    return c.json(page);
  });

  app.get("/sessions/:id", async (c) => {
    const row = await store.get(c.req.param("id"));
    if (!row) return c.json({ error: "session not found" }, 404);
    return c.json(row);
  });

  app.post("/sessions", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      agent?: unknown;
      workspace_id?: unknown;
      title?: unknown;
      model?: unknown;
      metadata?: unknown;
    };
    if (typeof body.agent !== "string" || body.agent.length === 0) {
      return c.json({ error: "agent is required" }, 400);
    }
    const row = await store.create({
      agent: body.agent,
      workspace_id: stringOrUndefined(body.workspace_id),
      title: stringOrUndefined(body.title),
      model: coerceModel(body.model),
      metadata: coerceRecord(body.metadata),
    });
    return c.json(row);
  });

  app.patch("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: unknown;
      archived?: unknown;
    };
    const existing = await store.get(id);
    if (!existing) return c.json({ error: "session not found" }, 404);
    if (typeof body.title === "string") {
      await store.rename(id, body.title);
    }
    if (typeof body.archived === "boolean") {
      if (body.archived) await store.archive(id);
      else await store.unarchive(id);
    }
    const next = await store.get(id);
    return c.json(next);
  });

  app.delete("/sessions/:id", async (c: Context) => {
    const id = c.req.param("id");
    await store.delete(id);
    // Drop any cached session-static context (skill index + body cache).
    runtime?.forgetSession(id);
    // Reclaim the session's scratch subtree (WG `scratch.md` S2). Best-effort
    // and non-throwing inside the runtime, so a cleanup hiccup never fails the
    // delete.
    await runtime?.removeSessionScratch(id);
    return c.json({ ok: true });
  });

  app.get("/sessions/:id/messages", async (c) => {
    const id = c.req.param("id");
    const existing = await store.get(id);
    if (!existing) return c.json({ error: "session not found" }, 404);
    const messages = await store.listMessages(id);
    return c.json(messages);
  });

  // Lifecycle ops (rewind / fork / compact) need the in-flight guard and
  // (for compact) provider resolution — both owned by the runtime. Mounted
  // only when a runtime is wired (the bare CRUD callers omit it).
  if (runtime) {
    app.post("/sessions/:id/rewind", async (c) =>
      runtime.rewind(c.req.param("id"), await c.req.json().catch(() => ({})))
    );
    app.post("/sessions/:id/fork", async (c) =>
      runtime.fork(c.req.param("id"), await c.req.json().catch(() => ({})))
    );
    app.post("/sessions/:id/compact", async (c) =>
      runtime.compact(c.req.param("id"))
    );

    // Queued sends (RFC `queue`). enqueue persists a pending user message;
    // list returns the queue FIFO; cancel hard-deletes a pending item. The
    // drain itself is CORE-owned (the SessionScheduler fires queued turns on a
    // clean idle edge) — clients enqueue/cancel and watch status; they do not
    // drive the drain.
    app.post("/sessions/:id/queue", async (c) =>
      runtime.enqueue(c.req.param("id"), await c.req.json().catch(() => ({})))
    );
    app.get("/sessions/:id/queue", async (c) =>
      runtime.listQueued(c.req.param("id"))
    );
    app.delete("/sessions/:id/queue/:messageId", async (c) =>
      runtime.cancelQueued(c.req.param("id"), c.req.param("messageId") ?? "")
    );

    // Session status back-channel (RFC `session.md` §Session status): a
    // long-lived SSE the dumb UI subscribes to for idle/busy/error — the
    // authoritative source it renders Stop/Send from (not the AI-SDK client's
    // optimistic per-request status).
    app.get("/sessions/:id/status", async (c) =>
      runtime.statusStream(c.req.param("id"), c.req.raw.signal)
    );
  }
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function coerceModel(v: unknown): ChatModel | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.provider_id !== "string" || o.provider_id.length === 0) {
    return undefined;
  }
  return {
    provider_id: o.provider_id,
    tier: typeof o.tier === "string" ? o.tier : undefined,
    model_id: typeof o.model_id === "string" ? o.model_id : undefined,
  } as ChatModel;
}

function coerceRecord(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  return v as Record<string, unknown>;
}
