// Headless tests for `editor.commands.group()` + the `selection.group`
// keymap registry handler. Covers happy path, undo/redo, every reject
// row in ../docs/grouping.md, and the "structural-not-byte" undo contract for
// whitespace-containing inputs.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";

/** Tight (whitespace-free) SVG so we can assert byte-equal undo. */
const TWO_TIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/><circle cx="20" cy="20" r="5"/></svg>`;
const THREE_TIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/><circle cx="20" cy="20" r="5"/><ellipse cx="40" cy="40" rx="5" ry="3"/></svg>`;

/** Whitespace-containing variant — undo is structural, not byte-equal. */
const TWO_WS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <rect x="0" y="0" width="10" height="10"/>\n  <circle cx="20" cy="20" r="5"/>\n</svg>`;

const NESTED_G = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g><rect x="0" y="0" width="10" height="10"/></g></svg>`;
const TEXT_TSPAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="0" y="0"><tspan>hello</tspan></text></svg>`;
const CROSS_PARENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g><rect x="0" y="0" width="10" height="10"/></g><circle cx="20" cy="20" r="5"/></svg>`;
const GRADIENT_STOPS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g"><stop offset="0"/><stop offset="1"/></linearGradient></defs><rect x="0" y="0" width="10" height="10"/></svg>`;

function ids_by_tag(editor: ReturnType<typeof createSvgEditor>, tag: string) {
  return [...editor.tree().nodes.values()]
    .filter((n) => n.tag === tag)
    .map((n) => n.id);
}

function first_by_tag(editor: ReturnType<typeof createSvgEditor>, tag: string) {
  return ids_by_tag(editor, tag)[0];
}

/** Load `svg`, pick the first rect + circle (selected), return all three. */
function setup_two(svg = TWO_TIGHT) {
  const editor = createSvgEditor({ svg });
  const rect = first_by_tag(editor, "rect");
  const circle = first_by_tag(editor, "circle");
  editor.commands.select([rect, circle]);
  return { editor, rect, circle };
}

