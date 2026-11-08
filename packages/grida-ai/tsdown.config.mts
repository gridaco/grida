import { defineConfig } from "tsdown";
export default defineConfig({
  entry: [
    "src/index.ts",
    "src/providers.ts",
    "src/catalogue/index.ts",
    "src/gg-discovery.ts",
  ],
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
