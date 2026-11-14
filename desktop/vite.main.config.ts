import { defineConfig } from "vite";
import { builtinModules } from "module";
import { gridaBundleGuard } from "./vite.guards";

// https://vitejs.dev/config
//
// Main process native modules stay external.
// `node-pty` is externalised for the same reason: it loads a native
// `.node` addon (and `spawn-helper`) via paths relative to its
// install root. `@parcel/watcher` (issue #805 workspace watcher) is the
// third native module: it resolves a per-platform `.node` prebuild
// (`@parcel/watcher-<platform>-<arch>`) at require time, which can't be
// bundled into `main.js`.
export default defineConfig({
  build: {
    rollupOptions: {
      external: [...builtinModules, "node-pty", "@parcel/watcher"],
    },
  },
  // GRIDA-DESKTOP-BUILD-GUARD — fail the build if a @grida/* workspace
  // package is left external instead of bundled. See desktop/vite.guards.ts.
  plugins: [gridaBundleGuard()],
  define: {
    INSIDERS: process.env.INSIDERS === "1" ? 1 : 0,
  },
});
