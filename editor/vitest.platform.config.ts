// Local product/billing boundary lane: never reads developer or hosted env files.
import { defineConfig } from "vitest/config";
import api from "./vitest.api.config";
export default defineConfig({
  ...api,
  test: {
    ...api.test,
    include: [
      "lib/platform/**/*.test.ts",
      "lib/ai/fixture-gateway.test.ts",
      "lib/ai/__tests__/server.test.ts",
      "lib/ai/__tests__/gg-three-d.test.ts",
      "app/(api)/(public)/api/v1/ai/chat/completions/route.test.ts",
      "app/(api)/(public)/api/v1/ai/chat/completions/route.byok.test.ts",
      "app/(api)/(public)/api/v1/ai/images/generations/route.test.ts",
      "lib/billing/metronome-entitlement.test.ts",
    ],
  },
});
