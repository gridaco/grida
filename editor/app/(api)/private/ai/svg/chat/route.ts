import type { NextRequest } from "next/server";
import {
  createAgentUIStreamResponse,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import { svgEditorAgent } from "@/app/(canvas)/svg/_ai/server-agent";
import { createClient } from "@/lib/supabase/server";
import { modelSpecById } from "@/lib/ai/models";
import { requireOrganizationId } from "@/lib/auth/organization";
import { aiErrorResponse, orgErrorToAiError } from "@/lib/ai/error";
import type { AgentMessageMetadata } from "@/grida-canvas-hosted/ai/types";

type AgentChatRequestBody = {
  messages: UIMessage[];
};

// GRIDA-SEC-003: auth + org always run; billing seam is carried by the
// agent through `providerOptions.grida`.
export async function POST(req: NextRequest) {
  try {
    const client = await createClient();
    const { data: userdata, error: authError } = await client.auth.getUser();
    if (authError || !userdata.user) {
      return aiErrorResponse({
        code: "unauthorized",
        status: 401,
        message: "login required",
      });
    }
    let organizationId: number;
    try {
      organizationId = await requireOrganizationId({
        user_id: userdata.user.id,
        request: req,
      });
    } catch (err) {
      return aiErrorResponse(orgErrorToAiError(err));
    }

    const { messages } = (await req.json()) as AgentChatRequestBody;

    let lastModelId: string | undefined;
    let lastStepUsage: LanguageModelUsage | undefined;

    return createAgentUIStreamResponse({
      agent: svgEditorAgent,
      uiMessages: messages,
      options: { organizationId, feature: "canvas/svg/agent/chat" },
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
            modelId: spec?.id ?? lastModelId,
            contextWindow: spec?.contextWindow,
            cost: spec?.cost,
          };
        }
        return undefined;
      },
    });
  } catch (error) {
    console.error("Error in svg agent chat:", error);
    return aiErrorResponse({
      code: "internal",
      status: 500,
      message: "internal error",
    });
  }
}
