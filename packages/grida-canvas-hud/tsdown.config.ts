import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "index.ts",
    "react.tsx",
    "cursors/index.ts",
    "core/index.ts",
    "primitives/bedrock.ts",
  ],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
});
