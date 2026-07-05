// GRIDA-GG: provider — construct + wire the GG session store and routes (docs/wg/platform/hosted-ai.md)
/**
 * `@grida/agent/server` — the agent TENANT of `@grida/daemon` (#927).
 *
 * The daemon owns the loopback perimeter and the host capability routes
 * (files, recents, workspaces) plus the stores in `DaemonServices`. This
 * module contributes everything AI: the run loop (`/agent/*`, `/events`),
 * chat sessions (`/sessions/*`), BYOK credentials vocabulary (`/secrets/*`),
 * endpoint providers (`/providers/*`), and BYOK generation (`/images/*`,
 * `/video/*`). Dependency direction is one-way — this package imports
 * `@grida/daemon`; the daemon knows no tenant.
 *
 * Hosts (desktop sidecar, CLI) construct the composed server via
 * `createAgentDaemon` — behaviorally today's full agent daemon, wire
 * protocol unchanged.
 */

import type { Hono } from "hono";
import {
  DaemonServer,
  type DaemonCapabilities,
  type DaemonHttpAccess,
  type DaemonServices,
  type DaemonTenant,
} from "@grida/daemon/server";
import { registerSecretsRoutes } from "./http/routes/secrets";
import { registerProvidersRoutes } from "./http/routes/providers";
import { registerImagesRoutes } from "./http/routes/images";
import { registerVideoRoutes } from "./http/routes/video";
import { registerAgentRoutes } from "./http/routes/agent";
import { registerSessionsRoutes } from "./http/routes/sessions";
import { registerGridaAuthRoutes } from "./http/routes/gg-auth";
import { EndpointProvidersStore } from "./providers/endpoints";
import { GridaGatewaySessionStore } from "./providers/gg-session";
import { openSessionsDb } from "./session/db";
import { SessionsStore } from "./session/store";
import { AgentRuntime } from "./runtime";
import { StreamRegistry } from "./runtime/stream-registry";
import { defaultScratchBase, sweepScratch } from "./session/scratch";

// Re-exported for hosts that compose or probe the daemon through this
// package (the CLI, tests). The daemon package is the owner.
export {
  DaemonServer,
  DAEMON_DEFAULT_CAPABILITIES,
  DAEMON_PROTOCOL,
  Daemon,
  type DaemonCapabilities,
  type DaemonHandshakeResponse,
  type DaemonHttpAccess,
  type DaemonServices,
  type DaemonTenant,
} from "@grida/daemon/server";

/**
 * The composed agent-daemon default: every capability group on (the
 * daemon's own AND this tenant's). What `createAgentDaemon` serves when
 * the host passes no `capabilities` override.
 */
export const AGENT_DAEMON_DEFAULT_CAPABILITIES: DaemonCapabilities = {
  files: true,
  recent: true,
  secrets: true,
  agent: true,
  workspaces: true,
  sessions: true,
  providers: true,
  images: true,
  video: true,
  shell: false,
};

