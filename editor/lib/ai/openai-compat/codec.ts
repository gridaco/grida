// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * OpenAI chat-completions wire ⇄ AI SDK LanguageModelV3 codec.
 *
 * Deliberately at the **LanguageModelV3** level (`doGenerate`/`doStream`
 * call options and stream parts), not `streamText`: this is the exact
 * mirror image of what `@ai-sdk/openai-compatible` does client-side, so
 * tool definitions pass through unvalidated, tool-argument text streams
 * byte-for-byte, and the billing middleware baked into the seam's model
 * objects (gate pre-upstream, ingest on finish — `lib/ai/server.ts`)
 * applies with zero route-side billing code.
 *
 * Wire-fidelity notes pinned by the client's own dist:
 * - PROMPT-side tool-call `input` is a parsed object (the client
 *   `JSON.stringify`s it when re-encoding history); RESPONSE-side
 *   `LanguageModelV3ToolCall.input` is already the raw arguments
 *   string — decode parses, encode passes through verbatim.
 * - OpenAI `tool` messages carry no tool name; V3 `tool-result` parts
 *   require one — reconstructed from prior assistant `tool_calls`;
 *   an unresolvable `tool_call_id` is a 400.
 * - The client's chunk parser requires the FIRST `tool_calls` delta of
 *   an index to carry `id` + `function.name`, accumulates argument
 *   deltas, and completes a call as soon as the accumulated string
 *   parses as JSON (flush covers the remainder).
 *
 * Pure codec — no IO, no billing, no auth. Pinned by `codec.test.ts`
 * and driven end-to-end by the route contract tests with
 * `@ai-sdk/openai-compatible` as the client.
 */
import type {
  JSONSchema7,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3FunctionTool,
  LanguageModelV3GenerateResult,
  LanguageModelV3Message,
  LanguageModelV3StreamPart,
  LanguageModelV3ToolChoice,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  WireFinishReason,
  WireResponseToolCall,
  WireUsage,
} from "./wire";

/** Request-shape failure the routes map to an OpenAI 400 envelope. */
export class WireDecodeError extends Error {}

export type DecodedChatRequest = {
  callOptions: Omit<LanguageModelV3CallOptions, "providerOptions">;
  stream: boolean;
  includeUsage: boolean;
};

// ---------------------------------------------------------------------------
// Decode: OpenAI request → V3 call options
// ---------------------------------------------------------------------------

export function decodeRequest(req: ChatCompletionRequest): DecodedChatRequest {
  const prompt = decodeMessages(req.messages);

  const tools = req.tools?.map(
    (tool): LanguageModelV3FunctionTool => ({
      type: "function",
      name: tool.function.name,
      description: tool.function.description ?? undefined,
      // Passthrough, unvalidated — the JSON Schema body is the model's
      // contract with the caller, not ours.
      inputSchema: (tool.function.parameters ?? {}) as JSONSchema7,
    })
  );

  let toolChoice: LanguageModelV3ToolChoice | undefined;
  if (req.tool_choice != null) {
    if (typeof req.tool_choice === "string") {
      toolChoice = { type: req.tool_choice };
    } else {
      toolChoice = { type: "tool", toolName: req.tool_choice.function.name };
    }
  }

  let responseFormat: LanguageModelV3CallOptions["responseFormat"];
  if (req.response_format?.type === "json_object") {
    responseFormat = { type: "json" };
  } else if (req.response_format?.type === "json_schema") {
    responseFormat = {
      type: "json",
      schema: (req.response_format.json_schema.schema ?? undefined) as
        | JSONSchema7
        | undefined,
      name: req.response_format.json_schema.name ?? undefined,
      description: req.response_format.json_schema.description ?? undefined,
    };
  } else if (req.response_format?.type === "text") {
    responseFormat = { type: "text" };
  }

  return {
    callOptions: {
      prompt,
      maxOutputTokens: req.max_completion_tokens ?? req.max_tokens ?? undefined,
      temperature: req.temperature ?? undefined,
      topP: req.top_p ?? undefined,
      frequencyPenalty: req.frequency_penalty ?? undefined,
      presencePenalty: req.presence_penalty ?? undefined,
      stopSequences:
        req.stop == null
          ? undefined
          : Array.isArray(req.stop)
            ? req.stop
            : [req.stop],
      seed: req.seed ?? undefined,
      responseFormat,
      tools,
      toolChoice,
    },
    stream: req.stream === true,
    includeUsage: req.stream_options?.include_usage === true,
  };
}

