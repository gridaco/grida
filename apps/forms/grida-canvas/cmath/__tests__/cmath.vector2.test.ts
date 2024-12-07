import { cmath } from "..";

describe("cmath.vector2", () => {
  describe("angle", () => {
    it("should calculate the angle for a point in the first quadrant", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [1, 1];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(45); // Expected angle: 45 degrees
    });

    it("should calculate the angle for a point in the second quadrant", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [-1, 1];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(135); // Expected angle: 135 degrees
    });

    it("should calculate the angle for a point in the third quadrant", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [-1, -1];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(225); // Expected angle: 225 degrees
    });

    it("should calculate the angle for a point in the fourth quadrant", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [1, -1];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(315); // Expected angle: 315 degrees
    });

    it("should calculate the angle for a point on the positive x-axis", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [1, 0];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(0); // Expected angle: 0 degrees
    });

    it("should calculate the angle for a point on the negative x-axis", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [-1, 0];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(180); // Expected angle: 180 degrees
    });

    it("should calculate the angle for a point on the positive y-axis", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [0, 1];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(90); // Expected angle: 90 degrees
    });

    it("should calculate the angle for a point on the negative y-axis", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [0, -1];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(270); // Expected angle: 270 degrees
    });

    it("should return 0 for the origin point", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [0, 0];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(0); // Expected angle: 0 degrees
    });

    it("should calculate the angle for a non-origin origin point", () => {
      const origin: cmath.Vector2 = [1, 1];
      const point: cmath.Vector2 = [2, 2];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(45); // Expected angle: 45 degrees relative to new origin
    });
  });
});
