import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/dom/index.ts"],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
});
