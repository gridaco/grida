import { defineConfig } from "tsdown";

/**
 * The renderer imports the neutral bindings. Host adapters import the Node
 * media service, media transport and ChatGPT host. The package manifest
 * declares each public entry point.
 */
const shared = {
  format: ["cjs", "esm"],
  dts: true,
} as const;

export default defineConfig([
  {
    ...shared,
    entry: [
      "src/index.ts",
      "src/tiers.ts",
      "src/fs/index.ts",
      "src/fs/backends/opfs.ts",
      "src/todos/index.ts",
      "src/surface/index.ts",
    ],
    platform: "neutral",
  },
  {
    ...shared,
    entry: [
      "src/chatgpt-host.ts",
      "src/media-server.ts",
      "src/media-transport.ts",
    ],
    platform: "node",
  },
]);
