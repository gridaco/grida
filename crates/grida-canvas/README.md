# grida-canvas (`cg`)

<img src="./cover.png" alt="Grida Canvas Rendering Backend Example" width="100%" />

Grida Canvas is a **safe, high-performance 2D real-time rendering engine** for the Grida design tool. It provides a node- and property-based graphics API with support for modern design techniques.

- **Rendering**: [`skia-safe`](https://rust-skia.github.io/doc/skia_safe/) for painting
- **Geometry & math**: [`math2`](../math2/README.md) for transforms, rects, and common operations

## Capabilities

### 2D nodes

| Node                                        | Status |
| ------------------------------------------- | ------ |
| Container (Frame)                           | ✅     |
| Group                                       | ✅     |
| Rectangle                                   | ✅     |
| Ellipse (incl. arc, ring, sector)           | ✅     |
| Polygon, RegularPolygon, RegularStarPolygon | ✅     |
| Line                                        | ✅     |
| Path (SVG path)                             | ✅     |
| Vector (vector network)                     | ✅     |
| BooleanOperation                            | ✅     |
| TextSpan                                    | ✅     |
| Image                                       | ✅     |
| InitialContainer, Error                     | ✅     |

### Paints & effects

- **Fills**: Solid, LinearGradient, RadialGradient, SweepGradient, Image (with fit and image filters)
- **Strokes**: Stroke width (uniform/variable), dash array, caps/joins, stroke alignment, rect-specific stroke widths, markers
- **Effects**: Layer blur, backdrop blur, drop/inner shadow, liquid glass, noise
- **Blend modes** on layers and paints

### Layout

- **Taffy**-based layout: flex (direction, alignment, gap, padding), positioning (inset, width/height), transform

### Meta

- **Masks** (layer and vector masks)

### Pipeline & runtime

- **Camera**: 2D camera (pan, zoom, viewport)
- **Resources**: Font loading (`FontRepository`), image loading (`ImageRepository`), embedded fonts (e.g. Geist, Geist Mono)
- **Export**: PNG, JPEG, WEBP, BMP, PDF, SVG

### Interactivity

- **Hit testing**: `HitTester` for point-in-node and hit-test queries

## I/O

| Module                                        | Description                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `io::io_grida_fbs`                            | Encode/decode `.grida` FlatBuffers binaries. Bindings are generated from `format/grida.fbs` via `flatc --rust` (see repo root and `format/README.md`). |
| `io::io_grida`                                | Decode Grida JSON documents into a `Scene`.                                                                                                            |
| `io::io_grida_patch`                          | Apply JSON Patch to a decoded scene.                                                                                                                   |
| `io::io_figma`                                | Decode Figma API JSON into a `Scene` (feature-gated: `--features figma`).                                                                              |
| `io::io_svg`, `io::io_css`, `io::io_markdown` | Additional import/parsing helpers.                                                                                                                     |

### Test fixtures

Raw FlatBuffers test fixtures live in [`fixtures/test-grida/`](../../fixtures/test-grida/) at the repo root. In-memory round-trip tests are in `cargo test --package cg --test fbs_roundtrip`. See the fixtures directory README for format and version details.

## NodeID system

The canvas uses a dual-ID system:

- **NodeId** (`u64`): Internal counter-based IDs for high-performance operations. Ephemeral and not serialized.
- **UserNodeId** (`String`): External user-provided IDs for public APIs. Stable and serialized in `.grida` files.

See [AGENTS.md](./AGENTS.md#nodeid-system) for details and migration notes.

## Testing & development

```sh
# run tests
cargo test

# run fmt
cargo fmt

# run check
cargo check
cargo check --all-targets --all-features

# run clippy (no deps — skips re-checking skia etc.)
cargo clippy --no-deps --all-targets --all-features

# run build
cargo build

# run examples (many require window/GPU; headless_gpu requires native-gl-context)
cargo run --example <example-name>
cargo run --example headless_gpu --features native-gl-context
```

## Tools

### `tool_io_grida` — Grida file validator

CLI for validating `.grida` files and debugging parsing.

```sh
cargo run --example tool_io_grida <path-to-grida-file>
```

Validates file structure, reports node counts and types, and surfaces decode errors. See [examples/tool_io_grida.rs](./examples/tool_io_grida.rs) for full documentation.

## Package docs

```sh
cargo doc --package cg --open --no-deps
```
