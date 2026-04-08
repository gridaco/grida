/**
 * @module serialize
 *
 * Converts between the editor's `grida.program.document.Document` and the
 * sync layer's `DocumentState` (flat record map + scene ordering).
 *
 * This is the bridge between the editor's rich type system and the sync
 * protocol's JSON-serializable flat representation.
 */

import type grida from "@grida/schema";
import type { DocumentState, SerializedNode, NodeId } from "@grida/canvas-sync";

type BitmapsMap = grida.program.document.Document["bitmaps"];

/**
 * Shape of the `__doc_meta__` pseudo-node used to round-trip
 * document-level data through the sync layer's flat record map.
 */
interface DocMetaRecord {
  readonly type: "__doc_meta__";
  readonly id: "__doc_meta__";
  readonly links: Record<string, string[] | undefined>;
  readonly images: Record<string, grida.program.document.ImageRef>;
  readonly bitmaps: BitmapsMap;
  readonly properties: grida.program.schema.Properties;
  readonly metadata: grida.program.document.INodeMetadata["metadata"];
  readonly entry_scene_id: string | null;
}

/**
 * Convert the editor's Document model into the sync-friendly DocumentState.
 *
 * Nodes are serialized as plain JSON objects (they already are JSON-compatible).
 * The `links` adjacency list, images, bitmaps, properties, and metadata are
 * stored as a special `__doc_meta__` pseudo-node so they round-trip through
 * the sync layer.
 */
export function documentToState(
  doc: grida.program.document.Document
): DocumentState {
  const nodes: Record<NodeId, SerializedNode> = {};

  // Serialize all nodes
  for (const [id, node] of Object.entries(doc.nodes)) {
    nodes[id] = node as unknown as SerializedNode;
  }

  // Store document-level data as a special meta record
  const meta: DocMetaRecord = {
    type: "__doc_meta__",
    id: "__doc_meta__",
    links: doc.links ?? {},
    images: doc.images ?? {},
    bitmaps: doc.bitmaps ?? {},
    properties: doc.properties ?? {},
    metadata: doc.metadata,
    entry_scene_id: doc.entry_scene_id ?? null,
  };
  nodes["__doc_meta__"] = meta as unknown as SerializedNode;

  return {
    nodes,
    scenes: doc.scenes_ref ?? [],
  };
}

/**
 * Convert a DocumentState back into the editor's Document model.
 */
export function stateToDocument(
  state: DocumentState
): grida.program.document.Document {
  const nodes: Record<string, grida.program.nodes.Node> = {};
  let links: Record<string, string[] | undefined> = {};
  let images: Record<string, grida.program.document.ImageRef> = {};
  let bitmaps: BitmapsMap = {};
  let properties: grida.program.schema.Properties = {};
  let metadata: grida.program.document.INodeMetadata["metadata"] = undefined;
  let entry_scene_id: string | undefined = undefined;

  for (const [id, serialized] of Object.entries(state.nodes)) {
    if (id === "__doc_meta__") {
      const meta = serialized as unknown as DocMetaRecord;
      links = meta.links ?? {};
      images = meta.images ?? {};
      bitmaps = meta.bitmaps ?? {};
      properties = meta.properties ?? {};
      metadata = meta.metadata ?? undefined;
      entry_scene_id = meta.entry_scene_id ?? undefined;
      continue;
    }
    nodes[id] = serialized as unknown as grida.program.nodes.Node;
  }

  return {
    nodes,
    links,
    scenes_ref: [...state.scenes],
    images,
    bitmaps,
    properties,
    metadata,
    entry_scene_id,
  };
}
