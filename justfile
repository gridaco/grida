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