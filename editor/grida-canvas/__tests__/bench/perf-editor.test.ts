/**
 * End-to-end performance harness for the canvas editor dispatch path.
 *
 * This is the **single source of truth** for editor-level perf numbers.
 * Every test uses `Editor.mountHeadless()`, so dispatches run through the
 * real `__wasm_on_document_change` subscriber, which dispatches on the
 * reducer's {@link Effect} to pick between the fast per-node path
 * (`replaceNode` / `deleteNode`) and the full `__wasm_sync_document`
 * re-encode — exactly like the browser.
 *
 * Run:
 *
 * ```sh
 * GRIDA_PERF=1 pnpm vitest run grida-canvas/__tests__/bench/perf-editor.test.ts
 *
 * # With optional CPU profile capture around delete scenarios
 * #   writes fixtures/local/perf/cpuprofile/*.cpuprofile (load in Chrome DevTools)
 * GRIDA_PERF=1 GRIDA_PERF_CPUPROFILE=1 pnpm vitest run \
 *   grida-canvas/__tests__/bench/perf-editor.test.ts
 *
 * # Heavy fixtures need extra heap
 * NODE_OPTIONS="--max-old-space-size=8192" GRIDA_PERF=1 \
 *   pnpm vitest run grida-canvas/__tests__/bench/perf-editor.test.ts
 * ```
 *
 * @vitest-environment node
 */
import { describe, test, beforeAll, afterAll, expect } from "vitest";
import { perf } from "@/grida-canvas/perf";
import type { Action } from "@/grida-canvas/action";
import { sceneNode, rectNode } from "@/grida-canvas/__tests__/utils/factories";
import type grida from "@grida/schema";
import * as fs from "fs";
import {
  createEditorWithWasmSync,
  type WasmEditorHandle,
  bench,
  logBench,
  dumpPerfAndReset,
  withCpuProfile,
  fixturePath,
  loadGridaScenes,
} from "./_utils";

const SCENE_TIMEOUT = 300_000;

// ---------------------------------------------------------------------------
// Synthetic scenes — portable, always available
// ---------------------------------------------------------------------------

