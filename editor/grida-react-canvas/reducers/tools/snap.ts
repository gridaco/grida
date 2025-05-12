import grida from "@grida/schema";
import { cmath } from "@grida/cmath";
import { document } from "@/grida-react-canvas/document-query";
import { SnapToObjectsResult, snapToCanvasGeometry } from "@grida/cmath/_snap";
import { Guide } from "@/grida-react-canvas/state";

const q = 1;

/**
 *
 * calculate the final threshold for ux with factor and zoom (transform).
 *
 * @example
 * Perfect fit for the given data—simply ceiling(5 / zoom).
 * - f(5) = 1
 * - f(4) = 2
 * - f(1) = 5
 * - f(0.5) = 10
 * - f(0.02) = 250
 */
export function threshold(factor: number, t: number | cmath.Transform): number {
  const zoom = typeof t === "number" ? t : cmath.transform.getScale(t)[0];
  return cmath.quantize(Math.ceil(factor / zoom), 1) - 0.5;
}

export function snapGuideTranslation(
  axis: cmath.Axis,
  agent: number,
  anchors: cmath.Rectangle[],
  movement: number,
  threshold: number
): { translated: number } {
  const anchorPoints = anchors
    .map((rect) => {
      rect = cmath.rect.quantize(rect, q);
      const [a, b] = cmath.range.fromRectangle(rect, axis);
      const c = cmath.mean(a, b);
      return [a, b, c];
    })
    .flat();

  const v = agent + movement;

  const res = cmath.ext.snap.snap1D([v], anchorPoints, threshold);
  const delta = res.distance === Infinity ? 0 : res.distance;

  return { translated: v + delta };
}

export function snapObjectsTranslation(
  agents: cmath.Rectangle[],
  anchors: {
    objects?: cmath.Rectangle[];
    guides?: Guide[];
  },
  movement: cmath.ext.movement.Movement,
  threshold: number
): {
  translated: { position: cmath.Vector2 }[];
  snapping: SnapToObjectsResult | undefined;
} {
  agents = agents.map((r) => cmath.rect.quantize(r, q));
  const anchorObjects =
    anchors.objects?.map((r) => cmath.rect.quantize(r, q)) ?? [];

  const bounding_rect = cmath.rect.union(agents);

  const _virtually_moved_rect = cmath.rect.quantize(
    cmath.rect.translate(bounding_rect, cmath.ext.movement.normalize(movement)),
    q
  );

  const result = snapToCanvasGeometry(
    _virtually_moved_rect,
    { objects: anchorObjects, guides: anchors.guides ?? [] },
    {
      x: movement[0] === null ? false : threshold,
      y: movement[1] === null ? false : threshold,
    }
  );

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
    document_ctx: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext;
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
