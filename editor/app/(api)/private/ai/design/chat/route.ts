import type { NextRequest } from "next/server";
import {
  createAgentUIStreamResponse,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import {
  gridaAgent,
  AGENT_DEFAULT_TIER,
  AGENT_TIERS,
} from "@/app/(canvas)/svg/_ai/server-agent";
import type { ModelTier } from "@/lib/ai/server";
import { createClient, createClientFromBearer } from "@/lib/supabase/server";
import { modelSpecById } from "@/lib/ai/models";
import { requireOrganizationId } from "@/lib/auth/organization";
import { aiErrorResponse, orgErrorToAiError } from "@/lib/ai/error";
import type { AgentMessageMetadata } from "@/grida-canvas-hosted/ai/types";

type AgentChatRequestBody = {
  messages: UIMessage[];
  /** Optional client-supplied tier. Unknown / missing → default. */
  tier?: string;
};

// Server-side allowlist mirrors `/ai`'s chat action: never trust the
// client to pick a tier outside the four exposed by the picker.
const ALLOWED_TIERS = new Set<string>(AGENT_TIERS);
function coerceTier(raw: unknown): ModelTier {
  return typeof raw === "string" && ALLOWED_TIERS.has(raw)
    ? (raw as ModelTier)
    : AGENT_DEFAULT_TIER;
}

// GRIDA-SEC-003: auth + org always run; billing seam is carried by the
// agent through `providerOptions.grida`.
//
// GRIDA-SEC-004: route accepts cookie auth (browser) OR `Authorization: Bearer`
// (Grida Desktop AgentSidecar). The cookie path is unchanged for web
// callers; the bearer path lets the agent sidecar call this endpoint without
// presenting browser cookies. See editor/lib/supabase/server.ts
// (`createClientFromBearer`).
const BEARER_PREFIX = "Bearer ";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const bearerToken = authHeader.startsWith(BEARER_PREFIX)
      ? authHeader.slice(BEARER_PREFIX.length)
      : null;
    const client = bearerToken
      ? createClientFromBearer(bearerToken)
      : await createClient();
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

    const body = (await req.json()) as AgentChatRequestBody;
    const messages = body.messages;
    const tier = coerceTier(body.tier);

    let lastModelId: string | undefined;
    let lastStepUsage: LanguageModelUsage | undefined;

    return createAgentUIStreamResponse({
      agent: gridaAgent,
      uiMessages: messages,
      options: {
        organization_id: organizationId,
        feature: "canvas/svg/agent/chat",
        tier,
      },
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
