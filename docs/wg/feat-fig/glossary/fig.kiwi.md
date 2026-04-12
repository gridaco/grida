---
title: Kiwi Schema for .fig Format
tags:
  - internal
  - wg
  - figma
  - format-schema
---

# Kiwi Schema for .fig Format

## Overview

Kiwi is a schema-based binary encoding protocol created by Evan Wallace. It's similar to Protocol Buffers but simpler and more lightweight. Figma uses Kiwi to encode their `.fig` file format and clipboard payloads.

## Schema Definition

The Kiwi schema defines the structure of all node types, properties, and data structures used in Figma files. The schema includes:

- **Enums** - NodeType, BlendMode, PaintType, TextCase, etc.
- **Structs** - Fixed-size data structures
- **Messages** - Variable-size data structures with optional fields

## Schema Reference

The complete Kiwi schema definition for the `.fig` format is maintained in the repository:

[**fig.kiwi** - Complete Kiwi schema definition][fig.kiwi-snapshot]

> **Note:** This permalink is a snapshot from December 2025. The schema may evolve as Figma updates their format. For the latest version, see [/.ref/figma/fig.kiwi][fig.kiwi-latest].

This schema is extracted from real `.fig` files using our [fig2kiwi.ts][fig2kiwi-snapshot] tool.

## Key Schema Elements

### Node Types

The schema defines over 50 node types, including:

- Basic: `DOCUMENT`, `CANVAS`, `FRAME`, `GROUP`
- Shapes: `VECTOR`, `STAR`, `LINE`, `ELLIPSE`, `RECTANGLE`, `REGULAR_POLYGON`, `ROUNDED_RECTANGLE`, `BOOLEAN_OPERATION`
- Content: `TEXT`, `INSTANCE`, `SYMBOL`, `SLICE`
- Modern: `SECTION`, `SECTION_OVERLAY`, `WIDGET`, `CODE_BLOCK`, `TABLE`, `TABLE_CELL`
- Variables: `VARIABLE`, `VARIABLE_SET`, `VARIABLE_OVERRIDE`
- Slides: `SLIDE`, `SLIDE_GRID`, `SLIDE_ROW`
- Code: `CODE_COMPONENT`, `CODE_INSTANCE`, `CODE_LIBRARY`, `CODE_FILE`, `CODE_LAYER`
- Other: `STICKY`, `SHAPE_WITH_TEXT`, `CONNECTOR`, `STAMP`, `MEDIA`, `HIGHLIGHT`, `WASHI_TAPE`, `ASSISTED_LAYOUT`, `INTERACTIVE_SLIDE_ELEMENT`, `MODULE`, `RESPONSIVE_SET`, `TEXT_PATH`, `BRUSH`, `MANAGED_STRING`, `TRANSFORM`, `CMS_RICH_TEXT`, `REPEATER`, `JSX`, `EMBEDDED_PROTOTYPE`, `REACT_FIBER`, `RESPONSIVE_NODE_SET`, `WEBPAGE`, `KEYFRAME`, `KEYFRAME_TRACK`, `ANIMATION_PRESET_INSTANCE`

### Paint Types

- `SOLID` - Solid color fill
- `GRADIENT_LINEAR`, `GRADIENT_RADIAL`, `GRADIENT_ANGULAR`, `GRADIENT_DIAMOND`
- `IMAGE`, `VIDEO`, `PATTERN`, `NOISE`

### Effect Types

- `DROP_SHADOW`, `INNER_SHADOW`
- `BACKGROUND_BLUR`, `FOREGROUND_BLUR`
- `GRAIN`, `NOISE`, `GLASS`

### Layout & Constraints

- `LayoutGridType`, `LayoutGridPattern`
- `ConstraintType` - MIN, CENTER, MAX, STRETCH, SCALE
- `LayoutMode` - NONE, HORIZONTAL, VERTICAL
- Auto-layout properties with padding, spacing, and alignment

## Studied Properties

Properties we've analyzed and documented from the Kiwi schema:

