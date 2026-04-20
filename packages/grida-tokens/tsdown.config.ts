import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/utils.ts", "src/locales.ts"],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
});
