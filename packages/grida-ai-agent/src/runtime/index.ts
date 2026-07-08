// GRIDA-GG: provider — thread the `gg` session deps into resolution (docs/wg/platform/hosted-ai.md)
/**
 * AgentRuntime — the agent loop + the in-flight stream registry behind
 * one object. `AgentHost` owns an instance; the HTTP layer
 * (`http/routes/agent.ts`) is thin handlers over `run` / `stream` /
 * `abort`. Each method returns a web `Response` so it stays
 * transport-agnostic.
 *
 * HTTP-decoupled run / stream / abort. Error returns use the
 * web-standard `Response.json` so the runtime never depends on Hono.
 *
 * This is the runtime layer's front door; sibling files split the
 * concerns out: `run-agent.ts` (open a model stream), `sse.ts` (pump +
 * consumer Response), `stream-registry.ts` (in-flight registry),
 * `run-input.ts` (request parsing), `workspace-agent-bindings.ts` +
 * `command-backend.ts` (capability wiring). No barrel re-export —
 * importers reach those files directly.
 */

import crypto from "node:crypto";
import { AGENT_SESSION_AGENT } from "../protocol/run";
import { AGENT_DEFAULT_MODE } from "../protocol/mode";
import {
  resolveProvider,
  makeAgentProvider,
  ProviderUnavailableError,
  type ResolveDeps,
} from "../providers";
import {
  AGENT_PROVIDER_MODELS,
  agentProviderModel,
  isAgentProviderModel,
  type AgentProviderId,
} from "../agent-provider/types";
import { runAgentProviderTurn } from "./agent-provider-run";
import { createRecorderConsumer } from "../session/recorder";
import { titler } from "../session/titler";
import type { SessionsStore } from "../session/store";
import type { ChatModel, MessageUsage } from "../session/rows";
import {
  DEFAULT_COMPACTION_CONFIG,
  compactSession,
  resolveModelLimits,
  shouldCompact,
  type CompactionConfig,
  type ResolveModelLimits,
} from "../session/compaction";
import type { compactor } from "../session/compactor";
import {
  endpointDefaultModelId,
  resolveEndpointModels,
  type EndpointProviderConfig,
} from "../protocol/endpoints";
import { discoverSkills } from "../skills/discovery";
import { discoverProjectInstructions } from "../skills/project-instructions";
import type { SkillBodyCache, SkillIndex } from "../skills/types";
import type { WorkspaceRegistry } from "@grida/daemon/server";
import {
  RunInFlightError,
  StreamRegistry,
  type StreamEntry,
  type StreamEndReason,
} from "./stream-registry";
import { SessionScheduler } from "./session-scheduler";
import { AgentEventBus } from "./events";
import { buildEventsConsumerResponse } from "./events-sse";
import { AGENT_DEFAULT_TIER } from "../tiers";
import {
  applyApprovalAnswer,
  extractFirstUserText,
  extractLastUserText,
  extractLastUserMessageId,
  fillIncomingToolResults,
  parseRunBody,
  persistIncomingTail,
  type RunRequest,
} from "./run-input";
import { runAgent, type AgentStepUsage } from "./run-agent";
import {
  scratchRootFor,
  ensureScratch,
  removeScratch,
  writeScratchFile,
} from "../session/scratch";
import { buildModelMessages, type ModelUIMessage } from "./message-view";
import { buildConsumerResponse, pumpResponseIntoRegistry } from "./sse";
import { buildStatusConsumerResponse } from "./status-sse";

/** Session-static agent context (RFC `skills`: discovered once per session). */
type SessionContext = {
  skill_index?: SkillIndex;
  project_instructions?: string;
  /** Per-session skill-body cache (survives the per-turn agent rebuild). */
  skill_cache: SkillBodyCache;
};

/**
 * Resolve an existing chat session (validating agent bucket + model
 * freshness) or create a new one. Returns the session id or a 4xx
 * `Response`.
 */
async function resolveOrCreateSession(
  store: SessionsStore,
  req: RunRequest,
  provider: { provider_id: string }
): Promise<string | Response> {
  if (req.session_id) {
    const existing = await store.get(req.session_id);
    if (!existing) {
      return Response.json(
        {
          error: `session not found: ${req.session_id}`,
          code: "session-not-found",
        },
        { status: 404 }
      );
    }
    if (existing.agent !== AGENT_SESSION_AGENT) {
      return Response.json(
        {
          error: `session agent mismatch: ${existing.agent} != ${AGENT_SESSION_AGENT}`,
          code: "session-agent-mismatch",
        },
        { status: 409 }
      );
    }
    if (
      existing.model?.provider_id !== provider.provider_id ||
      existing.model?.tier !== req.tier ||
      existing.model?.model_id !== req.model_id
    ) {
      await store.updateModel(existing.id, {
        provider_id: provider.provider_id,
        tier: req.tier,
        model_id: req.model_id,
      });
    }
    // Persist a mode change so a later queued-turn drain (no client request)
    // reuses the user's last-chosen posture.
    if (existing.mode !== req.mode) {
      await store.updateMode(existing.id, req.mode);
    }
    return existing.id;
  }
  const created = await store.create({
    agent: AGENT_SESSION_AGENT,
    workspace_id: req.workspace_id,
    workspace_root: req.workspace_root,
    model: {
      provider_id: provider.provider_id,
      tier: req.tier,
      model_id: req.model_id,
    },
    mode: req.mode,
  });
  return created.id;
}

