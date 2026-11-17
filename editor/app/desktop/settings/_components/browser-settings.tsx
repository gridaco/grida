"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2, RefreshCwIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { Label } from "@app/ui/components/label";
import { Browser } from "@/lib/desktop/browser";
import { workspaces } from "@/lib/desktop/bridge";
import { SettingsBrowser } from "@/lib/desktop/settings-browser";

export function BrowserSettings() {
  const [controller] = useState(
    () => new SettingsBrowser.Controller(Browser.getBridge, workspaces.list)
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  useEffect(() => {
    const refresh = () => void controller.refresh();
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      controller.cancel();
    };
  }, [controller]);
  const selected = state.workspaces.find(
    (workspace) => workspace.id === state.selectedId
  );
  const busy = state.loading || state.clearing;

  return (
    <section data-testid="settings-browser" className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Browser</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage website data for a workspace.
          </p>
        </div>
        {state.supported && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Refresh browser workspaces"
            disabled={busy}
            onClick={() => void controller.refresh()}
          >
            <RefreshCwIcon className="size-4" />
          </Button>
        )}
      </header>
      {!state.supported && !state.loading ? (
        <p className="text-sm text-muted-foreground">
          Update Desktop to manage browser data in Settings.
        </p>
      ) : (
        <div className="divide-y rounded-xl border">
          <div className="space-y-1 px-4 py-3">
            <h3 className="text-sm font-medium">Cookies and site data</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Website data is stored separately for each workspace. Clearing it
              closes that workspace’s browser pages in every window and removes
              website sign-ins, storage and cache.
            </p>
          </div>
          <div className="space-y-3 px-4 py-4">
            {state.loading && state.workspaces.length === 0 ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading workspaces…
              </p>
            ) : state.workspaces.length === 0 && !state.error ? (
              <p className="text-sm text-muted-foreground">
                Open a workspace to manage its website data.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="browser-data-workspace" className="text-xs">
                    Workspace
                  </Label>
                  <select
                    id="browser-data-workspace"
                    aria-label="Workspace for browser data"
                    value={state.selectedId ?? ""}
                    disabled={busy}
                    onChange={(event) => controller.select(event.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <option value="" disabled>
                      Choose a workspace
                    </option>
                    {state.workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name} — {workspace.root}
                      </option>
                    ))}
                  </select>
                  {selected && (
                    <p className="break-all text-xs text-muted-foreground">
                      {selected.root}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !selected}
                  onClick={() => void controller.clearSelected()}
                >
                  {state.clearing && (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                  Clear cookies and site data…
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {state.result === "cleared" && (
        <p role="status" className="text-sm text-muted-foreground">
          Cookies and site data cleared for {selected?.name}.
        </p>
      )}
      {state.result === "cancelled" && (
        <p role="status" className="text-sm text-muted-foreground">
          Clearing cancelled.
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Downloads ask where to save each file. Sensitive website permissions are
        blocked.
      </p>
    </section>
  );
}
