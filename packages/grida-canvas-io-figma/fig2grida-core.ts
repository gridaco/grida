/**
 * @fileoverview fig2grida — browser-safe programmatic API
 *
 * `fig2grida` accepts any of the following inputs and produces a `.grida`
 * archive (Uint8Array):
 *
 * - **`.fig` bytes** — Figma's native binary format (Kiwi / ZIP).
 * - **REST archive ZIP** — A ZIP containing `document.json` (and optional
 *   `images/<hash>.*`) as produced by `.tools/figma_archive.py`.
 * - **REST JSON object** — The parsed result of `GET /v1/files/:key`.
 *
 * `restJsonToGridaDocument` is a lower-level helper that returns the in-memory
 * `Document` + assets without packing into a `.grida` ZIP.
 *
 * Pure functions: no fs, no Node.js APIs.
 *
 * @example
 * ```ts
 * import { fig2grida } from "@grida/io-figma/fig2grida-core";
 *
 * // From .fig bytes
 * const result = fig2grida(figBytes);
 *
 * // From REST archive ZIP
 * const result = fig2grida(restArchiveZipBytes);
 *
 * // From parsed REST JSON
 * const result = fig2grida(parsedJson);
 * ```
 */
import { unzipSync, strFromU8 } from "fflate";
import { iofigma } from "./lib";
import { io } from "@grida/io";
import grida from "@grida/schema";
import kolor from "@grida/color";

export interface Fig2GridaOptions extends Pick<
  iofigma.restful.factory.FactoryContext,
  | "placeholder_for_missing_images"
  | "preserve_figma_ids"
  | "prefer_fixed_text_sizing"
> {
  /** Convert specific page indices only (only applies to `.fig` input). */
  pages?: number[];
}

export interface Fig2GridaResult {
  /** The .grida archive bytes (ZIP). */
  bytes: Uint8Array;
  /** Page names included in the output. */
  pageNames: string[];
  /** Total node count. */
  nodeCount: number;
  /** Image count packed into the archive. */
  imageCount: number;
}

let _idCounter = 0;

function makeIdGenerator(prefix: string): () => string {
  return () => `${prefix}-${++_idCounter}`;
}

// ---------------------------------------------------------------------------
// ZIP magic detection
// ---------------------------------------------------------------------------

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;

function isZip(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  return (
    data[0] === ZIP_MAGIC[0] &&
    data[1] === ZIP_MAGIC[1] &&
    data[2] === ZIP_MAGIC[2] &&
    data[3] === ZIP_MAGIC[3]
  );
}

/**
 * Try to read `document.json` + `images/*` from a REST archive ZIP.
 * Returns `null` when the ZIP does not contain `document.json` (i.e. it is
 * a regular `.fig` ZIP instead).
 */
function tryReadRestArchiveZip(
  data: Uint8Array
): { json: unknown; images: Record<string, Uint8Array> } | null {
  const entries = unzipSync(data);
  let json: unknown | undefined;
  const images: Record<string, Uint8Array> = {};
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.includes("__MACOSX")) continue;
    if (path.endsWith("document.json")) {
      json = JSON.parse(strFromU8(bytes));
      continue;
    }
    if (path.includes("/images/") || path.startsWith("images/")) {
      const file = path.split("/").pop()!;
      const dot = file.lastIndexOf(".");
      if (dot > 0) {
        images[file.slice(0, dot)] = bytes;
      }
    }
  }
  return json !== undefined ? { json, images } : null;
}

// ---------------------------------------------------------------------------
// Shared merge logic
// ---------------------------------------------------------------------------

interface MergedDocument {
  document: grida.program.document.Document;
  imageRecord: Record<string, Uint8Array>;
  imageRefsUsed: Set<string>;
  pageNames: string[];
  /** Non-scene node count, accumulated during conversion. */
  nodeCount: number;
}

/**
 * Build a multi-scene Document by converting canvases directly into shared
 * buffers, avoiding per-root / per-page Object.assign merge passes.
 */
