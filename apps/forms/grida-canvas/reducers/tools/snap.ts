import { cmath } from "@/grida-canvas/cmath";
import { axisAligned } from "@/grida-canvas/cmath/_snap";

export function snapMovementToObjects(
  origin: cmath.Rectangle,
  objects: cmath.Rectangle[],
  movement: cmath.Vector2
) {
  const [mx, my] = movement;

  const _virtually_moved_rect = cmath.rect.translate(origin, [mx, my]);

  const origin_points = Object.values(
    cmath.rect.to9Points(_virtually_moved_rect)
  );

  const target_points = objects
    .map((r) => Object.values(cmath.rect.to9Points(r)))
    .flat();

  const [points, d, anchors] = axisAligned(
    origin_points,
    target_points,
    [4, 4]
  );

  // top left point
  const snapped_xy = points[0];

  return { position: snapped_xy };
}
