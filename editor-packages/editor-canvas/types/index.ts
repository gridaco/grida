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

export const directions_cardinal = ["n", "e", "s", "w"] as const;
export type CardinalDirection = typeof directions_cardinal[number];
export const directions_ordinal = ["ne", "se", "sw", "nw"] as const;
export type OrdinalDirection = typeof directions_ordinal[number];
export const directions_compass: CompassDirection[] = [
  ...directions_cardinal,
  ...directions_cardinal,
];
export type CompassDirection = CardinalDirection | OrdinalDirection;
