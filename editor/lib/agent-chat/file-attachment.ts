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
 *   - {@link lowerOperableFiles} — typed prepared resources → the
 *     `scratch_seed` entries + the `USER_FILE_ATTACHMENTS` context part that
 *     TELLS the agent the files are waiting in scratch.
 *
 * {@link extractOperableFiles} retains the former payload-discriminator API as
 * a compatibility adapter. New callers classify once through the resource
 * policy/router and call the typed lowerer directly.
 */

import {
  SCRATCH_SEED_LIMITS,
  USER_FILE_ATTACHMENTS,
  type ScratchSeedEntry,
  type UserFileAttachmentsData,
} from "@grida/agent";
import type { ContextPart } from "./build-agent-send";
import { decodedBytes } from "./image-attachment";

export type OperableFilePolicy = {
  /** Per-file byte ceiling. A single file may fill the whole batch budget. */
  readonly maxBytes: number;
  /** Atomic `scratch_seed` file-count ceiling enforced by the host. */
  readonly maxFiles: number;
  /** Atomic decoded-byte budget shared by every seed in one turn. */
  readonly maxTotalBytes: number;
};

/**
 * The server-owned wire contract supplies the atomic count and decoded-byte
 * ceilings. A single file may fill that entire aggregate budget, so the same
 * canonical total is also the composer's per-file preflight ceiling.
 */
export const OPERABLE_FILE_POLICY: OperableFilePolicy = {
  maxBytes: SCRATCH_SEED_LIMITS.maxTotalBytes,
  maxFiles: SCRATCH_SEED_LIMITS.maxFiles,
  maxTotalBytes: SCRATCH_SEED_LIMITS.maxTotalBytes,
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

/** An encoded file after the composer/router has assigned its stable identity. */
export type EncodedOperableResource = EncodedOperableFile & {
  /** Stable within the composer message; used to derive a collision-safe path. */
  id: string;
};

/**
 * Read a `File` into a base64 payload for a scratch upload. No downscale/re-encode
 * (unlike an image): a byte-exact copy so a PDF/zip round-trips intact. Returns
 * `null` when the file is over {@link OperableFilePolicy.maxBytes} or unreadable —
 * the caller surfaces that as a notice, never a silent drop.
 */
export async function readFileAsBase64(
  file: File,
  policy: Pick<OperableFilePolicy, "maxBytes"> = OPERABLE_FILE_POLICY
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

export type OperableFilesLowerOptions = {
  /** Paths already claimed by another seed batch merged into the same turn. */
  reservedPaths?: readonly string[];
};

/**
 * Lower already-classified operable files into the two run-input products.
 *
 * Classification and byte reading belong upstream. This function is the pure
 * typed seam after routing: it only assigns safe scratch paths and builds the
 * matching lean context descriptor in the same order as `files`.
 */
export function lowerOperableFiles(
  encoded: readonly EncodedOperableResource[],
  options: Readonly<OperableFilesLowerOptions> = {}
): OperableFilesExtract {
  const taken = new Set(options.reservedPaths ?? []);
  const scratchSeed: ScratchSeedEntry[] = [];
  const files: UserFileAttachmentsData["files"][number][] = [];
  for (const file of encoded) {
    const path = safeScratchName(file.name, file.id, taken);
    scratchSeed.push({ path, base64: file.base64 });
    files.push({
      name: file.name,
      mime: file.mime || "application/octet-stream",
      size: file.size,
      path,
    });
  }
  if (scratchSeed.length === 0) return { scratchSeed: [], context: null };
  return {
    scratchSeed,
    context: {
      type: USER_FILE_ATTACHMENTS,
      data: { location: "scratch", files },
    },
  };
}

/**
 * Split a composer message's `file-attachment` parts into scratch-upload entries
 * + the context part that names them for the model. Only parts carrying
 * `payload.base64` (operable files) are claimed; perceive images (inline `url`)
 * are left for `toFileUiParts`. Scratch paths are sanitized to one safe segment
 * and deduped within the batch. Compatibility adapter; new code should use
 * {@link lowerOperableFiles}. Pure.
 */
export function extractOperableFiles(
  parts: readonly AttachmentPartLike[]
): OperableFilesExtract {
  const encoded: EncodedOperableResource[] = [];
  for (const p of parts) {
    if (p.type !== "file-attachment") continue;
    const base64 = p.payload?.base64;
    if (typeof base64 !== "string" || base64.length === 0) continue;
    encoded.push({
      id: p.id ?? "attachment",
      name: p.name ?? "file",
      mime: p.mime || "application/octet-stream",
      size: decodedBytes(base64),
      base64,
    });
  }
  return lowerOperableFiles(encoded);
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
