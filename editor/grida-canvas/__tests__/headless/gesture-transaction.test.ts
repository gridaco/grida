/**
 * Gate: Gesture transactions via dispatch recording modes.
 *
 * dispatch(action, { recording: "begin-gesture" })  — opens transaction
 * dispatch(action, { recording: "silent" })          — mid-gesture frame
 * dispatch(action, { recording: "end-gesture" })     — commits one undo step
 * dispatch(action, { recording: "abort-gesture" })   — reverts, no undo step
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import { sceneNode, rectNode } from "@/grida-canvas/__tests__/utils/factories";
import type grida from "@grida/schema";

function createDoc(): grida.program.document.Document {
  return {
    scenes_ref: ["scene1"],
    links: { scene1: ["rect1"] },
    nodes: {
      scene1: sceneNode("scene1", "Scene 1"),
      rect1: rectNode("rect1", { name: "Rect 1", x: 0, y: 0, width: 100, height: 100 }),
    },
    entry_scene_id: "scene1",
    bitmaps: {},
    images: {},
    properties: {},
  };
}

type D = { type: "node/change/*"; node_id: string; name: string };

describe("Gesture Transactions via dispatch recording modes", () => {
  let ed: Editor;
  beforeEach(() => {
    vi.useFakeTimers();
    ed = createHeadlessEditor({ document: createDoc() });
  });
  afterEach(() => {
    ed.dispose();
    vi.useRealTimers();
  });

  test("begin-gesture → silent → end-gesture = one undo step", () => {
    ed.doc.select(["rect1"]);
    vi.advanceTimersByTime(500);
    expect(ed.doc.historySnapshot.past).toHaveLength(1);

    // Begin gesture
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "Start" } satisfies D,
      { recording: "begin-gesture" }
    );

    // Silent mid-frames
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "Mid1" } satisfies D,
      { recording: "silent" }
    );
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "Mid2" } satisfies D,
      { recording: "silent" }
    );

    // Still 1 undo step (the select)
    expect(ed.doc.historySnapshot.past).toHaveLength(1);
    // But state IS updated
    expect((ed.state.document.nodes.rect1 as any).name).toBe("Mid2");

    // End gesture
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "Final" } satisfies D,
      { recording: "end-gesture" }
    );

    expect(ed.doc.historySnapshot.past).toHaveLength(2); // select + gesture
    expect((ed.state.document.nodes.rect1 as any).name).toBe("Final");
  });

  test("undo reverts entire gesture in one step", () => {
    ed.doc.select(["rect1"]);
    const original = (ed.state.document.nodes.rect1 as any).name;

    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "X" } satisfies D,
      { recording: "begin-gesture" }
    );
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "Y" } satisfies D,
      { recording: "silent" }
    );
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "Z" } satisfies D,
      { recording: "end-gesture" }
    );

    expect((ed.state.document.nodes.rect1 as any).name).toBe("Z");

    // One undo reverts the whole gesture
    ed.doc.undo();
    expect((ed.state.document.nodes.rect1 as any).name).toBe(original);

    // Next undo reverts the select
    ed.doc.undo();
    expect(ed.state.selection).toEqual([]);
  });

  test("abort-gesture reverts to pre-gesture state", () => {
    ed.doc.select(["rect1"]);
    const original = (ed.state.document.nodes.rect1 as any).name;

    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "A" } satisfies D,
      { recording: "begin-gesture" }
    );
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "B" } satisfies D,
      { recording: "silent" }
    );
    // Abort
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "ABORT" } satisfies D,
      { recording: "abort-gesture" }
    );

    expect((ed.state.document.nodes.rect1 as any).name).toBe(original);
    expect(ed.doc.historySnapshot.past).toHaveLength(1); // only the select
  });

  test("empty gesture (no document change) produces no undo step", () => {
    ed.doc.select(["rect1"]);
    vi.advanceTimersByTime(500);
    expect(ed.doc.historySnapshot.past).toHaveLength(1);

    // begin + end with no actual changes between
    ed.doc.dispatch(
      { type: "event-target/event/on-pointer-up" },
      { recording: "begin-gesture" }
    );
    ed.doc.dispatch(
      { type: "event-target/event/on-pointer-up" },
      { recording: "end-gesture" }
    );

    expect(ed.doc.historySnapshot.past).toHaveLength(1); // no new step
  });

  test("record mode during active gesture is suppressed", () => {
    ed.doc.select(["rect1"]);

    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "GS" } satisfies D,
      { recording: "begin-gesture" }
    );

    // "record" mode (default) during gesture — should be suppressed
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "Mid" } satisfies D,
    );

    expect(ed.doc.historySnapshot.past).toHaveLength(1); // still just select

    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "End" } satisfies D,
      { recording: "end-gesture" }
    );

    expect(ed.doc.historySnapshot.past).toHaveLength(2);
  });

  test("property change → gesture → undo each separately", () => {
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "Renamed" } satisfies D);
    vi.advanceTimersByTime(500);
    expect(ed.doc.historySnapshot.past).toHaveLength(1);

    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "GS" } satisfies D,
      { recording: "begin-gesture" }
    );
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "Dragged" } satisfies D,
      { recording: "end-gesture" }
    );
    expect(ed.doc.historySnapshot.past).toHaveLength(2);

    ed.doc.undo(); // undo gesture
    expect((ed.state.document.nodes.rect1 as any).name).toBe("Renamed");

    ed.doc.undo(); // undo rename
    expect((ed.state.document.nodes.rect1 as any).name).toBe("Rect 1");
  });

  test("gesture undo notifies subscribers even without Immer patches", () => {
    // This tests the bug where gesture undo used snapshot-based restore
    // (no Immer patches) and subscribers that depended on patches being
    // non-empty would skip re-rendering.
    const emissions: { action: any; patchCount: number }[] = [];
    const __unsub = ed.doc.subscribe((_doc, action, patches) => {
      emissions.push({ action: action?.type ?? "undo/redo", patchCount: patches?.length ?? 0 });
    });

    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "GS" } satisfies D,
      { recording: "begin-gesture" }
    );
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "Mid" } satisfies D,
      { recording: "silent" }
    );
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "End" } satisfies D,
      { recording: "end-gesture" }
    );

    emissions.length = 0; // clear emissions from the dispatches

    // Undo the gesture
    ed.doc.undo();

    // Subscriber must have been called
    expect(emissions.length).toBe(1);
    // The document must have actually changed
    expect((ed.state.document.nodes.rect1 as any).name).toBe("Rect 1");
  });

  test("isGestureActive reflects state", () => {
    expect(ed.doc.isGestureActive).toBe(false);

    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "A" } satisfies D,
      { recording: "begin-gesture" }
    );
    expect(ed.doc.isGestureActive).toBe(true);

    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "B" } satisfies D,
      { recording: "end-gesture" }
    );
    expect(ed.doc.isGestureActive).toBe(false);
  });

  test("undo during active gesture: aborts gesture, then undoes previous entry", () => {
    // Setup: create a history entry first
    ed.doc.dispatch({ type: "node/change/*", node_id: "rect1", name: "Base" } satisfies D);
    vi.advanceTimersByTime(500);
    expect(ed.doc.historySnapshot.past).toHaveLength(1);

    // Start a gesture and make changes
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "GS" } satisfies D,
      { recording: "begin-gesture" }
    );
    ed.doc.dispatch(
      { type: "node/change/*", node_id: "rect1", name: "Mid-drag" } satisfies D,
      { recording: "silent" }
    );
    expect(ed.doc.isGestureActive).toBe(true);
    expect((ed.state.document.nodes.rect1 as any).name).toBe("Mid-drag");

    // Undo while gesture is active — should abort gesture and undo previous
    ed.doc.undo();

    // Gesture should be aborted
    expect(ed.doc.isGestureActive).toBe(false);
    // State should be back to before "Base" (the gesture was aborted,
    // then the "Base" entry was undone)
    expect((ed.state.document.nodes.rect1 as any).name).toBe("Rect 1");
    expect(ed.doc.historySnapshot.past).toHaveLength(0);
  });
});
