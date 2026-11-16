"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ImageIcon } from "lucide-react";
import { FullscreenImagePreview } from "@/kits/image-preview";

/** A retained raster display capability, independent from paths and model input. */
export namespace AttachmentImagePreview {
  export type Loader = (previewId: string) => Promise<Blob>;
  type Snapshot = Readonly<{
    source: string | null;
    status: "idle" | "loading" | "ready" | "unavailable";
  }>;
  type Display = {
    create(blob: Blob): string;
    revoke(source: string): void;
    observe(target: Element, visible: () => void): () => void;
  };
  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_PIXELS = 64 * 1024 * 1024;
  const PNG = [137, 80, 78, 71, 13, 10, 26, 10];

  /** One visible attachment owns one bounded read and its display URL. */
  export class Controller {
    private state: Snapshot = { source: null, status: "idle" };
    private readonly listeners = new Set<() => void>();
    private connection?: object;
    private pending?: Promise<Blob>;
    private image?: Blob;
    private disconnect?: () => void;

    constructor(
      private readonly previewId: string,
      private readonly loader: Loader,
      private readonly display: Display = {
        create: (blob) => URL.createObjectURL(blob),
        revoke: (source) => URL.revokeObjectURL(source),
        observe: (target, visible) => {
          if (typeof IntersectionObserver === "undefined") {
            visible();
            return () => {};
          }
          const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              observer.disconnect();
              visible();
            }
          });
          observer.observe(target);
          return () => observer.disconnect();
        },
      }
    ) {}

    readonly read = () => this.state;

    readonly subscribe = (listener: () => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };

    connect(target: Element | null): () => void {
      this.disconnect?.();
      const connection = {};
      this.connection = connection;
      const stop = target
        ? this.display.observe(target, () => {
            if (this.connection === connection)
              void this.load().catch(() => {});
          })
        : () => {};
      const disconnect = () => {
        stop();
        if (this.connection !== connection) return;
        this.connection = undefined;
        this.pending = undefined;
        this.image = undefined;
        if (this.state.source) this.display.revoke(this.state.source);
        this.update({ source: null, status: "idle" });
      };
      this.disconnect = disconnect;
      return disconnect;
    }

    readonly load = (): Promise<Blob> => {
      const connection = this.connection;
      if (!connection)
        return Promise.reject(new Error("attachment_preview_unavailable"));
      if (this.image) return Promise.resolve(this.image);
      if (this.pending) return this.pending;
      this.update({ source: null, status: "loading" });
      const pending = Promise.resolve()
        .then(() => {
          if (this.connection !== connection)
            throw new Error("attachment_preview_unavailable");
          return this.loader(this.previewId);
        })
        .then(async (image) => {
          if (
            !(image instanceof Blob) ||
            !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
              image.type
            ) ||
            image.size < 12 ||
            image.size > MAX_BYTES
          )
            throw new Error("attachment_preview_unavailable");
          const header = new Uint8Array(await image.slice(0, 24).arrayBuffer());
          if (image.type !== "image/png") {
            const begins = (signature: number[]) =>
              signature.every((byte, index) => header[index] === byte);
            const valid =
              image.type === "image/jpeg"
                ? begins([255, 216, 255])
                : image.type === "image/gif"
                  ? begins([71, 73, 70, 56])
                  : begins([82, 73, 70, 70]) &&
                    [87, 69, 66, 80].every(
                      (byte, index) => header[index + 8] === byte
                    );
            if (!valid || this.connection !== connection)
              throw new Error("attachment_preview_unavailable");
            const source = this.display.create(image);
            this.image = image;
            this.update({ source, status: "ready" });
            return image;
          }
          if (header.length < 24)
            throw new Error("attachment_preview_unavailable");
          const dimensions = new DataView(header.buffer);
          const width = dimensions.getUint32(16);
          const height = dimensions.getUint32(20);
          if (
            !PNG.every((byte, index) => header[index] === byte) ||
            dimensions.getUint32(8) !== 13 ||
            ![73, 72, 68, 82].every(
              (byte, index) => header[index + 12] === byte
            ) ||
            !width ||
            !height ||
            width * height > MAX_PIXELS ||
            this.connection !== connection
          )
            throw new Error("attachment_preview_unavailable");
          const source = this.display.create(image);
          this.image = image;
          this.update({ source, status: "ready" });
          return image;
        })
        .catch(() => {
          if (this.connection === connection)
            this.update({ source: null, status: "unavailable" });
          throw new Error("attachment_preview_unavailable");
        })
        .finally(() => {
          if (this.pending === pending) this.pending = undefined;
        });
      this.pending = pending;
      return pending;
    };

    /** A browser decode failure retires only that exact display URL. */
    failed(source: string): void {
      if (this.state.source !== source) return;
      this.display.revoke(source);
      this.image = undefined;
      this.update({ source: null, status: "unavailable" });
    }

    private update(state: Snapshot): void {
      this.state = state;
      for (const listener of this.listeners) listener();
    }
  }

  export function View({
    previewId,
    loader,
    name,
  }: {
    previewId: string;
    loader: Loader;
    name: string;
  }) {
    const preview = useMemo(
      () => new Controller(previewId, loader),
      [previewId, loader]
    );
    const state = useSyncExternalStore(
      preview.subscribe,
      preview.read,
      preview.read
    );
    const target = useRef<HTMLDivElement>(null);
    useEffect(() => preview.connect(target.current), [preview]);
    return (
      <div ref={target}>
        <FullscreenImagePreview
          loadImage={preview.load}
          alt={name}
          title={`Preview ${name}`}
          downloadName={name}
        >
          {state.source ? (
            <Thumbnail
              source={state.source}
              name={name}
              onError={() => preview.failed(state.source!)}
            />
          ) : (
            <span
              className="flex h-36 w-52 max-w-full items-center justify-center rounded-lg bg-muted/30"
              aria-busy={state.status === "loading"}
            >
              <span className="flex min-w-0 flex-col items-center gap-2 p-3 text-xs text-muted-foreground">
                <ImageIcon className="size-6" />
                {state.status === "unavailable" && (
                  <span className="max-w-full truncate font-medium text-foreground">
                    {name}
                  </span>
                )}
                {state.status === "loading"
                  ? "Loading preview…"
                  : state.status === "unavailable"
                    ? "Preview unavailable"
                    : "Image"}
              </span>
            </span>
          )}
        </FullscreenImagePreview>
      </div>
    );
  }

  /** A supplied display source: image pixels only, metadata stays accessible. */
  export function Image({
    source,
    name,
    downloadName,
  }: {
    source: string;
    name: string;
    downloadName?: string;
  }) {
    const [failedSource, setFailedSource] = useState<string | null>(null);
    return (
      <FullscreenImagePreview
        src={source}
        alt={name}
        title={`Preview ${name}`}
        downloadName={downloadName ?? name}
      >
        {failedSource === source ? (
          <span className="flex w-52 max-w-full items-center gap-2 rounded-lg border bg-background p-2 text-xs">
            <ImageIcon className="size-5 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-medium">{name}</span>
              <span className="text-muted-foreground">Preview unavailable</span>
            </span>
          </span>
        ) : (
          <Thumbnail
            source={source}
            name={name}
            onError={() => setFailedSource(source)}
          />
        )}
      </FullscreenImagePreview>
    );
  }

  function Thumbnail({
    source,
    name,
    onError,
  }: {
    source: string;
    name: string;
    onError?: () => void;
  }) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={onError}
        className="h-auto w-auto max-h-64 max-w-52 rounded-lg object-contain"
      />
    );
  }
}
