/**
 * /desktop/workspace — VSCode-style workspace workbench surface.
 *
 * Home can hand off a workspace it has just resolved. Direct navigation
 * resolves the workspace ID against `bridge.workspaces.list()`.
 * Misses surface a friendly "workspace not found" message with a
 * link back to /desktop/welcome so the user can re-open the folder.
 *
 * Why a query param and not a path segment: workspace ids are
 * URL-safe but visually noisy (16 hex chars) and we don't want them
 * indexed by Next.js's typed-routes machinery; the welcome page also
 * just appends `?id=...` rather than building a typed `Link` to a
 * dynamic segment. If we ever want shareable workspace URLs we can
 * promote later.
 *
 * GRIDA-SEC-004 — like every page under `/desktop/*`, this surface
 * is gated by `DesktopBridgeGate` (in the desktop layout) so it
 * only renders inside the Electron renderer. The bridge is the
 * authoritative source of "what workspaces exist" — the services sidecar
 * owns `workspaces.json`.
 */
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FolderXIcon } from "lucide-react";
import {
  getDesktopBridge,
  workspaces as workspacesNs,
  type Workspace,
} from "@/lib/desktop/bridge";
import { Button } from "@app/ui/components/button";
import { WorkspaceWorkbench } from "@/scaffolds/desktop/workbench/workspace-workbench";
import { WorkspaceOpening } from "@/scaffolds/desktop/workbench/workspace-workbench-url";

export default function DesktopWorkspacePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <WorkspacePageInner />
    </Suspense>
  );
}

function WorkspacePageInner() {
  const params = useSearchParams();
  const workspaceId = params.get("id");
  return (
    <WorkspaceRoute
      key={workspaceId}
      workspaceId={workspaceId}
      initialActiveRelPath={params.get("path") ?? undefined}
    />
  );
}

function WorkspaceRoute({
  workspaceId,
  initialActiveRelPath,
}: {
  workspaceId: string | null;
  initialActiveRelPath?: string;
}) {
  const [opening] = useState(() => WorkspaceOpening.peek(workspaceId));
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; workspace: Workspace }
    | { kind: "not-found" }
    | { kind: "bridge-missing" }
    | { kind: "error"; message: string }
  >(() =>
    opening ? { kind: "ready", workspace: opening } : { kind: "loading" }
  );

  const resolve = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setState({ kind: "bridge-missing" });
      return;
    }
    if (!workspaceId) {
      setState({ kind: "not-found" });
      return;
    }
    try {
      const list = await workspacesNs.list();
      const found = list.find((w) => w.id === workspaceId);
      if (!found) {
        setState({ kind: "not-found" });
        return;
      }
      setState({ kind: "ready", workspace: found });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Couldn't load workspaces.",
      });
    }
  }, [workspaceId]);

  useEffect(() => {
    if (opening) WorkspaceOpening.arrived(opening);
    else void resolve();
  }, [resolve, opening]);

  if (state.kind === "loading" || state.kind === "bridge-missing") {
    return <LoadingScreen />;
  }
  if (state.kind === "not-found") {
    return <NotFoundScreen />;
  }
  if (state.kind === "error") {
    return <ErrorScreen message={state.message} onRetry={resolve} />;
  }
  return (
    <WorkspaceWorkbench
      key={`${state.workspace.id}:${initialActiveRelPath ?? ""}`}
      workspace={state.workspace}
      initialActiveRelPath={initialActiveRelPath}
    />
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-svh items-center justify-center text-xs text-muted-foreground">
      Loading workspace…
    </div>
  );
}

function NotFoundScreen() {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <FolderXIcon className="size-10 text-muted-foreground" />
      <div>
        <h1 className="text-base font-semibold">Workspace not found</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          That workspace id isn't in the registry. It may have been forgotten,
          or you came here from a stale link.
        </p>
      </div>
      <Link href="/desktop/welcome" className="inline-block">
        <Button size="sm">Back to welcome</Button>
      </Link>
    </div>
  );
}

function ErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-base font-semibold text-destructive">
        Couldn't open workspace
      </h1>
      <p className="text-xs text-muted-foreground">{message}</p>
      <Button size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