| Property                        | Type                              | Location                                                | Purpose                                | Usage                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------- | ------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parentIndex`                   | `ParentIndex`                     | `NodeChange.parentIndex`                                | Parent-child relationship and ordering | Contains `guid` (parent reference) and `position` (fractional index for ordering)                                                                                                                                |
| `parentIndex.position`          | `string`                          | `ParentIndex.position`                                  | Fractional index string for ordering   | Lexicographically sortable string (e.g., `"!"`, `"Qd&"`, `"QeU"`)                                                                                                                                                |
| `sortPosition`                  | `string?`                         | `NodeChange.sortPosition`                               | Alternative ordering field             | Typically `undefined` for CANVAS nodes, may be used for other node types                                                                                                                                         |
| `frameMaskDisabled`             | `boolean?`                        | `NodeChange.frameMaskDisabled`                          | Frame clipping mask setting            | `true` = clipping disabled (no clip), `false` = clipping enabled (with clip), `undefined` = default (clipping enabled). `false` for GROUP-originated FRAMEs, `true` for regular FRAMEs without clipping          |
| `resizeToFit`                   | `boolean?`                        | `NodeChange.resizeToFit`                                | Auto-resize to fit content             | `true` for GROUP-originated FRAMEs, `undefined` for real FRAMEs                                                                                                                                                  |
| `fillPaints`                    | `Paint[]?`                        | `NodeChange.fillPaints`                                 | Fill paint array                       | Empty/undefined for GROUPs, may exist for FRAMEs (used in GROUP detection)                                                                                                                                       |
| `strokePaints`                  | `Paint[]?`                        | `NodeChange.strokePaints`                               | Stroke paint array                     | Empty/undefined for GROUPs, may exist for FRAMEs (used in GROUP detection)                                                                                                                                       |
| `backgroundPaints`              | `Paint[]?`                        | `NodeChange.backgroundPaints`                           | Background paint array                 | Empty/undefined for GROUPs, may exist for FRAMEs (used in GROUP detection)                                                                                                                                       |
| `isStateGroup`                  | `boolean?`                        | `NodeChange.isStateGroup`                               | Indicates state group/component set    | `true` for component set FRAMEs, `undefined` for regular FRAMEs                                                                                                                                                  |
| `componentPropDefs`             | `ComponentPropDef[]?`             | `NodeChange.componentPropDefs`                          | Component property definitions         | Present on component set FRAMEs, defines variant properties                                                                                                                                                      |
| `stateGroupPropertyValueOrders` | `StateGroupPropertyValueOrder[]?` | `NodeChange.stateGroupPropertyValueOrders`              | Variant property value orders          | Present on component set FRAMEs, defines order of variant values                                                                                                                                                 |
| `variantPropSpecs`              | `VariantPropSpec[]?`              | `NodeChange.variantPropSpecs`                           | Variant property specifications        | Present on SYMBOL nodes that are part of component sets, absent on standalone SYMBOLs                                                                                                                            |
| `fontName`                      | `FontName?`                       | `NodeChange.fontName`                                   | Primary font reference                 | Contains `family`, `style`, `postscript`. See [Text & Font](#text--font): `style` is human-readable (e.g. "Regular", "Bold Italic"), not CSS. Prefer `fontMetaData` for import.                                  |
| `fontMetaData`                  | `FontMetaData[]?`                 | `TextData.fontMetaData`, `DerivedTextData.fontMetaData` | Canonical font style per text run      | **Authoritative** for `fontWeight` and `fontStyle` (NORMAL/ITALIC). Aligns with Figma REST API. See [Text & Font](#text--font).                                                                                  |
| `slideSpeakerNotes`             | `string?`                         | `NodeChange.slideSpeakerNotes`                          | Slide speaker notes                    | Present on SLIDE nodes in `.deck` files. Free-text presentation notes.                                                                                                                                           |
| `isSkippedSlide`                | `boolean?`                        | `NodeChange.isSkippedSlide`                             | Skip slide in presentation             | `true` = slide is skipped during playback; `undefined` = included.                                                                                                                                               |
| `pageType`                      | `EditorType?`                     | `NodeChange.pageType`                                   | Editor mode for a CANVAS page          | `SLIDES` (`2`) for Figma Slides pages. See [Slides / Deck format](#slides--deck-format).                                                                                                                         |
| `overrideKey`                   | `GUID?`                           | `NodeChange.overrideKey`                                | Stable child identity for overrides    | Present on nodes inside SYMBOL definitions. Used by `symbolOverrides.guidPath` to address children across instance boundaries. NOT the same as the node's `guid`. See [Instance Overrides](#instance-overrides). |
| `symbolData`                    | `SymbolData?`                     | `NodeChange.symbolData`                                 | Instance/component linkage             | On INSTANCE nodes: contains `symbolID` (→ SYMBOL.guid), `symbolOverrides`, `uniformScaleFactor`. See [Instance Overrides](#instance-overrides).                                                                  |
| `derivedSymbolData`             | `NodeChange[]?`                   | `NodeChange.derivedSymbolData`                          | Resolved instance child properties     | Figma-computed resolved properties for each addressable descendant. Indexed by `guidPath`. Contains resolved sizes, transforms, etc.                                                                             |
| `variableDataValues`            | `VariableDataValues?`             | `NodeChange.variableDataValues`                         | Variable value storage                 | On VARIABLE nodes: contains `entries[]` with per-mode values. See [Variables](#variables).                                                                                                                       |
| `key`                           | `string?`                         | `NodeChange.key`                                        | Variable/component publish key         | A 40-character hex hash. On VARIABLE nodes: used as the stable reference key for `colorVar.value.alias.assetRef.key`. On SYMBOL nodes: the component's publish key.                                              |
| `colorVar`                      | `VariableData?`                   | `Paint.colorVar`                                        | Variable binding on a paint color      | When present, the paint's static `color` field is the fallback; the actual color should be resolved from the referenced variable. See [Variables](#variables).                                                   |
| `fillGeometry`                  | `Path[]?`                         | `NodeChange.fillGeometry`                               | Pre-baked fill path commands           | Array of SVG-like path data for the node's fill geometry. Each entry has `commandsBlob` (blob ID), `windingRule`, and `styleID`. Preferred over `vectorNetworkBlob` for rendering compound shapes.               |
| `strokeGeometry`                | `Path[]?`                         | `NodeChange.strokeGeometry`                             | Pre-baked stroke path commands         | Same structure as `fillGeometry` but for strokes. Contains the expanded stroke outline, not the center line.                                                                                                     |
| `Paint.transform`               | `Matrix?`                         | `Paint.transform`                                       | Gradient paint transform               | 2x3 affine mapping FROM node space TO gradient space (inverse of REST `gradientHandlePositions`). See [Gradient Paint Transform](#gradient-paint-transform).                                                     |

### parentIndex

**Structure:**

```typescript
interface ParentIndex {
  guid: GUID; // Parent node's GUID
  position: string; // Fractional index string for ordering
}
```

**Key Finding:** CANVAS nodes (pages) use `parentIndex.position` for ordering, **not** `sortPosition`.

**Usage:**

- **Page Ordering:** CANVAS nodes use `parentIndex.position` to determine their order within the document
- **Child Ordering:** All child nodes use `parentIndex.position` to determine their order within their parent
- **Parent Reference:** The `guid` field references the parent node's GUID

**Fractional Index Strings:**

Figma uses **fractional indexing** (also known as "orderable strings") for maintaining order in collaborative systems:

- Allows insertion between items without renumbering
- Strings are designed to sort correctly when compared lexicographically
- Examples: `"!"`, `" ~\"`, `"Qd&"`, `"QeU"`, `"Qe7"`, `"QeO"`, `"Qf"`, `"Qi"`, `"Qir"`
- These are **not** numeric values - they're special strings optimized for lexicographic sorting

