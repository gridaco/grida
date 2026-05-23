import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/dom.ts", "src/react.tsx", "src/presets.ts"],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
});
