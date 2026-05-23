// Integration test for default keymap bindings.
//
// Exercises every binding declared in `src/keymap/defaults.ts` end-to-end:
// construct an editor → select a node → dispatch a synthetic KeyboardEvent
// through `editor.keymap.dispatch()` → assert the observable state change.

import { describe, expect, it } from "vitest";
import { getKeyboardOS } from "@grida/keybinding";
import { createSvgEditor } from "../src/index";
import { createSvgEditorWithInternals } from "./_helpers";

// "Mod" is Meta on Mac, Ctrl elsewhere — match the keymap's platform
// resolution so these tests pass under both local macOS and Linux CI.
const MOD_IS_META = getKeyboardOS() === "mac";

const NESTED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g id="outer">
    <g id="inner">
      <rect id="a" x="10" y="20" width="30" height="40" fill="red"/>
      <rect id="b" x="50" y="60" width="20" height="20" fill="blue"/>
      <rect id="c" x="80" y="80" width="5" height="5" fill="green"/>
    </g>
  </g>
</svg>`;

function mkEvent(opts: {
  code: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): KeyboardEvent {
  let prevented = false;
  return {
    code: opts.code,
    metaKey: !!opts.metaKey,
    ctrlKey: !!opts.ctrlKey,
    shiftKey: !!opts.shiftKey,
    altKey: !!opts.altKey,
    preventDefault: () => {
      prevented = true;
    },
    get defaultPrevented() {
      return prevented;
    },
  } as unknown as KeyboardEvent;
}

function findByElementId(
  editor: ReturnType<typeof createSvgEditor>,
  id: string
): string {
  const found = [...editor.tree().nodes.values()].find((n) => n.name === id);
  if (!found) throw new Error(`no node with element id "${id}"`);
  return found.id;
}

describe("default keymap — hierarchy.enter / hierarchy.exit", () => {
  it("Enter drills into the first child of a group", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const outer = findByElementId(editor, "outer");
    editor.commands.select(outer);
    const handled = editor.keymap.dispatch(mkEvent({ code: "Enter" }));
    expect(handled).toBe(true);
    expect(editor.state.selection.length).toBe(1);
    // first child of #outer is #inner
    const sel = editor.state.selection[0];
    expect(editor.tree().nodes.get(sel)?.name).toBe("inner");
  });

  it("Enter returns false on a leaf (rect with no children)", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const a = findByElementId(editor, "a");
    editor.commands.select(a);
    const handled = editor.keymap.dispatch(mkEvent({ code: "Enter" }));
    expect(handled).toBe(false);
    expect(editor.state.selection).toEqual([a]);
  });

  it("Shift+Enter selects the parent of the selected node", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const a = findByElementId(editor, "a");
    editor.commands.select(a);
    const handled = editor.keymap.dispatch(
      mkEvent({ code: "Enter", shiftKey: true })
    );
    expect(handled).toBe(true);
    expect(editor.state.selection.length).toBe(1);
    expect(editor.tree().nodes.get(editor.state.selection[0])?.name).toBe(
      "inner"
    );
  });

  it("Shift+Enter returns false at the top of the tree (parent is doc root)", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const outer = findByElementId(editor, "outer");
    editor.commands.select(outer);
    const handled = editor.keymap.dispatch(
      mkEvent({ code: "Enter", shiftKey: true })
    );
    expect(handled).toBe(false);
    expect(editor.state.selection).toEqual([outer]);
  });
});

describe("default keymap — transform.nudge (arrows / shift+arrows)", () => {
  function rectAttr(
    editor: ReturnType<typeof createSvgEditor>,
    id: string,
    name: "x" | "y"
  ): number {
    const v = editor.document.get_attr(id, name);
    return v === null ? 0 : parseFloat(v);
  }

  it("ArrowRight nudges +1 in x", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const a = findByElementId(editor, "a");
    editor.commands.select(a);
    const x0 = rectAttr(editor, a, "x");
    expect(editor.keymap.dispatch(mkEvent({ code: "ArrowRight" }))).toBe(true);
    expect(rectAttr(editor, a, "x")).toBe(x0 + 1);
  });

  it("ArrowLeft nudges -1 in x", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const a = findByElementId(editor, "a");
    editor.commands.select(a);
    const x0 = rectAttr(editor, a, "x");
    expect(editor.keymap.dispatch(mkEvent({ code: "ArrowLeft" }))).toBe(true);
    expect(rectAttr(editor, a, "x")).toBe(x0 - 1);
  });

  it("ArrowDown nudges +1 in y", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const a = findByElementId(editor, "a");
    editor.commands.select(a);
    const y0 = rectAttr(editor, a, "y");
    expect(editor.keymap.dispatch(mkEvent({ code: "ArrowDown" }))).toBe(true);
    expect(rectAttr(editor, a, "y")).toBe(y0 + 1);
  });

  it("ArrowUp nudges -1 in y", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const a = findByElementId(editor, "a");
    editor.commands.select(a);
    const y0 = rectAttr(editor, a, "y");
    expect(editor.keymap.dispatch(mkEvent({ code: "ArrowUp" }))).toBe(true);
    expect(rectAttr(editor, a, "y")).toBe(y0 - 1);
  });

  it("Shift+ArrowRight nudges +10 in x", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const a = findByElementId(editor, "a");
    editor.commands.select(a);
    const x0 = rectAttr(editor, a, "x");
    expect(
      editor.keymap.dispatch(mkEvent({ code: "ArrowRight", shiftKey: true }))
    ).toBe(true);
    expect(rectAttr(editor, a, "x")).toBe(x0 + 10);
  });

  it("nudge returns false with empty selection", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    expect(editor.keymap.dispatch(mkEvent({ code: "ArrowRight" }))).toBe(false);
  });
});

describe("default keymap — reorder ([ / ] / Mod+[ / Mod+])", () => {
  function childOrder(
    editor: ReturnType<typeof createSvgEditor>,
    parentName: string
  ): string[] {
    const tree = editor.tree();
    const parent = [...tree.nodes.values()].find((n) => n.name === parentName)!;
    return parent.children.map((id) => tree.nodes.get(id)?.name ?? "unknown");
  }

  it("] brings the selection to the front", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const a = findByElementId(editor, "a");
    editor.commands.select(a);
    expect(childOrder(editor, "inner")).toEqual(["a", "b", "c"]);
    expect(editor.keymap.dispatch(mkEvent({ code: "BracketRight" }))).toBe(
      true
    );
    expect(childOrder(editor, "inner")).toEqual(["b", "c", "a"]);
  });

  it("[ sends the selection to the back", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const c = findByElementId(editor, "c");
    editor.commands.select(c);
    expect(editor.keymap.dispatch(mkEvent({ code: "BracketLeft" }))).toBe(true);
    expect(childOrder(editor, "inner")).toEqual(["c", "a", "b"]);
  });

  it("Mod+] moves the selection forward by one", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const a = findByElementId(editor, "a");
    editor.commands.select(a);
    expect(
      editor.keymap.dispatch(
        mkEvent({
          code: "BracketRight",
          ...(MOD_IS_META ? { metaKey: true } : { ctrlKey: true }),
        })
      )
    ).toBe(true);
    expect(childOrder(editor, "inner")).toEqual(["b", "a", "c"]);
  });

  it("Mod+[ moves the selection backward by one", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const c = findByElementId(editor, "c");
    editor.commands.select(c);
    expect(
      editor.keymap.dispatch(
        mkEvent({
          code: "BracketLeft",
          ...(MOD_IS_META ? { metaKey: true } : { ctrlKey: true }),
        })
      )
    ).toBe(true);
    expect(childOrder(editor, "inner")).toEqual(["a", "c", "b"]);
  });

  it("reorder returns false with multi-selection", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const a = findByElementId(editor, "a");
    const b = findByElementId(editor, "b");
    editor.commands.select([a, b]);
    expect(editor.keymap.dispatch(mkEvent({ code: "BracketRight" }))).toBe(
      false
    );
  });
});

describe("default keymap — claim vs consume (preventDefault contract)", () => {
  // The host calls preventDefault on CLAIM, not on consume. So an
  // advertised shortcut like Cmd+G never falls through to the browser
  // (find-next, save, print, …) regardless of whether the bound
  // handler accepted or rejected. These tests pin that contract.

  it("Cmd+G claims even with no selection (no find bar fall-through)", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    expect(editor.state.selection).toEqual([]);
    const e = mkEvent({
      code: "KeyG",
      ...(MOD_IS_META ? { metaKey: true } : { ctrlKey: true }),
    });
    expect(editor.keymap.claims(e)).toBe(true);
    expect(editor.keymap.dispatch(e)).toBe(false);
  });

  it("Cmd+G claims AND consumes with a valid selection", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const a = findByElementId(editor, "a");
    const b = findByElementId(editor, "b");
    editor.commands.select([a, b]);
    const e = mkEvent({
      code: "KeyG",
      ...(MOD_IS_META ? { metaKey: true } : { ctrlKey: true }),
    });
    expect(editor.keymap.claims(e)).toBe(true);
    expect(editor.keymap.dispatch(e)).toBe(true);
  });

  it("Cmd+G claims when handler rejects (single non-wrappable tag)", () => {
    // Selecting a single rect is wrappable in our policy, so reach for a
    // case that does reject: tspan-style — but the fixture here is
    // simpler with Cmd+G + a cross-parent selection.
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    const a = findByElementId(editor, "a"); // inside #inner
    const outer = findByElementId(editor, "outer"); // parent of #inner
    editor.commands.select([a, outer]); // cross-parent → policy reject
    const e = mkEvent({
      code: "KeyG",
      ...(MOD_IS_META ? { metaKey: true } : { ctrlKey: true }),
    });
    expect(editor.keymap.claims(e)).toBe(true);
    expect(editor.keymap.dispatch(e)).toBe(false);
  });

  it("unmapped chord (Cmd+Y on its own — only Y is bound to redo) does not claim", () => {
    const editor = createSvgEditorWithInternals({ svg: NESTED });
    // KeyY without modifier — no binding exists.
    const e = mkEvent({ code: "KeyY" });
    expect(editor.keymap.claims(e)).toBe(false);
  });
});
