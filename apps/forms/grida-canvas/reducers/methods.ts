import { type Draft } from "immer";
import type { IDocumentEditorState, SurfaceRaycastTargeting } from "../state";
import { documentquery } from "../document-query";
import { grida } from "@/grida";
import assert from "assert";
import { v4 } from "uuid";
import { cmath } from "../cmath";
import nodeTransformReducer from "./node-transform.reducer";
import { domapi } from "../domapi";
import { snapMovementToObjects } from "./tools/snap";

/**
 * TODO:
 * - validate the selection by config (which does not exists yet), to only select subset of children or a container, but not both. - when both container and children are selected, when transform, it will transform both, resulting in a weird behavior.
 */
export function self_selectNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  mode: "reset" | "add" | "toggle",
  ...__node_ids: string[]
) {
  for (const node_id of __node_ids) {
    assert(node_id, "Node ID must be provided");
    assert(
      documentquery.__getNodeById(draft, node_id),
      `Node not found with id: "${node_id}"`
    );
  }

  switch (mode) {
    case "add": {
      const set = new Set([...draft.selection, ...__node_ids]);
      const pruned = documentquery.pruneNestedNodes(
        draft.document_ctx,
        Array.from(set)
      );
      draft.selection = pruned;
      break;
    }
    case "toggle": {
      const set = new Set(draft.selection);
      for (const node_id of __node_ids) {
        if (set.has(node_id)) {
          set.delete(node_id);
        } else {
          set.add(node_id);
        }
      }
      const pruned = documentquery.pruneNestedNodes(
        draft.document_ctx,
        Array.from(set)
      );
      draft.selection = pruned;
      break;
    }
    case "reset": {
      const pruned = documentquery.pruneNestedNodes(
        draft.document_ctx,
        __node_ids
      );
      draft.selection = pruned;
      break;
    }
  }
  return draft;
}

export function self_clearSelection<S extends IDocumentEditorState>(
  draft: Draft<S>
) {
  draft.selection = [];
  return draft;
}

/**
 * maps the resize handle (direction) to the transform origin point (inverse)
 */
const __scale_direction_to_transform_origin_point = {
  nw: "se",
  ne: "sw",
  sw: "ne",
  se: "nw",
  n: "s",
  e: "w",
  s: "n",
  w: "e",
} as const;

/**
 * maps the resize handle (direction) to the mouse movement direction multiplier (inverse)
 */
const __resize_handle_to_mouse_direction_multiplier = {
  nw: [-1, -1] as cmath.Vector2,
  ne: [1, -1] as cmath.Vector2,
  sw: [-1, 1] as cmath.Vector2,
  se: [1, 1] as cmath.Vector2,
  n: [0, -1] as cmath.Vector2,
  e: [1, 0] as cmath.Vector2,
  s: [0, 1] as cmath.Vector2,
  w: [-1, 0] as cmath.Vector2,
} as const;

export function self_update_gesture_transform<S extends IDocumentEditorState>(
  draft: Draft<S>
) {
  if (!draft.gesture) return;
  switch (draft.gesture.type) {
    case "translate": {
      return __self_update_gesture_transform_translate(draft);
    }
    case "scale": {
      return __self_update_gesture_transform_scale(draft);
    }
    case "rotate": {
      break;
    }
    case "corner-radius":
    default:
      throw new Error(`Gesture type not supported: ${draft.gesture.type}`);
  }
}

