import { Hono } from "hono";
import {
  makeCorsMiddleware,
  makeRefererGuard,
  type AgentServerHttpAccess,
} from "./origin";
import { makeBasicAuthGuard } from "./auth";
import {
  registerHandshakeRoute,
  type AgentServerCapabilities,
} from "./routes/handshake";
import { registerFilesRoutes } from "./routes/files";
import { registerRecentRoutes } from "./routes/recent";
import { registerSecretsRoutes } from "./routes/secrets";
import { registerAgentRoutes } from "./routes/agent";
import { registerWorkspacesRoutes } from "./routes/workspaces";
import { registerSessionsRoutes } from "./routes/sessions";
import { FileRegistry } from "../files/registry";
import { RecentStore } from "../files/recent";
import { AuthStore } from "../auth/file";
import { SecretsStore } from "../secrets";
import { WorkspaceRegistry } from "../workspaces";
import { openSessionsDb } from "../session/db";
import { SessionsStore } from "../session/store";
import { AgentRuntime } from "../runtime";
import type { StreamRegistry } from "../runtime/stream-registry";

export type ServerOptions = {
  password: string;
  protocol: number;
  capabilities: AgentServerCapabilities;
  /**
   * Host-provided data directory for persistent state like `recent.json`,
   * `auth.json`, and `sessions.db`.
   */
  user_data_path: string;
  /** Host/client HTTP perimeter policy for CORS + Referer checks. */
  http_access: AgentServerHttpAccess;
  /**
   * Optional in-flight agent-run registry. `AgentHost` injects this so
   * shutdown can drain runs deterministically before closing SQLite.
   */
  stream_registry?: StreamRegistry;
};

/**
 * Bundled return shape: the Hono `app` (whose `fetch` handler the
 * Node adapter calls) plus a `cleanup` for owners of state that
 * outlives a single request. AgentHost calls cleanup on shutdown.
 *
 * Why not a Hono "onClose" hook? Hono is request/response only — it
 * doesn't own a server lifecycle. The Node adapter (`@hono/node-server`)
 * owns the underlying `http.Server`; lifecycle is its job, not Hono's.
 */
export type BuiltServer = {
  app: Hono;
  cleanup: () => void;
};

/**
 * Builds the AgentHost Hono app.
 *
 * Middleware ordering matters:
 *   1. CORS — `hono/cors`. Runs first so it can short-circuit
 *      OPTIONS preflights with the right ACAO + Allow-Headers / Methods
 *      BEFORE any other guard. It also installs ACAO on every later
 *      response — buffered, streaming, AND early-return Responses from
 *      downstream middleware (the basic-auth 401 included).
 *   2. Referer guard — checks that the `Referer` matches the
 *      host-provided client route roots. Defense-in-depth against a
 *      hostile same-origin page that somehow acquired the basic-auth
 *      password.
 *   3. `basicAuthGuard` — per-request password check; constant-time.
 *
 * All registered with `app.use('*', ...)` so they attach to every route.
 */
export function buildServer(opts: ServerOptions): BuiltServer {
  const app = new Hono();

  // 1. CORS — `hono/cors`. Answers preflight; sets `Access-Control-Allow-Origin`
  //    on every downstream response regardless of shape (buffered, streaming, SSE).
  //    Rolling our own with `c.header()` ran into Hono lifecycle gotchas where
  //    mutations relative to `next()` interacted differently across response
  //    shapes (CORS errors landed on `/agent/run`, then `/files/read`
  //    once a docId was opened). The official middleware sidesteps that.
  app.use("*", makeCorsMiddleware(opts.http_access));

  // 2. Referer-path guard — defense-in-depth so a same-origin XSS that
  //    somehow obtained the basic-auth password still can't reach the server.
  app.use("*", makeRefererGuard(opts.http_access));

  // 3. Basic Auth — runs after CORS + referer clear. Preflights are handled
  //    by `corsMiddleware` upstream and never reach this guard.
  const basicAuthGuard = makeBasicAuthGuard(opts.password);
  app.use("*", basicAuthGuard);

  // Per-launch state lives at the agent-server scope (registry is in-memory
  // and resets on restart; recent.json / auth.json are on disk and persist).
  const registry = new FileRegistry();
  const recentStore = new RecentStore(opts.user_data_path);
  const workspaceRegistry = new WorkspaceRegistry(opts.user_data_path);
  const authStore = new AuthStore(opts.user_data_path);
  const secretsStore = new SecretsStore(authStore);
  // Chat sessions: SQLite at ${userData}/sessions.db. Opened once per
  // agent-host launch and closed via the returned cleanup. WAL mode in
  // sessions/db.ts lets a CLI inspector read concurrently.
  const sessionsDb = openSessionsDb({ user_data_path: opts.user_data_path });
  const sessionsStore = new SessionsStore(sessionsDb);
  // Routes. Capabilities describe the route groups this host mounted.
  registerHandshakeRoute(app, {
    protocol: opts.protocol,
    capabilities: opts.capabilities,
  });
  if (opts.capabilities.files) registerFilesRoutes(app, registry);
  if (opts.capabilities.recent) registerRecentRoutes(app, recentStore);
  if (opts.capabilities.workspaces)
    registerWorkspacesRoutes(app, workspaceRegistry);
  if (opts.capabilities.secrets) {
    registerSecretsRoutes(app, {
      store: secretsStore,
    });
  }
  // Agent runtime owns the run loop + the in-flight stream registry.
  // `opts.streamRegistry` is undefined for direct callers (the runtime
  // allocates its own); AgentHost injects a shared instance so its
  // stop() can drain in-flight runs before closing SQLite.
  const runtime = new AgentRuntime({
    secrets: secretsStore,
    workspace_registry: workspaceRegistry,
    sessions_store: sessionsStore,
    streams: opts.stream_registry,
  });
  if (opts.capabilities.agent) registerAgentRoutes(app, runtime);
  if (opts.capabilities.sessions)
    registerSessionsRoutes(app, { store: sessionsStore, runtime });

  return {
    app,
    cleanup: () => {
      runtime.dispose();
      sessionsStore.close();
    },
  };
}
