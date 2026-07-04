// GRIDA-SEC-006 — see /SECURITY.md
/**
 * OpenAI-wire ⇄ LanguageModelV3 codec.
 *
 * Pins the pure translation: message decode (incl. tool-name
 * reconstruction and the parse-on-decode / verbatim-on-encode
 * tool-argument asymmetry), tool/tool_choice/response_format mapping,
 * the SSE chunk grammar the `@ai-sdk/openai-compatible` parser
 * requires (first tool_calls frame carries id+name; usage chunk only
 * when requested; error frame closes without `[DONE]`).
 */
import { describe, it, expect } from "vitest";
import type {
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import {
  WireDecodeError,
  decodeRequest,
  encodeCompletion,
  encodeFinishReason,
  encodeUsage,
  streamEncoder,
} from "./codec";
import type { ChatCompletionRequest } from "./wire";

const USAGE: LanguageModelV3Usage = {
  inputTokens: {
    total: 100,
    noCache: 90,
    cacheRead: 10,
    cacheWrite: undefined,
  },
  outputTokens: { total: 20, text: 15, reasoning: 5 },
};

function request(
  partial: Partial<ChatCompletionRequest>
): ChatCompletionRequest {
  return {
    model: "vendor/model",
    messages: [{ role: "user", content: "hi" }],
    ...partial,
  } as ChatCompletionRequest;
}

describe("decodeRequest", () => {
  it("decodes the full message roundtrip incl. tool-name reconstruction", () => {
    const { callOptions } = decodeRequest(
      request({
        messages: [
          { role: "system", content: "be helpful" },
          { role: "user", content: "weather?" },
          {
            role: "assistant",
            content: "checking",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"city":"Seoul"}',
                },
              },
            ],
          },
          { role: "tool", tool_call_id: "call_1", content: "sunny" },
        ],
      })
    );
    expect(callOptions.prompt).toEqual([
      { role: "system", content: "be helpful" },
      { role: "user", content: [{ type: "text", text: "weather?" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "checking" },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "get_weather",
            input: { city: "Seoul" }, // parsed on decode (prompt side)
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "get_weather", // reconstructed
            output: { type: "text", value: "sunny" },
          },
        ],
      },
    ]);
  });

  it("rejects a tool message with an unknown tool_call_id", () => {
    expect(() =>
      decodeRequest(
        request({
          messages: [{ role: "tool", tool_call_id: "ghost", content: "x" }],
        })
      )
    ).toThrow(WireDecodeError);
  });

  it("keeps malformed history tool arguments as a raw string", () => {
    const { callOptions } = decodeRequest(
      request({
        messages: [
          {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "c1", function: { name: "t", arguments: "not-json{" } },
            ],
          },
        ],
      })
    );
    const assistant = callOptions.prompt[0] as {
      content: Array<{ type: string; input?: unknown }>;
    };
    expect(assistant.content[0]!.input).toBe("not-json{");
  });

  it("decodes image parts: data URL → base64 file, http URL → URL", () => {
    const { callOptions } = decodeRequest(
      request({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "look" },
              {
                type: "image_url",
                image_url: { url: "data:image/png;base64,QUJD" },
              },
              {
                type: "image_url",
                image_url: { url: "https://grida.test/a.png" },
              },
            ],
          },
        ],
      })
    );
    const user = callOptions.prompt[0] as { content: unknown[] };
    expect(user.content[1]).toEqual({
      type: "file",
      mediaType: "image/png",
      data: "QUJD",
    });
    expect(user.content[2]).toEqual({
      type: "file",
      mediaType: "image/*",
      data: new URL("https://grida.test/a.png"),
    });
  });

  it("rejects unsupported content parts", () => {
    expect(() =>
      decodeRequest(
        request({
          messages: [
            {
              role: "user",
              content: [{ type: "input_audio" } as never],
            },
          ],
        })
      )
    ).toThrow(WireDecodeError);
  });

  it("passes tool definitions through unvalidated and maps tool_choice", () => {
    const parameters = {
      type: "object",
      properties: { q: { madeUpKeyword: true } },
    };
    const { callOptions } = decodeRequest(
      request({
        tools: [
          {
            type: "function",
            function: { name: "search", description: "d", parameters },
          },
        ],
        tool_choice: { type: "function", function: { name: "search" } },
      })
    );
    expect(callOptions.tools).toEqual([
      {
        type: "function",
        name: "search",
        description: "d",
        inputSchema: parameters, // verbatim
      },
    ]);
    expect(callOptions.toolChoice).toEqual({
      type: "tool",
      toolName: "search",
    });
    expect(
      decodeRequest(request({ tool_choice: "required" })).callOptions.toolChoice
    ).toEqual({ type: "required" });
  });

  it("maps response_format and sampling params", () => {
    const decoded = decodeRequest(
      request({
        response_format: {
          type: "json_schema",
          json_schema: { name: "out", schema: { type: "object" } },
        },
        max_tokens: 100,
        max_completion_tokens: 200,
        stop: "END",
        temperature: 0.5,
        seed: 42,
      })
    );
    expect(decoded.callOptions.responseFormat).toEqual({
      type: "json",
      schema: { type: "object" },
      name: "out",
      description: undefined,
    });
    expect(decoded.callOptions.maxOutputTokens).toBe(200); // prefer max_completion_tokens
    expect(decoded.callOptions.stopSequences).toEqual(["END"]);
    expect(decoded.callOptions.temperature).toBe(0.5);
    expect(decoded.callOptions.seed).toBe(42);
    expect(
      decodeRequest(request({ response_format: { type: "json_object" } }))
        .callOptions.responseFormat
    ).toEqual({ type: "json" });
  });

  it("reads stream flags", () => {
    const d = decodeRequest(
      request({ stream: true, stream_options: { include_usage: true } })
    );
    expect(d.stream).toBe(true);
    expect(d.includeUsage).toBe(true);
    expect(decodeRequest(request({})).stream).toBe(false);
  });
});

