/**
 * Gate 3: Behavioral Correctness - Undo/Redo
 *
 * With time-bucketed recording, rapid same-type dispatches merge into one
 * undo step. Tests use fake timers to control bucket flushing.
 *
 * Key: undo() always flushes the pending bucket before undoing, so
 * dispatch + immediate undo still works without advancing timers.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";

describe("Undo/Redo (headless)", () => {
  let ed: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    ed = createHeadlessEditor();
  });

  afterEach(() => {
    ed.dispose();
    vi.useRealTimers();
  });

  test("undo after select restores previous selection", () => {
    expect(ed.state.selection).toEqual([]);
    ed.doc.select(["rect-0"]);
    expect(ed.state.selection).toEqual(["rect-0"]);
    // undo flushes the pending bucket then undoes it
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

  test("two selects with time gap create separate steps", () => {
    ed.doc.select(["rect-0"]);
    vi.advanceTimersByTime(500); // flush first bucket

    ed.doc.select(["rect-1"]);
    vi.advanceTimersByTime(500); // flush second bucket

    expect(ed.doc.historySnapshot.past).toHaveLength(2);

    ed.doc.undo();
    expect(ed.state.selection).toEqual(["rect-0"]);

    ed.doc.undo();
    expect(ed.state.selection).toEqual([]);

    ed.doc.redo();
    expect(ed.state.selection).toEqual(["rect-0"]);
    ed.doc.redo();
    expect(ed.state.selection).toEqual(["rect-1"]);
  });

  test("undo after delete restores the deleted node", () => {
    ed.doc.select(["rect-0"]);
    // select and delete are different action types — auto-flushes
    ed.doc.delete(["rect-0"]);
    vi.advanceTimersByTime(500);

    expect(ed.state.document.nodes["rect-0"]).toBeUndefined();

    ed.doc.undo();
    expect(ed.state.document.nodes["rect-0"]).toBeDefined();
  });
});
