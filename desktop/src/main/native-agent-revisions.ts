// GRIDA-SEC-004 — Main captures and owns each exact attached history revision.
import { randomUUID } from "node:crypto";
import type {
  NativeChatEffort,
  NativeChatOperatingRegime,
  NativeChatRevisionReceipt,
  NativeChatRevisionTarget,
  NativeChatSnapshot,
} from "@grida/desktop-bridge";
import type { NativeChatSession } from "./native-agent-chat";
import { NativeAgentHistory } from "./native-agent-history";

const TARGET = "co.grida/session/revision-target";
const REVISE = "co.grida/session/revise";
const MAX_TEXT_BYTES = 512 * 1024;
const { anchor, basis, identity, object, revision } = NativeAgentHistory;
const UNVERIFIED = new Set([
  "native_agent_request_timeout",
  "sqlite_commit_unconfirmed",
  "store_task_interrupted",
  "control_worker_interrupted",
  "native_agent_disconnected",
  "native_agent_input_failed",
  "native_agent_output_failed",
  "native_agent_diagnostics_failed",
  "native_agent_invalid_frame",
  "native_agent_invalid_response",
  "native_agent_provider_reply_failed",
  "native_chat_revision_unverified",
]);

type RevisionRequest = Readonly<{
  sessionId: string;
  requestId: string;
  replacementInputId: string;
  expectedSessionRevision: number;
  expectedHistory: NativeAgentHistory.Basis;
  anchor: NativeAgentHistory.Anchor;
  prompt: readonly [{ type: "text"; text: string }];
  operatingRegime: NativeChatOperatingRegime;
  effort?: NativeChatEffort;
}>;

type Attempt = {
  request: RevisionRequest;
  active: boolean;
  receipt?: NativeChatRevisionReceipt;
};

type Capture = {
  session: NativeChatSession;
  target: NativeChatRevisionTarget;
  expectedSessionRevision: number;
  expectedHistory: NativeAgentHistory.Basis;
  anchor: NativeAgentHistory.Anchor;
  attempt?: Attempt;
};

type Check = (expectedSessionRevision?: number) => void;

export class NativeAgentRevisions {
  static readonly capabilities = { [TARGET]: 1, [REVISE]: 1 } as const;
  private readonly captures = new WeakMap<object, Capture>();

  constructor(
    private readonly request: (
      method: string,
      params: unknown
    ) => Promise<unknown>
  ) {}

  async prepare(
    attachment: object,
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    messageId: string,
    check: Check
  ): Promise<NativeChatRevisionTarget> {
    if (!identity(messageId) || snapshot.sessionId !== session.id)
      throw new Error("native_chat_revision_target_invalid");
    if (snapshot.current || snapshot.queuedInputs)
      throw new Error("history_revision_requires_idle");
    const previous = this.captures.get(attachment);
    requireResolved(previous);
    const expectedSessionRevision = snapshot.sessionRevision;
    check(expectedSessionRevision);
    const reply = object(
      await this.request(`_${TARGET}`, {
        sessionId: session.id,
        messageId,
        expectedSessionRevision,
      })
    );
    check(expectedSessionRevision);
    if (this.captures.get(attachment) !== previous)
      throw new Error("native_chat_revision_target_changed");
    requireResolved(previous);
    const selected = anchor(reply?.anchor);
    const expectedHistory = basis(reply?.basis);
    if (
      !reply ||
      reply.sessionRevision !== expectedSessionRevision ||
      selected?.message !== messageId ||
      !expectedHistory ||
      expectedHistory.view > expectedSessionRevision ||
      !revision(reply.subsequentMessages) ||
      (reply.effort !== undefined && reply.effort !== "ultra") ||
      !validText(reply.text)
    )
      throw new Error("native_chat_revision_target_invalid");
    const target = Object.freeze({
      reviewId: randomUUID(),
      messageId,
      text: reply.text,
      subsequentMessages: reply.subsequentMessages,
      ...(reply.effort === "ultra" && { effort: "ultra" as const }),
    });
    this.captures.set(attachment, {
      session,
      target,
      expectedSessionRevision,
      expectedHistory,
      anchor: selected,
    });
    return target;
  }

  async apply(
    attachment: object,
    session: NativeChatSession,
    reviewId: string,
    text: string,
    operatingRegime: NativeChatOperatingRegime,
    check: Check,
    effort?: { selection?: NativeChatEffort; available: boolean }
  ): Promise<NativeChatRevisionReceipt> {
    const capture = this.captures.get(attachment);
    if (capture?.target.reviewId !== reviewId || capture.session !== session)
      throw new Error("native_chat_revision_target_changed");
    if (!validText(text)) throw new Error("native_chat_revision_text_invalid");
    const selectedEffort = effort?.selection ?? capture.target.effort;
    let attempt = capture.attempt;
    if (attempt) {
      if (
        attempt.request.prompt[0].text !== text ||
        attempt.request.operatingRegime !== operatingRegime ||
        attempt.request.effort !== selectedEffort
      )
        throw new Error("native_chat_revision_identity_reused");
      check();
      if (attempt.receipt) return attempt.receipt;
      if (attempt.active) throw new Error("native_chat_revision_in_progress");
    }
    if (
      effort?.selection !== undefined &&
      effort.selection !== (capture.target.effort ?? "standard")
    )
      throw new Error("native_chat_revision_effort_changed");
    if (selectedEffort !== undefined && !effort?.available)
      throw new Error("native_chat_effort_unavailable");
    if (!attempt) {
      check(capture.expectedSessionRevision);
      attempt = {
        request: {
          sessionId: session.id,
          requestId: randomUUID(),
          replacementInputId: randomUUID(),
          expectedSessionRevision: capture.expectedSessionRevision,
          expectedHistory: capture.expectedHistory,
          anchor: capture.anchor,
          prompt: [{ type: "text", text }],
          operatingRegime,
          ...(selectedEffort && { effort: selectedEffort }),
        },
        active: false,
      };
      capture.attempt = attempt;
    }
    attempt.active = true;
    let result: NativeChatRevisionReceipt;
    try {
      const reply = object(await this.request(`_${REVISE}`, attempt.request));
      if (
        reply?.sessionId !== session.id ||
        reply.inputId !== attempt.request.replacementInputId ||
        !revision(reply.view) ||
        reply.view <= capture.expectedSessionRevision ||
        !revision(reply.inputPosition) ||
        reply.inputPosition === 0
      )
        throw new Error("native_chat_revision_unverified");
      result = Object.freeze({
        sessionId: session.id,
        view: reply.view,
        inputId: attempt.request.replacementInputId,
        inputPosition: reply.inputPosition,
      });
      attempt.receipt = result;
    } catch (error) {
      if (error instanceof Error && UNVERIFIED.has(error.message))
        throw new Error("native_chat_revision_unverified", { cause: error });
      capture.attempt = undefined;
      throw error;
    } finally {
      attempt.active = false;
    }
    check();
    return result;
  }
}

function requireResolved(capture: Capture | undefined): void {
  if (capture?.attempt && !capture.attempt.receipt)
    throw new Error("native_chat_revision_unverified");
}

function validText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !!value.trim() &&
    Buffer.byteLength(value) <= MAX_TEXT_BYTES &&
    Buffer.byteLength(JSON.stringify([{ kind: "text", text: value }])) <=
      MAX_TEXT_BYTES
  );
}
