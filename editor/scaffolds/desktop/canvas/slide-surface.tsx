/**
 * The active-slide editor for the desktop `.canvas` deck. A keynote-camera
 * SVG surface (cover-constraint + auto-refit, from `@grida/svg-editor/presets`)
 * over a workspace file, saved with the shared mtime-safe hook. Must live
 * inside `<SvgEditorProvider>`.
 *
 * Interactive chrome (toolbars) is rendered as a SIBLING of this surface by the
 * shell, never nested inside the keynote container — the preset installs a
 * pointerdown capture there and nesting chrome triggers a dev warning.
 */
"use client";

import { useEffect, useRef } from "react";
import { useSvgEditor } from "@grida/svg-editor/react";
import { keynote } from "@grida/svg-editor/presets";
import { useWorkspaceFileSave } from "../workbench/use-workspace-file-save";
import {
  DirtyBadge,
  SaveConflictDialog,
  SaveErrorToast,
} from "../workbench/editor-pane-save-ui";

export function SlideSurface({
  workspaceId,
  relPath,
  initialMtime,
  active = true,
  onSaved,
}: {
  workspaceId: string;
  relPath: string;
  initialMtime: number;
  /** Gates Cmd+S — false when this deck is a hidden workbench tab. */
  active?: boolean;
  onSaved?: () => void;
}) {
  const editor = useSvgEditor();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handle = keynote.attach(editor, { container });
    return () => handle.detach();
  }, [editor]);

  // `active` gates Cmd+S: true for the deck's single mounted slide when the
  // deck itself is visible; false when the deck is a hidden workbench tab.
  const save = useWorkspaceFileSave({
    workspaceId,
    relPath,
    active,
    initialMtime,
    onSaved,
  });

  return (
    <div className="relative h-full w-full bg-muted">
      <div ref={containerRef} className="absolute inset-0" />
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
