// GRIDA-SEC-011 — offline auth contracts never load the editor environment.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Offline producer contracts: intentionally does not load any .env files. */
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
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
    include: [
      "lib/auth/__tests__/oauth-*.test.{ts,tsx}",
      "lib/tenant/middleware.test.ts",
    ],
    environment: "node",
  },
});
