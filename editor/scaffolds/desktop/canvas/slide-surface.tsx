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

import { useEffect, useLayoutEffect, useRef } from "react";
import type { SvgEditor } from "@grida/svg-editor";
import { useSvgEditor } from "@grida/svg-editor/react";
import { keynote } from "@grida/svg-editor/presets";
import { SvgCanvasContextMenu } from "@/scaffolds/svg-editor/context-menu";
import type { Slide } from "./deck-store";
import { useWorkspaceFileSave } from "../workbench/use-workspace-file-save";
import type { WorkspaceFileReloadGuard } from "../workbench/workspace-file-reload-guard";
import {
  DirtyBadge,
  SaveConflictDialog,
  SaveErrorToast,
} from "../workbench/editor-pane-save-ui";

export type BindSlideEditor = (
  editor: SvgEditor,
  slide: Pick<Slide, "id" | "src"> & { relPath: string }
) => (() => void) | undefined;

export const SLIDE_VIEWPORT_PADDING = 80;

export function SlideSurface({
  workspaceId,
  relPath,
  initialMtime,
  resourceRevision = 0,
  active = true,
  onDirtyChange,
  onSaved,
  binding,
  bindToolbarEditor,
  prepareContentForEditor,
  prepareContentForWrite,
}: {
  workspaceId: string;
  relPath: string;
  initialMtime: number;
  /** Monotonic revision of workspace resources embedded by this slide. */
  resourceRevision?: number;
  /** Gates Cmd+S — false when this deck is a hidden workbench tab. */
  active?: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSaved?: () => void;
  binding?: { slide: Pick<Slide, "id" | "src">; bindEditor: BindSlideEditor };
  bindToolbarEditor?: (editor: SvgEditor) => () => void;
  prepareContentForEditor?: (
    diskContent: string
  ) =>
    | Promise<string | WorkspaceFileReloadGuard.Prepared<string>>
    | string
    | WorkspaceFileReloadGuard.Prepared<string>;
  prepareContentForWrite?: (editorSerializedContent: string) => string;
}) {
  const editor = useSvgEditor();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bindEditor = binding?.bindEditor;
  const slideId = binding?.slide.id;
  const slideSrc = binding?.slide.src;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handle = keynote.attach(editor, {
      container,
      padding: SLIDE_VIEWPORT_PADDING,
      min_fit_scale: 0.25,
      pan_overshoot: 80,
    });
    const unbind = bindToolbarEditor?.(editor);
    return () => {
      unbind?.();
      handle.detach();
    };
  }, [editor, bindToolbarEditor]);

  useLayoutEffect(() => {
    if (active && bindEditor && slideId !== undefined && slideSrc !== undefined)
      return bindEditor(editor, { id: slideId, src: slideSrc, relPath });
  }, [active, bindEditor, editor, relPath, slideId, slideSrc]);

  // `active` gates Cmd+S: true for the deck's single mounted slide when the
  // deck itself is visible; false when the deck is a hidden workbench tab.
  const save = useWorkspaceFileSave({
    workspaceId,
    relPath,
    active,
    initialMtime,
    onDirtyChange,
    onSaved,
    prepareContentForEditor,
    prepareContentForWrite,
  });
  useEffect(() => {
    // Only the active slide is mounted. Its buffer is discarded on unmount.
    return () => onDirtyChange(false);
  }, [onDirtyChange]);
  const appliedResourceRevisionRef = useRef(0);
  const refreshingResourceRevisionRef = useRef<number | null>(null);

  // A referenced image can change while the slide SVG itself (and therefore
  // its mtime) stays unchanged. Re-run the host projection only while clean;
  // dirty editor content is never discarded and catches up after save/revert.
  useEffect(() => {
    if (
      resourceRevision === appliedResourceRevisionRef.current ||
      save.dirty ||
      save.saving ||
      save.conflictOpen ||
      refreshingResourceRevisionRef.current === resourceRevision
    ) {
      return;
    }
    const targetRevision = resourceRevision;
    refreshingResourceRevisionRef.current = targetRevision;
    void save.reloadProjectionFromDisk().then((applied) => {
      if (refreshingResourceRevisionRef.current !== targetRevision) return;
      refreshingResourceRevisionRef.current = null;
      if (applied) appliedResourceRevisionRef.current = targetRevision;
    });
  }, [
    resourceRevision,
    save.dirty,
    save.saving,
    save.conflictOpen,
    save.reloadProjectionFromDisk,
  ]);

  return (
    <div className="relative h-full w-full bg-muted">
      <SvgCanvasContextMenu enabled={active}>
        <div ref={containerRef} className="absolute inset-0" />
      </SvgCanvasContextMenu>
      {(save.dirty || save.saving) && (
        <DirtyBadge
          dirty={save.dirty}
          saving={save.saving}
          className="left-3 right-auto top-3 z-10"
        />
      )}
      {active && save.saveError && (
        <SaveErrorToast
          message={save.saveError}
          onDismiss={save.dismissError}
        />
      )}
      <SaveConflictDialog
        relPath={relPath}
        open={active && save.conflictOpen}
        onKeepEditing={save.keepEditing}
        onReload={save.reloadFromDisk}
        onOverwrite={save.overwriteAnyway}
      />
    </div>
  );
}
