// `Enter` is a second trigger for content-edit, on par with double-click.
//
// dblclick enters content-edit via the HUD's `enter_content_edit` intent
// (dom.ts:commit_intent → editor.enter_content_edit). This pins the KEYBOARD
// half: `Enter` is a chained keymap binding (`content.enter`) that calls the
// same `editor.enter_content_edit()`, registered AHEAD of `hierarchy.enter`
// so it preempts on an editable node and falls through to hierarchy descent
// on a container.
//
// Tests dispatch against the real `editor.keymap` (wired by createSvgEditor
// with the default commands + DEFAULT_BINDINGS), so they also lock the
// binding-registration ORDER that gives `content.enter` precedence. The
// content-edit driver is a host/surface concern (null in headless), so we
// stub it via `_internal.set_content_edit_driver` to observe what node the
// editor would route into edit.

import { describe, expect, it } from "vitest";
import type { Keymap } from "../src/keymap/keymap";
import { createSvgEditor } from "../src/index";

// `<line>` is deliberately omitted: is_vector_edit_target rejects it in v1
// (document.ts), so the vector node MUST be a <path>/<polyline>/<polygon>.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <text id="t" x="10" y="20">hi</text>
  <path id="p" d="M0 0 L10 10"/>
  <g id="g"><rect id="c" x="0" y="0" width="10" height="10"/></g>
</svg>`;

function mkEnter(): KeyboardEvent {
  return {
    code: "Enter",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
}

type Internal = { set_content_edit_driver: (fn: unknown) => void };

// The document re-ids nodes on load (author `id=""` is a plain attribute,
// not the internal NodeId), so resolve the nodes we select by tag.
function idsByTag(editor: ReturnType<typeof createSvgEditor>) {
  const tree = editor.tree();
  const byTag: Record<string, string> = {};
  for (const [id, node] of tree.nodes) {
    byTag[node.tag] = id;
  }
  return byTag;
}

function setup() {
  const editor = createSvgEditor({ svg: SVG });
  let driven: string | null = null;
  (
    editor as unknown as { _internal: Internal }
  )._internal.set_content_edit_driver((id: string) => {
    driven = id;
    return true;
  });
  const keymap = (editor as unknown as { keymap: Keymap }).keymap;
  return { editor, keymap, ids: idsByTag(editor), driven: () => driven };
}

describe("Enter → content-edit (parity with double-click)", () => {
  it("Enter enters content-edit on a selected text node", () => {
    const { editor, keymap, ids, driven } = setup();
    editor.commands.select(ids.text);
    expect(keymap.dispatch(mkEnter())).toBe(true);
    expect(driven()).toBe(ids.text);
  });

  it("Enter enters content-edit on a selected path node", () => {
    const { editor, keymap, ids, driven } = setup();
    editor.commands.select(ids.path);
    expect(keymap.dispatch(mkEnter())).toBe(true);
    expect(driven()).toBe(ids.path);
  });

  it("Enter on a container descends the hierarchy instead of editing", () => {
    // `content.enter` declines (a <g> is neither text nor vector target), so
    // the chain falls through to `hierarchy.enter`, which selects the first
    // child. Locks chain precedence AND the no-regression of the old binding.
    const { editor, keymap, ids, driven } = setup();
    editor.commands.select(ids.g);
    expect(keymap.dispatch(mkEnter())).toBe(true);
    expect(driven()).toBe(null);
    expect(editor.state.selection).toEqual([ids.rect]);
  });

  it("Enter is a no-op with zero selection", () => {
    const { editor, keymap, driven } = setup();
    editor.commands.deselect();
    expect(keymap.dispatch(mkEnter())).toBe(false);
    expect(driven()).toBe(null);
    expect(editor.state.selection).toEqual([]);
  });

  it("Enter is a no-op with multiple selection", () => {
    const { editor, keymap, ids, driven } = setup();
    editor.commands.select([ids.text, ids.path]);
    expect(keymap.dispatch(mkEnter())).toBe(false);
    expect(driven()).toBe(null);
    expect(editor.state.selection).toEqual([ids.text, ids.path]);
  });
});
