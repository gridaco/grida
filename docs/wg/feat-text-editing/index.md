---
id: feat-text-editing
title: "Text Editing: Manifesto"
---

## Motivation

Text editing is deceptively complex. A serious canvas/graphics runtime benefits from **first-class, engine-level text editing primitives**:

- Accurate caret placement and selection rendering across scripts and fonts
- Deterministic behavior across platforms (browser, desktop, embedded)
- A foundation for higher-level UI frameworks (e.g. “Flutter-like” systems) where text is not delegated to native widgets

This document proposes a **minimal but extensible** text editing model and geometry query surface that can power custom rendering and interaction.

## Goals

- **Minimal state** that accurately mirrors common text input semantics.
- **Engine-provided geometry** for caret and selection, suitable for custom rendering.
- **Correctness across writing systems**, including bidirectional (bidi) text.
- **Composable interactions** (click, drag, keyboard navigation) with predictable rules.
- **Stable API boundary** that can be hosted by different shells (DOM, native, headless).

## Non-goals

- Rich text authoring UI (toolbars, inline formatting UX).
- Document-wide layout engines (pagination, full text shaping pipelines exposed publicly).
- Collaborative editing protocols (OT/CRDT) as part of the base API (can be layered later).

## Principles

- **Model vs view separation**: input state is pure data; geometry is queried; rendering is host-defined.
- **Text positions are contracts**: cursoring and selection operate on _valid cursor stops_, not arbitrary integers.
- **Determinism (scoped)**: given the same font set, shaping engine, and layout constraints, the same state yields the same geometry.
- **Incremental computation**: queries should be cheap, cacheable, and invalidated predictably.
- **Accessibility compatibility**: expose enough structure to bridge to platform accessibility layers.

## Core contracts (read this first)

These contracts exist to prevent subtly-wrong implementations that “mostly work” until bidi, IME, or emoji break them.

- **Offsets are a host-interop choice**: if the host uses UTF-16 offsets (common), treat them as an _interop format_, not an inherent recommendation.
- **Positions are boundaries**: a “position” must be a **valid cursor stop**. The engine must define what is valid and how invalid offsets are handled.
  - If the host supplies an invalid offset, the engine **clamps/rounds to the nearest valid boundary** (policy must be specified).
  - A valid boundary must **not split surrogate pairs** and must **not split grapheme clusters**.
- **Selection endpoints are logical; rectangles are visual**: selection is defined in logical text order; selection rectangles are returned in visual order.
- **All geometry is computed from shaped layout runs**: caret and selection must match the shaped glyph runs (ligatures, fallback, bidi reordering).
- **Coordinate spaces are explicit**: every geometry query states which coordinate space it returns (or is parameterized by a transform).

## Minimal input state model

The minimal state that a plain text input exposes can be represented as:

- **value**: the full plain text string
- **selectionStart**: one selection endpoint (**TextPosition**)
- **selectionEnd**: the other endpoint (**TextPosition**)

When `selectionStart == selectionEnd`, the caret is at that position (no selection).

### Indexing: UTF-16 code units (host interop)

For compatibility with common platform APIs, `selectionStart`/`selectionEnd` are often expressed in **UTF-16 code unit offsets** (not bytes, not Unicode scalar indices). This is primarily a host-interop decision.

If UTF-16 offsets are used, the system must explicitly handle these pitfalls:

- **Surrogates**: an arbitrary integer offset can land _inside_ a surrogate pair unless you enforce boundary rules.
- **Normalization**: offsets are not stable under Unicode normalization (NFC/NFD), and input methods may normalize.
- **User-perceived characters**: many correctness rules are about grapheme clusters, not code units.

### A real position type (do not use “just numbers” conceptually)

Even if you serialize/interoperate via UTF-16 offsets, editing should be defined in terms of a **TextPosition**:

- `TextPosition = { offset: number, affinity?: "upstream" | "downstream" }`

An alternative design is to make positions **opaque** (engine-owned tokens) for maximal correctness, and only convert to/from UTF-16 at the host boundary. This improves correctness but reduces direct interop with APIs that require numeric offsets.

`affinity` matters at:

- soft wraps (visual line breaks)
- bidi boundaries (visual/logical discontinuities)
- hard line breaks

### Normalization rules

- The selection may be **forward** or **backward**; keep raw `(start, end)` but provide a normalized `(min, max)` view.
- Cursor movement and selection expansion operate on **valid cursor stops** (grapheme boundaries at minimum).

