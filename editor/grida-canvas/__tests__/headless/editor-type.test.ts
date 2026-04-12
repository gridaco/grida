/**
 * Tests for editor_type configuration and onPostDispatch hook.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { editor } from "@/grida-canvas";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import {
  createDocumentWithRects,
  MINIMAL_DOCUMENT,
} from "@/grida-canvas/__tests__/utils/fixtures";

describe("editor_type", () => {
  test("defaults to 'freeform' when not specified", () => {
    const ed = createHeadlessEditor();
    expect(ed.state.editor_type).toBe("freeform");
    ed.dispose();
  });

  test("can be set to 'slides' via init", () => {
    const doc = createDocumentWithRects(1);
    const ed = createHeadlessEditor({ document: doc });
    // createHeadlessEditor doesn't support editor_type yet, so test via
    // the lower-level API using the init shape
    const ed2 = Editor.createHeadless({
      document: doc,
      editable: true,
      debug: false,
      editor_type: "slides",
    } as editor.state.IEditorStateInit);
    expect(ed2.state.editor_type).toBe("slides");
    ed.dispose();
    ed2.dispose();
  });

  test("is preserved across dispatches", () => {
    const doc = createDocumentWithRects(1);
    const ed = Editor.createHeadless({
      document: doc,
      editable: true,
      debug: false,
      editor_type: "slides",
    } as editor.state.IEditorStateInit);
    ed.doc.select(["rect-0"]);
    expect(ed.state.editor_type).toBe("slides");
    ed.dispose();
  });
});

describe("onPostDispatch", () => {
  let ed: Editor;

  beforeEach(() => {
    ed = createHeadlessEditor();
  });

  afterEach(() => {
    ed.dispose();
  });

  test("hook fires synchronously after dispatch, before external listeners", () => {
    const order: string[] = [];

    ed.doc.onPostDispatch(() => {
      order.push("hook");
    });

    ed.subscribe(() => {
      order.push("listener");
    });

    ed.doc.select(["rect-0"]);

    expect(order).toEqual(["hook", "listener"]);
  });

  test("hook receives the action and the mutated state", () => {
    const spy = vi.fn();
    ed.doc.onPostDispatch(spy);
    ed.doc.select(["rect-0"]);

    expect(spy).toHaveBeenCalledTimes(1);
    const [action, state] = spy.mock.calls[0];
    expect(action.type).toBe("select");
    expect(state.selection).toEqual(["rect-0"]);
  });

  test("hook fires on document/reset", () => {
    const spy = vi.fn();
    ed.doc.onPostDispatch(spy);

    const newState = editor.state.init({
      document: createDocumentWithRects(3),
      editable: true,
    });
    ed.doc.reset(newState);

    expect(spy).toHaveBeenCalledTimes(1);
    const [action, state] = spy.mock.calls[0];
    expect(action.type).toBe("document/reset");
    expect(Object.keys(state.document.nodes)).toHaveLength(4); // 1 scene + 3 rects
  });

  test("hook can dispatch synchronously (re-entrant)", () => {
    let innerDispatchCompleted = false;

    ed.doc.onPostDispatch((action) => {
      // On select, set isolation (another dispatch)
      if (action.type === "select") {
        ed.doc.setIsolation(null);
        innerDispatchCompleted = true;
      }
    });

    ed.doc.select(["rect-0"]);
    expect(innerDispatchCompleted).toBe(true);
    expect(ed.state.isolation_root_node_id).toBe(null);
  });

  test("unregister stops hook from firing", () => {
    const spy = vi.fn();
    const unsub = ed.doc.onPostDispatch(spy);

    ed.doc.select(["rect-0"]);
    expect(spy).toHaveBeenCalledTimes(1);

    unsub();
    ed.doc.blur();
    expect(spy).toHaveBeenCalledTimes(1); // still 1
  });

  test("multiple hooks fire in registration order", () => {
    const order: number[] = [];

    ed.doc.onPostDispatch(() => order.push(1));
    ed.doc.onPostDispatch(() => order.push(2));
    ed.doc.onPostDispatch(() => order.push(3));

    ed.doc.select(["rect-0"]);
    expect(order).toEqual([1, 2, 3]);
  });
});
