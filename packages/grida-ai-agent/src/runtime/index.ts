// GRIDA-GG: provider — thread the `gg` session deps into resolution (docs/wg/platform/hosted-ai.md)
// GRIDA-SEC-008 — persist and reuse the exact session provider/model identity.
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
import { unlink } from "node:fs/promises";
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
import {
  QueueMessageConflictError,
  type HumanInputContinuation,
  type SessionsStore,
} from "../session/store";
import {
  DirectoryScopeError,
  type DirectoryScopeRegistry,
} from "../session/directory-scopes";
import type { ChatModel, ChatSessionRow, MessageUsage } from "../session/rows";
import { usageTokenTotal } from "../session/cost";
import {
  DEFAULT_COMPACTION_CONFIG,
  clampSummarizerCap,
  compactSession,
  resolveModelLimits,
  shouldCompact,
  type CompactionConfig,
  type ResolveModelLimits,
} from "../session/compaction";
import { COMPACTOR_TIER, type compactor } from "../session/compactor";
import {
  endpointDefaultModelId,
  resolveEndpointModels,
  type EndpointProviderConfig,
} from "../protocol/endpoints";
import { discoverSkills } from "../skills/discovery";
import { discoverProjectInstructions } from "../skills/project-instructions";
import type { SkillBodyCache, SkillIndex } from "../skills/types";
import type { ShellExecutor, WorkspaceRegistry } from "@grida/daemon/server";
import {
  RunInFlightError,
  StreamRegistry,
  type StreamAdmission,
  type StreamConsumer,
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
  extractTailUserMessageId,
  findIncomingHumanInputResults,
  fillIncomingToolResults,
  hasUnpersistedCallerMessage,
  parseRunBody,
  persistIncomingTail,
  type IncomingHumanInputResult,
  type RunRequest,
} from "./run-input";
import { runAgent, type AgentStepUsage } from "./run-agent";
import {
  scratchRootFor,
  ensureScratch,
  listScratchFilePaths,
  removeScratch,
  writeScratchFile,
} from "../session/scratch";
import { buildModelMessages, type ModelUIMessage } from "./message-view";
import { buildReplayPrefix } from "./replay-prefix";
import type { ChatMessageWithParts } from "../session/rows";
import { buildConsumerResponse, pumpResponseIntoRegistry } from "./sse";
import { buildStatusConsumerResponse } from "./status-sse";
import { models } from "@grida/ai-models";
import { isChatGptProviderId } from "../protocol/chatgpt";
import { tierModelId as chatGptTierModelId } from "../providers/chatgpt";

/** Session-static agent context (RFC `skills`: discovered once per session). */
type SessionContext = {
  skill_index?: SkillIndex;
  project_instructions?: string;
  /** Per-session skill-body cache (survives the per-turn agent rebuild). */
  skill_cache: SkillBodyCache;
};

