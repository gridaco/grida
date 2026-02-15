import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["index.ts", "browser.ts", "cli.ts"],
  format: ["esm"],
  outDir: "dist",
  outExtension: () => ({ js: ".mjs" }),
  dts: true,
  external: ["@grida/canvas-wasm", "commander"],
  noExternal: ["@grida/io-figma", "@grida/schema"],
  banner: { js: "#!/usr/bin/env node\n" },
  clean: true,
});
