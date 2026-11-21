import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const providerPath = require.resolve("@vitest/browser-playwright", {
  paths: [require.resolve("vitest/package.json")],
});

export default defineConfig(async () => {
  const { playwright } = await import(providerPath);
  return {
    root: fileURLToPath(new URL("../../../../../", import.meta.url)),
    css: { postcss: { plugins: [] } },
    // Next normally replaces this optional image configuration at build time.
    define: { "process.env.__NEXT_IMAGE_OPTS": "undefined" },
    optimizeDeps: {
      include: [
        "motion/react",
        "deep-equal",
        "react/jsx-runtime",
        "next/image",
        "react/jsx-dev-runtime",
        "react",
        "react-dom",
        "react-dom/client",
        "lucide-react",
        "class-variance-authority",
        "radix-ui",
        "clsx",
        "tailwind-merge",
        "cmdk",
        "date-fns",
        "sonner",
        "react-resizable-panels",
        "next-themes",
        "masonic",
        "@tiptap/react",
        "@tiptap/core",
        "@tiptap/extension-link",
        "@tiptap/extension-placeholder",
        "@tiptap/pm/markdown",
        "@tiptap/starter-kit",
        "@dnd-kit/core",
        "@dnd-kit/sortable",
        "@dnd-kit/modifiers",
        "@dnd-kit/utilities",
        "@app/ui > use-stick-to-bottom",
        "ai",
        "streamdown",
        "@streamdown/cjk",
        "@streamdown/code",
        "@streamdown/math",
        "@streamdown/mermaid",
        "@pierre/diffs",
        "@pierre/diffs/react",
        "shiki",
        "mdast-util-from-markdown",
        "mdast-util-gfm",
        "micromark-extension-gfm",
      ],
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("../../../../../", import.meta.url)),
        "server-only": fileURLToPath(
          new URL(
            "../../../../../lib/__tests__/server-only.shim.ts",
            import.meta.url
          )
        ),
      },
    },
    test: {
      include: ["app/**/composer/*.browser.tsx"],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({ launchOptions: { channel: "chrome" } }),
        instances: [{ browser: "chromium" }],
      },
    },
  };
});
