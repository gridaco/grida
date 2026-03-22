---
title: "Chromium Paint Recording System"
format: md
---

# Chromium Paint Recording System

How Chromium records, stores, and replays paint operations. The recording
system is the bridge between Blink's rendering output and the compositor's
tile rasterization. It is the Chromium equivalent of Skia's `SkPicture`,
with additional metadata for invalidation, spatial indexing, and analysis.

For how recordings are consumed during rasterization see
[tiling-and-rasterization.md](./tiling-and-rasterization.md). For the
overall pipeline see
[compositor-architecture.md](./compositor-architecture.md).

---

## Architecture Overview

```
Blink paint
  -> DisplayItemList (mutable, records PaintOps)
  -> Finalize() (builds R-tree, frees temp data)
  -> RecordingSource (holds DisplayItemList, computes invalidation)
  -> RasterSource (immutable snapshot, thread-safe)
  -> Worker threads: PlaybackToCanvas() -> tile GPU textures
```

The key design principle: **record commands, not pixels.** Content is
stored as a compact command stream that can be replayed into any tile at
any scale. This enables efficient invalidation (only affected tiles
re-rasterize), resolution independence, and memory sharing across threads.

---

## PaintOp — The Unit of Recording

All paint operations derive from `PaintOp`, a 1-byte-typed base class
with no vtable.

### Type Enum (33 op types)

| Op Type                   | Category     | Purpose                                        |
| ------------------------- | ------------ | ---------------------------------------------- |
| `kSave`                   | State        | Save canvas state                              |
| `kRestore`                | State        | Restore canvas state                           |
| `kSaveLayer`              | State        | Save layer (with PaintFlags)                   |
| `kSaveLayerAlpha`         | State        | Save layer with alpha                          |
| `kSaveLayerFilters`       | State        | Save layer with filters                        |
| `kConcat`                 | Transform    | Concatenate 4x4 matrix                         |
| `kScale`                  | Transform    | Scale canvas                                   |
| `kRotate`                 | Transform    | Rotate canvas                                  |
| `kTranslate`              | Transform    | Translate canvas                                |
| `kSetMatrix`              | Transform    | Set absolute matrix                             |
| `kClipRect`               | Clip         | Clip by rect                                   |
| `kClipRRect`              | Clip         | Clip by rounded rect                           |
| `kClipPath`               | Clip         | Clip by path                                   |
| `kDrawRect`               | Draw         | Draw rectangle                                 |
| `kDrawIRect`              | Draw         | Draw integer rectangle                         |
| `kDrawRRect`              | Draw         | Draw rounded rectangle                         |
| `kDrawDRRect`             | Draw         | Draw double-rounded-rect                       |
| `kDrawOval`               | Draw         | Draw oval                                      |
| `kDrawArc`                | Draw         | Draw arc (with PaintFlags)                     |
| `kDrawArcLite`            | Draw         | Draw arc (lite flags)                          |
| `kDrawLine`               | Draw         | Draw line (with PaintFlags)                    |
| `kDrawLineLite`           | Draw         | Draw line (lite flags)                         |
| `kDrawPath`               | Draw         | Draw path                                      |
| `kDrawImage`              | Draw         | Draw image at position                         |
| `kDrawImageRect`          | Draw         | Draw image stretched into rect                 |
| `kDrawTextBlob`           | Draw         | Draw text blob                                 |
| `kDrawSlug`               | Draw         | Draw GPU-serialized text (Slug)                |
| `kDrawVertices`           | Draw         | Draw vertex mesh                               |
| `kDrawRecord`             | Draw         | Replay a nested PaintRecord                    |
| `kDrawScrollingContents`  | Draw         | Draw non-composited scrolling contents         |
| `kDrawSkottie`            | Draw         | Draw Lottie/Skottie animation                  |
| `kDrawColor`              | Draw         | Fill with color + blend mode                   |
| `kAnnotate`               | Metadata     | Annotation (URL links)                         |
| `kCustomData`             | Metadata     | User-defined placeholder                       |
| `kSetNodeId`              | Metadata     | Associate ops with a DOM node (for hit testing)|
| `kNoop`                   | Control      | No operation                                   |

### Dispatch Without Vtable

The `type` field is a single `uint8_t`. Op size is looked up from a static
array (`g_type_to_aligned_size[type]`) rather than being stored per-op.
Rasterization dispatch uses function pointers indexed by type, not virtual
method calls. This eliminates vtable overhead and enables flat buffer
storage.

### PaintOpWithFlags

Ops that carry paint parameters (color, stroke, shader, etc.) inherit from
`PaintOpWithFlags`, which adds a `PaintFlags` field. The `PaintFlags` is
Chromium's wrapper around `SkPaint` with additional serialization support.

### ThreadsafePath

Paths used in paint ops are wrapped in `ThreadsafePath`, which
pre-computes the bounds cache and generation ID during construction. This
ensures thread-safe access during multi-threaded rasterization without
locks.

