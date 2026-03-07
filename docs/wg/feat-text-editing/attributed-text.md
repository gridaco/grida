---
id: attributed-text
title: "Attributed Text: Data Model Specification"
---

## Motivation

The text editing manifesto (`feat-text-editing/index.md`) established geometry queries, cursor semantics, and interaction contracts for a **plain text** editor. That editor operates on a single `String` with uniform styling. Real design tools require **mixed-style text**: a single text block where different character ranges carry different font families, weights, sizes, colors, decorations, and OpenType features.

This document specifies the **in-memory data model** for attributed text. It is the bridge between the plain-text editing engine and the styled paragraph layout engine. The model must be:

- **Editing-friendly**: insert, delete, split, merge operations must be O(n) in runs affected, not O(n) in characters.
- **Layout-friendly**: trivially convertible to a sequence of styled text pushes for Skia `ParagraphBuilder` (or equivalent).
- **Serialization-friendly**: representable in FlatBuffers without loss, with a natural binary layout.
- **Compact**: no per-character storage; style data is shared across runs via identity or structural equality.

## Scope

This model is designed to serve two deployment targets from a single Rust implementation:

1. **Native desktop editor** — compiled natively, rendering via Skia (OpenGL/Vulkan). Full text editing with system IME integration.
2. **WASM-web rendered editor** — compiled to WebAssembly, rendering via Skia-in-WASM (CanvasKit). Used as the text editing backend for the browser-based design tool, similar to how Figma renders text into a WebGL canvas rather than using DOM contenteditable.

In both cases, the model covers a **single text node** (single paragraph block). The host application (native window / browser JS) is responsible for creating, positioning, and managing text nodes within the document.

### WASM/JS boundary

When compiled to WASM, the attributed text model crosses the host boundary via:

- **Serialization**: JSON (for development/debugging) or FlatBuffers (for production). The JS host sends editing commands and style mutations; the WASM module returns the updated model.
- **Font registration**: The JS host fetches font data (ArrayBuffer) and passes it to the WASM module's font manager. Font resolution happens entirely inside WASM.
- **Rendering**: The WASM module builds a Skia `Paragraph` from the run list, renders to a Skia surface backed by a WebGL canvas, and paints caret/selection overlays. The JS host handles DOM events (keyboard, mouse, IME) and translates them to editing commands.

This architecture means the model must be efficiently serializable, but does not need to be directly manipulable from JS. All mutations go through the engine API.

## Non-goals

