/**
 * Contract pins — the agent-route half of the "HTTP wire" surface.
 *
 * Maps to docs/wg/ai/grida/architecture.md §Test pins → describe("HTTP wire"):
 * run streams SSE + in-band session id, 409 run-in-flight, GET stream
 * replay-from-0 + live-tail, 404 when no run, abort cancels + finalizes.
 * The auth/referer/origin subset of "HTTP wire" lives in
 * `agent/agent-host.test.ts` (real socket + full middleware stack).
 *
 * These run against a bare Hono `app` wired to an `AgentRuntime` with an
 * injected StreamRegistry + fake `runAgent`, so in-flight / replay /
 * abort states are set up deterministically without driving a real model.
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
import { createRecorderConsumer } from "../../session/recorder";
import { AGENT_SESSION_AGENT } from "../../protocol/run";
import { AgentRuntime } from "../../runtime";
import { StreamRegistry } from "../../runtime/stream-registry";
import { registerAgentRoutes } from "./agent";

// Inject a deterministic fake model-run fn: the run loop + registry +
// recorder run for real; only the upstream model call is faked. See
// AgentRuntimeDeps.runAgent — `runAgent` and `AgentRuntime` share a
// module, so injection is the seam, not vi.mock.
const fakeRunAgent = async (): Promise<Response> =>
  new Response(
    'data: {"type":"text-start","id":"t0"}\n\n' +
      'data: {"type":"text-delta","id":"t0","delta":"hi"}\n\n' +
      'data: {"type":"text-end","id":"t0"}\n\n' +
      "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } }
  );

// Session continuity rides the in-band `grida-session` SSE frame (the sole
// channel — no response header). Pull the id out of a drained SSE body.
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

describe("HTTP wire — agent routes (run/stream/abort)", () => {
  let baseDir: string;
  let sessionsStore: SessionsStore;
  let streamRegistry: StreamRegistry;
  let runtime: AgentRuntime;
  let app: Hono;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-route-"));
    const auth = new AuthStore(baseDir);
    const secrets = new SecretsStore(auth);
    await secrets.set("openrouter", "sk-test");
    const db = openSessionsDb({ user_data_path: baseDir });
    sessionsStore = new SessionsStore(db);
    const workspaceRegistry = new WorkspaceRegistry(baseDir);
    // Inject the registry so tests can pre-populate in-flight runs.
    streamRegistry = new StreamRegistry();
    app = new Hono();
    runtime = new AgentRuntime({
      secrets,
      workspace_registry: workspaceRegistry,
      sessions_store: sessionsStore,
      streams: streamRegistry,
      run_agent: fakeRunAgent,
      // Shrink the inter-drain cooldown so the core-drain test runs fast.
      drain_cooldown_ms: 20,
    });
    registerAgentRoutes(app, runtime);
  });

  afterEach(async () => {
    // dispose() clears the injected registry + the scheduler's drain timers.
    runtime.dispose();
    sessionsStore.close();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("rejects invalid message payloads", async () => {
    const missing = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);

    const invalid = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({ messages: "nope" }),
    });
    expect(invalid.status).toBe(400);
  });

  it("POST /agent/run streams UIMessageChunk SSE and emits the in-band session id", async () => {
    const res = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "m", role: "user", content: "hello" }],
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");

    // The body carries the in-band session id frame + real UIMessageChunk
    // frames + the [DONE] sentinel.
    const body = await res.text();
    expect(body).toContain('"type":"text-delta"');
    expect(body).toContain("[DONE]");

    const sessionId = sessionIdFromSse(body);
    expect(sessionId).toBeTruthy();
    // Agent bucket is stamped on the session row.
    const session = await sessionsStore.get(sessionId);
    expect(session?.agent).toBe(AGENT_SESSION_AGENT);

    // The recorder persisted the streamed assistant text. The waitFor
    // also lets the recorder's async write chain settle before teardown
    // closes the DB (otherwise late writes log a harmless query error).
    await vi.waitFor(async () => {
      const messages = await sessionsStore.listMessages(sessionId);
      const assistant = messages.find((m) => m.role === "assistant");
      const textPart = assistant?.parts.find(
        (p) => (p.data as { type?: string }).type === "text"
      );
      expect((textPart?.data as { text?: string } | undefined)?.text).toBe(
        "hi"
      );
    });
  });

  it("emits the in-band grida-session frame as the FIRST SSE frame", async () => {
    // Continuity rides this in-band frame — the sole channel. It must precede
    // every model chunk so the client learns the session id before any chunk.
    const res = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "m", role: "user", content: "hi" }],
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.text();
    const firstFrame = body.split("\n\n")[0];
    expect(firstFrame).toContain("event: grida-session");
    const sessionId = sessionIdFromSse(body);
    expect(sessionId).toBeTruthy();
    expect(firstFrame).toContain(`"session_id":"${sessionId}"`);
    // …and it precedes the first model chunk.
    expect(body.indexOf("event: grida-session")).toBeLessThan(
      body.indexOf("text-delta")
    );

    // Settle the recorder's async write chain before teardown closes the DB.
    await vi.waitFor(async () => {
      const msgs = await sessionsStore.listMessages(sessionId);
      expect(msgs.some((m) => m.role === "assistant")).toBe(true);
    });
  });

  it("rejects an unknown modelId with 400 before reaching the model", async () => {
    const res = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "m", role: "user", content: "hi" }],
        model_id: "no/such-model",
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("modelId not allowed");
  });

  it("persists an explicit modelId on the new session row", async () => {
    const res = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "m", role: "user", content: "hi" }],
        model_id: "anthropic/claude-opus-4.7",
      }),
    });
    expect(res.status).toBe(200);

    const sessionId = sessionIdFromSse(await res.text());
    expect(sessionId).toBeTruthy();
    // The catalog id the user picked is stamped on the row — so a
    // reload re-seeds the picker with the same model.
    const session = await sessionsStore.get(sessionId);
    expect(session?.model?.model_id).toBe("anthropic/claude-opus-4.7");

    // Settle the recorder's full async write chain before teardown
    // closes the DB — wait for the streamed text part to land, not just
    // the message row (matches the SSE test above; a row-only wait races
    // the part write into the closing DB).
    await vi.waitFor(async () => {
      const messages = await sessionsStore.listMessages(sessionId);
      const assistant = messages.find((m) => m.role === "assistant");
      const textPart = assistant?.parts.find(
        (p) => (p.data as { type?: string }).type === "text"
      );
      expect((textPart?.data as { text?: string } | undefined)?.text).toBe(
        "hi"
      );
    });
  });

  it("POST /agent/run with sessionId in flight returns 409 run-in-flight", async () => {
    // A real session must exist (else the run 404s before the registry
    // check), and it must be marked in-flight in the shared registry.
    const created = await sessionsStore.create({ agent: AGENT_SESSION_AGENT });
    streamRegistry.create(created.id);

    const res = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "m", role: "user", content: "again" }],
        session_id: created.id,
      }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("run_in_flight");
  });

  it("the CORE drains a queue on a clean idle edge — serial, FIFO, no client re-send (RFC `queue`)", async () => {
    // Two pending messages, with NO client re-send: the scheduler fires them.
    const created = await sessionsStore.create({ agent: AGENT_SESSION_AGENT });
    await sessionsStore.appendQueuedMessage(created.id, {
      id: "qa",
      text: "first",
      queued_at: 1,
    });
    await sessionsStore.appendQueuedMessage(created.id, {
      id: "qb",
      text: "second",
      queued_at: 2,
    });

    // Drive a clean idle edge through the registry — the scheduler observes it
    // (busy → idle) and drains the queue itself. No `/agent/run` from a client.
    runtime.streams.create(created.id);
    runtime.streams.finish(created.id, "finish");

    // Both fire serially (cooldown between each), in FIFO order, each as its
    // own turn with its own assistant reply — and the queue empties.
    await vi.waitFor(
      async () => {
        expect(await sessionsStore.listQueuedMessages(created.id)).toHaveLength(
          0
        );
        const visible = await sessionsStore.listVisibleMessages(created.id);
        const users = visible.filter((m) => m.role === "user").map((m) => m.id);
        expect(users).toEqual(["qa", "qb"]); // FIFO, both fired
        expect(
          visible.filter((m) => m.role === "assistant").length
        ).toBeGreaterThanOrEqual(2); // one reply per drained turn
        expect((await sessionsStore.getMessage("qa"))?.metadata.queued_at).toBe(
          undefined
        );
        expect((await sessionsStore.getMessage("qb"))?.metadata.queued_at).toBe(
          undefined
        );
      },
      { timeout: 2000 }
    );
  });

  // NOTE: the v1 "client re-sends each queued row by id to drain" test was
  // removed here. That client-driven serial drain is exactly what this
  // redesign moves into the core (the renderer no longer re-sends queued rows
  // — see Phase 5). The core serial drain is covered by the test above; the
  // single-message HTTP dequeue-by-id path stays covered by "drains a queued
  // message" further up.

  it("GET /agent/stream/:id replays full chunk log from index 0, then live-tails", async () => {
    const sid = "ses_replay";
    streamRegistry.create(sid);
    streamRegistry.push(sid, '{"type":"text-start","id":"t0"}');
    streamRegistry.push(sid, '{"type":"text-delta","id":"t0","delta":"AB"}');

    const res = await app.request(`/agent/stream/${sid}`, { method: "GET" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    const readUntil = async (pred: (s: string) => boolean, seed = "") => {
      let acc = seed;
      while (!pred(acc)) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
      }
      return acc;
    };

    // Replay: the buffered frames (index 0 onward) reach a fresh consumer.
    let acc = await readUntil(
      (s) => s.includes("text-start") && s.includes('"delta":"AB"')
    );
    expect(acc).toContain('"type":"text-start"');
    expect(acc).toContain('"delta":"AB"');

    // Live-tail: a frame pushed AFTER attach reaches the same consumer.
    // (Pushed only after the replay frames were read, so ordering is
    // deterministic — replay strictly precedes the live frame.)
    streamRegistry.push(sid, '{"type":"text-delta","id":"t0","delta":"CD"}');
    acc = await readUntil((s) => s.includes('"delta":"CD"'), acc);
    expect(acc.indexOf('"delta":"AB"')).toBeLessThan(
      acc.indexOf('"delta":"CD"')
    );

    // Ending the run closes the SSE.
    streamRegistry.finish(sid, "finish");
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  });

  it("GET /agent/stream/:id returns 404 when no run is in flight", async () => {
    const stream = await app.request("/agent/stream/ses_missing", {
      method: "GET",
    });
    expect(stream.status).toBe(404);
  });

  it("POST /agent/abort cancels upstream and finalizes in-flight assistant message", async () => {
    const created = await sessionsStore.create({ agent: AGENT_SESSION_AGENT });
    const sid = created.id;
    const entry = streamRegistry.create(sid);
    // Attach the recorder exactly as the run handler does, then feed a
    // partial assistant message mid-stream.
    streamRegistry.attach(
      sid,
      createRecorderConsumer({ store: sessionsStore, session_id: sid })
    );
    streamRegistry.push(sid, '{"type":"text-start","id":"t0"}');
    streamRegistry.push(
      sid,
      '{"type":"text-delta","id":"t0","delta":"partial"}'
    );

    // The recorder persists chunks as they arrive on an async write
    // chain. Wait for the partial assistant text to land BEFORE
    // aborting: `onEnd("abort")` calls `markAborted()`, which halts any
    // not-yet-processed chunk — so a real "finalize a partial message"
    // requires the content to have flushed first.
    await vi.waitFor(async () => {
      const messages = await sessionsStore.listMessages(sid);
      const assistant = messages.find((m) => m.role === "assistant");
      const textPart = assistant?.parts.find(
        (p) => (p.data as { type?: string }).type === "text"
      );
      expect((textPart?.data as { text?: string } | undefined)?.text).toBe(
        "partial"
      );
    });

    const signal = entry.model_abort.signal;
    const res = await app.request("/agent/abort", {
      method: "POST",
      body: JSON.stringify({ session_id: sid }),
    });
    expect(res.status).toBe(200);

    // Upstream model call cancelled.
    expect(signal.aborted).toBe(true);

    // The in-flight assistant message survives the abort, finalized with
    // its last-observed partial text (not dropped).
    const messages = await sessionsStore.listMessages(sid);
    const assistant = messages.find((m) => m.role === "assistant");
    expect(assistant).toBeTruthy();
    const textPart = assistant!.parts.find(
      (p) => (p.data as { type?: string }).type === "text"
    );
    expect((textPart!.data as { text: string }).text).toBe("partial");
  });
});

describe("HTTP wire — inline image attachments (perceive-only)", () => {
  let baseDir: string;
  let sessionsStore: SessionsStore;
  let streamRegistry: StreamRegistry;
  let runtime: AgentRuntime;
  let app: Hono;
  // What each model run actually received (the rebuilt model view). The run
  // loop runs for real; only the upstream model call is captured + faked.
  let capturedRuns: Array<{ messages: unknown[] }>;

  // A tiny inline image — never decoded in this path (no real model); it only
  // needs to survive persist → listVisibleMessages → lowerParts → runAgent.
  const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

  const capturingRunAgent = async (
    _provider: unknown,
    req: { messages: unknown[] }
  ): Promise<Response> => {
    capturedRuns.push({ messages: req.messages });
    return new Response(
      'data: {"type":"text-start","id":"t0"}\n\n' +
        'data: {"type":"text-delta","id":"t0","delta":"ok"}\n\n' +
        'data: {"type":"text-end","id":"t0"}\n\n' +
        "data: [DONE]\n\n",
      { headers: { "content-type": "text/event-stream" } }
    );
  };

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-image-"));
    const auth = new AuthStore(baseDir);
    const secrets = new SecretsStore(auth);
    await secrets.set("openrouter", "sk-test");
    const db = openSessionsDb({ user_data_path: baseDir });
    sessionsStore = new SessionsStore(db);
    const workspaceRegistry = new WorkspaceRegistry(baseDir);
    streamRegistry = new StreamRegistry();
    capturedRuns = [];
    app = new Hono();
    runtime = new AgentRuntime({
      secrets,
      workspace_registry: workspaceRegistry,
      sessions_store: sessionsStore,
      streams: streamRegistry,
      run_agent: capturingRunAgent as never,
      drain_cooldown_ms: 20,
    });
    registerAgentRoutes(app, runtime);
  });

  afterEach(async () => {
    runtime.dispose();
    sessionsStore.close();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  function fileParts(messages: unknown[]): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const m of messages as Array<{ parts?: unknown[] }>) {
      for (const p of m.parts ?? []) {
        const part = p as { type?: string };
        if (part.type === "file") out.push(part as Record<string, unknown>);
      }
    }
    return out;
  }

  it("forwards an inline image file part to the model on the turn it is sent", async () => {
    const res = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [
          {
            id: "u1",
            role: "user",
            parts: [
              { type: "text", text: "what is in this image?" },
              {
                type: "file",
                mediaType: "image/png",
                url: PNG_DATA_URL,
                filename: "shot.png",
              },
            ],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const sessionId = sessionIdFromSse(await res.text());
    expect(sessionId).toBeTruthy();

    // The model received the image — proves persist → listVisibleMessages →
    // lowerParts → runAgent carries the file part through.
    expect(capturedRuns.length).toBeGreaterThan(0);
    expect(fileParts(capturedRuns[0].messages)).toContainEqual(
      expect.objectContaining({
        type: "file",
        url: PNG_DATA_URL,
        mediaType: "image/png",
      })
    );

    // Settle the recorder's async write chain before teardown closes the DB.
    await vi.waitFor(async () => {
      const msgs = await sessionsStore.listMessages(sessionId);
      expect(msgs.some((m) => m.role === "assistant")).toBe(true);
    });
  });

  it("re-delivers the image on a later text-only turn (DB-rebuild durability)", async () => {
    // Turn 1 — send the image.
    const r1 = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [
          {
            id: "u1",
            role: "user",
            parts: [
              { type: "text", text: "remember this image" },
              {
                type: "file",
                mediaType: "image/png",
                url: PNG_DATA_URL,
                filename: "shot.png",
              },
            ],
          },
        ],
      }),
    });
    expect(r1.status).toBe(200);
    const sessionId = sessionIdFromSse(await r1.text());
    expect(sessionId).toBeTruthy();

    // Let turn 1 fully end so the second run doesn't race a 409 (a `create`
    // replaces an ended entry but throws while one is still "running").
    await vi.waitFor(() => {
      const entry = streamRegistry.get(sessionId);
      expect(entry === undefined || entry.status === "ended").toBe(true);
    });

    // Turn 2 — a NEW text-only message, NOT resending the image. The DB still
    // holds it, so the rebuilt model view must still carry the file part.
    const r2 = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        messages: [
          {
            id: "u2",
            role: "user",
            parts: [{ type: "text", text: "what did it say?" }],
          },
        ],
      }),
    });
    expect(r2.status).toBe(200);
    await r2.text();

    await vi.waitFor(() => {
      expect(capturedRuns.length).toBeGreaterThanOrEqual(2);
    });
    const lastTurn = capturedRuns[capturedRuns.length - 1];
    expect(fileParts(lastTurn.messages)).toContainEqual(
      expect.objectContaining({ type: "file", url: PNG_DATA_URL })
    );
  });
});
