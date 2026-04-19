/**
 * Shared helpers for canvas editor E2E benchmarks.
 *
 * These tests exercise the **real WASM sync path** through
 * `Editor.mountHeadless()`, so numbers attribute to the same spans
 * the browser trace shows (`dispatch.wasm.sync_document.*`,
 * `dispatch.wasm.per_node_sync`, `dispatch.reducer`, etc).
 *
 * Opt-in instrumentation:
 *
 * ```sh
 * GRIDA_PERF=1 pnpm vitest run grida-canvas/__tests__/bench/perf-editor.test.ts
 * ```
 *
 * Optional Node CPU profile capture around a single hot call:
 *
 * ```ts
 * await withCpuProfile("delete-bench", async () => {
 *   ed.a11yDelete();
 * });
 * // writes .cpuprofile next to the test file, load in Chrome DevTools
 * ```
 */
import { Editor } from "@/grida-canvas/editor";
import { perf, type PerfSummaryEntry } from "@/grida-canvas/perf";
import { io } from "@grida/io";
import type grida from "@grida/schema";
import type { Scene, Canvas } from "@grida/canvas-wasm";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Environment polyfills for headless runs
// ---------------------------------------------------------------------------

if (typeof globalThis.reportError === "undefined") {
  (
    globalThis as unknown as { reportError: (err: unknown) => void }
  ).reportError = (_err: unknown) => {};
}

// `Editor._scheduleWasmRedraw` uses requestAnimationFrame. In Node we
// polyfill to setImmediate so scheduled redraws actually drain (and
// `dispose()` cancels cleanly). We don't need true 60fps pacing — the
// redraw itself is not what the bench measures. Matches the
// browser's async-redraw semantics: dispatch completes first, paint
// fires later, so per-dispatch timings aren't polluted by paint.
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

// ---------------------------------------------------------------------------
// WASM lazy bootstrap
// ---------------------------------------------------------------------------

let _createCanvas: typeof import("@grida/canvas-wasm").createCanvas | null =
  null;

async function ensureCreateCanvas() {
  if (!_createCanvas) {
    const pkg = await import("@grida/canvas-wasm");
    _createCanvas = pkg.createCanvas;
  }
  return _createCanvas!;
}

// ---------------------------------------------------------------------------
// Editor + WASM surface bootstrap
// ---------------------------------------------------------------------------

export interface WasmEditorHandle {
  ed: Editor;
  canvas: Canvas;
  scene: Scene;
  dispose: () => void;
}

/**
 * Create a headless editor wired to a real WASM raster surface via
 * `Editor.mountHeadless(scene)`.
 *
 * This installs the **same** WASM-bridging subscribers that `mount()`
 * installs in the browser (via the shared `mountShared()` path), so
 * every dispatch runs through `__wasm_on_document_change` — which
 * dispatches on the reducer's {@link Effect} to pick between the fast
 * per-node path (`replaceNode` / `deleteNode`) and a full
 * `__wasm_sync_document` re-encode. Measurements reflect real runtime.
 */
