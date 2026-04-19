/**
 * @grida/refig — shared core (no node:fs, no DOM)
 *
 * This module is environment-agnostic. Both the Node and browser entrypoints
 * re-export everything from here.
 */

import type { ExportSetting } from "@figma/rest-api-spec";
import { createCanvas, type Canvas, type types } from "@grida/canvas-wasm";
import { io } from "@grida/io";
import { iofigma } from "@grida/io-figma";
import {
  restJsonToGridaDocument,
  figFileToGridaDocument,
  type GridaDocumentResult,
} from "@grida/io-figma/fig2grida-core";
import grida from "@grida/schema";
import {
  ensureFigmaDefaultFonts,
  type FigmaDefaultFontsCanvas,
} from "./figma-default-fonts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RefigRenderFormat = "png" | "jpeg" | "webp" | "pdf" | "svg";

export interface RefigRendererOptions {
  /**
   * When enabled, the renderer loads the embedded default fonts.
   * @default true
   */
  useEmbeddedFonts?: boolean;

  /**
   * When true (default), the renderer ensures Figma default fonts (Inter, Noto Sans KR/JP/SC, etc.)
   * are loaded from CDN and registered with the canvas before any scene is loaded.
   * Reduces tofu for mixed-script and CJK text. Set to false to skip (e.g. to avoid network or use only embedded fonts).
   * Custom fonts remain the user's responsibility.
   * @default true
   */
  loadFigmaDefaultFonts?: boolean;

  /**
   * Map of Figma image ref (hash) to image bytes.
   * Used for REST API and .fig input so IMAGE fills render correctly.
   * Ref must match document references (e.g. 40-char hex for .fig, Figma image fill hash for REST).
   */
  images?: Record<string, Uint8Array>;

  /**
   * Custom fonts keyed by family name. Use the family name returned by
   * `listFontFamilies()` (e.g. from Figma's `style.font_family`). Pass one or
   * more font files per family; the canvas resolves the correct face per
   * text style. Skip Figma defaults (Inter, Noto Sans KR/JP/SC, etc.) —
   * those are loaded by `loadFigmaDefaultFonts`.
   */
  fonts?: Record<string, Uint8Array | Uint8Array[]>;
}

export interface RefigRenderOptions {
  format: RefigRenderFormat;
  width?: number;
  height?: number;
  scale?: number;
}

export interface RefigRenderResult {
  data: Uint8Array;
  format: RefigRenderFormat;
  mimeType: string;
  nodeId: string;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// FigmaDocument
// ---------------------------------------------------------------------------

type FigmaJsonDocument = Record<string, unknown>;

type FigFileDocument = ReturnType<typeof iofigma.kiwi.parseFile>;

function isFigFileDocument(value: unknown): value is FigFileDocument {
  return (
    value != null &&
    typeof value === "object" &&
    "pages" in value &&
    "metadata" in value &&
    Array.isArray((value as FigFileDocument).pages)
  );
}

export class FigmaDocument {
  readonly sourceType: "fig-file" | "rest-api-json";

  /**
   * For "fig-file" this is the raw bytes (Uint8Array) or a pre-parsed FigFileDocument
   * (e.g. from parseFileFromStream for large ZIP files).
   * For "rest-api-json" this is the parsed REST API document JSON.
   */
  readonly payload: Uint8Array | FigmaJsonDocument | FigFileDocument;

  /** Cached parsed FigFile (.fig only). */
  private _figFile?: FigFileDocument;

  /**
   * Cache of ResolvedScene per rootNodeId. REST with images is not cached.
   * Bounded to avoid unbounded memory growth in --export-all flows.
   */
  private _sceneCache = new Map<string, ResolvedScene>();

  /** Max cached scenes; evicts LRU when exceeded. */
  private static readonly _MAX_SCENE_CACHE = 64;

