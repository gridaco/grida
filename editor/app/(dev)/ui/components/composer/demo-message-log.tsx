"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { FileIcon } from "lucide-react";
import { useState } from "react";
import type { ComposerMessage, ComposerPart } from "@/kits/composer";

type MessageViewMode = "ui" | "raw";
export type DemoMessage = ComposerMessage & { demo_id: string };

export function MessageLog({ messages }: { messages: DemoMessage[] }) {
  const [mode, setMode] = useState<MessageViewMode>("ui");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-sm">Submitted messages</h2>
          <MessageViewToggle mode={mode} setMode={setMode} />
        </div>
      </div>
      <Conversation className="min-h-0">
        <ConversationContent className="gap-3 p-4 pt-0">
          {messages.length === 0 ? (
            <ConversationEmptyState
              className="min-h-48 rounded-md border border-dashed border-border p-6"
              description="Submitted multipart messages will appear here."
              title="No submitted messages"
            />
          ) : (
            messages.map((message) =>
              mode === "raw" ? (
                <pre
                  className="overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-xs"
                  key={message.demo_id}
                >
                  {JSON.stringify(message, null, 2)}
                </pre>
              ) : (
                <MessageBubble key={message.demo_id} message={message} />
              )
            )
          )}
        </ConversationContent>
        <ConversationScrollButton className="bottom-3" />
      </Conversation>
    </div>
  );
}

function MessageViewToggle({
  mode,
  setMode,
}: {
  mode: MessageViewMode;
  setMode: (mode: MessageViewMode) => void;
}) {
  return (
    <div className="flex rounded-md bg-muted p-0.5 text-xs">
      {(["ui", "raw"] as const).map((value) => (
        <button
          aria-pressed={mode === value}
          className={`rounded px-2 py-1 ${
            mode === value
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
          key={value}
          onClick={() => setMode(value)}
          type="button"
        >
          {value === "ui" ? "UI" : "Raw"}
        </button>
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: DemoMessage }) {
  const attachments = message.parts.filter(isMessageAttachmentPart);
  const text = messageText(message.parts);

  return (
    <div className="ml-auto flex max-w-[85%] flex-col items-end gap-2">
      {text && (
        <article className="rounded-md bg-muted/60 px-3 py-2 text-sm">
          <span className="whitespace-pre-wrap break-words">{text}</span>
        </article>
      )}
      {attachments.length > 0 && <MessageAttachmentCards parts={attachments} />}
    </div>
  );
}

function messageText(parts: ComposerPart[]): string {
  return parts
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "command") {
        return `/${part.id}`;
      }
      if (part.type === "mention") return `@${part.target.label}`;
      if (part.type === "file-ref") return part.ref.name ?? part.ref.path;
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

function MessageAttachmentCards({
  parts,
}: {
  parts: Extract<ComposerPart, { type: "file-attachment" }>[];
}) {
  return (
    <div className="flex max-w-full flex-wrap justify-end gap-2">
      {parts.map((part, index) => (
        <MessageAttachmentCard key={`${part.name}-${index}`} part={part} />
      ))}
    </div>
  );
}

function MessageAttachmentCard({
  part,
}: {
  part: Extract<ComposerPart, { type: "file-attachment" }>;
}) {
  return (
    <span className="inline-flex max-w-48 items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-muted-foreground text-xs shadow-xs">
      <FileIcon className="size-3" />
      <span className="truncate">{part.name}</span>
    </span>
  );
}

function isMessageAttachmentPart(
  part: ComposerPart
): part is Extract<ComposerPart, { type: "file-attachment" }> {
  return part.type === "file-attachment";
}
