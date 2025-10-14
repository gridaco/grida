import cmath from "@grida/cmath";
import type grida from "@grida/schema";

/**
 * Computes the axis-aligned bounding rectangle of a packed scene document.
 *
 * The resulting rectangle is in the coordinate space of the packed document
 * itself. If the document contains no children, a zero-sized rectangle at the
 * origin is returned.
 *
 * @param sub - Packed scene document whose children will be measured.
 * @returns Bounding rectangle covering all top-level children of `sub`.
 */
export function getPackedSubtreeBoundingRect(
  sub: grida.program.document.IPackedSceneDocument
): cmath.Rectangle {
  let bb: cmath.Rectangle | null = null;
  for (const node_id of sub.scene.children_refs) {
    const node = sub.nodes[node_id];
    const r: cmath.Rectangle = {
      x: "left" in node ? (node.left ?? 0) : 0,
      y: "top" in node ? (node.top ?? 0) : 0,
      width:
        "width" in node ? (typeof node.width === "number" ? node.width : 0) : 0,
      height:
        "height" in node
          ? typeof node.height === "number"
            ? node.height
            : 0
          : 0,
    };
    bb = bb ? cmath.rect.union([bb, r]) : r;
  }
  return bb ?? { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * Determines the delta required to center-align a rectangle with a viewport
 * if the rectangle is completely outside the viewport.
 *
 * If the rectangle intersects the viewport at all, `null` is returned and no
 * adjustment is necessary.
 *
 * @param viewport - Viewport rectangle in canvas space.
 * @param rect - Rectangle to test.
 * @returns Translation delta `[dx, dy]` to center the rectangle, or `null` if
 *          the rectangle already intersects the viewport.
 */
export function getViewportAwareDelta(
  viewport: cmath.Rectangle,
  rect: cmath.Rectangle
): cmath.Vector2 | null {
  if (cmath.rect.intersects(viewport, rect)) {
    return null;
  }
  const vc = cmath.rect.getCenter(viewport);
  const rc = cmath.rect.getCenter(rect);
  return [vc[0] - rc[0], vc[1] - rc[1]];
}

/**
 * Performs hit-tested nested placement resolution.
 *
 * Starting from the top-most element at the center of `rect`, the function
 * searches down the hit-test stack for a container whose bounding rectangle
 * fully contains `rect`. The first such container found within `maxDepth`
 * levels is returned.
 *
 * @param rect - Rectangle of the element to place (in canvas space).
 * @param geometry - Geometry query interface for hit testing and bounds.
 * @param isContainer - Predicate that returns `true` if a node ID represents a
 *                      container capable of nesting children.
 * @param maxDepth - Optional maximum depth of hit-test results to consider.
 * @returns The ID of the containing node, or `null` if none is found.
 */
export function hitTestNestedInsertionTarget(
  rect: cmath.Rectangle,
  geometry: {
    getNodeIdsFromPoint(point: cmath.Vector2): string[];
    getNodeAbsoluteBoundingRect(id: string): cmath.Rectangle | null;
  },
  isContainer: (id: string) => boolean,
  maxDepth = Infinity
): string | null {
  const center = cmath.rect.getCenter(rect);
  const hits = geometry.getNodeIdsFromPoint(center);
  const depth = Math.min(maxDepth, hits.length);
  for (let i = 0; i < depth; i++) {
    const id = hits[i];
    if (!isContainer(id)) continue;
    const hitRect = geometry.getNodeAbsoluteBoundingRect(id);
    if (hitRect && cmath.rect.contains(hitRect, rect)) {
      return id;
    }
  }
  return null;
}