  /**
   * @param input Raw `.fig` bytes (Uint8Array), a pre-parsed FigFileDocument
   *              (e.g. from parseFileFromStream for large files), or REST JSON.
   *
   * For file-path convenience in Node, use `FigmaDocument.fromFile()` from
   * the `@grida/refig` entrypoint.
   */
  constructor(input: Uint8Array | FigmaJsonDocument | FigFileDocument) {
    if (input instanceof Uint8Array) {
      this.sourceType = "fig-file";
      this.payload = input;
      return;
    }

    if (isFigFileDocument(input)) {
      this.sourceType = "fig-file";
      this.payload = input;
      this._figFile = input;
      return;
    }

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error(
        "FigmaDocument: input must be a Uint8Array, FigFileDocument, or REST JSON object"
      );
    }

    this.sourceType = "rest-api-json";
    this.payload = input;
  }

  /**
   * Resolve document to Grida IR (scene JSON + images to register).
   * On-demand, cached when deterministic (no images for REST).
   * Cache is bounded (LRU eviction) to avoid OOM in --export-all flows.
   * @internal
   */
  _resolve(
    rootNodeId?: string,
    images?: Record<string, Uint8Array>
  ): ResolvedScene {
    const cacheKey = rootNodeId ?? "";

    if (this.sourceType === "fig-file") {
      const cached = this._sceneCacheGet(cacheKey);
      if (cached) return cached;
      const resolved = this._figToScene(rootNodeId);
      this._sceneCacheSet(cacheKey, resolved);
      return resolved;
    }

    if (images == null || Object.keys(images).length === 0) {
      const cached = this._sceneCacheGet(cacheKey);
      if (cached) return cached;
      const resolved = this._restToScene(rootNodeId);
      this._sceneCacheSet(cacheKey, resolved);
      return resolved;
    }

    return this._restToScene(rootNodeId, images);
  }

  private _sceneCacheGet(key: string): ResolvedScene | undefined {
    const v = this._sceneCache.get(key);
    if (v === undefined) return undefined;
    this._sceneCache.delete(key);
    this._sceneCache.set(key, v);
    return v;
  }

  private _sceneCacheSet(key: string, value: ResolvedScene): void {
    if (this._sceneCache.size >= FigmaDocument._MAX_SCENE_CACHE) {
      const firstKey = this._sceneCache.keys().next().value;
      if (firstKey !== undefined) this._sceneCache.delete(firstKey);
    }
    this._sceneCache.set(key, value);
  }

  /** @internal */
  private _restToScene(
    rootNodeId?: string,
    images?: Record<string, Uint8Array>
  ): ResolvedScene {
    const result = restJsonToGridaDocument(this.payload as FigmaJsonDocument, {
      images,
      rootNodeId,
      preserve_figma_ids: true,
      placeholder_for_missing_images: false,
    });
    return gridaDocumentResultToResolvedScene(result);
  }

  /** @internal */
  private _figToScene(rootNodeId?: string): ResolvedScene {
    if (!this._figFile) {
      this._figFile = iofigma.kiwi.parseFile(this.payload as Uint8Array);
    }
    const result = figFileToGridaDocument(this._figFile, {
      rootNodeId,
      preserve_figma_ids: true,
      placeholder_for_missing_images: false,
    });
    return gridaDocumentResultToResolvedScene(result);
  }

  /**
   * Returns the list of font family names used in this document.
   *
   * The result is family names only — no weights, PostScript names, or other metadata.
   * That is intentional: in practice, you can load all TTF/OTF files for each family
   * (variable or static) and pass them to the renderer; it will resolve the correct face
   * per text style. We prioritize simple usage and accurate font selection over
   * performance or resource-optimized patterns.
   *
   * When rootNodeId is omitted, traverses all pages so fonts from every page are included.
   *
   * @param rootNodeId — Optional. When provided, scope to that node's subtree. Omit for the full document (all pages).
   * @returns Unique font family names (e.g. `["Inter", "Caveat", "Roboto"]`).
   */
  listFontFamilies(rootNodeId?: string): string[] {
    if (rootNodeId != null && rootNodeId !== "") {
      const resolved = this._resolve(rootNodeId);
      return this._collectFontFamiliesFromDocument(resolved.document);
    }

    if (this.sourceType === "rest-api-json") {
      return collectFontFamiliesFromRestDocument(
        this.payload as FigmaJsonDocument
      );
    }

    if (!this._figFile) {
      this._figFile = iofigma.kiwi.parseFile(this.payload as Uint8Array);
    }
    const figFile = this._figFile;
    const pages = figFile.pages;
    if (!pages?.length) return [];

    const families = new Set<string>();
    for (let i = 0; i < pages.length; i++) {
      const result = figFileToGridaDocument(figFile, {
        pageIndex: i,
        preserve_figma_ids: true,
      });
      for (const f of this._collectFontFamiliesFromDocument(result.document)) {
        families.add(f);
      }
    }
    return Array.from(families);
  }

