/**
 * E2E performance test for the canvas editor reducer at scale.
 *
 * Complements `perf-reducer.bench.ts` (Tinybench micro-benchmarks).
 * This file uses `PerfObserver` to measure **internal breakdown** of
 * slow operations that Tinybench cannot meaningfully profile
 * (>10ms per call, few iterations before OOM/timeout).
 *
 * Uses the real WASM raster backend for correct bounding rects.
 *
 * Run:
 *   GRIDA_PERF=1 pnpm vitest run grida-canvas/__tests__/bench/perf-reducer.test.ts
 *
 * @vitest-environment node
 */
import { describe, test, beforeAll, afterAll } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { CanvasWasmGeometryQueryInterfaceProvider } from "@/grida-canvas/backends/wasm";
import { perf } from "@/grida-canvas/perf";
import { sceneNode, rectNode } from "@/grida-canvas/__tests__/utils/factories";
import { io } from "@grida/io";
import type grida from "@grida/schema";
import type { Scene } from "@grida/canvas-wasm";

// ---------------------------------------------------------------------------
// Polyfills
// ---------------------------------------------------------------------------

if (typeof globalThis.reportError === "undefined") {
  (globalThis as any).reportError = (_err: any) => {};
}

// ---------------------------------------------------------------------------
// Scene generation
// ---------------------------------------------------------------------------

