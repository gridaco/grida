// GRIDA-SEC-004 — native batch sources reuse protected, session-bound custody.
import { createHash } from "node:crypto";
import { AttachmentBatchRequest } from "../bridge/attachment-batch-request";
import { KeyedSerialQueue } from "./keyed-serial-queue";
import { NativeFileReference } from "./native-file-reference";
import { NativeSelectedImages } from "./native-selected-images";

export type NativeWireAttachment =
  | { kind: "keep"; index: number }
  | { kind: "image"; selection: NativeSelectedImages.Descriptor }
  | { kind: "file"; name: string; data: string }
  | {
      kind: "staged_file";
      selection: NativeSelectedImages.Descriptor;
      size: number;
    }
  | {
      kind: "reference";
      reference: ReturnType<typeof NativeFileReference.attachment>;
    };

type Operation = Readonly<{
  sessionId: string;
  requestId: string;
  kind: "input" | "reinsert";
}>;

type Sources = Readonly<{
  selectedImages?: NativeSelectedImages;
  references?: NativeFileReference.Scope;
  files: boolean;
}>;

type Attachment =
  | { kind: "keep"; index: number }
  | { kind: "image"; source: NativeSelectedImages.Source }
  | ({ kind: "file" } & FileBytes)
  | {
      kind: "reference";
      path: string;
      mimeType?: string;
      preview?: ReturnType<typeof NativeFileReference.preview>;
    };
type FileBytes = { name: string; bytes: ArrayBuffer };

const DEFINITE_REFUSALS = new Set([
  "attachment_batch_bytes_limit",
  "attachment_batch_conflict",
  "attachment_count_limit",
  "attachment_storage_unavailable",
  "attachment_storage_unsupported",
  "chat_selection_route_changed",
  "editor_tool_context_requires_attached_act_text",
  "file_attachment_unavailable",
  "file_reference_media_type_invalid",
  "file_reference_name_invalid",
  "file_reference_options_unsupported",
  "file_reference_path_invalid",
  "file_reference_preview_invalid",
  "file_reference_requires_text",
  "file_reference_workspace_mismatch",
  "file_size_limit",
  "image_decode_limit",
  "image_input_unavailable",
  "image_preparation_limit",
  "image_source_size_limit",
  "invalid_prompt_parts",
  "invalid_raster_image",
  "native_agent_frame_limit",
  "native_chat_attachment_custody_unavailable",
  "native_chat_attachment_preparation_failed",
  "native_chat_attachments_invalid",
  "native_chat_file_reference_protected",
  "native_chat_file_reference_unavailable",
  "native_chat_selected_image_busy",
  "native_chat_selected_image_identity_reused",
  "native_chat_selected_image_unavailable",
  "prompt_too_large",
  "protected_root_overlap",
  "queue_attachment_unavailable",
  "queue_checkout_unavailable",
  "queued_text_not_editable",
  "retained_file_name_invalid",
  "scratch_limit",
  "scratch_source_unavailable",
  "scratch_storage_unavailable",
  "scratch_working_copy_unavailable",
  "selected_file_changed",
  "selected_file_options_unsupported",
  "selected_file_requires_text",
  "selected_file_snapshot_required",
  "selected_file_unavailable",
  "selected_image_changed",
  "selected_image_identity_invalid",
  "selected_image_protected",
  "selected_image_size_limit",
  "selected_image_snapshot_unavailable",
  "selected_image_symlink",
  "selected_image_unavailable",
  "session_queue_full",
  "session_revision_changed",
  "stale_session_revision",
  "unsupported_image_format",
  "unsupported_input_modality",
]);

/** Prepare one ordered ACP mutation and track its temporary byte sources. */
export class NativeAttachmentBatch {
  static readonly capability = "co.grida/session/attachment-batches";
  private readonly operations = new KeyedSerialQueue();

