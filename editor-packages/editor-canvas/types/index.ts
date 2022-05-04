export type XY = [number, number];
export type XYWH = [number, number, number, number];
export type CanvasTransform = {
  scale: number;
  xy: XY;
};
export type Box = [number, number, number, number];
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