export async function createEditorWithWasmSync(
  doc: grida.program.document.Document,
  opts: { width?: number; height?: number } = {}
): Promise<WasmEditorHandle> {
  const createCanvas = await ensureCreateCanvas();
  const width = opts.width ?? 4096;
  const height = opts.height ?? 4096;

  const ed = Editor.createHeadless(
    { document: doc, editable: true, debug: false },
    { viewport: { width, height } }
  );

  const canvas = await createCanvas({
    backend: "raster",
    width,
    height,
    useEmbeddedFonts: true,
  });

  const scene: Scene = (canvas as unknown as { _scene: Scene })._scene;
  ed.mountHeadless(scene);

  const sceneId = doc.entry_scene_id ?? doc.scenes_ref[0];
  if (sceneId) {
    ed.doc.dispatch({ type: "load", scene: sceneId }, { recording: "silent" });
  }

  return {
    ed,
    canvas,
    scene,
    dispose: () => {
      try {
        canvas.dispose();
      } catch {
        // ignore
      }
      try {
        ed.dispose();
      } catch {
        // ignore
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, "../../../..");

export function fixturePath(...parts: string[]): string {
  return path.resolve(REPO_ROOT, "fixtures", ...parts);
}

/**
 * Load a `.grida` file (ZIP/FlatBuffer archive) from the fixtures tree
 * and return each scene as a standalone single-scene document.
 *
 * The on-disk archive may contain many scenes (e.g. `bench.grida` has
 * 15). Benchmarks usually want to measure one scene at a time, so we
 * split them here — each returned document carries exactly one scene
 * and its transitively-reachable nodes.
 */
export function loadGridaScenes(absPath: string): Array<{
  sceneId: string;
  sceneName: string | undefined;
  nodeCount: number;
  document: grida.program.document.Document;
}> {
  const zipBytes = new Uint8Array(fs.readFileSync(absPath));
  const unpacked = io.archive.unpack(zipBytes);
  const doc = io.GRID.decode(unpacked.document);

  const out: Array<{
    sceneId: string;
    sceneName: string | undefined;
    nodeCount: number;
    document: grida.program.document.Document;
  }> = [];

  for (const sceneId of doc.scenes_ref) {
    const keep = new Set<string>();
    keep.add(sceneId);
    const queue = [...(doc.links[sceneId] ?? [])];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (keep.has(id)) continue;
      keep.add(id);
      const kids = doc.links[id];
      if (kids) queue.push(...kids);
    }

    const nodes: Record<string, grida.program.nodes.Node> = {};
    const links: Record<string, string[]> = {};
    for (const id of keep) {
      if (doc.nodes[id]) nodes[id] = doc.nodes[id];
      if (doc.links[id]) links[id] = [...doc.links[id]];
    }

    const sceneNode = doc.nodes[sceneId] as
      | grida.program.nodes.SceneNode
      | undefined;

    out.push({
      sceneId,
      sceneName: sceneNode?.name,
      nodeCount: keep.size - 1, // exclude scene node itself
      document: {
        scenes_ref: [sceneId],
        links,
        nodes,
        entry_scene_id: sceneId,
        images: doc.images ?? {},
        bitmaps: doc.bitmaps ?? {},
        properties: doc.properties ?? {},
      } as grida.program.document.Document,
    });
  }

  return out;
}

/**
 * Convenience wrapper — loads `fixtures/test-grida/bench.grida` and
 * returns the requested scene as a single-scene document.
 *
 * @throws if the fixture isn't present (not checked into CI in every
 *   configuration).
 */
export function loadBenchGridaScene(sceneName: string): {
  sceneId: string;
  nodeCount: number;
  document: grida.program.document.Document;
} {
  const scenes = loadGridaScenes(fixturePath("test-grida", "bench.grida"));
  const match = scenes.find(
    (s) => s.sceneId === sceneName || s.sceneName === sceneName
  );
  if (!match) {
    throw new Error(
      `scene "${sceneName}" not found in bench.grida; available: ${scenes
        .map((s) => `${s.sceneId} (${s.sceneName ?? "?"})`)
        .join(", ")}`
    );
  }
  return match;
}

// ---------------------------------------------------------------------------
// Manual bench driver — used for operations too slow for Tinybench
// ---------------------------------------------------------------------------

export interface BenchStats {
  count: number;
  mean: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface BenchOptions {
  /** Warmup iterations (not recorded). Default: min(3, iterations/2). */
  warmup?: number;
  /** Sampled iterations. */
  iterations?: number;
  /** Called before each sample (not timed). Useful for resetting state. */
  setup?: () => void | Promise<void>;
}

/**
 * Run `fn` repeatedly and return wall-clock statistics.
 *
 * Does NOT force-reset `perf` between samples — when `GRIDA_PERF=1`,
 * spans from every call accumulate, which is what you want for the
 * aggregate summary table.
 */
export async function bench(
  fn: () => void | Promise<void>,
  opts: BenchOptions = {}
): Promise<BenchStats> {
  const iterations = opts.iterations ?? 20;
  const warmup = opts.warmup ?? Math.min(3, Math.floor(iterations / 2));
  const times: number[] = [];

  for (let i = 0; i < warmup; i++) {
    if (opts.setup) await opts.setup();
    await fn();
  }

  for (let i = 0; i < iterations; i++) {
    if (opts.setup) await opts.setup();
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }

  times.sort((a, b) => a - b);
  const n = times.length;
  return {
    count: n,
    mean: times.reduce((a, b) => a + b, 0) / n,
    min: times[0],
    max: times[n - 1],
    p50: pct(times, 0.5),
    p95: pct(times, 0.95),
    p99: pct(times, 0.99),
  };
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function fmtMs(ms: number): string {
  if (ms < 0.01) return "<0.01ms";
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 100) return `${ms.toFixed(2)}ms`;
  return `${ms.toFixed(1)}ms`;
}

export function logBench(label: string, r: BenchStats): void {
  console.log(
    `  ${label.padEnd(44)} ` +
      `n=${String(r.count).padEnd(4)} ` +
      `mean=${fmtMs(r.mean).padEnd(10)} ` +
      `p50=${fmtMs(r.p50).padEnd(10)} ` +
      `p95=${fmtMs(r.p95).padEnd(10)} ` +
      `max=${fmtMs(r.max)}`
  );
}

/**
 * Print the PerfObserver summary filtered to spans whose label matches
 * any of the given prefixes (or all spans if omitted), then reset.
 */
export function dumpPerfAndReset(prefixes?: string[]): void {
  if (!perf.enabled) return;
  const entries = perf.summarize();
  const filtered = prefixes
    ? entries.filter((e) => prefixes.some((p) => e.label.startsWith(p)))
    : entries;

  if (filtered.length === 0) {
    perf.reset();
    return;
  }

  console.log(
    "\n[perf] ─────────────────────────────────────────────────────────"
  );
  console.log(`[perf] ${filtered.length} labels`);
  const header = `${"label".padEnd(46)} ${"count".padEnd(6)} ${"total".padEnd(
    10
  )} ${"mean".padEnd(10)} ${"p50".padEnd(10)} ${"p95".padEnd(10)} ${"max".padEnd(
    10
  )}`;
  console.log(`[perf] ${header}`);
  console.log(`[perf] ${"─".repeat(header.length)}`);
  for (const e of filtered) {
    console.log(
      `[perf] ${e.label.padEnd(46)} ${String(e.count).padEnd(
        6
      )} ${fmtMs(e.total_ms).padEnd(10)} ${fmtMs(e.mean_ms).padEnd(
        10
      )} ${fmtMs(e.p50_ms).padEnd(10)} ${fmtMs(e.p95_ms).padEnd(
        10
      )} ${fmtMs(e.max_ms).padEnd(10)}`
    );
  }
  console.log(
    "[perf] ─────────────────────────────────────────────────────────\n"
  );
  perf.reset();
}

/**
 * Return the PerfObserver summary as a map keyed by label. Useful for
 * asserting on specific spans in tests without parsing the printed
 * table.
 */
export function perfSummaryByLabel(): Record<string, PerfSummaryEntry> {
  const out: Record<string, PerfSummaryEntry> = {};
  for (const e of perf.summarize()) out[e.label] = e;
  return out;
}

// ---------------------------------------------------------------------------
// node:inspector CPU profile capture
// ---------------------------------------------------------------------------

/**
 * Wrap `fn` in a CPU profile and write it next to the calling file.
 *
 * Uses `node:inspector` — no V8 CLI flag required. The resulting
 * `.cpuprofile` file loads in Chrome DevTools (Performance → "Load
 * profile"), VS Code, or any tool that reads the standard v8 format.
 *
 * Writes to `fixtures/local/perf/cpuprofile/<name>-<epoch>.cpuprofile`
 * (git-ignored via `fixtures/local/**`).
 *
 * Opt-in: set `GRIDA_PERF_CPUPROFILE=1` to actually capture. Otherwise
 * this function is a no-op pass-through so the same test code works
 * in CI without writing artifacts.
 */
export async function withCpuProfile<T>(
  name: string,
  fn: () => Promise<T> | T
): Promise<T> {
  if (process.env.GRIDA_PERF_CPUPROFILE !== "1") {
    return await fn();
  }

  const inspector = await import("node:inspector/promises");
  const session = new inspector.Session();
  session.connect();
  try {
    await session.post("Profiler.enable");
    await session.post("Profiler.start");

    const result = await fn();

    const { profile } = (await session.post("Profiler.stop")) as {
      profile: unknown;
    };

    const outDir = path.resolve(
      REPO_ROOT,
      "fixtures",
      "local",
      "perf",
      "cpuprofile"
    );
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${name}-${Date.now()}.cpuprofile`);
    fs.writeFileSync(outPath, JSON.stringify(profile));
    console.log(`  [cpuprofile] ${outPath}`);

    return result;
  } finally {
    try {
      await session.post("Profiler.disable");
    } catch {
      // ignore
    }
    session.disconnect();
  }
}
