import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    // Real-DOM tests run in headless Chromium via `vitest.browser.config.ts`
    // (`pnpm test:browser`); they must not run under node (no getBBox/getCTM).
    // node_modules / dist are excluded by Vitest's defaults already.
    exclude: ["**/*.browser.test.ts"],
  },
});
