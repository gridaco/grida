/**
 * `@grida/agent/vision` — the agent's **visual perception** surface.
 *
 * `read_file` returns text and refuses pixels — an honest gate. `view_image`
 * is its modality twin: it returns a provider-native image block so the model
 * can *see* a file, not read its bytes as a string. The same source has two
 * perceptions — its source text (`read_file`, the default) and its rendered
 * pixels (`view_image`, on demand). Splitting the tools is what lets a
 * text-shaped source (an SVG, a screenshot) be seen without making every read
 * multimodal. See `docs/wg/ai/agent/vision.md` for the contract.
 *
 * v1 accepts raster files by path (png / jpeg / webp / gif) and reuses the
 * proven multimodal path: the tool's `execute` returns the bytes (base64) in
 * its output, and `tool({ toModelOutput })` lowers them to a `media` content
 * part. That lowering re-applies on every rebuild from the persisted parts
 * (`convertToModelMessages({ tools })`), so the perception survives across
 * turns without a bespoke replay branch. Rendering non-bitmap sources
 * (svg / code → pixels) is the planned follow-up under this same tool name.
 *
 * Like `AgentFs`, the surface is a single `AgentVision` namespace: the tool
 * table, the byte-source contract it resolves against, the dispatcher, and
 * the mime/size helpers. The tool is **client-resolved by default** (no
 * `execute`); a host injects a `ByteReader` to make it server-resolved.
 *
 *   import { AgentVision } from "@grida/agent/vision";
 *   const out = await AgentVision.resolveToolCall(fs, toolCall); // fs: AgentFs
 */

import { tool } from "ai";
import { z } from "zod";

export namespace AgentVision {
  // -------------------------------------------------------------------------
  // Contract
  // -------------------------------------------------------------------------

  /**
   * The byte source `view_image` resolves a path against. `AgentFs` satisfies
   * it (`AgentFs.readBytes`), but vision is deliberately decoupled — the bytes
   * may come from the workspace fs, a dropped-folder read scope, or scratch.
   */
  export interface ByteReader {
    readBytes(path: string): Promise<Uint8Array | null>;
  }

  /**
   * Decoded-byte ceiling. Mirrors the inline-attachment backstop
   * (`MAX_INLINE_FILE_BYTES`, runtime/run-input.ts) so a path-loaded image and
   * a pasted image obey the same limit. Host-tunable later; a constant for now.
   */
  export const MAX_BYTES = 8 * 1024 * 1024;

