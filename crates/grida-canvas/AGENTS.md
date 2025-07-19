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

# run build
cargo build

# run dev (mostly requires window)
cargo run --example <example-name>
```