**Implementation:**

```typescript
// Sort pages by parentIndex.position (codepoint comparison)
const sortedPages = canvasNodes.sort((a, b) => {
  const aPos = a.parentIndex?.position ?? "";
  const bPos = b.parentIndex?.position ?? "";
  return aPos < bPos ? -1 : aPos > bPos ? 1 : 0;
});

// Sort children by parentIndex.position
const sortedChildren = children.sort((a, b) => {
  const aPos = a.parentIndex?.position ?? "";
  const bPos = b.parentIndex?.position ?? "";
  return aPos < bPos ? -1 : aPos > bPos ? 1 : 0;
});
```

**Important:** Use **codepoint comparison** (`< >`), **not** `localeCompare()`. Figma's fractional index strings use ASCII characters including punctuation (`"`, `#`, `$`, `%`, `&`, `'`, etc.) whose ordering must match raw codepoint values. `localeCompare()` applies locale-aware collation that scrambles these characters — particularly visible in `.deck` files where single-character position strings are common.

### sortPosition

**Type:** `string | undefined`

**Location:** `NodeChange.sortPosition`

**Usage:** The `sortPosition` field exists on `NodeChange` but is typically `undefined` for CANVAS nodes. It may be used for other node types or specific contexts. For page ordering, use `parentIndex.position` instead.

### GROUP vs FRAME Detection

**Critical Finding:** Figma converts GROUP nodes to FRAME nodes in both clipboard payloads and `.fig` files. This means:

- **No `GROUP` node type exists** in parsed data - all groups are stored as `FRAME` nodes
- The original group name is preserved in the `name` field
- We can detect GROUP-originated FRAMEs using specific property combinations

**Detection Properties:**

| Property            | Real FRAME  | GROUP-originated FRAME | Reliability          |
| ------------------- | ----------- | ---------------------- | -------------------- |
| `frameMaskDisabled` | `true`      | `false`                | ✅ Reliable          |
| `resizeToFit`       | `undefined` | `true`                 | ⚠️ Check with paints |
| `fillPaints`        | May exist   | `undefined` or `[]`    | ✅ Safety check      |
| `strokePaints`      | May exist   | `undefined` or `[]`    | ✅ Safety check      |
| `backgroundPaints`  | May exist   | `undefined` or `[]`    | ✅ Safety check      |

**Note on `frameMaskDisabled` semantics:**

- `frameMaskDisabled: true` = clipping is **disabled** (no clip)
- `frameMaskDisabled: false` = clipping is **enabled** (with clip)
- `frameMaskDisabled: undefined` = default behavior (clipping **enabled**)

**Observed values:**

- Regular FRAMEs (without clipping) typically have `frameMaskDisabled: true` (clipping disabled)
- FRAMEs with clipping enabled have `frameMaskDisabled: false` (clipping enabled)
- GROUP-originated FRAMEs have `frameMaskDisabled: false` (but can be distinguished by `resizeToFit: true` and lack of paints)
- When `frameMaskDisabled` is `undefined`, the default behavior is clipping **enabled** (maps to `clipsContent: true`)

**Note:** The property name is counterintuitive - `frameMaskDisabled: true` means the mask (clipping) is disabled, not that the frame is disabled.

**Detection Logic:**

```typescript
function isGroupOriginatedFrame(node: NodeChange): boolean {
  if (node.type !== "FRAME") {
    return false;
  }

  // Primary indicators
  if (node.frameMaskDisabled !== false || node.resizeToFit !== true) {
    return false;
  }

  // Additional safety check: GROUPs have no paints
  // (GROUPs don't have fills or strokes, so this is an extra safeguard)
  const hasNoFills = !node.fillPaints || node.fillPaints.length === 0;
  const hasNoStrokes = !node.strokePaints || node.strokePaints.length === 0;
  const hasNoBackgroundPaints =
    !node.backgroundPaints || node.backgroundPaints.length === 0;

  return hasNoFills && hasNoStrokes && hasNoBackgroundPaints;
}
```

**Note:** The paint checks (`fillPaints`, `strokePaints`, `backgroundPaints`) are used as additional safety checks since we can't be 100% confident in relying solely on `resizeToFit`. GROUPs never have fills or strokes, so this provides extra confidence in the detection.

**Verification:**

This behavior has been verified in:

- Clipboard payloads (see `fixtures/test-fig/clipboard/group-with-r-g-b-rect.clipboard.html`)
- `.fig` files (see `fixtures/test-fig/L0/frame.fig`)

Both formats show the same pattern: GROUP nodes are stored as FRAME nodes with distinguishing properties.

**Implementation Notes:**

When converting from Figma to Grida:

1. Check if a FRAME node has GROUP-like properties
2. If detected, convert to `GroupNode` instead of `ContainerNode`
3. This ensures proper semantic mapping: GROUP → GroupNode, FRAME → ContainerNode

### Component Sets

**Critical Finding:** There is no `COMPONENT_SET` node type in the Kiwi schema. Component sets are represented as:

- A `FRAME` node (the component set container)
- Containing multiple `SYMBOL` nodes as children (the component variants)

**Component Set FRAME Properties:**

A FRAME that is a component set has these distinguishing properties:

| Property                        | Component Set FRAME | Regular FRAME | Reliability |
| ------------------------------- | ------------------- | ------------- | ----------- |
| `isStateGroup`                  | `true`              | `undefined`   | ✅ Reliable |
| `componentPropDefs`             | Present             | `undefined`   | ✅ Reliable |
| `stateGroupPropertyValueOrders` | Present             | `undefined`   | ✅ Reliable |

**Component Set SYMBOL Properties:**

A SYMBOL that is part of a component set has:

| Property           | Component Set SYMBOL | Standalone SYMBOL | Reliability |
| ------------------ | -------------------- | ----------------- | ----------- |
| `variantPropSpecs` | Present              | `undefined`       | ✅ Reliable |

**Structure:**

```text
DOCUMENT "Document"
  └─ CANVAS "Internal Only Canvas" (component library)
     └─ FRAME "Button" (component set container)
        ├─ SYMBOL "Variant=Primary, State=Default, Size=Small"
        ├─ SYMBOL "Variant=Neutral, State=Default, Size=Small"
        └─ ... (more SYMBOL variants)
