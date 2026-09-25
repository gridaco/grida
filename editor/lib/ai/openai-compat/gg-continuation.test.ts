// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — producer continuation contract, synthetic provider state
import { describe, expect, it } from "vitest";
import type {
  LanguageModelV3Content,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
  SharedV3ProviderMetadata,
} from "@ai-sdk/provider";
import { GridaContinuation } from "./gg-continuation";
import {
  decodeRequest,
  encodeCompletion,
  streamEncoder,
  WireDecodeError,
} from "./codec";
import {
  chatCompletionRequestSchema,
  type ChatCompletionRequest,
} from "./wire";

const usage: LanguageModelV3Usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 3, text: 1, reasoning: 2 },
};
const finish: LanguageModelV3StreamPart = {
  type: "finish",
  finishReason: { unified: "tool-calls", raw: "tool_calls" },
  usage,
};

function request(model: string): ChatCompletionRequest {
  return {
    model,
    grida_continuation: { version: 1 },
    messages: [
      { role: "system", content: "stable instructions" },
      { role: "user", content: "weather?" },
    ],
    tools: [
      {
        type: "function",
        function: { name: "weather", parameters: { type: "object" } },
      },
    ],
  };
}

function content(provider: "openai" | "anthropic"): LanguageModelV3Content[] {
  const providerMetadata: SharedV3ProviderMetadata =
    provider === "openai"
      ? {
          openai: {
            itemId: "rs_synthetic",
            reasoningEncryptedContent: "synthetic-encrypted-state",
          },
        }
      : { anthropic: { signature: "synthetic-signature" } };
  return [
    // Empty display text is still an essential, signed reasoning block.
    { type: "reasoning", text: "", providerMetadata },
    { type: "text", text: "Checking " },
    { type: "text", text: "now." },
    {
      type: "tool-call",
      toolCallId: "call_1",
      toolName: "weather",
      input: '{"city":"Seoul"}',
    },
    { type: "text", text: "Waiting." },
  ];
}

function result(parts: LanguageModelV3Content[]) {
  return {
    content: parts,
    finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
    usage,
    warnings: [],
  };
}

async function stream(
  parts: LanguageModelV3StreamPart[],
  req: ChatCompletionRequest
) {
  const source = new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      parts.forEach((part) => controller.enqueue(part));
      controller.close();
    },
  });
  const raw = await new Response(
    source.pipeThrough(
      streamEncoder(req.model, {
        includeUsage: true,
        continuation: decodeRequest(req).continuation,
      })
    )
  ).text();
  const frames = raw
    .split("\n\n")
    .filter((s) => s.startsWith("data: ") && s !== "data: [DONE]")
    .map((s) => JSON.parse(s.slice(6)));
  return { raw, frames };
}

