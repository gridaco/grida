"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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

function RefigCanvas({
  canvasRef,
}: {
  canvasRef: (n: HTMLCanvasElement | null) => void;
}) {
  const dpr = useDPR();
  return (
    <WithSize
      className="w-full h-full max-w-full max-h-full"
      style={{ contain: "strict" }}
    >
      {({ width, height }) => (
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
      )}
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
          console.log("[refig-view] WASM mount complete");
          setCanvasReady(true);
        }
      })
      .catch((err) => {
        console.error("[refig-view] WASM mount failed:", err);
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
              `[refig-view] JS heap (${label}): ${used}/${total} MB (limit ${limit} MB)`
            );
          }
          // WASM heap
          const scene = instance.wasmScene;
          if (scene) {
            const heap = (scene as any).module?.HEAP8;
            if (heap) {
              const mb = (heap.buffer.byteLength / (1024 * 1024)).toFixed(1);
              console.log(
                `[refig-view] WASM heap (${label}): ${mb} MB`
              );
            }
          }
        } catch {}
      };

      const t0 = performance.now();
      const { bytes: zipBytes, nodeCount, pageNames } = fig2grida(input);
      console.log(
        `[refig-view] fig2grida: ${pageNames.length} page(s), ${nodeCount} nodes in ${(performance.now() - t0).toFixed(0)}ms`
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
        `[refig-view] io.load: ${Object.keys(loaded.document.nodes).length} nodes in ${(performance.now() - t1).toFixed(0)}ms`
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
      console.error("[refig-view]", e);
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
        <div className="flex flex-col h-dvh w-screen max-w-none min-w-0 overflow-hidden bg-background">
          <header className="flex flex-wrap items-center gap-3 px-4 py-2 border-b shrink-0">
            <Link
              href="/canvas"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <GridaLogo className="size-4" />
            </Link>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold font-mono">
                tools/refig-view
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {documentLoaded
                  ? `Read-only · ${fileLabel}`
                  : "Drop a .fig, REST API JSON, or REST archive ZIP to preview"}
              </span>
            </div>
            {documentLoaded && (
              <>
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
            <div className="px-4 py-2 text-sm text-destructive border-b shrink-0">
              {loadError}
            </div>
          )}

          <div
            className="flex-1 min-h-0 relative"
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
            {/* WASM canvas — always mounted so WebGL init happens before document load */}
            <ViewportRoot className="relative w-full h-full overflow-hidden">
              <EditorSurface />
              <RefigCanvas canvasRef={handleCanvasRef} />
            </ViewportRoot>

            {/* Drop zone overlay — shown until a document is loaded */}
            {!documentLoaded && (
              <div
                className={cn(
                  "absolute inset-0 flex flex-col items-center justify-center p-8 transition-colors bg-background",
                  dropActive && "bg-muted/40"
                )}
              >
                <div
                  className={cn(
                    "flex flex-col items-center justify-center gap-4 w-full max-w-lg rounded-xl border-2 border-dashed px-8 py-14 text-center transition-colors",
                    dropActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 bg-muted/20"
                  )}
                >
                  <p className="text-sm font-medium text-foreground">
                    Drag and drop a file here
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    <span className="font-mono">.fig</span> export, Figma{" "}
                    <span className="font-mono">GET /v1/files/:key</span> JSON,
                    or REST archive <span className="font-mono">.zip</span>
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
      </StandaloneDocumentEditor>
    </FontFamilyListProvider>
  );
}

export default function RefigViewPage() {
  return (
    <TooltipProvider>
      <RefigViewInner />
    </TooltipProvider>
  );
}
