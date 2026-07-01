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
import { registerProvidersRoutes } from "./routes/providers";
import { registerImagesRoutes } from "./routes/images";
import { registerVideoRoutes } from "./routes/video";
import { registerAgentRoutes } from "./routes/agent";
import { registerWorkspacesRoutes } from "./routes/workspaces";
import { registerSessionsRoutes } from "./routes/sessions";
import { FileRegistry } from "../files/registry";
import { RecentStore } from "../files/recent";
import { AuthStore } from "../auth/file";
import { SecretsStore } from "../secrets";
import { EndpointProvidersStore } from "../providers/endpoints";
import { WorkspaceRegistry } from "../workspaces";
import { openSessionsDb } from "../session/db";
import { SessionsStore } from "../session/store";
import { AgentRuntime } from "../runtime";
import type { StreamRegistry } from "../runtime/stream-registry";
import { defaultScratchBase, sweepScratch } from "../session/scratch";

export type ServerOptions = {
  password: string;
  protocol: number;
  capabilities: AgentServerCapabilities;
  /**
   * Host-provided data directory for persistent state like `recent.json`,
   * `auth.json`, and `sessions.db`.
   */
  user_data_path: string;
  /**
   * Base directory for per-session scratch areas (WG `scratch.md`). Defaults to
   * {@link defaultScratchBase} (`<os.tmpdir()>/grida-agent-<host-tag>`, namespaced
   * per host by `user_data_path`) when omitted — filesystem location is host-owned
   * I/O, so the default lives here at the adapter boundary, not in the runtime
   * core. MUST be outside `user_data_path` (the secret root) or the runtime's
   * containment assert rejects it. A future host with a different filesystem
   * reality (a cloud sandbox) injects its own.
   */
  scratch_base?: string;
  /**
   * Catalog model id the agent's `generate_image` tool produces with — the
   * user's selected image model (host config). The tool is prompt-only, so the
   * model is not an agent argument. Omit to use the catalog default.
   */
  image_model_id?: string;
  /** Host/client HTTP perimeter policy for CORS + Referer checks. */
  http_access: AgentServerHttpAccess;
  /**
   * Optional in-flight agent-run registry. `AgentHost` injects this so
   * shutdown can drain runs deterministically before closing SQLite.
   */
  stream_registry?: StreamRegistry;
  /**
   * GRIDA-SEC-004 — OS sandbox confines the process tree (set by the host).
   * Inputs to the single fail-closed shell decision computed in `buildServer`.
   */
  sandbox_enforced?: boolean;
  /** GRIDA-SEC-004 — explicit unsandboxed-shell opt-in (CLI/dev). */
  allow_unsandboxed_shell?: boolean;
  /**
   * Whether a human UI is bound to this host — i.e. the locked `question`
   * tool can pause and be answered by a person. Default (undefined/false) is
   * FAIL-CLOSED headless: the `question` tool refuses with a fixed tool error
   * instead of pausing forever (RFC `tools` §question). The desktop sidecar
   * sets this true; the CLI and hosted/batch paths leave it false.
   */
  interactive?: boolean;
  /**
   * Whether clients can resolve a Grida Library search — gates the
   * `design_search` tool (client-resolved). The desktop sidecar sets this true.
   */
  library?: boolean;
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
  // GRIDA-SEC-004 — the ONLY routes where the credential may ride the
  // `auth_token` query parameter (header-less EventSource attach; WG daemon
  // spec §auth-model). GET event-stream routes exclusively — keep in sync
  // with the SSE routes registered in routes/agent.ts and routes/sessions.ts.
  const sseQueryTokenPaths = [
    /^\/agent\/stream\/[^/]+$/,
    /^\/sessions\/[^/]+\/status$/,
  ];
  const basicAuthGuard = makeBasicAuthGuard(opts.password, {
    query_token_paths: sseQueryTokenPaths,
  });
  app.use("*", basicAuthGuard);

  // Per-launch state lives at the agent-server scope (registry is in-memory
  // and resets on restart; recent.json / auth.json are on disk and persist).
  const registry = new FileRegistry();
  const recentStore = new RecentStore(opts.user_data_path);
  const workspaceRegistry = new WorkspaceRegistry(opts.user_data_path);
  const authStore = new AuthStore(opts.user_data_path);
  const secretsStore = new SecretsStore(authStore);
  // Endpoint provider configs (issue #806): plain config beside the
  // secrets store, persisted at ${userData}/endpoints.json.
  const endpointsStore = new EndpointProvidersStore(opts.user_data_path);
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
      endpoints: endpointsStore,
    });
  }
  if (opts.capabilities.providers) {
    registerProvidersRoutes(app, {
      endpoints: endpointsStore,
      secrets: secretsStore,
    });
  }
  if (opts.capabilities.images) {
    registerImagesRoutes(app, { secrets: secretsStore });
  }
  if (opts.capabilities.video) {
    registerVideoRoutes(app, { secrets: secretsStore });
  }
  // Agent runtime owns the run loop + the in-flight stream registry.
  // `opts.streamRegistry` is undefined for direct callers (the runtime
  // allocates its own); AgentHost injects a shared instance so its
  // stop() can drain in-flight runs before closing SQLite.
  // GRIDA-SEC-004 — the single fail-closed shell decision. Shell execution is
  // off unless the host confirmed an OS sandbox confines the tree, or it
  // explicitly opted into an unsandboxed shell. Computed here (one auditable
  // place) and threaded to the runtime → bindings → tool registry.
  const shellExecutionAllowed =
    opts.sandbox_enforced === true || opts.allow_unsandboxed_shell === true;
  if (opts.allow_unsandboxed_shell === true && opts.sandbox_enforced !== true) {
    console.warn(
      "[agent-host] GRIDA-SEC-004: run_command exposed WITHOUT an OS sandbox " +
        "(allow_unsandboxed_shell). The shell child has no kernel-level " +
        "fs/network containment — only the in-process allowlist + arg checks."
    );
  }
  // Per-session scratch base (WG `scratch.md`). Host-injected; default at this
  // adapter boundary, never in the runtime core. Sweep stale session dirs once
  // at host start — a single-instance daemon's prior in-flight scratch is dead
  // after a restart, so this bounds scratch's lifetime even across a crash (S2).
  // SYNCHRONOUS and BEFORE the runtime is built / serving begins, so a resumed
  // session's scratch can't be deleted underneath a running command by a still-
  // in-flight async sweep.
  const scratchBase =
    opts.scratch_base ?? defaultScratchBase(opts.user_data_path);
  sweepScratch(scratchBase);
  const runtime = new AgentRuntime({
    secrets: secretsStore,
    endpoints: endpointsStore,
    workspace_registry: workspaceRegistry,
    sessions_store: sessionsStore,
    streams: opts.stream_registry,
    // GRIDA-SEC-004: the host's own secret dir (auth.json, sessions.db,
    // workspaces.json, recent.json). Threaded to the shell runner so the
    // agent's `run_command` cannot read it back into the transcript. NOT
    // added to the srt deny_read policy — the host itself reads auth.json.
    secrets_root: opts.user_data_path,
    scratch_base: scratchBase,
    shell_execution_allowed: shellExecutionAllowed,
    // Image generation rides the same capability flag as the `/images/generate`
    // route. The bindings still require a scratch sink + a provider key.
    image_gen_enabled: opts.capabilities.images === true,
    // The user's selected image model (host config); the tool is prompt-only.
    image_model_id: opts.image_model_id,
    // Whether the locked `question` tool pauses for a human (interactive) or
    // refuses with a fixed tool error (headless). Fail-closed headless.
    interactive: opts.interactive === true,
    // Host default for the `design_search` (library) capability.
    library: opts.library === true,
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
