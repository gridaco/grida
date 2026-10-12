// Free tests have no developer/production .env files and no vendor credentials.
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  envDir: false,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./lib/__tests__/server-only.shim.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    testTimeout: 30_000,
    include: ["lib/ai/gateway-product.integration.ts"],
  },
});
