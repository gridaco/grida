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
import { requireOrganizationId } from "@/lib/auth/organization";
import { aiErrorResponse, orgErrorToAiError } from "@/lib/ai/error";
import type { AgentMessageMetadata } from "@/grida-canvas-hosted/ai/types";

type AgentChatRequestBody = {
  messages: UIMessage[];
};

// TODO(ai-credits): this route inlines its own auth+gate and emits a
// streaming SSE response rather than the `AiActionResult<T>` envelope
// produced by `withAiAuth`. The credits module (`@/lib/ai/credits`)
// folds `balanceCents` from that envelope into UI state. To bring this
// route into the same contract, emit a trailing SSE event carrying
// `balanceCents` (read via `refreshBalance(orgId)` after the agent
// finishes) so the canvas UI can `consume()` it the same way.
export async function POST(req: NextRequest) {
  try {
    // GRIDA-SEC-003: resolve the calling org with verified membership.
    let organizationId: number | null = null;
    if (!Env.web.IS_LOCALDEV_SUPERUSER) {
      const client = await createClient();
      const { data: userdata, error: authError } = await client.auth.getUser();
      if (authError || !userdata.user) {
        return aiErrorResponse({
          code: "unauthorized",
          status: 401,
          message: "login required",
        });
      }
      try {
        organizationId = await requireOrganizationId({
          user_id: userdata.user.id,
          request: req,
        });
      } catch (err) {
        return aiErrorResponse(orgErrorToAiError(err));
      }
    }

    const { messages } = (await req.json()) as AgentChatRequestBody;

    // Track per-step values — `finish-step` carries modelId and per-step usage,
    // but the final `finish` part only has the aggregated totalUsage.
    let lastModelId: string | undefined;
    let lastStepUsage: LanguageModelUsage | undefined;

    // organizationId is required unless we're in the local-dev superuser
    // mode (no auth/billing). The agent's `prepareCall` injects this into
    // providerOptions.grida — see GRIDA-SEC-003.
    if (organizationId === null && !Env.web.IS_LOCALDEV_SUPERUSER) {
      return aiErrorResponse({
        code: "no_organization",
        status: 412,
        message: "organizationId required",
      });
    }
    return createAgentUIStreamResponse({
      agent: canvasDesignAgent,
      uiMessages: messages,
      options:
        organizationId !== null
          ? { organizationId, feature: "canvas/agent/chat" }
          : ({} as { organizationId: number; feature?: string }),
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
