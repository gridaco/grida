/**
 * @module diff
 *
 * Pure functions for computing, applying, and composing document diffs.
 *
 * All functions operate on a flat record map (`Record<NodeId, SerializedNode>`)
 * plus a scene ordering array. This is the "sync-friendly" representation;
 * conversion to/from the editor's `grida.program.document.Document` lives in
 * {@link serialize}.
 */

import type {
  NodeId,
  SerializedNode,
  DocumentDiff,
  NodeOp,
  FieldOp,
  SceneOp,
  JsonValue,
} from "./protocol";

// ---------------------------------------------------------------------------
// Document state — the flat representation used by the sync layer
// ---------------------------------------------------------------------------

export interface DocumentState {
  readonly nodes: Readonly<Record<NodeId, SerializedNode>>;
  readonly scenes: readonly NodeId[];
}

// ---------------------------------------------------------------------------
// computeDiff
// ---------------------------------------------------------------------------

/**
 * Compute the diff needed to transform `before` into `after`.
 * Returns `null` if the two states are identical.
 */
export function computeDiff(
  before: DocumentState,
  after: DocumentState
): DocumentDiff | null {
  const nodeOps: Record<NodeId, NodeOp> = {};
  let hasNodeOps = false;

  // Detect removed nodes (in before but not in after)
  for (const id of Object.keys(before.nodes)) {
    if (!(id in after.nodes)) {
      nodeOps[id] = { op: "remove" };
      hasNodeOps = true;
    }
  }

  // Detect added or changed nodes
  for (const [id, afterNode] of Object.entries(after.nodes)) {
    const beforeNode = before.nodes[id];
    if (!beforeNode) {
      // New node
      nodeOps[id] = { op: "put", node: afterNode };
      hasNodeOps = true;
    } else {
      // Existing node — compute field-level diff
      const patch = computeNodePatch(beforeNode, afterNode);
      if (patch) {
        nodeOps[id] = patch;
        hasNodeOps = true;
      }
    }
  }

  // Detect scene ordering changes
  const sceneOps = computeSceneDiff(before.scenes, after.scenes);
  const hasSceneOps = sceneOps !== null;

  if (!hasNodeOps && !hasSceneOps) {
    return null;
  }

  const diff: DocumentDiff = {};
  if (hasNodeOps) {
    (diff as { nodes: typeof nodeOps }).nodes = nodeOps;
  }
  if (hasSceneOps) {
    (diff as { scenes: typeof sceneOps }).scenes = sceneOps;
  }
  return diff;
}

/**
 * Compute a field-level patch for a single node.
 * Returns `null` if the nodes are identical.
 */
function computeNodePatch(
  before: SerializedNode,
  after: SerializedNode
): NodeOp | null {
  // If the type changed, it's a full replacement
  if (before.type !== after.type) {
    return { op: "put", node: after };
  }

  const fields: Record<string, FieldOp> = {};
  let hasFields = false;

  // Check all keys in `after` for changes or additions
  for (const [key, afterVal] of Object.entries(after)) {
    if (key === "id") continue; // id never changes
    const beforeVal = before[key];
    if (!jsonEqual(beforeVal, afterVal)) {
      fields[key] = { op: "put", value: afterVal };
      hasFields = true;
    }
  }

  // Check for deleted keys (in before but not in after, excluding id)
  for (const key of Object.keys(before)) {
    if (key === "id") continue;
    if (!(key in after)) {
      fields[key] = { op: "delete" };
      hasFields = true;
    }
  }

  if (!hasFields) return null;
  return { op: "patch", fields };
}

/**
 * Compute scene diff. Returns scene ops or null if identical.
 */
function computeSceneDiff(
  before: readonly NodeId[],
  after: readonly NodeId[]
): SceneOp[] | null {
  // Quick equality check
  if (
    before.length === after.length &&
    before.every((id, i) => id === after[i])
  ) {
    return null;
  }

  const ops: SceneOp[] = [];
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  // Removed scenes
  for (const id of before) {
    if (!afterSet.has(id)) {
      ops.push({ op: "remove", id });
    }
  }

  // Added scenes
  for (const id of after) {
    if (!beforeSet.has(id)) {
      ops.push({ op: "add", id });
    }
  }

  // If the set is the same but order changed, emit a reorder
  if (ops.length === 0) {
    ops.push({ op: "reorder", ids: after });
  }

  return ops;
}

// ---------------------------------------------------------------------------
// applyDiff
// ---------------------------------------------------------------------------

