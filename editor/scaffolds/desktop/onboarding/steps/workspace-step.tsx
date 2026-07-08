"use client";

/**
 * Step 3 — open a workspace. Reuses the same native-dialog + openFolder flow as
 * the welcome page; the opened workspace is stashed in onboarding state so the
 * finish step can name it and the welcome composer targets it afterwards.
 * Skippable — Next advances even without opening one.
 */

import { useCallback, useEffect, useState } from "react";
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
import type { Workspace } from "@/lib/desktop/bridge";
import type { OnboardingStepProps } from "../types";

function displayWorkspaceRoot(root: string): string {
  return root
    .replace(/^\/Users\/[^/]+\/Documents\/Grida(?=\/|$)/, "~/Documents/Grida")
    .replace(/^\/home\/[^/]+\/Documents\/Grida(?=\/|$)/, "~/Documents/Grida")
    .replace(
      /^[A-Z]:\\Users\\[^\\]+\\Documents\\Grida(?=\\|$)/i,
      "~/Documents/Grida"
    );
}

export function WorkspaceStep({ state, update }: OnboardingStepProps) {
  const [busy, setBusy] = useState(false);
  const [defaultWorkspace, setDefaultWorkspace] = useState<Workspace | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void workspacesNs
      .getDefault()
      .then((ws) => {
        if (!cancelled) setDefaultWorkspace(ws);
      })
      .catch(() => {
        if (!cancelled) setDefaultWorkspace(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          Grida uses a default workspace, or you can open another folder.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        {defaultWorkspace && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">Default workspace</span>
              <span className="truncate text-xs text-muted-foreground">
                {displayWorkspaceRoot(defaultWorkspace.root)}
              </span>
            </div>
            {!opened && <CheckIcon className="ml-auto size-4 shrink-0" />}
          </div>
        )}

        {opened && (
          <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
            <CheckIcon className="size-4 shrink-0" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{opened.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {displayWorkspaceRoot(opened.root)}
              </span>
            </div>
          </div>
        )}
      </div>

      <Button
        variant="link"
        size="sm"
        onClick={() => void openFolder()}
        disabled={busy}
        className="h-auto self-start p-0 text-xs"
      >
        {busy ? "Opening…" : opened ? "Change folder…" : "Open another folder…"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
