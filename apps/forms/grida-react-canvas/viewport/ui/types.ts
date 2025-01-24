import { cmath } from "@grida/cmath";

export namespace surface {
  export type Line = {
    label?: string;
    a: cmath.Vector2;
    b: cmath.Vector2;
  };
  /**
   * `['x', 100]` will draw a y-axis line at x=100
   */
  export type Ray = [axis: "x" | "y", offset: number];

  export type SnapGuide = {
    points: cmath.Vector2[];
    rays: Ray[];
    lines: Line[];
    // x_points: cmath.Vector2[];
    // x_offsets: number[];
    // y_points: cmath.Vector2[];
    // y_offsets: number[];
  };
}
