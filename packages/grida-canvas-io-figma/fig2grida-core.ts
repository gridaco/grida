/**
 * @fileoverview fig2grida — browser-safe programmatic API
 *
 * Three tiers of API:
 *
 * - **In-memory** (`figBytesToGridaDocument`, `restJsonToGridaDocument`) —
 *   returns a `Document` + assets for clients that need the JS object directly
 *   (e.g. refig headless renderer, embed viewer).
 * - **Archive** (`fig2grida`) — wraps the in-memory API and packs the result
 *   into a `.grida` ZIP archive for clients that need bytes (CLI, file saving).
 * - **Primitives** (`iofigma.kiwi.*`, `iofigma.restful.*`) — for clients that
 *   need per-node insertion (clipboard paste, playground import).
 *
 * Pure functions: no fs, no Node.js APIs.
 *
 * @example
 * ```ts
 * import { fig2grida, figBytesToGridaDocument, restJsonToGridaDocument } from "@grida/io-figma/fig2grida-core";
 *
 * // Archive (returns .grida ZIP bytes)
 * const archive = fig2grida(figBytes);
 *
 * // In-memory (returns Document + assets)
 * const { document, assets } = figBytesToGridaDocument(figBytes);
 * const { document, assets } = restJsonToGridaDocument(parsedJson);
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
        // oxlint-disable-next-line typescript/no-explicit-any
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

    (
      sharedNodes as Record<
        string,
        grida.program.nodes.Node | grida.program.nodes.SceneNode
      >
    )[sceneId] = sceneNode;
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

/**
 * Pack a {@link GridaDocumentResult} into a `.grida` archive.
 * Bridges the in-memory API to the archive API.
 */
