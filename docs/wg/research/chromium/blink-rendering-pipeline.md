---
title: "Blink Rendering Pipeline — Style, Layout, Paint"
tags: [research, chromium, css, layout, paint]
---

# Blink Rendering Pipeline

How Chromium's Blink engine resolves CSS, lays out elements, and paints
them to the screen.

Source: `third_party/blink/renderer/core/` in chromium.googlesource.com

---

## Phase Separation

Blink uses a strict 4-phase pipeline:

```
DOM + CSSOM
    ↓
[1. Style]     ComputedStyle per element
    ↓
[2. Layout]    PhysicalFragment tree (positioned boxes)
    ↓
[3. Paint]     DisplayItemList (draw commands)
    ↓
[4. Composite] GPU layers, tiles, rasterization
```

---

## 1. Style — ComputedStyle Property Groups

`ComputedStyle` stores all resolved CSS properties for an element. Properties
are organized into sub-structs for memory efficiency and copy-on-write sharing.

Source: `core/style/computed_style.h`, `core/css/css_properties.json5`

### Key sub-struct groups

| Group                  | Type                    | Inherited | Properties                                                                                                                 |
| ---------------------- | ----------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Box**                | `StyleBoxData`          | No        | width, height, padding, margin, border-style/width, min/max, z-index, box-sizing, justify-content, align-items (~30 props) |
| **Surround**           | `StyleSurroundData`     | No        | border-color, border-radius, position insets (top/right/bottom/left), aspect-ratio (~19 props)                             |
| **Background**         | `StyleBackgroundData`   | No        | background-color (+ FillLayer stack for images)                                                                            |
| **Visual**             | `StyleVisualData`       | No        | clip, text-decoration-line, zoom (~4 props)                                                                                |
| **Inherited**          | `StyleInheritedData`    | Yes       | color, cursor, letter-spacing, line-height, word-spacing (~8 props)                                                        |
| **SVG**                | `StyleSVGData`          | No        | opacity, transform, transform-origin (~7 props)                                                                            |
| **SVG Inherited**      | `StyleSVGInheritedData` | Yes       | fill, stroke, clip-rule, paint-order (~9 props)                                                                            |
| **Rare non-inherited** | misc groups             | No        | opacity, overflow, mix-blend-mode, flex-_, grid-_, transform, filter (~187 props across ~12 subgroups)                     |
| **Rare inherited**     | misc-inherited          | Yes       | text-align, text-transform, white-space, list-style (~16+ per subgroup)                                                    |

### Design rationale

- **Copy-on-write**: Multiple elements share the same subgroup instance via `Member<>` pointers
- **Inheritance separation**: Inherited and non-inherited properties are in separate groups to optimize the inheritance constructor
- **Rare data**: Infrequently-used properties are in "misc" subgroups so elements without flex/grid/transform don't allocate memory for them

---

## 2. Layout — LayoutNG Fragments

### Subpixel precision

Chromium uses fixed-point subpixel arithmetic throughout layout. Rounding to
device pixels only happens at the final paint/rasterization stage.

| Type                | Precision                              | Use                        |
| ------------------- | -------------------------------------- | -------------------------- |
| `LayoutUnit`        | 1/64 px (26.6 fixed-point `int32`)     | Block layout, box model    |
| `TextRunLayoutUnit` | 1/65536 px (16.16 fixed-point `int32`) | Text shaping               |
| `InlineLayoutUnit`  | 1/65536 px (16.16 fixed-point `int64`) | Inline layout accumulation |

Source: `platform/geometry/layout_unit.h`

### Block layout

`BlockLayoutAlgorithm` lays out children sequentially:

1. Resolve BFC (Block Formatting Context) offset
2. For each in-flow child: compute margins, apply margin collapsing, position
3. Handle floats and out-of-flow positioned elements
4. Produce `PhysicalBoxFragment` with size, children, baselines

Margin collapsing is tracked via `CollapsibleMarginSet` — positive and
negative margins are tracked separately and resolved per the CSS spec.

Source: `core/layout/block_layout_algorithm.h`

### Inline layout

Inline layout is the most complex part. It uses a flat item list:

```
InlineItemsBuilder          LineBreaker              InlineLayoutAlgorithm
(DOM → flat items)    →    (items → lines)     →   (lines → fragments)
```

**InlineItem types** (`core/layout/inline/inline_item.h`):

- `kText` — contiguous span of styled text
- `kOpenTag` — start of inline box (`<em>`, `<code>`)
- `kCloseTag` — end of inline box
- `kAtomicInline` — replaced element (`<img>`)
- `kFloating`, `kOutOfFlowPositioned`, `kListMarker`

**Key pattern: flat text + offset addressing.** All text is merged into one
continuous string. Items reference offsets into it. Nesting is tracked via
`kOpenTag`/`kCloseTag` items and a styling stack (`InlineLayoutStateStack`).

### Inline box padding as layout space

When `LineBreaker` encounters `kOpenTag` (e.g. `<kbd>`), it computes the
element's inline-start spacing and advances the line position:

```cpp
// line_breaker.cc — ComputeOpenTagResult()
item_result->inline_size = margins.inline_start
                         + borders.inline_start
                         + padding.inline_start;
position_ += item_result->inline_size;
```

This applies to **every inline element** with non-zero padding, border, or
margin — the check is purely CSS-driven:

```cpp
if (style.HasBorder() || style.MayHavePadding() || style.MayHaveMargin())
```