  /** Raster mime types v1 perceives. The render path (svg/text) lands later. */
  export const SUPPORTED_MIMES = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
  ] as const;
  export type SupportedMime = (typeof SUPPORTED_MIMES)[number];

  // -------------------------------------------------------------------------
  // Tool table
  // -------------------------------------------------------------------------

  export const TOOL_NAMES = {
    view_image: "view_image",
  } as const;

  export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

  const PATH_DESCRIPTION =
    "Absolute path in the agent filesystem, starting with `/`. " +
    "Examples: `/icon.png`, `/shots/before.jpg`.";

  /**
   * Success output. `data` is the base64 payload `toModelOutput` lowers to a
   * `media` block — it is NOT meant for the model to read as JSON (the lowering
   * overrides the default serialization). It is OPTIONAL because the retention
   * pass (message-view) strips it from stale turns; when absent, the tool
   * lowers to a cheap text descriptor instead of re-sending pixels.
   */
  const VIEW_IMAGE_OK = z.object({
    ok: z.literal(true),
    mime: z.enum(SUPPORTED_MIMES),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    bytes: z.number().int(),
    data: z.string().optional(),
  });
  export type ViewImageOk = z.infer<typeof VIEW_IMAGE_OK>;

  const VIEW_IMAGE_ERR = z.object({
    ok: z.literal(false),
    reason: z.enum(["not_found", "unsupported_type", "too_large"]),
    message: z.string(),
  });
  export type ViewImageErr = z.infer<typeof VIEW_IMAGE_ERR>;

  export type ViewImageOutput = ViewImageOk | ViewImageErr;

  export const tools = {
    [TOOL_NAMES.view_image]: tool({
      description:
        "SEE an image file as pixels — the visual twin of read_file (which " +
        "returns text only). Call this to perceive the rendered/visual " +
        "content of a raster image (png, jpeg, webp, gif) at a path; use " +
        "read_file when you want a file's text. After you've described an " +
        "image, it may be dropped from later context to save tokens — call " +
        "view_image again to re-view it.",
      inputSchema: z.object({
        path: z.string().describe(PATH_DESCRIPTION),
      }),
      outputSchema: z.union([VIEW_IMAGE_OK, VIEW_IMAGE_ERR]),
      // The seam that makes the model SEE pixels instead of reading the output
      // as JSON. Re-applied on every rebuild from persisted parts, so the
      // perception is durable across turns (see file header).
      toModelOutput: ({ input, output }) => toModelOutput(input, output),
    }),
  } as const;

  export type Tools = typeof tools;

  // -------------------------------------------------------------------------
  // Model-output lowering
  // -------------------------------------------------------------------------

  /**
   * Lower a `view_image` output to what the model actually consumes:
   *  - success WITH bytes  → a `media` image block (the model sees pixels).
   *  - success WITHOUT bytes (retention-elided) → a text descriptor naming the
   *    image so the model knows it existed and can re-view it.
   *  - error → the error text.
   */
  export function toModelOutput(
    input: unknown,
    output: ViewImageOutput
  ):
    | { type: "text"; value: string }
    | {
        type: "content";
        value: { type: "media"; mediaType: string; data: string }[];
      } {
    if (!output.ok) {
      return { type: "text", value: output.message };
    }
    const path = (input as { path?: string } | null)?.path ?? "image";
    const dims =
      output.width && output.height ? ` ${output.width}×${output.height}` : "";
    if (output.data) {
      return {
        type: "content",
        value: [{ type: "media", mediaType: output.mime, data: output.data }],
      };
    }
    // Elided by the retention pass — name it, don't re-send it.
    return {
      type: "text",
      value: `[image ${path} (${output.mime}${dims}) viewed earlier — call view_image to re-view]`,
    };
  }

  // -------------------------------------------------------------------------
  // Dispatcher
  // -------------------------------------------------------------------------

  type ViewImageInput = { path: string };

  /**
   * Resolve a `view_image` call against a `ByteReader`. Async (the read is),
   * unlike `AgentFs.resolveToolCall` (in-memory). Returns `undefined` for any
   * other tool name so a host can chain resolvers. Returns the OK output
   * carrying base64 `data`; the retention pass decides whether the model still
   * sees the pixels on a later turn.
   */
  export async function resolveToolCall(
    reader: ByteReader,
    toolCall: { tool_name: string; input: unknown; dynamic?: boolean }
  ): Promise<ViewImageOutput | undefined> {
    if (toolCall.dynamic) return undefined;
    if (toolCall.tool_name !== TOOL_NAMES.view_image) return undefined;

    const { path } = toolCall.input as ViewImageInput;
    const bytes = await reader.readBytes(path);
    if (bytes === null) {
      return {
        ok: false,
        reason: "not_found",
        message: `No file at ${path}.`,
      };
    }
    if (bytes.byteLength > MAX_BYTES) {
      return {
        ok: false,
        reason: "too_large",
        message: `Image at ${path} is ${bytes.byteLength} bytes; the limit is ${MAX_BYTES}.`,
      };
    }
    const sniffed = sniff(bytes);
    if (sniffed === null) {
      return {
        ok: false,
        reason: "unsupported_type",
        message: `${path} is not a supported raster image (png, jpeg, webp, gif).`,
      };
    }
    return {
      ok: true,
      mime: sniffed.mime,
      ...(sniffed.width ? { width: sniffed.width } : {}),
      ...(sniffed.height ? { height: sniffed.height } : {}),
      bytes: bytes.byteLength,
      data: toBase64(bytes),
    };
  }

  // -------------------------------------------------------------------------
  // Format sniffing (magic bytes; never trust the extension)
  // -------------------------------------------------------------------------

  export type Sniffed = {
    mime: SupportedMime;
    width?: number;
    height?: number;
  };

  /**
   * Identify a raster image by its magic bytes and extract dimensions where
   * cheap and exact (PNG, GIF). JPEG/WebP dims are left undefined in v1 — the
   * mime is what the provider needs; dims are descriptor sugar.
   */
  export function sniff(b: Uint8Array): Sniffed | null {
    // PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR width/height at bytes 16..24 (BE).
    if (
      b.length >= 24 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47
    ) {
      return {
        mime: "image/png",
        width: readU32BE(b, 16),
        height: readU32BE(b, 20),
      };
    }
    // GIF: "GIF87a"/"GIF89a", logical-screen width/height at 6..10 (LE).
    if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
      return {
        mime: "image/gif",
        width: b[6] | (b[7] << 8),
        height: b[8] | (b[9] << 8),
      };
    }
    // JPEG: starts FF D8 FF.
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
      return { mime: "image/jpeg" };
    }
    // WebP: "RIFF"...."WEBP".
    if (
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50
    ) {
      return { mime: "image/webp" };
    }
    return null;
  }

  function readU32BE(b: Uint8Array, o: number): number {
    return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  }

  function toBase64(b: Uint8Array): string {
    // Node Buffer when available (server/desktop); btoa fallback (browser).
    // Both reached via globalThis so the neutral build needs no node/dom lib.
    const g = globalThis as {
      Buffer?: { from(x: Uint8Array): { toString(e: string): string } };
      btoa?(s: string): string;
    };
    if (g.Buffer) return g.Buffer.from(b).toString("base64");
    if (g.btoa) {
      // Build the binary string in chunks — a char-by-char `+=` over an image
      // is quadratic; `fromCharCode(...chunk)` is linear. Chunk under the arg
      // limit of `apply`.
      const CHUNK = 0x8000;
      const parts: string[] = [];
      for (let i = 0; i < b.length; i += CHUNK) {
        parts.push(String.fromCharCode(...b.subarray(i, i + CHUNK)));
      }
      return g.btoa(parts.join(""));
    }
    throw new Error("no base64 encoder available (neither Buffer nor btoa)");
  }
}
