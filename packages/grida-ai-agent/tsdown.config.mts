import { defineConfig } from "tsdown";

/**
 * Two build passes, one per platform — preserving the platform split the
 * three merged packages had before consolidation:
 *
 *   - neutral: the renderer/web-safe surface (the Grida agent, tiers,
 *     the virtual fs core + OPFS backend, todos). The editor's web
 *     /svg route imports these; they must never assume Node.
 *   - node:   the AgentHost HTTP core, sandbox policy intent, CLI, and
 *     the transport helper (node:fs, node:sqlite, child_process,
 *     @hono/node-server). Consumed by Node host adapters and the CLI.
 *     The Node fs backend is no longer a public entry (internal + tests).
 *
 * Subpath exports in package.json gate which entry a consumer can reach.
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
      "src/sandbox/index.ts",
      "src/transport.ts",
      "src/acp/index.ts",
      "src/cli.ts",
      "src/cli.bin.ts",
    ],
    platform: "node",
  },
]);
