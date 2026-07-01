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
   * What the host's generator consumes — the validated {@link GEN_IMAGE_INPUT}.
   */
  export type ImageGenInput = {
    /** What to create, in natural language (the validated tool prompt). */
    prompt: string;
    /**
     * Reference images to condition on (image-to-image), supplied by the agent.
     * Each is a dumb input — a file path, an https URL, or a data URL — the host
     * resolves automatically (a path is read + inlined; a URL passes through). An
     * unresolvable reference comes back as a typed `invalid_input` with a clear
     * message. Absent/empty ⇒ text-to-image.
     */
    references?: string[];
  };

  /**
   * What the host's generator returns. `generate_image` is a PRODUCER, not a
   * perception tool (SDK-design D3 — render vs. perceive are separate surfaces):
   * the absolute scratch `path` (so the agent can copy the file out) + descriptor
   * metadata, and the base64 `data` for the CLIENT to render the produced image.
   *
   * Crucially, `data` is for the human UI, NOT the model: {@link toModelOutput}
   * lowers the result to a TEXT descriptor (path + dims) and never inlines the
   * bytes. A tool result can't deliver pixels to the model on the OpenAI-
   * compatible wire format (OpenRouter/Ollama `JSON.stringify` a `role:"tool"`
   * content output → undecodable base64 TEXT that bloats the context); and the
   * model doesn't need to "see" what it generated to place it. So the output is
   * the full record (bytes included, for display/persistence), while the
   * model-facing projection stays path-only. (Perceiving an image is
   * `view_image`'s job — and even that only works on Anthropic-native.)
   */
  export type ImageGenOk = {
    ok: true;
    /** Absolute path of the written file under the session scratch dir. */
    path: string;
    mime: string;
    width?: number;
    height?: number;
    bytes: number;
    /** Base64 image bytes — for the CLIENT to render the result. NEVER lowered
     *  to the model (see the type doc + {@link toModelOutput}). */
    data?: string;
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

  // Two arguments, both genuine agent intent. Everything else is deliberately
  // NOT a parameter:
  //   - model / provider: the user's connected choice (settings), not the
  //     agent's — and the agent has no way to enumerate valid ids.
  //   - size / aspect_ratio: silently ineffective on the primary BYOK path
  //     (verified — seedream on OpenRouter returns square regardless of the
  //     param), so a knob that lies; aspect rides the prose, best-effort.
  //   - seed / filename: technicalities; the output path is auto-named + returned.
  // `references` IS exposed (unlike the above) because it is intent the agent can
  // GROUND and EXPRESS — a path it holds, a URL it gathered — and the system
  // auto-resolves it (TOOL-DESIGN, Lens 5). The tool conditions on whatever it's
  // given; deciding WHAT to reference (e.g. forwarding design_search picks) is the
  // agent's job, a layer above this tool.
  const GEN_IMAGE_INPUT = z.object({
    prompt: z
      .string()
      .min(1)
      .describe(
        "What to create, in natural language — be vivid and specific. " +
          'Include any composition cues in the text itself (e.g. "a wide 16:9 ' +
          'landscape of …", "a portrait of …").'
      ),
    references: z
      .array(z.string().min(1))
      .optional()
      .describe(
        "Optional reference image(s) to condition on (image-to-image). Each is a " +
          "workspace file path OR an image URL — the system reads/fetches it for " +
          "you. Use this to build on gathered references or to iterate on a " +
          "previous image (pass its path). Omit for plain text-to-image."
      ),
  });

  const GEN_IMAGE_OK = z.object({
    ok: z.literal(true),
    path: z.string(),
    mime: z.string(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    bytes: z.number().int(),
    // For the CLIENT to render the produced image; never lowered to the model
    // (`toModelOutput` is text-only). See the `ImageGenOk` doc.
    data: z.string().optional(),
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
    // `references` (image-to-image inputs) ride the validated model input; the
    // generator resolves each path/URL. The tool does not know where they came
    // from — that's the agent's orchestration (e.g. forwarding design_search picks).
    return generator.generate(parsed.data);
  }
}
