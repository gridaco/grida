// GRIDA-SEC-004 — selected paths come from Electron's File custody in preload.
import {
  NATIVE_CHAT_MAX_ATTACHMENTS,
  NATIVE_CHAT_MAX_ATTACHMENT_IMAGE_BYTES,
} from "@grida/desktop-bridge";
import { FileReferenceRequest } from "./file-reference-request";
import { SelectedImageRequest } from "./selected-image-request";

export namespace AttachmentBatchRequest {
  // Transport limits negotiated by the native attachment-batches capability.
  export const maxItems = NATIVE_CHAT_MAX_ATTACHMENTS;
  export const maxFileBytes = 256 * 1024;
  export const maxInlineFileBytes = 384 * 1024;
  export const maxImageBytes = NATIVE_CHAT_MAX_ATTACHMENT_IMAGE_BYTES;

  export async function prepare(
    value: unknown,
    pathForFile: (file: File) => string,
    allowKeep: boolean
  ): Promise<readonly Record<string, unknown>[]> {
    if (!Array.isArray(value) || value.length > maxItems)
      throw new Error("attachment_count_limit");
    const attachments: Record<string, unknown>[] = [];
    let imageBytes = 0;
    const kept = new Set<number>();
    for (const raw of value) {
      const entry = record(raw);
      switch (entry.kind) {
        case "keep": {
          fields(entry, ["kind", "index"]);
          const index = entry.index;
          if (
            !allowKeep ||
            typeof index !== "number" ||
            !Number.isSafeInteger(index) ||
            index < 0 ||
            index >= maxItems ||
            kept.has(index)
          )
            throw new Error("queue_attachment_unavailable");
          kept.add(index);
          attachments.push({ kind: "keep", index });
          break;
        }
        case "file": {
          fields(entry, ["kind", "name", "bytes"]);
          const { name, bytes } = entry;
          if (
            typeof name !== "string" ||
            !(bytes instanceof ArrayBuffer) ||
            bytes.byteLength > maxFileBytes
          )
            throw new Error("file_size_limit");
          attachments.push({ kind: "file", name, bytes });
          break;
        }
        case "reference": {
          fields(entry, ["kind", "file", "mimeType", "preview"]);
          attachments.push(FileReferenceRequest.from(entry, pathForFile));
          break;
        }
        case "image":
        case "png": {
          const isPng = entry.kind === "png";
          fields(
            entry,
            isPng ? ["kind", "name", "bytes"] : ["kind", "file", "originalFile"]
          );
          if (
            isPng &&
            (!(entry.bytes instanceof ArrayBuffer) ||
              typeof entry.name !== "string" ||
              entry.bytes.byteLength > 20 * 1024 * 1024)
          )
            throw new Error("attachment_batch_bytes_limit");
          const prepared = await prepareImage(entry, isPng, pathForFile);
          imageBytes += prepared.size as number;
          if (imageBytes > maxImageBytes)
            throw new Error("attachment_batch_bytes_limit");
          attachments.push({ kind: "image", ...prepared });
          break;
        }
        default:
          throw new Error("native_chat_attachments_invalid");
      }
    }
    return attachments;
  }

  async function prepareImage(
    entry: Record<string, unknown>,
    isPng: boolean,
    pathForFile: (file: File) => string
  ): Promise<Record<string, unknown>> {
    try {
      const selected = isPng
        ? {
            file: new File([entry.bytes as ArrayBuffer], entry.name as string, {
              type: "image/png",
            }),
          }
        : { file: entry.file, originalFile: entry.originalFile };
      return await SelectedImageRequest.from(selected, pathForFile);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "native_chat_selected_image_unavailable"
      )
        throw error;
      throw new Error("native_chat_attachment_preparation_failed");
    }
  }

  function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("native_chat_attachments_invalid");
    return value as Record<string, unknown>;
  }

  function fields(
    value: Record<string, unknown>,
    keys: readonly string[]
  ): void {
    if (Object.keys(value).some((key) => !keys.includes(key)))
      throw new Error("native_chat_attachments_invalid");
  }
}
