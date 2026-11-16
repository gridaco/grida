// GRIDA-SEC-004 — only preload resolves a selected File's original disk path.
export namespace SelectedImageRequest {
  const MAX_BYTES = 20 * 1024 * 1024;

  /** Preserve original bytes; display posters are not an admissible source. */
  export async function from(
    input: unknown,
    pathFor: (file: File) => string
  ): Promise<Record<string, unknown>> {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      [
        "path",
        "bytes",
        "name",
        "source",
        "sha256",
        "size",
        "lastModified",
      ].some((key) => key in input)
    )
      throw unavailable();
    const { file, originalFile, ...rest } = input as Record<string, unknown>;
    if (!(file instanceof File)) throw unavailable();
    const origin = originalFile ?? file;
    if (!(origin instanceof File)) throw unavailable();
    const size = Object.getOwnPropertyDescriptor(
      Blob.prototype,
      "size"
    )!.get!.call(file) as number;
    const name = Object.getOwnPropertyDescriptor(
      File.prototype,
      "name"
    )!.get!.call(file) as string;
    const lastModified = Object.getOwnPropertyDescriptor(
      File.prototype,
      "lastModified"
    )!.get!.call(origin) as number;
    if (!name || size <= 0 || size > MAX_BYTES) throw unavailable();
    const bounded = Blob.prototype.slice.call(file, 0, MAX_BYTES + 1) as Blob;
    const bytes = await Blob.prototype.arrayBuffer.call(bounded);
    if (bytes.byteLength !== size || bytes.byteLength > MAX_BYTES)
      throw unavailable();
    const sha256 = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ];
    const captured = {
      name,
      sha256,
      size: bytes.byteLength,
      lastModified,
    };
    let original = "";
    try {
      original = pathFor(origin);
    } catch {
      /* A browser-created File has no disk origin. */
    }
    if (original) {
      if (typeof original !== "string" || !original.startsWith("/"))
        throw unavailable();
      return { ...rest, ...captured, path: original };
    }
    return { ...rest, ...captured, bytes };
  }
  function unavailable(): Error {
    return new Error("native_chat_selected_image_unavailable");
  }
}
