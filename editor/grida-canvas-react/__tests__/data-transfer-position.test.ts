import { describe, expect, test } from "vitest";
import { getCenteredCanvasInsertionPoint } from "../data-transfer-position";

describe("getCenteredCanvasInsertionPoint", () => {
  test("subtracts known canvas-space size after client-to-canvas conversion", () => {
    const point = getCenteredCanvasInsertionPoint({
      clientPosition: [100, 120],
      size: { width: 40, height: 20 },
      clientPointToCanvasPoint: ([x, y]) => [x / 2, y / 2],
    });

    expect(point).toEqual([30, 50]);
  });

  test("does not offset dimensions that cannot be measured", () => {
    const point = getCenteredCanvasInsertionPoint({
      clientPosition: [100, 120],
      size: { width: 0, height: Number.NaN },
      clientPointToCanvasPoint: ([x, y]) => [x / 2, y / 2],
    });

    expect(point).toEqual([50, 60]);
  });
});
