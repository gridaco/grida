/**
 * Contract pins — the lifecycle event channel over the HTTP wire (RFC
 * `docs/wg/ai/agent/events.md`).
 *
 * `GET /events` is the host-wide projection: one subscription carries every
 * session's `turn-started` / `turn-finished` / `approval-requested`. These
 * pins drive REAL turns through the same harness as `agent.test.ts` (bare
 * Hono app + AgentRuntime + injected fake model-run fn) and assert:
 *
 *   - a direct run emits started→finished, naming the fired message
 *     (RFC `turn-authority`) with `reason: "finish"`;
 *   - a turn that ends blocked on a supervised approval emits
 *     `approval-requested` BEFORE its `turn-finished`, and the finished
 *     event carries `pending_approval: true`;
 *   - an explicit abort emits `turn-finished` with `reason: "abort"`;
 *   - an upstream failure emits `turn-finished` with `reason: "error"`;
 *   - a CORE queue drain (no client request) emits `turn-started` naming
 *     the dequeued row.
 *
 * Bus-only semantics (fan-out, detach, isolation) are pinned in
 * `runtime/events.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { AuthStore } from "../../auth/file";
import { SecretsStore } from "../../secrets";
import { WorkspaceRegistry } from "../../workspaces";
import { openSessionsDb } from "../../session/db";
import { SessionsStore } from "../../session/store";
import { AGENT_SESSION_AGENT } from "../../protocol/run";
import type { AgentLifecycleEvent } from "../../protocol/events";
import { AgentRuntime } from "../../runtime";
import { StreamRegistry } from "../../runtime/stream-registry";
import type { runAgent } from "../../runtime/run-agent";
import { registerAgentRoutes } from "./agent";

const sseResponse = (frames: string[]): Response =>
  new Response(
    frames.map((f) => `data: ${f}\n\n`).join("") + "data: [DONE]\n\n",
    {
      headers: { "content-type": "text/event-stream" },
    }
  );

/** Default fake model run: one text chunk, then DONE. */
const finishingRunAgent: typeof runAgent = async () =>
  sseResponse([
    '{"type":"text-start","id":"t0"}',
    '{"type":"text-delta","id":"t0","delta":"hi"}',
    '{"type":"text-end","id":"t0"}',
  ]);

function sessionIdFromSse(body: string): string {
  for (const frame of body.split("\n\n")) {
    if (!frame.startsWith("event: grida-session")) continue;
    const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) continue;
    try {
      const parsed = JSON.parse(dataLine.slice("data:".length).trim()) as {
        session_id?: string;
      };
      return parsed.session_id ?? "";
    } catch {
      return "";
    }
  }
  return "";
}

/** Tail a `GET /events` SSE body into a growing array of parsed events. */
function tailEvents(res: Response): {
  events: AgentLifecycleEvent[];
  cancel: () => void;
} {
  const events: AgentLifecycleEvent[] = [];
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  void (async () => {
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (!frame.includes("event: grida-event")) continue;
          const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          events.push(
            JSON.parse(
              dataLine.slice("data:".length).trim()
            ) as AgentLifecycleEvent
          );
        }
      }
    } catch {
      /* cancelled */
    }
  })();
  return {
    events,
    cancel: () => {
      void reader.cancel().catch(() => undefined);
    },
  };
}

