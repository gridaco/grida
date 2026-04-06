---
title: LOD Properties — Reference Sheet
format: md
tags:
  - internal
  - wg
  - canvas
  - performance
  - rendering
  - lod
---

# LOD Properties — Reference Sheet

A catalog of node and subtree properties where a zoom-aware Level-of-Detail
(LOD) decision can reduce per-frame work. Pairs with
**item 51 (Subpixel LOD Culling)** in `optimization.md`, which drops
entire leaves whose projected bounds collapse below a threshold.

This document defines **what is LOD-able**, **what the decision metric
is**, and **where in the pipeline the decision applies**. It does NOT
prescribe specific thresholds or promise specific wins — both require
empirical verification per backend.

## Principles

1. **LOD decisions are camera-zoom-indexed.** A node's visual
   significance depends on how it projects to device pixels.
2. **Two kinds of LOD:**
   - **Skip work** — eliminate draw dispatches entirely (safe, portable)
   - **Replace with cheaper primitive** — swap a complex draw for a
     simpler one (requires per-backend validation; modern GPUs may
     already short-circuit)
3. **The only trustworthy reason to implement a rule is a measured
   win.** Categories that "look" cheap on paper may already be handled
   by the underlying graphics backend.
4. **Threshold policy is pluggable, not hard-coded.** Per-property
   thresholds live in a runtime config so they can be tuned per
   backend / per fixture / per workload.

## Notation

- `z` — camera zoom (device pixels per world unit)
- `px(x) = x · z` — project a world-space length to device pixels
- A property is "subpixel" when its projection falls below a threshold
  matching the backend's AA resolution (typically 0.5 px for coverage,
  1.0 px for structural features)

## Pipeline Stages

Each LOD decision applies at one of three stages:

| Stage              | Work avoided                                    | Constraint                                      |
| ------------------ | ----------------------------------------------- | ----------------------------------------------- |
| **Frame plan**     | skip node / subtree entirely                    | needs zoom + bounds at plan time                |
| **Picture record** | emit cheaper primitives into cached SkPicture   | per-node pictures must become zoom-variant      |
| **Draw time**      | dynamic per-frame decision against current zoom | cheap decision; compatible with cached pictures |

---

## Catalog

### A. Geometric node / bounds

| ID  | Property                 | Metric                  | Action                       |
| --- | ------------------------ | ----------------------- | ---------------------------- |
| A1  | render bounds            | both axes projected < ε | cull leaf ✅ item 51         |
| A2  | render bounds area       | area·z² < ε²            | cull leaf                    |
| A3  | render bounds diagonal   | diag·z < ε              | cull leaf                    |
| A4  | stroke-only contribution | stroke_w·z < ε          | drop stroke paint, keep fill |
| A5  | subtree cumulative area  | Σ child area·z² < ε²    | cull subtree                 |

### B. Corner & rounding

| ID  | Property             | Metric      | Action                      |
| --- | -------------------- | ----------- | --------------------------- |
| B1  | corner radius (rect) | r·z < ε     | RRect → Rect                |
| B2  | corner radius (path) | r·z < ε     | drop corner arcs → polyline |
| B3  | stroke join miter    | miter·z < ε | force bevel fallback        |

### C. Stroke & outline

| ID  | Property                 | Metric         | Action                         |
| --- | ------------------------ | -------------- | ------------------------------ |
| C1  | stroke width (thin)      | width·z < ε    | skip stroke draw               |
| C2  | stroke width (hairline)  | width·z ≈ 1 px | clamp to width=0 hairline path |
| C3  | dash segment length      | dash·z < ε     | replace with solid stroke      |
| C4  | dash gap length          | gap·z < ε      | replace with solid stroke      |
| C5  | variable-width amplitude | amp·z < ε      | collapse to constant stroke    |
| C6  | marker size              | marker·z < ε   | omit marker                    |

### D. Path / vector complexity

| ID  | Property               | Metric          | Action                              |
| --- | ---------------------- | --------------- | ----------------------------------- |
| D1  | segment chord length   | chord·z < ε     | drop consecutive near-coincident pt |
| D2  | bezier flattening tol  | tolerance = 1/z | coarser curve tessellation          |
| D3  | sub-path bbox area     | bbox·z² < ε²    | drop sub-path                       |
| D4  | near-coincident points | d·z < ε         | merge points                        |

### E. Effects (save_layer / filter avoidance)

| ID  | Property                | Metric           | Action               |
| --- | ----------------------- | ---------------- | -------------------- |
| E1  | drop-shadow blur radius | r·z < ε          | skip shadow          |
| E2  | drop-shadow offset      | \|offset\|·z < ε | fold color into fill |
| E3  | inner-shadow radius     | r·z < ε          | skip                 |
| E4  | layer blur sigma        | σ·z < ε          | skip blur            |
| E5  | backdrop blur sigma     | σ·z < ε          | skip backdrop blur   |
| E6  | glass displacement      | d·z < ε          | skip                 |
| E7  | noise grain scale       | grain·z < ε      | skip                 |