function buildMergedDocument(
  canvases: Array<{
    name: string;
    children: Array<Record<string, unknown>>;
    backgroundColor?: { r: number; g: number; b: number; a: number };
  }>,
  context: iofigma.restful.factory.FactoryContext,
  imageProvider: (ref: string) => Uint8Array | undefined
): MergedDocument {
  // Single shared buffers — factory.document() writes directly here.
  const sharedNodes: Record<string, grida.program.nodes.Node> = {};
  const sharedLinks: Record<string, string[]> = {};
  const sharedImageRefsUsed = new Set<string>();
  const sharedFigmaIdMap = new Map<string, string>();

  const scenesRef: string[] = [];
  const pageNames: string[] = [];
  let nodeCount = 0;

  const sharedContext: iofigma.restful.factory.FactoryContext = {
    ...context,
    _shared_nodes: sharedNodes,
    _shared_links: sharedLinks,
    _shared_image_refs_used: sharedImageRefsUsed,
    _shared_figma_id_map: sharedFigmaIdMap,
  };

  for (const canvas of canvases) {
    const background_color = canvas.backgroundColor
      ? kolor.colorformats.newRGBA32F(
          canvas.backgroundColor.r,
          canvas.backgroundColor.g,
          canvas.backgroundColor.b,
          canvas.backgroundColor.a
        )
      : undefined;

    const sceneId = makeIdGenerator("scene")();
    const childrenRefs: string[] = [];

    // Count nodes before this page so we can compute delta
    const nodesBefore = Object.keys(sharedNodes).length;

    for (const rootNode of canvas.children) {
      const result = iofigma.restful.factory.document(
        rootNode as any,
        {},
        sharedContext
      );
      // factory.document() already wrote nodes/links/imageRefs into shared
      // buffers. We only need the scene's children_refs from the result.
      childrenRefs.push(...result.document.scene.children_refs);
    }

    nodeCount += Object.keys(sharedNodes).length - nodesBefore;

    const sceneNode: grida.program.nodes.SceneNode = {
      type: "scene",
      id: sceneId,
      name: canvas.name,
      active: true,
      locked: false,
      constraints: { children: "multiple" },
      guides: [],
      edges: [],
      background_color,
    };

    (sharedNodes as any)[sceneId] = sceneNode;
    sharedLinks[sceneId] = childrenRefs;
    scenesRef.push(sceneId);
    pageNames.push(canvas.name);
  }

  const document: grida.program.document.Document = {
    nodes: sharedNodes,
    links: sharedLinks,
    images: {},
    bitmaps: {},
    properties: {},
    scenes_ref: scenesRef,
    entry_scene_id: scenesRef[0],
  };

  const imageRecord: Record<string, Uint8Array> = {};
  for (const ref of sharedImageRefsUsed) {
    const imageBytes = imageProvider(ref);
    if (imageBytes) {
      imageRecord[ref] = imageBytes;
    }
  }

  return {
    document,
    imageRecord,
    imageRefsUsed: sharedImageRefsUsed,
    pageNames,
    nodeCount,
  };
}

function packMergedDocument(merged: MergedDocument): Fig2GridaResult {
  const archiveBytes = io.archive.pack(
    merged.document,
    merged.imageRecord,
    undefined,
    undefined,
    { level: 0, snapshot: false, skip_sort: true }
  );

  return {
    bytes: archiveBytes,
    pageNames: merged.pageNames,
    nodeCount: merged.nodeCount,
    imageCount: Object.keys(merged.imageRecord).length,
  };
}

// ---------------------------------------------------------------------------
// fig2grida — unified entry point
// ---------------------------------------------------------------------------

/**
 * Convert a Figma file to a `.grida` archive.
 *
 * Accepts:
 * - `Uint8Array` — `.fig` binary **or** REST archive ZIP (auto-detected).
 * - `object` — Parsed REST API JSON (`GET /v1/files/:key`).
 */
