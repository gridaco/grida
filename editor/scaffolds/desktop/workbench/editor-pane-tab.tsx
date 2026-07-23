/**
 * A single open tab in the workspace's file viewer.
 *
 * One EditorPaneTab is mounted per open file. The active tab is visible;
 * the rest sit in the same position but `invisible + pointer-events-
 * none`, which keeps each tab's React subtree alive across switches
 * — switching tabs preserves the editor's content, dirty state,
 * cursor / selection, and load progress, the same way VSCode does.
 * Remounting on switch (the obvious alternative) would silently
 * discard in-progress edits, which is a much worse failure mode than
 * the extra memory.
 *
 * Modes (`WorkspaceFileKind.of`):
 *
 *   - `.svg` → editable SVG editor
 *   - `.md` / `.markdown` → editable CodeMirror markdown editor + preview
 *   - image/* (.png/.jpg/.gif/.webp/…) → streamed image viewer
 *   - video/* (.mp4/.webm/.mov/…) → streamed video viewer
 *   - everything else → editable CodeMirror text editor (the fallback for any
 *     text format); the agent sidecar's `readFile` rejects binary / >1MiB
 *     content, which surfaces as the editor's error state, not gibberish
 *
 * The per-tab error boundary keeps a crash inside one viewer from
 * taking down the whole workspace window — see `EditorCrashFallback`.
 */
"use client";

import { useCallback, useMemo } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { AlertTriangleIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import { EditorPaneSvgEditor } from "./editor-pane-svg-editor";
import { EditorPaneCodeEditor } from "./editor-pane-code-editor";
import { DesktopCanvasBundleShell } from "../canvas/canvas-bundle-shell";
import { ImageViewer, VideoViewer } from "./editor-pane-viewers";
import { WorkspaceFileKind } from "./workspace-file-kind";

export type EditorPaneTabProps = {
  workspaceId: string;
  relPath: string;
  active: boolean;
  /** Parent collects dirty state across all open tabs for the tab
   * strip's per-tab amber dot. Stable across renders — the parent
   * wraps it in `useCallback`. */
  onDirtyChange: (relPath: string, dirty: boolean) => void;
  onSaved?: () => void;
};

export function EditorPaneTab({
  workspaceId,
  relPath,
  active,
  onDirtyChange,
  onSaved,
}: EditorPaneTabProps) {
  const mode = useMemo(() => WorkspaceFileKind.of(relPath), [relPath]);

  // Partial-application of relPath so children (which don't know
  // their own path) can call a plain `(dirty) => void` callback.
  const reportDirty = useCallback(
    (dirty: boolean) => onDirtyChange(relPath, dirty),
    [relPath, onDirtyChange]
  );

  return (
    <div
      className={cn(
        "absolute inset-0",
        !active && "invisible pointer-events-none"
      )}
      aria-hidden={!active}
    >
      {/* Per-tab error boundary — a crash inside the viewer subtree
          stays contained to this one tab. Without it, an exception
          during render bubbles to the nearest boundary, which today
          would be Next.js's root error page; that wipes the whole
          workspace window (tabs, chat, tree) for one bad file.
          The boundary's `resetKeys` include `relPath` so closing-and-
          reopening (which remounts EditorPaneTab with a new key) recovers
          cleanly, and the in-fallback "Try again" button calls
          `resetErrorBoundary` for the soft path. */}
      <ErrorBoundary
        resetKeys={[workspaceId, relPath]}
        onError={(err, info) => {
          console.error(
            `[workspace] viewer crashed for ${relPath}:`,
            err,
            info
          );
        }}
        fallbackRender={(props) => (
          <ViewerCrashFallback {...props} relPath={relPath} />
        )}
      >
        <ModeBody
          mode={mode}
          workspaceId={workspaceId}
          relPath={relPath}
          active={active}
          onDirtyChange={reportDirty}
          onSaved={onSaved}
        />
      </ErrorBoundary>
    </div>
  );
}

/* ─────────────────────── mode dispatch ─────────────────────── */

function ModeBody({
  mode,
  workspaceId,
  relPath,
  active,
  onDirtyChange,
  onSaved,
}: {
  mode: WorkspaceFileKind.Kind;
  workspaceId: string;
  relPath: string;
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSaved?: () => void;
}) {
  switch (mode) {
    case "svg":
      return (
        <EditorPaneSvgEditor
          workspaceId={workspaceId}
          relPath={relPath}
          active={active}
          onDirtyChange={onDirtyChange}
          onSaved={onSaved}
        />
      );
    case "canvas":
      // A `.canvas` directory, scoped to its subpath within this workspace.
      // Branch on the manifest `editor`: `board` → the infinite-canvas board
      // host; `slides`/unknown → the slides deck. `active` gates the deck's
      // Cmd+S (a hidden tab must not grab the save); both auto-persist, so no
      // tab dirty state.
      return (
        <DesktopCanvasBundleShell
          workspaceId={workspaceId}
          basePath={relPath}
          active={active}
        />
      );
    case "markdown":
      return (
        <EditorPaneCodeEditor
          workspaceId={workspaceId}
          relPath={relPath}
          active={active}
          markdownMode
          onDirtyChange={onDirtyChange}
          onSaved={onSaved}
        />
      );
    case "image":
      return <ImageViewer workspaceId={workspaceId} relPath={relPath} />;
    case "video":
      return <VideoViewer workspaceId={workspaceId} relPath={relPath} />;
    case "text":
      return (
        <EditorPaneCodeEditor
          workspaceId={workspaceId}
          relPath={relPath}
          active={active}
          onDirtyChange={onDirtyChange}
          onSaved={onSaved}
        />
      );
  }
}

/* ─────────────────────── crash fallback ─────────────────────── */

function ViewerCrashFallback({
  error,
  resetErrorBoundary,
  relPath,
}: FallbackProps & { relPath: string }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <AlertTriangleIcon className="size-6 text-destructive" />
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Viewer crashed</h2>
        <p className="font-mono text-[11px] text-muted-foreground">{relPath}</p>
      </div>
      {/* The error string is bounded width + truncated height so a long
          stack-like message doesn't push the recovery button off-screen
          when this fallback fills a small workspace pane. */}
      <pre className="max-h-32 w-full overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 px-3 py-2 text-left text-[11px] text-muted-foreground">
        {message}
      </pre>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={resetErrorBoundary}>
          Try again
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        If it keeps happening, close this tab from the strip above.
      </p>
    </div>
  );
}
