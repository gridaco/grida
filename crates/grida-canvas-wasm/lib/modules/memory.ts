import type { types } from "..";

export namespace memory {
  export function rect_from_vec4(vec4: Float32Array): types.Rectangle {
    return {
      x: vec4[0],
      y: vec4[1],
      width: vec4[2],
      height: vec4[3],
    };
  }
}
