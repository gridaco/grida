import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

// Resolve the browser provider installed alongside Vitest, including pnpm's
// isolated dependency layout.
const require = createRequire(import.meta.url);
const providerPath = require.resolve("@vitest/browser-playwright", {
  paths: [require.resolve("vitest/package.json")],
});

export default defineConfig(async () => {
  const { playwright } = await import(providerPath);
  return {
    test: {
      include: ["kits/composer/*.browser.ts"],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({ launchOptions: { channel: "chrome" } }),
        instances: [{ browser: "chromium" }],
      },
    },
  };
});
