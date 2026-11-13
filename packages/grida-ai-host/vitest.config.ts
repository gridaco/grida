import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `*.browser.test.ts` runs under the browser-engine system harness
    // (vitest browser mode + playwright, `vitest.browser.config.ts`) —
    // never in this Node run.
    exclude: [...configDefaults.exclude, "**/*.browser.test.ts"],
  },
});