```

**Detection Logic:**

```typescript
// Detect component set FRAME
function isComponentSetFrame(node: NodeChange): boolean {
  if (node.type !== "FRAME") {
    return false;
  }
  return (
    node.isStateGroup === true &&
    node.componentPropDefs !== undefined &&
    node.componentPropDefs.length > 0
  );
}

// Detect component set SYMBOL
function isComponentSetSymbol(node: NodeChange): boolean {
  if (node.type !== "SYMBOL") {
    return false;
  }
  return (
    node.variantPropSpecs !== undefined && node.variantPropSpecs.length > 0
  );
}
```

**Verification:**

This structure has been verified in:

- Clipboard payloads (see `fixtures/test-fig/clipboard/component-set-cards.clipboard.html`)
- `.fig` files (see `fixtures/test-fig/L0/components.fig`)

Both formats show the same pattern: component sets are FRAME nodes containing SYMBOL children, with distinguishing properties on both the FRAME and SYMBOL nodes.

#### Component sets in clipboard payloads (observed)

Clipboard payloads add some practical patterns around where the component-set `FRAME` and variant `SYMBOL` nodes appear:

- **Copying the component set container** (see `fixtures/test-fig/clipboard/component-component-set.clipboard.html`):
  - The user-facing canvas contains the component-set `FRAME` (`isStateGroup === true`) with variant `SYMBOL` children.
  - An `"Internal Only Canvas"` (`CANVAS.internalOnly === true`) may still be present.

- **Copying a variant component itself** (see `fixtures/test-fig/clipboard/component-component-set-component-*.clipboard.html`):
  - The user-facing canvas contains the copied variant as a `SYMBOL`.
  - The internal-only canvas contains the component-set `FRAME` and its variant `SYMBOL` children.

- **Copying a variant instance** (see `fixtures/test-fig/clipboard/component-component-set-component-instance-*.clipboard.html`):
  - The user-facing canvas contains an `INSTANCE`.
  - The internal-only canvas contains the component-set `FRAME` and its variant `SYMBOL` children.
  - The reference uses `INSTANCE.symbolData.symbolID` → `SYMBOL.guid` (where the referenced `SYMBOL` is a variant under the component-set `FRAME`, not necessarily a direct child of a `CANVAS`).

**Verified in fixtures:**

- `fixtures/test-fig/clipboard/component-component-set.clipboard.html`
- `fixtures/test-fig/clipboard/component-component-set-component-blue.clipboard.html`
- `fixtures/test-fig/clipboard/component-component-set-component-red.clipboard.html`
- `fixtures/test-fig/clipboard/component-component-set-component-instance-blue.clipboard.html`
- `fixtures/test-fig/clipboard/component-component-set-component-instance-red.clipboard.html`

### Components & Instances (clipboard payloads)

The Kiwi clipboard payloads in `fixtures/test-fig/clipboard` demonstrate how **components** and **instances** are represented in practice.

#### Node types

- **Component definition**: `SYMBOL`
- **Component instance**: `INSTANCE`

#### Internal-only canvas

Clipboard payloads may include a canvas commonly named `"Internal Only Canvas"` where:

- The `CANVAS.internalOnly` field is `true`
- Component definitions (`SYMBOL`) may be stored there, even when the user copies an `INSTANCE`

#### Observed patterns (from fixtures)

**When copying the component definition** (`component-component-*.clipboard.html`):

- The `SYMBOL` appears under the user-facing canvas (e.g. `"Page 1"`).
- An `"Internal Only Canvas"` may still be present, but is empty of `SYMBOL` children in these fixtures.

**When copying a component instance** (`component-component-instance-*.clipboard.html`):

- The user-facing canvas contains an `INSTANCE`.
- The `"Internal Only Canvas"` contains the referenced `SYMBOL` definition.
- The linkage is `INSTANCE.symbolData.symbolID` → `SYMBOL.guid`.

**When copying a component-set variant instance** (`component-component-set-component-instance-*.clipboard.html`):

- The user-facing canvas contains an `INSTANCE`.
- The internal-only canvas contains the component set `FRAME` (`isStateGroup === true`) and its variant `SYMBOL` children.
- The linkage is still `INSTANCE.symbolData.symbolID` → `SYMBOL.guid` (the referenced `SYMBOL` is a variant under the component-set `FRAME`).

**Verified in fixtures:**

- `fixtures/test-fig/clipboard/component-component-blue.clipboard.html`
- `fixtures/test-fig/clipboard/component-component-red.clipboard.html`
- `fixtures/test-fig/clipboard/component-component-instance-blue.clipboard.html`
- `fixtures/test-fig/clipboard/component-component-instance-red.clipboard.html`
- `fixtures/test-fig/clipboard/component-component-set-component-instance-blue.clipboard.html`
- `fixtures/test-fig/clipboard/component-component-set-component-instance-red.clipboard.html`

### Slides / Deck format

`.deck` files are Figma Slides documents. They use the same Kiwi binary
format as `.fig` but with a different prelude string:

| File type | Prelude magic |
| --------- | ------------- |
| `.fig`    | `"fig-kiwi"`  |
| `.deck`   | `"fig-deck"`  |

The file-level `editorType` field (`EditScope.editorType` or
`NodeChange.editorType`) is set to `EditorType.SLIDES` (`2`) for deck
files. Individual pages may carry `pageType?: EditorType` on their
CANVAS `NodeChange`.

#### EditorType enum

```text
enum EditorType {
  DESIGN = 0;
  WHITEBOARD = 1;
  SLIDES = 2;
  DEV_HANDOFF = 3;
  SITES = 4;
  COOPER = 5;
  ILLUSTRATION = 6;
  FIGMAKE = 7;
}
```

#### Slide node types

| Kiwi type                   | Numeric | Role                                            |
| --------------------------- | ------- | ----------------------------------------------- |
| `SLIDE`                     | 32      | A single slide (structurally like FRAME)        |
| `INTERACTIVE_SLIDE_ELEMENT` | 34      | Interactive element within a slide (frame-like) |
| `SLIDE_GRID`                | 37      | Grid container holding SLIDE_ROW nodes          |
| `SLIDE_ROW`                 | 38      | Row container holding SLIDE nodes               |

**Hierarchy (observed in `.deck` files):**

```text
CANVAS (page)
  └─ SLIDE_GRID
       ├─ SLIDE_ROW
       │    ├─ SLIDE "Slide 1"
       │    │    └─ (content nodes: FRAME, TEXT, VECTOR, ...)
       │    ├─ SLIDE "Slide 2"
       │    └─ ...
       └─ SLIDE_ROW
            └─ SLIDE "Slide N"
