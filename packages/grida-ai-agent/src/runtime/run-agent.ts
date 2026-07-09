// GRIDA-GG: provider — surface `gg_*` stream errors to the renderer (docs/wg/platform/hosted-ai.md)
/**
 * GRIDA-SEC-004 — agent driver (`runAgent`).
 *
 * Runs `createAgent` locally and returns the standard AI-SDK UI-message
 * SSE response. Provider choice decides only where model execution
 * happens: V1 BYOK talks directly to the user's configured upstream
 * provider.
 *
 * Two sub-modes:
 *
 *   - **Workspace-bound** — request carries a `workspaceRoot`. The agent
 *     gets server-side `AgentFs(NodeFsBackend)` + command backend scoped
 *     to that workspace, plus skill blocks (e.g. `'svg'`). The agent host
 *     resolves every fs / command tool call in-process; the client just
 *     observes chunks.
 *
 *   - **Unbound** (standalone-doc path) — no `workspaceRoot`.
 *     The agent has no fs / command binding. fs tools emit UI-message tool
 *     chunks but resolve nothing server-side; the client holds the live
 *     editor and resolves locally via `AgentFs.resolveToolCall`.
 *
 * **Abort.** The caller hands us an `AbortSignal`; we pass it to the agent
 * UI stream and the model provider receives it from the AI SDK.
 *
 * **Logging.** May log run lifecycle metadata. NEVER log message content,
 * tool args, or AI text output — they may contain user data.
 */

import { createAgentUIStreamResponse } from "ai";
import { createAgent, type AgentMessage } from "../agent";
import { newMessageId } from "../session/ids";
import type { MessageUsage } from "../session/rows";
import type { AgentModelId } from "../protocol/run";
import type { AgentMode } from "../protocol/mode";
import { AGENT_DEFAULT_TIER, type ModelTier } from "../tiers";
import type { ResolvedProvider } from "../providers";
import type { WorkspaceRegistry } from "@grida/daemon/server";
import { nodeSkillBodyLoader } from "../skills/discovery";
import type { SkillBodyCache, SkillIndex } from "../skills/types";
import { createWorkspaceAgentBindings } from "./workspace-agent-bindings";

export type AgentRunRequest = {
  /**
   * UI-message array — pass-through to the agent. We don't narrow the
   * type here because the package owns it; the route does its own
   * shape check before handing the body to us.
   */
  messages: AgentMessage[];
  tier: ModelTier;
  /**
   * Optional explicit catalog model id. Overrides the `tier`→model
   * mapping for this run; `tier` still acts as the billing/fallback
   * bracket. Validated against the catalog at the route boundary.
   */
  model_id?: AgentModelId;
  /** Optional feature tag for billing/attribution (propagated to provider opts). */
  feature?: string;
  /** Agent host-local run id propagated as the model transaction/request id. */
  run_id?: string;
  /** Aborted when the client disconnects or calls `/abort`. */
  signal: AbortSignal;
  /**
   * Optional workspace context. When present, the local agent path wires
   * fs (NodeFsBackend) + command execution to this root, and the agent host
   * resolves tool calls server-side. When absent, the agent runs
   * without bindings — tools emit chunks for the client to handle
   * (standalone-doc path).
   */
  workspace_root?: string;
  /**
   * Permission/supervision posture (RFC `permission modes`). Drives the shell
   * gate in the command backend; ignored when `workspaceRoot` is absent (no
   * command binding). Defaults to `accept-edits` downstream when omitted.
   */
  mode?: AgentMode;
  /**
   * Per-run client UI capability for the `question` tool (RFC `tools`
   * §question). When set it WINS over the host-level `interactive` deps below
   * (a `cli run` against an interactive daemon declares `false` to stay
   * headless). Absent ⇒ the host default applies.
   */
  interactive?: boolean;
  /**
   * Per-run client capability to resolve a Grida Library search
   * (`design_search`). Like {@link interactive} it WINS over the host-level
   * `library` deps below. Absent ⇒ the host default applies.
   */
  library?: boolean;
  /**
   * Discovered RFC skills (names + descriptions advertised; bodies loaded
   * via the `skill` tool). Session-static — the runtime discovers once and
   * passes the same index every turn.
   */
  skill_index?: SkillIndex;
  /** Per-session skill-body cache (RFC `skills / hot-reload`). */
  skill_cache?: SkillBodyCache;
  /** Project instructions (concatenated AGENTS.md / CLAUDE.md). */
  project_instructions?: string;
  /**
   * Per-step usage hook — invoked once per agent loop iteration with
   * `{inputTokens, outputTokens, totalTokens, ...}` from the model
   * response. The route handler wires this into the SessionsStore so
   * each turn's token usage gets accumulated on the session row.
   * Errors thrown from the callback are swallowed (logged via the
   * caller's logger) so a usage-tracking bug never breaks the stream.
   */
  on_step_usage?: (usage: AgentStepUsage) => void;
};

