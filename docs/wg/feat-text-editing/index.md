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
- **Determinism (scoped)**: for fixed font set, shaping engine, and layout constraints, the mapping (state) → geometry is a function (same input ⇒ same output).
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

The minimal state that a plain text input exposes can be represented as a tuple:

- **value** ∈ Σ\*: the full plain text string
- **selection_start** ∈ P: one selection endpoint
- **selection_end** ∈ P: the other endpoint

where P denotes the set of valid `text_position` values. When `selection_start = selection_end`, the caret is at that position (no selection).

### Indexing: UTF-16 code units (host interop)

For compatibility with common platform APIs, `selection_start` / `selection_end` are often expressed in **UTF-16 code unit offsets** (not bytes, not Unicode scalar indices). This is primarily a host-interop decision.

If UTF-16 offsets are used, the system must explicitly handle these pitfalls:

- **Surrogates**: an arbitrary integer offset can land _inside_ a surrogate pair unless you enforce boundary rules.
- **Normalization**: offsets are not stable under Unicode normalization (NFC/NFD), and input methods may normalize.
- **User-perceived characters**: many correctness rules are about grapheme clusters, not code units.

### A real position type (do not use “just numbers” conceptually)

Even if you serialize/interoperate via UTF-16 offsets, editing should be defined in terms of a **text_position**:

- `text_position = { offset: number, affinity?: "upstream" | "downstream" }`

An alternative design is to make positions **opaque** (engine-owned tokens) for maximal correctness, and only convert to/from UTF-16 at the host boundary. This improves correctness but reduces direct interop with APIs that require numeric offsets.

`affinity` (optional) matters at:

- soft wraps (visual line breaks)
- bidi boundaries (visual/logical discontinuities)
- hard line breaks

### Normalization rules

- The selection may be **forward** or **backward**; keep raw `(start, end)` but provide a normalized `(min, max)` view.
- Cursor movement and selection expansion operate on **valid cursor stops** (grapheme boundaries at minimum).

### Optional but important extensions (still minimal)

To support modern input correctly, the following are often necessary (but can be optional fields):

- **composition** (IME):
  - `composition_range?: { start: text_position; end: text_position }`
  - Define whether composition is **in-band** (part of `value`) or **overlay** (not yet committed into `value`).

## Layout options (minimum)

Correctness requires layout options that affect bidi and line breaking:

