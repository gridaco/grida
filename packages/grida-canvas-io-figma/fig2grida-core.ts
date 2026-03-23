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

export interface Fig2GridaOptions {
  /** Convert specific page indices only (only applies to `.fig` input). */
  pages?: number[];
  /**
   * When true (default), unresolved image refs are replaced with a checker
   * pattern placeholder. When false, refs are preserved as `res://images/<ref>`
   * so the lazy image loading system can request them at render time.
   */
  placeholder_for_missing_images?: boolean;
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

interface PageResult {
  name: string;
  result: iofigma.restful.factory.FigmaImportResult;
}

interface MergedDocument {
  document: grida.program.document.Document;
  imageRecord: Record<string, Uint8Array>;
  imageRefsUsed: string[];
  pageNames: string[];
}

/**
 * Merge per-page conversion results into a single multi-scene Document and
 * collect referenced image bytes.
 */
function mergePages(
  pageResults: PageResult[],
  imageProvider: (ref: string) => Uint8Array | undefined
): MergedDocument {
  const allImageRefsUsed = new Set<string>();
  const mergedNodes: Record<string, any> = {};
  const mergedLinks: Record<string, string[] | undefined> = {};
  const mergedImages: Record<string, any> = {};
  const mergedBitmaps: Record<string, any> = {};
  const mergedProperties: Record<string, any> = {};
  const scenesRef: string[] = [];

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

    Object.assign(mergedNodes, packed.nodes);
    for (const [key, value] of Object.entries(packed.links)) {
      if (key !== sceneId) {
        mergedLinks[key] = value;
      }
    }
    Object.assign(mergedImages, packed.images);
    Object.assign(mergedBitmaps, packed.bitmaps);
    Object.assign(mergedProperties, packed.properties);

    for (const ref of result.imageRefsUsed) {
      allImageRefsUsed.add(ref);
    }
  }

  // Prune orphan nodes
  const reachable = new Set<string>(scenesRef);
  const queue = [...scenesRef];
  while (queue.length > 0) {
    const id = queue.pop()!;
    const children = mergedLinks[id];
    if (children) {
      for (const childId of children) {
        if (!reachable.has(childId)) {
          reachable.add(childId);
          queue.push(childId);
        }
      }
    }
  }
  for (const id of Object.keys(mergedNodes)) {
    if (!reachable.has(id)) {
      delete mergedNodes[id];
      delete mergedLinks[id];
    }
  }

  const document: grida.program.document.Document = {
    nodes: mergedNodes,
    links: mergedLinks,
    images: mergedImages,
    bitmaps: mergedBitmaps,
    properties: mergedProperties,
    scenes_ref: scenesRef,
    entry_scene_id: scenesRef[0],
  };

  const imageRefsUsed = Array.from(allImageRefsUsed);
  const imageRecord: Record<string, Uint8Array> = {};
  for (const ref of imageRefsUsed) {
    const imageBytes = imageProvider(ref);
    if (imageBytes) {
      imageRecord[ref] = imageBytes;
    }
  }

  return {
    document,
    imageRecord,
    imageRefsUsed,
    pageNames: pageResults.map((p) => p.name),
  };
}

