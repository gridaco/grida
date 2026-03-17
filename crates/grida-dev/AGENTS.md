# `grida-dev`

Rust-native dev runtime for `cg` that bundles the winit/Skia host, CLI devtools, and (eventually) micro editor surfaces—ideal for iterating without rebuilding the WASM/editor stack.

## Goals

- Fast feedback loop for `.grida` exports without booting the full editor stack.
- Provide a convenient harness for reproducing rendering bugs on macOS/Linux/Windows.
- Stress-test renderer changes (caching, hit-testing, resources) entirely in Rust.
- Serve as the host for upcoming CLI devtools / micro editor flows (scripting, inspectors, etc.).

## Commands

```bash
# Interactive window — drop files to load, or pass a file/URL directly
cargo run -p grida-dev
cargo run -p grida-dev -- path/to/scene.grida
cargo run -p grida-dev -- icon.svg

# Headless GPU benchmark (no window, prints per-frame stats)
cargo run -p grida-dev --release -- bench ./fixtures/test-grida/bench.grida
cargo run -p grida-dev --release -- bench --size 100
```

## Performance measurement

> **Always use `--release` for benchmarks and performance testing.**
> Debug builds are ~20-30× slower and produce meaningless performance data.

Use the `bench` subcommand for headless GPU measurement. It reports
avg/p50/p95/p99 frame latencies without window/vsync overhead.

Do **not** draw conclusions from debug-mode frame rates.

## Notes

- The binary hosts the native window stack internally but still uses the shared `UnknownTargetApplication`, so it inherits all keyboard shortcuts from the classic demo (⌘+/- zoom, ⌘⇧C copy PNG, etc.).
- Remote scenes are fetched with `reqwest`; if you are offline, stick to local `.grida` files.
- The crate is `publish = false` and intended solely for local development workflows and devtools.
- All winit/glutin integration now lives here; the `cg` crate remains platform-agnostic.
- Expect more CLI commands/subcommands over time for dev inspectors, perf capture, etc.—this crate is the staging ground for those Rust-only utilities.
- Pass a file path or URL as an argument to load it on startup; or run with no arguments and drop files onto the window. Supported: `.grida`, `.grida1`, `.svg`, `.png`, `.jpg/.jpeg`, `.webp`. Multi-scene files support PageUp/PageDown.
- Do **not** launch the windowed demo yourself. It spins up a native winit event loop that agents cannot stop, inspect, or debug reliably. Use the forthcoming debug/tooling protocols instead once they land.
