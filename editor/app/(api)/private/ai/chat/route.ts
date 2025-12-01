import type { NextRequest } from "next/server";
import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { canvasDesignAgent } from "@/grida-canvas-hosted/ai/agent/server-agent";
import { Env } from "@/env";
import { createClient } from "@/lib/supabase/server";

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

    return createAgentUIStreamResponse({
      agent: canvasDesignAgent,
      messages,
    });
  } catch (error) {
    console.error("Error in agent chat:", error);
    return new Response("Internal error", { status: 500 });
  }
}
