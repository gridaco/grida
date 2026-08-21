// GRIDA-GG: provider — construct + wire the GG session store and routes (docs/wg/platform/hosted-ai.md)
// GRIDA-SEC-008 — construct the native provider with the shared AuthStore.
/**
 * `@grida/agent/server` — the agent TENANT of `@grida/daemon` (#927).
 *
 * The daemon owns the loopback perimeter and the host capability routes
 * (files, recents, workspaces) plus the stores in `DaemonServices`. This
 * module contributes everything AI: the run loop (`/agent/*`, `/events`),
 * chat sessions (`/sessions/*`), BYOK credentials vocabulary (`/secrets/*`),
 * endpoint providers (`/providers/*`), and generation (`/images/*`,
 * `/video/*`, `/three-d/*`, `/audio/music`, `/audio/sound-effects`).
 * Dependency direction is one-way —
 * this package imports `@grida/daemon`; the daemon knows no tenant.
 *
 * Hosts (desktop sidecar, CLI) construct the composed server via
 * `createAgentDaemon` — behaviorally today's full agent daemon, wire
 * protocol unchanged.
 */

import os from "node:os";
import { readFileSync } from "node:fs";
import type { Hono } from "hono";
import {
  DaemonServer,
  runUnsandboxedShell,
  type DaemonCapabilities,
  type DaemonHttpAccess,
  type DaemonServices,
  type DaemonTenant,
  type ShellExecutor,
} from "@grida/daemon/server";
import { buildDaemonSandboxPolicy } from "@grida/daemon/sandbox";
import { registerSecretsRoutes } from "./http/routes/secrets";
import { registerProvidersRoutes } from "./http/routes/providers";
import { registerImagesRoutes } from "./http/routes/images";
import { registerVideoRoutes } from "./http/routes/video";
import { registerThreeDRoutes } from "./http/routes/three-d";
import { registerMusicRoutes } from "./http/routes/music";
import { registerSoundEffectsRoutes } from "./http/routes/sound-effects";
import { registerAgentRoutes } from "./http/routes/agent";
import { registerDirectoryScopesRoutes } from "./http/routes/directory-scopes";
import { registerSessionsRoutes } from "./http/routes/sessions";
import { registerGridaAuthRoutes } from "./http/routes/gg-auth";
import { registerChatGptAuthRoutes } from "./http/routes/chatgpt-auth";
import { EndpointProvidersStore } from "./providers/endpoints";
import { GridaGatewaySessionStore } from "./providers/gg-session";
import { ChatGptCredentialManager } from "./providers/chatgpt-credentials";
import {
  ChatGptProvider,
  type ChatGptProviderConfig,
  type ChatGptProviderRuntime,
} from "./providers/chatgpt";
import { openSessionsDb } from "./session/db";
import { SessionsStore } from "./session/store";
import { AgentRuntime } from "./runtime";
import { StreamRegistry } from "./runtime/stream-registry";
import { defaultScratchBase, sweepScratch } from "./session/scratch";
import { DirectoryScopeRegistry } from "./session/directory-scopes";
import { ProviderHttp, type ProviderHttpTransport } from "./providers/http";
import {
  ModelCatalogStore,
  type ModelCatalogStoreOptions,
} from "./providers/model-catalog";
import { models } from "@grida/ai-models";

