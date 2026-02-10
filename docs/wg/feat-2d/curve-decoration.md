---
title: Curve Decorations (2D)
---

# Curve Decorations (2D)

> Renderer-agnostic model for attaching glyphs (arrowheads, markers, ticks) to 2D paths using the path's local frame.

| feature id         | status  | description                                                                  | PRs                                               |
| ------------------ | ------- | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| `curve-decoration` | partial | Endpoint markers (built-in presets) implemented; joins/mid-path in spec only | [#538](https://github.com/gridaco/grida/pull/538) |

---

## Abstract

This working group defines **curve decorations**: how arbitrary glyphs (arrowheads, dots, diamonds, dimension ticks) are attached to a 2D path and oriented by the path's local tangent/normal. Raster backends such as Skia only provide three native stroke caps (butt/round/square); custom endpoint styles are implemented as explicit marker geometry. The model unifies endpoint markers, mid-path markers, and repeated directional symbols under a single, arc-length-based placement and local-frame semantics, and is intended to be compatible with SVG markers, Skia, PDF, and CAD-style pipelines.

---

## Motivation

Design tools commonly expose "line endpoints" like arrowheads, dots, diamonds, and dimension ticks. Those must be rendered as **explicit marker geometry** attached to a path, not as backend stroke caps.

This spec defines a renderer-agnostic model for attaching such glyphs to a 2D path using the path's local frame. It is intended to unify:

- endpoint markers (arrowheads, dots, squares, etc.)
- mid-path markers (at joins / along length)
- repeated directional symbols
- measurement / diagram markers

---

## Path model and parameterization

Although we use "curve" informally, the engine deals with **paths**: piecewise contours comprised of line/quad/cubic segments.

We distinguish two parameterizations:

### Curve parameter (segment parameter)

Each segment has its own parameter (e.g. Bézier $t\in[0,1]$). This is useful for geometry math but **not stable for placement by distance**.

### Arc-length parameter (recommended for placement)

For placement, we use **arc-length** $\ell$ measured along a contour, or its normalized fraction $u\in[0,1]$:

- $\ell \in [0, L]$ where $L$ is the contour length
- $u = \ell / L \in [0,1]$

Unless explicitly stated otherwise, **placement in this spec uses arc-length** (absolute $\ell$ or normalized $u$).

---

## Local frame on a path

For a placement position on a contour, we define:

- position: $p$
- unit tangent: $\hat{t}$
- unit normal: $\hat{n}$

### Tangent

At arc-length $\ell$, tangent is the direction of travel along the contour:

$$
\hat{t}(\ell) = \frac{d\gamma}{d\ell}
$$

### Normal (2D convention)

To make "normal offset" unambiguous, we define the **left normal**:

$$
\hat{n} = (-\hat{t}_y,\; \hat{t}_x)
$$

This means normal offsets are **relative to the path direction**. If orientation reverses $\hat{t}$, $\hat{n}$ also flips.

### Degenerate tangent fallback

Real paths can contain degenerate segments (zero length, repeated points) where the tangent is undefined. Implementations should:

- skip orientation for that decoration, **or**
- search for the nearest non-zero tangent along the contour (preferred for endpoints/joins)

This document treats the fallback as an implementation policy, but the behavior must be deterministic.

---

## Marker glyph

A **MarkerGlyph** is geometry defined in its own local "marker space".

**Required properties:**

- **geometry**: an arbitrary 2D path/primitive set (filled and/or stroked)
- **anchor**: a point $a$ in marker space that will be placed at $p$
- **forward axis**: a unit vector $\hat{f}$ in marker space that represents the glyph's "forward" direction
- **cutback depth**: a scalar $c \geq 0$ in marker-space units (see § Cutback)

**Optional properties:**

- style override (fill/stroke/paint)
- intrinsic rotation offset (if $\hat{f}$ is not the +X axis)

This is conceptually similar to SVG `<marker>` (`refX`/`refY` as anchor, `orient` as tangent alignment), but kept renderer-agnostic.

### Anchor modes

Two anchor modes are defined (implementation also supports a parametric **Offset** along the forward axis):

- **Terminal**: the marker's forward edge or tip is placed at the evaluation point. The body extends in the $-\hat{f}$ direction. Suitable for endpoint decorations where the marker should sit flush with the logical path boundary.
- **Centroid** (also: center / node): the marker's geometric center or centroid is placed at the evaluation point. The body extends symmetrically in both $\pm\hat{f}$ directions. Suitable for mid-path or junction markers.

The anchor mode determines both the geometric placement of the marker and how the cutback depth is computed.

---

## Placement

A **Placement** determines _where_ decorations appear.

### Attachment domains

For a given contour:

- **start**: contour start ($\ell = 0$)
- **end**: contour end ($\ell = L$)
- **joins**: interior vertices (segment boundaries) on a piecewise path
- **at**: explicit arc-length positions (absolute $\ell$) or fractions (normalized $u$)
- **every**: repeated placement at regular arc-length intervals

**Notes:**

- Endpoints are meaningful only for **open** contours. For closed contours, `start` and `end` coincide; endpoint placement is typically ignored or treated as `at(u=0)`.
- `joins` implies a piecewise path model; joins do not exist on a single analytic curve without segmentation.

### Arc-length vs parameter (important)

If a placement is specified by "parameter value" on a Bézier segment, it is not proportional to distance and is rarely what users expect. For design-tool semantics, **arc-length placement** should be the default.

If we ever expose curve-parameter placement, it should be a separate explicit mode (e.g. `at_param`).

### Multi-contour paths

Paths may have multiple contours (subpaths). Placement resolution must specify whether it applies:

- per contour (SVG-style start/mid/end), **or**
- to a flattened "entire path" ordering

For initial 2D editor semantics, **per contour** is recommended.

---

## Orientation policy

Orientation controls how marker space is rotated relative to the local frame.

### Policies

- **none**: no tangent alignment (fixed world rotation)
- **auto**: align glyph forward axis $\hat{f}$ to $\hat{t}$
- **auto-start-reverse**: like SVG `orient="auto-start-reverse"`
  - end marker uses $\hat{t}$
  - start marker uses $-\hat{t}$ (so it points outward)

### Join tangent selection (for `joins`)

At a join there are two natural tangents:

- **incoming**: tangent approaching the vertex
- **outgoing**: tangent leaving the vertex

For orientation at joins, define one of:

- `incoming`
- `outgoing`
- `bisector` (angle bisector between incoming/outgoing; may require miter-limit style clamping)

---

## Scale policy

Scale controls how marker glyphs size in world space.

- **absolute**: fixed world-unit size
- **stroke-relative**: proportional to effective stroke width at placement

If stroke width varies along the path (width profile), `stroke-relative` should use the **local effective width** at the placement position.

---

## Offset

Offset is an optional translation relative to the local frame:

- **tangent offset**: $o_t$ along $\hat{t}$
- **normal offset**: $o_n$ along $\hat{n}$

World translation contribution:

$$
\Delta = o_t \hat{t} + o_n \hat{n}
$$

Offsets are essential for:

- pulling an arrowhead "back" so the tip sits on the endpoint
- drawing dimension ticks slightly off the stroke centerline

---

## Transform composition (conceptual)

For an arc-length position $\ell$, with position $p$, tangent $\hat{t}$, and marker anchor $a$, the marker transform is conceptually:

$$
M(\ell) =
\text{Translate}(p + \Delta)
\cdot \text{Rotate}(\theta)
\cdot \text{Scale}(k)
\cdot \text{Translate}(-a)
$$

Where:

- $\theta = \text{atan2}(\hat{t}_y, \hat{t}_x) + \theta_{\text{intrinsic}}$ for `auto` policies
- for `none`, $\theta$ is a fixed world rotation
- $k$ comes from the scale policy
- $\Delta$ comes from offset (see Offset section)

The exact multiplication order depends on engine conventions, but the intent is: **anchor → scale → orient → place**.

---

## Rendering semantics (policy-level)

Marker glyphs are separate geometry. Two practical semantics matter:

### Draw order

Default: stroke path first, then draw markers on top. This matches most design tools.

### Cutback / stroke trimming (endpoint-only)

When a marker with cutback depth $c > 0$ is placed at an endpoint of an **open contour**, the renderer **must** shorten the stroked path by $c$ at that endpoint before computing the stroke outline.

Formally, for an open contour with arc-length $L$:

- **End marker** with cutback $c_e$: stroke the sub-path $[0,\; L - c_e]$ instead of $[0,\; L]$.
- **Start marker** with cutback $c_s$: stroke the sub-path $[c_s,\; L]$ instead of $[0,\; L]$.
- **Both**: stroke the sub-path $[c_s,\; L - c_e]$.

The marker itself is still placed at the **original** endpoint position (arc-length $0$ or $L$), evaluated on the **untrimmed** path. This ensures the marker's tip/center aligns with the logical endpoint while the stroke terminates cleanly at the marker's base/edge.

For **closed contours** and **mid-path placements**, cutback is not applied (the stroke continues on both sides of the placement point).

### Cutback depth computation

The cutback depth $c$ is not a fixed constant per shape — it depends on both the marker geometry and the stroke width. The goal is to trim the stroke just enough so it does not visually bleed under the filled marker.

For a terminal-aligned filled marker, $c$ is the distance from the anchor (forward edge) to the point where the marker's boundary first clears the stroke's half-width $w/2$ (where $w$ is the stroke width).

#### Triangular / pointed shapes

For a shape with straight edges from the tip $(0, 0)$ to a base at $(-d,\; \pm h)$ where $d$ is the depth and $h$ is the half-height:

$$
c = d \cdot \frac{w/2}{h}
$$

clamped to $[0,\; d]$. When $w/2 \geq h$, the stroke is wider than the marker and $c = d$.

This applies to arrows, triangles, diamonds, and any convex pointed shape with linear edges.

#### Circular shapes

For a circle with radius $r$ and forward edge at the anchor:

$$
c = r - \sqrt{r^2 - (w/2)^2}
$$

When $w/2 \geq r$, the stroke is wider than the circle and $c = 2r$ (full diameter).

#### Rectangular shapes

For an axis-aligned rectangle (e.g. square, vertical bar), the edges are parallel to the stroke. The stroke cannot "peek around" the sides, so $c$ equals the full backward extent of the rectangle.

#### Open (stroked) markers

For markers that are **stroked** rather than filled (e.g. an open chevron), there is no filled silhouette to intersect with $y = w/2$. Cutback is typically a fixed amount (e.g. proportional to stroke width) so the stroke path ends cleanly at the marker's visible base; the exact value is shape-dependent.

#### General case

For arbitrary marker geometry, the cutback can be computed by finding the $x$-coordinate (in marker space, along $-\hat{f}$) of the intersection between the marker's silhouette boundary and the line $y = w/2$. Implementations may approximate this via path bounds or analytic solutions for known shape classes.

---

## Relationship to existing models

### SVG markers

SVG is a specific instance of this model:

- placements: start/mid/end
- orientation: `auto` / `auto-start-reverse`
- marker anchor: `refX`/`refY`
- scaling: `markerUnits` (often `strokeWidth`)

Curve Decorations are intended to be **at least as expressive**, while remaining backend-agnostic.

### Stroke caps (backend caps vs decorations)

Classic stroke caps (butt/round/square) are natively supported by many renderers (including Skia) and should usually remain a **paint/stroke style property** for performance and fidelity.

Custom "caps" (arrowheads, diamonds, circles, etc.) are best represented as **endpoint placements of curve decorations**.

In other words:

- backend cap styles are still used when no decoration is present at that endpoint
- curve decorations cover the generalized marker cases
- **cap override**: when a decoration is placed at an endpoint, the renderer should use **butt** cap at that endpoint so the native cap geometry does not show under the marker. The stroke is trimmed by the marker's cutback depth and the marker is drawn on top.

---

## Minimal conceptual schema

Conceptually:

```
MarkerGlyph
 ├─ geometry: Path/Primitive
 ├─ anchor: Point
 ├─ forward_axis: Vec2
 └─ cutback_depth: f32  (computed from geometry + stroke width)

CurveDecoration
 ├─ glyph: MarkerGlyph
 ├─ placement: Placement
 ├─ orient: OrientationPolicy
 ├─ scale: ScalePolicy
 └─ offset: Offset
```

This decomposition covers common 2D editor needs without introducing overlapping primitives.

---

## Implementation scope (document model)

The current document model exposes **built-in presets only** (no arbitrary glyph geometry in the wire format):

- **LineNode**: `stroke_decoration_start`, `stroke_decoration_end` (enum per endpoint).
- **VectorNode**: same for logical start/end of the vector path; per-vertex overrides via `vertex_overrides` (vertex index + `stroke_decoration`).

All built-in presets are **terminal-aligned** and **stroke-relative** in scale. The schema enum includes: None, ArrowLines (open stroked chevron), TriangleFilled, CircleFilled, SquareFilled, DiamondFilled, VerticalBarFilled. The engine supports the full anchor and cutback model internally (including Centroid and parametric Offset) for tests and future extensibility; see `shape/marker.rs` and golden examples.

---

## Implementation note (Skia viability)

Skia provides arc-length traversal utilities that return contour length $L$ and position plus tangent at distance $\ell$. Endpoint and along-path placement are therefore straightforward: evaluate the local frame at $\ell=0$ and $\ell=L$ for endpoint markers, and negate the tangent for start markers when using `auto-start-reverse`.

---

## Design goals and non-goals

### Design goals

The model aims to be:

- **renderer-agnostic**: Skia, SVG, PDF, CAD-style pipelines
- **precise**: explicit arc-length placement and local frame definitions
- **extensible**: repeated markers, join semantics, variable stroke widths
- **collaboration-friendly**: stable parameterization options for CRDT usage

### Non-goals (initial scope)

Out of scope for this spec version:

- continuous extrusion / procedural brushes
- full along-curve ornament fields (texture-like decoration)
- 3D curve decorations

These can be layered later on top of the same "attach glyphs to a path" primitive.

---

## Terminology

| Term                   | Meaning                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Path / contour**     | Piecewise curve, possibly multiple subpaths                                                                   |
| **Curve Decoration**   | Glyph attached to a path via local frame evaluation                                                           |
| **MarkerGlyph**        | Geometry in marker space with anchor + forward axis                                                           |
| **Placement**          | Where to attach (endpoints, joins, arc-length positions, repeated)                                            |
| **Orientation policy** | How to align glyph relative to tangent                                                                        |
| **Anchor mode**        | Terminal (forward-edge aligned) or Centroid (center-aligned); implementation also supports parametric Offset  |
| **Cutback depth**      | Distance by which the stroke is trimmed at a decorated endpoint; function of marker geometry and stroke width |
