/**
 * SVG editor surface for a workspace file — the only *editable* mode
 * the editor pane ships today. Shares the `content_version` snapshot
 * dirty trick with the file window's single-file surface
 * (`scaffolds/desktop/file/single-file-svg-surface.tsx`) but talks to the
 * workspace fs surface (`workspaces.readFile` / `writeFile`) rather than the
 * agent sidecar's docId registry, because workspace tabs already address by
 * `{workspaceId, relPath}` (and so get the mtime-safe conflict path the
 * single-document window has no need for).
 *
 * Split from `editor-pane-tab.tsx` so the dispatcher stays small and the
 * read-only viewers (markdown, image, text) sit next to each other
 * in `editor-pane-viewers.tsx` without an editable outlier inflating
 * that file too.
 *
 * Cmd+S is gated on `active` — without that gate every mounted-but-
 * hidden tab would race to save on one keypress.
 */
"use client";

import { useEffect, useState } from "react";
import { AlertCircleIcon } from "lucide-react";
import { SvgEditorCanvas, SvgEditorProvider } from "@grida/svg-editor/react";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import { useWorkspaceFileSave } from "./use-workspace-file-save";
import {
  DirtyBadge,
  SaveConflictDialog,
  SaveErrorToast,
} from "./editor-pane-save-ui";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; content: string; mtime: number }
  | { kind: "error"; message: string };

export function EditorPaneSvgEditor({
  workspaceId,
  relPath,
  active,
  onDirtyChange,
  onSaved,
}: {
  workspaceId: string;
  relPath: string;
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSaved?: () => void;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    workspacesNs
      .readFile(workspaceId, relPath)
      .then((r) => {
        if (cancelled) return;
        setState({ kind: "ready", content: r.content, mtime: r.mtime });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Couldn't read file.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, relPath]);

  if (state.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-xs italic text-muted-foreground">
        Loading {relPath}…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
        <AlertCircleIcon className="size-5 text-destructive" />
        <p className="text-sm text-destructive">{state.message}</p>
        <p className="text-xs text-muted-foreground">
          The editor reads text files up to 1 MiB.
        </p>
      </div>
    );
  }

  return (
    <SvgEditorProvider initialSvg={state.content}>
      <Surface
        workspaceId={workspaceId}
        relPath={relPath}
        active={active}
        initialMtime={state.mtime}
        onDirtyChange={onDirtyChange}
        onSaved={onSaved}
      />
    </SvgEditorProvider>
  );
}

/** Canvas + Cmd+S + dirty badge. Must live inside `SvgEditorProvider`
 * (the save hook's `useSvgEditor` / `useEditorState` throw outside it). */
function Surface({
  workspaceId,
  relPath,
  active,
  initialMtime,
  onDirtyChange,
  onSaved,
}: {
  workspaceId: string;
  relPath: string;
  active: boolean;
  initialMtime: number;
  onDirtyChange: (dirty: boolean) => void;
  onSaved?: () => void;
}) {
  const save = useWorkspaceFileSave({
    workspaceId,
    relPath,
    active,
    initialMtime,
    onDirtyChange,
    onSaved,
  });

  return (
    <div className="relative h-full w-full bg-muted">
      <SvgEditorCanvas fit className="absolute inset-0" />
      {(save.dirty || save.saving) && (
        <DirtyBadge dirty={save.dirty} saving={save.saving} />
      )}
      {save.saveError && (
        <SaveErrorToast
          message={save.saveError}
          onDismiss={save.dismissError}
        />
      )}
      <SaveConflictDialog
        relPath={relPath}
        open={save.conflictOpen}
        onKeepEditing={save.keepEditing}
        onReload={save.reloadFromDisk}
        onOverwrite={save.overwriteAnyway}
      />
    </div>
  );
}