export {
  DirectoryScopeRegistry,
  DirectoryScopeError,
  type DirectoryScopeErrorCode,
  type DirectoryScopeGrant,
  type DirectoryScopeRegistryOptions,
} from "./session/directory-scopes";
export type { ProviderHttpTransport } from "./providers/http";
export { CHATGPT_AUTH_ROUTE_PATHS } from "./http/routes/chatgpt-auth";
export type {
  ChatGptAuthStart,
  ChatGptOAuthConfig,
} from "./providers/chatgpt-credentials";
export type { ChatGptProviderConfig } from "./providers/chatgpt";
export { defaultScratchBase, prepareScratchAuthority } from "./session/scratch";

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
  type ShellExecutionScope,
  type ShellExecutor,
  type ShellRunOptions,
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
  three_d: true,
  music: true,
  sound_effects: true,
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
      | "secrets"
      | "agent"
      | "sessions"
      | "providers"
      | "images"
      | "video"
      | "three_d"
      | "music"
      | "sound_effects"
    >
  >;
  /**
   * Host-owned execution of the agent tenant's in-process provider HTTP.
   * `request` carries provider operations (including credential-bearing
   * inference and media submit/poll/result calls); `download` is used only for
   * credential-free provider result/assets that the host authorizes. Both are
   * required when supplied so the two authorization classes cannot silently
   * collapse. Omission retains ambient provider requests for standalone/CLI
   * compatibility but fails closed for remote asset downloads.
   *
   * This grants no network operation to tools, shell commands, or external
   * agent processes. The package shapes provider requests, performs basic URL
   * syntax checks, and injects GG authorization at request time. The callback
   * is the final network authority: before I/O the host must authorize each
   * concrete URL/method/header set, redirect hop, and resolved address/route.
   */
  provider_http?: ProviderHttpTransport;
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
   * GRIDA-SEC-004 — host-owned finite-command capability. The executor receives
   * the exact current workspace/scratch scope for every invocation and must
   * enforce it at the process boundary. Omission withholds `run_command`.
   *
   * `sandbox_enforced` is not an executor: wrapping the multi-session daemon
   * once cannot isolate sibling session scratch roots. Standalone hosts that
   * deliberately accept ambient filesystem authority use
   * {@link allow_unsandboxed_shell}, which injects the raw runner explicitly.
   */
  shell_executor?: ShellExecutor;
  /**
   * GRIDA-SEC-004 — whether this host's process tree is confined by an OS
   * sandbox (srt Seatbelt/bubblewrap). This attests only the coarse outer
   * process tree for external ACP's `"sandboxed"` disposition; it does not
   * expose `run_command`. Finite commands require {@link shell_executor}.
   */
  sandbox_enforced?: boolean;
  /**
   * GRIDA-SEC-004 — host disposition for external ACP process execution.
   * `"enabled"` is an explicit host authorization to spawn the process and
   * makes NO containment claim.
   * `"sandboxed"` additionally requires `sandbox_enforced` to be exactly true.
   * `"disabled"` withholds the process capability entirely and is the default
   * when this field is omitted.
   *
   * This switch is independent of `allow_unsandboxed_shell`, which authorizes
   * only Grida's locked shell tool.
   */
  external_agent_execution?: "enabled" | "sandboxed" | "disabled";
  /**
   * GRIDA-SEC-004 — deliberate raw-execution escape hatch (the `grida-agent`
   * CLI, local dev). When true and no {@link shell_executor} is supplied, the
   * package injects {@link runUnsandboxedShell}. Off by default; enabling it is
   * an
   * explicit, logged decision by the host author who accepts that the shell
   * child has no session-bound kernel-level filesystem containment.
   *
   * This does not affect external ACP agents; their independent disposition is
   * controlled by `external_agent_execution`.
   */
  allow_unsandboxed_shell?: boolean;
  /**
   * Whether a human UI can answer the locked `question` tool. Default
   * (undefined/false) is FAIL-CLOSED headless: `question` refuses instead of
   * pausing forever. The desktop sidecar sets this true; CLI/batch runs
   * override false.
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
   * Native ChatGPT subscription provider. Every endpoint, callback, model,
   * and client identity is host-injected; omission keeps the provider and its
   * OAuth routes fully dormant.
   *
   * This is a model provider consumed by Grida's own runtime. It does not
   * enable ACP or delegate the agent loop to Codex.
   */
  chatgpt?: ChatGptProviderConfig;
  /**
   * The host-bundled skills directory (the repo-root `skills/` tree shipped
   * with the app) — the lowest-precedence discovery layer that carries the
   * built-in `svg`/`dotcanvas`/`slides` skills. The host resolves it (desktop
   * = packaged resources; CLI = a flag/default). Omit ⇒ no built-in skills
   * (only project/user skills discovered).
   */
  skills_root?: string;
  /**
   * A model catalogue supplied by the host, instead of the bundled one
   * and instead of fetching the published one. Pins the tenant's
   * catalogue for its whole life — the escape hatch for air-gapped or
   * version-pinned deployments. See `ModelCatalogStore`.
   */
  models_snapshot?: models.snapshot.Snapshot;
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
    three_d: opts.capabilities?.three_d ?? true,
    music: opts.capabilities?.music ?? true,
    sound_effects: opts.capabilities?.sound_effects ?? true,
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
      const providerHttp = new ProviderHttp(opts.provider_http);
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
      // Provider configuration routes are registered before the runtime is
      // constructed. Their callback closes over this late-bound trusted edge;
      // requests cannot arrive until tenant registration returns.
      let onProviderReady: (() => void) | undefined;
      const signalProviderReady = () => onProviderReady?.();
      // The catalogue this tenant resolves against: the bundled one as a
      // seed, the published one as the authority. A refresh can make a
      // previously unresolvable model resolvable, which is exactly the
      // condition `on_provider_ready` exists to retry — a session parked
      // as `provider_down` on an unknown model un-parks here.
      const modelCatalog = new ModelCatalogStore({
        ...resolveCatalogOverride(opts.models_snapshot),
        base_url: gridaGatewayBaseUrl,
        fetch: providerHttp.request,
        on_change: signalProviderReady,
      });
      if (gridaGatewayBaseUrl) {
        registerGridaAuthRoutes(app, {
          store: gridaSession,
          on_provider_ready: signalProviderReady,
        });
      }
      let chatgpt: ChatGptProviderRuntime | undefined;
      if (!caps.providers && opts.chatgpt) {
        console.warn(
          "[grida-agent] chatgpt is configured but capabilities.providers is disabled; the provider is unavailable."
        );
      }
      if (caps.providers && opts.chatgpt) {
        ChatGptProvider.validate(opts.chatgpt);
        const credentials = new ChatGptCredentialManager(
          services.auth,
          providerHttp,
          opts.chatgpt.oauth
        );
        chatgpt = { config: opts.chatgpt, credentials };
        registerChatGptAuthRoutes(app, {
          credentials,
          on_provider_ready: signalProviderReady,
        });
      }
      // Chat sessions: SQLite at ${userData}/sessions.db — agent-tenant
      // domain data (#927). Opened once per launch and closed via the
      // returned cleanup. WAL mode in sessions/db.ts lets a CLI inspector
      // read concurrently.
      const sessionsDb = openSessionsDb({
        user_data_path: services.user_data_path,
      });
      const sessionsStore = new SessionsStore(sessionsDb, {
        catalog_view: () => modelCatalog.view(),
      });
      // GRIDA-SEC-004 — directory refs are in-memory host capabilities, not
      // workspace registrations. Preserve the SAME sensitive-read denies as
      // the outer sandbox in-process so unsupported/unsandboxed hosts cannot
      // attach HOME secrets (and reject ancestors such as HOME or `/` too).
      const sensitiveReadRoots = buildDaemonSandboxPolicy({
        user_data: services.user_data_path,
        home: os.homedir(),
      }).filesystem.deny_read;
      const directoryScopes = new DirectoryScopeRegistry({
        secrets_root: services.user_data_path,
        protected_roots: sensitiveReadRoots,
      });
      // In-flight run registry — shared with the daemon shutdown via the
      // tenant handle's `drain` so stop() reaches the same entries the
      // routes created.
      const streams = new StreamRegistry();

      if (caps.secrets) {
        registerSecretsRoutes(app, {
          store: services.secrets,
          endpoints: endpointsStore,
          on_provider_ready: signalProviderReady,
        });
      }
      if (caps.providers) {
        registerProvidersRoutes(app, {
          endpoints: endpointsStore,
          secrets: services.secrets,
          provider_http: providerHttp,
          on_provider_ready: signalProviderReady,
        });
      }
      if (caps.images) {
        registerImagesRoutes(app, {
          secrets: services.secrets,
          media: services.media,
          gg: gridaSession,
          gg_base_url: gridaGatewayBaseUrl,
          provider_http: providerHttp,
          catalog: modelCatalog,
        });
      }
      if (caps.video) {
        registerVideoRoutes(app, {
          secrets: services.secrets,
          media: services.media,
          gg: gridaSession,
          gg_base_url: gridaGatewayBaseUrl,
          provider_http: providerHttp,
          catalog: modelCatalog,
        });
      }
      if (caps.three_d) {
        registerThreeDRoutes(app, {
          secrets: services.secrets,
          media: services.media,
          provider_http: providerHttp,
        });
      }
      if (caps.music) {
        registerMusicRoutes(app, {
          media: services.media,
          gg: gridaSession,
          gg_base_url: gridaGatewayBaseUrl,
          provider_http: providerHttp,
        });
      }
      if (caps.sound_effects) {
        registerSoundEffectsRoutes(app, {
          secrets: services.secrets,
          media: services.media,
          provider_http: providerHttp,
        });
      }
      // GRIDA-SEC-004 — a finite command is a host capability, not a boolean
      // attestation about the daemon's broad process tree. Standalone/CLI hosts
      // retain raw execution only through the explicit unsandboxed switch.
      const shellExecutor =
        opts.shell_executor ??
        (opts.allow_unsandboxed_shell === true
          ? runUnsandboxedShell
          : undefined);
      if (
        opts.allow_unsandboxed_shell === true &&
        opts.shell_executor === undefined
      ) {
        console.warn(
          "[grida-agent] GRIDA-SEC-004: run_command exposed with the raw executor " +
            "(allow_unsandboxed_shell). The shell child has no session-bound " +
            "kernel-level filesystem containment — only exact-cwd + arg checks."
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
      sweepScratch(scratchBase, services.user_data_path);
      const runtime = new AgentRuntime({
        secrets: services.secrets,
        endpoints: endpointsStore,
        // GRIDA-SEC-006 — hosted provider deps; dormant when the base
        // URL is absent (resolver never picks grida).
        gg: gridaSession,
        gg_base_url: gridaGatewayBaseUrl,
        chatgpt,
        catalog: modelCatalog,
        provider_http: providerHttp,
        workspace_registry: services.workspaces,
        sessions_store: sessionsStore,
        directory_scopes: directoryScopes,
        streams,
        // GRIDA-SEC-004: the daemon's own secret dir (auth.json, sessions.db,
        // workspaces.json, recent.json). Threaded into exact command scope so a
        // confined executor can deny it while the daemon itself retains access.
        secrets_root: services.user_data_path,
        scratch_base: scratchBase,
        shell_executor: shellExecutor,
        // GRIDA-SEC-004 — the sandboxed ACP disposition consumes this host
        // attestation; the explicit `enabled` disposition does not.
        sandbox_enforced: opts.sandbox_enforced === true,
        // A host may authorize execution without a containment claim, require
        // containment, or withhold the whole ACP process capability. Omission
        // cannot itself grant process authority.
        external_agent_execution: opts.external_agent_execution ?? "disabled",
        // Image generation rides the same capability flag as the
        // `/images/generate` route. The bindings still require a scratch sink +
        // a provider key.
        image_gen_enabled: caps.images,
        // The user's selected image model (host config); the tool is prompt-only.
        image_model_id: opts.image_model_id,
        // Whether the client-owned question tool pauses for a human. Surface
        // presentation is instead grounded by each run's optional snapshot.
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
      if (caps.agent) {
        // Repair restart-orphaned tool state before ANY recovery edge may kick
        // a durable successor. Provider setup can arrive immediately after the
        // daemon starts; chaining it to this promise keeps a repair failure
        // fail-closed rather than allowing that later mutation to bypass it.
        const startupRecovery = runtime.recoverQueuedSessions();
        void startupRecovery.catch((err) => {
          console.warn(
            `[grida-agent] queued-session startup recovery failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        });
        onProviderReady = () => {
          void startupRecovery
            .then(() => runtime.retryQueuedSessions())
            .catch((err) => {
              console.warn(
                `[grida-agent] queued-session provider-ready retry failed: ${
                  err instanceof Error ? err.message : String(err)
                }`
              );
            });
        };
        // GRIDA-SEC-004 — queued turns survive process death, but recovery is
        // host-start execution authority, never a side effect of the read-only
        // status SSE. The scheduler re-checks persisted human-input state at
        // its fire gate, so queued successors remain paused behind approvals
        // and questions after restart.
        registerDirectoryScopesRoutes(app, directoryScopes);
        registerAgentRoutes(app, runtime);
      }
      if (caps.sessions)
        registerSessionsRoutes(app, { store: sessionsStore, runtime });

      // After registration: the boot fetch is non-blocking, but a refresh
      // signals provider-ready, and that callback must already be wired.
      modelCatalog.start();

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
          directoryScopes.dispose();
          modelCatalog.dispose();
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
  /** Daemon-frame field: host-injected root for durable generated media. */
  media_root?: string;
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
    media_root: _mediaRoot,
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
    media_root: opts.media_root,
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

/** `GRIDA_AGENT_MODELS_PATH` — pin the catalogue to a file on disk. */
const MODELS_PATH_ENV = "GRIDA_AGENT_MODELS_PATH";
/** `GRIDA_AGENT_DISABLE_MODELS_FETCH` — never fetch; stay on the seed. */
const MODELS_FETCH_DISABLED_ENV = "GRIDA_AGENT_DISABLE_MODELS_FETCH";

/**
 * Host and operator overrides for the model catalogue, resolved into
 * `ModelCatalogStore` options.
 *
 * A pinned snapshot (from the host option or a file) freezes the store;
 * disabling the fetch leaves it on the bundled seed. Both are escape
 * hatches for air-gapped or version-pinned deployments — and both fail
 * OPEN to normal behaviour, because an operator typo must not be the
 * reason a daemon has no catalogue at all.
 */
function resolveCatalogOverride(
  hostSnapshot?: models.snapshot.Snapshot
): Pick<ModelCatalogStoreOptions, "snapshot"> {
  if (hostSnapshot) return { snapshot: hostSnapshot };

  const filePath = process.env[MODELS_PATH_ENV]?.trim();
  if (filePath) {
    try {
      const parsed = models.snapshot.parse(
        JSON.parse(readFileSync(filePath, "utf8"))
      );
      if (parsed) return { snapshot: parsed };
      console.warn(
        `[grida-agent] ${MODELS_PATH_ENV}=${filePath} did not match schema ${models.snapshot.SCHEMA}; ignoring it`
      );
    } catch (err) {
      console.warn(
        `[grida-agent] ${MODELS_PATH_ENV}=${filePath} could not be read (${
          err instanceof Error ? err.message : String(err)
        }); ignoring it`
      );
    }
  }

  if (process.env[MODELS_FETCH_DISABLED_ENV] === "1") {
    // Freeze on the bundled catalogue: a seed snapshot pins the store
    // exactly the way a supplied one does.
    return { snapshot: models.snapshot.seed() };
  }
  return {};
}
