import { describe, it, expect } from "vitest";
import {
  screenToDoc,
  docToScreen,
  zoomOf,
  IDENTITY,
  type Transform,
} from "../event/transform";

describe("transform", () => {
  it("identity maps points unchanged", () => {
    expect(screenToDoc(IDENTITY, 100, 50)).toEqual([100, 50]);
    expect(docToScreen(IDENTITY, 100, 50)).toEqual([100, 50]);
    expect(zoomOf(IDENTITY)).toBe(1);
  });

  it("translate-only inverts cleanly", () => {
    const t: Transform = [
      [1, 0, 30],
      [0, 1, 20],
    ];
    expect(docToScreen(t, 0, 0)).toEqual([30, 20]);
    expect(screenToDoc(t, 30, 20)).toEqual([0, 0]);
  });

  it("scale + translate round-trips", () => {
    const t: Transform = [
      [2, 0, 30],
      [0, 2, 20],
    ];
    const [sx, sy] = docToScreen(t, 10, 10);
    expect([sx, sy]).toEqual([50, 40]);
    const [dx, dy] = screenToDoc(t, sx, sy);
    expect([dx, dy]).toEqual([10, 10]);
  });
});
