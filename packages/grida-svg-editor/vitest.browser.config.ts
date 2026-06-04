import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

// Real-DOM test project. Runs `*.browser.test.ts` inside headless Chromium
// (via Playwright) so tests get a real SVG layout engine — `getBBox`,
// `getCTM`, `getScreenCTM`. The default `vitest.config.ts` (node env) cannot
// observe these: jsdom returns identity CTMs and zero-size bboxes, which is
// exactly why the snap/translate world-geometry bugs are invisible there.
//
// Run with: `pnpm test:browser` (see package.json).
export default defineConfig({
  test: {
    include: ["__tests__/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: "chromium" }],
    },
  },
});
