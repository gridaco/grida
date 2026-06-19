/**
 * SVG editor surface for a workspace file — the only *editable* mode
 * the editor pane ships today. Mirrors `WorkstationShell`'s save /
 * dirty conventions (same `content_version` snapshot trick) but talks
 * to the workspace fs surface (`workspaces.readFile` / `writeFile`)
 * rather than the agent sidecar's docId registry, because workspace tabs
 * already address by `{workspaceId, relPath}`.
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

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircleIcon } from "lucide-react";
import {
  SvgEditorCanvas,
  SvgEditorProvider,
  useEditorState,
  useSvgEditor,
} from "@grida/svg-editor/react";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import { useWorkspaceChanges } from "./workspace-changes";
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
 * (the `useSvgEditor` / `useEditorState` hooks throw outside it). */
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
  const editor = useSvgEditor();
  const contentVersion = useEditorState((s) => s.content_version);
  const [savedVersion, setSavedVersion] = useState<number>(
    editor.state.content_version
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The conflict-detection token (issue #805): the mtime we last observed
  // on disk for this file — seeded at load, advanced on every successful
  // write / reload. A ref (not state) so `onSave` stays referentially
  // stable and the Cmd+S listener doesn't re-bind on each save.
  const lastMtimeRef = useRef<number>(initialMtime);
  // Set when a save is rejected because disk advanced past our token. Holds
  // the content the user tried to write so "Overwrite anyway" can re-issue
  // it without re-serializing a since-changed editor.
  const [conflict, setConflict] = useState<{
    content: string;
    snapshot: number;
  } | null>(null);
  const dirty = contentVersion !== savedVersion;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // The single write→commit path behind both a normal save and a forced
  // overwrite. On success it advances the mtime token and re-baselines
  // `savedVersion` to the pre-write `snapshot`. The two callers differ only
  // here: a guarded save passes `expectedMtime` (a stale token rejects) and
  // an `onConflict` to raise the resolver; a force-overwrite passes neither
  // (no precondition → last-writer-wins). Every other failure is an error.
  const commitWrite = useCallback(
    async (
      content: string,
      snapshot: number,
      opts: { expectedMtime?: number; onConflict?: () => void }
    ) => {
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
      }
    },
    [workspaceId, relPath, onSaved]
  );

  const onSave = useCallback(() => {
    const snapshot = editor.state.content_version;
    const content = editor.serialize();
    return commitWrite(content, snapshot, {
      expectedMtime: lastMtimeRef.current,
      onConflict: () => setConflict({ content, snapshot }),
    });
  }, [editor, commitWrite]);

  // Replace the editor's document with the current bytes on disk, then
  // re-baseline `savedVersion` to the post-load content_version so the
  // freshly-reloaded file reads as clean (editor.load() bumps the
  // version — without re-baselining it would show as dirty). Used by the
  // conflict resolver's "Reload from disk".
  const reloadFromDisk = useCallback(async () => {
    setConflict(null);
    setSaveError(null);
    try {
      const r = await workspacesNs.readFile(workspaceId, relPath);
      // Echo suppression (issue #805): our own save produces a watcher
      // `changed` event for this same file, which lands here once the buffer
      // is clean again. `lastMtimeRef` is the mtime we last wrote/loaded; if
      // disk hasn't advanced past it there's nothing new to take, and calling
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

  // Force the user's content over the disk version: empty options → no
  // precondition (last-writer-wins) and no conflict handler.
  const overwriteAnyway = useCallback(() => {
    if (!conflict) return;
    setConflict(null);
    return commitWrite(conflict.content, conflict.snapshot, {});
  }, [conflict, commitWrite]);

  // React to external changes to THIS file (issue #805). When the buffer
  // is clean we take the new bytes seamlessly; when it's dirty we keep the
  // user's edits and let the save-time guard surface the conflict (the
  // stale mtime makes the next Cmd+S reject) — VSCode's non-dirty-reload /
  // dirty-defer split. A delete is left alone (a reload would just ENOENT;
  // the save guard treats the missing file as a conflict too).
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
        void onSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onSave]);

  return (
    <div className="relative h-full w-full bg-muted">
      <SvgEditorCanvas fit className="absolute inset-0" />
      {(dirty || saving) && <DirtyBadge dirty={dirty} saving={saving} />}
      {saveError && (
        <SaveErrorToast
          message={saveError}
          onDismiss={() => setSaveError(null)}
        />
      )}
      <SaveConflictDialog
        relPath={relPath}
        open={conflict !== null}
        onKeepEditing={() => setConflict(null)}
        onReload={reloadFromDisk}
        onOverwrite={overwriteAnyway}
      />
    </div>
  );
}
