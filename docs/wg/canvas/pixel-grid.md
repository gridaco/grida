---
title: Pixel Grid
description: The unit lattice of the canvas — its visual render, and the deliberate split between rendering the grid and snapping to it.
tags:
  - internal
  - wg
  - editor
format: md
---

**Pixel grid** names two different systems that happen to share one
lattice, and the first job of this document is to split the term:

1. **Rendering the pixel grid** — a visual overlay: hairlines at
   every integer canvas coordinate, painted above the content,
   visible only when zoomed in far enough that one canvas unit spans
   several screen pixels. Pure chrome; it contributes nothing to any
   behavior. This document.
2. **Snapping to the pixel grid** — quantization of interaction:
   gesture outputs round to the lattice, so a translate never commits
   `x = 0.11319999`. That is an interpretation rule, not a render,
   and it is specified with the rest of snapping in
   [snap.md](./snap.md).

The two share only the lattice definition. Each toggles independently,
and neither reads the other's toggle: quantization is exactly as
active when the grid is invisible, and the grid renders exactly the
same whether or not anything snaps to it.

The web implementation is the doctrine source:
[`@grida/canvas-pixelgrid`](https://github.com/gridaco/grida/tree/main/packages/grida-canvas-pixelgrid)
and the `pixel-grid` primitive of `@grida/canvas-hud`, hosted by
`@grida/svg-editor` and the main editor.

## The lattice

The lattice is the set of integer coordinates of **canvas space** —
lines at every whole unit on both axes, with a quantum of 1. It is a
property of the coordinate system, not of any document: it does not
move with content, is identical in every scene, and has no persisted
state. Zoom and pan change only where the lattice lands on screen.

One canvas unit is one design pixel; the lattice is what "pixel" means
everywhere the editor says it — the render below, the quantization in
[snap.md](./snap.md), and integer nudge amounts all agree on it.

## The render

The grid paints **above the content, never behind it** — its whole
purpose is to stay visible as you zoom in, and filled artwork would
hide a behind-content lattice exactly where it is consulted. It sits
under every piece of chrome, so selection outlines, snap guides, and
handles still read on top. Its place in the canvas stack (normative
order in [transparency-grid.md](./transparency-grid.md)):

> transparency grid → solid background → content → **pixel grid** →
> chrome

- **Zoom gate.** The grid renders only while `zoom > threshold` — the
  reference threshold is 4 (a canvas unit spans more than four screen
  pixels), matching the web host default. The gate is a hard switch,
  not a fade: below the threshold the grid is simply absent. Below
  ~4× the hairlines would collapse into a moiré wash; the gate is a
  legibility rule, not an optimization.
- **Crispness.** Lines are exactly one device pixel wide at any zoom
  and any display scale — the stroke width divides out the camera and
  DPR scale rather than scaling with them.
- **Coverage.** Lines are drawn for the visible canvas range plus a
  small overscan margin (±2 units in the web implementation) so lines
  don't pop in and out at the viewport edge during pan.
- **Appearance.** Low-alpha neutral hairlines; the grid must never
  compete with content or chrome for attention.

The toggle (`pixelgrid: on | off`) is per-instance **view state**: not
in the document, not in history, not synced. Toggling it accrues
overlay damage only — a present, never a document frame
([frame.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/frame.md), [hud.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/hud.md) compositing rule).

## What it is not

- **Not a snapping mechanism.** The render never participates in any
  hit-test or gesture math. "Snap to pixel grid" is quantization,
  owned by [snap.md](./snap.md), and is not conditioned on the grid
  being visible.
- **Not the engine's pixel preview.** The engine's
  `pixel_preview_scale` render intent rasterizes _content_ at a
  coarser scale; it shares nothing with this overlay.
- **Not a document grid.** Layout grids (columns, rows, per-frame
  grids) are document-attached and out of scope here.

## Contracts

- **PXG-1** Purity: with the grid on or off, every interaction —
  hit-testing, gestures, snapping, committed values — is bit-for-bit
  identical. Toggling the grid changes pixels and nothing else.
- **PXG-2** Zoom gate: at `zoom ≤ threshold` no grid line is painted
  even when enabled; at `zoom > threshold` the enabled grid paints
  hairlines at every integer canvas coordinate in view.
- **PXG-3** Crispness: a rendered grid line is one device pixel wide,
  independent of zoom and display scale.
- **PXG-4** Determinism: the grid render is a pure function of
  (enabled, camera, viewport size) — equal inputs paint identical
  pixels (refines SURF-5).
- **PXG-5** Independence: quantization ([snap.md](./snap.md)) behaves
  identically whether the grid is visible or not, and the grid renders
  identically whether quantization is on or not.
- **PXG-6** Stack position: the grid paints **above the content** and
  beneath every other overlay — zooming into filled artwork keeps the
  lattice visible over it (the canvas stack is normative in
  [transparency-grid.md](./transparency-grid.md)).
