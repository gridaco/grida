// Shared HTTP projection for an already authorized workspace file.

export type WorkspaceFileBody = {
  size: number;
  stream: (offset: number, length: number) => ReadableStream<Uint8Array>;
  close: () => Promise<void>;
};

export async function workspaceFileResponse(
  relPath: string,
  rangeHeader: string | undefined,
  file: WorkspaceFileBody
): Promise<Response> {
  const { size } = file;
  const range = parseRange(rangeHeader, size);
  if (range === "unsatisfiable") {
    await file.close();
    return new Response(null, {
      status: 416,
      headers: {
        "content-range": `bytes */${size}`,
        "accept-ranges": "bytes",
      },
    });
  }

  const { start, end } = range ?? { start: 0, end: size === 0 ? 0 : size - 1 };
  const length = size === 0 ? 0 : end - start + 1;
  const headers: Record<string, string> = {
    "content-type": contentTypeFor(relPath),
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "content-length": String(length),
  };
  if (range) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  if (length === 0) await file.close();
  return new Response(length === 0 ? null : file.stream(start, length), {
    status: range ? 206 : 200,
    headers,
  });
}

/**
 * Parse a single-range HTTP `Range` header against a known file size.
 * Returns inclusive `{start, end}` for a satisfiable range,
 * `"unsatisfiable"` for a syntactically-valid-but-out-of-bounds range (→ 416),
 * or `null` when there's no header or it's malformed (→ serve the full 200
 * body, per RFC 7233 §3.1 "a server that supports range requests MAY ignore an
 * unsatisfiable-to-parse Range"). Only the first byte-range is honored —
 * browsers seeking media send a single `bytes=` range.
 */
function parseRange(
  header: string | undefined,
  size: number
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;
  let start: number;
  let end: number;
  if (rawStart === "") {
    // suffix form `bytes=-N`: the last N bytes.
    const suffix = Number(rawEnd);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }
  if (size === 0 || start >= size || start > end) return "unsatisfiable";
  if (end >= size) end = size - 1; // clamp an over-long end to the last byte
  return { start, end };
}

/**
 * Extension → media MIME for the streamed file route (#924). MIME ownership
 * lives server-side here — the route sets `Content-Type` on the response —
 * rather than on a client-built `data:` URL (the base64 fallback still infers
 * its own). Unknown extensions fall back to `application/octet-stream`; the
 * browser still sniffs common formats, but we don't promise a type we can't
 * name.
 */
const FILE_MIME: Record<string, string> = {
  // images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
  svg: "image/svg+xml",
  // video
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
  ogg: "video/ogg",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  // audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  flac: "audio/flac",
};

function contentTypeFor(relPath: string): string {
  const name = relPath.split("/").pop() ?? relPath;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return (
    FILE_MIME[name.slice(dot + 1).toLowerCase()] ?? "application/octet-stream"
  );
}
