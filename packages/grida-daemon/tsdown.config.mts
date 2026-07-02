import { defineConfig } from "tsdown";

/**
 * Two build passes, one per platform:
 *
 *   - neutral: the client-safe DTO surface (handshake capabilities,
 *     workspace/file resource shapes). Browsers and renderers import
 *     these; they must never assume Node.
 *   - node:   the DaemonServer HTTP core, sandbox policy intent, and
 *     the transport client (@hono/node-server, node:fs). Consumed by
 *     host adapters (desktop sidecar, CLI) and tenants (@grida/agent).
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
    entry: ["src/index.ts"],
    platform: "neutral",
  },
  {
    ...shared,
    entry: ["src/server.ts", "src/sandbox/index.ts", "src/transport.ts"],
    platform: "node",
  },
]);
