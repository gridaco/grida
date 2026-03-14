"use client";

import React from "react";
import type { CanvasDesignAgentMessage } from "@/grida-canvas-hosted/ai/agent/server-agent";
import type { ToolUIPart } from "ai";
import { Spinner } from "@/components/ui/spinner";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  useReasoning,
} from "@/components/ai-elements/reasoning";
import {
  Message,
  MessageResponse,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import Image from "next/image";
import { cn } from "@/components/lib/utils";
import { CopyIcon } from "lucide-react";

export interface BaseMessageProps {
  message: CanvasDesignAgentMessage;
  className?: string;
}

export interface AssistantMessageProps extends BaseMessageProps {
  isStreaming?: boolean;
}

// ---------------------------------------------------------------------------
// User message
// ---------------------------------------------------------------------------

export function UserMessage({ message, className }: BaseMessageProps) {
  const content = getTextFromParts(message);

  return (
    <div className="flex max-w-full flex-col gap-1 items-end">
      <Message from="user" className={className}>
        <MessageContent>
          <MessageResponse>{content}</MessageResponse>
        </MessageContent>
      </Message>
      <MessageActions>
        <MessageAction
          onClick={() => navigator.clipboard.writeText(content)}
          label="Copy"
        >
          <CopyIcon className="size-3" />
        </MessageAction>
      </MessageActions>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistant message — renders parts inline in stream order
// ---------------------------------------------------------------------------

export function AssistantMessage({
  message,
  isStreaming,
  className,
}: AssistantMessageProps) {
  const parts = Array.isArray((message as any).parts)
    ? ((message as any).parts as any[])
    : [];

  // Track whether we've seen any renderable content at all so we can show a
  // spinner for the very first streaming frame.
  let hasRenderedContent = false;

  // Group consecutive reasoning parts together so they render as a single
  // collapsible block instead of one-per-delta.
  const groupedParts = groupConsecutiveParts(parts);

  const rendered = groupedParts.map((group, groupIndex) => {
    const key = `part-${groupIndex}`;

    // ── Reasoning group ──────────────────────────────────────────────
    if (group.kind === "reasoning") {
      const reasoningText = group.items
        .map((p: any) => p.text ?? p.delta ?? "")
        .join("");
      if (!reasoningText) return null;
      hasRenderedContent = true;

      const isReasoningStreaming = group.items.some(
        (p: any) => p.type === "reasoning-delta" || p.type === "reasoning-start"
      );
      return (
        <Reasoning key={key} isStreaming={isReasoningStreaming}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoningText}</ReasoningContent>
        </Reasoning>
      );
    }

    // ── Text group ────────────────────────────────────────────────────
    if (group.kind === "text") {
      const textContent = group.items
        .map((p: any) => p.text ?? p.delta ?? "")
        .join("");
      if (!textContent) return null;
      hasRenderedContent = true;

      return (
        <MessageContent key={key} className="w-full rounded-none border-0 px-0">
          <MessageResponse>{textContent}</MessageResponse>
        </MessageContent>
      );
    }

    // ── Tool part (rendered individually) ────────────────────────────
    if (group.kind === "tool") {
      const part = group.items[0];
      hasRenderedContent = true;
      return <ToolPart key={key} part={part} />;
    }

    return null;
  });

  // If streaming but nothing rendered yet, show a loading spinner
  if (isStreaming && !hasRenderedContent) {
    rendered.push(
      <MessageContent
        key="streaming-spinner"
        className="w-full rounded-none border-0 px-0"
      >
        <Spinner className="size-4" />
      </MessageContent>
    );
  }

  return (
    <Message from="assistant" className={cn("w-full max-w-none", className)}>
      <div className="flex max-w-full flex-col gap-3">{rendered}</div>
    </Message>
  );
}

// ---------------------------------------------------------------------------
// ToolPart — renders a single tool invocation inline
// ---------------------------------------------------------------------------

function ToolPart({ part }: { part: any }) {
  const toolCallId =
    part.toolCallId || part.id || part.name || `tool-${Math.random()}`;
  const toolName = part.toolName || part.name || "tool";
  const state: ToolUIPart["state"] =
    part.state ?? (part.output ? "output-available" : "input-available");
  const type: ToolUIPart["type"] =
    typeof part.type === "string" && part.type.startsWith("tool-")
      ? part.type
      : (`tool-${toolName}` as ToolUIPart["type"]);
  const input = part.input;
  const output = part.output ?? part.result;
  const errorText = part.errorText;

  // Special rendering for generateImage tool
  const generatedImageOutput =
    toolName === "generateImage" && output && isGeneratedImage(output)
      ? output
      : null;

  return (
    <div className="w-full">
      <Tool
        defaultOpen={
          state !== "input-streaming" && state !== "approval-requested"
        }
      >
        <ToolHeader title={toolName} type={type} state={state} />
        <ToolContent>
          {input !== undefined && <ToolInput input={input} />}
          {(output !== undefined || errorText) && (
            <ToolOutput output={output} errorText={errorText ?? undefined} />
          )}
          {generatedImageOutput && (
            <div className="p-4 pt-0">
              <GeneratedImagePreview output={generatedImageOutput} />
            </div>
          )}
        </ToolContent>
      </Tool>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type GroupedPart =
  | { kind: "reasoning"; items: any[] }
  | { kind: "text"; items: any[] }
  | { kind: "tool"; items: [any] };

/**
 * Groups consecutive parts of the same kind (text or reasoning) so they
 * render as a single block, while tool parts remain individual.
 */
function groupConsecutiveParts(parts: any[]): GroupedPart[] {
  const groups: GroupedPart[] = [];

  for (const part of parts) {
    const type = part?.type;
    if (!type) continue;

    const partKind = getPartKind(type);

    if (partKind === "tool") {
      groups.push({ kind: "tool", items: [part] });
    } else if (partKind === "text" || partKind === "reasoning") {
      const last = groups[groups.length - 1];
      if (last && last.kind === partKind) {
        last.items.push(part);
      } else {
        groups.push({ kind: partKind, items: [part] });
      }
    }
    // Skip unknown part types
  }

  return groups;
}

function getPartKind(type: string): "text" | "reasoning" | "tool" | "unknown" {
  switch (type) {
    case "text-start":
    case "text":
    case "text-delta":
    case "text-end":
      return "text";
    case "reasoning-start":
    case "reasoning":
    case "reasoning-delta":
    case "reasoning-end":
      return "reasoning";
    default:
      if (typeof type === "string" && type.startsWith("tool")) {
        return "tool";
      }
      return "unknown";
  }
}

/** Extract all text from a message's parts (or fall back to .content). */
function getTextFromParts(message: CanvasDesignAgentMessage): string {
  const parts = Array.isArray((message as any).parts)
    ? ((message as any).parts as any[])
    : [];

  const texts: string[] = [];
  for (const part of parts) {
    const type = part?.type;
    if (
      type === "text" ||
      type === "text-start" ||
      type === "text-delta" ||
      type === "text-end"
    ) {
      if (typeof part.text === "string") texts.push(part.text);
      if (typeof part.delta === "string") texts.push(part.delta);
    }
  }

  const joined = texts.join("").trim();
  if (joined) return joined;

  // Fallback: read .content directly
  const rawContent = (message as any).content;
  if (typeof rawContent === "string") return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item.text === "string") return item.text;
        return "";
      })
      .join("");
  }
  return "";
}

function isGeneratedImage(output: unknown) {
  return (
    typeof output === "object" &&
    output !== null &&
    "base64" in output &&
    typeof (output as any).base64 === "string"
  );
}

function GeneratedImagePreview({ output }: { output: any }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {output.base64 && (
        <div className="relative aspect-square w-full">
          <Image
            src={`data:image/png;base64,${output.base64}`}
            alt={output.prompt || "Generated image"}
            fill
            className="object-contain"
          />
        </div>
      )}
      <div className="p-3 text-xs space-y-1">
        <div className="font-medium text-foreground">Generated Image</div>
        {output.prompt && (
          <div className="text-muted-foreground">Prompt: {output.prompt}</div>
        )}
        {output.width && output.height && (
          <div className="text-muted-foreground">
            Size: {output.width} x {output.height}
          </div>
        )}
        {output.imageUrl && (
          <a
            href={output.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Open in new tab
          </a>
        )}
      </div>
    </div>
  );
}