function __self_update_gesture_transform_translate(
  draft: Draft<IDocumentEditorState>
) {
  assert(draft.gesture!.type === "translate", "Gesture type must be translate");
  const { movement: _movement, initial_rects } = draft.gesture!;
  const { translate_with_clone, tarnslate_with_axis_lock } = draft.modifiers;

  // TODO: translate_with_clone
  // if (translate_with_clone) {}

  // axis lock movement with dominant axis
  const adj_movement =
    tarnslate_with_axis_lock === "on"
      ? cmath.ext.movement.axisLockedByDominance(_movement)
      : _movement;

  // set of each sibling and parent of selection
  const snap_target_node_ids = Array.from(
    new Set(
      draft.selection
        .map((node_id) =>
          documentquery
            .getSiblings(draft.document_ctx, node_id)
            .concat(
              documentquery.getParentId(draft.document_ctx, node_id) ?? []
            )
        )
        .flat()
    )
  ).filter((node_id) => !draft.selection.includes(node_id));

  const target_node_rects = snap_target_node_ids.map((node_id) => {
    return domapi.get_node_bounding_rect(node_id)!;
  });

  const results = snapMovementToObjects(
    initial_rects,
    target_node_rects,
    adj_movement
  );

  let i = 0;
  for (const node_id of draft.selection) {
    const node = documentquery.__getNodeById(draft, node_id);
    const r = results[i];
    draft.document.nodes[node_id] = nodeTransformReducer(node, {
      type: "position",
      x: r.position[0],
      y: r.position[1],
    });

    i++;
  }
}

function __self_update_gesture_transform_scale(
  draft: Draft<IDocumentEditorState>
) {
  assert(draft.gesture!.type === "scale", "Gesture type must be scale");
  const { transform_with_center_origin, transform_with_preserve_aspect_ratio } =
    draft.modifiers;

  const {
    selection,
    direction,
    movement: rawMovement,
    initial_bounding_rectangle,
  } = draft.gesture!;
  const node = documentquery.__getNodeById(draft, selection);

  assert(initial_bounding_rectangle);

  // get the origin point based on handle

  const origin =
    transform_with_center_origin === "on"
      ? cmath.rect.center(initial_bounding_rectangle)
      : cmath.rect.getCardinalPoint(
          initial_bounding_rectangle,
          __scale_direction_to_transform_origin_point[direction]
        );

  // inverse the delta based on handle
  const movement = cmath.vector2.multiply(
    __resize_handle_to_mouse_direction_multiplier[direction],
    rawMovement,
    transform_with_center_origin === "on" ? [2, 2] : [1, 1]
  );

  draft.document.nodes[selection] = nodeTransformReducer(node, {
    type: "scale",
    initial: initial_bounding_rectangle,
    origin,
    movement,
    preserveAspectRatio: transform_with_preserve_aspect_ratio === "on",
  });
}

export function self_updateSurfaceHoverState<S extends IDocumentEditorState>(
  draft: Draft<S>
) {
  const target = getSurfaceRayTarget(draft.surface_raycast_detected_node_ids, {
    config: draft.surface_raycast_targeting,
    context: draft,
  });
  draft.hovered_node_id = target;

  if (draft.surface_measurement_targeting === "on") {
    if (target) draft.surface_measurement_target = target;
    else {
      // set root as target
      draft.surface_measurement_target = draft.document.root_id;
    }
  }

  return draft;
}

function getSurfaceRayTarget(
  node_ids_from_point: string[],
  {
    config,
    context,
  }: {
    config: SurfaceRaycastTargeting;
    context: IDocumentEditorState;
  }
): string | undefined {
  const {
    document: { root_id, nodes },
  } = context;

  // Filter the nodes based on the configuration
  const filteredNodes = node_ids_from_point.filter((node_id) => {
    if (config.ignores_root && node_id === root_id) {
      return false; // Ignore the root node if configured
    }

    const node = nodes[node_id];
    if (config.ignores_locked && node?.locked) {
      return false; // Ignore locked nodes if configured
    }

    return true; // Include this node
  });

  // Select the target based on the configuration
  if (config.target === "deepest") {
    return filteredNodes[0]; // Deepest node (first in the array)
  }

  if (config.target === "shallowest") {
    return filteredNodes[filteredNodes.length - 1]; // Shallowest node (last in the array)
  }

  if (config.target === "next") {
    // "Next" logic: find the shallowest node above the deepest one
    const deepestNode = filteredNodes[0];
    if (!deepestNode) return undefined;

    // Get the parent of the deepest node
    const parentNodeId = documentquery.getAncestors(
      context.document_ctx,
      deepestNode
    )[1];
    if (!parentNodeId) return deepestNode; // If no parent, fallback to the deepest node

    // Ensure the parent is part of the filtered nodes
    if (filteredNodes.includes(parentNodeId)) {
      return parentNodeId;
    }

    // Fallback to the deepest node if no valid parent is found
    return deepestNode;
  }

  // If no valid node is found, return undefined
  return undefined;
}

