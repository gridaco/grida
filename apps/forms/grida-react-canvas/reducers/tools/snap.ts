import { grida } from "@/grida";
import { cmath } from "@grida/cmath";
import { document } from "@/grida-react-canvas/document-query";
import { SnapToObjectsResult, snapToObjects } from "@grida/cmath/_snap";

const q = 1;

export function snapObjectsTranslation(
  agents: cmath.Rectangle[],
  anchors: cmath.Rectangle[],
  movement: cmath.Vector2,
  threshold: cmath.Vector2
): {
  translated: { position: cmath.Vector2 }[];
  snapping: SnapToObjectsResult | undefined;
} {
  agents = agents.map((r) => cmath.rect.quantize(r, q));
  anchors = anchors.map((r) => cmath.rect.quantize(r, q));

  const bounding_rect = cmath.rect.union(agents);

  const _virtually_moved_rect = cmath.rect.quantize(
    cmath.rect.translate(bounding_rect, movement),
    q
  );

  const result = snapToObjects(_virtually_moved_rect, anchors, threshold, 0);
  const { translated: _translated } = result;

  // top left point of the bounding box
  const bounding_box_snapped_xy: cmath.Vector2 = [_translated.x, _translated.y];

  // return each xy point of input selection relative to the snapped bounding box
  const translated = agents.map((r) => {
    const offset = cmath.vector2.sub(
      [r.x, r.y],
      [bounding_rect.x, bounding_rect.y]
    );
    const position = cmath.vector2.add(bounding_box_snapped_xy, offset);
    return { position };
  });

  return { translated, snapping: result };
}

export function getSnapTargets(
  selection: string[],
  {
    document_ctx,
  }: {
    document_ctx: grida.program.document.internal.IDocumentDefinitionRuntimeHierarchyContext;
  }
): string[] {
  // set of each sibling and parent of selection
  const snap_target_node_ids = Array.from(
    new Set(
      selection
        .map((node_id) =>
          document
            .getSiblings(document_ctx, node_id)
            .concat(document.getParentId(document_ctx, node_id) ?? [])
        )
        .flat()
    )
  ).filter((node_id) => !selection.includes(node_id));

  return snap_target_node_ids;
}
