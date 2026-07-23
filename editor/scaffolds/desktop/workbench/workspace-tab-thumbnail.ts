import { dotcanvas } from "dotcanvas";
import { assertBundleLocalSrc } from "../canvas/workspace-bundle-fs";
import { WorkspaceFileKind } from "./workspace-file-kind";

/**
 * Semantic thumbnail policy for one workspace tab.
 *
 * This deliberately describes document content rather than attempting to
 * screenshot a hidden editor DOM tree. The preview viewport is only a renderer
 * for this model; classification, `.canvas` precedence, and board geometry stay
 * testable without React or Electron.
 */
export namespace WorkspaceTabThumbnail {
  export type BoardFrame = {
    id: string;
    src: string;
    x: number;
    y: number;
    width: number;
    height: number;
    z: number;
  };

  export type BoardOverview = {
    frames: BoardFrame[];
    omitted: number;
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };

  export type CanvasFallback =
    | { kind: "slide"; src: string }
    | { kind: "board"; overview: BoardOverview }
    | { kind: "empty" };

  export type CanvasModel = {
    /** Authored/reserved bundle cover. It may still fail at decode time. */
    cover: string | null;
    /** Semantic fallback when the cover is absent or cannot be rendered. */
    fallback: CanvasFallback;
  };

  export type ScheduledWork<T> = {
    promise: Promise<T | null>;
    cancel(): void;
  };

  type CacheEntry<T> = { createdAt: number; promise: Promise<T> };
  type QueueJob<T> = {
    work: () => Promise<T>;
    resolve(value: T | null): void;
    reject(reason: unknown): void;
    cancelled: boolean;
    settled: boolean;
  };

  const UNPLACED = { width: 320, height: 240, step: 40 };
  const MAX_BOARD_FRAMES = 12;
  const MAX_BOARD_COORDINATE = 1_000_000;
  const MAX_BOARD_SIZE = 1_000_000;

  export function bundlePath(basePath: string, src: string): string | null {
    try {
      assertBundleLocalSrc(src);
    } catch {
      return null;
    }
    return basePath ? `${basePath.replace(/\/+$/, "")}/${src}` : src;
  }

  export function canvasModel(resolved: dotcanvas.ResolvedCanvas): CanvasModel {
    const cover =
      resolved.thumbnail && isBundleLocal(resolved.thumbnail)
        ? resolved.thumbnail
        : null;

    if (resolved.editor === "board") {
      const overview = boardOverview(resolved.documents);
      return {
        cover,
        fallback:
          overview.frames.length > 0
            ? { kind: "board", overview }
            : { kind: "empty" },
      };
    }

    const firstSlide = resolved.documents.find(
      (document) =>
        !dotcanvas.isUriSrc(document.src) &&
        isBundleLocal(document.src) &&
        WorkspaceFileKind.extension(document.src) === ".svg"
    );
    return {
      cover,
      fallback: firstSlide
        ? { kind: "slide", src: firstSlide.src }
        : { kind: "empty" },
    };
  }

  export function boardOverview(
    documents: readonly dotcanvas.ResolvedDocument[]
  ): BoardOverview {
    const all = documents.map((document, index) => {
      const layout = document.layout;
      const placed =
        layout && Number.isFinite(layout.x) && Number.isFinite(layout.y);
      return {
        id: document.id,
        src: document.src,
        x: boundedCoordinate(placed ? (layout.x ?? 0) : index * UNPLACED.step),
        y: boundedCoordinate(placed ? (layout.y ?? 0) : index * UNPLACED.step),
        width: finitePositive(layout?.w, UNPLACED.width),
        height: finitePositive(layout?.h, UNPLACED.height),
        z: boundedCoordinate(Number.isFinite(layout?.z) ? (layout?.z ?? 0) : 0),
      };
    });

    const frames = all.slice(0, MAX_BOARD_FRAMES);
    if (all.length === 0) {
      return {
        frames,
        omitted: 0,
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      };
    }

    // Bounds cover the ENTIRE board, even though rendering is capped. Otherwise
    // an omitted far-away frame would make this look like a faithful fit while
    // silently changing the board's spatial story.
    const minX = Math.min(...all.map((frame) => frame.x));
    const minY = Math.min(...all.map((frame) => frame.y));
    const maxX = Math.max(...all.map((frame) => frame.x + frame.width));
    const maxY = Math.max(...all.map((frame) => frame.y + frame.height));
    return {
      frames,
      omitted: all.length - frames.length,
      bounds: {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      },
    };
  }

