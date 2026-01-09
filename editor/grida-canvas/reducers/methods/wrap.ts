import type { Draft } from "immer";
import type { ReducerContext } from "..";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import cmath from "@grida/cmath";
import tree from "@grida/tree";
import { self_moveNode } from "./move";
import { self_insertSubDocument } from "./insert";
import * as modeProperties from "@/grida-canvas/utils/properties";
import cg from "@grida/cg";
import "core-js/features/object/group-by";

/**
 * Preserves the original order of nodes in their parent's children array.
 * This ensures that when nodes are grouped, their visual stacking order is maintained.
 *
 * @param draft - Mutable editor state draft
 * @param nodeIds - Node ids to sort by their original order
 * @returns Array of node ids sorted by their original index in parent's children array
 */
function preserveOriginalOrder<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  nodeIds: string[]
): string[] {
  // Group nodes by their parent
  const groups = Object.groupBy(
    nodeIds,
    (nodeId) => dq.getParentId(draft.document_ctx, nodeId) ?? draft.scene_id!
  );

  const result: string[] = [];

  Object.keys(groups).forEach((parentId) => {
    const nodesInParent = groups[parentId]!;

    // For all nodes, sort by their index in parent's children array using links
    const parentChildren = draft.document.links[parentId] || [];
    const sorted = nodesInParent.sort((a, b) => {
      const indexA = parentChildren.indexOf(a);
      const indexB = parentChildren.indexOf(b);
      return indexA - indexB;
    });
    result.push(...sorted);
  });

  return result;
}

/**
 * Wraps the provided nodes with a newly created container or group node.
 *
 * Nodes are grouped by their current parent. Each group is wrapped
 * separately, preserving the relative position of the nodes within the new
 * wrapper. When the scene enforces a single root child, root level nodes are
 * ignored.
 *
 * @param draft - Mutable editor state draft
 * @param nodeIds - Node ids to wrap
 * @param kind - Wrapper node type, either `container` or `group`
 * @param geometry - Geometry query used to compute bounding rectangles
 * @returns Array of newly inserted wrapper node ids
 */
export function self_wrapNodes<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  nodeIds: string[],
  kind: "container" | "group",
  context: ReducerContext
): grida.program.nodes.NodeID[] {
  const scene = draft.document.nodes[
    draft.scene_id!
  ] as grida.program.nodes.SceneNode;
  const scene_children = draft.document.links[draft.scene_id!] || [];

  // Filter nodes and preserve their original order
  const filteredNodeIds = nodeIds.filter((id) => {
    const isRoot = scene_children.includes(id);
    return scene.constraints.children !== "single" || !isRoot;
  });

  // Preserve the original order of nodes in their parent's children array
  const orderedNodeIds = preserveOriginalOrder(draft, filteredNodeIds);

  const groups = Object.groupBy(
    orderedNodeIds,
    (nodeId) => dq.getParentId(draft.document_ctx, nodeId) ?? draft.scene_id!
  );

  const inserted: grida.program.nodes.NodeID[] = [];

  Object.keys(groups).forEach((parentId) => {
    const g = groups[parentId]!;
    const isScene = parentId === draft.scene_id;

    let delta: cmath.Vector2;
    if (isScene) {
      delta = [0, 0];
    } else {
      const parentRect =
        context.geometry.getNodeAbsoluteBoundingRect(parentId)!;
      delta = [-parentRect.x, -parentRect.y];
    }

    const rects = g
      .map((nodeId) => context.geometry.getNodeAbsoluteBoundingRect(nodeId)!)
      .map((rect) => cmath.rect.translate(rect, delta))
      .map((rect) => cmath.rect.quantize(rect, 1));

    const union = cmath.rect.union(rects);

    const prototype: grida.program.nodes.NodePrototype = {
      type: kind,
      layout_inset_top: cmath.quantize(union.y, 1),
      layout_inset_left: cmath.quantize(union.x, 1),
      children: [],
      position: "absolute",
    } satisfies grida.program.nodes.NodePrototype;

    if (prototype.type === "container") {
      prototype.layout_target_width = union.width;
      prototype.layout_target_height = union.height;
    }

    const wrapperId = self_insertSubDocument(
      draft,
      isScene ? null : parentId,
      grida.program.nodes.factory.create_packed_scene_document_from_prototype(
        prototype,
        () => context.idgen.next()
      )
    )[0];

    // Move nodes in their preserved order
    g.forEach((id) => {
      self_moveNode(draft, id, wrapperId);
    });

    g.forEach((id) => {
      const child = dq.__getNodeById(draft, id);
      if (
        "layout_inset_left" in child &&
        typeof child.layout_inset_left === "number"
      ) {
        child.layout_inset_left -= union.x;
      }
      if (
        "layout_inset_top" in child &&
        typeof child.layout_inset_top === "number"
      ) {
        child.layout_inset_top -= union.y;
      }
    });

    inserted.push(wrapperId);
  });

  return inserted;
}

