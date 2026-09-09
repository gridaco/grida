// GRIDA-SEC-012 — API checks never load a developer or hosted environment.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

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
      "lib/api/**/*.test.ts",
      "lib/account/**/*.test.ts",
      "lib/supabase/account-data.test.ts",
      "lib/supabase/credits-data.test.ts",
      "lib/supabase/gg-data.test.ts",
      "lib/gg/**/*.test.ts",
      "lib/auth/gg-token.test.ts",
      "app/desktop/auth/token/route.test.ts",
      "lib/desktop/gg-session.test.ts",
      "lib/ai/openai-compat/hosted-models.test.ts",
      "lib/billing/credits.test.ts",
      "lib/billing/metronome-entitlement.test.ts",
      "scripts/audit-api.test.ts",
      "lib/auth/__tests__/oauth-*.test.{ts,tsx}",
      "lib/tenant/middleware.test.ts",
      "proxy.test.ts",
    ],
    environment: "node",
  },
});
