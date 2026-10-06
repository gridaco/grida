import { describe, expect, it } from "vitest";
import { CanvasWorldScene } from "./canvas-world-scene";

describe("CanvasWorldScene.composition", () => {
  it("keeps all layers separate before expansion and assembles before autoplay", () => {
    expect(CanvasWorldScene.composition(0)).toEqual({
      spread: 1,
      hudOpacity: 1,
      settled: false,
    });
    expect(CanvasWorldScene.composition(0.48)).toEqual({
      spread: 1,
      hudOpacity: 1,
      settled: false,
    });
    expect(CanvasWorldScene.composition(0.59).spread).toBeCloseTo(0.5);
    expect(CanvasWorldScene.composition(0.699).settled).toBe(false);
    expect(CanvasWorldScene.composition(0.7)).toEqual({
      spread: 0,
      hudOpacity: 0,
      settled: true,
    });
    expect(CanvasWorldScene.composition(1)).toEqual({
      spread: 0,
      hudOpacity: 0,
      settled: true,
    });
  });

  it("fades selection chrome throughout scale-up before the loop can start", () => {
    expect(CanvasWorldScene.composition(0.48).hudOpacity).toBe(1);
    expect(CanvasWorldScene.composition(0.58).hudOpacity).toBeCloseTo(0.84375);
    expect(CanvasWorldScene.composition(0.64).hudOpacity).toBeCloseTo(0.295488);
    expect(CanvasWorldScene.composition(0.68).hudOpacity).toBe(0);
    expect(CanvasWorldScene.composition(0.69).settled).toBe(false);
    expect(CanvasWorldScene.composition(0.7).hudOpacity).toBe(0);
  });

  it("reverses composition directly without replaying previous progress", () => {
    const positions = [0.32, 0.48, 0.52, 0.59, 0.65, 0.7, 1];
    const forward = positions.map(CanvasWorldScene.composition);
    expect(positions.reverse().map(CanvasWorldScene.composition)).toEqual(
      forward.reverse()
    );
  });

  it("has smooth joins at the start and end of assembly", () => {
    for (const boundary of [0.48, 0.7]) {
      const before = CanvasWorldScene.composition(boundary - 0.0001).spread;
      const after = CanvasWorldScene.composition(boundary + 0.0001).spread;
      expect(Math.abs(after - before)).toBeLessThan(0.00001);
    }
  });
});
