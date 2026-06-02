import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/pathdata/index.ts",
    "src/parse/index.ts",
    "src/parser/index.ts",
  ],
  dts: true,
  format: ["esm", "cjs"],
  sourcemap: true,
});
