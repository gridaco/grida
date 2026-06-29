/**
 * `@grida/agent/gen` — the agent's **media generation** surface.
 *
 * `view_image` lets the model SEE a file; `generate_image` lets it MAKE one.
 * The tool is the producer twin of vision: it takes a prompt, generates a
 * raster image with the user's connected provider, writes the bytes into the
 * session **scratch** dir (WG `scratch.md` — the default sink for produced
 * files, ephemeral; the model promotes it into the workspace to keep it), and
 * lowers the result to a provider-native `media` block so the model perceives
 * what it just produced. The same multimodal lowering `view_image` uses, so a
 * generated image survives across turns without a bespoke replay branch.
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

  /** Image providers a generate call may target (mirrors the catalog union). */
  export const IMAGE_PROVIDERS = ["vercel", "fal", "openrouter"] as const;
  export type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

  /**
   * The validated `generate_image` input. The generator impl consumes this
   * shape (the host's node-only binding), so it is exported.
   */
  export type ImageGenInput = z.infer<typeof GEN_IMAGE_INPUT>;

  /**
   * What the host's generator returns. Success carries the absolute scratch
   * `path` (so the model can promote the file), the `data` base64 payload that
   * `toModelOutput` lowers to a `media` block (NOT for the model to read as
   * JSON), and descriptor metadata. `data` is optional because the retention
   * pass (message-view) strips it from stale turns — when absent the tool
   * lowers to a text descriptor that still names the path.
   */
  export type ImageGenOk = {
    ok: true;
    /** Absolute path of the written file under the session scratch dir. */
    path: string;
    mime: string;
    width?: number;
    height?: number;
    bytes: number;
    data?: string;
  };
  export type ImageGenErr = {
    ok: false;
    reason: "invalid_input" | "unavailable" | "generation_failed";
    message: string;
  };
  export type ImageGenOutput = ImageGenOk | ImageGenErr;

  /**
   * Max base64 length we inline as a media block for the MODEL to perceive. The
   * produced image is ALWAYS written to scratch at full resolution and ALWAYS
   * persisted/streamed to the client — this bounds only what rides into the
   * model's context. A multi-MB image sent as a data-URL can blow the context
   * window: gpt-image-2's ~4 MB PNG ≈ ~1M base64 tokens overran OpenRouter's
   * 1M-token guard and failed the turn *after* the image was already produced.
   * Above this, `toModelOutput` lowers to a text descriptor (path + dims): the
   * run stays safe and the file is still promotable; the model just doesn't see
   * the pixels. ~1.5 MiB (≈ 390k tokens) clears typical images while bounding
   * the worst case. Perceiving large art needs a DOWNSCALED preview — the
   * follow-up (this is the robust floor, not the final perception story).
   */
  export const PERCEPTION_MAX_BASE64 = 1.5 * 1024 * 1024;

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

  const GEN_IMAGE_INPUT = z.object({
    prompt: z
      .string()
      .min(1)
      .describe("What to generate. Be specific and descriptive."),
    model_id: z
      .string()
      .optional()
      .describe(
        "Catalog model id (e.g. an image model from the connected provider). " +
          "Omit to use a sensible default the user has a key for."
      ),
    provider: z
      .enum(IMAGE_PROVIDERS)
      .optional()
      .describe("Force a specific provider. Omit to auto-pick by precedence."),
    aspect_ratio: z
      .string()
      .regex(/^\d+:\d+$/)
      .optional()
      .describe('Aspect ratio as "<w>:<h>", e.g. "16:9".'),
    size: z
      .string()
      .regex(/^\d+x\d+$/)
      .optional()
      .describe('Exact pixel size as "<w>x<h>", e.g. "1024x1024".'),
    seed: z.number().int().optional().describe("Deterministic seed."),
    filename: z
      .string()
      .optional()
      .describe(
        "Basename to save as in your scratch dir (no path separators). " +
          "Omit to get an auto name. The result returns the full path."
      ),
  });

  // Output is described to the model as a flat union; the real payload is
  // produced by the host generator and `toModelOutput` overrides how it's
  // lowered (the model never reads `data` as JSON).
  const GEN_IMAGE_OK = z.object({
    ok: z.literal(true),
    path: z.string(),
    mime: z.string(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    bytes: z.number().int(),
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
        "connected image provider. The image is saved into your scratch " +
        "directory and shown to you so you can see the result. To keep it, " +
        "promote it: move or copy the file into the workspace. Call again to " +
        "iterate (a new prompt, seed, or size).",
      inputSchema: GEN_IMAGE_INPUT,
      outputSchema: z.union([GEN_IMAGE_OK, GEN_IMAGE_ERR]),
      // The seam that makes the model SEE the produced pixels (and learn the
      // path) instead of reading the output as JSON. Re-applied on every
      // rebuild from persisted parts, so the perception is durable across turns
      // (matches AgentVision; the retention pass elides `data` when stale).
      toModelOutput: ({ output }) => toModelOutput(output as ImageGenOutput),
    }),
  } as const;

  export type Tools = typeof tools;

  // -------------------------------------------------------------------------
  // Model-output lowering
  // -------------------------------------------------------------------------

  type ToolContent =
    | { type: "text"; value: string }
    | {
        type: "content";
        value: (
          | { type: "text"; text: string }
          | { type: "media"; mediaType: string; data: string }
        )[];
      };

  /**
   * Lower a `generate_image` output to what the model consumes:
   *  - success WITH bytes UNDER the perception cap → a text line naming the
   *    saved path + a `media` block (the model sees the image AND knows where it
   *    landed, so it can promote it).
   *  - success WITHOUT bytes (retention-elided) OR over the perception cap (a
   *    multi-MB image that would blow the model context) → a text descriptor
   *    that still names the path so promotion works without the pixels.
   *  - error → the error text.
   */
  export function toModelOutput(output: ImageGenOutput): ToolContent {
    if (!output.ok) {
      return { type: "text", value: output.message };
    }
    const dims =
      output.width && output.height ? ` ${output.width}×${output.height}` : "";
    if (output.data && output.data.length <= PERCEPTION_MAX_BASE64) {
      return {
        type: "content",
        value: [
          {
            type: "text",
            text: `Generated image saved to ${output.path} (${output.mime}${dims}). Shown below. To keep it, copy it into the workspace.`,
          },
          { type: "media", mediaType: output.mime, data: output.data },
        ],
      };
    }
    // No inline pixels — retention-elided, or too large to send to the model.
    // Name the path so the model can still copy the file into the workspace.
    return {
      type: "text",
      value: `[generated image saved to ${output.path} (${output.mime}${dims}); it is in your scratch dir — copy it into the workspace to keep it]`,
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