function decodeMessages(
  messages: ChatCompletionRequest["messages"]
): LanguageModelV3Message[] {
  // OpenAI `tool` messages carry no tool name — reconstruct from the
  // assistant turns seen so far.
  const toolNameById = new Map<string, string>();
  const prompt: LanguageModelV3Message[] = [];

  for (const message of messages) {
    switch (message.role) {
      case "system": {
        prompt.push({ role: "system", content: message.content });
        break;
      }
      case "user": {
        prompt.push({
          role: "user",
          content: decodeUserContent(message.content),
        });
        break;
      }
      case "assistant": {
        const content: Extract<
          LanguageModelV3Message,
          { role: "assistant" }
        >["content"] = [];
        if (message.reasoning_content) {
          content.push({ type: "reasoning", text: message.reasoning_content });
        }
        if (message.content) {
          content.push({ type: "text", text: message.content });
        }
        for (const call of message.tool_calls ?? []) {
          toolNameById.set(call.id, call.function.name);
          content.push({
            type: "tool-call",
            toolCallId: call.id,
            toolName: call.function.name,
            input: parseToolArguments(call.function.arguments),
          });
        }
        prompt.push({ role: "assistant", content });
        break;
      }
      case "tool": {
        const toolName = toolNameById.get(message.tool_call_id);
        if (!toolName) {
          throw new WireDecodeError(
            `tool message references unknown tool_call_id "${message.tool_call_id}"`
          );
        }
        prompt.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: message.tool_call_id,
              toolName,
              output: { type: "text", value: message.content },
            },
          ],
        });
        break;
      }
    }
  }
  return prompt;
}

function decodeUserContent(
  content: string | Array<{ type: string } & Record<string, unknown>>
): Extract<LanguageModelV3Message, { role: "user" }>["content"] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content.map((part) => {
    switch (part.type) {
      case "text":
        return { type: "text" as const, text: part.text as string };
      case "image_url": {
        const url = (part.image_url as { url: string }).url;
        return decodeImageUrl(url);
      }
      default:
        throw new WireDecodeError(
          `unsupported content part type "${part.type}"`
        );
    }
  });
}

const DATA_URL = /^data:([^;,]+);base64,([\s\S]*)$/;

function decodeImageUrl(url: string): {
  type: "file";
  data: string | URL;
  mediaType: string;
} {
  const dataMatch = DATA_URL.exec(url);
  if (dataMatch) {
    return {
      type: "file",
      mediaType: dataMatch[1]!,
      data: dataMatch[2]!,
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new WireDecodeError("image_url must be a data: URL or absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new WireDecodeError("image_url must use http(s) or data:");
  }
  return { type: "file", mediaType: "image/*", data: parsed };
}

/**
 * History tool-call arguments arrive as a JSON string; the V3
 * PROMPT-side part wants the parsed value (providers re-stringify it).
 * An unparseable string is passed through as-is rather than crashing —
 * degraded fidelity beats a hard failure on a forwardable value.
 */
function parseToolArguments(args: string): unknown {
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
}

// ---------------------------------------------------------------------------
// Encode: V3 results → OpenAI wire
// ---------------------------------------------------------------------------

export function encodeUsage(usage: LanguageModelV3Usage): WireUsage {
  const prompt = usage.inputTokens.total ?? 0;
  const completion = usage.outputTokens.total ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    prompt_tokens_details: { cached_tokens: usage.inputTokens.cacheRead ?? 0 },
    completion_tokens_details: {
      reasoning_tokens: usage.outputTokens.reasoning ?? 0,
    },
  };
}

export function encodeFinishReason(
  reason: LanguageModelV3FinishReason
): WireFinishReason {
  switch (reason.unified) {
    case "length":
      return "length";
    case "content-filter":
      return "content_filter";
    case "tool-calls":
      return "tool_calls";
    case "stop":
    case "error":
    case "other":
      return "stop";
  }
}

export function encodeCompletion(
  modelId: string,
  result: LanguageModelV3GenerateResult
): ChatCompletionResponse {
  let text = "";
  let reasoning = "";
  const toolCalls: WireResponseToolCall[] = [];

  for (const part of result.content) {
    switch (part.type) {
      case "text":
        text += part.text;
        break;
      case "reasoning":
        reasoning += part.text;
        break;
      case "tool-call":
        // RESPONSE-side V3 `input` is already the raw arguments string.
        toolCalls.push({
          id: part.toolCallId,
          type: "function",
          function: { name: part.toolName, arguments: part.input },
        });
        break;
      default:
        break; // files/sources/provider-tool parts have no wire slot
    }
  }

  return {
    id: chunkId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: toolCalls.length > 0 ? text || null : text,
          ...(reasoning ? { reasoning_content: reasoning } : {}),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: encodeFinishReason(result.finishReason),
      },
    ],
    usage: encodeUsage(result.usage),
  };
}

