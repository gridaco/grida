import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./lib/", import.meta.url)),
    },
  },
  test: {
    globals: true,
    testTimeout: 30000, // allow time for WASM-related tests
  },
});

