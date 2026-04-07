---
id: impl-performance
title: "Text Editing: Performance Model"
tags:
  - internal
  - wg
  - typography
  - text
  - performance
---

## Motivation

The text editing manifesto establishes that _"queries should be cheap, cacheable, and invalidated predictably"_ (incremental computation principle). This document specifies how to achieve that property at scale.

A design tool text editor must remain responsive (sub-16ms frame budget at 60 fps) regardless of document size. The strategies here apply to both deployment targets: native Skia (OpenGL/Vulkan) and WASM/web (CanvasKit over WebGL).

The core insight is that **text editing is a viewport problem, not a document problem**. The user sees ~50-100 lines at a time. Every operation — layout, rendering, hit-testing, offset conversion — should be proportional to the _visible_ region, not the total document size.

## Scope

This document covers performance-critical paths in the text editing pipeline:

1. Text buffer representation and edit cost
2. Offset conversion (UTF-8 / UTF-16 / line-column)
3. Paragraph layout and caching
4. Rendering and viewport culling
5. WASM/web deployment constraints

It does **not** cover:

- Rich text data model performance (see `attributed-text.md` §Complexity analysis)
- Document-level layout (pagination, multi-node flow)
- Collaborative editing wire protocols

## Principles

### P1: O(log n) everything

No operation on the text buffer or its derived indices should be O(n) in document size. This includes: character access, offset conversion, line lookup, line-height queries, and scroll position mapping. Tree-based data structures (ropes, B+ trees) provide this naturally.

### P2: Incremental invalidation

An edit that changes k characters should invalidate O(k + convergence) layout work, not O(n). The pipeline must represent edits as explicit deltas and propagate them through each stage (text → line breaks → paragraph layout → render), stopping as soon as the output converges with the pre-edit state.

### P3: Viewport-first rendering

Layout and rendering are prioritized for the visible region. Off-screen content is computed lazily as it scrolls into view. Scrollbar positioning uses pre-computed cumulative line heights, not rendered content.

### P4: Amortize expensive work

Skia `Paragraph` construction (shaping + line breaking) is the most expensive single operation. It must never happen more than once per edit, and never for content outside the viewport. Results must be cached and reused across frames until invalidated.

### P5: Minimize cross-boundary traffic

In a WASM deployment, every JS ↔ WASM boundary crossing copies data between address spaces. The API surface must be coarse-grained: batch operations on the WASM side, return aggregate results. Never cross the boundary per-character or per-line in a hot loop.

## Text buffer

### Why `String` is insufficient

A contiguous `String` (or `Vec<u8>`) has O(n) insertion cost — every byte after the cursor must be shifted. For a 200 KB document, a single keystroke moves ~100 KB of memory. Combined with the full-text clone needed for undo snapshots, this makes every edit O(n) before layout even begins.

### Rope / piece table

The standard solution is a **rope**: a balanced tree of string chunks (typically 64–512 bytes per leaf). Edits splice the tree in O(log n). The same structure stores summary data at each internal node, enabling O(log n) queries on derived properties.

**Node summaries** (following xi-editor's monoid-homomorphism framework and Zed's SumTree pattern):

Each node in the rope stores a summary containing at least:

| Field       | Type  | Purpose                      |
| ----------- | ----- | ---------------------------- |
| `len`       | `u32` | UTF-8 byte count             |
| `len_utf16` | `u32` | UTF-16 code unit count       |
| `lines`     | `u32` | Number of line breaks (`\n`) |
| `chars`     | `u32` | Unicode scalar count         |

Summaries form a monoid: they can be combined (addition) and the identity is zero. A tree query walks from root to leaf, accumulating summaries, in O(log n).

**Difficulty analysis** (optional, high-value optimization):

If a chunk contains only ASCII bytes (all bytes < 128), then `len == len_utf16 == chars` and no grapheme or bidi analysis is needed. Storing a boolean `is_ascii` flag per chunk enables fast-path bypass for the common case.

### Undo snapshots

With a rope backed by reference-counted immutable nodes (`Arc<Node>`), cloning is O(1) — it increments a reference count at the root. Edits produce a new root that shares most of its structure with the old tree (persistent data structure / structural sharing). This eliminates the O(n) clone cost of snapshot-based undo.

