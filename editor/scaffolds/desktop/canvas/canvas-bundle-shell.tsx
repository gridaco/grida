/**
 * Branch a `.canvas` bundle to its editor surface by the manifest's `editor`
 * axis — `"board"` → the infinite-canvas {@link DesktopBoardShell}, everything
 * else (`"slides"`/`"unknown"`) → the slides {@link DesktopCanvasShell}.
 *
 * The `editor` type is only known after reading `.canvas.json`, so this does a
 * lightweight `dotcanvas.read` on mount and shows a brief opening state until it
 * resolves. (Nothing read the `editor` field before this — the desktop host was
 * hardcoded to slides.)
 */

"use client";

import { useEffect, useState } from "react";
import { dotcanvas } from "dotcanvas";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import { workspaceBundleFs } from "./workspace-bundle-fs";
import { DesktopCanvasShell } from "./canvas-shell";
import { DesktopBoardShell } from "./board-shell";

export function DesktopCanvasBundleShell({
  workspaceId,
  basePath = "",
  active,
}: {
  workspaceId: string;
  basePath?: string;
  /** Slides-only: gates the deck's Cmd+S when embedded as an inactive tab. The
   *  board host auto-persists, so it ignores this. */
  active?: boolean;
}) {
  const [editor, setEditor] = useState<dotcanvas.EditorType | null>(null);

  useEffect(() => {
    let live = true;
    void dotcanvas
      .read(workspaceBundleFs(workspaceId, workspacesNs, basePath))
      .then((c) => {
        if (live) setEditor(c.editor);
      })
      .catch(() => {
        if (live) setEditor("unknown");
      });
    return () => {
      live = false;
    };
  }, [workspaceId, basePath]);

  if (editor === null) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Opening…
      </div>
    );
  }
  if (editor === "board") {
    return <DesktopBoardShell workspaceId={workspaceId} basePath={basePath} />;
  }
  return (
    <DesktopCanvasShell
      workspaceId={workspaceId}
      basePath={basePath}
      active={active}
    />
  );
}
