// Billing seam checks never discover provider credentials or local dotenv.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  envDir: false,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./lib/__tests__/server-only.shim.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: [
      "lib/platform/product-billing.test.ts",
      "app/(api)/(public)/api/v1/ai/chat/completions/route.test.ts",
      "app/(api)/(public)/api/v1/ai/images/generations/route.test.ts",
      "lib/platform/product-receipts.test.ts",
      "lib/ai/__tests__/server.test.ts",
      "lib/ai/__tests__/generate-video.test.ts",
      "lib/ai/__tests__/gg-three-d.test.ts",
      "lib/ai/__tests__/replicate-credentials.test.ts",
    ],
  },
});
