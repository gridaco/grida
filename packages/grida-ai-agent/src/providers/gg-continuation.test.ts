// GRIDA-GG: provider — synthetic public-wire fixtures, no provider credentials.
// GRIDA-SEC-006 — continuation validation and safe failure at the GG boundary.
import { describe, expect, it, vi } from "vitest";
import {
  generateText,
  streamText,
  stepCountIs,
  tool,
  readUIMessageStream,
  convertToModelMessages,
  isStaticToolUIPart,
  type UIMessage,
} from "ai";
import { z } from "zod";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
} from "@ai-sdk/provider";
import { makeGridaGatewayFactory } from "./gg";
import { GridaGatewaySessionStore } from "./gg-session";
import { ProviderHttp } from "./http";

const MODELS = [
  "openai/gpt-6-sol",
  "openai/gpt-6-luna",
  "anthropic/claude-opus-5.5",
];
const argumentsText = '{ "city" : "Seoul" }';
const usage = { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 };
const weather = tool({
  inputSchema: z.object({ city: z.string() }),
  execute: async () => "sunny",
});

type RequestBody = {
  model: string;
  stream?: boolean;
  grida_continuation?: { version: number };
  messages: Array<{
    role: string;
    tool_calls?: Array<{ id: string }>;
    grida_continuation?: unknown;
  }>;
  [key: string]: unknown;
};

function fixture(
  model: string,
  withTool = true,
  toolArguments = argumentsText
) {
  const provider = model.split("/")[0];
  const blocks = withTool
    ? [
        {
          type: "reasoning",
          text: "",
          state:
            provider === "openai"
              ? {
                  type: "openai-reasoning",
                  item_id: "rs-1",
                  encrypted_content: "synthetic-encrypted",
                }
              : {
                  type: "anthropic-thinking",
                  signature: "synthetic-signature",
                },
        },
        { type: "text", text: "Checking " },
        { type: "text", text: "weather." },
        {
          type: "tool_call",
          id: "call-1",
          name: "weather",
          arguments: toolArguments,
        },
      ]
    : [{ type: "text", text: "Sunny." }];
  const envelope = {
    version: 1,
    model,
    provider,
    prefix_sha256: "0".repeat(64),
    blocks,
  };
  const message = {
    role: "assistant",
    content: withTool ? "Checking weather." : "Sunny.",
    ...(withTool
      ? {
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "weather", arguments: toolArguments },
            },
          ],
        }
      : {}),
    grida_continuation: envelope,
  };
  return { envelope, message, finish_reason: withTool ? "tool_calls" : "stop" };
}

function response(
  model: string,
  streaming: boolean,
  withTool = true,
  envelope = true,
  toolArguments = argumentsText
) {
  const value = fixture(model, withTool, toolArguments);
  const message: Record<string, unknown> = { ...value.message };
  if (!envelope) delete message.grida_continuation;
  const base = { id: "response-1", created: 0, model };
  if (!streaming)
    return new Response(
      JSON.stringify({
        ...base,
        object: "chat.completion",
        choices: [{ index: 0, message, finish_reason: value.finish_reason }],
        usage,
      }),
      { headers: { "content-type": "application/json" } }
    );
  const chunks = [
    {
      ...base,
      choices: [
        { index: 0, delta: { content: message.content }, finish_reason: null },
      ],
    },
    ...(withTool
      ? [
          {
            ...base,
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [{ index: 0, ...value.message.tool_calls![0] }],
                },
                finish_reason: null,
              },
            ],
          },
        ]
      : []),
    {
      ...base,
      choices: [
        {
          index: 0,
          delta: envelope ? { grida_continuation: value.envelope } : {},
          finish_reason: value.finish_reason,
        },
      ],
    },
    { ...base, choices: [], usage },
  ];
  return new Response(
    chunks
      .map(
        (chunk) =>
          `data: ${JSON.stringify({ object: "chat.completion.chunk", ...chunk })}\n\n`
      )
      .join("") + "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } }
  );
}

