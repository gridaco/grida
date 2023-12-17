import type { X1Y1X2Y2 } from "types";
import { centerOf, scaleToFit, scaleToFit1D } from "./center-of";

test("centerof", () => {
  const box = [0, 0, 100, 100] as X1Y1X2Y2;
  const fit = {
    x: 10,
    y: 10,
    width: 50,
    height: 50,
    rotation: 0,
  };

  const r = centerOf(box, 0, fit);
  // to make "fit" fit into "box", we need to translate it by 10, 10 and scale it by 0.5

  expect(r.scale).toBe(2);
  expect(r.center).toStrictEqual([35, 35]);
  // todo
  expect(r.translate).toStrictEqual([-20, -20]);
});

test("scale to fit (smaller)", () => {
  const a = [0, 0, 100, 100] as X1Y1X2Y2;
  const b = [0, 0, 50, 50] as X1Y1X2Y2;
  expect(scaleToFit1D(100, 50)).toBe(2);
  expect(scaleToFit(a, b)).toBe(2);
});

test("scale to fit (bigger)", () => {
  const a = [0, 0, 100, 100] as X1Y1X2Y2;
  const b = [0, 0, 200, 200] as X1Y1X2Y2;
  expect(scaleToFit(a, b)).toBe(0.5);
});

test("scale to fit (bigger) #1", () => {
  const a = [0, 0, 100, 100] as X1Y1X2Y2;
  const b = [0, 0, 10, 200] as X1Y1X2Y2;
  expect(scaleToFit(a, b)).toBe(0.5);
});

test("scale to fit (bigger) #2", () => {
  const a = [0, 0, 100, 100] as X1Y1X2Y2;
  const b = [0, 0, 200, 10] as X1Y1X2Y2;
  expect(scaleToFit(a, b)).toBe(0.5);
});

test("scale to fit with margin", () => {
  const a = [0, 0, 100, 100] as X1Y1X2Y2;
  const b = [0, 0, 100, 100] as X1Y1X2Y2;
  expect(scaleToFit(a, b, 50)).toBe(0.5);
});

test("scale to fit 1D", () => {
  expect(scaleToFit1D(100, 200)).toBe(0.5);
});

test("scale to fit 1D", () => {
  expect(scaleToFit1D(100, 50, 25)).toBe(1);
});