When `kCloseTag` is reached:

```cpp
// ComputeInlineEndSize()
return margins.inline_end + borders.inline_end + paddings.inline_end;
```

The text inside the element is laid out at the shifted position. The padding
is consumed as inline space on the line, potentially causing earlier line
breaks.

Source: `core/layout/inline/line_breaker.cc`

### Line breaking

`LineBreaker` processes items sequentially, measuring and accumulating inline
size. When the accumulated width exceeds available space, a line break is
inserted. Key methods:

- `HandleText()` — shape text, check break opportunities
- `HandleOpenTag()` — push box state, add inline-start spacing
- `HandleCloseTag()` — pop box state, add inline-end spacing
- `HandleAtomicInline()` — measure replaced element

Source: `core/layout/inline/line_breaker.h`

### Fragment output

After layout, `FragmentItems` stores a flat list of positioned fragments:

```cpp
struct FragmentItem {
    enum ItemType { kText, kGeneratedText, kLine, kBox };
    PhysicalRect rect_;          // Physical position/size
    ShapeResultView* shape_result;
    TextOffsetRange text_offset;
    LayoutObject* layout_object_;
};
```

Source: `core/layout/inline/fragment_item.h`

### Flex layout

`FlexLayoutAlgorithm` follows the CSS Flexbox spec. Phases:

1. Construct flex items, compute hypothetical main sizes
2. Build flex lines (group by wrap)
3. Resolve main/cross sizes
4. Apply alignment (justify-content, align-items)
5. Generate final fragments

Source: `core/layout/flex/flex_layout_algorithm.h`

---

## 3. Paint — Paint Phases

Chromium paints in 5 phases per stacking context:

```cpp
enum PaintPhase {
    kBlockBackground,     // Backgrounds + borders of block boxes
    kForcedColorsModeBackplate,
    kFloat,               // Floating elements
    kForeground,          // All inline content (text, replaced, atomic)
    kOutline,             // Outlines (on top of everything)
};
```

Source: `core/paint/paint_phase.h`

### Paint order within kBlockBackground

1. Box shadow (outer) — `BoxPainterBase::PaintNormalBoxShadow()`
2. Background color
3. Background images (from top fill-layer to bottom)
4. Border — `BoxBorderPainter::PaintBorder()`
5. Box shadow (inset) — `BoxPainterBase::PaintInsetBoxShadow()`

### Inline box painting

`BoxFragmentPainter::PaintInlineItems()` iterates `FragmentItems` and
delegates to:

- `InlineBoxPainter` — box decorations (background, border, border-radius)
  for inline elements like `<code>`, `<kbd>`, `<mark>`
- `TextPainter` — text rendering with per-run styles

Box decorations are painted first, then text on top.

Source: `core/paint/box_fragment_painter.h`, `core/paint/text_painter.h`

### Border painting

`BoxBorderPainter` handles all border-style types (solid, dashed, dotted,
double, groove, ridge, inset, outset). Supports rounded borders
(border-radius) and applies opacity groups for complex borders.

Source: `core/paint/box_border_painter.h`

---

## 4. Lists — Marker Generation

### ::marker pseudo-element

List markers are `::marker` pseudo-elements automatically created for
elements with `display: list-item`. The marker is not a regular DOM element.

Source: `core/layout/list/layout_list_item.h`

### Marker types

`ListMarker::GetListStyleCategory()` determines the marker category:

| Category    | Examples                          | Source                                   |
| ----------- | --------------------------------- | ---------------------------------------- |
| `kNone`     | `list-style-type: none`           | No marker                                |
| `kSymbol`   | disc (•), circle (◦), square (▪)  | Static character                         |
| `kLanguage` | decimal, lower-alpha, upper-roman | `CounterStyle::GenerateRepresentation()` |

### Counter system

`ListItemOrdinal` tracks ordinal values per list item:

- Computed in DOM tree order
- Can be explicit (`<li value="5">`)
- Auto-increments from previous sibling

`CounterStyle` generates text representations with prefix/suffix:

```cpp
GenerateRepresentationWithPrefixAndSuffix(int value)
// Returns e.g. "1. ", "a. ", "IV. "
```

Source: `core/layout/list/list_marker.cc`, `core/css/counter_style.h`

### Marker positioning

**Outside markers** (default): `LayoutOutsideListMarker` extends
`LayoutBlockFlow`. Positioned via negative margins in the padding space
created by `padding-inline-start: 40px` on `<ul>`/`<ol>`.

**Inside markers**: `LayoutInsideListMarker` extends `LayoutInline`.
Rendered inline with the first line of content.

Source: `core/layout/list/layout_outside_list_marker.h`,
`core/layout/list/layout_inside_list_marker.h`

---

## Key Architecture Patterns

1. **Physical coordinates**: All layout output uses physical coordinates
   (top-left origin). Logical→physical conversion at layout boundaries.

2. **Fragment tree**: Hierarchical tree of fragments. Blocks contain inline
   fragments which contain text/replaced fragments.

3. **Inline flattening**: All inline content within a block is flattened
   into a single `FragmentItems` container for efficient spatial access.

4. **Atomicity**: Atomic inlines (inline-block, replaced, floats) paint
   as if they're stacking contexts.

5. **Copy-on-write style**: `ComputedStyle` sub-structs are shared between
   elements via reference-counted pointers, only creating new instances
   when a property differs.
