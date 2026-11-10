import { defineConfig } from "tsdown";

/**
 * The renderer imports the neutral bindings. Host adapters import the Node
 * service, transport, ACP and sandbox exports. The package manifest declares
 * each public entry point.
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
      "src/vision/index.ts",
      // Web-safe: the renderer resolves `design_search` client-side, so it needs
      // the tool's name + result types (only `ai` + zod, no node).
      "src/tools/design-search.ts",
    ],
    platform: "neutral",
  },
  {
    ...shared,
    entry: [
      "src/server.ts",
      "src/chatgpt-host.ts",
      "src/media-server.ts",
      "src/sandbox/index.ts",
      "src/transport.ts",
      "src/acp/index.ts",
    ],
    platform: "node",
  },
]);
