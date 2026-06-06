import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["index.ts", "logos.ts"],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
  // Emit one output file per source module (no cross-module bundling) so each
  // file keeps its own `"use client"` directive. Only the paint swatches are
  // client components; the rest stay RSC-safe. A single bundled chunk would
  // force a choice between dropping the directive (paint breaks in RSC) or
  // hoisting it to the whole entry (the clean icons lose RSC rendering).
  unbundle: true,
});
