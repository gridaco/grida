/**
 * represents a point with x and y
 */
export type XY = [number, number];

/**
 * represents a rectangle with x, y, width, height
 */
export type XYWH = [number, number, number, number];

/**
 * represents a rectangle with x, y, width, height, rotation
 */
export type XYWHR = [number, number, number, number, number];

/**
 * represents a rectangle with x1, y1, x2, y2
 */
export type X1Y1X2Y2 = [number, number, number, number];

export type CanvasTransform = {
  scale: number;
  xy: XY;
};

/**
 * a bounding box with x1, y1, x2, y2
 */
export type Box = X1Y1X2Y2;

export interface Tree {
  id: string;
  /**
   * absolute x point.
   */
  absoluteX: number;
  /**
   * absolute y point.
   */
  absoluteY: number;
  width: number;
  height: number;
  children?: Tree[] | undefined;
}
