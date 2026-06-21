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
}: {
  workspaceId: string;
  relPath: string;
  active: boolean;
  initialMtime: number;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
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
    const content = editor.serialize();
    void commitWrite(content, snapshot, {
      expectedMtime: lastMtimeRef.current,
      onConflict: () => setConflict({ content, snapshot }),
    });
  }, [editor, commitWrite]);

  // Replace the editor's document with the current bytes on disk, then
  // re-baseline `savedVersion` to the post-load content_version so the
  // freshly-reloaded file reads as clean (editor.load() bumps the version —
  // without re-baselining it would show as dirty).
  const reloadFromDisk = useCallback(async () => {
    setConflict(null);
    setSaveError(null);
    try {
      const r = await workspacesNs.readFile(workspaceId, relPath);
      // Echo suppression (issue #805): our own save produces a watcher
      // `changed` event for this same file, which lands here once the buffer is
      // clean again. `lastMtimeRef` is the mtime we last wrote/loaded; if disk
      // hasn't advanced past it there's nothing new to take, and calling
      // editor.load() would needlessly reset selection / history / mode on
      // every Cmd+S. Reload only when disk genuinely moved ahead of us.
      if (r.mtime === lastMtimeRef.current) return;
      editor.load(r.content);
      lastMtimeRef.current = r.mtime;
      setSavedVersion(editor.state.content_version);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Reload failed.");
    }
  }, [workspaceId, relPath, editor]);

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
    overwriteAnyway,
    dismissError: () => setSaveError(null),
    keepEditing: () => setConflict(null),
  };
}
