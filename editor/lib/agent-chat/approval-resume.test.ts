import { describe, expect, it } from "vitest";
import { buildApprovalResumeBody } from "./approval-resume";

describe("buildApprovalResumeBody", () => {
  it("puts the Allow on the body as `approval_answer` (not a mutated message)", () => {
    // The whole point of the Phase 2 wire: the answer is a first-class body
    // field the sidecar validates, exactly like `mode`/`model_id` travel.
    expect(
      buildApprovalResumeBody({
        session_id: "ses_1",
        model_id: "anthropic/claude-x",
        mode: "accept-edits",
        tool_call_id: "tc1",
        approval_id: "ap1",
        approved: true,
      })
    ).toEqual({
      session_id: "ses_1",
      model_id: "anthropic/claude-x",
      mode: "accept-edits",
      approval_answer: {
        tool_call_id: "tc1",
        approval_id: "ap1",
        approved: true,
      },
    });
  });

  it("forwards a denial (approved: false) verbatim", () => {
    const body = buildApprovalResumeBody({
      mode: "accept-edits",
      tool_call_id: "tc1",
      approval_id: "ap1",
      approved: false,
    });
    expect(body.approval_answer.approved).toBe(false);
  });

  it("leaves absent session/model undefined — never invents values", () => {
    const body = buildApprovalResumeBody({
      mode: "auto",
      tool_call_id: "tc1",
      approval_id: "ap1",
      approved: true,
    });
    expect(body.session_id).toBeUndefined();
    expect(body.model_id).toBeUndefined();
    expect(body.mode).toBe("auto");
  });
});
