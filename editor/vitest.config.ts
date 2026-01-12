import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: ".",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      "**/.next/**",
      "**/dist/**",
      "**/e2e/**",
    ],
  },
});
