import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  platform: "neutral",
  fixedExtension: true,
  // Preserve the auth producer's Failure class identity across the public seam.
  deps: { neverBundle: ["@grida/auth"] },
  dts: true,
});
