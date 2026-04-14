"use client";

import type { CanvasDesignAgentMessage } from "@/grida-canvas-hosted/ai/agent/server-agent";
import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai";

/**
 * The AI SDK streams parts with types like "text-delta", "reasoning-delta",
 * "reasoning-start" etc that are not included in the finalized `UIMessagePart`
 * union. This local type covers both finalized and streaming part shapes.
 */
interface StreamingMessagePart {
  type: string;
  text?: string;
  delta?: string;
  [key: string]: unknown;
}

/**
 * `ToolUIPart` with default `UITools` can resolve to `never` in some TS
 * versions. This structural type covers the fields accessed at runtime.
 */
interface ToolPartData {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  input: unknown;
  output: unknown;
  errorText?: string;
}
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
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
import { canvas_use } from "@/grida-canvas-hosted/ai/tools/canvas-use";
import { CopyIcon } from "lucide-react";
import { cn } from "@/components/lib/utils";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { SvgToolUI } from "./tool-ui-svg";
import { TreeToolUI } from "./tool-ui-tree";
import { ArtboardSizesToolUI } from "./tool-ui-artboard-sizes";
import { GenerateImageToolUI } from "./tool-ui-generate-image";
import { MarkdownToolUI } from "./tool-ui-markdown";
import type {
  SvgInput,
  SvgOutput,
  TreeOutput,
  MarkdownInput,
  MarkdownOutput,
  GenerateImageInput,
  GenerateImageOutput,
} from "./tool-ui-shared";

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
  const msg = message as CanvasDesignAgentMessage & {
    parts?: StreamingMessagePart[];
    content?: string | { text?: string }[];
  };
  const parts: StreamingMessagePart[] = Array.isArray(msg.parts)
    ? msg.parts
    : [];

  // Group consecutive reasoning / text parts so they render as single blocks
  // instead of one-per-delta, while tool parts stay individual.
  const groupedParts = groupConsecutiveParts(parts);

  // Whether any group has renderable content (for showing shimmer on first streaming frame).
  const hasRenderedContent = groupedParts.some((group) => {
    if (group.kind === "reasoning") {
      const text = group.items
        .map((p: StreamingMessagePart) => p.text ?? p.delta ?? "")
        .join("");
      return !!text;
    }
    if (group.kind === "text") {
      const text = group.items
        .map((p: StreamingMessagePart) => p.text ?? p.delta ?? "")
        .join("");
      return !!text;
    }
    if (group.kind === "tool") return true;
    return false;
  });

  const rendered = groupedParts.map((group, groupIndex) => {
    const key = `part-${groupIndex}`;

    // ── Reasoning group ──────────────────────────────────────────────
    if (group.kind === "reasoning") {
      const reasoningText = group.items
        .map((p: StreamingMessagePart) => p.text ?? p.delta ?? "")
        .join("");
      if (!reasoningText) return null;

      // Reasoning is streaming if:
      //  a) the parts themselves are still delta/start types, OR
      //  b) the overall message is still streaming and nothing else
      //     (text or tool) follows this reasoning group — meaning the
      //     reasoning block is still the active stream frontier.
      const hasDeltaParts = group.items.some(
        (p: StreamingMessagePart) =>
          p.type === "reasoning-delta" || p.type === "reasoning-start"
      );
      const isLastGroup = groupIndex === groupedParts.length - 1;
      const nothingFollows =
        isLastGroup ||
        groupedParts.slice(groupIndex + 1).every((g) => g.kind === "reasoning");
      const isReasoningStreaming =
        hasDeltaParts || (!!isStreaming && nothingFollows);

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
        .map((p: StreamingMessagePart) => p.text ?? p.delta ?? "")
        .join("");
      if (!textContent) return null;

      return (
        <MessageContent key={key} className="w-full rounded-none border-0 px-0">
          <MessageResponse>{textContent}</MessageResponse>
        </MessageContent>
      );
    }

    // ── Tool part (rendered individually) ────────────────────────────
    if (group.kind === "tool") {
      const part = group.items[0];
      return <ToolPart key={key} part={part} />;
    }

    return null;
  });

  // If streaming but nothing rendered yet, show shimmer
  if (isStreaming && !hasRenderedContent) {
    rendered.push(
      <Shimmer key="streaming-planning" className="text-xs">
        Planning next moves
      </Shimmer>
    );
  }

  return (
    <Message from="assistant" className={cn("w-full max-w-none", className)}>
      <div className="flex max-w-full flex-col gap-3">{rendered}</div>
    </Message>
  );
}

