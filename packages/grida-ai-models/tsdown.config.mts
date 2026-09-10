import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/grida.ts"],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
  checks: { mixedExports: false },
});