function generateGridDocument(n: number): grida.program.document.Document {
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
// Shared scenario suite — parametrized by node count & target ids
// ---------------------------------------------------------------------------

interface ScenarioTargets {
  /** Node mutated by property-change tests (fill/opacity/rename/toggle). */
  propNode: string;
  /** Node selected and dragged / resized. */
  dragNode: string;
  /** Node safely deletable without corrupting other tests. */
  deleteNode: string;
  /** Candidate ids returned by raycast (non-empty). */
  raycastIds: string[];
}

interface ScenarioOptions {
  /**
   * Scenarios to skip for this scene. Drag translate reparents through
   * the root, which fails on scenes with a maxDegree=1 top-level
   * (e.g. `bench-wide-container`). Declare known incompatibilities here
   * rather than silently swallowing errors.
   */
  skip?: Array<"drag-translate">;
}

function runScenarios(
  label: string,
  getHandle: () => WasmEditorHandle,
  targets: ScenarioTargets,
  opts: ScenarioOptions = {}
) {
  const skip = new Set(opts.skip ?? []);
  describe(`discrete`, () => {
    test("select", { timeout: SCENE_TIMEOUT }, async () => {
      const h = getHandle();
      const result = await bench(() => {
        h.ed.doc.dispatch(
          {
            type: "select",
            selection: [targets.propNode],
          } as unknown as Action,
          { recording: "silent" }
        );
      });
      logBench(`select (${label})`, result);
    });

    test("rename", { timeout: SCENE_TIMEOUT }, async () => {
      const h = getHandle();
      let i = 0;
      const result = await bench(() => {
        h.ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: targets.propNode,
            name: `n${i++}`,
          } as unknown as Action,
          { recording: "silent" }
        );
      });
      logBench(`rename (${label})`, result);
    });

    test("fill color change", { timeout: SCENE_TIMEOUT }, async () => {
      const h = getHandle();
      const result = await bench(() => {
        h.ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: targets.propNode,
            fill: {
              type: "solid",
              color: { r: Math.random(), g: 0, b: 0, a: 1 },
              active: true,
            },
          } as unknown as Action,
          { recording: "silent" }
        );
      });
      logBench(`fill color (${label})`, result);
    });

    test("opacity change", { timeout: SCENE_TIMEOUT }, async () => {
      const h = getHandle();
      const result = await bench(() => {
        h.ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: targets.propNode,
            opacity: Math.random(),
          } as unknown as Action,
          { recording: "silent" }
        );
      });
      logBench(`opacity (${label})`, result);
    });

    test("visibility toggle", { timeout: SCENE_TIMEOUT }, async () => {
      const h = getHandle();
      let on = false;
      const result = await bench(() => {
        on = !on;
        h.ed.doc.dispatch(
          {
            type: "node/change/*",
            node_id: targets.propNode,
            active: on,
          } as unknown as Action,
          { recording: "silent" }
        );
      });
      logBench(`visibility toggle (${label})`, result);
    });
  });

  describe(`raycast`, () => {
    test("pointer move (no raycast)", { timeout: SCENE_TIMEOUT }, async () => {
      const h = getHandle();
      const result = await bench(() => {
        h.ed.doc.dispatch(
          {
            type: "event-target/event/on-pointer-move",
            position_canvas: { x: 100, y: 100 },
            position_client: { x: 100, y: 100 },
          } as unknown as Action,
          { recording: "silent" }
        );
      });
      logBench(`pointer move (${label})`, result);
    });

    test(
      "pointer move raycast (hover resolve)",
      { timeout: SCENE_TIMEOUT },
      async () => {
        const h = getHandle();
        h.ed.doc.select([targets.propNode]);
        const result = await bench(() => {
          h.ed.doc.dispatch(
            {
              type: "event-target/event/on-pointer-move-raycast",
              node_ids_from_point: targets.raycastIds,
            } as unknown as Action,
            { recording: "silent" }
          );
        });
        logBench(`raycast (${label})`, result);
      }
    );
  });

  describe(`gesture`, () => {
    test.skipIf(skip.has("drag-translate"))(
      "drag translate: per-frame",
      { timeout: SCENE_TIMEOUT },
      async () => {
        const h = getHandle();
        h.ed.doc.select([targets.dragNode]);
        h.ed.doc.dispatch(
          {
            type: "event-target/event/on-pointer-down",
            node_ids_from_point: [targets.dragNode],
            shiftKey: false,
          } as unknown as Action,
          { recording: "silent" }
        );
        h.ed.doc.dispatch(
          {
            type: "event-target/event/on-drag-start",
            shiftKey: false,
            event: { movement: [0, 0], delta: [0, 0] },
          } as unknown as Action,
          { recording: "begin-gesture" }
        );

        let dx = 1;
        const result = await bench(
          () => {
            dx += 1;
            h.ed.doc.dispatch(
              {
                type: "event-target/event/on-drag",
                event: { movement: [dx, 0], delta: [1, 0] },
              } as unknown as Action,
              { recording: "silent" }
            );
          },
          { iterations: 10 }
        );

        h.ed.doc.dispatch(
          {
            type: "event-target/event/on-drag-end",
            shiftKey: false,
            node_ids_from_area: undefined,
            event: { movement: [dx, 0], delta: [0, 0] },
          } as unknown as Action,
          { recording: "end-gesture" }
        );

        logBench(`drag per-frame (${label})`, result);
      }
    );

    test("resize: per-frame", { timeout: SCENE_TIMEOUT }, async () => {
      const h = getHandle();
      h.ed.doc.select([targets.dragNode]);
      h.ed.doc.dispatch(
        {
          type: "surface/gesture/start",
          gesture: {
            type: "scale",
            selection: [targets.dragNode],
            direction: "se",
          },
        } as unknown as Action,
        { recording: "begin-gesture" }
      );

      let dy = 1;
      const result = await bench(
        () => {
          dy += 1;
          h.ed.doc.dispatch(
            {
              type: "event-target/event/on-drag",
              event: { movement: [dy, dy], delta: [1, 1] },
            } as unknown as Action,
            { recording: "silent" }
          );
        },
        { iterations: 10 }
      );

      h.ed.doc.dispatch(
        {
          type: "event-target/event/on-drag-end",
          shiftKey: false,
          node_ids_from_area: undefined,
          event: { movement: [dy, dy], delta: [0, 0] },
        } as unknown as Action,
        { recording: "end-gesture" }
      );

      logBench(`resize per-frame (${label})`, result);
    });

    test(
      "drag start+end cycle (snapshot cost)",
      { timeout: SCENE_TIMEOUT },
      async () => {
        const h = getHandle();
        h.ed.doc.select([targets.dragNode]);
        const result = await bench(
          () => {
            h.ed.doc.dispatch(
              {
                type: "event-target/event/on-drag-start",
                shiftKey: false,
                event: { movement: [0, 0], delta: [0, 0] },
              } as unknown as Action,
              { recording: "begin-gesture" }
            );
            h.ed.doc.dispatch(
              {
                type: "event-target/event/on-drag-end",
                shiftKey: false,
                node_ids_from_area: undefined,
                event: { movement: [0, 0], delta: [0, 0] },
              } as unknown as Action,
              { recording: "end-gesture" }
            );
          },
          { iterations: 10 }
        );
        logBench(`drag start+end (${label})`, result);
      }
    );
  });

  describe(`destructive`, () => {
    test(
      "delete one node (single shot, CPU-profiled)",
      { timeout: SCENE_TIMEOUT },
      async () => {
        const h = getHandle();
        const t0 = performance.now();
        await withCpuProfile(`delete-${label}`, () => {
          h.ed.doc.dispatch(
            { type: "delete", target: [targets.deleteNode] } as Action,
            { recording: "silent" }
          );
        });
        const elapsed = performance.now() - t0;
        console.log(
          `  delete(${targets.deleteNode}) on ${label}: ${elapsed.toFixed(1)}ms`
        );
      }
    );
  });
}

