import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "index.ts",
    "_blob.ts",
    "_dnd.ts",
    "_layout.ts",
    "_measurement.ts",
    "_snap.ts",
  ],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
});
