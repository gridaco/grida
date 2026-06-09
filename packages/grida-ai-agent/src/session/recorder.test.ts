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

  // RFC `permission modes` (Phase 2) — the approval pause/resume splits a tool
  // call across TWO turns: input + name persist in the pausing turn; the
  // execution result streams in the resume turn on a FRESH recorder that never
  // saw the input. Without cross-turn adoption the result lands as a nameless
  // `tool` part, the model-view rebuild drops it (only `tool-<name>` lowers),
  // and the model re-asks forever. This pins the in-place completion.
  it("completes the ORIGINAL tool part across turns (pause → resume), not a forked `tool` part", async () => {
    // Turn 1: the model calls run_command; it pauses for approval.
    const t1 = createRecorderConsumer({ store, session_id: session.id });
    await feed(t1, [
      { type: "start" },
      { type: "start-step" },
      { type: "tool-input-start", toolCallId: "tc1", toolName: "run_command" },
      {
        type: "tool-input-available",
        toolCallId: "tc1",
        toolName: "run_command",
        input: { command: "python3", args: ["gen.py"] },
      },
      { type: "tool-approval-request", toolCallId: "tc1", approvalId: "ap1" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    // The user approves (mirrors `applyApprovalAnswer` on the resume request).
    await store.answerApproval(session.id, {
      tool_call_id: "tc1",
      approval_id: "ap1",
      approved: true,
    });

    // Turn 2 (resume): a FRESH recorder receives ONLY the execution output for
    // the same toolCallId — no input, no name (those lived in turn 1).
    const t2 = createRecorderConsumer({ store, session_id: session.id });
    await feed(t2, [
      { type: "start" },
      { type: "start-step" },
      {
        type: "tool-output-available",
        toolCallId: "tc1",
        output: { stdout: "ok", exit_code: 0 },
      },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    // The original part is completed IN PLACE: still `tool-run_command`, now
    // output-available — and there is exactly ONE part for the call (no fork).
    const part = await store.findToolPart(session.id, "tc1");
    expect(part).toBeTruthy();
    expect(part!.type).toBe("tool-run_command");
    expect((part!.data as { state?: string }).state).toBe("output-available");

    const rows = opened.sqlite
      .prepare("SELECT type, tool_state FROM chat_parts WHERE tool_call_id = ?")
      .all("tc1") as Array<{ type: string; tool_state: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("tool-run_command");
    expect(rows[0].tool_state).toBe("output-available");

    // And NO duplicate turn at the DB level: the resume output adopted the
    // original assistant message instead of forking a second one.
    const messages = await store.listMessages(session.id);
    expect(messages.length).toBe(1);
  });

  // The message-identity fix (the duplicate/cut-off root cause): the recorder
  // persists the assistant message under the id the STREAM advertises (its
  // `start` chunk), and on the approval RESUME the stream re-advertises that
  // SAME id — so the resume APPENDS to the one message instead of forking a
  // second turn. With client + DB on one id, the AI-SDK reducer merges the
  // resume in place (no duplicate, no cut-off) and a reload matches.
  it("persists under the stream's message id and a resume APPENDS to it (one merged turn)", async () => {
    // Turn 1: the stream advertises id "msgA"; the model writes text + calls
    // run_command, which pauses for approval.
    const t1 = createRecorderConsumer({ store, session_id: session.id });
    await feed(t1, [
      { type: "start", messageId: "msgA" },
      { type: "start-step" },
      { type: "text-start", id: "x1" },
      { type: "text-delta", id: "x1", delta: "Let me run it." },
      { type: "text-end", id: "x1" },
      { type: "tool-input-start", toolCallId: "tc1", toolName: "run_command" },
      {
        type: "tool-input-available",
        toolCallId: "tc1",
        toolName: "run_command",
        input: { command: "python3", args: ["torus.py"] },
      },
      { type: "tool-approval-request", toolCallId: "tc1", approvalId: "ap1" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    // The assistant message uses the STREAM's id, not a freshly minted one.
    const afterT1 = await store.listMessages(session.id);
    expect(afterT1.length).toBe(1);
    expect(afterT1[0].id).toBe("msgA");
    expect(afterT1[0].parts.length).toBe(2); // text + run_command(approval)

    await store.answerApproval(session.id, {
      tool_call_id: "tc1",
      approval_id: "ap1",
      approved: true,
    });

    // Turn 2 (resume): the SDK CONTINUES the same message — the stream
    // re-advertises "msgA". A FRESH recorder receives the executed output + a
    // continuation line.
    const t2 = createRecorderConsumer({ store, session_id: session.id });
    await feed(t2, [
      { type: "start", messageId: "msgA" },
      { type: "start-step" },
      {
        type: "tool-output-available",
        toolCallId: "tc1",
        output: { stdout: "ok", exit_code: 0 },
      },
      { type: "text-start", id: "x2" },
      { type: "text-delta", id: "x2", delta: "Done — it ran." },
      { type: "text-end", id: "x2" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    // STILL one assistant message (no fork); the continuation APPENDED after the
    // pausing turn's parts (index 2), never overwriting index 0.
    const merged = await store.listMessages(session.id);
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("msgA");
    const parts = merged[0].parts;
    expect(parts.length).toBe(3); // text, run_command(output), continuation text
    expect((parts[0].data as { text: string }).text).toBe("Let me run it.");
    const tool = parts.find((p) => p.type === "tool-run_command");
    expect(tool!.tool_state).toBe("output-available");
    const tail = parts[parts.length - 1];
    expect(tail.type).toBe("text");
    expect((tail.data as { text: string }).text).toBe("Done — it ran.");
  });
});
