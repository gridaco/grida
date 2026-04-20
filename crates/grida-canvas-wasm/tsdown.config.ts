import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["lib/index.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // Emit `.js` for CJS / `.mjs` for ESM so package.json `main: dist/index.js`
  // keeps resolving. Default (`platform: "node"`) would emit `.cjs`.
  fixedExtension: false,
  // Copy the Emscripten glue + wasm blob to dist root. A glob with flatten
  // (default) places files directly in dist/.
  copy: "./lib/bin/*",
  // Keep the Emscripten glue as a separate file in dist/ so bundlers
  // (Turbopack) don't try to resolve Node built-ins from it.
  deps: {
    neverBundle: ["./grida-canvas-wasm"],
  },
});
