"use client";

import { LayoutGridIcon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";
import { deriveToolState, type ToolUIOutputProps } from "./tool-ui-shared";

/** Artboard sizes output is a record of category → array of size entries. */
type ArtboardSizesOutput = Record<string, unknown[]>;

export function ArtboardSizesToolUI({
  output,
  state,
  errorText,
}: ToolUIOutputProps<ArtboardSizesOutput>) {
  const { isRunning, isDone, isError } = deriveToolState(state);

  // Count total artboard entries across all categories
  let totalCount = 0;
  if (isDone && output && typeof output === "object") {
    for (const category of Object.values(output)) {
      if (Array.isArray(category)) {
        totalCount += category.length;
      }
    }
  }

  const title = isRunning
    ? "Fetching artboard sizes..."
    : isDone
      ? `Fetched ${totalCount} artboard sizes`
      : isError
        ? "Failed to fetch artboard sizes"
        : "Fetch artboard sizes";

  return (
    <div className="w-full">
      <Task defaultOpen={false}>
        <TaskTrigger title={title}>
          <div className="flex w-full cursor-pointer items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
            <LayoutGridIcon className="size-3.5" />
            <span className="text-xs">
              {isRunning ? <Shimmer duration={1}>{title}</Shimmer> : title}
            </span>
          </div>
        </TaskTrigger>
        <TaskContent>
          {isDone && output && typeof output === "object" && (
            <div className="space-y-2">
              {Object.entries(output).map(([category, sizes]) => {
                if (!Array.isArray(sizes)) return null;
                return (
                  <TaskItem key={category}>
                    <span className="text-xs font-medium capitalize">
                      {category}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({sizes.length})
                    </span>
                  </TaskItem>
                );
              })}
            </div>
          )}
          {isError && errorText && (
            <TaskItem>
              <span className="text-xs text-destructive">{errorText}</span>
            </TaskItem>
          )}
        </TaskContent>
      </Task>
    </div>
  );
}
