import { NextRequest } from "next/server";
import { streamText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { createLibraryClient } from "@/lib/supabase/server";
import {
  createImageTool,
  createTextTool,
  createUIComponentsTool,
} from "@/lib/ai-agent/tools";
import type { SelectionContext } from "@/lib/ai-agent/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface ChatApiRequestBody {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  context?: SelectionContext;
}

export async function POST(req: NextRequest) {
  const client = await createLibraryClient();

  // Auth check
  const { data: userdata } = await client.auth.getUser();
  if (!userdata.user) {
    return new Response(JSON.stringify({ message: "login required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await req.json()) as ChatApiRequestBody;

  // Build system message with context if provided
  let systemMessage = `You are an AI assistant helping users design and create content in a canvas-based editor. You can:
- Generate images from text prompts
- Create and edit text nodes
- Generate UI components (experimental)

When context is provided about selected nodes, use it to understand what the user is working with.`;

  if (body.context) {
    systemMessage += `\n\nCurrent selection context:\n${body.context.summary}\nSelected nodes: ${JSON.stringify(body.context.nodes, null, 2)}`;
  }

  // Prepare messages for the AI SDK
  const messages = [
    { role: "system" as const, content: systemMessage },
    ...body.messages,
  ];

  // Create the streaming text generator with tool calling
  const result = streamText({
    model: openai("gpt-4o"),
    messages,
    tools: {
      create_image: tool({
        ...createImageTool,
        execute: async ({ prompt, width, height, aspect_ratio }) => {
          // Generate image using the existing API
          const baseUrl = new URL(req.url).origin;
          const imageResponse = await fetch(
            `${baseUrl}/private/ai/generate/image`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: req.headers.get("Cookie") || "",
              },
              body: JSON.stringify({
                prompt,
                width: width || 1024,
                height: height || 1024,
                aspect_ratio,
                model: "black-forest-labs/flux-schnell",
              }),
            }
          );

          if (!imageResponse.ok) {
            const error = await imageResponse.json().catch(() => ({}));
            throw new Error(error.message || "Failed to generate image");
          }

          const imageData = await imageResponse.json();
          // Return instructions for client to insert the image
          return {
            action: "create_image",
            imageUrl: imageData.data.publicUrl,
            width: imageData.data.width,
            height: imageData.data.height,
            prompt,
          };
        },
      }),
      create_text: tool({
        ...createTextTool,
        execute: async ({ text, node_id, x, y }) => {
          // Return instructions for the client to execute
          // The client will execute this using editor.commands
          return {
            action: "create_text",
            node_id,
            text,
            x,
            y,
          };
        },
      }),
      create_ui_components: tool({
        ...createUIComponentsTool,
        execute: async ({ nodes }) => {
          // Validate and return node structure for client to execute
          return {
            action: "create_ui_components",
            nodes: nodes.map((node) => ({
              type: node.type,
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
              text: node.text,
              src: node.src,
              children: node.children,
            })),
          };
        },
      }),
    },
    maxSteps: 5,
  });

  // Stream the response
  return result.toDataStreamResponse({
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