## Offset conversion

### The problem

Skia Paragraph operates in UTF-16 code unit offsets. Rust strings are UTF-8. The editing model uses UTF-8 byte offsets. Every geometry query (caret rect, selection rects, hit-testing) crosses this boundary at least once.

A naive conversion — `text[..offset].encode_utf16().count()` — is O(n). If this is called per-line (e.g., to convert line metrics), the total cost becomes O(n × L) where L is the line count — effectively quadratic.

### Solution: cumulative index in the rope

When summaries in the rope store both `len` (UTF-8) and `len_utf16` (UTF-16), converting between offset systems is a single tree traversal:

- **UTF-8 → UTF-16**: Seek to the target byte offset in the tree, accumulating `len_utf16` from the nodes traversed. Cost: O(log n).
- **UTF-16 → UTF-8**: Seek by `len_utf16` dimension, accumulating `len`. Cost: O(log n).
- **Byte offset → line number**: Seek by `len`, accumulating `lines`. Cost: O(log n).
- **Line number → byte offset**: Seek by `lines`, accumulating `len`. Cost: O(log n).

All four conversions share the same tree traversal mechanism. No secondary data structure is needed.

### Line-start index (alternative for simpler implementations)

If a full rope is not yet in place, a `Vec<usize>` of line-start byte offsets provides O(log n) line lookup via binary search. This index is rebuilt after each edit (O(L) where L = line count), which is acceptable as an intermediate step. It should also store cumulative UTF-16 counts per line to avoid per-line conversion.

### Caching derived offsets

Geometry queries often need the same offset converted multiple times within a single frame (e.g., `caret_rect_at` needs the UTF-16 offset of the cursor, then `selection_rects` needs it again). A per-frame cache (or simply passing the converted value through the call chain) avoids redundant conversions.

## Paragraph layout

### Unit of layout

Skia `Paragraph` is designed for a single block of styled text — a paragraph, a label, a text field. It is **not** designed for an entire document. Feeding a 200 KB document into a single `Paragraph` causes:

- Full HarfBuzz shaping of the entire text on every rebuild
- Full ICU line-breaking analysis
- Full glyph positioning for all lines
- O(n) memory for glyph and line data

The correct architecture is **one `Paragraph` per logical paragraph** (text between hard line breaks), or in some cases one per visual line. Each paragraph is laid out independently and cached.

### Per-paragraph caching

Each logical paragraph stores:

- The `Paragraph` object (after `layout()`)
- The text content hash or version counter
- The layout constraints (width) at the time of layout
- Derived metrics: height, baseline, line count, line-start offsets

A paragraph is invalidated (and its `Paragraph` object discarded) only when:

- The text within that paragraph changes
- The style runs overlapping that paragraph change
- The layout width changes

On a typical keystroke, **only one paragraph is invalidated** — the one containing the cursor. All other paragraphs retain their cached layout.

### Re-layout vs. re-build

Skia `Paragraph` supports `layout(width)` without rebuilding the internal shaping data. If only the layout width changes (e.g., window resize), call `layout()` on existing paragraphs rather than constructing new ones through `ParagraphBuilder`. If text or styles change, a full rebuild is required for the affected paragraph only.

### Convergence-based re-wrapping

When an edit changes the content of one paragraph, the line breaks in that paragraph may change, shifting the vertical position of all subsequent paragraphs. However, the _content_ and _layout_ of subsequent paragraphs is unchanged — only their y-offset shifts.

If the edited paragraph's height after re-layout is the same as before, no subsequent paragraphs need any update at all. If the height changes, only y-offsets need updating (O(L) in the number of following paragraphs, or O(log n) with a height-indexed tree).

xi-editor takes this further: when re-wrapping a paragraph, it compares the new line breaks with the old ones and stops as soon as they converge. This bounds the invalidation region to the edit site plus a small convergence tail.

## Rendering and viewport

### Viewport culling

Given a scroll offset and a viewport height, compute the range of visible paragraphs using the cumulative height index (O(log n) with a tree, O(log L) with a line-start array). Only call `Paragraph::paint()` for paragraphs within this range.

