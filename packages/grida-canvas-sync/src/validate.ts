/**
 * @module validate
 *
 * Server-side validation of incoming diffs against canonical state.
 * The server calls `validateDiff` before applying a push. Invalid
 * operations are collected as errors; the server can then decide to
 * discard the entire push or strip invalid ops.
 */

import type { DocumentDiff, NodeId, NodeOp } from "./protocol";
import type { DocumentState } from "./diff";

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface ValidationError {
  /** The node ID (or "__document__" for doc-level issues). */
  readonly target: string;
  readonly code: ValidationErrorCode;
  readonly message: string;
}

export type ValidationErrorCode =
  | "PATCH_MISSING_NODE" // Trying to patch a node that doesn't exist
  | "REMOVE_MISSING_NODE" // Trying to remove a node that doesn't exist
  | "PUT_MISSING_TYPE" // Put node is missing the `type` field
  | "PUT_MISSING_ID" // Put node is missing the `id` field
  | "PUT_ID_MISMATCH" // Put node's id doesn't match the key in the diff
  | "PATCH_IMMUTABLE_FIELD" // Trying to patch `id` or `type`
  | "SCENE_ADD_MISSING_NODE" // Adding a scene ref for a node that doesn't exist
  | "SCENE_ADD_NOT_SCENE" // Adding a scene ref for a node that isn't a scene type
  | "SCENE_REMOVE_MISSING"; // Removing a scene ref that doesn't exist

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
}

// ---------------------------------------------------------------------------
// validateDiff
// ---------------------------------------------------------------------------

/**
 * Validate a diff against the current canonical state.
 *
 * Returns a result with `valid: true` and empty errors if everything checks out.
 * Otherwise returns the list of issues found.
 *
 * This does NOT check authorization — only structural validity.
 */
export function validateDiff(
  state: DocumentState,
  diff: DocumentDiff
): ValidationResult {
  const errors: ValidationError[] = [];

  if (diff.nodes) {
    for (const [id, op] of Object.entries(diff.nodes)) {
      validateNodeOp(state, id, op, errors);
    }
  }

  if (diff.scenes) {
    // Build a projected node set with types (after applying node ops from this diff)
    const projectedNodeTypes = new Map<string, string>();
    for (const [id, node] of Object.entries(state.nodes)) {
      projectedNodeTypes.set(id, node.type);
    }
    if (diff.nodes) {
      for (const [id, op] of Object.entries(diff.nodes)) {
        if (op.op === "put") projectedNodeTypes.set(id, op.node.type);
        if (op.op === "remove") projectedNodeTypes.delete(id);
      }
    }

    const currentScenes = new Set(state.scenes);
    for (const sceneOp of diff.scenes) {
      switch (sceneOp.op) {
        case "add":
          if (!projectedNodeTypes.has(sceneOp.id)) {
            errors.push({
              target: sceneOp.id,
              code: "SCENE_ADD_MISSING_NODE",
              message: `Scene add references non-existent node "${sceneOp.id}"`,
            });
          } else if (projectedNodeTypes.get(sceneOp.id) !== "scene") {
            errors.push({
              target: sceneOp.id,
              code: "SCENE_ADD_NOT_SCENE",
              message: `Scene add references node "${sceneOp.id}" with type "${projectedNodeTypes.get(sceneOp.id)}", expected "scene"`,
            });
          }
          break;
        case "remove":
          if (!currentScenes.has(sceneOp.id)) {
            errors.push({
              target: sceneOp.id,
              code: "SCENE_REMOVE_MISSING",
              message: `Scene remove references non-existent scene "${sceneOp.id}"`,
            });
          }
          break;
        // "reorder" — no structural validation needed (just a permutation)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateNodeOp(
  state: DocumentState,
  id: NodeId,
  op: NodeOp,
  errors: ValidationError[]
): void {
  switch (op.op) {
    case "put": {
      if (!op.node.type) {
        errors.push({
          target: id,
          code: "PUT_MISSING_TYPE",
          message: `Put for "${id}" is missing the "type" field`,
        });
      }
      if (!op.node.id) {
        errors.push({
          target: id,
          code: "PUT_MISSING_ID",
          message: `Put for "${id}" is missing the "id" field`,
        });
      }
      if (op.node.id && op.node.id !== id) {
        errors.push({
          target: id,
          code: "PUT_ID_MISMATCH",
          message: `Put for "${id}" has mismatched id "${op.node.id}"`,
        });
      }
      break;
    }
    case "patch": {
      if (!(id in state.nodes)) {
        errors.push({
          target: id,
          code: "PATCH_MISSING_NODE",
          message: `Patch targets non-existent node "${id}"`,
        });
      }
      // Check for immutable field mutations
      for (const key of Object.keys(op.fields)) {
        if (key === "id" || key === "type") {
          errors.push({
            target: id,
            code: "PATCH_IMMUTABLE_FIELD",
            message: `Patch for "${id}" attempts to change immutable field "${key}"`,
          });
        }
      }
      break;
    }
    case "remove": {
      if (!(id in state.nodes)) {
        errors.push({
          target: id,
          code: "REMOVE_MISSING_NODE",
          message: `Remove targets non-existent node "${id}"`,
        });
      }
      break;
    }
  }
}
