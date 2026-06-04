import { defineConfig } from "tsdown";

// platform "node" (NOT the usual small-package "neutral"): this package reads
// node:os / node:path and process.env — it is a Node-host path resolver with no
// browser story. "node" keeps node:* external instead of attempting to bundle them.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  platform: "node",
  dts: true,
});
