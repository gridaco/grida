// Text-edit caret + selection are drawn by the HUD (canvas-owned chrome), not
// by an SVG/DOM overlay. The svg-editor's job is to PROJECT the caret/selection
// geometry (local → container px) and push it to `hud.setTextEditChrome`.
//
// This drives the REAL editor end-to-end and spies on the HUD setter to prove
// the seam: (1) entering content-edit pushes a visible caret projected onto the
// text; (2) a camera zoom re-projects it (larger-scale transform); (3) exiting
// clears it. Real Chromium is required — the projection rides `getScreenCTM`,
// which only a real SVG layout engine produces.

import { describe, it, expect, afterEach, vi } from "vitest";
import { Surface as HUDSurface, type TextEditChromeInput } from "@grida/hud";
import {
  attachSurface,
  nodeIdByName,
  type AttachedSurface,
} from "./_browser-helpers";

const FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><text id="t" x="40" y="80" font-size="20" font-family="sans-serif">Text</text></svg>`;

/** Apply a cmath.Transform [[a,c,e],[b,d,f]] to a local point. */
function project(
  t: TextEditChromeInput["transform"],
  p: readonly [number, number]
) {
  return [
    t[0][0] * p[0] + t[0][1] * p[1] + t[0][2],
    t[1][0] * p[0] + t[1][1] * p[1] + t[1][2],
  ] as const;
}

const lastInput = (
  spy: ReturnType<typeof vi.spyOn>
): TextEditChromeInput | null =>
  (spy.mock.calls.at(-1)?.[0] ?? null) as TextEditChromeInput | null;

describe("text-edit chrome → HUD", () => {
  let s: AttachedSurface;
  let spy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    spy?.mockRestore();
    s?.dispose();
    document.body.innerHTML = "";
  });

  it("pushes a projected caret on enter, re-projects on zoom, clears on exit", () => {
    spy = vi.spyOn(HUDSurface.prototype, "setTextEditChrome");
    s = attachSurface(FIXTURE);
    const id = nodeIdByName(s.editor, "t");
    s.editor.enter_content_edit(id);

    // Entering selects-all (caret hidden). Click the text to collapse to a caret.
    const textEl = s.elementByName("t");
    const tr = textEl.getBoundingClientRect();
    const px = tr.left + tr.width * 0.5;
    const py = tr.top + tr.height * 0.5;
    textEl.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        clientX: px,
        clientY: py,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    );
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
        clientX: px,
        clientY: py,
        button: 0,
        buttons: 0,
        bubbles: true,
        composed: true,
      })
    );

    // (1) A visible caret was pushed.
    const input1 = lastInput(spy);
    expect(input1).toBeTruthy();
    expect(input1!.caret).toBeTruthy();
    expect(input1!.caretVisible).toBe(true);

    // The caret projects onto the text on screen (container px), not the origin.
    const containerRect = s.container.getBoundingClientRect();
    const caret1 = input1!.caret!;
    const mid: readonly [number, number] = [
      (caret1.top[0] + caret1.bottom[0]) / 2,
      (caret1.top[1] + caret1.bottom[1]) / 2,
    ];
    const screen1 = project(input1!.transform, mid);
    const box = textEl.getBoundingClientRect();
    expect(screen1[0]).toBeGreaterThan(box.left - containerRect.left - 4);
    expect(screen1[0]).toBeLessThan(box.right - containerRect.left + 4);

    // (2) Zoom 4x via the real camera → re-pushed with a larger-scale transform.
    const callsBefore = spy.mock.calls.length;
    s.handle.camera.set_zoom(4);
    expect(spy.mock.calls.length).toBeGreaterThan(callsBefore);
    const input2 = lastInput(spy)!;
    expect(Math.abs(input2.transform[0][0])).toBeGreaterThan(
      Math.abs(input1!.transform[0][0]) * 2
    );

    // (3) Exit by clicking off the text (commits) → chrome cleared.
    s.container.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        clientX: containerRect.right - 4,
        clientY: containerRect.bottom - 4,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    );
    expect(lastInput(spy)).toBeNull();
  });
});
