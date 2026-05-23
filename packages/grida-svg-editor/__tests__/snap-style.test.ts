// `EditorStyle.snap_enabled` toggle contract.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";
import { DEFAULT_STYLE } from "../src/types";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/></svg>`;

describe("EditorStyle.snap_enabled", () => {
  it("is on by default in DEFAULT_STYLE", () => {
    expect(DEFAULT_STYLE.snap_enabled).toBe(true);
  });

  it("is on by default for a fresh editor", () => {
    const editor = createSvgEditor({ svg: SVG });
    expect(editor.style.snap_enabled).toBe(true);
  });

  it("honors construction-time override", () => {
    const editor = createSvgEditor({
      svg: SVG,
      style: { snap_enabled: false },
    });
    expect(editor.style.snap_enabled).toBe(false);
  });

  it("toggles at runtime via set_style; each flip bumps state.version", () => {
    const editor = createSvgEditor({ svg: SVG });
    const v0 = editor.state.version;
    editor.set_style({ snap_enabled: false });
    expect(editor.style.snap_enabled).toBe(false);
    expect(editor.state.version).toBeGreaterThan(v0);
    const v1 = editor.state.version;
    editor.set_style({ snap_enabled: true });
    expect(editor.state.version).toBeGreaterThan(v1);
  });
});

describe("EditorStyle.snap_to_pixel_grid", () => {
  it("is off by default in DEFAULT_STYLE (SVG-fidelity audience)", () => {
    expect(DEFAULT_STYLE.snap_to_pixel_grid).toBe(false);
    expect(DEFAULT_STYLE.pixel_grid_size).toBe(1);
  });

  it("is off by default for a fresh editor", () => {
    const editor = createSvgEditor({ svg: SVG });
    expect(editor.style.snap_to_pixel_grid).toBe(false);
  });

  it("honors construction-time override", () => {
    const editor = createSvgEditor({
      svg: SVG,
      style: { snap_to_pixel_grid: true, pixel_grid_size: 4 },
    });
    expect(editor.style.snap_to_pixel_grid).toBe(true);
    expect(editor.style.pixel_grid_size).toBe(4);
  });

  it("toggles at runtime via set_style; each flip bumps state.version", () => {
    const editor = createSvgEditor({ svg: SVG });
    const v0 = editor.state.version;
    editor.set_style({ snap_to_pixel_grid: true });
    expect(editor.style.snap_to_pixel_grid).toBe(true);
    expect(editor.state.version).toBeGreaterThan(v0);
  });
});
