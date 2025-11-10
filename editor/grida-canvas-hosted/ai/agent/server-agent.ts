import { ToolLoopAgent, stepCountIs, InferAgentUIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { canvas_use } from "../tools/canvas-use";

const tools = {
  [canvas_use.tools_spec.name_platform_sys_tool_ai_fetch_preflight]:
    canvas_use.tools_spec.platform_sys_tool_ai_fetch_preflight,
  [canvas_use.tools_spec.name_platform_sys_tool_ai_image_model_cards]:
    canvas_use.tools_spec.platform_sys_tool_ai_image_model_cards,
  [canvas_use.tools_spec.name_platform_sys_tool_ai_generate_image]:
    canvas_use.tools_spec.platform_sys_tool_ai_generate_image,
  // [canvas_use.tools_spec.name_man]: canvas_use.man,
  // [canvas_use.tools_spec.name_create_node]: canvas_use.create_node,
  [canvas_use.tools_spec.name_create_node_from_svg]:
    canvas_use.tools_spec.create_node_from_svg,
  [canvas_use.tools_spec.name_create_node_from_image]:
    canvas_use.tools_spec.create_node_from_image,
  // grida_canvas_scripting_exec: grida_canvas_scripting_exec,
};

/**
 * Canvas Design Agent using AI SDK 6 ToolLoopAgent
 *
 * Features:
 * - GPT-4o-mini for fast, cost-effective responses
 * - Tool calling for image generation, text creation, UI components
 * - Automatic tool loop handling (up to 20 steps)
 * - Type-safe agent definition
 *
 * Note: Switch to anthropic("claude-3-5-sonnet-20241022") when ANTHROPIC_API_KEY is set in .env
 */
export const canvasDesignAgent = new ToolLoopAgent({
  model: openai("gpt-5-mini-2025-08-07"),
  instructions: canvas_use.llm.instructions,
  tools: tools,
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