export type AgentTenantOptions = {
  /**
   * Which of THIS TENANT's route groups to mount. Defaults to all on.
   * Daemon-owned groups (`files`, `recent`, `workspaces`) are the
   * daemon's option, not this tenant's.
   */
  capabilities?: Partial<
    Pick<
      DaemonCapabilities,
      "secrets" | "agent" | "sessions" | "providers" | "images" | "video"
    >
  >;
  /**
   * Base directory for per-session scratch areas (WG `scratch.md`). Defaults
   * to {@link defaultScratchBase} (`<os.tmpdir()>/grida-agent-<host-tag>`,
   * namespaced per host by the daemon's `user_data_path`) when omitted —
   * filesystem location is host-owned I/O, so the default lives here at the
   * tenant boundary, not in the runtime core. MUST be outside
   * `user_data_path` (the secret root) or the runtime's containment assert
   * rejects it. A future host with a different filesystem reality (a cloud
   * sandbox) injects its own.
   */
  scratch_base?: string;
  /**
   * Catalog model id the agent's `generate_image` tool produces with — the
   * user's selected image model (host config). The tool is prompt-only, so the
   * model is not an agent argument. Omit to use the catalog default.
   */
  image_model_id?: string;
  /**
   * GRIDA-SEC-004 — whether this host's process tree is confined by an OS
   * sandbox (srt Seatbelt/bubblewrap). Default `false` (FAIL-CLOSED): with no
   * sandbox and no explicit opt-in, the `run_command` shell tool is NOT
   * exposed to the model. The desktop supervisor sets this true only when it
   * actually wrapped the sidecar spawn.
   */
  sandbox_enforced?: boolean;
  /**
   * GRIDA-SEC-004 — deliberate escape hatch for hosts that run WITHOUT an OS
   * sandbox (the `grida-agent` CLI, local dev). When true, `run_command` is
   * exposed even though `sandbox_enforced` is false. Off by default; enabling
   * it is an explicit, logged decision by the host author who accepts that the
   * shell child has no kernel-level fs/network containment.
   */
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
  /**
   * GRIDA-SEC-006 — origin of the Grida hosted-AI endpoints (e.g.
   * `https://grida.co`; the desktop supervisor passes its
   * EDITOR_BASE_URL). Enables the `grida` "included" provider: the
   * `/auth/gg/*` session routes mount, and the resolver may pick the
   * hosted provider when the renderer has pushed a live token. Omit ⇒
   * the provider is fully dormant (no routes, never resolves).
   */
  gg_base_url?: string;
  /**
   * The host-bundled skills directory (the repo-root `skills/` tree shipped
   * with the app) — the lowest-precedence discovery layer that carries the
   * built-in `svg`/`dotcanvas`/`slides` skills. The host resolves it (desktop
   * = packaged resources; CLI = a flag/default). Omit ⇒ no built-in skills
   * (only project/user skills discovered).
   */
  skills_root?: string;
};

/**
 * Build the agent tenant. Registered against a `DaemonServer` (usually via
 * {@link createAgentDaemon}); mounts the AI route groups behind the daemon's
 * perimeter and owns their per-launch state (sessions SQLite, endpoint
 * config store, the runtime + in-flight stream registry).
 */
