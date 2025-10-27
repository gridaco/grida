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

## Tools

### `tool_io_grida` - Grida File Validator

A CLI tool for validating `.grida` files and debugging parsing issues.

**Usage:**

```sh
cargo run --example tool_io_grida <path-to-grida-file>
```

**Features:**

- Validates `.grida` file structure and parses all nodes
- Reports total node count, scene references, and entry scene
- Provides node type breakdown (container, text, image, etc.)
- Detects parsing errors with detailed error messages
- Handles legacy file formats gracefully (missing fields, typos, etc.)

**Example:**

```sh
cargo run --example tool_io_grida ../../editor/public/examples/canvas/instagram-post-01.grida
```

See [examples/tool_io_grida.rs](./examples/tool_io_grida.rs) for full documentation.

## Package Docs

```sh
# skia-safe
cargo doc --package skia-safe --open --no-deps
```
