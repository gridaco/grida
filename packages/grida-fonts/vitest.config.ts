import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Typr.parse() is a synchronous full-font parse; a single large
    // variable font can take ~5s on a loaded CI runner, so the 5000ms
    // vitest default flakes. See the perf follow-up task.
    testTimeout: 30000,
  },
});