### F. Opacity & blend

| ID  | Property              | Metric               | Action             |
| --- | --------------------- | -------------------- | ------------------ |
| F1  | alpha near zero       | opacity < 1/255      | cull node          |
| F2  | opacity × area        | α·w·h·z² < ε         | cull node          |
| F3  | blend on tiny subtree | subtree area·z² < ε² | force Normal blend |

### G. Fills

| ID  | Property                | Metric             | Action               |
| --- | ----------------------- | ------------------ | -------------------- |
| G1  | gradient projected span | span·z < ε         | averaged solid       |
| G2  | gradient stop density   | stops > pixel span | collapse to average  |
| G3  | image fill size         | img_display_px < ε | center-pixel solid   |
| G4  | pattern tile size       | tile·z < ε         | tile-averaged solid  |
| G5  | occluded paint          | opaque paint above | skip occluded paints |

### H. Text

| ID  | Property             | Metric                    | Action                         |
| --- | -------------------- | ------------------------- | ------------------------------ |
| H1  | font size (cull)     | font·z < ε_cull           | skip text entirely ✅ item 52  |
| H2  | font size (greek)    | ε_cull ≤ font·z < ε_greek | render as SkRect(s) ✅ item 52 |
| H3  | line height          | lh·z < ε                  | collapse to thin rect          |
| H4  | glyph advance        | adv·z < ε                 | merge adjacent glyphs          |
| H5  | attributed run span  | run·z < ε                 | merge runs                     |
| H6  | decoration thickness | thickness·z < ε           | skip decoration                |
| H7  | text-shadow blur     | r·z < ε                   | skip                           |

### I. Clip & mask

| ID  | Property        | Metric               | Action                 |
| --- | --------------- | -------------------- | ---------------------- |
| I1  | clip path area  | bbox·z² < ε²         | drop clipped subtree   |
| I2  | clip complexity | many segments, low z | replace with bbox clip |
| I3  | mask area       | bbox·z² < ε²         | drop masked subtree    |

### J. Container / subtree

| ID  | Property                     | Metric               | Action                     |
| --- | ---------------------------- | -------------------- | -------------------------- |
| J1  | subtree cumulative area      | Σ children·z² < ε²   | rasterize once as snapshot |
| J2  | container vs sparse children | children « container | skip container paint       |
| J3  | nested container depth       | depth > N at low z   | flatten subtree to image   |

### K. Render-surface backing

| ID  | Property                   | Metric             | Action                       |
| --- | -------------------------- | ------------------ | ---------------------------- |
| K1  | surface backing resolution | bounds·z           | allocate at projected size   |
| K2  | filter quality             | surface_px small   | nearest sampling             |
| K3  | compositor promotion       | cost estimate at z | don't promote if blit ≥ live |

### L. Devtools overlays

| ID  | Property          | Metric             | Action         |
| --- | ----------------- | ------------------ | -------------- |
| L1  | frame title label | node_w·z < label_w | hide label     |
| L2  | selection handles | node_area·z² < ε²  | hide handles   |
| L3  | hit badges        | density at z       | cluster badges |

---

## Verification

Each property must be verified before implementation. Two checks:

1. **Skia cost probe** — measure the raw per-primitive cost of the
   operation to be avoided OR of the replacement primitive. If the
   backend already short-circuits the condition, the LOD rule is moot
   or regressive. See `examples/skia_bench/*` for the probe pattern.
2. **Scene-level bench-report diff** — run with/without the LOD rule
   across a diverse fixture set, compare per-stage timings.

Two independent sources of possible redundancy:

- Skia's existing fast paths (e.g. `SkRRect::isRect()` for r=0)
- GPU driver's analytic-coverage shaders that early-exit on sub-pixel
  inputs (varies per backend — Metal, Ganesh GL, Graphite, WebGL, …)

Rules that **skip work entirely** (A, E, H1/H2, F1, G5) are generally
safe to implement without per-backend validation: they remove draw
dispatches the backend would otherwise execute.

Rules that **replace with a cheaper primitive** (B, C, D, G1–G4) need
per-backend measurement because modern analytic-AA shaders may already
handle the sub-pixel case efficiently.

## Applied Findings

Findings are tracked inline in `optimization.md` (numbered items) and
in per-property verification notes alongside their benchmarks.

- **Item 51 (A1)** — implemented. Subpixel leaf-bounds culling.
- **Item 52 (H1)** — implemented. Text font-size-below-threshold cull.
- **B1 (RRect → Rect)** — measured via `skia_bench_rrect_vs_rect`.
  Needs per-backend decision; on some backends the analytic rrect
  shader is already cheaper than `drawRect` at sub-pixel radii.
