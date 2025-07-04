import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["lib/index.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  publicDir: "./lib/bin",
});