export function fig2grida(
  input: Uint8Array | object,
  options?: Fig2GridaOptions
): Fig2GridaResult {
  _idCounter = 0;

  const placeholderForMissing =
    options?.placeholder_for_missing_images !== false;

  const preserveFigmaIds = options?.preserve_figma_ids;
  const preferFixedTextSizing = options?.prefer_fixed_text_sizing;

  // --- Object input: REST JSON directly ---
  if (!(input instanceof Uint8Array)) {
    return fig2gridaFromRestJson(
      input,
      undefined,
      placeholderForMissing,
      preserveFigmaIds,
      preferFixedTextSizing
    );
  }

  // --- Bytes input: detect format ---
  if (isZip(input)) {
    // Try REST archive ZIP first (contains document.json)
    const restArchive = tryReadRestArchiveZip(input);
    if (restArchive) {
      return fig2gridaFromRestJson(
        restArchive.json,
        restArchive.images,
        placeholderForMissing,
        preserveFigmaIds,
        preferFixedTextSizing
      );
    }
    // Otherwise fall through to .fig parser (handles both ZIP and raw Kiwi)
  } else if (input.length > 0 && input[0] === 0x7b /* '{' */) {
    // JSON text — parse and treat as REST API response
    const json = JSON.parse(new TextDecoder().decode(input));
    return fig2gridaFromRestJson(
      json,
      undefined,
      placeholderForMissing,
      preserveFigmaIds,
      preferFixedTextSizing
    );
  }

  return fig2gridaFromFigBytes(input, options);
}

// ---------------------------------------------------------------------------
// .fig bytes path
// ---------------------------------------------------------------------------

interface FigPageResult {
  name: string;
  result: iofigma.restful.factory.FigmaImportResult;
}

/**
 * Merge per-page results from the .fig/Kiwi path into a single Document.
 * (The REST path uses buildMergedDocument with shared buffers instead.)
 */
function mergeFigPages(
  pageResults: FigPageResult[],
  imageProvider: (ref: string) => Uint8Array | undefined
): MergedDocument {
  const allImageRefsUsed = new Set<string>();
  const mergedNodes: Record<string, any> = {};
  const mergedLinks: Record<string, string[] | undefined> = {};
  const scenesRef: string[] = [];
  let nodeCount = 0;

  for (const { name, result } of pageResults) {
    const packed = result.document;

    const sceneId =
      packed.scene.id === "tmp" ? makeIdGenerator("scene")() : packed.scene.id;

    const sceneNode: grida.program.nodes.SceneNode = {
      type: "scene",
      id: sceneId,
      name: name,
      active: true,
      locked: false,
      constraints: packed.scene.constraints,
      guides: packed.scene.guides,
      edges: packed.scene.edges,
      background_color: packed.scene.background_color,
    };

    mergedNodes[sceneId] = sceneNode;
    mergedLinks[sceneId] = packed.scene.children_refs;
    scenesRef.push(sceneId);

    const pageSizeBefore = Object.keys(mergedNodes).length;
    Object.assign(mergedNodes, packed.nodes);
    for (const [key, value] of Object.entries(packed.links)) {
      if (key !== sceneId) {
        mergedLinks[key] = value;
      }
    }
    nodeCount += Object.keys(mergedNodes).length - pageSizeBefore;

    for (const ref of result.imageRefsUsed) {
      allImageRefsUsed.add(ref);
    }
  }

  const document: grida.program.document.Document = {
    nodes: mergedNodes,
    links: mergedLinks,
    images: {},
    bitmaps: {},
    properties: {},
    scenes_ref: scenesRef,
    entry_scene_id: scenesRef[0],
  };

  const imageRecord: Record<string, Uint8Array> = {};
  for (const ref of allImageRefsUsed) {
    const imageBytes = imageProvider(ref);
    if (imageBytes) {
      imageRecord[ref] = imageBytes;
    }
  }

  return {
    document,
    imageRecord,
    imageRefsUsed: allImageRefsUsed,
    pageNames: pageResults.map((p) => p.name),
    nodeCount,
  };
}

