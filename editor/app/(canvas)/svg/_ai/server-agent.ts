import { ToolLoopAgent, stepCountIs, type InferAgentUIMessage } from "ai";
import { tools } from "./tools";
import { SYSTEM_PROMPT } from "./prompt";
import { model } from "@/lib/ai/server";

export type SvgAgentCallOptions = {
  organizationId: number;
  feature?: string;
};

// Loop cap covers read → write → one stale-retry cycle.
export const svgEditorAgent = new ToolLoopAgent<
  SvgAgentCallOptions,
  typeof tools
>({
  model: model("pro"),
  instructions: SYSTEM_PROMPT,
  tools,
  prepareCall: ({ options, ...settings }) => ({
    ...settings,
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
  }),
  onStepFinish: (step) => {
    if (step.toolCalls.length > 0) {
      console.log("[svgEditorAgent] tool step", {
        toolNames: step.toolCalls.map((c) => c.toolName),
      });
    }
  },
  stopWhen: stepCountIs(4),
});

export type SvgEditorAgentMessage = InferAgentUIMessage<typeof svgEditorAgent>;
