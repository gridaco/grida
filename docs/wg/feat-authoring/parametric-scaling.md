---
title: Scale tool (K) — parameter-space scaling (A.k.a Apply Scale or K-Scale)
---

| feature id           | status   | description                                  | PRs                                               |
| -------------------- | -------- | -------------------------------------------- | ------------------------------------------------- |
| `parametric-scaling` | proposed | Parameter-space scaling operation for Grida. | [#471](https://github.com/gridaco/grida/pull/471) |

## Key principles

- **Visual accuracy over “clean” values**: Scale (K) is an authoring-time operation whose primary goal is that the post-scale render is visually consistent with a uniform similarity transform. As a result, it is normal (and expected) for authored values to become fractional / “dirty” after repeated scaling.

- **No extra quantization / optimization in the core rewrite**: The core scaling rules should apply the exact factor $s$ to existing numeric values without “cleaning up” the result. Any additional rounding/optimization risks accumulating error over repeated operations or round trips. (Gesture-input quantization may exist for UX stability, but is intentionally out of scope for this specification.)

- **Round-trip consistency (best-effort)**: Perfect round-trip guarantees are not always possible across multi-step edits, but for simple numeric cases the rewrite should behave consistently within the limits of JavaScript number precision. Example: $1 \\to 0.01x \\to 100x \\to 1$ should return to (approximately) the original value.

- **Deterministic, minimal rewrite (do not change the nature of properties)**: Scaling MUST NOT reinterpret or “bake” non-numeric authored intent into numeric values. For example, a property that is `auto`, `undefined`, or otherwise non-numeric must remain so. Scale (K) **bakes existing length values**, not “bake-all”.

## Context

This document specifies **Scale (K)** as a **parameter-space scaling** operation.

In Grida, nodes are authored as **graphics primitives** whose visual appearance is defined by a set of explicit parameters (box geometry, stroke widths, radii, text sizes, effects, etc.), rather than by a persistent transform matrix applied at render time.

As a result, a design-tool **Scale operation** cannot be defined as a simple geometric transform. Instead, it is an **authoring-time operation** that rewrites geometry-defining parameters so that the rendered output matches the result of applying a uniform similarity transform, while eliminating the transform itself.

In other words:

> **Parameter-space scale re-authors an object at a new scale.**

This operation exists purely at **authoring time**. It is not a rendering, GPU, or runtime concept, and should not be confused with transform-based scaling used in game engines or scene graphs. Its sole purpose is to preserve _visual identity_ while updating the underlying parameters so that future edits behave as if the object were originally authored at the new size.

Similar scaling behavior appears across multiple vector and design tools, although the concept is rarely named explicitly. This document intentionally avoids binding the definition to a single product, and instead specifies the operation as a general authoring-time model that can be implemented consistently across different systems.

## Proposal status

- **Status**: Draft proposal (WG)
- **Intended audience**: editor + schema + rendering implementers
- **Scope**: authoring-time document rewrite (not runtime rendering)

## Problem statement

We need a scaling operation that:

- produces the same _visual result_ as geometric scaling, **and**
- updates the authored parameters so subsequent edits behave as if the object was created at the new size.

Simple resize is insufficient because it changes box geometry but leaves geometry-contributing parameters unchanged (stroke widths, effect radii, etc.), producing a different visual identity.

## Goals / non-goals

- **Goals**

  - **Visual identity preservation**: scaling should preserve proportions of all geometry-contributing parameters.
  - **Backend-independence**: behavior is defined over the document model, not a renderer implementation.
  - **Deterministic rewrite**: applying scale produces a stable authored state (no latent transform needed).

- **Non-goals**
  - **Non-uniform scaling** is not specified here (future extension).
  - **Layout reflow** is not performed; we do not recompute constraints or auto-layout.
  - **Arbitrary CSS scaling** is not attempted without a typed/safe subset model.
  - **Content editing** is not part of scale (text content, URLs, IDs, etc. are unchanged).

## Core invariants (normative)

When applied with multiplier $s$:

- **I1. Geometry update**: box geometry parameters MUST be updated as described under “Anchor / origin”.
- **I2. Parameter rewrite**: all tracked, geometry-contributing parameters MUST be multiplied by $s$ (or scaled according to their field-level rules).
- **I3. Invariants preserved**: unitless ratios, enums, IDs, and content MUST remain unchanged.
- **I4. No layout reflow**: the operation MUST NOT attempt to resolve constraints or reflow layout. It only scales stored values.

## Definitions

- **Resize** (simple resize): updates only box geometry (typically `width/height` and `left/top`, and/or a transform), leaving stroke/effects/text sizes unchanged.
- **Scale (K)** (parameter-space scale): applies a uniform scale multiplier to box geometry _and_ all geometry-contributing parameters, baking the scale into authored values rather than storing a transform.

### Scale factor

This specification defines **uniform parameter-space scaling** as the baseline behavior:

- scale multiplier: $s$ where $s \ge 0.01$

(If we later support non-uniform scaling $s_x, s_y$, we must define how to map two factors into a single “thickness scale” for strokes/effects; see “Future extensions”.)

### Anchor / origin

Scaling is performed around an **anchor point** in the selection bounds (e.g. top-left, center, etc.).

For a node with an absolute box (`left`, `top`, `width`, `height`):

- Compute the anchor point $A$ in parent coordinates.
- Compute the node’s reference point $P$ (typically its top-left corner at (`left`,`top`)).
- Scale the vector $\overrightarrow{AP}$ by $s$:

$$
P' = A + (P - A) \cdot s
$$

- Set `left/top` from $P'$
- Set `width/height` to `width * s`, `height * s`

Notes:

- For nodes using `position: "relative"`, `left/top/right/bottom` are still lengths but their meaning depends on layout context. K-scale should still scale the stored values when present, but should not attempt to reflow layout.
- For container flex layout, K-scale ignores constraints/reflow (matching the intent of a proportional scale tool).

## Examples

- **Rectangle**

  - Before: `width=100`, `height=100`, `stroke_width=3`
  - Apply $s=2$
  - After: `width=200`, `height=200`, `stroke_width=6`

- **Progressive blur**

  - The progressive blur line coordinates are normalized (`x1/y1/x2/y2` in -1..1), so they remain unchanged.
  - The blur radii (`radius`, `radius2`) scale by $s$.

- **Noise**
  - `noise_size` scales by $s$ so the grain’s apparent feature size scales with the object.
  - `density` remains unchanged (unitless).

## What scales?

A property should be marked **Scale = Y** if it directly contributes to rendered geometry in absolute units (px-like lengths) or contains such geometry (e.g. vector path coordinates).

A property should be marked **Scale = N** if it is:

- Identity / metadata (`id`, `name`)
- Boolean/enum toggles (`active`, `locked`, `blend_mode`)
- Unitless ratios/percentages (`inner_radius` in 0..1, `line_height` in %)
- Colors/paints (paint geometry may be a future extension, but base color values do not scale)

## Property scaling (tracked parameters)

This section tracks only **parameters that are relevant to parameter-space scaling**:

- values that scale (lengths, coordinates), and
- values that are explicitly _invariant_ but matter for correct semantics (angles, ratios, enums that control how scaled geometry is interpreted).

Reference: `packages/grida-canvas-schema/grida.ts`

| name                                     | role        | scale (Y/N) | reason / notes                                                                       |
| ---------------------------------------- | ----------- | ----------: | ------------------------------------------------------------------------------------ |
| `left`, `top`, `right`, `bottom`         | layout      |           Y | Absolute/offset lengths; scale relative to anchor.                                   |
| `width`, `height`                        | layout      |         Y\* | Scale only numeric/px-like lengths. Do not scale `%`, viewport units, or `\"auto\"`. |
| `rotation`                               | transform   |           N | Angle in degrees; scaling does not change angles.                                    |
| `corner_radius`                          | shape       |           Y | Length.                                                                              |
| `rectangular_corner_radius_top_left`     | shape-rect  |           Y | Length.                                                                              |
| `rectangular_corner_radius_top_right`    | shape-rect  |           Y | Length.                                                                              |
| `rectangular_corner_radius_bottom_left`  | shape-rect  |           Y | Length.                                                                              |
| `rectangular_corner_radius_bottom_right` | shape-rect  |           Y | Length.                                                                              |
| `corner_smoothing`                       | shape       |           N | Unitless smoothing factor.                                                           |
| `padding` (and per-side fields)          | layout      |           Y | Length(s).                                                                           |
| `main_axis_gap`, `cross_axis_gap`        | layout      |           Y | Length gaps.                                                                         |
| `stroke_width`                           | stroke      |           Y | Length (thickness).                                                                  |
| `stroke_dash_array`                      | stroke      |           Y | Dash/gap lengths.                                                                    |
| `rectangular_stroke_width_top`           | stroke-rect |           Y | Length.                                                                              |
| `rectangular_stroke_width_right`         | stroke-rect |           Y | Length.                                                                              |
| `rectangular_stroke_width_bottom`        | stroke-rect |           Y | Length.                                                                              |
| `rectangular_stroke_width_left`          | stroke-rect |           Y | Length.                                                                              |
| `stroke_width_profile`                   | stroke      |         Y\* | See **Stroke width profile (`cg.VariableWidthProfile`)** for per-stop field scaling. |
| `angle`, `angle_offset`                  | shape       |           N | Degrees (ellipse arc).                                                               |
| `inner_radius` (ellipse arc / star)      | shape       |           N | Ratio 0..1; keep topology.                                                           |
| `font_size`                              | text        |           Y | Length (px-like).                                                                    |
| `letter_spacing`, `word_spacing`         | text        |           N | Stored as em-percentage; scaling font size already scales absolute spacing.          |
| `line_height`                            | text        |           N | Stored as percentage; keep relative line-height.                                     |
| `fe_blur`                                | effect      |         Y\* | See **Filter effects** section; radii scale, normalized progressive coords do not.   |
| `fe_backdrop_blur`                       | effect      |         Y\* | See **Filter effects** section.                                                      |
| `fe_shadows`                             | effect      |         Y\* | See **Filter effects** section.                                                      |
| `fe_liquid_glass`                        | effect      |         Y\* | See **Filter effects** section.                                                      |
| `fe_noises`                              | effect      |         Y\* | See **Filter effects** section; notably `noise_size` scales.                         |
| `vector_network`                         | vector      |           Y | Control point coordinates are geometric.                                             |
| `paths`                                  | vector      |           Y | Path geometry coordinates are geometric.                                             |
| `guides[].offset`                        | scene       |           N | See **Ambiguous / implementation-defined properties**.                               |
| `edges[]` position points (`x`,`y`)      | scene       |           N | See **Ambiguous / implementation-defined properties**.                               |

## Properties not tracked (irrelevant to parameter-space scaling)

The following categories are intentionally **not listed** in the table above, because K-scale should not mutate them and they add noise to the specification:

- **Identity / editor state**: `id`, `name`, `type`, `userdata`, `active`, `locked`, `expanded`, `z_index`, etc.
- **Document repositories and references**: `nodes`, `links`, `images`, `bitmaps`, `scenes_ref`, `entry_scene_id`, `ImageRef.*`, etc.
- **Content and external references**: `text`, `html`, `src`, `href`, `poster`, `alt`, etc.
- **Component/template schema + runtime props**: `properties`, `props`, `default`, `component_id`, `template_id`, `overrides`, etc.
- **Paint/color values**: `fill`, `stroke`, `*_paints`, colors.
- **Arbitrary CSS**: `style` (unknown subset; not safely scalable without a typed model).

## Ambiguous / implementation-defined properties

Some properties _look_ geometric (they contain lengths/coordinates), but their meaning and desired behavior can vary by product rules and editor UX. For these properties, this proposal treats them as **non-scaled by default**.

- **Guides** (`guides[].offset`)

  - **Default**: **N** (do not scale)
  - **Rationale**: guides are editor/workspace UI aids; scaling objects should not re-author workspace guides.
  - **Allowed extension**: an implementation MAY offer a separate “scale guides” command, but it is not part of parameter-space scaling.

- **Edges** (`edges[]` and positional `EdgePointPosition2D.x/y`)
  - **Default**: **N** (do not scale)
  - **Rationale**: edges may represent editor relationships/measurements/constraints rather than authored geometry; scaling content should not implicitly rewrite these references.
  - **Allowed extension**: an implementation MAY define a rule set for scaling edges (e.g. only when edges are explicit geometry in the authored scene), but such rules must be documented alongside the implementation.

## Filter effects (field-level scaling)

This section expands the `fe_*` node properties into **per-effect, field-level** tables.

Reference types:

- `packages/grida-canvas-schema/grida.ts` (`IEffects` → `fe_*` fields)
- `packages/grida-canvas-cg/lib.ts` (`cg.FilterEffect` and the `cg.Fe*` types)

### Shadow (`cg.FeShadow`)

Used by `fe_shadows?: cg.FeShadow[]`.

| field    | role   | scale (Y/N) | reason / notes                  |
| -------- | ------ | ----------: | ------------------------------- |
| `type`   | effect |           N | Discriminator (`"shadow"`).     |
| `inset`  | effect |           N | Boolean; inner vs outer shadow. |
| `active` | effect |           N | Toggle.                         |
| `dx`     | effect |           Y | Pixel offset.                   |
| `dy`     | effect |           Y | Pixel offset.                   |
| `blur`   | effect |           Y | Pixel blur radius.              |
| `spread` | effect |           Y | Pixel spread radius.            |
| `color`  | effect |           N | Color/alpha only.               |

### Layer Blur (`cg.FeLayerBlur`)

Used by `fe_blur?: cg.FeLayerBlur`.

| field    | role   | scale (Y/N) | reason / notes                                               |
| -------- | ------ | ----------: | ------------------------------------------------------------ |
| `type`   | effect |           N | Discriminator (`"filter-blur"`).                             |
| `active` | effect |           N | Toggle.                                                      |
| `blur`   | effect |         Y\* | Scales **only the radii** inside the nested blur; see below. |

#### Blur variant: Gaussian (`cg.FeGaussianBlur` / `cg.IFeGaussianBlur`)

| field    | role   | scale (Y/N) | reason / notes            |
| -------- | ------ | ----------: | ------------------------- |
| `type`   | effect |           N | Discriminator (`"blur"`). |
| `radius` | effect |           Y | Pixel blur radius.        |

#### Blur variant: Progressive (`cg.FeProgressiveBlur` / `cg.IFeProgressiveBlur`)

In `@grida/cg`, the progressive blur line (`x1/y1/x2/y2`) is stored in **normalized node-local space** (`-1..1`), so it must **not** be scaled; it naturally follows the node’s scaled bounds.

| field     | role   | scale (Y/N) | reason / notes                        |
| --------- | ------ | ----------: | ------------------------------------- |
| `type`    | effect |           N | Discriminator (`"progressive-blur"`). |
| `x1`      | effect |           N | Normalized coordinate (node-local).   |
| `y1`      | effect |           N | Normalized coordinate (node-local).   |
| `x2`      | effect |           N | Normalized coordinate (node-local).   |
| `y2`      | effect |           N | Normalized coordinate (node-local).   |
| `radius`  | effect |           Y | Pixel blur radius at start.           |
| `radius2` | effect |           Y | Pixel blur radius at end.             |

### Backdrop Blur (`cg.FeBackdropBlur`)

Used by `fe_backdrop_blur?: cg.FeBackdropBlur`.

| field    | role   | scale (Y/N) | reason / notes                                                                                  |
| -------- | ------ | ----------: | ----------------------------------------------------------------------------------------------- |
| `type`   | effect |           N | Discriminator (`"backdrop-filter-blur"`).                                                       |
| `active` | effect |           N | Toggle.                                                                                         |
| `blur`   | effect |         Y\* | Same nested blur rules as **Layer Blur** (scale radii only, not normalized progressive coords). |

### Liquid Glass (`cg.FeLiquidGlass`)

Used by `fe_liquid_glass?: cg.FeLiquidGlass`.

| field             | role   | scale (Y/N) | reason / notes                       |
| ----------------- | ------ | ----------: | ------------------------------------ |
| `type`            | effect |           N | Discriminator (`"glass"`).           |
| `active`          | effect |           N | Toggle.                              |
| `light_intensity` | effect |           N | Unitless 0..1.                       |
| `light_angle`     | effect |           N | Degrees.                             |
| `refraction`      | effect |           N | Unitless 0..1.                       |
| `dispersion`      | effect |           N | Unitless 0..1.                       |
| `depth`           | effect |           Y | Pixel “thickness” / SDF depth.       |
| `radius`          | effect |           Y | Pixel blur radius for frosted glass. |

### Noise (`cg.FeNoise`)

Used by `fe_noises?: cg.FeNoise[]`.

| field         | role   | scale (Y/N) | reason / notes                                                                                  |
| ------------- | ------ | ----------: | ----------------------------------------------------------------------------------------------- |
| `type`        | effect |           N | Discriminator (`"noise"`).                                                                      |
| `active`      | effect |           N | Toggle.                                                                                         |
| `mode`        | effect |           N | Enum (`mono`/`duo`/`multi`).                                                                    |
| `blend_mode`  | effect |           N | Enum.                                                                                           |
| `noise_size`  | effect |           Y | Grain size parameter; treat as pixel-like “feature size” so the texture scales with the object. |
| `density`     | effect |           N | Unitless 0..1.                                                                                  |
| `num_octaves` | effect |           N | Count.                                                                                          |
| `seed`        | effect |           N | Random seed.                                                                                    |
| `color`       | effect |           N | RGBA; mono mode only.                                                                           |
| `color1`      | effect |           N | RGBA; duo mode pattern color.                                                                   |
| `color2`      | effect |           N | RGBA; duo mode background color.                                                                |
| `opacity`     | effect |           N | Unitless 0..1; multi mode only.                                                                 |

## Image paint filters (`cg.ImageFilters`) (field-level scaling)

These are the per-image adjustment controls used inside `cg.ImagePaint.filters` (exposure/contrast/etc.). They are **unitless** adjustments and should not be modified by K-scale.

| field         | role         | scale (Y/N) | reason / notes       |
| ------------- | ------------ | ----------: | -------------------- |
| `exposure`    | image-filter |           N | Unitless adjustment. |
| `contrast`    | image-filter |           N | Unitless adjustment. |
| `saturation`  | image-filter |           N | Unitless adjustment. |
| `temperature` | image-filter |           N | Unitless adjustment. |
| `tint`        | image-filter |           N | Unitless adjustment. |
| `highlights`  | image-filter |           N | Unitless adjustment. |
| `shadows`     | image-filter |           N | Unitless adjustment. |

## Stroke width profile (`cg.VariableWidthProfile`) (field-level scaling)

`stroke_width_profile?: cg.VariableWidthProfile` is a profile with an **array of stops** (`stops: VariableWidthStop[]`).

Reference type: `packages/grida-canvas-cg/lib.ts` (`cg.VariableWidthProfile`, `cg.VariableWidthStop`)

### `cg.VariableWidthProfile`

| field   | role   | scale (Y/N) | reason / notes                                           |
| ------- | ------ | ----------: | -------------------------------------------------------- |
| `stops` | stroke |         Y\* | Array container; scale depends on per-stop fields below. |

### Stop: `cg.VariableWidthStop`

| field | role   | scale (Y/N) | reason / notes                                                          |
| ----- | ------ | ----------: | ----------------------------------------------------------------------- |
| `u`   | stroke |           N | Unitless curve parameter in 0..1; keeps relative position along stroke. |
| `r`   | stroke |           Y | Radius/width value in pixels; scales with K-scale.                      |

## Notes per node type (what K-scale touches)

This is a practical checklist for implementers.

- **Scene (`scene`)**: do not scale `guides` or `edges` as part of parameter-space scaling.
- **Group (`group`)**: scale positioning + its children are scaled by selection traversal (tool-level responsibility).
- **Shape nodes (`rectangle`, `ellipse`, `polygon`, `star`, `line`, `vector`, `boolean`)**:
  - scale `left/top/right/bottom`, `width/height`
  - scale `stroke_width`, `stroke_dash_array`, rectangular stroke widths
  - scale corner radii
  - scale effects (`fe_*`) where applicable
  - scale embedded geometry containers (`vector_network`, `paths`)
- **Text (`text`)**:
  - scale box geometry
  - scale `font_size`
  - scale text stroke `stroke_width` (if used)
  - do **not** scale unitless/percentage text spacing knobs
- **Media (`image`, `video`, `iframe`)**:
  - scale box geometry
  - scale corner radii
  - scale rectangular stroke widths (if used)
- **Container/component (`container`, `component`)**:
  - scale box geometry
  - scale padding + gaps
  - scale corner radii + effects
  - do not change flex alignment enums
- **Instance/template instance (`instance`, `template_instance`)**:
  - scale box geometry and positioning
  - do not mutate `props/properties` by default

## Future extensions / open questions

- **Non-uniform scale**: if we later support $(s_x, s_y)$, define a canonical “thickness scale” $s_t$ for stroke/effects. Candidates: arithmetic mean $((s_x+s_y)/2)$, geometric mean $\sqrt{s_x s_y}$, or max $\max(s_x,s_y)$. For now this spec defines uniform scaling only, so we keep $s$.
- **Paint transforms**: gradients/patterns may have their own transform spaces; decide whether K-scale should scale those transforms.

## Model survey: parameter-space scaling in existing tools

Parameter-space scaling is an authoring-time concept that appears across many design and graphics tools under different names and UX presentations. While implementations vary, the underlying idea—rewriting geometry-defining parameters to preserve visual appearance—is consistent.

This section surveys representative models to clarify common ground and differences.

### Figma

Figma exposes parameter-space scaling as **Scale (K)**. The tool applies a uniform scale factor to bounding geometry and geometry-contributing parameters such as stroke widths, corner radii, and effects, without introducing a persistent transform.

Although the implementation is user-facing, the concept itself is not formally named in Figma’s documentation and is presented as a mode of resizing rather than as a distinct authoring operation.

[Figma: Scale layers while maintaining proportions
](https://help.figma.com/hc/en-us/articles/360040451453)

### Adobe Illustrator

Adobe tools distinguish between transform-based scaling and parameter rewriting through options such as **“Scale Strokes & Effects”**.

When enabled, stroke widths, dash patterns, and effect radii are scaled alongside object geometry. This explicitly separates:

- geometric transforms (matrix-based)
- baked, appearance-affecting scale

This model closely matches parameter-space scaling as defined in this document.

### Inkscape

Inkscape frames scaling as a transform operation with user-configurable preferences (e.g. _“Scale stroke width”_).

While presented differently in the UI, enabling these options causes stroke and effect parameters to be rewritten, functionally aligning with parameter-space scaling despite transform-oriented terminology.

### CAD / DCC tools (e.g. Blender)

Many 3D and CAD tools separate **object scale** from **applied / frozen scale**.

- Object scale: stored as a transform, evaluated at runtime.
- Apply / freeze scale: bakes scale into geometry data.

While primarily focused on geometry rather than appearance parameters, this distinction mirrors the authoring-time vs runtime separation central to parameter-space scaling.

[Blender: Apply Scale](https://docs.blender.org/manual/en/latest/scene_layout/object/editing/apply.html)

### Summary

Across tools and domains, the same conceptual boundary recurs:

- **Transform scale**: runtime, reversible, matrix-based
- **Parameter-space scale**: authoring-time, destructive, geometry-defining

This document adopts the latter as a first-class authoring operation, independent of any specific product’s UX or terminology.
