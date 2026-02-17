import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Run test files sequentially — they share the WASM runtime and a common
    // output directory (__tests__/.tmp/).
    fileParallelism: false,
    testTimeout: 60000,
    // Disable Figma default font loading in tests (avoids slow CDN fetches).
    env: { REFIG_SKIP_DEFAULT_FONTS: "1" },
  },
});
