import type cg from "@grida/cg";
import cmath from "@grida/cmath";
import {
  reduceImageTransform,
  getImageRectCorners,
  type ImageTransformAction,
} from "./image-transform";

describe("image transform reducer", () => {
  const size: cmath.Vector2 = [200, 100];
  const identity: cg.AffineTransform = [
    [1, 0, 0],
    [0, 1, 0],
  ];

  it("applies translate, scale, and rotate actions", () => {
    const actions: ImageTransformAction[] = [
      { type: "translate", delta: [20, 10] },
      { type: "scale-side", side: "right", delta: [30, 0] },
      { type: "scale-side", side: "top", delta: [0, -15] },
    ];

    let transform = identity;
    for (const action of actions) {
      transform = reduceImageTransform(transform, action, { size });
    }

    const cornersBeforeRotation = getImageRectCorners(transform, size);

    expect(cornersBeforeRotation.topLeft[0]).toBeCloseTo(20);
    expect(cornersBeforeRotation.topLeft[1]).toBeCloseTo(-5);
    expect(cornersBeforeRotation.topRight[0]).toBeCloseTo(250);
    expect(cornersBeforeRotation.bottomRight[1]).toBeCloseTo(110);

    const center = cmath.vector2.multiply(
      cmath.vector2.add(
        cornersBeforeRotation.topLeft,
        cornersBeforeRotation.bottomRight
      ),
      [0.5, 0.5]
    );

    const angle = Math.PI / 4; // 45 degrees

    const rotatePoint = (point: cmath.Vector2): cmath.Vector2 => {
      const relative = cmath.vector2.sub(point, center);
      const rotated: cmath.Vector2 = [
        relative[0] * Math.cos(angle) - relative[1] * Math.sin(angle),
        relative[0] * Math.sin(angle) + relative[1] * Math.cos(angle),
      ];
      return cmath.vector2.add(center, rotated);
    };

    const rotatedTopRight = rotatePoint(cornersBeforeRotation.topRight);
    const rotationDelta: cmath.Vector2 = [
      rotatedTopRight[0] - cornersBeforeRotation.topRight[0],
      rotatedTopRight[1] - cornersBeforeRotation.topRight[1],
    ];

    transform = reduceImageTransform(
      transform,
      { type: "rotate", corner: "top-right", delta: rotationDelta },
      { size }
    );

    const cornersAfterRotation = getImageRectCorners(transform, size);
    const expectedCorners = {
      topLeft: rotatePoint(cornersBeforeRotation.topLeft),
      topRight: rotatedTopRight,
      bottomRight: rotatePoint(cornersBeforeRotation.bottomRight),
      bottomLeft: rotatePoint(cornersBeforeRotation.bottomLeft),
    };

    (
      Object.keys(expectedCorners) as Array<keyof typeof expectedCorners>
    ).forEach((key) => {
      const expected = expectedCorners[key];
      const actual = cornersAfterRotation[key];
      expect(actual[0]).toBeCloseTo(expected[0]);
      expect(actual[1]).toBeCloseTo(expected[1]);
    });
  });
});
