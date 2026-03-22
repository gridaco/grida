/**
 * @fileoverview fig2grida — browser-safe programmatic API
 *
 * Converts a `.fig` file (Uint8Array) into a `.grida` archive (Uint8Array).
 * Pure function: no fs, no Node.js APIs.
 *
 * @example
 * ```ts
 * import { fig2grida } from "@grida/io-figma/fig2grida-core";
 *
 * const figBytes = new Uint8Array(/* .fig file * /);
 * const { bytes, pageNames, nodeCount, imageCount } = fig2grida(figBytes);
 * ```
 */
import { iofigma } from "./lib";
import { io } from "@grida/io";
import grida from "@grida/schema";

export interface Fig2GridaOptions {
  /** Convert specific page indices only. Default: all pages. */
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

/**
 * Convert a .fig file to a .grida archive.
 * Pure function: Uint8Array in, Uint8Array out. No fs, no Node.js APIs.
 */
export function fig2grida(
  input: Uint8Array,
  options?: Fig2GridaOptions
): Fig2GridaResult {
  // Reset counter for each invocation
  _idCounter = 0;

  // 1. Parse .fig file
  const figFile = iofigma.kiwi.parseFile(input);

  // 2. Extract images from the .fig ZIP
  const extractedImages = iofigma.kiwi.extractImages(figFile.zip_files);

  // 3. Select pages (filter by index if specified, sort by sortkey)
  let pages = [...figFile.pages].sort((a, b) =>
    a.sortkey.localeCompare(b.sortkey)
  );

  if (options?.pages && options.pages.length > 0) {
    pages = options.pages
      .filter((i) => i >= 0 && i < pages.length)
      .map((i) => pages[i]);
  }

  // 4. Convert each page to a packed scene document
  const pageResults: Array<{
    name: string;
    result: iofigma.restful.factory.FigmaImportResult;
  }> = [];

  for (const page of pages) {
    const result = iofigma.kiwi.convertPageToScene(page, {
      resolve_image_src: (ref: string) =>
        extractedImages.has(ref) ? `res://images/${ref}` : null,
      gradient_id_generator: makeIdGenerator("grad"),
    });
    pageResults.push({ name: page.name, result });
  }

  // 5. Merge pages into a multi-scene Document
  const allImageRefsUsed = new Set<string>();
  const mergedNodes: Record<string, any> = {};
  const mergedLinks: Record<string, string[] | undefined> = {};
  const mergedImages: Record<string, any> = {};
  const mergedBitmaps: Record<string, any> = {};
  const mergedProperties: Record<string, any> = {};
  const scenesRef: string[] = [];

  for (const { name, result } of pageResults) {
    const packed = result.document;

    // Generate a unique scene ID
    const sceneId = packed.scene.id === "tmp" ? makeIdGenerator("scene")() : packed.scene.id;

    // Create SceneNode from the packed scene
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

    // Add scene node to merged nodes
    mergedNodes[sceneId] = sceneNode;
    // Wire up scene children in links
    mergedLinks[sceneId] = packed.scene.children_refs;
    scenesRef.push(sceneId);

    // Merge all nodes, links, images, bitmaps, properties
    Object.assign(mergedNodes, packed.nodes);
    // Merge links carefully (don't overwrite scene link we just set)
    for (const [key, value] of Object.entries(packed.links)) {
      if (key !== sceneId) {
        mergedLinks[key] = value;
      }
    }
    Object.assign(mergedImages, packed.images);
    Object.assign(mergedBitmaps, packed.bitmaps);
    Object.assign(mergedProperties, packed.properties);

    // Collect image refs
    for (const ref of result.imageRefsUsed) {
      allImageRefsUsed.add(ref);
    }
  }

  // 6. Prune orphan nodes — nodes in `nodes` but not reachable from any scene
  //    through the `links` graph. The FlatBuffers encoder requires a parent
  //    reference for every non-scene node; orphans would cause a required-field
  //    error during serialization.
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

  // Remove unreachable nodes and their links
  for (const id of Object.keys(mergedNodes)) {
    if (!reachable.has(id)) {
      delete mergedNodes[id];
      delete mergedLinks[id];
    }
  }

  // 7. Build final Document
  const document: grida.program.document.Document = {
    nodes: mergedNodes,
    links: mergedLinks,
    images: mergedImages,
    bitmaps: mergedBitmaps,
    properties: mergedProperties,
    scenes_ref: scenesRef,
    entry_scene_id: scenesRef[0],
  };

  // 8. Build images record — only include referenced images
  const imageRecord: Record<string, Uint8Array> = {};
  for (const ref of allImageRefsUsed) {
    const imageBytes = extractedImages.get(ref);
    if (imageBytes) {
      // Store with the hash as key (pack() adds `images/` prefix)
      imageRecord[ref] = imageBytes;
    }
  }

  // 9. Pack into .grida archive
  const archiveBytes = io.archive.pack(document, imageRecord);

  // 10. Compute stats
  const nodeCount = Object.keys(mergedNodes).filter(
    (id) => mergedNodes[id]?.type !== "scene"
  ).length;

  return {
    bytes: archiveBytes,
    pageNames: pageResults.map((p) => p.name),
    nodeCount,
    imageCount: Object.keys(imageRecord).length,
  };
}
