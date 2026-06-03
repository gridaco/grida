/**
 * HTTP wire — the session lifecycle ops: rewind / fork / compact.
 * Wired like `agent.test.ts`: a bare Hono app over an `AgentRuntime` with
 * an injected StreamRegistry (to set in-flight state) and a fake
 * summarizer (so `compact` doesn't drive a real model).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { AuthStore } from "../../auth/file";
import { SecretsStore } from "../../secrets";
import { WorkspaceRegistry } from "../../workspaces";
import { openSessionsDb } from "../../session/db";
import { SessionsStore } from "../../session/store";
import { AGENT_SESSION_AGENT } from "../../protocol/run";
import type { SessionStatus } from "../../protocol/session-status";
import { AgentRuntime } from "../../runtime";
import { StreamRegistry } from "../../runtime/stream-registry";
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
      compaction: { summarize: async () => "## Goal\nFAKE SUMMARY" },
    });
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

    it("DELETE cancels a queued item, and is scoped to the path session", async () => {
      const { id } = await seed(1);
      const other = await store.create({ agent: AGENT_SESSION_AGENT });
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
      expect(await store.getMessage("qx")).toBeNull();
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
      count: number
    ): Promise<SessionStatus[]> {
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (parseStatuses(buf).length < count) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
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

      // Drive a turn lifecycle through the registry — the observer projects it
      // onto the scheduler, which broadcasts to this subscription.
      streams.create(id);
      streams.finish(id, "finish");

      const statuses = await readStatuses(res, 3);
      ac.abort();
      expect(statuses.map((s) => s.state)).toEqual(["idle", "busy", "idle"]);
    });

    it("projects a hard error as state=error", async () => {
      const { id } = await seed(1);
      const ac = new AbortController();
      const res = await app.request(`/sessions/${id}/status`, {
        signal: ac.signal,
      });
      streams.create(id);
      streams.finish(id, "error");
      const statuses = await readStatuses(res, 3);
      ac.abort();
      expect(statuses.map((s) => s.state)).toEqual(["idle", "busy", "error"]);
    });

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
