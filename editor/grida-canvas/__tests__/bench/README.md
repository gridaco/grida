# Canvas Editor Performance Benchmarks

Headless benchmarks for the Grida Canvas editor reducer pipeline.
All benchmarks run in Node.js using the **WASM raster backend** — no browser or DOM required.

## Files

| File                    | Tool                           | Purpose                                                             |
| ----------------------- | ------------------------------ | ------------------------------------------------------------------- |
| `perf-reducer.bench.ts` | Vitest `bench()` (Tinybench)   | Micro-benchmarks: ops/sec for fast operations (<10ms)               |
| `perf-reducer.test.ts`  | Manual timing + `PerfObserver` | E2E macro-benchmarks: internal breakdown of slow operations (>10ms) |

## Running

```sh
# Micro-benchmarks (ops/sec, comparison)
pnpm vitest bench grida-canvas/__tests__/bench/perf-reducer.bench.ts

# E2E benchmarks (wall-clock + internal span breakdown)
GRIDA_PERF=1 pnpm vitest run grida-canvas/__tests__/bench/perf-reducer.test.ts

# Both need extra heap for large scenes
NODE_OPTIONS="--max-old-space-size=8192" GRIDA_PERF=1 pnpm vitest run grida-canvas/__tests__/bench/
```

## Benchmark Categories

### Gesture-bound (hot loop)

Operations that fire continuously while the user drags a slider, handle, or object.
These must complete within **16.6ms** (60fps budget) per frame.

- **fill color change** — dragging a color picker
- **opacity change** — dragging an opacity slider
- **drag translate per-frame** — moving a selected node
- **resize (scale) per-frame** — resizing via corner handle

### Discrete (single shot)

Operations that fire once per user click or toggle.

- **rename** — changing a node name
- **select** — selecting a node
- **active (visibility) toggle** — showing/hiding a node
- **delete + insert** — removing and adding a node
- **drag start+end cycle** — measures `snapshot()` cost
- **pointer move / hover** — cursor movement and raycast resolution

## Why Two Files?

Vitest `bench()` (Tinybench) is designed for **micro-benchmarks** — operations that complete in microseconds, run thousands of times to compute statistically valid ops/sec.

Slow operations (e.g. drag per-frame at 800ms/call) produce too few samples for Tinybench to compute meaningful statistics. These go in the `.test.ts` file with manual `performance.now()` loops and `PerfObserver` for internal breakdown.

## PerfObserver (`perf.ts`)

Orthogonal instrumentation layer that records internal spans within dispatch cycles.
Zero-cost when disabled.

```sh
# Enable via env
GRIDA_PERF=1        # Node.js / tests
NEXT_PUBLIC_GRIDA_PERF=1  # Browser / Next.js

# Or programmatically
import { perf } from "@/grida-canvas/perf";
perf.enable();
// ... work ...
perf.report();  // prints summary table
perf.reset();
```

### Instrumented spans

| Span                    | Where                           | What it measures                                       |
| ----------------------- | ------------------------------- | ------------------------------------------------------ |
| `dispatch`              | `editor.ts`                     | Full dispatch cycle (reducer + history + hooks + emit) |
| `dispatch.reducer`      | `editor.ts`                     | Reducer execution per action                           |
| `dispatch.history`      | `editor.ts`                     | History recording per action                           |
| `dispatch.hooks`        | `editor.ts`                     | Post-dispatch hooks                                    |
| `dispatch.emit`         | `editor.ts`                     | Listener notification                                  |
| `reducer.immer_produce` | `reducers/index.ts`             | Immer `produceWithPatches`                             |
| `snapshot`              | `editor.i.ts`                   | `JSON.parse(JSON.stringify(document))` deep clone      |
| `gesture_transform`     | `reducers/methods/transform.ts` | Per-frame gesture transform                            |
| `getSnapTargets`        | `reducers/tools/snap.ts`        | Snap target computation                                |
| `getRayTarget`          | `reducers/tools/target.ts`      | Hover ray target resolution                            |
| `dq.getSiblings`        | `query/index.ts`                | Sibling lookup (O(N) scan)                             |
| `dq.getChildren`        | `query/index.ts`                | Children lookup (O(N) scan)                            |
