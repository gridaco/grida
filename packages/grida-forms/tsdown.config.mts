import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/templating.ts"],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
});
