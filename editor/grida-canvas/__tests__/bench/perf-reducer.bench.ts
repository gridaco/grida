/**
 * Headless performance benchmarks for the canvas editor reducer.
 *
 * Uses Vitest `bench()` (Tinybench) for ops/sec + comparison.
 * Uses `PerfObserver` (`perf.ts`) for internal span breakdown when
 * `GRIDA_PERF=1` is set.
 *
 * Uses the real WASM raster backend for correct bounding rects.
 *
 * Organized by interaction pattern:
 *
 *   **Gesture-bound (hot loop)** — user drags a slider / handle:
 *     - fill color change
 *     - opacity change
 *     - drag translate per-frame
 *     - resize (scale) per-frame
 *
 *   **Discrete (single shot)** — click / toggle:
 *     - rename
 *     - select
 *     - delete
 *     - insert
 *     - active (visibility) toggle
 *     - drag start+end cycle
 *     - pointer move / hover
 *
 * Run:
 *   pnpm vitest bench grida-canvas/__tests__/headless/perf-reducer.bench.ts
 *
 * With internal breakdown:
 *   GRIDA_PERF=1 pnpm vitest bench grida-canvas/__tests__/headless/perf-reducer.bench.ts
 *
 * @vitest-environment node
 */
import { bench, describe, beforeAll, afterAll } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { CanvasWasmGeometryQueryInterfaceProvider } from "@/grida-canvas/backends/wasm";
import { perf } from "@/grida-canvas/perf";
import { sceneNode, rectNode } from "@/grida-canvas/__tests__/utils/factories";
import { io } from "@grida/io";
import type grida from "@grida/schema";
import type { Scene } from "@grida/canvas-wasm";
import type { Action } from "@/grida-canvas/action";

// ---------------------------------------------------------------------------
// Polyfills
// ---------------------------------------------------------------------------

if (typeof globalThis.reportError === "undefined") {
  (
    globalThis as unknown as { reportError: (err: unknown) => void }
  ).reportError = (_err: unknown) => {};
}

// ---------------------------------------------------------------------------
// Scene generation
// ---------------------------------------------------------------------------

