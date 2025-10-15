default:
    just --list

# Run type checking and cargo check
check:
    turbo typecheck
    cargo check --all-targets --all-features

# Run tests
test: turbo test


# Build canvas WASM using the dedicated justfile in crates/grida-canvas-wasm
build canvas wasm:
    just --justfile crates/grida-canvas-wasm/justfile build

# Serve canvas WASM
serve canvas wasm:
    pnpm --filter @grida/canvas-wasm serve

# Package canvas WASM
package canvas wasm:
    just --justfile crates/grida-canvas-wasm/justfile package