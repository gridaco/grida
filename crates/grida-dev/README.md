# grida-dev

Rust-native dev runtime for [`cg`](../grida-canvas). It bundles the desktop winit host, CLI entrypoints, and an expanding toolbox of dev-only utilities so you can iterate entirely in Rust (no WASM build or full editor boot required).

## Why

- Load/run `.grida` exports or JSON scenes instantly via CLI for rapid feedback.
- Stress-test renderer changes (caching, hit-testing, resource loading) without touching the web/editor stack.
- Host upcoming devtools/micro editor surfaces (inspectors, scripting hooks, diagnostics) in a single Rust binary.

## Usage

```bash
# render a local .grida/.json
cargo run -p grida-dev -- scene path/to/scene.grida

# render via Figma (API/local/archive)
cargo run -p grida-dev -- figma --file-key ... --api-key ... --scene-index 0

# convert & render an SVG
cargo run -p grida-dev -- svg path/to/asset.svg --title "My SVG"

# stress-test rendering with an NxN grid
cargo run -p grida-dev -- benchmark --size 400

# load the built-in sample scene
cargo run -p grida-dev -- sample
```

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
- This crate is intentionally `publish = false`—it will gain CLI subcommands/devtools over time (inspector GUIs, perf capture, etc.).