/** Collaborators the agent run pipeline needs. */
export type AgentRuntimeDeps = ResolveDeps & {
  workspace_registry: WorkspaceRegistry;
  sessions_store: SessionsStore;
  /**
   * GRIDA-SEC-004 — the agent host's own secret root (its `userData`, where
   * BYOK `auth.json`, `workspaces.json`, `recent.json`, and the sessions db
   * live). The host process reads it for provider auth, so it is NOT in the
   * srt `deny_read` policy; the shell runner instead rejects any command arg
   * that resolves inside it (see `shell/runner.ts`). The host wires this from
   * its `user_data_path`. Omit to leave the shell child unconstrained on
   * secret-arg reads (test/standalone).
   */
  secrets_root?: string;
  /**
   * GRIDA-SEC-004 — whether the `run_command` shell tool may be exposed to
   * the model. Default (undefined/false) is FAIL-CLOSED: no shell tool. The
   * host sets this true only when the process tree is confined by an OS
   * sandbox (srt), or when it has deliberately opted into an unsandboxed
   * shell (the CLI). Computed once at the HTTP-server boundary from
   * `sandbox_enforced || allow_unsandboxed_shell`; the gate itself lives in
   * `createWorkspaceAgentBindings`. No sandbox (or no opt-in) ⇒ no shell.
   */
  shell_execution_allowed?: boolean;
  /**
   * Base directory for per-session scratch areas (WG `scratch.md`). The host
   * injects it (filesystem location is host-owned I/O); the default is resolved
   * at the server boundary via `defaultScratchBase`. The runtime derives each
   * session's `<base>/sessions/<id>/scratch` under it, creates it on demand, and
   * tells the agent its path. Omit to disable scratch (no scratch reach is
   * wired — the command stays workspace-only).
   */
  scratch_base?: string;
  /**
   * Whether the host enables image generation (its `images` server capability).
   * Threaded to `createWorkspaceAgentBindings`, which builds the
   * `generate_image` binding only when this is set AND a scratch sink + provider
   * key exist. Off ⇒ the tool is never advertised. Mirrors how the HTTP image
   * route is gated by the same capability.
   */
  image_gen_enabled?: boolean;
  /**
   * The catalog model id `generate_image` produces with — the user's selected
   * image model (host-owned config). The tool is prompt-only, so the model is
   * NOT an agent argument. Omit to use the catalog default.
   */
  image_model_id?: string;
  /**
   * Whether a human UI is bound — gates the locked `question` tool. When true
   * the tool is client-resolved (pauses for the user's answer); when
   * false/undefined (fail-closed headless) the tool refuses with a fixed tool
   * error. Threaded from the HTTP-server boundary down to `createToolset`.
   */
  interactive?: boolean;
  /**
   * Host-level default for the `design_search` (library) capability, overridden
   * by the per-run `library` flag. Threaded down to `createToolset` like
   * {@link interactive}.
   */
  library?: boolean;
  /**
   * Optional injected registry — the smoke + tests pre-populate entries.
   * Omit to let AgentRuntime allocate its own.
   */
  streams?: StreamRegistry;
  /**
   * Override the upstream model-run fn. Defaults to {@link runAgent}.
   * Tests inject a deterministic fake; the run loop, registry, and
   * recorder still run for real.
   */
  run_agent?: typeof runAgent;
  /**
   * Auto-compaction policy (RFC `session / compaction`). Defaults to
   * enabled with {@link DEFAULT_COMPACTION_CONFIG}. Tests inject a fake
   * summarizer or disable it.
   */
  compaction?: {
    enabled?: boolean;
    config?: CompactionConfig;
    summarize?: compactor.Summarize;
  };
  /**
   * Skill/instruction discovery scope (RFC `skills / discovery sources`).
   * Defaults to the full set (project + user-scoped). Hosts that want a
   * narrower scope — or a hermetic test — constrain it here.
   */
  skill_discovery?: {
    include_user_scoped?: boolean;
    config_paths?: string[];
    /** The host-bundled skills dir (repo-root `skills/`) — the lowest-precedence
     *  layer that ships the built-in `svg`/`dotcanvas`/`slides` skills. Host
     *  resolves it (desktop = packaged resources; CLI = flag/default). */
    bundled_dir?: string;
    /** Stop the upward project + instruction walk here (inclusive). */
    stop_at?: string;
  };
  /**
   * Inter-turn settle delay before a drained queued turn fires (RFC `queue`).
   * Defaults to {@link DEFAULT_DRAIN_COOLDOWN_MS}. Tests shrink it.
   */
  drain_cooldown_ms?: number;
};

/** A provider resolved by {@link resolveProvider} (model factory + ids). */
type ResolvedProvider = Awaited<ReturnType<typeof resolveProvider>>;

/** One store snapshot powering both compaction limits and the summarizer
 *  cap — see {@link AgentRuntime.limitsResolver}. */
type LimitsResolution = {
  resolve: ResolveModelLimits;
  configs: readonly EndpointProviderConfig[];
};

/**
 * Everything {@link AgentRuntime.startTurn} needs to fire ONE turn, decoupled
 * from any HTTP request. The HTTP `run()` path and the core queue drain both
 * build this.
 */
type StartTurnOptions = {
  provider: ResolvedProvider;
  run_id: string;
  tier: RunRequest["tier"];
  model_id?: RunRequest["model_id"];
  feature?: RunRequest["feature"];
  workspace_root?: string;
  mode: RunRequest["mode"];
  /** Whether the requesting client can answer the `question` tool (per-run;
   *  absent ⇒ the host `interactive` default). A core drain leaves it absent. */
  interactive?: RunRequest["interactive"];
  /** Whether the requesting client can resolve `design_search` (per-run; absent
   *  ⇒ the host `library` default). */
  library?: RunRequest["library"];
  /**
   * Files to seed into the session's scratch dir before the turn (WG
   * `scratch.md`): a picked template's unzipped bundle / an upload lands there,
   * not the workspace. Only the direct HTTP run (the first turn) carries it; a
   * queue drain leaves it absent — scratch was already seeded on turn one.
   */
  scratch_seed?: RunRequest["scratch_seed"];
  /**
   * The user message this turn fires — the fired-message identity the
   * turn-lifecycle wire carries (RFC `turn-authority`; emitted on the
   * `turn-started` event). A queue drain names the dequeued row; an HTTP
   * run names the incoming tail's user message; an approval-answer resume
   * fires no new user message and leaves this absent.
   */
  fired_message_id?: string;
  /**
   * Set only when `provider.kind === "agent-provider"`: the single prompt
   * string handed to the external agent for this turn (issue #813).
   */
  agent_prompt?: string;
};

async function prepareScratchForTurn(
  sessionId: string,
  scratchDir: string | undefined,
  secretsRoot: string | undefined,
  scratchSeed: StartTurnOptions["scratch_seed"]
): Promise<void> {
  if (!scratchDir) return;
  await ensureScratch(scratchDir, secretsRoot);
  if (!scratchSeed || scratchSeed.length === 0) return;

  const seeded = await Promise.allSettled(
    scratchSeed.map((f) =>
      writeScratchFile(scratchDir, f.path, new TextEncoder().encode(f.text))
    )
  );
  for (const r of seeded) {
    if (r.status === "rejected") {
      console.warn(
        `[agent-host] scratch seed file failed sessionId=${sessionId}: ${String(
          r.reason
        )}`
      );
    }
  }
}

function promptFromLatestUserModelMessage(
  messages: ModelUIMessage[],
  fallback: string
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text = m.parts
      .map((p) =>
        typeof p === "object" &&
        p !== null &&
        "type" in p &&
        (p as { type?: unknown }).type === "text" &&
        "text" in p &&
        typeof (p as { text?: unknown }).text === "string"
          ? (p as { text: string }).text
          : null
      )
      .filter((p): p is string => p !== null && p.length > 0)
      .join("\n\n");
    if (text.length > 0) return text;
  }
  return fallback;
}