describe("encodeCompletion / encodeUsage / encodeFinishReason", () => {
  it("encodes content, reasoning, and verbatim tool arguments", () => {
    const res = encodeCompletion("vendor/model", {
      content: [
        { type: "reasoning", text: "thinking" },
        { type: "text", text: "done" },
        {
          type: "tool-call",
          toolCallId: "call_9",
          toolName: "t",
          input: '{"x":1}', // response side: already a string — verbatim
        },
      ],
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage: USAGE,
      warnings: [],
    });
    const message = res.choices[0]!.message;
    expect(message.content).toBe("done");
    expect(message.reasoning_content).toBe("thinking");
    expect(message.tool_calls).toEqual([
      {
        id: "call_9",
        type: "function",
        function: { name: "t", arguments: '{"x":1}' },
      },
    ]);
    expect(res.choices[0]!.finish_reason).toBe("tool_calls");
    expect(res.usage).toEqual({
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      prompt_tokens_details: { cached_tokens: 10 },
      completion_tokens_details: { reasoning_tokens: 5 },
    });
  });

  it("nulls content when only tool calls are present", () => {
    const res = encodeCompletion("m", {
      content: [
        { type: "tool-call", toolCallId: "c", toolName: "t", input: "{}" },
      ],
      finishReason: { unified: "tool-calls", raw: undefined },
      usage: USAGE,
      warnings: [],
    });
    expect(res.choices[0]!.message.content).toBeNull();
  });

  it("maps finish reasons", () => {
    expect(encodeFinishReason({ unified: "stop", raw: undefined })).toBe(
      "stop"
    );
    expect(encodeFinishReason({ unified: "length", raw: undefined })).toBe(
      "length"
    );
    expect(
      encodeFinishReason({ unified: "content-filter", raw: undefined })
    ).toBe("content_filter");
    expect(encodeFinishReason({ unified: "error", raw: undefined })).toBe(
      "stop"
    );
    expect(encodeUsage(USAGE).total_tokens).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// Stream encoder
// ---------------------------------------------------------------------------

async function encodeStream(
  parts: LanguageModelV3StreamPart[],
  includeUsage = true
): Promise<{ frames: unknown[]; done: boolean; raw: string }> {
  const source = new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
  const reader = source
    .pipeThrough(streamEncoder("vendor/model", { includeUsage }))
    .getReader();
  const decoder = new TextDecoder();
  let raw = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value);
  }
  const payloads = raw
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length));
  const done = payloads.at(-1) === "[DONE]";
  const frames = (done ? payloads.slice(0, -1) : payloads).map((p) =>
    JSON.parse(p)
  );
  return { frames, done, raw };
}

