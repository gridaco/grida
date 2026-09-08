// GRIDA-SEC-010 — standalone native adapter; lazy external OS binding, neutral root.
// GRIDA-SEC-014 — separate provider export, bundled independent TOML parser.
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/node.ts", "src/providers.ts"],
  format: ["cjs", "esm"],
  platform: "neutral",
  fixedExtension: true,
  deps: {
    alwaysBundle: ["@grida/home", "smol-toml"],
    neverBundle: [/^node:/, "@github/keytar"],
  },
  dts: true,
});