  static hasImage(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.some((item) => readRecord(item)?.kind === "image")
    );
  }

  static onlyImages(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => readRecord(item)?.kind === "image")
    );
  }

  static inlineFile(
    name: unknown,
    bytes: unknown
  ): { name: string; data: string } {
    return inlineFile(fileBytes(name, bytes));
  }

  withPrepared<T>(
    operation: Operation,
    value: unknown,
    sources: Sources,
    requireAttached: () => void,
    send: (attachments: readonly NativeWireAttachment[]) => Promise<T>
  ): Promise<T> {
    const key = operationKey(operation);
    return this.operations.run(key, async () => {
      requireAttached();
      const input = parseAttachments(value, operation.kind === "reinsert");
      const attached: NativeWireAttachment[] = [];
      const created: string[] = [];
      const used: string[] = [];
      let inlineBytes = 0;
      let dispatched = false;
      const stage = async (
        index: number,
        source: NativeSelectedImages.Source
      ) => {
        if (!sources.selectedImages)
          throw new Error("native_chat_attachment_custody_unavailable");
        const id = sourceIdentity(key, index);
        const prepared = await sources.selectedImages
          .stage(operation.sessionId, id, source)
          .catch((error: unknown) => {
            if (NativeAttachmentBatch.refused(error)) throw error;
            throw new Error("native_chat_attachment_preparation_failed");
          });
        if (prepared.created) created.push(id);
        used.push(id);
        return prepared.descriptor;
      };
      try {
        for (const [index, attachment] of input.entries()) {
          switch (attachment.kind) {
            case "image": {
              attached.push({
                kind: "image",
                selection: await stage(index, attachment.source),
              });
              break;
            }
            case "reference": {
              if (!sources.references)
                throw new Error("native_chat_file_reference_unavailable");
              const resolved = await NativeFileReference.resolve(
                attachment.path,
                sources.references
              );
              attached.push({
                kind: "reference",
                reference: NativeFileReference.attachment(resolved, attachment),
              });
              break;
            }
            case "file": {
              if (!sources.files)
                throw new Error("file_attachment_unavailable");
              const size = attachment.bytes.byteLength;
              if (size && sources.selectedImages)
                attached.push({
                  kind: "staged_file",
                  selection: await stage(index, attachment),
                  size,
                });
              else {
                inlineBytes += size;
                if (inlineBytes > AttachmentBatchRequest.maxInlineFileBytes)
                  throw new Error("attachment_batch_bytes_limit");
                attached.push({ kind: "file", ...inlineFile(attachment) });
              }
              break;
            }
            case "keep":
              attached.push(attachment);
              break;
          }
          requireAttached();
        }
        dispatched = true;
        const accepted = await send(attached);
        await cleanup(sources.selectedImages, operation.sessionId, used);
        return accepted;
      } catch (error) {
        if (!dispatched || NativeAttachmentBatch.refused(error)) {
          // The host first checks for this request's receipt. A closed checkout
          // with no matching receipt makes even an earlier uncertain stage final.
          const closed =
            dispatched &&
            error instanceof Error &&
            error.message === "queue_checkout_unavailable";
          await cleanup(
            sources.selectedImages,
            operation.sessionId,
            closed ? used : created
          );
        }
        throw error;
      }
    });
  }

  /** Reconcile temporary capture after a verified native receipt. */
  settle(operation: Operation, store: NativeSelectedImages): Promise<void> {
    const key = operationKey(operation);
    return this.operations.run(key, () =>
      cleanup(
        store,
        operation.sessionId,
        Array.from({ length: AttachmentBatchRequest.maxItems }, (_, index) =>
          sourceIdentity(key, index)
        )
      )
    );
  }

  static refused(error: unknown): boolean {
    return error instanceof Error && DEFINITE_REFUSALS.has(error.message);
  }
}

function parseAttachments(value: unknown, allowKeep: boolean): Attachment[] {
  if (
    !Array.isArray(value) ||
    (!value.length && !allowKeep) ||
    value.length > AttachmentBatchRequest.maxItems
  )
    throw new Error("attachment_count_limit");
  const kept = new Set<number>();
  let imageBytes = 0;
  return Array.from(value, (raw): Attachment => {
    const entry = readRecord(raw);
    if (!entry) throw invalid();
    const { kind } = entry;
    switch (kind) {
      case "keep": {
        fields(entry, ["kind", "index"]);
        const index = entry.index;
        if (
          !allowKeep ||
          typeof index !== "number" ||
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= AttachmentBatchRequest.maxItems ||
          kept.has(index)
        )
          throw new Error("queue_attachment_unavailable");
        kept.add(index);
        return { kind, index };
      }
      case "image": {
        fields(entry, [
          "kind",
          "name",
          "path",
          "bytes",
          "sha256",
          "size",
          "lastModified",
        ]);
        imageBytes +=
          entry.bytes instanceof ArrayBuffer
            ? entry.bytes.byteLength
            : typeof entry.size === "number" &&
                Number.isSafeInteger(entry.size) &&
                entry.size > 0
              ? entry.size
              : 0;
        if (imageBytes > AttachmentBatchRequest.maxImageBytes)
          throw new Error("attachment_batch_bytes_limit");
        const { name, path, bytes, sha256, size, lastModified } = entry;
        return {
          kind,
          source: { name, path, bytes, sha256, size, lastModified },
        };
      }
      case "file": {
        fields(entry, ["kind", "name", "bytes"]);
        return { kind, ...fileBytes(entry.name, entry.bytes) };
      }
      case "reference": {
        fields(entry, ["kind", "path", "mimeType", "preview"]);
        if (typeof entry.path !== "string") throw invalid();
        return {
          kind,
          path: entry.path,
          mimeType: NativeFileReference.mediaType(entry.mimeType),
          preview: NativeFileReference.preview(entry.preview),
        };
      }
      default:
        throw invalid();
    }
  });
}

function fileBytes(name: unknown, bytes: unknown): FileBytes {
  if (
    typeof name !== "string" ||
    !name ||
    Buffer.byteLength(name) > 256 ||
    name.includes("/") ||
    name.includes("\\") ||
    /\p{Cc}/u.test(name)
  )
    throw new Error("retained_file_name_invalid");
  if (
    !(bytes instanceof ArrayBuffer) ||
    bytes.byteLength > AttachmentBatchRequest.maxFileBytes
  )
    throw new Error("file_size_limit");
  return { name, bytes };
}

function inlineFile({ name, bytes }: FileBytes) {
  return { name, data: Buffer.from(bytes).toString("base64") };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function fields(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw invalid();
}

function invalid(): Error {
  return new Error("native_chat_attachments_invalid");
}

function operationKey(operation: Operation): string {
  return JSON.stringify([
    operation.sessionId,
    operation.kind,
    operation.requestId,
  ]);
}

function sourceIdentity(key: string, index: number): string {
  return `batch-source/${createHash("sha256").update(key).update(`:${index}`).digest("hex")}`;
}

async function cleanup(
  store: NativeSelectedImages | undefined,
  sessionId: string,
  ids: readonly string[]
): Promise<void> {
  if (store)
    await Promise.allSettled(ids.map((id) => store.complete(sessionId, id)));
}
