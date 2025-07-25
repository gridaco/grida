export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Calculates the rotation for a marker placed on an ellipse.
 *
 * @param cx - center x of the ellipse
 * @param cy - center y of the ellipse
 * @param rx - radius on x-axis
 * @param ry - radius on y-axis
 * @param angle - angle on the ellipse in degrees (global coordinate)
 * @param ellipseRotation - rotation of the ellipse in degrees
 * @returns rotation in degrees suitable for CSS transforms
 */
export function ellipseMarkerRotation(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number,
  ellipseRotation: number = 0,
): number {
  const t = degToRad(angle - ellipseRotation);
  const base = degToRad(ellipseRotation);
  const normal = Math.atan2(Math.sin(t) / ry, Math.cos(t) / rx) + base;
  return radToDeg(normal) + 90;
}
