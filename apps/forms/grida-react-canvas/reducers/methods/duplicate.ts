import type { Draft } from "immer";
import type { ActiveDuplication, IDocumentEditorState } from "../../state";
import { document } from "../../document-query";
import { self_insertSubDocument } from "./insert";
import { self_selectNode } from "./selection";
import assert from "assert";
import nid from "../tools/id";
import { grida } from "@/grida";
import { domapi } from "@/grida-react-canvas/domapi";
import { cmath } from "@grida/cmath";

export function self_duplicateNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  _targets: Set<grida.program.nodes.NodeID>
) {
  const targets = Array.from(_targets);
  const origins: string[] = [];
  const clones: string[] = [];

  const cdom = new domapi.CanvasDOM(draft.transform);
  const nextdelta = get_repeating_translation_delta(
    draft.active_duplication,
    targets,
    cdom
  );

  for (const origin_id of targets) {
    if (origin_id === draft.document.root_id) continue;

    // serialize the node
    const prototype = grida.program.nodes.factory.createPrototypeFromSnapshot(
      draft.document,
      origin_id
    );

    // create sub document with prototype
    const sub =
      grida.program.nodes.factory.createSubDocumentDefinitionFromPrototype(
        prototype,
        nid
      );

    const parent_id = document.getParentId(draft.document_ctx, origin_id);
    assert(parent_id, `Parent node not found`);

    // insert the sub document
    const clone_id = self_insertSubDocument(draft, parent_id, sub);

    // apply the delta
    if (nextdelta) {
      const clone_node = draft.document.nodes[clone_id];
      if ("left" in clone_node && typeof clone_node.left === "number") {
        clone_node.left = (clone_node.left ?? 0) + nextdelta[0];
      }
      if ("top" in clone_node && typeof clone_node.top === "number") {
        clone_node.top = (clone_node.top ?? 0) + nextdelta[1];
      }
      draft.document.nodes[clone_id] = clone_node;
    }

    origins.push(origin_id);
    clones.push(clone_id);
  }

  // after
  self_selectNode(draft, "reset", ...clones);

  // after selection, finally set the active duplication
  draft.active_duplication = {
    origins: origins,
    clones: clones,
  };
}

function get_repeating_translation_delta(
  prev: ActiveDuplication | null,
  targets: grida.program.nodes.NodeID[],
  cdom: domapi.CanvasDOM
): cmath.Vector2 | null {
  //
  if (
    prev &&
    prev.origins.length > 0 &&
    prev.clones.length > 0 &&
    prev.origins.length === targets.length &&
    JSON.stringify(prev.clones) === JSON.stringify(targets)
  ) {
    // if the duplication is repeatable => the targets are current active duplication's clones

    const a = prev.origins;
    const b = prev.clones;
    const a_rects = a
      .map((a) => cdom.getNodeBoundingRect(a))
      .filter((r): r is cmath.Rectangle => r !== null);
    const b_rects = b
      .map((b) => cdom.getNodeBoundingRect(b))
      .filter((r): r is cmath.Rectangle => r !== null);

    const a_rect = cmath.rect.union(a_rects);
    const b_rect = cmath.rect.union(b_rects);
    const a_pos: cmath.Vector2 = [a_rect.x, a_rect.y];
    const b_pos: cmath.Vector2 = [b_rect.x, b_rect.y];

    assert(
      Math.abs(a_rect.width - b_rect.width) < 0.01 &&
        Math.abs(a_rect.height - b_rect.height) < 0.01,
      "the active duplication is invalid and modified"
    );

    const diff = cmath.vector2.sub(b_pos, a_pos);

    return diff;
  }

  return null;
}
