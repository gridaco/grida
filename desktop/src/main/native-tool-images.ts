// GRIDA-SEC-004 — tool-image tokens bind exact retained results, never source paths.
import { randomUUID } from "node:crypto";
import type { NativeChatToolImage } from "@grida/desktop-bridge";

type Image = Readonly<{
  sessionId: string;
  turnId: string;
  toolCallId: string;
  mediaId: string;
  contentIndex: number;
  mimeType: "image/png";
  totalBytes: number;
}>;

const MAX_IMAGES = 2048;
const MAX_RESULT_IMAGES = 8;
const MAX_CHUNK_BYTES = 256 * 1024;
const MAX_BASE64 = Math.ceil(MAX_CHUNK_BYTES / 3) * 4;
const MAX_PIXELS = 16 * 1024 * 1024;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Purpose-scoped read identities for the captured pixels of successful tool results. */
export class NativeToolImages {
  static readonly capability = "co.grida/session/tool-images";
  static readonly readMethod = "_co.grida/session/read-tool-image-chunk";
  static readonly maxBytes = 384 * 1024;
  private readonly images = new Map<string, Image>();
  private readonly identities = new Map<string, string>();

  project(
    sessionId: string,
    turnId: string,
    toolCallId: string,
    value: unknown
  ): readonly NativeChatToolImage[] {
    if (!Array.isArray(value) || value.length > MAX_RESULT_IMAGES)
      throw unavailable();
    const indices = new Set<number>();
    return value.map((value) => {
      const media = record(value);
      if (
        typeof media.mediaId !== "string" ||
        !media.mediaId.startsWith("workspace-view/") ||
        media.mediaId.length <= "workspace-view/".length ||
        Buffer.byteLength(media.mediaId) > 512 ||
        /\p{Cc}/u.test(media.mediaId) ||
        !Number.isSafeInteger(media.contentIndex) ||
        (media.contentIndex as number) < 0 ||
        (media.contentIndex as number) > 1023 ||
        media.mimeType !== "image/png" ||
        !Number.isSafeInteger(media.totalBytes) ||
        (media.totalBytes as number) < 1 ||
        (media.totalBytes as number) > NativeToolImages.maxBytes ||
        indices.has(media.contentIndex as number)
      )
        throw unavailable();
      indices.add(media.contentIndex as number);
      const image: Image = Object.freeze({
        sessionId,
        turnId,
        toolCallId,
        mediaId: media.mediaId,
        contentIndex: media.contentIndex as number,
        mimeType: "image/png",
        totalBytes: media.totalBytes as number,
      });
      const key = this.key(image);
      let token = this.identities.get(key);
      if (!token) {
        if (this.images.size >= MAX_IMAGES) {
          const oldest = this.images.keys().next().value!;
          this.identities.delete(this.key(this.images.get(oldest)!));
          this.images.delete(oldest);
        }
        token = randomUUID();
        this.images.set(token, image);
        this.identities.set(key, token);
      }
      return Object.freeze({
        previewId: token,
        mimeType: image.mimeType,
        size: image.totalBytes,
      });
    });
  }

  require(sessionId: string, token: unknown): Image {
    const image =
      typeof token === "string" ? this.images.get(token) : undefined;
    if (!image || image.sessionId !== sessionId) throw unavailable();
    return image;
  }

  /** Decode at most two canonical chunks, checking the exact result identity each time. */
  async readChunks(
    image: Image,
    read: (offset: number) => Promise<unknown>
  ): Promise<ArrayBuffer> {
    const output = Buffer.alloc(image.totalBytes);
    let offset = 0;
    while (offset < output.length) {
      const chunk = record(await read(offset));
      if (
        chunk.sessionId !== image.sessionId ||
        chunk.turnId !== image.turnId ||
        chunk.toolCallId !== image.toolCallId ||
        chunk.mediaId !== image.mediaId ||
        chunk.contentIndex !== image.contentIndex ||
        chunk.mimeType !== image.mimeType ||
        chunk.totalBytes !== image.totalBytes ||
        chunk.offset !== offset ||
        typeof chunk.data !== "string" ||
        chunk.data.length > MAX_BASE64
      )
        throw unavailable();
      const bytes = Buffer.from(chunk.data, "base64");
      const expected = Math.min(MAX_CHUNK_BYTES, output.length - offset);
      const next = offset + expected;
      if (
        bytes.length !== expected ||
        bytes.toString("base64") !== chunk.data ||
        chunk.nextOffset !== (next === output.length ? null : next)
      )
        throw unavailable();
      output.set(bytes, offset);
      offset = next;
    }
    if (
      output.length < 33 ||
      !output.subarray(0, 8).equals(PNG) ||
      output.readUInt32BE(8) !== 13 ||
      output.toString("ascii", 12, 16) !== "IHDR"
    )
      throw unavailable();
    const width = output.readUInt32BE(16),
      height = output.readUInt32BE(20);
    if (!width || !height || width * height > MAX_PIXELS) throw unavailable();
    return Uint8Array.from(output).buffer;
  }

  clear(): void {
    this.images.clear();
    this.identities.clear();
  }

  private key(image: Image): string {
    return JSON.stringify([
      image.sessionId,
      image.turnId,
      image.toolCallId,
      image.mediaId,
      image.contentIndex,
      image.totalBytes,
    ]);
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw unavailable();
  return value as Record<string, unknown>;
}

function unavailable(): Error {
  return new Error("native_chat_tool_image_unavailable");
}
