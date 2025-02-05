import { dnd } from "../_dnd";
import { cmath } from "../index";

describe("dnd.test", () => {
  test("finds the closest rectangle (center points)", () => {
    const objects = [
      { x: 0, y: 0, width: 10, height: 10 }, // Center: [5, 5]
      { x: 10, y: 0, width: 10, height: 10 }, // Center: [15, 5]
      { x: 20, y: 0, width: 10, height: 10 }, // Center: [25, 5]
    ];
    const t = { x: 5, y: 5, width: 10, height: 10 }; // Center: [10, 10]

    const result = dnd.test(t, objects);

    expect(result).toEqual({
      distance: cmath.vector2.distance([10, 10], [5, 5]), // Closest to the first rectangle
      object: objects[0],
      index: 0,
    });
  });

  test("handles multiple objects and finds the closest rectangle", () => {
    const objects = [
      { x: 0, y: 0, width: 10, height: 10 }, // Center: [5, 5]
      { x: 10, y: 10, width: 10, height: 10 }, // Center: [15, 15]
    ];
    const t = { x: 10, y: 5, width: 10, height: 10 }; // Center: [15, 10]

    const result = dnd.test(t, objects);

    // Closest rectangle is the second one ([15, 15])
    expect(result).toEqual({
      distance: cmath.vector2.distance([15, 10], [15, 15]),
      object: objects[1],
      index: 1,
    });
  });

  test("handles when t is already at the closest object's center", () => {
    const objects = [
      { x: 0, y: 0, width: 10, height: 10 }, // Center: [5, 5]
    ];
    const t = { x: 0, y: 0, width: 10, height: 10 }; // Center: [5, 5]

    const result = dnd.test(t, objects);

    expect(result).toEqual({
      distance: 0, // Same center
      object: objects[0],
      index: 0,
    });
  });

  test("handles non-overlapping rectangles", () => {
    const objects = [
      { x: 100, y: 100, width: 10, height: 10 }, // Center: [105, 105]
      { x: 200, y: 200, width: 10, height: 10 }, // Center: [205, 205]
    ];
    const t = { x: 0, y: 0, width: 10, height: 10 }; // Center: [5, 5]

    const result = dnd.test(t, objects);

    // The closest object is the first one ([105, 105])
    expect(result).toEqual({
      distance: cmath.vector2.distance([5, 5], [105, 105]),
      object: objects[0],
      index: 0,
    });
  });

  test("handles multiple rectangles with varying distances", () => {
    const objects = [
      { x: 0, y: 0, width: 20, height: 20 }, // Center: [10, 10]
      { x: 50, y: 50, width: 10, height: 10 }, // Center: [55, 55]
      { x: -50, y: -50, width: 30, height: 30 }, // Center: [-35, -35]
    ];
    const t = { x: 5, y: 5, width: 10, height: 10 }; // Center: [10, 10]

    const result = dnd.test(t, objects);

    // The closest object is the first one ([10, 10])
    expect(result).toEqual({
      distance: 0, // Same center
      object: objects[0],
      index: 0,
    });
  });

  test("handles large distances", () => {
    const objects = [
      { x: 1000, y: 1000, width: 10, height: 10 }, // Center: [1005, 1005]
      { x: 2000, y: 2000, width: 20, height: 20 }, // Center: [2010, 2010]
    ];
    const t = { x: 0, y: 0, width: 10, height: 10 }; // Center: [5, 5]

    const result = dnd.test(t, objects);

    // The closest object is the first one ([1005, 1005])
    expect(result).toEqual({
      distance: cmath.vector2.distance([5, 5], [1005, 1005]),
      object: objects[0],
      index: 0,
    });
  });

  test("throws an error when the list of objects is empty", () => {
    const objects: cmath.Rectangle[] = [];
    const t = { x: 10, y: 5, width: 10, height: 10 }; // Center: [15, 10]

    expect(() => {
      dnd.test(t, objects);
    }).toThrow();
  });
});
