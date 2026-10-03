import { defineNitroConfig } from "nitropack/config";

export default defineNitroConfig({
  srcDir: "server",
  preset: "vercel",
  compatibilityDate: "2026-10-02",
  imports: false,
  esbuild: { options: { jsx: "automatic", jsxImportSource: "react" } },
  errorHandler: "~/error-handler",
  serveStatic: false,
  noPublicDir: true,
  vercel: {
    functions: { runtime: "nodejs24.x", maxDuration: 60 },
  },
});
