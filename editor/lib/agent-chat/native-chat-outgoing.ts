import type {
  NativeChatAcceptance,
  NativeChatMessageAttachment,
  NativeChatMessageContext,
} from "@grida/desktop-bridge";
import type { ComposerDraftPending } from "./composer-drafts";
import { SkillMentions } from "./skill-mentions";
import type { NativeChatView } from "./native-chat-controller";

/** An ordinary main-chat request owns its presentation until the host can show it. */
export type NativeChatOutgoing = Readonly<{
  id: string;
  text: string;
  attachment?: NonNullable<NativeChatView["attachmentDraft"]>;
  attachments?: readonly NativeChatMessageAttachment[];
  displayParts?: NativeChatMessageContext["displayParts"];
  placement: "transcript" | "queue";
  status: "sending" | "accepted" | "unconfirmed" | "failed";
  error?: string;
  retryable?: false;
}>;

export namespace NativeChatOutgoing {
  /** Only an authored turn or a queue member can stand in for the local request. */
  export function represented(
    view: Pick<NativeChatView, "messages" | "queue">,
    inputId: string | undefined,
    receipt?: NativeChatAcceptance
  ): boolean {
    if (
      receipt?.disposition === "superseded" ||
      receipt?.disposition === "withdrawn"
    )
      return true;
    if (inputId && view.queue?.items.some((item) => item.inputId === inputId))
      return true;
    return view.messages.some((message) => {
      if (
        message.role !== "user" ||
        message.questionReply ||
        message.questionReplies
      )
        return false;
      if (message.inputId) return message.inputId === inputId;
      // Older hosts identify the turn on both its receipt and its authored message.
      return !!receipt?.turnId && message.turnId === receipt.turnId;
    });
  }

  export function restored(
    pending: ComposerDraftPending,
    draft: NonNullable<ComposerDraftPending["outgoing"]>,
    missingReference: boolean
  ): NativeChatOutgoing {
    const attachment = pending.attachment;
    const missing = draft.missingAttachmentName;
    const missingAttachments =
      missingReference || pending.attachments?.some(({ input }) => !input);
    return {
      id: draft.id,
      text: pending.text,
      ...(attachment
        ? { attachment: { kind: attachment.kind, name: attachment.name } }
        : missing && { attachment: { kind: "file", name: missing } }),
      displayParts: SkillMentions.display(
        pending.skills,
        pending.messageContext?.displayParts
      ),
      ...(pending.attachments && {
        attachments: pending.attachments.map(({ card }) => card),
      }),
      placement: pending.mode === "enqueue" ? "queue" : "transcript",
      status: draft.staged ? "failed" : "unconfirmed",
      ...((draft.retryBlocked || (draft.staged && missingAttachments)) && {
        retryable: false,
      }),
      error: !draft.staged
        ? "Couldn't confirm the send."
        : missingAttachments
          ? "The original attachment is unavailable. Restore the draft to attach it again."
          : "This message wasn't sent before the chat closed.",
    };
  }
}
