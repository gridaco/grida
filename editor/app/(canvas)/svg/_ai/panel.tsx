"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import {
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type ReasoningUIPart,
  type TextUIPart,
  type UIMessagePart,
} from "ai";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  XCircleIcon,
} from "lucide-react";
import { cn } from "@/components/lib/utils/index";
import {
  FloatingWindowBody,
  FloatingWindowRoot,
  FloatingWindowTitleBar,
} from "@/components/floating-window";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AgentInput } from "@/grida-canvas-hosted/ai/scaffold/components/agent-input";
import { useContextUsage } from "@/grida-canvas-hosted/ai/scaffold/use-context-usage";
import type { AgentUIMessage } from "@/grida-canvas-hosted/ai/types";
import { useSvgAgentChat } from "./provider";
import type { AgentMessage } from "./server-agent";
import { ToolCallItem } from "./tool-call-item";
import { CreditChip } from "./credit-chip";
import { SuggestedPrompts } from "./suggested-prompts";
import { TierSelect } from "./tier-select";

type SvgMessagePart = NonNullable<AgentMessage["parts"]>[number];

const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 600;
const WINDOW_MARGIN = 24;

const markdown = {
  className: "grida-ai-response-markdown space-y-2 text-sm leading-6",
  controls: {
    code: { copy: true, download: false },
    table: { copy: true, download: false, fullscreen: false },
  },
  plugins: { cjk, code, math, mermaid },
} as const;

export function AISvgChatPanel({
  boundaryRef,
  className,
}: {
  boundaryRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const chat = useSvgAgentChat();
  const { messages, status, error, sendMessage, clearError } = useChat({
    chat,
  });
  const isLoading = status === "submitted" || status === "streaming";
  // Scopes the `SuggestedPrompts` DOM lookup to this panel — so multiple
  // panels (unlikely today, but cheap to support) wouldn't cross-pollinate.
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Token / cost / context-window aggregation across the conversation —
  // same hook the canvas chat uses. Powers the input's `ContextIndicator`.
  // AgentMessage and AgentUIMessage share the AI-SDK UIMessage
  // shape (metadata is set by the route's `messageMetadata` callback).
  const contextUsage = useContextUsage(messages as unknown as AgentUIMessage[]);

  // Defer mount until we can measure the viewport — avoids SSR/hydration
  // mismatch on `window` and anchors the panel bottom-right on first paint.
  const [initialPos, setInitialPos] = useState<{ x: number; y: number } | null>(
    null
  );
  useEffect(() => {
    setInitialPos({
      x: Math.max(
        WINDOW_MARGIN,
        window.innerWidth - WINDOW_WIDTH - WINDOW_MARGIN
      ),
      y: Math.max(
        WINDOW_MARGIN,
        window.innerHeight - WINDOW_HEIGHT - WINDOW_MARGIN
      ),
    });
  }, []);

  const handleSend = useCallback(
    async (content: string) => {
      clearError();
      await sendMessage({ text: content });
    },
    [clearError, sendMessage]
  );

  // Folded = only the title bar is visible. Chat state lives in the
  // provider above this component, so collapsing is purely presentational —
  // an in-flight stream keeps streaming, messages keep arriving.
  const [folded, setFolded] = useState(false);
  const toggleFolded = useCallback(() => setFolded((f) => !f), []);

  if (!initialPos) return null;

  return (
    <FloatingWindowRoot
      windowId="svg-ai-chat"
      boundaryRef={boundaryRef}
      initialX={initialPos.x}
      initialY={initialPos.y}
      width={WINDOW_WIDTH}
      height={folded ? undefined : WINDOW_HEIGHT}
      className={cn(
        "rounded-xl shadow-xl max-w-[calc(100vw-3rem)] max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden",
        className
      )}
    >
      {({ dragHandleProps }) => (
        <>
          <FloatingWindowTitleBar
            dragHandleProps={dragHandleProps}
            className="bg-background"
          >
            <SparklesIcon className="size-4 text-primary" />
            <span className="text-sm font-semibold">SVG Assistant</span>
            <div className="ml-auto flex items-center gap-1">
              <TierSelect />
              <CreditChip />
              <button
                type="button"
                onClick={toggleFolded}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={folded ? "Expand chat" : "Collapse chat"}
                aria-expanded={!folded}
                className="ml-1 inline-flex size-6 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                {folded ? (
                  <ChevronUpIcon className="size-4" />
                ) : (
                  <ChevronDownIcon className="size-4" />
                )}
              </button>
            </div>
          </FloatingWindowTitleBar>

          {folded ? null : (
            <FloatingWindowBody className="p-0 flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* `bodyRef` scopes SuggestedPrompts' DOM lookup of the textarea
                to this panel, and is the listening root for input events. */}
              <div
                ref={bodyRef}
                className="flex-1 min-h-0 flex flex-col overflow-hidden"
              >
                <Conversation className="flex-1 min-h-0">
                  <ConversationContent className="gap-4 px-4 py-4">
                    {messages.length === 0 ? (
                      <>
                        <ConversationEmptyState
                          title="Start a conversation"
                          description="Ask the assistant to draw or edit the SVG. You can drag and color shapes between turns."
                          icon={<SparklesIcon className="size-6" />}
                        />
                        <SuggestedPrompts panelRef={bodyRef} />
                      </>
                    ) : (
                      messages.map((m, i) => {
                        const isLast = i === messages.length - 1;
                        if (m.role === "user")
                          return <UserMessageView key={m.id} message={m} />;
                        if (m.role === "assistant")
                          return (
                            <AssistantMessageView
                              key={m.id}
                              message={m}
                              isStreaming={isLoading && isLast}
                            />
                          );
                        return null;
                      })
                    )}
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>

                {error && (
                  <div className="flex items-start gap-2 px-4 py-2 text-xs text-destructive bg-destructive/10 border-t">
                    <XCircleIcon className="size-4 shrink-0 mt-0.5" />
                    <span className="flex-1">{error.message}</span>
                    <button
                      type="button"
                      onClick={clearError}
                      className="text-destructive/70 hover:text-destructive underline"
                    >
                      dismiss
                    </button>
                  </div>
                )}

                <div className="p-3 border-t">
                  <AgentInput
                    onSend={handleSend}
                    isLoading={isLoading}
                    placeholder="Ask the assistant to edit the SVG…"
                    autoFocus={false}
                    contextUsage={contextUsage}
                  />
                </div>
              </div>
            </FloatingWindowBody>
          )}
        </>
      )}
    </FloatingWindowRoot>
  );
}