  private _collectFontFamiliesFromDocument(
    doc: grida.program.document.Document
  ): string[] {
    const nodes = doc.nodes;
    if (!nodes || typeof nodes !== "object") return [];
    const families = new Set<string>();
    for (const node of Object.values(nodes)) {
      const family = (node as { font_family?: string }).font_family;
      if (typeof family === "string" && family) {
        families.add(family);
      }
    }
    return Array.from(families);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function resolveMimeType(format: RefigRenderFormat): string {
  const map: Record<RefigRenderFormat, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
    pdf: "application/pdf",
    svg: "image/svg+xml",
  };
  return map[format];
}

function mapFormat(format: RefigRenderFormat): types.ExportAs {
  switch (format) {
    case "png":
      return { format: "PNG", constraints: { type: "none", value: 1 } };
    case "jpeg":
      return {
        format: "JPEG",
        constraints: { type: "none", value: 1 },
        quality: 100,
      };
    case "webp":
      return {
        format: "WEBP",
        constraints: { type: "none", value: 1 },
        quality: 75,
      };
    case "pdf":
      return { format: "PDF" };
    case "svg":
      return { format: "SVG" };
  }
}

function applyScale(exportAs: types.ExportAs, scale: number): types.ExportAs {
  if ("constraints" in exportAs) {
    return {
      ...exportAs,
      constraints: { type: "scale", value: scale },
    } as types.ExportAs;
  }
  return exportAs;
}

type RestNode = Record<string, unknown> & {
  id?: string;
  children?: RestNode[];
};

/** One export to perform: a node and one of its Figma export settings. */
export interface ExportItem {
  nodeId: string;
  node: RestNode;
  setting: ExportSetting;
}

/**
 * Walk the REST document and collect every (node, exportSetting) for nodes that have exportSettings.
 * Follows Figma HasExportSettingsTrait; one ExportItem per setting per node.
 */
export function collectExportsFromDocument(
  json: FigmaJsonDocument
): ExportItem[] {
  const doc = json as { document?: { children?: RestNode[] } };
  const pages = doc?.document?.children;
  if (!pages?.length) return [];

  const items: ExportItem[] = [];

  function walk(nodes: RestNode[]): void {
    for (const node of nodes) {
      const id = node.id;
      const settings = node.exportSettings as ExportSetting[] | undefined;
      if (
        typeof id === "string" &&
        Array.isArray(settings) &&
        settings.length > 0
      ) {
        for (const setting of settings) {
          if (
            setting &&
            typeof setting === "object" &&
            "format" in setting &&
            "constraint" in setting &&
            "suffix" in setting
          ) {
            items.push({ nodeId: id, node, setting: setting as ExportSetting });
          }
        }
      }
      const children = node.children as RestNode[] | undefined;
      if (children?.length) walk(children);
    }
  }

  for (const page of pages) {
    const pageChildren = page.children as RestNode[] | undefined;
    if (pageChildren?.length) walk(pageChildren);
  }
  return items;
}

const DEFAULT_EXPORT_SIZE = 1024;

function getNodeBounds(node: RestNode): { width: number; height: number } {
  const box =
    (node.absoluteRenderBounds as { width?: number; height?: number }) ??
    (node.absoluteBoundingBox as { width?: number; height?: number });
  const w =
    typeof box?.width === "number" && box.width > 0
      ? box.width
      : DEFAULT_EXPORT_SIZE;
  const h =
    typeof box?.height === "number" && box.height > 0
      ? box.height
      : DEFAULT_EXPORT_SIZE;
  return { width: w, height: h };
}

/**
 * Map a Figma ExportSetting and node bounds to RefigRenderOptions.
 * Constraint SCALE → scale; WIDTH/HEIGHT → width/height from constraint value and node aspect ratio.
 */
export function exportSettingToRenderOptions(
  node: RestNode,
  setting: ExportSetting
): RefigRenderOptions {
  const formatMap: Record<string, RefigRenderFormat> = {
    JPG: "jpeg",
    PNG: "png",
    SVG: "svg",
    PDF: "pdf",
    WEBP: "webp",
  };
  const format = formatMap[setting.format] ?? "png";

  const constraint = setting.constraint;
  const { type, value } = constraint;
  const bounds = getNodeBounds(node);

  if (type === "SCALE") {
    return {
      format,
      scale: value,
      width: DEFAULT_EXPORT_SIZE,
      height: DEFAULT_EXPORT_SIZE,
    };
  }
  if (type === "WIDTH") {
    const width = value;
    const height = value * (bounds.height / bounds.width);
    return { format, width, height };
  }
  if (type === "HEIGHT") {
    const height = value;
    const width = value * (bounds.width / bounds.height);
    return { format, width, height };
  }
  return { format, width: DEFAULT_EXPORT_SIZE, height: DEFAULT_EXPORT_SIZE };
}

/**
 * Collect font family names from a Figma REST document by walking all pages.
 * Used when rootNodeId is omitted so listFontFamilies covers the full document.
 */
function collectFontFamiliesFromRestDocument(
  json: FigmaJsonDocument
): string[] {
  const families = new Set<string>();
  const doc = json as { document?: { children?: RestNode[] } };
  const pages = doc?.document?.children;
  if (!pages?.length) return [];

  function walk(nodes: RestNode[]): void {
    for (const node of nodes) {
      const style = (node as { style?: { fontFamily?: string } }).style;
      const family = style?.fontFamily;
      if (typeof family === "string" && family) {
        families.add(family);
      }
      const children = node.children as RestNode[] | undefined;
      if (children?.length) walk(children);
    }
  }

  for (const page of pages) {
    const pageChildren = page.children as RestNode[] | undefined;
    if (pageChildren?.length) walk(pageChildren);
  }
  return Array.from(families);
}

// Node-finding helpers (findNodeInRestJson, findPageContainingNode) live in
// @grida/io-figma/fig2grida-core; used internally by the Document functions.

/**
 * Resolved scene: Grida IR ready for canvas load.
 * @internal
 */
interface ResolvedScene {
  document: grida.program.document.Document;
  images: Record<string, Uint8Array>;
  imageRefsUsed?: string[];
}

function gridaDocumentResultToResolvedScene(
  result: GridaDocumentResult
): ResolvedScene {
  return {
    document: result.document,
    images: result.assets,
    imageRefsUsed: result.imageRefsUsed,
  };
}

/**
 * Build a REST-like document structure from .fig bytes for export collection.
 * Wraps page.rootNodes in document/children so collectExportsFromDocument can walk it.
 */
export function figBytesToRestLikeDocument(
  figBytes: Uint8Array
): FigmaJsonDocument {
  const figFile = iofigma.kiwi.parseFile(figBytes);
  return figFileToRestLikeDocument(figFile);
}

/**
 * Build REST-like document from a parsed FigFileDocument.
 * Use when you already have the parse result (e.g. to avoid parsing twice for images).
 */
export function figFileToRestLikeDocument(figFile: {
  pages?: Array<{
    name?: string;
    sortkey: string;
    canvas?: { guid?: unknown };
    rootNodes: unknown[];
  }>;
}): FigmaJsonDocument {
  const pages = figFile.pages;
  if (!pages || pages.length === 0) {
    throw new Error("FigmaDocument: .fig file has no pages");
  }

  const sortedPages = [...pages].sort((a, b) =>
    a.sortkey.localeCompare(b.sortkey)
  );

  const canvasNodes = sortedPages.map((p) => ({
    type: "CANVAS" as const,
    id: p.canvas?.guid
      ? iofigma.kiwi.guid(
          p.canvas.guid as { sessionID: number; localID: number }
        )
      : `canvas-${String(p.name ?? "")}`,
    name: p.name ?? "Page",
    children: p.rootNodes,
  }));

  return {
    document: {
      id: "0:0",
      type: "DOCUMENT",
      name: "Document",
      children: canvasNodes,
    },
  };
}

// ---------------------------------------------------------------------------
// FigmaRenderer
// ---------------------------------------------------------------------------

export class FigmaRenderer {
  readonly document: FigmaDocument;
  readonly options: RefigRendererOptions;

