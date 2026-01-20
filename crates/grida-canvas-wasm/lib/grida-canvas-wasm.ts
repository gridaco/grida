// Thin wrapper so tsup can treat the Emscripten glue as external.
//
// Runtime: we want `dist/grida-canvas-wasm.js` (copied via `publicDir`) to be
// imported directly (not bundled into `dist/index.js`).
//
// Types: this import is backed by `lib/bin/grida-canvas-wasm.d.ts`.
import createGridaCanvas from "./bin/grida-canvas-wasm";

export default createGridaCanvas;
