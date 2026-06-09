// Headless tests for `editor.commands.ungroup()` + the `selection.ungroup`
// keymap registry handler. These tests ARE the spec for the safe
// clean-structural ungroup subset (TODO §10 / docs/grouping.md §Ungrouping):
// each `it(...)` name states the rule in plain language; the body proves it.
//
// Ungrouping is NOT the inverse of grouping when the group carries visual /
// cascade / reference state. The package ships only the conservative subset:
// a plain structural `<g>` (optionally with a bakeable transform), with at
// least one child, not in <defs>, not <use>-referenced, not animation-bearing.
// Everything else is refused — no mutation, no history.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";
import type { NodeId } from "../src/types";

function ids_by_tag(editor: ReturnType<typeof createSvgEditor>, tag: string) {
  return [...editor.tree().nodes.values()]
    .filter((n) => n.tag === tag)
    .map((n) => n.id);
}

function first_by_tag(editor: ReturnType<typeof createSvgEditor>, tag: string) {
  return ids_by_tag(editor, tag)[0];
}

/** A plain structural group wrapping a rect + circle, no group attrs. */
const PLAIN_GROUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/><g><circle cx="20" cy="20" r="5"/><ellipse cx="40" cy="40" rx="5" ry="3"/></g><line x1="0" y1="0" x2="9" y2="9"/></svg>`;

/** Group carries a transform; one child has its own transform, one doesn't. */
const GROUP_WITH_TRANSFORM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(10 20)"><rect x="0" y="0" width="10" height="10" transform="rotate(5)"/><circle cx="20" cy="20" r="5"/></g></svg>`;

/** Select the single `<g>` in `svg` and return the editor + the group id. */
function setup_group(svg: string) {
  const editor = createSvgEditor({ svg });
  const group = first_by_tag(editor, "g");
  editor.commands.select(group);
  return { editor, group };
}

/** A group with one extra own attribute beyond the allowlist. */
function group_with_attr(attr: string, value: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g ${attr}="${value}"><rect x="0" y="0" width="10" height="10"/><circle cx="20" cy="20" r="5"/></g></svg>`;
}

describe("commands.ungroup — happy path (clean structural group)", () => {
  it("ungroups a plain structural group, hoisting children into the parent at the group's z-position in order", () => {
    const { editor } = setup_group(PLAIN_GROUP);
    const root = editor.tree().root;
    const rect = first_by_tag(editor, "rect");
    const circle = first_by_tag(editor, "circle");
    const ellipse = first_by_tag(editor, "ellipse");
    const line = first_by_tag(editor, "line");

    expect(editor.commands.ungroup()).toBe(true);

    // The group is gone…
    expect(ids_by_tag(editor, "g").length).toBe(0);
    // …and its children landed at the group's slot, in order, between
    // the leading <rect> and the trailing <line>.
    expect(editor.document.element_children_of(root)).toEqual([
      rect,
      circle,
      ellipse,
      line,
    ]);
    // Each hoisted child's parent is now the root.
    expect(editor.document.parent_of(circle)).toBe(root);
    expect(editor.document.parent_of(ellipse)).toBe(root);
  });

  it("preserves child geometry untouched when the group has no transform", () => {
    const { editor } = setup_group(PLAIN_GROUP);
    expect(editor.commands.ungroup()).toBe(true);
    expect(editor.serialize()).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/><circle cx="20" cy="20" r="5"/><ellipse cx="40" cy="40" rx="5" ry="3"/><line x1="0" y1="0" x2="9" y2="9"/></svg>`
    );
  });

  it("accepts an explicit opts.id even when the selection is elsewhere", () => {
    const editor = createSvgEditor({ svg: PLAIN_GROUP });
    const group = first_by_tag(editor, "g");
    const rect = first_by_tag(editor, "rect");
    editor.commands.select(rect); // selection is NOT the group
    expect(editor.commands.ungroup({ id: group })).toBe(true);
    expect(ids_by_tag(editor, "g").length).toBe(0);
  });
});