  private _canvas: Canvas | null = null;
  private _sceneLoaded = false;
  /** When set, scene is built with this node as root (REST only). Cleared when nodeId changes. */
  private _requestedNodeId: string | null = null;

  constructor(
    document: FigmaDocument | FigmaJsonDocument,
    options: RefigRendererOptions = {}
  ) {
    this.document =
      document instanceof FigmaDocument
        ? document
        : new FigmaDocument(document);
    this.options = options;
  }

  private async ensureCanvas(width: number, height: number): Promise<Canvas> {
    if (this._canvas) return this._canvas;

    this._canvas = await createCanvas({
      backend: "raster",
      width,
      height,
      useEmbeddedFonts: this.options.useEmbeddedFonts ?? true,
    });

    if (this.options.loadFigmaDefaultFonts !== false) {
      await ensureFigmaDefaultFonts(
        this._canvas as unknown as FigmaDefaultFontsCanvas
      );
    }

    if (this.options.fonts) {
      for (const [family, data] of Object.entries(this.options.fonts)) {
        const entries = Array.isArray(data) ? data : [data];
        for (const bytes of entries) {
          this._canvas.addFont(family, bytes);
        }
      }
    }

    return this._canvas;
  }

  private loadScene(canvas: Canvas, nodeId: string): void {
    if (this._sceneLoaded && this._requestedNodeId === nodeId) return;

    const resolved = this.document._resolve(
      nodeId || undefined,
      this.options.images
    );
    for (const [ref, bytes] of Object.entries(resolved.images)) {
      canvas.addImageWithId(bytes, `res://images/${ref}`);
    }
    canvas.loadSceneGrida(io.GRID.encode(resolved.document));
    this._requestedNodeId = nodeId;
    this._sceneLoaded = true;
  }

