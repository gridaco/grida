---
format: md
tags:
  - internal
  - wg
  - canvas
  - svg
  - import
  - text
---

# SVG Text Import Model

Status: **Active** — describes the current import strategy.

## Problem

SVG's `<text>` / `<tspan>` model is fundamentally different from Grida's
text model. SVG text is a **character-level positioning system** with inline
style runs, per-character coordinates, baseline shifts, and bidirectional
layout. Grida's `TextSpanNodeRec` is a **paragraph box** — one string, one
style, rendered by Skia's paragraph engine.

A lossless mapping is not possible without a rich-text / attributed-string
model that Grida does not yet have.

## Design Decision

**One usvg `TextChunk` → one Grida `TextSpanNodeRec`.** The SVG `<text>`
element becomes a Grida `GroupNodeRec` that contains TextSpan children.

This is the same tradeoff Figma makes when importing SVG text: inline style
variations within a single text run are flattened to the dominant style, and
features like `baseline-shift` are dropped.

### Why chunks, not spans

usvg parses `<text>` into **chunks** and **spans**:

- A **chunk** is created at each absolute repositioning (`x` or `y`
  attribute on a `<tspan>`). Each chunk has a resolved `(x, y)` position
  and a single text string.
- A **span** is a style run within a chunk (different fill, font-size,
  font-weight, etc.). Spans have `start`/`end` byte offsets into the
  chunk text but **no position data** — they flow inline from the chunk
  origin.

If we mapped each span to a TextSpan node, multiple spans within one chunk
would all be placed at the same `(x, y)`, causing them to overlap. We don't
have per-span advance widths from the chunk/span API to compute inline
offsets.

usvg does provide lower-level APIs (`layouted()`, `flattened()`) with
per-glyph positions, but:

- `flattened()` converts to path outlines — text is no longer editable.
- `layouted()` provides per-glyph transforms but requires reimplementing
  glyph-level rendering, bypassing our paragraph engine.

Neither fits our goal of retaining editable text.

### The mapping

```text
SVG                         Grida Scene Graph
─────────────────────────   ─────────────────────────────
<text>                  →   GroupNodeRec (inherits text's transform)
  chunk[0] (x, y)      →     TextSpanNodeRec (positioned at chunk x, y)
  chunk[1] (x, y)      →     TextSpanNodeRec (positioned at chunk x, y)
  ...                         ...
```

Each TextSpan gets:

| Property    | Source                                                                  |
| ----------- | ----------------------------------------------------------------------- |
| `transform` | Chunk's absolute `(x, y)` + text's relative transform from parent group |
| `text`      | Chunk's full text string (all spans concatenated)                       |
| `font_size` | First visible span's `font_size`                                        |
| `fill`      | First visible span's fill paint                                         |
| `stroke`    | First visible span's stroke paint                                       |
| `anchor`    | Chunk's `text-anchor`                                                   |

## What Works

| SVG Feature                              | Status | Notes                                             |
| ---------------------------------------- | ------ | ------------------------------------------------- |
| Multiline via `<tspan x="0" dy="1.2em">` | ✅     | Each line becomes a separate chunk with correct y |
| Relative positioning (`dx`, `dy`)        | ✅     | usvg folds `dy` into chunk y positions            |
| Multiple `<text>` elements               | ✅     | Each is an independent Group                      |
| `text-anchor` (start/middle/end)         | ✅     | Carried per chunk                                 |
| Basic font properties (size, family)     | ✅     | From first visible span                           |
| Fill / stroke colors                     | ✅     | From first visible span                           |

## What Is Lost

| SVG Feature                            | Status           | Recovery path                                                    |
| -------------------------------------- | ---------------- | ---------------------------------------------------------------- |
| Inline style variation within a line   | ❌ Lost          | Rich text / attributed string model                              |
| Per-character `x`/`y` coordinate lists | ❌ Lost          | Per-glyph positioning model                                      |
| `baseline-shift` (super/subscript)     | ❌ Lost          | Vertical offset per run                                          |
| `dx`/`dy` staircase within a chunk     | ⚠️ Partial       | usvg splits at absolute repos; relative-only offsets may be lost |
| `font-weight`/`font-style` variation   | ❌ Lost          | Rich text model                                                  |
| `letter-spacing`, `word-spacing`       | ❌ Lost          | TextSpan style extension                                         |
| `text-decoration` per span             | ❌ Lost          | Per-run decoration support                                       |
| Nested `<tspan>` style nesting         | ❌ Flattened     | Rich text model                                                  |
| Text on path (`<textPath>`)            | ❌ Not supported | Path-text layout engine                                          |

## Comparison with Figma

Figma makes a very similar choice when importing SVG:

- Each `<text>` becomes a text node.
- Per-chunk positioning is preserved.
- Inline style runs within a single text chunk are flattened to one style.
- `baseline-shift` (superscript/subscript) is dropped.
- Per-character coordinate lists are dropped (text flows normally).

Our import produces the same level of fidelity.

## Future: Rich Text Model

A future rich-text model would enable preserving inline style runs. The
likely approach:

- `TextSpanNodeRec` gains a `Vec<StyledRange>` or similar attributed-string
  representation.
- Each range carries fill, font-size, font-weight, baseline-shift, etc.
- The paragraph engine renders these as styled runs within a single
  paragraph layout.

This would recover most of the "Lost" items above. Per-character coordinate
lists and text-on-path would still require dedicated support.

## References

- usvg text model: `third_party/usvg/src/tree/text.rs`
- Text import code: `crates/grida-canvas/src/svg/from_usvg_tree.rs` (`convert_text`)
- Text pack code: `crates/grida-canvas/src/svg/pack.rs` (`append_text`)
- SVG text spec: https://www.w3.org/TR/SVG11/text.html
