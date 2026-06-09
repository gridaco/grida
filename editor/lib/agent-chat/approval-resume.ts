/**
 * Build the run-request body that answers a paused supervised approval (RFC
 * `permission modes`, Phase 2).
 *
 * The Allow/Deny rides the body as a first-class `approval_answer` field —
 * exactly like `mode`/`model_id`, never a client-mutated message. The sidecar
 * owns message state: it validates the answer against the persisted pending
 * approval and resumes the turn. Because the resume stream re-advertises the
 * ORIGINAL assistant message id (the core's message-identity fix), the AI-SDK
 * reducer merges the resume into that message in place — no duplicate turn, no
 * cut-off, and no client-side reconcile. The desktop is a thin sender: it builds
 * this body and streams the result, nothing more.
 */

import type { AgentMode } from "@/lib/desktop/bridge";

/** The run-request body that carries an Allow/Deny answer on resume. */
export type ApprovalResumeBody = {
  session_id?: string;
  model_id?: string;
  mode: AgentMode;
  approval_answer: {
    tool_call_id: string;
    approval_id: string;
    approved: boolean;
  };
};

export type ApprovalResumeArgs = {
  session_id?: string;
  model_id?: string;
  mode: AgentMode;
  tool_call_id: string;
  approval_id: string;
  approved: boolean;
};

export function buildApprovalResumeBody(
  args: ApprovalResumeArgs
): ApprovalResumeBody {
  return {
    session_id: args.session_id,
    model_id: args.model_id,
    mode: args.mode,
    approval_answer: {
      tool_call_id: args.tool_call_id,
      approval_id: args.approval_id,
      approved: args.approved,
    },
  };
}