describe("commands.group — happy path & history", () => {
  it("wraps two siblings in a new <g> and selects it", () => {
    const { editor } = setup_two();
    expect(editor.commands.group()).toBe(true);
    expect(editor.serialize()).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g><rect x="0" y="0" width="10" height="10"/><circle cx="20" cy="20" r="5"/></g></svg>`
    );
    expect(editor.state.selection.length).toBe(1);
    expect(editor.tree().nodes.get(editor.state.selection[0])!.tag).toBe("g");
  });

  it("undo restores byte-identical SVG on tight input", () => {
    const { editor, rect, circle } = setup_two();
    editor.commands.group();
    editor.commands.undo();
    expect(editor.serialize()).toBe(TWO_TIGHT);
    expect([...editor.state.selection].sort()).toEqual([rect, circle].sort());
  });

  it("redo restores the grouped state exactly", () => {
    const { editor } = setup_two();
    editor.commands.group();
    const grouped_svg = editor.serialize();
    const group_id = editor.state.selection[0];
    editor.commands.undo();
    editor.commands.redo();
    expect(editor.serialize()).toBe(grouped_svg);
    expect(editor.state.selection).toEqual([group_id]);
  });

  it("structural undo on whitespace input restores the tree shape", () => {
    const { editor, rect, circle } = setup_two(TWO_WS);
    const root_children_before = editor
      .tree()
      .nodes.get(editor.tree().root)!.children;

    editor.commands.group();
    editor.commands.undo();

    const root_children_after = editor
      .tree()
      .nodes.get(editor.tree().root)!.children;
    expect(root_children_after).toEqual(root_children_before);
    expect(editor.tree().nodes.get(rect)!.parent).toBe(editor.tree().root);
    expect(editor.tree().nodes.get(circle)!.parent).toBe(editor.tree().root);
  });

  it("bumps structure_version on group and again on undo", () => {
    const { editor } = setup_two();
    const v0 = editor.state.structure_version;
    editor.commands.group();
    const v1 = editor.state.structure_version;
    expect(v1).toBeGreaterThan(v0);
    editor.commands.undo();
    expect(editor.state.structure_version).toBeGreaterThan(v1);
  });
});

describe("commands.group — single-node policy", () => {
  it("wraps a single <g> (nested groups allowed)", () => {
    const editor = createSvgEditor({ svg: NESTED_G });
    const inner = first_by_tag(editor, "g");
    editor.commands.select(inner);
    expect(editor.commands.group()).toBe(true);
    const outer = editor.state.selection[0];
    expect(editor.tree().nodes.get(outer)!.tag).toBe("g");
    expect(editor.tree().nodes.get(inner)!.parent).toBe(outer);
  });

  it("wraps a single <rect>", () => {
    const editor = createSvgEditor({ svg: TWO_TIGHT });
    const rect = first_by_tag(editor, "rect");
    editor.commands.select(rect);
    expect(editor.commands.group()).toBe(true);
    const group_id = editor.state.selection[0];
    expect(editor.tree().nodes.get(rect)!.parent).toBe(group_id);
  });

  it("rejects a single <tspan> (tag not in STRUCTURAL_GRAPHICS_SET)", () => {
    const editor = createSvgEditor({ svg: TEXT_TSPAN });
    const tspan = first_by_tag(editor, "tspan");
    editor.commands.select(tspan);
    const original = editor.serialize();
    const can_undo_before = editor.state.can_undo;
    const version_before = editor.state.version;
    expect(editor.commands.group()).toBe(false);
    expect(editor.serialize()).toBe(original);
    expect(editor.state.can_undo).toBe(can_undo_before);
    expect(editor.state.version).toBe(version_before);
  });
});

describe("commands.group — reject rows", () => {
  it("rejects empty selection", () => {
    const editor = createSvgEditor({ svg: TWO_TIGHT });
    const original = editor.serialize();
    const can_undo_before = editor.state.can_undo;
    const version_before = editor.state.version;
    expect(editor.commands.group()).toBe(false);
    expect(editor.serialize()).toBe(original);
    expect(editor.state.can_undo).toBe(can_undo_before);
    expect(editor.state.version).toBe(version_before);
  });

  it("rejects cross-parent selection", () => {
    const editor = createSvgEditor({ svg: CROSS_PARENT });
    const rect = first_by_tag(editor, "rect"); // inside <g>
    const circle = first_by_tag(editor, "circle"); // outside <g>
    const original = editor.serialize();
    const can_undo_before = editor.state.can_undo;
    editor.commands.select([rect, circle]);
    expect(editor.commands.group()).toBe(false);
    expect(editor.serialize()).toBe(original);
    expect(editor.state.can_undo).toBe(can_undo_before);
  });

  it("rejects non-contiguous siblings", () => {
    const editor = createSvgEditor({ svg: THREE_TIGHT });
    const rect = first_by_tag(editor, "rect");
    const ellipse = first_by_tag(editor, "ellipse");
    const original = editor.serialize();
    const can_undo_before = editor.state.can_undo;
    editor.commands.select([rect, ellipse]); // skips circle in the middle
    expect(editor.commands.group()).toBe(false);
    expect(editor.serialize()).toBe(original);
    expect(editor.state.can_undo).toBe(can_undo_before);
  });

  it("preserves document order in the group regardless of selection order", () => {
    const editor = createSvgEditor({ svg: TWO_TIGHT });
    const rect = first_by_tag(editor, "rect");
    const circle = first_by_tag(editor, "circle");
    editor.commands.select([circle, rect]); // reverse order
    expect(editor.commands.group()).toBe(true);
    const group_id = editor.state.selection[0];
    const group_children = editor.tree().nodes.get(group_id)!.children;
    expect(group_children).toEqual([rect, circle]);
  });

  it("rejects when document root is selected", () => {
    const editor = createSvgEditor({ svg: TWO_TIGHT });
    const root = editor.tree().root;
    const original = editor.serialize();
    editor.commands.select(root);
    expect(editor.commands.group()).toBe(false);
    expect(editor.serialize()).toBe(original);
  });

  it("rejects when parent is in CONSTRAINED_PARENT_SET (linearGradient)", () => {
    const editor = createSvgEditor({ svg: GRADIENT_STOPS });
    const stops = ids_by_tag(editor, "stop");
    expect(stops.length).toBe(2);
    const original = editor.serialize();
    const can_undo_before = editor.state.can_undo;
    editor.commands.select(stops);
    expect(editor.commands.group()).toBe(false);
    expect(editor.serialize()).toBe(original);
    expect(editor.state.can_undo).toBe(can_undo_before);
  });
});

describe("commands.group — registry handler", () => {
  it("returns false in edit-content mode", () => {
    const editor = createSvgEditor({ svg: TWO_TIGHT });
    const rect = first_by_tag(editor, "rect");
    const circle = first_by_tag(editor, "circle");
    editor.commands.select([rect, circle]);
    editor.commands.set_mode("edit-content");
    const original = editor.serialize();
    expect(editor.commands.invoke("selection.group")).toBe(false);
    expect(editor.serialize()).toBe(original);
  });

  it("returns true in select mode (drives commands.group)", () => {
    const editor = createSvgEditor({ svg: TWO_TIGHT });
    const rect = first_by_tag(editor, "rect");
    const circle = first_by_tag(editor, "circle");
    editor.commands.select([rect, circle]);
    expect(editor.commands.invoke("selection.group")).toBe(true);
    expect(editor.tree().nodes.get(editor.state.selection[0])!.tag).toBe("g");
  });
});
