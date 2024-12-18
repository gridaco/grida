import { cmath } from "@/grida-canvas/cmath";
import { axisAligned } from "@/grida-canvas/cmath/_snap";

export function snapMovementToObjects(
  selection: cmath.Rectangle[],
  objects: cmath.Rectangle[],
  movement: cmath.Vector2
) {
  const [mx, my] = movement;

  const bounding_rect = cmath.rect.getBoundingRect(selection);

  const _virtually_moved_rect = cmath.rect.translate(bounding_rect, [mx, my]);

  const origin_points = Object.values(
    cmath.rect.to9Points(_virtually_moved_rect)
  );

  const target_points = objects
    .map((r) => Object.values(cmath.rect.to9Points(r)))
    .flat();

  const result = axisAligned(origin_points, target_points, [4, 4]);
  const { value: points } = result;

  // top left point of the bounding box
  const bounding_box_snapped_xy = points[0];

  // return each xy point of input selection relative to the snapped bounding box
  const translated = selection.map((r) => {
    const offset = cmath.vector2.subtract(
      [r.x, r.y],
      [bounding_rect.x, bounding_rect.y]
    );
    const position = cmath.vector2.add(bounding_box_snapped_xy, offset);
    return { position };
  });

  return { translated, snapping: result };
}
