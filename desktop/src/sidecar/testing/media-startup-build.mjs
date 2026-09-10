// GRIDA-SEC-004 — build the real sidecar config without dotenv or host configuration.
import { build } from "vite";
import path from "node:path";

const [desktop, output] = process.argv.slice(2);
if (!desktop || !output) throw new Error("missing owned build paths");
await build({
  root: desktop,
  configFile: path.join(desktop, "vite.agent-sidecar.config.ts"),
  envDir: false,
  logLevel: "error",
  define: { EDITOR_BASE_URL: JSON.stringify("https://example.invalid") },
  build: {
    outDir: output,
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: path.join(desktop, "src/agent-sidecar.ts"),
      formats: ["cjs"],
      fileName: () => "sidecar.cjs",
    },
  },
});
