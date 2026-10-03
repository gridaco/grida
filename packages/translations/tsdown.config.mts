import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/forms.ts"],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
});
