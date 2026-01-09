import cmath from "@grida/cmath";
import grida from "@grida/schema";
import { css } from "@/grida-canvas-utils/css";

/**
 * Computes the axis-aligned bounding rectangle of a packed scene document.
 *
 * The resulting rectangle is in the coordinate space of the packed document
 * itself. If the document contains no children, a zero-sized rectangle at the
 * origin is returned.
 *
 * @param sub - Packed scene document whose children will be measured.
 * @returns Bounding rectangle covering all top-level children of `sub`.
 *
 * TODO: this fails to report accurate bounds if the root size is relative.
 * instead, we should make the bounds to be included within the packed document (while exporting or copying)
 */
export function getPackedSubtreeBoundingRect(
  sub: grida.program.document.IPackedSceneDocument
): cmath.Rectangle {
  let bb: cmath.Rectangle | null = null;
  for (const node_id of sub.scene.children_refs) {
    const node = sub.nodes[node_id];
    const r: cmath.Rectangle = {
      x: "layout_inset_left" in node ? (node.layout_inset_left ?? 0) : 0,
      y: "layout_inset_top" in node ? (node.layout_inset_top ?? 0) : 0,
      width:
        grida.program.nodes.hasLayoutWidth(node) &&
        node.layout_target_width !== undefined
          ? css.toPxNumber(node.layout_target_width)
          : 0,
      height:
        grida.program.nodes.hasLayoutHeight(node) &&
        node.layout_target_height !== undefined
          ? css.toPxNumber(node.layout_target_height)
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