- **Block-level structure** (headings, lists, tables). This model covers a single text node. Document-level structure is a higher layer. (Figma's `TextLineData.lineType` with `ORDERED_LIST`/`BLOCKQUOTE`/`HEADER` is acknowledged but out of scope for the initial model.)
- **Embedded objects** (images, inline widgets). The scope is text-only attributed strings.
- **Collaborative editing protocols** (OT/CRDT). Can be layered on top; the model must not prevent it.
- **Undo/redo internals**. The history system operates on snapshots; attributed text is a richer snapshot.

## Terminology

| Term                | Definition                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **attributed text** | A string paired with an ordered sequence of style runs that fully cover the string. Analogous to `NSAttributedString` (Cocoa) or `SpannableString` (Android).   |
| **run**             | A maximal contiguous byte range `[start, end)` over which every style attribute is identical. Runs partition the string with no gaps and no overlaps.           |
| **span**            | An attribute applied over an arbitrary `[start, end)` range. Spans may overlap. Spans are the _authoring_ primitive; runs are the _resolved_ primitive.         |
| **style set**       | The complete collection of text-level attributes at a given position. Two positions with the same style set belong to the same run.                             |
| **paragraph style** | Attributes that apply uniformly to the entire text block (alignment, direction, indentation). These are _not_ per-run.                                          |
| **caret style**     | The style that will be applied to the next character typed at the current cursor position. Determined by the upstream run, overridable by explicit user action. |

## Prior art and comparative analysis

Before presenting the design, we document the four major attributed text architectures in the industry. Each represents a fundamentally different trade-off surface. Understanding them is essential for making an informed choice.

### A1: Apple `NSAttributedString` / `CFAttributedString` — Run-based (RLE)

Apple's model stores a flat `CFString` paired with a **run-length encoded array of attribute dictionaries**. Each run is `(length, NSDictionary*)`. Runs are non-overlapping, contiguous, and cover the entire string. Adjacent runs with identical dictionaries are coalesced.

Key properties:

- **No inheritance**. Each run stores a complete attribute dictionary. There is no parent/child or cascading relationship.
- **Paragraph semantics by convention**: `NSParagraphStyle` on the first character of a paragraph determines alignment, indentation, etc. for the whole paragraph. This is enforced by the "attribute fixing" post-edit normalization pass in `NSTextStorage`.
- **O(log n) lookup** via binary search over run boundaries.
- **Editing**: insert inherits from the adjacent character. Delete removes/shortens runs and coalesces. Set-attributes splits at boundaries.
- **Trade-off**: Efficient for text with few style changes. No tree to maintain. But no inheritance or cascading, and run splits create complex merge conflicts in collaborative editing.

### A2: Android `SpannableStringBuilder` — Span-based (interval set)

Android stores spans as independent `(start, end, flags, object)` tuples over a gap buffer. Spans **can overlap freely**. Each span object represents one formatting attribute (bold, color, size, etc.).

Key properties:

- **Span flags** (`SPAN_INCLUSIVE_EXCLUSIVE`, `SPAN_EXCLUSIVE_INCLUSIVE`, etc.) control whether insertions at a span boundary extend the span or not. This is the only system that gives programmatic control over this behavior.
- **No automatic coalescing**. Orphaned/empty spans can accumulate.
- **O(n) query** to find all spans at a given position (linear scan), though newer implementations use interval trees.
- **Trade-off**: Maximum flexibility (overlapping spans, per-span insertion policy). But worst query performance, most complex state management, and poor collaborative editing compatibility.

### A3: Flutter `TextSpan` — Tree-based (immutable)

Flutter uses a recursive tree of `TextSpan` nodes. Each node can have `text`, `style`, and `children`. The tree is **immutable** — any edit requires rebuilding.

Key properties:

- **Tree-based inheritance**: `pushStyle` merges child style with parent's resolved style. Only non-null fields override. This gives CSS-like cascading.
- **Flattens to runs for layout**: `TextSpan.build(ParagraphBuilder)` performs DFS, calling `pushStyle/addText/pop` — producing the exact run-based representation that Skia consumes.
- **Not designed for editing**: editable text uses a separate `TextEditingValue` (plain text + selection). The styled tree is rebuilt each frame.
- **Trade-off**: Most ergonomic API for developers. Natural inheritance. But terrible for in-place editing — entire tree rebuild per mutation.

### A4: Figma `TextData` (kiwi schema) — Per-character ID array + override table

Figma's model is unique. It uses three layers:

```text
TextData {
    characters: string                    // flat plain text
    characterStyleIDs: uint[]             // per-character style ID
    styleOverrideTable: NodeChange[]      // sparse override table
    lines: TextLineData[]                 // per-line metadata
    ...
}
```

**Layer 1 — Base style**: The `NodeChange` message (Figma's universal node object) carries the base text style (`fontSize`, `fontName`, `textCase`, `textDecoration`, `lineHeight`, `letterSpacing`, etc.). This is "style ID 0."

**Layer 2 — Per-character ID array**: `characterStyleIDs[i]` gives the override ID for character `i`. A value of `0` means "use base style." The array can be shorter than the character count — trailing characters beyond the array length implicitly use the base style (trailing zeros are omitted as a wire-format optimization).

**Layer 3 — Override table**: `styleOverrideTable[id]` maps each non-zero style ID to a `NodeChange` — a sparse diff. Only the fields that differ from the base style are set. Unset fields inherit from base.

Additionally, Figma cleanly separates **authoring data** (`TextData`: characters, style IDs, override table, line metadata) from **layout cache** (`DerivedTextData`: glyphs, baselines, decorations, layout size). Only authoring data flows through the multiplayer sync layer; derived data is recomputed locally.

Figma also stores per-line metadata via `TextLineData`:

```text
TextLineData {
    lineType: LineType          // PLAIN | ORDERED_LIST | UNORDERED_LIST | BLOCKQUOTE | HEADER
    styleId: int
    indentationLevel: int
    sourceDirectionality: SourceDirectionality   // AUTO | LTR | RTL
    directionality: Directionality               // LTR | RTL (resolved)
    directionalityIntent: DirectionalityIntent   // IMPLICIT | EXPLICIT
    ...
}
```

Key properties:

- **O(1) style lookup** per character (direct array index + table lookup).
- **Excellent CRDT/multiplayer compatibility**: per-character ID arrays splice trivially; the immutable override table avoids run-boundary merge conflicts entirely.
- **Memory overhead**: one `uint` per character even for uniformly-styled text (mitigated by trailing-zero truncation).
- **Two-level inheritance only**: base style + one override layer. No deep cascade.
- **Trade-off**: The per-character array is the cleanest model for real-time collaboration, at the cost of memory for uniformly-styled text. The reuse of `NodeChange` as a sparse diff eliminates a separate "text style override" type.

### Comparative matrix

| Dimension            | Apple (runs)               | Android (spans)                   | Flutter (tree)         | Figma (per-char IDs)       |
| -------------------- | -------------------------- | --------------------------------- | ---------------------- | -------------------------- |
| **Topology**         | Flat run array             | Flat interval set                 | Immutable tree         | Flat char array + table    |
| **Overlap**          | No                         | Yes                               | No (hierarchy)         | No                         |
| **Style lookup**     | O(log k)                   | O(n) or O(log n + k)              | O(depth)               | O(1)                       |
| **Insert**           | Inherits from adjacent     | Controlled by flags               | Rebuild tree           | Inherits base (ID 0)       |
| **Coalescing**       | Automatic                  | None                              | N/A                    | N/A (no runs)              |
| **Inheritance**      | None                       | None (last span wins)             | Tree merge             | Two-level: base + override |
| **Multiplayer**      | Poor (run splits conflict) | Poor (index adjustment conflicts) | Poor (tree diff)       | Excellent                  |
| **Memory (uniform)** | 1 run                      | 0 spans                           | 1 node                 | n integers                 |
| **Layout mapping**   | Direct (run = push+text)   | Resolve then push                 | DFS produces push+text | Resolve per-char then RLE  |

### Why we choose run-based

For a design tool that is **not** building real-time multiplayer as a first-class constraint (CRDT/OT is explicitly a non-goal per the manifesto), the run-based model provides the best balance:

1. **Direct layout mapping**: each run is one `pushStyle + addText` call. No resolution step, no tree flattening, no per-character table lookup. This matches exactly what Skia `ParagraphBuilder` consumes.

2. **Minimal memory**: typical design text has 1-10 style changes. Run count is proportional to style transitions, not character count. A 1000-character paragraph with 3 style changes costs 3 runs (~384 bytes), not 1000 integers (~4000 bytes).

3. **Automatic normalization**: the coalescing invariant means the model is always in canonical form. No garbage spans, no redundant entries, no denormalized state.

4. **Editing simplicity**: the operations (split, shift, coalesce) are well-understood, debuggable, and fully covered by invariant assertions.

5. **Alignment with NSAttributedString**: the most battle-tested attributed text model in the industry. Apple's design has been stable for 25+ years.

The run-based model can later support a collaborative layer by converting to/from a per-character ID representation at the sync boundary, similar to how the existing editor converts between UTF-8 offsets (internal) and UTF-16 offsets (Skia interop). The run representation is the canonical in-memory form; the per-character form is a serialization/sync format.

## Design decisions

### D1: Run-based, not span-based, not per-character

We store **resolved runs**, not overlapping spans and not per-character IDs.

See the comparative analysis above for the full rationale. The key insight is that runs are the **output format** that every layout engine consumes. Choosing runs as the storage format eliminates all resolution/flattening steps.

**Trade-off**: Runs cannot natively represent "bold from 0..10, italic from 5..15" as two independent layers. Instead, the system produces three runs: `[0,5) bold`, `[5,10) bold+italic`, `[10,15) italic`. This is the correct resolved form and is exactly what every layout engine requires.

### D2: Runs reference the text buffer, they do not own substrings

Each run stores `(start: u32, end: u32)` as UTF-8 byte offsets into a shared backing string. Runs never duplicate text data.

Using `u32` (not `usize`) for offsets is deliberate:

- 4 GiB of text per node is far beyond any realistic design tool text block.
- `u32` halves offset storage cost on 64-bit platforms.
- `u32` matches FlatBuffers' natural integer width and Skia's internal `int32_t` text indices.

### D3: Style identity via structural equality, not interning

Two runs with identical attribute values are **mergeable**. After any edit, adjacent runs with equal style sets are coalesced. This maintains the invariant that runs are **maximal** (no two adjacent runs have the same style).

Style sets are compared field-by-field. No interning, no pointer identity, no style IDs at the data model level. The cost of field-by-field comparison is bounded by the fixed number of attributes (~20 fields) and is negligible compared to layout.

Figma's approach (style ID table) is an interning strategy optimized for their multiplayer use case. We deliberately avoid this because:

- It adds an indirection layer (ID -> style) that complicates every query.
- It requires a separate "override resolution" step before layout.
- The benefit (deduplication) only matters with per-character storage, which we don't use.

> **Note on future optimization**: If profiling shows that style comparison is hot, an interning layer (`Arc<TextStyle>` or `StyleId -> TextStyle` table) can be added on top without changing the data contract.

### D4: Paragraph-level vs. run-level attribute partition

Attributes are partitioned into two tiers:

- **Paragraph-level**: `text_align`, `text_align_vertical`, `max_lines`, `ellipsis`, `text_indent`, `paragraph_direction`. These apply uniformly. Storing them per-run would be wasteful and semantically wrong (what does it mean for characters 5..10 to have `text_align: center` but 10..15 to have `text_align: left`?).

- **Run-level**: everything else (font family, size, weight, width, italic, kerning, optical sizing, OpenType features, variable font axes, letter spacing, word spacing, line height, text decoration, text transform, text color/fill). These can vary per character range.

This mirrors Apple's `NSParagraphStyle` (paragraph-level) vs. other `NSAttributedString` attributes (run-level), and Figma's `textAlignHorizontal`/`textAlignVertical` (node-level) vs. `fontSize`/`fontName`/etc. (per-character overridable).

### D5: Default style and two-level inheritance

Every attributed text has a **default style set** (the "base" style), following Figma's two-level pattern:

- **Base style** (always present) — the default for all characters.
- **Run override** (per run) — only runs that differ from the base carry their own style.

In the **in-memory** model, runs store fully resolved style sets (no inheritance chain to walk at query time). Resolution is eager, not lazy.

In the **serialization** model (FlatBuffers), runs can use delta encoding: optional fields that, when absent, inherit from the base style. The codec handles resolution at the boundary.

This is equivalent to Figma's `styleOverrideTable` pattern, but with runs instead of per-character IDs. It gives:

- **Compact serialization**: most text blocks have 1-3 distinct styles.
- **O(1) query**: no inheritance chain to walk.
- **Simple editing**: "reset to default" = remove the run's override; coalesce will merge it with adjacent default runs.

### D6: Caret style semantics

When the cursor sits at a run boundary, the question "what style should the next typed character have?" is ambiguous. This is a problem that every system solves differently:

- **Apple**: inherits from the character _before_ the cursor (upstream).
- **Android**: controlled by span flags (`INCLUSIVE`/`EXCLUSIVE`).
- **Figma**: defaults to base style (ID 0).
- **Design tools** (Sketch, Figma UI, Adobe): generally continue the upstream style.

We adopt the **upstream rule**: caret style = style of the run that _ends_ at the cursor position, unless the cursor is at position 0 (use the first run's style).

The caret style can be **overridden** by explicit user action (e.g., clicking "Bold" with no selection). This override is transient editor state, not part of `AttributedText`. It is cleared on cursor movement.

## Data model

### The core structure

```text
AttributedText = (text, default_style, paragraph_style, runs)
```

Where:

- `text: String` — the backing UTF-8 string, newlines normalized to `\n`
- `default_style: TextStyle` — the base style for the paragraph
- `paragraph_style: ParagraphStyle` — paragraph-level attributes
- `runs: Vec<StyledRun>` — ordered, non-overlapping, gap-free, maximal

### StyledRun

```rust
struct StyledRun {
    /// Start byte offset (UTF-8, inclusive). Must be on a char boundary.
    start: u32,
    /// End byte offset (UTF-8, exclusive). Must be on a char boundary.
    end: u32,
    /// The resolved style for this run.
    style: TextStyle,
}
```

**Invariants** (must hold at all times):

Let `n = text.len() as u32` and `k = runs.len()`.

1. **Non-empty run list**: `k >= 1`.
2. **Coverage**: `runs[0].start == 0` and `runs[k-1].end == n`.
3. **Contiguity**: for all `0 <= i < k-1`: `runs[i].end == runs[i+1].start`.
4. **Non-degenerate runs**: for all `0 <= i < k`: `runs[i].start < runs[i].end`. Exception: when `n == 0`, exactly one degenerate run `{start: 0, end: 0}` is permitted (the caret style run).
5. **Maximality**: for all `0 <= i < k-1`: `runs[i].style != runs[i+1].style`.
6. **Boundary alignment**: for all `0 <= i < k`: `runs[i].start` and `runs[i].end` are valid UTF-8 char boundaries in `text`.
7. **Monotonicity** (implied by 3 + 4): `runs[i].start < runs[i+1].start`.

Every public mutation must uphold all seven invariants. Implementations should assert them after every edit in debug builds.

### TextStyle (run-level attributes)

```rust
struct TextStyle {
    // --- Font identification ---
    font_family: String,                        // Primary family name
    font_size: f32,                             // In layout-local points. Default: 14.0
    font_weight: u32,                           // 1..1000, CSS-compatible. Default: 400
    font_width: f32,                            // CSS font-stretch %. Default: 100.0
    font_style_italic: bool,                    // Default: false
    font_kerning: bool,                         // OpenType 'kern'. Default: true
    font_optical_sizing: FontOpticalSizing,     // Default: Auto

    // --- OpenType extensions ---
    font_features: Vec<FontFeature>,            // e.g. [("liga", true), ("ss01", true)]
    font_variations: Vec<FontVariation>,        // e.g. [("wght", 700.0), ("wdth", 75.0)]

    // --- Spacing ---
    letter_spacing: TextDimension,              // Default: Normal
    word_spacing: TextDimension,                // Default: Normal
    line_height: TextDimension,                 // Default: Normal (see note below)

    // --- Decoration ---
    text_decoration_line: TextDecorationLine,   // Default: None
    text_decoration_style: TextDecorationStyle, // Default: Solid
    text_decoration_color: Option<RGBA>,         // None = inherit from fill
    text_decoration_skip_ink: bool,             // Default: true
    text_decoration_thickness: f32,             // Default: 1.0 (percentage)

    // --- Transform ---
    text_transform: TextTransform,              // Default: None

    // --- Fill (text color) ---
    fill: TextFill,                             // Default: solid black

    // --- Link ---
    hyperlink: Option<Hyperlink>,               // Default: None
}
```

Where `Hyperlink` is:

```rust
struct Hyperlink {
    url: String,
    open_in_new_tab: bool,
}
```

**Note on `line_height`**: `line_height` is classified as run-level because both Figma and CSS allow it to vary per character range. When all runs share the same `line_height`, the layout engine should use a paragraph-level strut for consistent behavior. When runs differ, per-run heights apply, and the tallest run on each visual line determines that line's height.

**Note on variable fonts**: `font_weight`, `font_width`, and `font_optical_sizing` are high-level semantic attributes. When the underlying typeface is a variable font, the layout engine maps these to the corresponding variation axes (`wght`, `wdth`, `opsz`). User-specified `font_variations` are applied first; the semantic attributes override matching axes. This two-level approach matches CSS (high-level properties win over `font-variation-settings`).

This field set is aligned with Figma's per-character overridable properties (`fontSize`, `fontName`, `textCase`, `textDecoration`, `lineHeight`, `letterSpacing`, `fontVariations`, `toggledOnOTFeatures`, `toggledOffOTFeatures`, `hyperlink`, `textDecorationFillPaints`, `textDecorationSkipInk`, `textDecorationThickness`, `textDecorationStyle`) and with the Grida FlatBuffers `TextStyleRec`, extended with `fill` for per-run text color.

### TextFill

```rust
enum TextFill {
    /// Solid color fill.
    Solid(RGBA),
    // Future: Gradient, Pattern (matches Figma's Paint[] on text overrides)
}
```

### ParagraphStyle

```rust
struct ParagraphStyle {
    text_align: TextAlign,                  // Default: Left
    text_align_vertical: TextAlignVertical, // Default: Top
    paragraph_direction: ParagraphDirection, // Default: Ltr
    max_lines: Option<u32>,                 // None = unlimited
    ellipsis: Option<String>,               // None = no truncation indicator
    text_indent: f32,                       // Default: 0.0
    paragraph_spacing: f32,                 // Default: 0.0 (extra space after \n)
}
```

These properties are paragraph-level in all studied systems:

- Apple: `NSParagraphStyle` on first character of paragraph
- Figma: `textAlignHorizontal`, `textAlignVertical`, `maxLines`, `textTruncation`, `paragraphSpacing` on `NodeChange` (node-level, not per-character)
- Skia: `ParagraphStyle` passed to `ParagraphBuilder::new` (not per-run)

> **Note**: `TextAutoResize` (NONE / HEIGHT / WIDTH_AND_HEIGHT) is intentionally excluded. It controls how the text **node's bounding box** responds to content — a node-level layout concern, not a text content property. It belongs on the node record (`TextSpanNodeRec`) alongside `width`, `height`, and `transform`, not inside `AttributedText`.

### Complete model

```rust
struct AttributedText {
    text: String,
    default_style: TextStyle,
    paragraph_style: ParagraphStyle,
    runs: Vec<StyledRun>,
}
```

### Empty text invariant

When `text.is_empty()`:

- `runs` contains exactly one run: `StyledRun { start: 0, end: 0, style: <caret_style> }`.
- This degenerate run preserves the typing style. It is the only case where `start == end` is valid.
- On first character insertion, this run's `end` advances to the inserted text's length.

This mirrors how Figma handles empty text nodes: the base style on the `NodeChange` persists even when `characters` is empty, preserving the font/size/color the user last selected.

## Offset model

All offsets in this model are **UTF-8 byte offsets**, consistent with Rust's native string indexing and the editing engine's cursor model. Conversion to UTF-16 (for Skia interop) happens at the layout boundary.

The choice of `u32` (not `usize`) for run offsets is deliberate:

- 4 GiB of text per node is far beyond any realistic design tool text block.
- `u32` halves offset storage cost on 64-bit platforms.
- `u32` matches FlatBuffers' natural integer width.

Figma uses logical character indices (UTF-16 code unit indices) for its `characterStyleIDs` array. Our run offsets are byte offsets instead, avoiding the impedance mismatch that Figma's model creates with UTF-8 strings. The conversion cost is paid once at the layout boundary rather than on every query.

## Editing operations

### Insert text at cursor

Given insertion at byte offset `pos` with string `s` (length `n` bytes):

1. Determine the **effective style** for the insertion:
   - If a caret style override is active (set by the user toggling a style with no selection), use it.
   - Otherwise, use the style of the run containing `pos`. At a run boundary, this is the **downstream** run (the run starting at `pos`).
2. Find the run `r` containing `pos`.
3. Shift `end` of run `r` by `+n`.
4. Shift `start` and `end` of all subsequent runs by `+n`.
5. Update `text` by inserting `s` at `pos`.

No run splitting occurs. No merging is needed (inserted text has the same style as its context).

**Boundary semantics**: The data model provides two primitives with different boundary behavior:

- **`insert(pos, s)`** — extends the downstream run. Used for programmatic insertion, paste, and undo restore.
- **`insert_with_style(pos, s, style)`** — inserts with an explicit style, splitting/merging as needed. Used for interactive typing, where the editor resolves the effective style from the caret style or override.

The typical flow for typing at a bold→italic boundary is:

1. User sees caret style = bold (upstream, via `caret_style_at`).
2. User types a character.
3. The editor calls `insert_with_style(pos, ch, effective_caret_style)`.
4. The character is inserted with the bold style.

This separation keeps the data model free of UI state (no caret override stored in `AttributedText`), while giving the editor full control over boundary behavior.

**Complexity**: O(k) where k = number of runs after the insertion point.

### Delete range `[lo, hi)`

1. Find runs overlapping `[lo, hi)`.
2. For the first overlapping run: clamp its `end` to `lo` (if `start < lo`).
3. For the last overlapping run: clamp its `start` to `lo` (shift by `-(hi - lo)`), adjust `end`.
4. Remove all fully-covered runs between first and last.
5. Shift all subsequent runs by `-(hi - lo)`.
6. Update `text` by draining `[lo, hi)`.
7. Merge adjacent runs if they now have equal styles.

**Complexity**: O(k) where k = total runs.

### Apply style to range `[lo, hi)`

Given a style mutation `f: TextStyle -> TextStyle`:

1. **Split at boundaries**: if `lo` falls inside a run, split it into `[start, lo)` and `[lo, end)` with the same style. Same for `hi`.
2. **Apply**: for each run fully within `[lo, hi)`, apply `f` to its style.
3. **Merge**: coalesce adjacent runs with equal styles (at most 2 merge points: at `lo` and at `hi`).

**Complexity**: O(m + log k) where m = affected runs.

### Split at offset

```rust
split_at(runs, offset) -> ()
```

If `offset` falls exactly on a run boundary, no-op. Otherwise, find the run containing `offset` and replace it with two runs: `[start, offset)` and `[offset, end)`, both with the same style.

### Merge adjacent equal runs (coalesce)

```rust
coalesce(runs) -> ()
```

Linear scan: if `runs[i].style == runs[i+1].style`, merge into `[runs[i].start, runs[i+1].end)` and remove `runs[i+1]`. Called after any operation that might produce adjacent equal-style runs.

This is Apple's "automatic coalescing" behavior. Android's span model notably lacks this — spans accumulate without cleanup.

## Querying

### Style at offset

```rust
style_at(offset: u32) -> &TextStyle
```

Binary search on runs (O(log k)). For an offset exactly at a run boundary, returns the style of the run that **starts** at that offset (the "downstream" style).

**Exception**: when `offset == text.len()`, returns the style of the last run.

### Caret style at offset

```rust
caret_style_at(offset: u32) -> &TextStyle
```

At a run boundary, returns the **upstream** run's style (the run that ends at `offset`). At position 0, returns the first run's style. At end of text, returns the last run's style. Inside a run, returns that run's style.

### Runs in range

```rust
runs_in_range(lo: u32, hi: u32) -> &[StyledRun]
```

Binary search to find the first run overlapping `lo`, then linear scan to `hi`. Returns a slice (borrowing, not cloning).

### Iteration for layout

```rust
for run in attributed_text.runs() {
    builder.push_style(&run.style.to_skia_text_style());
    builder.add_text(&text[run.start as usize..run.end as usize]);
}
```

This is the exact sequence Skia `ParagraphBuilder` expects. No intermediate representation needed. This is also how Flutter's `TextSpan.build()` flattens its tree — but we start in the flat form, so no flattening is required.

## IME composition interaction

When the user enters an IME composition (e.g., CJK input, dead keys), the composition text is typically displayed as a "preedit" overlay before being committed. The interaction with style runs follows these rules:

1. **Preedit text inherits the caret style**. The composition range uses the same style that a normal character insertion would use — the effective caret style (upstream run, or explicit override).

2. **Composition is in-band**. Following the convention established in the text editing manifesto, composition text is part of `text` (not a separate overlay buffer). The composition range is tracked by the editor state, not by the attributed text model. Style runs treat preedit characters identically to committed characters.

3. **On commit**, the preedit text becomes permanent. No run adjustment is needed (the text was already inserted with the correct style).

4. **On cancel**, the preedit text is deleted via `delete()`. Runs adjust normally.

5. **Composition underline** is a rendering concern, not a run-level attribute. The host draws the composition underline based on the composition range, independent of `text_decoration_line`.

6. **Composition must not split grapheme clusters**. An IME commit may replace a composition range that spans multiple runs. The replacement uses `replace()`, which inherits the style at the start of the replaced range.

## FlatBuffers serialization

The model maps naturally to FlatBuffers:

```fbs
enum ParagraphDirection : ubyte {
    Ltr = 0,
    Rtl = 1,
    Auto = 2
}

table HyperlinkRec {
    url: string (id: 0);
    open_in_new_tab: bool = false (id: 1);
}

table AttributedTextRun {
    /// Byte offset (UTF-8) where this run starts.
    start: uint32 (id: 0);
    /// Byte offset (UTF-8) where this run ends (exclusive).
    end: uint32 (id: 1);
    /// Style for this run. If null, same as parent's default_style.
    style: TextStyleRec (id: 2);
}

table ParagraphStyleRec {
    text_align: TextAlign = Left (id: 0);
    text_align_vertical: TextAlignVertical = Top (id: 1);
    paragraph_direction: ParagraphDirection = Ltr (id: 2);
    max_lines: uint32 (id: 3);
    ellipsis: string (id: 4);
    text_indent: float = 0.0 (id: 5);
    paragraph_spacing: float = 0.0 (id: 6);
}

table AttributedText {
    /// The backing text string. Newlines normalized to LF.
    text: string (required, id: 0);
    /// Default style (base for delta encoding).
    default_style: TextStyleRec (required, id: 1);
    /// Paragraph-level style.
    paragraph_style: ParagraphStyleRec (id: 2);
    /// Ordered runs. If empty, the entire text uses default_style.
    runs: [AttributedTextRun] (id: 3);
}
```

**Delta encoding**: when a run's `style` is `null`, it inherits `default_style`. This is the FlatBuffers equivalent of Figma's `characterStyleIDs[i] == 0` meaning "use base." For single-style text (the common case), `runs` can be empty — the entire text uses `default_style`.

**Comparison with Figma's wire format**: Figma stores `characterStyleIDs: uint[]` (one integer per character) + `styleOverrideTable: NodeChange[]` (one message per distinct override). Our format stores `runs: [AttributedTextRun]` (one message per style transition). For typical design text (3 style changes in 100 characters), our format is more compact: 3 runs vs 100 integers. Figma's format is more compact only when every character has a unique style (unlikely in practice).

## Interaction with the editing engine

The attributed text model is designed to **layer on top of** a plain-text editing engine, not replace it. The plain-text engine handles cursor movement, selection, word/line boundaries, IME composition, and undo/redo. The attributed text model handles styling.

The integration follows a two-layer architecture:

```rust
RichTextEditorState
    content: AttributedText          // text + runs
    cursor: usize                    // caret position (UTF-8 byte offset)
    anchor: Option<usize>            // selection anchor
    caret_style_override: Option<TextStyle>  // transient, cleared on move
```

The editing flow:

1. The plain-text engine processes a command (insert, delete, move, select) and produces the new text + cursor state.
2. The rich text layer diffs the old and new text to determine what was inserted or deleted, then applies the corresponding `insert_with_style` / `delete` on the attributed text model.
3. For insertion, the effective style is the caret style override (if set) or the caret style at the old cursor position.
4. After text mutations, the caret style override is cleared.

This layered design means the editing engine remains pure, testable, and decoupled from styling — matching Flutter's separation of `TextEditingValue` (plain text editing) from `TextSpan` (styled rendering).

### Style commands

Style commands (bold, italic, underline, font size, etc.) are orthogonal to text editing commands. They operate directly on `AttributedText`:

- **With selection**: `apply_style(lo, hi, mutation)` — splits runs at boundaries, applies the mutation, coalesces.
- **Without selection**: sets the `caret_style_override` — the next typed character will use this style. The override is cleared on any cursor movement.

This separation means style commands never pass through the plain-text engine. They are a direct manipulation of the content model.

## Complexity analysis

| Operation             | Time         | Notes                                  |
| --------------------- | ------------ | -------------------------------------- |
| Insert at cursor      | O(k)         | k = runs after cursor; shift offsets   |
| Delete range          | O(k)         | k = total runs; shift + possible merge |
| Apply style to range  | O(m + log k) | m = affected runs, log k for lookup    |
| Style at offset       | O(log k)     | Binary search                          |
| Caret style at offset | O(log k)     | Binary search + boundary check         |
| Runs in range         | O(log k + m) | m = matching runs                      |
| Layout iteration      | O(k)         | Linear scan, k = total runs            |
| Coalesce              | O(k)         | Linear scan after mutation             |

Where k = total number of runs. For typical design tool text (< 100 runs), all operations are effectively O(1).

Contrast with Figma's O(1) per-character lookup (direct array index). Our O(log k) is marginally slower in theory but k is small enough that it doesn't matter in practice, and we save the O(n) memory cost of the per-character array.

## Memory layout

For a text block with `k` runs:

```text
AttributedText:
    text:            24 bytes (String: ptr + len + cap)
    default_style:   ~120 bytes (fixed fields + vecs)
    paragraph_style: ~48 bytes
    runs:            24 + k * sizeof(StyledRun) bytes

StyledRun:
    start:  4 bytes (u32)
    end:    4 bytes (u32)
    style:  ~120 bytes (TextStyle)
    ───────────────
    total:  ~128 bytes per run
```

For a typical text block with 5 runs: ~24 + 120 + 48 + 24 + 640 = ~856 bytes. This is compact enough for thousands of text nodes in a design document.

**Comparison with Figma**: For a 500-character paragraph with 5 style changes, Figma stores 500 × 4 = 2000 bytes for `characterStyleIDs` alone, plus the override table. Our model stores 5 × 128 = 640 bytes for runs, plus the default style. The run-based model uses ~3x less memory for this typical case.

**Future optimization**: Style interning (`Arc<TextStyle>`) can reduce per-run cost to ~16 bytes when many runs share the same style. This is an implementation optimization, not a model change.

## Invariant enforcement

The model exposes mutation only through methods that maintain invariants. Direct field access is restricted to reads. The key methods form a closed algebra:

```rust
fn insert(&mut self, pos: usize, s: &str)
fn delete(&mut self, lo: usize, hi: usize)
fn apply_style(&mut self, lo: usize, hi: usize, f: impl Fn(&mut TextStyle))
fn set_style(&mut self, lo: usize, hi: usize, style: TextStyle)
fn coalesce(&mut self)  // internal, called after every mutation
```

Every public method must leave the runs in a state satisfying all 7 invariants. `coalesce` is idempotent and can be called defensively.

### Debug assertions

In debug builds, every public mutation should conclude with a full invariant check (non-empty run list, coverage, contiguity, non-degenerate runs, maximality, boundary alignment, and monotonicity). This makes invariant violations fail loudly at the point of mutation, not at a later layout or serialization step.

## Relationship to existing Grida types

| This model       | Existing type                                  | Relationship                                                                                           |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `TextStyle`      | `TextStyleRec` (Grida canvas)                  | Structurally equivalent + `fill` field. Lossless conversion.                                           |
| `TextStyle`      | `TextStyleRec` (FlatBuffers schema)            | Maps to the same schema + `fill` extension.                                                            |
| `ParagraphStyle` | Node-level text fields (text_align, etc.)      | These paragraph-level fields are currently scattered on the node record. `ParagraphStyle` groups them. |
| `AttributedText` | Node text + uniform style                      | Replaces the plain string + single style with a structured model.                                      |
| `StyledRun`      | Figma per-character style IDs + override table | Our run represents a resolved range; Figma's model is per-character with deferred resolution.          |

## Testing strategy

1. **Invariant tests**: After every operation (insert, delete, apply_style), assert all 7 run invariants.
2. **Round-trip tests**: Serialization -> deserialization preserves all data.
3. **Editing integration tests**: Run the full editing command suite through the rich text editor state, verifying that runs shift correctly for every command.
4. **Edge cases**:
   - Insert at run boundary (no split needed).
   - Insert at end of text with a different style (must not corrupt offsets).
   - Delete spanning multiple runs (merge survivors).
   - Apply style to exact run boundaries (no split needed).
   - Apply style creating identical adjacent runs (must merge).
   - Empty text: caret style preservation.
   - Single-character runs (emoji grapheme clusters).
   - Style application to zero-width range (no-op).
   - Multibyte characters: style boundaries must align to char boundaries.
5. **Property tests**: For random sequences of (insert, delete, apply_style), invariants always hold.
6. **Import tests**: Round-trip from per-character ID representations (e.g. Figma `TextData`) to run-based attributed text and verify structural equivalence.

## Phased roadmap

### Phase 0: Core data model

The attributed text struct with invariant-enforcing mutation methods, the complete `TextStyle` field set, and comprehensive tests for all operations and invariants.

### Phase 1: Layout integration

The layout engine accepts attributed text and pushes per-run styles to the paragraph builder. Variable font axis interpolation (`wght`, `wdth`, `opsz`) is performed via font arguments on each text style, so that a single registered variable font typeface renders at any requested weight, width, or optical size. Font features and decorations are applied per run.

### Phase 2: Editor integration

The rich text editor state wraps attributed text with cursor, selection, and caret style override. The plain-text editing engine is reused without modification; a diff-based synchronization layer keeps the run model in sync with text mutations. Style commands (bold, italic, underline, font size) operate directly on the content model:

- **Bold**: toggles `font_weight` 400 / 700.
- **Italic**: toggles `font_style_italic` — the layout engine selects the real italic typeface when available.
- **Underline**: toggles `text_decoration_line`.
- **Font size**: increments/decrements `font_size` with a configurable step (clamped to a minimum). Mixed sizes within a paragraph produce correct per-line metrics.

### Phase 3: Serialization

FlatBuffers schema evolution with the types defined in this document. Rust and TypeScript codecs for round-trip serialization. Migration path from uniform-style text nodes (single-run attributed text). Figma import path via run-length encoding of per-character style ID arrays.

## References

### Platform references

- Apple `NSAttributedString`: https://developer.apple.com/documentation/foundation/nsattributedstring
- Apple `NSTextStorage` (attribute fixing): https://developer.apple.com/documentation/uikit/nstextstorage
- Android `SpannableStringBuilder`: https://developer.android.com/reference/android/text/SpannableStringBuilder
- Android span flags: https://developer.android.com/reference/android/text/Spanned
- Flutter `TextSpan`: https://api.flutter.dev/flutter/painting/TextSpan-class.html
- Flutter `ParagraphBuilder`: https://api.flutter.dev/flutter/dart-ui/ParagraphBuilder-class.html

### Layout engine references

- Skia `ParagraphBuilder::pushStyle/addText`: https://api.skia.org/classskia_1_1textlayout_1_1ParagraphBuilder.html
- Skia `TextStyle`: https://api.skia.org/classskia_1_1textlayout_1_1TextStyle.html

### Format and schema references

- FlatBuffers schema evolution: https://flatbuffers.dev/flatbuffers_guide_writing_schema.html
- Unicode Text Segmentation (UAX#29): https://www.unicode.org/reports/tr29/

### Internal references

- Text Editing Manifesto: `docs/wg/feat-text-editing/index.md`
- Performance Model: `docs/wg/feat-text-editing/impl-performance.md`
- Paragraph Roadmap: `docs/wg/feat-paragraph/index.md`
- FlatBuffers Schema: `format/grida.fbs`
- Figma kiwi schema reference: `.ref/figma/fig.kiwi`
