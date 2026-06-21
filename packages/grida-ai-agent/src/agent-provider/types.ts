/**
 * Agent-provider class (issue #813) — Grida as an ACP **consumer** of an
 * external agent. Single provider for the spike: **Claude** via the ACP-team
 * bridge `@agentclientprotocol/claude-agent-acp` (it wraps the official Claude
 * Agent SDK and exposes it over ACP). Grida spawns the bridge and drives it
 * over stdio with `@agentclientprotocol/sdk`'s `ClientSideConnection`.
 *
 * Why this shape (vs embedding the Claude Agent SDK directly):
 *   - it IS the #813 architecture — consumer drives an external ACP agent;
 *   - it **streams** token deltas natively (ACP `agent_message_chunk`);
 *   - it supports **session resume** for multi-turn continuity;
 *   - the Agent SDK + its native engine run inside the BRIDGE subprocess, so
 *     the desktop sidecar never bundles them (no `import.meta.url` packaging
 *     trap — the bridge is reached over stdio, not imported).
 */
export type AgentProviderId = "claude";

/** Normalized event vocabulary; ACP `session/update` lowers into this. */
export type ProviderChunk =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool";
      id: string;
      name: string;
      status: "pending" | "running" | "completed" | "failed";
      detail?: string;
    }
  | { type: "error"; message: string };

export type ChunkSink = (chunk: ProviderChunk) => void;

export interface TurnResult {
  /** Normalized stop reason (ACP `StopReason`: end_turn / refusal / …). */
  stopReason: string;
  /**
   * The external ACP session id this turn ran under. The host persists it and
   * passes it back as {@link OpenProviderOptions.resumeSessionId} next turn so
   * the external agent continues the SAME conversation.
   */
  providerSessionId?: string;
}

/** One open conversation with the external agent. `prompt` runs one turn. */
export interface AgentProviderSession {
  readonly id: AgentProviderId;
  readonly info: Record<string, unknown>;
  prompt(text: string, onChunk: ChunkSink): Promise<TurnResult>;
  /**
   * Ask the external agent to abort the in-flight turn (ACP `session/cancel`).
   * The agent may still emit final updates before `prompt` resolves with a
   * cancelled stop reason. No-op if nothing is running.
   */
  cancel(): Promise<void>;
  dispose(): Promise<void>;
}

export interface OpenProviderOptions {
  /** Working directory handed to the external agent. Defaults to cwd. */
  cwd?: string;
  /**
   * Resume a prior ACP session (issue #813 continuity) — its id from a
   * previous turn's {@link TurnResult.providerSessionId}. Must pair with the
   * SAME `cwd` (the agent persists sessions per working directory).
   */
  resumeSessionId?: string;
  /**
   * The vendor model id to run (issue #813 model picker), passed to the bridge
   * via `_meta.claudeCode.options.model`. Omit to use the subscription default.
   * Full ids only (aliases like `opus` resolve to an older version).
   */
  model?: string;
}

/**
 * Synthetic catalog model ids that select an agent-provider (and a specific
 * vendor model). The contract shared by the UI picker, the run-input gate, and
 * the runtime branch. NEUTRAL (no node/SDK imports) — browser-safe. Keep the
 * keys + models in sync with the desktop picker. Each model id was verified to
 * run on a Claude Pro/Max subscription via the bridge. Opus 4.8 maps to the
 * 1M-context variant `claude-opus-4-8[1m]` — a DISTINCT model id from plain
 * `claude-opus-4-8` (the smaller-context build, intentionally not surfaced).
 */
export const AGENT_PROVIDER_MODELS = {
  "claude-code": { id: "claude" }, // subscription default (back-compat)
  "claude-code/opus-4.8-1m": { id: "claude", model: "claude-opus-4-8[1m]" },
  "claude-code/sonnet-4.6": { id: "claude", model: "claude-sonnet-4-6" },
  "claude-code/haiku-4.5": { id: "claude", model: "claude-haiku-4-5" },
} as const satisfies Record<string, { id: AgentProviderId; model?: string }>;

export type AgentProviderModelId = keyof typeof AGENT_PROVIDER_MODELS;

export function isAgentProviderModel(
  modelId: string | null | undefined
): modelId is AgentProviderModelId {
  // Own-property check (not `in`): a prototype key like `toString`/`__proto__`
  // must NOT pass, or the later `AGENT_PROVIDER_MODELS[id]` lookup yields junk.
  return (
    typeof modelId === "string" && Object.hasOwn(AGENT_PROVIDER_MODELS, modelId)
  );
}

/**
 * The vendor model id a picker selection maps to (e.g. `claude-opus-4-8[1m]`),
 * passed to the bridge via `_meta.claudeCode.options.model`. `undefined` for the
 * bare `claude-code` default → use the subscription default. The cast is the
 * single place that reconciles the union (the bare entry has no `model` key).
 */
export function agentProviderModel(
  id: AgentProviderModelId
): string | undefined {
  return (AGENT_PROVIDER_MODELS[id] as { model?: string }).model;
}
