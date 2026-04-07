"use client";

import { ListTreeIcon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";
import {
  deriveToolState,
  type ToolUIOutputProps,
  type TreeOutput,
} from "./tool-ui-shared";

export function TreeToolUI({
  output,
  state,
  errorText,
}: ToolUIOutputProps<TreeOutput>) {
  const { isRunning, isDone, isError } = deriveToolState(state);
  const tree = output?.tree;

  const title = isRunning
    ? "Inspecting canvas tree..."
    : isDone
      ? "Inspected canvas tree"
      : isError
        ? "Failed to inspect tree"
        : "Inspect canvas tree";

  return (
    <div className="w-full">
      <Task defaultOpen={false}>
        <TaskTrigger title={title}>
          <div className="flex w-full cursor-pointer items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
            <ListTreeIcon className="size-3.5" />
            <span className="text-xs">
              {isRunning ? <Shimmer duration={1}>{title}</Shimmer> : title}
            </span>
          </div>
        </TaskTrigger>
        <TaskContent>
          {tree && (
            <TaskItem>
              <pre className="whitespace-pre-wrap text-xs font-mono text-muted-foreground leading-relaxed">
                {tree}
              </pre>
            </TaskItem>
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
