"use client";

import { useCallback, useEffect, useState } from "react";
import { fig2grida } from "@grida/io-figma/fig2grida-core";
import { io } from "@grida/io";
import { editor } from "@/grida-canvas";
import { useEditor, useEditorState } from "@/grida-canvas-react";
import { distro } from "@/grida-canvas-hosted/distro";

function validateExt(name: string) {
  const l = name.toLowerCase();
  return (
    l.endsWith(".fig") ||
    l.endsWith(".json") ||
    l.endsWith(".json.gz") ||
    l.endsWith(".zip")
  );
}

async function decompressGzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(buf));
  writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

/**
 * Renderer configuration for the refig embed canvas.
 *
 * These flags are applied to the WASM renderer after mount, before any
 * document is loaded. Values are intentionally narrow literals today —
 * widen to `boolean` once the feature graduates from "always-on".
 */
interface RefigRenderConfig {
  /**
   * Skip the Taffy flexbox layout engine during scene loading.
   *
   * Figma imports use absolute positioning — running layout on 100k+
   * nodes is the dominant cold-start cost (~25 s in WASM). Setting
   * this to `true` derives layout from schema positions instead.
   */
  cg_skip_layout: true;
  /**
   * Bake Figma's absoluteBoundingBox dimensions into TEXT nodes instead
   * of relying on layout-time text measurement.
   *
   * Paired with `cg_skip_layout` — without this, text nodes get 0×0
   * sizes because the layout engine (which would measure them) is skipped.
   */
  prefer_fixed_text_sizing: true;
}

const REFIG_RENDER_CONFIG: RefigRenderConfig = {
  cg_skip_layout: true,
  prefer_fixed_text_sizing: true,
};

export function useRefigEditor() {
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
  const [documentLoaded, setDocumentLoaded] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(
    null
  );

  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasElement(node);
  }, []);

  // Mount WASM eagerly — before any document is loaded into editor state.
  useEffect(() => {
    if (!canvasElement) {
      setCanvasReady(false);
      return;
    }

    let cancelled = false;
    setCanvasReady(false);
    const dpr = window.devicePixelRatio || 1;

    // Apply renderer config at init time (before mount creates the WASM surface).
    instance.__surfaceOptions = {
      use_embedded_fonts: true,
      config: {
        skip_layout: REFIG_RENDER_CONFIG.cg_skip_layout,
      },
    };

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

  // Fit camera when document/scene changes.
  useEffect(() => {
    if (!documentLoaded || !fileLabel || !canvasReady) return;
    queueMicrotask(() => {
      instance.camera.fit("<scene>");
    });
  }, [documentLoaded, fileLabel, canvasReady, sceneId, documentKey, instance]);

  const onFile = useCallback(
    async (file: File) => {
      if (!validateExt(file.name)) return;
      setLoading(true);
      setLoadError(null);
      try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const lower = file.name.toLowerCase();

        let input: Uint8Array | object;
        if (lower.endsWith(".json.gz")) {
          const decompressed = await decompressGzip(buf);
          input = JSON.parse(new TextDecoder().decode(decompressed)) as object;
        } else if (lower.endsWith(".json")) {
          input = JSON.parse(new TextDecoder().decode(bytes)) as object;
        } else {
          input = bytes;
        }

        const logMemory = (label: string) => {
          try {
            const perf = (performance as any).memory;
            if (perf) {
              const used = (perf.usedJSHeapSize / (1024 * 1024)).toFixed(1);
              const total = (perf.totalJSHeapSize / (1024 * 1024)).toFixed(1);
              const limit = (perf.jsHeapSizeLimit / (1024 * 1024)).toFixed(0);
              console.log(
                `[@grida/refig] JS heap (${label}): ${used}/${total} MB (limit ${limit} MB)`
              );
            }
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
        const {
          bytes: zipBytes,
          nodeCount,
          pageNames,
        } = fig2grida(input, {
          placeholder_for_missing_images: false,
          preserve_figma_ids: true,
          prefer_fixed_text_sizing:
            REFIG_RENDER_CONFIG.prefer_fixed_text_sizing,
        });
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

        const t2 = performance.now();
        const initState = editor.state.init({
          editable: false,
          document: loaded.document,
        });
        console.log(
          `[@grida/refig] editor.state.init: ${(performance.now() - t2).toFixed(0)}ms`
        );

        const t3 = performance.now();
        instance.commands.reset(initState, file.name);
        console.log(
          `[@grida/refig] reset (includes syncDocument): ${(performance.now() - t3).toFixed(0)}ms`
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
    },
    [instance]
  );

  const fonts = useEditorState(instance, (s) => s.webfontlist.items);

  return {
    editor: instance,
    fonts,
    canvasRef,
    canvasReady,
    loading,
    loadError,
    fileLabel,
    documentLoaded,
    documentKey,
    onFile,
  };
}

/**
 * Regex that matches the synthetic suffixes appended by io-figma when
 * `prefer_path_for_geometry` is true and fill/stroke geometries are
 * decomposed into child nodes.
 *
 * Patterns:
 * - `{figmaId}_fill_{N}`    — fill geometry child
 * - `{figmaId}_stroke_{N}`  — stroke geometry child
 */
const SYNTHETIC_SUFFIX_RE = /_(fill|stroke)_\d+$/;

/**
 * Regex for instance-clone IDs: `{prefix}::{counter}::{originalId}`.
 * The `::` separator is unique to clone IDs (never appears in Figma node IDs).
 * Captures the trailing original Figma ID after the last `::`.
 */
const INSTANCE_CLONE_RE = /^.+::(.+)$/;

/**
 * Decode a Grida node ID that may contain synthetic suffixes back to the
 * closest real Figma node ID. This is refig-specific logic and should only
 * be used in the embed/refig context where `preserve_figma_ids` is true.
 *
 * - `"42:17"` → `"42:17"` (real node, unchanged)
 * - `"42:17_fill_0"` → `"42:17"` (synthetic fill child → parent)
 * - `"42:17_stroke_1"` → `"42:17"` (synthetic stroke child → parent)
 * - `"42:17::0::5:3"` → `"5:3"` (instance clone → original)
 * - `"42:17::0::5:3_fill_0"` → `"5:3"` (instance clone + synthetic → original)
 * - `"scene-1"` → `"scene-1"` (non-Figma ID, unchanged)
 */
export function decodeSyntheticFigmaId(id: string): string {
  let decoded = id;

  // Strip instance-clone prefix: `{prefix}::{counter}::{originalId}` → `{originalId}`
  // The `::` delimiter never appears in Figma IDs, so its presence is
  // unambiguous. We take everything after the last `::`.
  const cloneMatch = decoded.match(INSTANCE_CLONE_RE);
  if (cloneMatch) {
    decoded = cloneMatch[1];
  }

  // Strip synthetic geometry suffix
  decoded = decoded.replace(SYNTHETIC_SUFFIX_RE, "");

  return decoded;
}

export { validateExt };
