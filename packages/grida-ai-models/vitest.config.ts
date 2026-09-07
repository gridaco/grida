import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  test: {
    globals: true,
  },
});
