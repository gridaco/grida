import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60000,
    exclude: [...configDefaults.exclude, "**/dist/**"],
  },
});
