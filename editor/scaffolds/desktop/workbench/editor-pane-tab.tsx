/**
 * A single open tab in the workspace's file viewer.
 *
 * One EditorPaneTab is mounted per open file. The active tab is visible;
 * the rest sit in the same position but `invisible + pointer-events-
 * none`, which keeps each tab's React subtree alive across switches
 * — switching tabs preserves the editor's content, dirty state,
 * cursor / selection, and load progress, the same way VSCode does.
 * Remounting on switch (the obvious alternative) would silently
 * discard in-progress edits, which is a much worse failure mode than
 * the extra memory.
 *
 * Modes (`detectFileMode`):
 *
 *   - `.svg` → editable SVG editor (the only writable mode today)
 *   - `.md` / `.markdown` → Streamdown markdown viewer (read-only)
 *   - image/* (.png/.jpg/.gif/.webp/…) → base64 image viewer
 *   - video/* (.mp4/.webm/.mov/…) → base64 video viewer
 *   - everything else → Shiki-highlighted text viewer; the agent sidecar's
 *     `readFile` rejects binary content, so unknown binary types
 *     surface as the agent sidecar's error message rather than as gibberish
 *
 * The per-tab error boundary keeps a crash inside one viewer from
 * taking down the whole workspace window — see `EditorCrashFallback`.
 */
"use client";

import { useCallback, useMemo } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { AlertTriangleIcon } from "lucide-react";
import type { BundledLanguage } from "shiki";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import { EditorPaneSvgEditor } from "./editor-pane-svg-editor";
import {
  ImageViewer,
  MarkdownViewer,
  TextViewer,
  VideoViewer,
} from "./editor-pane-viewers";

export type EditorPaneTabProps = {
  workspaceId: string;
  relPath: string;
  active: boolean;
  /** Parent collects dirty state across all open tabs for the tab
   * strip's per-tab amber dot. Stable across renders — the parent
   * wraps it in `useCallback`. */
  onDirtyChange: (relPath: string, dirty: boolean) => void;
  onSaved?: () => void;
};

export function EditorPaneTab({
  workspaceId,
  relPath,
  active,
  onDirtyChange,
  onSaved,
}: EditorPaneTabProps) {
  const mode = useMemo(() => detectFileMode(relPath), [relPath]);

  // Partial-application of relPath so children (which don't know
  // their own path) can call a plain `(dirty) => void` callback.
  const reportDirty = useCallback(
    (dirty: boolean) => onDirtyChange(relPath, dirty),
    [relPath, onDirtyChange]
  );

  return (
    <div
      className={cn(
        "absolute inset-0",
        !active && "invisible pointer-events-none"
      )}
      aria-hidden={!active}
    >
      {/* Per-tab error boundary — a crash inside the viewer subtree
          stays contained to this one tab. Without it, an exception
          during render bubbles to the nearest boundary, which today
          would be Next.js's root error page; that wipes the whole
          workspace window (tabs, chat, tree) for one bad file.
          The boundary's `resetKeys` include `relPath` so closing-and-
          reopening (which remounts EditorPaneTab with a new key) recovers
          cleanly, and the in-fallback "Try again" button calls
          `resetErrorBoundary` for the soft path. */}
      <ErrorBoundary
        resetKeys={[workspaceId, relPath]}
        onError={(err, info) => {
          console.error(
            `[workspace] viewer crashed for ${relPath}:`,
            err,
            info
          );
        }}
        fallbackRender={(props) => (
          <ViewerCrashFallback {...props} relPath={relPath} />
        )}
      >
        <ModeBody
          mode={mode}
          workspaceId={workspaceId}
          relPath={relPath}
          active={active}
          onDirtyChange={reportDirty}
          onSaved={onSaved}
        />
      </ErrorBoundary>
    </div>
  );
}

/* ─────────────────────── mode dispatch ─────────────────────── */