function generateLargeDocument(n: number): grida.program.document.Document {
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

// ---------------------------------------------------------------------------
// WASM bootstrap (once per file)
// ---------------------------------------------------------------------------

let _createCanvas: typeof import("@grida/canvas-wasm").createCanvas;

beforeAll(async () => {
  const pkg = await import("@grida/canvas-wasm");
  _createCanvas = pkg.createCanvas;
}, 30_000);

async function createEditorWithWasm(
  doc: grida.program.document.Document
): Promise<{
  ed: Editor;
  canvas: import("@grida/canvas-wasm").Canvas;
  scene: Scene;
}> {
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
  try {
    const bytes = io.GRID.encode(doc);
    scene.loadSceneGrida(bytes);
  } catch {
    scene.loadScene(JSON.stringify({ version: 4, document: doc }));
  }
  scene.switchScene("scene");
  (
    ed as unknown as { _m_geometry: CanvasWasmGeometryQueryInterfaceProvider }
  )._m_geometry = new CanvasWasmGeometryQueryInterfaceProvider(ed, scene);
  return { ed, canvas, scene };
}

// ---------------------------------------------------------------------------
// Tinybench options
// ---------------------------------------------------------------------------

/** For fast ops (~1-5ms): enough time for many samples. */
const FAST = { time: 2_000, warmupIterations: 3 } as const;

/** For slow ops (~40ms+): fewer samples but still statistically valid. */
const SLOW = { time: 5_000, warmupIterations: 1 } as const;

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  1 000 NODES                                                          ║
// ╚═════════════════════════════════════════════════════════════════════════╝

describe("1K nodes", () => {
  let ed: Editor;
  let canvas: import("@grida/canvas-wasm").Canvas;

  beforeAll(async () => {
    perf.enable();
    perf.reset();
    const doc = generateLargeDocument(1_000);
    const r = await createEditorWithWasm(doc);
    ed = r.ed;
    canvas = r.canvas;
    ed.doc.dispatch({ type: "load", scene: "scene" }, { recording: "silent" });
  }, 120_000);

  afterAll(() => {
    perf.report();
    perf.reset();
    canvas.dispose();
    ed.dispose();
  });

  // ─── gesture-bound (hot loop) ──────────────────────────────────────────

  describe("gesture-bound (hot loop)", () => {
    bench(
      "fill color change",
      () => {
        ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: "r0",
            fill: {
              type: "solid",
              color: { r: Math.random(), g: Math.random(), b: 0, a: 1 },
              active: true,
            },
          } as unknown as Action,
          { recording: "silent" }
        );
      },
      FAST
    );

    bench(
      "opacity change",
      () => {
        ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: "r0",
            opacity: Math.random(),
          } as unknown as Action,
          { recording: "silent" }
        );
      },
      FAST
    );

    // Drag translate: start gesture once, bench the per-frame dispatch.
    describe("drag translate", () => {
      let dx = 0;

      beforeAll(() => {
        ed.doc.select(["r0"]);
        ed.doc.dispatch(
          {
            type: "event-target/event/on-pointer-down",
            node_ids_from_point: ["r0"],
            shiftKey: false,
          } as unknown as Action,
          { recording: "silent" }
        );
        ed.doc.dispatch(
          {
            type: "event-target/event/on-drag-start",
            shiftKey: false,
            event: { movement: [0, 0], delta: [0, 0] },
          } as unknown as Action,
          { recording: "begin-gesture" }
        );
      });

      afterAll(() => {
        ed.doc.dispatch(
          {
            type: "event-target/event/on-drag-end",
            shiftKey: false,
            node_ids_from_area: undefined,
            event: { movement: [dx, 0], delta: [0, 0] },
          } as unknown as Action,
          { recording: "end-gesture" }
        );
      });

      bench(
        "per-frame translate",
        () => {
          dx += 1;
          ed.doc.dispatch(
            {
              type: "event-target/event/on-drag",
              event: { movement: [dx, 0], delta: [1, 0] },
            } as unknown as Action,
            { recording: "silent" }
          );
        },
        SLOW
      );
    });

    // Resize: start gesture once, bench the per-frame dispatch.
    describe("resize (scale)", () => {
      let dy = 0;

      beforeAll(() => {
        ed.doc.select(["r1"]);
        ed.doc.dispatch(
          {
            type: "surface/gesture/start",
            gesture: { type: "scale", selection: ["r1"], direction: "se" },
          } as unknown as Action,
          { recording: "begin-gesture" }
        );
      });

      afterAll(() => {
        ed.doc.dispatch(
          {
            type: "event-target/event/on-drag-end",
            shiftKey: false,
            node_ids_from_area: undefined,
            event: { movement: [dy, dy], delta: [0, 0] },
          } as unknown as Action,
          { recording: "end-gesture" }
        );
      });

      bench(
        "per-frame scale",
        () => {
          dy += 1;
          ed.doc.dispatch(
            {
              type: "event-target/event/on-drag",
              event: { movement: [dy, dy], delta: [1, 1] },
            } as unknown as Action,
            { recording: "silent" }
          );
        },
        FAST
      );
    });
  });

  // ─── discrete (single shot) ────────────────────────────────────────────

  describe("discrete (single shot)", () => {
    bench(
      "rename",
      () => {
        ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: "r0",
            name: `R-${Math.random()}`,
          } as unknown as Action,
          { recording: "silent" }
        );
      },
      FAST
    );

    bench(
      "select",
      () => {
        ed.doc.dispatch(
          { type: "select", selection: ["r1"] } as unknown as Action,
          {
            recording: "silent",
          }
        );
      },
      FAST
    );

    bench(
      "active (visibility) toggle",
      () => {
        // Toggle off then on so net state is unchanged
        ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: "r2",
            active: false,
          } as unknown as Action,
          { recording: "silent" }
        );
        ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: "r2",
            active: true,
          } as unknown as Action,
          { recording: "silent" }
        );
      },
      FAST
    );

    bench(
      "delete + insert cycle",
      () => {
        // Delete a node then re-insert it so the scene stays stable
        ed.doc.dispatch(
          { type: "delete", target: ["r99"] } as unknown as Action,
          {
            recording: "silent",
          }
        );
        ed.doc.dispatch(
          {
            type: "insert",
            target: "scene",
            id: "r99",
            prototype: {
              type: "rectangle",
              _$id: "r99",
              layout_target_width: 100,
              layout_target_height: 100,
              layout_inset_left: 0,
              layout_inset_top: 0,
              fill: {
                type: "solid",
                color: { r: 0, g: 0, b: 0, a: 1 },
                active: true,
              },
            },
          } as unknown as Action,
          { recording: "silent" }
        );
      },
      FAST
    );

    bench(
      "drag start+end cycle (snapshot cost)",
      () => {
        ed.doc.select(["r0"]);
        ed.doc.dispatch(
          {
            type: "event-target/event/on-drag-start",
            shiftKey: false,
            event: { movement: [0, 0], delta: [0, 0] },
          } as unknown as Action,
          { recording: "begin-gesture" }
        );
        ed.doc.dispatch(
          {
            type: "event-target/event/on-drag-end",
            shiftKey: false,
            node_ids_from_area: undefined,
            event: { movement: [0, 0], delta: [0, 0] },
          } as unknown as Action,
          { recording: "end-gesture" }
        );
      },
      SLOW
    );

    bench(
      "pointer move (no raycast)",
      () => {
        ed.doc.dispatch(
          {
            type: "event-target/event/on-pointer-move",
            position_canvas: { x: 100, y: 100 },
            position_client: { x: 100, y: 100 },
          } as unknown as Action,
          { recording: "silent" }
        );
      },
      FAST
    );

    bench(
      "pointer move raycast (hover resolve)",
      () => {
        ed.doc.select(["r5"]);
        ed.doc.dispatch(
          {
            type: "event-target/event/on-pointer-move-raycast",
            node_ids_from_point: ["r10", "r11", "r12"],
          } as unknown as Action,
          { recording: "silent" }
        );
      },
      FAST
    );
  });
});

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  10 000 NODES                                                         ║
// ╚═════════════════════════════════════════════════════════════════════════╝

