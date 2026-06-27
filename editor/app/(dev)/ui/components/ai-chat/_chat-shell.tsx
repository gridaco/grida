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
  PendingTurnIndicator,
  QuestionCard,
  findPendingQuestion,
  type AnswerQuestionHandler,
  type ChatMessage,
  type ChatMessageActions,
} from "@/kits/agent-chat";

export function DemoChatShell({
  messages,
  isStreaming,
  compacting,
  pending,
  error,
  onDismissError,
  className,
  actions,
  onAnswerQuestion,
}: {
  messages: ChatMessage[];
  isStreaming: boolean;
  /** Show the in-flight compaction shimmer at the transcript tail. */
  compacting?: boolean;
  /** Force the pre-first-token "Thinking" indicator (static showcase). */
  pending?: boolean;
  error?: Error;
  onDismissError: () => void;
  className?: string;
  /** Per-turn rewind/branch affordances under user bubbles (demo). */
  actions?: ChatMessageActions;
  /** Commit a `question` answer (demo wires this to `chat.addToolResult`). */
  onAnswerQuestion?: AnswerQuestionHandler;
}) {
  // Mirrors the desktop surfaces: a turn is streaming but no assistant turn has
  // begun. The `pending` prop forces it for the static showcase scenario.
  const pendingTurn =
    pending || (isStreaming && messages.at(-1)?.role !== "assistant");
  // The agent's open question is session-global — pinned above the composer
  // slot, not rendered in the transcript (mirrors the desktop surfaces).
  const pendingQuestion = findPendingQuestion(messages);
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
          {pendingTurn && <PendingTurnIndicator />}
          {compacting && <CompactingIndicator />}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {pendingQuestion && onAnswerQuestion && (
        <div className="shrink-0 border-t p-3">
          <QuestionCard entry={pendingQuestion} onAnswer={onAnswerQuestion} />
        </div>
      )}

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
