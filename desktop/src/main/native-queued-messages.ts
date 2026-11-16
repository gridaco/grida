// GRIDA-SEC-004 — observation-bound queued input display, with no dispatch authority.
import { randomUUID } from "node:crypto";
import type {
  NativeChatMessageAttachment,
  NativeChatQueuedMessage,
} from "@grida/desktop-bridge";
import { NativeFileReference } from "./native-file-reference";

type Image = Readonly<{
  sessionId: string;
  sessionRevision: number;
  inputId: string;
  attachmentUri: string;
  mimeType: string;
  size?: number;
}>;
const PREFIX = "urn:grida:retained-attachment:";
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_IMAGES = 2048;
const MAX_BYTES = 20 * 1024 * 1024;
const CHUNK_BYTES = 256 * 1024;
const MAX_BASE64 = Math.ceil(CHUNK_BYTES / 3) * 4;

/** Read-only display and bounded image selectors for exact queued inputs. */
export class NativeQueuedMessages {
  static readonly capability = "co.grida/session/queued-input-image-chunks";
  static readonly inspectMethod = "_co.grida/session/queued-message";
  static readonly replaceTextCapability = "co.grida/session/replace-text";
  static readonly replaceTextMethod = "_co.grida/session/replace-text";
  static readonly readMethod =
    "_co.grida/session/read-queued-input-image-chunk";
  private readonly images = new Map<string, Image>();
  private readonly identities = new Map<string, string>();

  describe(
    sessionId: string,
    sessionRevision: number,
    inputId: string,
    value: unknown,
    textReplacement = false
  ): NativeChatQueuedMessage {
    const result = record(value);
    if (
      result?.inputId !== inputId ||
      !Array.isArray(result.prompt) ||
      result.prompt.length > 128
    )
      throw unavailable();
    if (result.textOnly !== undefined && typeof result.textOnly !== "boolean")
      throw unavailable();
    if (
      result.textEditable !== undefined &&
      typeof result.textEditable !== "boolean"
    )
      throw unavailable();
    const texts: string[] = [];
    const attachments: NativeChatMessageAttachment[] = [];
    let textBytes = 0;
    for (const value of result.prompt) {
      const part = record(value);
      if (part?.type === "text" && typeof part.text === "string") {
        textBytes += Buffer.byteLength(part.text);
        if (textBytes > 512 * 1024) throw unavailable();
        texts.push(part.text);
      } else if (part?.type === "resource_link") {
        if (
          attachments.length >= 64 ||
          typeof part.name !== "string" ||
          !part.name ||
          Buffer.byteLength(part.name) > 256 ||
          [...part.name].some(
            (character) =>
              character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
          )
        )
          throw unavailable();
        const mimeType = part.mimeType;
        if (
          mimeType !== undefined &&
          mimeType !== null &&
          (typeof mimeType !== "string" ||
            Buffer.byteLength(mimeType) > 128 ||
            !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType))
        )
          throw unavailable();
        const size = part.size;
        if (
          size !== undefined &&
          size !== null &&
          (!Number.isSafeInteger(size) || (size as number) < 0)
        )
          throw unavailable();
        const previewId =
          typeof mimeType === "string" &&
          TYPES.has(mimeType) &&
          typeof part.uri === "string" &&
          part.uri.startsWith(PREFIX) &&
          /^[A-Za-z0-9_.:@/-]{1,256}$/.test(part.uri.slice(PREFIX.length)) &&
          (size === undefined ||
            size === null ||
            ((size as number) > 0 && (size as number) <= MAX_BYTES))
            ? this.offer({
                sessionId,
                sessionRevision,
                inputId,
                attachmentUri: part.uri,
                mimeType,
                ...(typeof size === "number" && { size }),
              })
            : undefined;
        const preview = NativeFileReference.replayedPreview(part._meta);
        attachments.push(
          Object.freeze({
            name: part.name,
            ...(typeof mimeType === "string" && { mimeType }),
            ...(typeof size === "number" && { size }),
            ...(preview && { preview }),
            ...(previewId && { previewId }),
          })
        );
      } else throw unavailable();
    }
    return Object.freeze({
      inputId,
      text: texts.join("\n"),
      ...(typeof result.textOnly === "boolean" && {
        textOnly: result.textOnly,
      }),
      ...(textReplacement &&
        typeof result.textEditable === "boolean" && {
          textEditable: result.textEditable,
        }),
      ...(attachments.length && { attachments: Object.freeze(attachments) }),
    });
  }

  require(
    sessionId: string,
    sessionRevision: number,
    inputId: string,
    token: unknown
  ): Image {
    const image =
      typeof token === "string" ? this.images.get(token) : undefined;
    if (
      !image ||
      image.sessionId !== sessionId ||
      image.sessionRevision !== sessionRevision ||
      image.inputId !== inputId
    )
      throw unavailable();
    return image;
  }

  async read(
    image: Image,
    readChunk: (offset: number) => Promise<unknown>
  ): Promise<ArrayBuffer> {
    let output: Buffer | undefined;
    let offset = 0;
    for (;;) {
      const chunk = record(await readChunk(offset));
      if (
        !chunk ||
        chunk.inputId !== image.inputId ||
        chunk.attachmentUri !== image.attachmentUri ||
        chunk.mimeType !== image.mimeType ||
        chunk.offset !== offset ||
        !Number.isSafeInteger(chunk.totalBytes) ||
        (chunk.totalBytes as number) <= 0 ||
        (chunk.totalBytes as number) > MAX_BYTES ||
        (image.size !== undefined && chunk.totalBytes !== image.size) ||
        typeof chunk.data !== "string" ||
        chunk.data.length > MAX_BASE64
      )
        throw unavailable();
      const bytes = Buffer.from(chunk.data, "base64");
      if (
        !bytes.length ||
        bytes.length > CHUNK_BYTES ||
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
      if (
        chunk.nextOffset !== (next === output.length ? null : next) ||
        (next < output.length && bytes.length !== CHUNK_BYTES)
      )
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

  private offer(image: Image): string {
    const key = JSON.stringify(image);
    const previous = this.identities.get(key);
    if (previous) return previous;
    if (this.images.size >= MAX_IMAGES) {
      const oldest = this.images.keys().next().value!;
      this.identities.delete(JSON.stringify(this.images.get(oldest)!));
      this.images.delete(oldest);
    }
    const token = randomUUID();
    this.images.set(token, Object.freeze(image));
    this.identities.set(key, token);
    return token;
  }
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function unavailable(): Error {
  return new Error("native_chat_queued_message_unavailable");
}
