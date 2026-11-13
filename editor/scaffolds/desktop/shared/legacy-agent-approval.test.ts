import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { findPendingApproval } from "./agent-approval";

function assistant(parts: unknown[]): UIMessage {
  return {
    id: "assistant",
    role: "assistant",
    parts,
  } as UIMessage;
}

describe("findPendingApproval", () => {
  it("reads a live camelCase approval and builds its command label", () => {
    expect(
      findPendingApproval([
        assistant([
          {
            type: "tool-run_command",
            state: "approval-requested",
            toolCallId: "call_1",
            approval: { id: "approval_1" },
            input: {
              command: "python3",
              args: ["verify.py"],
              description: "Validate the generated file",
            },
          },
        ]),
      ])
    ).toEqual({
      approvalId: "approval_1",
      toolCallId: "call_1",
      label: "python3 verify.py",
      description: "Validate the generated file",
    });
  });

  it("accepts a hydrated snake_case tool-call id", () => {
    expect(
      findPendingApproval([
        assistant([
          {
            type: "tool-run_command",
            state: "approval-requested",
            tool_call_id: "call_2",
            approval: { id: "approval_2" },
            input: { command: "git", args: ["status"] },
          },
        ]),
      ])
    ).toMatchObject({
      approvalId: "approval_2",
      toolCallId: "call_2",
      label: "git status",
    });
  });

  it("accepts a dynamic tool and falls back to its tool-type label", () => {
    expect(
      findPendingApproval([
        assistant([
          {
            type: "dynamic-tool",
            state: "approval-requested",
            toolCallId: "call_3",
            approval: { id: "approval_3" },
          },
        ]),
      ])
    ).toMatchObject({
      approvalId: "approval_3",
      toolCallId: "call_3",
      label: "dynamic-tool",
    });
    expect(
      findPendingApproval([
        assistant([
          {
            type: "tool-run_command",
            state: "approval-requested",
            toolCallId: "call_4",
            approval: { id: "approval_4" },
          },
        ]),
      ])
    ).toMatchObject({
      label: "run_command",
    });
  });

  it("does not surface an answered or non-tail approval", () => {
    const pending = assistant([
      {
        type: "tool-run_command",
        state: "approval-requested",
        toolCallId: "call_1",
        approval: { id: "approval_1" },
      },
    ]);
    const answered = assistant([
      {
        type: "tool-run_command",
        state: "output-available",
        toolCallId: "call_2",
        approval: { id: "approval_2" },
      },
    ]);

    expect(findPendingApproval([pending, answered])).toBeNull();
    expect(
      findPendingApproval([
        pending,
        { id: "user", role: "user", parts: [{ type: "text", text: "next" }] },
      ])
    ).toBeNull();
  });
});
