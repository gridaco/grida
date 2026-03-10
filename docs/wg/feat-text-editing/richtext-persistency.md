---
id: richtext-persistency
title: "Rich Text Persistency: Research & Comparative Reference"
---

## Purpose

This document is a **research artifact and comparative reference** for rich text persistency models. It surveys how major systems represent styled text on disk and on the wire, catalogs the full property universe, analyzes structural trade-offs, and records Grida's current state as context.

This document is **not** a finalized proposal or committed architecture decision. It is intended to ground future schema design work with factual analysis and prior art. Any candidate directions sketched here are illustrative, not normative.

### Design constraints under consideration

The following constraints have been identified by stakeholders as desirable for a future Grida rich text persistency model. They are recorded here as research inputs, not as finalized requirements:

1. **CRDT-compatible**: the model should not structurally prevent layering CRDT/OT collaboration. Per-character or per-run multiplayer should be feasible without rewriting the core model.
2. **Non-nested, tabular**: preference for flat structures (e.g., FlatBuffers tables with run arrays) over recursive trees.
3. **Per-range styling**: fills, fonts, decorations, OpenType features, and typographic properties should be stylable per character range.
4. **Storage-compact**: avoid per-character overhead for uniformly-styled text. Delta-encoding against a default style is preferred.
5. **Evolution-friendly**: FlatBuffers schema evolution (new optional fields with stable IDs).
6. **Pragmatic**: avoid over-engineering. Provide extension points without front-loading complexity.

---

## 1. Comparative survey: how systems model rich text

### 1.1 SVG `<text>` / `<tspan>` (W3C SVG 2)

