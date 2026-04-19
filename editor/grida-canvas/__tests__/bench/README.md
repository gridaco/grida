# Canvas Editor Performance Benchmarks

End-to-end benchmarks for the Grida Canvas editor dispatch pipeline.
All scenarios run in Node.js against the **real WASM raster backend** via
`Editor.mountHeadless()`. Headless and DOM mount share the same
`mountShared(surface)` bridge, so every subscriber the browser installs
(document / scene_id / isolation / debug / pixelpreview / outline /
highlightStrokes) runs here too — numbers are trustworthy for tuning
per-node sync / `__wasm_sync_document` cost; see caveats below.

## Files

| File                  | Purpose                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `perf-editor.test.ts` | **Single source of truth.** Runs every scenario against 1K synthetic + selected `bench.grida` scenes         |
| `_utils.ts`           | Shared helpers: `createEditorWithWasmSync`, `loadGridaScenes`, `bench`, `dumpPerfAndReset`, `withCpuProfile` |

## Running

```sh
# Full run (synthetic + bench.grida if present)
GRIDA_PERF=1 pnpm vitest run grida-canvas/__tests__/bench/perf-editor.test.ts

# With CPU profile captures around `delete` scenarios
#   → writes fixtures/local/perf/cpuprofile/*.cpuprofile (load in Chrome DevTools)
GRIDA_PERF=1 GRIDA_PERF_CPUPROFILE=1 pnpm vitest run \
  grida-canvas/__tests__/bench/perf-editor.test.ts

# Heavy fixtures need more heap
NODE_OPTIONS="--max-old-space-size=8192" GRIDA_PERF=1 pnpm vitest run \
  grida-canvas/__tests__/bench/perf-editor.test.ts
```

## What gets measured

Each scene runs the same parametrized suite:

| Group         | Scenario                                                         |
| ------------- | ---------------------------------------------------------------- |
| `discrete`    | select, rename, fill color, opacity, visibility toggle           |
| `raycast`     | pointer move (no raycast), raycast hover resolve                 |
| `gesture`     | drag per-frame, resize per-frame, drag start+end (snapshot cost) |
| `destructive` | delete one node (single-shot, optionally CPU-profiled)           |

### Scenes

- **1K synthetic** — always runs. Portable grid of 1,000 rectangles.
- **`bench-flat-grid`** — 10K siblings under the scene (wide, shallow).
- **`bench-wide-container`** — 1 container with 10K children (deep one level).

Curated from `fixtures/test-grida/bench.grida` for graph-shape diversity.
Add more scenes by extending `BENCH_SCENARIOS` in [`perf-editor.test.ts`](./perf-editor.test.ts).

## `PerfObserver` spans

Set `GRIDA_PERF=1` to emit a summary table per scene on `afterAll`. The
spans below are what the editor instruments — grouping is by `dispatch.*`
prefix so you can see reducer vs. WASM cost at a glance.

| Span                                       | Where                           | What it measures                                          |
| ------------------------------------------ | ------------------------------- | --------------------------------------------------------- |
| `dispatch`                                 | `editor.ts`                     | Full dispatch cycle (reducer + history + hooks + emit)    |
| `dispatch.reducer`                         | `editor.ts`                     | Reducer execution per action                              |
| `dispatch.history`                         | `editor.ts`                     | History recording per action                              |
| `dispatch.hooks`                           | `editor.ts`                     | Post-dispatch hooks                                       |
| `dispatch.emit`                            | `editor.ts`                     | Listener notification (incl. WASM subscriber)             |
| `dispatch.wasm.sync`                       | `editor.ts`                     | Total time in the document-change WASM subscriber         |
| `dispatch.wasm.sync_document`              | `editor.ts`                     | Full document reload (encode + load_scene + switch_scene) |
| `dispatch.wasm.sync_document.encode`       | `editor.ts`                     | `io.GRID.encode(document)` → FlatBuffer bytes             |
| `dispatch.wasm.sync_document.load_scene`   | `editor.ts`                     | `Scene.loadSceneGrida(bytes)` — decode into WASM cache    |
| `dispatch.wasm.sync_document.switch_scene` | `editor.ts`                     | `Scene.switchScene(sceneId)` — install decoded scene      |
| `dispatch.wasm.per_node_sync`              | `editor.ts`                     | Fast per-node path — `Scene.replaceNode` / `deleteNode`   |
| `dispatch.wasm.switch_scene`               | `editor.ts`                     | Scene-id-only switch (no document reload)                 |
| `reducer.immer_produce`                    | `reducers/index.ts`             | Immer `produceWithPatches`                                |
| `snapshot`                                 | `editor.i.ts`                   | `JSON.parse(JSON.stringify(document))` deep clone         |
| `gesture_transform`                        | `reducers/methods/transform.ts` | Per-frame gesture transform                               |
| `getSnapTargets`                           | `reducers/tools/snap.ts`        | Snap target computation                                   |
| `getRayTarget`                             | `reducers/tools/target.ts`      | Hover ray target resolution                               |
| `dq.getSiblings`                           | `query/index.ts`                | Sibling lookup (O(N) scan)                                |
| `dq.getChildren`                           | `query/index.ts`                | Children lookup (O(N) scan)                               |

`perf.ts` is the runtime — `GRIDA_PERF=1` or `NEXT_PUBLIC_GRIDA_PERF=1`
enables collection globally with zero overhead when off.

## How sync routing works

The `__wasm_on_document_change` subscriber does **not** inspect Immer
patches to pick a sync strategy. Routing is driven by a first-class
`Effect` type (`grida-canvas/sync.ts`) the reducer returns alongside the
new state:

- `none` — selection / marquee / hover only; the subscriber no-ops.
- `nodes` — bounded set of node ids whose props changed or were
  removed; the subscriber calls `replaceNode` / `deleteNode`
  (`dispatch.wasm.per_node_sync`).
- `structural` — scene graph / links / bitmaps / properties changed;
  the subscriber re-encodes the whole scene
  (`dispatch.wasm.sync_document`).

Both the Immer path (via `effectFromPatches(patches)`) and the mutable
bypass path (via `effectForBypassAction(state, action)`) produce the
same Effect protocol, so the hot gesture loop — which uses the bypass
and emits **no patches** — still routes through the fast per-node sync
instead of silently falling back to a full re-encode. Regressions are
guarded by span-count invariants in
[`perf-editor.test.ts`](./perf-editor.test.ts) ("routing invariants").

## When to trust the numbers

- **`dispatch.wasm.*` — trust.** End-to-end identical to the browser.
  A 2× improvement here lands 2× in the browser.
- **`reducer.immer_produce` — trust.** Pure JS, Node and browser V8 track
  each other within ~10%.
- **Absolute wall-clock — trust _ratios_ over _absolutes_.** A/B on the
  same machine is meaningful; cross-machine comparisons are not.
- **Not covered:** paint/compositor/GPU cost, real 60fps RAF pressure,
  browser memory, viewport ResizeObserver. If a change moves work into
  paint, verify with a browser trace before declaring victory.

## CPU profile capture

`withCpuProfile(name, fn)` in `_utils.ts` wraps a call in
`node:inspector` and writes a `.cpuprofile` to
`fixtures/local/perf/cpuprofile/`. Opt-in via `GRIDA_PERF_CPUPROFILE=1`
so CI runs stay artifact-free. Load the file in Chrome DevTools
(Performance → "Load profile") or VS Code.
