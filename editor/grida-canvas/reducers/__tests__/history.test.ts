/**
 * @vitest-environment node
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { vi } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import { sceneNode, rectNode } from "@/grida-canvas/__tests__/utils/factories";
import type grida from "@grida/schema";

function createHistoryDocument(): grida.program.document.Document {
  return {
    scenes_ref: ["scene1"],
    links: {
      scene1: ["rect1", "rect2"],
    },
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
    ed = createHeadlessEditor({ document: createHistoryDocument() });
  });

  afterEach(() => {
    ed.dispose();
  });

  describe("Basic History Operations", () => {
    test("records and replays selection changes", () => {
      // Initial state
      expect(ed.state.selection).toEqual([]);
      expect(ed.doc.historySnapshot.past).toHaveLength(0);

      // Select first rectangle
      ed.doc.select(["rect1"]);
      expect(ed.state.selection).toEqual(["rect1"]);
      expect(ed.doc.historySnapshot.past).toHaveLength(1);
      expect(ed.doc.historySnapshot.past[0].actionType).toBe("select");
      expect(ed.doc.historySnapshot.past[0].patches).toHaveLength(1);

      // Select second rectangle (should be merged with first — rapid selection)
      ed.doc.select(["rect2"]);
      expect(ed.state.selection).toEqual(["rect2"]);
      expect(ed.doc.historySnapshot.past).toHaveLength(1); // Merged into single entry

      // Undo to initial state (merged entries go back to initial state)
      ed.doc.undo();
      expect(ed.state.selection).toEqual([]);
      expect(ed.doc.historySnapshot.past).toHaveLength(0);
      expect(ed.doc.historySnapshot.future).toHaveLength(1);

      // Redo to final selection (merged entries go directly to final state)
      ed.doc.redo();
      expect(ed.state.selection).toEqual(["rect2"]);
      expect(ed.doc.historySnapshot.past).toHaveLength(1);
      expect(ed.doc.historySnapshot.future).toHaveLength(0);
    });

    test("records and replays node deletion", () => {
      // Select and delete a node
      ed.doc.select(["rect2"]);
      expect(ed.state.selection).toEqual(["rect2"]);

      ed.doc.delete(["rect2"]);
      expect(ed.state.document.nodes.rect2).toBeUndefined();
      expect(ed.state.selection).toEqual([]);
      expect(ed.doc.historySnapshot.past).toHaveLength(1); // select+delete merged

      // Undo deletion (goes back to initial state)
      ed.doc.undo();
      expect(ed.state.document.nodes.rect2).toBeDefined();
      expect(ed.state.selection).toEqual([]);
      expect(ed.doc.historySnapshot.past).toHaveLength(0);
      expect(ed.doc.historySnapshot.future).toHaveLength(1);

      // Redo deletion (goes to final state)
      ed.doc.redo();
      expect(ed.state.document.nodes.rect2).toBeUndefined();
      expect(ed.state.selection).toEqual([]);
      expect(ed.doc.historySnapshot.past).toHaveLength(1);
      expect(ed.doc.historySnapshot.future).toHaveLength(0);
    });

    test("clears future when new action is recorded", () => {
      // Create some history (rapid selections will be merged)
      ed.doc.select(["rect1"]);
      ed.doc.select(["rect2"]);
      expect(ed.doc.historySnapshot.past).toHaveLength(1); // merged

      // Undo once
      ed.doc.undo();
      expect(ed.doc.historySnapshot.past).toHaveLength(0);
      expect(ed.doc.historySnapshot.future).toHaveLength(1);

      // Record new action - should clear future
      ed.doc.select(["rect1", "rect2"]);
      expect(ed.doc.historySnapshot.past).toHaveLength(1); // new action
      expect(ed.doc.historySnapshot.future).toHaveLength(0);
    });
  });

  describe("History Merging", () => {
    test("merges rapid selection updates", () => {
      const nowSpy = vi.spyOn(Date, "now");

      // First selection
      nowSpy.mockReturnValueOnce(1000);
      ed.doc.select(["rect1"]);
      expect(ed.state.selection).toEqual(["rect1"]);
      expect(ed.doc.historySnapshot.past).toHaveLength(1);

      // Second selection within merge window (100ms)
      nowSpy.mockReturnValueOnce(1100);
      nowSpy.mockReturnValueOnce(1100);
      ed.doc.select(["rect2"]);

      // Should be merged into single entry
      expect(ed.doc.historySnapshot.past).toHaveLength(1);
      expect(ed.state.selection).toEqual(["rect2"]);
      expect(ed.doc.historySnapshot.past[0].patches).toHaveLength(2);

      // Undo should go to initial state
      ed.doc.undo();
      expect(ed.state.selection).toEqual([]);

      // Redo should go to final state
      ed.doc.redo();
      expect(ed.state.selection).toEqual(["rect2"]);

      nowSpy.mockRestore();
    });

    test("does not merge actions after merge window", () => {
      const nowSpy = vi.spyOn(Date, "now");

      // First selection
      nowSpy.mockReturnValueOnce(1000);
      ed.doc.select(["rect1"]);
      expect(ed.doc.historySnapshot.past).toHaveLength(1);

      // Second selection after merge window (> 300ms)
      nowSpy.mockReturnValueOnce(1401);
      nowSpy.mockReturnValueOnce(1401);
      ed.doc.select(["rect2"]);

      // Should create separate entries (outside merge window)
      expect(ed.doc.historySnapshot.past).toHaveLength(2);
      expect(ed.state.selection).toEqual(["rect2"]);

      nowSpy.mockRestore();
    });
  });

  describe("History Manager State", () => {
    test("provides correct snapshot", () => {
      // Initial snapshot
      expect(ed.doc.historySnapshot.past).toHaveLength(0);
      expect(ed.doc.historySnapshot.future).toHaveLength(0);

      // After one action
      ed.doc.select(["rect1"]);
      expect(ed.doc.historySnapshot.past).toHaveLength(1);
      expect(ed.doc.historySnapshot.future).toHaveLength(0);

      // After undo
      ed.doc.undo();
      expect(ed.doc.historySnapshot.past).toHaveLength(0);
      expect(ed.doc.historySnapshot.future).toHaveLength(1);

      // After redo
      ed.doc.redo();
      expect(ed.doc.historySnapshot.past).toHaveLength(1);
      expect(ed.doc.historySnapshot.future).toHaveLength(0);
    });
  });

  describe("Complex Scenarios", () => {
    test("handles multiple operations with undo/redo", () => {
      // Select, delete, select another
      ed.doc.select(["rect1"]);
      ed.doc.delete(["rect1"]);
      ed.doc.select(["rect2"]);

      expect(ed.doc.historySnapshot.past).toHaveLength(1); // select+delete+select all merged
      expect(ed.state.document.nodes.rect1).toBeUndefined();
      expect(ed.state.selection).toEqual(["rect2"]);

      // Undo all operations (goes back to initial state)
      ed.doc.undo();
      expect(ed.state.selection).toEqual([]);
      expect(ed.state.document.nodes.rect1).toBeDefined();

      // Redo all operations (goes to final state)
      ed.doc.redo();
      expect(ed.state.document.nodes.rect1).toBeUndefined();
      expect(ed.state.selection).toEqual(["rect2"]);
    });

    test("handles blur action", () => {
      // Select and then blur
      ed.doc.select(["rect1"]);
      expect(ed.state.selection).toEqual(["rect1"]);

      ed.doc.blur();
      expect(ed.state.selection).toEqual([]);
      expect(ed.doc.historySnapshot.past).toHaveLength(1); // select+blur merged

      // Undo blur (goes back to initial state)
      ed.doc.undo();
      expect(ed.state.selection).toEqual([]);
    });
  });
});
