/**
 * @grida/refig — shared core (no node:fs, no DOM)
 *
 * This module is environment-agnostic. Both the Node and browser entrypoints
 * re-export everything from here.
 */

import type { ExportSetting } from "@figma/rest-api-spec";
import { createCanvas, type Canvas, type types } from "@grida/canvas-wasm";
import { iofigma } from "@grida/io-figma";
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

export class FigmaDocument {
  readonly sourceType: "fig-file" | "rest-api-json";

  /**
   * For "fig-file" this is the raw bytes of the .fig file.
   * For "rest-api-json" this is the parsed REST API document JSON.
   */
  readonly payload: Uint8Array | FigmaJsonDocument;

  /**
   * @param input Raw `.fig` bytes (Uint8Array) or a parsed Figma REST API
   *              document JSON object.
   *
   * For file-path convenience in Node, use `FigmaDocument.fromFile()` from
   * the `@grida/refig` entrypoint.
   */
  constructor(input: Uint8Array | FigmaJsonDocument) {
    if (input instanceof Uint8Array) {
      this.sourceType = "fig-file";
      this.payload = input;
      return;
    }

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("FigmaDocument: input must be a Uint8Array or object");
    }

    this.sourceType = "rest-api-json";
    this.payload = input;
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
 * Find a node by id in the Figma REST document tree (walks all pages and descendants).
 */
function findNodeInRestDocument(
  json: FigmaJsonDocument,
  nodeId: string
): RestNode | undefined {
  const doc = json as { document?: { children?: RestNode[] } };
  const pages = doc?.document?.children;
  if (!pages?.length) return undefined;

  function walk(nodes: RestNode[]): RestNode | undefined {
    for (const node of nodes) {
      if (String(node.id) === nodeId) return node;
      const children = node.children as RestNode[] | undefined;
      if (children?.length) {
        const found = walk(children);
        if (found) return found;
      }
    }
    return undefined;
  }

  for (const page of pages) {
    const pageChildren = page.children as RestNode[] | undefined;
    if (pageChildren?.length) {
      const found = walk(pageChildren);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Find the FigPage that contains a node by id (for page-scoped scene loading).
 */
function findPageContainingNode(
  figFile: { pages?: Array<{ rootNodes?: unknown[] }> },
  nodeId: string
):
  | { name: string; canvas: unknown; rootNodes: unknown[]; sortkey: string }
  | undefined {
  const pages = figFile.pages;
  if (!pages?.length) return undefined;

  function walk(nodes: RestNode[]): boolean {
    for (const node of nodes) {
      if (String(node.id) === nodeId) return true;
      const children = node.children as RestNode[] | undefined;
      if (children?.length && walk(children)) return true;
    }
    return false;
  }

  for (const page of pages) {
    const rootNodes = (page.rootNodes ?? []) as RestNode[];
    if (rootNodes.length && walk(rootNodes)) {
      return page as {
        name: string;
        canvas: unknown;
        rootNodes: unknown[];
        sortkey: string;
      };
    }
  }
  return undefined;
}

/** Result of REST JSON conversion with optional image refs used. */
interface RestConversionResult {
  sceneJson: string;
  imageRefsUsed: string[];
}

/**
 * Convert a Figma REST API document JSON -> Grida snapshot JSON string.
 * When rootNodeId is provided, that node is used as the single root (and keeps that id).
 */
function restJsonToSceneJson(
  json: FigmaJsonDocument,
  rootNodeId?: string,
  images?: Record<string, Uint8Array>
): RestConversionResult {
  const doc = json as {
    document?: { children?: Array<Record<string, unknown>> };
  };
  const pages = doc?.document?.children;
  if (!pages || pages.length === 0) {
    throw new Error("FigmaDocument: REST JSON has no document pages");
  }

  const page = pages[0] as {
    name?: string;
    children?: Array<Record<string, unknown>>;
  };
  const rootNodes = page.children ?? [];
  if (rootNodes.length === 0) {
    throw new Error("FigmaDocument: first page has no root nodes");
  }

  let counter = 0;
  const baseGradientGen = () => `grad-${++counter}`;

  const resolveImageSrc =
    images &&
    (Object.keys(images).length > 0
      ? (ref: string) => (ref in images ? `res://images/${ref}` : null)
      : undefined);

  const buildContext = (
    overrides: Partial<iofigma.restful.factory.FactoryContext>
  ): iofigma.restful.factory.FactoryContext => ({
    gradient_id_generator: baseGradientGen,
    prefer_path_for_geometry: true,
    ...(resolveImageSrc && { resolve_image_src: resolveImageSrc }),
    ...overrides,
  });

  if (rootNodeId != null && rootNodeId !== "") {
    const node = findNodeInRestDocument(json, rootNodeId);
    if (!node) {
      throw new Error(
        `FigmaDocument: node with id "${rootNodeId}" not found in document`
      );
    }
    let rootIdUsed = false;
    const context = buildContext({
      node_id_generator: () => {
        if (!rootIdUsed) {
          rootIdUsed = true;
          return rootNodeId;
        }
        return `refig-${++counter}`;
      },
    });
    const { document: packed, imageRefsUsed } =
      iofigma.restful.factory.document(node as any, {}, context);
    const fullDoc =
      grida.program.nodes.factory.packed_scene_document_to_full_document(
        packed
      );
    return {
      sceneJson: JSON.stringify({
        version: grida.program.document.SCHEMA_VERSION,
        document: fullDoc,
      }),
      imageRefsUsed,
    };
  }

  const context = buildContext({
    node_id_generator: () => `refig-${++counter}`,
  });

  const individualResults = rootNodes.map((rootNode) =>
    iofigma.restful.factory.document(rootNode as any, {}, context)
  );

  const imageRefsUsed = new Set<string>();
  for (const r of individualResults) {
    r.imageRefsUsed.forEach((ref: string) => imageRefsUsed.add(ref));
  }

  let packed: grida.program.document.IPackedSceneDocument;
  if (individualResults.length === 1) {
    packed = individualResults[0].document;
  } else {
    packed = {
      bitmaps: {},
      images: {},
      nodes: {},
      links: {},
      properties: {},
      scene: {
        type: "scene",
        id: "main",
        name: page.name ?? "Page 1",
        children_refs: [],
        guides: [],
        edges: [],
        constraints: { children: "multiple" },
      },
    };
    for (const result of individualResults) {
      const d = result.document;
      Object.assign(packed.nodes, d.nodes);
      Object.assign(packed.links, d.links);
      Object.assign(packed.images, d.images);
      Object.assign(packed.bitmaps, d.bitmaps);
      Object.assign(packed.properties, d.properties);
      packed.scene.children_refs.push(...d.scene.children_refs);
    }
  }

  const fullDoc =
    grida.program.nodes.factory.packed_scene_document_to_full_document(packed);

  return {
    sceneJson: JSON.stringify({
      version: grida.program.document.SCHEMA_VERSION,
      document: fullDoc,
    }),
    imageRefsUsed: Array.from(imageRefsUsed),
  };
}

/** Result of .fig conversion with images to register. */
interface FigConversionResult {
  sceneJson: string;
  images: Record<string, Uint8Array>;
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

/**
 * Convert .fig file bytes -> Grida snapshot JSON string.
 * When rootNodeId is provided, loads only the page containing that node (enables export from any page).
 */
function figBytesToSceneJson(
  figBytes: Uint8Array,
  rootNodeId?: string
): FigConversionResult {
  const figFile = iofigma.kiwi.parseFile(figBytes);
  const pages = figFile.pages;
  if (!pages || pages.length === 0) {
    throw new Error("FigmaDocument: .fig file has no pages");
  }

  const sortedPages = [...pages].sort((a, b) =>
    a.sortkey.localeCompare(b.sortkey)
  );

  let page: (typeof sortedPages)[0];
  if (rootNodeId != null && rootNodeId !== "") {
    const pageWithNode = findPageContainingNode(figFile, rootNodeId);
    if (!pageWithNode) {
      throw new Error(
        `FigmaDocument: node with id "${rootNodeId}" not found in .fig`
      );
    }
    page = pageWithNode as (typeof sortedPages)[0];
  } else {
    page = sortedPages[0]!;
  }

  const imagesMap = iofigma.kiwi.extractImages(figFile.zip_files);
  const images: Record<string, Uint8Array> = {};
  imagesMap.forEach((bytes, ref) => {
    images[ref] = bytes;
  });

  const resolveImageSrc =
    imagesMap.size > 0
      ? (ref: string) => (imagesMap.has(ref) ? `res://images/${ref}` : null)
      : undefined;

  let counter = 0;
  const context: iofigma.restful.factory.FactoryContext = {
    node_id_generator: () => `refig-${++counter}`,
    gradient_id_generator: () => `grad-${++counter}`,
    preserve_figma_ids: true,
    prefer_path_for_geometry: true,
    ...(resolveImageSrc && { resolve_image_src: resolveImageSrc }),
  };

  const { document: packed } = iofigma.kiwi.convertPageToScene(page, context);
  const fullDoc =
    grida.program.nodes.factory.packed_scene_document_to_full_document(packed);

  return {
    sceneJson: JSON.stringify({
      version: grida.program.document.SCHEMA_VERSION,
      document: fullDoc,
    }),
    images,
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

    return this._canvas;
  }

  private loadScene(canvas: Canvas, nodeId: string): void {
    if (this._sceneLoaded && this._requestedNodeId === nodeId) return;

    let sceneJson: string;
    let imagesToRegister: Record<string, Uint8Array> = {};

    if (this.document.sourceType === "fig-file") {
      const figResult = figBytesToSceneJson(
        this.document.payload as Uint8Array,
        nodeId || undefined
      );
      sceneJson = figResult.sceneJson;
      imagesToRegister = figResult.images;
    } else {
      const restResult = restJsonToSceneJson(
        this.document.payload as FigmaJsonDocument,
        nodeId || undefined,
        this.options.images
      );
      sceneJson = restResult.sceneJson;
      const used = new Set(restResult.imageRefsUsed);
      const provided = this.options.images ?? {};
      for (const ref of used) {
        if (ref in provided) {
          imagesToRegister[ref] = provided[ref];
        }
      }
    }

    for (const [ref, bytes] of Object.entries(imagesToRegister)) {
      canvas.addImageWithId(bytes, `res://images/${ref}`);
    }
    canvas.loadScene(sceneJson);
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
