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

- `DOCUMENT`, `CANVAS`, `FRAME`, `GROUP`
- `VECTOR`, `STAR`, `LINE`, `ELLIPSE`, `RECTANGLE`
- `TEXT`, `INSTANCE`, `COMPONENT`
- Modern types: `SECTION`, `WIDGET`, `CODE_BLOCK`, `TABLE`

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

| Property               | Type          | Location                       | Purpose                                | Usage                                                                             |
| ---------------------- | ------------- | ------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------- |
| `parentIndex`          | `ParentIndex` | `NodeChange.parentIndex`       | Parent-child relationship and ordering | Contains `guid` (parent reference) and `position` (fractional index for ordering) |
| `parentIndex.position` | `string`      | `ParentIndex.position`         | Fractional index string for ordering   | Lexicographically sortable string (e.g., `"!"`, `"Qd&"`, `"QeU"`)                 |
| `sortPosition`         | `string?`     | `NodeChange.sortPosition`      | Alternative ordering field             | Typically `undefined` for CANVAS nodes, may be used for other node types          |
| `frameMaskDisabled`    | `boolean?`    | `NodeChange.frameMaskDisabled` | Frame clipping mask setting            | `false` for GROUP-originated FRAMEs, `true` for real FRAMEs                       |
| `resizeToFit`          | `boolean?`    | `NodeChange.resizeToFit`       | Auto-resize to fit content             | `true` for GROUP-originated FRAMEs, `undefined` for real FRAMEs                   |
| `fillPaints`           | `Paint[]?`    | `NodeChange.fillPaints`        | Fill paint array                       | Empty/undefined for GROUPs, may exist for FRAMEs (used in GROUP detection)        |
| `strokePaints`         | `Paint[]?`    | `NodeChange.strokePaints`      | Stroke paint array                     | Empty/undefined for GROUPs, may exist for FRAMEs (used in GROUP detection)        |
| `backgroundPaints`     | `Paint[]?`    | `NodeChange.backgroundPaints`  | Background paint array                 | Empty/undefined for GROUPs, may exist for FRAMEs (used in GROUP detection)        |

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

## Usage in Implementation

### Rust Implementation

The Rust implementation uses the schema to parse `.fig` files:

```rust
// Located at: crates/grida-canvas/src/io/io_figma.rs
```

The implementation includes:

- Binary parsing of the Kiwi format
- Schema-based decoding of messages
- Translation to Grida's canvas format

### Related Files

- [`/.ref/figma/fig.kiwi`][fig.kiwi-snapshot] - Schema definition (Dec 2025 snapshot)
- [`/.ref/figma/fig2kiwi.ts`][fig2kiwi-snapshot] - Schema extraction tool (Dec 2025 snapshot)
- `/crates/grida-canvas/src/io/io_figma.rs` - Rust parser implementation

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
