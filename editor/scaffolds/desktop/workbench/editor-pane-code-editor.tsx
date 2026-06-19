/**
 * Editable text / code / markdown surface for a workspace file — the
 * CodeMirror-backed sibling of `editor-pane-svg-editor.tsx`, and the editable
 * fallback for *every* text format the workbench opens (the read-only Shiki
 * `TextViewer` is superseded for non-binary files).
 *
 * The document is the artifact: serialization is identity (`getValue()` is the
 * bytes, `setValue()` reseeds from disk), so a load → edit → save round-trips
 * exactly — no IR, no normalization. That's why a source editor, not a
 * rich-text model, backs `.md` here.
 *
 * The save / dirty / conflict machinery is the same #805 model the SVG editor
 * runs (it's editor-agnostic): a monotonic doc `version` vs `savedVersion`
 * drives the dirty badge; Cmd+S is gated on `active`; `writeFile` carries an
 * `mtime` precondition whose rejection raises the Keep / Reload / Overwrite
 * dialog; `useWorkspaceChanges` reloads a clean buffer and defers a dirty one.
 *
 * Markdown mode adds a Streamdown preview (same plugin set as agent chat)
 * behind an edit ⇄ preview toggle; the editor stays mounted underneath the
 * preview overlay so toggling never drops cursor / history.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { AlertCircleIcon, EyeIcon, PencilLineIcon } from "lucide-react";
import { markdown as markdownLang } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code as streamdownCode } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { Button } from "@app/ui/components/button";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import {
  CodeMirrorEditor,
  type CodeMirrorHandle,
} from "@/components/codemirror";
import {
  codeLanguages,
  resolveLanguage,
} from "@/components/codemirror/languages";
import { useWorkspaceChanges } from "./workspace-changes";
import {
  DirtyBadge,
  SaveConflictDialog,
  SaveErrorToast,
} from "./editor-pane-save-ui";

/** Same preview plugins agent chat renders with, so a doc looks identical
 * whether the agent prints it or the user previews it. */
const STREAMDOWN_PLUGINS = {
  cjk,
  code: streamdownCode,
  math,
  mermaid,
} as const;

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; content: string; mtime: number }
  | { kind: "error"; message: string };

export function EditorPaneCodeEditor({
  workspaceId,
  relPath,
  active,
  markdownMode = false,
  onDirtyChange,
  onSaved,
}: {
  workspaceId: string;
  relPath: string;
  active: boolean;
  /** `.md` / `.markdown`: markdown language + a Streamdown preview toggle. */
  markdownMode?: boolean;
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
    <Surface
      workspaceId={workspaceId}
      relPath={relPath}
      active={active}
      markdownMode={markdownMode}
      initialContent={state.content}
      initialMtime={state.mtime}
      onDirtyChange={onDirtyChange}
      onSaved={onSaved}
    />
  );
}