function fig2gridaFromFigBytes(
  input: Uint8Array,
  options?: Fig2GridaOptions
): Fig2GridaResult {
  const figFile = iofigma.kiwi.parseFile(input);
  const extractedImages = iofigma.kiwi.extractImages(figFile.zip_files);

  let pages = [...figFile.pages].sort((a, b) =>
    a.sortkey.localeCompare(b.sortkey)
  );

  if (options?.pages && options.pages.length > 0) {
    pages = options.pages
      .filter((i) => i >= 0 && i < pages.length)
      .map((i) => pages[i]);
  }

  const pageResults: FigPageResult[] = [];
  for (const page of pages) {
    const placeholderForMissing =
      options?.placeholder_for_missing_images !== false;
    const result = iofigma.kiwi.convertPageToScene(page, {
      resolve_image_src: (ref: string) =>
        extractedImages.has(ref) ? `res://images/${ref}` : null,
      gradient_id_generator: makeIdGenerator("grad"),
      prefer_path_for_geometry: true,
      placeholder_for_missing_images: placeholderForMissing,
      preserve_figma_ids: options?.preserve_figma_ids,
      prefer_fixed_text_sizing: options?.prefer_fixed_text_sizing,
    });
    pageResults.push({ name: page.name, result });
  }

  return packMergedDocument(
    mergeFigPages(pageResults, (ref) => extractedImages.get(ref))
  );
}

// ---------------------------------------------------------------------------
// REST JSON path (object or extracted from archive ZIP)
// ---------------------------------------------------------------------------

/**
 * Extract the CANVAS pages from a REST API JSON response.
 *
 * Accepted shapes:
 * - `{ document: { type: "DOCUMENT", children: [CANVAS, …] } }` — full `GET /v1/files/:key`
 * - `{ document: { type: "CANVAS", children: […] } }` — single-page node fetch
 * - `{ nodes: { "id": { document: …, … }, … } }` — `GET /v1/files/:key/nodes?ids=…`
 * - `{ type: "DOCUMENT", children: [CANVAS, …] }` — document node directly
 * - `{ type: "CANVAS", children: […] }` — single CANVAS node
 * - `{ children: […] }` — bare object with children
 */
function extractCanvases(json: unknown): Array<{
  name?: string;
  backgroundColor?: { r: number; g: number; b: number; a: number };
  children?: Array<Record<string, unknown>>;
}> {
  const obj = json as Record<string, unknown> | null | undefined;
  if (!obj || typeof obj !== "object") {
    throw new Error("fig2grida: input is not an object");
  }

  // Handle `GET /v1/files/:key/nodes` response: `{ nodes: { "id": { document, … } } }`
  // Flatten all node entries and recursively extract canvases from each.
  const nodesMap = (obj as any).nodes;
  if (
    nodesMap &&
    typeof nodesMap === "object" &&
    !Array.isArray(nodesMap) &&
    !(obj as any).document &&
    !(obj as any).children
  ) {
    const result: Array<{
      name?: string;
      backgroundColor?: { r: number; g: number; b: number; a: number };
      children?: Array<Record<string, unknown>>;
    }> = [];
    for (const entry of Object.values(nodesMap)) {
      result.push(...extractCanvases(entry));
    }
    if (result.length === 0) {
      throw new Error("fig2grida: nodes map contains no convertible entries");
    }
    return result;
  }

  // Resolve the node to inspect — unwrap `{ document: ... }` wrapper if present
  const docNode = (obj as any).document;
  const node = docNode && typeof docNode === "object" ? docNode : obj;

  // If the node itself is a CANVAS, treat it as a single page
  if (
    (node as any).type === "CANVAS" &&
    Array.isArray((node as any).children)
  ) {
    return [
      {
        name: (node as any).name,
        backgroundColor: (node as any).backgroundColor,
        children: (node as any).children,
      },
    ];
  }

  const children: Array<Record<string, unknown>> | undefined = Array.isArray(
    (node as any).children
  )
    ? (node as any).children
    : undefined;

  if (!children || children.length === 0) {
    // Single node with no children — treat the node itself as the only root
    if ((node as any).type && (node as any).id) {
      return [{ name: (node as any).name ?? "Page", children: [node as any] }];
    }
    throw new Error("fig2grida: input JSON has no document.children");
  }

  const canvases = children.filter(
    (p) => (p as { type?: string }).type === "CANVAS"
  ) as Array<{
    name?: string;
    backgroundColor?: { r: number; g: number; b: number; a: number };
    children?: Array<Record<string, unknown>>;
  }>;

  // If no CANVAS nodes found, treat all top-level children as a single page
  if (canvases.length === 0) {
    return [{ name: (node as any).name ?? "Page", children }];
  }

  return canvases;
}