For selection rendering (`get_rects_for_range`), compute selection rectangles only for visible paragraphs that overlap the selection range.

For caret rendering, compute the caret rectangle only for the paragraph containing the cursor.

### Layer separation

Separate the rendering into independent layers:

| Layer       | Invalidation trigger                       | Notes                                                    |
| ----------- | ------------------------------------------ | -------------------------------------------------------- |
| Text        | Text or style change in visible paragraphs | Heaviest layer; cache aggressively                       |
| Selection   | Selection range change                     | Lightweight geometry; recompute on selection change only |
| Caret       | Cursor position change, blink timer        | Single rectangle; near-zero cost                         |
| Diagnostics | Diagnostic range change                    | Wavy underlines; same geometry pipeline as selection     |

Each layer redraws independently. A cursor blink does not require re-rendering the text layer.

### Caret rect caching

`caret_rect_at` is called every frame (for rendering) and again for IME cursor area updates. The result depends only on:

- The text content
- The cursor offset
- The layout width

Cache the result and invalidate only when one of these changes. Within a single frame, compute it once and reuse.

### Line metrics caching

Skia `Paragraph::getLineMetrics()` returns per-line data (baseline, ascent, descent, width, start/end indices). This data is stable between frames if the paragraph hasn't been rebuilt. Cache the result per paragraph and convert the UTF-16 offsets to UTF-8 once, not on every query.

## Glyph rendering optimization

### Texture atlas (glyph cache)

For both native and WASM targets, pre-rendering frequently used glyphs into a texture atlas provides significant speedup:

- Rasterize each unique (glyph ID, font size, subpixel position) combination once into a GPU texture.
- Subsequent frames blit from the atlas (`drawImage`) instead of re-rasterizing text.
- ASCII text in common sizes hits the atlas almost exclusively.

VS Code's terminal renderer reports 5–45x speedup from atlas-based rendering compared to per-character `fillText` calls. The same principle applies to Skia: `Paragraph::paint()` internally does glyph caching, but an application-level atlas for the caret line or selection overlay text avoids rebuilding visual state unnecessarily.

### Fast paths for uniform-style paragraphs

When a paragraph has a single style run (the common case for code and plain text), layout is cheaper:

- No style switching in the `ParagraphBuilder`
- A single shaping run for the entire paragraph
- Simpler glyph positioning (no mixed metrics)

The attributed text model already tracks run count per paragraph. Use this to select a fast path when possible.

## WASM / CanvasKit deployment

### Memory model

WASM linear memory can grow but never shrink. Long-running editor sessions accumulate fragmentation. Mitigations:

- **Arena allocators** for per-frame temporary data (selection rects, line metrics conversion results). Reset the arena each frame.
- **Object pools** for `Paragraph` objects. When a paragraph is invalidated, return its memory to the pool rather than deallocating.
- **Avoid temporary string allocations** in hot paths. Pre-allocate buffers for UTF-8 ↔ UTF-16 conversion.

### Boundary crossing cost

The JS ↔ WASM boundary requires copying data between the JS heap and WASM linear memory. Strings are especially expensive (encoding conversion + copy).

**API design for WASM**:

- Expose a `layout_viewport(scroll_y, viewport_height)` function that performs all layout, hit-testing, and geometry computation on the WASM side, returning a single result buffer containing all paint commands for the visible region.
- Expose `apply_edit(command)` that processes the edit entirely on the WASM side, including attributed text updates, paragraph invalidation, and viewport re-layout.
- Never expose `get_line_content(n)` or `style_at(offset)` as individual WASM exports called from JS in a loop.

### CanvasKit surface management

CanvasKit (Skia compiled to WASM) renders to a WebGL-backed `SkSurface`. Key considerations:

- **WebGL context loss**: The browser can reclaim the WebGL context under memory pressure. The editor must handle context restoration by rebuilding the Skia surface and re-rendering.
- **Texture limits**: WebGL imposes maximum texture dimensions (commonly 4096×4096 or 8192×8192). Do not render the entire document to a single off-screen texture.
- **Frame synchronization**: Use `requestAnimationFrame` for rendering. Do not block the main thread with synchronous layout in response to input events.

