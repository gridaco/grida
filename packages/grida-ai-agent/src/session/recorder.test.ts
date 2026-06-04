import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openSessionsDb, type OpenedSessionsDb } from "./db";
import { createRecorderConsumer } from "./recorder";
import { SessionsStore } from "./store";
import type { ChatSessionRow } from "./rows";

let tempDir: string;
let opened: OpenedSessionsDb;
let store: SessionsStore;
let session: ChatSessionRow;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-recorder-test-"));
  opened = openSessionsDb({ user_data_path: tempDir });
  store = new SessionsStore(opened);
  session = await store.create({ agent: "grida" });
});

afterEach(async () => {
  store.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

/**
 * Drive the recorder consumer the same way `StreamRegistry` does in
 * production: one opaque `data` per `onFrame`, plus an `onEnd` for the
 * terminal signal. Returns a promise that resolves once flush settles.
 */
async function feed(
  consumer: ReturnType<typeof createRecorderConsumer>,
  chunks: unknown[],
  reason: "finish" | "abort" = "finish"
): Promise<void> {
  for (const c of chunks) {
    await consumer.on_frame(typeof c === "string" ? c : JSON.stringify(c));
  }
  await consumer.on_end(reason);
}

describe("createRecorderConsumer", () => {
  it("persists text-* chunks as a mutable text part", async () => {
    const consumer = createRecorderConsumer({ store, session_id: session.id });
    await feed(consumer, [
      { type: "start" },
      { type: "start-step" },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "Hel" },
      { type: "text-delta", id: "t1", delta: "lo " },
      { type: "text-delta", id: "t1", delta: "world" },
      { type: "text-end", id: "t1" },
      {
        type: "finish-step",
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      },
      {
        type: "finish",
        totalUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      },
      "[DONE]",
    ]);

    const messages = await store.listMessages(session.id);
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].parts.length).toBe(1);
    expect(messages[0].parts[0].type).toBe("text");
    expect((messages[0].parts[0].data as { text: string }).text).toBe(
      "Hello world"
    );

    // Usage extraction is intentionally NOT the recorder's job — the
    // route handler's `onStepUsage` path owns it (see `agent.ts`).
    // The recorder must NOT touch session tokens from chunk content,
    // even when chunks carry it, otherwise multi-step runs double-count.
    const refreshed = await store.get(session.id);
    expect(refreshed!.prompt_tokens).toBe(0);
    expect(refreshed!.completion_tokens).toBe(0);
    expect(refreshed!.total_tokens).toBe(0);
  });

  it("persists already-received chunks when the run is aborted", async () => {
    // Regression: aborting must not drop frames that were already streamed.
    // markAborted() blocks only FUTURE frames; the backlog still flushes so
    // the persisted message matches what the user saw.
    const consumer = createRecorderConsumer({ store, session_id: session.id });
    await feed(
      consumer,
      [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Hel" },
        { type: "text-delta", id: "t1", delta: "lo" },
      ],
      "abort"
    );

    const messages = await store.listMessages(session.id);
    expect(messages.length).toBe(1);
    expect(messages[0].parts.length).toBe(1);
    expect((messages[0].parts[0].data as { text: string }).text).toBe("Hello");
  });

  it("captures tool input → output state transitions in a single row", async () => {
    const consumer = createRecorderConsumer({ store, session_id: session.id });
    await feed(consumer, [
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "thinking" },
      { type: "text-end", id: "t1" },
      {
        type: "tool-input-start",
        tool_call_id: "tc1",
        tool_name: "list_files",
      },
      { type: "tool-input-delta", tool_call_id: "tc1", input_text_delta: '{"' },
      {
        type: "tool-input-available",
        tool_call_id: "tc1",
        tool_name: "list_files",
        input: { path: "/" },
      },
      {
        type: "tool-output-available",
        tool_call_id: "tc1",
        output: { files: ["/canvas.svg"] },
      },
      { type: "finish" },
      "[DONE]",
    ]);

    const messages = await store.listMessages(session.id);
    expect(messages.length).toBe(1);
    expect(messages[0].parts.length).toBe(2);
    const textPart = messages[0].parts.find((p) => p.type === "text");
    const toolPart = messages[0].parts.find((p) => p.type.startsWith("tool-"));
    expect(textPart).toBeTruthy();
    expect(toolPart).toBeTruthy();
    expect(toolPart!.tool_call_id).toBe("tc1");
    expect(toolPart!.tool_state).toBe("output-available");
    expect((toolPart!.data as { output: unknown }).output).toEqual({
      files: ["/canvas.svg"],
    });
    // Regression: the input captured at `tool-input-available` must survive
    // the wholesale-replacing `output-available` write. If it's dropped, the
    // next turn fails convertToModelMessages and the UI shows "network error".
    expect((toolPart!.data as { input: unknown }).input).toEqual({ path: "/" });
  });

  it("leaves in-flight tool parts in their last observed state when the stream ends mid-tool", async () => {
    // No `tool-output-available` chunk arrives — the recorder must
    // persist the tool row in its last-seen `input-streaming` state so
    // a reload shows the user what they saw before the cut.
    const consumer = createRecorderConsumer({ store, session_id: session.id });
    await feed(consumer, [
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "Open" },
      {
        type: "tool-input-start",
        tool_call_id: "tc1",
        tool_name: "list_files",
      },
      {
        type: "tool-input-delta",
        tool_call_id: "tc1",
        input_text_delta: '{"path":',
      },
    ]);

    const messages = await store.listMessages(session.id);
    expect(messages.length).toBe(1);
    const toolPart = messages[0].parts.find((p) => p.tool_call_id === "tc1");
    expect(toolPart).toBeTruthy();
    expect(toolPart!.tool_state).toBe("input-streaming");
  });

  it("ignores the [DONE] sentinel and malformed JSON frames", async () => {
    const consumer = createRecorderConsumer({ store, session_id: session.id });
    await feed(consumer, [
      "[DONE]",
      "{not-json",
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "x" },
      { type: "text-end", id: "t1" },
    ]);
    const messages = await store.listMessages(session.id);
    expect(messages.length).toBe(1);
    expect((messages[0].parts[0].data as { text: string }).text).toBe("x");
  });
});
