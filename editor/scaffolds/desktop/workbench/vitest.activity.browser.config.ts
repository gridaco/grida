import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const providerPath = require.resolve("@vitest/browser-playwright", {
  paths: [require.resolve("vitest/package.json")],
});
const tailwind = require("@tailwindcss/postcss");
const editorRoot = fileURLToPath(new URL("../../../", import.meta.url));

export default defineConfig(async () => {
  const { playwright } = await import(providerPath);
  return {
    root: editorRoot,
    css: { postcss: { plugins: [tailwind()] } },
    define: { "process.env.__NEXT_IMAGE_OPTS": "undefined" },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "lucide-react",
        "radix-ui",
        "motion/react",
        "class-variance-authority",
        "clsx",
        "tailwind-merge",
        "next/image",
        "streamdown",
        "@streamdown/cjk",
        "@streamdown/code",
        "@streamdown/math",
        "@streamdown/mermaid",
      ],
    },
    resolve: {
      alias: {
        "@": editorRoot,
        "server-only": fileURLToPath(
          new URL("../../../lib/__tests__/server-only.shim.ts", import.meta.url)
        ),
      },
    },
    test: {
      include: [
        "scaffolds/desktop/workbench/native-agent-activity.browser.tsx",
      ],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({ launchOptions: { channel: "chrome" } }),
        instances: [{ browser: "chromium" }],
      },
    },
  };
});
