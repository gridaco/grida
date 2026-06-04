import { defineConfig } from "vite";
import { builtinModules } from "module";

// https://vitejs.dev/config
//
// Main process. `@anthropic-ai/sandbox-runtime` is externalised:
// the package spawns external binaries (`sandbox-exec`,
// `bubblewrap`) and references vendored helpers via filesystem
// paths relative to its own install root. Bundling those paths
// into `.vite/build/main.js` breaks resolution at runtime.
export default defineConfig({
  build: {
    rollupOptions: {
      external: [...builtinModules, "@anthropic-ai/sandbox-runtime"],
    },
  },
  define: {
    INSIDERS: process.env.INSIDERS === "1" ? 1 : 0,
  },
});
