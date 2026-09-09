// GRIDA-SEC-010 — standalone native adapter; lazy external OS binding, neutral root.
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/node.ts"],
  format: ["cjs", "esm"],
  platform: "neutral",
  fixedExtension: true,
  deps: {
    alwaysBundle: ["@grida/home"],
    neverBundle: [/^node:/, "@github/keytar"],
  },
  dts: true,
});
