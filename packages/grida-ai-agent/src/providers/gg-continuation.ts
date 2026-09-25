// GRIDA-GG: provider — consumer of the published GG continuation-v1 wire.
// GRIDA-SEC-006 — bounded model-bound state; no caller-owned provider options.
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { z } from "zod";

/** Internal adapter; no vendor options, stored responses or new history format. */
export class GgContinuationModel implements LanguageModelV3 {
  readonly specificationVersion = "v3";
  readonly provider = "gg.chat";
  readonly supportedUrls = {};

  constructor(
    readonly modelId: string,
    private readonly createModel: (
      transform: (body: Record<string, unknown>) => Record<string, unknown>
    ) => LanguageModelV3
  ) {}

  private prepare(options: LanguageModelV3CallOptions) {
    // Read only our bounded continuation metadata. No provider-controlled
    // options can override a message, destination, model or request parameter.
    const continuations = options.prompt
      .filter((message) => message.role === "assistant")
      .map((message) => {
        const candidates = message.content.flatMap((part) => {
          const value = part.providerOptions?.gg?.continuation;
          return value === undefined ? [] : [readEnvelope(value, this.modelId)];
        });
        if (!candidates.length) return undefined;
        const envelope = candidates[0];
        if (
          candidates.some(
            (item) => JSON.stringify(item) !== JSON.stringify(envelope)
          )
        )
          fail();
        const projection = project(envelope);
        const text = message.content
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("");
        const reasoning = message.content
          .flatMap((part) => (part.type === "reasoning" ? [part.text] : []))
          .join("");
        const calls = message.content.filter(
          (part) => part.type === "tool-call"
        );
        if (
          text !== (projection.content ?? "") ||
          reasoning !== (projection.reasoning_content ?? "") ||
          calls.length !== (projection.tool_calls?.length ?? 0)
        )
          fail();
        for (const [index, call] of calls.entries()) {
          const original = projection.tool_calls![index];
          if (
            call.toolCallId !== original.id ||
            call.toolName !== original.function.name
          )
            fail();
        }
        // Schema defaults/transforms and invalid-input recovery change the
        // SDK's tool input. It is not the wire projection. The envelope owns
        // the original argument strings, independently validated by GG.
        return { ...projection, grida_continuation: envelope };
      });
    const model = this.createModel((body) => {
      let index = 0;
      return {
        ...body,
        grida_continuation: { version: 1 },
        messages: (body.messages as Array<Record<string, unknown>>).map(
          (message) => {
            if (message.role !== "assistant") return message;
            return continuations[index++] ?? message;
          }
        ),
      };
    });
    const prompt = options.prompt.map((message) => ({
      ...message,
      providerOptions: undefined,
      ...(message.role !== "system"
        ? {
            content: message.content.map((part) => ({
              ...part,
              providerOptions: undefined,
            })),
          }
        : {}),
    })) as LanguageModelV3CallOptions["prompt"];
    return {
      model,
      options: { ...options, prompt, providerOptions: undefined },
      requiresContinuation:
        REQUIRED_MODELS.has(this.modelId) || continuations.some(Boolean),
    };
  }

  async doGenerate(options: LanguageModelV3CallOptions) {
    const prepared = this.prepare(options);
    const result = await prepared.model.doGenerate(prepared.options);
    const body = result.response?.body as
      | { choices?: Array<{ message?: Record<string, unknown> }> }
      | undefined;
    const message = body?.choices?.[0]?.message;
    // Pre-continuation servers can ignore the opt-in on existing models.
    // Never downgrade a new model or a loop that already retained state.
    if (
      message?.grida_continuation === undefined &&
      !prepared.requiresContinuation
    )
      return result;
    const envelope = readEnvelope(message?.grida_continuation, this.modelId);
    assertProjection(envelope, message);
    return { ...result, content: toContent(envelope) };
  }

