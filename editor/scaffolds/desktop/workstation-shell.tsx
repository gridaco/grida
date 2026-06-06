"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangleIcon } from "lucide-react";
import {
  SvgEditorCanvas,
  SvgEditorProvider,
  useEditorState,
  useSvgEditor,
} from "@grida/svg-editor/react";
import { cn } from "@app/ui/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@app/ui/components/resizable";
import {
  getDesktopBridge,
  useDesktopBridge,
  type DesktopBridge,
} from "@/lib/desktop/bridge";
import { AISidebarChat } from "./ai-sidebar/chat";
import { TitleBar } from "./chrome/title-bar";

const DIRTY_DEBOUNCE_MS = 200;

/**
 * Sidebar / canvas split.
 *
 * `react-resizable-panels` v4 reads **numeric** size props as pixels
 * and **string** values as percentages — `defaultSize={25}` would be
 * 25px wide, not 25% of the group. We mix units intentionally:
 *
 *   - **Default size** is a percentage so the initial layout scales
 *     with whatever window size the user opens. 25 / 75 matches the
 *     pre-resizable fixed 360px sidebar on the 1440px default window.
 *
 *   - **Sidebar min/max are pixels** because chat readability is a
 *     pixel concern, not a percentage one: below ~280px the Streamdown
 *     paragraphs and tool-call collapsibles wrap awkwardly, and above
 *     ~560px the chat eats canvas without making the conversation any
 *     more readable. On a 1920px+ monitor the canvas should grow, not
 *     the chat.
 *
 * Canvas needs no explicit constraints — the sidebar's pixel bounds
 * implicitly bound the canvas from the other direction.
 */
const SIDEBAR_DEFAULT_SIZE = "25%";
const SIDEBAR_MIN_SIZE = "280px";
const SIDEBAR_MAX_SIZE = "560px";
const CANVAS_DEFAULT_SIZE = "75%";

type LoadState =
  | { kind: "initializing" }
  | { kind: "loading" }
  | { kind: "ready"; svg: string; filename: string; displayPath: string }
  | { kind: "error"; message: string };

const NO_DOCUMENT_MESSAGE =
  "No document is open. Open a file from the welcome window.";

/**
 * Desktop SVG workstation shell.
 *
 * The shell only renders against an open file — `docId` is required.
 * The main process always supplies it when it spawns a document
 * window (Recipe-4 windows are always tied to a registered file). If
 * the renderer somehow loads `/desktop/svg` without a `docId` (a
 * stale bookmark, a direct URL paste), we surface a friendly "no
 * document open" message instead of trying to invent one — there's
 * no untitled-save path in V1.
 *
 * Load happens once the bridge is present:
 *   - read the file via `bridge.files.read(docId)`
 *   - render the editor with that content
 *   - wire Cmd+S → write + dirty clear
 *   - track dirty by comparing the editor's `content_version` against
 *     the value at last save
 */
export function WorkstationShell({ docId }: { docId?: string }) {
  const bridge = useDesktopBridge();
  const [loadState, setLoadState] = useState<LoadState>({
    kind: "initializing",
  });

  // Kick off the file read once the bridge is present. `docId` is the
  // cache key — switching docId re-runs the read. Missing `docId`
  // short-circuits to an error state since V1 has no untitled path.
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
    return <ShellSkeleton message="Loading document…" />;
  }
  if (loadState.kind === "error") {
    return <ShellSkeleton message={loadState.message} />;
  }

  // `docId` is guaranteed once `kind === "ready"` — the read path is
  // only entered when it's set. The non-null assertion makes the
  // narrowing explicit for ShellChrome's required prop.
  return (
    <SvgEditorProvider initialSvg={loadState.svg}>
      <ShellChrome
        docId={docId!}
        filename={loadState.filename}
        displayPath={loadState.displayPath}
      />
    </SvgEditorProvider>
  );
}

function ShellSkeleton({ message }: { message: string }) {
  return (
    <div className="flex h-svh w-full flex-col bg-background">
      {/* Keep the drag region alive during load — without it the
          window can't be moved while a file is reading. */}
      <TitleBar />
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {message}
      </div>
    </div>
  );
}

/**
 * Chrome inside the `SvgEditorProvider`. Split out so it can call
 * `useSvgEditor()` / `useEditorState()` — both throw outside the
 * provider, so the load-state branch above can't do it directly.
 */
