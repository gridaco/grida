# grida-dev

Rust-native dev runtime for [`cg`](../grida-canvas). It bundles the desktop winit host, CLI entrypoints, and an expanding toolbox of dev-only utilities so you can iterate entirely in Rust (no WASM build or full editor boot required).

## Why

- Load/run `.grida` exports or JSON scenes instantly via CLI for rapid feedback.
- Stress-test renderer changes (caching, hit-testing, resource loading) without touching the web/editor stack.
- Host upcoming devtools/micro editor surfaces (inspectors, scripting hooks, diagnostics) in a single Rust binary.

## Usage

```bash
# open an empty window — drop files onto it to load them
cargo run -p grida-dev

# open with a file (any supported format)
cargo run -p grida-dev -- path/to/scene.grida
cargo run -p grida-dev -- icon.svg
cargo run -p grida-dev -- photo.png

# open with a remote URL
cargo run -p grida-dev -- https://example.com/scene.grida
```

Supported formats: `.grida`, `.grida1` (JSON), `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`.
Multi-scene files support **PageUp/PageDown** pagination. Drop new files at any time to replace the scene.

### Headless GPU Benchmark

The `bench` subcommand runs a headless GPU benchmark (no window) and prints per-frame timing stats. Use it to measure rendering performance reliably.

> **Always use `--release` for benchmarks.** Debug builds are ~20-30x slower
> due to missing optimizations and cannot produce meaningful performance data.

```bash
# benchmark a .grida file
cargo run -p grida-dev --release -- bench ./fixtures/test-grida/bench.grida

# synthetic NxN grid (default 100x100 = 10K nodes)
cargo run -p grida-dev --release -- bench --size 100

# all nodes visible (large viewport)
cargo run -p grida-dev --release -- bench ./fixtures/test-grida/bench.grida --width 5000 --height 5000

# control frame count
cargo run -p grida-dev --release -- bench --frames 500
```

Output includes avg/p50/p95/p99 frame times, display list size, live draw count, and compositor cache hits.

### Native Examples

All legacy `cargo run --example ...` entrypoints from `grida-canvas` now live here. Run them directly:

```bash
cargo run -p grida-dev --example grida_basic
# ...plus the rest of the renderer demos
```

Examples live under `crates/grida-dev/examples/*` (with the CLI now covering the former `app_*` flows).

## Notes

- Remote scenes use `reqwest`; stay online or stick to local files.
- Image/font assets referenced with `http(s)://` URLs are loaded asynchronously inside `cg`.
- `run_demo_window` currently opens a fixed 1080×1080 window; customize it in `cg` if needed.
- The interactive window accepts file drops at any time; multi-scene files support PageUp/PageDown pagination.
- This crate is intentionally `publish = false`—it will gain CLI subcommands/devtools over time (inspector GUIs, perf capture, etc.).
