// GRIDA-SEC-004 — renderer tokens name exact recorded images, never filesystem paths.
import { randomUUID } from "node:crypto";

type Image = Readonly<{
  sessionId: string;
  messageId: string;
  attachmentUri: string;
  size?: number;
  mimeType: string;
  chunked: boolean;
}>;

const MAX_IMAGES = 2048;
const MAX_BYTES = 256 * 1024;
const MAX_BASE64 = Math.ceil(MAX_BYTES / 3) * 4;
const MAX_PIXELS = 16 * 1024 * 1024;
const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
const RASTER_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const PREFIX = "urn:grida:retained-attachment:";
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Bounded Main-owned identities for observational reads of retained originals. */
export class NativeInputImages {
  static readonly capability = "co.grida/session/input-image";
  static readonly readMethod = "_co.grida/session/read-input-image";
  static readonly chunkCapability = "co.grida/session/input-image-chunks";
  static readonly chunkMethod = "_co.grida/session/read-input-image-chunk";
  private readonly images = new Map<string, Image>();
  private readonly identities = new Map<string, string>();

  offer(
    sessionId: string,
    messageId: string,
    uri: unknown,
    size?: number,
    mimeType = "image/png",
    chunked = false
  ): string | undefined {
    if (
      typeof uri !== "string" ||
      !uri.startsWith(PREFIX) ||
      !/^[A-Za-z0-9_.:@/-]{1,256}$/.test(uri.slice(PREFIX.length)) ||
      !RASTER_TYPES.has(mimeType) ||
      (!chunked && mimeType !== "image/png") ||
      (size !== undefined &&
        (!Number.isSafeInteger(size) ||
          size < (chunked ? 1 : 33) ||
          size > (chunked ? MAX_ORIGINAL_BYTES : MAX_BYTES)))
    )
      return undefined;
    const image = {
      sessionId,
      messageId,
      attachmentUri: uri,
      mimeType,
      chunked,
      ...(size !== undefined && { size }),
    };
    const key = this.key(image);
    const previous = this.identities.get(key);
    if (previous) return previous;
    if (this.images.size >= MAX_IMAGES) {
      const oldest = this.images.keys().next().value!;
      this.identities.delete(this.key(this.images.get(oldest)!));
      this.images.delete(oldest);
    }
    const token = randomUUID();
    this.images.set(token, Object.freeze(image));
    this.identities.set(key, token);
    return token;
  }

  require(sessionId: string, token: unknown): Image {
    const image =
      typeof token === "string" ? this.images.get(token) : undefined;
    if (!image || image.sessionId !== sessionId) throw unavailable();
    return image;
  }

  decode(value: unknown, image: Image): ArrayBuffer {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw unavailable();
    const { messageId, attachmentUri, mimeType, data } = value as Record<
      string,
      unknown
    >;
    if (
      messageId !== image.messageId ||
      attachmentUri !== image.attachmentUri ||
      mimeType !== "image/png" ||
      image.mimeType !== "image/png" ||
      typeof data !== "string" ||
      data.length > MAX_BASE64
    )
      throw unavailable();
    const bytes = Buffer.from(data, "base64");
    if (
      bytes.length < 33 ||
      bytes.length > MAX_BYTES ||
      (image.size !== undefined && bytes.length !== image.size) ||
      bytes.toString("base64") !== data ||
      !bytes.subarray(0, 8).equals(PNG) ||
      bytes.readUInt32BE(8) !== 13 ||
      bytes.toString("ascii", 12, 16) !== "IHDR"
    )
      throw unavailable();
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (!width || !height || width * height > MAX_PIXELS) throw unavailable();
    return Uint8Array.from(bytes).buffer;
  }

  /** Assemble one bounded retained original, checking identity at every chunk. */
  async readChunks(
    image: Image,
    read: (offset: number) => Promise<unknown>
  ): Promise<ArrayBuffer> {
    if (!image.chunked) throw unavailable();
    let output: Buffer | undefined;
    let offset = 0;
    for (;;) {
      const value = await read(offset);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw unavailable();
      const chunk = value as Record<string, unknown>;
      if (
        chunk.messageId !== image.messageId ||
        chunk.attachmentUri !== image.attachmentUri ||
        chunk.mimeType !== image.mimeType ||
        chunk.offset !== offset ||
        !Number.isSafeInteger(chunk.totalBytes) ||
        (chunk.totalBytes as number) <= 0 ||
        (chunk.totalBytes as number) > MAX_ORIGINAL_BYTES ||
        (image.size !== undefined && chunk.totalBytes !== image.size) ||
        typeof chunk.data !== "string" ||
        chunk.data.length > MAX_BASE64
      )
        throw unavailable();
      const bytes = Buffer.from(chunk.data, "base64");
      if (
        !bytes.length ||
        bytes.length > MAX_BYTES ||
        bytes.toString("base64") !== chunk.data
      )
        throw unavailable();
      if (!output) output = Buffer.alloc(chunk.totalBytes as number);
      if (
        output.length !== chunk.totalBytes ||
        bytes.length > output.length - offset
      )
        throw unavailable();
      const next = offset + bytes.length;
      if (chunk.nextOffset !== (next === output.length ? null : next))
        throw unavailable();
      output.set(bytes, offset);
      if (chunk.nextOffset === null) return Uint8Array.from(output).buffer;
      offset = next;
    }
  }

  clear(): void {
    this.images.clear();
    this.identities.clear();
  }

  private key(image: Image): string {
    return JSON.stringify([
      image.sessionId,
      image.messageId,
      image.attachmentUri,
      image.size,
      image.mimeType,
      image.chunked,
    ]);
  }
}

function unavailable(): Error {
  return new Error("native_chat_input_image_unavailable");
}