  async render(
    nodeId: string,
    renderOptions: RefigRenderOptions
  ): Promise<RefigRenderResult> {
    const normalizedNodeId = nodeId.trim();
    if (!normalizedNodeId) {
      throw new Error("FigmaRenderer.render: nodeId is required");
    }

    const width = renderOptions.width ?? 1024;
    const height = renderOptions.height ?? 1024;
    const scale = renderOptions.scale ?? 1;
    const format = renderOptions.format;
    const mimeType = resolveMimeType(format);

    const canvas = await this.ensureCanvas(width, height);
    if (this._requestedNodeId !== normalizedNodeId) {
      this._sceneLoaded = false;
    }
    this.loadScene(canvas, normalizedNodeId);

    let exportAs = mapFormat(format);
    if (scale !== 1) {
      exportAs = applyScale(exportAs, scale);
    }

    const { data } = canvas.exportNodeAs(normalizedNodeId, exportAs);

    return {
      data,
      format,
      mimeType,
      nodeId: normalizedNodeId,
      width,
      height,
    };
  }

  /**
   * Release the underlying WASM canvas.
   * After calling this the renderer must not be used again.
   */
  dispose(): void {
    this._canvas?.dispose();
    this._canvas = null;
    this._sceneLoaded = false;
  }
}