// ---------------------------------------------------------------------------
// Stream encode: V3 parts → OpenAI SSE
// ---------------------------------------------------------------------------

function chunkId(): string {
  return `chatcmpl-${crypto.randomUUID()}`;
}

/**
 * Encodes the V3 stream as OpenAI SSE. Frames:
 * - content chunks (`role` on the first content-bearing delta),
 * - `tool_calls` deltas (`index`-keyed; first frame per call carries
 *   `id` + `function.name`, per the client parser's hard requirement),
 * - a `finish_reason` chunk, then — iff requested — a `choices: []`
 *   usage chunk, then `data: [DONE]`.
 * - a V3 `error` part becomes an OpenAI error frame (sanitized) and the
 *   stream closes WITHOUT `[DONE]` — the client surfaces a stream error.
 */
export function streamEncoder(
  modelId: string,
  opts: { includeUsage: boolean }
): TransformStream<LanguageModelV3StreamPart, Uint8Array> {
  const textEncoder = new TextEncoder();
  const id = chunkId();
  const created = Math.floor(Date.now() / 1000);

  let sentRole = false;
  let errored = false;
  let finish: {
    reason: LanguageModelV3FinishReason;
    usage: LanguageModelV3Usage;
  } | null = null;
  const toolIndexById = new Map<string, number>();

  function frame(payload: unknown): Uint8Array {
    return textEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  }

  function contentChunk(
    delta: ChatCompletionChunk["choices"][0]["delta"]
  ): ChatCompletionChunk {
    if (!sentRole) {
      sentRole = true;
      delta = { role: "assistant", ...delta };
    }
    return {
      id,
      object: "chat.completion.chunk",
      created,
      model: modelId,
      choices: [{ index: 0, delta }],
    };
  }

  return new TransformStream<LanguageModelV3StreamPart, Uint8Array>({
    transform(part, controller) {
      if (errored) return;
      switch (part.type) {
        case "text-delta":
          controller.enqueue(frame(contentChunk({ content: part.delta })));
          break;
        case "reasoning-delta":
          controller.enqueue(
            frame(contentChunk({ reasoning_content: part.delta }))
          );
          break;
        case "tool-input-start": {
          const index = toolIndexById.size;
          toolIndexById.set(part.id, index);
          controller.enqueue(
            frame(
              contentChunk({
                tool_calls: [
                  {
                    index,
                    id: part.id,
                    type: "function",
                    function: { name: part.toolName, arguments: "" },
                  },
                ],
              })
            )
          );
          break;
        }
        case "tool-input-delta": {
          const index = toolIndexById.get(part.id);
          if (index === undefined) break;
          controller.enqueue(
            frame(
              contentChunk({
                tool_calls: [{ index, function: { arguments: part.delta } }],
              })
            )
          );
          break;
        }
        case "tool-call": {
          // Providers may emit a complete call without input-start/deltas
          // (atomic emission) — encode it as one full frame. Calls that
          // already streamed are complete client-side; skip.
          if (toolIndexById.has(part.toolCallId)) break;
          const index = toolIndexById.size;
          toolIndexById.set(part.toolCallId, index);
          controller.enqueue(
            frame(
              contentChunk({
                tool_calls: [
                  {
                    index,
                    id: part.toolCallId,
                    type: "function",
                    function: {
                      name: part.toolName,
                      arguments: part.input, // raw string, verbatim
                    },
                  },
                ],
              })
            )
          );
          break;
        }
        case "finish":
          finish = { reason: part.finishReason, usage: part.usage };
          break;
        case "error": {
          errored = true;
          // Never leak upstream error detail to the wire.
          console.error(
            `[v1/ai/chat] stream error (model=${modelId}):`,
            part.error
          );
          controller.enqueue(
            frame({
              error: {
                message: "The model stream ended with an error.",
                type: "server_error",
                code: "stream_error",
              },
            })
          );
          break;
        }
        default:
          break; // stream-start / *-start / *-end / metadata / raw / files
      }
    },
    flush(controller) {
      if (errored) return; // no [DONE] after an error frame
      if (finish) {
        controller.enqueue(
          frame({
            id,
            object: "chat.completion.chunk",
            created,
            model: modelId,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: encodeFinishReason(finish.reason),
              },
            ],
          } satisfies ChatCompletionChunk)
        );
        if (opts.includeUsage) {
          controller.enqueue(
            frame({
              id,
              object: "chat.completion.chunk",
              created,
              model: modelId,
              choices: [],
              usage: encodeUsage(finish.usage),
            })
          );
        }
      }
      controller.enqueue(textEncoder.encode("data: [DONE]\n\n"));
    },
  });
}
