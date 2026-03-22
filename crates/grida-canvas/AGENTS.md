safe, high-performance, 2D real-time rendering engine.

- uses [`skia-safe`](https://rust-skia.github.io/doc/skia_safe/) for painting
- uses [`math2`](../math2/README.md) for geometry & common math operations

## NodeID System

The canvas uses a dual-ID system:

- **NodeId** (`u64`): Internal counter-based IDs for high-performance operations. Ephemeral and not serialized.
- **UserNodeId** (`String`): External user-provided IDs for public APIs. Stable and serialized in .grida files.

### Key Points

1. All internal structs (NodeRecs, SceneGraph, caches) use `NodeId` (u64)
2. Public APIs accept/return `UserNodeId` (String) for stability
3. `IdConverter` handles conversion during .grida file loading
4. `NodeRepository` auto-generates IDs for factory-created nodes (ID=0)
5. Application layer maintains bidirectional mapping for API boundary

See [NODEID_MIGRATION.md](./NODEID_MIGRATION.md) for full migration details.

## Testing & Development

```sh
# run tests
cargo test

# run fmt
cargo fmt

# run check
cargo check
cargo check --all-targets --all-features

# run clippy (no deps)
# - runs the same validation as `cargo check` (syntax + type checking)
# - PLUS runs Clippy lints (style, performance, correctness suggestions)
# - `--no-deps` skips re-checking huge dependencies (like skia),
#   while still validating your code's usage of them
# - best choice for fast iteration when working with large crates
cargo clippy --no-deps --all-targets --all-features

# run build
cargo build

# run dev (mostly requires window)
cargo run --example <example-name>
```

### Performance benchmarking

> **Always use `--release` for benchmarks.** Debug builds are ~20-30× slower
> and produce meaningless performance data.

```sh
# headless GPU benchmark (via grida-dev)
cargo run -p grida-dev --release -- bench ./fixtures/test-grida/bench.grida

# headless GPU example (cg only, requires native-gl-context feature)
cargo run -p cg --example headless_gpu --features native-gl-context --release
```

## Tools

### `tool_io_grida` — Grida File Inspector

Unified CLI tool for inspecting and validating `.grida` / `.grida1` files
in any format (FlatBuffers, ZIP, or legacy JSON). Includes a layout-engine
check to diagnose "Container must have layout result" panics.

**Usage:**

```sh
# Basic inspection (auto-detects format)
cargo run --example tool_io_grida -- path/to/file.grida

# List scenes (FBS/ZIP multi-scene files)
cargo run --example tool_io_grida -- path/to/file.grida --list-scenes

# Inspect a specific scene with full node tree
cargo run --example tool_io_grida -- path/to/file.grida --scene 0 --verbose

# Run layout check (detect containers missing layout results)
cargo run --example tool_io_grida -- path/to/file.grida --layout-check
```

**Features:**

- Auto-detects file format (FlatBuffers, ZIP archive, JSON)
- Validates file structure and parses all nodes
- Reports per-scene node counts and type breakdown
- Shows ID mapping info for FBS/ZIP files (internal NodeId to string ID)
- `--layout-check`: runs the layout engine and reports containers missing layout results
- `--verbose`: prints the full node tree with string IDs
- Handles legacy JSON formats gracefully (missing fields, typos, etc.)

See [examples/tool_io_grida.rs](./examples/tool_io_grida.rs) for full documentation.

## Package Docs

```sh
cargo doc --package cg --open --no-deps
```
