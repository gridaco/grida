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
import type { ByokProviderId } from "../protocol/provider-ids";
import {
  resolveProvider,
  ProviderUnavailableError,
  type ResolveDeps,
} from "../providers";
import { createRecorderConsumer } from "../session/recorder";
import { titler } from "../session/titler";
import type { SessionsStore } from "../session/store";
import type { MessageUsage } from "../session/rows";
import {
  DEFAULT_COMPACTION_CONFIG,
  compactSession,
  resolveModelLimits,
  shouldCompact,
  type CompactionConfig,
} from "../session/compaction";
import type { compactor } from "../session/compactor";
import { discoverSkills } from "../skills/discovery";
import { discoverProjectInstructions } from "../skills/project-instructions";
import type { SkillBodyCache, SkillIndex } from "../skills/types";
import type { WorkspaceRegistry } from "../workspaces";
import { RunInFlightError, StreamRegistry } from "./stream-registry";
import {
  extractFirstUserText,
  parseRunBody,
  persistIncomingTail,
  type RunRequest,
} from "./run-input";
import { runAgent, type AgentStepUsage } from "./run-agent";
import { buildModelMessages } from "./message-view";
import { buildConsumerResponse, pumpResponseIntoRegistry } from "./sse";

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
  provider: { provider_id: ByokProviderId }
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
  });
  return created.id;
}

/** Collaborators the agent run pipeline needs. */
export type AgentRuntimeDeps = ResolveDeps & {
  workspace_registry: WorkspaceRegistry;
  sessions_store: SessionsStore;
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
    /** Stop the upward project + instruction walk here (inclusive). */
    stop_at?: string;
  };
};

export class AgentRuntime {
  /** In-flight run registry. Owned here; `AgentHost.streams` aliases it. */
  readonly streams: StreamRegistry;
  private readonly run_agent_fn: typeof runAgent;
  /** Session-static agent context, discovered once per session id. */
  private readonly session_contexts = new Map<string, SessionContext>();
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
    if (workspaceRoot) {
      try {
        const scope = this.deps.skill_discovery;
        const [skillIndex, instructions] = await Promise.all([
          discoverSkills({
            workspace_root: workspaceRoot,
            include_user_scoped: scope?.include_user_scoped,
            config_paths: scope?.config_paths,
            stop_at: scope?.stop_at,
          }),
          discoverProjectInstructions({
            workspace_root: workspaceRoot,
            stop_at: scope?.stop_at,
          }),
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
    const limits = resolveModelLimits(session.model);
    if (!shouldCompact(session.total_tokens, limits, this.compaction_config)) {
      return;
    }
    try {
      await compactSession(
        {
          store: this.deps.sessions_store,
          model_factory: modelFactory,
          summarize: this.compaction_summarize,
        },
        {
          session_id: sessionId,
          auto: true,
          config: this.compaction_config,
          signal,
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
      skills,
    } = req;

    await persistIncomingTail(this.deps.sessions_store, sessionId, messages);

    // Fire-and-forget title generation; writes title only if still the
    // default sentinel, so a user rename always wins. Failures swallowed.
    const firstUserText = extractFirstUserText(messages);
    if (firstUserText.length > 0) {
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

    // Reserve the registry entry; its `modelAbort.signal` (not the
    // request signal) drives the model call so a disconnect can resume.
    let entry;
    try {
      entry = this.streams.create(sessionId);
    } catch (err) {
      if (err instanceof RunInFlightError) {
        return Response.json(
          { error: err.message, code: err.code, session_id: sessionId },
          { status: 409 }
        );
      }
      throw err;
    }

    // Recorder consumer — attached BEFORE the pump so no frame is missed.
    this.streams.attach(
      sessionId,
      createRecorderConsumer({
        store: this.deps.sessions_store,
        session_id: sessionId,
        run_id: runId,
      })
    );

    const streams = this.streams;
    const runAgentFn = this.run_agent_fn;
    const {
      workspace_registry: workspaceRegistry,
      sessions_store: sessionsStore,
    } = this.deps;
    // Pump: open the upstream model call, forward each SSE frame into the
    // registry. Doesn't block the HTTP response; the client attaches as
    // another consumer below.
    void (async () => {
      try {
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
            skills,
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
          { workspace_registry: workspaceRegistry }
        );
        console.log(`[agent-host-agent] run response opened runId=${runId}`);
        await pumpResponseIntoRegistry(response, streams, sessionId);
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

    return buildConsumerResponse(this.streams, sessionId, requestSignal);
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
    const result = await compactSession(
      {
        store: this.deps.sessions_store,
        model_factory: provider.model_factory,
        summarize: this.compaction_summarize,
      },
      { session_id: sessionId, auto: false, config: this.compaction_config }
    );
    return Response.json(result);
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
    this.streams.clear();
    this.session_contexts.clear();
  }

  /** Drop a session's cached static context (call when a session is deleted). */
  forgetSession(sessionId: string): void {
    this.session_contexts.delete(sessionId);
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
