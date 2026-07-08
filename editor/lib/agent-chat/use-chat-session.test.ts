import { describe, expect, it } from "vitest";
import { toUIMessagePart } from "./use-chat-session";

describe("toUIMessagePart", () => {
  it("normalizes legacy persisted tool ids to the AI SDK UI part shape", () => {
    const part = toUIMessagePart({
      id: "prt_1",
      message_id: "msg_1",
      session_id: "ses_1",
      index: 0,
      type: "tool-question",
      data: {
        type: "tool-question",
        tool_call_id: "tc_1",
        tool_name: "question",
        state: "input-available",
        input: { questions: [{ question: "Pick?" }] },
      },
      tool_call_id: "tc_1",
      tool_state: "input-available",
      created_at: 1,
      updated_at: 1,
    });

    expect(part).toMatchObject({
      type: "tool-question",
      toolCallId: "tc_1",
      toolName: "question",
      state: "input-available",
      input: { questions: [{ question: "Pick?" }] },
    });
    expect(part).not.toHaveProperty("tool_call_id");
    expect(part).not.toHaveProperty("tool_name");
  });

  it("normalizes legacy snake_case tool metadata fields", () => {
    const part = toUIMessagePart({
      id: "prt_1",
      message_id: "msg_1",
      session_id: "ses_1",
      index: 0,
      type: "tool-question",
      data: {
        type: "tool-question",
        tool_call_id: "tc_1",
        tool_name: "question",
        input_text_delta: "delta",
        error_text: "err",
        provider_executed: true,
        state: "output-error",
        input: {},
      },
      tool_call_id: "tc_1",
      tool_state: "output-error",
      created_at: 1,
      updated_at: 1,
    });

    expect(part).toMatchObject({
      toolCallId: "tc_1",
      toolName: "question",
      inputTextDelta: "delta",
      errorText: "err",
      providerExecuted: true,
    });
    expect(part).not.toHaveProperty("input_text_delta");
    expect(part).not.toHaveProperty("error_text");
    expect(part).not.toHaveProperty("provider_executed");
  });

  it("leaves new SDK-shaped tool parts intact", () => {
    const part = toUIMessagePart({
      id: "prt_1",
      message_id: "msg_1",
      session_id: "ses_1",
      index: 0,
      type: "tool-question",
      data: {
        type: "tool-question",
        toolCallId: "tc_1",
        state: "output-available",
        input: { questions: [{ question: "Pick?" }] },
        output: { answers: [["A"]] },
      },
      tool_call_id: "tc_1",
      tool_state: "output-available",
      created_at: 1,
      updated_at: 1,
    });

    expect(part).toMatchObject({
      type: "tool-question",
      toolCallId: "tc_1",
      state: "output-available",
      output: { answers: [["A"]] },
    });
  });
});
