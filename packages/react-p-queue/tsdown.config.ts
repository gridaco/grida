import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["index.tsx"],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
});
