// Editor-side wiring for the geometry signal: snapshot field +
// subscribe_geometry channel. The DOM-backed provider is tested
// separately at the driver level — this test pins the headless plumbing.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";
import { first_rect } from "./_helpers";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/></svg>`;

describe("editor.state.geometry_version", () => {
  it("starts at 0 on a fresh editor", () => {
    const editor = createSvgEditor({ svg: SVG });
    expect(editor.state.geometry_version).toBe(0);
  });

  it("advances on geometry-affecting writes via commands.set_property", () => {
    const editor = createSvgEditor({ svg: SVG });
    const rect = first_rect(editor);
    editor.commands.select(rect);
    const before = editor.state.geometry_version;
    editor.commands.set_property("x", "5");
    expect(editor.state.geometry_version).toBeGreaterThan(before);
  });

  it("does NOT advance on presentation writes", () => {
    const editor = createSvgEditor({ svg: SVG });
    const rect = first_rect(editor);
    editor.commands.select(rect);
    const before = editor.state.geometry_version;
    editor.commands.set_property("fill", "red");
    expect(editor.state.geometry_version).toBe(before);
  });
});

describe("editor.subscribe_geometry", () => {
  it("fires on geometry-affecting writes; does NOT fire on presentation writes", () => {
    const editor = createSvgEditor({ svg: SVG });
    const rect = first_rect(editor);
    editor.commands.select(rect);
    let count = 0;
    const unsub = editor.subscribe_geometry(() => {
      count++;
    });
    editor.commands.set_property("fill", "red");
    expect(count).toBe(0);
    editor.commands.set_property("x", "5");
    expect(count).toBe(1);
    editor.commands.set_property("width", "20");
    expect(count).toBe(2);
    editor.commands.set_property("stroke", "blue");
    expect(count).toBe(2);
    unsub();
  });

  it("stops firing after unsubscribe", () => {
    const editor = createSvgEditor({ svg: SVG });
    const rect = first_rect(editor);
    editor.commands.select(rect);
    let count = 0;
    const unsub = editor.subscribe_geometry(() => {
      count++;
    });
    editor.commands.set_property("x", "5");
    expect(count).toBe(1);
    unsub();
    editor.commands.set_property("x", "10");
    expect(count).toBe(1);
  });
});

describe("editor.geometry", () => {
  it("is null when no surface is attached (headless)", () => {
    const editor = createSvgEditor({ svg: SVG });
    expect(editor.geometry).toBeNull();
  });
});
