import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  test: { environment: "node", globals: true },
});
