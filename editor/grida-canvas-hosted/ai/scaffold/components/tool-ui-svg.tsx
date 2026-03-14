"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";
import { CheckIcon, PenToolIcon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  deriveToolState,
  type ToolUIProps,
  type SvgInput,
  type SvgOutput,
} from "./tool-ui-shared";

export function SvgToolUI({
  input,
  output,
  state,
  errorText,
}: ToolUIProps<SvgInput, SvgOutput>) {
  const { isRunning, isDone, isError } = deriveToolState(state);
  const name = input?.name;
  const svg = input?.svg;
  const nodeId = output?.node_id;

  // Sanitize SVG to prevent XSS (strips scripts, event handlers, foreignObject)
  const sanitizedSvg = useMemo(() => {
    if (!svg) return undefined;
    return DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ["use"],
    });
  }, [svg]);

  return (
    <div className="w-full rounded-md border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
        <PenToolIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {name || "Create from SVG"}
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
      {sanitizedSvg && (
        <div className="flex items-center justify-center p-4 bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
          <div
            className="max-w-full max-h-48 [&>svg]:max-w-full [&>svg]:max-h-48 [&>svg]:w-auto [&>svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
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
