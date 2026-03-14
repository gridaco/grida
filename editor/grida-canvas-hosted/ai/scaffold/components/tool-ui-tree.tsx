"use client";

import type { ToolUIPart } from "ai";
import { ListTreeIcon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";

export function TreeToolUI({
  output,
  state,
  errorText,
}: {
  output: any;
  state: ToolUIPart["state"];
  errorText?: string;
}) {
  const tree: string | undefined = output?.tree;
  const isRunning = state === "input-streaming" || state === "input-available";
  const isDone = state === "output-available";
  const isError = state === "output-error";

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
