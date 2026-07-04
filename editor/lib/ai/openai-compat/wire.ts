// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * OpenAI chat-completions WIRE contract — hand-written types + request
 * schema for the hosted `/api/v1/ai/chat/completions` endpoint.
 *
 * This file is the contract, not a vendor mirror: no `openai` SDK
 * import. The shapes are pinned by what our own consumer sends and
 * parses — `@ai-sdk/openai-compatible` (the desktop sidecar's client),
 * whose zod schemas the contract tests drive end-to-end. Tolerant
 * reader: unknown fields are ignored (`looseObject`), unsupported parts
 * are rejected explicitly in the codec with a 400.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

const textPartSchema = z.looseObject({
  type: z.literal("text"),
  text: z.string(),
});

const imagePartSchema = z.looseObject({
  type: z.literal("image_url"),
  image_url: z.looseObject({ url: z.string() }),
});

/** Recognized but unsupported in v1 — the codec rejects with a 400. */
const unsupportedPartSchema = z.looseObject({
  type: z.enum(["input_audio", "file"]),
});

const userContentPartSchema = z.union([
  textPartSchema,
  imagePartSchema,
  unsupportedPartSchema,
]);

const wireToolCallSchema = z.looseObject({
  id: z.string(),
  type: z.literal("function").nullish(),
  function: z.looseObject({
    name: z.string(),
    arguments: z.string(),
  }),
});

const messageSchema = z.union([
  z.looseObject({
    role: z.literal("system"),
    content: z.string(),
  }),
  z.looseObject({
    role: z.literal("user"),
    content: z.union([z.string(), z.array(userContentPartSchema)]),
  }),
  z.looseObject({
    role: z.literal("assistant"),
    content: z.string().nullish(),
    reasoning_content: z.string().nullish(),
    tool_calls: z.array(wireToolCallSchema).nullish(),
  }),
  z.looseObject({
    role: z.literal("tool"),
    tool_call_id: z.string(),
    content: z.string(),
  }),
]);

export const chatCompletionRequestSchema = z.looseObject({
  model: z.string(),
  messages: z.array(messageSchema).min(1),
  tools: z
    .array(
      z.looseObject({
        type: z.literal("function"),
        function: z.looseObject({
          name: z.string(),
          description: z.string().nullish(),
          parameters: z.record(z.string(), z.unknown()).nullish(),
        }),
      })
    )
    .nullish(),
  tool_choice: z
    .union([
      z.enum(["auto", "none", "required"]),
      z.looseObject({
        type: z.literal("function"),
        function: z.looseObject({ name: z.string() }),
      }),
    ])
    .nullish(),
  max_tokens: z.number().int().positive().nullish(),
  max_completion_tokens: z.number().int().positive().nullish(),
  temperature: z.number().nullish(),
  top_p: z.number().nullish(),
  frequency_penalty: z.number().nullish(),
  presence_penalty: z.number().nullish(),
  stop: z.union([z.string(), z.array(z.string())]).nullish(),
  seed: z.number().int().nullish(),
  response_format: z
    .union([
      z.looseObject({ type: z.literal("text") }),
      z.looseObject({ type: z.literal("json_object") }),
      z.looseObject({
        type: z.literal("json_schema"),
        json_schema: z.looseObject({
          name: z.string().nullish(),
          description: z.string().nullish(),
          schema: z.record(z.string(), z.unknown()).nullish(),
        }),
      }),
    ])
    .nullish(),
  stream: z.boolean().nullish(),
  stream_options: z
    .looseObject({ include_usage: z.boolean().nullish() })
    .nullish(),
});

export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;
export type WireMessage = z.infer<typeof messageSchema>;

// ---------------------------------------------------------------------------
// Response (what we emit — mirrors what the openai-compatible client parses)
// ---------------------------------------------------------------------------

export type WireUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details: { cached_tokens: number };
  completion_tokens_details: { reasoning_tokens: number };
};

export type WireResponseToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatCompletionResponse = {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: 0;
    message: {
      role: "assistant";
      content: string | null;
      reasoning_content?: string;
      tool_calls?: WireResponseToolCall[];
    };
    finish_reason: WireFinishReason;
  }>;
  usage: WireUsage;
};

export type WireFinishReason =
  | "stop"
  | "length"
  | "content_filter"
  | "tool_calls";

export type ChatCompletionChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: 0;
    delta: {
      role?: "assistant";
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: WireFinishReason | null;
  }>;
  usage?: WireUsage;
};

/** Trailing usage-only chunk (only when `stream_options.include_usage`). */
export type ChatCompletionUsageChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: [];
  usage: WireUsage;
};
