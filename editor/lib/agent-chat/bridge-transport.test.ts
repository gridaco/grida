/* eslint-disable vitest/require-mock-type-parameters */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessageChunk } from "ai";
import { desktopAgentTransport } from "./bridge-transport";
import { ai } from "@/lib/desktop/bridge";

// Spread the real module so the runtime vocab constants the transport reads
// (`AGENT_MODES`, `AGENT_TIERS`, …) stay defined — stub ONLY the bridge `ai`
// surface. A whole-module stub left `AGENT_MODES` undefined, which the mode
// passthrough below depends on.
vi.mock("@/lib/desktop/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/desktop/bridge")>()),
  ai: {
    startAgentRun: vi.fn(),
    abortAgentRun: vi.fn(),
    reconnectAgentRun: vi.fn(),
  },
}));

describe("desktopAgentTransport", () => {
  it("converts bridge callback chunks into a readable UIMessageChunk stream", async () => {
    const chunk: UIMessageChunk = {
      type: "tool-input-start",
      toolCallId: "call-1",
      toolName: "read_file",
    };
    vi.mocked(ai.startAgentRun).mockImplementation(async (_opts, onChunk) => {
      onChunk(chunk);
      return {
        streamId: "local-1",
        sessionId: "ses_test",
        done: Promise.resolve(),
      };
    });

    const stream = await desktopAgentTransport.create().sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: undefined,
    });

    const reader = stream.getReader();
    await expect(reader.read()).resolves.toEqual({ done: false, value: chunk });
    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  // The desktop "assistant renders all-at-once when finished" report comes
  // down to one question this layer owns: does a chunk that arrives mid-run
  // reach `useChat` *before* the run completes, or only after? The bridge
  // hands us chunks one `onChunk` call at a time and a separate `done`
  // promise that settles at `[DONE]`. A correct adapter enqueues each chunk
  // the instant it arrives; a buffer-until-done adapter would withhold them
  // until `done` settles. We prove the former by keeping `done` PENDING and
  // asserting each `read()` resolves anyway — a buffering impl would hang
  // here (read never resolves) and fail the test.
  it("streams each chunk as it arrives — does not buffer until the run completes", async () => {
    let emit!: (chunk: UIMessageChunk) => void;
    let markReady!: () => void;
    const ready = new Promise<void>((r) => (markReady = r));
    let finishRun!: () => void;
    const done = new Promise<void>((r) => (finishRun = r));

    vi.mocked(ai.startAgentRun).mockImplementation(async (_opts, onChunk) => {
      emit = onChunk;
      markReady();
      return { streamId: "local-1", sessionId: "ses_test", done };
    });

    const stream = await desktopAgentTransport.create().sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: undefined,
    });
    // `start()` has run and captured the bridge `onChunk`; `done` is unsettled.
    await ready;
    const reader = stream.getReader();

    const first: UIMessageChunk = { type: "text-start", id: "t" };
    emit(first);
    // Resolves while the run is still in flight (`done` pending) — the proof.
    await expect(reader.read()).resolves.toEqual({ done: false, value: first });

    const second: UIMessageChunk = { type: "text-delta", id: "t", delta: "hi" };
    emit(second);
    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: second,
    });

    // Only now does the run end — the stream closes after the last chunk.
    finishRun();
    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it("does not let undefined per-turn body fields erase defaults", async () => {
    vi.mocked(ai.startAgentRun).mockImplementation(async () => ({
      streamId: "local-1",
      sessionId: "ses_test",
      done: Promise.resolve(),
    }));

    const stream = await desktopAgentTransport
      .create({ workspace_id: "workspace-1" })
      .sendMessages({
        trigger: "submit-message",
        chatId: "chat-1",
        messageId: undefined,
        messages: [
          { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
        ],
        abortSignal: undefined,
        body: {},
      });
    await stream.cancel();

    expect(ai.startAgentRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspace_id: "workspace-1" }),
      expect.any(Function)
    );
  });

  // Regression: the permission mode (RFC `permission modes`) chosen in the
  // composer rides each send as `body.mode`. It MUST reach `startAgentRun` —
  // a prior bug dropped it in both `readBodyOptions` and the `startAgentRun`
  // field list, so every run defaulted to `accept-edits` server-side no matter
  // what the picker showed (the picker was cosmetic; `python3` stayed gated).
  it("forwards the per-turn permission `mode` to startAgentRun", async () => {
    vi.mocked(ai.startAgentRun).mockImplementation(async () => ({
      streamId: "local-1",
      sessionId: "ses_test",
      done: Promise.resolve(),
    }));

    const stream = await desktopAgentTransport.create().sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: undefined,
      body: { mode: "auto" },
    });
    await stream.cancel();

    expect(ai.startAgentRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "auto" }),
      expect.any(Function)
    );
  });

  // Supervised-approval answer (RFC `permission modes`, Phase 2). The Allow/Deny
  // rides the body as an explicit `approval_answer` field — exactly like `mode`.
  // It MUST reach `startAgentRun` whole, or the resume can't be matched to the
  // pending approval and the command never runs.
  it("forwards the `approval_answer` body field to startAgentRun", async () => {
    vi.mocked(ai.startAgentRun).mockImplementation(async () => ({
      streamId: "local-1",
      sessionId: "ses_test",
      done: Promise.resolve(),
    }));

    const answer = {
      tool_call_id: "tc1",
      approval_id: "ap1",
      approved: true,
    };
    const stream = await desktopAgentTransport.create().sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: undefined,
      body: { approval_answer: answer },
    });
    await stream.cancel();

    expect(ai.startAgentRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ approval_answer: answer }),
      expect.any(Function)
    );
  });

  // Regression: a picked slides template's unzipped bundle rides the FIRST send
  // as `body.scratch_seed` and MUST reach `startAgentRun` whole — the sidecar
  // writes it into the session scratch (agent-only, WG `scratch.md`). The SAME
  // whitelist-drop bug as `mode`/`approval_answer` above left every template
  // session's scratch empty until `readBodyOptions` + the `startAgentRun` field
  // list carried it.
  it("forwards the `scratch_seed` body field to startAgentRun", async () => {
    vi.mocked(ai.startAgentRun).mockImplementation(async () => ({
      streamId: "local-1",
      sessionId: "ses_test",
      done: Promise.resolve(),
    }));

    const seed = [
      { path: ".canvas.json", text: "{}" },
      { path: "001.svg", text: "<svg/>" },
    ];
    const stream = await desktopAgentTransport.create().sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: undefined,
      body: { scratch_seed: seed },
    });
    await stream.cancel();

    expect(ai.startAgentRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ scratch_seed: seed }),
      expect.any(Function)
    );
  });

  // A malformed `approval_answer` (missing `approved`) is dropped at the body
  // gate, not forwarded — the sidecar re-validates regardless, but the transport
  // shouldn't relay junk.
  it("drops a malformed `approval_answer` (shape gate)", async () => {
    vi.mocked(ai.startAgentRun).mockImplementation(async () => ({
      streamId: "local-1",
      sessionId: "ses_test",
      done: Promise.resolve(),
    }));

    const stream = await desktopAgentTransport.create().sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: undefined,
      body: { approval_answer: { tool_call_id: "tc1", approval_id: "ap1" } },
    });
    await stream.cancel();

    expect(ai.startAgentRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ approval_answer: undefined }),
      expect.any(Function)
    );
  });

  // Regression: a core-initiated turn (a queue drain) is rendered by
  // `resumeStream()`, which the AI SDK calls as `reconnectToStream({ chatId })`
  // with the AI-SDK chat id. For a FRESH chat that id is client-generated and
  // never matches the SERVER session id the stream registry is keyed by — so a
  // reconnect on `chatId` 404s and the drained turn's response silently never
  // renders. The transport MUST reconnect to the server id learned on send.
  it("reconnectToStream resumes the SERVER session id (from send), not the client chatId", async () => {
    vi.mocked(ai.startAgentRun).mockImplementation(async () => ({
      streamId: "local-1",
      sessionId: "ses_server", // the server-resolved id, != the chatId below
      done: Promise.resolve(),
    }));
    vi.mocked(ai.reconnectAgentRun).mockResolvedValue(null); // no live run → null

    const transport = desktopAgentTransport.create();

    // First send: the fresh chat adopts its server id (via the bridge handle).
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-client-generated",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "1" }] },
      ],
      abortSignal: undefined,
    });
    // Drain the stream so `start()` runs and the session id is tracked.
    const reader = stream.getReader();
    while (!(await reader.read()).done) {
      /* drain */
    }

    // A later reconnect (the core drained the next queued turn) MUST target the
    // server id — NOT the client `chatId`, which would 404.
    await transport.reconnectToStream!({ chatId: "chat-client-generated" });
    expect(ai.reconnectAgentRun).toHaveBeenLastCalledWith(
      "ses_server",
      0,
      expect.any(Function)
    );
  });

  // Regression (dead Allow button): the AI SDK's approval/tool auto-resubmit
  // calls the transport with NO body. It must still target the session the
  // prior send resolved — otherwise the sidecar forks a fresh session and the
  // resume (the approval answer) is lost, so the command never runs.
  it("a body-less resubmit reuses the live session id from the prior send", async () => {
    vi.mocked(ai.startAgentRun).mockImplementation(async () => ({
      streamId: "local-1",
      sessionId: "ses_live",
      done: Promise.resolve(),
    }));

    const transport = desktopAgentTransport.create({ workspace_id: "w" });

    // First send: the fresh chat adopts its server id.
    const s1 = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "c",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: undefined,
      body: { model_id: "x" },
    });
    const r1 = s1.getReader();
    while (!(await r1.read()).done) {
      /* drain so start() tracks the session id */
    }

    // Second send is BODY-LESS (the auto-resubmit) — must carry ses_live, not
    // fall back to the (undefined) creation-time default.
    const s2 = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "c",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: undefined,
    });
    await s2.cancel();

    expect(ai.startAgentRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ session_id: "ses_live" }),
      expect.any(Function)
    );
  });
});