**Source**: [W3C SVG 2 Text chapter](https://www.w3.org/TR/SVG2/text.html)

SVG models text as a tree: `<text>` is the block element, `<tspan>` children carry per-range style overrides. Properties cascade from parent to child via CSS inheritance.

```xml
<text font-family="Inter" font-size="16" fill="black">
  Hello <tspan font-weight="bold" fill="red">world</tspan>!
</text>
```

**Key properties** (on `<text>` and `<tspan>`):

| Category    | Properties                                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Font        | `font-family`, `font-size`, `font-weight`, `font-style`, `font-stretch`, `font-variant`, `font-feature-settings`, `font-variation-settings`, `font-kerning`, `font-optical-sizing` |
| Spacing     | `letter-spacing`, `word-spacing`, `line-height`                                                                                                                                    |
| Alignment   | `text-anchor` (start/middle/end), `dominant-baseline`, `alignment-baseline`, `baseline-shift`                                                                                      |
| Decoration  | `text-decoration` (line, style, color, thickness, skip-ink)                                                                                                                        |
| Transform   | `text-transform`                                                                                                                                                                   |
| Direction   | `writing-mode`, `direction`, `unicode-bidi`                                                                                                                                        |
| Fill/Stroke | `fill`, `stroke`, `fill-opacity`, `stroke-opacity`, etc.                                                                                                                           |
| Positioning | `x`, `y`, `dx`, `dy`, `rotate` (per-glyph repositioning)                                                                                                                           |

**Observations**:

- (+) CSS property inheritance is well understood and widely implemented.
- (+) Per-glyph positioning (`dx`, `dy`, `rotate`) is a capability not found in most other models.
- (-) **Tree-nested**: `<tspan>` nests inside `<tspan>`. Overlapping styles require resolving the tree.
- (-) Not designed for in-place editing (DOM tree is typically treated as immutable for rendering).
- (-) No native concept of "default style + overrides."
- **Summary**: Useful as a property reference. The nested tree structure is generally considered unsuitable for design-tool editing contexts.

### 1.2 CSS text properties (W3C CSS Text / CSS Fonts)

CSS defines the property vocabulary that SVG, Flutter, Skia, and browsers converge toward:

| CSS Module                | Key properties                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSS Fonts 4**           | `font-family`, `font-weight` (1-1000), `font-style` (normal/italic/oblique), `font-stretch` (50%-200%), `font-size`, `font-optical-sizing`, `font-kerning`, `font-feature-settings`, `font-variation-settings`, `font-synthesis`    |
| **CSS Text 3**            | `letter-spacing`, `word-spacing`, `line-height`, `text-transform` (none/uppercase/lowercase/capitalize), `text-align`, `text-indent`, `word-break`, `overflow-wrap`                                                                 |
| **CSS Text Decoration 4** | `text-decoration-line` (none/underline/overline/line-through), `text-decoration-style` (solid/double/dotted/dashed/wavy), `text-decoration-color`, `text-decoration-thickness`, `text-underline-offset`, `text-decoration-skip-ink` |
| **CSS Writing Modes 4**   | `writing-mode`, `direction`, `unicode-bidi`                                                                                                                                                                                         |
| **CSS Inline 3**          | `vertical-align`, `dominant-baseline`, `alignment-baseline`, `baseline-shift`                                                                                                                                                       |

**Observation**: CSS property names and semantics function as a de facto lingua franca across the systems surveyed here. Figma, Flutter, Skia, and browsers all map to or from CSS properties. A rich text model that adopts CSS-compatible naming and semantics is likely to have the least impedance mismatch with downstream consumers.

### 1.3 Flutter `TextSpan` / `TextStyle` (tree-based, immutable)

**Source**: [Flutter TextSpan](https://api.flutter.dev/flutter/painting/TextSpan-class.html), [Flutter TextStyle](https://api.flutter.dev/flutter/painting/TextStyle-class.html)

Flutter uses an **immutable recursive tree** of `TextSpan` nodes. Each has optional `text`, `style`, and `children`. Styles cascade: child `TextStyle` fields override parent fields when non-null.

At layout time, `TextSpan.build(ParagraphBuilder)` does a DFS, calling `pushStyle` / `addText` / `pop` -- flattening the tree into a run-based sequence that Skia `ParagraphBuilder` consumes.

**Flutter `TextStyle` fields** (per-run capable):

```
fontFamily, fontFamilyFallback, fontSize, fontWeight, fontStyle,
letterSpacing, wordSpacing, height (line-height multiplier),
foreground (Paint), background (Paint), shadows, fontFeatures,
fontVariations, decoration, decorationColor, decorationStyle,
decorationThickness, locale, leadingDistribution
```

**Observations**:

- (+) Ergonomic API for building styled text programmatically.
- (+) Natural CSS-like cascading via non-null field override.
- (-) **Not designed for in-place editing**: `TextEditingValue` is plain text + selection. The styled tree is rebuilt on each frame.
- (-) Tree rebuild per mutation makes it impractical for editing-oriented use cases.
- **Summary**: Useful as a property reference. Demonstrates that tree structures are resolved to flat runs before reaching the layout engine.

### 1.4 Figma text model (Kiwi `.fig` schema + REST API)

Figma uses a distinctive architecture: a **per-character style ID array** with an **override table**.

#### 1.4.1 Kiwi (`.fig` internal format)

**Source**: `fig.kiwi` schema ([`.ref/figma/fig.kiwi`](/.ref/figma/fig.kiwi)), [`docs/wg/feat-fig/glossary/fig.kiwi.md`](/docs/wg/feat-fig/glossary/fig.kiwi.md)

```
TextData {
    characters: string                    // flat plain text
    characterStyleIDs: uint[]             // per-character style ID
    styleOverrideTable: NodeChange[]      // sparse override table
    lines: TextLineData[]                 // per-line metadata
    fontMetaData: FontMetaData[]          // font weight/italic data
    ...
}
```

**Three-layer architecture**:

| Layer                 | Content                                                             | Purpose                                                                          |
| --------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Base style**        | `NodeChange` fields (`fontSize`, `fontName`, `letterSpacing`, etc.) | Default for all characters (style ID 0)                                          |
| **Per-char ID array** | `characterStyleIDs[i]`                                              | Maps each character to an override ID. `0` = use base. Trailing zeros truncated. |
| **Override table**    | `styleOverrideTable[id]` = `NodeChange` (sparse diff)               | Only overridden fields are set. Unset fields inherit from base.                  |

**Authoring vs layout cache separation**:

- `TextData` = authoring data (characters, style IDs, override table, line metadata). Flows through multiplayer sync.
- `DerivedTextData` = layout cache (glyphs, baselines, decorations, layout size). Computed locally.

**Collaborative text support** (CRDT-like structures present in schema):

```
CollaborativePlainText {
    historyOpsWithIds: CollaborativeTextStrippedOpRunWithIDs[]
    historyOpsWithLoc: CollaborativeTextStrippedOpRunWithLoc[]
    historyStringContentBuffer: byte[]
    changesToAppend: CollaborativeTextOpRun[]
}
```

**Per-character overridable properties** (from `NodeChange` fields):

| Category     | Fields                                                                                                                                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Font         | `fontSize`, `fontName` (family/style/postscript), `fontVariations[]`, `fontVersion`                                                                                                                                                                                                                                    |
| Font variant | `fontVariantCommonLigatures`, `fontVariantContextualLigatures`, `fontVariantDiscretionaryLigatures`, `fontVariantHistoricalLigatures`, `fontVariantOrdinal`, `fontVariantSlashedZero`, `fontVariantNumericFigure`, `fontVariantNumericSpacing`, `fontVariantNumericFraction`, `fontVariantCaps`, `fontVariantPosition` |
| OpenType     | `toggledOnOTFeatures[]`, `toggledOffOTFeatures[]` (229 feature enum values)                                                                                                                                                                                                                                            |
| Spacing      | `letterSpacing` (Number), `lineHeight` (Number), `textTracking`                                                                                                                                                                                                                                                        |
| Transform    | `textCase` (ORIGINAL/UPPER/LOWER/TITLE/SMALL_CAPS/SMALL_CAPS_FORCED)                                                                                                                                                                                                                                                   |
| Decoration   | `textDecoration` (NONE/UNDERLINE/STRIKETHROUGH), `textDecorationStyle` (SOLID/DOTTED/WAVY), `textDecorationFillPaints[]`, `textDecorationSkipInk`, `textDecorationThickness` (Number), `textUnderlineOffset` (Number)                                                                                                  |
| Color        | (inherits from node `fillPaints[]`)                                                                                                                                                                                                                                                                                    |
| Links        | `hyperlink` (url, guid, openInNewTab, cmsTarget)                                                                                                                                                                                                                                                                       |
| Mentions     | `mention` (id, userId)                                                                                                                                                                                                                                                                                                 |
| Semantic     | `semanticWeight` (NORMAL/BOLD), `semanticItalic` (NORMAL/ITALIC), `isOverrideOverTextStyle`                                                                                                                                                                                                                            |
| Leading      | `leadingTrim` (NONE/CAP_HEIGHT), `hangingPunctuation`, `hangingList`                                                                                                                                                                                                                                                   |

**Paragraph-level properties** (node-level, not per-character):

| Field                 | Type                         |
| --------------------- | ---------------------------- |
| `textAlignHorizontal` | LEFT/CENTER/RIGHT/JUSTIFIED  |
| `textAlignVertical`   | TOP/CENTER/BOTTOM            |
| `textAutoResize`      | NONE/WIDTH_AND_HEIGHT/HEIGHT |
| `textTruncation`      | DISABLED/ENDING              |
| `maxLines`            | int                          |
| `paragraphIndent`     | float                        |
| `paragraphSpacing`    | float                        |

**Line-level properties** (from `TextLineData`):

| Field                  | Type                                                |
| ---------------------- | --------------------------------------------------- |
| `lineType`             | PLAIN/ORDERED_LIST/UNORDERED_LIST/BLOCKQUOTE/HEADER |
| `indentationLevel`     | int                                                 |
| `sourceDirectionality` | AUTO/LTR/RTL                                        |
| `directionality`       | LTR/RTL (resolved)                                  |

#### 1.4.2 Figma REST API

**Source**: `@figma/rest-api-spec@0.36.0`

The REST API translates Kiwi's per-character model to a simpler surface:

```typescript
TextNode = {
    characters: string
    style: TypeStyle                          // base style (ID 0)
    characterStyleOverrides: number[]         // per-char override IDs
    styleOverrideTable: { [id]: TypeStyle }   // override diffs
    lineTypes: ('NONE' | 'ORDERED' | 'UNORDERED')[]
    lineIndentations: number[]
}
```

**`TypeStyle` fields** (flattened `BaseTypeStyle` + own):

| Field                       | Type                                  | Notes                                                   |
| --------------------------- | ------------------------------------- | ------------------------------------------------------- |
| `fontFamily`                | string                                |                                                         |
| `fontPostScriptName`        | string \| null                        |                                                         |
| `fontStyle`                 | string                                | Human-readable ("Bold Italic")                          |
| `italic`                    | boolean                               |                                                         |
| `fontWeight`                | number                                | 1-1000                                                  |
| `fontSize`                  | number                                | px                                                      |
| `textCase`                  | enum                                  | ORIGINAL/UPPER/LOWER/TITLE/SMALL_CAPS/SMALL_CAPS_FORCED |
| `textAlignHorizontal`       | enum                                  | LEFT/RIGHT/CENTER/JUSTIFIED                             |
| `textAlignVertical`         | enum                                  | TOP/CENTER/BOTTOM                                       |
| `letterSpacing`             | number                                | px                                                      |
| `fills`                     | Paint[]                               | **Per-run fills**                                       |
| `hyperlink`                 | Hyperlink                             | URL or NODE                                             |
| `opentypeFlags`             | `{ [tag]: 0\|1 }`                     |                                                         |
| `semanticWeight`            | BOLD/NORMAL                           |                                                         |
| `semanticItalic`            | ITALIC/NORMAL                         |                                                         |
| `paragraphSpacing`          | number                                | px                                                      |
| `paragraphIndent`           | number                                | px                                                      |
| `listSpacing`               | number                                | px                                                      |
| `textDecoration`            | NONE/STRIKETHROUGH/UNDERLINE          |                                                         |
| `textAutoResize`            | NONE/WIDTH_AND_HEIGHT/HEIGHT/TRUNCATE |                                                         |
| `textTruncation`            | DISABLED/ENDING                       |                                                         |
| `maxLines`                  | number                                |                                                         |
| `lineHeightPx`              | number                                |                                                         |
| `lineHeightPercentFontSize` | number                                |                                                         |
| `lineHeightUnit`            | PIXELS/FONT*SIZE*%/INTRINSIC\_%       |                                                         |
| `boundVariables`            | `{ field: VariableAlias }`            | Variable bindings                                       |

**Observations**:

- (+) **O(1) per-character style lookup** (direct array index + table).
- (+) **Strong CRDT/multiplayer characteristics** -- per-character ID arrays splice trivially; immutable override table avoids run-boundary merge conflicts.
- (+) Two-level inheritance (base + override) is simple and sufficient for observed use cases.
- (+) Clean authoring/layout-cache separation.
- (-) Memory overhead: one `uint` per character even for uniform text (mitigated by trailing-zero truncation).
- (-) Requires a resolution step before layout (RLE the per-char array into runs for the paragraph builder).
- **Summary**: Among the systems surveyed, Figma's model appears to have the strongest multiplayer characteristics. The per-character ID approach trades storage compactness for CRDT compatibility.

### 1.5 ProseMirror (schema-driven, tree of nodes + marks)

**Source**: [ProseMirror Guide](https://prosemirror.net/docs/guide/), [ProseMirror Reference](https://prosemirror.net/docs/ref/)

ProseMirror is a widely adopted web-based rich-text editing toolkit. It is included here because it represents a major **editor-native** model in the web ecosystem -- i.e., a model designed from the ground up around the editing lifecycle (selection, input, undo, commands) rather than being primarily a rendering or persistence format.

#### Document model

A ProseMirror document is a **tree of typed nodes**. Each node type is declared in a user-defined **schema** that specifies allowed children, attributes, and how the node maps to/from DOM. Inline content is represented as flat sequences of text and inline nodes under a parent block node; within that sequence, text ranges carry **marks** (bold, italic, link, etc.) rather than being nested elements.

```
doc
 └─ paragraph
      ├─ text "Hello "
      ├─ text "world" [mark: bold]
      └─ text "!"
```

- **Nodes** have a `type`, optional `attrs` (attribute dict), and an ordered list of child nodes.
- **Marks** are annotations on inline text ranges. A mark has a `type` (from the schema) and optional `attrs`. Marks are order-independent and set-like per character position.
- The schema constrains which node types may appear where and which marks are valid on which nodes. This gives the model a degree of structural validation absent from most other systems surveyed here.

#### Editing model (transactions and transforms)

Mutations are expressed as **steps** (atomic operations such as `ReplaceStep`, `AddMarkStep`, `RemoveMarkStep`). Steps compose into **transforms**, and a transform combined with a selection update forms a **transaction**. All document changes flow through this pipeline:

1. Build a `Transaction` from the current `EditorState`.
2. Each step produces a new immutable `Document`.
3. The transaction is dispatched to produce a new `EditorState`.

This explicit transform pipeline enables undo/redo (invert steps), collaborative editing (rebase steps), and change tracking. ProseMirror ships a collaboration module (`prosemirror-collab`) that implements an OT-style rebase against a central authority, though it is not a CRDT.

#### Inline styling: marks vs. attributed-string runs

ProseMirror's marks are structurally similar to attributed-string runs in some respects but differ in important ways:

| Aspect      | ProseMirror marks                                                                                                                      | Attributed-string runs (NSAttributedString-style)                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Granularity | Per-character mark set                                                                                                                 | Per-run attribute dictionary                                            |
| Overlap     | Freely overlapping (bold + italic + link coexist as independent marks)                                                                 | No overlap; each position belongs to exactly one run with a merged dict |
| Storage     | Adjacent text nodes with identical mark sets are joined; a single paragraph's inline content is a flat `Fragment` of `TextNode` slices | Adjacent runs with identical attributes coalesce                        |
| Inheritance | No cascading; marks are explicit per text range                                                                                        | Varies (Apple: none; Flutter: tree cascade)                             |

#### Relevance to this survey

ProseMirror is included because:

1. It is a dominant model for **web-based structured editing** (used by or influencing editors such as Tiptap, Atlassian Editor, the New York Times, and others).
2. Its schema-driven approach demonstrates a middle ground between pure free-form HTML editing and the compact flat-run models used in design tools.
3. Its transform/step pipeline offers an explicit representation of mutations, which is relevant to collaboration -- though it uses OT-style rebasing rather than CRDTs.

**Observations**:

- (+) Schema-driven: the document model is validated by a grammar, reducing invalid states.
- (+) Explicit transform pipeline enables undo, collaboration (OT-based), and change tracking.
- (+) Marks as a set per character position handle overlapping styles naturally.
- (+) Battle-tested at scale in production web editors.
- (-) **Tree-structured**: the document is a node tree, not a flat array. This is well-suited to document editing (paragraphs, lists, headings) but adds structural complexity compared to flat run arrays in a design-tool context.
- (-) Marks carry only lightweight attrs (typically a few fields). Rich per-run style records (dozens of typographic fields like in Figma or the Grida `TextStyleRec`) would require either many fine-grained mark types or mark attrs with complex objects -- neither of which ProseMirror's mark model is primarily optimized for.
- (-) Collaboration is OT-based (central authority rebasing), not CRDT-native. Real-time peer-to-peer sync requires additional infrastructure.
- (-) Serialization format is JSON-based by default; no built-in compact binary format. Not directly FlatBuffers-compatible without a custom mapping layer.
- **Summary**: ProseMirror is the most mature editor-native model in the web ecosystem. Its strengths (schema validation, transform pipeline, mark-based inline styling) are most valuable for document-oriented editors. For a design-tool text model that prioritizes compact flat-run persistence, per-character-level CRDT compatibility, and rich typographic style records, ProseMirror's tree structure and mark granularity represent a different set of trade-offs than the flat run-based or per-character-ID models also surveyed here.

### 1.6 Apple `NSAttributedString` (run-based / RLE)

**Source**: [Apple NSAttributedString](https://developer.apple.com/documentation/foundation/nsattributedstring)

Apple's model: flat `CFString` + **run-length encoded attribute dictionaries**. Each run is `(length, NSDictionary*)`. Runs are non-overlapping, contiguous, covering, and automatically coalesced.

- No inheritance. Each run stores a complete attribute dictionary.
- `NSParagraphStyle` on the first character of a paragraph determines paragraph-level attributes.
- O(log n) lookup via binary search over run boundaries.
- Insert inherits from adjacent character. Delete shortens/removes runs and coalesces.

**Observations**: The longest-running attributed text model in wide production use (in use since the early 1990s in NeXTSTEP, ~30+ years). Direct layout mapping (run = `pushStyle` + `addText`). However, run splits at boundaries create merge conflicts in collaborative editing scenarios.

### 1.7 Android `SpannableStringBuilder` (span-based / interval set)

**Source**: [Android SpannableStringBuilder](https://developer.android.com/reference/android/text/SpannableStringBuilder)

Android stores spans as independent `(start, end, flags, object)` tuples over a gap buffer. Spans **can overlap freely**. Span flags (`INCLUSIVE_EXCLUSIVE`, `EXCLUSIVE_INCLUSIVE`, etc.) control boundary insertion behavior.

**Observations**: Provides maximum flexibility (overlapping spans, per-span insertion policy). Typically has the weakest query performance among the models surveyed (O(n) linear scan, though newer implementations use interval trees). No automatic coalescing. The overlapping span model is generally considered difficult to use in collaborative editing contexts.

### 1.8 Peritext (CRDT for rich text collaboration)

**Source**: [Ink & Switch - Peritext](https://www.inkandswitch.com/peritext/) (CSCW 2022)

Peritext is a CRDT algorithm specifically designed for rich-text collaboration, published as a peer-reviewed paper at CSCW 2022.

**Core idea**: Instead of storing formatting as characters or control codes in the text sequence, Peritext stores formatting as **mark operations** anchored to character IDs:

```
addMark(opId, start: {type, charId}, end: {type, charId}, markType, ...)
removeMark(opId, start: {type, charId}, end: {type, charId}, markType)
```

**Anchor semantics** -- the key innovation of this approach:

- Each character has **two anchor points**: "before" and "after".
- `type: "before"` means the mark starts/ends in the gap _before_ the character.
- `type: "after"` means the mark starts/ends in the gap _after_ the character.
- This controls whether concurrent insertions at boundaries extend the mark or not.

**Mark behavior classification**:
| Mark type | Start anchor | End anchor | Boundary behavior |
|---|---|---|---|
| Bold, italic, etc. | `before` first char | `before` char after last | Grows at end, not at start |
| Link, comment | `before` first char | `after` last char | Does not grow at either end |

**Conflict resolution**:

- **Independent marks** (bold + italic): both apply. No conflict.
- **Exclusive marks** (red vs blue color): last-write-wins using Lamport timestamps.
- **Overlapping same-type**: merged (union of ranges).

**Key properties**:

- Built on any plain text CRDT (RGA, Causal Trees, YATA).
- Operations are **commutative** -- applying in any order converges.
- Tombstones preserve anchor points for deleted characters.
- Per-character metadata: `markOpsBefore` and `markOpsAfter` sets.

**Relevance to a design-tool context**:

- A system that does not require real-time collaboration as a first-class constraint does not need Peritext directly.
- However, any persistent model that aims for future CRDT compatibility should be structurally convertible to Peritext-like anchor semantics.
- Concretely, a run `[start, end)` with style S can be expressed as `addMark(before(char[start]), before(char[end]), S)`, suggesting that run-based models are not inherently incompatible with Peritext if a conversion layer is provided.

---

## 2. Grida current state (implementation context)

> **Note**: This section documents Grida's current implementation as of the time of writing. It is included as context for the research, not as a normative reference. The implementation is under active development and details here may become outdated.

### 2.1 `grida.fbs` -- `TextSpanNode` (current schema)

The current text node in `grida.fbs` is **uniform-style** -- a single style applies to the entire text block.

```fbs
table TextSpanNodeProperties {
  stroke_geometry: StrokeGeometryTrait;
  fill_paints: [PaintStackItem];         // node-level fills (one set for all text)
  stroke_paints: [PaintStackItem];
  text: string;
  text_style: TextStyleRec;             // SINGLE style for entire text
  text_align: TextAlign;
  text_align_vertical: TextAlignVertical;
  max_lines: uint;
  ellipsis: string;
}
```

`TextStyleRec` fields (as currently defined):

| Field                 | ID  | Type                            |
| --------------------- | --- | ------------------------------- |
| `text_decoration`     | 0   | `TextDecorationRec`             |
| `font_family`         | 1   | `string` (required)             |
| `font_size`           | 2   | `float` = 14.0                  |
| `font_weight`         | 3   | `FontWeight` (struct, required) |
| `font_width`          | 4   | `float` = 0.0                   |
| `font_style_italic`   | 5   | `bool` = false                  |
| `font_kerning`        | 6   | `bool` = true                   |
| `font_optical_sizing` | 7   | `FontOpticalSizing` (struct)    |
| `font_features`       | 8   | `[FontFeature]`                 |
| `font_variations`     | 9   | `[FontVariation]`               |
| `letter_spacing`      | 10  | `TextDimension`                 |
| `word_spacing`        | 11  | `TextDimension`                 |
| `line_height`         | 12  | `TextDimension`                 |
| `text_transform`      | 13  | `TextTransform`                 |

**Notable gap in current schema**: `TextStyleRec` does not include `fill` (text color). Fills live on `TextSpanNodeProperties.fill_paints` at the node level. The in-memory `grida-text-edit` crate extends this with per-run `fill: TextFill` and `hyperlink: Option<Hyperlink>`, but these extensions are not reflected in the persistent schema.

### 2.2 Attributed text model (in-memory, not persisted)

The `docs/wg/feat-text-editing/attributed-text.md` spec defines an in-memory model:

```
AttributedText = (text: String, default_style: TextStyle, paragraph_style: ParagraphStyle, runs: Vec<StyledRun>)
StyledRun = { start: u32, end: u32, style: TextStyle }
```

With 7 strict invariants (non-empty, coverage, contiguity, non-degenerate, maximality, boundary alignment, monotonicity).

The `TextStyle` in this in-memory model extends `TextStyleRec` with:

- `fill: TextFill` (solid color; with future gradient/pattern noted as possible)
- `hyperlink: Option<Hyperlink>` (url, open_in_new_tab)

**Current state of integration**: This rich attributed text model exists in Rust memory during WASM-based editing but collapses to a uniform style on commit back to the TypeScript document model. Per-run styling is not currently persisted.

### 2.3 TypeScript document model (current)

```typescript
type TextSpanNode = {
  type: "tspan";
  text: string;
  // ... ITextNodeStyle (single uniform style) ...
  // ... ITextStroke ...
  max_lines?: number;
};
```

No per-range styling in the current persisted TypeScript model.

---

## 3. Property universe (superset across surveyed systems)

This section catalogs the **union** of all per-run-capable properties observed across the systems surveyed in Section 1. It serves as a reference for what a comprehensive rich text model could represent.

### 3.1 Run-level properties (per character range)

The "Grida (current)" column reflects the state documented in Section 2 and may change independently.

| Property                      | Grida (current)                    | Figma                                        | CSS                         | SVG                       | Flutter               | Notes                                |
| ----------------------------- | ---------------------------------- | -------------------------------------------- | --------------------------- | ------------------------- | --------------------- | ------------------------------------ |
| **font_family**               | `TextStyleRec.font_family`         | `fontName.family`                            | `font-family`               | `font-family`             | `fontFamily`          | Required in all systems              |
| **font_size**                 | `TextStyleRec.font_size`           | `fontSize`                                   | `font-size`                 | `font-size`               | `fontSize`            | px                                   |
| **font_weight**               | `TextStyleRec.font_weight`         | `fontWeight` (int)                           | `font-weight` (1-1000)      | `font-weight`             | `fontWeight`          | CSS-compatible numeric               |
| **font_width**                | `TextStyleRec.font_width`          | via `fontVariations`                         | `font-stretch`              | `font-stretch`            | via `fontVariations`  | CSS font-stretch %                   |
| **font_style_italic**         | `TextStyleRec.font_style_italic`   | `italic` (bool)                              | `font-style`                | `font-style`              | `fontStyle`           | bool or enum                         |
| **font_kerning**              | `TextStyleRec.font_kerning`        | implicit                                     | `font-kerning`              | `kerning`                 | N/A                   | bool                                 |
| **font_optical_sizing**       | `TextStyleRec.font_optical_sizing` | implicit                                     | `font-optical-sizing`       | N/A                       | N/A                   | Auto/None/Fixed                      |
| **font_features**             | `TextStyleRec.font_features`       | `toggledOnOTFeatures`/`toggledOffOTFeatures` | `font-feature-settings`     | `font-feature-settings`   | `fontFeatures`        | OpenType tag + value                 |
| **font_variations**           | `TextStyleRec.font_variations`     | `fontVariations`                             | `font-variation-settings`   | `font-variation-settings` | `fontVariations`      | axis + value                         |
| **letter_spacing**            | `TextStyleRec.letter_spacing`      | `letterSpacing`                              | `letter-spacing`            | `letter-spacing`          | `letterSpacing`       | px or factor                         |
| **word_spacing**              | `TextStyleRec.word_spacing`        | N/A                                          | `word-spacing`              | `word-spacing`            | `wordSpacing`         | px or factor                         |
| **line_height**               | `TextStyleRec.line_height`         | `lineHeight` (Number)                        | `line-height`               | `line-height`             | `height` (multiplier) | Normal/Fixed/Factor                  |
| **text_decoration_line**      | `TextDecorationRec`                | `textDecoration`                             | `text-decoration-line`      | `text-decoration`         | `decoration`          | none/underline/overline/line-through |
| **text_decoration_style**     | `TextDecorationRec`                | `textDecorationStyle`                        | `text-decoration-style`     | N/A                       | `decorationStyle`     | solid/double/dotted/dashed/wavy      |
| **text_decoration_color**     | `TextDecorationRec`                | `textDecorationFillPaints`                   | `text-decoration-color`     | `text-decoration-fill`    | `decorationColor`     | RGBA or Paint                        |
| **text_decoration_thickness** | `TextDecorationRec`                | `textDecorationThickness`                    | `text-decoration-thickness` | N/A                       | `decorationThickness` | px or %                              |
| **text_decoration_skip_ink**  | `TextDecorationRec`                | `textDecorationSkipInk`                      | `text-decoration-skip-ink`  | N/A                       | N/A                   | bool                                 |
| **text_transform**            | `TextStyleRec.text_transform`      | `textCase`                                   | `text-transform`            | `text-transform`          | N/A                   | none/upper/lower/capitalize          |
| **fill**                      | Not in schema (node-level only)    | `fillPaints` (per-char via override)         | `color`                     | `fill`                    | `foreground` (Paint)  | Per-run text color                   |
| **hyperlink**                 | Not in persistent schema           | `hyperlink`                                  | N/A (DOM `<a>`)             | N/A                       | N/A                   | url + open_in_new_tab                |

**Additional properties observed in Figma but not currently in Grida's schema**:

| Property                     | Figma field                        | CSS equivalent              | Notes                                   |
| ---------------------------- | ---------------------------------- | --------------------------- | --------------------------------------- |
| `text_underline_offset`      | `textUnderlineOffset`              | `text-underline-offset`     | Decoration refinement                   |
| `leading_trim`               | `leadingTrim`                      | `text-box-trim` (CSS draft) | Leading control                         |
| `font_variant_*` (11 fields) | `fontVariantCommonLigatures`, etc. | `font-variant-*`            | Fine-grained OpenType control           |
| `semantic_weight`            | `semanticWeight`                   | N/A                         | Editor hint for style override tracking |
| `semantic_italic`            | `semanticItalic`                   | N/A                         | Editor hint for style override tracking |

### 3.2 Paragraph-level properties (per text block)

| Property              | Grida (current)                              | Figma                  | CSS                      |
| --------------------- | -------------------------------------------- | ---------------------- | ------------------------ |
| `text_align`          | `TextSpanNodeProperties.text_align`          | `textAlignHorizontal`  | `text-align`             |
| `text_align_vertical` | `TextSpanNodeProperties.text_align_vertical` | `textAlignVertical`    | N/A (layout)             |
| `max_lines`           | `TextSpanNodeProperties.max_lines`           | `maxLines`             | `-webkit-line-clamp`     |
| `ellipsis`            | `TextSpanNodeProperties.ellipsis`            | `textTruncation`       | `text-overflow`          |
| `paragraph_spacing`   | Not in current schema                        | `paragraphSpacing`     | `margin-bottom` on `<p>` |
| `paragraph_indent`    | Not in current schema                        | `paragraphIndent`      | `text-indent`            |
| `paragraph_direction` | Not in current schema                        | `sourceDirectionality` | `direction`              |

### 3.3 Line-level properties (observed in Figma)

| Property            | Figma                                                         | Notes                    |
| ------------------- | ------------------------------------------------------------- | ------------------------ |
| `line_type`         | `PLAIN`/`ORDERED_LIST`/`UNORDERED_LIST`/`BLOCKQUOTE`/`HEADER` | Block-level structure    |
| `indentation_level` | int                                                           | List nesting             |
| `list_spacing`      | `listSpacing`                                                 | Space between list items |

These represent block-level structure. Whether and how to support them is a separate design question; they are recorded here for completeness.

---

## 4. Architecture comparison matrix

This matrix compares the structural approaches from Section 1 across key dimensions. The "Run-based candidate" column reflects the direction that appears most aligned with the constraints in the Purpose section, but is included for comparison, not as a committed choice.

| Dimension                | Apple (runs)             | Android (spans)      | Flutter (tree)         | ProseMirror (schema tree + marks) | Figma (per-char IDs)        | Peritext (CRDT marks)   | Run-based candidate                                                    |
| ------------------------ | ------------------------ | -------------------- | ---------------------- | --------------------------------- | --------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| **Topology**             | Flat run array           | Flat interval set    | Immutable tree         | Schema-constrained node tree      | Flat char array + table     | Mark ops on char IDs    | Flat run array (storage), convertible to per-char IDs at sync boundary |
| **Overlap**              | No                       | Yes                  | No (hierarchy)         | Yes (marks are independent sets)  | No                          | Yes (marks)             | No (resolved runs)                                                     |
| **Style lookup**         | O(log k)                 | O(n) or O(log n+k)   | O(depth)               | O(marks at position)              | O(1)                        | O(marks at position)    | O(log k) in-memory                                                     |
| **Insert**               | Inherits adjacent        | Controlled by flags  | Rebuild tree           | Schema-dependent (storedMarks)    | Inherits base (ID 0)        | Anchor semantics        | Inherits upstream (caret style)                                        |
| **Coalescing**           | Automatic                | None                 | N/A                    | Adjacent same-mark texts joined   | N/A (no runs)               | N/A                     | Automatic                                                              |
| **Inheritance**          | None                     | None                 | Tree merge             | None (marks explicit per range)   | Two-level (base + override) | None (mark union)       | Two-level (default + run override)                                     |
| **Multiplayer**          | Poor                     | Poor                 | Poor                   | Moderate (OT-based collab)        | Excellent                   | Excellent               | Dependent on sync layer design                                         |
| **Memory (uniform)**     | 1 run                    | 0 spans              | 1 node                 | 1 text node                       | n integers                  | 0 marks                 | 0 runs (delta encoded = empty)                                         |
| **Memory (k styles)**    | k runs                   | k spans              | tree nodes             | k text node slices + marks        | n integers + k entries      | 2k mark ops             | k runs                                                                 |
| **Layout mapping**       | Direct (run = push+text) | Resolve then push    | DFS produces push+text | Walk fragment, push mark ranges   | Resolve per-char then RLE   | Resolve marks then push | Direct (run = push+text)                                               |
| **FlatBuffers friendly** | Yes (table array)        | Possible but complex | No (recursive)         | No (tree + JSON default)          | Yes (vector + table array)  | Complex (op log)        | Yes (table array)                                                      |

---

## 5. CRDT compatibility analysis

### 5.1 Trade-offs of run-based models for CRDT

The `attributed-text.md` spec documents several arguments favoring a run-based in-memory model:

1. Direct layout mapping (run = `pushStyle` + `addText`).
2. Minimal memory for typical design text (run count proportional to style transitions, not character count).
3. Automatic normalization via coalescing invariant.
4. Well-understood editing algebra (split, shift, coalesce).

However, run-based models are not natively CRDT-friendly: run splits at boundaries create merge conflicts when two users concurrently modify adjacent ranges. This is a known limitation of `NSAttributedString`-style models in collaborative contexts.

### 5.2 Strategies for CRDT compatibility

Three strategies for bridging a run-based model to collaborative editing have been identified:

**Strategy A: Convert at sync boundary**

Store resolved runs on disk and in memory. At the sync layer, convert to a per-character representation for collaboration:

```
// Write path (local -> sync)
for each run in runs:
    for each char in run.start..run.end:
        sync_char_style[char] = run.style_id

// Read path (sync -> local)
runs = RLE(sync_char_styles)
```

- (+) Storage-compact for non-collaborative use.
- (+) Direct layout mapping without resolution step.
- (-) Adds a conversion layer at the sync boundary.
- (-) Conversion fidelity depends on correct handling of grapheme boundaries and concurrent edits.

**Strategy B: Figma-style per-character ID array**

Store `characterStyleIDs: uint[]` + `styleOverrideTable: TextStyleRec[]` on disk. Resolve to runs at load time.

- (+) Trivially CRDT-compatible (per-character granularity matches multiplayer sync).
- (-) Per-character storage cost for uniform text.
- (-) Requires resolution step before layout.

**Strategy C: Peritext mark operations**

Store an operation log of `addMark` / `removeMark` with anchor semantics.

- (+) Handles all edge cases correctly (bold at boundaries, links, overlapping marks, etc.).
- (-) Requires an operation log (not just current state), adding complexity.
- (-) Likely more than needed for a system that does not require real-time multiplayer as an initial capability.

**Analysis**: Strategy A appears to offer a favorable trade-off for a system that prioritizes storage compactness and direct layout mapping initially, with collaboration added later. Strategy B is proven at scale by Figma. Strategy C is the most theoretically rigorous but carries the highest implementation cost. These are not mutually exclusive -- a system could start with A and migrate toward B or C at the sync boundary. The choice depends on how heavily multiplayer collaboration weighs against other constraints.

### 5.3 Structural requirements for future CRDT compatibility

Regardless of which strategy is ultimately chosen, the following structural properties appear important for maintaining future CRDT compatibility:

1. Run offsets should be convertible to character positions (grapheme-aware).
2. Style identity should be structural (field-by-field equality), not pointer-based, to enable deduplication.
3. The default-style + override pattern maps naturally to Figma's style ID table approach.
4. Reserving an optional `character_style_ids`-like field in the schema could provide a forward-compatible extension point for per-character sync formats.

---

## 6. Candidate persistent model sketch (illustrative)

> **Note**: This section presents an **illustrative schema sketch** derived from the research above. It is intended to explore what a FlatBuffers-based rich text model could look like given the constraints and trade-offs identified. It is not a committed design.

### 6.1 Candidate types

```fbs
// --- Illustrative: Rich text fill for per-run color ---
table TextFillRec {
    paint: Paint (id: 0);    // reuses existing Paint union
}

// --- Illustrative: Hyperlink for per-run links ---
table HyperlinkRec {
    url: string (id: 0);
    open_in_new_tab: bool = false (id: 1);
}

// --- Illustrative: Styled run ---
table RichTextRun {
    /// Start byte offset (UTF-8, inclusive).
    start: uint32 (id: 0);
    /// End byte offset (UTF-8, exclusive).
    end: uint32 (id: 1);
    /// Style override. If null, inherits from default_style.
    style: TextStyleRec (id: 2);
    /// Per-run fill override. If null, inherits from default fill.
    fill: TextFillRec (id: 3);
    /// Per-run hyperlink. If null, no link.
    hyperlink: HyperlinkRec (id: 4);
}

// --- Illustrative: Paragraph style (grouped) ---
table ParagraphStyleRec {
    text_align: TextAlign = Left (id: 0);
    text_align_vertical: TextAlignVertical = Top (id: 1);
    paragraph_direction: ubyte = 0 (id: 2);   // 0=LTR, 1=RTL, 2=Auto
    max_lines: uint32 (id: 3);                // 0 = unlimited
    ellipsis: string (id: 4);
    text_indent: float = 0.0 (id: 5);
    paragraph_spacing: float = 0.0 (id: 6);
}

// --- Illustrative: Rich text node properties ---
table RichTextNodeProperties {
    stroke_geometry: StrokeGeometryTrait;
    /// Default fills (applied to runs without fill override).
    fill_paints: [PaintStackItem];
    stroke_paints: [PaintStackItem];
    /// The backing text string. Newlines normalized to LF.
    text: string;
    /// Default style (base for delta encoding).
    default_style: TextStyleRec;
    /// Paragraph-level style.
    paragraph_style: ParagraphStyleRec;
    /// Ordered runs. If empty, entire text uses default_style.
    /// Invariant: runs are contiguous, non-overlapping, and cover the full text.
    runs: [RichTextRun];
    /// Possible future extension: per-character style IDs for CRDT sync.
    // character_style_ids: [uint32];   // not yet specified
}
```

### 6.2 Design reasoning behind this sketch

| Choice                                  | Reasoning                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runs, not per-char IDs**              | More compact for typical design text (k runs vs n integers). Direct layout mapping without resolution step. Trade-off: less natively CRDT-friendly.                                                                                                                                                                                                   |
| **Delta encoding**                      | `null` style on run = inherit default. Single-style text = empty `runs` vector. Minimizes wire size for the common case.                                                                                                                                                                                                                              |
| **`fill` separate from `TextStyleRec`** | `TextStyleRec` is currently reused in multiple contexts. Adding `Paint` (a union with 6 variants) to it could affect all uses. Keeping fill as a separate field on the run avoids this. This is a design trade-off, not a settled decision -- the alternative (embedding fill in `TextStyleRec`) has the advantage of keeping one unified style type. |
| **`hyperlink` separate**                | Same reasoning as fill. Not all runs have links.                                                                                                                                                                                                                                                                                                      |
| **`ParagraphStyleRec` grouped**         | Paragraph-level properties are currently scattered across the node. Grouping them could enable cleaner separation and future per-paragraph styling.                                                                                                                                                                                                   |
| **UTF-8 byte offsets**                  | Matches Rust native indexing. `u32` aligns with FlatBuffers' natural integer width and Skia's internal `int32_t` text indices. Conversion to UTF-16 happens at the layout boundary.                                                                                                                                                                   |
| **Reserved `character_style_ids`**      | Forward-compatible extension point for CRDT sync, without committing to an implementation now.                                                                                                                                                                                                                                                        |

### 6.3 Approximate serialization size comparison

These are rough estimates for a 500-character paragraph with 5 style changes, intended to illustrate the order-of-magnitude difference between approaches:

| Model                                       | Approximate size                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| **Per-char ID approach (Figma-style)**      | 500 x 4 = 2,000 bytes (IDs) + 5 x ~200 = 1,000 bytes (overrides) = ~3,000 bytes |
| **Run-based with delta encoding (5 runs)**  | 5 x (8 + ~200) = ~1,040 bytes (runs) + ~200 bytes (default) = ~1,240 bytes      |
| **Run-based with delta encoding (uniform)** | 0 bytes (runs) + ~200 bytes (default) = ~200 bytes                              |

The per-character ID approach has a fixed per-character cost that the run-based approach avoids for uniformly-styled text. The actual sizes depend on the specific fields populated in each style record.

---

## 7. Implications if a run-based direction is adopted

> **Note**: This section explores what adoption of the candidate direction from Section 6 would entail. It is speculative and contingent on design decisions not yet made.

### 7.1 Backward compatibility considerations

- The existing `TextSpanNode` could remain valid with no breaking change.
- A new node type or an optional `runs` extension to the existing properties could be additive.
- A `TextSpanNode` without runs would be equivalent to a rich text node with an empty `runs` vector (single-style text).

### 7.2 Figma import path

If a run-based model is adopted, Figma `TextData` could be converted via RLE of the per-character style ID array:

```
default_style = figma.base_style
runs = RLE(figma.characterStyleIDs, figma.styleOverrideTable)
// RLE: group consecutive characters with same style ID into runs
```

### 7.3 Export to code (CSS/Flutter)

A run-based model maps naturally to Flutter's `TextSpan` tree:

```
TextSpan(
  style: default_style.to_flutter(),
  children: runs.map(|r| TextSpan(
    text: text[r.start..r.end],
    style: r.style.to_flutter()
  ))
)
```

---

## 8. Open questions

1. **New node type vs. extension of `TextSpanNode`?**
   - New type: cleaner separation, no ambiguity. But two text node types in the union.
   - Extension: add optional `runs` to `TextSpanNodeProperties`. When `runs` is present, `text_style` becomes the default style. When absent, backward compatible.
   - No decision has been made.

2. **Should `TextStyleRec` gain `fill` and `hyperlink` fields, or should they remain separate?**
   - Separate: avoids bloating existing uses of `TextStyleRec`.
   - Embedded: simpler (one type for all style properties), matches the in-memory `TextStyle` struct.
   - This is a trade-off between type simplicity and separation of concerns.

3. **Line-level properties (list type, indentation)?**
   - Not needed initially. The schema should leave room for future extension (optional field IDs or a separate vector).

4. **Font postscript name in FBS?**
   - Exists in the TypeScript model (`font_postscript_name`) but not in the current FBS schema. Whether to add it to `TextStyleRec` is an open question.

5. **`max_length` for form fields?**
   - Exists in the TypeScript model (`ITextValue.max_length`) but not in the current FBS schema. This is likely a node/form-layer concern rather than a text style property.

6. **Run-based vs. per-character ID as the primary on-disk format?**
   - Section 5 analyzes the trade-offs. The choice depends on how heavily multiplayer collaboration weighs against storage compactness and layout directness. Both are viable; hybrid approaches are possible.

---

## 9. References

### Internal (Grida repository)

> These reference the Grida codebase and may change independently of this document.

- [Text Editing Manifesto](./index.md)
- [Attributed Text Data Model](./attributed-text.md)
- [Performance Model](./impl-performance.md)
- [Paragraph Feature Roadmap](/docs/wg/feat-paragraph/index.md)
- [FlatBuffers Schema](/format/grida.fbs)
- [Figma Kiwi Schema Reference](/.ref/figma/fig.kiwi)
- [Figma Kiwi Glossary](/docs/wg/feat-fig/glossary/fig.kiwi.md)
- [OpenType Features Reference](/docs/reference/open-type-features.md)
- [OpenType Variable Axes Reference](/docs/reference/open-type-variable-axes.md)
- [Italic Reference](/docs/reference/italic.md)

### External

- [W3C SVG 2 Text](https://www.w3.org/TR/SVG2/text.html) -- SVG `<text>` and `<tspan>` specification
- [CSS Text Module Level 3](https://www.w3.org/TR/css-text-3/) -- letter-spacing, word-spacing, text-transform, text-align
- [CSS Text Decoration Level 4](https://www.w3.org/TR/css-text-decor-4/) -- underline, overline, line-through, decoration style/color/thickness
- [CSS Fonts Module Level 4](https://www.w3.org/TR/css-fonts-4/) -- font-weight, font-style, font-stretch, font-feature-settings, font-variation-settings
- [CSS Writing Modes Level 4](https://www.w3.org/TR/css-writing-modes-4/) -- writing-mode, direction, unicode-bidi
- [Flutter TextSpan](https://api.flutter.dev/flutter/painting/TextSpan-class.html) -- immutable tree model
- [Flutter TextStyle](https://api.flutter.dev/flutter/painting/TextStyle-class.html) -- per-run property set
- [Skia ParagraphBuilder](https://api.skia.org/classskia_1_1textlayout_1_1ParagraphBuilder.html) -- pushStyle/addText layout API
- [Figma REST API `@figma/rest-api-spec`](https://www.npmjs.com/package/@figma/rest-api-spec) -- TypeStyle, TextNode types
- [Apple NSAttributedString](https://developer.apple.com/documentation/foundation/nsattributedstring) -- run-based model
- [Android SpannableStringBuilder](https://developer.android.com/reference/android/text/SpannableStringBuilder) -- span-based model
- [ProseMirror Guide](https://prosemirror.net/docs/guide/) -- schema-driven document model, transforms, marks
- [ProseMirror Reference Manual](https://prosemirror.net/docs/ref/) -- API reference for `prosemirror-model`, `prosemirror-transform`, `prosemirror-collab`
- [Peritext: A CRDT for Rich-Text Collaboration](https://www.inkandswitch.com/peritext/) (Ink & Switch, CSCW 2022) -- CRDT mark operations with anchor semantics
- [FlatBuffers Schema Evolution](https://flatbuffers.dev/flatbuffers_guide_writing_schema.html)
- [Unicode Text Segmentation (UAX#29)](https://www.unicode.org/reports/tr29/)
- [Unicode Bidirectional Algorithm (UAX#9)](https://www.unicode.org/reports/tr9/)
