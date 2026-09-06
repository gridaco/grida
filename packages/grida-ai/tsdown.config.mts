import { defineConfig } from "tsdown";
export default defineConfig({
  entry: ["src/index.ts", "src/providers.ts"],
  format: ["cjs", "esm"],
  platform: "neutral",
  fixedExtension: true,
  deps: {
    neverBundle: [
      "@ai-sdk/gateway",
      "@ai-sdk/provider",
      "@grida/ai-models",
      "ai",
    ],
  },
  dts: true,
});
