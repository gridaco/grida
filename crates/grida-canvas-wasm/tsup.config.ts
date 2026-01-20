import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["lib/index.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  publicDir: "./lib/bin",
  // Keep the Emscripten glue as a separate file in dist/ (copied via publicDir).
  // This avoids bundling it into dist/index.js where bundlers (Turbopack) may
  // try to resolve Node built-ins.
  external: ["./grida-canvas-wasm"],
});