describe("HTTP wire — lifecycle events (GET /events)", () => {
  let baseDir: string;
  let sessionsStore: SessionsStore;
  let runtime: AgentRuntime;
  let app: Hono;
  // Per-test switchable model-run fake (the harness wires the indirection
  // once; a test swaps the behavior, not the runtime).
  let currentRunAgent: typeof runAgent;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-events-"));
    const auth = new AuthStore(baseDir);
    const secrets = new SecretsStore(auth);
    await secrets.set("openrouter", "sk-test");
    const db = openSessionsDb({ user_data_path: baseDir });
    sessionsStore = new SessionsStore(db);
    currentRunAgent = finishingRunAgent;
    app = new Hono();
    runtime = new AgentRuntime({
      secrets,
      workspace_registry: new WorkspaceRegistry(baseDir),
      sessions_store: sessionsStore,
      streams: new StreamRegistry(),
      run_agent: (provider, opts, deps) =>
        currentRunAgent(provider, opts, deps),
      drain_cooldown_ms: 20,
    });
    registerAgentRoutes(app, runtime);
  });

  afterEach(async () => {
    runtime.dispose();
    sessionsStore.close();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("a direct run emits turn-started → turn-finished, naming the fired message", async () => {
    const tail = tailEvents(await app.request("/events", { method: "GET" }));

    const res = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "m1", role: "user", content: "hello" }],
      }),
    });
    expect(res.status).toBe(200);
    const sessionId = sessionIdFromSse(await res.text());
    expect(sessionId).toBeTruthy();

    await vi.waitFor(() => {
      expect(tail.events.some((e) => e.type === "turn-finished")).toBe(true);
    });

    const started = tail.events.find((e) => e.type === "turn-started");
    const finished = tail.events.find((e) => e.type === "turn-finished");
    expect(started).toMatchObject({
      session_id: sessionId,
      message_id: "m1",
    });
    expect(finished).toMatchObject({
      session_id: sessionId,
      message_id: "m1",
      reason: "finish",
      pending_approval: false,
    });
    // Per-session causal order (RFC `events`): started precedes finished.
    expect(tail.events.indexOf(started!)).toBeLessThan(
      tail.events.indexOf(finished!)
    );
    // No spurious approval event on a plain finish.
    expect(tail.events.some((e) => e.type === "approval-requested")).toBe(
      false
    );
    tail.cancel();
  });

  it("a turn that ends BLOCKED on a supervised approval emits approval-requested before its turn-finished (pending_approval: true)", async () => {
    // The SDK pauses a gated tool call by emitting `tool-approval-request`
    // and ending the run cleanly; the recorder persists the pending state.
    currentRunAgent = async () =>
      sseResponse([
        '{"type":"tool-input-start","toolCallId":"call1","toolName":"run_command"}',
        '{"type":"tool-input-available","toolCallId":"call1","toolName":"run_command","input":{"command":"rm","args":["-rf"]}}',
        '{"type":"tool-approval-request","toolCallId":"call1","approvalId":"ap1"}',
      ]);
    const tail = tailEvents(await app.request("/events", { method: "GET" }));

    const res = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "m1", role: "user", content: "clean up" }],
      }),
    });
    expect(res.status).toBe(200);
    const sessionId = sessionIdFromSse(await res.text());

    await vi.waitFor(() => {
      expect(tail.events.some((e) => e.type === "turn-finished")).toBe(true);
    });

    // The doorbell rang, before the finished event of the turn that blocked…
    const approval = tail.events.find((e) => e.type === "approval-requested");
    const finished = tail.events.find((e) => e.type === "turn-finished");
    expect(approval).toMatchObject({ session_id: sessionId });
    expect(tail.events.indexOf(approval!)).toBeLessThan(
      tail.events.indexOf(finished!)
    );
    // …and the finished event is the BLOCKED flavor, not "done".
    expect(finished).toMatchObject({
      reason: "finish",
      pending_approval: true,
    });
    // The event is a doorbell, not the letter — the durable approval state
    // is what a consumer (and the drain fire-gate) reads.
    expect(await sessionsStore.hasPendingApproval(sessionId)).toBe(true);
    tail.cancel();
  });

  it("an explicit abort emits turn-finished with reason 'abort'", async () => {
    // Hanging fake: the stream stays open until the model abort signal trips.
    currentRunAgent = async (_provider, opts) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            opts.signal?.addEventListener("abort", () => {
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            });
          },
        }),
        { headers: { "content-type": "text/event-stream" } }
      );
    const tail = tailEvents(await app.request("/events", { method: "GET" }));

    const created = await sessionsStore.create({ agent: AGENT_SESSION_AGENT });
    const res = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "m1", role: "user", content: "long task" }],
        session_id: created.id,
      }),
    });
    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(tail.events.some((e) => e.type === "turn-started")).toBe(true);
    });

    const abortRes = await app.request("/agent/abort", {
      method: "POST",
      body: JSON.stringify({ session_id: created.id }),
    });
    expect(abortRes.status).toBe(200);

    await vi.waitFor(() => {
      expect(tail.events.some((e) => e.type === "turn-finished")).toBe(true);
    });
    expect(tail.events.find((e) => e.type === "turn-finished")).toMatchObject({
      session_id: created.id,
      message_id: "m1",
      reason: "abort",
      pending_approval: false,
    });
    void res.body?.cancel();
    tail.cancel();
  });

  it("an upstream failure emits turn-finished with reason 'error'", async () => {
    currentRunAgent = async () => {
      throw new Error("upstream down");
    };
    const tail = tailEvents(await app.request("/events", { method: "GET" }));

    const created = await sessionsStore.create({ agent: AGENT_SESSION_AGENT });
    const res = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "m1", role: "user", content: "hi" }],
        session_id: created.id,
      }),
    });
    expect(res.status).toBe(200);
    // Drain the run's consumer stream — it FAILS by design (the upstream
    // errored), and leaving it unread surfaces as an unhandled rejection.
    await res.text().catch(() => undefined);

    await vi.waitFor(() => {
      expect(tail.events.some((e) => e.type === "turn-finished")).toBe(true);
    });
    expect(tail.events.find((e) => e.type === "turn-finished")).toMatchObject({
      session_id: created.id,
      reason: "error",
      pending_approval: false,
    });
    tail.cancel();
  });

  it("a CORE queue drain (no client request) emits turn-started naming the dequeued row", async () => {
    const tail = tailEvents(await app.request("/events", { method: "GET" }));

    const created = await sessionsStore.create({ agent: AGENT_SESSION_AGENT });
    await sessionsStore.appendQueuedMessage(created.id, {
      id: "qa",
      text: "queued work",
      queued_at: 1,
    });

    // Drive a clean idle edge through the registry — the scheduler drains.
    runtime.streams.create(created.id);
    runtime.streams.finish(created.id, "finish");

    await vi.waitFor(
      () => {
        const started = tail.events.filter((e) => e.type === "turn-started");
        // First started is the manually-driven edge (no fired message);
        // the drained turn names the dequeued row (RFC `turn-authority`).
        expect(started.some((e) => e.message_id === "qa")).toBe(true);
        const finished = tail.events.filter(
          (e) => e.type === "turn-finished" && e.message_id === "qa"
        );
        expect(finished).toHaveLength(1);
        expect(finished[0]).toMatchObject({
          session_id: created.id,
          reason: "finish",
          pending_approval: false,
        });
      },
      { timeout: 2000 }
    );
    // Settle the drained turn's recorder writes before teardown closes the DB.
    await vi.waitFor(async () => {
      const msgs = await sessionsStore.listMessages(created.id);
      expect(msgs.some((m) => m.role === "assistant")).toBe(true);
    });
    tail.cancel();
  });
});
