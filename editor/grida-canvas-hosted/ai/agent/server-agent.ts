import {
  ToolLoopAgent,
  stepCountIs,
  InferAgentUIMessage,
  type ToolSet,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { canvas_use } from "../tools/canvas-use";
import { model } from "@/lib/ai/server";

const tools = {
  [canvas_use.tools_spec.name_platform_sys_tool_ai_fetch_preflight]:
    canvas_use.tools_spec.platform_sys_tool_ai_fetch_preflight,
  [canvas_use.tools_spec.name_platform_sys_tool_ai_image_model_cards]:
    canvas_use.tools_spec.platform_sys_tool_ai_image_model_cards,
  [canvas_use.tools_spec.name_platform_sys_tool_ai_generate_image]:
    canvas_use.tools_spec.platform_sys_tool_ai_generate_image,
  // [canvas_use.tools_spec.name_man]: canvas_use.man,
  // [canvas_use.tools_spec.name_create_node]: canvas_use.create_node,
  [canvas_use.tools_spec.name_tree]: canvas_use.tools_spec.tree,
  [canvas_use.tools_spec.name_make_from_svg]:
    canvas_use.tools_spec.make_from_svg,
  [canvas_use.tools_spec.name_make_from_image]:
    canvas_use.tools_spec.make_from_image,
  [canvas_use.tools_spec.name_make_from_markdown]:
    canvas_use.tools_spec.make_from_markdown,
  [canvas_use.tools_spec.name_data_artboard_sizes]:
    canvas_use.tools_spec.data_artboard_sizes,
  // grida_canvas_scripting_exec: grida_canvas_scripting_exec,

  // Provider-executed tool — the webSearch schema uses an internal symbol from
  // a different @ai-sdk/provider-utils version, which breaks the ToolSet
  // constraint.  The cast is safe because the tool is executed by the provider.
  web_search: openai.tools.webSearch({}) as unknown as ToolSet[string],
} satisfies ToolSet;

/**
 * Per-call options for the canvas design agent. The chat route resolves
 * `organizationId` from the request (GRIDA-SEC-003) and threads it via
 * `createAgentUIStreamResponse({ ..., options })`. `prepareCall` reads
 * the options and injects `providerOptions.grida` so the seam middleware
 * can gate + bill the call.
 */
export type CanvasDesignAgentCallOptions = {
  organizationId: number;
  feature?: string;
};

/**
 * Canvas Design Agent using AI SDK 6 ToolLoopAgent
 *
 * Features:
 * - Multimodal "mini" tier model for cost-effective agent responses
 * - Tool calling for image generation, text creation, UI components
 * - Automatic tool loop handling (up to 10 steps)
 * - Type-safe agent definition
 * - Reasoning (thinking) enabled for OpenAI and Anthropic via providerOptions
 *
 * @see https://vercel.com/docs/ai-gateway/capabilities/reasoning
 * @see https://vercel.com/docs/ai-gateway/capabilities/reasoning/openai
 * @see https://vercel.com/docs/ai-gateway/capabilities/reasoning/anthropic
 */
export const canvasDesignAgent = new ToolLoopAgent<
  CanvasDesignAgentCallOptions,
  typeof tools
>({
  model: model("mini"),
  instructions: canvas_use.llm.instructions,
  tools: tools,
  prepareCall: ({ options, ...settings }) => ({
    ...settings,
    providerOptions: {
      ...settings.providerOptions,
      grida: {
        organizationId: options.organizationId,
        feature: options.feature ?? "canvas/agent/chat",
      },
      openai: {
        ...settings.providerOptions?.openai,
        reasoningEffort: "medium",
        reasoningSummary: "detailed",
      },
      // Claude 4.6: adaptive thinking (model decides when/how much to think)
      anthropic: {
        ...settings.providerOptions?.anthropic,
        thinking: { type: "adaptive" },
      },
    },
  }),
  onStepFinish: (step) => {
    if (step.toolCalls.length > 0 || step.dynamicToolCalls.length > 0) {
      const staticCalls = step.toolCalls.map((call) => call.toolName);
      const dynamicCalls = step.dynamicToolCalls.map((call) => call.toolName);
      console.log("[canvasDesignAgent] tool step", {
        staticCalls,
        dynamicCalls,
        toolCallCount: step.toolCalls.length + step.dynamicToolCalls.length,
      });
    }
  },
  stopWhen: stepCountIs(10),
});

// Export type for client-side type safety
export type CanvasDesignAgentMessage = InferAgentUIMessage<
  typeof canvasDesignAgent
>;
