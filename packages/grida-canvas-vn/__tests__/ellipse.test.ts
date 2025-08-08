import { vn } from "../vn";
import cmath from "@grida/cmath";

describe("fromEllipse", () => {
  it("creates four cubic segments for an ellipse", () => {
    const result = vn.fromEllipse({ x: 0, y: 0, width: 100, height: 200 });

    const rx = 50;
    const ry = 100;
    const kx = rx * cmath.KAPPA;
    const ky = ry * cmath.KAPPA;

    expect(result.vertices).toEqual([
      [50, 0],
      [100, 100],
      [50, 200],
      [0, 100],
    ]);

    expect(result.segments).toHaveLength(4);

    expect(result.segments[0]).toEqual({
      a: 0,
      b: 1,
      ta: [kx, 0],
      tb: [0, -ky],
    });

    expect(result.segments[1]).toEqual({
      a: 1,
      b: 2,
      ta: [0, ky],
      tb: [kx, 0],
    });

    expect(result.segments[2]).toEqual({
      a: 2,
      b: 3,
      ta: [-kx, 0],
      tb: [0, ky],
    });

    expect(result.segments[3]).toEqual({
      a: 3,
      b: 0,
      ta: [0, -ky],
      tb: [-kx, 0],
    });
  });
});
