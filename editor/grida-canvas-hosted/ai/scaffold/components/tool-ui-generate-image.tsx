"use client";

import { CheckIcon, ImageIcon } from "lucide-react";

import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  deriveToolState,
  type ToolUIProps,
  type GenerateImageInput,
  type GenerateImageOutput,
} from "./tool-ui-shared";

export function GenerateImageToolUI({
  input,
  output,
  state,
  errorText,
}: ToolUIProps<GenerateImageInput, GenerateImageOutput>) {
  const { isRunning, isDone, isError } = deriveToolState(state);

  return (
    <div className="w-full rounded-md border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
        <ImageIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Generate Image
        </span>
        <span className="ml-auto">
          {isRunning && (
            <Shimmer duration={1} className="text-xs">
              Generating...
            </Shimmer>
          )}
          {isDone && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <CheckIcon className="size-3" />
              Generated
            </span>
          )}
          {isError && (
            <span className="text-xs text-destructive">Failed</span>
          )}
        </span>
      </div>

      {/* Prompt */}
      {input?.prompt && (
        <div className="px-3 py-2 border-t text-xs text-muted-foreground">
          {input.prompt}
        </div>
      )}

      {/* Image preview */}
      {isDone && output?.publicUrl && (
        <div className="border-t">
          <div className="relative aspect-square w-full max-h-64">
            <picture>
              <img
                src={output.publicUrl}
                alt={input?.prompt || "Generated image"}
                className="w-full h-full object-contain"
              />
            </picture>
          </div>
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-t flex items-center gap-3">
            {output.width && output.height && (
              <span>
                {output.width} x {output.height}
              </span>
            )}
            {output.modelId && (
              <span className="font-mono">{output.modelId}</span>
            )}
          </div>
        </div>
      )}

      {/* Legacy base64 preview */}
      {isDone && !output?.publicUrl && output?.base64 && (
        <div className="border-t">
          <div className="relative aspect-square w-full max-h-64">
            <picture>
              <img
                src={`data:image/png;base64,${output.base64}`}
                alt={input?.prompt || "Generated image"}
                className="w-full h-full object-contain"
              />
            </picture>
          </div>
        </div>
      )}

      {/* Error */}
      {isError && errorText && (
        <div className="px-3 py-2 text-xs text-destructive bg-destructive/5 border-t">
          {errorText}
        </div>
      )}
    </div>
  );
}
