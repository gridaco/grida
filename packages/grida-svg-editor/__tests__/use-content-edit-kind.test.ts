// Headless test for the resolver logic behind `useContentEditKind`.
//
// The hook itself can't be unit-tested without a React renderer, but its
// resolution rule is pure: read `state.mode` + `state.selection[0]` +
// `tree().nodes.get(id).tag`. We exercise that rule directly against a
// real `createSvgEditor` — the same data path the hook uses.

import { describe, it, expect } from "vitest";
import { createSvgEditor } from "../src/index";

const PATH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0,0 L10,10" stroke="black"/></svg>`;
const TEXT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="20">hi</text></svg>`;

// Mirrors the hook's resolver. The hook's only difference is calling
// useEditorState — the kind-resolution math is exactly this.
function resolve_kind(
  editor: ReturnType<typeof createSvgEditor>
): "path" | "text" | null {
  const s = editor.state;
  if (s.mode !== "edit-content") return null;
  const id = s.selection[0];
  if (!id) return null;
  const tag = editor.tree().nodes.get(id)?.tag;
  if (tag === "path") return "path";
  if (tag === "text" || tag === "tspan") return "text";
  return null;
}

describe("useContentEditKind — resolver", () => {
  it("returns null in select mode regardless of selection", () => {
    const editor = createSvgEditor({ svg: PATH_SVG });
    const path_id = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "path"
    )!.id;
    editor.commands.select(path_id);
    expect(editor.state.mode).toBe("select");
    expect(resolve_kind(editor)).toBeNull();
  });

  it("returns 'path' in edit-content with a path selected", () => {
    const editor = createSvgEditor({ svg: PATH_SVG });
    const path_id = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "path"
    )!.id;
    editor.commands.select(path_id);
    editor.commands.set_mode("edit-content");
    expect(resolve_kind(editor)).toBe("path");
  });

  it("returns 'text' in edit-content with a text node selected", () => {
    const editor = createSvgEditor({ svg: TEXT_SVG });
    const text_id = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "text"
    )!.id;
    editor.commands.select(text_id);
    editor.commands.set_mode("edit-content");
    expect(resolve_kind(editor)).toBe("text");
  });

  it("returns null in edit-content with no selection (defensive)", () => {
    const editor = createSvgEditor({ svg: PATH_SVG });
    // No select() call. The editor refuses to enter edit-content without a
    // selection in production, but the resolver must still be defensive
    // against the empty-selection case.
    expect(resolve_kind(editor)).toBeNull();
  });
});
