import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["index.ts", "react.tsx"],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
});
