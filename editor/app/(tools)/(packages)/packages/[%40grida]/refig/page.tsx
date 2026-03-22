"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NpmLogoIcon } from "@/components/logos/npm";
import { fig2grida } from "@grida/io-figma/fig2grida-core";
import { io } from "@grida/io";
import { editor } from "@/grida-canvas";
import {
  StandaloneDocumentEditor,
  ViewportRoot,
  EditorSurface,
  useEditor,
  useCurrentEditor,
  useEditorState,
} from "@/grida-canvas-react";
import { distro } from "@/grida-canvas-hosted/distro";
import { GridaLogo } from "@/components/grida-logo";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WithSize } from "@/grida-canvas-react/viewport/size";
import { useDPR } from "@/grida-canvas-react/viewport/hooks/use-dpr";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { cn } from "@/components/lib/utils";

/** Static marketing / SEO column (paired with the desktop demo panel). */
function RefigMarketing() {
  return (
    <article
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "mx-auto w-full max-w-md px-4 py-6 md:mx-0 md:w-full",
        "prose-headings:font-semibold prose-h2:mt-6 prose-h2:mb-2",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        /* Inline code: use surface tokens so dark/light match the app (prose-invert skews code colors). */
        "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-px prose-code:font-mono prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none"
      )}
    >
      <header>
        <p className="not-prose mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Package
        </p>
        <h1 className="not-prose mb-2 font-mono text-xl font-bold tracking-tight">
          @grida/refig
        </h1>
        <p>
          Headless Figma renderer — render Figma documents to{" "}
          <strong>PNG, JPEG, WebP, PDF, or SVG</strong> in Node.js (no browser
          required) or directly in the browser. Deterministic exports, offline{" "}
          <code>.fig</code> support, CLI and library API.
        </p>
        <p className="not-prose md:hidden">
          <span className="block max-w-md rounded-lg border border-dashed border-border/80 bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            The interactive Grida Canvas preview needs a large screen. Open this
            page on a tablet or desktop to drop files into the live demo.
          </span>
        </p>
        <div className="not-prose flex flex-wrap gap-2 pt-2">
          <Link
            href="/docs/packages/@grida/refig"
            className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            Read docs
          </Link>
          <a
            href="https://www.npmjs.com/package/@grida/refig"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
          >
            <NpmLogoIcon className="size-4" />
            npm
          </a>
        </div>
      </header>

      <section aria-labelledby="refig-demo-video-heading">
        <h2 id="refig-demo-video-heading">Demo video</h2>
        <div className="not-prose">
          <div
            className="relative overflow-hidden rounded-lg border bg-muted"
            style={{ paddingBottom: "56.25%" }}
          >
            <iframe
              src="https://player.vimeo.com/video/1165652748?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=0&muted=0&loop=0"
              className="absolute top-0 left-0 h-full w-full border-0"
              title="refig (headless Figma renderer) demo"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="refig-features-heading">
        <h2 id="refig-features-heading">Key features</h2>
        <ul>
          {[
            "Node.js and browser entrypoints",
            "CLI and library API",
            "Offline rendering from .fig files",
            "REST API JSON input",
            "Deterministic, CI-friendly exports",
          ].map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="refig-quickstart-node-heading">
        <h2 id="refig-quickstart-node-heading">Quick start (Node.js)</h2>
        <pre className="not-prose overflow-x-auto rounded-lg border border-border/50 bg-muted p-3 text-xs leading-relaxed text-foreground">
          <code className="block font-mono whitespace-pre">{`import { writeFileSync } from "node:fs";
import { FigmaDocument, FigmaRenderer } from "@grida/refig";

const doc = FigmaDocument.fromFile("./design.fig");
const renderer = new FigmaRenderer(doc);

const { data } = await renderer.render("1:23", { format: "png", scale: 2 });
writeFileSync("out.png", data);
renderer.dispose();`}</code>
        </pre>
      </section>

      <section aria-labelledby="refig-quickstart-cli-heading">
        <h2 id="refig-quickstart-cli-heading">Quick start (CLI)</h2>
        <pre className="not-prose overflow-x-auto rounded-lg border border-border/50 bg-muted p-3 text-xs leading-relaxed text-foreground">
          <code className="block font-mono whitespace-pre">{`# Render a single node
npx @grida/refig ./design.fig --node "1:23" --out ./out.png

# Export everything with Figma export presets
npx @grida/refig ./design.fig --export-all --out ./exports`}</code>
        </pre>
      </section>

      <section>
        <p className="pb-2">
          For full documentation and API reference, see{" "}
          <Link href="/docs/packages/@grida/refig">the refig docs</Link>.
        </p>
      </section>

      <section
        aria-labelledby="refig-browser-preview-heading"
        className="hidden border-t border-border/60 pt-6 md:block"
      >
        <h2 id="refig-browser-preview-heading">Live preview</h2>
        <p>
          On the right, drop a <code>.fig</code> export, Figma{" "}
          <code>GET /v1/files/:key</code> JSON, or REST archive{" "}
          <code>.zip</code> into the Grida Canvas WASM surface (read-only).
        </p>
      </section>
    </article>
  );
}