/**
 * Apply a diff to a document state, producing a new state.
 * This is a pure function — the input state is not mutated.
 */
export function applyDiff(
  state: DocumentState,
  diff: DocumentDiff
): DocumentState {
  let nodes = { ...state.nodes };
  let scenes = [...state.scenes];

  // Apply node operations
  if (diff.nodes) {
    for (const [id, op] of Object.entries(diff.nodes)) {
      switch (op.op) {
        case "put":
          nodes[id] = op.node;
          break;
        case "patch":
          if (id in nodes) {
            nodes[id] = applyFieldOps(nodes[id], op.fields);
          }
          // If node doesn't exist, skip (server should have validated)
          break;
        case "remove":
          delete nodes[id];
          break;
      }
    }
  }

  // Apply scene operations (in order)
  if (diff.scenes) {
    for (const sceneOp of diff.scenes) {
      switch (sceneOp.op) {
        case "add":
          if (!scenes.includes(sceneOp.id)) {
            scenes.push(sceneOp.id);
          }
          break;
        case "remove":
          scenes = scenes.filter((id) => id !== sceneOp.id);
          break;
        case "reorder":
          scenes = [...sceneOp.ids];
          break;
      }
    }
  }

  return { nodes, scenes };
}

/**
 * Apply field-level operations to a serialized node, returning a new node.
 */
function applyFieldOps(
  node: SerializedNode,
  fields: Readonly<Record<string, FieldOp>>
): SerializedNode {
  const result: Record<string, JsonValue> = { ...node };
  for (const [key, op] of Object.entries(fields)) {
    switch (op.op) {
      case "put":
        result[key] = op.value;
        break;
      case "delete":
        delete result[key];
        break;
    }
  }
  return result as SerializedNode;
}

// ---------------------------------------------------------------------------
// composeDiffs
// ---------------------------------------------------------------------------

/**
 * Compose two diffs into a single diff that has the same effect as
 * applying `a` followed by `b`.
 *
 * This is used by SyncClient to merge unsent local changes into one diff.
 */
export function composeDiffs(a: DocumentDiff, b: DocumentDiff): DocumentDiff {
  const nodes: Record<NodeId, NodeOp> = {};

  // Start with all ops from `a`
  if (a.nodes) {
    for (const [id, op] of Object.entries(a.nodes)) {
      nodes[id] = op;
    }
  }

  // Merge ops from `b`
  if (b.nodes) {
    for (const [id, bOp] of Object.entries(b.nodes)) {
      const aOp = nodes[id];
      if (!aOp) {
        nodes[id] = bOp;
        continue;
      }
      nodes[id] = composeNodeOps(aOp, bOp);
    }
  }

  // Scene ops: just concatenate (they are applied in order)
  const scenes =
    a.scenes || b.scenes
      ? [...(a.scenes ?? []), ...(b.scenes ?? [])]
      : undefined;

  const result: DocumentDiff = {};
  if (Object.keys(nodes).length > 0) {
    (result as { nodes: typeof nodes }).nodes = nodes;
  }
  if (scenes && scenes.length > 0) {
    (result as { scenes: typeof scenes }).scenes = scenes;
  }
  return result;
}

/**
 * Compose two node-level operations.
 */
function composeNodeOps(a: NodeOp, b: NodeOp): NodeOp {
  // If b is a full put or remove, it overrides anything
  if (b.op === "put" || b.op === "remove") {
    return b;
  }

  // b is "patch"
  if (a.op === "remove") {
    // Can't patch a removed node — the patch wins (implies re-creation path)
    return b;
  }

  if (a.op === "put") {
    // Apply b's patches to a's node snapshot
    const patched = applyFieldOps(a.node, b.fields);
    return { op: "put", node: patched };
  }

  // Both are "patch" — merge field ops (b overrides a for same keys)
  const fields: Record<string, FieldOp> = { ...a.fields, ...b.fields };
  return { op: "patch", fields };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Check if a diff is empty (no effective operations). */
export function isDiffEmpty(diff: DocumentDiff): boolean {
  const hasNodes = diff.nodes && Object.keys(diff.nodes).length > 0;
  const hasScenes = diff.scenes && diff.scenes.length > 0;
  const hasMeta = diff.metadata && Object.keys(diff.metadata).length > 0;
  return !hasNodes && !hasScenes && !hasMeta;
}

/**
 * Deep equality check for JSON values.
 * Used to detect whether a field has actually changed.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!jsonEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
      if (!jsonEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return false;
}