export class AgentRuntime {
  /** In-flight run registry. Owned here; `AgentHost.streams` aliases it. */
  readonly streams: StreamRegistry;
  /**
   * The per-session run-state machine (RFC `queue`): authoritative
   * `SessionStatus` + the serial queue drain. Observes the registry lifecycle
   * and fires queued turns through {@link startTurn}. The status SSE route
   * reads it ({@link SessionScheduler.subscribe}).
   */
  readonly scheduler: SessionScheduler;
  /**
   * The lifecycle event bus (RFC `events`): `turn-started` /
   * `turn-finished` / `approval-requested`, multi-subscriber, volatile,
   * observe-only. In-process consumers subscribe here; the host-wide SSE
   * route projects it ({@link eventsStream}).
   */
  readonly events = new AgentEventBus();
  private readonly run_agent_fn: typeof runAgent;
  /** Session-static agent context, discovered once per session id. */
  private readonly session_contexts = new Map<string, SessionContext>();
  /**
   * Fired-message id of the single in-flight turn per session (single-flight
   * makes one slot enough). Written at reserve, captured + cleared at the
   * finish edge so the `turn-finished` event names the turn it closes.
   */
  private readonly fired_messages = new Map<string, string | undefined>();
  /**
   * Per-session emission chain — preserves the RFC `events` per-session
   * causal order. The finished-emission awaits a store read (the
   * pending-approval check), and a new turn can start during that await;
   * without the chain its `turn-started` could overtake the prior turn's
   * `turn-finished` on the bus.
   */
  private readonly session_event_chains = new Map<string, Promise<void>>();
  /** Registry-observer detach fns, called in {@link dispose} — the registry
   *  can be injected and outlive this runtime. */
  private readonly detach_observers: Array<() => void> = [];
  private readonly compaction_enabled: boolean;
  private readonly compaction_config: CompactionConfig;
  private readonly compaction_summarize?: compactor.Summarize;

  constructor(private readonly deps: AgentRuntimeDeps) {
    this.streams = deps.streams ?? new StreamRegistry();
    this.run_agent_fn = deps.run_agent ?? runAgent;
    this.compaction_enabled = deps.compaction?.enabled ?? true;
    this.compaction_config =
      deps.compaction?.config ?? DEFAULT_COMPACTION_CONFIG;
    this.compaction_summarize = deps.compaction?.summarize;

    // Run-state machine: owns SessionStatus + the serial drain. Its drain is a
    // one-way dependency back into this runtime (fires a turn via startTurn);
    // it reads/clears the queue through the store. Wire it to the registry's
    // busy/idle edges (works for an injected registry too).
    this.scheduler = new SessionScheduler({
      list_queued: (sessionId) =>
        this.deps.sessions_store.listQueuedMessages(sessionId),
      dequeue: (messageId) =>
        this.deps.sessions_store.dequeueMessage(messageId),
      drain: (sessionId, messageId) => this.drainTurn(sessionId, messageId),
      has_pending_human_input: (sessionId) =>
        this.deps.sessions_store.hasPendingHumanInput(sessionId),
      drain_cooldown_ms: deps.drain_cooldown_ms,
    });
    // Both observers are detached in dispose(): the registry can be
    // INJECTED (deps.streams) and so outlive this runtime — without the
    // detach, a disposed runtime's scheduler would keep receiving edges.
    this.detach_observers.push(
      this.streams.observe({
        on_create: (sessionId) => this.scheduler.onCreate(sessionId),
        on_finish: (sessionId, reason) =>
          this.scheduler.onFinish(sessionId, reason),
      })
    );
    // Second registry observer — the lifecycle event bus (RFC `events`).
    // Attachable alongside the scheduler because `observe` is
    // multi-subscriber; the finish edge is the single chokepoint every end
    // path funnels through (pump finish/error, explicit abort).
    this.detach_observers.push(
      this.streams.observe({
        on_finish: (sessionId, reason) => {
          // Capture the fired identity AT the edge — a subsequent turn's
          // reserve may rewrite the slot before the ordered task runs.
          const messageId = this.fired_messages.get(sessionId);
          this.fired_messages.delete(sessionId);
          this.emitTurnFinished(sessionId, reason, messageId);
        },
      })
    );
  }

  /**
   * Emit a turn's end on the lifecycle bus: `approval-requested` first when
   * the turn ended blocked on an unanswered supervised approval (read from
   * the AUTHORITATIVE persisted approval state — the same fact the drain
   * fire-gate consults), then `turn-finished`. Ordered per session via
   * {@link emitOrdered}.
   */
  private emitTurnFinished(
    sessionId: string,
    reason: StreamEndReason,
    messageId: string | undefined
  ): void {
    this.emitOrdered(sessionId, async () => {
      let pending = false;
      // Only a cleanly-settled run can be approval-blocked: the approval
      // request itself ends the run with "finish" (RFC `queue` §drain-pause).
      if (reason === "finish") {
        try {
          pending =
            await this.deps.sessions_store.hasPendingApproval(sessionId);
        } catch {
          // Unknowable → report a plain finish. The durable approval state
          // is still authoritative for the drain; only this event's flavor
          // degrades.
        }
      }
      const at = Date.now();
      if (pending) {
        this.events.emit({
          type: "approval-requested",
          session_id: sessionId,
          at,
        });
      }
      this.events.emit({
        type: "turn-finished",
        session_id: sessionId,
        message_id: messageId,
        reason,
        pending_approval: pending,
        at,
      });
    });
  }

  /**
   * Run `task` after every previously-enqueued emission task for this
   * session — the RFC `events` per-session causal order. Tasks never
   * reject the chain (failures are swallowed); the chain entry is dropped
   * once its tail settles so the map doesn't grow with dead sessions.
   */
  private emitOrdered(
    sessionId: string,
    task: () => void | Promise<void>
  ): void {
    const prev = this.session_event_chains.get(sessionId) ?? Promise.resolve();
    const next = prev.then(task).then(
      () => undefined,
      () => undefined
    );
    this.session_event_chains.set(sessionId, next);
    void next.then(() => {
      if (this.session_event_chains.get(sessionId) === next) {
        this.session_event_chains.delete(sessionId);
      }
    });
  }

  /**
   * Fire the next queued turn for a session — the scheduler's injected drain
   * (RFC `queue / the run-state machine`). The scheduler already dequeued the
   * fired row (cleared its `queued_at`) just before calling this, so it is
   * already in the model view; this just rebuilds the turn context from the
   * PERSISTED session — provider/model from `session.model`, workspace root
   * from the row — and starts the turn. No client request, no per-send skills
   * (a renderer concern with no analogue here). `messageId` is the dequeued
   * row the scheduler fired — carried through to the `turn-started` event
   * (RFC `turn-authority`), never used to select what runs. Throws
   * {@link RunInFlightError} if a run is already in flight (the scheduler
   * swallows it and retries on the next idle edge).
   */
  private async drainTurn(sessionId: string, messageId: string): Promise<void> {
    const session = await this.deps.sessions_store.get(sessionId);
    if (!session) return;
    // Resolve the provider from the persisted model. A provider-down here
    // throws to the scheduler (swallowed); the committed row waits for a
    // user retry. The win path owns status.
    const provider = await resolveProvider(this.deps, {
      explicit: session.model?.provider_id,
    });
    const workspaceRoot =
      (await this.deps.sessions_store.getWorkspaceRoot(sessionId)) ?? undefined;
    const runId = crypto.randomUUID();
    console.log(
      `[agent-host-agent] drain firing sessionId=${sessionId} runId=${runId} providerId=${provider.provider_id}`
    );
    this.startTurn(sessionId, {
      provider,
      run_id: runId,
      tier: session.model?.tier ?? AGENT_DEFAULT_TIER,
      model_id: session.model?.model_id,
      workspace_root: workspaceRoot,
      // Queued-turn posture comes from the persisted session, not a client
      // request (there is none here). Legacy rows (null mode) fall to default.
      mode: session.mode ?? AGENT_DEFAULT_MODE,
      fired_message_id: messageId,
    });
  }

