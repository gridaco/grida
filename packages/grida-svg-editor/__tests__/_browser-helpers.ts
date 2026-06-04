// Shared helpers for `*.browser.test.ts` (Vitest browser mode / real DOM).
//
// The premise: these tests run in a real headless Chromium, so `getBBox` and
// `getCTM` reflect the actual SVG layout engine — including ancestor `<g>`
// transforms and text flow that jsdom cannot model. We assert on **computed
// geometry values**, not pixels.
//
// Not named `*.test.ts` so Vitest does not collect it as a suite.

import { createSvgEditor, type SvgEditor } from "../src";
import { attach_dom_surface, type DomSurfaceHandle } from "../src/dom";

/** Attribute selector for the DOM element the surface renders for a node. */
const GRIDA_ID_ATTR = "data-grida-id";

/** A live, attached DOM surface with helpers to inspect the rendered tree. */
export type AttachedSurface = {
  editor: SvgEditor;
  handle: DomSurfaceHandle;
  container: HTMLElement;
  /** The rendered SVG element for a node, resolved by its authored SVG id. */
  elementByName: (name: string) => SVGGraphicsElement;
  /** World rect of the rendered element for a node (live, via getCTM). */
  worldRectByName: (name: string) => WorldRect;
  dispose: () => void;
};

/**
 * Create an editor and attach a real DOM surface, mounted at the document
 * origin so world coords map 1:1 to client px (identity camera, no auto-fit).
 * This is the gesture path's real entry point: the surface installs pointer
 * handlers, so {@link dragByClient} drives the actual translate/snap pipeline.
 */
export function attachSurface(svgText: string): AttachedSurface {
  const container = document.createElement("div");
  // Pin to the top-left of the viewport with a concrete size so client
  // coordinates equal world coordinates under the identity camera.
  Object.assign(container.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: "900px",
    height: "650px",
    margin: "0",
    padding: "0",
    background: "#fff",
  });
  document.body.appendChild(container);

  const editor = createSvgEditor({ svg: svgText });
  const handle = attach_dom_surface(editor, {
    container,
    gestures: true,
    fit: false,
  });

  const elementByName = (name: string): SVGGraphicsElement => {
    const id = nodeIdByName(editor, name);
    const el = container.querySelector<SVGGraphicsElement>(
      `[${GRIDA_ID_ATTR}="${id}"]`
    );
    if (!el)
      throw new Error(`no rendered element for node "${name}" (id=${id})`);
    return el;
  };

  return {
    editor,
    handle,
    container,
    elementByName,
    worldRectByName: (name) => worldRectOf(elementByName(name)),
    dispose: () => {
      handle.detach();
      container.remove();
    },
  };
}

/** Center of an element in client (page CSS-px) coordinates. */
export function clientCenter(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function pointer(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  buttons: number
): void {
  const ev = new PointerEvent(type, {
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: type === "pointermove" ? -1 : 0,
    buttons,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(ev);
}

/**
 * Drive a real pointer drag from one client point to another. pointerdown on
 * the container, an intermediate move to clear the drag threshold, a move to
 * the destination, then pointerup. This exercises the surface's actual gesture
 * → translate → snap pipeline, not a shortcut API.
 */
export function dragByClient(
  container: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number }
): void {
  const win = container.ownerDocument.defaultView!;
  pointer(container, "pointerdown", from.x, from.y, 1);
  // Two-step move so the HUD promotes "pending" → "translate" before the
  // final positioning frame. The midpoint is always between from and to, so
  // it never overshoots the target (a fixed step could, on a short drag).
  pointer(win, "pointermove", (from.x + to.x) / 2, (from.y + to.y) / 2, 1);
  pointer(win, "pointermove", to.x, to.y, 1);
  pointer(win, "pointerup", to.x, to.y, 0);
}

/** World-space axis-aligned bounding box, in the root SVG's user units. */
type WorldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Resolve a node's internal id from the SVG `id` attribute it was authored
 * with. The editor stores the SVG `id` as `node.name`; the DOM is keyed by
 * the internal `node.id`.
 */
export function nodeIdByName(editor: SvgEditor, name: string): string {
  const found = [...editor.tree().nodes.values()].find((n) => n.name === name);
  if (!found) throw new Error(`no node named "${name}"`);
  return found.id;
}

/**
 * Project a local bbox through an element's CTM (local → nearest viewport),
 * returning the world-space AABB. This is the ground-truth world rect — the
 * same computation `SvgGeometryDriver.bounds_of` performs, and the value snap
 * geometry *should* agree with. Deliberately an independent oracle: it does
 * NOT call into the package, so it can't mask a bug in the code under test.
 */
function worldRectOf(el: SVGGraphicsElement): WorldRect {
  const b = el.getBBox();
  const ctm = el.getCTM();
  if (!ctm) return { x: b.x, y: b.y, width: b.width, height: b.height };
  const project = (px: number, py: number) => ({
    x: ctm.a * px + ctm.c * py + ctm.e,
    y: ctm.b * px + ctm.d * py + ctm.f,
  });
  const corners = [
    project(b.x, b.y),
    project(b.x + b.width, b.y),
    project(b.x + b.width, b.y + b.height),
    project(b.x, b.y + b.height),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    x: left,
    y: top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
}

/**
 * World rect of the element with authored SVG `id`, read from the editor's
 * CURRENT serialized model: serialize → mount in the real document → measure
 * via getBBox+getCTM → unmount. Use this to assert a COMMITTED position
 * without depending on the live surface's re-render timing.
 */
export function committedWorldRect(editor: SvgEditor, id: string): WorldRect {
  const parsed = new DOMParser().parseFromString(
    editor.serialize(),
    "image/svg+xml"
  ).documentElement;
  const svg = document.importNode(parsed, true) as unknown as SVGSVGElement;
  // A concrete pixel size so the viewport is established for getCTM.
  if (!svg.getAttribute("width")) svg.setAttribute("width", "900");
  if (!svg.getAttribute("height")) svg.setAttribute("height", "650");
  document.body.appendChild(svg);
  try {
    const el = svg.querySelector<SVGGraphicsElement>(`[id="${id}"]`);
    if (!el) throw new Error(`no element with id="${id}" in serialized svg`);
    return worldRectOf(el);
  } finally {
    svg.remove();
  }
}