describe("commands.ungroup — transform baking", () => {
  it("bakes a group transform into each child, prepending the group's ops", () => {
    const { editor } = setup_group(GROUP_WITH_TRANSFORM);
    const rect = first_by_tag(editor, "rect"); // had transform="rotate(5)"
    const circle = first_by_tag(editor, "circle"); // had no transform

    expect(editor.commands.ungroup()).toBe(true);

    // Child with an existing transform: group ops PREPENDED to child ops.
    expect(editor.document.get_attr(rect, "transform")).toBe(
      "translate(10 20) rotate(5 0 0)"
    );
    // Child with no transform: gets the group's transform verbatim
    // (canonical emit form).
    expect(editor.document.get_attr(circle, "transform")).toBe(
      "translate(10 20)"
    );
  });

  it("composes ops as a token list, not a collapsed matrix", () => {
    const { editor } = setup_group(GROUP_WITH_TRANSFORM);
    const circle = first_by_tag(editor, "circle");
    editor.commands.ungroup();
    // The baked value is human-readable translate(...), never matrix(...).
    expect(editor.document.get_attr(circle, "transform")).not.toContain(
      "matrix"
    );
  });
});

describe("commands.ungroup — refuses visual state", () => {
  // Each of these own-attributes carries visual / cascade / inheritance
  // state that is NOT generally equivalent to the per-child result of
  // removing the group. Ungroup must refuse — return false, mutate nothing.
  const cases: ReadonlyArray<[string, string]> = [
    ["opacity", "0.5"],
    ["class", "highlight"],
    ["style", "opacity:0.5"],
    ["filter", "url(#f)"],
    ["clip-path", "url(#c)"],
    ["mask", "url(#m)"],
    ["fill", "red"],
  ];

  for (const [attr, value] of cases) {
    it(`refuses a group carrying visual state (${attr})`, () => {
      const editor = createSvgEditor({ svg: group_with_attr(attr, value) });
      const group = first_by_tag(editor, "g");
      editor.commands.select(group);
      const original = editor.serialize();
      const can_undo_before = editor.state.can_undo;
      const version_before = editor.state.version;

      expect(editor.commands.ungroup()).toBe(false);
      expect(editor.serialize()).toBe(original);
      expect(editor.state.can_undo).toBe(can_undo_before);
      expect(editor.state.version).toBe(version_before);
    });
  }
});

describe("commands.ungroup — refuses out-of-scope structure", () => {
  it("refuses a group inside <defs>", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><g><rect x="0" y="0" width="10" height="10"/></g></defs></svg>`;
    const editor = createSvgEditor({ svg });
    const group = first_by_tag(editor, "g");
    editor.commands.select(group);
    const original = editor.serialize();
    expect(editor.commands.ungroup()).toBe(false);
    expect(editor.serialize()).toBe(original);
  });

  it("refuses a group referenced by <use>", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g id="grp"><rect x="0" y="0" width="10" height="10"/></g><use href="#grp"/></svg>`;
    const editor = createSvgEditor({ svg });
    const group = first_by_tag(editor, "g");
    editor.commands.select(group);
    const original = editor.serialize();
    expect(editor.commands.ungroup()).toBe(false);
    expect(editor.serialize()).toBe(original);
  });

  it("refuses a group referenced by <use xlink:href> (legacy namespace)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"><g id="grp"><rect x="0" y="0" width="10" height="10"/></g><use xlink:href="#grp"/></svg>`;
    const editor = createSvgEditor({ svg });
    const group = first_by_tag(editor, "g");
    editor.commands.select(group);
    const original = editor.serialize();
    expect(editor.commands.ungroup()).toBe(false);
    expect(editor.serialize()).toBe(original);
  });

  it("refuses a group with a direct animation child", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2s"/><rect x="0" y="0" width="10" height="10"/></g></svg>`;
    const editor = createSvgEditor({ svg });
    const group = first_by_tag(editor, "g");
    editor.commands.select(group);
    const original = editor.serialize();
    expect(editor.commands.ungroup()).toBe(false);
    expect(editor.serialize()).toBe(original);
  });

  it("refuses an empty group (no element children)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g></g></svg>`;
    const editor = createSvgEditor({ svg });
    const group = first_by_tag(editor, "g");
    editor.commands.select(group);
    const original = editor.serialize();
    expect(editor.commands.ungroup()).toBe(false);
    expect(editor.serialize()).toBe(original);
  });

  it("ALLOWS a group that carries only a plain id (no <use> references it)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g id="grp"><rect x="0" y="0" width="10" height="10"/></g></svg>`;
    const editor = createSvgEditor({ svg });
    const group = first_by_tag(editor, "g");
    editor.commands.select(group);
    expect(editor.commands.ungroup()).toBe(true);
    expect(ids_by_tag(editor, "g").length).toBe(0);
  });
});

