// Real-DOM verification of the pick (tap) wire: a discrete click on the canvas
// surfaces a PickEvent on `editor.subscribe_pick`, carrying the document-space
// point and the node under it. Runs in headless Chromium so the SVG layout
// engine (getBBox / getCTM) is real and, under the identity camera mounted at
// the origin, client px map 1:1 to world coords (see _browser-helpers.ts).
//
// This is the consumer end of the `@grida/hud` `onTap` contract. The surface
// is a thin wire: it re-expresses the HUD's already-resolved tap (down point,
// hit node, click-vs-drag) as a PickEvent — it does NOT re-hit-test, so the
// pick and any selection that accompanies it can never disagree.

import { afterEach, describe, expect, it } from "vitest";
import {
  attachSurface,
  clientCenter,
  nodeIdByName,
  type AttachedSurface,
} from "./_browser-helpers";
import type { PickEvent } from "../src/types";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <rect id="box" x="40" y="40" width="120" height="80" fill="#39f"/>
</svg>`;

let s: AttachedSurface | null = null;
afterEach(() => {
  s?.dispose();
  s = null;
});

/** A discrete click: press + release at the same client point (no drag), so
 *  the HUD resolves a tap rather than a gesture. Mirrors the surface's event
 *  binding — pointerdown on the container, pointerup on the window. */
function clickClient(
  container: HTMLElement,
  x: number,
  y: number,
  button = 0
): void {
  const win = container.ownerDocument.defaultView!;
  const init = (type: string): PointerEventInit => ({
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button,
    buttons: type === "pointerup" ? 0 : button === 0 ? 1 : 2,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  container.dispatchEvent(new PointerEvent("pointerdown", init("pointerdown")));
  win.dispatchEvent(new PointerEvent("pointerup", init("pointerup")));
}

describe("pick wire (click → subscribe_pick)", () => {
  it("a primary click on a node picks that node at the click point", () => {
    s = attachSurface(SVG);
    const picks: PickEvent[] = [];
    s.editor.subscribe_pick((e) => picks.push(e));

    const c = clientCenter(s.elementByName("box"));
    clickClient(s.container, c.x, c.y);

    expect(picks).toHaveLength(1);
    expect(picks[0].node_id).toBe(nodeIdByName(s.editor, "box"));
    expect(picks[0].button).toBe("primary");
    // identity camera mounted at origin → click client px == world point
    expect(picks[0].point.x).toBeCloseTo(c.x, 0);
    expect(picks[0].point.y).toBeCloseTo(c.y, 0);
  });

  it("a click on empty canvas picks with node_id null", () => {
    s = attachSurface(SVG);
    const picks: PickEvent[] = [];
    s.editor.subscribe_pick((e) => picks.push(e));

    clickClient(s.container, 350, 260); // inside the svg, outside the rect
    expect(picks).toHaveLength(1);
    expect(picks[0].node_id).toBeNull();
  });

  it("a secondary (right-button) click picks but leaves selection untouched", () => {
    s = attachSurface(SVG);
    const picks: PickEvent[] = [];
    s.editor.subscribe_pick((e) => picks.push(e));

    const c = clientCenter(s.elementByName("box"));
    clickClient(s.container, c.x, c.y, 2);

    expect(picks).toHaveLength(1);
    expect(picks[0].button).toBe("secondary");
    expect(picks[0].node_id).toBe(nodeIdByName(s.editor, "box"));
    expect(s.editor.state.selection).toEqual([]); // right-click never selects
  });
});
