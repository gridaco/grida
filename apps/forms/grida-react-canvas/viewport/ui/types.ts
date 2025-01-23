import { cmath } from "@grida/cmath";

export namespace surface {
  export type Line = {
    a: cmath.Vector2;
    b: cmath.Vector2;
  };

  export type SnapGuide = {
    x_points: cmath.Vector2[];
    x_offsets: number[];
    y_points: cmath.Vector2[];
    y_offsets: number[];
  };
}
