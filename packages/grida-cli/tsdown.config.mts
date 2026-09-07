// GRIDA-SEC-010 — bundle account owners; optional native keyring loading stays lazy.
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  fixedExtension: true,
  deps: {
    alwaysBundle: [/^@grida\//],
    neverBundle: [/^node:/, "@github/keytar"],
  },
});
