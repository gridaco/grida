import { ToolLoopAgent, stepCountIs, type InferAgentUIMessage } from "ai";
import { AgentFs } from "@grida/agent-tools/fs";
import { AgentTodos } from "@grida/agent-tools/todos";
import { SYSTEM_PROMPT } from "./prompt";
import { model, type ModelTier } from "@/lib/ai/server";
// Client-safe tier constants live in ./tiers — re-exported here so the route
// can import everything from server-agent.ts. Don't move them back inline:
// `@/lib/ai/server` pulls `next/headers` and would break client imports.
import { SVG_AGENT_DEFAULT_TIER, SVG_AGENT_TIERS } from "./tiers";
export { SVG_AGENT_DEFAULT_TIER, SVG_AGENT_TIERS };

export type SvgAgentCallOptions = {
  organizationId: number;
  feature?: string;
  /** User-selected tier for this turn. Defaults to {@link SVG_AGENT_DEFAULT_TIER}. */
  tier?: ModelTier;
};

// Fundamental tools (filesystem + planning) + future canvas-specific tools.
// See docs/wg/feat-ai/tools.md.
const tools = { ...AgentFs.tools, ...AgentTodos.tools } as const;

// Loop cap covers a typical plan-edit-verify cycle with a couple of retries.
export const svgEditorAgent = new ToolLoopAgent<
  SvgAgentCallOptions,
  typeof tools
>({
  // Constructor-level model is a fallback; `prepareCall` overrides it per
  // turn from the user-selected tier (see `options.tier`).
  model: model(SVG_AGENT_DEFAULT_TIER),
  instructions: SYSTEM_PROMPT,
  tools,
  prepareCall: ({ options, ...settings }) => {
    const tier = options.tier ?? SVG_AGENT_DEFAULT_TIER;
    return {
      ...settings,
      model: model(tier),
      providerOptions: {
        ...settings.providerOptions,
        grida: {
          organizationId: options.organizationId,
          feature: options.feature ?? "canvas/svg/agent/chat",
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
      console.log("[svgEditorAgent] tool step", {
        toolNames: step.toolCalls.map((c) => c.toolName),
      });
    }
  },
  stopWhen: stepCountIs(8),
});

export type SvgEditorAgentMessage = InferAgentUIMessage<typeof svgEditorAgent>;
