import { describe, expect, it, vi } from "vitest";
import { generateText, Output, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import { makeOpenRouterFactory } from "./byok";
import { ProviderHttp } from "./http";

// OpenRouter's normalized Chat API carries upstream Responses state and
// Claude signatures as reasoning_details. No request leaves these mocks.
const CASES = [
  {
    modelId: "openai/gpt-6-sol",
    details: [
      {
        type: "reasoning.encrypted",
        id: "rs_synthetic",
        data: "synthetic-encrypted-state",
        format: "openai-responses-v1",
        index: 0,
      },
    ],
  },
  {
    modelId: "openai/gpt-6-luna",
    details: [
      {
        type: "reasoning.encrypted",
        id: "rs_synthetic",
        data: "synthetic-encrypted-state",
        format: "openai-responses-v1",
        index: 0,
      },
    ],
  },
  {
    modelId: "anthropic/claude-opus-5.5",
    details: [
      {
        type: "reasoning.text",
        text: "",
        signature: "synthetic-empty-thinking-signature",
        format: "anthropic-claude-v1",
        index: 0,
      },
    ],
  },
];

const USAGE = {
  prompt_tokens: 13,
  completion_tokens: 7,
  total_tokens: 20,
  completion_tokens_details: { reasoning_tokens: 5 },
};

const TOOL_CALL = {
  id: "call_synthetic",
  type: "function",
  function: { name: "check", arguments: "{}" },
};

type ChatBody = {
  model: string;
  tools: { function: { name: string } }[];
  messages: {
    role: string;
    content: unknown;
    reasoning_details?: unknown;
    tool_calls?: unknown;
  }[];
  stream_options?: { include_usage?: boolean };
  response_format?: unknown;
};

function completion(modelId: string, message: object, finishReason = "stop") {
  return {
    id: "chat_synthetic",
    object: "chat.completion",
    created: 1,
    model: modelId,
    usage: USAGE,
    choices: [{ index: 0, message, finish_reason: finishReason }],
  };
}

function streamedCompletion(
  modelId: string,
  deltas: object[],
  finishReason: string
): Response {
  const chunks = [...deltas, {}].map((delta, index) => ({
    id: "chat_synthetic",
    object: "chat.completion.chunk",
    created: 1,
    model: modelId,
    ...(index === deltas.length ? { usage: USAGE } : {}),
    choices: [
      {
        index: 0,
        delta,
        finish_reason: index === deltas.length ? finishReason : null,
      },
    ],
  }));
  return new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
      "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } }
  );
}

describe("makeOpenRouterFactory", () => {
  describe.each(CASES)("$modelId", ({ modelId, details }) => {
    it.each([false, true])(
      "preserves opaque reasoning through a tool loop (stream=%s)",
      async (streaming) => {
        const bodies: ChatBody[] = [];
        const request = vi.fn<typeof fetch>(async (input, init) => {
          expect(String(input)).toBe(
            "https://openrouter.ai/api/v1/chat/completions"
          );
          expect(new Headers(init?.headers).get("authorization")).toBe(
            "Bearer synthetic-byok-key"
          );
          bodies.push(JSON.parse(String(init?.body)));
          const first = bodies.length === 1;
          if (streaming) {
            return streamedCompletion(
              modelId,
              first
                ? [
                    { reasoning_details: details },
                    { tool_calls: [{ ...TOOL_CALL, index: 0 }] },
                  ]
                : [{ content: "checked" }],
              first ? "tool_calls" : "stop"
            );
          }
          return Response.json(
            completion(
              modelId,
              first
                ? {
                    role: "assistant",
                    content: null,
                    reasoning_details: details,
                    tool_calls: [TOOL_CALL],
                  }
                : { role: "assistant", content: "checked" },
              first ? "tool_calls" : "stop"
            )
          );
        });
        const download = vi.fn<typeof fetch>();
        const execute = vi.fn<() => Promise<{ checked: boolean }>>(
          async () => ({
            checked: true,
          })
        );
        const options = {
          model: makeOpenRouterFactory(
            "synthetic-byok-key",
            new ProviderHttp({ request, download })
          )("pro", modelId),
          prompt: "Check once, then finish.",
          tools: { check: tool({ inputSchema: z.object({}), execute }) },
          stopWhen: stepCountIs(2),
          maxRetries: 0,
        };
        const result = streaming
          ? streamText(options)
          : await generateText(options);
        expect(await result.text).toBe("checked");
        expect(execute).toHaveBeenCalledTimes(1);
        expect(bodies).toHaveLength(2);
        expect(bodies.every((body) => body.model === modelId)).toBe(true);
        expect(bodies[0].tools[0].function.name).toBe("check");
        expect(bodies[0].stream_options?.include_usage).toBe(
          streaming ? true : undefined
        );
        const assistant = bodies[1].messages.find(
          (message) => message.role === "assistant"
        );
        expect(assistant?.reasoning_details).toEqual(details);
        expect(assistant?.tool_calls).toEqual([TOOL_CALL]);
        expect(bodies[1].messages.at(-1)).toMatchObject({
          role: "tool",
          tool_call_id: TOOL_CALL.id,
          content: '{"checked":true}',
        });
        expect(
          (await result.totalUsage).outputTokenDetails.reasoningTokens
        ).toBe(10);
        expect(download).not.toHaveBeenCalled();
      }
    );

    it("keeps structured output and image input on the normalized wire", async () => {
      let body: ChatBody | undefined;
      const request = vi.fn<typeof fetch>(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return Response.json(
          completion(modelId, {
            role: "assistant",
            content: '{"answer":"one pixel"}',
          })
        );
      });
      const pixel =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2WZcAAAAASUVORK5CYII=";
      const download = vi.fn<typeof fetch>();
      const result = await generateText({
        model: makeOpenRouterFactory(
          "synthetic-byok-key",
          new ProviderHttp({ request, download })
        )("pro", modelId),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this image." },
              { type: "image", image: pixel, mediaType: "image/png" },
            ],
          },
        ],
        output: Output.object({ schema: z.object({ answer: z.string() }) }),
        maxRetries: 0,
      });
      expect(result.output).toEqual({ answer: "one pixel" });
      expect(body?.model).toBe(modelId);
      expect(body?.response_format).toMatchObject({
        type: "json_schema",
        json_schema: { schema: { required: ["answer"] }, strict: true },
      });
      expect(body?.messages[0].content).toEqual([
        { type: "text", text: "Describe this image." },
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${pixel}` },
        },
      ]);
      expect(request).toHaveBeenCalledTimes(1);
      expect(download).not.toHaveBeenCalled();
    });
  });
});
