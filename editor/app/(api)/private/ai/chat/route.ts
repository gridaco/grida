import type { NextRequest } from "next/server";
import {
  createAgentUIStreamResponse,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import { canvasDesignAgent } from "@/grida-canvas-hosted/ai/agent/server-agent";
import { Env } from "@/env";
import { createClient } from "@/lib/supabase/server";
import { modelSpecById } from "@/lib/ai/models";
import type { AgentMessageMetadata } from "@/grida-canvas-hosted/ai/types";

type AgentChatRequestBody = {
  messages: UIMessage[];
};

export async function POST(req: NextRequest) {
  try {
    if (!Env.web.IS_LOCALDEV_SUPERUSER) {
      const client = await createClient();
      const { data: userdata, error: authError } = await client.auth.getUser();
      if (authError || !userdata.user) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const { messages } = (await req.json()) as AgentChatRequestBody;

    // Track per-step values — `finish-step` carries modelId and per-step usage,
    // but the final `finish` part only has the aggregated totalUsage.
    let lastModelId: string | undefined;
    let lastStepUsage: LanguageModelUsage | undefined;

    return createAgentUIStreamResponse({
      agent: canvasDesignAgent,
      uiMessages: messages,
      sendReasoning: true,
      messageMetadata: ({ part }): AgentMessageMetadata | undefined => {
        if (part.type === "finish-step") {
          lastModelId = part.response.modelId;
          lastStepUsage = part.usage;
          return undefined;
        }
        if (part.type === "finish") {
          const spec = lastModelId ? modelSpecById(lastModelId) : undefined;

          return {
            totalUsage: part.totalUsage,
            lastStepUsage,
            // Send the gateway model ID (e.g. "openai/gpt-5-mini") so
            // tokenlens in <Context> can resolve cost. Fall back to the
            // raw provider ID if the spec isn't found.
            modelId: spec?.id ?? lastModelId,
            contextWindow: spec?.contextWindow,
            cost: spec?.cost,
          };
        }
        return undefined;
      },
    });
  } catch (error) {
    console.error("Error in agent chat:", error);
    return new Response("Internal error", { status: 500 });
  }
}
