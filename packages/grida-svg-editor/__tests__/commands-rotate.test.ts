// `commands.rotate` / `rotate_to` / `flatten_transform` integration tests.
// Exercises the editor-level RPC path end-to-end (capture, apply, history
// step, refusal-aware return value).

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";

const DEG = Math.PI / 180;

function with_rect(extra = "") {
  const editor = createSvgEditor({
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="10" height="10"${extra ? " " + extra : ""}/>` +
      `</svg>`,
  });
  const tree = editor.tree();
  const id = [...tree.nodes.values()].find((n) => n.tag === "rect")!.id;
  return { editor, id };
}

describe("commands.rotate", () => {
  it("rotates a single rect around an explicit pivot", () => {
    const { editor, id } = with_rect();
    expect(
      editor.commands.rotate(30 * DEG, { ids: [id], pivot: { x: 5, y: 5 } })
    ).toBe(true);
    // editor.document is the live IR.
    expect(editor.document.get_attr(id, "transform")).toBe("rotate(30 5 5)");
  });

  it("refuses (returns false) when the element has a non-trivial transform", () => {
    const { editor, id } = with_rect('transform="matrix(1 0 0 1 5 5)"');
    expect(
      editor.commands.rotate(30 * DEG, { ids: [id], pivot: { x: 5, y: 5 } })
    ).toBe(false);
    // Transform is unchanged — refuse-and-surface is honored.
    expect(editor.document.get_attr(id, "transform")).toBe(
      "matrix(1 0 0 1 5 5)"
    );
  });

  it("refuses for <text rotate=…>", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="0" rotate="30 60 90">hi</text></svg>`,
    });
    const id = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "text"
    )!.id;
    expect(
      editor.commands.rotate(15 * DEG, { ids: [id], pivot: { x: 0, y: 0 } })
    ).toBe(false);
  });

  it("undoes as a single history step (rotated → identity-restored)", () => {
    const { editor, id } = with_rect();
    editor.commands.rotate(30 * DEG, { ids: [id], pivot: { x: 5, y: 5 } });
    expect(editor.state.can_undo).toBe(true);
    editor.commands.undo();
    // Identity restore: no rotation existed before; revert removes the
    // transform attribute byte-equal.
    expect(editor.document.get_attr(id, "transform")).toBeNull();
  });
});

describe("commands.rotate_to", () => {
  it("sets absolute rotation from baseline", () => {
    const { editor, id } = with_rect();
    editor.commands.rotate_to(45 * DEG, { ids: [id], pivot: { x: 5, y: 5 } });
    expect(editor.document.get_attr(id, "transform")).toBe("rotate(45 5 5)");
  });

  it("computes delta from a pre-existing rotation", () => {
    const { editor, id } = with_rect('transform="rotate(30 5 5)"');
    // rotate_to(90°) should land at rotate(90 ...) regardless of starting rotation.
    editor.commands.rotate_to(90 * DEG, { ids: [id], pivot: { x: 5, y: 5 } });
    expect(editor.document.get_attr(id, "transform")).toBe("rotate(90 5 5)");
  });
});

describe("commands.flatten_transform", () => {
  it("collapses a translate+rotate transform to a single matrix", () => {
    const { editor, id } = with_rect(
      'transform="translate(10 0) rotate(90 0 0)"'
    );
    expect(editor.commands.flatten_transform({ ids: [id] })).toBe(true);
    // matrix should match: T(10,0) * R(90,0,0). R(90)=[0,1,-1,0,0,0]; T*R=
    // [0,1,-1,0,10,0]
    const t = editor.document.get_attr(id, "transform");
    expect(t).toMatch(/^matrix\(/);
  });

  it("does NOT make the element rotatable again (matrix classifies as mixed)", () => {
    const { editor, id } = with_rect(
      'transform="translate(10 0) rotate(90 0 0)"'
    );
    editor.commands.flatten_transform({ ids: [id] });
    // After flatten, rotate should still refuse (matrix is "mixed").
    expect(
      editor.commands.rotate(15 * DEG, { ids: [id], pivot: { x: 5, y: 5 } })
    ).toBe(false);
  });

  it("returns false when nothing flattens (no transform / already matrix)", () => {
    const { editor, id } = with_rect();
    expect(editor.commands.flatten_transform({ ids: [id] })).toBe(false);

    const { editor: e2, id: id2 } = with_rect(
      'transform="matrix(1 0 0 1 5 5)"'
    );
    expect(e2.commands.flatten_transform({ ids: [id2] })).toBe(false);
  });

  it("is reversible — undo restores the original transform string", () => {
    const original = "translate(10 0) rotate(90 0 0)";
    const { editor, id } = with_rect(`transform="${original}"`);
    editor.commands.flatten_transform({ ids: [id] });
    editor.commands.undo();
    expect(editor.document.get_attr(id, "transform")).toBe(original);
  });
});

describe("command registry — selection.rotate / .rotate_to / .flatten_transform", () => {
  it("dispatches selection.rotate end-to-end", () => {
    const { editor, id } = with_rect();
    editor.commands.select(id);
    const ok = editor.commands.invoke("selection.rotate", {
      angle: 30 * DEG,
      pivot: { x: 5, y: 5 },
    });
    expect(ok).toBe(true);
    expect(editor.document.get_attr(id, "transform")).toBe("rotate(30 5 5)");
  });

  it("dispatches selection.rotate_to end-to-end", () => {
    const { editor, id } = with_rect();
    editor.commands.select(id);
    const ok = editor.commands.invoke("selection.rotate_to", {
      angle: 60 * DEG,
      pivot: { x: 5, y: 5 },
    });
    expect(ok).toBe(true);
    expect(editor.document.get_attr(id, "transform")).toBe("rotate(60 5 5)");
  });

  it("dispatches selection.flatten_transform end-to-end", () => {
    const { editor, id } = with_rect('transform="translate(10 0) rotate(90)"');
    editor.commands.select(id);
    const ok = editor.commands.invoke("selection.flatten_transform");
    expect(ok).toBe(true);
    expect(editor.document.get_attr(id, "transform")).toMatch(/^matrix\(/);
  });

  it("selection.rotate refuses (returns false) when target has matrix transform", () => {
    const { editor, id } = with_rect('transform="matrix(1 0 0 1 5 5)"');
    editor.commands.select(id);
    const ok = editor.commands.invoke("selection.rotate", {
      angle: 30 * DEG,
      pivot: { x: 5, y: 5 },
    });
    expect(ok).toBe(false);
  });
});
