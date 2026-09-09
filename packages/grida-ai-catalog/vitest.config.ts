import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@grida/ai-models": fileURLToPath(
        new URL("../grida-ai-models/src/index.ts", import.meta.url)
      ),
    },
  },
  test: { globals: true },
});