```

`SLIDE_GRID` and `SLIDE_ROW` are organizational wrappers that enable
Figma's infinite canvas UX for slides. They carry standard frame
properties (fills, layout, clips) but serve no semantic purpose for the
slides themselves.

#### Slide-specific NodeChange fields

| Field                  | Type              | Location                   | Purpose                                     |
| ---------------------- | ----------------- | -------------------------- | ------------------------------------------- |
| `slideSpeakerNotes`    | `string?`         | `NodeChange` (on `SLIDE`)  | Speaker/presentation notes for the slide    |
| `isSkippedSlide`       | `boolean?`        | `NodeChange` (on `SLIDE`)  | Skip this slide during presentation         |
| `slideNumber`          | `SlideNumber?`    | `NodeChange` (on `SLIDE`)  | Slide numbering mode                        |
| `slideNumberSeparator` | `string?`         | `NodeChange` (on `SLIDE`)  | Separator string for compound slide numbers |
| `slideThumbnailHash`   | `string?`         | `NodeChange` (on `SLIDE`)  | Hash of the slide's cached thumbnail image  |
| `slideThemeData`       | `SlideThemeData?` | `NodeChange`               | Theme ID + version for the slide            |
| `slideThemeMap`        | `SlideThemeMap?`  | `NodeChange`               | Theme mapping data                          |
| `slideTemplateFileKey` | `string?`         | `NodeChange`               | Figma file key of the template used         |
| `pageType`             | `EditorType?`     | `NodeChange` (on `CANVAS`) | Identifies the editor mode for this page    |

#### SlideNumber enum

```text
enum SlideNumber {
  NONE = 0;
  SLIDE = 1;
  SECTION = 2;
  SUBSECTION = 3;
  TOTAL_WITHIN_DECK = 4;
  TOTAL_WITHIN_SECTION = 5;
}
```

#### SlideThemeData

```text
message SlideThemeData {
  ThemeID themeID = 1;
  string version = 2;
}
```

**Verified in fixtures:**

- `fixtures/test-fig/deck/light.deck`
- `fixtures/test-fig/deck/local/how-to-use-figma-slides.deck`

### Vector

**Node Type:** `VECTOR`

VECTOR nodes represent vector graphics (paths/shapes) in Figma. The vector geometry is stored in a binary format within the `.fig` file.

#### Vector network coordinate space (observed)

When `VECTOR.vectorData.vectorNetworkBlob` is present, the decoded vector network coordinates (vertices and segment tangents) are **not always expressed in the node’s `size` coordinate space**.

- The vector network coordinates are typically expressed in the **`vectorData.normalizedSize` coordinate space** (in observed real-world `.fig` data, many blob vertex bboxes match `normalizedSize` closely).
- The node’s rendered size is represented by `NodeChange.size`.
- To map the vector network into the node’s local size space, you generally need to scale:
  - $s_x = \frac{\text{size.x}}{\text{normalizedSize.x}}$
  - $s_y = \frac{\text{size.y}}{\text{normalizedSize.y}}$
- This scaling applies to both:
  - **vertex positions** `(x, y)`
  - **segment tangents** `(dx, dy)`

**Practical consequence**: treating vector network coordinates “as-is” (without accounting for `normalizedSize` vs `size`) can produce vectors that render at the wrong size and appear mis-positioned relative to their container.

**Caveat (also observed)**: some blobs have non-zero bbox origins (e.g. `minX/minY` not exactly `0`), so in some cases an additional translation may be necessary beyond pure scaling.

**VectorData Structure:**

VECTOR nodes contain a `vectorData` field of type `VectorData`:

| Field                | Type            | Description                                    |
| -------------------- | --------------- | ---------------------------------------------- |
| `vectorNetworkBlob`  | `number?`       | Blob ID referencing binary vector network data |
| `normalizedSize`     | `Vector?`       | Normalized size (x, y)                         |
| `styleOverrideTable` | `NodeChange[]?` | Style overrides                                |

**Vector Network Blob Format:**

The `vectorNetworkBlob` field contains a blob ID (number) that references binary data stored in the message's `blobs` array. This binary data encodes the vector network in a specific little-endian format:

**Header (12 bytes total):**

| Field          | Type | Offset | Description        |
| -------------- | ---- | ------ | ------------------ |
| `vertexCount`  | u32  | 0      | Number of vertices |
| `segmentCount` | u32  | 4      | Number of segments |
| `regionCount`  | u32  | 8      | Number of regions  |

**Vertices (12 bytes each):**

| Field     | Type | Offset | Description                     |
| --------- | ---- | ------ | ------------------------------- |
| `styleID` | u32  | 0      | Style identifier for the vertex |
| `x`       | f32  | 4      | X coordinate                    |
| `y`       | f32  | 8      | Y coordinate                    |

**Segments (28 bytes each):**

| Field         | Type | Offset | Description                      |
| ------------- | ---- | ------ | -------------------------------- |
| `styleID`     | u32  | 0      | Style identifier for the segment |
| `startVertex` | u32  | 4      | Index of the start vertex        |
| `start.dx`    | f32  | 8      | Start tangent X component        |
| `start.dy`    | f32  | 12     | Start tangent Y component        |
| `endVertex`   | u32  | 16     | Index of the end vertex          |
| `end.dx`      | f32  | 20     | End tangent X component          |
| `end.dy`      | f32  | 24     | End tangent Y component          |

**Regions:**

| Field                 | Type   | Description                                                     |
| --------------------- | ------ | --------------------------------------------------------------- |
| `styleID+windingRule` | u32    | Style ID (bits 1-31) and winding rule (bit 0: 0=ODD, 1=NONZERO) |
| `loopCount`           | u32    | Number of loops in this region                                  |
| `loops`               | Loop[] | Array of loops, where each loop contains:                       |
| `loops[].indexCount`  | u32    | Number of segment indices in this loop                          |
| `loops[].indices`     | u32[]  | Array of segment indices forming the closed loop                |

**Parsed VectorNetwork Structure:**

After parsing, the binary blob is converted to a structured `VectorNetwork` object:

| Field      | Type                                                                                                                             | Description                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `vertices` | `Array<{ styleID: number; x: number; y: number }>`                                                                               | Array of vertex positions and style IDs                    |
| `segments` | `Array<{ styleID: number; start: { vertex: number; dx: number; dy: number }; end: { vertex: number; dx: number; dy: number } }>` | Array of segments connecting vertices with tangent handles |
| `regions`  | `Array<{ styleID: number; windingRule: "NONZERO" \| "ODD"; loops: Array<{ segments: number[] }> }>`                              | Array of regions defining closed shapes                    |

**Parsing Example:**

```typescript
// Get the blob bytes from the message
const blobBytes = getBlobBytes(vectorData.vectorNetworkBlob, message);

