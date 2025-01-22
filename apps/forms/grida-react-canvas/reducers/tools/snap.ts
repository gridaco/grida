import { grida } from "@/grida";
import { cmath } from "@grida/cmath";
import { document } from "@/grida-react-canvas/document-query";
import {
  AxisAlignedSnapPoint,
  snap2DAxisAlignedV1,
  snap2DAxisAligned,
  snap,
} from "@grida/cmath/_snap";

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

  const target_points: AxisAlignedSnapPoint[] = [];

  target_points.push(
    ...references.map((r) => Object.values(cmath.rect.to9Points(r))).flat()
  );

  // // #region repeated-space projected points
  // const y_range: snap.spacing.Range = [
  //   bounding_rect.y,
  //   bounding_rect.y + bounding_rect.height,
  // ];

  // // x-aligned uses y range comparison
  // const x_aligned = references.filter((r) => {
  //   const this_y_range: snap.spacing.Range = [r.y, r.y + r.height];
  //   return cmath.vector2.intersects(y_range, this_y_range);
  // });
  // const x_ranges = x_aligned.map(
  //   (r) => [r.x, r.x + r.width] as snap.spacing.Range
  // );

  // const repeated = snap.spacing.repeatedpoints(x_ranges);
  // const x_points = repeated.a.flat();
  // target_points.push(...x_points.map((x) => [x, null] as AxisAlignedSnapPoint));
  // // console.log("x_aligned", x_ranges, repeated);
  // // #endregion

  // const result = snap2DAxisAlignedV1(origin_points, target_points, threshold);
  const result = snap2DAxisAligned(origin_points, target_points, threshold, 0);
  const { value: points } = result;

  // console.log("result", result.anchors.y[1]);

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