// The control-channel contract (RFC `session lifecycle`):
// docs/wg/ai/agent/session.md#abort-vs-tcp-close — a stream teardown is a
// DETACH, not an abort. `ai.abortAgentRun` (the run-termination control action)
// may be reached ONLY through the explicit user-Stop channel (the request
// `abortSignal`), NEVER through the ReadableStream `cancel()` a consumer fires
// on unmount / stream-replace / reconnect swap / reducer error. These five
// cases pin the whole class. Case 1 is the direct regression lock: it FAILS the
// moment a detach (`cancel()`) is wired to abort — the original "cut-off after
// detach" bug. The rest fix the contract's other edges: Stop still aborts (2),
// an explicit Stop followed by teardown stays single (3, because `abort()`
// closes the stream so the SDK's later `cancel()` never fires — guarding a
// future decouple of close-from-abort), no-session teardown is a no-op (4), and
// the resume path is immune too (5). No jsdom, no network — the same mock-bridge
// harness as above.
describe("detach ≠ abort (session.md#abort-vs-tcp-close)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A run that has started (session id resolved) but never finishes — `done`
  // stays pending so the stream is genuinely mid-flight when we tear it down.
  // `ready` resolves once the bridge has captured `onChunk`; `emit` pushes a
  // chunk so start() runs past the session-id tracking line.
  function mockPendingRun(sessionId: string) {
    let emit!: (chunk: UIMessageChunk) => void;
    let markReady!: () => void;
    const ready = new Promise<void>((r) => (markReady = r));
    vi.mocked(ai.startAgentRun).mockImplementation(async (_opts, onChunk) => {
      emit = onChunk;
      markReady();
      return {
        streamId: "local-1",
        sessionId,
        done: new Promise<void>(() => {}),
      };
    });
    return { ready, emit: (chunk: UIMessageChunk) => emit(chunk) };
  }

  it("cancel() on a mid-run stream does NOT abort the run (detach, not abort)", async () => {
    const run = mockPendingRun("ses_live");
    const stream = await desktopAgentTransport.create().sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: undefined,
    });
    await run.ready;
    const reader = stream.getReader();
    // Read one chunk so start() has run past the session-id tracking line.
    run.emit({ type: "text-start", id: "t" });
    await reader.read();

    await reader.cancel();

    expect(ai.abortAgentRun).not.toHaveBeenCalled();
  });

  it("explicit Stop (abortSignal) DOES abort the run exactly once", async () => {
    const run = mockPendingRun("ses_live");
    const controller = new AbortController();
    const stream = await desktopAgentTransport.create().sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: controller.signal,
    });
    await run.ready;
    const reader = stream.getReader();
    run.emit({ type: "text-start", id: "t" });
    await reader.read(); // start() is now past session-id tracking

    controller.abort();
    await Promise.resolve();

    expect(ai.abortAgentRun).toHaveBeenCalledTimes(1);
    expect(ai.abortAgentRun).toHaveBeenCalledWith("ses_live");
  });

  it("Stop then cancel aborts exactly once (no double-abort)", async () => {
    const run = mockPendingRun("ses_live");
    const controller = new AbortController();
    const stream = await desktopAgentTransport.create().sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: controller.signal,
    });
    await run.ready;
    const reader = stream.getReader();
    run.emit({ type: "text-start", id: "t" });
    await reader.read();

    controller.abort(); // explicit Stop → abort (1)
    await reader.cancel(); // teardown → must NOT add a second abort
    await Promise.resolve();

    expect(ai.abortAgentRun).toHaveBeenCalledTimes(1);
  });

  it("cancel() before the session id resolves is a clean no-op", async () => {
    // startAgentRun never resolves → no session id is ever tracked.
    vi.mocked(ai.startAgentRun).mockImplementation(
      () =>
        new Promise<{
          streamId: string;
          sessionId: string;
          done: Promise<void>;
        }>(() => {})
    );
    const stream = await desktopAgentTransport.create().sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: undefined,
    });

    await expect(stream.cancel()).resolves.toBeUndefined();
    expect(ai.abortAgentRun).not.toHaveBeenCalled();
  });

  it("a reconnect/resume stream teardown does NOT abort the run", async () => {
    vi.mocked(ai.startAgentRun).mockImplementation(async () => ({
      streamId: "local-1",
      sessionId: "ses_server",
      done: Promise.resolve(),
    }));
    // A live in-flight run to reconnect to; `done` stays pending so the resume
    // stream is open when we tear it down.
    vi.mocked(ai.reconnectAgentRun).mockImplementation(async () => ({
      streamId: "local-2",
      sessionId: "ses_server",
      done: new Promise<void>(() => {}),
    }));

    const transport = desktopAgentTransport.create();
    // First send establishes the live server session id.
    const s1 = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-client",
      messageId: undefined,
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      abortSignal: undefined,
    });
    const r1 = s1.getReader();
    while (!(await r1.read()).done) {
      /* drain so start() tracks the session id */
    }

    const resume = await transport.reconnectToStream!({
      chatId: "chat-client",
    });
    expect(resume).not.toBeNull();
    await resume!.cancel();

    expect(ai.abortAgentRun).not.toHaveBeenCalled();
  });
});

