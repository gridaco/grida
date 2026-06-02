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
  // The `node` backend imports `node:fs/promises` / `node:path`. Under the
  // "neutral" platform rolldown can't resolve node builtins and emits an
  // UNRESOLVED_IMPORT warning, even though keeping them external is exactly
  // what we want (this entry is Node-only; the opfs backend is the browser
  // path). Mark them external explicitly to silence the warning.
  deps: { neverBundle: [/^node:/] },
  dts: true,
});