function restJsonToMergedDocument(
  json: unknown,
  images: Record<string, Uint8Array> | undefined,
  placeholderForMissing: boolean,
  preserveFigmaIds?: boolean,
  preferFixedTextSizing?: boolean
): MergedDocument {
  const rawCanvases = extractCanvases(json);

  // A single shared context across all pages prevents ID collisions when
  // merging nodes from different canvases.
  const context: iofigma.restful.factory.FactoryContext = {
    gradient_id_generator: makeIdGenerator("grad"),
    prefer_path_for_geometry: true,
    placeholder_for_missing_images: placeholderForMissing,
    preserve_figma_ids: preserveFigmaIds,
    prefer_fixed_text_sizing: preferFixedTextSizing,
    node_id_generator: preserveFigmaIds
      ? undefined
      : makeIdGenerator("rest-import"),
    ...(images &&
      Object.keys(images).length > 0 && {
        resolve_image_src: (ref: string) =>
          ref in images ? `res://images/${ref}` : null,
      }),
  };

  const canvases = rawCanvases.map((c) => ({
    name: c.name ?? "Page",
    children: c.children ?? [],
    backgroundColor: c.backgroundColor,
  }));

  return buildMergedDocument(canvases, context, (ref) =>
    images ? images[ref] : undefined
  );
}

function fig2gridaFromRestJson(
  json: unknown,
  images: Record<string, Uint8Array> | undefined,
  placeholderForMissing: boolean,
  preserveFigmaIds?: boolean,
  preferFixedTextSizing?: boolean
): Fig2GridaResult {
  return packMergedDocument(
    restJsonToMergedDocument(
      json,
      images,
      placeholderForMissing,
      preserveFigmaIds,
      preferFixedTextSizing
    )
  );
}

// ---------------------------------------------------------------------------
// restJsonToGridaDocument — returns in-memory Document (no .grida packing)
// ---------------------------------------------------------------------------

export interface RestJsonToGridaOptions extends Pick<
  iofigma.restful.factory.FactoryContext,
  "prefer_fixed_text_sizing"
> {
  /**
   * Image hashes from Figma `images` metadata to raw bytes. When provided,
   * resolves `IMAGE` paint refs to `res://images/<hash>`.
   */
  images?: Record<string, Uint8Array>;
}

export interface RestJsonToGridaResult {
  document: grida.program.document.Document;
  /** Raw image bytes keyed by hash (for `editor.loadImages`) */
  assets: Record<string, Uint8Array>;
  /** Image ref hashes referenced by converted paints */
  imageRefsUsed: string[];
}

/**
 * Convert a Figma REST API file JSON (`document.children` = CANVAS pages)
 * into a single Grida `Document` with one scene per page.
 *
 * Returns the in-memory `Document` + assets without packing into a `.grida`
 * ZIP archive.
 */
export function restJsonToGridaDocument(
  json: unknown,
  options?: RestJsonToGridaOptions
): RestJsonToGridaResult {
  _idCounter = 0;
  const images = options?.images;
  const merged = restJsonToMergedDocument(
    json,
    images,
    true,
    undefined,
    options?.prefer_fixed_text_sizing
  );

  return {
    document: merged.document,
    assets: merged.imageRecord,
    imageRefsUsed: Array.from(merged.imageRefsUsed),
  };
}
