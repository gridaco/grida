import cmath from "@grida/cmath";
import { getDeepest, GeoNode } from "../src/hit-testing";

describe("getDeepest", () => {
  const tree: GeoNode = {
    id: "root",
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    children: [
      {
        id: "a",
        bounds: { x: 10, y: 10, width: 40, height: 40 },
        children: [
          {
            id: "a1",
            bounds: { x: 20, y: 20, width: 10, height: 10 },
          },
        ],
      },
      {
        id: "b",
        bounds: { x: 60, y: 60, width: 30, height: 30 },
      },
    ],
  };

  test("returns deepest node for point", () => {
    const point: cmath.Vector2 = [22, 22];
    const result = getDeepest(tree, point);
    expect(result?.id).toBe("a1");
  });

  test("returns root when point only hits root", () => {
    const point: cmath.Vector2 = [5, 5];
    const result = getDeepest(tree, point);
    expect(result?.id).toBe("root");
  });

  test("respects 'intersects' mode for rectangles", () => {
    const rect: cmath.Rectangle = { x: 18, y: 18, width: 20, height: 20 };
    const result = getDeepest(tree, rect, "intersects");
    expect(result?.id).toBe("a1");
  });

  test("respects 'contains' mode for rectangles", () => {
    const rect: cmath.Rectangle = { x: 15, y: 15, width: 5, height: 5 };
    const result = getDeepest(tree, rect, "contains");
    expect(result?.id).toBe("a");
  });

  test("returns null when nothing is hit", () => {
    const rect: cmath.Rectangle = { x: 200, y: 200, width: 10, height: 10 };
    const result = getDeepest(tree, rect, "intersects");
    expect(result).toBeNull();
  });
});
