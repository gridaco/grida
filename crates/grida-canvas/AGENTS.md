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
3. `io_grida_fbs::decode_with_id_map` populates the bidirectional mapping during `.grida` loading
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

## Package Docs

```sh
cargo doc --package cg --open --no-deps
```