export function createAgentTenant(opts: AgentTenantOptions = {}): DaemonTenant {
  const caps = {
    secrets: opts.capabilities?.secrets ?? true,
    agent: opts.capabilities?.agent ?? true,
    sessions: opts.capabilities?.sessions ?? true,
    providers: opts.capabilities?.providers ?? true,
    images: opts.capabilities?.images ?? true,
    video: opts.capabilities?.video ?? true,
  };
  // GRIDA-SEC-004 — the ONLY routes where the credential may ride the
  // `auth_token` query parameter (header-less EventSource attach; WG daemon
  // spec §auth-model). GET event-stream routes exclusively — keep in sync
  // with the SSE routes registered in routes/agent.ts and routes/sessions.ts.
  const sseQueryTokenPaths: RegExp[] = [];
  if (caps.agent) sseQueryTokenPaths.push(/^\/agent\/stream\/[^/]+$/);
  if (caps.sessions) sseQueryTokenPaths.push(/^\/sessions\/[^/]+\/status$/);

  return {
    sse_query_token_paths: sseQueryTokenPaths,
    register: (app: Hono, services: DaemonServices) => {
      // Endpoint provider configs (issue #806): plain config beside the
      // secrets store, persisted at ${userData}/endpoints.json.
      const endpointsStore = new EndpointProvidersStore(
        services.user_data_path
      );
      // Grida Cloud session (GRIDA-SEC-006): in-memory only, per launch.
      // The whole hosted-provider surface keys off the host passing a
      // base URL — without it, no routes, no resolution, fully dormant.
      const gridaGatewayBaseUrl =
        typeof opts.gg_base_url === "string" && opts.gg_base_url.length > 0
          ? opts.gg_base_url
          : undefined;
      const gridaSession = new GridaGatewaySessionStore();
      if (gridaGatewayBaseUrl) {
        registerGridaAuthRoutes(app, { store: gridaSession });
      }
      // Chat sessions: SQLite at ${userData}/sessions.db — agent-tenant
      // domain data (#927). Opened once per launch and closed via the
      // returned cleanup. WAL mode in sessions/db.ts lets a CLI inspector
      // read concurrently.
      const sessionsDb = openSessionsDb({
        user_data_path: services.user_data_path,
      });
      const sessionsStore = new SessionsStore(sessionsDb);
      // In-flight run registry — shared with the daemon shutdown via the
      // tenant handle's `drain` so stop() reaches the same entries the
      // routes created.
      const streams = new StreamRegistry();

      if (caps.secrets) {
        registerSecretsRoutes(app, {
          store: services.secrets,
          endpoints: endpointsStore,
        });
      }
      if (caps.providers) {
        registerProvidersRoutes(app, {
          endpoints: endpointsStore,
          secrets: services.secrets,
        });
      }
      if (caps.images) {
        registerImagesRoutes(app, {
          secrets: services.secrets,
          gg: gridaSession,
          gg_base_url: gridaGatewayBaseUrl,
        });
      }
      if (caps.video) {
        registerVideoRoutes(app, {
          secrets: services.secrets,
          gg: gridaSession,
          gg_base_url: gridaGatewayBaseUrl,
        });
      }
      // GRIDA-SEC-004 — the single fail-closed shell decision. Shell execution
      // is off unless the host confirmed an OS sandbox confines the tree, or it
      // explicitly opted into an unsandboxed shell. Computed here (one auditable
      // place) and threaded to the runtime → bindings → tool registry.
      const shellExecutionAllowed =
        opts.sandbox_enforced === true || opts.allow_unsandboxed_shell === true;
      if (
        opts.allow_unsandboxed_shell === true &&
        opts.sandbox_enforced !== true
      ) {
        console.warn(
          "[grida-agent] GRIDA-SEC-004: run_command exposed WITHOUT an OS sandbox " +
            "(allow_unsandboxed_shell). The shell child has no kernel-level " +
            "fs/network containment — only the in-process allowlist + arg checks."
        );
      }
      // Per-session scratch base (WG `scratch.md`). Host-injected; default at
      // this tenant boundary, never in the runtime core. Sweep stale session
      // dirs once at launch — a single-instance daemon's prior in-flight
      // scratch is dead after a restart, so this bounds scratch's lifetime even
      // across a crash (S2). SYNCHRONOUS and BEFORE the runtime is built /
      // serving begins, so a resumed session's scratch can't be deleted
      // underneath a running command by a still-in-flight async sweep.
      const scratchBase =
        opts.scratch_base ?? defaultScratchBase(services.user_data_path);
      sweepScratch(scratchBase);
      const runtime = new AgentRuntime({
        secrets: services.secrets,
        endpoints: endpointsStore,
        // GRIDA-SEC-006 — hosted provider deps; dormant when the base
        // URL is absent (resolver never picks grida).
        gg: gridaSession,
        gg_base_url: gridaGatewayBaseUrl,
        workspace_registry: services.workspaces,
        sessions_store: sessionsStore,
        streams,
        // GRIDA-SEC-004: the daemon's own secret dir (auth.json, sessions.db,
        // workspaces.json, recent.json). Threaded to the shell runner so the
        // agent's `run_command` cannot read it back into the transcript. NOT
        // added to the srt deny_read policy — the daemon itself reads auth.json.
        secrets_root: services.user_data_path,
        scratch_base: scratchBase,
        shell_execution_allowed: shellExecutionAllowed,
        // Image generation rides the same capability flag as the
        // `/images/generate` route. The bindings still require a scratch sink +
        // a provider key.
        image_gen_enabled: caps.images,
        // The user's selected image model (host config); the tool is prompt-only.
        image_model_id: opts.image_model_id,
        // Whether the locked `question` tool pauses for a human (interactive) or
        // refuses with a fixed tool error (headless). Fail-closed headless.
        interactive: opts.interactive === true,
        // Host default for the `design_search` (library) capability.
        library: opts.library === true,
        // Skill discovery for the hosted agent. Sources = host-bundled
        // (repo-root `skills/`, the built-in svg/dotcanvas/slides) + the
        // workspace's own `.claude/skills` / `.agents/skills`. It deliberately
        // does NOT inherit the machine's GLOBAL `~/.claude|.agents/skills` —
        // those are the user's Claude Code toolbox, and a meta-skill there
        // (e.g. `find-skills`) would mislead the Grida agent (it did: a slides
        // task loaded `find-skills` instead of `slides`). Skills = shipped +
        // per-project, never the developer's personal global set.
        skill_discovery: {
          bundled_dir: opts.skills_root,
          include_user_scoped: false,
        },
      });
      if (caps.agent) registerAgentRoutes(app, runtime);
      if (caps.sessions)
        registerSessionsRoutes(app, { store: sessionsStore, runtime });

      return {
        // `gg` reflects the feature actually being ON (base URL
        // present) — clients feature-detect the hosted provider by it.
        capabilities: { ...caps, gg: gridaGatewayBaseUrl !== undefined },
        // Abort in-flight runs (upstream model calls) BEFORE cleanup so a
        // recorder reacting to the abort can finalize its partial assistant
        // message against an open SQLite handle.
        drain: () => streams.clear(),
        cleanup: () => {
          runtime.dispose();
          sessionsStore.close();
        },
      };
    },
  };
}