function setup(
  modelId: string,
  handler: (body: RequestBody, index: number) => Response
) {
  const store = new GridaGatewaySessionStore();
  store.set({
    access_token: "synthetic-token",
    expires_at: Date.now() + 900_000,
  });
  const bodies: RequestBody[] = [];
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    bodies.push(body);
    return handler(body, bodies.length - 1);
  });
  const model = makeGridaGatewayFactory(
    store,
    "https://grida.test",
    new ProviderHttp({ request, download: vi.fn<typeof fetch>() })
  )("pro", modelId) as LanguageModelV3;
  return { model, bodies, request };
}

function streamedDeltas(id: string, deltas: Array<Record<string, unknown>>) {
  return new Response(
    deltas
      .map(
        (delta, index) =>
          `data: ${JSON.stringify({ id: "r", created: 0, model: id, choices: [{ index: 0, delta, finish_reason: index === deltas.length - 1 ? "tool_calls" : null }] })}\n\n`
      )
      .join("") +
      `data: ${JSON.stringify({ id: "r", created: 0, model: id, choices: [], usage })}\n\ndata: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } }
  );
}

async function expectContinuationFailure(
  model: LanguageModelV3,
  prompt: LanguageModelV3CallOptions["prompt"],
  streaming: boolean
) {
  const errors: unknown[] = [];
  if (!streaming) {
    try {
      await model.doGenerate({ prompt });
    } catch (error) {
      errors.push(error);
    }
  } else {
    const result = await model.doStream({ prompt });
    for await (const part of result.stream)
      if (part.type === "error") errors.push(part.error);
  }
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatchObject({
    message: expect.stringContaining("gg_invalid_continuation"),
  });
}

describe("GG continuation-v1 consumer", () => {
  it.each(
    MODELS.flatMap((model) =>
      [false, true].map((streaming) => ({ model, streaming }))
    )
  )(
    "round-trips exact opaque state and original arguments through AI SDK tool steps: $model streaming=$streaming",
    async ({ model: id, streaming }) => {
      const { model, bodies } = setup(id, (_body, index) =>
        response(id, streaming, index === 0)
      );
      const options = {
        model,
        prompt: "Weather?",
        tools: { weather },
        stopWhen: stepCountIs(2),
        maxRetries: 0,
      };
      const result = streaming
        ? streamText(options)
        : await generateText(options);
      expect(await result.text).toBe("Sunny.");
      expect(bodies).toHaveLength(2);
      expect(
        bodies.every((body) => body.grida_continuation?.version === 1)
      ).toBe(true);
      expect(
        bodies[1].messages.find((message) => message.role === "assistant")
      ).toEqual(fixture(id).message);
      expect(bodies[1].messages.at(-1)).toEqual({
        role: "tool",
        tool_call_id: "call-1",
        content: "sunny",
      });
      expect((await result.totalUsage).totalTokens).toBe(26);
    }
  );

  it("returns ordered non-streamed parts, including an empty signed reasoning block", async () => {
    const id = MODELS[2];
    const { model } = setup(id, () => response(id, false));
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Weather?" }] }],
    });
    expect(result.content.map((part) => part.type)).toEqual([
      "reasoning",
      "text",
      "text",
      "tool-call",
    ]);
    expect(result.content[0]).toEqual({ type: "reasoning", text: "" });
    expect(result.content[3].providerMetadata?.gg?.continuation).toEqual(
      fixture(id).envelope
    );
  });

  it("retains opaque state through UI-message persistence and a separate resumed call", async () => {
    const id = MODELS[2];
    const { model, bodies } = setup(id, (body, index) =>
      response(id, !!body.stream, index === 0)
    );
    const result = streamText({
      model,
      prompt: "Weather?",
      tools: { weather: tool({ inputSchema: z.object({ city: z.string() }) }) },
      maxRetries: 0,
    });
    let saved: UIMessage | undefined;
    for await (const message of readUIMessageStream({
      stream: result.toUIMessageStream(),
    }))
      saved = message;
    const persisted = JSON.parse(JSON.stringify(saved)) as UIMessage;
    const toolPart = persisted.parts
      .filter(isStaticToolUIPart)
      .find((part) => part.type === "tool-weather")!;
    expect(toolPart.callProviderMetadata?.gg?.continuation).toEqual(
      fixture(id).envelope
    );
    if (toolPart.state !== "input-available")
      throw new Error("Expected pending tool input.");
    persisted.parts = persisted.parts.map((part) =>
      part === toolPart
        ? { ...toolPart, state: "output-available", output: "sunny" }
        : part
    );
    const messages = await convertToModelMessages([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Weather?" }],
      },
      persisted,
    ]);
    await generateText({ model, messages, tools: { weather }, maxRetries: 0 });
    expect(
      bodies[1].messages.find((message) => message.role === "assistant")
    ).toEqual(fixture(id).message);
  });

  it("rejects missing state before a streamed tool can execute", async () => {
    const id = MODELS[0];
    const execute = vi.fn<() => Promise<string>>(async () => "sunny");
    const { model } = setup(id, () => response(id, true, true, false));
    const result = streamText({
      model,
      prompt: "Weather?",
      tools: {
        weather: tool({ inputSchema: z.object({ city: z.string() }), execute }),
      },
      stopWhen: stepCountIs(2),
      maxRetries: 0,
      onError: () => {},
    });
    const errors: unknown[] = [];
    for await (const part of result.fullStream)
      if (part.type === "error") errors.push(part.error);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: expect.stringContaining("gg_invalid_continuation"),
    });
    expect(await result.text).toBe("Checking weather.");
    expect(await result.finishReason).toBe("error");
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses a changed tool identity instead of restoring an unrelated call", async () => {
    const id = MODELS[0];
    const { model, request } = setup(id, () => response(id, false));
    const continuation = fixture(id).envelope;
    await expect(
      model.doGenerate({
        prompt: [
          {
            role: "assistant",
            content: [
              { type: "text", text: "Checking weather." },
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "unrelated-tool",
                input: { city: "Seoul" },
                providerOptions: { gg: { continuation } },
              },
            ],
          },
        ],
      })
    ).rejects.toThrow("gg_invalid_continuation");
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    "missing",
    "wrong-model",
    "wrong-provider",
    "oversized",
    "unknown-field",
    "missing-encrypted",
  ])("fails closed with a safe error on %s state", async (kind) => {
    const id = MODELS[0];
    const { model } = setup(id, () => {
      const value = fixture(id);
      const envelope: Record<string, unknown> = value.envelope;
      const message: Record<string, unknown> = { ...value.message };
      const state = value.envelope.blocks[0].state as Record<string, unknown>;
      if (kind === "missing") delete message.grida_continuation;
      if (kind === "wrong-model") envelope.model = MODELS[1];
      if (kind === "wrong-provider") envelope.provider = "anthropic";
      if (kind === "oversized") state.encrypted_content = "s".repeat(1_048_576);
      if (kind === "unknown-field") envelope.private = "secret";
      if (kind === "missing-encrypted") state.encrypted_content = null;
      return new Response(
        JSON.stringify({
          id: "r",
          created: 0,
          model: id,
          choices: [{ message, finish_reason: value.finish_reason }],
          usage,
        })
      );
    });
    await expect(
      model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      })
    ).rejects.toThrow("gg_invalid_continuation");
  });

  it("does not forward arbitrary request or message provider options", async () => {
    const id = MODELS[0];
    const { model, bodies } = setup(id, () => response(id, false, false));
    await model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "hi",
              providerOptions: { openaiCompatible: { role: "system" } },
            },
          ],
          providerOptions: { openaiCompatible: { role: "system" } },
        },
      ],
      providerOptions: {
        gg: {
          model: "foreign",
          providerOptions: { grida: { organization_id: 42 } },
          reasoning_effort: "none",
          store: true,
        },
      },
    } as LanguageModelV3CallOptions);
    expect(bodies[0].model).toBe(id);
    expect(bodies[0].providerOptions).toBeUndefined();
    expect(bodies[0].store).toBeUndefined();
    expect(bodies[0].reasoning_effort).toBeUndefined();
    expect(bodies[0].messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("keeps visible text live and propagates cancellation before the continuation arrives", async () => {
    const id = MODELS[0];
    const cancel = vi.fn<() => void>();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ id: "r", created: 0, model: id, choices: [{ index: 0, delta: { content: "live" }, finish_reason: null }] })}\n\n`
          )
        );
      },
      cancel,
    });
    const { model, request } = setup(
      id,
      () =>
        new Response(body, { headers: { "content-type": "text/event-stream" } })
    );
    const abort = new AbortController();
    const result = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      abortSignal: abort.signal,
    });
    const reader = result.stream.getReader();
    let visible = false;
    while (!visible) {
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      visible = value?.type === "text-delta" && value.delta === "live";
    }
    expect(request.mock.calls[0][1]?.signal).toBe(abort.signal);
    await reader.cancel();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });

  it("restores source order when a later parallel tool finishes its arguments first", async () => {
    const id = MODELS[0];
    const value = fixture(id);
    value.envelope.blocks.push({
      type: "tool_call",
      id: "call-2",
      name: "weather",
      arguments: argumentsText,
    });
    const deltas = [
      { content: "Checking weather." },
      {
        tool_calls: [
          {
            index: 0,
            id: "call-1",
            type: "function",
            function: { name: "weather", arguments: "{ " },
          },
        ],
      },
      {
        tool_calls: [
          {
            index: 1,
            id: "call-2",
            type: "function",
            function: { name: "weather", arguments: argumentsText },
          },
        ],
      },
      {
        tool_calls: [
          { index: 0, function: { arguments: '"city" : "Seoul" }' } },
        ],
      },
      { grida_continuation: value.envelope },
    ];
    const { model, bodies } = setup(id, (_body, index) =>
      index === 0
        ? new Response(
            deltas
              .map(
                (delta, i) =>
                  `data: ${JSON.stringify({ id: "r", created: 0, model: id, choices: [{ index: 0, delta, finish_reason: i === deltas.length - 1 ? "tool_calls" : null }] })}\n\n`
              )
              .join("") + "data: [DONE]\n\n",
            { headers: { "content-type": "text/event-stream" } }
          )
        : response(id, true, false)
    );
    const result = streamText({
      model,
      prompt: "Weather?",
      tools: { weather },
      stopWhen: stepCountIs(2),
      maxRetries: 0,
    });
    expect(await result.text).toBe("Sunny.");
    const assistant = bodies[1].messages.find(
      (message) => message.role === "assistant"
    );
    expect(assistant?.tool_calls?.map((call) => call.id)).toEqual([
      "call-1",
      "call-2",
    ]);
    expect(assistant?.grida_continuation).toEqual(value.envelope);
  });

  it("keeps separate envelopes through three automatic tool-loop steps", async () => {
    const id = MODELS[0];
    const { model, bodies } = setup(id, (_body, index) =>
      response(id, true, index < 2)
    );
    const result = streamText({
      model,
      prompt: "Weather?",
      tools: { weather },
      stopWhen: stepCountIs(3),
      maxRetries: 0,
    });
    expect(await result.text).toBe("Sunny.");
    expect(bodies).toHaveLength(3);
    expect(
      bodies[2].messages.filter((message) => message.role === "assistant")
    ).toEqual([fixture(id).message, fixture(id).message]);
  });

  it.each(
    [false, true].flatMap((streaming) =>
      ["not-json{", '"invalid-object-input"'].map((toolArguments) => ({
        streaming,
        toolArguments,
      }))
    )
  )(
    "lets the model recover from invalid tool arguments without rewriting continuation state: streaming=$streaming arguments=$toolArguments",
    async ({ streaming, toolArguments }) => {
      const id = MODELS[0];
      const execute = vi.fn<() => Promise<string>>(async () => "sunny");
      const { model, bodies } = setup(id, (_body, index) =>
        response(id, streaming, index === 0, true, toolArguments)
      );
      const options = {
        model,
        prompt: "Weather?",
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute,
          }),
        },
        stopWhen: stepCountIs(2),
        maxRetries: 0,
      };
      const result = streaming
        ? streamText(options)
        : await generateText(options);
      expect(await result.text).toBe("Sunny.");
      expect(execute).not.toHaveBeenCalled();
      expect(bodies).toHaveLength(2);
      expect(
        bodies[1].messages.find((message) => message.role === "assistant")
      ).toEqual(fixture(id, true, toolArguments).message);
      expect(bodies[1].messages.at(-1)).toMatchObject({
        role: "tool",
        tool_call_id: "call-1",
        content: expect.stringContaining("Invalid input for tool weather"),
      });
    }
  );

  it.each([false, true])(
    "preserves empty argument strings accepted by the SDK as an empty object: streaming=%s",
    async (streaming) => {
      const id = MODELS[0];
      const { model, bodies } = setup(id, (_body, index) =>
        response(id, streaming, index === 0, true, "")
      );
      const options = {
        model,
        prompt: "Weather?",
        tools: {
          weather: tool({
            inputSchema: z.object({}),
            execute: async () => "sunny",
          }),
        },
        stopWhen: stepCountIs(2),
        maxRetries: 0,
      };
      const result = streaming
        ? streamText(options)
        : await generateText(options);
      expect(await result.text).toBe("Sunny.");
      expect(
        bodies[1].messages.find((message) => message.role === "assistant")
      ).toEqual(fixture(id, true, "").message);
    }
  );

  it.each([false, true])(
    "preserves original arguments when SDK validation applies defaults and transforms: streaming=%s",
    async (streaming) => {
      const id = MODELS[0];
      const execute = vi.fn<
        (input: { city: string; units: string }) => Promise<string>
      >(async () => "sunny");
      const { model, bodies } = setup(id, (_body, index) =>
        response(id, streaming, index === 0)
      );
      const options = {
        model,
        prompt: "Weather?",
        tools: {
          weather: tool({
            inputSchema: z.object({
              city: z.string().transform((city) => city.toUpperCase()),
              units: z.string().default("metric"),
            }),
            execute,
          }),
        },
        stopWhen: stepCountIs(2),
        maxRetries: 0,
      };
      const result = streaming
        ? streamText(options)
        : await generateText(options);
      expect(await result.text).toBe("Sunny.");
      expect(execute.mock.calls[0][0]).toEqual({
        city: "SEOUL",
        units: "metric",
      });
      expect(
        bodies[1].messages.find((message) => message.role === "assistant")
      ).toEqual(fixture(id).message);
    }
  );

  it.each([false, true])(
    "uses the existing legacy wire when an older server omits continuation: streaming=%s",
    async (streaming) => {
      const id = "openai/gpt-5.6-sol";
      const { model, bodies } = setup(id, (_body, index) =>
        response(id, streaming, index === 0, false)
      );
      const options = {
        model,
        prompt: "Weather?",
        tools: { weather },
        stopWhen: stepCountIs(2),
        maxRetries: 0,
      };
      const result = streaming
        ? streamText(options)
        : await generateText(options);
      expect(await result.text).toBe("Sunny.");
      expect(bodies).toHaveLength(2);
      expect(
        bodies[1].messages.find((message) => message.role === "assistant")
          ?.grida_continuation
      ).toBeUndefined();
    }
  );

  it.each([false, true])(
    "does not fall back after a legacy-model loop already retained state: streaming=%s",
    async (streaming) => {
      const id = "openai/gpt-5.6-sol";
      const { model } = setup(id, () => response(id, streaming, false, false));
      const prompt: LanguageModelV3CallOptions["prompt"] = [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Checking weather." },
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "weather",
              input: { city: "Seoul" },
              providerOptions: { gg: { continuation: fixture(id).envelope } },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "weather",
              output: { type: "text", value: "sunny" },
            },
          ],
        },
      ];
      await expectContinuationFailure(model, prompt, streaming);
    }
  );

  it.each(
    MODELS.flatMap((id) =>
      [false, true].map((streaming) => ({ id, streaming }))
    )
  )(
    "never falls back to the legacy wire for a newly admitted model: $id streaming=$streaming",
    async ({ id, streaming }) => {
      const { model } = setup(id, () => response(id, streaming, false, false));
      const prompt: LanguageModelV3CallOptions["prompt"] = [
        { role: "user", content: [{ type: "text", text: "hi" }] },
      ];
      await expectContinuationFailure(model, prompt, streaming);
    }
  );

  it.each([" \n", " invalid-tail"])(
    "retains argument chunks arriving after the compatible parser has completed JSON: %j",
    async (tail) => {
      const id = MODELS[0];
      const value = fixture(id, true, argumentsText + tail);
      const execute = vi.fn<() => Promise<string>>(async () => "sunny");
      const { model, bodies } = setup(id, (_body, index) =>
        index > 0
          ? response(id, true, false)
          : streamedDeltas(id, [
              { content: value.message.content },
              {
                tool_calls: [
                  {
                    index: 0,
                    id: "call-1",
                    function: { name: "weather", arguments: argumentsText },
                  },
                ],
              },
              { tool_calls: [{ index: 0, function: { arguments: tail } }] },
              { grida_continuation: value.envelope },
            ])
      );
      const result = streamText({
        model,
        prompt: "Weather?",
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute,
          }),
        },
        stopWhen: stepCountIs(2),
        maxRetries: 0,
      });
      expect(await result.text).toBe("Sunny.");
      expect(execute).toHaveBeenCalledTimes(tail.trim() ? 0 : 1);
      expect(
        bodies[1].messages.find((message) => message.role === "assistant")
      ).toEqual(value.message);
    }
  );

  it.each(["projection-mismatch", "redacted-text"])(
    "closes malformed streams without executing pending tools or hanging result promises: %s",
    async (kind) => {
      const id = kind === "redacted-text" ? MODELS[2] : MODELS[0];
      const value = fixture(id);
      const envelope: Record<string, unknown> = { ...value.envelope };
      if (kind === "redacted-text")
        envelope.blocks = [
          {
            type: "reasoning",
            text: "must be empty",
            state: { type: "anthropic-redacted", data: "synthetic-redacted" },
          },
          ...value.envelope.blocks.slice(1),
        ];
      const execute = vi.fn<() => Promise<string>>(async () => "sunny");
      const { model, request } = setup(id, () =>
        streamedDeltas(id, [
          { content: value.message.content },
          {
            tool_calls: [
              {
                index: 0,
                id: "call-1",
                function: {
                  name: "weather",
                  arguments:
                    kind === "projection-mismatch"
                      ? '{"city":"Paris"}'
                      : argumentsText,
                },
              },
            ],
          },
          { grida_continuation: envelope },
        ])
      );
      const result = streamText({
        model,
        prompt: "Weather?",
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute,
          }),
        },
        stopWhen: stepCountIs(2),
        maxRetries: 0,
        onError: () => {},
      });
      const errors: unknown[] = [];
      for await (const part of result.fullStream)
        if (part.type === "error") errors.push(part.error);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: expect.stringContaining("gg_invalid_continuation"),
      });
      expect(await result.text).toBe("Checking weather.");
      expect(execute).not.toHaveBeenCalled();
      expect(request).toHaveBeenCalledOnce();
    }
  );
});
