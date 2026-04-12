---
name: editor-perf
description: Guides performance investigation, benchmarking, and optimization of the Grida Canvas web editor (TypeScript reducer, Immer, React hooks). Use when profiling reducer dispatch cost, diagnosing slow interactions (drag, resize, color change), writing or running editor benchmarks, instrumenting with PerfObserver, or optimizing the JS-side state management pipeline.
---

# Grida Canvas Editor — Performance Development

Workflow and reasoning framework for performance work on the
**TypeScript editor pipeline** — the reducer, Immer state management,
React subscription layer, and headless benchmarks.

> **Scope boundary:** This skill covers the **JS/TS editor** pipeline
> (`editor/grida-canvas/`). For the **Rust rendering engine** (cg
> crate), use the `cg-perf` skill instead. The two pipelines are
> connected — a dispatch in JS may trigger a WASM re-render — but they
> are profiled with different tools.

> **Maintaining this document:** If you notice a section that has gone
> stale (e.g. a workflow step no longer matches the code, a discovery
> query returns nothing, or a pitfall has been resolved), update this
> `SKILL.md` as part of your current task. Keep it high-level —
> reference patterns and categories rather than specific function names
> or measured numbers, which change frequently.

## When to Use This Skill

- Benchmarking or profiling editor reducer operations
- Diagnosing slow interactions (drag, resize, color picker, opacity slider)
- Investigating Immer overhead or state cloning costs
- Instrumenting code with `PerfObserver` spans
- Writing or running headless benchmarks (`.bench.ts` / `.test.ts`)
- Optimizing queries, snap targets, hover resolution
- Reducing React re-render cost from editor state subscriptions

---

## How to Orient Yourself

Before touching any code, build context by reading these sources in order:

1. **Read `editor/grida-canvas/__tests__/bench/README.md`** — benchmark
   catalog, run instructions, and category definitions.
2. **Read `editor/grida-canvas/perf.ts`** — the `PerfObserver` API.
   Understand `start()`, `measure()`, `report()`, `dump()`.
3. **Skim `editor/grida-canvas/editor.ts`** — the `EditorDocumentStore`
   class, specifically the `dispatch()` method. This is the single
   entry point for all state mutations.
4. **Skim `editor/grida-canvas/reducers/index.ts`** — the root reducer
   that wraps everything in Immer `produceWithPatches`.
5. **Browse the benchmark files** to see what operations are already
   measured and at what scale.

### Key discovery queries

| What you need                | How to find it                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| All instrumented perf spans  | `grep "__perf_" --include="*.ts"` in `editor/grida-canvas/`                           |
| The dispatch entry point     | Search for `dispatch(` in `editor/grida-canvas/editor.ts`                             |
| Root reducer + Immer produce | Read the top-level `reducer()` function in `editor/grida-canvas/reducers/index.ts`    |
| Gesture transform hot path   | Search for `self_update_gesture_transform` in `editor/grida-canvas/reducers/methods/` |
| Document query helpers       | Read `editor/grida-canvas/query/index.ts`                                             |
| React hook subscribers       | `grep "useEditorState" --include="*.ts"` in `editor/grida-canvas-react/`              |
| Action type definitions      | Read `editor/grida-canvas/action.ts`                                                  |
| Existing benchmark files     | `ls editor/grida-canvas/__tests__/bench/`                                             |

---

## The Architecture (Performance-Relevant)

### Dispatch Pipeline

Every user interaction flows through this pipeline:

```
User action (click, drag, keystroke)
  → dispatch(action, recording)
    → Immer produceWithPatches(state, draft => { ... })
      → sub-reducers (document, event-target, surface)
    → history.record(patches)
    → postDispatchHooks
    → emit(action, patches)
      → React selectors + equality checks
```

### Performance-Sensitive Operation Categories

**Gesture-bound (hot loop)** — fires on every frame while the user
drags a handle, slider, or object. These must complete within
~16ms (60fps budget) per frame:

- Property sliders (color picker, opacity, font size)
- Drag translate (moving nodes)
- Resize / scale (corner handles)
- Rotate

**Discrete (single shot)** — fires once per user click or toggle:

- Select, rename, visibility toggle
- Delete, insert
- Gesture start / end (snapshot cost)
- Pointer hover / raycast

### Cost Scaling

Costs scale **linearly** with total node count due to Immer proxy
finalization walking the entire state tree on every dispatch —
even when only a single property on one node changes. This is the
fundamental scaling wall for the current architecture.

Run the benchmarks to get current numbers. The `perf.report()` output
shows exactly which spans dominate at any given scale.

### Bottleneck Categories

Use `GRIDA_PERF=1` to identify which category applies:

| Category                        | How to recognize                                                                         | Where to look                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Immer overhead**              | `reducer.immer_produce` dominates; cost grows with node count regardless of what changed | Root reducer, consider structural sharing or targeted produce    |
| **O(N) tree queries**           | Tree-traversal spans are hot in the breakdown                                            | `query/index.ts` — check if lookups can use pre-built index maps |
| **Deep clone / snapshot**       | `snapshot` span dominates gesture start                                                  | `editor.i.ts` — consider storing only what the gesture needs     |
| **Compute-heavy reducer logic** | Specific spans (snap, hover, transform) dominate                                         | The relevant `reducers/tools/` or `reducers/methods/` file       |
| **React re-render**             | Not visible headless; visible in Chrome DevTools Profiler                                | Selector breadth, equality comparators, virtualization           |

---

## The Benchmark System

Two complementary benchmark files live in
`editor/grida-canvas/__tests__/bench/`.

### 1. Micro-benchmarks (`perf-reducer.bench.ts`)

Uses Vitest `bench()` (Tinybench) for ops/sec and statistical comparison.
Best for fast operations (<10ms) where many samples are possible.

```sh
pnpm vitest bench grida-canvas/__tests__/bench/perf-reducer.bench.ts
```

### 2. E2E macro-benchmarks (`perf-reducer.test.ts`)

Uses manual timing + `PerfObserver` for internal span breakdown.
Best for slow operations (>10ms) like full drag cycles where Tinybench
cannot collect enough samples.

```sh
GRIDA_PERF=1 pnpm vitest run grida-canvas/__tests__/bench/perf-reducer.test.ts

# With extra heap for large scenes
NODE_OPTIONS="--max-old-space-size=8192" GRIDA_PERF=1 \
  pnpm vitest run grida-canvas/__tests__/bench/perf-reducer.test.ts
```

### When to use which

| Question                               | Use                               |
| -------------------------------------- | --------------------------------- |
| Is an operation faster after a change? | `.bench.ts` (ops/sec comparison)  |
| Why is an operation slow? (breakdown)  | `.test.ts` (`PerfObserver` spans) |
| Is the fix a regression for other ops? | `.bench.ts` (run full suite)      |
| How does cost scale with node count?   | `.test.ts` (vary scene size)      |

### WASM raster backend

Both files use a WASM raster backend (`@grida/canvas-wasm` with
`backend: "raster"`) so geometry queries return real bounding rects.
This exercises the full gesture pipeline (snap, transform, scale)
exactly as it runs in production.

### Adding a new benchmark

```ts
// In .bench.ts — use Vitest bench():
bench("my operation", () => {
  ed.doc.dispatch({ type: "...", ... } as any, { recording: "silent" });
}, { time: 2_000, warmupIterations: 3 });

// In .test.ts — use manual bench() helper:
const result = bench(() => {
  ed.doc.dispatch({ type: "...", ... } as any, { recording: "silent" });
}, 20);
logBench("my operation", result);
```

---

## PerfObserver (`perf.ts`)

Opt-in instrumentation layer. Zero cost when disabled (returns a
shared `NOOP` function).

### Enable

```sh
GRIDA_PERF=1              # Node.js / headless tests
NEXT_PUBLIC_GRIDA_PERF=1  # Browser / Next.js (.env.local)
```

Or programmatically:

```ts
import { perf } from "@/grida-canvas/perf";
perf.enable();
```

### Instrument new code

Use the `__perf_` prefix for all perf variables:

```ts
import { perf } from "@/grida-canvas/perf";

function myHotFunction() {
  const __perf_end = perf.start("myHotFunction");
  // ... work ...
  __perf_end();
}

// For functions with multiple return paths, use try/finally:
function myComplexFunction() {
  const __perf_end = perf.start("myComplexFunction");
  try {
    if (earlyExit) return null;
    return result;
  } finally {
    __perf_end();
  }
}

// For wrapping a synchronous call:
const result = perf.measure("expensiveClone", () => doExpensiveWork());
```

### Read results

```ts
perf.report(); // prints formatted table to console
perf.summarize(); // returns PerfSummaryEntry[] (for programmatic use)
perf.dump(); // returns raw PerfSample[]
perf.reset(); // clears all samples
```

### Finding existing spans

Instrumented spans are discoverable via grep:

```sh
grep "__perf_" --include="*.ts" -r editor/grida-canvas/
```

The span labels use dot-notation hierarchy (`dispatch.reducer`,
`dispatch.emit`, etc.) so the `perf.report()` table reads naturally.

---

## The Verification Workflow

**Every performance change follows this sequence.**

### Step 1: Baseline

Run the benchmarks BEFORE any changes. Save the output.

```sh
pnpm vitest bench grida-canvas/__tests__/bench/perf-reducer.bench.ts
GRIDA_PERF=1 pnpm vitest run grida-canvas/__tests__/bench/perf-reducer.test.ts
```

### Step 2: Implement

Make the change. After each logical step, verify:

```sh
pnpm vitest run grida-canvas/__tests__/headless/
pnpm turbo typecheck --filter=editor
```

### Step 3: Measure

Run the same benchmarks AFTER the change. Compare.

### Step 4: Regression check

An optimization for one operation must not regress others. Run the
full benchmark suite, not just the target operation.

### Step 5: Accept or iterate

| Criterion                                    | Required? |
| -------------------------------------------- | --------- |
| Target operation measurably faster           | Yes       |
| Non-target operations within 10% of baseline | Yes       |
| All headless tests pass                      | Yes       |
| No new TypeScript errors                     | Yes       |

---

## How to Design an Optimization

### 1. Measure first

Run benchmarks to quantify the problem. Use `GRIDA_PERF=1` to get the
internal span breakdown. Identify which span dominates.

### 2. Classify the bottleneck

See the "Bottleneck Categories" table above. The `perf.report()` output
directly tells you which category you're dealing with.

### 3. Implement incrementally

Each step should compile, pass existing tests, produce a measurable
improvement in the target benchmark, and not regress other benchmarks.

### 4. Add a benchmark if one doesn't exist

If optimizing an operation that has no benchmark, add one to
`.bench.ts` or `.test.ts` first. Measure before and after.

---

## Pitfalls

### Immer makes everything O(N)

Immer's `produceWithPatches` walks the entire proxy tree during
finalization regardless of how many properties changed. This is
the fundamental scaling wall — even a no-op dispatch has a cost
proportional to total node count.

### Gesture start can freeze the UI

Gesture start may deep-clone the entire document state for undo
snapshots. At scale this causes multi-second freezes and high
memory pressure. Check how snapshot data is captured when
investigating gesture-start lag.

### Headless benchmarks omit React cost

Headless benchmarks measure the reducer + emit pipeline but NOT
React re-render cost. In the browser, subscribers run selectors
and equality checks on every dispatch, and UI panels may re-render
on every pointer move. These costs can only be measured with Chrome
DevTools Profiler.

### WASM geometry adds memory pressure

The WASM raster backend allocates a real scene in memory. At 10K+
nodes, running full gesture benchmarks may OOM at default heap size.
Use `NODE_OPTIONS="--max-old-space-size=8192"`.

### Gesture-bound operations vary wildly

Drag translate can be orders of magnitude slower than resize at the
same node count because translate triggers snap-target computation
(tree queries per selection item) while single-node resize skips
that path. Always bench the specific gesture type, not just
"gesture" generically.

### `recording: "silent"` skips history

Benchmarks use `{ recording: "silent" }` to avoid history stack
growth during repeated dispatches. This correctly isolates reducer
cost but skips the history recording path. Use `{ recording: "on" }`
when specifically benchmarking history overhead.