// Parse the vector network
const vectorNetwork = parseVectorNetworkBlob(blobBytes);
// Returns: {
//   vertices: [{ styleID: number, x: number, y: number }],
//   segments: [{ styleID: number, start: { vertex: number, dx: number, dy: number }, end: { vertex: number, dx: number, dy: number } }],
//   regions: [{ styleID: number, windingRule: "NONZERO" | "ODD", loops: [{ segments: number[] }] }]
// }
```

**Key Points:**

- The vector network uses a **graph-based representation** with vertices, segments (edges with tangent handles), and regions (closed loops of segments)
- Segments connect vertices and include tangent handle information (`dx`, `dy`) for curved paths
- Regions define closed shapes using loops of segment indices
- Winding rules determine fill behavior: `NONZERO` or `ODD` (even-odd)
- Style IDs reference styles from the style system for fills, strokes, and effects
- The `normalizedSize` field provides the coordinate space dimensions for the vector

### Text & Font

TEXT nodes carry font information in two places: **`NodeChange.fontName`** and **`DerivedTextData.fontMetaData`** (or `TextData.fontMetaData`). For Kiwi → REST import, **FontMetaData is the authoritative source** for font weight and italic; `fontName` alone is not sufficient.

#### FontName (limited for import)

```text
struct FontName {
  string family;   // e.g. "Inter", "Roboto"
  string style;   // Human-readable style name from the font's name table (likely Name ID 2 or 17)
  string postscript;  // PostScript name; may be empty
}
```

**Limitations when mapping to REST / CSS:**

- **`style`** holds values like `"Regular"`, `"Bold"`, `"Bold Italic"` — the font's internal style name, **not** CSS `font-style` (normal/italic) or `font-weight`. Without the original font file, you cannot reliably derive CSS semantics from `style` alone.
- **`postscript`** may be empty (e.g. Inter Regular often has `postscript: ""`), so it is not a reliable fallback for resolving the exact font face.

**Use `fontName`** for `fontFamily` (and optionally `fontPostScriptName` when non-empty). For `fontWeight` and italic, use **FontMetaData**.

#### FontMetaData (authoritative for weight and italic)

```text
message FontMetaData {
  FontName key = 1;
  float fontLineHeight = 2;
  byte[] fontDigest = 3;
  FontStyle fontStyle = 4;  // NORMAL | ITALIC
  int fontWeight = 5;
}

