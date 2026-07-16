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
import { AuthStore } from "@grida/daemon/server";
import { SecretsStore } from "@grida/daemon/server";
import { WorkspaceRegistry } from "@grida/daemon/server";
import { openSessionsDb } from "../../session/db";
import { SessionsStore } from "../../session/store";
import { createRecorderConsumer } from "../../session/recorder";
import { DirectoryScopeRegistry } from "../../session/directory-scopes";
import { AGENT_SESSION_AGENT } from "../../protocol/run";
import { AgentRuntime } from "../../runtime";
import { StreamRegistry } from "../../runtime/stream-registry";
import { sessionIdFromSse } from "../../testing/sse";
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

describe("HTTP wire — agent routes (run/stream/abort)", () => {
  let baseDir: string;
  let sessionsStore: SessionsStore;
  let secrets: SecretsStore;
  let workspaceRegistry: WorkspaceRegistry;
  let streamRegistry: StreamRegistry;
  let runtime: AgentRuntime;
  let app: Hono;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-route-"));
    const auth = new AuthStore(baseDir);
    secrets = new SecretsStore(auth);
    await secrets.set("openrouter", "sk-test");
    const db = openSessionsDb({ user_data_path: baseDir });
    sessionsStore = new SessionsStore(db);
    workspaceRegistry = new WorkspaceRegistry(baseDir);
    // Inject the registry so tests can pre-populate in-flight runs.
    streamRegistry = new StreamRegistry();
    app = new Hono();
    runtime = new AgentRuntime({
      secrets,
      workspace_registry: workspaceRegistry,
      sessions_store: sessionsStore,
      streams: streamRegistry,
      run_agent: fakeRunAgent,
      scratch_base: path.join(baseDir, "scratch-base"),
      external_agent_execution: "sandboxed",
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

  it("GRIDA-SEC-004: reports an external agent unavailable without an enforced sandbox", async () => {
    const response = await app.request("/agent/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model_id: "claude-acp",
        messages: [{ id: "u-acp", role: "user", content: "hello" }],
      }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error:
        "[agent-host-providers] external agent claude requires an enforced OS sandbox",
      code: "provider_down",
      provider_id: "claude",
    });
  });

  it("GRIDA-SEC-004: withholds external agents when the host disables ACP execution", async () => {
    runtime.dispose();
    streamRegistry = new StreamRegistry();
    runtime = new AgentRuntime({
      secrets,
      workspace_registry: workspaceRegistry,
      sessions_store: sessionsStore,
      streams: streamRegistry,
      run_agent: fakeRunAgent,
      sandbox_enforced: true,
      external_agent_execution: "disabled",
    });
    app = new Hono();
    registerAgentRoutes(app, runtime);

    const response = await app.request("/agent/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model_id: "claude-acp",
        messages: [{ id: "u-acp-disabled", role: "user", content: "hello" }],
      }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error:
        "[agent-host-providers] external agent claude is disabled by the host",
      code: "provider_down",
      provider_id: "claude",
    });
  });

  it("stages byte-identical attachment bodies before persisting their descriptors", async () => {
    const workspaceDir = path.join(baseDir, "workspace");
    await fs.mkdir(workspaceDir);
    const workspace = await workspaceRegistry.open(workspaceDir);
    const session = await sessionsStore.create({
      agent: AGENT_SESSION_AGENT,
      workspace_id: workspace.id,
      workspace_root: workspace.root,
    });
    const response = await app.request("/agent/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: session.id,
        workspace_id: workspace.id,
        messages: [
          {
            id: "u-attachment",
            role: "user",
            parts: [
              { type: "text", text: "inspect this" },
              {
                type: "data-user_file_attachments",
                data: {
                  location: "scratch",
                  files: [
                    {
                      name: "opaque.bin",
                      mime: "application/octet-stream",
                      size: 4,
                      path: "upload.bin",
                    },
                  ],
                },
              },
            ],
          },
        ],
        scratch_seed: [{ path: "upload.bin", base64: "AP+Afg==" }],
      }),
    });
    expect(response.status).toBe(200);
    const staged = await fs.readFile(
      path.join(
        baseDir,
        "scratch-base",
        "sessions",
        session.id,
        "scratch",
        "upload.bin"
      )
    );
    expect([...staged]).toEqual([0, 255, 128, 126]);
    const persisted = await sessionsStore.listMessages(session.id);
    expect(persisted[0].parts[1].type).toBe("data-user_file_attachments");
    await response.text();
  });

  it("does not persist an attachment descriptor when scratch is unavailable", async () => {
    const session = await sessionsStore.create({ agent: AGENT_SESSION_AGENT });
    const response = await app.request("/agent/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: session.id,
        messages: [
          {
            id: "u-dangling",
            role: "user",
            parts: [
              {
                type: "data-user_file_attachments",
                data: {
                  location: "scratch",
                  files: [
                    {
                      name: "opaque.bin",
                      mime: "application/octet-stream",
                      size: 3,
                      path: "upload.bin",
                    },
                  ],
                },
              },
            ],
          },
        ],
        scratch_seed: [{ path: "upload.bin", base64: "AQID" }],
      }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "scratch-unavailable",
    });
    expect(await sessionsStore.listMessages(session.id)).toEqual([]);
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

  it("POST /agent/run is refused 409 human-input-pending while a supervised approval is unanswered (RFC `permission modes`)", async () => {
    // A session whose last assistant turn left an unanswered approval-requested
    // tool part — the exact state the scheduler's drain refuses to run over
    // (`session-scheduler.ts` `has_pending_human_input`). The HTTP path must refuse
    // too, or `buildModelMessages` drops the unanswered part and the next message
    // runs ahead of the blocked command (orphaning the approval). The 409 code is
    // generalized: the same guard now covers an unanswered `question`.
    const created = await sessionsStore.create({ agent: AGENT_SESSION_AGENT });
    const asst = await sessionsStore.appendMessage(created.id, {
      role: "assistant",
    });
    await sessionsStore.upsertPart(asst.id, {
      index: 0,
      type: "tool-run_command",
      data: {
        type: "tool-run_command",
        state: "approval-requested",
        approval: { id: "ap1" },
      },
      tool_call_id: "tc1",
      tool_state: "approval-requested",
    });
    expect(await sessionsStore.hasPendingApproval(created.id)).toBe(true);

    // A normal send carrying NO valid approval_answer is refused, not run.
    const blocked = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "u2", role: "user", content: "do something else" }],
        session_id: created.id,
      }),
    });
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { code?: string }).code).toBe(
      "human-input-pending"
    );
    // No turn started; the typed-ahead follow-up was NOT persisted; the approval
    // is still pending and actionable (not orphaned).
    expect(streamRegistry.get(created.id)).toBeUndefined();
    expect(await sessionsStore.getMessage("u2")).toBeNull();
    expect(await sessionsStore.hasPendingApproval(created.id)).toBe(true);

    // Carrying the Allow clears the block → the run proceeds.
    const resumed = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "u2", role: "user", content: "do something else" }],
        session_id: created.id,
        approval_answer: {
          tool_call_id: "tc1",
          approval_id: "ap1",
          approved: true,
        },
      }),
    });
    expect(resumed.status).toBe(200);
    await resumed.text();
    expect(await sessionsStore.hasPendingApproval(created.id)).toBe(false);

    // Settle the recorder's async write chain before teardown closes the DB:
    // wait for the resumed turn's streamed assistant text ("hi") to land.
    await vi.waitFor(async () => {
      const msgs = await sessionsStore.listMessages(created.id);
      const hasHi = msgs.some(
        (m) =>
          m.role === "assistant" &&
          m.parts.some(
            (p) =>
              (p.data as { type?: string }).type === "text" &&
              (p.data as { text?: string }).text === "hi"
          )
      );
      expect(hasHi).toBe(true);
    });
  });

  it("RESUMES a paused `question` when the answer rides the assistant tail (clears the block BEFORE the 409 guard)", async () => {
    // Regression for the live-daemon resume 409: unlike an approval (a body
    // field applied before the guard), a `question` answer is a terminal tool
    // result in the assistant tail. `fillIncomingToolResults` must clear the
    // human-input block BEFORE `hasPendingHumanInput`, or the very POST carrying
    // the answer is refused by the guard it resolves.
    const created = await sessionsStore.create({ agent: AGENT_SESSION_AGENT });
    const asst = await sessionsStore.appendMessage(created.id, {
      role: "assistant",
    });
    await sessionsStore.upsertPart(asst.id, {
      index: 0,
      type: "tool-question",
      data: {
        type: "tool-question",
        state: "input-available",
        input: { questions: [{ question: "Which color?" }] },
      },
      tool_call_id: "q1",
      tool_state: "input-available",
    });
    expect(await sessionsStore.hasPendingHumanInput(created.id)).toBe(true);

    // The resume carries the answer as an output-available tool part in the tail.
    const resumed = await app.request("/agent/run", {
      method: "POST",
      body: JSON.stringify({
        session_id: created.id,
        messages: [
          {
            id: asst.id,
            role: "assistant",
            parts: [
              {
                type: "tool-question",
                toolCallId: "q1",
                state: "output-available",
                input: { questions: [{ question: "Which color?" }] },
                output: { answers: [["Cool"]] },
              },
            ],
          },
        ],
      }),
    });
    expect(resumed.status).toBe(200); // NOT 409 — the answer cleared the block
    await resumed.text();
    expect(await sessionsStore.hasPendingHumanInput(created.id)).toBe(false);
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

describe("HTTP wire — session-scoped directory references", () => {
  let baseDir: string;
  let referenceRoot: string;
  let sessionsStore: SessionsStore;
  let directoryScopes: DirectoryScopeRegistry;
  let runtime: AgentRuntime;
  let app: Hono;
  let capturedRuns: Array<{
    messages: Array<{ parts?: Array<{ text?: string }> }>;
    directory_scopes?: Array<{ id: string; root: string; path: string }>;
  }>;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-dir-ref-"));
    referenceRoot = path.join(baseDir, "reference-material");
    const hostSecret = path.join(baseDir, "host-secret");
    await fs.mkdir(referenceRoot);
    await fs.mkdir(hostSecret);
    await fs.writeFile(path.join(referenceRoot, "marker.txt"), "REFERENCE_OK");

    const auth = new AuthStore(baseDir);
    const secrets = new SecretsStore(auth);
    await secrets.set("openrouter", "sk-test");
    sessionsStore = new SessionsStore(
      openSessionsDb({ user_data_path: baseDir })
    );
    directoryScopes = new DirectoryScopeRegistry({
      protected_roots: [hostSecret],
    });
    capturedRuns = [];
    const capturingRunAgent = async (
      _provider: unknown,
      req: (typeof capturedRuns)[number]
    ): Promise<Response> => {
      capturedRuns.push(req);
      return new Response(
        'data: {"type":"text-start","id":"t0"}\n\n' +
          'data: {"type":"text-delta","id":"t0","delta":"ok"}\n\n' +
          'data: {"type":"text-end","id":"t0"}\n\n' +
          "data: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } }
      );
    };
    runtime = new AgentRuntime({
      secrets,
      workspace_registry: new WorkspaceRegistry(path.join(baseDir, "registry")),
      sessions_store: sessionsStore,
      directory_scopes: directoryScopes,
      run_agent: capturingRunAgent as never,
      drain_cooldown_ms: 20,
    });
    app = new Hono();
    registerAgentRoutes(app, runtime);
  });

  afterEach(async () => {
    runtime.dispose();
    directoryScopes.dispose();
    sessionsStore.close();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  function messageWith(descriptor: Record<string, unknown>, id: string) {
    return {
      id,
      role: "user",
      parts: [
        { type: "text", text: "read the reference" },
        {
          type: "data-user_directory_references",
          data: { directories: [descriptor] },
        },
      ],
    };
  }

  it("claims before persistence, passes the live root only to bindings, and persists no host path", async () => {
    const descriptor = await directoryScopes.attach(referenceRoot);
    const response = await app.request("/agent/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [messageWith(descriptor, "u-dir")] }),
    });
    expect(response.status).toBe(200);
    const sessionId = sessionIdFromSse(await response.text());
    expect(sessionId).toBeTruthy();

    expect(directoryScopes.forSession(sessionId)).toHaveLength(1);
    expect(capturedRuns).toHaveLength(1);
    expect(capturedRuns[0].directory_scopes).toEqual([
      expect.objectContaining({
        id: descriptor.id,
        root: await fs.realpath(referenceRoot),
        path: descriptor.path,
      }),
    ]);
    const marker = capturedRuns[0].messages[0].parts?.find((part) =>
      part.text?.includes("<user_directory_references>")
    )?.text;
    expect(marker).toContain('"available": true');

    const persisted = await sessionsStore.listMessages(sessionId);
    expect(JSON.stringify(persisted)).not.toContain(referenceRoot);
    expect(persisted[0].parts[1].data).toMatchObject({
      data: { directories: [descriptor] },
    });
  });

  it("does not let a copied or unknown descriptor mint authority in another session", async () => {
    const descriptor = await directoryScopes.attach(referenceRoot);
    const first = await sessionsStore.create({ agent: AGENT_SESSION_AGENT });
    const firstResponse = await app.request("/agent/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: first.id,
        messages: [messageWith(descriptor, "u-first")],
      }),
    });
    expect(firstResponse.status).toBe(200);
    await firstResponse.text();

    const fork = await sessionsStore.create({ agent: AGENT_SESSION_AGENT });
    const replay = await app.request("/agent/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: fork.id,
        messages: [messageWith(descriptor, "u-replay")],
      }),
    });
    expect(replay.status).toBe(409);
    expect(await replay.json()).toMatchObject({
      code: "directory-scope-owned-by-another-session",
    });
    expect(await sessionsStore.listMessages(fork.id)).toEqual([]);

    const unknown = await sessionsStore.create({ agent: AGENT_SESSION_AGENT });
    const unknownId = "dir_99999999-9999-4999-8999-999999999999";
    const stale = await app.request("/agent/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: unknown.id,
        messages: [
          messageWith(
            {
              kind: "scope",
              id: unknownId,
              name: "fabricated",
              path: `/__references__/${unknownId}`,
              access: "read",
            },
            "u-unknown"
          ),
        ],
      }),
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: "directory-scope-unavailable",
    });
    expect(await sessionsStore.listMessages(unknown.id)).toEqual([]);
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
