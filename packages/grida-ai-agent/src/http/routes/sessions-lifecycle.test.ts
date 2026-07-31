/**
 * HTTP wire — the session lifecycle ops: rewind / fork / compact.
 * Wired like `agent.test.ts`: a bare Hono app over an `AgentRuntime` with
 * an injected StreamRegistry (to set in-flight state) and a fake
 * summarizer (so `compact` doesn't drive a real model).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { AuthStore } from "@grida/daemon/server";
import { SecretsStore } from "@grida/daemon/server";
import { WorkspaceRegistry } from "@grida/daemon/server";
import { openSessionsDb } from "../../session/db";
import { SessionsStore } from "../../session/store";
import { AGENT_SESSION_AGENT } from "../../protocol/run";
import type { SessionStatus } from "../../protocol/session-status";
import { AgentRuntime } from "../../runtime";
import { StreamRegistry } from "../../runtime/stream-registry";
import { registerAgentRoutes } from "./agent";
import { registerSessionsRoutes } from "./sessions";

describe("HTTP wire — session lifecycle (rewind/fork/compact)", () => {
  let baseDir: string;
  let store: SessionsStore;
  let streams: StreamRegistry;
  let runtime: AgentRuntime;
  let app: Hono;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-sess-life-"));
    const auth = new AuthStore(baseDir);
    const secrets = new SecretsStore(auth);
    await secrets.set("openrouter", "sk-test");
    store = new SessionsStore(openSessionsDb({ user_data_path: baseDir }));
    streams = new StreamRegistry();
    app = new Hono();
    runtime = new AgentRuntime({
      secrets,
      workspace_registry: new WorkspaceRegistry(baseDir),
      sessions_store: store,
      streams,
      run_agent: async () =>
        new Response("data: [DONE]\n\n", {
          headers: { "content-type": "text/event-stream" },
        }),
      compaction: { summarize: async () => "## Goal\nFAKE SUMMARY" },
    });
    registerAgentRoutes(app, runtime);
    registerSessionsRoutes(app, { store, runtime });
  });

  afterEach(async () => {
    runtime.dispose(); // clears the registry + the scheduler's drain timers
    store.close();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  async function seed(n: number): Promise<{ id: string; userIds: string[] }> {
    const s = await store.create({
      agent: AGENT_SESSION_AGENT,
      model: { provider_id: "openrouter", tier: "pro" },
    });
    const userIds: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const u = await store.appendMessage(s.id, { role: "user" });
      await store.upsertPart(u.id, {
        index: 0,
        type: "text",
        data: { type: "text", text: `u${i}` },
      });
      userIds.push(u.id);
      const a = await store.appendMessage(s.id, { role: "assistant" });
      await store.upsertPart(a.id, {
        index: 0,
        type: "text",
        data: { type: "text", text: `a${i}` },
      });
      await new Promise((r) => setTimeout(r, 2));
    }
    return { id: s.id, userIds };
  }

  async function seedPendingBlock(
    kind: "approval" | "user-input"
  ): Promise<string> {
    const s = await store.create({
      agent: AGENT_SESSION_AGENT,
      model: { provider_id: "openrouter", tier: "pro" },
    });
    const a = await store.appendMessage(s.id, { role: "assistant" });
    const approval = kind === "approval";
    const name = approval ? "run_command" : "question";
    const state = approval ? "approval-requested" : "input-available";
    await store.upsertPart(a.id, {
      index: 0,
      type: `tool-${name}`,
      data: {
        type: `tool-${name}`,
        tool_call_id: `tc_${kind}`,
        tool_name: name,
        state,
        input: {},
      },
      session_id: s.id,
      tool_call_id: `tc_${kind}`,
      tool_state: state,
    });
    return s.id;
  }

  it("POST /sessions/:id/rewind soft-truncates after a message", async () => {
    const { id, userIds } = await seed(3);
    const res = await app.request(`/sessions/${id}/rewind`, {
      method: "POST",
      body: JSON.stringify({ from_message_id: userIds[0] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hidden_count: number };
    expect(body.hidden_count).toBe(5); // a0, u1, a1, u2, a2
    const visible = await store.listVisibleMessages(id);
    expect(visible.map((m) => m.id)).toEqual([userIds[0]]);
  });

  it("POST /sessions/:id/rewind with restore:true un-rewinds", async () => {
    const { id, userIds } = await seed(3);
    await app.request(`/sessions/${id}/rewind`, {
      method: "POST",
      body: JSON.stringify({ from_message_id: userIds[0] }),
    });
    const res = await app.request(`/sessions/${id}/rewind`, {
      method: "POST",
      body: JSON.stringify({ from_message_id: userIds[0], restore: true }),
    });
    expect(res.status).toBe(200);
    const visible = await store.listVisibleMessages(id);
    expect(visible.length).toBe(6);
  });

  it("rewind refuses while a run is in flight (409)", async () => {
    const { id, userIds } = await seed(2);
    streams.create(id);
    const res = await app.request(`/sessions/${id}/rewind`, {
      method: "POST",
      body: JSON.stringify({ from_message_id: userIds[0] }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("run_in_flight");
  });

  it("rewind holds admission across its async transcript mutation", async () => {
    const { id, userIds } = await seed(2);
    const before = (await store.listVisibleMessages(id)).map(
      (message) => message.id
    );
    const originalGet = store.get.bind(store);
    let entered!: () => void;
    const insideRewind = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    const getSpy = vi.spyOn(store, "get").mockImplementation(async (sid) => {
      if (sid === id && !held) {
        held = true;
        entered();
        await gate;
      }
      return await originalGet(sid);
    });

    try {
      const rewind = app.request(`/sessions/${id}/rewind`, {
        method: "POST",
        body: JSON.stringify({ from_message_id: userIds[0] }),
      });
      await insideRewind;

      const loser = await app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          session_id: id,
          messages: [
            { id: "user-during-rewind", role: "user", content: "race" },
          ],
        }),
      });
      expect(loser.status).toBe(409);
      expect(((await loser.json()) as { code?: string }).code).toBe(
        "run_in_flight"
      );
      expect(await store.getMessage("user-during-rewind")).toBeNull();
      expect(
        (await store.listVisibleMessages(id)).map((message) => message.id)
      ).toEqual(before);

      release();
      expect((await rewind).status).toBe(200);
    } finally {
      release();
      getSpy.mockRestore();
    }
  });

  it("rewind 400s without fromMessageId", async () => {
    const { id } = await seed(1);
    const res = await app.request(`/sessions/${id}/rewind`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /sessions/:id/fork forks into a new session", async () => {
    const { id, userIds } = await seed(3);
    const res = await app.request(`/sessions/${id}/fork`, {
      method: "POST",
      body: JSON.stringify({
        from_message_id: userIds[1],
        metadata: { ephemeral: true },
      }),
    });
    expect(res.status).toBe(200);
    const fork = (await res.json()) as {
      id: string;
      parent_id: string;
      parent_message_id: string;
      metadata: Record<string, unknown>;
    };
    expect(fork.id).not.toBe(id);
    expect(fork.parent_id).toBe(id);
    expect(fork.parent_message_id).toBe(userIds[1]);
    expect(fork.metadata.ephemeral).toBe(true);
    // Copied through the fork point (u0,a0,u1) = 3 messages.
    const copied = await store.listMessages(fork.id);
    expect(copied.length).toBe(3);
  });

  it("fork refuses while the parent run is in flight (409)", async () => {
    const { id, userIds } = await seed(2);
    streams.create(id);
    const res = await app.request(`/sessions/${id}/fork`, {
      method: "POST",
      body: JSON.stringify({ from_message_id: userIds[0] }),
    });
    expect(res.status).toBe(409);
  });

  it("POST /sessions/:id/compact summarizes the head (manual)", async () => {
    const { id } = await seed(4);
    const res = await app.request(`/sessions/${id}/compact`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      compacted: boolean;
      summary_message_id?: string;
    };
    expect(body.compacted).toBe(true);
    const visible = await store.listVisibleMessages(id);
    const summary = visible[visible.length - 1].parts.find(
      (p) => p.type === "data-compaction"
    );
    expect(summary).toBeTruthy();
    const payload = (
      summary!.data as { data: { summary: string; auto: boolean } }
    ).data;
    expect(payload.summary).toContain("FAKE SUMMARY");
    expect(payload.auto).toBe(false); // manual
  });

  it("compact refuses while a run is in flight (409)", async () => {
    const { id } = await seed(3);
    streams.create(id);
    const res = await app.request(`/sessions/${id}/compact`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });

  it("DELETE refuses while a run is in flight and preserves the session", async () => {
    const { id } = await seed(1);
    streams.create(id);

    const res = await app.request(`/sessions/${id}`, { method: "DELETE" });

    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe(
      "run_in_flight"
    );
    expect(await store.get(id)).not.toBeNull();
  });

  it("DELETE holds admission across the DB delete and scratch cleanup", async () => {
    const { id } = await seed(1);
    const originalDelete = store.delete.bind(store);
    let enteredDelete!: () => void;
    const insideDelete = new Promise<void>((resolve) => {
      enteredDelete = resolve;
    });
    let releaseDelete!: () => void;
    const deleteGate = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    let enteredCleanup!: () => void;
    const insideCleanup = new Promise<void>((resolve) => {
      enteredCleanup = resolve;
    });
    let releaseCleanup!: () => void;
    const cleanupGate = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const deleteSpy = vi
      .spyOn(store, "delete")
      .mockImplementation(async (sid) => {
        if (sid === id) {
          enteredDelete();
          await deleteGate;
        }
        await originalDelete(sid);
      });
    const cleanupSpy = vi
      .spyOn(runtime, "removeSessionScratch")
      .mockImplementation(async (sid) => {
        if (sid === id) {
          enteredCleanup();
          await cleanupGate;
        }
      });

    const expectRunRejected = async (messageId: string) => {
      const loser = await app.request("/agent/run", {
        method: "POST",
        body: JSON.stringify({
          session_id: id,
          messages: [{ id: messageId, role: "user", content: "race" }],
        }),
      });
      expect(loser.status).toBe(409);
      expect(((await loser.json()) as { code?: string }).code).toBe(
        "run_in_flight"
      );
      expect(await store.getMessage(messageId)).toBeNull();
    };

    try {
      const deletion = app.request(`/sessions/${id}`, { method: "DELETE" });
      await insideDelete;
      await expectRunRejected("user-during-session-delete");

      releaseDelete();
      await insideCleanup;
      expect(await store.get(id)).toBeNull();
      await expectRunRejected("user-during-scratch-cleanup");

      releaseCleanup();
      const res = await deletion;
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      releaseDelete();
      releaseCleanup();
      deleteSpy.mockRestore();
      cleanupSpy.mockRestore();
    }
  });

  it("rewind 404s for an unknown session", async () => {
    const res = await app.request(`/sessions/ses_nope/rewind`, {
      method: "POST",
      body: JSON.stringify({ from_message_id: "msg_x" }),
    });
    expect(res.status).toBe(404);
  });

  describe("queue routes (RFC `queue`)", () => {
    it("POST enqueues even while a run is in flight (no 409), held out of the model view", async () => {
      const { id } = await seed(1);
      streams.create(id); // mark a run in flight
      const res = await app.request(`/sessions/${id}/queue`, {
        method: "POST",
        body: JSON.stringify({ text: "queued while busy" }),
      });
      // Enqueue MUST NOT 409 — queuing behind a running turn is the point.
      expect(res.status).toBe(200);
      const row = (await res.json()) as {
        id: string;
        metadata: { queued_at?: number };
      };
      expect(row.metadata.queued_at).toEqual(expect.any(Number));
      // ...and it is not part of the model view.
      expect(
        (await store.listVisibleMessages(id)).map((m) => m.id)
      ).not.toContain(row.id);
    });

    it("GET returns the queue FIFO", async () => {
      const { id } = await seed(1);
      await app.request(`/sessions/${id}/queue`, {
        method: "POST",
        body: JSON.stringify({ id: "qa", text: "first" }),
      });
      await app.request(`/sessions/${id}/queue`, {
        method: "POST",
        body: JSON.stringify({ id: "qb", text: "second" }),
      });
      const res = await app.request(`/sessions/${id}/queue`, { method: "GET" });
      expect(res.status).toBe(200);
      const items = (await res.json()) as Array<{ id: string }>;
      expect(items.map((m) => m.id)).toEqual(["qa", "qb"]);
    });

    it("POST is idempotent for the same message id and rejects mismatched reuse", async () => {
      const { id } = await seed(1);
      streams.create(id); // keep the accepted row queued during both requests
      const first = await app.request(`/sessions/${id}/queue`, {
        method: "POST",
        body: JSON.stringify({ id: "q-retry", text: "keep this once" }),
      });
      const retry = await app.request(`/sessions/${id}/queue`, {
        method: "POST",
        body: JSON.stringify({ id: "q-retry", text: "keep this once" }),
      });
      expect(first.status).toBe(200);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(await first.json());
      expect(
        (await store.listQueuedMessages(id)).filter(
          (message) => message.id === "q-retry"
        )
      ).toHaveLength(1);

      const conflict = await app.request(`/sessions/${id}/queue`, {
        method: "POST",
        body: JSON.stringify({ id: "q-retry", text: "different" }),
      });
      expect(conflict.status).toBe(409);
      expect(((await conflict.json()) as { code: string }).code).toBe(
        "queue-message-conflict"
      );
    });

    it("DELETE cancels a queued item, and is scoped to the path session", async () => {
      const { id } = await seed(1);
      const other = await store.create({ agent: AGENT_SESSION_AGENT });
      streams.create(id); // keep the row queued until the explicit cancel
      await app.request(`/sessions/${id}/queue`, {
        method: "POST",
        body: JSON.stringify({ id: "qx", text: "pending" }),
      });
      // A DELETE under the WRONG session must NOT remove it.
      const wrong = await app.request(`/sessions/${other.id}/queue/qx`, {
        method: "DELETE",
      });
      expect(wrong.status).toBe(200);
      expect(await store.getMessage("qx")).not.toBeNull();
      // Under the right session, it is removed.
      const ok = await app.request(`/sessions/${id}/queue/qx`, {
        method: "DELETE",
      });
      expect(ok.status).toBe(200);
      expect(await store.getMessage("qx")).toMatchObject({
        metadata: { queue_canceled_at: expect.any(Number) },
        hidden_at: expect.any(Number),
      });
      expect(await store.listQueuedMessages(id)).toEqual([]);

      // Lost-response retry: same id/payload returns the hidden tombstone and
      // never recreates the queue row the user canceled.
      const retry = await app.request(`/sessions/${id}/queue`, {
        method: "POST",
        body: JSON.stringify({ id: "qx", text: "pending" }),
      });
      expect(retry.status).toBe(200);
      expect(await retry.json()).toMatchObject({
        id: "qx",
        metadata: { queue_canceled_at: expect.any(Number) },
        hidden_at: expect.any(Number),
      });
      expect(await store.listQueuedMessages(id)).toEqual([]);
    });
  });

  describe("status channel (RFC `session` §Session status)", () => {
    // Read SSE `data:` frames into parsed SessionStatus objects.
    function parseStatuses(buf: string): SessionStatus[] {
      const out: SessionStatus[] = [];
      for (const frame of buf.split("\n\n")) {
        const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          out.push(JSON.parse(dataLine.slice("data:".length).trim()));
        } catch {
          /* skip */
        }
      }
      return out;
    }

    async function readStatuses(
      res: Response,
      count: number,
      afterFirst?: () => void | Promise<void>
    ): Promise<SessionStatus[]> {
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let firstHandled = false;
      while (parseStatuses(buf).length < count) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        if (!firstHandled && parseStatuses(buf).length > 0) {
          firstHandled = true;
          await afterFirst?.();
        }
      }
      reader.cancel().catch(() => undefined);
      return parseStatuses(buf);
    }

    it("streams the current status then every idle⇄busy transition", async () => {
      const { id } = await seed(1);
      const ac = new AbortController();
      const res = await app.request(`/sessions/${id}/status`, {
        signal: ac.signal,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      // Wait for the hydrated first frame before driving the lifecycle. The
      // observer then projects the registry edges onto this subscription.
      const statuses = await readStatuses(res, 3, () => {
        streams.create(id, { fired_message_id: "msg_user_1" });
        streams.finish(id, "finish");
      });
      ac.abort();
      expect(statuses.map((s) => s.state)).toEqual(["idle", "busy", "idle"]);
      expect(statuses[1]?.message_id).toBe("msg_user_1");
    });

    it("keeps query-token status hydration read-only after restart", async () => {
      const { id } = await seed(1);
      await store.appendQueuedMessage(id, {
        id: "queued-before-status",
        text: "must not run from a GET",
      });
      const ac = new AbortController();
      vi.useFakeTimers();
      try {
        const res = await app.request(`/sessions/${id}/status`, {
          signal: ac.signal,
        });
        const statuses = await readStatuses(res, 1);
        expect(statuses).toEqual([
          {
            state: "idle",
            human_input_state_authoritative: true,
            queue_enqueue_idempotent: true,
          },
        ]);

        // GRIDA-SEC-004: query-token carriage is observation-only. Advancing
        // past the drain cooldown must not create a stream or claim the row.
        await vi.advanceTimersByTimeAsync(1_100);
        expect(streams.get(id)).toBeUndefined();
        expect(
          (await store.listQueuedMessages(id)).map((message) => message.id)
        ).toEqual(["queued-before-status"]);
      } finally {
        ac.abort();
        vi.useRealTimers();
      }
    });

    it("projects a hard error as state=error", async () => {
      const { id } = await seed(1);
      const ac = new AbortController();
      const res = await app.request(`/sessions/${id}/status`, {
        signal: ac.signal,
      });
      const statuses = await readStatuses(res, 3, () => {
        streams.create(id);
        streams.finish(id, "error");
      });
      ac.abort();
      expect(statuses.map((s) => s.state)).toEqual(["idle", "busy", "error"]);
    });

    it("never emits idle between busy and a persisted approval wait", async () => {
      const { id } = await seed(0);
      const ac = new AbortController();
      const res = await app.request(`/sessions/${id}/status`, {
        signal: ac.signal,
      });
      const statuses = await readStatuses(res, 3, async () => {
        streams.create(id);
        const a = await store.appendMessage(id, { role: "assistant" });
        await store.upsertPart(a.id, {
          index: 0,
          type: "tool-run_command",
          data: {
            type: "tool-run_command",
            tool_call_id: "tc_wait",
            tool_name: "run_command",
            state: "approval-requested",
            input: {},
          },
          session_id: id,
          tool_call_id: "tc_wait",
          tool_state: "approval-requested",
        });
        streams.finish(id, "finish");
      });
      ac.abort();
      expect(statuses.map((s) => s.state)).toEqual([
        "idle",
        "busy",
        "waiting_on_approval",
      ]);
    });

    it.each([
      ["approval", "waiting_on_approval"],
      ["user-input", "waiting_on_user_input"],
    ] as const)(
      "hydrates a persisted %s block before the first post-restart frame",
      async (kind, expectedState) => {
        const id = await seedPendingBlock(kind);
        const ac = new AbortController();
        const res = await app.request(`/sessions/${id}/status`, {
          signal: ac.signal,
        });
        const [first] = await readStatuses(res, 1);
        ac.abort();
        expect(first?.state).toBe(expectedState);
      }
    );

    it("a late subscriber's first frame is the CURRENT status", async () => {
      const { id } = await seed(1);
      streams.create(id); // session is already busy when the client joins
      const ac = new AbortController();
      const res = await app.request(`/sessions/${id}/status`, {
        signal: ac.signal,
      });
      const [first] = await readStatuses(res, 1);
      ac.abort();
      expect(first.state).toBe("busy");
      streams.finish(id, "finish"); // settle for teardown
    });
  });
});
