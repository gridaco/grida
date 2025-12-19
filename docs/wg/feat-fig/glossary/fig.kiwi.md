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

| Property                        | Type                              | Location                                   | Purpose                                | Usage                                                                                 |
| ------------------------------- | --------------------------------- | ------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `parentIndex`                   | `ParentIndex`                     | `NodeChange.parentIndex`                   | Parent-child relationship and ordering | Contains `guid` (parent reference) and `position` (fractional index for ordering)     |
| `parentIndex.position`          | `string`                          | `ParentIndex.position`                     | Fractional index string for ordering   | Lexicographically sortable string (e.g., `"!"`, `"Qd&"`, `"QeU"`)                     |
| `sortPosition`                  | `string?`                         | `NodeChange.sortPosition`                  | Alternative ordering field             | Typically `undefined` for CANVAS nodes, may be used for other node types              |
| `frameMaskDisabled`             | `boolean?`                        | `NodeChange.frameMaskDisabled`             | Frame clipping mask setting            | `false` for GROUP-originated FRAMEs, `true` for real FRAMEs                           |
| `resizeToFit`                   | `boolean?`                        | `NodeChange.resizeToFit`                   | Auto-resize to fit content             | `true` for GROUP-originated FRAMEs, `undefined` for real FRAMEs                       |
| `fillPaints`                    | `Paint[]?`                        | `NodeChange.fillPaints`                    | Fill paint array                       | Empty/undefined for GROUPs, may exist for FRAMEs (used in GROUP detection)            |
| `strokePaints`                  | `Paint[]?`                        | `NodeChange.strokePaints`                  | Stroke paint array                     | Empty/undefined for GROUPs, may exist for FRAMEs (used in GROUP detection)            |
| `backgroundPaints`              | `Paint[]?`                        | `NodeChange.backgroundPaints`              | Background paint array                 | Empty/undefined for GROUPs, may exist for FRAMEs (used in GROUP detection)            |
| `isStateGroup`                  | `boolean?`                        | `NodeChange.isStateGroup`                  | Indicates state group/component set    | `true` for component set FRAMEs, `undefined` for regular FRAMEs                       |
| `componentPropDefs`             | `ComponentPropDef[]?`             | `NodeChange.componentPropDefs`             | Component property definitions         | Present on component set FRAMEs, defines variant properties                           |
| `stateGroupPropertyValueOrders` | `StateGroupPropertyValueOrder[]?` | `NodeChange.stateGroupPropertyValueOrders` | Variant property value orders          | Present on component set FRAMEs, defines order of variant values                      |
| `variantPropSpecs`              | `VariantPropSpec[]?`              | `NodeChange.variantPropSpecs`              | Variant property specifications        | Present on SYMBOL nodes that are part of component sets, absent on standalone SYMBOLs |

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
// Sort pages by parentIndex.position
const sortedPages = canvasNodes.sort((a, b) => {
  const aPos = a.parentIndex?.position ?? "";
  const bPos = b.parentIndex?.position ?? "";
  return aPos.localeCompare(bPos); // Lexicographic comparison
});

// Sort children by parentIndex.position
const sortedChildren = children.sort((a, b) => {
  const aPos = a.parentIndex?.position ?? "";
  const bPos = b.parentIndex?.position ?? "";
  return aPos.localeCompare(bPos);
});
```

**Important:** Always use lexicographic (string) comparison with `localeCompare()`. Never try to parse these as numbers - the strings are already in the correct format for sorting.

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

### Vector

**Node Type:** `VECTOR`

VECTOR nodes represent vector graphics (paths/shapes) in Figma. The vector geometry is stored in a binary format within the `.fig` file.

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
