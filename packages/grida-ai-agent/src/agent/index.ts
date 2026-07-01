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
import { hoistToolResultImages } from "./hoist-tool-result-images";
import { prompts } from "../prompts";
import type { AgentModelId } from "../protocol/run";
import type { SkillId } from "../protocol/skills";
import {
  createToolset,
  RUN_COMMAND_TOOL_NAME,
  DESIGN_SEARCH_TOOL_NAME,
  type RunCommandBackend,
  type ToolsetCapabilities,
} from "../tools";
import { renderSkillIndex } from "../skills/skill-tool";
import { AgentVision } from "../vision";
import { AgentGen } from "../gen";
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
  /** Byte source for `view_image`. Without it the perception tool is not
   * registered. `AgentFs` satisfies it — the workspace path passes its fs. */
  vision?: ToolsetCapabilities["vision"];
  /** Image-generation capability. Without it the `generate_image` tool is not
   * registered. The host builds the generator (provider key + scratch sink). */
  image_gen?: ToolsetCapabilities["image_gen"];
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
  /**
   * Whether a human UI is bound (RFC `tools` §question). When true the locked
   * `question` tool is client-resolved (pauses for the user's answer); when
   * false/undefined it ships with a fixed-refusal `execute` for headless hosts.
   * The tool is always registered either way (it is locked).
   */
  interactive?: boolean;
  /**
   * Whether the client can resolve a Grida Library search. When true the
   * `design_search` tool joins the registry (client-resolved by the renderer);
   * absent ⇒ not advertised. See {@link ToolsetCapabilities.library}.
   */
  library?: boolean;
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
    vision: opts.vision,
    image_gen: opts.image_gen,
    command: opts.command,
    interactive: opts.interactive,
    library: opts.library,
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
    // Deliver tool-produced images as a user-message image part rather than a
    // tool-result media block — the latter is stringified to base64 text on
    // the openai-compatible wire and the model never sees pixels (#923). One
    // transform covers both cross-turn and same-turn perception because
    // `prepareStep` sees the rebuilt history plus the in-loop steps together.
    prepareStep: ({ messages }) => ({
      messages: hoistToolResultImages(messages),
    }),
    stopWhen: stepCountIs(8),
  });
}

/**
 * Free-form capability hints appended to the composed prompt.
 *
 * Today: command execution + the session scratch dir (gated on the command,
 * since scratch reach rides the shell) + vision. The blurb tells the LLM the
 * tool exists, what defaults apply, and what enforcement to expect — kept to a
 * few lines so it doesn't crowd the per-skill blocks. Exported (module-level,
 * not at the package root) so the gating is unit-pinned without driving a model.
 */
export function buildCapabilityHints(opts: CreateAgentOptions): string[] {
  const hints: string[] = [];
  if (opts.command) {
    hints.push(
      prompts.command_capability(
        RUN_COMMAND_TOOL_NAME,
        opts.command.default_workdir
      )
    );
    // Scratch reach rides the shell, so it is advertised only alongside the
    // command capability. Promote to a standalone hint if structured-fs or
    // perception reach for scratch lands later (WG `scratch.md`).
    if (opts.command.scratch_dir) {
      hints.push(
        prompts.scratch_capability(
          RUN_COMMAND_TOOL_NAME,
          opts.command.scratch_dir
        )
      );
    }
  }
  if (opts.vision) {
    hints.push(prompts.vision_capability(AgentVision.TOOL_NAMES.view_image));
  }
  // Image generation rides scratch (its produced files sink there), so it is
  // advertised only when the generator AND a scratch path are wired — the same
  // gating that builds the generator binding in the first place.
  if (opts.image_gen && opts.command?.scratch_dir) {
    hints.push(
      prompts.image_gen_capability(
        AgentGen.TOOL_NAMES.generate_image,
        opts.command.scratch_dir
      )
    );
  }
  // The reference-first artwork recipe — gather (design_search) then build. Tells
  // the agent the picks auto-condition generation only when generate_image is also
  // wired (the picks ride into it as i2i references).
  if (opts.library) {
    hints.push(
      prompts.design_search_capability(
        DESIGN_SEARCH_TOOL_NAME,
        opts.image_gen ? AgentGen.TOOL_NAMES.generate_image : undefined
      )
    );
  }
  return hints;
}

export type Agent = ReturnType<typeof createAgent>;
export type AgentMessage = InferAgentUIMessage<Agent>;
