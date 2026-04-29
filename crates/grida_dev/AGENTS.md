# `grida_dev`

Rust-native dev runtime for the `grida` crate that bundles the winit/Skia host, CLI devtools, and (eventually) micro editor surfaces—ideal for iterating without rebuilding the WASM/editor stack.

## Goals

- Fast feedback loop for `.grida` exports without booting the full editor stack.
- Provide a convenient harness for reproducing rendering bugs on macOS/Linux/Windows.
- Stress-test renderer changes (caching, hit-testing, resources) entirely in Rust.
- Serve as the host for upcoming CLI devtools / micro editor flows (scripting, inspectors, etc.).

## Commands

```bash
# Interactive window — drop files to load, or pass a file/URL directly
cargo run -p grida_dev
cargo run -p grida_dev -- path/to/scene.grida
cargo run -p grida_dev -- icon.svg

# Headless GPU benchmark (no window, prints per-frame stats)
cargo run -p grida_dev --release -- bench ./fixtures/test-grida/bench.grida
cargo run -p grida_dev --release -- bench --size 100

# Resize benchmark — measures resize() + redraw() cost per cycle
cargo run -p grida_dev --release -- bench ./fixtures/test-grida/bench.grida --resize
cargo run -p grida_dev --release -- bench --size 100 --resize --frames 50
```

## Performance measurement

> **Always use `--release` for benchmarks and performance testing.**
> Debug builds are ~20-30× slower and produce meaningless performance data.

Use the `bench` subcommand for headless GPU measurement. It reports
avg/p50/p95/p99 frame latencies without window/vsync overhead.

Do **not** draw conclusions from debug-mode frame rates.

## SVG reftest

One CLI surface for the resvg-test-suite reftest harness. Use these
instead of poking `report.json` with `jq`:

```bash
cargo run --release -p grida_dev -- reftest run        # render + score
cargo run --release -p grida_dev -- reftest bake       # one-time: bake Chrome PNGs
cargo run --release -p grida_dev -- reftest summary    # headline + worst-N (--json for parsing)
cargo run --release -p grida_dev -- reftest inspect <fixture>   # full per-fixture diagnostic
cargo run --release -p grida_dev -- reftest view <result-dir>   # serve dashboard
```

`inspect` accepts either `cat_group_name` (test-name form, as in
`report.json`) or `cat/group/name.svg` (suite-relative path), and
prints oracle flags, scores, and image paths. Add `--json` to consume
programmatically.

`summary` reads `target/reftests/resvg-test-suite.htmlcss/report.json`
by default and reports the consensus pass-rate (the headline parity
number) plus the top-10 worst consensus failures — the real-bug
shortlist. Add `--json` for orchestration.

The harness scores each fixture against `expected.png` and (when a
Chrome baseline is baked) `chrome.png`, classifying by upstream
`results.csv` into consensus / disputed / UB buckets. See
[`crates/grida/src/htmlcss/svg/README.md`](../grida/src/htmlcss/svg/README.md#multi-oracle-scoring-consensus--disputed--ub).

## Notes

- The binary hosts the native window stack internally but still uses the shared `UnknownTargetApplication`, so it inherits all keyboard shortcuts from the classic demo (⌘+/- zoom, ⌘⇧C copy PNG, etc.).
- Remote scenes are fetched with `reqwest`; if you are offline, stick to local `.grida` files.
- The crate is `publish = false` and intended solely for local development workflows and devtools.
- All winit/glutin integration now lives here; the `grida` crate remains platform-agnostic.
- Expect more CLI commands/subcommands over time for dev inspectors, perf capture, etc.—this crate is the staging ground for those Rust-only utilities.
- Pass a file path or URL as an argument to load it on startup; or run with no arguments and drop files onto the window. Supported: `.grida`, `.grida1`, `.svg`, `.png`, `.jpg/.jpeg`, `.webp`. Multi-scene files support PageUp/PageDown.
- Do **not** launch the windowed demo yourself. It spins up a native winit event loop that agents cannot stop, inspect, or debug reliably. Use the forthcoming debug/tooling protocols instead once they land.
