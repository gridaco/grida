import { defineConfig } from "vite";
import { gridaBundleGuard } from "./vite.guards";

// https://vitejs.dev/config
//
// Preload value-imports `@grida/agent`, so it carries the same
// silent-broken-bundle risk as the main process.
export default defineConfig({
  // GRIDA-DESKTOP-BUILD-GUARD — fail the build if a @grida/* workspace
  // package is left external instead of bundled. See desktop/vite.guards.ts.
  plugins: [gridaBundleGuard()],
});
