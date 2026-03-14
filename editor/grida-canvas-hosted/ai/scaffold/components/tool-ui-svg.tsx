"use client";

import type { ToolUIPart } from "ai";
import { CheckIcon, PenToolIcon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";

export function SvgToolUI({
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
  const svg: string | undefined = input?.svg;
  const nodeId: string | undefined = output?.node_id;
  const isRunning = state === "input-streaming" || state === "input-available";
  const isDone = state === "output-available";
  const isError = state === "output-error";

  return (
    <div className="w-full rounded-md border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
        <PenToolIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Create from SVG
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

      {/* SVG preview */}
      {svg && (
        <div className="flex items-center justify-center p-4 bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
          <div
            className="max-w-full max-h-48 [&>svg]:max-w-full [&>svg]:max-h-48 [&>svg]:w-auto [&>svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
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