/**
 * Subset of AI SDK `LanguageModelUsage` we use for persistence. The
 * SDK's `LanguageModelUsage` has many optional fields; we project the
 * fields we keep on assistant-message usage metadata and session rollups.
 */
export type AgentStepUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
  cached_input_tokens?: number;
  cache_write_tokens?: number;
};

/**
 * The camelCase shape the AI SDK actually hands `onStepFinish`
 * (`LanguageModelUsage`, projected to the fields we persist). Declared
 * locally so the snake_case→camelCase mapping in {@link runAgent} is
 * type-checked rather than asserted — the original `as AgentStepUsage`
 * cast type-checked but never matched the runtime keys.
 */
type SdkStepUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
  inputTokenDetails?: {
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
};

/**
 * Project the SDK's camelCase usage onto the snake_case {@link MessageUsage}
 * we persist + stream, applying the same cache-normalization as the
 * recorder's `accumulateUsage`: the SDK's `inputTokens` already INCLUDES
 * cache reads, so subtract them so `input` + `cache_read` don't double-count.
 */
function toMessageUsage(u: SdkStepUsage): MessageUsage {
  const cacheRead =
    u.cachedInputTokens ?? u.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWrite =
    u.cacheCreationInputTokens ?? u.inputTokenDetails?.cacheWriteTokens ?? 0;
  return {
    input: Math.max(0, (u.inputTokens ?? 0) - cacheRead - cacheWrite),
    output: u.outputTokens ?? 0,
    reasoning: u.reasoningTokens ?? 0,
    cache_read: cacheRead,
    cache_write: cacheWrite,
  };
}

/**
 * Run the agent locally and return the standard AI SDK UI-message SSE
 * response. When `req.workspaceRoot` is set, the agent gets fs +
 * command bindings and resolves tool calls in-process.
 */
