// GRIDA-SEC-004 — the only way a chat attachment by reference gets a path.
//
// The renderer hands over the File the person dropped, pasted or picked. The
// preload resolves its path with Electron's `webUtils.getPathForFile` and sends
// that to Main; a File the page constructed itself has no path and is refused
// here. The renderer never supplies or reads the path string.

type PathForFile = (file: File) => string;

export namespace FileReferenceRequest {
  /** Whether `file` names a file or directory on disk. Reveals nothing but that. */
  export function available(file: unknown, pathFor: PathForFile): boolean {
    return pathOf(file, pathFor) !== null;
  }

  /**
   * The IPC payload for a reference: the renderer's fields with `file`
   * replaced by its resolved path. Unknown fields are kept for Main to refuse.
   */
  export function from(
    input: unknown,
    pathFor: PathForFile
  ): Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw unavailable();
    // A page-supplied path is refused outright, never overwritten.
    if ("path" in input) throw unavailable();
    const { file, ...rest } = input as Record<string, unknown>;
    const resolved = pathOf(file, pathFor);
    if (resolved === null) throw unavailable();
    return { ...rest, path: resolved };
  }

  function pathOf(file: unknown, pathFor: PathForFile): string | null {
    // Electron resolves only a File the person supplied; anything else throws
    // or resolves to "" (a File the page built has no path).
    if (!file || typeof file !== "object") return null;
    let resolved: string;
    try {
      resolved = pathFor(file as File);
    } catch {
      return null;
    }
    return typeof resolved === "string" && resolved.startsWith("/")
      ? resolved
      : null;
  }

  function unavailable() {
    return new Error("native_chat_file_reference_unavailable");
  }
}