type FileMode =
  | { kind: "svg-editor" }
  | { kind: "markdown" }
  | { kind: "image" }
  | { kind: "video" }
  | { kind: "text"; lang: BundledLanguage };

function ModeBody({
  mode,
  workspaceId,
  relPath,
  active,
  onDirtyChange,
  onSaved,
}: {
  mode: FileMode;
  workspaceId: string;
  relPath: string;
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSaved?: () => void;
}) {
  switch (mode.kind) {
    case "svg-editor":
      return (
        <EditorPaneSvgEditor
          workspaceId={workspaceId}
          relPath={relPath}
          active={active}
          onDirtyChange={onDirtyChange}
          onSaved={onSaved}
        />
      );
    case "markdown":
      return <MarkdownViewer workspaceId={workspaceId} relPath={relPath} />;
    case "image":
      return <ImageViewer workspaceId={workspaceId} relPath={relPath} />;
    case "video":
      return <VideoViewer workspaceId={workspaceId} relPath={relPath} />;
    case "text":
      return (
        <TextViewer
          workspaceId={workspaceId}
          relPath={relPath}
          language={mode.lang}
        />
      );
  }
}

/* ─────────────────────── mode detection ─────────────────────── */

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".ico",
  ".tiff",
  ".tif",
]);

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".m4v",
  ".webm",
  ".mov",
  ".ogv",
  ".ogg",
  ".mpg",
  ".mpeg",
  ".avi",
  ".mkv",
  ".3gp",
  ".3g2",
]);

/** File extension → Shiki bundled language. Anything not listed
 * falls through to `plaintext`, which still gets monospace +
 * line-aware rendering. The set covers languages that actually
 * appear in typical Grida workspaces — expand on demand rather than
 * eagerly bundling Shiki grammars we never touch. */
const EXT_TO_LANG: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "jsonc",
  py: "python",
  rs: "rust",
  go: "go",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  html: "html",
  htm: "html",
  xml: "xml",
  css: "css",
  scss: "scss",
  less: "less",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  lua: "lua",
  vue: "vue",
  svelte: "svelte",
  dockerfile: "dockerfile",
};

function detectFileMode(relPath: string): FileMode {
  const ext = getExtension(relPath); // includes the leading dot, lowercased
  if (ext === ".svg") return { kind: "svg-editor" };
  if (MARKDOWN_EXTENSIONS.has(ext)) return { kind: "markdown" };
  if (IMAGE_EXTENSIONS.has(ext)) return { kind: "image" };
  if (VIDEO_EXTENSIONS.has(ext)) return { kind: "video" };
  // Anything else → text view. Unknown extensions (or dotfiles like
  // `.gitignore`) fall back to plaintext — still readable. Truly
  // binary content surfaces as the agent sidecar's `file-not-utf8` error
  // inside the text viewer.
  const key = ext.startsWith(".") ? ext.slice(1) : ext;
  const lang = EXT_TO_LANG[key] ?? ("plaintext" as BundledLanguage);
  return { kind: "text", lang };
}

function getExtension(relPath: string): string {
  const name = relPath.split("/").pop() ?? relPath;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return ""; // no extension, or dotfile-without-suffix
  return name.slice(dot).toLowerCase();
}

/* ─────────────────────── crash fallback ─────────────────────── */

function ViewerCrashFallback({
  error,
  resetErrorBoundary,
  relPath,
}: FallbackProps & { relPath: string }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <AlertTriangleIcon className="size-6 text-destructive" />
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Viewer crashed</h2>
        <p className="font-mono text-[11px] text-muted-foreground">{relPath}</p>
      </div>
      {/* The error string is bounded width + truncated height so a long
          stack-like message doesn't push the recovery button off-screen
          when this fallback fills a small workspace pane. */}
      <pre className="max-h-32 w-full overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 px-3 py-2 text-left text-[11px] text-muted-foreground">
        {message}
      </pre>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={resetErrorBoundary}>
          Try again
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        If it keeps happening, close this tab from the strip above.
      </p>
    </div>
  );
}