### Optional but important extensions (still minimal)

To support modern input correctly, the following are often necessary (but can be optional fields):

- **composition** (IME):
  - `compositionRange?: { start: TextPosition; end: TextPosition }`
  - Define whether composition is **in-band** (part of `value`) or **overlay** (not yet committed into `value`).

## Layout options (minimum)

Correctness requires layout options that affect bidi and line breaking:

- **paragraphDirection**: `"ltr" | "rtl" | "auto"`
  - `"auto"` resolves base direction from the text (per Unicode BiDi rules / UAX#9).
- width/line wrap constraints (implementation-defined)
- newline policy (see below)

## Geometry query surface (engine responsibilities)

To render the caret and selection in a custom canvas, the engine should provide:

- **Position from point**:
  - `positionAtPoint(x, y) -> TextPosition`
- **Caret geometry**:
  - `caretRectAtPosition(position: TextPosition) -> Rect`
- **Selection geometry**:
  - `selectionRectsForRange(start: TextPosition, end: TextPosition, options?) -> RectWithDirection[]`
- **Boundaries / granularity**:
  - `boundaryAt(position: TextPosition, granularity: "grapheme" | "word" | "line" | "paragraph") -> { start: TextPosition, end: TextPosition }`
  - `nextPosition(position: TextPosition, granularity) -> TextPosition`
  - `prevPosition(position: TextPosition, granularity) -> TextPosition`
- **Line metrics** (optional early, essential later):
  - baselines, line boxes, ascent/descent, wrapped line breaks

### RectWithDirection (bidi awareness)

Selection is not always a single rectangle. For bidi text and wrapped lines, selection geometry is naturally a list of rectangles. Including the **direction per rect** enables correct visual treatment and future features (handles, highlights, navigation).

### Selection geometry policy (options that change correctness)

Selection rectangles depend on policy. Even a minimal API should include:

- **rectMode**: `"tight" | "lineBox"` (glyph-tight bounds vs line-height boxes)
- **includeTrailingNewline**: boolean
- **endOfLineAffinityPolicy**: `"upstream" | "downstream" | "preserve"`

Future extensions often needed:

- handle/anchor geometry for touch selection
- returning “collapsed caret rect” vs “insertion bounds”

## Coordinate spaces and transforms

Every geometry API must specify what space it operates in and returns:

- **layout-local**: coordinates relative to the text layout box origin (recommended default)
- **world/canvas**: coordinates after transforms (scale/rotate/translate)

Two acceptable contracts:

- **Fixed space**: “All geometry queries return layout-local rectangles.”
- **Parameterized**: “All geometry queries accept a transform and return transformed rectangles.”

## Interaction model (host responsibilities)

The host (DOM, native, custom shell) captures input events and updates `TextInputState`. The engine provides geometry to make those updates accurate.

### Pointer-driven selection (gesture)

A minimal gesture model:

- **PointerDown**:
  - `anchor = positionAtPoint(x, y)`
  - If modifier for “extend selection” is active, keep existing anchor and update focus.
- **PointerMove (drag)**:
  - `focus = positionAtPoint(x, y)`
  - `selection = (anchor, focus)`
- **PointerUp**:
  - Commit selection state.

### Keyboard navigation (minimal baseline)

At minimum, support:

- Arrow navigation with optional selection expansion
- Home/End (line boundaries), PageUp/PageDown (viewport boundaries)
- Word/line navigation modifiers (host-dependent)

The “what is a word” rule should come from engine word-boundary queries or a shared text boundary module.

## Editing operations surface (semantics, not UI)

To avoid every host re-implementing subtly different editing behavior, define a minimal, shared operation surface:

- `applyEdit(state, command) -> newState`

Where `command` includes at least:

- `insertText(text)`
- `replaceRange(start: TextPosition, end: TextPosition, text)`
- `backspace(granularity?: "grapheme" | "word")`
- `delete(granularity?: "grapheme" | "word")`
- `setSelection(start: TextPosition, end: TextPosition)`
- `setComposition(range, text?)` / `commitComposition()` / `cancelComposition()`

The core guarantee: these operations **never create invalid positions** (never split surrogates or clusters) and always return a valid state.

## Correctness considerations

### Bidirectional text (bidi)

The system must handle mixed-direction text (LTR + RTL) with:

- Visual selection boxes that follow shaped runs and line breaks
- Positioning that maps points to logical text positions robustly
- Caret placement at bidi boundaries (affinity matters)

At minimum, the contract should state that bidi resolution follows **UAX#9** at the paragraph level (directional runs + embedding levels), and that selection endpoints remain **logical** while rectangles are **visual**.

### Grapheme clusters and cursoring

Cursor movement and deletion should respect **grapheme clusters** (e.g. emoji sequences, combining marks). Storing indices as UTF-16 offsets is fine, but operations should avoid splitting clusters.

### CJK (Korean/Japanese/Chinese) specifics

CJK text stresses boundary and navigation rules:

- **Word boundaries are not whitespace-delimited**: “word” selection/navigation typically relies on language-aware segmentation (and may be user-configurable). A naive whitespace-based `wordBoundaryAt` will behave incorrectly.
- **IME-first workflows**: composition ranges and candidate selection are core, not edge cases. Composition must interact correctly with selection, deletion, and undo grouping.
- **Line breaking and punctuation**: wrapping behavior and caret movement are influenced by language-specific line-breaking rules and full-width punctuation. If line granularity is provided, it must reflect the layout’s actual break opportunities.

### Shaping, ligatures, and font fallback

Geometry must correspond to **shaped glyph runs**, not naive per-codepoint boxes. This includes:

- Ligatures (single glyph for multiple characters)
- Variable glyph advances and kerning
- Font fallback across scripts

### Layout constraints and truncation

Selection and caret geometry must remain correct under:

- Wrapping (width constraints)
- Line limits (max lines)
- Ellipsis/truncation
- Alignment (horizontal and vertical)

### IME composition

Composition requires:

- A composition range
- Distinct styling/underline rendering
- A clear contract for whether composition text is **in-band** (inside `value`) or **overlay** (not yet committed)

### Newline policy + line breaks

Define early:

- **Newline representation**: normalize input to `\n` (recommended) or specify alternatives.
- **CRLF handling**: how `\r\n` is accepted and normalized.
- **Hard breaks vs soft wraps**: hard breaks are part of `value`; soft wraps come from layout constraints.

This affects Home/End, line-boundary selection, and end-of-line affinity behavior.

## Rendering strategies

Two viable strategies exist:

- **Host-rendered overlays**: host queries geometry and renders caret/selection as overlay primitives.

  - Pros: simplest composition with existing UI layers, easy cursor blink timing.
  - Cons: requires consistent coordinate transforms and synchronization.

- **Engine-rendered overlays**: host passes `TextInputState` into the engine; the engine renders caret/selection.
  - Pros: single source of truth for transforms and pixel-perfect alignment with text rendering.
  - Cons: needs an animation clock (cursor blink) and careful invalidation/redraw policy.

Either is valid; choosing should be guided by performance goals, platform constraints, and correctness needs.

## Undo/redo boundaries (even if host-owned)

Even if history is not implemented in the engine, specify:

- What constitutes an **atomic edit**
- How IME composition edits are **grouped** (composition typically needs special grouping)

One approach: have `applyEdit` optionally emit an **edit grouping key** or “transaction id” so hosts can build consistent undo stacks.

## Phased roadmap

### Phase 0: Geometry queries

- Position-from-point
- Caret rect at position
- Selection rects for range
- Word boundary

### Phase 1: Minimal editing UX

- Pointer drag selection
- Keyboard caret movement
- Copy/paste integration (host-driven)

### Phase 2: Composition & internationalization

- IME composition range + styling
- More complete bidi boundary handling (affinity, line breaks)

### Phase 3: Advanced features (optional)

- Multiple selections/carets
- Rich text spans and attributes
- Accessibility surface integration
- Collaborative layers (CRDT/OT)

## Testing strategy

- **Golden tests**: render snapshots for caret/selection geometry across scripts and fonts.
- **Property tests**: ensure invariants (e.g. selection rects cover the selected logical range).
- **Cross-platform fixtures**: define determinism as “same fonts + shaping engine + layout constraints”; otherwise document expected differences.
- **Explicit edge-case fixtures**:
  - emoji ZWJ sequences (family emojis, skin tones)
  - combining marks (accented sequences)
  - CJK without spaces + mixed Latin (segmentation / boundary behavior)
  - full-width punctuation and brackets (caret/selection around punctuation)
  - mixed Arabic/Hebrew with numbers and punctuation (classic bidi cases)
  - ligatures and font fallback across scripts