function generateLargeDocument(n: number): grida.program.document.Document {
  const children: string[] = [];
  const nodes: Record<string, any> = {
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
// Manual bench helper
// ---------------------------------------------------------------------------

function bench(
  fn: () => void,
  iterations: number = 20
): { mean: number; min: number; max: number; p50: number; p95: number } {
  const times: number[] = [];
  for (let i = 0; i < 3; i++) fn(); // warmup
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const n = times.length;
  return {
    mean: times.reduce((a, b) => a + b, 0) / n,
    min: times[0],
    max: times[n - 1],
    p50: times[Math.ceil(0.5 * n) - 1],
    p95: times[Math.ceil(0.95 * n) - 1],
  };
}

function fmtMs(ms: number): string {
  if (ms < 0.01) return "<0.01ms";
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`;
}

function logBench(label: string, r: ReturnType<typeof bench>) {
  console.log(
    `  ${label.padEnd(40)} mean=${fmtMs(r.mean).padEnd(10)} p50=${fmtMs(r.p50).padEnd(10)} p95=${fmtMs(r.p95).padEnd(10)} max=${fmtMs(r.max)}`
  );
}

// ---------------------------------------------------------------------------
// WASM bootstrap
// ---------------------------------------------------------------------------

let _createCanvas: (opts: any) => Promise<any>;

beforeAll(async () => {
  const pkg = await import("@grida/canvas-wasm");
  _createCanvas = pkg.createCanvas;
}, 30_000);

async function createEditorWithWasm(
  doc: grida.program.document.Document
): Promise<{ ed: Editor; canvas: any; scene: Scene }> {
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
  const scene: Scene = (canvas as any)._scene;
  try {
    const bytes = io.GRID.encode(doc);
    scene.loadSceneGrida(bytes);
  } catch {
    scene.loadScene(JSON.stringify({ version: 4, document: doc }));
  }
  const sceneId = doc.entry_scene_id ?? doc.scenes_ref[0];
  scene.switchScene(sceneId);
  (ed as any)._m_geometry = new CanvasWasmGeometryQueryInterfaceProvider(
    ed,
    scene
  );
  return { ed, canvas, scene };
}

// ---------------------------------------------------------------------------
// 1 000 nodes — full gesture paths
// ---------------------------------------------------------------------------

describe("E2E perf: 1K nodes (WASM geometry)", () => {
  let ed: Editor;
  let canvas: any;

  beforeAll(async () => {
    perf.enable();
    perf.reset();
    const doc = generateLargeDocument(1_000);
    const r = await createEditorWithWasm(doc);
    ed = r.ed;
    canvas = r.canvas;
    ed.doc.dispatch({ type: "load", scene: "scene" }, { recording: "silent" });
    console.log(`\n── E2E bench: 1,000 nodes (WASM geometry) ──`);
  }, 120_000);

  afterAll(() => {
    perf.report();
    perf.reset();
    canvas.dispose();
    ed.dispose();
  });

  test("drag translate: per-frame", { timeout: 120_000 }, () => {
    ed.doc.select(["r0"]);
    ed.doc.dispatch(
      {
        type: "event-target/event/on-pointer-down",
        node_ids_from_point: ["r0"],
        shiftKey: false,
      } as any,
      { recording: "silent" }
    );
    ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-start",
        shiftKey: false,
        event: { movement: [0, 0], delta: [0, 0] },
      } as any,
      { recording: "begin-gesture" }
    );

    let dx = 1;
    const result = bench(() => {
      dx += 1;
      ed.doc.dispatch(
        {
          type: "event-target/event/on-drag",
          event: { movement: [dx, 0], delta: [1, 0] },
        } as any,
        { recording: "silent" }
      );
    }, 10);

    ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-end",
        shiftKey: false,
        node_ids_from_area: undefined,
        event: { movement: [dx, 0], delta: [0, 0] },
      } as any,
      { recording: "end-gesture" }
    );

    logBench("drag per-frame (translate)", result);
  });

  test("resize: per-frame", { timeout: 120_000 }, () => {
    ed.doc.select(["r1"]);
    ed.doc.dispatch(
      {
        type: "surface/gesture/start",
        gesture: { type: "scale", selection: ["r1"], direction: "se" },
      } as any,
      { recording: "begin-gesture" }
    );

    let dy = 1;
    const result = bench(() => {
      dy += 1;
      ed.doc.dispatch(
        {
          type: "event-target/event/on-drag",
          event: { movement: [dy, dy], delta: [1, 1] },
        } as any,
        { recording: "silent" }
      );
    }, 10);

    ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-end",
        shiftKey: false,
        node_ids_from_area: undefined,
        event: { movement: [dy, dy], delta: [0, 0] },
      } as any,
      { recording: "end-gesture" }
    );

    logBench("resize per-frame (scale)", result);
  });

  test("fill color change (hot loop sim)", { timeout: 30_000 }, () => {
    ed.doc.select(["r0"]);
    const result = bench(() => {
      ed.doc.dispatch(
        {
          type: "node/change/*",
          node_id: "r0",
          fill: {
            type: "solid",
            color: { r: Math.random(), g: Math.random(), b: 0, a: 1 },
            active: true,
          },
        } as any,
        { recording: "silent" }
      );
    });
    logBench("fill color change", result);
  });

  test("opacity change (hot loop sim)", { timeout: 30_000 }, () => {
    ed.doc.select(["r0"]);
    const result = bench(() => {
      ed.doc.dispatch(
        {
          type: "node/change/*",
          node_id: "r0",
          opacity: Math.random(),
        } as any,
        { recording: "silent" }
      );
    });
    logBench("opacity change", result);
  });
});

// ---------------------------------------------------------------------------
// Isolated Immer overhead proof
// ---------------------------------------------------------------------------
import { produceWithPatches, enablePatches } from "immer";

describe("Immer isolation: pure overhead measurement", () => {
  enablePatches();

  function make1KState() {
    const nodes: Record<string, any> = {};
    for (let i = 0; i < 1000; i++) {
      nodes[`r${i}`] = {
        id: `r${i}`,
        type: "container",
        layout_inset_left: i * 10,
        layout_inset_top: i * 10,
        layout_target_width: 100,
        layout_target_height: 100,
        opacity: 1,
      };
    }
    return { nodes, gesture: { type: "translate", movement: [0, 0] } };
  }

  test("produceWithPatches: write 1 node in 1K dict", () => {
    let state = make1KState();
    // freeze it like Immer does after a produce
    state = JSON.parse(JSON.stringify(state));
    Object.freeze(state);

    const result = bench(() => {
      const [next] = produceWithPatches(state, (draft: any) => {
        draft.nodes["r0"].layout_inset_left += 1;
        draft.nodes["r0"].layout_inset_top += 1;
      });
      state = next;
    });
    logBench("immer: 1 node write / 1K dict", result);
  });

  test("manual immutable update: write 1 node in 1K dict", () => {
    let state = make1KState();

    const result = bench(() => {
      const node = state.nodes["r0"];
      state = {
        ...state,
        nodes: {
          ...state.nodes,
          ["r0"]: {
            ...node,
            layout_inset_left: node.layout_inset_left + 1,
            layout_inset_top: node.layout_inset_top + 1,
          },
        },
      };
    });
    logBench("manual: 1 node write / 1K dict", result);
  });

  test("direct mutation: write 1 node in 1K dict", () => {
    const state = make1KState();

    const result = bench(() => {
      state.nodes["r0"].layout_inset_left += 1;
      state.nodes["r0"].layout_inset_top += 1;
    });
    logBench("direct mut: 1 node write / 1K dict", result);
  });
});

// ---------------------------------------------------------------------------
// produce vs produceWithPatches on real editor state
// ---------------------------------------------------------------------------
import { produce } from "immer";

describe("Immer bypass comparison (real 1K state)", () => {
  test("produce vs produceWithPatches vs direct spread", async () => {
    const doc = generateLargeDocument(1_000);
    const r = await createEditorWithWasm(doc);
    r.ed.doc.dispatch(
      { type: "load", scene: "scene" },
      { recording: "silent" }
    );

    // Start a gesture to get the state into gesture mode
    r.ed.doc.select(["r0"]);
    r.ed.doc.dispatch(
      {
        type: "event-target/event/on-pointer-down",
        node_ids_from_point: ["r0"],
        shiftKey: false,
      } as any,
      { recording: "silent" }
    );
    r.ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-start",
        shiftKey: false,
        event: { movement: [0, 0], delta: [0, 0] },
      } as any,
      { recording: "begin-gesture" }
    );

    let state = r.ed.doc.state;

    // Test produceWithPatches
    const pwpResult = bench(() => {
      const [next] = produceWithPatches(state, (draft: any) => {
        draft.document.nodes["r0"].layout_inset_left += 1;
        draft.document.nodes["r0"].layout_inset_top += 1;
        draft.gesture.movement = [1, 0];
        draft.surface_snapping = undefined;
      });
      state = next;
    });
    logBench("produceWithPatches (real 1K state)", pwpResult);

    // Test produce (no patches)
    const pResult = bench(() => {
      const next = produce(state, (draft: any) => {
        draft.document.nodes["r0"].layout_inset_left += 1;
        draft.document.nodes["r0"].layout_inset_top += 1;
        draft.gesture.movement = [1, 0];
        draft.surface_snapping = undefined;
      });
      state = next;
    });
    logBench("produce no-patches (real 1K state)", pResult);

    // Test direct mutation + shallow spread
    const dmResult = bench(() => {
      const node = state.document.nodes["r0"] as any;
      const nextNode = {
        ...node,
        layout_inset_left: node.layout_inset_left + 1,
        layout_inset_top: node.layout_inset_top + 1,
      };
      state = {
        ...state,
        document: {
          ...state.document,
          nodes: { ...state.document.nodes, r0: nextNode },
        },
        gesture: { ...(state as any).gesture, movement: [1, 0] },
        surface_snapping: undefined,
      } as any;
    });
    logBench("direct spread (real 1K state)", dmResult);

    // Test structuredClone + mutate
    const scResult = bench(() => {
      const next = structuredClone(state) as any;
      next.document.nodes["r0"].layout_inset_left += 1;
      next.document.nodes["r0"].layout_inset_top += 1;
      next.gesture.movement = [1, 0];
      next.surface_snapping = undefined;
      state = next;
    });
    logBench("structuredClone + mutate (real 1K)", scResult);

    // Test JSON round-trip + mutate
    const jResult = bench(() => {
      const next = JSON.parse(JSON.stringify(state)) as any;
      next.document.nodes["r0"].layout_inset_left += 1;
      next.document.nodes["r0"].layout_inset_top += 1;
      next.gesture.movement = [1, 0];
      next.surface_snapping = undefined;
      state = next;
    });
    logBench("JSON clone + mutate (real 1K)", jResult);

    r.canvas.dispose();
    r.ed.dispose();
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Real-world fixture benchmark (local only — file may not exist in CI)
// ---------------------------------------------------------------------------
import * as fs from "fs";
import * as path from "path";

const FIXTURE_PATH = path.resolve(
  __dirname,
  "../../../../fixtures/local/perf/grida/01-135k.perf.grida"
);
const HAS_FIXTURE = fs.existsSync(FIXTURE_PATH);

describe.skipIf(!HAS_FIXTURE)("Real fixture: 135K nodes (local only)", () => {
  let ed: Editor;
  let canvas: any;
  let nodeCount: number;
  let firstNodeId: string;

  beforeAll(async () => {
    perf.enable();
    perf.reset();

    const zipBytes = new Uint8Array(fs.readFileSync(FIXTURE_PATH));
    const unpacked = io.archive.unpack(zipBytes);
    const doc = io.GRID.decode(unpacked.document);
    nodeCount = Object.keys(doc.nodes).length;
    console.log(`\n── Real fixture: ${nodeCount.toLocaleString()} nodes ──`);

    // Pick a leaf node (rectangle/text) that has geometry to drag.
    // Traverse breadth-first until we find a non-container node.
    const sceneId = doc.entry_scene_id ?? doc.scenes_ref[0];
    const queue = [...(doc.links[sceneId] ?? [])];
    firstNodeId = queue[0]; // fallback
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = doc.nodes[id] as any;
      // Pick a simple, absolutely-positioned node with geometry
      const draggable = new Set([
        "rectangle",
        "ellipse",
        "image",
        "vector",
        "line",
      ]);
      if (
        node &&
        draggable.has(node.type) &&
        node.layout_positioning === "absolute"
      ) {
        firstNodeId = id;
        break;
      }
      const kids = doc.links[id];
      if (kids) queue.push(...kids);
    }
    console.log(
      `  scene=${sceneId}, test node=${firstNodeId} (${(doc.nodes[firstNodeId] as any)?.type})`
    );

    const r = await createEditorWithWasm(doc);
    ed = r.ed;
    canvas = r.canvas;
    ed.doc.dispatch({ type: "load", scene: sceneId }, { recording: "silent" });
  }, 300_000);

  afterAll(() => {
    perf.report();
    perf.reset();
    canvas?.dispose();
    ed?.dispose();
  });

  test("spread cost measurement", () => {
    const nodes = ed.doc.state.document.nodes;
    const links = ed.doc.state.document.links;
    const result = bench(() => {
      const _n = { ...nodes };
      const _l: Record<string, string[]> = {};
      for (const key in links) {
        _l[key] = links[key] ? [...links[key]] : [];
      }
    }, 10);
    logBench(`spread nodes+links (${nodeCount} nodes)`, result);
  });

  test("drag translate: per-frame", { timeout: 600_000 }, () => {
    ed.doc.select([firstNodeId]);
    ed.doc.dispatch(
      {
        type: "event-target/event/on-pointer-down",
        node_ids_from_point: [firstNodeId],
        shiftKey: false,
      } as any,
      { recording: "silent" }
    );
    ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-start",
        shiftKey: false,
        event: { movement: [0, 0], delta: [0, 0] },
      } as any,
      { recording: "begin-gesture" }
    );

    let dx = 1;
    const result = bench(() => {
      dx += 1;
      ed.doc.dispatch(
        {
          type: "event-target/event/on-drag",
          event: { movement: [dx, 0], delta: [1, 0] },
        } as any,
        { recording: "silent" }
      );
    }, 5); // fewer iterations — each frame is expensive at 135K nodes
    logBench(`drag per-frame (translate, ${nodeCount} nodes)`, result);

    ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-end",
        shiftKey: false,
        node_ids_from_area: undefined,
        event: { movement: [dx, 0], delta: [0, 0] },
      } as any,
      { recording: "end-gesture" }
    );
  });

  test("fill color change", { timeout: 60_000 }, () => {
    const result = bench(() => {
      ed.doc.dispatch(
        {
          type: "node/change/*",
          node_id: firstNodeId,
          fill: {
            type: "solid",
            color: { r: Math.random(), g: 0, b: 0, a: 1 },
          },
        } as any,
        { recording: "silent" }
      );
    });
    logBench(`fill color (${nodeCount} nodes)`, result);
  });
});
