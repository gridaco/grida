import { cmath } from ".";

export namespace dnd {
  export function test(t: cmath.Rectangle, objects: cmath.Rectangle[]) {
    const points = objects.map((o) => cmath.rect.center(o));

    const t_point = cmath.rect.center(t);

    // Use cmath.snap.vector2 to find the closest target point
    const [_, distance, [_i]] = cmath.snap.vector2(t_point, points, Infinity);

    // Determine the object and point index

    const object = objects[_i];

    return {
      distance,
      object,
      index: _i,
    };
  }
}
