// End-to-end proof for point measurement in path edit (gridaco/grida#845):
// with a vertex sub-selected, holding Alt and hovering another vertex — or a
// segment — draws the red distance guide from the vertex to that point,
// instead of the bounding-box guide used between whole elements.
//
// Driven through the real surface in headless Chromium so hover resolution
// runs through the HUD's actual vector chrome. The surface is mounted at the
// document origin under an identity camera, so client px == world == SVG
// user units (see `attachSurface`). We read the guide off the frame the
// surface hands to the HUD.

import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { Surface as HUDSurface, type HUDDraw } from "@grida/hud";
import {
  attachSurface,
  nodeIdByName,
  pointer,
  type AttachedSurface,
} from "./_browser-helpers";

// v0 (100,100) · v1 (300,100) · v2 (300,300); s0 = v0→v1, s1 = v1→v2.
const PATH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <path id="p" d="M 100 100 L 300 100 L 300 300" fill="none" stroke="#222"/>
</svg>`;

let s: AttachedSurface | null = null;
let draw: MockInstance<HUDSurface["draw"]> | null = null;
afterEach(() => {
  draw?.mockRestore();
  draw = null;
  s?.dispose();
  s = null;
});

function attach(svg = PATH): AttachedSurface {
  draw = vi.spyOn(HUDSurface.prototype, "draw");
  s = attachSurface(svg);
  return s;
}

function enterPathEdit(
  a: AttachedSurface,
  sub: { vertices?: number[]; segments?: number[] }
): void {
  const id = nodeIdByName(a.editor, "p");
  a.editor.commands.select(id);
  a.editor.enter_content_edit(id);
  expect(a.editor.state.mode).toBe("edit-content");
  expect(a.editor.commands.set_vector_selection(sub)).toBe(true);
}

/** Rest the pointer at a client point, with or without Alt held. */
function hover(a: AttachedSurface, x: number, y: number, altKey = true): void {
  const win = a.container.ownerDocument.defaultView!;
  pointer(win, "pointermove", x, y, 0, { altKey });
}

/** Labels of the measurement guide in the latest HUD frame, sorted. Guide
 *  lines are the labelled lines in the measurement color. */
function guideLabels(a: AttachedSurface): string[] {
  const extra = draw!.mock.lastCall?.[0] as HUDDraw | undefined;
  const color = a.editor.style.measurement_color;
  return (extra?.lines ?? [])
    .filter((l) => l.color === color && l.label !== undefined)
    .map((l) => l.label!)
    .sort();
}

describe("#845 — Alt-hover point measurement in path edit", () => {
  it("measures a selected vertex to a hovered vertex", () => {
    const a = attach();
    enterPathEdit(a, { vertices: [0] });

    hover(a, 300, 300); // v2

    // v0 (100,100) → v2 (300,300): 200 across, 200 down.
    expect(guideLabels(a)).toEqual(["200", "200"]);
  });

  it("measures a selected vertex to the cursor's point on a hovered segment", () => {
    const a = attach();
    enterPathEdit(a, { vertices: [0] });

    hover(a, 300, 250); // on s1, off its ghost knob

    // v0 (100,100) → (300,250): 200 across, 150 down.
    expect(guideLabels(a)).toEqual(["150", "200"]);

    // The point follows the cursor along the segment.
    hover(a, 300, 270);
    expect(guideLabels(a)).toEqual(["170", "200"]);
  });

  it("does not measure a vertex against itself or its selected segment", () => {
    const a = attach();
    enterPathEdit(a, { vertices: [0] });
    hover(a, 100, 100); // v0 itself
    expect(guideLabels(a)).toEqual([]);

    expect(a.editor.commands.set_vector_selection({ segments: [0] })).toBe(
      true
    );
    hover(a, 300, 100); // v1, an endpoint of the selected s0
    expect(guideLabels(a)).toEqual([]);

    hover(a, 300, 300); // v2 is not part of s0 → measured
    expect(guideLabels(a)).toContain("200");
  });

  it("shows the guide only while Alt is held", () => {
    const a = attach();
    enterPathEdit(a, { vertices: [0] });

    hover(a, 300, 300, false);
    expect(guideLabels(a)).toEqual([]);

    // Pressing and releasing Alt at rest toggles the guide without a move.
    const win = a.container.ownerDocument.defaultView!;
    win.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Alt",
        code: "AltLeft",
        altKey: true,
      })
    );
    expect(guideLabels(a)).toEqual(["200", "200"]);
    win.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Alt", code: "AltLeft", altKey: false })
    );
    expect(guideLabels(a)).toEqual([]);
  });

  it("labels world distances under a camera zoom", () => {
    const a = attach();
    enterPathEdit(a, { vertices: [0] });
    a.handle.camera.set_zoom(2, { x: 0, y: 0 });

    hover(a, 600, 600); // v2 on screen at 2×

    // On screen the guide is 400 px long; the labels report the 200 user
    // units the user authored.
    expect(guideLabels(a)).toEqual(["200", "200"]);
  });

  it("projects vertices through ancestor transforms", () => {
    const a =
      attach(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <g transform="translate(50 20)">
    <path id="p" d="M 100 100 L 300 100 L 300 300" fill="none" stroke="#222"/>
  </g>
</svg>`);
    enterPathEdit(a, { vertices: [0] });

    hover(a, 350, 320); // v2, shifted by the group

    expect(guideLabels(a)).toEqual(["200", "200"]);
  });
});
