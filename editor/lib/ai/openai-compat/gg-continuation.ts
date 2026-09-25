// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — bounded, stateless assistant continuation
import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3Message,
  LanguageModelV3StreamPart,
  SharedV3ProviderMetadata,
  SharedV3ProviderOptions,
} from "@ai-sdk/provider";

/** Optional GG wire extension. No credentials, stored-response lookup or tuning. */
export namespace GridaContinuation {
  export const MAX_BYTES = 1_048_576;
  export const MAX_BLOCKS = 1024;
  const identifier = z.string().min(1).max(512);
  const boundedText = z.string().max(MAX_BYTES);
  const stateSchema = z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("anthropic-thinking"),
      signature: boundedText.min(1),
    }),
    z.strictObject({
      type: z.literal("anthropic-redacted"),
      data: boundedText.min(1),
    }),
    z.strictObject({
      type: z.literal("openai-reasoning"),
      item_id: identifier,
      // AI SDK 6 can end an early summary before encrypted data arrives on
      // the last summary of the same item. validate requires data for that ID.
      encrypted_content: boundedText.min(1).nullable(),
    }),
  ]);
  const blockSchema = z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("text"),
      text: boundedText,
      item_id: identifier.optional(),
    }),
    z.strictObject({
      type: z.literal("reasoning"),
      text: boundedText,
      state: stateSchema,
    }),
    z.strictObject({
      type: z.literal("tool_call"),
      id: identifier,
      name: identifier,
      arguments: boundedText,
      item_id: identifier.optional(),
    }),
  ]);
  export const capabilitySchema = z.strictObject({ version: z.literal(1) });
  export const envelopeSchema = z
    .strictObject({
      version: z.literal(1),
      model: identifier,
      provider: z.enum(["openai", "anthropic"]),
      prefix_sha256: z.string().regex(/^[a-f0-9]{64}$/),
      blocks: z.array(blockSchema).max(MAX_BLOCKS),
    })
    .refine(
      (value) => byteLength(value) <= MAX_BYTES,
      "continuation exceeds 1 MiB"
    );

  export type Envelope = z.infer<typeof envelopeSchema>;
  type Block = Envelope["blocks"][number];
  export type Context = {
    model: string;
    prompt: LanguageModelV3Message[];
    tools?: LanguageModelV3CallOptions["tools"];
  };
  export type Projection = {
    content?: string | null;
    reasoning_content?: string | null;
    tool_calls?: ReadonlyArray<{
      id: string;
      function: { name: string; arguments: string };
    }> | null;
  };

  export function requiresCapability(model: string): boolean {
    return [
      "openai/gpt-6-sol",
      "openai/gpt-6-luna",
      "anthropic/claude-opus-5.5",
    ].includes(model);
  }

  export function provider(model: string): Envelope["provider"] {
    if (model.startsWith("openai/")) return "openai";
    if (model.startsWith("anthropic/")) return "anthropic";
    throw new Error(
      "continuation v1 supports OpenAI and Anthropic models only"
    );
  }

  /** Trusted execution policy; never derived from client provider options. */
  export function executionOptions(model: string): SharedV3ProviderOptions {
    return provider(model) === "openai"
      ? { openai: { store: false, include: ["reasoning.encrypted_content"] } }
      : {};
  }

  function byteLength(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  }

  function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
      return `{${Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  /** Conservative consistency check; it neither signs nor authenticates state. */
  function prefix(context: Context): string {
    return createHash("sha256")
      .update(canonical({ prompt: context.prompt, tools: context.tools ?? [] }))
      .digest("hex");
  }

  function project(parts: readonly Block[]): Projection {
    return {
      content: parts
        .flatMap((p) => (p.type === "text" ? [p.text] : []))
        .join(""),
      reasoning_content: parts
        .flatMap((p) => (p.type === "reasoning" ? [p.text] : []))
        .join(""),
      tool_calls: parts.flatMap((p) =>
        p.type === "tool_call"
          ? [{ id: p.id, function: { name: p.name, arguments: p.arguments } }]
          : []
      ),
    };
  }

  function validate(envelope: Envelope): void {
    const ids = new Set<string>();
    const reasoningIds = new Map<string, boolean>();
    for (const block of envelope.blocks) {
      if (block.type === "reasoning") {
        const expected =
          envelope.provider === "openai" ? "openai-" : "anthropic-";
        if (!block.state.type.startsWith(expected)) {
          throw new Error(
            "continuation provider does not match reasoning state"
          );
        }
        if (block.state.type === "anthropic-redacted" && block.text !== "") {
          throw new Error("redacted continuation cannot contain display text");
        }
        if (block.state.type === "openai-reasoning") {
          const state = block.state;
          reasoningIds.set(
            state.item_id,
            reasoningIds.get(state.item_id) === true ||
              state.encrypted_content !== null
          );
        }
      } else if (
        envelope.provider !== "openai" &&
        block.item_id !== undefined
      ) {
        throw new Error("continuation item IDs require OpenAI");
      }
      if (block.type === "tool_call") {
        if (ids.has(block.id))
          throw new Error("duplicate continuation tool call ID");
        ids.add(block.id);
      }
    }
    if ([...reasoningIds.values()].some((hasData) => !hasData)) {
      throw new Error(
        "OpenAI continuation requires encrypted data, not stored item references"
      );
    }
  }

  export function encode(
    context: Context,
    content: readonly LanguageModelV3Content[]
  ): Envelope {
    const source = provider(context.model);
    const blocks: Block[] = content.map((part): Block => {
      const metadata = part.providerMetadata?.[source];
      const item =
        source === "openai" && metadata?.itemId != null
          ? { item_id: metadata.itemId }
          : {};
      if (part.type === "text") {
        return blockSchema.parse({ type: "text", text: part.text, ...item });
      }
      if (part.type === "tool-call" && !part.providerExecuted) {
        return blockSchema.parse({
          type: "tool_call",
          id: part.toolCallId,
          name: part.toolName,
          arguments: part.input,
          ...item,
        });
      }
      if (part.type === "reasoning") {
        const state =
          source === "openai"
            ? {
                type: "openai-reasoning",
                item_id: metadata?.itemId,
                encrypted_content: metadata?.reasoningEncryptedContent ?? null,
              }
            : metadata?.redactedData != null
              ? { type: "anthropic-redacted", data: metadata.redactedData }
              : { type: "anthropic-thinking", signature: metadata?.signature };
        return blockSchema.parse({ type: "reasoning", text: part.text, state });
      }
      throw new Error("unsupported content in continuation v1");
    });
    const envelope = envelopeSchema.parse({
      version: 1,
      model: context.model,
      provider: source,
      prefix_sha256: prefix(context),
      blocks,
    });
    validate(envelope);
    return envelope;
  }

  export function restore(
    value: Envelope,
    context: Context,
    message: Projection
  ): Extract<LanguageModelV3Message, { role: "assistant" }>["content"] {
    const envelope = envelopeSchema.parse(value);
    validate(envelope);
    if (
      envelope.model !== context.model ||
      envelope.provider !== provider(context.model)
    ) {
      throw new Error("continuation model/provider does not match request");
    }
    if (envelope.prefix_sha256 !== prefix(context)) {
      throw new Error(
        "continuation requires its unchanged prompt and tools prefix"
      );
    }
    const normalized = {
      content: message.content ?? "",
      reasoning_content: message.reasoning_content ?? "",
      tool_calls: (message.tool_calls ?? []).map((call) => ({
        id: call.id,
        function: {
          name: call.function.name,
          arguments: call.function.arguments,
        },
      })),
    };
    if (canonical(project(envelope.blocks)) !== canonical(normalized)) {
      throw new Error(
        "continuation does not match assistant content and tool calls"
      );
    }
    return envelope.blocks.map((block) => {
      if (block.type === "reasoning") {
        const state = block.state;
        const providerOptions: SharedV3ProviderOptions =
          state.type === "openai-reasoning"
            ? {
                openai: {
                  itemId: state.item_id,
                  reasoningEncryptedContent: state.encrypted_content,
                },
              }
            : state.type === "anthropic-redacted"
              ? { anthropic: { redactedData: state.data } }
              : { anthropic: { signature: state.signature } };
        return { type: "reasoning", text: block.text, providerOptions };
      }
      const providerOptions =
        block.item_id === undefined
          ? undefined
          : { openai: { itemId: block.item_id } };
      if (block.type === "text") {
        return {
          type: "text",
          text: block.text,
          ...(providerOptions && { providerOptions }),
        };
      }
      let input: unknown;
      try {
        input = JSON.parse(block.arguments);
      } catch {
        input = block.arguments;
      }
      return {
        type: "tool-call",
        toolCallId: block.id,
        toolName: block.name,
        input,
        ...(providerOptions && { providerOptions }),
      };
    });
  }

  /** Keeps block-start order; signatures/encrypted data may arrive at block end. */
  export class Stream {
    private content: LanguageModelV3Content[] = [];
    private active = new Map<string, number>();
    private completeTools = new Set<string>();
    private bytes = 0;

    constructor(private context: Context) {}

    push(part: LanguageModelV3StreamPart): void {
      // Bound every retained chunk before appending it. This counts metadata
      // conservatively, including replacements, and never buffers raw events.
      if (
        [
          "text-start",
          "text-delta",
          "text-end",
          "reasoning-start",
          "reasoning-delta",
          "reasoning-end",
          "tool-input-start",
          "tool-call",
        ].includes(part.type)
      ) {
        this.bytes += byteLength(part);
        if (this.bytes > MAX_BYTES)
          throw new Error("continuation stream exceeds 1 MiB");
      }
      switch (part.type) {
        case "text-start":
        case "reasoning-start": {
          const key = `${part.type}:${part.id}`;
          if (this.active.has(key))
            throw new Error("duplicate continuation block start");
          this.active.set(key, this.content.length);
          this.content.push({
            type: part.type === "text-start" ? "text" : "reasoning",
            text: "",
            providerMetadata: part.providerMetadata,
          });
          break;
        }
        case "text-delta":
        case "reasoning-delta":
        case "text-end":
        case "reasoning-end": {
          const kind = part.type.startsWith("text") ? "text" : "reasoning";
          const key = `${kind}-start:${part.id}`;
          const index = this.active.get(key);
          const block = index === undefined ? undefined : this.content[index];
          if (!block || (block.type !== "text" && block.type !== "reasoning")) {
            throw new Error(
              "continuation delta/end has no matching block start"
            );
          }
          if ("delta" in part) block.text += part.delta;
          block.providerMetadata = mergeMetadata(
            block.providerMetadata,
            part.providerMetadata
          );
          if (part.type.endsWith("-end")) this.active.delete(key);
          break;
        }
        case "tool-input-start": {
          const key = `tool:${part.id}`;
          if (this.active.has(key) || this.completeTools.has(part.id))
            throw new Error("duplicate continuation tool start");
          this.active.set(key, this.content.length);
          this.content.push({
            type: "tool-call",
            toolCallId: part.id,
            toolName: part.toolName,
            input: "",
            providerMetadata: part.providerMetadata,
          });
          break;
        }
        case "tool-call": {
          if (this.completeTools.has(part.toolCallId))
            throw new Error("duplicate continuation tool call");
          const key = `tool:${part.toolCallId}`;
          const index = this.active.get(key);
          if (index === undefined) this.content.push(part);
          else
            this.content[index] = {
              ...part,
              providerMetadata: mergeMetadata(
                this.content[index]?.providerMetadata,
                part.providerMetadata
              ),
            };
          this.active.delete(key);
          this.completeTools.add(part.toolCallId);
          break;
        }
        case "file":
        case "source":
        case "tool-result":
        case "tool-approval-request":
          throw new Error("unsupported content in continuation v1");
      }
      if (this.content.length > MAX_BLOCKS)
        throw new Error("too many continuation blocks");
    }

    finish(): Envelope {
      if (this.active.size !== 0)
        throw new Error("incomplete continuation blocks");
      return encode(this.context, this.content);
    }
  }

  function mergeMetadata(
    a?: SharedV3ProviderMetadata,
    b?: SharedV3ProviderMetadata
  ) {
    if (!b) return a;
    const merged = { ...a };
    for (const [key, value] of Object.entries(b)) {
      merged[key] = { ...merged[key], ...value };
    }
    return merged;
  }
}