function packMergedDocument(merged: MergedDocument): Fig2GridaResult {
  const archiveBytes = io.archive.pack(merged.document, merged.imageRecord);
  const nodeCount = Object.keys(merged.document.nodes).filter(
    (id) => merged.document.nodes[id]?.type !== "scene"
  ).length;

  return {
    bytes: archiveBytes,
    pageNames: merged.pageNames,
    nodeCount,
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

  // --- Object input: REST JSON directly ---
  if (!(input instanceof Uint8Array)) {
    return fig2gridaFromRestJson(input, undefined, placeholderForMissing);
  }

  // --- Bytes input: detect format ---
  if (isZip(input)) {
    // Try REST archive ZIP first (contains document.json)
    const restArchive = tryReadRestArchiveZip(input);
    if (restArchive) {
      return fig2gridaFromRestJson(
        restArchive.json,
        restArchive.images,
        placeholderForMissing
      );
    }
    // Otherwise fall through to .fig parser (handles both ZIP and raw Kiwi)
  } else if (input.length > 0 && input[0] === 0x7b /* '{' */) {
    // JSON text — parse and treat as REST API response
    const json = JSON.parse(new TextDecoder().decode(input));
    return fig2gridaFromRestJson(json, undefined, placeholderForMissing);
  }

  return fig2gridaFromFigBytes(input, options);
}

// ---------------------------------------------------------------------------
// .fig bytes path
// ---------------------------------------------------------------------------

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

  const pageResults: PageResult[] = [];
  for (const page of pages) {
    const placeholderForMissing =
      options?.placeholder_for_missing_images !== false;
    const result = iofigma.kiwi.convertPageToScene(page, {
      resolve_image_src: (ref: string) =>
        extractedImages.has(ref) ? `res://images/${ref}` : null,
      gradient_id_generator: makeIdGenerator("grad"),
      prefer_path_for_geometry: true,
      placeholder_for_missing_images: placeholderForMissing,
    });
    pageResults.push({ name: page.name, result });
  }

  return packMergedDocument(
    mergePages(pageResults, (ref) => extractedImages.get(ref))
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
  placeholderForMissing: boolean
): MergedDocument {
  const canvases = extractCanvases(json);

  // A single shared context across all pages prevents ID collisions when
  // merging nodes from different canvases.
  const context: iofigma.restful.factory.FactoryContext = {
    gradient_id_generator: makeIdGenerator("grad"),
    prefer_path_for_geometry: true,
    placeholder_for_missing_images: placeholderForMissing,
    node_id_generator: makeIdGenerator("rest-import"),
    ...(images &&
      Object.keys(images).length > 0 && {
        resolve_image_src: (ref: string) =>
          ref in images ? `res://images/${ref}` : null,
      }),
  };

  const pageResults: PageResult[] = canvases.map((canvas) => ({
    name: canvas.name ?? "Page",
    result: convertRootsToPackedScene(
      canvas.name ?? "Page",
      canvas.children ?? [],
      canvas.backgroundColor,
      context
    ),
  }));

  return mergePages(pageResults, (ref) => (images ? images[ref] : undefined));
}

function fig2gridaFromRestJson(
  json: unknown,
  images: Record<string, Uint8Array> | undefined,
  placeholderForMissing: boolean
): Fig2GridaResult {
  return packMergedDocument(
    restJsonToMergedDocument(json, images, placeholderForMissing)
  );
}

// ---------------------------------------------------------------------------
// Shared per-page conversion: root nodes → FigmaImportResult
// ---------------------------------------------------------------------------

/**
 * Convert an array of root nodes into a single packed scene document.
 * Used by both the REST JSON path and the .fig Kiwi path (via
 * `iofigma.kiwi.convertPageToScene`).
 */
function convertRootsToPackedScene(
  name: string,
  rootNodes: Array<Record<string, unknown>>,
  backgroundColor: { r: number; g: number; b: number; a: number } | undefined,
  context: iofigma.restful.factory.FactoryContext
): iofigma.restful.factory.FigmaImportResult {
  const background_color = backgroundColor
    ? kolor.colorformats.newRGBA32F(
        backgroundColor.r,
        backgroundColor.g,
        backgroundColor.b,
        backgroundColor.a
      )
    : undefined;

  if (rootNodes.length === 0) {
    return {
      document: emptyPackedScene(name, background_color),
      imageRefsUsed: [],
    };
  }

  const individualResults = rootNodes.map((rootNode) =>
    iofigma.restful.factory.document(rootNode as any, {}, context)
  );

  const imageRefsUsed = new Set<string>();
  for (const r of individualResults) {
    for (const ref of r.imageRefsUsed) imageRefsUsed.add(ref);
  }

  let packed: grida.program.document.IPackedSceneDocument;
  if (individualResults.length === 1) {
    packed = individualResults[0].document;
    packed.scene.background_color = background_color;
  } else {
    packed = emptyPackedScene(name, background_color);
    for (const { document: d } of individualResults) {
      Object.assign(packed.nodes, d.nodes);
      Object.assign(packed.links, d.links);
      Object.assign(packed.images, d.images);
      Object.assign(packed.bitmaps, d.bitmaps);
      Object.assign(packed.properties, d.properties);
      packed.scene.children_refs.push(...d.scene.children_refs);
    }
  }

  return {
    document: packed,
    imageRefsUsed: Array.from(imageRefsUsed),
  };
}

function emptyPackedScene(
  name: string,
  background_color: ReturnType<typeof kolor.colorformats.newRGBA32F> | undefined
): grida.program.document.IPackedSceneDocument {
  return {
    nodes: {},
    links: {},
    images: {},
    bitmaps: {},
    properties: {},
    scene: {
      type: "scene",
      id: "tmp",
      name,
      children_refs: [],
      guides: [],
      edges: [],
      constraints: { children: "multiple" },
      background_color,
    },
  };
}

// ---------------------------------------------------------------------------
// restJsonToGridaDocument — returns in-memory Document (no .grida packing)
// ---------------------------------------------------------------------------

export interface RestJsonToGridaOptions {
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
  const merged = restJsonToMergedDocument(json, images, true);

  return {
    document: merged.document,
    assets: merged.imageRecord,
    imageRefsUsed: merged.imageRefsUsed,
  };
}
