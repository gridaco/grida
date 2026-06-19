/**
 * `createAgent` — the agent factory.
 *
 * Inputs are the SDK's seam against everything platform-y:
 *
 *   - `modelFactory`     — required. Maps a tier id to an AI SDK
 *                          `LanguageModel`. Keeps `next/headers`,
 *                          `@/lib/ai/server`, and any billing path out
 *                          of this package.
 *   - `skills`           — optional, closed enum. Each entry layers a
 *                          domain-specific prompt block on top of the
 *                          core. `'svg'` today; more land alongside
 *                          their tool wiring.
 *   - `command`          — optional. If present, the `run_command` tool
 *                          joins the registry and the prompt grows a
 *                          capability hint. Without it the agent can't
 *                          even see command execution exists (LLM-level
 *                          safety, not just runtime gating).
 *   - `onStepFinish`     — optional diagnostic hook (per-step logger).
 *
 * The fs / todos tools are always present — they're the baseline. The
 * filesystem *binding* (which paths exist, what backend reads/writes
 * them) is the consumer's job: tools ship without `execute()` and get
 * resolved against an `AgentFs` instance on whichever side has the
 * editor. See `tools/index.ts` for the assembly rules.
 */

import {
  ToolLoopAgent,
  stepCountIs,
  type InferAgentUIMessage,
  type LanguageModel,
} from "ai";
import { composeSystemPrompt } from "./prompts";
import { prompts } from "../prompts";
import type { AgentModelId } from "../protocol/run";
import type { SkillId } from "../protocol/skills";
import {
  createToolset,
  RUN_COMMAND_TOOL_NAME,
  type RunCommandBackend,
  type ToolsetCapabilities,
} from "../tools";
import { renderSkillIndex } from "../skills/skill-tool";
import type {
  SkillBodyCache,
  SkillBodyLoader,
  SkillIndex,
} from "../skills/types";
import { AGENT_DEFAULT_TIER, type ModelTier } from "../tiers";

export type { SkillId } from "../protocol/skills";
export type { RunCommandBackend } from "../tools";

export type AgentCallOptions = {
  organization_id?: number;
  feature?: string;
  /** Optional call id used by hosts for idempotent usage/billing attribution. */
  transaction_id?: string;
  /** User-selected tier for this turn. Defaults to {@link AGENT_DEFAULT_TIER}. */
  tier?: ModelTier;
  /**
   * Explicit catalog model id. When set, the factory builds this exact
   * model and `tier` only acts as the billing/fallback bracket. Lets a
   * model picker reach catalog entries no tier maps to.
   */
  model_id?: AgentModelId;
};

/**
 * Caller-provided model factory: maps a tier id (and an optional
 * explicit catalog model id) to an AI SDK `LanguageModel`. Holding
 * this as a parameter is what keeps the package framework-free.
 *
 * When `modelId` is supplied it wins over the tier→model mapping; when
 * omitted the factory resolves the tier's canonical model, preserving
 * the original tier-only behaviour for callers that never pick a model.
 */
export type ModelFactory = (
  tier: ModelTier,
  modelId?: AgentModelId
) => LanguageModel;

export type CreateAgentOptions = {
  model_factory: ModelFactory;
  /** Built-in prompt blocks (e.g. `'svg'`) layered onto the core prompt. */
  skills?: readonly SkillId[];
  /** Server-side `AgentFs` binding. When provided, fs tools resolve
   * in-process via `AgentFs.resolveToolCall`. When omitted, fs tools
   * are bare and the consumer resolves them externally. */
  fs?: ToolsetCapabilities["fs"];
  /** Server-side `AgentTodos` binding. Same shape as `fs`. */
  todos?: ToolsetCapabilities["todos"];
  /** Command-execution capability. Without it, the `run_command` tool is
   * not registered and the LLM cannot call it. */
  command?: ToolsetCapabilities["command"];
  /**
   * Discovered skills (RFC `skills`). When provided, their descriptions
   * are advertised in the system prompt and the locked `skill` tool joins
   * the registry to load bodies on demand.
   */
  skill_index?: SkillIndex;
  /** Per-session skill-body cache (RFC `skills / hot-reload`). */
  skill_cache?: SkillBodyCache;
  /** Skill-body reader (server injects `nodeSkillBodyLoader`). Required
   * when `skillIndex` is set for the `skill` tool to load bodies. */
  skill_load_body?: SkillBodyLoader;
  /**
   * Project instructions (RFC `skills / project instructions`) —
   * concatenated AGENTS.md / CLAUDE.md, injected eagerly into the prompt.
   */
  project_instructions?: string;
};

/**
 * Build the Grida agent. Used by:
 *   - `editor/app/(api)/private/ai/design/chat/route.ts` (web SVG).
 *   - Local AgentHost processes (BYOK model access).
 */
export function createAgent(opts: CreateAgentOptions) {
  const instructions = composeSystemPrompt({
    skills: opts.skills,
    project_instructions: opts.project_instructions,
    skill_index: opts.skill_index
      ? renderSkillIndex(opts.skill_index)
      : undefined,
    capabilities: buildCapabilityHints(opts),
  });
  const tools = createToolset({
    fs: opts.fs,
    todos: opts.todos,
    command: opts.command,
    skill:
      opts.skill_index && opts.skill_load_body
        ? {
            index: opts.skill_index,
            cache: opts.skill_cache,
            load_body: opts.skill_load_body,
          }
        : undefined,
  });

  return new ToolLoopAgent<AgentCallOptions, typeof tools>({
    // Constructor-level model is a fallback; `prepareCall` overrides
    // it per turn from the user-selected tier.
    model: opts.model_factory(AGENT_DEFAULT_TIER),
    instructions,
    tools,
    prepareCall: ({ options, ...settings }) => {
      const tier = options.tier ?? AGENT_DEFAULT_TIER;
      return {
        ...settings,
        model: opts.model_factory(tier, options.model_id),
        providerOptions: {
          ...settings.providerOptions,
          grida: {
            organization_id: options.organization_id,
            feature: options.feature ?? "agent/chat",
            transaction_id: options.transaction_id,
          },
          anthropic: {
            ...settings.providerOptions?.anthropic,
            thinking: { type: "adaptive" },
          },
        },
      };
    },
    onStepFinish: (step) => {
      if (step.toolCalls.length > 0) {
        // Tool names only — never args (may contain user content).
        console.log("[agent] tool step", {
          toolNames: step.toolCalls.map((c) => c.toolName),
        });
      }
    },
    stopWhen: stepCountIs(8),
  });
}

/**
 * Free-form capability hints appended to the composed prompt.
 *
 * Today: just command execution, when wired. The blurb tells the LLM the tool
 * exists, what defaults apply, and what enforcement to expect — kept
 * to a few lines so it doesn't crowd the per-skill blocks.
 */
function buildCapabilityHints(opts: CreateAgentOptions): string[] {
  const hints: string[] = [];
  if (opts.command) {
    hints.push(
      prompts.command_capability(
        RUN_COMMAND_TOOL_NAME,
        opts.command.default_workdir
      )
    );
  }
  return hints;
}

export type Agent = ReturnType<typeof createAgent>;
export type AgentMessage = InferAgentUIMessage<Agent>;