// ---------------------------------------------------------------------------
// ToolPart — dispatches to custom UIs or falls back to generic Tool chrome
// ---------------------------------------------------------------------------

function ToolPart({ part }: { part: ToolPartData }) {
  const toolName = getToolName(part as DynamicToolUIPart);
  const state: DynamicToolUIPart["state"] =
    (part.state as DynamicToolUIPart["state"]) ??
    (part.output ? "output-available" : "input-available");
  const errorText: string | undefined = part.errorText;

  // ── Custom tool UIs ────────────────────────────────────────────────
  // ToolUIPart.input/output are `unknown`; each tool UI expects specific
  // types so we cast at the dispatch boundary.
  switch (toolName) {
    case canvas_use.tools_spec.name_make_from_svg:
      return (
        <SvgToolUI
          input={part.input as SvgInput}
          output={part.output as SvgOutput | undefined}
          state={state}
          errorText={errorText}
        />
      );
    case canvas_use.tools_spec.name_tree:
      return (
        <TreeToolUI
          output={part.output as TreeOutput | undefined}
          state={state}
          errorText={errorText}
        />
      );
    case canvas_use.tools_spec.name_data_artboard_sizes:
      return (
        <ArtboardSizesToolUI
          output={part.output as Record<string, unknown[]> | undefined}
          state={state}
          errorText={errorText}
        />
      );
    case canvas_use.tools_spec.name_make_from_markdown:
      return (
        <MarkdownToolUI
          input={part.input as MarkdownInput}
          output={part.output as MarkdownOutput | undefined}
          state={state}
          errorText={errorText}
        />
      );
    case canvas_use.tools_spec.name_platform_sys_tool_ai_generate_image:
      return (
        <GenerateImageToolUI
          input={part.input as GenerateImageInput}
          output={part.output as GenerateImageOutput | undefined}
          state={state}
          errorText={errorText}
        />
      );
  }

  // ── Generic fallback ───────────────────────────────────────────────
  return (
    <div className="w-full">
      <Tool
        defaultOpen={
          state !== "input-streaming" && state !== "approval-requested"
        }
      >
        <ToolHeader
          title={toolName}
          type={part.type as unknown as ToolUIPart["type"]}
          state={state as unknown as ToolUIPart["state"]}
        />
        <ToolContent>
          {part.input !== undefined && <ToolInput input={part.input} />}
          {(part.output !== undefined || errorText) && (
            <ToolOutput
              output={part.output}
              errorText={errorText ?? undefined}
            />
          )}
        </ToolContent>
      </Tool>
    </div>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

type GroupedPart =
  | { kind: "reasoning"; items: StreamingMessagePart[] }
  | { kind: "text"; items: StreamingMessagePart[] }
  | { kind: "tool"; items: [ToolPartData] };

/**
 * Groups consecutive parts of the same kind (text or reasoning) so they
 * render as a single block, while tool parts remain individual.
 */
function groupConsecutiveParts(parts: StreamingMessagePart[]): GroupedPart[] {
  const groups: GroupedPart[] = [];

  for (const part of parts) {
    const type = part?.type;
    if (!type) continue;

    const partKind = getPartKind(type);

    if (partKind === "tool") {
      groups.push({ kind: "tool", items: [part as unknown as ToolPartData] });
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
  const msg = message as CanvasDesignAgentMessage & {
    parts?: StreamingMessagePart[];
    content?: string | { text?: string }[];
  };
  const parts: StreamingMessagePart[] = Array.isArray(msg.parts)
    ? msg.parts
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
  const rawContent = msg.content;
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
