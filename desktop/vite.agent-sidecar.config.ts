import { defineConfig } from "vite";
import { builtinModules } from "module";
import { gridaBundleGuard } from "./vite.guards";

// Agent sidecar, built as a third Forge/Vite entry alongside the
// Electron main process and preload. Runs in Electron-as-Node
// (Node-only context, NO electron APIs).
//
// Externalize node builtins and Hono so they resolve from the packaged
// node_modules tree at runtime. Hono itself bundles cleanly, but
// `@hono/node-server` reaches into Node's `http`/`http2` modules via
// dynamic requires that Rollup can't see through — keep both external
// so the resolver does the work at runtime.
//
// `EDITOR_BASE_URL` is a fallback only. The desktop supervisor passes
// the runtime value from main over argv so dev (`localhost:3000`) and
// packaged (`grida.co`) cannot drift. Keep this production default for
// standalone sidecar smoke runs.
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        "hono",
        /^hono\//,
        "@hono/node-server",
        // `undici` is Node's actual fetch implementation. We import
        // `EnvHttpProxyAgent` + `setGlobalDispatcher` from it at the
        // top of agent-sidecar.ts so outbound HTTP routes
        // through srt's proxy (Node fetch ignores HTTP_PROXY env by
        // default in v6+). Externalise so the resolver does the work
        // at runtime — bundling it would pull in a large native-ish
        // surface and risk duplicating the AI SDK's own copy.
        "undici",
      ],
    },
  },
  // GRIDA-DESKTOP-BUILD-GUARD — fail the build if a @grida/* workspace
  // package is left external instead of bundled. See desktop/vite.guards.ts.
  plugins: [gridaBundleGuard()],
  define: {
    EDITOR_BASE_URL: JSON.stringify(
      process.env.EDITOR_BASE_URL ?? "https://grida.co"
    ),
  },
});
