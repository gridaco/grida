/**
 * Gate: Time-bucketed history recording.
 *
 * Rapid dispatches of the same action type within the timeout window are
 * merged into one undo step. Different action types flush the bucket.
 * Undo/redo flush the bucket before operating.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import { sceneNode, rectNode } from "@/grida-canvas/__tests__/utils/factories";
import type grida from "@grida/schema";

type UnknownNode = grida.program.nodes.UnknownNode;

function createDoc(): grida.program.document.Document {
  return {
    scenes_ref: ["scene1"],
    links: { scene1: ["rect1"] },
    nodes: {
      scene1: sceneNode("scene1", "Scene 1"),
      rect1: rectNode("rect1", { name: "Rect 1" }),
    },
    entry_scene_id: "scene1",
    bitmaps: {},
    images: {},
    properties: {},
  };
}

describe("Time-bucketed recording", () => {
  let ed: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    ed = createHeadlessEditor({ document: createDoc() });
    // Use a short bucket timeout for testing
    // Access private field for testing — set a short bucket timeout
    (
      ed.doc as unknown as { _historyAdapter: { bucketTimeoutMs: number } }
    )._historyAdapter.bucketTimeoutMs = 100;
  });

  afterEach(() => {
    ed.dispose();
    vi.useRealTimers();
  });

  test("rapid same-type dispatches merge into one undo step", () => {
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "A" });
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "B" });
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "C" });

    // Before timeout: bucket is pending, not yet on stack
    expect(ed.doc.historySnapshot.past).toHaveLength(0);
    expect((ed.state.document.nodes.rect1 as UnknownNode).name).toBe("C");

    // After timeout: bucket flushes as one step
    vi.advanceTimersByTime(200);
    expect(ed.doc.historySnapshot.past).toHaveLength(1);
  });

  test("undo of bucketed entry reverts to pre-bucket state", () => {
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "A" });
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "B" });
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "C" });
    vi.advanceTimersByTime(200);

    expect((ed.state.document.nodes.rect1 as UnknownNode).name).toBe("C");

    ed.doc.undo();
    // Reverts to original — not to "B" or "A"
    expect((ed.state.document.nodes.rect1 as UnknownNode).name).toBe("Rect 1");
  });

  test("different action type flushes previous bucket", () => {
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "A" });
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "B" });

    // Different action type — flushes the name changes as one step
    ed.doc.select(["rect1"]);

    // "name" bucket was flushed (1 step), "select" starts a new bucket
    // The select bucket hasn't flushed yet, but the name bucket has
    vi.advanceTimersByTime(200); // flush the select bucket too

    expect(ed.doc.historySnapshot.past).toHaveLength(2);
  });

  test("undo flushes pending bucket before undoing", () => {
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "A" });
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "B" });

    // No timeout yet — bucket is pending
    expect(ed.doc.historySnapshot.past).toHaveLength(0);

    // Undo flushes the bucket first, then undoes it
    ed.doc.undo();

    expect((ed.state.document.nodes.rect1 as UnknownNode).name).toBe("Rect 1");
    expect(ed.doc.historySnapshot.past).toHaveLength(0);
    expect(ed.doc.historySnapshot.future).toHaveLength(1);
  });

  test("redo after undo of bucketed entry works", () => {
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "A" });
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "B" });
    vi.advanceTimersByTime(200);

    ed.doc.undo();
    expect((ed.state.document.nodes.rect1 as UnknownNode).name).toBe("Rect 1");

    ed.doc.redo();
    expect((ed.state.document.nodes.rect1 as UnknownNode).name).toBe("B");
  });

  test("keyboard arrow nudge simulation: rapid same-type = one step", () => {
    // Simulate pressing arrow key 5 times quickly
    for (let i = 1; i <= 5; i++) {
      ed.doc.dispatch({
        type: "node/change/*",
        node_id: "rect1",
        name: `Nudge ${i}`,
      });
    }

    vi.advanceTimersByTime(200);
    expect(ed.doc.historySnapshot.past).toHaveLength(1);

    ed.doc.undo();
    expect((ed.state.document.nodes.rect1 as UnknownNode).name).toBe("Rect 1");
  });

  test("slow dispatches (gap > timeout) create separate steps", () => {
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "A" });
    vi.advanceTimersByTime(200); // flush

    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "B" });
    vi.advanceTimersByTime(200); // flush

    expect(ed.doc.historySnapshot.past).toHaveLength(2);

    ed.doc.undo();
    expect((ed.state.document.nodes.rect1 as UnknownNode).name).toBe("A");

    ed.doc.undo();
    expect((ed.state.document.nodes.rect1 as UnknownNode).name).toBe("Rect 1");
  });

  test("gesture begin flushes pending bucket", () => {
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "Pre" });

    // Bucket is pending. Now start a gesture.
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "GS" },
      { recording: "begin-gesture" }
    );

    // The "Pre" bucket was flushed
    expect(ed.doc.historySnapshot.past).toHaveLength(1);
  });
});
