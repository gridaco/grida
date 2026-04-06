/**
 * Gate 3: Behavioral Correctness - Undo/Redo
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";

describe("Undo/Redo (headless)", () => {
  let ed: Editor;

  beforeEach(() => {
    ed = createHeadlessEditor();
  });

  afterEach(() => {
    ed.dispose();
  });

  test("undo after select restores previous selection", () => {
    expect(ed.state.selection).toEqual([]);
    ed.doc.select(["rect-0"]);
    expect(ed.state.selection).toEqual(["rect-0"]);
    ed.doc.undo();
    expect(ed.state.selection).toEqual([]);
  });

  test("redo after undo restores the undone state", () => {
    ed.doc.select(["rect-0"]);
    ed.doc.undo();
    expect(ed.state.selection).toEqual([]);
    ed.doc.redo();
    expect(ed.state.selection).toEqual(["rect-0"]);
  });

  test("undo on empty history is no-op", () => {
    const before = ed.state;
    ed.doc.undo();
    expect(ed.state.selection).toEqual(before.selection);
  });

  test("redo on empty future is no-op", () => {
    const before = ed.state;
    ed.doc.redo();
    expect(ed.state.selection).toEqual(before.selection);
  });

  test("multiple undo steps outside merge window", () => {
    const nowSpy = vi.spyOn(Date, "now");

    // First action at t=1000
    nowSpy.mockReturnValueOnce(1000);
    ed.doc.select(["rect-0"]);
    expect(ed.state.selection).toEqual(["rect-0"]);

    // Second action at t=2000 — well outside the 300ms merge window
    nowSpy.mockReturnValueOnce(2000);
    nowSpy.mockReturnValueOnce(2000);
    ed.doc.select(["rect-1"]);
    expect(ed.state.selection).toEqual(["rect-1"]);

    // Should be two separate history entries
    expect(ed.doc.historySnapshot.past).toHaveLength(2);

    // Undo once — restores to rect-0
    ed.doc.undo();
    expect(ed.state.selection).toEqual(["rect-0"]);

    // Undo again — restores to empty
    ed.doc.undo();
    expect(ed.state.selection).toEqual([]);

    // Redo twice — back to final state
    ed.doc.redo();
    expect(ed.state.selection).toEqual(["rect-0"]);
    ed.doc.redo();
    expect(ed.state.selection).toEqual(["rect-1"]);

    nowSpy.mockRestore();
  });

  test("undo after delete restores the deleted node", () => {
    ed.doc.select(["rect-0"]);
    ed.doc.delete(["rect-0"]);
    expect(ed.state.document.nodes["rect-0"]).toBeUndefined();

    ed.doc.undo();
    expect(ed.state.document.nodes["rect-0"]).toBeDefined();
  });
});
