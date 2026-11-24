import type {
  NativeChatAttachmentInput,
  NativeChatMessageAttachment,
} from "@grida/desktop-bridge";
import { NATIVE_CHAT_MAX_ATTACHMENTS } from "@grida/desktop-bridge";

/** Ordered composer attachments. Card identity is independent of name and bytes. */
export namespace AttachmentBatch {
  export type Entry = Readonly<{
    id: string;
    card: NativeChatMessageAttachment;
    input?:
      | NativeChatAttachmentInput
      | Readonly<{ kind: "keep"; index: number }>;
  }>;

  export type Draft = readonly Entry[];

  export const empty: Draft = Object.freeze([]);
  const pngPreviews = new WeakMap<ArrayBuffer, Blob>();

  export function validStored(value: unknown): value is Draft {
    if (!Array.isArray(value) || value.length > NATIVE_CHAT_MAX_ATTACHMENTS)
      return false;
    const ids = new Set<string>();
    return value.every((entry: Entry) => {
      if (
        typeof entry?.id !== "string" ||
        ids.has(entry.id) ||
        typeof entry.card?.name !== "string" ||
        !entry.card.name ||
        entry.card.name.length > 256
      )
        return false;
      ids.add(entry.id);
      const input = entry.input;
      if (!input) return input === undefined;
      if (input.kind === "keep")
        return (
          Number.isSafeInteger(input.index) &&
          input.index >= 0 &&
          input.index < NATIVE_CHAT_MAX_ATTACHMENTS
        );
      if (input.kind === "image")
        return (
          input.originalFile === undefined &&
          input.file instanceof File &&
          input.file.size > 0 &&
          input.file.size <= 20 * 1024 * 1024
        );
      return (
        (input.kind === "file" || input.kind === "png") &&
        typeof input.name === "string" &&
        input.bytes instanceof ArrayBuffer &&
        input.bytes.byteLength <= 256 * 1024
      );
    });
  }

  export function keep(
    card: NativeChatMessageAttachment,
    index: number
  ): Entry {
    return { id: `keep-${index}`, card, input: { kind: "keep", index } };
  }

  export function checkout(
    cards: readonly NativeChatMessageAttachment[],
    indexes: readonly number[],
    draft?: Draft | null
  ): Draft {
    const originals = cards.map((card, i) => keep(card, indexes[i]));
    if (!draft) return originals;
    const byIndex = new Map(indexes.map((index, i) => [index, originals[i]]));
    return draft.map((entry) =>
      entry.input?.kind === "keep"
        ? (byIndex.get(entry.input.index) ?? { id: entry.id, card: entry.card })
        : entry
    );
  }

  export function entry(
    input: NativeChatAttachmentInput,
    card?: NativeChatMessageAttachment
  ): Entry {
    const details =
      "file" in input
        ? {
            name: input.file.name.slice(0, 256),
            size: input.file.size,
            mimeType: input.file.type || undefined,
          }
        : {
            name: input.name,
            size: input.bytes.byteLength,
            ...(input.kind === "png" && { mimeType: "image/png" }),
          };
    return { id: crypto.randomUUID(), card: card ?? details, input };
  }

  /** A restored browser File has no native reference grant. */
  export function persisted(entries: Draft): Draft {
    return entries.map(({ id, card, input }) => {
      if (input?.kind === "reference") return { id, card };
      if (input?.kind === "image") {
        const { originalFile: _disk, ...snapshot } = input;
        return { id, card, input: snapshot };
      }
      if (input?.kind === "keep") {
        const { previewId: _attachment, ...metadata } = card;
        return { id, card: metadata, input };
      }
      return { id, card, input };
    });
  }

  export function inputs(
    entries: Draft
  ): NativeChatAttachmentInput[] | undefined {
    const result: NativeChatAttachmentInput[] = [];
    for (const { input } of entries) {
      if (!input || input.kind === "keep") return undefined;
      result.push(input);
    }
    return result;
  }

  export function preview(entry: Entry): Blob | null {
    const input = entry.input;
    if (input?.kind === "image") return input.file;
    if (input?.kind !== "png") return null;
    let preview = pngPreviews.get(input.bytes);
    if (!preview) {
      preview = new Blob([input.bytes], { type: "image/png" });
      pngPreviews.set(input.bytes, preview);
    }
    return preview;
  }
}
