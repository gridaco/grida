"use client";

import { useSyncExternalStore } from "react";
import { TerminalIcon } from "lucide-react";
import type { NativeChatBackgroundProcess } from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import type { NativeBackgroundProcessController } from "@/lib/agent-chat/native-background-process-controller";

/**
 * "N running" for the chat's background processes, shown only while any run.
 * Opens their list with a Stop per running process and Stop all.
 */
export function NativeBackgroundProcesses({
  controller,
}: {
  controller: NativeBackgroundProcessController;
}) {
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  if (view.running === 0) return null;
  const stopping = (id: number) =>
    view.stopping === "all" ||
    (Array.isArray(view.stopping) && view.stopping.includes(id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          data-testid="native-background-processes"
          className="shrink-0 gap-1 px-1.5 text-muted-foreground"
          aria-label={`${view.running} background ${view.running === 1 ? "process" : "processes"} running`}
        >
          <TerminalIcon className="size-3.5" />
          <span>{view.running} running</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 p-1 text-sm">
        <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-1">
          <p className="text-xs text-muted-foreground">Background processes</p>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={!!view.stopping}
            onClick={() => void controller.stop()}
          >
            Stop all
          </Button>
        </div>
        <ul className="max-h-64 overflow-y-auto">
          {view.processes.map((process) => (
            <li
              key={process.processId}
              className="flex items-start gap-2 rounded-md px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p
                  className="truncate font-mono text-xs"
                  title={process.command}
                >
                  {process.command}
                </p>
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={process.cwd}
                >
                  {directoryTail(process.cwd)} · {status(process)}
                </p>
              </div>
              {process.state === "running" && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={!!view.stopping}
                  aria-label={`Stop ${process.command}`}
                  onClick={() => void controller.stop([process.processId])}
                >
                  {stopping(process.processId) ? "Stopping…" : "Stop"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {view.error && (
          <p role="alert" className="px-2 pb-1 text-xs text-muted-foreground">
            {view.error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function status(process: NativeChatBackgroundProcess): string {
  if (process.state === "running") return "running";
  return process.exitCode === null ? "ended" : `exited ${process.exitCode}`;
}

/** The last two segments of a directory, enough to tell projects apart. */
function directoryTail(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : cwd;
}
