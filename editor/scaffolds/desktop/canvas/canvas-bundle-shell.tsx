/**
 * Branch a `.canvas` bundle to its editor surface by the manifest's `editor`
 * axis — `"board"` → the infinite-canvas {@link DesktopBoardShell}, everything
 * else (`"slides"`/`"unknown"`) → the slides {@link DesktopCanvasShell}.
 *
 * The `editor` type is only known after reading `.canvas.json`, so this does a
 * lightweight `dotcanvas.read` on mount and shows a brief opening state until it
 * resolves. It also re-reads when `.canvas.json` changes on disk, so an agent (or
 * the user) flipping a bundle between `"slides"` and `"board"` swaps the surface
 * without a reopen — and a transient read failure that fell back to `"unknown"`
 * recovers on the next write. (Nothing read the `editor` field before this — the
 * desktop host was hardcoded to slides.)
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dotcanvas } from "dotcanvas";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import { useWorkspaceChanges } from "../workbench/workspace-changes";
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

  // Re-readable so both mount and a manifest change go through one path. On a
  // read failure we only fall back to "unknown" when we have no editor yet — a
  // transient failure after a good read keeps the current surface rather than
  // flipping it out from under the user.
  //
  // A monotonic request id makes only the LATEST read authoritative: two reads
  // in flight (rapid manifest flips, or a change firing while the mount read is
  // pending) resolve in promise order, not issue order, so without this an older
  // read could `setEditor` last and settle the surface on a stale editor. The
  // mount effect's cleanup bumps the counter too, cancelling any in-flight read
  // on unmount / dep change.
  const reqRef = useRef(0);
  const readEditor = useCallback(() => {
    const id = ++reqRef.current;
    void dotcanvas
      .read(workspaceBundleFs(workspaceId, workspacesNs, basePath))
      .then((c) => {
        if (id === reqRef.current) setEditor(c.editor);
      })
      .catch(() => {
        if (id === reqRef.current) setEditor((prev) => prev ?? "unknown");
      });
  }, [workspaceId, basePath]);

  useEffect(() => {
    readEditor();
    return () => {
      reqRef.current++;
    };
  }, [readEditor]);

  const manifestRel = basePath
    ? `${basePath}/${dotcanvas.MANIFEST_FILENAME}`
    : dotcanvas.MANIFEST_FILENAME;
  useWorkspaceChanges((events) => {
    if (
      events.some((e) => e.rel_path === manifestRel && e.kind !== "deleted")
    ) {
      readEditor();
    }
  });

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
