// gridaco/grida#892 — the HUD selection chrome double-scales when the editor
// is mounted inside an ancestor carrying a CSS `transform: scale(z)`.
//
// Mechanism: the HUD canvas is a child of the container, and chrome positions
// are projected to *screen* px via `getScreenCTM()`. Under an ancestor scale,
// the canvas (living inside the scaled subtree) re-applies `z` at render — so
// chrome drifts toward the container's top-left and shrinks by ~z². The fix
// counter-scales the canvas by `1/z` (`sync_canvas_size`) so its drawing space
// stays 1:1 with screen px; the canvas then overlays the container exactly.
//
// Why this needs a real browser: the bug only exists once a layout engine
// actually applies the ancestor CSS transform to the canvas. jsdom returns an
// identity layout, so `getBoundingClientRect` ≡ `offsetWidth` and the double
// scale is invisible. We assert on the canvas's real screen geometry.
import { describe, it, expect, afterEach } from "vitest";
import { createSvgEditor } from "../src";
import { attach_dom_surface, type DomSurfaceHandle } from "../src/dom";

const FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650" viewBox="0 0 900 650"><rect id="box" x="100" y="80" width="200" height="150" fill="#f33"/></svg>`;

type Mount = {
  container: HTMLDivElement;
  hudCanvas: HTMLCanvasElement;
  handle: DomSurfaceHandle;
  dispose: () => void;
};

/**
 * Mount the editor inside an optional ancestor wrapper. When `scale` is given,
 * the wrapper carries `transform: scale(scale)` with `transform-origin: 0 0`,
 * reproducing the #892 embedding (a zoom-UI / scaled-preview host). `width`
 * overrides the container's CSS width (a fractional value exercises the
 * `offsetWidth`-rounding edge — see the fractional-width case below).
 */
function mount(scale?: number, width = "900px"): Mount {
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    margin: "0",
    padding: "0",
    ...(scale !== undefined
      ? { transform: `scale(${scale})`, transformOrigin: "0 0" }
      : {}),
  });

  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "relative",
    width,
    height: "650px",
    margin: "0",
    padding: "0",
    border: "0",
    background: "#fff",
  });
  wrapper.appendChild(container);
  document.body.appendChild(wrapper);

  const editor = createSvgEditor({ svg: FIXTURE });
  const handle = attach_dom_surface(editor, {
    container,
    gestures: true,
    fit: false,
  });
  // Select the rect so the HUD actually builds + draws selection chrome.
  const box = [...editor.tree().nodes.values()].find((n) => n.name === "box");
  if (box) editor.commands.select(box.id);

  const hudCanvas = container.querySelector("canvas");
  if (!hudCanvas) throw new Error("no HUD canvas mounted");

  return {
    container,
    hudCanvas,
    handle,
    dispose: () => {
      handle.detach();
      wrapper.remove();
    },
  };
}

let active: Mount | null = null;

afterEach(() => {
  active?.dispose();
  active = null;
  document.body.innerHTML = "";
});

/** Assert the HUD canvas occupies the same screen box as the container — the
 *  core #892 invariant. Before the fix the canvas renders at z× (anchored
 *  top-left), so width/left diverge. */
function expectCanvasOverlaysContainer(m: Mount): void {
  const c = m.container.getBoundingClientRect();
  const h = m.hudCanvas.getBoundingClientRect();
  expect(h.left).toBeCloseTo(c.left, 0);
  expect(h.top).toBeCloseTo(c.top, 0);
  expect(h.width).toBeCloseTo(c.width, 0);
  expect(h.height).toBeCloseTo(c.height, 0);
}

describe("#892: HUD chrome under a CSS-transformed ancestor", () => {
  it("1:1 mount: canvas is not counter-scaled and overlays the container", () => {
    active = mount();
    // Empty string (not `scale(1, 1)`) — the common, untransformed mount stays
    // a true no-op, byte-identical to before the fix.
    expect(active.hudCanvas.style.transform).toBe("");
    expectCanvasOverlaysContainer(active);
  });

  it("scale(0.5) ancestor: canvas counter-scales by 1/z and still overlays the container", () => {
    active = mount(0.5);
    expect(active.hudCanvas.style.transform).toBe("scale(2, 2)"); // 1/0.5
    expectCanvasOverlaysContainer(active);
    // Guard the test: a 450px screen box from a 900px layout box proves the
    // ancestor transform genuinely applied (without it the overlay is vacuous).
    expect(active.container.getBoundingClientRect().width).toBeCloseTo(450, 0);
  });

  it("fractional-width container, no ancestor transform: stays a no-op (no spurious counter-scale)", () => {
    // `offsetWidth` is integer-rounded while `getBoundingClientRect` is
    // fractional, so a non-integer container width (the norm for flex/percentage
    // panes) yields a ~1.0004x ratio with NO ancestor transform. The fix must
    // still emit "" — a spurious `scale(0.9996)` would sub-pixel-blur the chrome.
    active = mount(undefined, "900.4px");
    // Prove the divergence is real: fractional screen box vs integer offsetWidth.
    expect(active.container.getBoundingClientRect().width).not.toBe(
      active.container.offsetWidth
    );
    expect(active.hudCanvas.style.transform).toBe("");
    expectCanvasOverlaysContainer(active);
  });
});
