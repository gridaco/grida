// Headless integration test of the public API.
//
// Constructs an editor without attaching a surface, then drives it end-to-end:
// load → select → read properties → set_paint → preview/commit → undo →
// redo → serialize. Proves the headless editor works without DOM.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";
import type { SvgEditorInternal } from "../src/core/editor";
import type { PickEvent } from "../src/types";

const TRIVIAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="50" height="40" fill="red"/></svg>`;

describe("createSvgEditor (headless)", () => {
  it("constructs without a surface and exposes initial state", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    expect(editor.state.selection).toEqual([]);
    expect(editor.state.mode).toBe("select");
    expect(editor.state.can_undo).toBe(false);
    expect(editor.state.dirty).toBe(false);
  });

  it("subscribes to state changes via subscribe()", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const seen: number[] = [];
    editor.subscribe((s) => seen.push(s.version));
    editor.commands.select(editor.tree().nodes.keys().next().value!);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("reads typed paint via node_paint — declared verbatim, computed canonicalized to hex", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;
    const fill = editor.node_paint(rect.id, "fill");
    expect(fill.declared).toBe("red");
    expect(fill.computed).toEqual({
      kind: "color",
      value: { kind: "rgb", value: "#ff0000" },
    });
    expect(fill.provenance.carrier).toBe("presentation_attribute");
  });

  it("set_paint records a single undo step", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;
    editor.commands.select(rect.id);
    editor.commands.set_paint("fill", {
      kind: "color",
      value: { kind: "rgb", value: "blue" },
    });
    expect(editor.node_paint(rect.id, "fill").declared).toBe("blue");
    expect(editor.state.can_undo).toBe(true);
    editor.commands.undo();
    expect(editor.node_paint(rect.id, "fill").declared).toBe("red");
    editor.commands.redo();
    expect(editor.node_paint(rect.id, "fill").declared).toBe("blue");
  });

  it("preview_paint commits a single undo step after multiple updates", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;
    editor.commands.select(rect.id);
    const session = editor.commands.preview_paint("fill");
    session.update({ kind: "color", value: { kind: "rgb", value: "#111111" } });
    session.update({ kind: "color", value: { kind: "rgb", value: "#222222" } });
    session.update({ kind: "color", value: { kind: "rgb", value: "#333333" } });
    session.commit();
    expect(editor.node_paint(rect.id, "fill").declared).toBe("#333333");
    editor.commands.undo();
    expect(editor.node_paint(rect.id, "fill").declared).toBe("red");
  });

  it("preview_paint discard reverts without touching history", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;
    editor.commands.select(rect.id);
    const session = editor.commands.preview_paint("fill");
    session.update({ kind: "color", value: { kind: "rgb", value: "#aaa" } });
    session.discard();
    expect(editor.node_paint(rect.id, "fill").declared).toBe("red");
    expect(editor.state.can_undo).toBe(false);
  });

  it("node_properties handles unknown attribute names with generic string", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;
    const result = editor.node_properties(rect.id, [
      "width",
      "data-foo",
      "fill",
    ]);
    expect(result.width.declared).toBe("50");
    expect(result.width.computed).toBe(50);
    expect(result["data-foo"].declared).toBe(null);
    expect(result.fill.declared).toBe("red");
  });

  it("serializes byte-equal after load with no edits", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    expect(editor.serialize()).toBe(TRIVIAL);
  });

  it("emits dirty after a mutation", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;
    editor.commands.select(rect.id);
    expect(editor.state.dirty).toBe(false);
    editor.commands.set_paint("fill", {
      kind: "color",
      value: { kind: "rgb", value: "green" },
    });
    expect(editor.state.dirty).toBe(true);
  });

  it("reset() reverts to original source", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;
    editor.commands.select(rect.id);
    editor.commands.set_paint("fill", {
      kind: "color",
      value: { kind: "rgb", value: "green" },
    });
    editor.reset();
    expect(editor.serialize()).toBe(TRIVIAL);
    expect(editor.state.can_undo).toBe(false);
  });
});

describe("pick channel (subscribe_pick)", () => {
  // A pick is a transient tap outcome the surface pushes in. It is observed
  // through its own channel — deliberately separate from selection and from
  // the EditorState snapshot stream, so a pointer-rate tap never forces a
  // full state re-render and never mutates selection.
  function internal(editor: ReturnType<typeof createSvgEditor>) {
    return (editor as unknown as SvgEditorInternal)._internal;
  }

  const PICK: PickEvent = {
    point: { x: 12, y: 34 },
    node_id: "n1",
    button: "primary",
    mods: { shift: false, alt: false, meta: false, ctrl: false },
  };

  it("push_pick notifies subscribers with the point, node id and button", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const seen: PickEvent[] = [];
    const unsub = editor.subscribe_pick((e) => seen.push(e));

    internal(editor).push_pick(PICK);
    expect(seen).toEqual([PICK]);

    // unsubscribe stops delivery
    unsub();
    internal(editor).push_pick({ ...PICK, node_id: null });
    expect(seen).toEqual([PICK]);
  });

  it("an empty-canvas tap reports node_id null", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const seen: PickEvent[] = [];
    editor.subscribe_pick((e) => seen.push(e));
    internal(editor).push_pick({ ...PICK, node_id: null });
    expect(seen).toHaveLength(1);
    expect(seen[0].node_id).toBeNull();
  });

  it("a pick does NOT bump state.version (separate from the snapshot stream)", () => {
    const editor = createSvgEditor({ svg: TRIVIAL });
    const versions: number[] = [];
    editor.subscribe((s) => versions.push(s.version));
    const before = editor.state.version;
    internal(editor).push_pick(PICK);
    expect(versions).toEqual([]); // no state emission fired
    expect(editor.state.version).toBe(before);
  });
});