- **paragraph_direction**: `"ltr" | "rtl" | "auto"`
  - `"auto"` resolves base direction from the text (per Unicode BiDi rules / UAX#9).
- width/line wrap constraints (implementation-defined)
- newline policy (see below)

## Geometry query surface (engine responsibilities)

To render the caret and selection in a custom canvas, the engine should provide:

- **position from point**:
  - `position_at_point(x, y) → text_position`
- **caret geometry**:
  - `caret_rect_at_position(position: text_position) → rect`
- **selection geometry**:
  - `selection_rects_for_range(start: text_position, end: text_position, options?) → rect_with_direction[]`
- **boundaries / granularity**:
  - `boundary_at(position: text_position, granularity: "grapheme" | "word" | "line" | "paragraph") → { start: text_position, end: text_position }`
  - `next_position(position: text_position, granularity) → text_position`
  - `prev_position(position: text_position, granularity) → text_position`
- **Line metrics** (optional early, essential later):
  - baselines, line boxes, ascent/descent, wrapped line breaks

### rect_with_direction (bidi awareness)

Selection is not always a single rectangle. For bidi text and wrapped lines, selection geometry is naturally a list of rectangles. Including the **direction per rect** enables correct visual treatment and future features (handles, highlights, navigation).

### Selection geometry policy (options that change correctness)

Selection rectangles depend on policy. Even a minimal API should include:

- **rect_mode**: `"none" | "tight" | "linebox"`
  - `"none"`: pass raw engine output through unchanged; empty lines produce zero-width (invisible) rects. Keeps the host fully engine-agnostic and is the correct choice when the host intends to apply its own synthesis or test the raw output.
  - `"tight"`: expand zero-width rects for empty lines to a minimum visible width; non-empty lines keep glyph-tight bounds.
  - `"linebox"`: expand every selected line's rect to the full layout width; both empty and non-empty lines become uniform full-row blocks.
- **include_trailing_newline**: boolean
- **end_of_line_affinity_policy**: `"upstream" | "downstream" | "preserve"`

**Empty-line selection invariant**:

If a logical line is fully or partially covered by the selection range, the engine MUST return at least one visible selection rectangle for that line, even when the line contains no glyphs (e.g. an empty line or a line consisting only of a line terminator). The exact rectangle shape follows the active selection painting policy (e.g. glyph‑tight vs line‑box), but the absence of glyphs MUST NOT result in a visually missing highlight.

**Implementation note (shaping engines):**

A typical paragraph engine's `get_rects_for_range` (e.g. Skia, ICU Layout, or equivalent) satisfies the invariant at the data level but violates it visually: it returns a rect for every line in the range, but lines with no glyph content (empty lines, lines consisting only of a line terminator) receive a **zero-width rect** (`left == right`), which renders as invisible. Additionally, a trailing newline at the very end of the text is a special case: its rect is placed at the y-coordinates of the preceding content line rather than the phantom empty line that follows it; and when the selection range covers the full text, that phantom line may receive no rect at all.

When `rect_mode` is `"none"` the raw output is forwarded unchanged and no post-processing is applied. For `"tight"` and `"linebox"`, two post-processing steps are required:

1. **Expand zero-width rects.** For any rect where `left ≈ right`, expand the right edge to a minimum visible width according to `rect_mode`:
   - `"tight"` (glyph-tight): expand by a small fixed amount (e.g. approximately half the font size), anchored at `left`.
   - `"linebox"`: expand all rects — including non-empty lines — so that `right` equals the layout width. This produces a full-row highlight for every selected line.

   The expansion strategy should distinguish two sub-cases for zero-width rects:
   - `left ≈ 0`: the line is entirely empty; apply the full `rect_mode` expansion.
   - `left > 0`: the rect represents a line-terminator character at the end of a content line; always apply a small fixed bump regardless of `rect_mode`, to avoid painting the entire row background when only the terminator is selected.

2. **Inject a rect for the trailing phantom line.** When the selection extends to the last code unit of a text that ends with a line terminator, check whether the paragraph's line metrics contain a final entry (the phantom empty line) whose y-band is not represented by any existing rect. If so, inject a synthetic rect for that band using the `rect_mode` expansion width.

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

The host (DOM, native, custom shell) captures input events and updates `text_input_state`. The engine provides geometry to make those updates accurate.

### Pointer-driven selection (gesture)

A minimal gesture model:

- **PointerDown**:
  - `anchor = position_at_point(x, y)`
  - If modifier for “extend selection” is active, keep existing anchor and update focus.
- **PointerMove (drag)**:
  - `focus = position_at_point(x, y)`
  - `selection = (anchor, focus)`
- **PointerUp**:
  - Commit selection state.

### Multi-click selection (sequential clicks)

Text editors commonly treat rapid sequential clicks as an escalating selection gesture. The host is responsible for counting clicks and deciding whether two clicks are part of the same sequence (a platform-defined time/space threshold).

Let $p \in P$ be the text position under the pointer at click time (via `position_at_point`). For granularity $g \in \{\text{grapheme}, \text{word}, \text{line}, \text{paragraph}\}$, let $R_g(p) = [a, b)$ be the closed-open logical range returned by `boundary_at(p, g)`.

Let click count $k \in \{1, 2, 3, 4\}$ within the same sequence:

- **k = 1 (single click)**: place the caret at `p` (a collapsed selection).
- **k = 2 (double click)**: select the **word** containing `p`, i.e. the range `R_word(p)`.
- **k = 3 (triple click)**: select the **line** containing `p`, i.e. the range `R_line(p)`.
- **k = 4 (quadruple click)**: select the entire editable value (document range).

Notes:

- These selections are **logical ranges**; visual highlighting is produced via the selection-rectangle queries and may be split across multiple rectangles (wraps, bidi).
- “Line” refers to the host’s chosen line granularity. If the engine exposes a `line` boundary tied to layout, triple-click should map to the **visual line in the current layout** (including soft wraps). If the host wants “hard line” (paragraph line breaks only), it must use `paragraph` boundaries or an explicit policy.
- The definition above is intentionally deterministic: given the same `position_at_point` mapping and the same boundary rules, the same click sequence produces the same logical selection.

### Keyboard navigation (minimal baseline)

At minimum, support:

- Arrow navigation with optional selection expansion
- Home/End (line boundaries), PageUp/PageDown (viewport boundaries)
- Word/line navigation modifiers (host-dependent)

The “what is a word” rule should come from engine word-boundary queries or a shared text boundary module.

## Editing operations surface (semantics, not UI)

To avoid every host re-implementing subtly different editing behavior, define a minimal, shared operation surface:

- `apply_edit(state, command) → new_state`

Where `command` includes at least:

- `insert_text(text)`
- `replace_range(start: text_position, end: text_position, text)`
- `backspace(granularity?: "grapheme" | "word")`
- `delete(granularity?: "grapheme" | "word")`
- `set_selection(start: text_position, end: text_position)`
- `set_composition(range, text?)` / `commit_composition()` / `cancel_composition()`

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

- **Word boundaries are not whitespace-delimited**: “word” selection/navigation typically relies on language-aware segmentation (and may be user-configurable). A naive whitespace-based `word_boundary_at` will behave incorrectly.
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

- **Engine-rendered overlays**: host passes `text_input_state` into the engine; the engine renders caret/selection.
  - Pros: single source of truth for transforms and pixel-perfect alignment with text rendering.
  - Cons: needs an animation clock (cursor blink) and careful invalidation/redraw policy.

Either is valid; choosing should be guided by performance goals, platform constraints, and correctness needs.

## Text diagnostics and spellcheck indication (UX layer)

This manifesto does **not** define how spelling or grammar analysis is performed, since dictionaries, language models, and platform services vary widely across environments (native OS, browser, WASM, custom dictionaries, etc.).

Instead, the engine defines the **visual indication contract** for text diagnostics such as spelling errors, grammar warnings, or similar annotations.

### Diagnostic ranges (logical)

Diagnostics are expressed as logical text ranges over the same **text_position** model used for selection. Each diagnostic has:

- a logical `[start, end)` range
- a diagnostic **kind** (e.g. spelling, grammar, suggestion, informational)
- optional metadata owned by the host (suggestions, language, severity, etc.)

The engine does **not** interpret diagnostic meaning; it only guarantees correct geometry and rendering alignment.

### Geometry for diagnostic underlines (visual)

For any diagnostic range, the engine MUST provide geometry consistent with shaped layout runs, wrapping, and bidi resolution—identical correctness requirements as selection rectangles.

The most common UX form is a **wavy underline** (e.g. red squiggle for spelling). The exact drawing style is host‑defined, but the engine MUST ensure:

- Underline geometry follows **glyph shaping and line breaks**, not codepoint boxes.
- Geometry splits naturally across **wrapped lines and bidi runs**.
- Empty visual lines inside the diagnostic range still produce a visible underline segment consistent with line‑box policy.

### Interaction with selection and composition

- Diagnostics MUST NOT visually interfere with caret or selection rendering priority.
- By default, diagnostics **should not appear inside an active IME composition range**, unless explicitly requested by the host.
- Diagnostic geometry must remain stable under incremental edits using the same invalidation rules as selection geometry.

### Rendering responsibility

As with caret and selection, two strategies are valid:

- **Host‑rendered diagnostics** using engine‑provided geometry.
- **Engine‑rendered diagnostics** as part of the text overlay pipeline.

The contract of this manifesto is limited to **correct geometry and layering**, not linguistic correctness.

## Undo/redo boundaries (even if host-owned)

Even if history is not implemented in the engine, specify:

- What constitutes an **atomic edit**
- How IME composition edits are **grouped** (composition typically needs special grouping)

One approach: have `apply_edit` optionally emit an **edit grouping key** or “transaction id” so hosts can build consistent undo stacks.

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

## References

This manifesto aligns with established text-editing models and platform behaviors. The following references are useful for deeper study and cross‑validation of concepts such as editing intents, keybinding actions, shaping, and IME handling.

### Web platform

- W3C Input Events Level 2 — standardized editing intent vocabulary (`beforeinput`, `inputType`):
  https://www.w3.org/TR/input-events-2/
- HTML Editing APIs and selection behavior (WHATWG HTML):
  https://html.spec.whatwg.org/

### Native platforms

- Apple `NSStandardKeyBindingResponding` — canonical macOS text‑editing command/action set:
  https://developer.apple.com/documentation/appkit/nsstandardkeybindingresponding
- Cocoa Text System key bindings and customization:
  https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/TextDefaultsBindings/TextDefaultsBindings.html

### Framework references

- Flutter text editing shortcuts and intents:
  https://api.flutter.dev/flutter/widgets/DefaultTextEditingShortcuts-class.html
- Flutter `Shortcuts` / `Actions` system:
  https://api.flutter.dev/flutter/widgets/Shortcuts-class.html

### Text shaping and layout engines

- HarfBuzz text shaping engine:
  https://harfbuzz.github.io/
- Unicode Text Segmentation (UAX #29 — grapheme/word boundaries):
  https://www.unicode.org/reports/tr29/
- Unicode Bidirectional Algorithm (UAX #9):
  https://www.unicode.org/reports/tr9/

These documents are not normative for this manifesto but serve as widely accepted
reference points across web, native, and cross‑platform text systems.
