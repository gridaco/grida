import type { Draft } from "immer";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import cmath from "@grida/cmath";
import { self_moveNode } from "./move";
import { self_insertSubDocument } from "./insert";
import nid from "../tools/id";

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
