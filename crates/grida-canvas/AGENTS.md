safe, high-performance, 2D real-time rendering engine.

- uses [`skia-safe`](https://rust-skia.github.io/doc/skia_safe/) for painting
- uses [`math2`](../math2/README.md) for geometry & common math operations

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

## Package Docs

```sh
cargo doc --package skia-safe --open --no-deps
```
