import { createHash } from "node:crypto";
import mime from "mime-types";

/**
 * Library content addressing — #929.
 *
 * Identity contract (docs/wg/platform/library.md §3): a library object's
 * content address is the SHA-256 of its stored bytes, lowercase hex, and the
 * storage location for new objects is the flat CAS path `<sha256>.<ext>`.
 * Producers compute the address over the exact bytes they upload; the
 * extension is informative only and never identity-bearing.
 */
export namespace LibraryCAS {
  /** SHA-256 of the exact bytes, as 64 lowercase hex characters. */
  export function sha256Hex(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
  }

  /**
   * Pinned mimetype → extension map. Pinned (rather than delegated to a
   * library) so every producer, in every language, derives the same CAS path
   * for the same media type — e.g. `mime-types` (npm) says "jpeg" while
   * Python's `mimetypes` says ".jpg". The sibling-repo producer mirrors this
   * table verbatim.
   */
  const EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
  };

  /** Informative extension for a media type; pinned map first, `mime-types` fallback. */
  export function ext(mimetype: string): string | null {
    return EXT[mimetype] ?? mime.extension(mimetype) ?? null;
  }

  /** Flat CAS storage path: `<sha256>.<ext>` (bare `<sha256>` when the type has no extension). */
  export function path(sha256: string, mimetype: string): string {
    const e = ext(mimetype);
    return e ? `${sha256}.${e}` : sha256;
  }

  /**
   * True when a storage upload failed because the object already exists —
   * which, at a CAS path, means the same bytes are already stored: a success
   * signal, not an error. Tolerant of both storage-api error shapes (current
   * HTTP 409 / `statusCode: "409"` / "Duplicate", and the historic HTTP 400
   * with a 409 body code).
   */
  export function isDuplicateError(error: {
    message?: string;
    status?: number;
    statusCode?: string | number;
    error?: string;
  }): boolean {
    return (
      String(error.statusCode) === "409" ||
      error.status === 409 ||
      error.error === "Duplicate" ||
      /already exists|duplicate/i.test(error.message ?? "")
    );
  }
}
