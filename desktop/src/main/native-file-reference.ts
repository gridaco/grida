// GRIDA-SEC-004 — a chat attachment by reference names a person-chosen file or folder
// and grants nothing.
//
// The path comes only from the preload, which resolves it from a File the
// person dropped, pasted or picked (`webUtils.getPathForFile`); the renderer
// never supplies a path string. Main resolves it and reads its metadata only,
// never its bytes, and refuses Grida's own protected stores. The agent then
// reaches the resource only through tools its permissions already allow.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { containsPath, ProtectedRoots } from "@grida/daemon/server";
import type { NativeChatAttachmentPreview } from "@grida/desktop-bridge";

const MAX_PATH_BYTES = 4096;
const MAX_NAME_BYTES = 256;
const MAX_MEDIA_TYPE_BYTES = 127;
/** Matches the host's poster bound. */
const MAX_POSTER_BYTES = 48 * 1024;
const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DIMENSION = 16_384;
const MEDIA_TYPE = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/;
const POSTER = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;
/** `_meta` key the host reads with a file reference link. */
const DETAILS = "co.grida/file-reference";
const DIRECTORY_MEDIA_TYPE = "inode/directory";

export namespace NativeFileReference {
  export const capability = "co.grida/session/file-reference";
  export const detailsKey = DETAILS;

  export type Scope = Readonly<{
    /** The chat's canonical working directory. */
    cwd: string;
    /** Grida's own stores, which a reference may never name. */
    protectedPaths: readonly string[];
  }>;

  export type Resolved = Readonly<
    {
      name: string;
      path: string;
      /** Relative to `cwd`, when the resource is inside it. */
      workspacePath?: string;
    } & ({ kind: "file"; size: number } | { kind: "directory" })
  >;

  /**
   * Resolve a person-chosen path to a regular file or directory. Reads no
   * contents. Refuses special files, relative or oversized paths, missing
   * resources and overlaps with Grida's protected stores (also through a link).
   */
  export async function resolve(
    value: unknown,
    scope: Scope
  ): Promise<Resolved> {
    if (
      typeof value !== "string" ||
      !path.isAbsolute(value) ||
      Buffer.byteLength(value) > MAX_PATH_BYTES ||
      /\p{Cc}/u.test(value)
    )
      throw new Error("native_chat_file_reference_unavailable");
    let real: string;
    let resource: { kind: "file"; size: number } | { kind: "directory" };
    try {
      real = await fs.realpath(value);
      const metadata = await fs.stat(real);
      if (metadata.isDirectory()) resource = { kind: "directory" };
      else if (metadata.isFile())
        resource = { kind: "file", size: metadata.size };
      else throw new Error("not_a_file_or_directory");
    } catch {
      throw new Error("native_chat_file_reference_unavailable");
    }
    // The host's own fixed denials, mirrored: Grida home and its override.
    const home = process.env.GRIDA_HOME;
    const denied = new ProtectedRoots([
      ...scope.protectedPaths,
      path.join(os.homedir(), ".grida"),
      ...(home && path.isAbsolute(home) ? [home] : []),
    ]);
    let protectedResource: boolean;
    try {
      protectedResource = denied.overlaps(real);
    } catch {
      protectedResource = true;
    }
    if (protectedResource)
      throw new Error("native_chat_file_reference_protected");
    const name = path.basename(real);
    if (
      !name ||
      Buffer.byteLength(name) > MAX_NAME_BYTES ||
      /\p{Cc}/u.test(name)
    )
      throw new Error("native_chat_file_reference_unavailable");
    const inside = real !== scope.cwd && containsPath(scope.cwd, real);
    return Object.freeze({
      name,
      path: real,
      ...(inside && {
        workspacePath: path.relative(scope.cwd, real).split(path.sep).join("/"),
      }),
      ...resource,
    });
  }

  /** A browser-reported media type, when it is a plain `type/subtype`. */
  export function mediaType(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const lower = value.toLowerCase();
    return lower.length <= MAX_MEDIA_TYPE_BYTES && MEDIA_TYPE.test(lower)
      ? lower
      : undefined;
  }

  /**
   * The preview the renderer showed, bounded like the host bounds it. A
   * preview only decorates the reference, so a fact out of bounds (a corrupt
   * clip's duration, an oversized frame, a poster that is not a small image)
   * is dropped rather than refusing the message; dimensions go as a pair.
   */
  export function preview(
    value: unknown
  ): NativeChatAttachmentPreview | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return undefined;
    const { poster, durationMs, width, height, ...rest } = value as Record<
      string,
      unknown
    >;
    if (Object.keys(rest).length) return undefined;
    const sized =
      within(width, 1, MAX_DIMENSION) && within(height, 1, MAX_DIMENSION);
    const result = {
      ...(typeof poster === "string" &&
        poster.length <= MAX_POSTER_BYTES &&
        POSTER.test(poster) && { poster }),
      ...(within(durationMs, 0, MAX_DURATION_MS) && { durationMs }),
      ...(sized && { width, height }),
    };
    return Object.keys(result).length ? Object.freeze(result) : undefined;
  }

  /** The ACP prompt block for a resolved reference. */
  export function link(
    resolved: Resolved,
    options: { mimeType?: string; preview?: NativeChatAttachmentPreview } = {}
  ) {
    const directory = resolved.kind === "directory";
    // Main owns resource type. A folder has neither a content byte size nor a
    // media preview, regardless of what an untrusted page reported.
    const mimeType = directory
      ? DIRECTORY_MEDIA_TYPE
      : options.mimeType === DIRECTORY_MEDIA_TYPE
        ? undefined
        : options.mimeType;
    const details = {
      ...(resolved.workspacePath !== undefined && {
        workspacePath: resolved.workspacePath,
      }),
      ...(!directory && options.preview && { preview: options.preview }),
    };
    return {
      type: "resource_link",
      name: resolved.name,
      uri: pathToFileURL(resolved.path).href,
      ...(resolved.kind === "file" && { size: resolved.size }),
      ...(mimeType && { mimeType }),
      ...(Object.keys(details).length && { _meta: { [DETAILS]: details } }),
    };
  }

  /** The preview a replayed reference link carries, when it is well formed. */
  export function replayedPreview(
    meta: unknown
  ): NativeChatAttachmentPreview | undefined {
    if (!meta || typeof meta !== "object" || Array.isArray(meta))
      return undefined;
    const details = (meta as Record<string, unknown>)[DETAILS];
    if (!details || typeof details !== "object" || Array.isArray(details))
      return undefined;
    return preview((details as Record<string, unknown>).preview);
  }

  function within(value: unknown, min: number, max: number): value is number {
    return (
      Number.isSafeInteger(value) &&
      (value as number) >= min &&
      (value as number) <= max
    );
  }
}