// ---------------------------------------------------------------------------
// 1K synthetic — always runs
// ---------------------------------------------------------------------------

describe("perf-editor: 1K synthetic", () => {
  let h: WasmEditorHandle;

  beforeAll(async () => {
    perf.enable();
    perf.reset();
    h = await createEditorWithWasmSync(generateGridDocument(1_000));
    console.log(`\n── perf-editor: 1K synthetic ──`);
  }, SCENE_TIMEOUT);

  afterAll(() => {
    dumpPerfAndReset();
    h?.dispose();
  });

  runScenarios("1K", () => h, {
    propNode: "r0",
    dragNode: "r1",
    // Delete from the tail so propNode/dragNode stay intact.
    deleteNode: "r999",
    raycastIds: ["r10", "r11", "r12"],
  });
});

// ---------------------------------------------------------------------------
// bench.grida — real production fixture (conditional)
// ---------------------------------------------------------------------------

const BENCH_GRIDA = fixturePath("test-grida", "bench.grida");
const HAS_BENCH_GRIDA = fs.existsSync(BENCH_GRIDA);

// Curated subset of bench.grida scenes covering distinct graph shapes:
//   - flat-grid: wide, shallow (10K siblings under scene)
//   - wide-container: deep one level (10K children inside a container)
const BENCH_SCENARIOS: Array<{
  scene: string;
  description: string;
  skip?: ScenarioOptions["skip"];
}> = [
  { scene: "bench-flat-grid", description: "10K rectangles in 100x100 grid" },
  {
    scene: "bench-wide-container",
    description: "1 container + 10K children",
    // Top-level container has maxDegree=1 — drag-translate reparents
    // through the root, which the fixture's graph disallows.
    skip: ["drag-translate"],
  },
];

