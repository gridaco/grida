/**
 * Single-file SVG editor surface for the desktop **file window** — the
 * `?docId=` (single document) mode. Extracted from the former
 * `WorkstationShell`: it loads the file via the agent sidecar's docId registry
 * (`bridge.files.read/write` — opaque ids per GRIDA-SEC-004, never the absolute
 * path), renders the editor canvas, and owns Cmd+S / dirty / the
 * `set_document_edited` close-prompt signal.
 *
 * It renders ONLY the editor canvas — the shared {@link ./file-shell} owns the
 * title bar (fed via `onMeta`) and the AI sidebar (bound to this editor via
 * `onActiveEditor`). One-doc-per-window, so there is no mtime conflict path
 * here (that lives in the workspace workbench's svg tab); a single document
 * window has no concurrent editor.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangleIcon } from "lucide-react";
import {
  SvgEditorCanvas,
  SvgEditorProvider,
  useEditorState,
  useSvgEditor,
} from "@grida/svg-editor/react";
import type { SvgEditor } from "@grida/svg-editor";
import { getDesktopBridge, useDesktopBridge } from "@/lib/desktop/bridge";

const DIRTY_DEBOUNCE_MS = 200;

const NO_DOCUMENT_MESSAGE =
  "No document is open. Open a file from the welcome window.";

/** Title-bar metadata the surface reports up to the shell. */
export type FileMeta = {
  /** Title-bar label — the file basename. */
  title: string;
  /**
   * Home-tilde-shortened absolute path for the title tooltip
   * (e.g. `~/Designs/logo.svg`). Omitted when not applicable.
   */
  displayPath?: string;
  /** Unsaved-changes flag → the title-bar dirty dot. */
  dirty: boolean;
};

type LoadState =
  | { kind: "initializing" }
  | { kind: "loading" }
  | { kind: "ready"; svg: string; filename: string; displayPath: string }
  | { kind: "error"; message: string };

export function SingleFileSvgSurface({
  docId,
  onActiveEditor,
  onMeta,
}: {
  docId?: string;
  /** Report the live editor up so the shell's AgentFs binds the sidebar to it. */
  onActiveEditor: (editor: SvgEditor | null) => void;
  /** Report title-bar metadata (filename, path, dirty) up to the shell. */
  onMeta: (meta: FileMeta) => void;
}) {
  const bridge = useDesktopBridge();
  const [loadState, setLoadState] = useState<LoadState>({
    kind: "initializing",
  });

  // Kick off the file read once the bridge is present. `docId` is the cache
  // key — switching docId re-runs the read. Missing `docId` short-circuits to
  // an error since V1 has no untitled path.
  useEffect(() => {
    if (!bridge) return;
    if (!docId) {
      setLoadState({ kind: "error", message: NO_DOCUMENT_MESSAGE });
      return;
    }
    let cancelled = false;
    setLoadState({ kind: "loading" });
    bridge.files
      .read(docId)
      .then((r) => {
        if (cancelled) return;
        setLoadState({
          kind: "ready",
          svg: r.content,
          filename: r.filename,
          displayPath: r.display_path,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setLoadState({ kind: "error", message: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, docId]);

  if (loadState.kind === "initializing" || loadState.kind === "loading") {
    return <SurfaceMessage message="Loading document…" />;
  }
  if (loadState.kind === "error") {
    return <SurfaceMessage message={loadState.message} />;
  }

  // `docId` is guaranteed once `kind === "ready"` — the read path is only
  // entered when it's set.
  return (
    <SvgEditorProvider initialSvg={loadState.svg}>
      <Surface
        docId={docId!}
        filename={loadState.filename}
        displayPath={loadState.displayPath}
        onActiveEditor={onActiveEditor}
        onMeta={onMeta}
      />
    </SvgEditorProvider>
  );
}

function SurfaceMessage({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">
      {message}
    </div>
  );
}

/**
 * The editor canvas + save/dirty wiring. Must live inside
 * `SvgEditorProvider` — `useSvgEditor()` / `useEditorState()` throw outside it,
 * so the load-state branch above can't do this directly.
 */
function Surface({
  docId,
  filename,
  displayPath,
  onActiveEditor,
  onMeta,
}: {
  docId: string;
  filename: string;
  displayPath: string;
  onActiveEditor: (editor: SvgEditor | null) => void;
  onMeta: (meta: FileMeta) => void;
}) {
  const editor = useSvgEditor();
  const contentVersion = useEditorState((s) => s.content_version);
  // Snapshot of `content_version` at the most recent successful save.
  // Initialized to the editor's current value (=0 right after load).
  const [savedVersion, setSavedVersion] = useState<number>(
    editor.state.content_version
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const isDirty = contentVersion !== savedVersion;

  // Bind the sidebar's AgentFs to this editor for as long as it's mounted.
  useEffect(() => {
    onActiveEditor(editor);
    return () => onActiveEditor(null);
  }, [editor, onActiveEditor]);

  // Title-bar metadata. Filename basename + home-shortened path tooltip +
  // dirty dot, surfaced through the shell's title bar.
  const docName = useMemo(() => filename || docId, [filename, docId]);
  useEffect(() => {
    onMeta({ title: docName, displayPath, dirty: isDirty });
  }, [docName, displayPath, isDirty, onMeta]);

  // Mirror dirty state to the main process so Cmd+W prompts before discarding
  // unsaved edits. Arm `true` IMMEDIATELY (a quick close right after an edit must
  // still hit the prompt); only debounce the clear to `false`, since
  // `set_document_edited` round-trips and a drag emits many version bumps per
  // frame. The inline dirty dot remains the source of truth the user sees, so
  // any IPC failure here is non-fatal.
  const lastSentEditedRef = useRef<boolean | null>(null);
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    if (isDirty) {
      if (lastSentEditedRef.current !== true) {
        lastSentEditedRef.current = true;
        void bridge.window.set_document_edited(true).catch(() => {});
      }
      return;
    }
    const timer = setTimeout(() => {
      if (lastSentEditedRef.current === false) return;
      lastSentEditedRef.current = false;
      void bridge.window.set_document_edited(false).catch(() => {});
    }, DIRTY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isDirty]);

  const onSave = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    setSaveError(null);
    const snapshot = editor.state.content_version;
    const content = editor.serialize();
    try {
      await bridge.files.write(docId, content);
      setSavedVersion(snapshot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(`Save failed: ${msg}`);
      return;
    }
    // The file is saved; tell the main process it's clean so Cmd+W after a save
    // doesn't re-fire the dirty-close prompt. A failure here must NOT report the
    // (successful) save as failed — keep it non-fatal.
    lastSentEditedRef.current = false;
    void bridge.window.set_document_edited(false).catch(() => {});
  }, [docId, editor]);

  // Global Cmd+S / Ctrl+S — listened at `window` (not the canvas) so it fires
  // even when focus is in the AI sidebar input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && (e.key === "s" || e.key === "S") && !e.shiftKey) {
        e.preventDefault();
        void onSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave]);

  return (
    <div className="relative h-full w-full bg-muted">
      <SvgEditorCanvas fit className="absolute inset-0" />
      {saveError && (
        <div className="absolute inset-x-0 top-0 flex items-start gap-2 border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          <AlertTriangleIcon className="size-3.5 shrink-0" />
          <span className="flex-1">{saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="text-destructive/70 underline hover:text-destructive"
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}
