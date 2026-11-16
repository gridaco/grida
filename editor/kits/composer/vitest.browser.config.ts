import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
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
    // The React suite renders the composer, which imports its stylesheet;
    // skip the app's Tailwind PostCSS pipeline as the node suite does.
    css: { postcss: { plugins: [] } },
    resolve: {
      alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) },
    },
    test: {
      include: ["kits/composer/*.browser.{ts,tsx}"],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({ launchOptions: { channel: "chrome" } }),
        instances: [{ browser: "chromium" }],
      },
    },
  };
});