Source: `cc/paint/paint_op.h` (lines 85-325)

---

## PaintOpBuffer — The Flat Byte Buffer

`PaintOpBuffer` is the memory backing for paint ops. It is a reimplementation
of Skia's `SkLiteDL`.

### Memory Layout

Ops are stored sequentially in a flat `char[]` buffer, aligned to 8 bytes:

```
data_: [Op1 | padding | Op2 | padding | Op3 | ...]
       ^                ^                ^
       offset 0         offset N         offset M
```

| Field                | Type                        | Purpose                              |
| -------------------- | --------------------------- | ------------------------------------ |
| `data_`              | `unique_ptr<char, AlignedFreeDeleter>` | Raw byte buffer             |
| `used_`              | `size_t`                    | Bytes occupied by ops                |
| `reserved_`          | `size_t`                    | Total allocated bytes                |
| `op_count_`          | `size_t`                    | Number of top-level ops              |
| `subrecord_bytes_used_` | `size_t`                 | Bytes from nested records            |
| `subrecord_op_count_` | `size_t`                   | Op count from nested records         |

Initial buffer size: 4096 bytes. Alignment: 8 bytes.

### Allocation

`push<T>(args...)` uses placement new into the buffer:

1. Compute aligned size: `AlignUp(sizeof(T), 8)`
2. If `used_ + size > reserved_`: reallocate (slow path)
3. Otherwise: bump `used_`, increment `op_count_` (fast path)
4. Placement-new the op at `data_ + used_`
5. `AnalyzeAddedOp()` updates aggregate metadata

### Aggregate Metadata

As ops are added, the buffer tracks:

- `has_draw_ops_` — whether any draw ops exist
- `has_draw_text_ops_` — whether text drawing is present
- `has_save_layer_ops_` — whether save layer ops exist
- `has_save_layer_alpha_ops_` — whether save layer alpha ops exist
- `has_discardable_images_` — whether discardable images are referenced
- `has_non_aa_paint_` — whether any non-anti-aliased paint exists
- `num_slow_paths_up_to_min_for_MSAA_` — slow path count (for MSAA
  decision)

### Immutability

`PaintOpBuffer` extends `SkRefCnt`. The buffer is mutable only when
`unique()` returns true (exactly one reference). Once shared via
`PaintRecord`, it becomes effectively immutable. This is enforced by
`is_mutable()` checks in all mutation methods.

Source: `cc/paint/paint_op_buffer.h` (lines 111-403)

---

## DisplayItemList — Recording + Spatial Index

`DisplayItemList` wraps a `PaintOpBuffer` and adds spatial indexing via
an R-tree. It is ref-counted and thread-safe.

### Recording Protocol

```
list->StartPaint();
list->push<DrawRectOp>(rect, flags);
list->push<DrawTextBlobOp>(blob, x, y, flags);
list->EndPaintOfUnpaired(visual_rect);
```

Each `push<T>()` records the op's byte offset. `EndPaintOfUnpaired()`
associates those ops with a visual rect (bounding box for the painted
content in layer space).

Paired operations (save/restore blocks) use
`EndPaintOfPairedBegin()`/`EndPaintOfPairedEnd()`, which propagate the
visual rect from the begin item to all items within the block.

### Finalize

`Finalize()` builds the R-tree from the visual rects and byte offsets,
then frees the temporary recording vectors:

1. Build R-tree: `rtree_.Build(visual_rects_, offsets_)`
2. Clear and shrink: `visual_rects_`, `offsets_`, `paired_begin_stack_`
3. Shrink the paint op buffer

After finalization, the list is read-only. The R-tree is the sole
mechanism for spatial queries.

### R-tree

Chromium's R-tree implementation uses STR (sort-tile-recursive) bulk
loading. Key properties:

| Property       | Value                        |
| -------------- | ---------------------------- |
| Min children   | 6                            |
| Max children   | 11                           |
| Node storage   | Flat `std::vector<Node<T>>`  |
| Payload        | `size_t` (byte offsets)      |
| Bounding boxes | `gfx::Rect` (visual rects)  |

All nodes are stored in a flat vector (no per-node heap allocation). The
fixed-size child arrays (max 11) enable cache-friendly traversal.

### Rasterization with Spatial Culling

```cpp
void DisplayItemList::Raster(SkCanvas* canvas, ...) {
    std::vector<size_t> offsets = OffsetsOfOpsToRaster(canvas);
    paint_op_buffer_.Playback(canvas, params, true, &offsets);
}

std::vector<size_t> OffsetsOfOpsToRaster(SkCanvas* canvas) {
    gfx::Rect clip_bounds = GetCanvasClipBounds(canvas);
    rtree_.Search(clip_bounds, &offsets);
    return offsets;
}
```