enum FontStyle {
  NORMAL = 0;
  ITALIC = 1;
}
```

**FontMetaData** provides strict, sanitized values that align with Figma's internal model and with the Figma REST API:

| FontMetaData field | Type        | REST API equivalent  | Notes                             |
| ------------------ | ----------- | -------------------- | --------------------------------- |
| `fontStyle`        | `FontStyle` | `italic: boolean`    | `NORMAL` → false, `ITALIC` → true |
| `fontWeight`       | `int`       | `fontWeight: number` | 400, 700, etc.                    |

**Location:** `DerivedTextData.fontMetaData` (or `TextData.fontMetaData`). The array is keyed by `FontName` — each entry has `key: FontName` and you find the matching entry by comparing `key` to the font in use. For single-style text, `fontMetaData[0]` typically applies; otherwise use the entry whose `key` matches the run's font.

**Observed examples (Inter):**

| Variant     | fontName.style | fontName.postscript | fontMetaData.fontStyle | fontMetaData.fontWeight |
| ----------- | -------------- | ------------------- | ---------------------- | ----------------------- |
| Regular     | "Regular"      | `""`                | NORMAL                 | 400                     |
| Bold        | "Bold"         | "Inter-Bold"        | NORMAL                 | 700                     |
| Bold Italic | "Bold Italic"  | "Inter-BoldItalic"  | ITALIC                 | 700                     |

#### Kiwi → REST mapping

When importing Kiwi TEXT nodes to a REST-like or Grida schema:

1. **fontFamily** — from `NodeChange.fontName.family` (or `FontMetaData.key.family`).
2. **fontPostScriptName** — from `fontName.postscript` when non-empty; otherwise `null` or omit.
3. **fontWeight** — from the matching `fontMetaData` entry (by `key` or `fontMetaData[n]`). Do **not** infer from `fontName.style`.
4. **italic** — from that same entry's `fontStyle === ITALIC`.

Figma internally merges and returns these values in the REST API; using FontMetaData ensures the import matches that behavior.

#### Line Height & Letter Spacing Units

`NodeChange.lineHeight` and `NodeChange.letterSpacing` are `{ value: number, units: string }` objects. The `units` field determines interpretation:

| units       | Meaning                        | REST API equivalent         | Conversion to REST                         |
| ----------- | ------------------------------ | --------------------------- | ------------------------------------------ |
| `"RAW"`     | Direct multiplier of font size | `lineHeightPercentFontSize` | `value * 100` (e.g. RAW `1.5` → `150`)     |
| `"PERCENT"` | Percentage of font size        | `lineHeightPercentFontSize` | `value` as-is (e.g. PERCENT `150` → `150`) |
| `"PIXELS"`  | Absolute pixel value           | `lineHeightPx`              | `value` as-is                              |

**`"RAW"` is the most common unit** for line height in `.fig` / `.deck` files. It represents a unitless factor (like CSS `line-height: 1.5`). The REST API does not expose `"RAW"` — it converts to `lineHeightPercentFontSize` (percentage of font size), so `RAW 1.5` = `lineHeightPercentFontSize 150`.

Letter spacing follows the same pattern: `"PERCENT"` is relative to font size, `"PIXELS"` is absolute.

Style overrides (`TextData.styleOverrideTable`) carry the same `{ value, units }` shape for `lineHeight` and `letterSpacing`.

### Gradient Paint Transform

Gradient paints (`GRADIENT_LINEAR`, `GRADIENT_RADIAL`, `GRADIENT_ANGULAR`, `GRADIENT_DIAMOND`) carry a `transform` field that defines the gradient's orientation and position within the node's normalized (0-1) coordinate space.

#### Transform direction

The kiwi paint `transform` is a 2x3 affine matrix that maps FROM **node-normalized space** TO **gradient-unit space**. This is the **inverse** of Figma's REST API `gradientHandlePositions`, which describe the gradient endpoints in node space.

To convert kiwi `Paint.transform` to REST-style handle positions:

1. Invert the 2x3 affine matrix
2. Apply the inverse to the canonical base control points for the gradient type

#### Canonical base control points

| Gradient type            | A (start)  | B (end)  | C (perpendicular) |
| ------------------------ | ---------- | -------- | ----------------- |
| Linear                   | (0, 0.5)   | (1, 0.5) | (0, 1)            |
| Radial, Angular, Diamond | (0.5, 0.5) | (1, 0.5) | (0.5, 1)          |

#### Gradient stops

Gradient stops are stored in `Paint.stops[]`, each with:

- `position: float` — normalized position along the gradient line (0 to 1)
- `color: Color` — the stop color

Stops map directly to the REST API's `gradientStops[].position` (same field, same semantics).

### Instance Overrides

INSTANCE nodes reference a SYMBOL (component definition) via `symbolData.symbolID`. The instance's children are structurally identical to the component's children, but individual properties can be overridden per-instance.

#### SymbolData

```text
message SymbolData {
  GUID symbolID = 1;            // References SYMBOL.guid
  NodeChange[] symbolOverrides = 2;  // Per-child property patches
  float uniformScaleFactor = 3;      // Uniform scale (rare)
}
```

#### symbolOverrides

An array of `NodeChange`-like objects, each carrying a `guidPath` that identifies the target child and one or more property patches.

Each override entry may contain any subset of `NodeChange` properties as patches:

| Patch field    | Effect                               |
| -------------- | ------------------------------------ |
| `visible`      | Show/hide the targeted child         |
| `opacity`      | Override opacity                     |
| `fillPaints`   | Replace fill paints                  |
| `strokePaints` | Replace stroke paints                |
| `textData`     | Replace text content (`.characters`) |
| `size`         | Override dimensions                  |
| `transform`    | Override position/rotation           |

Paint patches (`fillPaints`, `strokePaints`) may include `colorVar` bindings that reference variables instead of using the static `color` value. See [Variables](#variables).

#### overrideKey

A `GUID` on each node within a SYMBOL definition that serves as a stable identifier for override targeting. This is **not** the node's `guid` (which is used for parent-child linking). The `overrideKey` is the addressing mechanism that `symbolOverrides.guidPath` uses to locate children across instance boundaries.

#### guidPath

```text
message GUIDPath {
  GUID[] guids = 1;
}
```

An ordered path of `overrideKey` GUIDs from the instance root to the target node:

- **Length 1** `[A]` — targets a direct child of this component whose `overrideKey` is `A`.
- **Length 2+** `[A, B]` — targets a node inside a nested instance. The first GUID `A` identifies a child INSTANCE (by its `overrideKey`); the remaining GUIDs `[B]` address nodes within that nested instance's component subtree.

This addressing scheme supports arbitrary nesting depth. For a 3-level override `[A, B, C]`:

1. `A` identifies a child INSTANCE of the current component
2. `B` identifies a child INSTANCE within A's component
3. `C` identifies the target node within B's component

#### derivedSymbolData

An array of `NodeChange`-like objects on INSTANCE nodes, indexed by `guidPath`. Contains fully resolved properties (size, transform, stroke weight, etc.) for each addressable descendant. This is the output of Figma's server-side override resolution — the "answer key" of what the instance tree should look like after all overrides are applied.

#### Override precedence

When multiple levels define overrides for the same deep child:

- **Component-defined overrides** (on a nested INSTANCE within a SYMBOL definition) serve as defaults.
- **Usage-site overrides** (on the INSTANCE node in the document tree) override the defaults.
- Usage-site overrides WIN — they are more specific.

#### Override cascade example

```text
SYMBOL "cursor-multiplayer-gray" (component)
  ├─ "Name" FRAME (overrideKey: X:100)
  └─ "cursor-black" INSTANCE of "cursor-def" (overrideKey: X:200)
       symbolOverrides:
         guidPath:[Y:500], fillPaints: black   ← component-level default

