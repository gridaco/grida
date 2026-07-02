import { Hono } from "hono";
import {
  makeCorsMiddleware,
  makeRefererGuard,
  type DaemonHttpAccess,
} from "./origin";
import { makeBasicAuthGuard } from "./auth";
import { registerHandshakeRoute } from "./routes/handshake";
import { registerFilesRoutes } from "./routes/files";
import { registerRecentRoutes } from "./routes/recent";
import { registerWorkspacesRoutes } from "./routes/workspaces";
import { FileRegistry } from "../files/registry";
import { RecentStore } from "../files/recent";
import { SecretsStore } from "../secrets";
import { AuthStore } from "../auth/file";
import { WorkspaceRegistry } from "../workspaces";
import type { DaemonCapabilities } from "../protocol/handshake";

/**
 * The per-launch services the daemon owns and hands to every tenant.
 *
 * This is the tenant seam's service contract (issue #927): a tenant gets
 * the daemon's stores — never the other way around. The daemon depends on
 * nothing tenant-specific; a tenant (e.g. `@grida/agent`) depends on this
 * package. Keep this record host-shaped: adding an AI-flavored field here
 * is a boundary violation, not a convenience.
 */
export type DaemonServices = {
  /**
   * Host-provided data directory for persistent state (`recent.json`,
   * `auth.json`, `workspaces.json`). GRIDA-SEC-004 — this is the daemon's
   * secret root; tenants place their own stores under it (e.g.
   * `sessions.db`, `endpoints.json`) and must keep shell children out of it.
   */
  user_data_path: string;
  workspaces: WorkspaceRegistry;
  files: FileRegistry;
  recent: RecentStore;
  /**
   * BYOK credential store (presence/set/delete semantics; raw reads stay
   * server-side). The STORE is daemon-owned host persistence; the `/secrets`
   * ROUTE group is tenant-registered because its allowlist vocabulary
   * (provider ids) belongs to the tenant.
   */
  secrets: SecretsStore;
};

/**
 * What a mounted tenant reports back to the daemon.
 */
export type DaemonTenantHandle = {
  /**
   * Capability flags for the route groups this tenant mounted — merged
   * into the daemon's handshake response (`DaemonCapabilities` keys are
   * the protocol vocabulary; a tenant may only turn flags ON for groups
   * it actually registered).
   */
  capabilities?: Partial<DaemonCapabilities>;
  /**
   * Abort in-flight tenant work (e.g. streamed runs). Called by the
   * daemon's shutdown BEFORE `cleanup`, while tenant stores are still
   * open, so abort reactions can finalize against them.
   */
  drain?: () => void;
  /** Close tenant-owned per-launch state (e.g. a SQLite handle). */
  cleanup?: () => void;
};

/**
 * A capability tenant: registers its route groups on the daemon's Hono
 * app using the daemon's services. Tenants are a STATIC, typed list the
 * composer supplies (see `@grida/agent/server`'s agent tenant) — this is
 * deliberately not a plugin registry (issue #927).
 */
export type DaemonTenant = {
  /**
   * GRIDA-SEC-004 — GET event-stream routes (and ONLY those) where the
   * credential may ride the `auth_token` query parameter (header-less
   * `EventSource` attach; WG daemon spec §auth-model). Declared up front
   * because the auth guard is installed before tenant routes mount.
   */
  sse_query_token_paths?: readonly RegExp[];
  register: (app: Hono, services: DaemonServices) => DaemonTenantHandle;
};

export type ServerOptions = {
  password: string;
  protocol: number;
  capabilities: DaemonCapabilities;
  /**
   * Host-provided data directory for persistent state like `recent.json`,
   * `auth.json`, and `workspaces.json`. See {@link DaemonServices}.
   */
  user_data_path: string;
  /**
   * GRIDA-SEC-004 — host-injected managed root under which the auto-create
   * flow (`POST /workspaces/create`) mints new project folders (desktop:
   * `~/Documents/Grida`). Host-owned, never client-derived. Omitted on hosts
   * that don't wire it (CLI/dev), where `createProject` throws.
   */
  projects_root?: string;
  /** Host/client HTTP perimeter policy for CORS + Referer checks. */
  http_access: DaemonHttpAccess;
  /** Capability tenants to mount behind the perimeter. */
  tenants?: readonly DaemonTenant[];
};

/**
 * Bundled return shape: the Hono `app` (whose `fetch` handler the
 * Node adapter calls) plus `drain`/`cleanup` for owners of state that
 * outlives a single request. DaemonServer calls both on shutdown.
 *
 * Why not a Hono "onClose" hook? Hono is request/response only — it
 * doesn't own a server lifecycle. The Node adapter (`@hono/node-server`)
 * owns the underlying `http.Server`; lifecycle is its job, not Hono's.
 */
export type BuiltServer = {
  app: Hono;
  /** Abort in-flight tenant work. Call BEFORE `cleanup`. */
  drain: () => void;
  cleanup: () => void;
};

/**
 * Builds the daemon's Hono app.
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
 * All registered with `app.use('*', ...)` so they attach to every route —
 * tenant routes included (tenants mount after the guards).
 */
export function buildServer(opts: ServerOptions): BuiltServer {
  const app = new Hono();
  const tenants = opts.tenants ?? [];

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
  // GRIDA-SEC-004 — the ONLY routes where the credential may ride the
  // `auth_token` query parameter are the GET event-stream routes each
  // tenant declares (`sse_query_token_paths`); the daemon itself serves
  // none. Declared before mount because this guard wraps every route.
  const basicAuthGuard = makeBasicAuthGuard(opts.password, {
    query_token_paths: tenants.flatMap((t) => t.sse_query_token_paths ?? []),
  });
  app.use("*", basicAuthGuard);

  // Per-launch daemon state (registry is in-memory and resets on restart;
  // recent.json / auth.json / workspaces.json are on disk and persist).
  const services: DaemonServices = {
    user_data_path: opts.user_data_path,
    files: new FileRegistry(),
    recent: new RecentStore(opts.user_data_path),
    workspaces: new WorkspaceRegistry(opts.user_data_path, opts.projects_root),
    secrets: new SecretsStore(new AuthStore(opts.user_data_path)),
  };

  // Daemon-owned routes. Capabilities describe the route groups mounted.
  if (opts.capabilities.files) registerFilesRoutes(app, services.files);
  if (opts.capabilities.recent) registerRecentRoutes(app, services.recent);
  if (opts.capabilities.workspaces)
    registerWorkspacesRoutes(app, services.workspaces);

  // Tenants mount behind the same perimeter and report their capability
  // flags, which merge into the handshake response.
  const handles = tenants.map((t) => t.register(app, services));
  const capabilities = handles.reduce<DaemonCapabilities>(
    (acc, h) => ({ ...acc, ...h.capabilities }),
    opts.capabilities
  );

  registerHandshakeRoute(app, { protocol: opts.protocol, capabilities });

  return {
    app,
    drain: () => {
      for (const h of handles) h.drain?.();
    },
    cleanup: () => {
      for (const h of handles) h.cleanup?.();
    },
  };
}
