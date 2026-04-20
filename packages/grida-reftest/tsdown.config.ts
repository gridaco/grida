import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  outDir: "dist",
  dts: true,
  clean: true,
  // Package is `type: "module"` and publishes `dist/index.js`. Without this,
  // tsdown would emit `.mjs` under platform=node.
  fixedExtension: false,
});
