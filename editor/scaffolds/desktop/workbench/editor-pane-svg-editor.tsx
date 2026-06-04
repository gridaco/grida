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

import { useCallback, useEffect, useState } from "react";
import { AlertCircleIcon } from "lucide-react";
import {
  SvgEditorCanvas,
  SvgEditorProvider,
  useEditorState,
  useSvgEditor,
} from "@grida/svg-editor/react";
import { cn } from "@/components/lib/utils/index";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; content: string }
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
        setState({ kind: "ready", content: r.content });
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
  onDirtyChange,
  onSaved,
}: {
  workspaceId: string;
  relPath: string;
  active: boolean;
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
  const dirty = contentVersion !== savedVersion;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const onSave = useCallback(async () => {
    setSaveError(null);
    setSaving(true);
    const snapshot = editor.state.content_version;
    const content = editor.serialize();
    try {
      await workspacesNs.writeFile(workspaceId, relPath, content);
      setSavedVersion(snapshot);
      onSaved?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [workspaceId, relPath, editor, onSaved]);

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
    </div>
  );
}

function DirtyBadge({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  return (
    <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-full border bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm">
      <span
        className={cn(
          "size-1.5 rounded-full",
          saving ? "bg-sky-500" : "bg-amber-500"
        )}
        aria-hidden
      />
      {saving ? "Saving…" : dirty ? "Unsaved" : null}
    </div>
  );
}

function SaveErrorToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="absolute inset-x-3 bottom-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-sm">
      <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-destructive/70 underline hover:text-destructive"
      >
        dismiss
      </button>
    </div>
  );
}
