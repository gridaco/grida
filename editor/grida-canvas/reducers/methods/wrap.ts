import type { Draft } from "immer";
import type { ReducerContext } from "..";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import cmath from "@grida/cmath";
import tree from "@grida/tree";
import { self_moveNode } from "./move";
import { self_insertSubDocument } from "./insert";
import { self_selectNode } from "./selection";
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
    (nodeId) => dq.getParentId(draft.document_ctx, nodeId) ?? "<root>"
  );

  const result: string[] = [];

  Object.keys(groups).forEach((parentId) => {
    const nodesInParent = groups[parentId]!;

    if (parentId === "<root>") {
      // For root nodes, sort by their index in scene.children
      const scene = draft.document.scenes[draft.scene_id!];
      const sorted = nodesInParent.sort((a, b) => {
        const indexA = scene.children_refs.indexOf(a);
        const indexB = scene.children_refs.indexOf(b);
        return indexA - indexB;
      });
      result.push(...sorted);
    } else {
      // For child nodes, sort by their index in parent's children array using links
      const parentChildren = draft.document.links[parentId] || [];
      const sorted = nodesInParent.sort((a, b) => {
        const indexA = parentChildren.indexOf(a);
        const indexB = parentChildren.indexOf(b);
        return indexA - indexB;
      });
      result.push(...sorted);
    }
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
  const scene = draft.document.scenes[draft.scene_id!];

  // Filter nodes and preserve their original order
  const filteredNodeIds = nodeIds.filter((id) => {
    const isRoot = scene.children_refs.includes(id);
    return scene.constraints.children !== "single" || !isRoot;
  });

  // Preserve the original order of nodes in their parent's children array
  const orderedNodeIds = preserveOriginalOrder(draft, filteredNodeIds);

  const groups = Object.groupBy(
    orderedNodeIds,
    (nodeId) => dq.getParentId(draft.document_ctx, nodeId) ?? "<root>"
  );

  const inserted: grida.program.nodes.NodeID[] = [];

  Object.keys(groups).forEach((parentId) => {
    const g = groups[parentId]!;
    const isRoot = parentId === "<root>";

    let delta: cmath.Vector2;
    if (isRoot) {
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
      top: cmath.quantize(union.y, 1),
      left: cmath.quantize(union.x, 1),
      children: [],
      position: "absolute",
    } as grida.program.nodes.NodePrototype;

    if (prototype.type === "container") {
      prototype.width = union.width;
      prototype.height = union.height;
    }

    const wrapperId = self_insertSubDocument(
      draft,
      isRoot ? null : (parentId as string),
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
      if ("left" in child && typeof child.left === "number") {
        child.left -= union.x;
      }
      if ("top" in child && typeof child.top === "number") {
        child.top -= union.y;
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
  groupNodeIds: string[],
  geometry: editor.api.IDocumentGeometryQuery
): void {
  // Filter to only group nodes and boolean nodes
  const validGroupNodeIds = groupNodeIds.filter((node_id) => {
    const node = dq.__getNodeById(draft, node_id);
    return node.type === "group" || node.type === "boolean";
  });

  if (validGroupNodeIds.length === 0) {
    return;
  }

  // Collect all ungrouped children to select them later
  const ungroupedChildren: string[] = [];

  // Process each group or boolean node
  validGroupNodeIds.forEach((node_id) => {
    const node = dq.__getNodeById(draft, node_id);

    // Get node's children from links
    const nodeChildren = draft.document.links[node_id];
    if (!Array.isArray(nodeChildren) || nodeChildren.length === 0) {
      return;
    }

    const parent_id = dq.getParentId(draft.document_ctx, node_id);
    const target_parent = parent_id === null ? "<root>" : parent_id;

    // Get the node's absolute position
    const node_rect = geometry.getNodeAbsoluteBoundingRect(node_id);
    if (!node_rect) {
      return;
    }

    // Calculate the offset needed to preserve absolute positions
    let offset_x = node_rect.x;
    let offset_y = node_rect.y;

    // If the target parent is not root, we need to account for its position
    if (target_parent !== "<root>") {
      const parent_rect = geometry.getNodeAbsoluteBoundingRect(target_parent);
      if (parent_rect) {
        offset_x -= parent_rect.x;
        offset_y -= parent_rect.y;
      }
    }

    // Move all children to the parent of the node, preserving their order
    const children_to_move: string[] = [...nodeChildren];
    children_to_move.forEach((child_id) => {
      // Move the child to the node's parent
      self_moveNode(draft, child_id, target_parent);

      // Adjust the child's position to preserve absolute position
      const child = dq.__getNodeById(draft, child_id);
      if ("left" in child && typeof child.left === "number") {
        child.left += offset_x;
      }
      if ("top" in child && typeof child.top === "number") {
        child.top += offset_y;
      }

      // Add to the list of ungrouped children
      ungroupedChildren.push(child_id);
    });

    // Temporarily inject virtual root into draft
    const scene = draft.document.scenes[draft.scene_id!];
    draft.document.nodes["<root>"] = scene as any;
    draft.document.links["<root>"] = scene.children_refs;

    // Use Graph.unlink() - mutates draft.document directly
    const graphInstance = new tree.graph.Graph(draft.document);

    // Unlink the node (removes only this node, not children - mutates directly)
    graphInstance.unlink(node_id);

    // Extract scene children before cleanup
    scene.children_refs = draft.document.links["<root>"] || [];

    // Clean up virtual root
    delete draft.document.nodes["<root>"];
    delete draft.document.links["<root>"];
  });

  // Update document context
  const new_context = dq.Context.from(draft.document);
  draft.document_ctx = new_context.snapshot();

  // Select the ungrouped children
  self_selectNode(draft, "reset", ...ungroupedChildren);
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
  const scene = draft.document.scenes[draft.scene_id!];

  // Filter nodes and preserve their original order
  const filteredNodeIds = nodeIds.filter((id) => {
    const isRoot = scene.children_refs.includes(id);
    return scene.constraints.children !== "single" || !isRoot;
  });

  // Preserve the original order of nodes in their parent's children array
  const orderedNodeIds = preserveOriginalOrder(draft, filteredNodeIds);

  const groups = Object.groupBy(
    orderedNodeIds,
    (nodeId) => dq.getParentId(draft.document_ctx, nodeId) ?? "<root>"
  );

  const inserted: grida.program.nodes.NodeID[] = [];

  Object.keys(groups).forEach((parentId) => {
    const g = groups[parentId]!;
    const isRoot = parentId === "<root>";

    let delta: cmath.Vector2;
    if (isRoot) {
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
      top: cmath.quantize(union.y, 1),
      left: cmath.quantize(union.x, 1),
      children: [],
      position: "absolute",
      op: op,
      cornerRadius: modeProperties.cornerRadius(...nodes),
      fill: modeProperties.fill(...nodes),
      stroke: modeProperties.stroke(...nodes),
      strokeWidth: modeProperties.strokeWidth(...nodes),
    } as grida.program.nodes.BooleanPathOperationNodePrototype;

    const wrapperId = self_insertSubDocument(
      draft,
      isRoot ? null : (parentId as string),
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
      if ("left" in child && typeof child.left === "number") {
        child.left -= union.x;
      }
      if ("top" in child && typeof child.top === "number") {
        child.top -= union.y;
      }
    });

    inserted.push(wrapperId);
  });

  return inserted;
}