  /**
   * Get (or discover, once) the session-static agent context: the RFC
   * skill index + project instructions for the session's workspace root.
   * Discovery is skipped for unbound (no-workspace) sessions. The skill
   * body cache persists across the per-turn agent rebuilds.
   */
  private async sessionContext(
    sessionId: string,
    workspaceRoot: string | undefined
  ): Promise<SessionContext> {
    const cached = this.session_contexts.get(sessionId);
    if (cached) return cached;
    let ctx: SessionContext = { skill_cache: new Map() };
    const scope = this.deps.skill_discovery;
    // Discover when there's a workspace to walk OR host-bundled skills to
    // advertise. A workspace-less session (the desktop single-file SVG/text
    // window) still gets the built-in `svg`/`dotcanvas`/`slides` skills — they
    // don't depend on a workspace — so a direct-opened SVG keeps its format
    // guidance. Project instructions (`AGENTS.md` walk) stay workspace-only.
    if (workspaceRoot || scope?.bundled_dir) {
      try {
        const [skillIndex, instructions] = await Promise.all([
          discoverSkills({
            workspace_root: workspaceRoot,
            include_user_scoped: scope?.include_user_scoped,
            config_paths: scope?.config_paths,
            bundled_dir: scope?.bundled_dir,
            stop_at: scope?.stop_at,
          }),
          workspaceRoot
            ? discoverProjectInstructions({
                workspace_root: workspaceRoot,
                stop_at: scope?.stop_at,
              })
            : Promise.resolve({ text: "" }),
        ]);
        ctx = {
          skill_index: skillIndex,
          project_instructions: instructions.text || undefined,
          skill_cache: new Map(),
        };
      } catch (err) {
        console.warn(
          `[agent-host-agent] skill/instruction discovery failed for ${sessionId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
    this.session_contexts.set(sessionId, ctx);
    return ctx;
  }

  /**
   * Registry-aware model-limits resolution (issue #806): resolves over
   * catalog ∪ registered endpoint models, and substitutes an endpoint
   * session's missing `model_id` with the endpoint's default model — a
   * tier-only Ollama session must NOT fall back to the catalog tier's
   * frontier-sized window (1M assumed on an 8k model ⇒ compaction never
   * fires ⇒ the session dies on context overflow). Carries the loaded
   * configs so downstream checks (the summarizer cap) reuse the same
   * snapshot instead of re-reading the store.
   */
  private async limitsResolver(): Promise<LimitsResolution> {
    const endpoints = this.deps.endpoints;
    if (!endpoints) {
      return { resolve: (model) => resolveModelLimits(model), configs: [] };
    }
    const configs = await endpoints.list();
    const custom = configs.flatMap(resolveEndpointModels);
    const resolve: ResolveModelLimits = (model) => {
      let effective = model;
      if (model?.provider_id) {
        const endpoint = configs.find((e) => e.id === model.provider_id);
        const defaultId = endpoint && endpointDefaultModelId(endpoint);
        // Substitute the endpoint default when the session has no model
        // id — or a STALE one (saved against a model since removed from
        // the config): either way, falling through to the catalog tier
        // would assume a frontier-sized window on a local model. "Known"
        // is scoped to THIS endpoint's models — another endpoint serving
        // the same id must not vouch for it.
        const knownOnEndpoint =
          !!model.model_id &&
          !!endpoint?.models.some((m) => m.id === model.model_id);
        if (defaultId && !knownOnEndpoint) {
          effective = { ...model, model_id: defaultId };
        }
      }
      return resolveModelLimits(effective, custom);
    };
    return { resolve, configs };
  }

  /**
   * The summarizer's input cap for a session (issue #806). The compactor
   * subagent asks for the `nano` tier, but an endpoint factory maps every
   * tier to the endpoint's default model — so when the session runs on a
   * configured endpoint, the cap must be that model's window, not the
   * catalog nano model's. `undefined` keeps the compaction default.
   */
  private summarizerInputCap(
    model: ChatModel | null,
    limits: LimitsResolution
  ): number | undefined {
    const providerId = model?.provider_id;
    if (!providerId) return undefined;
    if (!limits.configs.some((e) => e.id === providerId)) return undefined;
    // Limits of the endpoint's DEFAULT model (what `nano` resolves to):
    // a model_id-less ChatModel routes through the resolver's default-
    // model substitution above. Reserve room for the summary output —
    // clamped to the window itself so a sub-5k model never gets handed
    // more input than it can hold.
    const window = limits.resolve({ provider_id: providerId }).context_window;
    return Math.min(window, Math.max(1_024, window - 4_096));
  }

  /**
   * Fire auto-compaction when the session is at/over its usable context
   * (RFC `session / compaction`). Blocks the turn on the summarizer — by
   * design, the next user message waits rather than overflowing. Failures
   * are swallowed: a failed compaction proceeds uncompacted (the
   * compaction layer logs).
   */
  private async maybeAutoCompact(
    sessionId: string,
    modelFactory: Parameters<typeof compactSession>[0]["model_factory"],
    signal: AbortSignal
  ): Promise<void> {
    if (!this.compaction_enabled) return;
    const session = await this.deps.sessions_store.get(sessionId);
    if (!session) return;
    const limits = await this.limitsResolver();
    const modelLimits = limits.resolve(session.model);
    if (
      !shouldCompact(session.total_tokens, modelLimits, this.compaction_config)
    ) {
      return;
    }
    try {
      await compactSession(
        {
          store: this.deps.sessions_store,
          model_factory: modelFactory,
          summarize: this.compaction_summarize,
          resolve_limits: limits.resolve,
        },
        {
          session_id: sessionId,
          auto: true,
          config: this.compaction_config,
          signal,
          summarizer_input_cap: this.summarizerInputCap(session.model, limits),
        }
      );
    } catch (err) {
      console.warn(
        `[agent-host-agent] auto-compaction error for ${sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * `POST /agent/run` — start (or resume by sessionId) a run. Streams
   * AI-SDK UI-message SSE; the resolved session id is the first frame
   * (`grida-session` event). The registry entry owns the model call's
   * lifetime, so a client TCP close (refresh, sleep) detaches the consumer
   * without aborting the model.
   */
  async run(body: unknown, requestSignal: AbortSignal): Promise<Response> {
    const req = await parseRunBody(body, this.deps);
    if (req instanceof Response) return req;

    // Resolve provider BEFORE opening the stream so a 4xx stays a proper
    // HTTP error instead of a half-opened SSE.
    let provider;
    if (isAgentProviderModel(req.model_id)) {
      // Agent-provider class (issue #813): an external agent owns its own
      // loop. No BYOK/endpoint resolution, no model factory — the runtime
      // streams from the agent-provider consumer in startTurn.
      provider = makeAgentProvider(AGENT_PROVIDER_MODELS[req.model_id].id);
    } else {
      try {
        provider = await resolveProvider(this.deps, { explicit: req.explicit });
      } catch (err) {
        if (err instanceof ProviderUnavailableError) {
          return Response.json(
            err.provider_id
              ? {
                  error: err.message,
                  code: err.code,
                  provider_id: err.provider_id,
                }
              : { error: err.message, code: err.code },
            { status: 409 }
          );
        }
        throw err;
      }
    }

    const runId = crypto.randomUUID();
    console.log(
      `[agent-host-agent] run started providerId=${provider.provider_id} runId=${runId} tier=${req.tier} modelId=${req.model_id ?? "(tier)"} kind=${provider.kind}`
    );

    const sessionResolution = await resolveOrCreateSession(
      this.deps.sessions_store,
      req,
      provider
    );
    if (sessionResolution instanceof Response) return sessionResolution;
    const sessionId = sessionResolution;
    const {
      messages,
      tier,
      model_id: modelId,
      feature,
      workspace_root: workspaceRoot,
      mode,
      approval_answer: approvalAnswer,
    } = req;

    // Supervised-approval resume (RFC `permission modes`, Phase 2): if this
    // re-submit carries an Allow/Deny (the explicit `approval_answer` body
    // field), apply it to the persisted part BEFORE anything else — the
    // pending-approval guard below must see the cleared state, and the model
    // view rebuilt in `startTurn` must no longer see `approval-requested` or the
    // run would not resume. `applyApprovalAnswer` flips a part persisted by the
    // PRIOR turn, so it does not depend on the incoming tail being persisted yet.
    if (approvalAnswer) {
      await applyApprovalAnswer(
        this.deps.sessions_store,
        sessionId,
        approvalAnswer
      );
    }

    // Clear a CLIENT-resolved answer that rides the incoming tail BEFORE the
    // pending-block guard below. A `question` answer is a terminal tool result
    // on the assistant tail (not a body field like an approval), so without
    // this the very POST carrying the answer would trip the guard it resolves
    // (the live-daemon resume 409). Idempotent vs. the later persistIncomingTail.
    await fillIncomingToolResults(
      this.deps.sessions_store,
      sessionId,
      messages
    );

    // Fail closed on an unanswered human-in-the-loop block (a supervised
    // approval, or a `question` paused for the user) — the SAME invariant the
    // scheduler's drain enforces (`session-scheduler.ts` `has_pending_human_input`):
    // never start a NEW turn while one is pending. `buildModelMessages` drops the
    // unanswered blocking part, so a turn started here would orphan the block and
    // run the next message ahead of it. A valid `approval_answer` above clears an
    // approval; a question clears when its answer is filled. The client normally
    // queues sends while a block is pending (it never POSTs here), so this is the
    // server-authoritative guard for a direct or forged send. We bail BEFORE
    // persisting the incoming tail so a typed-ahead follow-up isn't recorded
    // against a refused turn.
    if (await this.deps.sessions_store.hasPendingHumanInput(sessionId)) {
      return Response.json(
        {
          error:
            "a human-input block (approval or question) is pending; resolve it before starting a new turn",
          code: "human-input-pending",
          session_id: sessionId,
        },
        { status: 409 }
      );
    }

    await persistIncomingTail(this.deps.sessions_store, sessionId, messages);

    // Fire-and-forget title generation; writes title only if still the
    // default sentinel, so a user rename always wins. Failures swallowed.
    const firstUserText = extractFirstUserText(messages);
    // Titling runs a model-provider; skip it for agent-providers (no factory).
    if (provider.kind !== "agent-provider" && firstUserText.length > 0) {
      void titler
        .maybeGenerate({
          store: this.deps.sessions_store,
          session_id: sessionId,
          model_factory: provider.model_factory,
          user_text: firstUserText,
        })
        .catch((err) => {
          console.warn(
            `[agent-host-titler] failed sessionId=${sessionId} err=${
              err instanceof Error ? err.message : String(err)
            }`
          );
        });
    }

    // Reserve + pump for this turn (single-flight owned by startTurn). A 409
    // surfaces as RunInFlightError; everything else streams.
    try {
      this.startTurn(sessionId, {
        provider,
        run_id: runId,
        tier,
        model_id: modelId,
        feature,
        workspace_root: workspaceRoot,
        mode,
        // Per-run client UI capability (the desktop-from-web bridge sets true; a
        // headless `cli run` sets false). Absent ⇒ host default downstream.
        interactive: req.interactive,
        // Per-run library-search capability (renderer wires the resolver).
        library: req.library,
        // First-turn scratch seed (a picked template's unzipped bundle / an
        // upload) — landed in scratch before the model turn (WG `scratch.md`).
        scratch_seed: req.scratch_seed,
        // The fired message of a direct run is the incoming tail's user
        // message (the client resends history; the tail is the new one). An
        // approval-answer resume continues the PRIOR turn's tool call — it
        // fires no new user message (RFC `turn-authority`).
        fired_message_id: approvalAnswer
          ? undefined
          : extractLastUserMessageId(messages),
        // Agent-provider turns take a single prompt string (the external
        // agent owns history); the tail user message is this turn's prompt.
        agent_prompt:
          provider.kind === "agent-provider"
            ? extractLastUserText(messages)
            : undefined,
      });
    } catch (err) {
      if (err instanceof RunInFlightError) {
        return Response.json(
          { error: err.message, code: err.code, session_id: sessionId },
          { status: 409 }
        );
      }
      throw err;
    }

    return buildConsumerResponse(this.streams, sessionId, requestSignal);
  }

  /**
   * Reserve the single-flight registry entry, attach the recorder, and launch
   * the (fire-and-forget) model pump for ONE turn. Both the HTTP `run()` path
   * and the core queue drain go through here, so the reserve, recorder attach,
   * model view, and finish are owned in one place. Throws
   * {@link RunInFlightError} if a run is already in flight — the caller maps
   * it (HTTP → 409; a core drain swallows it and retries on the next idle
   * edge). The model view is built from the server-authoritative
   * `listVisibleMessages`; a drained row is already made visible by the
   * scheduler (it clears `queued_at` right before firing), so this needs no
   * client message array and no dequeue of its own.
   */
  private startTurn(sessionId: string, opts: StartTurnOptions): StreamEntry {
    const {
      provider,
      run_id: runId,
      tier,
      model_id: modelId,
      feature,
      workspace_root: workspaceRoot,
      mode,
      interactive,
      library,
      scratch_seed: scratchSeed,
    } = opts;

    // Reserve the registry entry; its `modelAbort.signal` (not the request
    // signal) drives the model call so a disconnect can resume. Throws
    // RunInFlightError to the caller if a run is already in flight.
    const entry = this.streams.create(sessionId);

    // Lifecycle event (RFC `events`): the turn is reserved — announce it,
    // naming the fired message (RFC `turn-authority`). Stash the id for the
    // finish edge (single-flight ⇒ one slot per session suffices). Emitted
    // via the ordered chain so it can never overtake a prior turn's
    // still-resolving `turn-finished`.
    this.fired_messages.set(sessionId, opts.fired_message_id);
    this.emitOrdered(sessionId, () => {
      this.events.emit({
        type: "turn-started",
        session_id: sessionId,
        message_id: opts.fired_message_id,
        at: Date.now(),
      });
    });

    // Recorder consumer — attached BEFORE the pump so no frame is missed.
    // We hold a handle to BOTH the consumer and its detach fn: the success
    // path drives the recorder's terminal flush itself (so the assistant row
    // is committed before usage is stamped — see below) and detaches it so
    // `streams.finish` doesn't re-fire its `on_end`. The error/abort path
    // leaves it attached, flushed by `streams.finish` as usual.
    const recorder = createRecorderConsumer({
      store: this.deps.sessions_store,
      session_id: sessionId,
      run_id: runId,
    });
    const detachRecorder = this.streams.attach(sessionId, recorder);

    const streams = this.streams;
    const runAgentFn = this.run_agent_fn;
    const {
      workspace_registry: workspaceRegistry,
      sessions_store: sessionsStore,
      secrets_root: secretsRoot,
      shell_execution_allowed: shellExecutionAllowed,
      scratch_base: scratchBase,
    } = this.deps;
    // Per-session scratch dir (WG `scratch.md`). Derived (pure) here so it can
    // ride `runDeps`; the dir is created on disk just before the model turn
    // (below). Scratch is the sink for the shell (an allowed cwd root) AND for
    // `generate_image` (its output dir), so derive it when EITHER is enabled —
    // an images-only host that keeps the shell off still needs it (#920 review).
    const scratchDir =
      scratchBase &&
      workspaceRoot &&
      (shellExecutionAllowed ||
        this.deps.image_gen_enabled === true ||
        (scratchSeed && scratchSeed.length > 0))
        ? scratchRootFor(scratchBase, sessionId)
        : undefined;
    // Bindings deps for the run. Typed (not an inline literal) so the
    // GRIDA-SEC-004 `secrets_root` + `shell_execution_allowed` (and `scratch_dir`)
    // thread through `runAgent`'s narrower `{ workspace_registry }` param into
    // `createWorkspaceAgentBindings`.
    const runDeps = {
      workspace_registry: workspaceRegistry,
      secrets_root: secretsRoot,
      shell_execution_allowed: shellExecutionAllowed,
      scratch_dir: scratchDir,
      // BYOK keys + the host's image-modality switch — together with scratchDir
      // they let `createWorkspaceAgentBindings` build the `generate_image`
      // binding (the produced bytes sink to scratch).
      secrets: this.deps.secrets,
      // GRIDA-SEC-006 — hosted-session deps for the generate_image gate.
      gg: this.deps.gg,
      gg_base_url: this.deps.gg_base_url,
      image_gen_enabled: this.deps.image_gen_enabled === true,
      image_model_id: this.deps.image_model_id,
      // Host-level: gates the `question` tool's execute-or-pause in createAgent.
      interactive: this.deps.interactive === true,
      // Host-level default for design_search; per-run `req.library` overrides.
      library: this.deps.library === true,
    };
    // Pump: open the upstream model call, forward each SSE frame into the
    // registry. Doesn't block the caller; a client attaches as another
    // consumer (HTTP) or reconnects later (a core drain has no live consumer).
    void (async () => {
      try {
        // Create the session scratch dir before ANY provider split so
        // agent-provider turns and model-provider turns see the same first-turn
        // template/upload seed. `scratchDir` also exists for shell/image-only
        // hosts even without a seed.
        await prepareScratchForTurn(
          sessionId,
          scratchDir,
          secretsRoot,
          scratchSeed
        );

        // Agent-provider class (issue #813): the external agent owns the loop.
        // Skip compaction/model-factory/tool-injection entirely — just run one
        // turn and push its mapped chunks into the registry. The recorder
        // (attached above) persists the assistant message from those chunks;
        // `streams.finish` flushes it, same as the normal terminal edge.
        if (provider.kind === "agent-provider") {
          const visible = await sessionsStore.listVisibleMessages(sessionId);
          const preparedMessages = buildModelMessages(visible);
          // Continuity (issue #813): resume the external agent's prior session
          // so it keeps the conversation. Read the id stored last turn, pass it
          // in, and persist the id observed this turn for the NEXT turn.
          const priorRow = await sessionsStore.get(sessionId);
          const resumeSessionId = (
            priorRow?.metadata?.agent_provider as
              | { session_id?: string }
              | undefined
          )?.session_id;
          // The picker's synthetic model_id selects the vendor model (issue
          // #813). Derived from opts.model_id so it works on BOTH the HTTP run
          // and the queue-drain path.
          const agentModel = isAgentProviderModel(opts.model_id)
            ? agentProviderModel(opts.model_id)
            : undefined;
          const result = await runAgentProviderTurn({
            provider_id: provider.provider_id as AgentProviderId,
            prompt: promptFromLatestUserModelMessage(
              preparedMessages,
              opts.agent_prompt ?? ""
            ),
            cwd: workspaceRoot,
            resume_session_id: resumeSessionId,
            model: agentModel,
            signal: entry.model_abort.signal,
            emit: (chunk) => streams.push(sessionId, JSON.stringify(chunk)),
          });
          if (
            result.providerSessionId &&
            result.providerSessionId !== resumeSessionId
          ) {
            await sessionsStore
              .setAgentProviderSessionId(sessionId, result.providerSessionId)
              .catch(() => undefined);
          }
          // Deterministic recorder flush — mirror the normal success path:
          // detach so `streams.finish` won't re-fire `on_end`, then AWAIT the
          // terminal flush so the assistant row is committed before the
          // response is consumed (otherwise a fast reader sees no history).
          detachRecorder();
          await recorder.on_end("finish");
          streams.finish(sessionId, "finish");
          return;
        }

        // Auto-compaction (RFC `session / compaction`): if the session is
        // at/over its usable context, block this turn on the summarizer.
        await this.maybeAutoCompact(
          sessionId,
          provider.model_factory,
          entry.model_abort.signal
        );

        // Server-authoritative message view (RFC `session`): rebuild what
        // the model sees from the VISIBLE persisted messages — NOT the raw
        // client array. This is what makes rewind + compaction real (hidden
        // rows drop out; the summary folds into the next user turn).
        const visible = await sessionsStore.listVisibleMessages(sessionId);
        const preparedMessages = buildModelMessages(visible);

        // Session-static skills + project instructions (discovered once).
        const ctx = await this.sessionContext(sessionId, workspaceRoot);

        // Accumulate the run's usage so it can be stamped onto the
        // assistant message — recomputeRollups (rewind/fork/compaction)
        // sums per-message usage.
        const runUsage: MessageUsage = {};

        const response = await runAgentFn(
          provider,
          {
            messages: preparedMessages as never,
            tier,
            model_id: modelId,
            feature,
            run_id: runId,
            signal: entry.model_abort.signal,
            workspace_root: workspaceRoot,
            mode,
            interactive,
            library,
            skill_index: ctx.skill_index,
            skill_cache: ctx.skill_cache,
            project_instructions: ctx.project_instructions,
            on_step_usage: (usage) => {
              accumulateUsage(runUsage, usage);
              void sessionsStore.updateUsage(sessionId, {
                prompt_tokens: usage.input_tokens,
                completion_tokens: usage.output_tokens,
                total_tokens: usage.total_tokens,
              });
            },
          },
          // GRIDA-SEC-004 — `secrets_root` rides the bindings deps down to the
          // shell runner's arg check. Built as a typed var (not a fresh
          // literal) so it threads through `runAgent`'s narrower param to
          // `createWorkspaceAgentBindings`, which reads it at runtime.
          runDeps
        );
        console.log(`[agent-host-agent] run response opened runId=${runId}`);
        await pumpResponseIntoRegistry(response, streams, sessionId);
        // Drain the recorder BEFORE stamping usage. The recorder creates the
        // assistant row on a fire-and-forget write_chain fed by each pushed
        // frame; `pumpResponseIntoRegistry` returning only means the frames
        // were enqueued, not that the row was written. `setLatestAssistantUsage`
        // addresses "the latest assistant row", so stamping before the write
        // settles races onto the wrong row (or none). The recorder's terminal
        // flush (its `on_end`) awaits its write_chain + finalizes, so awaiting
        // it here makes the row exist deterministically. Detach so the later
        // `streams.finish` won't re-fire `on_end` on it.
        detachRecorder();
        await recorder.on_end("finish");
        if (hasUsage(runUsage)) {
          await sessionsStore
            .setLatestAssistantUsage(sessionId, runUsage)
            .catch(() => undefined);
        }
        streams.finish(sessionId, "finish");
      } catch (err) {
        const reason = entry.model_abort.signal.aborted ? "abort" : "error";
        console.log(
          `[agent-host-agent] run failed runId=${runId} reason=${reason} err=${
            err instanceof Error ? err.message : String(err)
          }`
        );
        // Forward the real reason: a genuine failure ("error") must reach
        // consumers as an error, not a clean/aborted close, so the client
        // can distinguish a crashed run from a user cancel.
        streams.finish(sessionId, reason);
      }
    })();

    return entry;
  }

  /**
   * `GET /agent/stream/:sessionId` — reconnect to an in-flight run. Full
   * replay from chunk 0 then live tail; 404 if no run is in flight (the
   * client falls back to DB hydration).
   */
  stream(sessionId: string, requestSignal: AbortSignal): Response {
    if (!sessionId) {
      return Response.json({ error: "sessionId required" }, { status: 400 });
    }
    if (!this.streams.get(sessionId)) {
      return Response.json(
        {
          error: "no in-flight stream",
          code: "no-stream",
          session_id: sessionId,
        },
        { status: 404 }
      );
    }
    return buildConsumerResponse(this.streams, sessionId, requestSignal);
  }

  /**
   * `GET /sessions/:id/status` — subscribe to the session's `SessionStatus`
   * (RFC `session.md` §Session status). Long-lived SSE: the current status is
   * the first frame, then every idle⇄busy⇄error transition. Always available —
   * an unknown/idle session reads as `{ state: "idle" }`. This is the
   * authoritative fact the dumb UI renders Stop/Send from.
   */
  statusStream(sessionId: string, requestSignal: AbortSignal): Response {
    if (!sessionId) {
      return Response.json({ error: "sessionId required" }, { status: 400 });
    }
    return buildStatusConsumerResponse(
      this.scheduler,
      sessionId,
      requestSignal
    );
  }

  /**
   * `GET /events` — subscribe to the host-wide lifecycle event stream (RFC
   * `events.md` §projection over the host wire): every session's
   * `turn-started` / `turn-finished` / `approval-requested`, one
   * subscription. Long-lived SSE; volatile by spec — no initial frame, no
   * replay (a late joiner sees only future events; current state lives in
   * the authoritative stores).
   */
  eventsStream(requestSignal: AbortSignal): Response {
    return buildEventsConsumerResponse(this.events, requestSignal);
  }

  /**
   * `POST /agent/abort` — explicit cancel. The ONLY path that cancels the
   * upstream model call (a bare TCP close only detaches a consumer).
   */
  abort(body: unknown): Response {
    const sessionId = (body as { session_id?: unknown } | null | undefined)
      ?.session_id;
    if (typeof sessionId === "string" && sessionId.length > 0) {
      this.streams.abort(sessionId);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "sessionId required" }, { status: 400 });
  }

  /**
   * `POST /sessions/:id/rewind` — soft-truncate to a prior message (RFC
   * `session / rewinding`). `restore: true` un-rewinds (un-hides). Refuses
   * while a run is in flight.
   */
  async rewind(sessionId: string, body: unknown): Promise<Response> {
    const { from_message_id: fromMessageId, restore } = (body ?? {}) as {
      from_message_id?: unknown;
      restore?: unknown;
    };
    if (typeof fromMessageId !== "string" || fromMessageId.length === 0) {
      return Response.json(
        { error: "fromMessageId is required" },
        { status: 400 }
      );
    }
    const guard = this.guardIdle(sessionId);
    if (guard) return guard;
    const session = await this.deps.sessions_store.get(sessionId);
    if (!session) {
      return Response.json({ error: "session not found" }, { status: 404 });
    }
    try {
      if (restore === true) {
        await this.deps.sessions_store.unhideAfter(sessionId, fromMessageId);
        const refreshed = await this.deps.sessions_store.get(sessionId);
        return Response.json({ ok: true, restored: true, session: refreshed });
      }
      const result = await this.deps.sessions_store.rewind(
        sessionId,
        fromMessageId
      );
      return Response.json(result);
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 400 }
      );
    }
  }

  /**
   * `POST /sessions/:id/fork` — fork the session at a message into a new
   * session (RFC `session / fork`). Refuses while the parent run is
   * in flight.
   */
  async fork(sessionId: string, body: unknown): Promise<Response> {
    const { from_message_id: fromMessageId, metadata } = (body ?? {}) as {
      from_message_id?: unknown;
      metadata?: unknown;
    };
    if (typeof fromMessageId !== "string" || fromMessageId.length === 0) {
      return Response.json(
        { error: "fromMessageId is required" },
        { status: 400 }
      );
    }
    const guard = this.guardIdle(sessionId);
    if (guard) return guard;
    const parent = await this.deps.sessions_store.get(sessionId);
    if (!parent) {
      return Response.json({ error: "session not found" }, { status: 404 });
    }
    try {
      const forked = await this.deps.sessions_store.fork({
        parent_session_id: sessionId,
        from_message_id: fromMessageId,
        metadata:
          metadata && typeof metadata === "object" && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>)
            : undefined,
      });
      return Response.json(forked);
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 400 }
      );
    }
  }

  /**
   * `POST /sessions/:id/compact` — user-fired compaction (RFC
   * `session / compaction / auto vs manual`). Resolves a provider for the
   * summarizer model; refuses while a run is in flight.
   */
  async compact(sessionId: string): Promise<Response> {
    const guard = this.guardIdle(sessionId);
    if (guard) return guard;
    const session = await this.deps.sessions_store.get(sessionId);
    if (!session) {
      return Response.json({ error: "session not found" }, { status: 404 });
    }
    let provider;
    try {
      provider = await resolveProvider(this.deps, {});
    } catch (err) {
      if (err instanceof ProviderUnavailableError) {
        return Response.json(
          { error: err.message, code: err.code },
          { status: 409 }
        );
      }
      throw err;
    }
    const limits = await this.limitsResolver();
    const result = await compactSession(
      {
        store: this.deps.sessions_store,
        model_factory: provider.model_factory,
        summarize: this.compaction_summarize,
        resolve_limits: limits.resolve,
      },
      {
        session_id: sessionId,
        auto: false,
        config: this.compaction_config,
        summarizer_input_cap: this.summarizerInputCap(session.model, limits),
      }
    );
    return Response.json(result);
  }

  /**
   * `POST /sessions/:id/queue` — enqueue a user message (RFC `queue`). Persists
   * a pending `user` row with `metadata.queued_at`; it is held out of the model
   * view and the transcript until it fires. Does NOT call {@link guardIdle} —
   * enqueueing while a run is in flight is the entire point.
   */
  async enqueue(sessionId: string, body: unknown): Promise<Response> {
    const { id, text } = (body ?? {}) as { id?: unknown; text?: unknown };
    if (typeof text !== "string" || text.trim().length === 0) {
      return Response.json({ error: "text is required" }, { status: 400 });
    }
    const session = await this.deps.sessions_store.get(sessionId);
    if (!session) {
      return Response.json({ error: "session not found" }, { status: 404 });
    }
    const row = await this.deps.sessions_store.appendQueuedMessage(sessionId, {
      id: typeof id === "string" && id.length > 0 ? id : undefined,
      text,
    });
    // Close the stale-busy race: a client enqueues while it believes the
    // session is busy, but the turn may have just ended (the idle status frame
    // still in flight). If the session is already idle with no drain pending,
    // nothing else would ever fire this row — kick a drain now. A no-op while
    // busy (the turn-end edge drains) or while a drain is already scheduled.
    this.scheduler.notifyEnqueued(sessionId);
    return Response.json(row);
  }

  /**
   * `GET /sessions/:id/queue` — the pending queue, FIFO by `queued_at`
   * (RFC `queue / order`).
   */
  async listQueued(sessionId: string): Promise<Response> {
    const session = await this.deps.sessions_store.get(sessionId);
    if (!session) {
      return Response.json({ error: "session not found" }, { status: 404 });
    }
    const items = await this.deps.sessions_store.listQueuedMessages(sessionId);
    return Response.json(items);
  }

  /**
   * `DELETE /sessions/:id/queue/:messageId` — cancel (remove) a queued message
   * before it fires (RFC `queue / operating on queued messages`). Scoped to
   * the path's session: the store only deletes a row that belongs to
   * `sessionId` AND still carries `queued_at`, so a messageId can neither
   * reach across sessions nor remove a fired turn; idempotent.
   */
  async cancelQueued(sessionId: string, messageId: string): Promise<Response> {
    if (!messageId) {
      return Response.json({ error: "messageId required" }, { status: 400 });
    }
    await this.deps.sessions_store.deleteMessage(sessionId, messageId);
    return Response.json({ ok: true });
  }

  /** 409 if a run is actively in flight on this session; null when idle.
   *  Mirrors {@link StreamRegistry.create}: an *ended* entry lingering in
   *  its replay grace window is NOT in flight. */
  private guardIdle(sessionId: string): Response | null {
    if (this.streams.get(sessionId)?.status === "running") {
      return Response.json(
        {
          error: "a run is in flight on this session",
          code: "run_in_flight",
          session_id: sessionId,
        },
        { status: 409 }
      );
    }
    return null;
  }

  /** Drain in-flight runs (abort upstream) + clear the registry. */
  dispose(): void {
    // Detach from the registry FIRST — it can be injected (deps.streams)
    // and outlive this runtime; a disposed runtime must not keep observing.
    for (const detach of this.detach_observers.splice(0)) detach();
    this.streams.clear();
    this.scheduler.dispose();
    this.events.dispose();
    this.session_contexts.clear();
    this.fired_messages.clear();
    this.session_event_chains.clear();
  }

  /** Drop a session's cached static context (call when a session is deleted). */
  forgetSession(sessionId: string): void {
    this.session_contexts.delete(sessionId);
    this.scheduler.forget(sessionId);
    this.fired_messages.delete(sessionId);
  }

  /**
   * Reclaim a session's scratch subtree (WG `scratch.md` S2). Best-effort: a
   * session that never allocated scratch, or a host with scratch disabled, is a
   * no-op. Called on session delete; durability is by promotion, so removing
   * scratch never loses value. Never throws — cleanup must not fail a delete.
   */
  async removeSessionScratch(sessionId: string): Promise<void> {
    const base = this.deps.scratch_base;
    if (!base) return;
    try {
      await removeScratch(base, sessionId);
    } catch (err) {
      console.warn(`[agent] scratch cleanup failed for ${sessionId}:`, err);
    }
  }
}

/**
 * Fold an AI SDK step's usage into the running per-message total. Per the
 * RFC cache-normalization rule, `inputTokens` already includes cache
 * reads, so subtract them out before recording `input`.
 */
function accumulateUsage(acc: MessageUsage, u: AgentStepUsage): void {
  const cacheRead = u.cached_input_tokens ?? 0;
  const input = Math.max(0, (u.input_tokens ?? 0) - cacheRead);
  acc.input = (acc.input ?? 0) + input;
  acc.output = (acc.output ?? 0) + (u.output_tokens ?? 0);
  acc.reasoning = (acc.reasoning ?? 0) + (u.reasoning_tokens ?? 0);
  acc.cache_read = (acc.cache_read ?? 0) + cacheRead;
}

function hasUsage(u: MessageUsage): boolean {
  return Boolean(
    (u.input ?? 0) ||
    (u.output ?? 0) ||
    (u.reasoning ?? 0) ||
    (u.cache_read ?? 0) ||
    (u.cache_write ?? 0)
  );
}
