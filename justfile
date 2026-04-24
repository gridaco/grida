default:
    just --list

# Format the entire repo (JS/TS via oxfmt + Rust via cargo fmt)
fmt:
    pnpm fmt
    cargo fmt --all

# Run type checking and cargo check
check:
    pnpm turbo typecheck
    pnpm fmt:check
    cargo check --all-targets --all-features
    cargo fmt --all -- --check
    cargo clippy --no-deps -- -D warnings

# Run tests
test:
    pnpm turbo test

# Dev setup
dev packages:
    pnpm dev:packages

# Build canvas WASM using the dedicated justfile in crates/grida-canvas-wasm
build canvas wasm:
    just --justfile crates/grida-canvas-wasm/justfile build

# Serve canvas WASM
serve canvas wasm:
    pnpm --filter @grida/canvas-wasm serve

# Package canvas WASM
package canvas wasm:
    just --justfile crates/grida-canvas-wasm/justfile package

# Run web-platform-tests against the grida_wpt binary. Requires the
# `gridaco/wpt` fork cloned as a sibling (../wpt). Default target is
# the whole css/ suite; pass a narrower path for pilot runs.
# See docs/contributing/wpt.md for details.
#
#   just wpt                                       # css/ (the default)
#   just wpt css/css-transforms/                   # one subsuite
#   just wpt css/css-transforms/2d-rotate-001.html # one file
wpt target="css/":
    cargo build -p grida_wpt --release
    cd ../wpt && ./wpt run \
        --binary="{{justfile_directory()}}/target/release/grida_wpt" \
        --log-wptreport="{{justfile_directory()}}/target/wpt-report.json" \
        --log-mach=- \
        --log-mach-level=info \
        grida \
        {{target}}