function packGridaDocumentResult(result: GridaDocumentResult): Fig2GridaResult {
  const archiveBytes = io.archive.pack(
    result.document,
    result.assets,
    undefined,
    undefined,
    { level: 0, snapshot: false, skip_sort: true }
  );

  // Count non-scene nodes to match the original fig2grida nodeCount semantics.
  let nodeCount = 0;
  for (const node of Object.values(result.document.nodes)) {
    if ((node as { type?: string }).type !== "scene") nodeCount++;
  }

  return {
    bytes: archiveBytes,
    pageNames: result.pageNames,
    nodeCount,
    imageCount: Object.keys(result.assets).length,
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
  const mergedNodes: Record<string, grida.program.nodes.Node> = {};
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
  const result = figBytesToGridaDocument(input, options);
  return packGridaDocumentResult(result);
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
  const nodesMap = obj.nodes;
  if (
    nodesMap &&
    typeof nodesMap === "object" &&
    !Array.isArray(nodesMap) &&
    !obj.document &&
    !obj.children
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
  const docNode = obj.document;
  const node = (
    docNode && typeof docNode === "object" ? docNode : obj
  ) as Record<string, unknown>;

  // If the node itself is a CANVAS, treat it as a single page
  if (node.type === "CANVAS" && Array.isArray(node.children)) {
    return [
      {
        name: node.name as string | undefined,
        backgroundColor: node.backgroundColor as
          | { r: number; g: number; b: number; a: number }
          | undefined,
        children: node.children as Array<Record<string, unknown>>,
      },
    ];
  }

  const children: Array<Record<string, unknown>> | undefined = Array.isArray(
    node.children
  )
    ? (node.children as Array<Record<string, unknown>>)
    : undefined;

  if (!children || children.length === 0) {
    // Single node with no children — treat the node itself as the only root
    if (node.type && node.id) {
      return [
        {
          name: (node.name as string | undefined) ?? "Page",
          children: [node as Record<string, unknown>],
        },
      ];
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
    return [{ name: (node.name as string | undefined) ?? "Page", children }];
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
  const result = restJsonToGridaDocument(json, {
    images,
    placeholder_for_missing_images: placeholderForMissing,
    preserve_figma_ids: preserveFigmaIds,
    prefer_fixed_text_sizing: preferFixedTextSizing,
  });
  return packGridaDocumentResult(result);
}

// ---------------------------------------------------------------------------
// restJsonToGridaDocument — returns in-memory Document (no .grida packing)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared in-memory result type
// ---------------------------------------------------------------------------

export interface GridaDocumentResult {
  document: grida.program.document.Document;
  /** Raw image bytes keyed by hash (for `canvas.addImageWithId` / `editor.loadImages`) */
  assets: Record<string, Uint8Array>;
  /** Image ref hashes referenced by converted paints */
  imageRefsUsed: string[];
  /** Page names included in the output */
  pageNames: string[];
}

// ---------------------------------------------------------------------------
// restJsonToGridaDocument
// ---------------------------------------------------------------------------

export interface RestJsonToGridaOptions extends Pick<
  iofigma.restful.factory.FactoryContext,
  | "prefer_fixed_text_sizing"
  | "preserve_figma_ids"
  | "placeholder_for_missing_images"
> {
  /**
   * Image hashes from Figma `images` metadata to raw bytes. When provided,
   * resolves `IMAGE` paint refs to `res://images/<hash>`.
   */
  images?: Record<string, Uint8Array>;

  /**
   * When provided, scope conversion to a single node subtree. The node is
   * looked up by walking all pages; the resulting document contains only
   * that node and its descendants.
   */
  rootNodeId?: string;
}

/** @deprecated Use {@link GridaDocumentResult} instead. */
export type RestJsonToGridaResult = GridaDocumentResult;

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
): GridaDocumentResult {
  _idCounter = 0;
  const images = options?.images;
  const preserveFigmaIds = options?.preserve_figma_ids;
  const placeholderForMissing =
    options?.placeholder_for_missing_images !== false;
  const rootNodeId = options?.rootNodeId;

  // Single-node scoping: find the target node and convert just its subtree.
  if (rootNodeId != null && rootNodeId !== "") {
    const node = findNodeInRestJson(json, rootNodeId);
    if (!node) {
      throw new Error(
        `restJsonToGridaDocument: node with id "${rootNodeId}" not found in document`
      );
    }

    let rootIdUsed = false;
    let counter = 0;
    const context: iofigma.restful.factory.FactoryContext = {
      gradient_id_generator: () => `grad-${++counter}`,
      prefer_path_for_geometry: true,
      placeholder_for_missing_images: placeholderForMissing,
      preserve_figma_ids: preserveFigmaIds,
      prefer_fixed_text_sizing: options?.prefer_fixed_text_sizing,
      node_id_generator: preserveFigmaIds
        ? undefined
        : () => {
            if (!rootIdUsed) {
              rootIdUsed = true;
              return rootNodeId;
            }
            return `rest-import-${++counter}`;
          },
      ...(images &&
        Object.keys(images).length > 0 && {
          resolve_image_src: (ref: string) =>
            ref in images ? `res://images/${ref}` : null,
        }),
    };

    const { document: packed, imageRefsUsed } =
      // oxlint-disable-next-line typescript/no-explicit-any
      iofigma.restful.factory.document(node as any, {}, context);
    const fullDoc =
      grida.program.nodes.factory.packed_scene_document_to_full_document(
        packed
      );

    const assets: Record<string, Uint8Array> = {};
    if (images) {
      for (const ref of imageRefsUsed) {
        if (ref in images) assets[ref] = images[ref];
      }
    }

    return {
      document: fullDoc,
      assets,
      imageRefsUsed,
      pageNames: ["Page 1"],
    };
  }

  // Full-document conversion (all pages).
  const merged = restJsonToMergedDocument(
    json,
    images,
    placeholderForMissing,
    preserveFigmaIds,
    options?.prefer_fixed_text_sizing
  );

  return {
    document: merged.document,
    assets: merged.imageRecord,
    imageRefsUsed: Array.from(merged.imageRefsUsed),
    pageNames: merged.pageNames,
  };
}

// ---------------------------------------------------------------------------
// figBytesToGridaDocument
// ---------------------------------------------------------------------------

export interface FigBytesToGridaOptions extends Pick<
  iofigma.restful.factory.FactoryContext,
  | "prefer_fixed_text_sizing"
  | "preserve_figma_ids"
  | "placeholder_for_missing_images"
> {
  /** Convert specific page indices only. */
  pages?: number[];

  /**
   * When provided, scope conversion to the page containing this node.
   * Only that page is converted.
   */
  rootNodeId?: string;

  /**
   * When provided (and `rootNodeId` is not), load only this page by index.
   */
  pageIndex?: number;
}

/** @deprecated Use {@link GridaDocumentResult} instead. */
export type FigBytesToGridaResult = GridaDocumentResult;

/**
 * Convert `.fig` bytes (Figma's native binary format) into a single Grida
 * `Document` with one scene per page.
 *
 * Returns the in-memory `Document` + assets without packing into a `.grida`
 * ZIP archive.
 */
export function figBytesToGridaDocument(
  input: Uint8Array,
  options?: FigBytesToGridaOptions
): GridaDocumentResult {
  _idCounter = 0;
  const figFile = iofigma.kiwi.parseFile(input);
  return figFileToGridaDocument(figFile, options);
}

/**
 * Convert a pre-parsed `FigFileDocument` into a Grida `Document`.
 *
 * Useful when you already hold the parse result (e.g. from
 * `parseFileFromStream`) and want to avoid re-parsing.
 */
export function figFileToGridaDocument(
  figFile: ReturnType<typeof iofigma.kiwi.parseFile>,
  options?: FigBytesToGridaOptions
): GridaDocumentResult {
  const extractedImages = iofigma.kiwi.extractImages(figFile.zip_files);
  const placeholderForMissing =
    options?.placeholder_for_missing_images !== false;

  const rootNodeId = options?.rootNodeId;
  const pageIndex = options?.pageIndex;

  let pages = [...figFile.pages].sort((a, b) =>
    a.sortkey < b.sortkey ? -1 : a.sortkey > b.sortkey ? 1 : 0
  );

  // Scope to specific pages by index if requested (and not scoped by node).
  if (rootNodeId == null || rootNodeId === "") {
    if (pageIndex != null && pageIndex >= 0 && pageIndex < pages.length) {
      pages = [pages[pageIndex]];
    } else if (options?.pages && options.pages.length > 0) {
      pages = options.pages
        .filter((i) => i >= 0 && i < pages.length)
        .map((i) => pages[i]);
    }
  } else {
    // rootNodeId: find the page containing that node
    const pageWithNode = findPageContainingNode(figFile, rootNodeId);
    if (!pageWithNode) {
      throw new Error(
        `figBytesToGridaDocument: node with id "${rootNodeId}" not found in .fig`
      );
    }
    pages = [pageWithNode as (typeof pages)[0]];
  }

  const pageResults: FigPageResult[] = [];
  for (const page of pages) {
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

  const merged = mergeFigPages(pageResults, (ref) => extractedImages.get(ref));

  return {
    document: merged.document,
    assets: merged.imageRecord,
    imageRefsUsed: Array.from(merged.imageRefsUsed),
    pageNames: merged.pageNames,
  };
}

// ---------------------------------------------------------------------------
// deckBytesToSlidesDocument — .deck → Grida Slides document
// ---------------------------------------------------------------------------

export interface DeckToSlidesOptions extends Pick<
  iofigma.restful.factory.SlidesFactoryContext,
  | "prefer_fixed_text_sizing"
  | "preserve_figma_ids"
  | "placeholder_for_missing_images"
> {}

/**
 * Convert a Figma Deck (`.deck`) file into a Grida Slides `Document`.
 *
 * The resulting document has **one scene** whose root children are
 * `TrayNode`s — one per slide. `SLIDE_GRID` and `SLIDE_ROW` wrapper
 * nodes are skipped; their children (the actual `SLIDE` nodes) are
 * promoted directly under the scene.
 *
 * This matches the Grida Slides model described in
 * `docs/wg/feat-slides/plan.md`.
 *
 * @param input - `.deck` file bytes (same binary format as `.fig`)
 * @param options - Optional conversion options
 * @returns In-memory Document + assets
 */
export function deckBytesToSlidesDocument(
  input: Uint8Array,
  options?: DeckToSlidesOptions
): GridaDocumentResult {
  _idCounter = 0;
  const figFile = iofigma.kiwi.parseFile(input);
  const extractedImages = iofigma.kiwi.extractImages(figFile.zip_files);
  const placeholderForMissing =
    options?.placeholder_for_missing_images !== false;

  // Use all pages (deck files typically have one page)
  const pages = [...figFile.pages].sort((a, b) =>
    a.sortkey < b.sortkey ? -1 : a.sortkey > b.sortkey ? 1 : 0
  );

  const pageResults: FigPageResult[] = [];
  for (const page of pages) {
    const result = iofigma.kiwi.convertPageToSlidesScene(page, {
      resolve_image_src: (ref: string) =>
        extractedImages.has(ref) ? `res://images/${ref}` : null,
      gradient_id_generator: makeIdGenerator("grad"),
      placeholder_for_missing_images: placeholderForMissing,
      preserve_figma_ids: options?.preserve_figma_ids,
      prefer_fixed_text_sizing: options?.prefer_fixed_text_sizing,
    });
    pageResults.push({ name: page.name, result });
  }

  const merged = mergeFigPages(pageResults, (ref) => extractedImages.get(ref));

  // Rename the single scene to "Slides" for clarity in the slides app.
  if (merged.document.scenes_ref.length === 1) {
    const sceneId = merged.document.scenes_ref[0];
    const sceneNode = merged.document.nodes[sceneId] as
      | { name?: string }
      | undefined;
    if (sceneNode) {
      sceneNode.name = "Slides";
    }
  }

  return {
    document: merged.document,
    assets: merged.imageRecord,
    imageRefsUsed: Array.from(merged.imageRefsUsed),
    pageNames: merged.pageNames,
  };
}

// ---------------------------------------------------------------------------
// Node-finding helpers (used by rootNodeId scoping)
// ---------------------------------------------------------------------------

type RestNode = Record<string, unknown> & {
  id?: string;
  children?: RestNode[];
};

/**
 * Find a node by id in a Figma REST JSON document tree (walks all pages and
 * descendants).
 */
export function findNodeInRestJson(
  json: unknown,
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
 * Find the FigPage that contains a node by id.
 */
export function findPageContainingNode(
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
