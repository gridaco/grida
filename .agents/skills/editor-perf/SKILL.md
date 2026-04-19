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
- Writing or running the editor bench
- Optimizing queries, snap targets, hover resolution
- Reducing React re-render cost from editor state subscriptions

---

## Pick your measurement tool

Performance work starts with the right signal. The three tools below are
complementary — do not skip the browser trace if the user offers one,
do not open a browser for a reducer-only regression.

| Tool                                            | Use when                                                                                                               | What it catches                                                                                        | What it misses                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| **Browser trace (Chrome DevTools Performance)** | User provided a `.json.gz` trace, or the symptom is interaction-level (drag/nudge feels laggy). **This is the truth.** | Everything on the main thread: React, selector cost, paint, compositor, GC, WASM, reducer, Immer, RAF. | Not reproducible without the user's session |
| **editor-bench** (automated)                    | Default for proactive investigation and A/B of a reducer / encode / WASM change. No user input needed.                 | `PerfObserver` span table, per-scene (1K / 10K). Deterministic and comparable across runs.             | React render cost, DOM overlays, real RAF   |
| **Node CPU profile**                            | A bench span points at a hotspot but you need function-level detail inside it, or microtask timing.                    | Function self-time and call chains within a single Node process.                                       | Browser-only code paths                     |

### Decision rules

1. **If the user provides a browser trace, start there.** It already has
   React, DevTools, and WASM on the same timeline — quote actual
   numbers from the trace rather than guessing. Parse it as JSON
   (see "Reading a browser trace" below).
2. **Otherwise run the bench first.** No user input needed — it covers
   every scenario at 1K and 10K and emits a `PerfObserver` span table
   that's directly comparable across runs.
3. **Once bench points at a span, drill with a Node CPU profile.**
   Use the `withCpuProfile()` helper in `_utils.ts`, or run node with
   `--cpu-prof`. Open the resulting `.cpuprofile` in Chrome DevTools
   (Performance → Load profile) for a function-level flame graph
   inside the span.

## How to Orient Yourself

Before touching any code, build context by reading these sources in order:

1. **Read `editor/grida-canvas/__tests__/bench/README.md`** — benchmark
   catalog, run instructions, and the authoritative list of
   `PerfObserver` spans with a "when to trust the numbers" guide.
2. **Read `editor/grida-canvas/perf.ts`** — the `PerfObserver` API.
   Understand `start()`, `measure()`, `report()`, `dump()`.
3. **Skim `editor/grida-canvas/editor.ts`** — the `EditorDocumentStore`
   class, specifically the `dispatch()` method. This is the single
   entry point for all state mutations.
4. **Skim `editor/grida-canvas/reducers/index.ts`** — the root reducer
   that wraps everything in Immer `produceWithPatches`.
5. **Browse the bench files** (`perf-editor.test.ts`,
   `perf-per-node-sync.test.ts`) to see what operations are already
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

The single source of truth is `perf-editor.test.ts` in
`editor/grida-canvas/__tests__/bench/`. It uses `Editor.mountHeadless()`
with the **real WASM raster backend** — every dispatch runs through the
same `__wasm_on_document_change` subscriber the browser installs. Spans
under `dispatch.wasm.*` are end-to-end identical to the browser; spans
under `reducer.*` are pure JS and track within ~10% of browser V8.

```sh
# Default — runs every scenario at 1K synthetic + bench.grida (10K) scales
GRIDA_PERF=1 pnpm vitest run editor/grida-canvas/__tests__/bench/perf-editor.test.ts

# With CPU profile capture (delete scenarios)
GRIDA_PERF=1 GRIDA_PERF_CPUPROFILE=1 pnpm vitest run \
  editor/grida-canvas/__tests__/bench/perf-editor.test.ts

# Large fixtures need more heap
NODE_OPTIONS="--max-old-space-size=8192" GRIDA_PERF=1 \
  pnpm vitest run editor/grida-canvas/__tests__/bench/perf-editor.test.ts
```

### Which spans to read

After a bench run, `perf.report()` prints a table per scene. The bench
README has the authoritative catalog — read it there. Read the table
in category order rather than by specific name:

1. **Total dispatch** — your ceiling per action.
2. **Reducer + Immer** — pure JS cost. Watch p95 on gesture scenarios
   (drag / resize per-frame) — median can be microseconds while p95
   spikes into hundreds of ms as the tree grows.
3. **Document snapshot** — deep-clone at gesture boundaries; pays
   twice per gesture (start + end).
4. **WASM sync (full reload vs. patch path)** — compare the full-reload
   span count against the patch-path span count. If the full reload
   fires for every dispatch and the patch path rarely fires, too many
   actions are routing through the slow path.
5. **Gesture / query compute** — snap targets, hover ray, tree
   traversal. Usually small but can dominate at high selection count.