  async doStream(options: LanguageModelV3CallOptions) {
    const prepared = this.prepare(options);
    const result = await prepared.model.doStream({
      ...prepared.options,
      includeRawChunks: true,
    });
    let envelope: Envelope | undefined;
    let text = "";
    let reasoning = "";
    let retainedBytes = 0;
    let lastEnd:
      | Extract<
          LanguageModelV3StreamPart,
          { type: "text-end" | "reasoning-end" }
        >
      | undefined;
    const calls: Extract<LanguageModelV3Content, { type: "tool-call" }>[] = [];
    const wireCalls = new Map<
      number,
      { id?: string; name?: string; arguments: string }
    >();
    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<
          LanguageModelV3StreamPart,
          LanguageModelV3StreamPart
        >({
          transform: (part, controller) => {
            try {
              if (part.type === "raw") {
                const raw = part.rawValue as {
                  choices?: Array<{
                    delta?: Record<string, unknown>;
                    finish_reason?: unknown;
                  }>;
                };
                const choice = raw?.choices?.[0];
                const deltas = choice?.delta?.tool_calls;
                if (deltas !== undefined) {
                  const parsed = toolDeltasSchema.safeParse(deltas);
                  if (!parsed.success) fail();
                  for (const delta of parsed.data) {
                    const call = wireCalls.get(delta.index) ?? {
                      arguments: "",
                    };
                    if (delta.id !== undefined) {
                      if (call.id !== undefined && call.id !== delta.id) fail();
                      call.id = delta.id;
                    }
                    if (delta.function.name !== undefined) {
                      if (
                        call.name !== undefined &&
                        call.name !== delta.function.name
                      )
                        fail();
                      call.name = delta.function.name;
                    }
                    const argumentDelta = delta.function.arguments ?? "";
                    retainedBytes += new TextEncoder().encode(
                      argumentDelta
                    ).byteLength;
                    if (retainedBytes > MAX_BYTES) fail();
                    call.arguments += argumentDelta;
                    wireCalls.set(delta.index, call);
                  }
                }
                const value = choice?.delta?.grida_continuation;
                if (value !== undefined) {
                  if (envelope || !choice?.finish_reason) fail();
                  envelope = readEnvelope(value, this.modelId);
                }
                if (options.includeRawChunks) controller.enqueue(part);
                return;
              }
              if (part.type === "text-delta") text += part.delta;
              if (part.type === "reasoning-delta") reasoning += part.delta;
              if (
                part.type === "text-delta" ||
                part.type === "reasoning-delta"
              ) {
                retainedBytes += new TextEncoder().encode(
                  part.delta
                ).byteLength;
                if (retainedBytes > MAX_BYTES) fail();
              }
              if (part.type === "tool-call") {
                calls.push(part);
                if (calls.length > MAX_BLOCKS) fail();
                return; // Never execute a tool before the complete state arrives.
              }
              if (part.type === "text-end" || part.type === "reasoning-end") {
                if (lastEnd) controller.enqueue(lastEnd);
                lastEnd = part;
                return;
              }
              if (part.type === "finish") {
                if (!envelope && prepared.requiresContinuation) fail();
                // The compatible parser finishes parallel calls as soon as their
                // arguments parse. Completion order need not be source order.
                const orderedCalls = envelope
                  ? envelope.blocks.flatMap((block) => {
                      if (block.type !== "tool_call") return [];
                      const matches = calls.filter(
                        (call) => call.toolCallId === block.id
                      );
                      if (matches.length !== 1) fail();
                      // The generic parser can finish a call before trailing
                      // argument chunks. Execute the complete wire input.
                      return [{ ...matches[0], input: block.arguments }];
                    })
                  : calls;
                if (orderedCalls.length !== calls.length) fail();
                if (envelope)
                  assertProjection(envelope, {
                    content: text || null,
                    reasoning_content: reasoning,
                    tool_calls: [...wireCalls.entries()]
                      .sort(([a], [b]) => a - b)
                      .map(([index, call], position) => {
                        if (index !== position) fail();
                        return {
                          id: call.id,
                          type: "function",
                          function: {
                            name: call.name,
                            arguments: call.arguments,
                          },
                        };
                      }),
                  });
                if (lastEnd)
                  controller.enqueue({
                    ...lastEnd,
                    ...(envelope && !calls.length
                      ? { providerMetadata: metadata(envelope) }
                      : {}),
                  });
                for (const [index, call] of orderedCalls.entries())
                  controller.enqueue({
                    ...call,
                    ...(envelope && index === 0
                      ? { providerMetadata: metadata(envelope) }
                      : {}),
                  });
              }
              controller.enqueue(part);
            } catch (error) {
              // An errored transform skips the AI SDK's tool-stream cleanup
              // and can leave result promises unresolved. Report a provider
              // error and close normally; no withheld tool is executable.
              if (lastEnd) controller.enqueue(lastEnd);
              controller.enqueue({ type: "error", error });
              if (part.type === "finish")
                controller.enqueue({
                  ...part,
                  finishReason: { unified: "error", raw: undefined },
                });
              controller.terminate();
            }
          },
        })
      ),
    };
  }
}

const MAX_BLOCKS = 1024;
const MAX_BYTES = 1_048_576;
// The continuation-v1 admission rule is part of GG's published contract.
const REQUIRED_MODELS = new Set([
  "openai/gpt-6-sol",
  "openai/gpt-6-luna",
  "anthropic/claude-opus-5.5",
]);
const identifier = z.string().min(1).max(512);
const toolDeltasSchema = z
  .array(
    z.object({
      index: z
        .number()
        .int()
        .min(0)
        .max(MAX_BLOCKS - 1),
      id: identifier.optional(),
      function: z.object({
        name: identifier.optional(),
        arguments: z.string().optional(),
      }),
    })
  )
  .max(MAX_BLOCKS);
