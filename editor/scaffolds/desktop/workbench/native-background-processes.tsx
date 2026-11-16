"use client";

import { useSyncExternalStore } from "react";
import { LoaderCircleIcon, SquareIcon } from "lucide-react";
import type { NativeChatBackgroundProcess } from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import type { NativeBackgroundProcessController } from "@/lib/agent-chat/native-background-process-controller";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@app/ui/components/tooltip";

/** The selected chat’s retained processes, presented in Workspace utilities. */
export function NativeBackgroundProcessList({
  controller,
  expanded = false,
  heading = true,
}: {
  controller: NativeBackgroundProcessController;
  expanded?: boolean;
  /** A containing tab can supply the visible heading. */
  heading?: boolean;
}) {
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const stopping = (id: number) =>
    view.stopping === "all" ||
    (Array.isArray(view.stopping) && view.stopping.includes(id));
  return (
    <TooltipProvider delayDuration={200}>
      <section
        data-testid="native-background-process-list"
        aria-label="Background processes for this chat"
      >
        {(heading || view.running > 0) && (
          <div className="flex items-center justify-end gap-2 px-2 pt-1 pb-1">
            {heading && (
              <p className="mr-auto text-xs text-muted-foreground">
                Background processes
              </p>
            )}
            {view.running > 0 && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={!!view.stopping}
                onClick={() => void controller.stop()}
              >
                Stop all
              </Button>
            )}
          </div>
        )}
        {view.processes.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            No processes yet.
          </p>
        )}
        <ul className={expanded ? undefined : "max-h-64 overflow-y-auto"}>
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground"
                      disabled={!!view.stopping}
                      aria-label={`Stop ${process.command}`}
                      aria-busy={stopping(process.processId)}
                      onClick={() => void controller.stop([process.processId])}
                    >
                      {stopping(process.processId) ? (
                        <LoaderCircleIcon
                          className="size-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <SquareIcon
                          className="size-3 fill-current"
                          aria-hidden="true"
                        />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {stopping(process.processId) ? "Stopping…" : "Stop process"}
                  </TooltipContent>
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
        {view.error && (
          <p role="alert" className="px-2 pb-1 text-xs text-muted-foreground">
            {view.error}
          </p>
        )}
      </section>
    </TooltipProvider>
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