describe("GridaContinuation", () => {
  it.each(["openai", "anthropic"] as const)(
    "preserves ordered %s reasoning/text/tool/result continuation without authority",
    (provider) => {
      const req = request(`${provider}/model`);
      const parts = content(provider);
      const decoded = decodeRequest(req);
      const encoded = encodeCompletion(
        req.model,
        result(parts),
        decoded.continuation
      );
      const message = encoded.choices[0]!.message;
      const replay = decodeRequest({
        ...req,
        messages: [
          ...req.messages,
          message,
          { role: "tool", tool_call_id: "call_1", content: "sunny" },
        ],
      });
      const expected = parts.map(({ providerMetadata, ...part }) => ({
        ...part,
        ...(part.type === "tool-call" ? { input: { city: "Seoul" } } : {}),
        ...(providerMetadata ? { providerOptions: providerMetadata } : {}),
      }));
      expect(replay.callOptions.prompt[2]).toEqual({
        role: "assistant",
        content: expected,
      });
      expect(replay.callOptions.prompt[3]).toMatchObject({
        role: "tool",
        content: [
          { toolName: "weather", output: { type: "text", value: "sunny" } },
        ],
      });
      expect(replay.callOptions).not.toHaveProperty("providerOptions");
      expect(message.content).toBe("Checking now.Waiting.");
      expect(message.tool_calls?.[0]?.function.arguments).toBe(
        '{"city":"Seoul"}'
      );
    }
  );

  it.each(["openai", "anthropic"] as const)(
    "retains %s stream block order and metadata arriving at block end",
    async (provider) => {
      const req = request(`${provider}/model`);
      const parts = content(provider);
      const streamed = await stream(
        [
          { type: "reasoning-start", id: "r" },
          {
            type: "reasoning-end",
            id: "r",
            providerMetadata: parts[0]!.providerMetadata,
          },
          { type: "text-start", id: "a" },
          { type: "text-delta", id: "a", delta: "Checking " },
          { type: "text-end", id: "a" },
          { type: "text-start", id: "b" },
          { type: "text-delta", id: "b", delta: "now." },
          { type: "text-end", id: "b" },
          { type: "tool-input-start", id: "call_1", toolName: "weather" },
          { type: "tool-input-delta", id: "call_1", delta: '{"city":"Seoul"}' },
          { type: "tool-input-end", id: "call_1" },
          parts[3] as Extract<LanguageModelV3Content, { type: "tool-call" }>,
          { type: "text-start", id: "c" },
          { type: "text-delta", id: "c", delta: "Waiting." },
          { type: "text-end", id: "c" },
          finish,
        ],
        req
      );
      const state = streamed.frames.find(
        (f) => f.choices?.[0]?.delta?.grida_continuation
      )?.choices[0].delta.grida_continuation;
      const message = encodeCompletion(
        req.model,
        result(parts),
        decodeRequest(req).continuation
      ).choices[0]!.message;
      expect(state).toEqual(message.grida_continuation);
      expect(streamed.raw).toContain("data: [DONE]");
      const replay = decodeRequest({
        ...req,
        messages: [
          ...req.messages,
          { ...message, grida_continuation: state },
          { role: "tool", tool_call_id: "call_1", content: "sunny" },
        ],
      });
      expect(replay.callOptions.prompt[2]!.content).toHaveLength(5);
      expect(replay.callOptions.prompt[3]).toMatchObject({ role: "tool" });
    }
  );

  it("leaves legacy output unchanged and documents why display reasoning is insufficient", () => {
    const req = request("anthropic/model");
    const encoded = encodeCompletion(req.model, result(content("anthropic")));
    expect(encoded.choices[0]!.message).not.toHaveProperty(
      "grida_continuation"
    );
    const { grida_continuation: _, ...legacy } = req;
    const replay = decodeRequest({
      ...legacy,
      messages: [...req.messages, encoded.choices[0]!.message],
    });
    expect(replay.callOptions.prompt[2]!.content).toHaveLength(2);
    expect(JSON.stringify(replay)).not.toContain("synthetic-signature");
  });

  it("preserves OpenAI summary parts when encrypted state arrives on only the last part", async () => {
    const req = request("openai/model");
    const start = {
      openai: { itemId: "rs_synthetic", reasoningEncryptedContent: null },
    };
    const end = {
      openai: {
        itemId: "rs_synthetic",
        reasoningEncryptedContent: "synthetic-encrypted",
      },
    };
    const output = await stream(
      [
        { type: "reasoning-start", id: "r:0", providerMetadata: start },
        { type: "reasoning-delta", id: "r:0", delta: "First." },
        {
          type: "reasoning-end",
          id: "r:0",
          providerMetadata: { openai: { itemId: "rs_synthetic" } },
        },
        { type: "reasoning-start", id: "r:1", providerMetadata: start },
        { type: "reasoning-delta", id: "r:1", delta: "Second." },
        { type: "reasoning-end", id: "r:1", providerMetadata: end },
        finish,
      ],
      req
    );
    const state = output.frames.find(
      (f) => f.choices?.[0]?.delta?.grida_continuation
    )?.choices[0].delta.grida_continuation;
    expect(
      state.blocks.map(
        (b: { state: { encrypted_content: string | null } }) =>
          b.state.encrypted_content
      )
    ).toEqual([null, "synthetic-encrypted"]);
    const replay = decodeRequest({
      ...req,
      messages: [
        ...req.messages,
        {
          role: "assistant",
          content: "",
          reasoning_content: "First.Second.",
          grida_continuation: state,
        },
      ],
    });
    expect(replay.callOptions.prompt[2]!.content).toEqual([
      { type: "reasoning", text: "First.", providerOptions: start },
      { type: "reasoning", text: "Second.", providerOptions: end },
    ]);
  });

  it("rejects mismatched models, prefixes, projections and injected provider state", () => {
    const req = request("anthropic/model");
    const message = encodeCompletion(
      req.model,
      result(content("anthropic")),
      decodeRequest(req).continuation
    ).choices[0]!.message;
    const replay = { ...req, messages: [...req.messages, message] };
    expect(() =>
      decodeRequest({ ...replay, model: "anthropic/other" })
    ).toThrow(WireDecodeError);
    expect(() =>
      decodeRequest({
        ...replay,
        messages: [{ role: "user", content: "changed" }, message],
      })
    ).toThrow(WireDecodeError);
    expect(() => decodeRequest({ ...replay, tools: [] })).toThrow(
      WireDecodeError
    );
    expect(() =>
      decodeRequest({
        ...replay,
        messages: [...req.messages, { ...message, content: "changed" }],
      })
    ).toThrow(WireDecodeError);
    const changed = structuredClone(message);
    changed.grida_continuation!.provider = "openai";
    expect(() =>
      decodeRequest({ ...req, messages: [...req.messages, changed] })
    ).toThrow(WireDecodeError);
    const polluted = structuredClone(message);
    Object.assign(polluted.grida_continuation!.blocks[0]!, {
      providerOptions: { grida: { organizationId: 999 } },
    });
    expect(
      chatCompletionRequestSchema.safeParse({
        ...req,
        messages: [...req.messages, polluted],
      }).success
    ).toBe(false);
  });

  it("bounds state size and rejects malformed, unknown-version and stored-reference-only state", () => {
    const req = request("openai/model");
    const state = GridaContinuation.encode(
      decodeRequest(req).continuation!,
      content("openai")
    );
    expect(
      GridaContinuation.envelopeSchema.safeParse({ ...state, version: 2 })
        .success
    ).toBe(false);
    expect(
      GridaContinuation.envelopeSchema.safeParse({
        ...state,
        blocks: [{ type: "text", text: "字".repeat(400_000) }],
      }).success
    ).toBe(false);
    expect(
      GridaContinuation.envelopeSchema.safeParse({
        ...state,
        blocks: Array.from({ length: 1025 }, () => ({
          type: "text",
          text: "",
        })),
      }).success
    ).toBe(false);
    expect(() =>
      GridaContinuation.encode(decodeRequest(req).continuation!, [
        {
          type: "reasoning",
          text: "",
          providerMetadata: { openai: { itemId: "rs_reference_only" } },
        },
      ])
    ).toThrow(/requires encrypted data/);
  });

  it("preserves redacted state and stateless OpenAI item IDs without forwarding other metadata", () => {
    const req = request("anthropic/model");
    const parts: LanguageModelV3Content[] = [
      {
        type: "reasoning",
        text: "",
        providerMetadata: {
          anthropic: { redactedData: "synthetic-redacted" },
          grida: { organizationId: 999 },
        },
      },
    ];
    const state = GridaContinuation.encode(
      decodeRequest(req).continuation!,
      parts
    );
    expect(state.blocks[0]).toEqual({
      type: "reasoning",
      text: "",
      state: { type: "anthropic-redacted", data: "synthetic-redacted" },
    });
    expect(JSON.stringify(state)).not.toContain("organizationId");
    expect(GridaContinuation.executionOptions("openai/model")).toEqual({
      openai: { store: false, include: ["reasoning.encrypted_content"] },
    });
  });

  it("requires explicit capability for new models and rejects unsupported explicit controls", () => {
    for (const model of [
      "openai/gpt-6-sol",
      "openai/gpt-6-luna",
      "anthropic/claude-opus-5.5",
    ]) {
      const req = request(model);
      expect(() =>
        decodeRequest({ ...req, grida_continuation: undefined })
      ).toThrow(/requires grida_continuation/);
      expect(() => decodeRequest(req)).not.toThrow();
      expect(() => decodeRequest({ ...req, reasoning_effort: "none" })).toThrow(
        /reasoning_effort/
      );
    }
    expect(() =>
      decodeRequest({
        ...request("anthropic/claude-opus-5.5"),
        tool_choice: "required",
      })
    ).toThrow(/tool_choice/);
    expect(() =>
      decodeRequest({
        ...request("anthropic/claude-opus-5.5"),
        tool_choice: { type: "function", function: { name: "weather" } },
      })
    ).toThrow(/tool_choice/);
    expect(() => decodeRequest(request("other/model"))).toThrow(
      /supports OpenAI and Anthropic/
    );
  });

  it("permits removing all prior continuation state on a new user turn", () => {
    const req = request("anthropic/model");
    expect(() =>
      decodeRequest({
        ...req,
        messages: [
          ...req.messages,
          { role: "assistant", content: "sunny" },
          { role: "user", content: "next question" },
        ],
      })
    ).not.toThrow();
  });

  it("preserves two tool steps and rejects edits to an earlier tool result", () => {
    const req = request("anthropic/model");
    const first = encodeCompletion(
      req.model,
      result(content("anthropic")),
      decodeRequest(req).continuation
    ).choices[0]!.message;
    const secondRequest = {
      ...req,
      messages: [
        ...req.messages,
        first,
        { role: "tool" as const, tool_call_id: "call_1", content: "sunny" },
      ],
    };
    const parts = content("anthropic").map((part) =>
      part.type === "tool-call" ? { ...part, toolCallId: "call_2" } : part
    );
    const second = encodeCompletion(
      req.model,
      result(parts),
      decodeRequest(secondRequest).continuation
    ).choices[0]!.message;
    const thirdRequest = {
      ...req,
      messages: [
        ...secondRequest.messages,
        second,
        { role: "tool" as const, tool_call_id: "call_2", content: "warm" },
      ],
    };
    expect(decodeRequest(thirdRequest).callOptions.prompt).toHaveLength(6);
    const changed = structuredClone(thirdRequest);
    changed.messages[3] = {
      role: "tool",
      tool_call_id: "call_1",
      content: "changed",
    };
    expect(() => decodeRequest(changed)).toThrow(/invalid continuation/);
  });

  it("fails streaming safely when signed state is missing, oversized or incomplete", async () => {
    const req = request("anthropic/model");
    for (const parts of [
      [
        { type: "reasoning-start", id: "r" },
        { type: "reasoning-end", id: "r" },
        finish,
      ],
      [{ type: "reasoning-start", id: "r" }, finish],
      [
        { type: "text-start", id: "t" },
        {
          type: "text-delta",
          id: "t",
          delta: "x".repeat(GridaContinuation.MAX_BYTES),
        },
        finish,
      ],
    ] as LanguageModelV3StreamPart[][]) {
      const output = await stream(parts, req);
      expect(output.raw).not.toContain("[DONE]");
      expect(output.frames.at(-1)).toMatchObject({
        error: { code: "stream_error" },
      });
      expect(output.raw).not.toContain("grida_continuation");
    }
  });
});