export async function runAgent(
  provider: ResolvedProvider,
  req: AgentRunRequest,
  deps: {
    workspace_registry: WorkspaceRegistry;
    /** Host-level: gates the `question` tool (pause vs fixed-refusal). The
     * runtime threads it down via `runDeps`; `createWorkspaceAgentBindings`
     * ignores it (it reads only workspace/secret/shell fields). */
    interactive?: boolean;
    /** Host-level default for the `design_search` (library) capability;
     * overridden by the per-run `req.library`. */
    library?: boolean;
  }
): Promise<Response> {
  // Wire bindings only when the request carries workspace context.
  // The "no-bindings" mode preserves the existing SVG-editor flow
  // where the client holds the live editor and resolves tool calls
  // locally — server-side bindings there would double-execute.
  const bindings = await createWorkspaceAgentBindings(req, deps);

  const agent = createAgent({
    model_factory: provider.model_factory,
    // No eager skill blocks on the workspace path — built-ins advertise-then-load
    // from the bundled discovery layer via `skill_index` + the `skill` tool.
    fs: bindings?.fs,
    todos: bindings?.todos,
    // AgentFs satisfies AgentVision.ByteReader, so the workspace agent can SEE
    // images by path (server-resolved against the same read scope as read_file).
    // Only wire it when the backend can actually read bytes — otherwise
    // view_image would be advertised but degrade every call to not_found.
    vision: bindings?.fs.bytesReadable ? bindings.fs : undefined,
    // Image generation (`generate_image`) — built by the bindings only when the
    // host enabled it, a scratch sink exists, and a provider key is present.
    image_gen: bindings?.image_gen,
    command: bindings?.command,
    // RFC skills + project instructions are session-static context the
    // runtime discovered once and threads through every turn. When scratch is
    // wired (workspace path), the loader MATERIALIZES a loaded skill's tree into
    // scratch so its files are reachable; otherwise it just reads the body.
    skill_index: req.skill_index,
    skill_cache: req.skill_cache,
    skill_load_body: req.skill_index
      ? (bindings?.skill_load_body ?? nodeSkillBodyLoader)
      : undefined,
    project_instructions: req.project_instructions,
    // Whether the `question` tool pauses for a human or refuses headless. The
    // per-run client capability (`req.interactive`) WINS over the host default
    // (`deps.interactive`) — one daemon serves both an interactive web client
    // and a headless `cli run`. Independent of workspace bindings (a person can
    // answer a standalone-doc session too).
    interactive: req.interactive ?? deps.interactive,
    // design_search (library gather) — advertised only when the client declared
    // it can resolve the search (renderer-owned, like fs). Per-run wins over the
    // host default, mirroring `interactive`.
    library: req.library ?? deps.library,
  });

  return await createAgentUIStreamResponse({
    agent,
    uiMessages: req.messages,
    // GRIDA-SEC-006 — normalize the two ACTIONABLE hosted-AI failures to
    // their bare literal codes: Electron's contextBridge strips custom
    // error props, so the code-led message IS the renderer's detection
    // contract (re-mint + retry / top-up CTA). Everything else keeps the
    // SDK default's semantics (message pass-through, `getErrorMessage`
    // shape) — tool refusals and provider errors surface exactly as
    // before this hook existed.
    onError: (error: unknown) => {
      const code = (error as { code?: unknown })?.code;
      if (code === "gg_token_expired" || code === "insufficient_credits") {
        return String(code);
      }
      if (error == null) return "unknown error";
      if (typeof error === "string") return error;
      if (error instanceof Error) return error.message;
      return JSON.stringify(error);
    },
    // Advertise a stable assistant message id on every turn's stream. On a fresh
    // turn this mints a new id; on a supervised-approval RESUME the SDK reuses
    // the last assistant message's id from the rebuilt history (it continues
    // that message). The recorder persists under this same id, so the
    // client-rendered message and the DB row share one id — the resume merges in
    // place instead of forking a duplicate turn. Uses the store's id format so
    // ids are uniform across server-minted and stream-advertised messages.
    generateMessageId: newMessageId,
    // `prepareCall` in the package reads `options.tier` / `options.modelId`
    // and rebuilds the model per turn.
    options: {
      tier: req.tier ?? AGENT_DEFAULT_TIER,
      model_id: req.model_id,
      feature: req.feature ?? "agent/chat",
      transaction_id: req.run_id,
    },
    abortSignal: req.signal,
    // Stream the turn's usage as message metadata so the LIVE assistant
    // message the renderer holds carries it. The DB row is stamped after
    // recorder flush with this usage plus the runtime-resolved model.
    messageMetadata: ({ part }) =>
      part.type === "finish"
        ? { usage: toMessageUsage(part.totalUsage) }
        : undefined,
    onStepFinish: req.on_step_usage
      ? (step) => {
          try {
            // The AI SDK reports `step.usage` in **camelCase**
            // (`LanguageModelUsage`: `inputTokens`, `outputTokens`, …);
            // our persistence projection is snake_case. Map explicitly —
            // a bare `as AgentStepUsage` cast compiles but reads
            // `undefined` for every field at runtime, silently zeroing all
            // recorded usage (no rollups, no cost, no context meter).
            const u = (step as { usage?: SdkStepUsage }).usage;
            if (u) {
              req.on_step_usage!({
                input_tokens: u.inputTokens,
                output_tokens: u.outputTokens,
                total_tokens: u.totalTokens,
                reasoning_tokens: u.reasoningTokens,
                cached_input_tokens:
                  u.cachedInputTokens ?? u.inputTokenDetails?.cacheReadTokens,
                cache_write_tokens:
                  u.cacheCreationInputTokens ??
                  u.inputTokenDetails?.cacheWriteTokens,
              });
            }
          } catch {
            // never break the stream on a usage hook bug
          }
        }
      : undefined,
  });
}
