/**
 * Gate 3: Behavioral Correctness - Camera
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import cmath from "@grida/cmath";

describe("Camera (headless)", () => {
  let ed: Editor;

  beforeEach(() => {
    ed = createHeadlessEditor();
  });

  afterEach(() => {
    ed.dispose();
  });

  test("initial transform is identity", () => {
    const t = ed.camera.transform;
    expect(t[0][0]).toBe(1); // scaleX
    expect(t[1][1]).toBe(1); // scaleY
    expect(t[0][2]).toBe(0); // translateX
    expect(t[1][2]).toBe(0); // translateY
  });

  test("set transform updates state", () => {
    const next: cmath.Transform = [
      [2, 0, 100],
      [0, 2, 200],
    ];
    ed.camera.transform = next;
    expect(ed.state.transform).toEqual(next);
  });

  test("pan shifts translate", () => {
    ed.camera.pan([50, 100]);
    expect(ed.state.transform[0][2]).toBe(50);
    expect(ed.state.transform[1][2]).toBe(100);
  });

  test("zoom modifies scale", () => {
    const before = ed.camera.transform[0][0];
    ed.camera.zoom(0.5, [960, 540]); // zoom in 50% at center
    const after = ed.camera.transform[0][0];
    expect(after).toBeGreaterThan(before);
  });

  test("zoomIn increases scale", () => {
    const before = ed.camera.transform[0][0];
    ed.camera.zoomIn();
    expect(ed.camera.transform[0][0]).toBeGreaterThan(before);
  });

  test("zoomOut decreases scale", () => {
    const before = ed.camera.transform[0][0];
    ed.camera.zoomOut();
    expect(ed.camera.transform[0][0]).toBeLessThan(before);
  });

  test("viewport size is accessible", () => {
    const size = ed.camera.viewport.size;
    expect(size.width).toBe(1920);
    expect(size.height).toBe(1080);
  });

  test("viewport offset is [0,0] in headless mode", () => {
    expect(ed.camera.viewport.offset).toEqual([0, 0]);
  });

  test("clientPointToCanvasPoint with identity transform", () => {
    const canvas = ed.camera.clientPointToCanvasPoint([100, 200]);
    expect(canvas[0]).toBe(100);
    expect(canvas[1]).toBe(200);
  });

  test("canvasPointToClientPoint with identity transform", () => {
    const client = ed.camera.canvasPointToClientPoint([100, 200]);
    expect(client[0]).toBe(100);
    expect(client[1]).toBe(200);
  });

  test("client<->canvas roundtrip", () => {
    // Set a non-trivial transform
    ed.camera.transform = [
      [2, 0, 50],
      [0, 2, 75],
    ];
    const original: cmath.Vector2 = [300, 400];
    const canvas = ed.camera.clientPointToCanvasPoint(original);
    const back = ed.camera.canvasPointToClientPoint(canvas);
    expect(back[0]).toBeCloseTo(original[0], 5);
    expect(back[1]).toBeCloseTo(original[1], 5);
  });

  test("pointerEventToViewportPoint extracts correct coords", () => {
    const point = ed.camera.pointerEventToViewportPoint({
      clientX: 500,
      clientY: 300,
      button: 0,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    });
    expect(point.x).toBe(500);
    expect(point.y).toBe(300);
  });
});
