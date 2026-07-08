"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_THEMES,
  parseDiffFromFile,
  preloadHighlighter,
  type FileDiffMetadata,
  type FileDiffOptions,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { CodeBlock } from "@app/ui/ai-elements/code-block";
import { cn } from "@app/ui/lib/utils";
import type { BundledLanguage } from "shiki";

type ToolFileDiffProps = {
  path?: string;
  oldContent: string;
  newContent: string;
  className?: string;
};

const COMPACT_DIFF_OPTIONS: FileDiffOptions<undefined> = {
  disableFileHeader: true,
  disableLineNumbers: true,
  diffStyle: "unified",
  diffIndicators: "classic",
  hunkSeparators: "simple",
  lineDiffType: "word",
  overflow: "scroll",
  tokenizeMaxLineLength: 1_000,
  tokenizeMaxLength: 50_000,
};

export function ToolFileDiff({
  path,
  oldContent,
  newContent,
  className,
}: ToolFileDiffProps) {
  const diff = useMemo(
    () => parseDiff(path ?? "file", oldContent, newContent),
    [path, oldContent, newContent]
  );
  const highlighterReady = useDiffHighlighterReady(path);

  if (diff.hunks.length === 0) {
    return (
      <div className="text-[11px] leading-4 text-muted-foreground">
        No content change.
      </div>
    );
  }

  if (!highlighterReady) {
    return (
      <div className="text-[11px] leading-4 text-muted-foreground">
        Rendering diff...
      </div>
    );
  }

  return (
    <FileDiff
      className={cn(
        "block max-h-56 overflow-auto rounded-sm border bg-muted/20 font-mono text-[11px] leading-4",
        className
      )}
      disableWorkerPool
      fileDiff={diff}
      options={COMPACT_DIFF_OPTIONS}
      style={{ fontSize: 11, lineHeight: "16px" }}
    />
  );
}

function useDiffHighlighterReady(path: string | undefined): boolean {
  const language = languageForPath(path);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    setReady(false);

    // `FileDiff` imperatively paints into a custom element. Mount it after the
    // async Shiki preload and an opened-content paint so the first render does
    // not race the collapsible's initial layout.
    preloadHighlighter({
      langs: [language],
      themes: [DEFAULT_THEMES.dark, DEFAULT_THEMES.light],
    })
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        firstFrame = window.requestAnimationFrame(() => {
          secondFrame = window.requestAnimationFrame(() => {
            if (!cancelled) setReady(true);
          });
        });
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [language]);

  return ready;
}

export function ToolFileContent({
  path,
  content,
  className,
}: {
  path?: string;
  content: string;
  className?: string;
}) {
  if (content.length === 0) {
    return (
      <div className="text-[11px] leading-4 text-muted-foreground">
        Empty file.
      </div>
    );
  }

  return (
    <CodeBlock
      code={content}
      language={languageForPath(path)}
      className={cn(
        "max-h-56 min-w-0 rounded-sm bg-muted/20",
        "[&>div]:max-h-56 [&>div]:bg-muted/20",
        "[&>div>div]:max-h-56 [&>div>div]:bg-muted/20 [&>div>div]:overscroll-contain",
        "[&>div>div>pre]:!w-max [&>div>div>pre]:!min-w-full [&>div>div>pre]:!bg-transparent",
        "[&_pre]:!p-2 [&_pre]:!text-[11px] [&_pre]:!leading-4",
        "[&_code]:!text-[11px] [&_code]:!leading-4",
        className
      )}
    />
  );
}

function parseDiff(
  path: string,
  oldContent: string,
  newContent: string
): FileDiffMetadata {
  return parseDiffFromFile(
    { name: path, contents: oldContent },
    { name: path, contents: newContent },
    { context: 2 }
  );
}

const LANGUAGE_BY_EXTENSION: Record<string, BundledLanguage> = {
  astro: "astro",
  c: "c",
  conf: "ini",
  css: "css",
  csv: "csv",
  graphql: "graphql",
  go: "go",
  h: "c",
  html: "html",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "jsonc",
  jsx: "jsx",
  latex: "latex",
  less: "less",
  gql: "graphql",
  cjs: "javascript",
  cts: "typescript",
  markdown: "markdown",
  md: "markdown",
  mdx: "mdx",
  mmd: "mermaid",
  mjs: "javascript",
  mts: "typescript",
  properties: "properties",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sass: "sass",
  scss: "scss",
  sh: "shellscript",
  sql: "sql",
  svelte: "svelte",
  svg: "xml",
  tex: "tex",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  txt: "markdown",
  vue: "vue",
  xml: "xml",
  yml: "yaml",
  yaml: "yaml",
};

function languageForPath(path: string | undefined): BundledLanguage {
  if (!path) return "markdown";
  const name = path.split(/[\\/]/).pop() ?? path;
  const lower = name.toLowerCase();
  if (lower === "dockerfile" || lower.endsWith(".dockerfile")) {
    return "dockerfile";
  }
  if (lower === ".env" || lower.startsWith(".env.")) {
    return "properties";
  }
  const ext = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  return LANGUAGE_BY_EXTENSION[ext] ?? "markdown";
}