export function self_duplicateNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  ...node_ids: string[]
) {
  for (const node_id of node_ids) {
    if (node_id === draft.document.root_id) continue;

    const node = documentquery.__getNodeById(draft, node_id);

    // serialize the node
    const serialized = JSON.stringify(node);
    const deserialized = JSON.parse(serialized);

    // update the id
    const new_id = v4();
    deserialized.id = new_id;

    const parent_id = documentquery.getParentId(draft.document_ctx, node_id);
    assert(parent_id, `Parent node not found`);

    // insert the node
    self_insertNode(draft, parent_id, deserialized);
  }
}

// TODO: after inserting, refresh fonts registry
export function self_insertNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  parent_id: string,
  node: grida.program.nodes.Node // TODO: NodePrototype
): string {
  const node_id = node.id;

  // Ensure the parent exists in the document
  const parent_node = draft.document.nodes[parent_id];
  assert(parent_node, `Parent node not found with id: "${parent_id}"`);

  // Initialize the parent's children array if it doesn't exist
  if (!("children" in parent_node) || !parent_node.children) {
    assert(parent_node.type === "container", "Parent must be a container node");
    parent_node.children = [];
  }

  // Add the node to the document
  draft.document.nodes[node_id] = node;

  // Update the runtime context with parent-child relationships
  draft.document_ctx.__ctx_nid_to_parent_id[node_id] = parent_id;

  if (!draft.document_ctx.__ctx_nid_to_children_ids[parent_id]) {
    draft.document_ctx.__ctx_nid_to_children_ids[parent_id] = [];
  }
  draft.document_ctx.__ctx_nid_to_children_ids[parent_id].push(node_id);

  // Add the child to the parent's children array (if not already added)
  if (!parent_node.children.includes(node_id)) {
    parent_node.children.push(node_id);
  }

  return node_id;
}

export function self_deleteNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  node_id: string
) {
  draft.selection = [];
  draft.hovered_node_id = undefined;
  const node = draft.document.nodes[node_id];
  const children = "children" in node ? node.children : undefined;
  delete draft.document.nodes[node_id];
  for (const child_id of children || []) {
    delete draft.document.nodes[child_id];
    delete draft.document_ctx.__ctx_nid_to_parent_id[child_id];
    delete draft.document_ctx.__ctx_nid_to_children_ids[child_id];
  }
  const parent_id = draft.document_ctx.__ctx_nid_to_parent_id[node_id];
  if (parent_id) {
    const index = (
      draft.document.nodes[parent_id] as grida.program.nodes.i.IChildren
    ).children!.indexOf(node_id);
    // only splice array when item is found
    if (index > -1) {
      // remove from parent node's children array
      (
        draft.document.nodes[parent_id] as grida.program.nodes.i.IChildren
      ).children!.splice(index, 1);

      // remove from document context
      const parent_children_ids =
        draft.document_ctx.__ctx_nid_to_children_ids[parent_id];
      parent_children_ids.splice(parent_children_ids.indexOf(node_id), 1);
    }
  }
  delete draft.document_ctx.__ctx_nid_to_parent_id[node_id];
  delete draft.document_ctx.__ctx_nid_to_children_ids[node_id];
}
