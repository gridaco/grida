"use client";

import type { ToolUIPart } from "ai";
import { CheckIcon, TypeIcon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";

export function MarkdownToolUI({
  input,
  output,
  state,
  errorText,
}: {
  input: any;
  output: any;
  state: ToolUIPart["state"];
  errorText?: string;
}) {
  const markdown: string | undefined = input?.markdown;
  const nodeId: string | undefined = output?.node_id;
  const isRunning = state === "input-streaming" || state === "input-available";
  const isDone = state === "output-available";
  const isError = state === "output-error";

  // Truncate preview to a reasonable length
  const preview =
    markdown && markdown.length > 280
      ? markdown.slice(0, 280) + "..."
      : markdown;

  return (
    <div className="w-full rounded-md border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
        <TypeIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Create Text
        </span>
        <span className="ml-auto">
          {isRunning && (
            <Shimmer duration={1} className="text-xs">
              Creating...
            </Shimmer>
          )}
          {isDone && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <CheckIcon className="size-3" />
              Created
            </span>
          )}
          {isError && (
            <span className="text-xs text-destructive">Failed</span>
          )}
        </span>
      </div>

      {/* Text preview */}
      {preview && (
        <div className="px-3 py-2.5 border-t">
          <pre className="whitespace-pre-wrap text-xs text-foreground font-sans leading-relaxed">
            {preview}
          </pre>
        </div>
      )}

      {/* Error message */}
      {isError && errorText && (
        <div className="px-3 py-2 text-xs text-destructive bg-destructive/5 border-t">
          {errorText}
        </div>
      )}

      {/* Node link */}
      {isDone && nodeId && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-t">
          Node: <code className="font-mono">{nodeId}</code>
        </div>
      )}
    </div>
  );
}