function Surface({
  workspaceId,
  relPath,
  active,
  markdownMode,
  initialContent,
  initialMtime,
  onDirtyChange,
  onSaved,
}: {
  workspaceId: string;
  relPath: string;
  active: boolean;
  markdownMode: boolean;
  initialContent: string;
  initialMtime: number;
  onDirtyChange: (dirty: boolean) => void;
  onSaved?: () => void;
}) {
  const handleRef = useRef<CodeMirrorHandle>(null);
  const { resolvedTheme } = useTheme();

  // Dirty = "edits exist since the last saved baseline". The monotonic edit
  // counter lives in refs (not state) so a save can snapshot it synchronously
  // and still detect edits made *during* an in-flight write; only the derived
  // `dirty` boolean is state, so the pane re-renders on clean⇄dirty transitions
  // rather than on every keystroke.
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const [dirty, setDirty] = useState(false);

  const bumpVersion = useCallback(() => {
    versionRef.current += 1;
    setDirty(true);
  }, []);

  // Re-baseline "saved" to a snapshot version; stays dirty if edits landed
  // after that snapshot (e.g. typing during an in-flight save).
  const baselineTo = useCallback((snapshotVersion: number) => {
    savedVersionRef.current = snapshotVersion;
    setDirty(versionRef.current !== snapshotVersion);
  }, []);

  // Language: markdown is synchronous (+ lazy fenced-code highlighting); any
  // other format resolves its grammar lazily from filename, plain text until
  // it lands.
  const [language, setLanguage] = useState<Extension | undefined>(() =>
    markdownMode ? markdownLang({ codeLanguages }) : undefined
  );
  useEffect(() => {
    if (markdownMode) return;
    let cancelled = false;
    void resolveLanguage(relPath).then((ext) => {
      if (!cancelled) setLanguage(ext);
    });
    return () => {
      cancelled = true;
    };
  }, [markdownMode, relPath]);

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [previewContent, setPreviewContent] = useState("");

  const lastMtimeRef = useRef<number>(initialMtime);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{
    content: string;
    version: number;
  } | null>(null);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // Single write→commit path behind both a normal save and a forced overwrite
  // — identical contract to the SVG editor's `commitWrite`.
  const commitWrite = useCallback(
    async (
      content: string,
      snapshotVersion: number,
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
        baselineTo(snapshotVersion);
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
    [workspaceId, relPath, onSaved, baselineTo]
  );

  const onSave = useCallback(() => {
    const handle = handleRef.current;
    if (!handle) return;
    const snapshotVersion = versionRef.current;
    const content = handle.getValue();
    return commitWrite(content, snapshotVersion, {
      expectedMtime: lastMtimeRef.current,
      onConflict: () => setConflict({ content, version: snapshotVersion }),
    });
  }, [commitWrite]);

  // Replace the buffer with disk bytes, then re-baseline to the post-load
  // version so the reload reads clean. `setValue` dispatches one transaction
  // whose updateListener bumps `versionRef` synchronously, so baselining to
  // `versionRef.current` after it is correct.
  const reloadFromDisk = useCallback(async () => {
    setConflict(null);
    setSaveError(null);
    try {
      const r = await workspacesNs.readFile(workspaceId, relPath);
      // Echo suppression (#805): our own save re-fires a watcher event; if disk
      // hasn't advanced past our token there's nothing new to take, and a
      // setValue would needlessly reset cursor / history.
      if (r.mtime === lastMtimeRef.current) return;
      handleRef.current?.setValue(r.content);
      lastMtimeRef.current = r.mtime;
      baselineTo(versionRef.current);
      // Keep the preview snapshot in sync — otherwise a reload while the
      // preview overlay is up (clean watcher refresh, or the conflict dialog's
      // "Reload from disk") would keep rendering the stale pre-reload snapshot.
      if (markdownMode) setPreviewContent(r.content);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Reload failed.");
    }
  }, [workspaceId, relPath, markdownMode, baselineTo]);

  const overwriteAnyway = useCallback(() => {
    if (!conflict) return;
    setConflict(null);
    return commitWrite(conflict.content, conflict.version, {});
  }, [conflict, commitWrite]);

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

  const togglePreview = useCallback(() => {
    setMode((prev) => {
      if (prev === "edit") {
        setPreviewContent(handleRef.current?.getValue() ?? "");
        return "preview";
      }
      return "edit";
    });
  }, []);

  return (
    <div className="relative h-full w-full bg-background">
      <CodeMirrorEditor
        ref={handleRef}
        initialValue={initialContent}
        language={language}
        onDocChange={bumpVersion}
        autoFocus={active}
        dark={resolvedTheme === "dark"}
        // While the preview overlay is up the editor is still mounted
        // underneath; read-only stops keystrokes from editing the buffer
        // blind (and keeps the previewed snapshot accurate).
        readOnly={markdownMode && mode === "preview"}
        className="absolute inset-0"
      />

      {markdownMode && mode === "preview" && (
        <div className="absolute inset-0 overflow-auto bg-background">
          <div className="mx-auto max-w-3xl px-6 py-6">
            <Streamdown plugins={STREAMDOWN_PLUGINS}>
              {previewContent}
            </Streamdown>
          </div>
        </div>
      )}

      {markdownMode && (
        <Button
          size="sm"
          variant="outline"
          onClick={togglePreview}
          className="absolute right-2 top-2 z-10 h-7 gap-1.5 px-2 text-[11px]"
        >
          {mode === "edit" ? (
            <>
              <EyeIcon className="size-3.5" /> Preview
            </>
          ) : (
            <>
              <PencilLineIcon className="size-3.5" /> Edit
            </>
          )}
        </Button>
      )}

      {(dirty || saving) && (
        <DirtyBadge
          dirty={dirty}
          saving={saving}
          // Markdown mode parks the preview toggle at top-right, so the badge
          // moves to the top-left to avoid overlapping it.
          className={markdownMode ? "left-2 right-auto" : undefined}
        />
      )}
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
