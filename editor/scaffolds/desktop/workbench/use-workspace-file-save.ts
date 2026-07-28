/**
 * mtime-safe save for an `@grida/svg-editor` document backed by a workspace
 * file (issue #805). Extracted from `editor-pane-svg-editor.tsx` so the
 * subtle conflict / echo-suppression logic lives once and is shared by both
 * the workbench SVG pane and the desktop slides surface — two editors over the
 * same `{workspaceId, relPath}` contract that must not drift.
 *
 * Must be called inside `<SvgEditorProvider>` (uses `useSvgEditor`). The host
 * renders the canvas (a fit canvas, or a keynote slide surface) and the save
 * UI (`DirtyBadge` / `SaveErrorToast` / `SaveConflictDialog`) from the returned
 * state — this hook owns only the write/conflict/reload bookkeeping + Cmd+S.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorState, useSvgEditor } from "@grida/svg-editor/react";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import { useWorkspaceChanges } from "./workspace-changes";
import { WorkspaceFileReloadGuard } from "./workspace-file-reload-guard";

export type WorkspaceFileSave = {
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  /** True while a save is blocked on the disk-advanced-past-us conflict. */
  conflictOpen: boolean;
  /** Serialize the editor and write it (guarded by the mtime token). */
  onSave: () => void;
  /** Take the current bytes on disk into the editor (clean-buffer reload). */
  reloadFromDisk: () => Promise<void>;
  /**
   * Re-read and re-project the current bytes even when this file's mtime did
   * not change. Returns false when an edit/write raced the read and the caller
   * should retry after the buffer becomes clean.
   */
  reloadProjectionFromDisk: () => Promise<boolean>;
  /** Force the editor's content over disk (last-writer-wins). */
  overwriteAnyway: () => void;
  dismissError: () => void;
  /** Dismiss the conflict dialog, keeping the user's in-editor edits. */
  keepEditing: () => void;
};

