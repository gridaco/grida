import { defineConfig } from "tsdown";

// ESM-only, zero-runtime-dep build. The package is pure logic over an injected
// filesystem port — no node/dom runtime needs — so `platform: "neutral"`.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "neutral",
  dts: true,
  clean: true,
});
