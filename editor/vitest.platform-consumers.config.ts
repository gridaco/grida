// M4 source consumer proof: no dotenv files and no hosted/vendor credentials.
import { defineConfig } from "vitest/config";
import api from "./vitest.api.config";
export default defineConfig({
  ...api,
  test: {
    ...api.test,
    include: [
      "lib/platform/**/*.test.ts",
      "lib/desktop/billing*.test.ts",
      "app/desktop/billing/summary/route.test.ts",
      "app/desktop/auth/**/*.test.{ts,tsx}",
      "lib/ai/credits/**/*.test.ts",
      "lib/api/credits.test.ts",
      "lib/billing/credits.test.ts",
      "lib/supabase/credits-data.test.ts",
      "scripts/audit-api.test.ts",
    ],
  },
});