export function useWorkspaceFileSave({
  workspaceId,
  relPath,
  active,
  initialMtime,
  onDirtyChange,
  onSaved,
  prepareContentForEditor,
  prepareContentForWrite,
}: {
  workspaceId: string;
  relPath: string;
  active: boolean;
  initialMtime: number;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
  /** Optional host projection before bytes from disk enter the editor. */
  prepareContentForEditor?: (
    diskContent: string
  ) =>
    | Promise<string | WorkspaceFileReloadGuard.Prepared<string>>
    | string
    | WorkspaceFileReloadGuard.Prepared<string>;
  /** Optional inverse projection before serialized editor content hits disk. */
  prepareContentForWrite?: (editorSerializedContent: string) => string;
}): WorkspaceFileSave {
  const editor = useSvgEditor();
  const contentVersion = useEditorState((s) => s.content_version);
  const [savedVersion, setSavedVersion] = useState<number>(
    editor.state.content_version
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The conflict-detection token (issue #805): the mtime we last observed on
  // disk for this file — seeded at load, advanced on every successful write /
  // reload. A ref (not state) so `onSave` stays referentially stable and the
  // Cmd+S listener doesn't re-bind on each save.
  const lastMtimeRef = useRef<number>(initialMtime);
  // Guards against overlapping writes: a second save dispatched while one is
  // still in flight would carry the same (pre-write) `expectedMtime` and so
  // conflict against the first save's own result — a false conflict with no
  // external edit. Drop the overlap; the buffer stays dirty and re-saves cleanly
  // once the in-flight write lands.
  const writeInFlightRef = useRef(false);
  // Exact-file reloads and dependency-only reprojections have independent
  // latest-request lanes. A same-mtime file-watch echo must not supersede an
  // in-flight dependency refresh that intentionally bypasses that mtime check.
  const fileReloadGuardRef = useRef(new WorkspaceFileReloadGuard());
  const projectionReloadGuardRef = useRef(new WorkspaceFileReloadGuard());
  // Set when a save is rejected because disk advanced past our token. Holds the
  // content the user tried to write so "Overwrite anyway" can re-issue it
  // without re-serializing a since-changed editor.
  const [conflict, setConflict] = useState<{
    content: string;
    snapshot: number;
  } | null>(null);
  const dirty = contentVersion !== savedVersion;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // The single write→commit path behind both a normal save and a forced
  // overwrite. On success it advances the mtime token and re-baselines
  // `savedVersion` to the pre-write `snapshot`. The two callers differ only
  // here: a guarded save passes `expectedMtime` (a stale token rejects) and an
  // `onConflict` to raise the resolver; a force-overwrite passes neither (no
  // precondition → last-writer-wins). Every other failure is an error.
  const commitWrite = useCallback(
    async (
      content: string,
      snapshot: number,
      opts: { expectedMtime?: number; onConflict?: () => void }
    ) => {
      if (writeInFlightRef.current) return;
      writeInFlightRef.current = true;
      setSaveError(null);
      setSaving(true);
      try {
        const res = await workspacesNs.writeFile(
          workspaceId,
          relPath,
          content,
          opts.expectedMtime
        );
        lastMtimeRef.current = res.mtime;
        setSavedVersion(snapshot);
        onSaved?.();
      } catch (err) {
        if (opts.onConflict && workspacesNs.isWriteConflict(err)) {
          opts.onConflict();
        } else {
          setSaveError(err instanceof Error ? err.message : "Save failed.");
        }
      } finally {
        setSaving(false);
        writeInFlightRef.current = false;
      }
    },
    [workspaceId, relPath, onSaved]
  );

  const onSave = useCallback(() => {
    const snapshot = editor.state.content_version;
    let content: string;
    try {
      content = prepareContentForWrite
        ? prepareContentForWrite(editor.serialize())
        : editor.serialize();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
      return;
    }
    void commitWrite(content, snapshot, {
      expectedMtime: lastMtimeRef.current,
      onConflict: () => setConflict({ content, snapshot }),
    });
  }, [editor, commitWrite, prepareContentForWrite]);

  // Replace the editor's document with the current bytes on disk, then
  // re-baseline `savedVersion` to the post-load content_version so the
  // freshly-reloaded file reads as clean (editor.load() bumps the version —
  // without re-baselining it would show as dirty).
  const reload = useCallback(
    async (forceProjection: boolean): Promise<boolean> => {
      const guard = forceProjection
        ? projectionReloadGuardRef.current
        : fileReloadGuardRef.current;
      const request = guard.begin(editor.state.content_version);
      setConflict(null);
      setSaveError(null);
      try {
        const r = await workspacesNs.readFile(workspaceId, relPath);
        // Echo suppression (issue #805): our own save produces a watcher
        // `changed` event for this same file, which lands here once the buffer
        // is clean again. A dependency-only refresh deliberately bypasses this:
        // the source file is unchanged, but its host projection is not.
        if (!forceProjection && r.mtime === lastMtimeRef.current) return true;
        const projected = prepareContentForEditor
          ? await prepareContentForEditor(r.content)
          : r.content;
        const prepared =
          typeof projected === "string" ? { content: projected } : projected;
        const applied = guard.apply(
          request,
          {
            contentVersion: editor.state.content_version,
            writeInFlight: writeInFlightRef.current,
          },
          prepared,
          (content) => editor.load(content)
        );
        if (!applied) return false;
        lastMtimeRef.current = r.mtime;
        setSavedVersion(editor.state.content_version);
        return true;
      } catch (err) {
        if (
          guard.accepts(request, {
            contentVersion: editor.state.content_version,
            writeInFlight: writeInFlightRef.current,
          })
        ) {
          setSaveError(err instanceof Error ? err.message : "Reload failed.");
        }
        return false;
      }
    },
    [workspaceId, relPath, editor, prepareContentForEditor]
  );
  const reloadFromDisk = useCallback(async () => {
    await reload(false);
  }, [reload]);
  const reloadProjectionFromDisk = useCallback(() => reload(true), [reload]);

  const overwriteAnyway = useCallback(() => {
    if (!conflict) return;
    setConflict(null);
    void commitWrite(conflict.content, conflict.snapshot, {});
  }, [conflict, commitWrite]);

  // React to external changes to THIS file (issue #805). When the buffer is
  // clean we take the new bytes seamlessly; when it's dirty we keep the user's
  // edits and let the save-time guard surface the conflict (the stale mtime
  // makes the next Cmd+S reject) — VSCode's non-dirty-reload / dirty-defer
  // split. A delete is left alone (a reload would just ENOENT; the save guard
  // treats the missing file as a conflict too).
  useWorkspaceChanges((events) => {
    const mine = events.find((e) => e.rel_path === relPath);
    if (!mine || mine.kind === "deleted") return;
    if (!dirty && !saving && conflict === null) void reloadFromDisk();
  });

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && (e.key === "s" || e.key === "S") && !e.shiftKey) {
        e.preventDefault();
        onSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onSave]);

  return {
    dirty,
    saving,
    saveError,
    conflictOpen: conflict !== null,
    onSave,
    reloadFromDisk,
    reloadProjectionFromDisk,
    overwriteAnyway,
    dismissError: () => setSaveError(null),
    keepEditing: () => setConflict(null),
  };
}
