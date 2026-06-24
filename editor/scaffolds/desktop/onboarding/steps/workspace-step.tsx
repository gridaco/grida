"use client";

/**
 * Step 3 — open a workspace. Reuses the same native-dialog + openFolder flow as
 * the welcome page; the opened workspace is stashed in onboarding state so the
 * finish step can name it and the welcome composer targets it afterwards.
 * Skippable — Next advances even without opening one.
 */

import { useCallback, useState } from "react";
import { CheckIcon, FolderIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@app/ui/components/dialog";
import {
  getDesktopBridge,
  workspaces as workspacesNs,
} from "@/lib/desktop/bridge";
import type { OnboardingStepProps } from "../types";

export function WorkspaceStep({ state, update }: OnboardingStepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFolder = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    try {
      setBusy(true);
      setError(null);
      // `createDirectory` surfaces the macOS "New Folder" button; macOS-only,
      // safely ignored elsewhere (mirrors the welcome page).
      const paths = await bridge.dialog.open({
        properties: ["openDirectory", "createDirectory"],
      });
      if (!paths || paths.length === 0) return;
      const ws = await workspacesNs.openFolder(paths[0]);
      update({ openedWorkspace: ws });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open folder.");
    } finally {
      setBusy(false);
    }
  }, [update]);

  const opened = state.openedWorkspace;

  return (
    <div
      data-testid="onboarding-step-workspace"
      className="flex flex-col gap-5"
    >
      <DialogHeader>
        <DialogTitle>Open a workspace</DialogTitle>
        <DialogDescription>
          Grida works inside a folder on your machine.
        </DialogDescription>
      </DialogHeader>

      {opened ? (
        <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
          <CheckIcon className="size-4 shrink-0" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{opened.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {opened.root}
            </span>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => void openFolder()}
          disabled={busy}
          className="self-start"
        >
          <FolderIcon />
          {busy ? "Opening…" : "Open folder…"}
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
