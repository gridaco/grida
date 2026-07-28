"use client";

/**
 * Lets a new user keep the managed default workspace or open a folder. An
 * opened folder is carried back to the welcome page as its active target.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, FolderIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { onboarding as onboardingNs } from "@/lib/desktop/bridge";
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

export function WorkspaceStep({ state, update, next }: OnboardingStepProps) {
  const [busy, setBusy] = useState(false);
  const [defaultWorkspace, setDefaultWorkspace] = useState<Workspace | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void onboardingNs
      .getDefaultWorkspace()
      .then((workspace) => {
        if (!cancelled) setDefaultWorkspace(workspace);
      })
      .catch(() => {
        if (!cancelled) setDefaultWorkspace(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openFolder = useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      const workspace = await onboardingNs.chooseWorkspace();
      if (!workspace) return;
      update({ openedWorkspace: workspace });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open folder.");
    } finally {
      setBusy(false);
    }
  }, [update]);

  const opened = state.openedWorkspace;

  return (
    <div
      data-testid="onboarding-step-workspace"
      className="flex min-h-full flex-1 flex-col gap-5"
    >
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Choose a workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          Use Grida&apos;s default workspace or open another folder.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {defaultWorkspace ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">Default workspace</span>
              <span className="truncate text-xs text-muted-foreground">
                {displayWorkspaceRoot(defaultWorkspace.root)}
              </span>
            </div>
            {!opened ? <CheckIcon className="ml-auto size-4 shrink-0" /> : null}
          </div>
        ) : null}

        {opened ? (
          <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
            <CheckIcon className="size-4 shrink-0" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{opened.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {displayWorkspaceRoot(opened.root)}
              </span>
            </div>
          </div>
        ) : null}
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
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}

      <div className="mt-auto flex justify-center pt-8">
        <Button className="w-full max-w-64" onClick={next}>
          Start creating
        </Button>
      </div>
    </div>
  );
}