const FINISH: LanguageModelV3StreamPart = {
  type: "finish",
  finishReason: { unified: "stop", raw: "stop" },
  usage: USAGE,
};

describe("streamEncoder", () => {
  it("emits role once, then text deltas, finish, usage, [DONE]", async () => {
    const { frames, done } = await encodeStream([
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t0" },
      { type: "text-delta", id: "t0", delta: "Hel" },
      { type: "text-delta", id: "t0", delta: "lo" },
      { type: "text-end", id: "t0" },
      FINISH,
    ]);
    expect(done).toBe(true);
    const [first, second, finishFrame, usageFrame] = frames as Array<{
      choices: Array<{
        delta?: Record<string, unknown>;
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens: number };
    }>;
    expect(first!.choices[0]!.delta).toEqual({
      role: "assistant",
      content: "Hel",
    });
    expect(second!.choices[0]!.delta).toEqual({ content: "lo" });
    expect(finishFrame!.choices[0]!.finish_reason).toBe("stop");
    expect(usageFrame!.choices).toEqual([]);
    expect(usageFrame!.usage!.prompt_tokens).toBe(100);
  });

  it("omits the usage chunk when include_usage is off", async () => {
    const { frames } = await encodeStream(
      [{ type: "text-delta", id: "t", delta: "x" }, FINISH],
      false
    );
    expect(
      frames.some((f) => (f as { usage?: unknown }).usage !== undefined)
    ).toBe(false);
  });

  it("encodes streamed tool calls with id+name on the first frame", async () => {
    const { frames } = await encodeStream([
      { type: "tool-input-start", id: "call_1", toolName: "get_weather" },
      { type: "tool-input-delta", id: "call_1", delta: '{"city":' },
      { type: "tool-input-delta", id: "call_1", delta: '"Seoul"}' },
      { type: "tool-input-end", id: "call_1" },
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "get_weather",
        input: '{"city":"Seoul"}',
      },
      {
        type: "finish",
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage: USAGE,
      },
    ]);
    const toolFrames = (
      frames as Array<{
        choices: Array<{ delta?: { tool_calls?: unknown[] } }>;
      }>
    ).filter((f) => f.choices?.[0]?.delta?.tool_calls);
    // start + 2 deltas; the complete tool-call part is a no-op (already streamed)
    expect(toolFrames).toHaveLength(3);
    expect(toolFrames[0]!.choices[0]!.delta!.tool_calls![0]).toMatchObject({
      index: 0,
      id: "call_1",
      function: { name: "get_weather", arguments: "" },
    });
    expect(toolFrames[1]!.choices[0]!.delta!.tool_calls![0]).toMatchObject({
      index: 0,
      function: { arguments: '{"city":' },
    });
  });

  it("encodes an atomic tool-call as one full frame", async () => {
    const { frames } = await encodeStream([
      {
        type: "tool-call",
        toolCallId: "call_2",
        toolName: "t",
        input: '{"a":1}',
      },
      FINISH,
    ]);
    const toolFrame = (
      frames as Array<{
        choices: Array<{
          delta?: { tool_calls?: Array<Record<string, unknown>> };
        }>;
      }>
    ).find((f) => f.choices?.[0]?.delta?.tool_calls);
    expect(toolFrame!.choices[0]!.delta!.tool_calls![0]).toMatchObject({
      index: 0,
      id: "call_2",
      function: { name: "t", arguments: '{"a":1}' },
    });
  });

  it("maps reasoning deltas to reasoning_content", async () => {
    const { frames } = await encodeStream([
      { type: "reasoning-delta", id: "r", delta: "hmm" },
      FINISH,
    ]);
    expect(
      (frames[0] as { choices: Array<{ delta: Record<string, unknown> }> })
        .choices[0]!.delta.reasoning_content
    ).toBe("hmm");
  });

  it("sanitizes stream errors and closes without [DONE]", async () => {
    const { frames, done, raw } = await encodeStream([
      { type: "text-delta", id: "t", delta: "partial" },
      {
        type: "error",
        error: new Error("secret: METRONOME_API_TOKEN missing"),
      },
    ]);
    expect(done).toBe(false);
    const errorFrame = frames.at(-1) as {
      error?: { code: string; message: string };
    };
    expect(errorFrame.error!.code).toBe("stream_error");
    expect(raw).not.toContain("METRONOME");
  });
});
