import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Forms contracts never load a developer or hosted environment.
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  envDir: false,
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: [
      "services/form/public-routes.test.ts",
      "scaffolds/panels/row-create.test.ts",
      "i18n/server.test.ts",
    ],
  },
});
