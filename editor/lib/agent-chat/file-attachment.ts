/**
 * Operable (non-image) file attachments for the agent composer.
 *
 * The sibling of {@link ./image-attachment}, for the OTHER half of "+ upload":
 * an arbitrary file (PDF, zip, docx, code, …) the model cannot perceive as
 * pixels. Instead of an inline `file` part, the bytes ride `scratch_seed` into
 * the session scratch dir (WG `scratch.md` / `binary.md`) and the agent reads or
 * extracts them there BY PATH via its shell — so it works for every file type,
 * not just what a provider natively decodes.
 *
 * Two pure steps, framework-free and unit-tested:
 *   - {@link readFileAsBase64} — a `File` → base64 (no downscale; a raw byte
 *     copy) with a size cap. The single browser step (`File.arrayBuffer`).
 *   - {@link extractOperableFiles} — composer `file-attachment` parts → the
 *     `scratch_seed` entries + the `USER_FILE_ATTACHMENTS` context part that
 *     TELLS the agent the files are waiting in scratch.
 *
 * The discriminator between a perceive-image attachment and an operable-file
 * attachment is `payload.base64`: images carry an inline data-`url` (see
 * `image-attachment.ts`); operable files carry their bytes in `payload.base64`
 * and no `url`, so {@link ./image-attachment.toFileUiParts} skips them and this
 * module claims them.
 */

import {
  USER_FILE_ATTACHMENTS,
  type ScratchSeedEntry,
  type UserFileAttachmentsData,
} from "@grida/agent";
import type { ContextPart } from "./build-agent-send";
import { decodedBytes } from "./image-attachment";

export type OperableFilePolicy = {
  /** Per-file byte ceiling. Matches the host's total `scratch_seed` budget, so a
   *  single file can fill it; several files share it (the host drops the overflow). */
  readonly maxBytes: number;
};

/**
 * One conservative v1 cap. `maxBytes` ~8 MB matches the host's `parseScratchSeed`
 * total budget (`MAX_TOTAL`) — the host bounds the aggregate; this bounds a
 * single pick so a huge file is rejected client-side with feedback rather than
 * silently truncated on the wire.
 */
export const OPERABLE_FILE_POLICY: OperableFilePolicy = {
  maxBytes: 8 * 1024 * 1024,
};

/** An encoded, scratch-ready operable file (base64 bytes + accounting). */
export type EncodedOperableFile = {
  name: string;
  mime: string;
  /** Byte size of the original file (what the scratch write costs). */
  size: number;
  /** base64 of the raw bytes — rides `scratch_seed` as `{ path, base64 }`. */
  base64: string;
};

/**
 * Read a `File` into a base64 payload for a scratch upload. No downscale/re-encode
 * (unlike an image): a byte-exact copy so a PDF/zip round-trips intact. Returns
 * `null` when the file is over {@link OperableFilePolicy.maxBytes} or unreadable —
 * the caller surfaces that as a notice, never a silent drop.
 */
export async function readFileAsBase64(
  file: File,
  policy: OperableFilePolicy = OPERABLE_FILE_POLICY
): Promise<EncodedOperableFile | null> {
  if (file.size > policy.maxBytes) return null;
  try {
    const base64 = arrayBufferToBase64(await file.arrayBuffer());
    return {
      name: file.name,
      // A file with no browser-supplied type is still operable — the agent
      // sniffs it by path/content. Fall back to the generic binary type.
      mime: file.type || "application/octet-stream",
      size: file.size,
      base64,
    };
  } catch {
    return null;
  }
}

/** Base64-encode an ArrayBuffer in chunks (a single `String.fromCharCode(...bytes)`
 *  overflows the call stack past a few hundred KB). Browser-only (`btoa`). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000; // 32 KB per fromCharCode call — safely under the arg cap
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Minimal structural view of a composer `file-attachment` part. */
type AttachmentPartLike = {
  type: string;
  id?: string;
  name?: string;
  mime?: string;
  size?: number;
  url?: string;
  payload?: Record<string, unknown> | null;
};

/** The two products of a submit's operable-file attachments. */
export type OperableFilesExtract = {
  /** `{ path, base64 }` entries to seed into the session scratch this turn. */
  scratchSeed: ScratchSeedEntry[];
  /** The `USER_FILE_ATTACHMENTS` context part telling the agent they're in
   *  scratch — or `null` when there are no operable files. */
  context: ContextPart | null;
};

/**
 * Split a composer message's `file-attachment` parts into scratch-upload entries
 * + the context part that names them for the model. Only parts carrying
 * `payload.base64` (operable files) are claimed; perceive images (inline `url`)
 * are left for `toFileUiParts`. Scratch paths are sanitized to one safe segment
 * and deduped within the batch. Pure.
 */
export function extractOperableFiles(
  parts: readonly AttachmentPartLike[]
): OperableFilesExtract {
  const taken = new Set<string>();
  const scratchSeed: ScratchSeedEntry[] = [];
  const files: UserFileAttachmentsData["files"][number][] = [];
  for (const p of parts) {
    if (p.type !== "file-attachment") continue;
    const base64 = p.payload?.base64;
    if (typeof base64 !== "string" || base64.length === 0) continue;
    const name = p.name ?? "file";
    const path = safeScratchName(name, p.id, taken);
    scratchSeed.push({ path, base64 });
    files.push({
      name,
      mime: p.mime || "application/octet-stream",
      // Bind the descriptor to the bytes actually sent. The producer verifies
      // this exact decoded count before staging/persistence.
      size: decodedBytes(base64),
      path,
    });
  }
  if (scratchSeed.length === 0) return { scratchSeed: [], context: null };
  return {
    scratchSeed,
    // LEAN facts, no instructions (mirrors `buildTemplateContext`): the agent's
    // `scratch_capability` prompt owns "how to reach scratch"; this says WHAT.
    context: {
      type: USER_FILE_ATTACHMENTS,
      data: { location: "scratch", files },
    },
  };
}

/**
 * Reduce a filename to one host-safe scratch segment (`writeScratchFile` /
 * `assertSafeFilename` reject separators, `..`, and dotfiles) and dedupe it
 * within the batch (`foo.pdf`, `foo-2.pdf`, …). Pure.
 */
function safeScratchName(
  raw: string,
  attachmentId: string | undefined,
  taken: Set<string>
): string {
  const base = raw.split(/[\\/]/).pop() || "file";
  let name = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[.-]+/, "");
  if (name.length === 0) name = "file";
  const id = (attachmentId ?? "attachment")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 56);
  // Preserve the unique composer attachment id at the front while retaining the
  // filename's extension tail. This also keeps upload paths out of the namespace
  // used by first-turn template seeds.
  const prefix = `upload-${id || "attachment"}-`;
  name = `${prefix}${name.slice(-(120 - prefix.length))}`;
  let candidate = name;
  let n = 2;
  while (taken.has(candidate)) {
    const dot = name.lastIndexOf(".");
    candidate =
      dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}