INSTANCE of "cursor-multiplayer-gray" (usage site)
  symbolOverrides:
    guidPath:[X:100], visible: false           ← hide Name
    guidPath:[X:200, Y:500], fillPaints: blue  ← override cursor color
```

Resolution:

1. `[X:100]` → hide "Name" (direct child override)
2. `[X:200, Y:500]` → the cursor fill is **blue** (usage-site wins over the component-level black default)

### Variables

Figma's variable system (design tokens) is represented by `VARIABLE` and `VARIABLE_SET` node types. Variables can hold colors, numbers, strings, or booleans, and can be bound to node properties via `colorVar` (on paints) or similar binding fields.

#### VARIABLE node

```text
NodeChange (type = VARIABLE)
  key: string                    // 40-char hex hash, stable publish key
  name: string                   // Human-readable name (e.g. "🎨/red/500")
  variableResolvedType: COLOR | FLOAT | STRING | BOOLEAN
  variableDataValues: VariableDataValues
  variableSetID: VariableSetID   // Parent variable set
```

#### VariableDataValues

```text
message VariableDataValues {
  VariableDataValuesEntry[] entries = 1;
}

message VariableDataValuesEntry {
  GUID modeID = 1;          // Variable mode (e.g. light/dark)
  VariableData variableData = 2;
}
```

Each entry corresponds to a mode in the variable's parent set. A variable may have multiple mode entries (e.g., light mode and dark mode each with different values).

#### VariableData and VariableAnyValue

```text
message VariableData {
  VariableAnyValue value = 1;
  VariableDataType dataType = 2;
  VariableResolvedDataType resolvedDataType = 3;
}

message VariableAnyValue {
  bool boolValue;
  string textValue;
  float floatValue;
  VariableID alias;       // Reference to another variable
  Color colorValue;       // Direct color value
  // ... other value types
}
```

A variable's value is either a **direct value** (e.g., `colorValue`) or an **alias** referencing another variable via `VariableID.assetRef.key`.

#### Variable alias chains

Variables can form alias chains where one variable references another:

```text
VARIABLE "✦/_multiplayer/grey"  (key: "abc123...")
  value: alias → assetRef.key: "def456..."

VARIABLE "✦/special/grey"  (key: "def456...")
  value: alias → assetRef.key: "789abc..."

VARIABLE "🎨/pale_blue/500"  (key: "789abc...")
  value: colorValue: {r: 0.4, g: 0.467, b: 0.6, a: 1}
```

To resolve a variable's final value, follow the alias chain until a direct value (`colorValue`, `floatValue`, etc.) is reached. Chains are typically 1-3 levels deep.

#### colorVar on paints

When a `Paint` has `colorVar: VariableData`, the paint's `color` field holds a static fallback value (often black `{0,0,0,1}`), and the actual color should be resolved from the referenced variable:

```text
Paint {
  type: SOLID
  color: {r: 0, g: 0, b: 0, a: 1}    // Static fallback
  colorVar: {
    value: {
      alias: {
        assetRef: {
          key: "abc123..."             // → VARIABLE.key
        }
      }
    }
    dataType: ALIAS
    resolvedDataType: COLOR
  }
}
```

Resolution: look up `VARIABLE` nodes by `key` field matching `assetRef.key`, then follow alias chains to the final `colorValue`.

#### Practical notes

- The `key` field on VARIABLE nodes is the stable reference. It does not change when the variable is renamed.
- The first entry in `variableDataValues.entries` typically corresponds to the default mode.
- Variable resolution is independent of the node tree — variables are addressed by `key`, not by `guid` or parent-child relationships.
- Variables are defined at the document level (parented to the DOCUMENT node), not within specific pages.

## External Resources

- [kiwi-schema][kiwi-schema] - The Kiwi protocol by Evan Wallace
- [Figma .fig file format parser][fig-parser] - Online parser and documentation
- [fig-kiwi on npm][fig-kiwi-npm] - JavaScript implementation

[fig.kiwi-snapshot]: https://github.com/gridaco/grida/blob/ec18e4b716790e095c34b2f2535b58f62a8c7ca6/.ref/figma/fig.kiwi
[fig.kiwi-latest]: https://github.com/gridaco/grida/blob/main/.ref/figma/fig.kiwi
[fig2kiwi-snapshot]: https://github.com/gridaco/grida/blob/ec18e4b716790e095c34b2f2535b58f62a8c7ca6/.ref/figma/fig2kiwi.ts
[kiwi-schema]: https://github.com/evanw/kiwi
[fig-parser]: https://madebyevan.com/figma/fig-file-parser/
[fig-kiwi-npm]: https://www.npmjs.com/package/fig-kiwi