function humanInputPendingResponse(sessionId: string): Response {
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

/**
 * Resolve an existing chat session (validating its agent bucket) or create a
 * new one. Existing-session model/mode updates are described, not applied:
 * continuation preflight must be able to reject without changing the posture
 * a later queued drain will inherit.
 */
async function resolveOrCreateSession(
  store: SessionsStore,
  req: RunRequest,
  provider: { provider_id: string },
  preloaded?: ChatSessionRow
): Promise<
  | {
      session_id: string;
      model_update_required: boolean;
      mode_update_required: boolean;
    }
  | Response
> {
  if (req.session_id) {
    const existing = preloaded ?? (await store.get(req.session_id));
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
    return {
      session_id: existing.id,
      model_update_required:
        existing.model?.provider_id !== provider.provider_id ||
        existing.model?.tier !== req.tier ||
        existing.model?.model_id !== req.model_id,
      mode_update_required: existing.mode !== req.mode,
    };
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
  return {
    session_id: created.id,
    model_update_required: false,
    mode_update_required: false,
  };
}

/** Collaborators the agent run pipeline needs. */
export type AgentRuntimeDeps = ResolveDeps & {
  workspace_registry: WorkspaceRegistry;
  sessions_store: SessionsStore;
  /**
   * GRIDA-SEC-004 — host-held authority behind compositor `directory-ref`
   * parts. Descriptors in the transcript are inert until this registry claims
   * the matching trusted gesture for one session. Optional for stripped hosts
   * and tests; a run carrying a fresh descriptor then fails closed.
   */
  directory_scopes?: DirectoryScopeRegistry;
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
   * GRIDA-SEC-004 — host-owned finite-command capability. Omission is
   * FAIL-CLOSED: no `run_command` tool. A Desktop host injects an OS-confined
   * executor; explicit unsandboxed hosts inject the raw runner.
   */
  shell_executor?: ShellExecutor;
  /**
   * GRIDA-SEC-004 — whether the whole process tree is confined by an OS
   * sandbox. This is an attestation consumed by the external-agent
   * `"sandboxed"` mode; `"enabled"` makes no containment claim.
   */
  sandbox_enforced?: boolean;
  /**
   * GRIDA-SEC-004 — whether this constructed runtime may spawn external ACP
   * agents. `"enabled"` is host-authorized process execution with no
   * containment claim; `"sandboxed"` requires {@link sandbox_enforced};
   * `"disabled"` withholds the capability and is the omission default.
   */
  external_agent_execution?: "enabled" | "sandboxed" | "disabled";
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
   * Whether a human UI can answer the locked `question` tool. When false or
   * undefined, question refuses. Threaded from the HTTP-server boundary down
   * to `createToolset`.
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
  /**
   * Synchronous pre-stream lease held by direct persistence or queue claim.
   * `startTurn` hands it to `StreamRegistry.create`, which consumes it.
   */
  admission: StreamAdmission;
  run_id: string;
  tier: RunRequest["tier"];
  model_id?: RunRequest["model_id"];
  feature?: RunRequest["feature"];
  workspace_root?: string;
  mode: RunRequest["mode"];
  /** Whether the requesting client can answer the `question` tool (per-run;
   *  absent ⇒ the host `interactive` default). A core drain leaves it absent. */
  interactive?: RunRequest["interactive"];
  /** Turn-start presentation snapshot. A core drain has no attached request
   * and therefore leaves it absent (headless/detached). */
  surface?: RunRequest["surface"];
  /** Whether the requesting client can resolve `design_search` (per-run; absent
   *  ⇒ the host `library` default). */
  library?: RunRequest["library"];
  /** Prepared scratch dir for a direct run. The bytes are staged before the
   * incoming user row is persisted; queue drains derive ordinary scratch reach
   * inside `startTurn` because they carry no transient seed body. */
  scratch_dir?: string;
  /**
   * The user message this turn fires — the fired-message identity the
   * turn-lifecycle wire carries (RFC `turn-authority`; emitted on the
   * `turn-started` event). A queue drain names the atomically claimed row; an HTTP
   * run names the incoming tail's user message; an approval-answer resume
   * fires no new user message and leaves this absent.
   */
  fired_message_id?: string;
  /**
   * GRIDA-SEC-004.
   *
   * Exact durable human-interaction continuation owned by this run. Its marker
   * is cleared only from the recorder's terminal settlement barrier. This
   * covers both explicit approvals and client-resolved question/design-search
   * results.
   */
  human_input_continuation?: HumanInputContinuation;
  /**
   * Set only when `provider.kind === "agent-provider"`: the single prompt
   * string handed to the external agent for this turn (issue #813).
   */
  agent_prompt?: string;
};

async function prepareScratchForTurn(
  scratchDir: string,
  secretsRoot: string | undefined,
  scratchSeed: NonNullable<RunRequest["scratch_seed"]>
): Promise<string[]> {
  await ensureScratch(scratchDir, secretsRoot);
  // Sequential by contract: duplicate paths are rejected at the run boundary,
  // and deterministic order keeps future seed-source extensions honest.
  const created: string[] = [];
  try {
    for (const file of scratchSeed) {
      created.push(
        await writeScratchFile(
          scratchDir,
          file.path,
          "text" in file
            ? new TextEncoder().encode(file.text)
            : Buffer.from(file.base64, "base64"),
          { overwrite: false }
        )
      );
    }
  } catch (cause) {
    try {
      await rollbackScratchSeeds(created);
    } catch (rollbackCause) {
      throw new AggregateError(
        [cause, rollbackCause],
        "scratch seed staging and rollback failed"
      );
    }
    throw cause;
  }
  return created;
}

/** Remove only files this request created, never a pre-existing collision. */
async function rollbackScratchSeeds(created: readonly string[]): Promise<void> {
  const cleanup = await Promise.allSettled(
    created.map(async (file) => {
      try {
        await unlink(file);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    })
  );
  const cleanupFailures = cleanup
    .filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    .map((result) => result.reason);
  if (cleanupFailures.length > 0) {
    throw new AggregateError(cleanupFailures, "scratch seed rollback failed");
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
  /** Resolved once: omission must never become process authority downstream. */
  private readonly external_agent_execution: NonNullable<
    AgentRuntimeDeps["external_agent_execution"]
  >;

  constructor(private readonly deps: AgentRuntimeDeps) {
    this.streams = deps.streams ?? new StreamRegistry();
    this.run_agent_fn = deps.run_agent ?? runAgent;
    this.compaction_enabled = deps.compaction?.enabled ?? true;
    this.compaction_config =
      deps.compaction?.config ?? DEFAULT_COMPACTION_CONFIG;
    this.compaction_summarize = deps.compaction?.summarize;
    this.external_agent_execution = deps.external_agent_execution ?? "disabled";

    // Run-state machine: owns SessionStatus + the serial drain. Its drain is a
    // one-way dependency back into this runtime (fires a turn via startTurn);
    // it selects the queue through the store; runtime claim + registry reserve
    // form the atomic fire boundary. Wire it to the registry's busy/idle edges
    // (works for an injected registry too).
    this.scheduler = new SessionScheduler({
      list_queued: (sessionId) =>
        this.deps.sessions_store.listQueuedMessages(sessionId),
      drain: (sessionId, messageId) => this.drainTurn(sessionId, messageId),
      pending_human_input_kind: (sessionId) =>
        this.deps.sessions_store.pendingHumanInputKind(sessionId),
      drain_cooldown_ms: deps.drain_cooldown_ms,
    });
    // Both observers are detached in dispose(): the registry can be
    // INJECTED (deps.streams) and so outlive this runtime — without the
    // detach, a disposed runtime's scheduler would keep receiving edges.
    this.detach_observers.push(
      this.streams.observe({
        on_create: (sessionId, firedMessageId) =>
          this.scheduler.onCreate(sessionId, firedMessageId),
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
   * Trusted host-start recovery for the durable turn queue.
   *
   * Status hydration is deliberately projection-only (GRIDA-SEC-004): a GET
   * carrying an SSE query credential must never gain execution authority.
   * The host invokes this method exactly once during tenant startup instead.
   * It first terminalizes ordinary in-flight tool calls abandoned by the dead
   * process, while preserving intentional approval/question waits, and only
   * then kicks durable queues.
   */
  async recoverQueuedSessions(): Promise<void> {
    this.deps.sessions_store.finalizeRestartOrphanedTools();
    await this.retryQueuedSessions();
  }

  /**
   * Re-kick durable queues after provider configuration becomes usable.
   *
   * Unlike {@link recoverQueuedSessions}, this is safe during normal runtime:
   * it does not rewrite tool state. Provider preparation remains ahead of the
   * durable queue claim, so a still-unavailable provider leaves the row queued.
   */
  async retryQueuedSessions(): Promise<void> {
    const sessionIds = await this.deps.sessions_store.listQueuedSessionIds();
    for (const sessionId of sessionIds) {
      this.scheduler.notifyEnqueued(sessionId);
    }
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
   * (RFC `queue / the run-state machine`). The selected row remains queued
   * throughout provider/workspace preparation, while a session admission lease
   * prevents a direct run from mutating the mode/model snapshot underneath the
   * drain. After a final persisted human-input check, this conditionally claims
   * the exact same-session row and hands both to `startTurn` on one synchronous
   * stack. Returns false when cancel or a human block won.
   * Provider/preparation errors throw with the row untouched.
   */
  private async drainTurn(
    sessionId: string,
    messageId: string
  ): Promise<boolean> {
    let admission: StreamAdmission;
    try {
      admission = this.streams.acquireAdmission(sessionId);
    } catch (err) {
      if (err instanceof RunInFlightError) return false;
      throw err;
    }
    try {
      const session = await this.deps.sessions_store.get(sessionId);
      if (!session) return false;
      // Provider-down throws before claim, so the durable row remains queued.
      let provider: ResolvedProvider;
      if (isAgentProviderModel(session.model?.model_id)) {
        const providerId = AGENT_PROVIDER_MODELS[session.model.model_id].id;
        if (
          this.external_agent_execution === "disabled" ||
          (this.external_agent_execution === "sandboxed" &&
            this.deps.sandbox_enforced !== true)
        ) {
          throw new ProviderUnavailableError(providerId);
        }
        provider = makeAgentProvider(providerId);
      } else {
        provider = await resolveProvider(this.deps, {
          explicit: session.model?.provider_id,
          model_id: session.model?.model_id ?? undefined,
        });
      }
      const workspaceRoot =
        (await this.deps.sessions_store.getWorkspaceRoot(sessionId)) ??
        undefined;

      // This is the final await before the synchronous claim → stream handoff.
      // A recorder flush or restored transcript block that landed during
      // preparation therefore wins without consuming the queued row.
      if (
        (await this.deps.sessions_store.pendingHumanInputKind(sessionId)) !==
        null
      ) {
        return false;
      }

      const claim = this.deps.sessions_store.claimQueuedMessage(
        sessionId,
        messageId
      );
      if (!claim) return false;
      const runId = crypto.randomUUID();
      console.log(
        `[agent-host-agent] drain firing sessionId=${sessionId} runId=${runId} providerId=${provider.provider_id}`
      );
      try {
        this.startTurn(sessionId, {
          provider,
          admission,
          run_id: runId,
          tier: session.model?.tier ?? AGENT_DEFAULT_TIER,
          model_id: session.model?.model_id,
          workspace_root: workspaceRoot,
          // Queued-turn posture comes from the persisted session, not a client
          // request (there is none here). Legacy rows (null mode) fall to default.
          mode: session.mode ?? AGENT_DEFAULT_MODE,
          fired_message_id: messageId,
        });
        return true;
      } catch (err) {
        // `create` consumes admission only after installing the running entry.
        // Any synchronous failure before that point must put the same row back.
        if (this.streams.get(sessionId)?.status !== "running") {
          this.deps.sessions_store.restoreQueuedMessage(claim);
        }
        throw err;
      }
    } finally {
      // Identity-guarded no-op after a successful create/handoff.
      this.streams.releaseAdmission(admission);
    }
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
    // One read for the whole resolution, so every limit in a single
    // compaction decision comes from the same catalogue.
    const view = this.catalogView();
    const endpoints = this.deps.endpoints;
    if (!endpoints) {
      return {
        resolve: (model) => resolveModelLimits(model, undefined, view),
        configs: [],
      };
    }
    const configs = await endpoints.list();
    const custom = configs.flatMap(resolveEndpointModels);
    const resolve: ResolveModelLimits = (model) => {
      let effective = model;
      let applicableCustom = custom;
      if (model?.provider_id) {
        const endpoint = configs.find((e) => e.id === model.provider_id);
        applicableCustom = endpoint ? resolveEndpointModels(endpoint) : [];
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
      return resolveModelLimits(effective, applicableCustom, view);
    };
    return { resolve, configs };
  }

  /** The catalogue this runtime resolves against; bundled when unwired. */
  private catalogView(): models.snapshot.View {
    return this.deps.catalog?.view() ?? models.snapshot.view();
  }

  /**
   * The summarizer's input cap for a session (issue #806). The compactor
   * subagent asks for the `nano` tier, but the model a tier resolves to is
   * a PER-PROVIDER decision — so the cap must be the window of the model
   * the summarizer will actually run on, not the catalog nano model's:
   *
   *  - endpoint providers map every tier to the endpoint's default model;
   *  - the ChatGPT subscription has its own `tier_model_ids` table, which
   *    may legitimately name a different (smaller-window) model than the
   *    catalogue when the subscription does not serve the catalogue's;
   *  - catalog/gg/byok resolve `nano` through the catalogue, which is the
   *    compaction default, so they need no override here.
   *
   * `undefined` keeps the compaction default (`byTier.nano.contextWindow`).
   */
  private summarizerInputCap(
    model: ChatModel | null,
    limits: LimitsResolution
  ): number | undefined {
    const providerId = model?.provider_id;
    if (!providerId) return undefined;
    if (isChatGptProviderId(providerId)) {
      const config = this.deps.chatgpt?.config;
      if (!config) return undefined;
      const spec = this.catalogView().modelSpecById(
        chatGptTierModelId(config, COMPACTOR_TIER)
      );
      // A subscription id the catalogue doesn't carry has no window to cap
      // against; the compaction default is no worse than a guess.
      return spec ? clampSummarizerCap(spec.contextWindow) : undefined;
    }
    if (!limits.configs.some((e) => e.id === providerId)) {
      // Everything else resolves the compactor's tier through the
      // catalogue. Supplying the cap explicitly (rather than leaning on
      // compaction's bundled default) is what lets a published tier
      // retarget resize the summarizer on an already-shipped binary.
      return clampSummarizerCap(
        this.catalogView().by_tier[COMPACTOR_TIER].contextWindow
      );
    }
    // Limits of the endpoint's DEFAULT model (what `nano` resolves to):
    // a model_id-less ChatModel routes through the resolver's default-
    // model substitution above.
    return clampSummarizerCap(
      limits.resolve({ provider_id: providerId }).context_window
    );
  }

  /**
   * Fire auto-compaction when the session is at/over its usable context
   * (RFC `session / compaction`). Blocks the turn on the summarizer — by
   * design, the next user message waits rather than overflowing. Failures
   * are swallowed: a failed compaction proceeds uncompacted (the
   * compaction layer logs). Returns whether the transcript MAY have
   * changed (compaction ran, successfully or not) so the caller knows a
   * pre-compaction snapshot is stale.
   */
  private async maybeAutoCompact(
    sessionId: string,
    modelFactory: Parameters<typeof compactSession>[0]["model_factory"],
    signal: AbortSignal
  ): Promise<boolean> {
    if (!this.compaction_enabled) return false;
    const session = await this.deps.sessions_store.get(sessionId);
    if (!session) return false;
    const limits = await this.limitsResolver();
    const modelLimits = limits.resolve(session.model);
    if (
      !shouldCompact(session.total_tokens, modelLimits, this.compaction_config)
    ) {
      return false;
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
    // A failed compaction may still have written rows — report "changed"
    // either way; the cost is one re-read on a rare path.
    return true;
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

    // Existing-session admission is acquired BEFORE session resolution. New
    // sessions have a fresh id and acquire immediately after creation. The
    // same lease remains held through continuation preflight/config mutation,
    // incoming persistence, and the synchronous StreamRegistry handoff.
    let admission: StreamAdmission | undefined;
    if (req.session_id) {
      try {
        admission = this.streams.acquireAdmission(req.session_id);
      } catch (err) {
        if (err instanceof RunInFlightError) {
          return Response.json(
            {
              error: err.message,
              code: err.code,
              session_id: req.session_id,
            },
            { status: 409 }
          );
        }
        throw err;
      }
    }

    try {
      // The persisted provider/model is part of an existing session's
      // execution identity. Load it under admission before resolving:
      // ambient provider readiness may change between turns, but it must not
      // silently migrate the conversation. An explicit request may still
      // intentionally override either persisted choice.
      let existingSession: ChatSessionRow | undefined;
      if (req.session_id) {
        existingSession =
          (await this.deps.sessions_store.get(req.session_id)) ?? undefined;
        if (!existingSession) {
          return Response.json(
            {
              error: `session not found: ${req.session_id}`,
              code: "session-not-found",
            },
            { status: 404 }
          );
        }
        if (existingSession.agent !== AGENT_SESSION_AGENT) {
          return Response.json(
            {
              error: `session agent mismatch: ${existingSession.agent} != ${AGENT_SESSION_AGENT}`,
              code: "session-agent-mismatch",
            },
            { status: 409 }
          );
        }
      }
      const effectiveReq: RunRequest = {
        ...req,
        model_id: req.model_id ?? existingSession?.model?.model_id,
      };
      const explicitlyChangedModel =
        req.model_id !== undefined &&
        req.model_id !== existingSession?.model?.model_id;
      const explicitProviderId =
        req.explicit ??
        (explicitlyChangedModel
          ? undefined
          : existingSession?.model?.provider_id);

      // Resolve provider before opening the stream so a 4xx stays a proper
      // HTTP error instead of a half-opened SSE.
      let provider: ResolvedProvider;
      if (isAgentProviderModel(effectiveReq.model_id)) {
        // Agent-provider class (issue #813): an external agent owns its own
        // loop. No BYOK/endpoint resolution, no model factory — the runtime
        // streams from the agent-provider consumer in startTurn. GRIDA-SEC-004:
        // external process authority is explicit and independent of the locked
        // shell's disposition.
        const providerId = AGENT_PROVIDER_MODELS[effectiveReq.model_id].id;
        const externalAgentExecution = this.external_agent_execution;
        if (externalAgentExecution === "disabled") {
          return Response.json(
            {
              error: `[agent-host-providers] external agent ${providerId} is disabled by the host`,
              code: "provider_down",
              provider_id: providerId,
            },
            { status: 409 }
          );
        }
        if (
          externalAgentExecution === "sandboxed" &&
          this.deps.sandbox_enforced !== true
        ) {
          return Response.json(
            {
              error: `[agent-host-providers] external agent ${providerId} requires an enforced OS sandbox`,
              code: "provider_down",
              provider_id: providerId,
            },
            { status: 409 }
          );
        }
        provider = makeAgentProvider(providerId);
      } else {
        try {
          provider = await resolveProvider(this.deps, {
            explicit: explicitProviderId,
            model_id: effectiveReq.model_id,
          });
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
        `[agent-host-agent] run started providerId=${provider.provider_id} runId=${runId} tier=${effectiveReq.tier} modelId=${effectiveReq.model_id ?? "(tier)"} kind=${provider.kind}`
      );

      const sessionResolution = await resolveOrCreateSession(
        this.deps.sessions_store,
        effectiveReq,
        provider,
        existingSession
      );
      if (sessionResolution instanceof Response) return sessionResolution;
      const sessionId = sessionResolution.session_id;
      if (!admission) {
        try {
          admission = this.streams.acquireAdmission(sessionId);
        } catch (err) {
          if (err instanceof RunInFlightError) {
            return Response.json(
              { error: err.message, code: err.code, session_id: sessionId },
              { status: 409 }
            );
          }
          throw err;
        }
      }
      const {
        messages,
        tier,
        model_id: modelId,
        feature,
        workspace_root: workspaceRoot,
        mode,
        approval_answer: approvalAnswer,
      } = effectiveReq;

      // GRIDA-SEC-004 — validate a human-input continuation without consuming
      // it. Approval answers are explicit body fields; question/design-search
      // answers are terminal assistant tool parts. In either form:
      //   1. the exact visible persisted block must match;
      //   2. no new caller-owned user/system row may ride the continuation;
      //   3. the store mutation waits until every later fallible preparation
      //      step succeeds.
      // This two-phase boundary keeps Allow/Deny or a question answer retryable
      // when scratch staging or incoming persistence rejects the request.
      const pendingHumanInputKind =
        await this.deps.sessions_store.pendingHumanInputKind(sessionId);
      const assistantTail = messages.at(-1)?.role === "assistant";
      const continuationHasUnpersistedCallerHistory =
        approvalAnswer !== undefined ||
        pendingHumanInputKind !== null ||
        assistantTail
          ? await hasUnpersistedCallerMessage(
              this.deps.sessions_store,
              sessionId,
              messages
            )
          : false;
      let approvalContinuation: HumanInputContinuation | undefined;
      let incomingHumanInputResult: IncomingHumanInputResult | undefined;
      if (approvalAnswer) {
        if (continuationHasUnpersistedCallerHistory) {
          return Response.json(
            {
              error:
                "an approval continuation cannot add a new user or system message; resume the approval before starting the queued turn",
              code: "approval-resume-with-new-message",
              session_id: sessionId,
            },
            { status: 409 }
          );
        }
        if (
          pendingHumanInputKind !== "approval" ||
          !(await this.deps.sessions_store.matchesPendingApproval(
            sessionId,
            approvalAnswer
          ))
        ) {
          return Response.json(
            {
              error:
                "approval answer does not match a pending approval for this session",
              code: "approval-answer-invalid",
              session_id: sessionId,
            },
            { status: 409 }
          );
        }
      } else if (pendingHumanInputKind !== null) {
        if (continuationHasUnpersistedCallerHistory) {
          return humanInputPendingResponse(sessionId);
        }
        const matches = await findIncomingHumanInputResults(
          this.deps.sessions_store,
          sessionId,
          messages
        );
        // The scalar status gives approval presentation precedence, but exact
        // sibling continuations remain independently correlated. A question or
        // design-search result may therefore match even while an approval is
        // also pending; ordinary caller text already failed closed above.
        // A continuation resolves one exact visible interaction. Accepting a
        // batch without an atomic multi-result commit could otherwise consume
        // only its first answer and silently discard parallel siblings.
        // Conflicting duplicate copies return null and fail closed as well.
        if (!matches || matches.length !== 1) {
          return humanInputPendingResponse(sessionId);
        }
        incomingHumanInputResult = matches[0];
      }
      if (
        pendingHumanInputKind === null &&
        assistantTail &&
        continuationHasUnpersistedCallerHistory
      ) {
        return Response.json(
          {
            error:
              "an assistant-tail continuation cannot add a new user or system message",
            code: "assistant-continuation-with-new-message",
            session_id: sessionId,
          },
          { status: 409 }
        );
      }

      // GRIDA-SEC-004 — a persisted `directory-ref` is NOT authority. Claim the
      // matching one-shot host grant for this exact session before mutating the
      // prior transcript, staging scratch, or persisting the incoming tail. The
      // registry compares every descriptor to its canonical host facts and
      // commits the set atomically; replay/fork/stale ids therefore fail closed.
      // Re-claim by the SAME session is idempotent, so a later scratch or
      // persistence failure remains safely retryable.
      if (req.directory_scopes && req.directory_scopes.length > 0) {
        const registry = this.deps.directory_scopes;
        if (!registry) {
          return Response.json(
            {
              error: "directory references are unavailable on this host",
              code: "directory-scopes-unavailable",
              session_id: sessionId,
            },
            { status: 409 }
          );
        }
        try {
          registry.claim(sessionId, req.directory_scopes);
        } catch (err) {
          if (!(err instanceof DirectoryScopeError)) throw err;
          return Response.json(
            { error: err.message, code: err.code, session_id: sessionId },
            { status: 409 }
          );
        }
      }

      // The durable multipart row may describe scratch-backed attachments, so
      // the transient bodies MUST exist first. Failure is an HTTP error before
      // `persistIncomingTail`: a descriptor can never outlive a failed seed.
      const scratchDir =
        this.deps.scratch_base &&
        workspaceRoot &&
        req.scratch_seed &&
        req.scratch_seed.length > 0
          ? scratchRootFor(this.deps.scratch_base, sessionId)
          : undefined;
      let stagedScratchFiles: string[] = [];
      if (req.scratch_seed && req.scratch_seed.length > 0) {
        if (!scratchDir) {
          return Response.json(
            {
              error:
                "scratch-backed files require a workspace-bound session and an enabled scratch base",
              code: "scratch-unavailable",
              session_id: sessionId,
            },
            { status: 409 }
          );
        }
        try {
          stagedScratchFiles = await prepareScratchForTurn(
            scratchDir,
            this.deps.secrets_root,
            req.scratch_seed
          );
        } catch (err) {
          return Response.json(
            {
              error: `failed to stage scratch files: ${
                err instanceof Error ? err.message : String(err)
              }`,
              code: "scratch-seed-failed",
              session_id: sessionId,
            },
            { status: 500 }
          );
        }
      }

      // Re-check an ordinary direct request after every fallible preparation
      // step but BEFORE persisting its user row. Stream admission includes the
      // recorder's async terminal flush, so once this read is clear no previous
      // turn can publish a late human block underneath the commit. A 409 from
      // this boundary is therefore mutation-free and safe for the renderer to
      // retry as a durable queued message.
      try {
        if (
          pendingHumanInputKind === null &&
          (await this.deps.sessions_store.hasPendingHumanInput(sessionId))
        ) {
          await rollbackScratchSeeds(stagedScratchFiles);
          stagedScratchFiles = [];
          return humanInputPendingResponse(sessionId);
        }

        // Persist only caller-owned non-assistant rows first. Assistant tool
        // results are the continuation commit and deliberately remain untouched
        // until every fallible preparation step above has succeeded.
        await persistIncomingTail(
          this.deps.sessions_store,
          sessionId,
          messages,
          {
            resolveAssistantToolResults: false,
          }
        );
        // The durable descriptor now owns these bytes. Later turn-start failures
        // leave both intact so the accepted message remains operable.
      } catch (cause) {
        try {
          await rollbackScratchSeeds(stagedScratchFiles);
        } catch (rollbackCause) {
          throw new AggregateError(
            [cause, rollbackCause],
            "pre-persistence failure and scratch seed rollback failed"
          );
        }
        throw cause;
      }

      // Fill every non-blocking client tool result first. Human-input results
      // are excluded as a class; for a question/design-search continuation,
      // the one exact preflight match is the final mutation below.
      await fillIncomingToolResults(
        this.deps.sessions_store,
        sessionId,
        messages,
        incomingHumanInputResult
          ? {
              exclude: {
                messageId: incomingHumanInputResult.messageId,
                toolCallId: incomingHumanInputResult.toolCallId,
              },
            }
          : undefined
      );

      // Persist the accepted request's provider/model/mode only after every
      // branch that can reject a malformed or batched human continuation. A
      // rejected 409 must not change the posture inherited by a queued drain.
      if (sessionResolution.model_update_required) {
        await this.deps.sessions_store.updateModel(sessionId, {
          provider_id: provider.provider_id,
          tier,
          model_id: modelId,
        });
      }
      if (sessionResolution.mode_update_required) {
        await this.deps.sessions_store.updateMode(sessionId, mode);
      }

      // Late continuation commit. The read-only preflight above already proved
      // that the exact visible block matches; these conditional store writes
      // re-assert that authority atomically. The successful write is followed
      // immediately by synchronous StreamRegistry reservation. A synchronous
      // pre-reservation failure conditionally rolls this exact run id back to
      // its pending approval/input state; once a registry entry exists, only
      // its terminal settlement may clear the marker.
      if (approvalAnswer) {
        const committed = await applyApprovalAnswer(
          this.deps.sessions_store,
          sessionId,
          approvalAnswer,
          runId
        );
        if (!committed) {
          return Response.json(
            {
              error:
                "approval answer does not match a pending approval for this session",
              code: "approval-answer-invalid",
              session_id: sessionId,
            },
            { status: 409 }
          );
        }
        approvalContinuation = committed;
      } else if (incomingHumanInputResult) {
        const filled =
          await this.deps.sessions_store.commitHumanInputContinuation(
            sessionId,
            incomingHumanInputResult.messageId,
            incomingHumanInputResult.toolCallId,
            runId,
            {
              type: incomingHumanInputResult.part.type,
              data: incomingHumanInputResult.part,
              tool_state: incomingHumanInputResult.toolState,
            }
          );
        if (!filled) return humanInputPendingResponse(sessionId);
      }

      // Reserve + pump for this turn. `create` atomically consumes admission;
      // the finally release is then an identity-guarded no-op.
      try {
        this.startTurn(sessionId, {
          provider,
          admission,
          run_id: runId,
          tier,
          model_id: modelId,
          feature,
          workspace_root: workspaceRoot,
          mode,
          // Per-run client UI capability (the desktop-from-web bridge sets true; a
          // headless `cli run` sets false). Absent ⇒ host default downstream.
          interactive: req.interactive,
          // Exact presentation state at request start. Omission means no surface
          // observer is attached.
          surface: req.surface,
          // Per-run library-search capability (renderer wires the resolver).
          library: req.library,
          // Direct-run seeds were staged before persistence. Pass the exact root
          // onward so bindings expose the same files to tools and shell.
          scratch_dir: scratchDir,
          // The fired message of a direct run is the incoming tail's user
          // message (the client resends history; the tail is the new one). An
          // approval/question/design-search resumes end in an assistant tool
          // result and fire no new user message (RFC `turn-authority`).
          fired_message_id: pendingHumanInputKind
            ? undefined
            : extractTailUserMessageId(messages),
          human_input_continuation:
            approvalContinuation ??
            (incomingHumanInputResult
              ? {
                  message_id: incomingHumanInputResult.messageId,
                  tool_call_id: incomingHumanInputResult.toolCallId,
                  run_id: runId,
                }
              : undefined),
          // Agent-provider turns take a single prompt string (the external
          // agent owns history); the tail user message is this turn's prompt.
          agent_prompt:
            provider.kind === "agent-provider"
              ? extractLastUserText(messages)
              : undefined,
        });
      } catch (err) {
        if (
          (approvalContinuation || incomingHumanInputResult) &&
          this.streams.get(sessionId)?.status !== "running"
        ) {
          try {
            let rolledBack: boolean;
            if (approvalContinuation) {
              rolledBack =
                await this.deps.sessions_store.rollbackApprovalContinuation(
                  sessionId,
                  approvalContinuation
                );
            } else {
              rolledBack =
                await this.deps.sessions_store.rollbackHumanInputContinuation(
                  sessionId,
                  incomingHumanInputResult!.messageId,
                  incomingHumanInputResult!.toolCallId,
                  runId
                );
            }
            if (!rolledBack) {
              console.warn(
                `[agent-host-agent] failed to roll back unstarted human-input continuation sessionId=${sessionId} runId=${runId}`
              );
            }
          } catch (rollbackError) {
            // Keep the exact marker durable and fail closed. Admission/drain
            // sees it as unsettled, and host-start repair can terminalize it.
            console.warn(
              `[agent-host-agent] human-input continuation rollback errored sessionId=${sessionId} runId=${runId} err=${
                rollbackError instanceof Error
                  ? rollbackError.message
                  : String(rollbackError)
              }`
            );
          }
        }
        if (err instanceof RunInFlightError) {
          return Response.json(
            { error: err.message, code: err.code, session_id: sessionId },
            { status: 409 }
          );
        }
        throw err;
      }

      // Fire-and-forget title generation starts only after the turn reservation
      // succeeds. It writes only while the default sentinel remains, so a user
      // rename always wins; failures are intentionally swallowed.
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

      return buildConsumerResponse(this.streams, sessionId, requestSignal);
    } finally {
      // Covers resolve/update, every continuation mutation, persistence
      // failure, and every early/throw path. Successful create already
      // consumed the lease, making this identity-guarded release a no-op.
      if (admission) this.streams.releaseAdmission(admission);
    }
  }

  /**
   * Complete a successful pump without opening a detached-recorder race.
   *
   * The recorder is detached so `finish()` cannot invoke `on_end` twice, but
   * its manual flush (and any accounting that depends on it) remains part of
   * the registry's terminal settlement. If abort already won, registration
   * fails and the still-attached recorder is settled by the abort path.
   */
  private async finishSuccessfulTurn(
    entry: StreamEntry,
    recorder: StreamConsumer,
    detachRecorder: () => void,
    afterRecorder?: () => Promise<void>
  ): Promise<void> {
    let releaseSettlement!: () => void;
    const settlementTask = new Promise<void>((resolve) => {
      releaseSettlement = resolve;
    });
    if (!this.streams.trackSettlementTask(entry, settlementTask)) return;

    detachRecorder();
    try {
      await recorder.on_end("finish");
      await afterRecorder?.();
    } finally {
      releaseSettlement();
    }
    this.streams.finishEntry(entry, "finish");
  }

  /**
   * Reserve the single-flight registry entry, attach the recorder, and launch
   * the (fire-and-forget) model pump for ONE turn. Both the HTTP `run()` path
   * and the core queue drain go through here, so the reserve, recorder attach,
   * model view, and finish are owned in one place. Throws
   * {@link RunInFlightError} if admission was lost or a run is already in
   * flight. The model view is built from the server-authoritative
   * `listVisibleMessages`; a drained row was conditionally claimed immediately
   * before this synchronous call, so this needs no client message array or
   * queue mutation of its own.
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
      surface,
      library,
      scratch_dir: preparedScratchDir,
    } = opts;
    // Snapshot the session's live host grants once per turn. Queue drains carry
    // no client request, so resolving here (rather than from the direct POST)
    // is what keeps a claimed directory usable on later and queued turns.
    const directoryScopes =
      this.deps.directory_scopes?.forSession(sessionId) ?? [];
    const availableDirectoryScopeIds = new Set(
      directoryScopes.map((scope) => scope.id)
    );

    // ONE visible-messages snapshot per turn, kicked at reserve time — it
    // serves BOTH consumers: the continuation replay prefix
    // (`replay-prefix.ts`: an assistant tail — an approval/question resume —
    // lowers to reconstruction chunks for reconnect consumers; a user tail
    // lowers to []) AND the pump's model view below, which previously
    // re-read the identical transcript moments later. The promise never
    // rejects (degrades with a warning; the pump falls back to its own
    // read); the pump awaits it so the snapshot strictly precedes the
    // recorder's first write.
    const turnSnapshot = (async (): Promise<{
      visible: ChatMessageWithParts[] | null;
      prefix: readonly string[];
    }> => {
      try {
        const visible =
          await this.deps.sessions_store.listVisibleMessages(sessionId);
        return { visible, prefix: buildReplayPrefix(visible.at(-1)) };
      } catch (err) {
        console.warn(
          `[agent-host-agent] turn snapshot failed sessionId=${sessionId} err=${
            err instanceof Error ? err.message : String(err)
          }`
        );
        return { visible: null, prefix: [] };
      }
    })();

    // Reserve the registry entry; its `modelAbort.signal` (not the request
    // signal) drives the model call so a disconnect can resume. Throws
    // RunInFlightError to the caller if a run is already in flight. The
    // prefix rides the entry from the reserve on, so no consumer can attach
    // before it is decided.
    const entry = this.streams.create(sessionId, {
      replay_prefix: turnSnapshot.then((s) => s.prefix),
      fired_message_id: opts.fired_message_id,
      admission: opts.admission,
    });

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
    const sessionsStore = this.deps.sessions_store;
    const persistedRecorder = createRecorderConsumer({
      store: this.deps.sessions_store,
      session_id: sessionId,
      run_id: runId,
    });
    const continuation = opts.human_input_continuation;
    const recorder: StreamConsumer = continuation
      ? {
          on_frame: (data) => persistedRecorder.on_frame(data),
          on_end: async (reason) => {
            await persistedRecorder.on_end(reason);
            const settled = await sessionsStore.settleHumanInputContinuation(
              sessionId,
              continuation.message_id,
              continuation.tool_call_id,
              continuation.run_id
            );
            if (!settled) {
              console.warn(
                `[agent-host-agent] stale human-input continuation settlement sessionId=${sessionId} runId=${continuation.run_id} reason=${reason}`
              );
            }
          },
          on_error: (err) => persistedRecorder.on_error?.(err),
        }
      : persistedRecorder;
    const detachRecorder = this.streams.attach(sessionId, recorder);

    const streams = this.streams;
    const runAgentFn = this.run_agent_fn;
    const {
      workspace_registry: workspaceRegistry,
      secrets_root: secretsRoot,
      shell_executor: shellExecutor,
      scratch_base: scratchBase,
    } = this.deps;
    let pumpTask: Promise<void> | undefined;
    let commandPumpTracked = false;
    // Per-session scratch dir (WG `scratch.md`). Derived (pure) here so it can
    // ride `runDeps`; the dir is created on disk just before the model turn
    // (below). Structured filesystem tools are the baseline operability path,
    // independent of optional shell/image generation, so every workspace-bound
    // Grida turn gets scratch when the host supplies a base.
    const scratchDir =
      preparedScratchDir ??
      (scratchBase && workspaceRoot
        ? scratchRootFor(scratchBase, sessionId)
        : undefined);
    // Bindings deps for the run. Typed (not an inline literal) so the
    // GRIDA-SEC-004 `secrets_root` + `shell_executor` + exact scratch scope
    // thread through `runAgent`'s narrower `{ workspace_registry }` param into
    // `createWorkspaceAgentBindings`.
    const runDeps = {
      workspace_registry: workspaceRegistry,
      secrets_root: secretsRoot,
      shell_executor: shellExecutor,
      track_command_execution: (task: Promise<unknown>) => {
        // The command task ends only after the host's terminal abort ACK, which
        // follows worker exit and per-command cleanup. The pump task closes the
        // smaller gap between that ACK and the AI SDK consuming the aborted tool
        // promise. Runs that never execute a command keep the existing policy:
        // an uncooperative model promise does not block replacement forever.
        this.streams.trackSettlementTask(entry, task);
        if (!commandPumpTracked) {
          if (!pumpTask) {
            throw new Error(
              "command execution started before pump registration"
            );
          }
          commandPumpTracked = this.streams.trackSettlementTask(
            entry,
            pumpTask
          );
        }
      },
      scratch_dir: scratchDir,
      scratch_base: scratchBase,
      // BYOK keys + the host's image-modality switch — together with scratchDir
      // they let `createWorkspaceAgentBindings` build the `generate_image`
      // binding (the produced bytes sink to scratch).
      secrets: this.deps.secrets,
      // GRIDA-SEC-006 — hosted-session deps for the generate_image gate.
      gg: this.deps.gg,
      gg_base_url: this.deps.gg_base_url,
      provider_http: this.deps.provider_http,
      image_gen_enabled: this.deps.image_gen_enabled === true,
      image_model_id: this.deps.image_model_id,
      catalog: this.deps.catalog,
      // Host-level default for question resolution.
      interactive: this.deps.interactive === true,
      // Host-level default for design_search; per-run `req.library` overrides.
      library: this.deps.library === true,
    };
    // Pump: open the upstream model call, forward each SSE frame into the
    // registry. Doesn't block the caller; a client attaches as another
    // consumer (HTTP) or reconnects later (a core drain has no live consumer).
    pumpTask = (async () => {
      try {
        // Ordering invariant for the continuation prefix: the snapshot
        // completes before ANY of this turn's frames can reach the recorder.
        // The promise never rejects (see above); `visible` is null only on a
        // failed read, and each consumer below falls back to its own read.
        const snapshotVisible = (await turnSnapshot).visible;

        // Direct-run seed bytes already landed before persistence. Ordinary
        // shell/image scratch (including queue drains) is still created lazily
        // here before bindings resolve its real path.
        if (scratchDir && !preparedScratchDir) {
          await ensureScratch(scratchDir, secretsRoot);
        }
        const availableScratchAttachmentPaths = scratchDir
          ? await listScratchFilePaths(scratchDir)
          : new Set<string>();

        // Agent-provider class (issue #813): the external agent owns the loop.
        // Skip compaction/model-factory/tool-injection entirely — just run one
        // turn and push its mapped chunks into the registry. The recorder
        // (attached above) persists the assistant message from those chunks;
        // `streams.finish` flushes it, same as the normal terminal edge.
        if (provider.kind === "agent-provider") {
          const visible =
            snapshotVisible ??
            (await sessionsStore.listVisibleMessages(sessionId));
          const preparedMessages = buildModelMessages(visible, {
            // External agents do not receive our structured fs binding. A
            // durable historical descriptor remains inspectable but inert.
            availableDirectoryScopeIds: new Set(),
            availableScratchAttachmentPaths: new Set(),
          });
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
            // Defense in depth at the spawn seam. Direct runs are preflighted
            // before session creation; this also protects non-HTTP turn paths.
            sandbox_enforced: this.deps.sandbox_enforced === true,
            external_agent_execution: this.external_agent_execution,
            prompt: promptFromLatestUserModelMessage(
              preparedMessages,
              opts.agent_prompt ?? ""
            ),
            cwd: workspaceRoot,
            resume_session_id: resumeSessionId,
            model: agentModel,
            signal: entry.model_abort.signal,
            emit: (chunk) => streams.pushEntry(entry, JSON.stringify(chunk)),
          });
          if (
            result.providerSessionId &&
            result.providerSessionId !== resumeSessionId
          ) {
            await sessionsStore
              .setAgentProviderSessionId(sessionId, result.providerSessionId)
              .catch(() => undefined);
          }
          // Deterministic recorder flush — mirror the normal success path.
          // The helper keeps this detached phase inside terminal settlement,
          // so an abort cannot publish idle while persistence is still open.
          await this.finishSuccessfulTurn(entry, recorder, detachRecorder);
          return;
        }

        // Auto-compaction (RFC `session / compaction`): if the session is
        // at/over its usable context, block this turn on the summarizer.
        const compacted = await this.maybeAutoCompact(
          sessionId,
          provider.model_factory,
          entry.model_abort.signal
        );

        // Server-authoritative message view (RFC `session`): rebuild what
        // the model sees from the VISIBLE persisted messages — NOT the raw
        // client array. This is what makes rewind + compaction real (hidden
        // rows drop out; the summary folds into the next user turn). The
        // reserve-time snapshot is that view — single-flight means nothing
        // else writes between reserve and here — EXCEPT when compaction just
        // rewrote the transcript, which forces a fresh read.
        const visible =
          !compacted && snapshotVisible
            ? snapshotVisible
            : await sessionsStore.listVisibleMessages(sessionId);
        const preparedMessages = buildModelMessages(visible, {
          availableDirectoryScopeIds,
          availableScratchAttachmentPaths,
        });

        // Session-static skills + project instructions (discovered once).
        const ctx = await this.sessionContext(sessionId, workspaceRoot);

        // Accumulate the run's usage so it can be stamped onto the
        // assistant message — recomputeRollups (rewind/fork/compaction)
        // sums per-message usage.
        const runUsage: MessageUsage = {};
        const turnModel: ChatModel = {
          provider_id: provider.provider_id,
          tier,
          model_id: modelId,
        };

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
            directory_scopes: directoryScopes,
            mode,
            interactive,
            surface,
            library,
            skill_index: ctx.skill_index,
            skill_cache: ctx.skill_cache,
            project_instructions: ctx.project_instructions,
            on_step_usage: (usage) => {
              const delta = messageUsageFromStepUsage(usage);
              accumulateUsage(runUsage, delta);
              void sessionsStore
                .updateUsage(sessionId, {
                  prompt_tokens: delta.input,
                  completion_tokens: delta.output,
                  reasoning_tokens: delta.reasoning,
                  cache_read: delta.cache_read,
                  cache_write: delta.cache_write,
                  total_tokens: usageTokenTotal(delta),
                })
                .catch(() => undefined);
            },
          },
          // GRIDA-SEC-004 — `secrets_root` rides the bindings deps down to the
          // shell runner's arg check. Built as a typed var (not a fresh
          // literal) so it threads through `runAgent`'s narrower param to
          // `createWorkspaceAgentBindings`, which reads it at runtime.
          runDeps
        );
        console.log(`[agent-host-agent] run response opened runId=${runId}`);
        await pumpResponseIntoRegistry(response, streams, entry);
        // Drain the recorder BEFORE stamping usage. The recorder creates the
        // assistant row on a fire-and-forget write_chain fed by each pushed
        // frame; `pumpResponseIntoRegistry` returning only means the frames
        // were enqueued, not that the row was written. Usage/accounting stamps
        // "the latest assistant row", so stamping before the write settles
        // races onto the wrong row (or none). The recorder's terminal flush
        // (its `on_end`) awaits its write_chain + finalizes, so awaiting it
        // here makes the row exist deterministically. The detached recorder
        // flush + dependent accounting remain one terminal settlement task, so
        // abort cannot admit a new turn between them.
        await this.finishSuccessfulTurn(
          entry,
          recorder,
          detachRecorder,
          async () => {
            if (hasUsage(runUsage)) {
              await sessionsStore
                .setLatestAssistantAccounting(sessionId, {
                  model: turnModel,
                  usage: runUsage,
                })
                .catch(() => undefined);
              await sessionsStore
                .recomputeRollups(sessionId)
                .catch(() => undefined);
            }
          }
        );
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
        streams.finishEntry(entry, reason);
      }
    })();
    void pumpTask;

    return entry;
  }

  /**
   * `GET /agent/stream/:sessionId` — reconnect to an in-flight run. Serves
   * the continuation prefix (a resumed turn's persisted head — see
   * `replay-prefix.ts`), then full replay from chunk 0, then live tail; 404
   * if no run is in flight (the client falls back to DB hydration).
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
    return buildConsumerResponse(this.streams, sessionId, requestSignal, {
      replay_prefix: true,
    });
  }

  /**
   * `GET /sessions/:id/status` — subscribe to the session's `SessionStatus`
   * (RFC `session.md` §Session status). Long-lived SSE: the current status is
   * the first frame, then every idle⇄busy⇄waiting⇄error transition. Always
   * available — a cold session hydrates any persisted human-input wait before
   * its first frame; otherwise it reads as `{ state: "idle" }`. This is the
   * authoritative fact the dumb UI renders admission from.
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
   * `DELETE /sessions/:id` — remove an idle session and its ephemeral
   * runtime state. The admission lease spans the durable delete and scratch
   * cleanup so a new run cannot resolve or recreate session state midway
   * through teardown.
   */
  async deleteSession(sessionId: string): Promise<Response> {
    const admission = this.acquireIdleAdmission(sessionId);
    if (admission instanceof Response) return admission;
    try {
      await this.deps.sessions_store.delete(sessionId);
      this.forgetSession(sessionId);
      await this.removeSessionScratch(sessionId);
      return Response.json({ ok: true });
    } finally {
      this.streams.releaseAdmission(admission);
    }
  }

  /**
   * `POST /sessions/:id/rewind` — soft-truncate to a prior message (RFC
   * `session / rewinding`). `restore: true` un-rewinds (un-hides). Refuses
   * while the session is occupied and holds admission through the mutation so
   * a new run cannot race the transcript rewrite.
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
    const admission = this.acquireIdleAdmission(sessionId);
    if (admission instanceof Response) return admission;
    try {
      const session = await this.deps.sessions_store.get(sessionId);
      if (!session) {
        return Response.json({ error: "session not found" }, { status: 404 });
      }
      if (restore === true) {
        await this.deps.sessions_store.unhideAfter(sessionId, fromMessageId);
        await this.scheduler.refreshStatus(sessionId);
        const refreshed = await this.deps.sessions_store.get(sessionId);
        return Response.json({ ok: true, restored: true, session: refreshed });
      }
      const result = await this.deps.sessions_store.rewind(
        sessionId,
        fromMessageId
      );
      await this.scheduler.refreshStatus(sessionId);
      return Response.json(result);
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 400 }
      );
    } finally {
      this.streams.releaseAdmission(admission);
    }
  }

  /**
   * `POST /sessions/:id/fork` — fork the session at a message into a new
   * session (RFC `session / fork`). Holds parent admission so the copied
   * transcript is a stable idle snapshot.
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
    const admission = this.acquireIdleAdmission(sessionId);
    if (admission instanceof Response) return admission;
    try {
      const parent = await this.deps.sessions_store.get(sessionId);
      if (!parent) {
        return Response.json({ error: "session not found" }, { status: 404 });
      }
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
    } finally {
      this.streams.releaseAdmission(admission);
    }
  }

  /**
   * `POST /sessions/:id/compact` — user-fired compaction (RFC
   * `session / compaction / auto vs manual`). Holds admission while resolving
   * the summarizer and rewriting the transcript.
   */
  async compact(sessionId: string): Promise<Response> {
    const admission = this.acquireIdleAdmission(sessionId);
    if (admission instanceof Response) return admission;
    try {
      const session = await this.deps.sessions_store.get(sessionId);
      if (!session) {
        return Response.json({ error: "session not found" }, { status: 404 });
      }
      let provider;
      try {
        provider = await resolveProvider(this.deps, {
          explicit: session.model?.provider_id,
          model_id: session.model?.model_id,
        });
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
    } finally {
      this.streams.releaseAdmission(admission);
    }
  }

  /**
   * `POST /sessions/:id/queue` — enqueue a user message (RFC `queue`). Persists
   * a pending `user` row with `metadata.queued_at`; it is held out of the model
   * view and the transcript until it fires. Does NOT acquire idle admission —
   * enqueueing behind an occupied session is the entire point.
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
    let row: ChatMessageWithParts;
    try {
      row = await this.deps.sessions_store.appendQueuedMessage(sessionId, {
        id: typeof id === "string" && id.length > 0 ? id : undefined,
        text,
      });
    } catch (err) {
      if (err instanceof QueueMessageConflictError) {
        return Response.json(
          {
            error: err.message,
            code: "queue-message-conflict",
            session_id: sessionId,
            message_id: err.id,
          },
          { status: 409 }
        );
      }
      throw err;
    }
    // Close the stale-busy race: a client enqueues while it believes the
    // session is busy, but the turn may have just ended (the idle status frame
    // still in flight). If the session is already idle with no drain pending,
    // nothing else would ever fire this row — kick a drain now. A no-op while
    // busy (the turn-end edge drains) or while a drain is already scheduled.
    if (typeof row.metadata.queued_at === "number") {
      this.scheduler.notifyEnqueued(sessionId);
    }
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
   * the path's session: the store only tombstones a row that belongs to
   * `sessionId` AND still carries `queued_at`, so a messageId can neither
   * reach across sessions nor cancel a fired turn; idempotent.
   */
  async cancelQueued(sessionId: string, messageId: string): Promise<Response> {
    if (!messageId) {
      return Response.json({ error: "messageId required" }, { status: 400 });
    }
    await this.deps.sessions_store.deleteMessage(sessionId, messageId);
    return Response.json({ ok: true });
  }

  /**
   * Acquire the same per-session slot used by direct runs and queue drains for
   * an async idle-only lifecycle mutation. The lease closes the check/use gap:
   * after this succeeds, no run can persist or snapshot the session until the
   * caller releases it in `finally`.
   */
  private acquireIdleAdmission(sessionId: string): StreamAdmission | Response {
    try {
      return this.streams.acquireAdmission(sessionId);
    } catch (err) {
      if (!(err instanceof RunInFlightError)) throw err;
      return Response.json(
        {
          error: "a run is in flight on this session",
          code: "run_in_flight",
          session_id: sessionId,
        },
        { status: 409 }
      );
    }
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
    this.deps.directory_scopes?.forgetSession(sessionId);
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
      await removeScratch(base, sessionId, this.deps.secrets_root);
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
function messageUsageFromStepUsage(u: AgentStepUsage): MessageUsage {
  const cacheRead = u.cached_input_tokens ?? 0;
  const cacheWrite = u.cache_write_tokens ?? 0;
  const input = Math.max(0, (u.input_tokens ?? 0) - cacheRead - cacheWrite);
  return {
    input,
    output: u.output_tokens ?? 0,
    reasoning: u.reasoning_tokens ?? 0,
    cache_read: cacheRead,
    cache_write: cacheWrite,
  };
}

function accumulateUsage(acc: MessageUsage, u: MessageUsage): void {
  acc.input = (acc.input ?? 0) + (u.input ?? 0);
  acc.output = (acc.output ?? 0) + (u.output ?? 0);
  acc.reasoning = (acc.reasoning ?? 0) + (u.reasoning ?? 0);
  acc.cache_read = (acc.cache_read ?? 0) + (u.cache_read ?? 0);
  acc.cache_write = (acc.cache_write ?? 0) + (u.cache_write ?? 0);
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
