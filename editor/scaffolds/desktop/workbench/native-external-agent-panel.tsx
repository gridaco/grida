"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { DesktopNativeExternalAgent } from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@app/ui/components/dialog";
import { Textarea } from "@app/ui/components/textarea";
import { NativeExternalAgentController } from "@/lib/agent-chat/native-external-agent-controller";

const DISPOSITION = {
  starting: "Starting…",
  running: "Running…",
  not_dispatched: "The request did not start.",
  succeeded: "Finished",
  failed: "The run failed.",
  cancelled: "Stopped",
  uncertain: "The result is uncertain.",
} as const;

export function NativeExternalAgentPanel({
  bridge,
}: {
  bridge: DesktopNativeExternalAgent;
}) {
  const controller = useMemo(
    () => new NativeExternalAgentController(bridge),
    [bridge]
  );
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  useEffect(() => {
    controller.connect();
    return () => controller.disconnect();
  }, [controller]);
  if (!view.status) {
    return view.error ? (
      <div className="flex shrink-0 justify-end px-3 py-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => void controller.refresh()}
        >
          Check local agent status
        </Button>
      </div>
    ) : null;
  }
  const { name, run } = view.status;
  const incomplete =
    run?.disposition === "starting" || run?.disposition === "running";
  const unverifiedCleanup =
    run &&
    !incomplete &&
    run.disposition !== "not_dispatched" &&
    !run.cleanupVerified;

  return (
    <div className="flex shrink-0 justify-end px-3 py-1">
      <Dialog
        open={view.open}
        onOpenChange={(open) => controller.setOpen(open)}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="xs">
            Local agent
          </Button>
        </DialogTrigger>
        <DialogContent
          data-testid="workspace-local-agent"
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Local agent</DialogTitle>
            <DialogDescription>
              {name} · Offline · Read-only workspace
            </DialogDescription>
          </DialogHeader>
          {run && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p role="status">
                {view.action === "stop"
                  ? "Stopping…"
                  : view.observationCurrent
                    ? DISPOSITION[run.disposition]
                    : `Last observed: ${DISPOSITION[run.disposition]}`}
              </p>
              {unverifiedCleanup && (
                <p className="text-muted-foreground">
                  Cleanup is unverified. A replacement run is unavailable.
                </p>
              )}
              {run.text && (
                <p className="max-h-56 overflow-auto whitespace-pre-wrap break-words">
                  {run.text}
                </p>
              )}
              {run.responseTruncated && (
                <p className="text-muted-foreground">
                  The response was shortened.
                </p>
              )}
            </div>
          )}
          {view.error && (
            <p role="alert" className="text-sm text-destructive">
              {view.error}
            </p>
          )}
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void controller.start();
            }}
          >
            <Textarea
              aria-label="Message for local agent"
              placeholder="What should the local agent inspect?"
              value={view.draft}
              readOnly={view.pending}
              disabled={!!view.action}
              maxLength={64 * 1024}
              onChange={(event) =>
                controller.changeDraft(event.currentTarget.value)
              }
            />
            {controller.draftTooLong && (
              <p className="text-sm text-muted-foreground">
                Use at most 64 KiB of text.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {view.error && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void controller.refresh()}
                >
                  Check status
                </Button>
              )}
              {run && incomplete && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!controller.canStop}
                  onClick={() => void controller.stop(run.runId)}
                >
                  Stop
                </Button>
              )}
              <Button type="submit" size="sm" disabled={!controller.canRun}>
                {view.action === "start"
                  ? "Starting…"
                  : view.pending
                    ? "Retry exact request"
                    : "Run"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
