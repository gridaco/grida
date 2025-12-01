"use client";

import React from "react";
import type { CanvasDesignAgentMessage } from "@/grida-canvas-hosted/ai/agent/server-agent";
import type { ToolUIPart } from "ai";
import { Spinner } from "@/components/ui/spinner";
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

type ToolItem = {
  id: string;
  name: string;
  state?: ToolUIPart["state"];
  input?: ToolUIPart["input"];
  output?: ToolUIPart["output"];
  errorText?: ToolUIPart["errorText"];
  type: ToolUIPart["type"];
};

export function UserMessage({ message, className }: BaseMessageProps) {
  const { textSegments } = parseMessageParts(message);

  let content = textSegments.join("").trim();
  if (!content) {
    const directContent = getDirectContent(message).trim();
    content = directContent;
  }

  return (
    <React.Fragment>
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
    </React.Fragment>
  );
}

export function AssistantMessage({
  message,
  isStreaming,
  className,
}: AssistantMessageProps) {
  const { textSegments, reasoningSegments, reasoningStreaming, toolMap } =
    parseMessageParts(message);

  let content = textSegments.join("").trim();
  if (!content) {
    const directContent = getDirectContent(message).trim();
    content = directContent;
  }

  let reasoningText = reasoningSegments.join("").trim();
  const reasoningIsStreaming = reasoningStreaming;

  const toolItems = Array.from(toolMap.values());

  return (
    <Message from="assistant" className={cn("w-full max-w-none", className)}>
      <div className="flex max-w-full flex-col gap-3">
        {reasoningText && (
          <Reasoning isStreaming={reasoningIsStreaming}>
            <ReasoningTrigger />
            <ReasoningContent>{reasoningText}</ReasoningContent>
          </Reasoning>
        )}

        {(content || isStreaming) && (
          <MessageContent className="w-full rounded-none border-0 px-0">
            {content ? (
              <MessageResponse>{content}</MessageResponse>
            ) : (
              <Spinner className="size-4" />
            )}
          </MessageContent>
        )}

        {toolItems.length > 0 && (
          <div className="w-full space-y-2">
            {toolItems.map((tool) => {
              const state =
                tool.state ??
                (tool.output ? "output-available" : "input-available");
              const generatedImageOutput =
                tool.name === "generateImage" &&
                tool.output &&
                isGeneratedImage(tool.output)
                  ? tool.output
                  : null;

              return (
                <Tool
                  key={tool.id}
                  defaultOpen={
                    state !== "input-streaming" &&
                    state !== "approval-requested"
                  }
                >
                  <ToolHeader
                    title={tool.name}
                    type={tool.type}
                    state={state}
                  />
                  <ToolContent>
                    {tool.input !== undefined && (
                      <ToolInput input={tool.input} />
                    )}
                    {(tool.output !== undefined || tool.errorText) && (
                      <ToolOutput
                        output={tool.output}
                        errorText={tool.errorText ?? undefined}
                      />
                    )}
                    {generatedImageOutput && (
                      <div className="p-4 pt-0">
                        <GeneratedImagePreview output={generatedImageOutput} />
                      </div>
                    )}
                  </ToolContent>
                </Tool>
              );
            })}
          </div>
        )}
      </div>
    </Message>
  );
}

function parseMessageParts(message: CanvasDesignAgentMessage) {
  const parts = Array.isArray((message as any).parts)
    ? ((message as any).parts as any[])
    : [];

  const textSegments: string[] = [];
  const reasoningSegments: string[] = [];
  let reasoningStreaming = false;
  const toolMap = new Map<string, ToolItem>();

  const ensureToolEntry = (part: any) => {
    const id =
      part.toolCallId || part.id || part.name || `tool-${toolMap.size + 1}`;
    const name = part.toolName || part.name || "tool";

    let entry = toolMap.get(id);
    if (!entry) {
      const inferredType =
        typeof part.type === "string" && part.type.startsWith("tool-")
          ? (part.type as ToolUIPart["type"])
          : (`tool-${name}` as ToolUIPart["type"]);

      entry = {
        id,
        name,
        type: inferredType,
      } as ToolItem;
      toolMap.set(id, entry);
    }

    if (part.state) {
      entry.state = part.state;
    }
    if (part.input !== undefined) {
      entry.input = part.input;
    }
    if (part.output !== undefined) {
      entry.output = part.output;
    }
    if (part.result !== undefined) {
      entry.output = part.result;
    }
    if (part.errorText) {
      entry.errorText = part.errorText;
      entry.state = part.state ?? "output-error";
    }
  };

  for (const part of parts) {
    const type = part?.type;

    switch (type) {
      case "text-start":
      case "text":
      case "text-delta":
      case "text-end":
        if (typeof part.text === "string") {
          textSegments.push(part.text);
        }
        if (typeof part.delta === "string") {
          textSegments.push(part.delta);
        }
        break;
      case "reasoning-start":
      case "reasoning":
      case "reasoning-delta":
      case "reasoning-end":
        if (typeof part.text === "string") {
          reasoningSegments.push(part.text);
        }
        if (typeof part.delta === "string") {
          reasoningSegments.push(part.delta);
        }
        if (type === "reasoning-delta" || type === "reasoning-start") {
          reasoningStreaming = true;
        }
        if (type === "reasoning-end") {
          reasoningStreaming = false;
        }
        break;
      default:
        if (type && typeof type === "string" && type.startsWith("tool")) {
          ensureToolEntry(part);
        }
        break;
    }
  }

  return { textSegments, reasoningSegments, reasoningStreaming, toolMap };
}

function getDirectContent(message: CanvasDesignAgentMessage) {
  const rawContent = (message as any).content;

  if (typeof rawContent === "string") {
    return rawContent;
  }

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
        <div className="font-medium text-foreground">🎨 Generated Image</div>
        {output.prompt && (
          <div className="text-muted-foreground">Prompt: {output.prompt}</div>
        )}
        {output.width && output.height && (
          <div className="text-muted-foreground">
            Size: {output.width} × {output.height}
          </div>
        )}
        {output.imageUrl && (
          <a
            href={output.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Open in new tab →
          </a>
        )}
      </div>
    </div>
  );
}
