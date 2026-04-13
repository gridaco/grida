/**
 * Convenience wrapper around Editor.createHeadless() for tests.
 */
import { Editor } from "@/grida-canvas/editor";
import type { editor } from "@/grida-canvas";
import { createDocumentWithRects } from "./fixtures";

export interface HeadlessEditorOptions {
  document?: editor.state.IEditorStateInit["document"];
  editable?: boolean;
  viewport?: { width: number; height: number };
}

/**
 * Create a headless editor for testing.
 *
 * @example
 * ```ts
 * const ed = createHeadlessEditor();
 * ed.doc.select(["rect-0"]);
 * expect(ed.state.selection).toEqual(["rect-0"]);
 * ed.dispose();
 * ```
 */
export function createHeadlessEditor(opts?: HeadlessEditorOptions): Editor {
  const document = opts?.document ?? createDocumentWithRects(2);

  return Editor.createHeadless(
    {
      document,
      editable: opts?.editable ?? true,
      debug: false,
    },
    {
      viewport: opts?.viewport,
    }
  );
}