Prefer bench ratios over absolute numbers in commits and memory —
absolutes shift with machine and node version; ratios stay meaningful.

### Adding a new benchmark

Extend `BENCH_SCENARIOS` in `perf-editor.test.ts`. Use the `bench()`
helper from `_utils.ts` for per-frame gestures and `runAndTime()` (or
similar) for single-shot discrete actions:

```ts
const result = await bench(() => {
  h.ed.doc.dispatch({ type: "...", ... } as Action, { recording: "silent" });
}, { iterations: 10 });
logBench("my operation", result);
```

If you need a one-off CPU profile of a specific operation, use
`withCpuProfile()` from `_utils.ts` — it wraps the call in
`node:inspector` and writes a `.cpuprofile` to
`fixtures/local/perf/cpuprofile/` (gated by `GRIDA_PERF_CPUPROFILE=1`).

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

## Reading a browser trace

Chrome DevTools exports traces as `.json.gz`. They are plain JSON after
decompression, so analyze them with a short Python script rather than
opening DevTools by hand.

Key signals to extract:

| Signal                                    | How to find it                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| React component renders (count per name)  | Events with `cat == "blink.user_timing"` and `ph == "b"`. Each render emits one; counting them per `name` shows re-renders. |
| Hot JS functions (self-time)              | `ProfileChunk` events contain `cpuProfile.nodes` + `samples` + `timeDeltas`. Accumulate `timeDeltas` per sample id.         |
| Long interactions                         | `FunctionCall` events with `name == "dispatchContinuousEvent"` (or `dispatchDiscreteEvent`) — filter by `dur > 20000` (µs). |
| What happened inside one long interaction | Filter `ProfileChunk` samples by their cumulative timestamp falling inside the `FunctionCall` window.                       |

The trace includes React DevTools overhead when the extension is
installed. **`measureInstance @ installHook.js` is the React DevTools
profiler** — it can easily account for ~10% of CPU and inflates render
counts. Ask the user to disable the extension for "clean" traces, or
subtract it out when reading.

```py
# Minimal trace reader — extract events and CPU profile nodes
import json, gzip
from collections import defaultdict, Counter
data = json.load(gzip.open("logs/Trace-....json.gz"))
events = data["traceEvents"] if isinstance(data, dict) else data

# Component renders by name
renders = Counter()
for e in events:
    if e.get("cat") == "blink.user_timing" and e.get("ph") == "b":
        renders[e.get("name","")] += 1

# CPU self-time by function
nodes_by_id = {}
self_time = defaultdict(int)
for e in events:
    if e.get("name") == "ProfileChunk":
        cp = e["args"]["data"].get("cpuProfile", {})
        for n in cp.get("nodes", []):
            nodes_by_id[n["id"]] = n
        for sid, dt in zip(cp.get("samples", []),
                           e["args"]["data"].get("timeDeltas", [])):
            self_time[sid] += dt
```

---

## Node CPU profiles

When an `editor-bench` run flags a span but you need function-level
detail, capture a `.cpuprofile`:

```sh
# Via the bench harness (preferred — uses withCpuProfile wrapper)
GRIDA_PERF=1 GRIDA_PERF_CPUPROFILE=1 pnpm vitest run \
  editor/grida-canvas/__tests__/bench/perf-editor.test.ts
# → writes fixtures/local/perf/cpuprofile/*.cpuprofile

# Or wrap a specific call in code:
import { withCpuProfile } from "./_utils";
await withCpuProfile("my-scenario", async () => { ... });
```

Open the resulting `.cpuprofile` in Chrome DevTools (Performance → Load
profile) or VS Code for an interactive flame graph.

For microtask-level detail, start Node with
`--cpu-prof --cpu-prof-interval=100` (µs between samples). For trace
events / async task timing, `--trace-events-enabled` captures a
chrome://tracing-compatible JSON. Both are Node built-ins — no extra
tooling required.

---

## The Verification Workflow

**Every performance change follows this sequence.**

### Step 1: Baseline

Run the bench BEFORE any changes. Save the output.

```sh
GRIDA_PERF=1 pnpm vitest run editor/grida-canvas/__tests__/bench/perf-editor.test.ts
```

If the user provided a browser trace, also record its pre-change numbers
(render counts and hot-function self-times) — these are the only way to
verify React-side wins.

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
full bench suite at both 1K and 10K scales, not just the target
operation — many improvements that help 10K scenes add constant
overhead that hurts 1K.

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

If optimizing an operation that has no bench coverage, extend
`BENCH_SCENARIOS` in `perf-editor.test.ts` first. Measure before and
after.

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

### Bench omits React cost — that is intentional

The bench measures the reducer + emit + WASM pipeline, not the React
subscription layer. If the complaint is about interaction feel (a
pointer move stalls, a panel re-renders too often), bench will not
see it. Use a browser trace for that; see "Pick your measurement
tool" above.

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
