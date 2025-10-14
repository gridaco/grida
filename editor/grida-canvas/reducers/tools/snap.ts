import grida from "@grida/schema";
import cmath from "@grida/cmath";
import { SnapResult, snapToCanvasGeometry } from "@grida/cmath/_snap";
import { dq } from "@/grida-canvas/query";

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

export function snapMovement(
  agent: cmath.Rectangle | cmath.Vector2[],
  anchors: {
    objects?: cmath.Rectangle[];
    guides?: grida.program.document.Guide2D[];
    points?: cmath.Vector2[];
  },
  movement: cmath.ext.movement.Movement,
  threshold: number,
  enabled = true
): {
  movement: cmath.ext.movement.Movement;
  snapping: SnapResult | undefined;
} {
  // we are intentionally not falling back with ?? [] here.
  const anchor_objects: cmath.Rectangle[] | undefined = anchors.objects
    ? anchors.objects.map((r) => cmath.rect.quantize(r, q))
    : undefined;

  const normalized = cmath.ext.movement.normalize(movement);

  let snapping: SnapResult | undefined;
  let resultMovement: cmath.ext.movement.Movement = movement;

  if (enabled) {
    const agent_q = Array.isArray(agent)
      ? agent.map((p) => cmath.vector2.quantize(p, q))
      : cmath.rect.quantize(agent, q);
    const moved_agent = Array.isArray(agent_q)
      ? agent_q.map((p) => cmath.vector2.add(p, normalized))
      : cmath.rect.translate(agent_q, normalized);

    snapping = snapToCanvasGeometry(
      moved_agent as any,
      {
        objects: anchor_objects,
        guides: anchors.guides,
        points: anchors.points,
      },
      {
        x: movement[0] === null ? false : threshold,
        y: movement[1] === null ? false : threshold,
      }
    );

    const [dx, dy] = snapping.delta;
    resultMovement = [
      movement[0] === null ? null : normalized[0] + dx,
      movement[1] === null ? null : normalized[1] + dy,
    ];
  }

  return { movement: resultMovement, snapping };
}

type SnapObjectsResult = SnapResult<{
  objects: cmath.Rectangle[];
  guides: grida.program.document.Guide2D[];
}>;

/**
 * Main universal function for translating objects with optional snapping.
 *
 * Always applies pixel quantization. When snapping is enabled, performs full snapping
 * calculations. When disabled, skips snapping entirely and applies movement directly.
 *
 * @param agents - Objects to translate
 * @param anchors - Snap targets (objects and guides)
 * @param movement - Movement vector
 * @param threshold - Snap threshold
 * @param enabled - Whether to perform snapping (default: true)
 * @returns Translated positions and optional snapping result
 */
export function snapObjectsTranslation(
  agents: cmath.Rectangle[],
  anchors: {
    objects?: cmath.Rectangle[];
    guides?: grida.program.document.Guide2D[];
  },
  movement: cmath.ext.movement.Movement,
  threshold: number,
  enabled = true
): {
  translated: { position: cmath.Vector2 }[];
  snapping: SnapObjectsResult | undefined;
} {
  agents = agents.map((r) => cmath.rect.quantize(r, q));
  const anchorObjects =
    anchors.objects?.map((r) => cmath.rect.quantize(r, q)) ?? [];

  const bounding_rect = cmath.rect.union(agents);

  const _virtually_moved_rect = cmath.rect.quantize(
    cmath.rect.translate(bounding_rect, cmath.ext.movement.normalize(movement)),
    q
  );

  let result: SnapObjectsResult | undefined;
  let bounding_box_xy: cmath.Vector2 = [
    _virtually_moved_rect.x,
    _virtually_moved_rect.y,
  ];

  if (enabled) {
    result = snapToCanvasGeometry(
      _virtually_moved_rect,
      { objects: anchorObjects, guides: anchors.guides ?? [] },
      {
        x: movement[0] === null ? false : threshold,
        y: movement[1] === null ? false : threshold,
      }
    );
    if (result.by_objects) {
      bounding_box_xy = [
        result.by_objects.translated.x,
        result.by_objects.translated.y,
      ];
    }
  } else {
    result = undefined;
  }

  // return each xy point of input selection relative to the bounding box
  const translated = agents.map((r) => {
    const offset = cmath.vector2.sub(
      [r.x, r.y],
      [bounding_rect.x, bounding_rect.y]
    );
    const position = cmath.vector2.add(bounding_box_xy, offset);
    return { position };
  });

  return { translated, snapping: result };
}

export function getSnapTargets(
  selection: string[],
  {
    document_ctx,
    document,
  }: {
    document_ctx: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext;
    document: { nodes: Record<string, grida.program.nodes.Node> };
  }
): string[] {
  // set of each sibling and parent of selection
  const snap_target_node_ids = Array.from(
    new Set(
      selection
        .map((node_id) =>
          dq
            .getSiblings(document_ctx, node_id)
            .concat(dq.getParentId(document_ctx, node_id) ?? [])
        )
        .flat()
    )
  ).filter((node_id) => {
    // Exclude selection
    if (selection.includes(node_id)) return false;

    // Exclude scene nodes (they don't have bounding rects)
    const node = document.nodes[node_id];
    if (node?.type === "scene") return false;

    return true;
  });

  return snap_target_node_ids;
}
