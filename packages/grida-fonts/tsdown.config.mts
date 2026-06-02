import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "google.ts",
    "fontface.ts",
    "fontface-dom.ts",
    "typr/index.ts",
    "parse/index.ts",
    "parser-worker/index.ts",
    "parser-worker/worker.ts",
    "k.ts",
  ],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
  checks: { emptyImportMeta: false },
});
