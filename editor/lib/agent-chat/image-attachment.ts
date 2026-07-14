/**
 * Image attachment encoding for the agent composer.
 *
 * Turns a user pasted/dropped image `File` into an inline base64 data-URL
 * attachment the model can actually SEE — a provider-native multimodal `file`
 * part. Perceive-only (Claude-Code-style): no path is surfaced to the agent,
 * so the model sees pixels, not a file it can operate on. This is the
 * `file-attachment` shape from `docs/wg/ai/agent/compositor.md`.
 *
 * The pure helpers (policy, dimension math, byte accounting, part mapping) are
 * framework-free and unit-tested. `encodeImageFile` is the single DOM/canvas
 * step (browser-only) and is exercised by the live + manual paths, not jsdom
 * (canvas is unreliable there).
 */

import type { FileUIPart } from "ai";

export type ImageAttachmentPolicy = {
  /** Accepted source mime types. Raster only — SVG is text and is excluded. */
  readonly acceptMimes: readonly string[];
  /** Longest-edge ceiling in px; larger images are downscaled before send. */
  readonly maxEdge: number;
  /** Target max decoded bytes after encoding; drives downscale + quality. */
  readonly maxBytes: number;
  /** Maximum wait for a URL-backed Library image to load and decode. */
  readonly loadTimeoutMs: number;
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
  loadTimeoutMs: 15_000,
};

/** MIME types the canvas encoder can emit when pass-through is unavailable. */
export const IMAGE_TRANSCODE_OUTPUT_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

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

/** Minimal structural view of a composer `file-attachment` part. */
type AttachmentPartLike = {
  type: string;
  mime?: string;
  url?: string;
  name?: string;
};

/**
 * Map composer `file-attachment` parts to AI-SDK `FileUIPart`s — the shape
 * `sendMessage({ text, files })` accepts. Only inlined raster images with a
 * data/URL survive; everything else is dropped (defense in depth alongside
 * the ingest-time gate). Compatibility adapter for payload-shaped callers;
 * typed resource routing lowers provider files directly. Pure.
 */
export function toFileUiParts(
  parts: readonly AttachmentPartLike[],
  policy: ImageAttachmentPolicy = IMAGE_ATTACHMENT_POLICY
): FileUIPart[] {
  const out: FileUIPart[] = [];
  for (const p of parts) {
    if (p.type !== "file-attachment") continue;
    if (!p.url || !isSupportedImageType(p.mime, policy)) continue;
    out.push({
      type: "file",
      url: p.url,
      mediaType: p.mime,
      filename: p.name,
    });
  }
  return out;
}

/** An encoded, send-ready image attachment (data URL + accounting). */
export type EncodedImageAttachment = {
  name: string;
  mime: string;
  /** Decoded byte size of the encoded payload (what actually ships). */
  size: number;
  /** `data:<mime>;base64,<payload>` — goes straight into a `file` part. */
  url: string;
};

/**
 * Read an image `File` into a send-ready data-URL attachment, downscaling /
 * re-encoding when it exceeds the policy. Returns `null` for unsupported types
 * or on decode failure. DOM-only (uses `createImageBitmap` + canvas).
 *
 * Fast path: in-budget images keep their original bytes (lossless, preserves
 * animation for small gifs). Otherwise: downscale to `planResize` dims, then a
 * PNG → JPEG quality ladder, first encoding under `maxBytes` wins.
 */
export async function encodeImageFile(
  file: File,
  policy: ImageAttachmentPolicy = IMAGE_ATTACHMENT_POLICY,
  outputMimes: readonly string[] = policy.acceptMimes
): Promise<EncodedImageAttachment | null> {
  if (!isSupportedImageType(file.type, policy)) return null;
  if (outputMimes.length === 0) return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  try {
    const { width, height } = bitmap;
    const target = planResize(width, height, policy.maxEdge);
    const needsResize = target.width !== width || target.height !== height;

    // Fast path — small enough and under the byte budget: ship original bytes.
    if (!needsResize && outputMimes.includes(file.type)) {
      const original = await readAsDataUrl(file);
      const originalBytes = original ? decodedBytes(original) : 0;
      if (original && originalBytes <= policy.maxBytes) {
        return {
          name: file.name,
          mime: file.type,
          size: originalBytes,
          url: original,
        };
      }
    }

    return encodeRasterSource(
      bitmap,
      width,
      height,
      file.name,
      policy,
      outputMimes
    );
  } finally {
    bitmap.close?.();
  }
}

/**
 * Materialize a Library image URL into inline bytes without granting the model
 * or provider a remote-fetch capability. Loading uses the browser's `img-src`
 * perimeter (the Desktop CSP allowlists only first-party Library storage), not
 * `fetch`/`connect-src`; `crossOrigin=anonymous` keeps canvas readback explicit.
 * The image is always re-encoded, so the returned part is a bounded data URL.
 */
export async function encodeLibraryImageUrl(
  url: string,
  name: string,
  declaredMime: string,
  policy: ImageAttachmentPolicy = IMAGE_ATTACHMENT_POLICY,
  outputMimes: readonly string[] = policy.acceptMimes,
  libraryBaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
): Promise<EncodedImageAttachment | null> {
  if (!isSupportedImageType(declaredMime, policy) || outputMimes.length === 0) {
    return null;
  }
  const parsed = trustedLibraryImageUrl(url, libraryBaseUrl);
  if (!parsed) return null;

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  let loadTimer: ReturnType<typeof setTimeout> | null = null;
  const clearLoadTimer = () => {
    if (loadTimer === null) return;
    clearTimeout(loadTimer);
    loadTimer = null;
  };
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (settle: () => void) => {
        if (settled) return;
        settled = true;
        clearLoadTimer();
        settle();
      };
      loadTimer = setTimeout(
        () => finish(() => reject(new Error("image URL load timed out"))),
        policy.loadTimeoutMs
      );
      image.onload = () => finish(resolve);
      image.onerror = () =>
        finish(() => reject(new Error("image URL could not be decoded")));
      image.src = parsed.href;
    });
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
    return encodeRasterSource(
      image,
      image.naturalWidth,
      image.naturalHeight,
      name,
      policy,
      outputMimes
    );
  } catch {
    return null;
  } finally {
    clearLoadTimer();
    image.onload = null;
    image.onerror = null;
    image.src = "";
  }
}

/** The semantic companion to Desktop's CSP `img-src` carve-out. */
export function trustedLibraryImageUrl(
  value: string,
  libraryBaseUrl: string
): URL | null {
  if (!libraryBaseUrl) return null;
  try {
    const base = new URL(libraryBaseUrl);
    const candidate = new URL(value);
    return (candidate.protocol === "https:" ||
      candidate.protocol === "http:") &&
      candidate.protocol === base.protocol &&
      candidate.origin === base.origin &&
      candidate.pathname.startsWith("/storage/v1/object/public/")
      ? candidate
      : null;
  } catch {
    return null;
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

function readAsDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function renameExt(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}
