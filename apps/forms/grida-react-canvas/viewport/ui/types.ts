import { cmath } from "@grida/cmath";

export namespace surface {
  export type Line = {
    a: cmath.Vector2;
    b: cmath.Vector2;
  };

  export type SnapGuide = {
    x: cmath.Vector2[];
    y: cmath.Vector2[];
  };
}
