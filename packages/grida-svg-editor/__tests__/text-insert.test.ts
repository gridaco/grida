// Empty-equals-delete + history bracketing for the click-to-place text tool.
//
// These pin the CORE half of the rule — `insert_text_preview` — which the DOM
// shell's `finalize_text_exit` drives on content-edit exit. The shell
// orchestration (Enter -> onCommit -> finalize) needs a DOM and is verified
// manually; the undo/redo semantics that actually matter live here and run
// headlessly. Design: docs/wg/feat-svg-editor/text-tool.md.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect id="r" x="0" y="0" width="10" height="10" fill="red"/>
</svg>`;

type TextSession = { id: string; commit: () => void; discard: () => void };
type Internal = {
  doc: {
    text_of: (id: string) => string;
    set_text: (id: string, text: string) => void;
    all_elements: () => string[];
  };
  insert_text_preview: (
    initial: Readonly<Record<string, string>>,
    opts?: { parent?: string }
  ) => TextSession;
};

function internalOf(editor: ReturnType<typeof createSvgEditor>): Internal {
  return (editor as unknown as { _internal: Internal })._internal;
}

const ATTRS = {
  x: "10",
  y: "20",
  "font-size": "16",
  "font-family": "sans-serif",
  fill: "#000000",
} as const;

describe("text insert — history bracketing (empty == delete)", () => {
  it("text insert with content is a single undo step", () => {
    const editor = createSvgEditor({ svg: SVG });
    const internal = internalOf(editor);
    expect(editor.state.can_undo).toBe(false);

    const session = internal.insert_text_preview(ATTRS);
    // Simulate inline editing: content-edit mutates the node text in place.
    internal.doc.set_text(session.id, "hello");
    session.commit();

    expect(editor.state.can_undo).toBe(true);
    expect(editor.serialize()).toContain("hello");

    // ONE undo removes the whole inserted node (not just the text).
    editor.commands.undo();
    expect(editor.state.can_undo).toBe(false);
    expect(internal.doc.all_elements()).not.toContain(session.id);
    expect(editor.serialize()).not.toContain("hello");
  });

  it("text insert with no content leaves no node and no undo entry", () => {
    const editor = createSvgEditor({ svg: SVG });
    const internal = internalOf(editor);
    expect(editor.state.can_undo).toBe(false);

    const session = internal.insert_text_preview(ATTRS);
    // Node exists during editing (the caret needs somewhere to live)...
    expect(internal.doc.all_elements()).toContain(session.id);

    // ...but typing nothing and exiting discards it entirely.
    session.discard();
    expect(internal.doc.all_elements()).not.toContain(session.id);
    // No history entry — an abandoned placement leaves no trace.
    expect(editor.state.can_undo).toBe(false);
  });

  it("redo after a committed text insert restores the node WITH its content", () => {
    // Regression guard: a plain insert_preview would re-create an EMPTY node
    // on redo (text is not an attribute). insert_text_preview captures the
    // final text into the delta so redo replays it.
    const editor = createSvgEditor({ svg: SVG });
    const internal = internalOf(editor);

    const session = internal.insert_text_preview(ATTRS);
    internal.doc.set_text(session.id, "world");
    session.commit();

    editor.commands.undo();
    expect(editor.serialize()).not.toContain("world");

    editor.commands.redo();
    expect(internal.doc.all_elements()).toContain(session.id);
    expect(internal.doc.text_of(session.id)).toBe("world");
    expect(editor.serialize()).toContain("world");
  });

  it("discard restores the prior selection (an abandoned placement is invisible to state)", () => {
    const editor = createSvgEditor({ svg: SVG });
    const internal = internalOf(editor);
    const before = editor.state.selection;

    const session = internal.insert_text_preview(ATTRS);
    expect(editor.state.selection).toEqual([session.id]);

    session.discard();
    expect(editor.state.selection).toEqual(before);
  });
});
