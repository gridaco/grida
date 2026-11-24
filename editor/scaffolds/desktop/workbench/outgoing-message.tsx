"use client";

import { useState, type ReactNode } from "react";
import { PaperclipIcon } from "lucide-react";
import type { NativeChatDisplayPart } from "@grida/desktop-bridge";
import { Message, MessageContent } from "@app/ui/ai-elements/message";
import { Button } from "@app/ui/components/button";
import { MessageContextParts } from "@/kits/agent-chat/message-context-parts";
import { UserMessageText } from "@/kits/agent-chat/message";
import { projectUserMessageSkills } from "@/kits/agent-chat/user-message-markdown";

/** The workspace transcript entry until the host confirms the send. */
export function OutgoingMessage({
  text,
  attachmentName,
  attachmentNames,
  displayParts,
  children,
}: {
  text: string;
  attachmentName?: string;
  attachmentNames?: readonly string[];
  displayParts?: readonly NativeChatDisplayPart[];
  children?: ReactNode;
}) {
  const authored = projectUserMessageSkills(text, displayParts);
  return (
    <Message from="user">
      {authored.context.length > 0 && (
        <MessageContextParts parts={authored.context} className="justify-end" />
      )}
      {(attachmentNames ?? (attachmentName ? [attachmentName] : [])).map(
        (name, index) => (
          <span
            key={index}
            className="ml-auto inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
          >
            <PaperclipIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{name}</span>
          </span>
        )
      )}
      {text && (
        <MessageContent className="text-[14px] leading-[23px] whitespace-pre-wrap">
          {authored.links.size ? (
            <UserMessageText text={authored.text} skillLinks={authored.links} />
          ) : (
            text
          )}
        </MessageContent>
      )}
      {children ?? <OutgoingMessageStatus status="sending" />}
    </Message>
  );
}

export function OutgoingMessageStatus({
  status,
  error,
  onRetry,
  onEdit,
  onDismiss,
}: {
  status: "sending" | "accepted" | "failed" | "unconfirmed";
  error?: string;
  onRetry?: () => void;
  onEdit?: () => Promise<boolean>;
  onDismiss?: () => void;
}) {
  const needsAttention = status === "failed" || status === "unconfirmed";
  const [editRefused, setEditRefused] = useState(false);
  return (
    <>
      {needsAttention ? (
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span role="status">
            {error ??
              (status === "failed"
                ? "Message wasn’t sent."
                : "Waiting for send confirmation.")}
          </span>
          {onRetry && (
            <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
              Retry
            </Button>
          )}
          {status === "failed" && onEdit && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={async () => setEditRefused(!(await onEdit()))}
            >
              Edit
            </Button>
          )}
          {status === "failed" && onDismiss && (
            <Button type="button" variant="ghost" size="xs" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      ) : status === "sending" ? (
        <span role="status" className="sr-only">
          Sending message
        </span>
      ) : null}
      {status === "failed" && editRefused && (
        <span role="status" className="ml-auto text-xs text-muted-foreground">
          Couldn't restore this message. Check that your composer is empty.
        </span>
      )}
    </>
  );
}
