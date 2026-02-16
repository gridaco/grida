import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["index.ts", "browser.ts", "cli.ts"],
  format: ["esm"],
  outDir: "dist",
  dts: true,
  external: ["@grida/canvas-wasm", "commander"],
  noExternal: [/^@grida\/(?!canvas-wasm$)/],
  clean: true,
});