describe("10K nodes", () => {
  let ed: Editor;
  let canvas: import("@grida/canvas-wasm").Canvas;

  beforeAll(async () => {
    perf.enable();
    perf.reset();
    const doc = generateLargeDocument(10_000);
    const r = await createEditorWithWasm(doc);
    ed = r.ed;
    canvas = r.canvas;
    ed.doc.dispatch({ type: "load", scene: "scene" }, { recording: "silent" });
  }, 120_000);

  afterAll(() => {
    perf.report();
    perf.reset();
    canvas.dispose();
    ed.dispose();
  });

  // ─── gesture-bound ─────────────────────────────────────────────────────

  describe("gesture-bound (hot loop)", () => {
    bench(
      "fill color change",
      () => {
        ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: "r0",
            fill: {
              type: "solid",
              color: { r: Math.random(), g: Math.random(), b: 0, a: 1 },
              active: true,
            },
          } as unknown as Action,
          { recording: "silent" }
        );
      },
      FAST
    );

    bench(
      "opacity change",
      () => {
        ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: "r0",
            opacity: Math.random(),
          } as unknown as Action,
          { recording: "silent" }
        );
      },
      FAST
    );
  });

  // ─── discrete ──────────────────────────────────────────────────────────

  describe("discrete (single shot)", () => {
    bench(
      "rename",
      () => {
        ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: "r0",
            name: `R-${Math.random()}`,
          } as unknown as Action,
          { recording: "silent" }
        );
      },
      FAST
    );

    bench(
      "select",
      () => {
        ed.doc.dispatch(
          { type: "select", selection: ["r1"] } as unknown as Action,
          {
            recording: "silent",
          }
        );
      },
      FAST
    );

    bench(
      "active (visibility) toggle",
      () => {
        ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: "r2",
            active: false,
          } as unknown as Action,
          { recording: "silent" }
        );
        ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: "r2",
            active: true,
          } as unknown as Action,
          { recording: "silent" }
        );
      },
      FAST
    );

    bench(
      "drag start+end cycle (snapshot cost)",
      () => {
        ed.doc.select(["r0"]);
        ed.doc.dispatch(
          {
            type: "event-target/event/on-drag-start",
            shiftKey: false,
            event: { movement: [0, 0], delta: [0, 0] },
          } as unknown as Action,
          { recording: "begin-gesture" }
        );
        ed.doc.dispatch(
          {
            type: "event-target/event/on-drag-end",
            shiftKey: false,
            node_ids_from_area: undefined,
            event: { movement: [0, 0], delta: [0, 0] },
          } as unknown as Action,
          { recording: "end-gesture" }
        );
      },
      SLOW
    );

    bench(
      "pointer move raycast (hover resolve)",
      () => {
        ed.doc.select(["r5"]);
        ed.doc.dispatch(
          {
            type: "event-target/event/on-pointer-move-raycast",
            node_ids_from_point: ["r10", "r11", "r12"],
          } as unknown as Action,
          { recording: "silent" }
        );
      },
      FAST
    );
  });
});
