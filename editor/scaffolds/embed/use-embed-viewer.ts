"use client";

import { useCallback, useEffect, useState } from "react";
import { io } from "@grida/io";
import { editor } from "@/grida-canvas";
import { useEditor, useEditorState } from "@/grida-canvas-react";
import { distro } from "@/grida-canvas-hosted/distro";

/**
 * File converter function signature.
 *
 * Converts raw file bytes into a `.grida` archive (ZIP containing FlatBuffers).
 * Used by format-specific embed viewers (e.g. Figma) to plug into the shared
 * viewer pipeline.
 *
 * @param input - Raw bytes (for binary formats) or parsed object (for JSON formats)
 * @returns An object with the `.grida` archive bytes and metadata
 */
export type FileConverter = (input: Uint8Array | object) => {
  bytes: Uint8Array;
  nodeCount: number;
  pageNames: string[];
};

/**
 * Renderer configuration for the embed canvas.
 */
export interface EmbedRenderConfig {
  /**
   * Skip the flexbox layout engine during scene loading.
   */
  cg_skip_layout: boolean;
}

const DEFAULT_RENDER_CONFIG: EmbedRenderConfig = {
  cg_skip_layout: false,
};

/**
 * Options for the embed viewer hook.
 */
export interface UseEmbedViewerOptions {
  /**
   * Optional file converter for non-native formats (e.g. Figma).
   * When provided, files with extensions `.fig`, `.json`, `.json.gz`, `.zip`
   * are run through this converter before being loaded.
   *
   * When not provided, only native `.grida` and `.grida1` files are supported.
   */
  converter?: FileConverter;

  /**
   * Renderer configuration. Defaults to `{ cg_skip_layout: false }`.
   */
  renderConfig?: EmbedRenderConfig;
}

// Extensions that require conversion (Figma pipeline)
const FIGMA_EXT_RE = /\.(fig|deck|json\.gz|json|zip)$/i;

// Extensions natively supported by io.load
const NATIVE_EXT_RE = /\.(grida|grida1)$/i;

/**
 * Validates that a filename has a supported extension.
 */
export function validateExt(name: string, hasConverter: boolean): boolean {
  if (NATIVE_EXT_RE.test(name)) return true;
  if (hasConverter && FIGMA_EXT_RE.test(name)) return true;
  return false;
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
 * General-purpose embed viewer hook.
 *
 * Handles WASM mount, file loading (native `.grida`/`.grida1` or converted
 * formats via an optional converter), editor state init, and camera fit.
 *
 * This is the shared foundation for both the general-purpose embed (`/embed/v1/`)
 * and the Figma-specific embed (`/embed/v1/figma`).
 */
export function useEmbedViewer(options: UseEmbedViewerOptions = {}) {
  const { converter, renderConfig = DEFAULT_RENDER_CONFIG } = options;

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

    instance.__surfaceOptions = {
      use_embedded_fonts: true,
      config: {
        skip_layout: renderConfig.cg_skip_layout,
      },
    };

    instance
      .mount(canvasElement, dpr)
      .then(() => {
        if (!cancelled) {
          console.log("[@grida/embed] WASM mount complete");
          setCanvasReady(true);
        }
      })
      .catch((err) => {
        console.error("[@grida/embed] WASM mount failed:", err);
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

  /**
   * Load a loaded document into the editor state.
   */
  const loadDocument = useCallback(
    (loaded: io.LoadedDocument, filename: string) => {
      const t2 = performance.now();
      const initState = editor.state.init({
        editable: false,
        document: loaded.document,
      });
      console.log(
        `[@grida/embed] editor.state.init: ${(performance.now() - t2).toFixed(0)}ms`
      );

      const t3 = performance.now();
      instance.commands.reset(initState, filename);
      console.log(
        `[@grida/embed] reset (includes syncDocument): ${(performance.now() - t3).toFixed(0)}ms`
      );

      if (loaded.assets?.images) {
        instance.loadImages(loaded.assets.images);
      }

      setFileLabel(filename);
      setDocumentLoaded(true);
    },
    [instance]
  );

  const onFile = useCallback(
    async (file: File) => {
      const hasConverter = !!converter;
      if (!validateExt(file.name, hasConverter)) return;
      setLoading(true);
      setLoadError(null);
      try {
        const lower = file.name.toLowerCase();

        // Native .grida / .grida1 — load directly via io.load
        if (NATIVE_EXT_RE.test(lower)) {
          const t0 = performance.now();
          const loaded = await io.load(file);
          console.log(
            `[@grida/embed] io.load (native): ${Object.keys(loaded.document.nodes).length} nodes in ${(performance.now() - t0).toFixed(0)}ms`
          );
          loadDocument(loaded, file.name);
          return;
        }

        // Converted formats (Figma etc.) — requires converter
        if (!converter) {
          throw new Error(
            `Unsupported file format: "${file.name}". This embed only supports .grida and .grida1 files.`
          );
        }

        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);

        let input: Uint8Array | object;
        if (lower.endsWith(".json.gz")) {
          const decompressed = await decompressGzip(buf);
          input = JSON.parse(new TextDecoder().decode(decompressed)) as object;
        } else if (lower.endsWith(".json")) {
          input = JSON.parse(new TextDecoder().decode(bytes)) as object;
        } else {
          input = bytes;
        }

        const t0 = performance.now();
        const { bytes: zipBytes, nodeCount, pageNames } = converter(input);
        console.log(
          `[@grida/embed] convert: ${pageNames.length} page(s), ${nodeCount} nodes in ${(performance.now() - t0).toFixed(0)}ms`
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
          `[@grida/embed] io.load: ${Object.keys(loaded.document.nodes).length} nodes in ${(performance.now() - t1).toFixed(0)}ms`
        );

        loadDocument(loaded, file.name);
      } catch (e) {
        console.error("[@grida/embed]", e);
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [converter, loadDocument]
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
