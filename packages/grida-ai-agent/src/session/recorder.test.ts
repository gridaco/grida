import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openSessionsDb, type OpenedSessionsDb } from "./db";
import { createRecorderConsumer } from "./recorder";
import { SessionsStore } from "./store";
import type { ChatModel, ChatSessionRow } from "./rows";

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
  it.each([undefined, "advertised-assistant"])(
    "inserts resolved provenance with a new row even on abort (stream id: %s)",
    async (messageId) => {
      let model: ChatModel | undefined;
      const consumer = createRecorderConsumer({
        store,
        session_id: session.id,
        get_model: () => model,
      });
      model = {
        provider_id: "openrouter",
        model_id: "anthropic/claude-opus-5.5",
        tier: "pro",
      };
      await feed(
        consumer,
        [
          { type: "start", ...(messageId && { messageId }) },
          { type: "reasoning-start", id: "thinking" },
          { type: "reasoning-end", id: "thinking" },
        ],
        "abort"
      );
      const [message] = await store.listMessages(session.id);
      expect(message.metadata.model).toEqual(model);
      expect(consumer.message_id).toBe(message.id);
      const generatedId = expect.any(String);
      expect(message.id).toEqual(messageId ?? generatedId);
    }
  );

  it.each([false, true])(
    "adopts legacy tool output with durable provenance before new parts (known model: %s)",
    async (knownModel) => {
      const resumedModel: ChatModel = {
        provider_id: "openrouter",
        model_id: "anthropic/claude-opus-5.5",
        tier: "pro",
      };
      const originalModel: ChatModel = {
        provider_id: "vercel",
        model_id: "openai/gpt-5.6-sol",
        tier: "pro",
      };
      const expectedModel = knownModel ? originalModel : resumedModel;
      const message = await store.appendMessage(session.id, {
        id: "legacy-assistant",
        role: "assistant",
        ...(knownModel && { metadata: { model: originalModel } }),
      });
      await store.upsertPart(message.id, {
        index: 0,
        type: "tool-list_files",
        tool_call_id: "legacy-call",
        tool_state: "approval-responded",
        data: {
          type: "tool-list_files",
          toolCallId: "legacy-call",
          state: "approval-responded",
          input: { path: "/" },
          approval: { id: "legacy-approval", approved: true },
        },
      });
      const upsertPart = store.upsertPart.bind(store);
      const modelsAtPartWrite: unknown[] = [];
      vi.spyOn(store, "upsertPart").mockImplementation(
        async (messageId, part) => {
          modelsAtPartWrite.push(
            (await store.getMessage(messageId))?.metadata.model
          );
          return upsertPart(messageId, part);
        }
      );
      const consumer = createRecorderConsumer({
        store,
        session_id: session.id,
        get_model: () => resumedModel,
      });
      await feed(
        consumer,
        [
          { type: "start", messageId: message.id },
          // Existing tool slots bypass ensureAssistantMessage entirely.
          {
            type: "tool-output-available",
            toolCallId: "legacy-call",
            output: { files: [] },
          },
          { type: "reasoning-start", id: "resumed-thinking" },
          {
            type: "reasoning-end",
            id: "resumed-thinking",
            providerMetadata: {
              anthropic: { signature: "synthetic-resumed-signature" },
            },
          },
        ],
        "abort"
      );
      expect(modelsAtPartWrite).toHaveLength(3);
      for (const model of modelsAtPartWrite)
        expect(model).toEqual(expectedModel);
      const messages = await store.listMessages(session.id);
      expect(messages).toHaveLength(1);
      expect(messages[0].metadata.model).toEqual(expectedModel);
      expect(messages[0].parts.map((part) => part.type)).toEqual([
        "tool-list_files",
        "reasoning",
      ]);
      expect(messages[0].parts[0].tool_state).toBe("output-available");
      expect(consumer.message_id).toBe(message.id);
    }
  );

  it("refuses successful settlement when legacy provenance cannot be persisted", async () => {
    const message = await store.appendMessage(session.id, {
      id: "legacy-write-failure",
      role: "assistant",
    });
    vi.spyOn(store, "setMessageAccounting").mockRejectedValue(
      new Error("synthetic metadata write failure")
    );
    const onError = vi.fn<(err: unknown) => void>();
    const consumer = createRecorderConsumer({
      store,
      session_id: session.id,
      get_model: () => ({
        provider_id: "openrouter",
        model_id: "anthropic/claude-opus-5.5",
      }),
      on_error: onError,
    });
    await expect(
      feed(consumer, [
        { type: "start", messageId: message.id },
        { type: "reasoning-start", id: "thinking" },
      ])
    ).rejects.toThrow("Could not persist model identity");
    expect(onError).toHaveBeenCalledOnce();
    const [persisted] = await store.listMessages(session.id);
    expect(persisted.metadata.model).toBeUndefined();
    expect(persisted.parts).toEqual([]);
  });

  it("retains empty signed reasoning and provider state through approval and resumed output", async () => {
    const metadata = {
      openrouter: {
        reasoning_details: [
          {
            type: "reasoning.text",
            text: "",
            signature: "synthetic-signature",
            index: 0,
          },
        ],
      },
    };
    await feed(createRecorderConsumer({ store, session_id: session.id }), [
      { type: "start", messageId: "continuation" },
      { type: "start-step" },
      { type: "reasoning-start", id: "r1" },
      {
        type: "reasoning-end",
        id: "r1",
        providerMetadata: { anthropic: { signature: "synthetic-signature" } },
      },
      {
        type: "tool-input-available",
        toolCallId: "continue-tool",
        toolName: "list_files",
        input: { path: "/" },
        providerMetadata: metadata,
      },
      {
        type: "tool-approval-request",
        toolCallId: "continue-tool",
        approvalId: "allow-tool",
      },
    ]);
    const pending = await store.findToolPart(session.id, "continue-tool");
    expect(pending?.data).toMatchObject({ callProviderMetadata: metadata });
    const [message] = await store.listMessages(session.id);
    expect(message.parts.map((p) => p.type)).toEqual([
      "step-start",
      "reasoning",
      "tool-list_files",
    ]);
    expect(message.parts[1].data).toEqual({
      type: "reasoning",
      text: "",
      state: "done",
      providerMetadata: { anthropic: { signature: "synthetic-signature" } },
    });

    // A new recorder adopts the original call slot after the approval pause.
    await feed(createRecorderConsumer({ store, session_id: session.id }), [
      { type: "start", messageId: "continuation" },
      {
        type: "tool-output-available",
        toolCallId: "continue-tool",
        output: { files: [] },
      },
      { type: "start-step" },
      { type: "text-start", id: "answer" },
      { type: "text-delta", id: "answer", delta: "Done" },
      { type: "text-end", id: "answer" },
    ]);
    const completed = await store.findToolPart(session.id, "continue-tool");
    expect(completed?.data).toMatchObject({
      callProviderMetadata: metadata,
      input: { path: "/" },
      output: { files: [] },
    });
    const [resumed] = await store.listMessages(session.id);
    expect(resumed.parts.map((p) => p.type)).toEqual([
      "step-start",
      "reasoning",
      "tool-list_files",
      "step-start",
      "text",
    ]);
  });

  it("does not persist an empty failed step", async () => {
    await feed(
      createRecorderConsumer({ store, session_id: session.id }),
      [{ type: "start", messageId: "empty-step" }, { type: "start-step" }],
      "abort"
    );
    expect(await store.listMessages(session.id)).toEqual([]);
  });

  it("keeps unfinished text and reasoning marked streaming after cancellation", async () => {
    await feed(
      createRecorderConsumer({ store, session_id: session.id }),
      [
        { type: "start", messageId: "canceled" },
        { type: "start-step" },
        { type: "reasoning-start", id: "r" },
        { type: "reasoning-delta", id: "r", delta: "Partial thinking" },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "Partial answer" },
      ],
      "abort"
    );
    const [message] = await store.listMessages(session.id);
    expect(
      message.parts
        .filter((part) => part.type !== "step-start")
        .map((part) => part.data)
    ).toEqual([
      { type: "reasoning", text: "Partial thinking", state: "streaming" },
      { type: "text", text: "Partial answer", state: "streaming" },
    ]);
  });

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
    expect(messages[0].parts.map((p) => p.type)).toEqual([
      "step-start",
      "text",
    ]);
    expect((messages[0].parts[1].data as { text: string }).text).toBe(
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
    expect((toolPart!.data as { toolCallId?: string }).toolCallId).toBe("tc1");
    expect((toolPart!.data as { tool_call_id?: string }).tool_call_id).toBe(
      undefined
    );
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
    expect((toolPart!.data as { toolCallId?: string }).toolCallId).toBe("tc1");
    expect((toolPart!.data as { inputTextDelta?: string }).inputTextDelta).toBe(
      '{"path":'
    );
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
    expect(afterT1[0].parts.length).toBe(3); // step + text + run_command(approval)

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
    // pausing turn's parts, never overwriting existing content.
    const merged = await store.listMessages(session.id);
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("msgA");
    const parts = merged[0].parts;
    expect(parts.length).toBe(5); // two steps + text + tool output + continuation
    expect((parts[1].data as { text: string }).text).toBe("Let me run it.");
    const tool = parts.find((p) => p.type === "tool-run_command");
    expect(tool!.tool_state).toBe("output-available");
    const tail = parts[parts.length - 1];
    expect(tail.type).toBe("text");
    expect((tail.data as { text: string }).text).toBe("Done — it ran.");
  });
});
