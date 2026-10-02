import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/ciam-verification.tsx"],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
});