### Font loading

Font data must be loaded into WASM memory and registered with Skia's font manager. This is a significant startup cost.

- **Subset fonts** for initial load (only the glyphs needed for visible text).
- **Load fonts asynchronously** and trigger re-layout when a new font becomes available.
- **Cache font data** in IndexedDB or the browser cache to avoid re-downloading.

## Complexity targets

For a document of n bytes with L logical paragraphs and V visible lines:

| Operation                 | Target          | Notes                                    |
| ------------------------- | --------------- | ---------------------------------------- |
| Character insertion       | O(log n)        | Rope splice                              |
| Undo snapshot             | O(1)            | Structural sharing (Arc)                 |
| UTF-8 → UTF-16 offset     | O(log n)        | Tree traversal with summary accumulation |
| Line number → byte offset | O(log n)        | Tree traversal                           |
| Caret rect                | O(1) amortized  | Cached per edit; single-paragraph lookup |
| Selection rects (visible) | O(V)            | Only visible paragraphs                  |
| Full draw (no change)     | O(V)            | Paint cached paragraphs                  |
| Full draw (after edit)    | O(V + P)        | P = one paragraph rebuild                |
| Scroll (viewport shift)   | O(V + log L)    | Viewport lookup + paint new lines        |
| Window resize             | O(L) worst case | Re-layout all paragraphs (no reshape)    |

## Phased roadmap

### Phase 0: Eliminate quadratic paths

Remove all O(n × L) and O(n^2) patterns from the editing and rendering pipeline. This is a prerequisite for handling any non-trivial document.

- Cache line metrics and converted offsets per layout cycle.
- Build a line-start byte-offset index after each layout.
- Cache caret rect per frame.

### Phase 1: Per-paragraph layout

Split the monolithic single-`Paragraph` architecture into per-logical-paragraph layout units. Each paragraph owns its `Paragraph` object, cached and invalidated independently.

- Only the edited paragraph is rebuilt on a keystroke.
- Vertical positions of subsequent paragraphs are updated by offset (no re-layout).

### Phase 2: Viewport culling

Implement a viewport window that determines which paragraphs are visible. Only visible paragraphs are laid out and painted.

- Cumulative height index for O(log n) scroll-to-line mapping.
- Lazy layout: paragraphs outside the viewport are laid out on demand as they scroll into view.

### Phase 3: Rope buffer

Replace the flat `String` text buffer with a rope, storing per-node summaries (UTF-8 length, UTF-16 length, line count). This provides O(log n) for all offset conversions, O(log n) edits, and O(1) undo snapshots via structural sharing.

### Phase 4: WASM deployment optimization

Coarse-grained WASM API surface. Arena allocators for per-frame temporaries. Font subsetting and async loading. Object pools for `Paragraph` instances.

## References

### Architecture references

- xi-editor Rope Science series (incremental word wrapping, monoid summaries, line caching, minimal invalidation): https://xi-editor.io/docs/rope_science_00.html
- Zed's SumTree and GPU text rendering: https://zed.dev/blog
- VS Code's Piece Tree (text buffer evolution, line-break indexing, GC pressure): https://code.visualstudio.com/blogs/2018/03/23/text-buffer-reimplementation

### Skia / CanvasKit

- Skia Paragraph module: https://skia.org/docs/modules/skparagraph/
- CanvasKit (Skia in WASM): https://skia.org/docs/user/modules/canvaskit/
- Flutter rendering pipeline (Skia Paragraph integration): https://docs.flutter.dev/perf/rendering-performance

### Text data structures

- Raph Levien, "Rope Science" (monoid homomorphisms, difficulty analysis, incremental wrapping): https://xi-editor.io/docs/rope_science_00.html
- Martin Kleppmann, "Peritext" (rich text CRDT with style ranges): https://www.inkandswitch.com/peritext/

### Internal references

- Text Editing Manifesto: `docs/wg/feat-text-editing/index.md`
- Attributed Text Data Model: `docs/wg/feat-text-editing/attributed-text.md`
- Paragraph Feature Roadmap: `docs/wg/feat-paragraph/index.md`
