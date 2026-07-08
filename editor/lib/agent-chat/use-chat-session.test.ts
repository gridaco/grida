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
      state: "input-available",
      input: { questions: [{ question: "Pick?" }] },
    });
    expect(part).not.toHaveProperty("tool_call_id");
    expect(part).not.toHaveProperty("tool_name");
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