function RefigCanvas({
  canvasRef,
}: {
  canvasRef: (n: HTMLCanvasElement | null) => void;
}) {
  const dpr = useDPR();
  return (
    <WithSize
      className="w-full h-full max-w-full max-h-full min-h-px min-w-px"
      style={{ contain: "strict" }}
    >
      {({ width, height }) =>
        width > 0 && height > 0 ? (
          <canvas
            id="canvas"
            ref={canvasRef}
            width={width * dpr}
            height={height * dpr}
            style={{
              width,
              height,
            }}
          />
        ) : null
      }
    </WithSize>
  );
}

function SceneSelector() {
  const ed = useCurrentEditor();
  const scenesRef = useEditorState(ed, (s) => s.document.scenes_ref);
  const sceneId = useEditorState(ed, (s) => s.scene_id);
  const nodes = useEditorState(ed, (s) => s.document.nodes);

  if (scenesRef.length <= 1) {
    return null;
  }

  return (
    <Select
      value={sceneId ?? ""}
      onValueChange={(v) => {
        ed.commands.loadScene(v);
      }}
    >
      <SelectTrigger className="w-[min(100%,280px)] h-8 text-xs">
        <SelectValue placeholder="Scene" />
      </SelectTrigger>
      <SelectContent>
        {scenesRef.map((id) => {
          const n = nodes[id];
          const label =
            n && "name" in n && typeof n.name === "string" ? n.name : id;
          return (
            <SelectItem key={id} value={id}>
              {label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function RefigViewInner() {
  const instance = useEditor(
    {
      ...distro.playground.EMPTY_DOCUMENT,
      editable: false,
    },
    "canvas"
  );

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  /** After a successful parse + `reset`, show the WASM canvas (not before). */
  const [documentLoaded, setDocumentLoaded] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasElement(node);
  }, []);

  // Mount WASM eagerly — before any document is loaded into editor state.
  // This ensures the WebGL surface + fonts initialize with an empty scene,
  // avoiding OOM when syncDocument runs on a large document during bind.
  useEffect(() => {
    if (!canvasElement) {
      setCanvasReady(false);
      return;
    }

    let cancelled = false;
    setCanvasReady(false);
    const dpr = window.devicePixelRatio || 1;

    instance
      .mount(canvasElement, dpr)
      .then(() => {
        if (!cancelled) {
          console.log("[@grida/refig] WASM mount complete");
          setCanvasReady(true);
        }
      })
      .catch((err) => {
        console.error("[@grida/refig] WASM mount failed:", err);
        setLoadError(
          `Failed to mount WASM canvas: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    return () => {
      cancelled = true;
    };
  }, [canvasElement, instance]);

  useEffect(() => {
    if (!canvasReady) return;
    instance.surface.surfaceSetTool({ type: "hand" });
  }, [canvasReady, instance]);

  const sceneId = useEditorState(instance, (s) => s.scene_id);
  const documentKey = useEditorState(instance, (s) => s.document_key);

  useEffect(() => {
    if (!documentLoaded || !fileLabel || !canvasReady) return;
    queueMicrotask(() => {
      instance.camera.fit("*");
    });
  }, [documentLoaded, fileLabel, canvasReady, sceneId, documentKey, instance]);

  const validateExt = (name: string) => {
    const l = name.toLowerCase();
    return l.endsWith(".fig") || l.endsWith(".json") || l.endsWith(".zip");
  };

  const onFile = async (file: File) => {
    setLoading(true);
    setLoadError(null);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const lower = file.name.toLowerCase();

      // For JSON files, parse and pass as object; otherwise pass bytes.
      // fig2grida auto-detects .fig vs REST archive ZIP.
      let input: Uint8Array | object;
      if (lower.endsWith(".json")) {
        input = JSON.parse(new TextDecoder().decode(bytes)) as object;
      } else {
        input = bytes;
      }

      const logMemory = (label: string) => {
        try {
          // JS heap
          const perf = (performance as any).memory;
          if (perf) {
            const used = (perf.usedJSHeapSize / (1024 * 1024)).toFixed(1);
            const total = (perf.totalJSHeapSize / (1024 * 1024)).toFixed(1);
            const limit = (perf.jsHeapSizeLimit / (1024 * 1024)).toFixed(0);
            console.log(
              `[@grida/refig] JS heap (${label}): ${used}/${total} MB (limit ${limit} MB)`
            );
          }
          // WASM heap
          const scene = instance.wasmScene;
          if (scene) {
            const heap = (scene as any).module?.HEAP8;
            if (heap) {
              const mb = (heap.buffer.byteLength / (1024 * 1024)).toFixed(1);
              console.log(`[@grida/refig] WASM heap (${label}): ${mb} MB`);
            }
          }
        } catch {}
      };

      const t0 = performance.now();
      const { bytes: zipBytes, nodeCount, pageNames } = fig2grida(input);
      console.log(
        `[@grida/refig] fig2grida: ${pageNames.length} page(s), ${nodeCount} nodes in ${(performance.now() - t0).toFixed(0)}ms`
      );

      const blob = new Blob([new Uint8Array(zipBytes)], {
        type: "application/zip",
      });
      const gridaFile = new File([blob], "imported.grida", {
        type: "application/zip",
      });

      const t1 = performance.now();
      const loaded = await io.load(gridaFile);
      console.log(
        `[@grida/refig] io.load: ${Object.keys(loaded.document.nodes).length} nodes in ${(performance.now() - t1).toFixed(0)}ms`
      );

      logMemory("before reset");

      instance.commands.reset(
        editor.state.init({
          editable: false,
          document: loaded.document,
        }),
        file.name
      );

      logMemory("after reset");

      if (loaded.assets?.images) {
        instance.loadImages(loaded.assets.images);
      }

      logMemory("after loadImages");

      setFileLabel(file.name);
      setDocumentLoaded(true);
    } catch (e) {
      console.error("[@grida/refig]", e);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const fonts = useEditorState(instance, (s) => s.webfontlist.items);

  return (
    <FontFamilyListProvider fonts={fonts}>
      <StandaloneDocumentEditor editor={instance}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".fig,.json,.zip,application/json,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f && validateExt(f.name)) void onFile(f);
          }}
        />
        <div
          className={cn(
            "flex min-w-0 w-full bg-background",
            documentLoaded
              ? "h-dvh flex-col overflow-hidden"
              : "min-h-dvh flex-col md:h-dvh md:flex-row md:overflow-hidden"
          )}
        >
          {!documentLoaded && (
            <aside className="w-full shrink-0 border-b md:w-md md:border-b-0 md:border-r md:min-h-0 md:max-h-dvh md:overflow-y-auto">
              <RefigMarketing />
            </aside>
          )}

          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              documentLoaded
                ? "overflow-hidden"
                : "hidden md:flex md:min-h-0 bg-linear-to-b from-muted/25 via-background to-background"
            )}
          >
            <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-2.5 backdrop-blur-sm">
              <Link
                href="/packages"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <GridaLogo className="size-4" />
              </Link>
              <div className="flex min-w-0 flex-col">
                <span className="font-mono text-sm font-bold">
                  packages/@grida/refig
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {documentLoaded
                    ? `Read-only · ${fileLabel}`
                    : "Canvas preview — drop a file"}
                </span>
              </div>
              {documentLoaded && (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Link
                      href="/docs/packages/@grida/refig"
                      className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Docs
                    </Link>
                    <span className="text-muted-foreground/50" aria-hidden>
                      ·
                    </span>
                    <a
                      href="https://www.npmjs.com/package/@grida/refig"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      npm
                    </a>
                  </div>
                  <SceneSelector />
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {loading ? "Loading…" : "Open other…"}
                    </Button>
                  </div>
                </>
              )}
            </header>

            {loadError && (
              <div className="shrink-0 border-b px-4 py-2 text-sm text-destructive">
                {loadError}
              </div>
            )}

            <div
              className="relative min-h-0 flex-1"
              onDragEnter={(e) => {
                e.preventDefault();
                if (e.dataTransfer.types.includes("Files")) setDropActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.types.includes("Files")) setDropActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (e.currentTarget === e.target) setDropActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropActive(false);
                const f = e.dataTransfer.files?.[0];
                if (f && validateExt(f.name)) void onFile(f);
              }}
            >
              {/* WASM canvas — mounted before document load so WebGL initializes on an empty scene */}
              <ViewportRoot className="relative h-full w-full overflow-hidden">
                <EditorSurface />
                <RefigCanvas canvasRef={handleCanvasRef} />
              </ViewportRoot>

              {!documentLoaded && (
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center p-8 transition-colors",
                    dropActive ? "bg-muted/50" : "bg-background/85"
                  )}
                >
                  <div
                    className={cn(
                      "flex w-full max-w-lg flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-colors",
                      dropActive
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-muted-foreground/30 bg-muted/30 shadow-inner"
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">
                      Drop a file on the canvas
                    </p>
                    <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                      <span className="font-mono">.fig</span> export, Figma{" "}
                      <span className="font-mono">GET /v1/files/:key</span>{" "}
                      JSON, or REST archive{" "}
                      <span className="font-mono">.zip</span>
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={loading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {loading ? "Loading…" : "Choose file…"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </StandaloneDocumentEditor>
    </FontFamilyListProvider>
  );
}

export default function Page() {
  return (
    <TooltipProvider>
      <RefigViewInner />
    </TooltipProvider>
  );
}
