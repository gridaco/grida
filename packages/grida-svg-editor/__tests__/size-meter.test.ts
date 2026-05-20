// Headless coverage for the size-meter preference. The pill rendering
// itself depends on SVG layout (getBBox / getCTM) so it's verified
// manually in the demo; this test pins the public toggle behavior.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";
import { DEFAULT_STYLE } from "../src/types";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/></svg>`;

describe("EditorStyle.show_size_meter", () => {
  it("is on by default in DEFAULT_STYLE", () => {
    expect(DEFAULT_STYLE.show_size_meter).toBe(true);
  });

  it("is on by default for a fresh editor", () => {
    const editor = createSvgEditor({ svg: SVG });
    expect(editor.style.show_size_meter).toBe(true);
  });

  it("honors the construction-time override", () => {
    const editor = createSvgEditor({
      svg: SVG,
      style: { show_size_meter: false },
    });
    expect(editor.style.show_size_meter).toBe(false);
  });

  it("toggles at runtime via set_style; each flip bumps state.version", () => {
    const editor = createSvgEditor({ svg: SVG });
    const v0 = editor.state.version;
    editor.set_style({ show_size_meter: false });
    expect(editor.style.show_size_meter).toBe(false);
    expect(editor.state.version).toBeGreaterThan(v0);
    const v1 = editor.state.version;
    editor.set_style({ show_size_meter: true });
    expect(editor.style.show_size_meter).toBe(true);
    expect(editor.state.version).toBeGreaterThan(v1);
  });

  it("set_style preserves other fields when toggling", () => {
    const editor = createSvgEditor({
      svg: SVG,
      style: { chrome_color: "#abcdef" },
    });
    editor.set_style({ show_size_meter: false });
    expect(editor.style.chrome_color).toBe("#abcdef");
  });
});