/**
 * Everything a host passes to run the composed agent daemon — the daemon
 * frame options plus this tenant's options. Field-compatible with the
 * pre-#927 `AgentHostOptions`.
 */
export type AgentDaemonOptions = AgentTenantOptions & {
  password: string;
  /** Override only when building a deliberately stripped daemon. */
  capabilities?: Partial<DaemonCapabilities>;
  /** Host-provided data directory for daemon + tenant persistent state. */
  user_data_path: string;
  /** GRIDA-SEC-004 — host-injected managed root for `/workspaces/create`. */
  projects_root?: string;
  /** Host/client HTTP perimeter policy for CORS + Referer checks. */
  http_access: DaemonHttpAccess;
  /** Loopback host to bind. Default `127.0.0.1`. */
  hostname?: string;
  /** Port to bind. Default `0` (OS picks a free ephemeral port). */
  port?: number;
};

/**
 * The composed server hosts actually run: a `DaemonServer` with the agent
 * tenant mounted. One import for the desktop sidecar, the CLI, and tests —
 * `start()` / `stop()` / `port` semantics are the daemon's.
 */
/**
 * Map the composed-daemon options to the agent tenant's options.
 *
 * `AgentDaemonOptions = AgentTenantOptions & <daemon-frame fields>`, so we peel
 * off the closed set of daemon-only fields (declared just above) and let EVERY
 * remaining field — i.e. every tenant option — ride through by spread. A tenant
 * option added later flows automatically; it can no longer be silently dropped
 * here (how `skills_root` once shipped disabled → empty skill index, and how
 * `gg_base_url` would ship the hosted provider dormant). Still exported so a
 * regression test can pin the behavior as a backstop.
 */
export function agentTenantOptionsFromDaemon(
  opts: AgentDaemonOptions,
  capabilities: DaemonCapabilities
): AgentTenantOptions {
  const {
    // Daemon-frame fields — consumed by `DaemonServer`, not the tenant.
    password: _password,
    capabilities: _daemonCapabilities,
    user_data_path: _userDataPath,
    projects_root: _projectsRoot,
    http_access: _httpAccess,
    hostname: _hostname,
    port: _port,
    // …everything else is an AgentTenantOptions field.
    ...tenant
  } = opts;
  // The tenant mounts its own route groups off the RESOLVED capabilities, not
  // the host's partial override.
  return { ...tenant, capabilities };
}

export function createAgentDaemon(opts: AgentDaemonOptions): DaemonServer {
  const capabilities: DaemonCapabilities = {
    ...AGENT_DAEMON_DEFAULT_CAPABILITIES,
    ...opts.capabilities,
  };
  return new DaemonServer({
    password: opts.password,
    user_data_path: opts.user_data_path,
    projects_root: opts.projects_root,
    http_access: opts.http_access,
    hostname: opts.hostname,
    port: opts.port,
    // The daemon gates its OWN route groups off this record; tenant groups
    // report through the tenant handle (exact mounted flags), so the
    // handshake never claims a group nothing serves.
    capabilities: {
      files: capabilities.files,
      recent: capabilities.recent,
      workspaces: capabilities.workspaces,
      shell: capabilities.shell,
    },
    tenants: [
      createAgentTenant(agentTenantOptionsFromDaemon(opts, capabilities)),
    ],
  });
}
