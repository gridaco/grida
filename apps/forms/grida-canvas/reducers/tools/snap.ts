import { grida } from "@/grida";
import { cmath } from "@grida/cmath";
import { document } from "@/grida-canvas/document-query";
import { axisAligned } from "@grida/cmath/_snap";

export function snapMovement(
  origin: cmath.Vector2,
  references: cmath.Vector2[],
  movement: cmath.Vector2,
  threshold: cmath.Vector2
) {
  const virtually_moved = cmath.vector2.add(origin, movement);

  const result = axisAligned([virtually_moved], references, threshold);

  return {
    movement: result.value[0],
    snapping: result,
  };
}

export function snapObjectsTranslation(
  objects: cmath.Rectangle[],
  references: cmath.Rectangle[],
  movement: cmath.Vector2,
  threshold: cmath.Vector2
) {
  const bounding_rect = cmath.rect.union(objects);

  const _virtually_moved_rect = cmath.rect.translate(bounding_rect, movement);

  const origin_points = Object.values(
    cmath.rect.to9Points(_virtually_moved_rect)
  );

  const target_points = references
    .map((r) => Object.values(cmath.rect.to9Points(r)))
    .flat();

  const result = axisAligned(origin_points, target_points, threshold);
  const { value: points } = result;

  // top left point of the bounding box
  const bounding_box_snapped_xy = points[0];

  // return each xy point of input selection relative to the snapped bounding box
  const translated = objects.map((r) => {
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
) {
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
