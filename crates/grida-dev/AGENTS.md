# `grida-dev`

Rust-native dev runtime for `cg` that bundles the winit/Skia host, CLI devtools, and (eventually) micro editor surfaces—ideal for iterating without rebuilding the WASM/editor stack.

## Goals

- Fast feedback loop for `.grida` exports without booting the full editor stack.
- Provide a convenient harness for reproducing rendering bugs on macOS/Linux/Windows.
- Stress-test renderer changes (caching, hit-testing, resources) entirely in Rust.
- Serve as the host for upcoming CLI devtools / micro editor flows (scripting, inspectors, etc.).

## Commands

```bash
cargo run -p grida-dev -- scene <path-or-url>
cargo run -p grida-dev -- figma --file-key ... --api-key ... --scene-index 0
cargo run -p grida-dev -- svg path/to/file.svg --title "My SVG"
cargo run -p grida-dev -- benchmark --size 400
cargo run -p grida-dev -- sample
```

## Notes

- The binary hosts the native window stack internally but still uses the shared `UnknownTargetApplication`, so it inherits all keyboard shortcuts from the classic demo (⌘+/- zoom, ⌘⇧C copy PNG, etc.).
- Remote scenes are fetched with `reqwest`; if you are offline, stick to local `.grida` files.
- The crate is `publish = false` and intended solely for local development workflows and devtools.
- All winit/glutin integration now lives here; the `cg` crate remains platform-agnostic.
- Expect more CLI commands/subcommands over time for dev inspectors, perf capture, etc.—this crate is the staging ground for those Rust-only utilities.
- Do **not** launch the windowed demo yourself. It spins up a native winit event loop that agents cannot stop, inspect, or debug reliably. Use the forthcoming debug/tooling protocols instead once they land.
