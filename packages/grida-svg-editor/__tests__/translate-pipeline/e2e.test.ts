// Translate pipeline end-to-end. Headless editor only — no DOM surface.
//
// Two public commands converge in the same plumbing but pick different
// stage lists:
//  - `editor.commands.translate({dx, dy})` → `STAGES_RPC` (raw passthrough).
//  - `editor.commands.nudge({dx, dy})` → `STAGES_NUDGE` (pixel-grid on).
//
// The keyboard binding's path (`transform.nudge` registry invoke →
// `default_nudge_handler` → `commands.nudge`) gets one route test below.
// Gesture-driven (DomSurface) translates are covered by the per-stage
// and orchestrator unit tests.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../../src/index";
import { first_rect } from "../_helpers";

const SVG_INTEGER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="10" y="10" width="20" height="20"/></svg>`;
const SVG_FRACTIONAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="10.4" y="10" width="20" height="20"/></svg>`;

describe("editor.commands.translate — raw numeric API (STAGES_RPC)", () => {
  it("passes the delta through when pixel-grid is off (default)", () => {
    const editor = createSvgEditor({ svg: SVG_INTEGER });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    editor.commands.translate({ dx: 0.4, dy: 0 });
    expect(editor.document.get_attr(id, "x")).toBe("10.4");
  });

  it("passes the delta through EVEN WHEN pixel-grid is on (P1 contract)", () => {
    // Scripted callers depend on `translate({dx, dy})` being a typed
    // numeric API. A HUD-style flag (`snap_to_pixel_grid`) must NOT
    // silently mangle their delta — that would break round-trip and
    // automation. UX-intent quantize lives on the nudge path.
    const editor = createSvgEditor({
      svg: SVG_INTEGER,
      style: { snap_to_pixel_grid: true },
    });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    editor.commands.translate({ dx: 0.4, dy: 0 });
    expect(editor.document.get_attr(id, "x")).toBe("10.4");
  });

  it("preserves fractional baselines exactly with pixel-grid on", () => {
    const editor = createSvgEditor({
      svg: SVG_FRACTIONAL,
      style: { snap_to_pixel_grid: true },
    });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    editor.commands.translate({ dx: 1, dy: 0 });
    expect(editor.document.get_attr(id, "x")).toBe("11.4");
  });

  it("undo / redo round-trip on raw delta", () => {
    const editor = createSvgEditor({ svg: SVG_FRACTIONAL });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    editor.commands.translate({ dx: 1, dy: 0 });
    expect(editor.document.get_attr(id, "x")).toBe("11.4");
    editor.commands.undo();
    expect(editor.document.get_attr(id, "x")).toBe("10.4");
    editor.commands.redo();
    expect(editor.document.get_attr(id, "x")).toBe("11.4");
  });
});

describe("transform.nudge — UX intent (STAGES_NUDGE)", () => {
  it("is raw delta when pixel-grid is off (default)", () => {
    const editor = createSvgEditor({ svg: SVG_INTEGER });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    editor.commands.nudge({ dx: 0.4, dy: 0 });
    expect(editor.document.get_attr(id, "x")).toBe("10.4");
  });

  it("quantizes to integer when pixel-grid is on", () => {
    const editor = createSvgEditor({
      svg: SVG_INTEGER,
      style: { snap_to_pixel_grid: true },
    });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    // baseline=10 + delta=0.4 → 10.4 → round → 10; corrected delta = 0
    editor.commands.nudge({ dx: 0.4, dy: 0 });
    expect(editor.document.get_attr(id, "x")).toBe("10");
  });

  it("settles fractional baseline to integer with pixel-grid on", () => {
    const editor = createSvgEditor({
      svg: SVG_FRACTIONAL,
      style: { snap_to_pixel_grid: true },
    });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    // Arrow-key from x=10.4 by (1, 0) should land on x=11.
    editor.commands.nudge({ dx: 1, dy: 0 });
    expect(editor.document.get_attr(id, "x")).toBe("11");
  });

  it("respects custom pixel_grid_size", () => {
    const editor = createSvgEditor({
      svg: SVG_INTEGER,
      style: { snap_to_pixel_grid: true, pixel_grid_size: 10 },
    });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    // baseline=10 + delta=7 = 17 → round to 10s → 20; corrected delta = 10
    editor.commands.nudge({ dx: 7, dy: 0 });
    expect(editor.document.get_attr(id, "x")).toBe("20");
  });

  it("undo returns to baseline", () => {
    const editor = createSvgEditor({
      svg: SVG_FRACTIONAL,
      style: { snap_to_pixel_grid: true },
    });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    editor.commands.nudge({ dx: 1, dy: 0 });
    expect(editor.document.get_attr(id, "x")).toBe("11");
    editor.commands.undo();
    expect(editor.document.get_attr(id, "x")).toBe("10.4");
  });

  it("redo replays the quantized delta deterministically", () => {
    const editor = createSvgEditor({
      svg: SVG_FRACTIONAL,
      style: { snap_to_pixel_grid: true },
    });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    editor.commands.nudge({ dx: 1, dy: 0 });
    editor.commands.undo();
    editor.commands.redo();
    expect(editor.document.get_attr(id, "x")).toBe("11");
  });

  it("registry route — `transform.nudge` invoke drives `commands.nudge`", () => {
    const editor = createSvgEditor({
      svg: SVG_FRACTIONAL,
      style: { snap_to_pixel_grid: true },
    });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    const consumed = editor.commands.invoke("transform.nudge", {
      dx: 1,
      dy: 0,
    });
    expect(consumed).toBe(true);
    expect(editor.document.get_attr(id, "x")).toBe("11");
  });
});