/**
 * Ungroups the provided group or boolean nodes, preserving the children's absolute positions.
 *
 * This operation is allowed for "group" nodes (GroupNode) and "boolean" nodes (BooleanPathOperationNode).
 * It moves all children to the parent of the node and adjusts their positions to preserve their
 * absolute positions in the canvas.
 *
 * @param draft - Mutable editor state draft
 * @param groupNodeIds - Array of group or boolean node ids to ungroup
 * @param geometry - Geometry query used to compute bounding rectangles
 */
export function self_ungroup<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  groupNodeId: string,
  geometry: editor.api.IDocumentGeometryQuery
): string[] {
  const node = dq.__getNodeById(draft, groupNodeId);

  // Reject if not a group or boolean node
  if (!node || (node.type !== "group" && node.type !== "boolean")) {
    return [];
  }

  // Get node's children from links
  const nodeChildren = draft.document.links[groupNodeId];
  if (!Array.isArray(nodeChildren) || nodeChildren.length === 0) {
    return [];
  }

  const parent_id = dq.getParentId(draft.document_ctx, groupNodeId);
  const target_parent = parent_id ?? draft.scene_id!;

  // Get the node's absolute position
  const node_rect = geometry.getNodeAbsoluteBoundingRect(groupNodeId);
  if (!node_rect) {
    return [];
  }

  // Calculate the offset needed to preserve absolute positions
  let offset_x = node_rect.x;
  let offset_y = node_rect.y;

  // If the target parent is not the scene, we need to account for its position
  if (target_parent !== draft.scene_id) {
    const parent_rect = geometry.getNodeAbsoluteBoundingRect(target_parent);
    if (parent_rect) {
      offset_x -= parent_rect.x;
      offset_y -= parent_rect.y;
    }
  }

  // Collect all ungrouped children to return them
  const ungroupedChildren: string[] = [];

  // Move all children to the parent of the node, preserving their order
  const children_to_move: string[] = [...nodeChildren];
  children_to_move.forEach((child_id) => {
    // Move the child to the node's parent
    self_moveNode(draft, child_id, target_parent);

    // Adjust the child's position to preserve absolute position
    const child = dq.__getNodeById(draft, child_id);
    if (
      "layout_inset_left" in child &&
      typeof child.layout_inset_left === "number"
    ) {
      child.layout_inset_left += offset_x;
    }
    if (
      "layout_inset_top" in child &&
      typeof child.layout_inset_top === "number"
    ) {
      child.layout_inset_top += offset_y;
    }

    // Add to the list of ungrouped children
    ungroupedChildren.push(child_id);
  });

  // Use Graph.unlink() - mutates draft.document directly (scene is now a node!)
  const graphInstance = new tree.graph.Graph(draft.document);
  graphInstance.unlink(groupNodeId);

  // Update context from graph's cached LUT
  // Create final graph instance to get updated LUT after all operations
  const finalGraph = new tree.graph.Graph(draft.document);
  draft.document_ctx = finalGraph.lut;

  // Return the ungrouped children (selection update is handled by caller)
  return ungroupedChildren;
}

