/**
 * `@grida/agent/gen` — the agent's **media generation** surface.
 *
 * `view_image` lets the model SEE a file; `generate_image` lets it MAKE one. It
 * is a PRODUCER, not a perception tool: it takes a `prompt`, generates a raster
 * image with the user's connected model, writes the bytes into the session
 * **scratch** dir (WG `scratch.md` — the default sink for produced files;
 * ephemeral, copy into the workspace to keep), and returns the saved PATH +
 * metadata. It does NOT hand the model the pixels — a tool result can't deliver
 * an image on the openai-compatible wire format (OpenRouter/Ollama stringify a
 * tool message's content), so an inlined image would arrive as undecodable
 * base64 text and blow the context. Perceiving an image is `view_image`'s job.
 *
 * This tool is the worked example of the TOOL-DESIGN doctrine in
 * `../tools/index.ts` (build for agents, minimal, host config off the args): it
 * started as a 7-arg mirror of the HTTP route and was cut to a single `prompt`.
 * The model id is host config (`image_model_id`), not an agent arg.
 *
 * Like `AgentVision`, the surface is a single neutral `AgentGen` namespace: the
 * tool table, the narrow generator contract it resolves against, the
 * dispatcher, and the output-lowering. The tool depends on a `generate()`
 * OUTCOME (SDK-design D1 "subscribe to outcomes") — NOT on `SecretsStore` or the
 * model catalog — so this module stays neutral/browser-safe; the node-only impl
 * (resolve provider → call the SDK → write scratch bytes) is injected by the
 * host (`runtime/workspace-agent-bindings.ts`). The tool is ALWAYS
 * server-resolved (the client has no provider keys), so it ships without a bare
 * `execute`; the host wraps it with one bound to the injected generator.
 *
 *   import { AgentGen } from "@grida/agent/gen";
 *   const out = await AgentGen.resolveToolCall(generator, toolCall);
 */

import { tool } from "ai";
import { z } from "zod";

export namespace AgentGen {
  // -------------------------------------------------------------------------
  // Contract
  // -------------------------------------------------------------------------

  /**
   * The validated `generate_image` input. The generator impl consumes this
   * shape (the host's node-only binding), so it is exported.
   */
  export type ImageGenInput = z.infer<typeof GEN_IMAGE_INPUT>;

  /**
   * What the host's generator returns. `generate_image` is a PRODUCER, not a
   * perception tool (SDK-design D3 — render vs. perceive are separate surfaces):
   * it returns the absolute scratch `path` (so the agent can copy the file out)
   * plus descriptor metadata. It deliberately does NOT carry the image bytes for
   * the model to "see" — a tool result cannot deliver pixels on the OpenAI-
   * compatible wire format (OpenRouter/Ollama): `@ai-sdk/openai-compatible`
   * `JSON.stringify`s a `role:"tool"` content output, so an inlined image would
   * arrive as undecodable base64 TEXT (the model hallucinates, and a multi-MB
   * image blows the context window). Perceiving an image is `view_image`'s job,
   * and even that only works where the provider's tool-result format carries
   * images (Anthropic-native), NOT on openai-compatible. So generate stays
   * honest: it makes a file and names it; it never claims the model saw it.
   */
  export type ImageGenOk = {
    ok: true;
    /** Absolute path of the written file under the session scratch dir. */
    path: string;
    mime: string;
    width?: number;
    height?: number;
    bytes: number;
  };
  export type ImageGenErr = {
    ok: false;
    reason: "invalid_input" | "unavailable" | "generation_failed";
    message: string;
  };
  export type ImageGenOutput = ImageGenOk | ImageGenErr;

  /**
   * The narrow outcome the tool resolves against. The host builds it from the
   * package-owned `SecretsStore` + the per-session scratch dir; this module
   * never names either. Implementations MUST NOT throw for an expected failure
   * (no key / generation error) — return the typed `ok: false` instead, so a
   * failure becomes a tool result the model can react to, not a dead run.
   */
  export interface ImageGenerator {
    generate(input: ImageGenInput): Promise<ImageGenOutput>;
  }

  // -------------------------------------------------------------------------
  // Tool table
  // -------------------------------------------------------------------------

  export const TOOL_NAMES = {
    generate_image: "generate_image",
  } as const;

