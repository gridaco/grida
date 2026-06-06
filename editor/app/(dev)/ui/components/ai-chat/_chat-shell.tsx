"use client";

/**
 * Thin presentational replica of the desktop chat panel's transcript shell
 * (`scaffolds/desktop/ai-sidebar/chat.tsx`) minus the composer/picker/IPC —
 * just enough to tune the `@/kits/agent-chat` renderer at sidebar width.
 */

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@app/ui/ai-elements/conversation";
import { cn } from "@app/ui/lib/utils";
import {
  ChatMessageView,
  CompactingIndicator,
  type ChatMessage,
  type ChatMessageActions,
} from "@/kits/agent-chat";

export function DemoChatShell({
  messages,
  isStreaming,
  compacting,
  error,
  onDismissError,
  className,
  actions,
}: {
  messages: ChatMessage[];
  isStreaming: boolean;
  /** Show the in-flight compaction shimmer at the transcript tail. */
  compacting?: boolean;
  error?: Error;
  onDismissError: () => void;
  className?: string;
  /** Per-turn rewind/branch affordances under user bubbles (demo). */
  actions?: ChatMessageActions;
}) {
  return (
    <div
      data-testid="demo-ai-chat-shell"
      className={cn(
        "flex h-[600px] w-96 flex-col overflow-hidden rounded-lg border bg-background",
        className
      )}
    >
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="gap-4 px-3 py-4">
          {messages.map((m, i) => (
            <ChatMessageView
              key={m.id}
              message={m}
              isStreaming={isStreaming && i === messages.length - 1}
              actions={m.role === "user" ? actions : undefined}
            />
          ))}
          {compacting && <CompactingIndicator />}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {error && (
        <div className="flex items-start gap-2 border-t bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="flex-1">{error.message}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="text-destructive/70 underline hover:text-destructive"
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}
