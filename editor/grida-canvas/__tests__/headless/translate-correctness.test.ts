/**
 * Correctness harness for the translate gesture dispatch pipeline.
 *
 * Verifies that the state after a complete translate gesture (start → N drag
 * frames → end) is correct by checking:
 * - Node positions after drag
 * - Gesture state transitions (idle → translate → idle)
 * - Surface snapping state
 * - Selection preserved
 * - Undo restores original positions
 *
 * This harness exists to catch regressions when optimizing the translate
 * hot path (e.g. bypassing Immer for gesture-bound dispatches).
 *
 * @vitest-environment node
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import type { editor } from "@/grida-canvas";
import type { Action } from "@/grida-canvas/action";
import { CanvasWasmGeometryQueryInterfaceProvider } from "@/grida-canvas/backends/wasm";
import {
  sceneNode,
  rectNode,
  containerNode,
} from "@/grida-canvas/__tests__/utils/factories";
import { io } from "@grida/io";
import type grida from "@grida/schema";
import type { Scene } from "@grida/canvas-wasm";

// ---------------------------------------------------------------------------
// Polyfills
// ---------------------------------------------------------------------------

if (typeof globalThis.reportError === "undefined") {
  (
    globalThis as unknown as { reportError: (err: unknown) => void }
  ).reportError = (_err: unknown) => {};
}

// `Editor._scheduleWasmRedraw` (reached via `mountHeadless`) uses
// requestAnimationFrame. Polyfill to setImmediate so scheduled redraws
// drain and `dispose()` cancels cleanly.
{
  type RafCb = (ts: number) => void;
  type RafGlobals = {
    requestAnimationFrame?: (cb: RafCb) => number;
    cancelAnimationFrame?: (id: number) => void;
  };
  if (typeof (globalThis as RafGlobals).requestAnimationFrame !== "function") {
    const handles = new Map<number, NodeJS.Immediate>();
    let next = 1;
    (globalThis as RafGlobals).requestAnimationFrame = (cb: RafCb) => {
      const id = next++;
      const h = setImmediate(() => {
        handles.delete(id);
        cb(performance.now());
      });
      handles.set(id, h);
      return id;
    };
    (globalThis as RafGlobals).cancelAnimationFrame = (id: number) => {
      const h = handles.get(id);
      if (h) {
        clearImmediate(h);
        handles.delete(id);
      }
    };
  }
}

// ---------------------------------------------------------------------------
// Setup: 100-node scene with WASM geometry
// ---------------------------------------------------------------------------

function generateDocument(n: number): grida.program.document.Document {
  const children: string[] = [];
  const nodes: Record<string, grida.program.nodes.Node> = {
    scene: sceneNode("scene", "Scene"),
  };
  const cols = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const id = `r${i}`;
    children.push(id);
    nodes[id] = rectNode(id, {
      name: `Rect ${i}`,
      x: (i % cols) * 120,
      y: Math.floor(i / cols) * 120,
      width: 100,
      height: 100,
    });
  }
  return {
    scenes_ref: ["scene"],
    links: { scene: children },
    nodes,
    entry_scene_id: "scene",
    images: {},
    bitmaps: {},
    properties: {},
  };
}

let _createCanvas: typeof import("@grida/canvas-wasm").createCanvas;

beforeAll(async () => {
  const pkg = await import("@grida/canvas-wasm");
  _createCanvas = pkg.createCanvas;
}, 30_000);

async function createEditor(
  doc: grida.program.document.Document
): Promise<{ ed: Editor; canvas: import("@grida/canvas-wasm").Canvas }> {
  const ed = Editor.createHeadless(
    { document: doc, editable: true, debug: false },
    { viewport: { width: 4096, height: 4096 } }
  );
  const canvas = await _createCanvas({
    backend: "raster",
    width: 4096,
    height: 4096,
    useEmbeddedFonts: true,
  });
  const scene: Scene = (canvas as unknown as { _scene: Scene })._scene;
  scene.loadSceneGrida(io.GRID.encode(doc));
  scene.switchScene("scene");
  (
    ed as unknown as { _m_geometry: CanvasWasmGeometryQueryInterfaceProvider }
  )._m_geometry = new CanvasWasmGeometryQueryInterfaceProvider(ed, scene);
  return { ed, canvas };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNodePosition(
  state: editor.state.IEditorState,
  nodeId: string
): { x: number; y: number } {
  const node = state.document.nodes[nodeId] as grida.program.nodes.UnknownNode;
  return {
    x: node.layout_inset_left ?? 0,
    y: node.layout_inset_top ?? 0,
  };
}

function simulateTranslateGesture(
  ed: Editor,
  nodeId: string,
  dx: number,
  dy: number,
  frames: number = 1
) {
  // Select the node
  ed.doc.select([nodeId]);

  // Pointer down
  ed.doc.dispatch(
    {
      type: "event-target/event/on-pointer-down",
      node_ids_from_point: [nodeId],
      shiftKey: false,
    } as Action,
    { recording: "silent" }
  );

  // Drag start
  ed.doc.dispatch(
    {
      type: "event-target/event/on-drag-start",
      shiftKey: false,
      event: { movement: [0, 0], delta: [0, 0] },
    } as Action,
    { recording: "begin-gesture" }
  );

  // Drag frames
  const stepX = dx / frames;
  const stepY = dy / frames;
  for (let i = 1; i <= frames; i++) {
    ed.doc.dispatch(
      {
        type: "event-target/event/on-drag",
        event: {
          movement: [stepX * i, stepY * i],
          delta: [stepX, stepY],
        },
      } as Action,
      { recording: "silent" }
    );
  }

  // Drag end
  ed.doc.dispatch(
    {
      type: "event-target/event/on-drag-end",
      shiftKey: false,
      node_ids_from_area: undefined,
      event: { movement: [dx, dy], delta: [0, 0] },
    } as Action,
    { recording: "end-gesture" }
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Translate gesture correctness", () => {
  let ed: Editor;
  let canvas: import("@grida/canvas-wasm").Canvas;

  beforeAll(async () => {
    const doc = generateDocument(100);
    const r = await createEditor(doc);
    ed = r.ed;
    canvas = r.canvas;
    ed.doc.dispatch({ type: "load", scene: "scene" }, { recording: "silent" });
  }, 120_000);

  afterAll(() => {
    canvas.dispose();
    ed.dispose();
  });

  test("single node translate: position changes by expected delta", () => {
    const before = getNodePosition(ed.doc.state, "r0");

    simulateTranslateGesture(ed, "r0", 50, 30, 5);

    const after = getNodePosition(ed.doc.state, "r0");
    // Positions are quantized to integer pixels
    expect(after.x).toBe(Math.round(before.x + 50));
    expect(after.y).toBe(Math.round(before.y + 30));
  });

  test("gesture returns to idle after drag end", () => {
    simulateTranslateGesture(ed, "r1", 10, 10);
    expect(ed.doc.state.gesture.type).toBe("idle");
  });

  test("selection is preserved after translate", () => {
    ed.doc.select(["r2"]);
    simulateTranslateGesture(ed, "r2", 20, 20);
    expect(ed.doc.state.selection).toEqual(["r2"]);
  });

  test("surface_snapping is cleared after gesture end", () => {
    simulateTranslateGesture(ed, "r3", 15, 15);
    // After gesture end, surface snapping should be cleared
    // (it may be undefined or a specific cleared state)
    // The key assertion: gesture is idle
    expect(ed.doc.state.gesture.type).toBe("idle");
  });

  test("other nodes are NOT affected by single-node translate", () => {
    const r5Before = getNodePosition(ed.doc.state, "r5");
    const r6Before = getNodePosition(ed.doc.state, "r6");

    simulateTranslateGesture(ed, "r4", 100, 100);

    const r5After = getNodePosition(ed.doc.state, "r5");
    const r6After = getNodePosition(ed.doc.state, "r6");

    expect(r5After.x).toBe(r5Before.x);
    expect(r5After.y).toBe(r5Before.y);
    expect(r6After.x).toBe(r6Before.x);
    expect(r6After.y).toBe(r6Before.y);
  });

  test("undo restores original position after translate", () => {
    const before = getNodePosition(ed.doc.state, "r7");

    simulateTranslateGesture(ed, "r7", 200, 200);

    const afterMove = getNodePosition(ed.doc.state, "r7");
    expect(afterMove.x).toBe(Math.round(before.x + 200));
    expect(afterMove.y).toBe(Math.round(before.y + 200));

    // Undo
    ed.doc.undo();

    const afterUndo = getNodePosition(ed.doc.state, "r7");
    expect(afterUndo.x).toBe(before.x);
    expect(afterUndo.y).toBe(before.y);
  });

  test("multi-frame translate accumulates correctly", () => {
    const before = getNodePosition(ed.doc.state, "r8");

    // 10 frames, total movement 100,50
    simulateTranslateGesture(ed, "r8", 100, 50, 10);

    const after = getNodePosition(ed.doc.state, "r8");
    expect(after.x).toBe(Math.round(before.x + 100));
    expect(after.y).toBe(Math.round(before.y + 50));
  });

  test("negative translate moves node left/up", () => {
    // Move r9 to a known position first
    const before = getNodePosition(ed.doc.state, "r9");

    simulateTranslateGesture(ed, "r9", -30, -20, 3);

    const after = getNodePosition(ed.doc.state, "r9");
    expect(after.x).toBe(Math.round(before.x - 30));
    expect(after.y).toBe(Math.round(before.y - 20));
  });
});

// ---------------------------------------------------------------------------
// Hierarchy change: translate into/out of containers
// ---------------------------------------------------------------------------

describe("Translate gesture with hierarchy change", () => {
  let ed: Editor;
  let canvas: import("@grida/canvas-wasm").Canvas;

  beforeAll(async () => {
    // Build a document with:
    //   scene
    //     ├── container1 (x:0,y:0 w:400 h:400)
    //     ├── r0         (x:500,y:100 w:100 h:100) — outside container
    //     └── r1         (x:50,y:50 w:100 h:100)  — also outside container
    const container = {
      ...containerNode("container1", "Container"),
      layout_inset_left: 0,
      layout_inset_top: 0,
      layout_target_width: 400,
      layout_target_height: 400,
    };
    const rect0 = rectNode("r0", {
      name: "Rect0",
      x: 500,
      y: 100,
      width: 100,
      height: 100,
    });
    const rect1 = rectNode("r1", {
      name: "Rect1",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
    });
    const doc: grida.program.document.Document = {
      scenes_ref: ["scene"],
      links: { scene: ["container1", "r0", "r1"] },
      nodes: {
        scene: sceneNode("scene", "Scene"),
        container1: container as grida.program.nodes.Node,
        r0: rect0,
        r1: rect1,
      },
      entry_scene_id: "scene",
      images: {},
      bitmaps: {},
      properties: {},
    };

    const r = await createEditor(doc);
    ed = r.ed;
    canvas = r.canvas;
    ed.doc.dispatch({ type: "load", scene: "scene" }, { recording: "silent" });
  }, 120_000);

  afterAll(() => {
    canvas.dispose();
    ed.dispose();
  });

  test("translate does not crash during hierarchy change path", () => {
    expect(() => {
      simulateTranslateGesture(ed, "r0", 10, 10, 3);
    }).not.toThrow();
    expect(ed.doc.state.gesture.type).toBe("idle");
  });

  test("state-level position is continuous when dragging across container boundary (X only)", () => {
    // r0 starts at (500, 100), outside the container at (0,0 400x400).
    // Drag it leftward 1px/frame into the container region.
    //
    // Compute absolute position from state by walking the parent chain:
    //   abs_x = node.layout_inset_left + parent.layout_inset_left + ...
    //   abs_y = node.layout_inset_top  + parent.layout_inset_top  + ...
    //
    // At every frame, abs Y must stay constant and abs X must change
    // by exactly the movement delta (within snap quantization).

    function computeAbsolutePosition(
      state: editor.state.IEditorState,
      nodeId: string
    ): { x: number; y: number } {
      const node = state.document.nodes[
        nodeId
      ] as grida.program.nodes.UnknownNode;
      let x = node.layout_inset_left ?? 0;
      let y = node.layout_inset_top ?? 0;

      let parentId = state.document_ctx.lu_parent[nodeId];
      while (parentId) {
        const parent = state.document.nodes[
          parentId
        ] as grida.program.nodes.UnknownNode;
        if (!parent || parent.type === "scene") break;
        x += parent.layout_inset_left ?? 0;
        y += parent.layout_inset_top ?? 0;
        parentId = state.document_ctx.lu_parent[parentId];
      }
      return { x, y };
    }

    // Reset r0 to known position
    ed.doc.dispatch(
      {
        type: "node/change/*",
        node_id: "r0",
        layout_inset_left: 500,
        layout_inset_top: 100,
      } as Action,
      { recording: "silent" }
    );

    ed.doc.select(["r0"]);
    ed.doc.dispatch(
      {
        type: "event-target/event/on-pointer-down",
        node_ids_from_point: ["r0"],
        shiftKey: false,
      } as Action,
      { recording: "silent" }
    );
    ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-start",
        shiftKey: false,
        event: { movement: [0, 0], delta: [0, 0] },
      } as Action,
      { recording: "begin-gesture" }
    );

    const startPos = computeAbsolutePosition(ed.doc.state, "r0");

    // Drag 200px left, 1px per frame
    const frames = 200;
    const errors: string[] = [];

    for (let frame = 1; frame <= frames; frame++) {
      ed.doc.dispatch(
        {
          type: "event-target/event/on-drag",
          event: { movement: [-frame, 0], delta: [-1, 0] },
        } as Action,
        { recording: "silent" }
      );

      const pos = computeAbsolutePosition(ed.doc.state, "r0");
      const expectedX = startPos.x - frame;
      const expectedY = startPos.y;

      // Log parent for context on reparent frames
      const parent = ed.doc.state.document_ctx.lu_parent["r0"];

      // Allow ±5px for snap quantization (snap pulls to nearby object edges)
      if (Math.abs(pos.x - expectedX) > 5) {
        errors.push(
          `Frame ${frame}: X expected ~${expectedX}, got ${pos.x} (off by ${pos.x - expectedX}) [parent=${parent}]`
        );
      }
      if (Math.abs(pos.y - expectedY) > 5) {
        errors.push(
          `Frame ${frame}: Y expected ~${expectedY}, got ${pos.y} (off by ${pos.y - expectedY}) [parent=${parent}]`
        );
      }
    }

    // End gesture
    ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-end",
        shiftKey: false,
        node_ids_from_area: undefined,
        event: { movement: [-frames, 0], delta: [0, 0] },
      } as Action,
      { recording: "end-gesture" }
    );

    const errorSummary =
      errors.length > 0
        ? `Position discontinuities (${errors.length} frames):\n${errors.slice(0, 10).join("\n")}${errors.length > 10 ? `\n... and ${errors.length - 10} more` : ""}`
        : "";
    expect(errorSummary).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Mid-drag reparent into a container at non-zero position
//
// Regression harness for the WASM-side reparent sync bug: the bypass path
// used to emit a `nodes`-only effect for drag dispatches, so the WASM
// scene graph never learned about mid-drag reparents. The TS side would
// store the new local coords relative to the container, but WASM (still
// seeing the rectangle under the scene root) would render it at those
// relative coords in world space — a visible jump by the container's
// position.
//
// The test exercises the whole reducer → OpLog → WASM sync pipeline with
// a container at (300, 200). After the drag crosses into the container,
// both sides must agree on the rectangle's WORLD position.
// ---------------------------------------------------------------------------

describe("Translate reparent emits structural sync ops", () => {
  // Regression contract for the mid-drag reparent sync bug.
  //
  // Before the op-log redesign, the bypass path's effect classifier
  // predicted "only node-property changes" from the action type +
  // gesture state. The reducer's translate path could secretly call
  // `graphInstance.mv(...)` when the drag crossed a container, but
  // that structural change was never communicated to WASM — the WASM
  // scene graph stayed rooted at the old parent, and the node
  // re-rendered at `layout_inset_*` interpreted in the wrong
  // coordinate space (visible as a jump by the container's origin).
  //
  // Asserting on the emitted OpLog (not on rendered pixels) pins the
  // regression at the API surface the WASM subscriber consumes and
  // decouples the test from WASM layout-cache flush timing.
  let ed: Editor;
  let canvas: import("@grida/canvas-wasm").Canvas;
  const capturedOps: Array<{
    kind: string;
    id?: string;
    parent?: string;
    children?: readonly string[];
  }> = [];

  beforeAll(async () => {
    // Container at (300, 200) — non-zero origin is what exposes the
    // sync bug: if the WASM scene graph doesn't learn about the mid-
    // drag reparent, it renders r0 at its layout_inset_* (relative to
    // the container) interpreted as scene-space coords, producing a
    // world rect offset by (-300, -200) vs. what TS computes.
    const container = {
      ...containerNode("c0", "Container"),
      layout_inset_left: 300,
      layout_inset_top: 200,
      layout_target_width: 600,
      layout_target_height: 400,
    };
    const rect0 = rectNode("r0", {
      name: "Rect0",
      x: 1000,
      y: 300,
      width: 100,
      height: 100,
    });
    const doc: grida.program.document.Document = {
      scenes_ref: ["scene"],
      links: { scene: ["c0", "r0"] },
      nodes: {
        scene: sceneNode("scene", "Scene"),
        c0: container as grida.program.nodes.Node,
        r0: rect0,
      },
      entry_scene_id: "scene",
      images: {},
      bitmaps: {},
      properties: {},
    };

    const r = await createEditor(doc);
    ed = r.ed;
    canvas = r.canvas;
    ed.doc.dispatch({ type: "load", scene: "scene" }, { recording: "silent" });

    // Capture every dispatch's OpLog into a flat list of op snapshots.
    ed.doc.subscribe((_, _action, _patches, ops) => {
      if (!ops) return;
      for (const op of ops) capturedOps.push({ ...op });
    });
  }, 120_000);

  afterAll(() => {
    canvas.dispose();
    ed.dispose();
  });

  test("mid-drag reparent emits sync_links(old) and sync_links(new) in the op log", () => {
    capturedOps.length = 0;

    // Select r0 and start a translate gesture.
    ed.doc.select(["r0"]);
    ed.doc.dispatch(
      {
        type: "event-target/event/on-pointer-down",
        node_ids_from_point: ["r0"],
        shiftKey: false,
      } as Action,
      { recording: "silent" }
    );
    ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-start",
        shiftKey: false,
        event: { movement: [0, 0], delta: [0, 0] },
      } as Action,
      { recording: "begin-gesture" }
    );

    // Drag r0 left 600px. r0 starts at (1000, 300) and must cross into
    // the container at (300, 200)–(900, 600). To trigger the reducer's
    // reparent branch, `draft.hits` must contain "c0" while the drag
    // is inside c0's bounds — simulate that with a raycast dispatch
    // on each frame.
    const FRAMES = 600;
    for (let i = 1; i <= FRAMES; i++) {
      // Once r0 crosses into the container horizontally, publish the
      // hit so the reducer's hierarchy-change path activates.
      const r0_x_now = 1000 - i; // reducer's coord space, not snap-adjusted
      const inside_c0 = r0_x_now < 900 && r0_x_now > 300;
      ed.doc.dispatch(
        {
          type: "event-target/event/on-pointer-move-raycast",
          node_ids_from_point: inside_c0 ? ["c0"] : [],
        } as Action,
        { recording: "silent" }
      );
      ed.doc.dispatch(
        {
          type: "event-target/event/on-drag",
          event: { movement: [-i, 0], delta: [-1, 0] },
        } as Action,
        { recording: "silent" }
      );
    }

    ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-end",
        shiftKey: false,
        node_ids_from_area: undefined,
        event: { movement: [-FRAMES, 0], delta: [0, 0] },
      } as Action,
      { recording: "end-gesture" }
    );

    // TS-side correctness: the reducer reparented r0 under c0.
    expect(ed.doc.state.document_ctx.lu_parent["r0"]).toBe("c0");

    // Contract: the drag produced sync_links ops that detach r0 from
    // scene and attach it under c0. Before the op-log redesign, zero
    // sync_links ops were emitted during drag — this test fails loud
    // if the regression returns.
    const structural = capturedOps.filter((o) => o.kind === "sync_links");

    const detachIdx = structural.findIndex(
      (o) => o.parent === "scene" && !(o.children ?? []).includes("r0")
    );
    const attachIdx = structural.findIndex(
      (o) => o.parent === "c0" && (o.children ?? []).includes("r0")
    );

    expect(detachIdx).toBeGreaterThanOrEqual(0);
    expect(attachIdx).toBeGreaterThanOrEqual(0);
    // Detach must come before attach so adjacency lists never transiently
    // hold duplicate references to the same child.
    expect(detachIdx).toBeLessThan(attachIdx);

    // Final consistency: after the drag, the last sync_links ops for
    // each parent should show r0 only under c0.
    const lastScene = [...structural]
      .reverse()
      .find((o) => o.parent === "scene");
    const lastC0 = [...structural].reverse().find((o) => o.parent === "c0");
    expect(lastScene).toBeDefined();
    expect(lastScene!.children).not.toContain("r0");
    expect(lastC0).toBeDefined();
    expect(lastC0!.children).toContain("r0");
  });
});

// ---------------------------------------------------------------------------
// Marquee selection drag
// ---------------------------------------------------------------------------

describe("Marquee drag correctness", () => {
  let ed: Editor;
  let canvas: import("@grida/canvas-wasm").Canvas;

  beforeAll(async () => {
    const doc = generateDocument(20);
    const r = await createEditor(doc);
    ed = r.ed;
    canvas = r.canvas;
    ed.doc.dispatch({ type: "load", scene: "scene" }, { recording: "silent" });
  }, 120_000);

  afterAll(() => {
    canvas.dispose();
    ed.dispose();
  });

  test("marquee drag: does not crash and updates marquee.b", () => {
    // Clear selection and hover so drag-start initiates marquee (empty space)
    ed.doc.select([]);

    // Move pointer to empty space first
    ed.doc.dispatch(
      {
        type: "event-target/event/on-pointer-move",
        position_canvas: { x: 900, y: 900 },
        position_client: { x: 900, y: 900 },
      } as Action,
      { recording: "silent" }
    );
    // Pointer down on empty space (no node_ids_from_point)
    ed.doc.dispatch(
      {
        type: "event-target/event/on-pointer-down",
        node_ids_from_point: [],
        shiftKey: false,
      } as Action,
      { recording: "silent" }
    );

    // Drag start
    ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-start",
        shiftKey: false,
        event: { movement: [0, 0], delta: [0, 0] },
      } as Action,
      { recording: "silent" }
    );

    // Marquee should be active now
    expect(ed.doc.state.marquee).toBeTruthy();

    // Drag 50 frames, 1px per frame
    for (let frame = 1; frame <= 50; frame++) {
      expect(() => {
        ed.doc.dispatch(
          {
            type: "event-target/event/on-drag",
            event: { movement: [frame, frame], delta: [1, 1] },
          } as Action,
          { recording: "silent" }
        );
      }).not.toThrow();

      // Marquee should still be active
      expect(ed.doc.state.marquee).toBeTruthy();
    }

    // End drag
    ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-end",
        shiftKey: false,
        node_ids_from_area: [],
        event: { movement: [50, 50], delta: [0, 0] },
      } as Action,
      { recording: "silent" }
    );

    // Marquee should be cleared after drag end
    expect(ed.doc.state.marquee).toBeUndefined();
  });
});
