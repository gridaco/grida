# `@grida/canvas-wasm`

> Grida Canvas WASM bindings.
> This crate/package contains both Cargo.toml and package.json for binding, building and publishing as a npm package.

Uses emscripten to build the WASM module.

emscripten artifacts `grida-canvas-wasm.js` and `grida-canvas-wasm.wasm`
as new apis are introduced via `main.rs`, we also need to update the `grida-canvas-wasm.d.ts` file.

Note: the artifacts are git included for faster CI builds.