// Attach-owner reporting hooks (`onStreamOpen`/`onStreamSettle`): the
// transport REPORTS stream lifecycles — including the SDK's body-less
// auto-resubmit no scaffold ever requests — so the owner can adopt them and
// serialize every other intent behind a live attach. Reporting only: these
// pins also re-assert the detach≠abort block above is untouched (a settle
// report must never come with an abort).
describe("attach-owner reporting (onStreamOpen / onStreamSettle)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockRun(sessionId: string, opts?: { neverDone?: boolean }) {
    let emit!: (chunk: UIMessageChunk) => void;
    let finish!: () => void;
    const done = opts?.neverDone
      ? new Promise<void>(() => {})
      : new Promise<void>((r) => (finish = r));
    vi.mocked(ai.startAgentRun).mockImplementation(async (_opts, onChunk) => {
      emit = onChunk;
      return { streamId: "local-1", sessionId, done };
    });
    return {
      emit: (chunk: UIMessageChunk) => emit(chunk),
      finish: () => finish(),
    };
  }

  it("send: open fires at stream start, settle exactly once at close", async () => {
    const run = mockRun("ses_live");
    const onStreamOpen = vi.fn();
    const onStreamSettle = vi.fn();
    const stream = await desktopAgentTransport
      .create({ onStreamOpen, onStreamSettle })
      .sendMessages({
        trigger: "submit-message",
        chatId: "chat-1",
        messageId: undefined,
        messages: [
          { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
        ],
        abortSignal: undefined,
      });
    const reader = stream.getReader();
    run.emit({ type: "text-start", id: "t" });
    await reader.read();
    expect(onStreamOpen).toHaveBeenCalledTimes(1);
    expect(onStreamSettle).not.toHaveBeenCalled();

    run.finish();
    await reader.read(); // drains the close
    expect(onStreamSettle).toHaveBeenCalledTimes(1);
  });

  it("send: consumer cancel settles exactly once — and still never aborts", async () => {
    mockRun("ses_live", { neverDone: true });
    const onStreamOpen = vi.fn();
    const onStreamSettle = vi.fn();
    const stream = await desktopAgentTransport
      .create({ onStreamOpen, onStreamSettle })
      .sendMessages({
        trigger: "submit-message",
        chatId: "chat-1",
        messageId: undefined,
        messages: [
          { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
        ],
        abortSignal: undefined,
      });
    const reader = stream.getReader();
    await reader.cancel();
    expect(onStreamOpen).toHaveBeenCalledTimes(1);
    expect(onStreamSettle).toHaveBeenCalledTimes(1);
    expect(ai.abortAgentRun).not.toHaveBeenCalled();
  });

  it("reconnect: a null handle (no live run) reports NOTHING", async () => {
    vi.mocked(ai.reconnectAgentRun).mockResolvedValue(null);
    const onStreamOpen = vi.fn();
    const onStreamSettle = vi.fn();
    const resume = await desktopAgentTransport.create({
      session_id: "ses_live",
      onStreamOpen,
      onStreamSettle,
    }).reconnectToStream!({ chatId: "chat-client" });
    expect(resume).toBeNull();
    expect(onStreamOpen).not.toHaveBeenCalled();
    expect(onStreamSettle).not.toHaveBeenCalled();
  });

  it("reconnect: open on a live handle, settle once when the replay finishes", async () => {
    let finish!: () => void;
    vi.mocked(ai.reconnectAgentRun).mockImplementation(async () => ({
      streamId: "local-1",
      sessionId: "ses_live",
      done: new Promise<void>((r) => (finish = r)),
    }));
    const onStreamOpen = vi.fn();
    const onStreamSettle = vi.fn();
    const resume = await desktopAgentTransport.create({
      session_id: "ses_live",
      onStreamOpen,
      onStreamSettle,
    }).reconnectToStream!({ chatId: "chat-client" });
    expect(resume).not.toBeNull();
    expect(onStreamOpen).toHaveBeenCalledTimes(1);
    expect(onStreamSettle).not.toHaveBeenCalled();

    const reader = resume!.getReader();
    finish();
    await reader.read(); // drains the close
    expect(onStreamSettle).toHaveBeenCalledTimes(1);
  });

  it("reconnect: consumer cancel settles once (stream-replace teardown)", async () => {
    vi.mocked(ai.reconnectAgentRun).mockImplementation(async () => ({
      streamId: "local-1",
      sessionId: "ses_live",
      done: new Promise<void>(() => {}),
    }));
    const onStreamSettle = vi.fn();
    const resume = await desktopAgentTransport.create({
      session_id: "ses_live",
      onStreamSettle,
    }).reconnectToStream!({ chatId: "chat-client" });
    await resume!.cancel();
    expect(onStreamSettle).toHaveBeenCalledTimes(1);
    expect(ai.abortAgentRun).not.toHaveBeenCalled();
  });

  it("a throwing hook never breaks the stream", async () => {
    const run = mockRun("ses_live");
    const stream = await desktopAgentTransport
      .create({
        onStreamOpen: () => {
          throw new Error("hook down");
        },
        onStreamSettle: () => {
          throw new Error("hook down");
        },
      })
      .sendMessages({
        trigger: "submit-message",
        chatId: "chat-1",
        messageId: undefined,
        messages: [
          { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
        ],
        abortSignal: undefined,
      });
    const reader = stream.getReader();
    run.emit({ type: "text-start", id: "t" });
    const first = await reader.read();
    expect(first.done).toBe(false);
    run.finish();
    const end = await reader.read();
    expect(end.done).toBe(true);
  });
});
