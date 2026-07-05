---
title: Transparency Grid
description: The alpha backdrop — the checkerboard beneath everything that makes "nothing is painted here" visible.
tags:
  - internal
  - wg
  - editor
format: md
---

The **transparency grid** is the checkerboard at the very bottom of
the canvas stack: it shows wherever the document leaves pixels
uncovered, which is what makes transparency *visible* — an unpainted
region and a white-filled region must not look the same. It is pure
substrate: no toggle, no state, no behavior; a document with an
opaque background simply covers it.

The web implementation is the doctrine source:
[`@grida/canvas-transparency-grid`](https://github.com/gridaco/grida/tree/main/packages/grida-canvas-transparency-grid)
(2D and WebGPU backends, one cell math).

## The canvas stack

The substrate order, bottom to top — normative for every host:

1. **transparency grid** — this document
2. **solid background** — the scene's background color, when set
3. **content** — the artwork
4. **pixel grid** — the unit lattice render
   ([pixel-grid.md](./pixel-grid.md)), *above* the content
5. chrome (snap guides, ruler guides, selection, panels, …)

The two grids bracket the content deliberately: the transparency grid
explains what is *not* painted, so it sits beneath everything; the
pixel grid explains where painted things *land*, so it sits on top —
rendering it behind the content would hide it exactly where it is
consulted.

## The cells

- **Screen-stable size.** A cell reads as roughly 20 **device** px at
  any zoom: the cell's canvas-unit size is `20 / zoom`, quantized to
  the 1-2-5 "nice number" series so the size steps rather than
  shimmers as the camera scales. Cells are anchored at canvas-space
  multiples of the step, so the pattern pans with the content.
- **Pattern.** Cells at even index sums fill with a low-alpha neutral
  (reference `rgba(150, 150, 150, 0.15)`); odd cells stay the base.
  The base is the host's blank-canvas color (reference: white) — it
  is also what makes the surface opaque, so a background-less
  document never shows the window behind the editor.
- **Coverage.** The visible canvas range plus a small overscan (±2
  cells), matching the pixel grid's rule.

## Engine note (reference implementation)

The renderer owns the surface clear (the scene background, or
transparent when the scene has none), so the shell cannot paint
beneath the content by painting *first* — the clear would erase it.
The reference shell composites the grid **after** the content pass
with a destination-over blend: the cells, then the base, each landing
beneath whatever is already on the surface. Same stack, reversed
paint order; possible because the surface carries an alpha channel.

## Contracts

- **TG-1** Purity: the grid is decorative substrate — it participates
  in no hit-test, gesture, or committed value, and its render is a
  pure function of (camera, viewport size).
- **TG-2** Stack position: the grid is visible exactly where the
  layers above it (background, content) leave alpha, and never over
  them — an opaque scene background hides it completely.
- **TG-3** Cell stability: the cell's on-screen size stays within the
  1-2-5 quantization band around the 20-device-px target at every
  zoom, and cells stay anchored to canvas space (they pan with
  content).