/**
 * Wraps the provided nodes into a BooleanPathOperationNode with the specified operation.
 * Similar to self_wrapNodes but creates a BooleanPathOperationNode instead of a group.
 *
 * @param draft - Mutable editor state draft
 * @param nodeIds - Node ids to wrap
 * @param op - Boolean operation type
 * @param geometry - Geometry query used to compute bounding rectangles
 * @returns Array of newly inserted wrapper node ids
 */
export function self_wrapNodesAsBooleanOperation<
  S extends editor.state.IEditorState,
>(
  draft: Draft<S>,
  nodeIds: string[],
  op: cg.BooleanOperation,
  context: ReducerContext
): grida.program.nodes.NodeID[] {
  const scene = draft.document.nodes[
    draft.scene_id!
  ] as grida.program.nodes.SceneNode;
  const scene_children = draft.document.links[draft.scene_id!] || [];

  // Filter nodes and preserve their original order
  const filteredNodeIds = nodeIds.filter((id) => {
    const isRoot = scene_children.includes(id);
    return scene.constraints.children !== "single" || !isRoot;
  });

  // Preserve the original order of nodes in their parent's children array
  const orderedNodeIds = preserveOriginalOrder(draft, filteredNodeIds);

  const groups = Object.groupBy(
    orderedNodeIds,
    (nodeId) => dq.getParentId(draft.document_ctx, nodeId) ?? draft.scene_id!
  );

  const inserted: grida.program.nodes.NodeID[] = [];

  Object.keys(groups).forEach((parentId) => {
    const g = groups[parentId]!;
    const isScene = parentId === draft.scene_id;

    let delta: cmath.Vector2;
    if (isScene) {
      delta = [0, 0];
    } else {
      const parentRect =
        context.geometry.getNodeAbsoluteBoundingRect(parentId)!;
      delta = [-parentRect.x, -parentRect.y];
    }

    const rects = g
      .map((nodeId) => context.geometry.getNodeAbsoluteBoundingRect(nodeId)!)
      .map((rect) => cmath.rect.translate(rect, delta))
      .map((rect) => cmath.rect.quantize(rect, 1));

    const union = cmath.rect.union(rects);

    // Get the nodes to calculate mode values
    const nodes = g.map((id) => dq.__getNodeById(draft, id));

    const prototype: grida.program.nodes.BooleanPathOperationNodePrototype = {
      type: "boolean",
      layout_inset_top: cmath.quantize(union.y, 1),
      layout_inset_left: cmath.quantize(union.x, 1),
      children: [],
      position: "absolute",
      op: op,
      corner_radius: modeProperties.cornerRadius(...nodes),
      fill: modeProperties.fill(...nodes),
      stroke: modeProperties.stroke(...nodes),
      stroke_width: modeProperties.strokeWidth(...nodes),
    } satisfies grida.program.nodes.BooleanPathOperationNodePrototype;

    const wrapperId = self_insertSubDocument(
      draft,
      isScene ? null : parentId,
      grida.program.nodes.factory.create_packed_scene_document_from_prototype(
        prototype,
        () => context.idgen.next()
      )
    )[0];

    // Move nodes in their preserved order
    g.forEach((id) => {
      self_moveNode(draft, id, wrapperId);
    });

    g.forEach((id) => {
      const child = dq.__getNodeById(draft, id);
      if (
        "layout_inset_left" in child &&
        typeof child.layout_inset_left === "number"
      ) {
        child.layout_inset_left -= union.x;
      }
      if (
        "layout_inset_top" in child &&
        typeof child.layout_inset_top === "number"
      ) {
        child.layout_inset_top -= union.y;
      }
    });

    inserted.push(wrapperId);
  });

  return inserted;
}