describe.skipIf(!HAS_BENCH_GRIDA)("perf-editor: bench.grida", () => {
  beforeAll(() => {
    perf.enable();
    perf.reset();
  });

  for (const { scene, description, skip } of BENCH_SCENARIOS) {
    describe(`${scene} — ${description}`, () => {
      let h: WasmEditorHandle;
      let targets: ScenarioTargets;

      beforeAll(async () => {
        const scenes = loadGridaScenes(BENCH_GRIDA);
        const match = scenes.find(
          (s) => s.sceneId === scene || s.sceneName === scene
        );
        if (!match) {
          throw new Error(
            `bench.grida is missing scene "${scene}"; had: ${scenes
              .map((s) => s.sceneId)
              .join(", ")}`
          );
        }
        console.log(
          `\n── ${scene}: ${match.nodeCount.toLocaleString()} nodes ──`
        );

        h = await createEditorWithWasmSync(match.document);

        // Collect leaf-level ids. For wide-container, dig one level past
        // the sole top-level container to reach the real draggable nodes.
        const sceneId = match.sceneId;
        let leaves = [...(match.document.links[sceneId] ?? [])];
        if (leaves.length === 1) {
          const sole = leaves[0];
          const grand = match.document.links[sole];
          if (grand && grand.length > 0) leaves = [...grand];
        }
        if (leaves.length < 3) {
          throw new Error(
            `scene ${scene} does not have enough leaves for the scenario suite`
          );
        }

        targets = {
          propNode: leaves[0],
          dragNode: leaves[1],
          deleteNode: leaves[leaves.length - 1],
          raycastIds: leaves.slice(2, 5),
        };
      }, SCENE_TIMEOUT);

      afterAll(() => {
        dumpPerfAndReset();
        h?.dispose();
      });

      runScenarios(
        scene,
        () => h,
        {
          get propNode() {
            return targets.propNode;
          },
          get dragNode() {
            return targets.dragNode;
          },
          get deleteNode() {
            return targets.deleteNode;
          },
          get raycastIds() {
            return targets.raycastIds;
          },
        },
        { skip }
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Routing invariants — guard the Effect protocol against regressions.
//
// These tests do not measure *time*; they measure which WASM sync path was
// taken per dispatch. A regression that silently reintroduces a full
// document re-encode on the hot path (e.g. by breaking the bypass / Effect
// wiring) is invisible to wall-clock microbenches because the reduced
// throughput hides in averages — but the span counts change by an order of
// magnitude. Asserting on them catches it immediately.
// ---------------------------------------------------------------------------

function countSpans(label: string): number {
  return perf.dump().filter((s) => s.label === label).length;
}

describe("perf-editor: routing invariants", () => {
  let h: WasmEditorHandle;

  beforeAll(async () => {
    perf.enable();
    h = await createEditorWithWasmSync(generateGridDocument(100));
    // Clear spans collected during mount + initial document/load so the
    // assertions below only see what the hot-path dispatches produced.
    perf.reset();
  }, SCENE_TIMEOUT);

  afterAll(() => {
    h?.dispose();
  });

  test("node/change/* dispatches route through per-node sync", () => {
    const before = countSpans("dispatch.wasm.sync_document");
    const beforePerNode = countSpans("dispatch.wasm.per_node_sync");
    const N = 10;
    for (let i = 0; i < N; i++) {
      h.ed.doc.dispatch(
        {
          type: "node/change/*",
          node_id: "r0",
          name: `n${i}`,
        } as unknown as Action,
        { recording: "silent" }
      );
    }
    expect(countSpans("dispatch.wasm.sync_document") - before).toBe(0);
    expect(countSpans("dispatch.wasm.per_node_sync") - beforePerNode).toBe(N);
  });

  test("pointer-move (no raycast) emits EFFECT_NONE (neither sync path fires)", () => {
    const beforeFull = countSpans("dispatch.wasm.sync_document");
    const beforePerNode = countSpans("dispatch.wasm.per_node_sync");
    const N = 10;
    for (let i = 0; i < N; i++) {
      h.ed.doc.dispatch(
        {
          type: "event-target/event/on-pointer-move",
          position_canvas: { x: i, y: i },
          position_client: { x: i, y: i },
        } as unknown as Action,
        { recording: "silent" }
      );
    }
    expect(countSpans("dispatch.wasm.sync_document") - beforeFull).toBe(0);
    expect(countSpans("dispatch.wasm.per_node_sync") - beforePerNode).toBe(0);
  });

  test("drag per-frame does not fall back to full sync_document", async () => {
    h.ed.doc.select(["r1"]);
    h.ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-start",
        shiftKey: false,
        event: { movement: [0, 0], delta: [0, 0] },
      } as unknown as Action,
      { recording: "begin-gesture" }
    );

    const before = countSpans("dispatch.wasm.sync_document");
    const beforePerNode = countSpans("dispatch.wasm.per_node_sync");
    const N = 10;
    for (let i = 1; i <= N; i++) {
      h.ed.doc.dispatch(
        {
          type: "event-target/event/on-drag",
          event: { movement: [i, 0], delta: [1, 0] },
        } as unknown as Action,
        { recording: "silent" }
      );
    }

    h.ed.doc.dispatch(
      {
        type: "event-target/event/on-drag-end",
        shiftKey: false,
        node_ids_from_area: undefined,
        event: { movement: [N, 0], delta: [0, 0] },
      } as unknown as Action,
      { recording: "end-gesture" }
    );

    // Per-frame drag MUST route through per_node_sync. A regression here
    // means the bypass/Effect wiring broke and the hot path is re-encoding
    // the whole document every frame — which pushes 60fps drag past the
    // frame budget at 10K+ nodes.
    expect(countSpans("dispatch.wasm.sync_document") - before).toBe(0);
    expect(countSpans("dispatch.wasm.per_node_sync") - beforePerNode).toBe(N);
  });
});