const envelopeSchema = z.strictObject({
  version: z.literal(1),
  model: identifier,
  provider: z.enum(["openai", "anthropic"]),
  prefix_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  blocks: z
    .array(
      z.discriminatedUnion("type", [
        z.strictObject({
          type: z.literal("text"),
          text: z.string(),
          item_id: identifier.optional(),
        }),
        z.strictObject({
          type: z.literal("tool_call"),
          id: identifier,
          name: identifier,
          arguments: z.string(),
          item_id: identifier.optional(),
        }),
        z.strictObject({
          type: z.literal("reasoning"),
          text: z.string(),
          state: z.discriminatedUnion("type", [
            z.strictObject({
              type: z.literal("anthropic-thinking"),
              signature: z.string().min(1),
            }),
            z.strictObject({
              type: z.literal("anthropic-redacted"),
              data: z.string().min(1),
            }),
            z.strictObject({
              type: z.literal("openai-reasoning"),
              item_id: identifier,
              encrypted_content: z.string().min(1).nullable(),
            }),
          ]),
        }),
      ])
    )
    .max(MAX_BLOCKS),
});
type Envelope = z.infer<typeof envelopeSchema>;

function fail(): never {
  // Opaque state can contain private reasoning. Never include it in errors.
  throw new Error(
    "gg_invalid_continuation: Incomplete or incompatible model continuation."
  );
}

function readEnvelope(value: unknown, modelId: string): Envelope {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    fail();
  }
  if (!encoded || new TextEncoder().encode(encoded).byteLength > MAX_BYTES)
    fail();
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) fail();
  const envelope = parsed.data;
  if (
    envelope.model !== modelId ||
    !modelId.startsWith(`${envelope.provider}/`)
  )
    fail();
  const ids = new Set<string>();
  const encrypted = new Map<string, boolean>();
  for (const block of envelope.blocks) {
    if (block.type === "tool_call") {
      if (ids.has(block.id)) fail();
      ids.add(block.id);
    }
    if (block.type !== "reasoning") {
      if (block.item_id && envelope.provider !== "openai") fail();
      continue;
    }
    if (block.state.type === "openai-reasoning") {
      if (envelope.provider !== "openai") fail();
      encrypted.set(
        block.state.item_id,
        !!block.state.encrypted_content || !!encrypted.get(block.state.item_id)
      );
    } else {
      if (envelope.provider !== "anthropic") fail();
      if (block.state.type === "anthropic-redacted" && block.text !== "")
        fail();
    }
  }
  if ([...encrypted.values()].some((present) => !present)) fail();
  return envelope;
}

function project(envelope: Envelope) {
  const content = envelope.blocks
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
  const reasoning = envelope.blocks
    .flatMap((block) => (block.type === "reasoning" ? [block.text] : []))
    .join("");
  const calls = envelope.blocks.flatMap((block) =>
    block.type === "tool_call"
      ? [
          {
            id: block.id,
            type: "function" as const,
            function: { name: block.name, arguments: block.arguments },
          },
        ]
      : []
  );
  return {
    role: "assistant" as const,
    content: content || null,
    ...(reasoning ? { reasoning_content: reasoning } : {}),
    ...(calls.length ? { tool_calls: calls } : {}),
  };
}

function assertProjection(
  envelope: Envelope,
  message?: Record<string, unknown>
) {
  const projection = project(envelope);
  if (
    !message ||
    (message.content ?? "") !== (projection.content ?? "") ||
    (message.reasoning_content ?? "") !==
      (projection.reasoning_content ?? "") ||
    !sameJson(message.tool_calls ?? [], projection.tool_calls ?? [])
  )
    fail();
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const aa = a as Record<string, unknown>;
  const bb = b as Record<string, unknown>;
  const keys = Object.keys(aa);
  return (
    keys.length === Object.keys(bb).length &&
    keys.every((key) => Object.hasOwn(bb, key) && sameJson(aa[key], bb[key]))
  );
}

function metadata(envelope: Envelope) {
  return { gg: { continuation: envelope } };
}

function toContent(envelope: Envelope): LanguageModelV3Content[] {
  const content: LanguageModelV3Content[] = envelope.blocks.map((block) =>
    block.type === "tool_call"
      ? {
          type: "tool-call",
          toolCallId: block.id,
          toolName: block.name,
          input: block.arguments,
        }
      : { type: block.type, text: block.text }
  );
  const carrier =
    content.find((part) => part.type === "tool-call") ?? content[0];
  if (carrier) carrier.providerMetadata = metadata(envelope);
  return content;
}
