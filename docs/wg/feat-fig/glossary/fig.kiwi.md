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
