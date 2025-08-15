import type { Draft } from "immer";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import cmath from "@grida/cmath";
import { self_moveNode } from "./move";
import { self_insertSubDocument } from "./insert";
import nid from "../tools/id";
import { self_selectNode } from "./selection";

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
  geometry: editor.api.IDocumentGeometryQuery
): grida.program.nodes.NodeID[] {
  const scene = draft.document.scenes[draft.scene_id!];

  const groups = Object.groupBy(
    nodeIds.filter((id) => {
      const isRoot = scene.children.includes(id);
      return scene.constraints.children !== "single" || !isRoot;
    }),
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
      const parentRect = geometry.getNodeAbsoluteBoundingRect(parentId)!;
      delta = [-parentRect.x, -parentRect.y];
    }

    const rects = g
      .map((nodeId) => geometry.getNodeAbsoluteBoundingRect(nodeId)!)
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

    if (kind === "container") {
      (prototype as grida.program.nodes.ContainerNode).width = union.width;
      (prototype as grida.program.nodes.ContainerNode).height = union.height;
    }

    const wrapperId = self_insertSubDocument(
      draft,
      isRoot ? null : (parentId as string),
      grida.program.nodes.factory.create_packed_scene_document_from_prototype(
        prototype,
        nid
      )
    )[0];

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
 * Ungroups the provided group nodes, preserving the children's absolute positions.
 *
 * This operation is only allowed for "group" nodes (GroupNode). It moves all children
 * to the parent of the group node and adjusts their positions to preserve their
 * absolute positions in the canvas.
 *
 * @param draft - Mutable editor state draft
 * @param groupNodeIds - Array of group node ids to ungroup
 * @param geometry - Geometry query used to compute bounding rectangles
 */
export function self_ungroup<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  groupNodeIds: string[],
  geometry: editor.api.IDocumentGeometryQuery
): void {
  // Filter to only group nodes
  const validGroupNodeIds = groupNodeIds.filter((node_id) => {
    const node = dq.__getNodeById(draft, node_id);
    return node.type === "group";
  });

  if (validGroupNodeIds.length === 0) {
    return;
  }

  // Collect all ungrouped children to select them later
  const ungroupedChildren: string[] = [];

  // Process each group node
  validGroupNodeIds.forEach((group_id) => {
    const group_node = dq.__getNodeById(
      draft,
      group_id
    ) as grida.program.nodes.GroupNode;
    const parent_id = dq.getParentId(draft.document_ctx, group_id);
    const target_parent = parent_id === null ? "<root>" : parent_id;

    // Get the group's absolute position
    const group_rect = geometry.getNodeAbsoluteBoundingRect(group_id);
    if (!group_rect) {
      return;
    }

    // Calculate the offset needed to preserve absolute positions
    let offset_x = group_rect.x;
    let offset_y = group_rect.y;

    // If the target parent is not root, we need to account for its position
    if (target_parent !== "<root>") {
      const parent_rect = geometry.getNodeAbsoluteBoundingRect(target_parent);
      if (parent_rect) {
        offset_x -= parent_rect.x;
        offset_y -= parent_rect.y;
      }
    }

    // Move all children to the parent of the group
    const children_to_move = [...group_node.children];
    children_to_move.forEach((child_id) => {
      // Move the child to the group's parent
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

    // Remove the group node
    if (parent_id === null) {
      // Remove from scene children
      const scene = draft.document.scenes[draft.scene_id!];
      const index = scene.children.indexOf(group_id);
      if (index !== -1) {
        scene.children.splice(index, 1);
      }
    } else {
      // Remove from parent's children
      const parent = dq.__getNodeById(draft, parent_id);
      if ("children" in parent && Array.isArray(parent.children)) {
        const index = parent.children.indexOf(group_id);
        if (index !== -1) {
          parent.children.splice(index, 1);
        }
      }
    }

    // Remove the group node from the document
    delete draft.document.nodes[group_id];
  });

  // Update document context
  const new_context = dq.Context.from(draft.document);
  draft.document_ctx = new_context.snapshot();

  // Select the ungrouped children
  self_selectNode(draft, "reset", ...ungroupedChildren);
}