  export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

  // PROMPT-ONLY by design. The tool exposes a single argument — what to make,
  // in natural language (the agent puts composition cues like "wide 16:9" in the
  // prose). Everything else is deliberately NOT a parameter:
  //   - model / provider: the user's connected choice (settings), not the
  //     agent's — and the agent has no way to enumerate valid ids.
  //   - size / aspect_ratio: silently ineffective on the primary BYOK path
  //     (verified — seedream on OpenRouter returns square regardless of the
  //     param), so a knob that lies; aspect rides the prose, best-effort.
  //   - seed / filename: technicalities; the output path is auto-named + returned.
  // This keeps the tool at view_image-level simplicity (one arg) instead of the
  // 7-arg sprawl that made it the most complex tool in the package.
  const GEN_IMAGE_INPUT = z.object({
    prompt: z
      .string()
      .min(1)
      .describe(
        "What to create, in natural language — be vivid and specific. " +
          'Include any composition cues in the text itself (e.g. "a wide 16:9 ' +
          'landscape of …", "a portrait of …").'
      ),
  });

  const GEN_IMAGE_OK = z.object({
    ok: z.literal(true),
    path: z.string(),
    mime: z.string(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    bytes: z.number().int(),
  });
  const GEN_IMAGE_ERR = z.object({
    ok: z.literal(false),
    reason: z.enum(["invalid_input", "unavailable", "generation_failed"]),
    message: z.string(),
  });

  export const tools = {
    [TOOL_NAMES.generate_image]: tool({
      description:
        "GENERATE a raster image from a text prompt using the user's " +
        "connected image model, saving it into your scratch directory. This " +
        "tool PRODUCES a file — it does NOT show you the image; the result is " +
        "the saved path and its dimensions. To keep the image, copy it from " +
        "scratch into the workspace. Call again with a refined prompt to " +
        "iterate.",
      inputSchema: GEN_IMAGE_INPUT,
      outputSchema: z.union([GEN_IMAGE_OK, GEN_IMAGE_ERR]),
      toModelOutput: ({ output }) => toModelOutput(output as ImageGenOutput),
    }),
  } as const;

  export type Tools = typeof tools;

  // -------------------------------------------------------------------------
  // Model-output lowering
  // -------------------------------------------------------------------------

  type ToolContent = { type: "text"; value: string };

  /**
   * Lower a `generate_image` output to what the model consumes — a TEXT
   * descriptor, always. generate_image is a producer, not a perception tool
   * (see {@link ImageGenOk}): it names the saved path + dimensions so the agent
   * can copy the file out; it never inlines the bytes (a tool result can't
   * deliver pixels on the openai-compatible wire format — it would arrive as
   * undecodable base64 text and blow the context). Error → the error text.
   */
  export function toModelOutput(output: ImageGenOutput): ToolContent {
    if (!output.ok) {
      return { type: "text", value: output.message };
    }
    const dims =
      output.width && output.height ? ` ${output.width}×${output.height}` : "";
    return {
      type: "text",
      value: `Generated image saved to ${output.path} (${output.mime}${dims}). It is in your scratch dir — copy it into the workspace to keep it.`,
    };
  }

  // -------------------------------------------------------------------------
  // Dispatcher
  // -------------------------------------------------------------------------

  /**
   * Resolve a `generate_image` call against an injected generator. Returns
   * `undefined` for any other tool name so a host can chain resolvers. Validates
   * the input here too (the SDK checks `inputSchema` before `execute`, but a
   * malformed call must return a typed `invalid_input` refusal, never throw).
   * Expected generation failures are the generator's own typed `ok: false`.
   */
  export async function resolveToolCall(
    generator: ImageGenerator,
    toolCall: { tool_name: string; input: unknown; dynamic?: boolean }
  ): Promise<ImageGenOutput | undefined> {
    if (toolCall.dynamic) return undefined;
    if (toolCall.tool_name !== TOOL_NAMES.generate_image) return undefined;

    const parsed = GEN_IMAGE_INPUT.safeParse(toolCall.input);
    if (!parsed.success) {
      return {
        ok: false,
        reason: "invalid_input",
        message: "generate_image requires a non-empty `prompt` string.",
      };
    }
    return generator.generate(parsed.data);
  }
}
