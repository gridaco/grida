"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  getToolName,
  isTextUIPart,
  isToolUIPart,
  type DynamicToolUIPart,
  type TextUIPart,
  type ToolUIPart,
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
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AgentInput } from "@/grida-canvas-hosted/ai/scaffold/components/agent-input";
import { useSvgAgentChat } from "./provider";
import type { SvgEditorAgentMessage } from "./server-agent";
import { TOOL_NAMES } from "./tools";

type SvgMessagePart = NonNullable<SvgEditorAgentMessage["parts"]>[number];

export function AISvgChatPanel({ className }: { className?: string }) {
  const chat = useSvgAgentChat();
  const { messages, status, error, sendMessage, clearError } = useChat({
    chat,
  });
  const isLoading = status === "submitted" || status === "streaming";
  const [open, setOpen] = useState(true);

  const handleSend = useCallback(
    async (content: string) => {
      clearError();
      await sendMessage({ text: content });
    },
    [clearError, sendMessage]
  );

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)] rounded-xl border bg-background shadow-xl",
        "flex flex-col overflow-hidden",
        open ? "h-[600px] max-h-[calc(100vh-3rem)]" : "h-auto",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 px-4 py-3 border-b hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" />
          <span className="text-sm font-semibold">SVG Assistant</span>
        </div>
        {open ? (
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        ) : (
          <ChevronUpIcon className="size-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <>
          <Conversation className="flex-1 min-h-0">
            <ConversationContent className="gap-4 px-4 py-4">
              {messages.length === 0 ? (
                <ConversationEmptyState
                  title="Start a conversation"
                  description="Ask Claude to draw or edit the SVG. You can drag and color shapes between turns."
                  icon={<SparklesIcon className="size-6" />}
                />
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
              placeholder="Ask Claude to edit the SVG…"
              autoFocus={false}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── message views ────────────────────────────────────────────────────────

const UserMessageView = memo(function UserMessageView({
  message,
}: {
  message: SvgEditorAgentMessage;
}) {
  const text = useMemo(() => extractText(message.parts), [message.parts]);
  return (
    <Message from="user">
      <MessageContent>
        <MessageResponse>{text}</MessageResponse>
      </MessageContent>
    </Message>
  );
});

const AssistantMessageView = memo(function AssistantMessageView({
  message,
  isStreaming,
}: {
  message: SvgEditorAgentMessage;
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

function renderParts(messageId: string, parts: SvgEditorAgentMessage["parts"]) {
  const list = (parts ?? []) as ReadonlyArray<SvgMessagePart>;
  const out: React.ReactNode[] = [];
  list.forEach((part, idx) => {
    const key = `${messageId}.${idx}`;
    if (isTextUIPart(part)) {
      const node = renderTextPart(key, part);
      if (node) out.push(node);
      return;
    }
    if (isToolUIPart(part)) {
      out.push(renderToolPart(key, part));
    }
  });
  return out;
}

function renderTextPart(key: string, part: TextUIPart): React.ReactNode | null {
  const text = part.text;
  if (!text) return null;
  return (
    <MessageContent key={key} className="w-full rounded-none border-0 px-0">
      <MessageResponse>{text}</MessageResponse>
    </MessageContent>
  );
}

function renderToolPart(
  key: string,
  part: ToolUIPart | DynamicToolUIPart
): React.ReactNode {
  const toolName = getToolName(part);
  return (
    <Tool
      key={key}
      className="w-full"
      defaultOpen={part.state !== "input-streaming"}
    >
      <ToolHeader
        title={humanToolTitle(toolName)}
        type={part.type as ToolUIPart["type"]}
        state={part.state}
      />
      <ToolContent>
        {part.input !== undefined && <ToolInput input={part.input} />}
        {(part.output !== undefined || part.errorText) && (
          <ToolOutput
            output={part.output}
            errorText={part.errorText ?? undefined}
          />
        )}
      </ToolContent>
    </Tool>
  );
}

function humanToolTitle(toolName: string): string {
  if (toolName === TOOL_NAMES.read_file) return "Read SVG";
  if (toolName === TOOL_NAMES.update_file) return "Update SVG";
  return toolName;
}

function extractText(parts: SvgEditorAgentMessage["parts"]): string {
  const list = (parts ?? []) as ReadonlyArray<
    UIMessagePart<Record<string, never>, Record<string, never>>
  >;
  let out = "";
  for (const p of list) if (isTextUIPart(p)) out += p.text;
  return out;
}
