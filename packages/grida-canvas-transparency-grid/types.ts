/**
 * [[sx, 0, tx],[0, sy, ty]]
 */
export type Transform2D = [[number, number, number], [number, number, number]];

export interface TransparencyGridOptions {
  transform: Transform2D;

  /**
   * @default "rgba(150, 150, 150, 0.15)"
   */
  color?: string;
}
