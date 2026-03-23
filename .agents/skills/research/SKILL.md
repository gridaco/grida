---
name: research
description: >
  Research upstream and peer projects to inform Grida's design and
  implementation. Use when investigating how Chromium, Skia, Servo,
  Taffy, or peer canvas editors solve a problem before writing code. Covers
  source-code exploration, research document authoring, and the
  study-adapt-differ pattern used in .plan.md files. Relevant dirs:
  docs/wg/research/, docs/wg/feat-2d/, crates/grida-canvas/.
---

# Code Research Skill

Workflow for going from "how does X work?" to a documented, actionable
plan grounded in prior art from upstream and peer projects.

## When to Use This Skill

- Investigating how a browser engine solves a rendering/layout/compositing problem
- Looking up undocumented Skia API behavior
- Understanding CSS feature semantics before adding support
- Comparing canvas editor architectures (excalidraw, tldraw)
- Writing or extending `docs/wg/research/` documents or `.plan.md` files

---

## How to Orient Yourself

Before touching any external repo, check what Grida already knows.

### 1. Check existing research

```text
docs/wg/research/chromium/   # 15 docs covering the full compositor pipeline
├── index.md                  # START HERE — topic map
├── glossary.md               ├── compositor-architecture.md
├── property-trees.md         ├── render-surfaces.md
├── damage-tracking.md        ├── paint-recording.md
├── tiling-and-rasterization.md  ├── tiling-deep-dive.md
├── memory-and-priority.md    ├── scheduler.md
├── interaction-and-quality.md
├── resolution-scaling-during-interaction.md
├── pinch-zoom-deep-dive.md   └── effect-optimizations.md
```

### 2. Check plan documents

Key plan docs with distilled research:

- `docs/wg/feat-2d/zoom-compositor-strategy.plan.md` — Chromium pinch-zoom adaptation
- `docs/wg/feat-2d/renderer-rewrite.plan.md` — Chromium compositor mapping
- `docs/wg/feat-2d/optimization.md` — master optimization catalog

### 3. Check code cross-references

```sh
grep "chromium\|servo\|adapted from\|ported from\|based on" --include="*.rs"
```

Known citations:

- `crates/grida-canvas/src/runtime/effect_tree.rs` — Chromium EffectTree/EffectNode
- `crates/csscascade/src/rcdom/mod.rs` — Servo html5ever rcdom
- `crates/csscascade/` — Servo style system (`style::servo::*`)
- `third_party/usvg/src/text/layout.rs` — Chromium font metrics
- `packages/grida-cmath/index.ts` — Snap.svg arc-to-cubic

### Discovery queries

| What you need                | How to find it                                                |
| ---------------------------- | ------------------------------------------------------------- |
| Existing research on a topic | `docs/wg/research/chromium/index.md`                          |
| Plan docs with external refs | `grep "Chromium\|servo\|upstream" docs/wg/**/*.plan.md`       |
| Code that cites sources      | `grep "based on\|adapted from\|ported from" --include="*.rs"` |
| Vendored third-party code    | `ls third_party/`                                             |
| Feature docs for a subsystem | `ls docs/wg/feat-*/`                                          |

---

## Reference Repositories

**Local clones (optional):** If `~/Documents/GitHub/` exists, it may contain default-style clones (sibling dirs named by repo, e.g. `skia`). Prefer searching there before cloning or using only the web.

### Graphics & Rendering

