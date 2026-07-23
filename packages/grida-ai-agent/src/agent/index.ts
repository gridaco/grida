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
  type Experimental_DownloadFunction as DownloadFunction,
  type InferAgentUIMessage,
  type LanguageModel,
} from "ai";
import { composeSystemPrompt } from "./prompts";
import { hoistToolResultImages } from "./hoist-tool-result-images";
import { prompts } from "../prompts";
import type { AgentModelId } from "../protocol/run";
import {
  createToolset,
  RUN_COMMAND_TOOL_NAME,
  DESIGN_SEARCH_TOOL_NAME,
  SURFACE_OPEN_TOOL_NAME,
  SURFACE_LIST_OPEN_TOOL_NAME,
  type RunCommandBackend,
  type ToolsetCapabilities,
} from "../tools";
import { renderSkillIndex } from "../skills/skill-tool";
import { AgentVision } from "../vision";
import { AgentGen } from "../gen";
import {
  gridaProviderOptions,
  type GridaCallProviderOptions,
} from "@grida/ai-models";
import type {
  SkillBodyCache,
  SkillBodyLoader,
  SkillIndex,
} from "../skills/types";
import { AGENT_DEFAULT_TIER, type ModelTier } from "../tiers";

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
  /** Raw eager skill blocks for a host with NO discovery (the web SVG editor).
   *  Everywhere a bundled dir / workspace exists, skills advertise-then-load
   *  via `skill_index` + the `skill` tool instead. */
  skill_blocks?: readonly string[];
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
   * Whether a human UI can answer the locked `question` tool. When true it is
   * client-resolved; when false/undefined it returns a fixed refusal.
   */
  interactive?: boolean;
  /**
   * Presentation state captured by an attached host at the start of this turn.
   * The surface tools always execute server-side from this snapshot; omission
   * means headless/detached.
   */
  surface?: ToolsetCapabilities["surface"];
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
  return buildAgent(opts);
}

/**
 * Node-host-only variant used by the agent runtime to replace the AI SDK's
 * default URL-part downloader with the package's bounded, host-authorized
 * lane. Deliberately not re-exported from the package's neutral root: hosts
 * supply provider HTTP only at `@grida/agent/server`.
 */
export function createAgentWithUrlPartDownload(
  opts: CreateAgentOptions,
  download: DownloadFunction
) {
  return buildAgent(opts, download);
}

function buildAgent(opts: CreateAgentOptions, download?: DownloadFunction) {
  const instructions = composeSystemPrompt({
    skill_blocks: opts.skill_blocks,
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
    surface: opts.surface,
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
    experimental_download: download,
    prepareCall: ({ options, ...settings }) => {
      const tier = options.tier ?? AGENT_DEFAULT_TIER;
      return {
        ...settings,
        model: opts.model_factory(tier, options.model_id),
        providerOptions: {
          ...settings.providerOptions,
          ...gridaAttribution(options),
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
 * Build the billing seam's `grida` provider-options fragment for a turn.
 *
 * Injected via the shared typed builder ({@link gridaProviderOptions}), never a
 * bare `{ grida: {...} }` literal — a bare literal is how a snake_cased
 * `organization_id` key once shipped past `tsc` and failed only at runtime with
 * `MissingOrgIdError`.
 *
 * `organization_id` is optional on {@link AgentCallOptions} because the BYOK /
 * desktop host runs on a bare provider with NO billing middleware — there is no
 * seam to attribute, so this returns `{}` and no `grida` key is emitted. On the
 * hosted (billed) path the route always threads a verified id (GRIDA-SEC-003 /
 * `requireOrganizationId`), so the builder branch always runs there; and if a
 * billed call ever reached the seam without one, its middleware correctly
 * throws `MissingOrgIdError` rather than billing a bogus org.
 *
 * Exported so the exact key mapping (camelCase, tier-independent) is unit-pinned
 * without standing up a model — the class of bug this fixes is a wrong key, and
 * the guard for a wrong key is a test that reads the emitted key.
 */
export function gridaAttribution(
  options: AgentCallOptions
): { grida: GridaCallProviderOptions } | Record<string, never> {
  if (options.organization_id === undefined) return {};
  return gridaProviderOptions({
    organizationId: options.organization_id,
    feature: options.feature ?? "agent/chat",
    ...(options.transaction_id !== undefined
      ? { transactionId: options.transaction_id }
      : {}),
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
  // Surface presentation is locked into every toolset. The same generic hint
  // applies in interactive and headless hosts because the latter resolve an
  // honest no-op and the agent must continue the artifact work unchanged.
  const hints: string[] = [
    prompts.surface_capability(
      SURFACE_OPEN_TOOL_NAME,
      SURFACE_LIST_OPEN_TOOL_NAME
    ),
  ];
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
  // The reference-first artwork recipe — gather (design_search) then build. Only
  // advertised when BOTH library and interactive are on: `createToolset` wires
  // `design_search` as a usable pick tool only in interactive mode (headless gets
  // a fixed refusal), so hinting it headless would nudge the agent into a
  // guaranteed tool error. Tells the agent the picks auto-condition generation
  // only when generate_image is also wired (the picks ride into it as i2i refs).
  if (opts.library && opts.interactive) {
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