The R-tree is queried with the canvas clip bounds (the tile rect) to find
only the ops that intersect the tile. The `OffsetIterator` then jumps
directly to those byte offsets in the buffer, skipping ops that are
outside the tile entirely. This is what makes tiling efficient — each tile
only replays the subset of ops that affect it.

### Pre-allocation

The constructor pre-allocates recording vectors:

```
visual_rects_.reserve(1024)
offsets_.reserve(1024)
paired_begin_stack_.reserve(32)
```

Source: `cc/paint/display_item_list.h` (lines 36-283),
`cc/paint/display_item_list.cc` (lines 76-223),
`cc/base/rtree.h`

---

## PaintRecord — Immutable Recording Handle

`PaintRecord` is a thin wrapper holding an `sk_sp<PaintOpBuffer>`. Copying
shares the underlying buffer (cheap ref-count increment). The buffer
becomes immutable once wrapped.

```
PaintRecord:
  buffer_: sk_sp<PaintOpBuffer>  // shared, never null
```

This is analogous to Skia's `SkPicture` — a lightweight, shareable,
immutable recording.

Source: `cc/paint/paint_record.h` (lines 19-105)

---

## RecordingSource — Mutable Layer Recording

`RecordingSource` holds the current `DisplayItemList` for a layer and
manages invalidation.

### Update Flow

1. `ContentLayerClient::PaintContentsToDisplayList()` returns a finalized
   `DisplayItemList`
2. `RecordingSource::Update()` stores the list, computes invalidation
3. Solid color analysis: if the display list has `<= 10` ops and resolves
   to a solid color, the layer is marked `is_solid_color_`
4. Directly-composited image detection: identifies layers that are just
   a single image

### Invalidation

The `InvalidationRegion` accumulates `SetNeedsDisplayRect()` calls. Up
to 256 rects can be stored individually; beyond that, they collapse to a
single bounding box (lossy, but never under-invalidates). On `Update()`,
the invalidation is drained and passed to the pending tree.

### Solid Color Optimization

```
kMaxOpsToAnalyzeForLayer = 10
```

If the entire layer's display list has 10 or fewer ops and resolves to a
single color, the layer is marked solid. No tiles need to be rasterized —
the layer is drawn as a `SolidColorDrawQuad`.

Source: `cc/layers/recording_source.h`, `cc/layers/recording_source.cc`

---

## RasterSource — Immutable Snapshot

`RasterSource` is the thread-safe, immutable snapshot of a
`RecordingSource`. Created on the main thread, consumed on worker threads
for rasterization. All fields are `const`.

### PlaybackToCanvas — The Tile Rasterization Entry Point

For each tile:

1. Translate canvas so tile's top-left is at origin
2. Clip to the tile bounds (intersection of tile rect and playback rect)
3. Apply raster-to-recording transform (scale + translation)
4. Clear the tile (opaque layers clear edges for anti-aliasing; transparent
   layers clear entirely)
5. Call `DisplayItemList::Raster()` — R-tree query + selective replay

Partial raster: when only a sub-region of a tile changed, only the
invalidated rect is re-rasterized. The old GPU resource is reused.

Source: `cc/raster/raster_source.h` (lines 40-190),
`cc/raster/raster_source.cc` (lines 27-136)

---

## Playback Optimization: Folding Iterator

The `PlaybackFoldingIterator` optimizes common patterns:

- `SaveLayerAlpha(alpha)` + `DrawColor(color)` + `Restore()` is folded
  into a single `DrawColor(color * alpha)`

This eliminates unnecessary save/restore overhead for simple opacity
applications.

Source: `cc/paint/paint_op_buffer_iterator.h` (lines 213-249)

---

## Key Constants

| Constant                    | Value | Purpose                                  |
| --------------------------- | ----- | ---------------------------------------- |
| `kPaintOpAlign`             | 8     | Op alignment in bytes                    |
| `kInitialBufferSize`        | 4096  | Initial PaintOpBuffer allocation         |
| `kMaxOpsToAnalyzeForLayer`  | 10    | Solid color analysis op limit (per layer)|
| `kMaxOpsToAnalyze`          | 5     | Solid color analysis op limit (per tile) |
| R-tree min children         | 6     | Minimum branching factor                 |
| R-tree max children         | 11    | Maximum branching factor                 |
| Recording vector reserve    | 1024  | Pre-allocated visual_rects/offsets       |
| Paired stack reserve        | 32    | Pre-allocated save/restore nesting       |

---

## Source Files Referenced

- `cc/paint/paint_op.h`
- `cc/paint/paint_op_buffer.h`
- `cc/paint/paint_op_buffer_iterator.h`
- `cc/paint/paint_record.h`
- `cc/paint/display_item_list.h`
- `cc/paint/display_item_list.cc`
- `cc/base/rtree.h`
- `cc/layers/recording_source.h`
- `cc/layers/recording_source.cc`
- `cc/raster/raster_source.h`
- `cc/raster/raster_source.cc`
