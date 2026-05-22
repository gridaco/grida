import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/fs/index.ts",
    "src/fs/backends/opfs.ts",
    "src/fs/backends/node.ts",
    "src/todos/index.ts",
  ],
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
});