// ─── message views ────────────────────────────────────────────────────────

const UserMessageView = memo(function UserMessageView({
  message,
}: {
  message: AgentMessage;
}) {
  const text = useMemo(() => extractText(message.parts), [message.parts]);
  return (
    <Message from="user">
      <MessageContent>
        <MessageResponse plugins={markdown.plugins}>{text}</MessageResponse>
      </MessageContent>
    </Message>
  );
});

const AssistantMessageView = memo(function AssistantMessageView({
  message,
  isStreaming,
}: {
  message: AgentMessage;
  isStreaming?: boolean;
}) {
  const nodes = useMemo(
    () => renderParts(message.id, message.parts),
    [message.id, message.parts]
  );
  return (
    <Message from="assistant" className="w-full max-w-none">
      <div className="flex max-w-full flex-col gap-3">
        {nodes.length > 0
          ? nodes
          : isStreaming && (
              <Shimmer key={`${message.id}.shimmer`} className="text-xs">
                Thinking
              </Shimmer>
            )}
      </div>
    </Message>
  );
});

// ─── part rendering ──────────────────────────────────────────────────────

function renderParts(messageId: string, parts: AgentMessage["parts"]) {
  const list = (parts ?? []) as ReadonlyArray<SvgMessagePart>;
  const out: React.ReactNode[] = [];
  list.forEach((part, idx) => {
    const key = `${messageId}.${idx}`;
    if (isTextUIPart(part)) {
      const node = renderTextPart(key, part);
      if (node) out.push(node);
      return;
    }
    if (isReasoningUIPart(part)) {
      const node = renderReasoningPart(key, part);
      if (node) out.push(node);
      return;
    }
    if (isToolUIPart(part)) {
      out.push(<ToolCallItem key={key} part={part} />);
    }
  });
  return out;
}

function renderTextPart(key: string, part: TextUIPart): React.ReactNode | null {
  const text = part.text;
  if (!text) return null;
  return (
    <MessageContent key={key} className="w-full rounded-none border-0 px-0">
      <MessageResponse
        className={markdown.className}
        controls={markdown.controls}
        plugins={markdown.plugins}
      >
        {text}
      </MessageResponse>
    </MessageContent>
  );
}

function renderReasoningPart(
  key: string,
  part: ReasoningUIPart
): React.ReactNode | null {
  // Empty reasoning blocks can appear at stream start before the first
  // delta lands — don't render an empty collapsible.
  if (!part.text) return null;
  return (
    <Reasoning
      key={key}
      className="mb-0"
      defaultOpen={false}
      isStreaming={part.state === "streaming"}
    >
      <ReasoningTrigger />
      <ReasoningContent>{part.text}</ReasoningContent>
    </Reasoning>
  );
}

function extractText(parts: AgentMessage["parts"]): string {
  const list = (parts ?? []) as ReadonlyArray<
    UIMessagePart<Record<string, never>, Record<string, never>>
  >;
  let out = "";
  for (const p of list) if (isTextUIPart(p)) out += p.text;
  return out;
}