| Repo                                                | Lang | When to reference                                                             | Key paths                                             |
| --------------------------------------------------- | ---- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| [chromium](https://github.com/chromium/chromium)    | C++  | Skia usage, compositing, layer trees, paint scheduling, tiling, GPU resources | `cc/` `third_party/blink/renderer/` `components/viz/` |
| [skia](https://github.com/google/skia)              | C++  | Undocumented API behavior, GPU internals, filter details                      | `src/gpu/` `src/core/` `src/effects/`                 |
| [rust-skia](https://github.com/rust-skia/rust-skia) | Rust | Rust binding ergonomics — our direct `skia-safe` dependency                   | `skia-safe/src/`                                      |
| [resvg](https://github.com/linebender/resvg)        | Rust | SVG rendering, path conversion, filter effects                                | `crates/resvg/src/` `crates/usvg/src/`                |

### Web Standards & CSS

| Repo                                         | Lang | When to reference                                                         | Key paths                                |
| -------------------------------------------- | ---- | ------------------------------------------------------------------------- | ---------------------------------------- |
| [servo](https://github.com/servo/servo)      | Rust | CSS layout, DOM, Rust browser-engine patterns. We vendor its style system | `components/style/` `components/layout/` |
| [stylo](https://github.com/servo/stylo)      | Rust | CSS parsing and style resolution                                          | `style/`                                 |
| [taffy](https://github.com/DioxusLabs/taffy) | Rust | Flexbox/Grid layout algorithms and Rust-native layout engine internals    | `src/tree/` `src/compute/` `src/style/`  |

### Canvas Editor Peers

| Repo                                                   | Lang | When to reference                                          | Key paths                                                      |
| ------------------------------------------------------ | ---- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| [excalidraw](https://github.com/excalidraw/excalidraw) | TS   | Canvas API optimization, rendering heuristics, interaction | `packages/excalidraw/renderer/` `packages/excalidraw/element/` |
| [tldraw](https://github.com/tldraw/tldraw)             | TS   | CRDT state model, modular SDK, DOM/SVG canvas              | `packages/editor/` `packages/store/`                           |

### Searching large repos

**Chromium** — use https://source.chromium.org/ for fast browsing. Narrow to: `cc/layers/` `cc/tiles/` `cc/trees/` (compositing), `cc/paint/` (recording), `cc/scheduler/` (frame scheduling).

**Servo** — `components/style/properties/` (CSS props), `components/style/stylist.rs` (resolution), `components/layout/` (layout).

**Skia** — headers in `include/core/` `include/effects/`, GPU in `src/gpu/ganesh/` (GL) or `src/gpu/graphite/` (Metal/Vulkan).

---

## The Research Workflow

### Step 1: Frame the question

Write a specific, bounded question. Bad: "how does Chromium handle rendering?" Good: "how does Chromium decide which layers get their own composited surface?"

### Step 2: Check existing knowledge

1. Read `docs/wg/research/chromium/index.md`
2. `grep "<topic>" docs/wg/**/*.plan.md`
3. `grep "<topic>" --include="*.rs" crates/`
4. Read `docs/wg/feat-2d/optimization.md`

If already documented, cite it and move on.

### Step 3: Explore the source

Use targeted searches — do not read entire codebases:

```sh
grep "struct LayerTreeHost" --include="*.h" -r cc/           # find the owning type
grep "ShouldCreateRenderSurface" --include="*.cc" -r cc/     # find decision points
grep "kDefault.*Tile\|kMax.*Memory" --include="*.h" -r cc/   # find design constants
```

### Step 4: Extract findings

For each finding, record: **what** (mechanism + file path), **why** (rationale), **constants** (thresholds/heuristics), **applicability** (maps to our architecture?).

### Step 5: Document or apply

| Scope                        | Action                                        |
| ---------------------------- | --------------------------------------------- |
| Quick answer                 | Code comment citing the source                |
| Reusable subsystem knowledge | Research doc in `docs/wg/research/<project>/` |
| New feature design           | "Reference Approach" section in `.plan.md`    |
| Confirming existing approach | Update the relevant research doc              |

---

## Writing Research Documents

Docs live in `docs/wg/research/<project>/`. Create new subdirectories as needed (`servo/`, `skia/`).

Every research document must contain:

1. **Title and scope** — what subsystem, what questions it answers
2. **Source references** — upstream file paths (with commit hash if volatile)
3. **Architecture description** — how the subsystem works, with diagrams for pipelines
4. **Key data structures** — important types and relationships (use upstream names)
5. **Constants and heuristics** — magic numbers and their reasoning
6. **Relevance to Grida** — how this maps or doesn't map to our architecture

**Conventions:** Use upstream terminology. Include short code excerpts (5-15 lines) with file path citations. Organize by concept, not by file. Update `index.md` when adding new docs. File names: lowercase, hyphenated, topic-descriptive.

---

## Applying Research to Plan Documents

Grida uses a **study-adapt-differ** pattern. Every `.plan.md` referencing external work needs three sections:

### 1. "Reference Approach" (study)

Describe how upstream solves it — cite the research doc, name types/algorithms, include key constants:

```markdown
## Chromium's Approach (Reference)

Chromium uses a CoverageIterator that walks tilings from highest to
lowest resolution. During pinch-zoom, TreePriority is set to
SMOOTHNESS_TAKES_PRIORITY to show stretched tiles rather than checkerboard.
See: `docs/wg/research/chromium/pinch-zoom-deep-dive.md`
```

### 2. "What We Borrow" (adapt)

Mapping table from upstream concepts to our types:

```markdown
| Chromium                      | Grida                           | Notes                        |
| ----------------------------- | ------------------------------- | ---------------------------- |
| Stale-tile GPU stretching     | `LayerImage` reuse at old scale | Per-node instead of per-tile |
| Power-of-2 raster scale steps | `snap_to_power_of_two()`        | Reduces re-rasterization     |
```

### 3. "What We Do Differently" (differ)

What we're NOT adopting and why. This prevents future contributors from "fixing" intentional divergences:

```markdown
- **No multiple concurrent tilings.** We cache per-node, not per-tile.
  WASM memory constraints make multi-tiling impractical.
- **No worker-thread rasterization.** Single-threaded WASM constraint.
  We compensate with time-budgeted incremental re-raster.
```

---

## Pitfalls

**Researching what's already documented.** Check `docs/wg/research/`, plan docs, and code comments first. The Chromium research alone is 15 documents.

**Cargo-culting without understanding constraints.** Always filter upstream approaches through our constraints:

- Single thread (WASM)
- Per-node cache (not spatial tiles)
- Infinite canvas (viewport culling is primary)
- Stable scene graph (no CSS reflow on zoom)

**Reading too broadly.** Chromium is 30M+ lines. Arrive with a specific question, find the code path, extract the answer, leave. Use source.chromium.org.

**Skipping the "differ" section.** Most dangerous omission. Without it, future contributors will "fix" intentional divergences from Chromium.

**Confusing Skia docs with Skia behavior.** Skia's documentation is minimal and sometimes wrong. Read the implementation for performance characteristics and edge cases.

**Stale source references.** Reference stable concepts (struct names, enum variants) over line numbers. Include enough context to relocate if files move.

**Mixing terminologies.** Research docs: upstream terms. Plan docs: mapping tables. Code comments: our terms with parenthetical upstream reference.

---

## Checklist

- [ ] Framed a specific, bounded question
- [ ] Checked existing research, plan docs, and code comments
- [ ] Identified the right repo and narrowed to specific directories
- [ ] Extracted findings with file paths, rationale, and constants
- [ ] Assessed applicability against our constraints
- [ ] Documented findings (research doc, plan section, or code comment)
- [ ] Updated `index.md` if a new research doc was created
