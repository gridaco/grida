/**
 * Image attachment policy and encoding for the agent composer.
 *
 * The pure helpers (policy, dimension math, byte accounting) are
 * framework-free and unit-tested. `encodeLibraryPng` is the single DOM/canvas
 * step (browser-only) and is exercised by the live + manual paths, not jsdom
 * (canvas is unreliable there).
 */

export type ImageAttachmentPolicy = {
  /** Accepted source mime types. Raster only — SVG is text and is excluded. */
  readonly acceptMimes: readonly string[];
  /** Longest-edge ceiling in px; larger images are downscaled before send. */
  readonly maxEdge: number;
  /** Target max decoded bytes after encoding; drives downscale + quality. */
  readonly maxBytes: number;
};

/**
 * One conservative v1 cap (not a per-model table). `maxEdge` ~1568 matches
 * Anthropic's recommended long-edge; `maxBytes` ~5 MB matches the common
 * provider inline ceiling. Providers hard-reject larger images, so this is
 * non-optional even in the "simple" version.
 */
export const IMAGE_ATTACHMENT_POLICY: ImageAttachmentPolicy = {
  acceptMimes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  maxEdge: 1568,
  maxBytes: 5 * 1024 * 1024,
};

export const LIBRARY_ATTACHMENT_SOURCE_LIMITS = {
  bytes: 4 * 1024 * 1024,
  pixels: 16 * 1024 * 1024,
} as const;

/**
 * A raster image type we inline as multimodal (SVG excluded — it's text).
 * Typed as a predicate so a truthy result narrows `mime` to `string` at the
 * call site (removes downstream `as string` casts).
 */
export function isSupportedImageType(
  mime: string | undefined | null,
  policy: ImageAttachmentPolicy = IMAGE_ATTACHMENT_POLICY
): mime is string {
  return !!mime && policy.acceptMimes.includes(mime);
}

/**
 * Fit `width`×`height` within `maxEdge` on the longest side, preserving aspect
 * ratio. Returns the original dims when already within budget. Pure.
 */
export function planResize(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Decoded byte size of a base64 payload (accepts a bare base64 string or a
 * full `data:...;base64,<payload>` URL). base64 encodes 3 bytes per 4 chars,
 * minus `=` padding. Pure — use this for budget checks, never the data-URL
 * string length (which is ~4/3 larger).
 */
export function decodedBytes(base64OrDataUrl: string): number {
  let b64 = base64OrDataUrl;
  if (b64.startsWith("data:")) {
    const comma = b64.indexOf(",");
    if (comma < 0) return 0;
    b64 = b64.slice(comma + 1);
  }
  const len = b64.length;
  if (len === 0) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

/** An encoded image attachment (data URL + accounting). */
type EncodedImageAttachment = {
  name: string;
  mime: string;
  /** Decoded byte size of the encoded payload (what actually ships). */
  size: number;
  /** `data:<mime>;base64,<payload>` — goes straight into a `file` part. */
  url: string;
};

/** Normalize already-captured Library bytes without opening a remote image. */
export async function encodeLibraryPng(
  source: { mime: string; bytes: ArrayBuffer },
  maxBytes: number
): Promise<ArrayBuffer> {
  if (
    !isSupportedImageType(source.mime) ||
    source.bytes.byteLength === 0 ||
    source.bytes.byteLength > LIBRARY_ATTACHMENT_SOURCE_LIMITS.bytes
  )
    throw new Error("library_image_unavailable");
  const bitmap = await createImageBitmap(
    new Blob([source.bytes], { type: source.mime })
  );
  try {
    const { width, height } = bitmap;
    if (width * height > LIBRARY_ATTACHMENT_SOURCE_LIMITS.pixels)
      throw new Error("library_image_unavailable");
    const encode = (maxEdge: number) =>
      encodeRasterSource(
        bitmap,
        width,
        height,
        "reference.png",
        { ...IMAGE_ATTACHMENT_POLICY, maxEdge, maxBytes },
        ["image/png"]
      );
    const encoded = encode(768) ?? encode(240);
    if (!encoded) throw new Error("library_image_unavailable");
    const payload = encoded.url.slice("data:image/png;base64,".length);
    return Uint8Array.from(atob(payload), (character) =>
      character.charCodeAt(0)
    ).buffer;
  } finally {
    bitmap.close();
  }
}

function encodeRasterSource(
  source: CanvasImageSource,
  width: number,
  height: number,
  name: string,
  policy: ImageAttachmentPolicy,
  outputMimes: readonly string[]
): EncodedImageAttachment | null {
  const target = planResize(width, height, policy.maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = target.width || width;
  canvas.height = target.height || height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  // PNG first (lossless); fall back down a short JPEG quality ladder until
  // the payload fits the budget. Each toDataURL is expensive, so keep the
  // ladder short and cache the winner's decoded size.
  const ladder: Array<{ mime: string; quality?: number }> = [
    { mime: "image/png" },
    { mime: "image/jpeg", quality: 0.75 },
    { mime: "image/jpeg", quality: 0.5 },
    { mime: "image/webp", quality: 0.75 },
  ];
  let chosen: { mime: string; url: string; size: number } | null = null;
  for (const step of ladder) {
    if (!outputMimes.includes(step.mime)) continue;
    const encodedUrl = canvas.toDataURL(step.mime, step.quality);
    const actualMime = /^data:([^;,]+)/.exec(encodedUrl)?.[1];
    if (!actualMime || !outputMimes.includes(actualMime)) continue;
    chosen = {
      mime: actualMime,
      url: encodedUrl,
      size: decodedBytes(encodedUrl),
    };
    if (chosen.size <= policy.maxBytes) break;
  }
  if (!chosen || chosen.size > policy.maxBytes) return null;

  const ext =
    chosen.mime === "image/png"
      ? "png"
      : chosen.mime === "image/webp"
        ? "webp"
        : "jpg";
  return {
    name: renameExt(name, ext),
    mime: chosen.mime,
    size: chosen.size,
    url: chosen.url,
  };
}

function renameExt(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}
