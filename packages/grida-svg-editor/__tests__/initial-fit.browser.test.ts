import { afterEach, beforeEach, expect, it } from "vitest";
import { createSvgEditor, type SvgEditor } from "../src";
import { attach_dom_surface } from "../src/dom";
import { keynote } from "../src/presets";

const wide = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600"><rect width="1200" height="600"/></svg>`;
const tall = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1200"><rect width="600" height="1200"/></svg>`;

let container: HTMLDivElement;
let editor: SvgEditor;

beforeEach(() => {
  container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "800px",
    height: "600px",
  });
  document.body.appendChild(container);
  editor = createSvgEditor({ svg: wide });
});

afterEach(() => {
  editor.dispose();
  container.remove();
});

function expectInset(axis: "x" | "y", inset: number) {
  const viewport = container.getBoundingClientRect();
  const slide = container.querySelector("svg")!.getBoundingClientRect();
  const [before, after] =
    axis === "x"
      ? [slide.left - viewport.left, viewport.right - slide.right]
      : [slide.top - viewport.top, viewport.bottom - slide.bottom];
  expect(before).toBeCloseTo(inset);
  expect(after).toBeCloseTo(inset);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

it("fits a measurable DOM surface synchronously with the default margin", () => {
  const handle = attach_dom_surface(editor, { container, fit: true });
  expect(handle.camera.zoom).toBeCloseTo((800 - 2 * 64) / 1200);
  expectInset("x", 64);
});

it("uses the Keynote padding on initial attach, document loads, and padding changes", async () => {
  const handle = keynote.attach(editor, { container, padding: 100 });
  try {
    expectInset("x", 100);

    handle.camera.set_zoom(1.25);
    await nextFrame();
    await nextFrame();
    expect(handle.camera.zoom).toBeCloseTo(1.25);

    editor.load(tall);
    expectInset("y", 100);

    handle.set_padding(0);
    expectInset("y", 0);
    editor.load(wide);
    expectInset("x", 0);
  } finally {
    handle.detach();
  }
});

it("keeps the Keynote opening fit and allows gesture zoom below fit when configured", () => {
  const handle = keynote.attach(editor, {
    container,
    min_fit_scale: 0.25,
    pan_overshoot: 80,
  });
  try {
    expectInset("x", 80);
    const fit = handle.camera.zoom;

    container.dispatchEvent(
      new WheelEvent("wheel", { ctrlKey: true, deltaY: 50, cancelable: true })
    );
    expect(handle.camera.zoom).toBeCloseTo(fit / 2);
    expectInset("x", 240);

    container.dispatchEvent(
      new WheelEvent("wheel", { ctrlKey: true, deltaY: 100, cancelable: true })
    );
    expect(handle.camera.zoom).toBeCloseTo(fit / 4);
    expectInset("x", 320);

    handle.camera.set_zoom(1.25);
    handle.camera.pan({ x: 5000, y: 0 });
    expect(handle.camera.transform[0][2]).toBe(80);

    editor.load(tall);
    expectInset("y", 80);
  } finally {
    handle.detach();
  }
});

it("keeps the initial fit pending while hidden and applies it on the first usable resize", async () => {
  container.style.display = "none";
  const handle = attach_dom_surface(editor, { container, fit: { margin: 32 } });
  await nextFrame();
  await nextFrame();
  expect(handle.camera.viewport_size).toEqual({ width: 0, height: 0 });
  expect(handle.camera.zoom).toBe(1);

  // This observer runs after the surface's observer in the same layout pass.
  await new Promise<void>((resolve) => {
    const observer = new ResizeObserver(() => {
      observer.disconnect();
      resolve();
    });
    observer.observe(container);
    container.style.display = "block";
  });
  expectInset("x", 32);

  await nextFrame();
  handle.camera.set_zoom(1.25);
  container.style.width = "700px";
  await nextFrame();
  await nextFrame();
  expect(handle.camera.viewport_size.width).toBe(700);
  expect(handle.camera.zoom).toBeCloseTo(1.25);

  editor.load(tall);
  expect(handle.camera.zoom).toBeCloseTo(1.25);
});
