import { video_attachment } from "./video-attachment";

/**
 * A bounded display-only still from the person's selected raster File.
 * Call only after reference intake: this opens no path or remote URL and changes
 * no model input or filesystem grant. SVG, HTML and PDF never enter the decoder.
 */
export namespace image_attachment_preview {
  export const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
  export const MAX_PIXELS = 16 * 1024 * 1024;
  export const TIMEOUT_MS = 5_000;

  export type MediaType =
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/gif";

  export type Bitmap = Readonly<{
    width: number;
    height: number;
    close(): void;
  }>;

  export type Surface = Readonly<{
    draw(source: Bitmap, width: number, height: number): void;
    toDataURL(type: string, quality?: number): string;
    close(): void;
  }>;

  export type Media = Readonly<{
    decode(file: File): Promise<Bitmap>;
    canvas(width: number, height: number): Surface | null;
  }>;

  const TYPES: Readonly<Record<string, MediaType>> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  const POSTER = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

  /** Raster MIME, with extension fallback only when the File has no MIME. */
  export function mediaType(
    file: Pick<File, "name" | "type">
  ): MediaType | undefined {
    const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
    if (extension && /^(?:svgz?|html?|pdf)$/.test(extension)) return;
    const mime = file.type.toLowerCase() || (extension && TYPES[extension]);
    switch (mime) {
      case "image/png":
      case "image/jpeg":
      case "image/webp":
      case "image/gif":
        return mime;
      default:
        return undefined;
    }
  }

  /** Explicit image intake also accepts the extension when the OS MIME is generic. */
  export function selectedMediaType(
    file: Pick<File, "name" | "type">
  ): MediaType | undefined {
    return mediaType(file) ?? mediaType({ name: file.name, type: "" });
  }

  /** No source object URL is needed; even a late decoded bitmap is closed. */
  export async function probe(
    file: File,
    media: Media = browserMedia()
  ): Promise<video_attachment.Preview | undefined> {
    const mime = mediaType(file);
    if (
      !mime ||
      !Number.isSafeInteger(file.size) ||
      file.size <= 0 ||
      file.size > MAX_SOURCE_BYTES
    )
      return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + TIMEOUT_MS;
    const available = () => active && Date.now() < deadline;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => {
        active = false;
        resolve(undefined);
      }, TIMEOUT_MS);
    });
    const prepare = async (): Promise<video_attachment.Preview | undefined> => {
      let bitmap: Bitmap | undefined;
      try {
        // Check only the raster signature, not an untrusted MIME label alone.
        const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        if (!available() || !matches(header, mime)) return;
        bitmap = await media.decode(file);
        if (!available()) return;
        const { width, height } = bitmap;
        if (
          !Number.isSafeInteger(width) ||
          !Number.isSafeInteger(height) ||
          width <= 0 ||
          height <= 0 ||
          width > video_attachment.MAX_DIMENSION ||
          height > video_attachment.MAX_DIMENSION ||
          width * height > MAX_PIXELS
        )
          return;
        for (const edge of [video_attachment.POSTER_EDGE, 160]) {
          const size = video_attachment.fit(width, height, edge);
          const surface = media.canvas(size.width, size.height);
          if (!surface) return;
          try {
            surface.draw(bitmap, size.width, size.height);
            for (const mime of ["image/png", "image/jpeg"]) {
              if (!available()) return;
              const poster = surface.toDataURL(mime, 0.72);
              if (
                available() &&
                poster.length <= video_attachment.MAX_POSTER_BYTES &&
                POSTER.test(poster)
              )
                return Object.freeze({ poster, width, height });
            }
          } finally {
            surface.close();
          }
        }
      } catch {
        // A display failure never rejects the person's reference attachment.
      } finally {
        bitmap?.close();
      }
    };
    try {
      return await Promise.race([prepare(), timeout]);
    } catch {
      return undefined;
    } finally {
      active = false;
      clearTimeout(timer);
    }
  }

  function matches(bytes: Uint8Array, mime: string): boolean {
    const starts = (signature: readonly number[]) =>
      signature.every((value, index) => bytes[index] === value);
    switch (mime) {
      case "image/png":
        return starts([137, 80, 78, 71, 13, 10, 26, 10]);
      case "image/jpeg":
        return starts([255, 216, 255]);
      case "image/gif":
        return (
          starts([71, 73, 70, 56, 55, 97]) || starts([71, 73, 70, 56, 57, 97])
        );
      case "image/webp":
        return (
          starts([82, 73, 70, 70]) &&
          [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value)
        );
      default:
        return false;
    }
  }

  function browserMedia(): Media {
    return {
      decode: (file) => createImageBitmap(file),
      canvas: (width, height) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          canvas.width = 0;
          canvas.height = 0;
          return null;
        }
        return {
          draw: (source, w, h) =>
            context.drawImage(source as ImageBitmap, 0, 0, w, h),
          toDataURL: (type, quality) => canvas.toDataURL(type, quality),
          close: () => {
            canvas.width = 0;
            canvas.height = 0;
          },
        };
      },
    };
  }
}