  /**
   * Small, bounded cache for deliberately repeated hovers. Workspace-change
   * events explicitly invalidate bundle entries; the age limit is the fallback
   * for older hosts without file watching.
   */
  export class Cache {
    private readonly canvases = new Map<string, CacheEntry<CanvasModel>>();
    private readonly svgProjections = new LatestQueue<string>();

    constructor(
      private readonly maxAgeMs = 5_000,
      private readonly maxEntries = 64
    ) {}

    canvas(
      workspaceId: string,
      basePath: string,
      load: () => Promise<CanvasModel>
    ): Promise<CanvasModel> {
      return this.read(this.canvases, bundleKey(workspaceId, basePath), load);
    }

    invalidateBundle(workspaceId: string, basePath: string): void {
      const key = bundleKey(workspaceId, basePath);
      this.canvases.delete(key);
    }

    invalidateChangedPath(workspaceId: string, relPath: string): void {
      const workspacePrefix = `${workspaceId}\0`;
      for (const key of this.canvases.keys()) {
        if (!key.startsWith(workspacePrefix)) continue;
        const basePath = key.slice(workspacePrefix.length);
        if (relPath === basePath || relPath.startsWith(`${basePath}/`)) {
          this.canvases.delete(key);
        }
      }
    }

    /**
     * Canvas SVG projection can fan out into several bounded binary reads.
     * Keep only the latest waiting tab and never run two such pipelines at
     * once; an already-started bridge call cannot be aborted.
     */
    svgProjection(load: () => Promise<string>): ScheduledWork<string> {
      return this.svgProjections.schedule(load);
    }

    clear(): void {
      this.canvases.clear();
      this.svgProjections.clear();
    }

    private read<T>(
      map: Map<string, CacheEntry<T>>,
      key: string,
      load: () => Promise<T>
    ): Promise<T> {
      const now = Date.now();
      const current = map.get(key);
      if (current && now - current.createdAt <= this.maxAgeMs) {
        return current.promise;
      }

      const promise = load();
      map.set(key, { createdAt: now, promise });
      while (map.size > this.maxEntries) {
        const oldest = map.keys().next().value;
        if (typeof oldest !== "string") break;
        map.delete(oldest);
      }
      void promise.catch(() => {
        if (map.get(key)?.promise === promise) map.delete(key);
      });
      return promise;
    }
  }

  class LatestQueue<T> {
    private active: QueueJob<T> | null = null;
    private pending: QueueJob<T> | null = null;

    schedule(work: () => Promise<T>): ScheduledWork<T> {
      if (this.pending) this.cancel(this.pending);

      let resolve!: (value: T | null) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<T | null>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
      });
      const job: QueueJob<T> = {
        work,
        resolve,
        reject,
        cancelled: false,
        settled: false,
      };
      this.pending = job;
      this.pump();
      return {
        promise,
        cancel: () => this.cancel(job),
      };
    }

    clear(): void {
      if (this.pending) this.cancel(this.pending);
      if (this.active) this.cancel(this.active);
    }

    private cancel(job: QueueJob<T>): void {
      if (job.cancelled) return;
      job.cancelled = true;
      if (this.pending === job) this.pending = null;
      this.settle(job, null);
    }

    private pump(): void {
      if (this.active || !this.pending) return;
      const job = this.pending;
      this.pending = null;
      this.active = job;
      void Promise.resolve()
        .then(() => (job.cancelled ? null : job.work()))
        .then(
          (value) => this.settle(job, job.cancelled ? null : value),
          (error: unknown) => {
            if (job.cancelled) this.settle(job, null);
            else this.reject(job, error);
          }
        )
        .finally(() => {
          if (this.active === job) this.active = null;
          this.pump();
        });
    }

    private settle(job: QueueJob<T>, value: T | null): void {
      if (job.settled) return;
      job.settled = true;
      job.resolve(value);
    }

    private reject(job: QueueJob<T>, reason: unknown): void {
      if (job.settled) return;
      job.settled = true;
      job.reject(reason);
    }
  }

  function isBundleLocal(src: string): boolean {
    return bundlePath("", src) !== null;
  }

  function finitePositive(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return Math.min(MAX_BOARD_SIZE, value);
  }

  function boundedCoordinate(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(
      -MAX_BOARD_COORDINATE,
      Math.min(MAX_BOARD_COORDINATE, value)
    );
  }

  function bundleKey(workspaceId: string, basePath: string): string {
    return `${workspaceId}\0${basePath}`;
  }
}