describe("commands.ungroup — single-<g> selection gate", () => {
  it("refuses when the selection is not a single <g> (a non-group node)", () => {
    const editor = createSvgEditor({ svg: PLAIN_GROUP });
    const rect = first_by_tag(editor, "rect");
    editor.commands.select(rect);
    const original = editor.serialize();
    expect(editor.commands.ungroup()).toBe(false);
    expect(editor.serialize()).toBe(original);
  });

  it("refuses when the selection is multiple nodes", () => {
    const editor = createSvgEditor({ svg: PLAIN_GROUP });
    const rect = first_by_tag(editor, "rect");
    const group = first_by_tag(editor, "g");
    editor.commands.select([rect, group]);
    const original = editor.serialize();
    expect(editor.commands.ungroup()).toBe(false);
    expect(editor.serialize()).toBe(original);
  });

  it("refuses on an empty selection", () => {
    const editor = createSvgEditor({ svg: PLAIN_GROUP });
    const original = editor.serialize();
    expect(editor.commands.ungroup()).toBe(false);
    expect(editor.serialize()).toBe(original);
  });
});

describe("commands.ungroup — history (one atomic step)", () => {
  it("is one atomic history step — undo restores the group, its children, and their transforms byte-equal", () => {
    const { editor } = setup_group(GROUP_WITH_TRANSFORM);
    editor.commands.ungroup();
    editor.commands.undo();
    // Byte-equal: the group, its transform, and every child transform
    // (including the rect's pre-existing rotate and the circle's absence)
    // are restored exactly.
    expect(editor.serialize()).toBe(GROUP_WITH_TRANSFORM);
  });

  it("undo restores a plain group byte-equal (tight input)", () => {
    const TIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g><circle cx="20" cy="20" r="5"/><ellipse cx="40" cy="40" rx="5" ry="3"/></g></svg>`;
    const { editor } = setup_group(TIGHT);
    editor.commands.ungroup();
    editor.commands.undo();
    expect(editor.serialize()).toBe(TIGHT);
  });

  it("redo restores the ungrouped state exactly", () => {
    const { editor } = setup_group(PLAIN_GROUP);
    editor.commands.ungroup();
    const ungrouped = editor.serialize();
    editor.commands.undo();
    editor.commands.redo();
    expect(editor.serialize()).toBe(ungrouped);
  });

  it("bumps structure_version on ungroup and again on undo", () => {
    const { editor } = setup_group(PLAIN_GROUP);
    const v0 = editor.state.structure_version;
    editor.commands.ungroup();
    const v1 = editor.state.structure_version;
    expect(v1).toBeGreaterThan(v0);
    editor.commands.undo();
    expect(editor.state.structure_version).toBeGreaterThan(v1);
  });
});

describe("commands.ungroup — selection", () => {
  it("selects the former children after ungrouping", () => {
    const { editor } = setup_group(PLAIN_GROUP);
    const circle = first_by_tag(editor, "circle");
    const ellipse = first_by_tag(editor, "ellipse");
    expect(editor.commands.ungroup()).toBe(true);
    expect([...editor.state.selection].sort()).toEqual(
      [circle, ellipse].sort()
    );
  });

  it("restores the original selection (the group) on undo", () => {
    const { editor, group } = setup_group(PLAIN_GROUP);
    editor.commands.ungroup();
    editor.commands.undo();
    expect(editor.state.selection).toEqual([group]);
  });
});

describe("commands.ungroup — registry handler", () => {
  it("returns false in edit-content mode", () => {
    const { editor } = setup_group(PLAIN_GROUP);
    editor.commands.set_mode("edit-content");
    const original = editor.serialize();
    expect(editor.commands.invoke("selection.ungroup")).toBe(false);
    expect(editor.serialize()).toBe(original);
  });

  it("returns true in select mode (drives commands.ungroup)", () => {
    const { editor } = setup_group(PLAIN_GROUP);
    expect(editor.commands.invoke("selection.ungroup")).toBe(true);
    expect(ids_by_tag(editor, "g").length).toBe(0);
  });

  it("returns false (no-op) for a stateful group via the registry", () => {
    const editor = createSvgEditor({ svg: group_with_attr("opacity", "0.5") });
    const group = first_by_tag(editor, "g") as NodeId;
    editor.commands.select(group);
    const original = editor.serialize();
    expect(editor.commands.invoke("selection.ungroup")).toBe(false);
    expect(editor.serialize()).toBe(original);
  });
});
