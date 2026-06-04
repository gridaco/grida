/* eslint-disable vitest/require-mock-type-parameters */
import { describe, expect, it, vi } from "vitest";
import type { UIMessageChunk } from "ai";
import { desktopAgentTransport } from "./bridge-transport";
import { ai } from "@/lib/desktop/bridge";

vi.mock("@/lib/desktop/bridge", () => ({
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
        body: { skills: undefined },
      });
    await stream.cancel();

    expect(ai.startAgentRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspace_id: "workspace-1" }),
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
});
