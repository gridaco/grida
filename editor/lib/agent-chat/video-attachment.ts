/**
 * Video attachments in the native chat composer: which files are videos, and
 * the preview the composer and the transcript show for one: a small poster
 * frame with the clip's duration and dimensions.
 *
 * The preview is read in the renderer from the person's own File. The work is
 * bounded: one metadata load, one short seek, one small frame, each under a
 * timeout. It uses no network and always releases its object URL. A video
 * Chromium cannot decode has no preview and shows as an ordinary file card.
 * (see test/desktop-agent-chat-video-attachment.md)
 */
export namespace video_attachment {
  export type Preview = Readonly<{
    /** A JPEG data URL of at most {@link MAX_POSTER_BYTES}, when one was drawn. */
    poster?: string;
    /** Left out when the clip reports more than {@link MAX_DURATION_MS}. */
    durationMs?: number;
    /** Left out, with `height`, when a side exceeds {@link MAX_DIMENSION}. */
    width?: number;
    height?: number;
  }>;

  /** The host keeps posters up to this size with the message. */
  export const MAX_POSTER_BYTES = 48 * 1024;
  /** Longest duration the host keeps with the message: seven days. */
  export const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
  /** Largest frame side the host keeps with the message, in pixels. */
  export const MAX_DIMENSION = 16_384;
  /** Longest edge of a poster frame, in pixels. */
  export const POSTER_EDGE = 320;
  /** Where the poster frame is taken, capped at half the clip. */
  export const POSTER_SECONDS = 0.5;
  export const TIMEOUT_MS = 5_000;

  const TYPES: Readonly<Record<string, string>> = {
    mp4: "video/mp4",
    m4v: "video/x-m4v",
    mov: "video/quicktime",
    webm: "video/webm",
    ogv: "video/ogg",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
  };

  type Named = Readonly<{ name: string; type?: string }>;

  /** The element surface the probe uses; a stub stands in for tests. */
  export type Element = EventTarget & {
    muted: boolean;
    preload: string;
    playsInline: boolean;
    src: string;
    currentTime: number;
    readonly duration: number;
    readonly videoWidth: number;
    readonly videoHeight: number;
    removeAttribute(name: string): void;
    load(): void;
  };

  export type Surface = Readonly<{
    width: number;
    height: number;
    draw(source: Element, width: number, height: number): void;
    toDataURL(type: string, quality: number): string;
  }>;

  export type Media = Readonly<{
    video(): Element;
    canvas(width: number, height: number): Surface | null;
    createObjectURL(file: Blob): string;
    revokeObjectURL(url: string): void;
  }>;

  /** Whether a file is a video, by its type or, without one, its extension. */
  export function isVideo(file: Named): boolean {
    return mediaType(file)?.startsWith("video/") ?? false;
  }

  /** The file's media type, falling back to its extension for a video. */
  export function mediaType(file: Named): string | undefined {
    if (file.type) return file.type.toLowerCase();
    const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
    return extension ? TYPES[extension] : undefined;
  }

  /** Fit `width`×`height` within `edge` on its longest side. */
  export function fit(
    width: number,
    height: number,
    edge: number
  ): { width: number; height: number } {
    const scale = Math.min(1, edge / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  /** `0:07`, `12:30` or `1:02:03`. */
  export function formatDuration(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return hours
      ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
      : `${minutes}:${seconds}`;
  }

  /** The card's caption: duration and dimensions, as far as they are known. */
  export function caption(
    preview: Readonly<{ durationMs?: number; width?: number; height?: number }>
  ): string | undefined {
    const parts = [
      preview.durationMs !== undefined && formatDuration(preview.durationMs),
      preview.width && preview.height && `${preview.width}×${preview.height}`,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : undefined;
  }

  /**
   * Read a video's duration, dimensions and a poster frame. Null when the
   * clip cannot be decoded; a preview without `poster` when only the frame
   * could not be drawn, and without a fact the host would not keep.
   */
  export async function probe(
    file: Blob,
    media: Media = browserMedia()
  ): Promise<Preview | null> {
    const url = media.createObjectURL(file);
    const video = media.video();
    try {
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      const loaded = settle(video, "loadedmetadata");
      video.src = url;
      await loaded;
      const { duration, videoWidth: width, videoHeight: height } = video;
      if (
        !Number.isFinite(duration) ||
        duration < 0 ||
        width <= 0 ||
        height <= 0
      )
        return null;
      // A corrupt clip can report facts no message keeps; leave them out
      // rather than refuse the message.
      const durationMs = Math.round(duration * 1000);
      const preview = {
        ...(durationMs <= MAX_DURATION_MS && { durationMs }),
        ...(width <= MAX_DIMENSION &&
          height <= MAX_DIMENSION && { width, height }),
      };
      const poster = await frame(video, media, duration).catch(() => undefined);
      return Object.freeze(poster ? { ...preview, poster } : preview);
    } catch {
      return null;
    } finally {
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // The element is discarded either way.
      }
      media.revokeObjectURL(url);
    }
  }

  async function frame(
    video: Element,
    media: Media,
    duration: number
  ): Promise<string | undefined> {
    const seeked = settle(video, "seeked");
    video.currentTime = Math.min(POSTER_SECONDS, duration / 2);
    await seeked;
    for (const [edge, quality] of [
      [POSTER_EDGE, 0.72],
      [POSTER_EDGE / 2, 0.6],
    ] as const) {
      const size = fit(video.videoWidth, video.videoHeight, edge);
      const canvas = media.canvas(size.width, size.height);
      if (!canvas) return undefined;
      canvas.draw(video, size.width, size.height);
      const poster = canvas.toDataURL("image/jpeg", quality);
      if (
        poster.startsWith("data:image/jpeg;base64,") &&
        poster.length <= MAX_POSTER_BYTES
      )
        return poster;
    }
    return undefined;
  }

  /** Resolve on `event`; reject on the element's error or after the timeout. */
  function settle(target: EventTarget, event: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = (error?: Error) => {
        clearTimeout(timer);
        target.removeEventListener(event, ok);
        target.removeEventListener("error", failed);
        if (error) reject(error);
        else resolve();
      };
      const ok = () => done();
      const failed = () => done(new Error("video_unreadable"));
      const timer = setTimeout(
        () => done(new Error("video_timeout")),
        TIMEOUT_MS
      );
      target.addEventListener(event, ok);
      target.addEventListener("error", failed);
    });
  }

  function browserMedia(): Media {
    return {
      video: () => document.createElement("video") as unknown as Element,
      canvas: (width, height) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        return context
          ? {
              width,
              height,
              draw: (source, w, h) =>
                context.drawImage(
                  source as unknown as HTMLVideoElement,
                  0,
                  0,
                  w,
                  h
                ),
              toDataURL: (type, quality) => canvas.toDataURL(type, quality),
            }
          : null;
      },
      createObjectURL: (file) => URL.createObjectURL(file),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
    };
  }
}
