/**
 * @vitest-environment node
 *
 * History management tests with time-bucketed recording.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import { sceneNode, rectNode } from "@/grida-canvas/__tests__/utils/factories";
import type grida from "@grida/schema";

function createHistoryDocument(): grida.program.document.Document {
  return {
    scenes_ref: ["scene1"],
    links: { scene1: ["rect1", "rect2"] },
    nodes: {
      scene1: sceneNode("scene1", "Scene 1"),
      rect1: rectNode("rect1", { name: "Rectangle 1" }),
      rect2: rectNode("rect2", { name: "Rectangle 2", x: 200 }),
    },
    entry_scene_id: "scene1",
    bitmaps: {},
    images: {},
    properties: {},
  };
}

describe("History Management", () => {
  let ed: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    ed = createHeadlessEditor({ document: createHistoryDocument() });
  });

  afterEach(() => {
    ed.dispose();
    vi.useRealTimers();
  });

  describe("Basic History Operations", () => {
    test("records and replays selection changes", () => {
      expect(ed.state.selection).toEqual([]);

      ed.doc.select(["rect1"]);
      vi.advanceTimersByTime(500);
      expect(ed.state.selection).toEqual(["rect1"]);
      expect(ed.doc.historySnapshot.past).toHaveLength(1);

      ed.doc.select(["rect2"]);
      vi.advanceTimersByTime(500);
      expect(ed.state.selection).toEqual(["rect2"]);
      expect(ed.doc.historySnapshot.past).toHaveLength(2);

      ed.doc.undo();
      expect(ed.state.selection).toEqual(["rect1"]);

      ed.doc.undo();
      expect(ed.state.selection).toEqual([]);

      ed.doc.redo();
      expect(ed.state.selection).toEqual(["rect1"]);

      ed.doc.redo();
      expect(ed.state.selection).toEqual(["rect2"]);
    });

    test("records and replays node deletion", () => {
      ed.doc.select(["rect2"]);
      // select and delete are different action types — auto-flushes
      ed.doc.delete(["rect2"]);
      vi.advanceTimersByTime(500);

      expect(ed.state.document.nodes.rect2).toBeUndefined();
      expect(ed.doc.historySnapshot.past).toHaveLength(2);

      ed.doc.undo();
      expect(ed.state.document.nodes.rect2).toBeDefined();

      ed.doc.undo();
      expect(ed.state.selection).toEqual([]);
    });

    test("clears future when content action is recorded", () => {
      // Content actions (not select/blur) should clear the redo stack
      ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "A" });
      vi.advanceTimersByTime(500);

      ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "B" });
      vi.advanceTimersByTime(500);

      ed.doc.undo();
      ed.doc.undo();
      expect(ed.doc.historySnapshot.future).toHaveLength(2);

      // Content action clears future
      ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "C" });
      vi.advanceTimersByTime(500);
      expect(ed.doc.historySnapshot.past).toHaveLength(1);
      expect(ed.doc.historySnapshot.future).toHaveLength(0);
    });

    test("select does NOT clear future (clearsFuture: false)", () => {
      ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "A" });
      vi.advanceTimersByTime(500);

      ed.doc.undo();
      expect(ed.doc.historySnapshot.future).toHaveLength(1);

      ed.doc.select(["rect1"]);
      vi.advanceTimersByTime(500);

      // Future preserved after select
      expect(ed.doc.historySnapshot.future).toHaveLength(1);
    });
  });

  describe("Time Bucketing", () => {
    test("rapid same-type dispatches merge into one undo step", () => {
      ed.doc.select(["rect1"]);
      ed.doc.select(["rect2"]);
      // Both are "select" type — bucketed together
      vi.advanceTimersByTime(500);

      expect(ed.doc.historySnapshot.past).toHaveLength(1);

      ed.doc.undo();
      expect(ed.state.selection).toEqual([]);
    });

    test("slow dispatches create separate steps", () => {
      ed.doc.select(["rect1"]);
      vi.advanceTimersByTime(500);

      ed.doc.select(["rect2"]);
      vi.advanceTimersByTime(500);

      expect(ed.doc.historySnapshot.past).toHaveLength(2);
    });
  });

  describe("History Manager State", () => {
    test("provides correct snapshot", () => {
      expect(ed.doc.historySnapshot.past).toHaveLength(0);
      expect(ed.doc.historySnapshot.future).toHaveLength(0);

      ed.doc.select(["rect1"]);
      vi.advanceTimersByTime(500);
      expect(ed.doc.historySnapshot.past).toHaveLength(1);

      ed.doc.undo();
      expect(ed.doc.historySnapshot.past).toHaveLength(0);
      expect(ed.doc.historySnapshot.future).toHaveLength(1);

      ed.doc.redo();
      expect(ed.doc.historySnapshot.past).toHaveLength(1);
      expect(ed.doc.historySnapshot.future).toHaveLength(0);
    });
  });

  describe("Complex Scenarios", () => {
    test("handles multiple operations with undo/redo", () => {
      ed.doc.select(["rect1"]);
      ed.doc.delete(["rect1"]); // different type — flushes select bucket
      ed.doc.select(["rect2"]); // different type — flushes delete bucket
      vi.advanceTimersByTime(500);

      expect(ed.doc.historySnapshot.past).toHaveLength(3);

      ed.doc.undo();
      ed.doc.undo();
      ed.doc.undo();
      expect(ed.state.selection).toEqual([]);
      expect(ed.state.document.nodes.rect1).toBeDefined();

      ed.doc.redo();
      ed.doc.redo();
      ed.doc.redo();
      expect(ed.state.document.nodes.rect1).toBeUndefined();
      expect(ed.state.selection).toEqual(["rect2"]);
    });

    test("handles blur action", () => {
      ed.doc.select(["rect1"]);
      ed.doc.blur(); // different type — flushes select bucket
      vi.advanceTimersByTime(500);

      expect(ed.state.selection).toEqual([]);
      expect(ed.doc.historySnapshot.past).toHaveLength(2);

      ed.doc.undo();
      expect(ed.state.selection).toEqual(["rect1"]);
    });
  });

  describe("clearsFuture: false (selection preserves redo)", () => {
    test("edit → undo → select → redo restores the edit", () => {
      // Make a content edit
      ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "Edited" });
      vi.advanceTimersByTime(500);
      expect(ed.doc.historySnapshot.past).toHaveLength(1);

      // Undo the edit
      ed.doc.undo();
      expect((ed.state.document.nodes.rect1 as any).name).toBe("Rectangle 1");
      expect(ed.doc.historySnapshot.future).toHaveLength(1);

      // Select something (uses clearsFuture: false)
      ed.doc.select(["rect2"]);
      vi.advanceTimersByTime(500);

      // Redo should still be available
      expect(ed.doc.historySnapshot.future).toHaveLength(1);

      // Redo the edit
      ed.doc.redo();
      expect((ed.state.document.nodes.rect1 as any).name).toBe("Edited");
    });

    test("edit → undo → blur → redo restores the edit", () => {
      ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "Edited" });
      vi.advanceTimersByTime(500);

      ed.doc.undo();
      expect(ed.doc.historySnapshot.future).toHaveLength(1);

      ed.doc.blur();
      vi.advanceTimersByTime(500);

      // Redo still available after blur
      expect(ed.doc.historySnapshot.future).toHaveLength(1);

      ed.doc.redo();
      expect((ed.state.document.nodes.rect1 as any).name).toBe("Edited");
    });
  });
});