function ShellChrome({
  docId,
  filename,
  displayPath,
}: {
  docId: string;
  filename: string;
  displayPath: string;
}) {
  const editor = useSvgEditor();
  const contentVersion = useEditorState((s) => s.content_version);
  // Snapshot of `content_version` at the most recent successful
  // save. Compared against the current value on every state tick to
  // derive the dirty signal. Initialized to the editor's current
  // value (=0 right after `editor.load(initialSvg)`).
  const [savedVersion, setSavedVersion] = useState<number>(
    editor.state.content_version
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const isDirty = contentVersion !== savedVersion;

  // Debounce the IPC call: `setDocumentEdited` round-trips to the
  // main process, and a drag can emit many version bumps per frame.
  // 200ms is well below the perceptual threshold and one paint of
  // the badge in the title bar is already driven locally by `isDirty`.
  const lastSentEditedRef = useRef<boolean | null>(null);
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const timer = setTimeout(() => {
      if (lastSentEditedRef.current === isDirty) return;
      lastSentEditedRef.current = isDirty;
      void bridge.window.set_document_edited(isDirty).catch(() => {
        // Bridge call failures here are non-fatal; the inline dirty
        // dot in the header is the source of truth the user sees.
      });
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
      // Tell the main process the document is no longer edited so
      // the close-dirty-prompt won't fire on Cmd+W after a save.
      lastSentEditedRef.current = false;
      await bridge.window.set_document_edited(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(`Save failed: ${msg}`);
    }
  }, [docId, editor]);

  // Global Cmd+S / Ctrl+S. Listening at `window` (not the editor
  // surface) so the binding is alive even when focus is in the AI
  // sidebar input or anywhere outside the canvas.
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

  // Title-bar text. We show the basename and put the home-shortened
  // absolute path in the tooltip so the user can see at a glance that
  // editing this view edits the real file on disk — and confirm which
  // file by hovering. Fallback to the docId is purely defensive; the
  // agent sidecar read path always populates `filename` from the
  // registered absolute path.
  const docName = useMemo(() => filename || docId, [filename, docId]);

  return (
    <div className="flex h-svh w-full flex-col bg-background">
      <Header docName={docName} docPath={displayPath} dirty={isDirty} />
      {saveError && <Banner kind="error" message={saveError} />}
      {/* Chat-left workstation. The handle between sidebar and canvas
          is the only way to adjust width — no hide/show toggle, by
          design: the AI sidebar is the workstation's primary affordance
          in V1, not a secondary panel. Users who want more canvas drag
          the handle. */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        <ResizablePanel
          defaultSize={SIDEBAR_DEFAULT_SIZE}
          minSize={SIDEBAR_MIN_SIZE}
          maxSize={SIDEBAR_MAX_SIZE}
        >
          <aside className="h-full w-full">
            <AISidebarChat />
          </aside>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={CANVAS_DEFAULT_SIZE}>
          {/* Muted background distinguishes the canvas surface from
              the chrome — the SVG editor canvas div is `absolute
              inset-0` and paints no background of its own, so the
              colour shows through wherever the document doesn't
              cover. */}
          <main className="relative h-full w-full bg-muted">
            <SvgEditorCanvas fit className="absolute inset-0" />
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function Header({
  docName,
  docPath,
  dirty,
}: {
  docName: string;
  /**
   * Home-tilde-shortened absolute path for the tooltip
   * (e.g. `~/Designs/logo.svg`). Shown only on hover — the title bar
   * itself stays compact at the basename.
   */
  docPath: string;
  dirty: boolean;
}) {
  // Tooltip combines the path with a dirty marker so a user hovering
  // mid-edit can tell at a glance both *which* file they're editing
  // and *that* it has unsaved changes. The visible amber dot already
  // carries the dirty signal; this is for hover discoverability.
  const pathHint = dirty ? `${docPath} — Unsaved changes` : docPath;
  return (
    <TitleBar>
      {/* Doc name + dirty dot — plain text stays part of the drag
          region (macOS convention: grab the title to move the window).
          The whole label takes the path tooltip so users learn that
          this view is the real file on disk, not a copy. */}
      <div
        className="flex min-w-0 items-center gap-2"
        title={pathHint}
        aria-label={pathHint}
      >
        <span
          className={cn(
            "inline-block size-1.5 rounded-full",
            dirty ? "bg-amber-500" : "bg-transparent"
          )}
          aria-hidden
        />
        <span className="truncate font-medium text-foreground">{docName}</span>
      </div>
    </TitleBar>
  );
}

function Banner({
  kind,
  message,
}: {
  kind: "warn" | "error";
  message: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-start gap-2 border-b px-3 py-1.5 text-xs",
        kind === "error"
          ? "bg-destructive/10 text-destructive"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      )}
    >
      <AlertTriangleIcon className="size-3.5 shrink-0" />
      <span className="flex-1">{message}</span>
    </div>
  );
}

// Re-export the bridge type for any consumer typing on the result of
// `useDesktopBridge()` from here — defensive against a future move of
// the bridge module.
export type { DesktopBridge };
