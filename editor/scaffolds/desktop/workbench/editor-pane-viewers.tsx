/**
 * Read-only viewers for the workspace file tab.
 *
 * Four rendering paths, all read-only — the workspace pane only
 * ships editing for `.svg` (see `file-tab-svg-editor.tsx`); everything
 * else is "look but don't touch":
 *
 *   - Markdown (.md, .markdown) → Streamdown default rendering.
 *   - Image (.png/.jpg/.gif/.webp/…) → base64 → `<img data:…>`. The
 *     agent sidecar path is binary-safe (`readFileBytes`); we don't try to
 *     decode raw bytes in the renderer.
 *   - Video (.mp4/.webm/.mov/…) → base64 → `<video data:… controls>`.
 *   - Text (everything else) → Shiki-highlighted code block, with
 *     `plaintext` as the language fallback so unrecognised
 *     extensions still render readably.
 *
 * Each viewer owns its own load-state (`useFileText` / `useFileBytes`
 * helpers below). Errors surface inline — the agent sidecar's
 * `file-not-utf8`, `file-too-large`, etc. messages are already
 * human-readable, so we don't try to second-guess them here.
 */
"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { AlertCircleIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { type BundledLanguage, codeToHtml } from "shiki";
import { cn } from "@/components/lib/utils/index";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";

/* ─────────────────────── shared load helpers ──────────────────── */

type TextState =
  | { kind: "loading" }
  | { kind: "ready"; content: string }
  | { kind: "error"; message: string };

function useFileText(workspaceId: string, relPath: string): TextState {
  const [state, setState] = useState<TextState>({ kind: "loading" });
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
  return state;
}

type BytesState =
  | { kind: "loading" }
  | { kind: "ready"; base64: string }
  | { kind: "error"; message: string };

function useFileBytes(workspaceId: string, relPath: string): BytesState {
  const [state, setState] = useState<BytesState>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    workspacesNs
      .readFileBytes(workspaceId, relPath)
      .then((r) => {
        if (cancelled) return;
        setState({ kind: "ready", base64: r.base64 });
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
  return state;
}

function LoadingState({ relPath }: { relPath: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs italic text-muted-foreground">
      Loading {relPath}…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
      <AlertCircleIcon className="size-5 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
      <p className="text-xs text-muted-foreground">
        The viewer reads files up to 1 MiB. Larger or unreadable files are
        rejected by the agent sidecar.
      </p>
    </div>
  );
}

/* ─────────────────────────── markdown ─────────────────────────── */

export function MarkdownViewer({
  workspaceId,
  relPath,
}: {
  workspaceId: string;
  relPath: string;
}) {
  const state = useFileText(workspaceId, relPath);
  if (state.kind === "loading") return <LoadingState relPath={relPath} />;
  if (state.kind === "error") return <ErrorState message={state.message} />;
  return (
    <div className="h-full w-full overflow-auto bg-background">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <Streamdown>{state.content}</Streamdown>
      </div>
    </div>
  );
}

/* ────────────────────────── binary media ───────────────────────── */

/** Lowercase extension → mime type. Anything not listed falls back
 * to `application/octet-stream`, which means the browser still tries
 * to render the data URL via its own sniffing — usually fine for
 * common formats but not guaranteed. */
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
};

const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
  ogg: "video/ogg",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
};

function inferMime(relPath: string): string {
  const name = relPath.split("/").pop() ?? relPath;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  const ext = name.slice(dot + 1).toLowerCase();
  return IMAGE_MIME[ext] ?? VIDEO_MIME[ext] ?? "application/octet-stream";
}

export function ImageViewer({
  workspaceId,
  relPath,
}: {
  workspaceId: string;
  relPath: string;
}) {
  const state = useFileBytes(workspaceId, relPath);
  if (state.kind === "loading") return <LoadingState relPath={relPath} />;
  if (state.kind === "error") return <ErrorState message={state.message} />;
  const src = `data:${inferMime(relPath)};base64,${state.base64}`;
  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-muted/30 p-4">
      {/* `max-w-full max-h-full object-contain` keeps the image fully
          visible within whatever the pane is — no surprise overflow,
          no upscaling. Plain `<img>` — workspace files served from
          disk via `bridge.workspaces.readFileBytes` as data URLs;
          `next/image` would add nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={relPath}
        className="max-h-full max-w-full object-contain"
        // Native draggable defaults to true for images — disable so
        // accidental drags don't initiate a download dialog.
        draggable={false}
      />
    </div>
  );
}

export function VideoViewer({
  workspaceId,
  relPath,
}: {
  workspaceId: string;
  relPath: string;
}) {
  const state = useFileBytes(workspaceId, relPath);
  if (state.kind === "loading") return <LoadingState relPath={relPath} />;
  if (state.kind === "error") return <ErrorState message={state.message} />;
  const src = `data:${inferMime(relPath)};base64,${state.base64}`;
  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-muted/30 p-4">
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}

/* ────────────────────────────── text ──────────────────────────── */

export function TextViewer({
  workspaceId,
  relPath,
  language,
}: {
  workspaceId: string;
  relPath: string;
  language: BundledLanguage;
}) {
  const state = useFileText(workspaceId, relPath);
  if (state.kind === "loading") return <LoadingState relPath={relPath} />;
  if (state.kind === "error") return <ErrorState message={state.message} />;
  return <ShikiBlock code={state.content} language={language} />;
}

/** Shiki-highlighted full-pane code block. Renders the light and
 * dark themes side-by-side via `dark:` visibility — matches the
 * existing `<CodeBlock />` ai-element pattern. */
function ShikiBlock({
  code,
  language,
}: {
  code: string;
  language: BundledLanguage;
}) {
  const [light, setLight] = useState<string>("");
  const [dark, setDark] = useState<string>("");
  // Guard against late `setState` if the user switches tabs before the
  // highlighter resolves. (`codeToHtml` is async because Shiki lazy-
  // loads grammars on first use.)
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    Promise.all([
      codeToHtml(code, { lang: language, theme: "one-light" }),
      codeToHtml(code, { lang: language, theme: "one-dark-pro" }),
    ])
      .then(([l, d]) => {
        if (!live.current) return;
        setLight(l);
        setDark(d);
      })
      .catch(() => {
        // Highlighting failures are non-fatal — fall back to a plain
        // <pre>. The user still gets readable text.
        if (!live.current) return;
        const escaped = code
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const fallback = `<pre><code>${escaped}</code></pre>`;
        setLight(fallback);
        setDark(fallback);
      });
    return () => {
      live.current = false;
    };
  }, [code, language]);
  // Shared Shiki container styling for both theme blocks. `grida-code-lines`
  // adds the line-number gutter (see app/ui.css), sized by `--ln-w` so the
  // widest line number never clips and the code stays aligned.
  const surface = cn(
    "grida-code-lines [&>pre]:m-0 [&>pre]:min-h-full [&>pre]:bg-background!",
    "[&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-xs",
    "[&_code]:font-mono [&_code]:text-xs"
  );
  const gutterStyle = {
    // Digit count + 1ch of breathing room; CSS floors it at 2.5rem.
    "--ln-w": `${String(code.split("\n").length).length + 1}ch`,
  } as CSSProperties;

  return (
    <div className="h-full w-full overflow-auto bg-background text-foreground">
      <div
        className={cn("dark:hidden", surface)}
        style={gutterStyle}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output.
        dangerouslySetInnerHTML={{ __html: light }}
      />
      <div
        className={cn("hidden dark:block", surface)}
        style={gutterStyle}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output.
        dangerouslySetInnerHTML={{ __html: dark }}
      />
    </div>
  );
}
