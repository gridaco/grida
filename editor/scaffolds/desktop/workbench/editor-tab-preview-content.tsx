/**
 * Informational preview content for a real workspace tab.
 *
 * This is a semantic document thumbnail, not a screenshot of the hidden editor
 * subtree. The dedicated tab-preview surface mounts only the current target, so
 * merely having many tabs does not eagerly read every file. See
 * `test/desktop-workbench-tab-preview.md`.
 */
"use client";

import {
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  Code2Icon,
  FileTextIcon,
  GalleryVerticalEndIcon,
  ImageIcon,
  VideoIcon,
} from "lucide-react";
import { dotcanvas } from "dotcanvas";
import { svgToDataUri } from "@/app/(canvas)/svg/_storage/thumbnails";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import { materializeSlideSvgResources } from "../canvas/slide-svg-resources";
import { workspaceBundleFs } from "../canvas/workspace-bundle-fs";
import { WorkspaceFileKind } from "./workspace-file-kind";
import { WorkspaceTabThumbnail } from "./workspace-tab-thumbnail";

export function EditorTabPreviewContent({
  workspaceId,
  relPath,
  dirty,
  revision,
  thumbnailCache,
}: {
  workspaceId: string;
  relPath: string;
  dirty: boolean;
  revision: number;
  thumbnailCache: WorkspaceTabThumbnail.Cache;
}) {
  const kind = WorkspaceFileKind.of(relPath);
  const name = WorkspaceFileKind.filename(relPath);
  const parent = WorkspaceFileKind.parentPath(relPath);

  return (
    <div className="w-64 overflow-hidden">
      <div className="aspect-video overflow-hidden border-b bg-muted/30 empty:hidden">
        <ThumbnailBody
          key={revision}
          kind={kind}
          workspaceId={workspaceId}
          relPath={relPath}
          thumbnailCache={thumbnailCache}
        />
      </div>
      <div className="min-w-0 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 break-all text-xs font-medium">{name}</p>
          {dirty && (
            <span className="flex shrink-0 items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <span className="size-1.5 rounded-full bg-current" aria-hidden />
              Unsaved
            </span>
          )}
        </div>
        <p className="mt-0.5 break-all text-[10px] text-muted-foreground">
          {parent
            ? `${parent} · ${WorkspaceFileKind.typeLabel(kind)}`
            : WorkspaceFileKind.typeLabel(kind)}
        </p>
      </div>
    </div>
  );
}

function ThumbnailBody({
  kind,
  workspaceId,
  relPath,
  thumbnailCache,
}: {
  kind: WorkspaceFileKind.Kind;
  workspaceId: string;
  relPath: string;
  thumbnailCache: WorkspaceTabThumbnail.Cache;
}) {
  switch (kind) {
    case "canvas":
      return (
        <CanvasThumbnail
          workspaceId={workspaceId}
          basePath={relPath}
          thumbnailCache={thumbnailCache}
        />
      );
    case "svg":
    case "image":
      return (
        <WorkspaceImageThumbnail
          workspaceId={workspaceId}
          relPath={relPath}
          fallback={null}
        />
      );
    case "video":
      return (
        <WorkspaceVideoThumbnail workspaceId={workspaceId} relPath={relPath} />
      );
    case "markdown":
    case "text":
      return null;
  }
}

type MediaSource =
  | { kind: "loading" }
  | { kind: "ready"; src: string }
  | { kind: "error" };

function useWorkspaceMediaSource(
  workspaceId: string,
  relPath: string
): MediaSource {
  const direct = workspacesNs.mediaUrl(workspaceId, relPath);
  const [fallback, setFallback] = useState<MediaSource>({ kind: "loading" });

  useEffect(() => {
    if (direct) return;
    let cancelled = false;
    setFallback({ kind: "loading" });
    workspacesNs
      .readFileBytes(workspaceId, relPath)
      .then((result) => {
        if (cancelled) return;
        setFallback({
          kind: "ready",
          src: `data:${WorkspaceFileKind.mimeType(relPath)};base64,${result.base64}`,
        });
      })
      .catch(() => {
        if (!cancelled) setFallback({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [direct, workspaceId, relPath]);

  return direct ? { kind: "ready", src: direct } : fallback;
}

function WorkspaceImageThumbnail({
  workspaceId,
  relPath,
  fallback,
}: {
  workspaceId: string;
  relPath: string;
  fallback: ReactNode;
}) {
  const source = useWorkspaceMediaSource(workspaceId, relPath);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [inset, setInset] = useState(false);
  const src = source.kind === "ready" ? source.src : "";

  useEffect(() => {
    setDecodeFailed(false);
    setInset(false);
  }, [src]);

  if (source.kind === "error" || decodeFailed) return fallback;
  if (source.kind === "loading") return <ThumbnailLoading />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- privileged workspace URL or local data URL
    <img
      src={source.src}
      alt=""
      draggable={false}
      className={
        inset ? "size-full object-contain p-2" : "size-full object-contain"
      }
      onLoad={(event) => setInset(hasNaturalGutter(event.currentTarget))}
      onError={() => setDecodeFailed(true)}
    />
  );
}

function hasNaturalGutter(image: HTMLImageElement): boolean {
  const { clientWidth, clientHeight, naturalWidth, naturalHeight } = image;
  if (!clientWidth || !clientHeight || !naturalWidth || !naturalHeight) {
    return false;
  }

  const scale = Math.min(
    clientWidth / naturalWidth,
    clientHeight / naturalHeight
  );
  const horizontalGutter = (clientWidth - naturalWidth * scale) / 2;
  const verticalGutter = (clientHeight - naturalHeight * scale) / 2;
  return Math.max(horizontalGutter, verticalGutter) >= 8;
}

function WorkspaceVideoThumbnail({
  workspaceId,
  relPath,
}: {
  workspaceId: string;
  relPath: string;
}) {
  const source = useWorkspaceMediaSource(workspaceId, relPath);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const src = source.kind === "ready" ? source.src : "";

  useEffect(() => {
    setDecodeFailed(false);
    setReady(false);
  }, [src]);

  useEffect(() => {
    if (!src || ready) return;
    const timeout = window.setTimeout(() => setDecodeFailed(true), 4_000);
    return () => window.clearTimeout(timeout);
  }, [src, ready]);

  if (source.kind === "error" || decodeFailed) return null;
  if (source.kind === "loading") return <ThumbnailLoading />;
  return (
    <div className="relative size-full">
      {!ready && (
        <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
      )}
      <video
        src={source.src}
        muted
        playsInline
        preload="metadata"
        className="absolute inset-0 size-full object-contain"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (Number.isFinite(video.duration) && video.duration > 0) {
            video.currentTime = Math.min(0.05, video.duration / 2);
          }
        }}
        onLoadedData={() => setReady(true)}
        onSeeked={() => setReady(true)}
        onError={() => setDecodeFailed(true)}
      />
    </div>
  );
}

type CanvasState =
  | { kind: "loading" }
  | { kind: "ready"; model: WorkspaceTabThumbnail.CanvasModel }
  | { kind: "error" };

function CanvasThumbnail({
  workspaceId,
  basePath,
  thumbnailCache,
}: {
  workspaceId: string;
  basePath: string;
  thumbnailCache: WorkspaceTabThumbnail.Cache;
}) {
  const [state, setState] = useState<CanvasState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    thumbnailCache
      .canvas(workspaceId, basePath, async () => {
        const resolved = await dotcanvas.read(
          workspaceBundleFs(workspaceId, workspacesNs, basePath)
        );
        return WorkspaceTabThumbnail.canvasModel(resolved);
      })
      .then((model) => {
        if (!cancelled) {
          setState({
            kind: "ready",
            model,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, basePath]);

  if (state.kind === "loading") return <ThumbnailLoading />;
  if (state.kind === "error") return null;

  const fallback = (
    <CanvasFallbackThumbnail
      workspaceId={workspaceId}
      basePath={basePath}
      fallback={state.model.fallback}
      thumbnailCache={thumbnailCache}
    />
  );
  const coverPath = state.model.cover
    ? WorkspaceTabThumbnail.bundlePath(basePath, state.model.cover)
    : null;
  return coverPath ? (
    WorkspaceFileKind.extension(state.model.cover ?? "") === ".svg" ? (
      <CanvasSvgThumbnail
        workspaceId={workspaceId}
        basePath={basePath}
        src={state.model.cover ?? ""}
        fallback={fallback}
        thumbnailCache={thumbnailCache}
      />
    ) : (
      <WorkspaceImageThumbnail
        workspaceId={workspaceId}
        relPath={coverPath}
        fallback={fallback}
      />
    )
  ) : (
    fallback
  );
}

function CanvasFallbackThumbnail({
  workspaceId,
  basePath,
  fallback,
  thumbnailCache,
}: {
  workspaceId: string;
  basePath: string;
  fallback: WorkspaceTabThumbnail.CanvasFallback;
  thumbnailCache: WorkspaceTabThumbnail.Cache;
}) {
  switch (fallback.kind) {
    case "slide":
      return (
        <CanvasSvgThumbnail
          workspaceId={workspaceId}
          basePath={basePath}
          src={fallback.src}
          fallback={null}
          thumbnailCache={thumbnailCache}
        />
      );
    case "board":
      return <CanvasBoardThumbnail overview={fallback.overview} />;
    case "empty":
      return null;
  }
}

function CanvasSvgThumbnail({
  workspaceId,
  basePath,
  src,
  fallback,
  thumbnailCache,
}: {
  workspaceId: string;
  basePath: string;
  src: string;
  fallback: ReactNode;
  thumbnailCache: WorkspaceTabThumbnail.Cache;
}) {
  const relPath = WorkspaceTabThumbnail.bundlePath(basePath, src);
  const [state, setState] = useState<MediaSource>({ kind: "loading" });
  const [decodeFailed, setDecodeFailed] = useState(false);

  useEffect(() => {
    if (!relPath) {
      setState({ kind: "error" });
      return;
    }

    let cancelled = false;
    setState({ kind: "loading" });
    setDecodeFailed(false);
    const projection = thumbnailCache.svgProjection(async () => {
      const result = await workspacesNs.readFile(workspaceId, relPath);
      const materialized = await materializeSlideSvgResources(result.content, {
        workspaceId,
        bundleBasePath: basePath,
        slideRelPath: relPath,
        // A tab preview is deliberately bounded. The full slide editor keeps
        // the materializer's unlimited default.
        maxResourceAttributes: 4,
      });
      return svgToDataUri(materialized.svg);
    });
    projection.promise
      .then((source) => {
        if (!cancelled && source) {
          setState({ kind: "ready", src: source });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
      projection.cancel();
    };
  }, [workspaceId, basePath, relPath, thumbnailCache]);

  if (state.kind === "error" || decodeFailed) return fallback;
  if (state.kind === "loading") return <ThumbnailLoading />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated local SVG data URI
    <img
      src={state.src}
      alt=""
      draggable={false}
      className="size-full object-contain"
      onError={() => setDecodeFailed(true)}
    />
  );
}

function CanvasBoardThumbnail({
  overview,
}: {
  overview: WorkspaceTabThumbnail.BoardOverview;
}) {
  const { bounds } = overview;
  const gutterX = Math.max(16, bounds.width * 0.06);
  const gutterY = Math.max(16, bounds.height * 0.06);
  const x = bounds.x - gutterX;
  const y = bounds.y - gutterY;
  const width = bounds.width + gutterX * 2;
  const height = bounds.height + gutterY * 2;
  const paintOrder = [...overview.frames].sort((a, b) => a.z - b.z);

  return (
    <div className="relative size-full overflow-hidden bg-muted/40">
      {paintOrder.map((frame, index) => (
        <div
          key={frame.id}
          className="absolute overflow-hidden rounded-[2px] border border-border/70 bg-background shadow-xs"
          style={{
            left: `${((frame.x - x) / width) * 100}%`,
            top: `${((frame.y - y) / height) * 100}%`,
            width: `${(frame.width / width) * 100}%`,
            height: `${(frame.height / height) * 100}%`,
            zIndex: index,
          }}
        >
          <BoardFramePlaceholder src={frame.src} />
        </div>
      ))}
      {overview.omitted > 0 && (
        <span className="absolute bottom-1.5 right-1.5 z-20 rounded bg-background/90 px-1.5 py-0.5 text-[9px] text-muted-foreground shadow-xs">
          +{overview.omitted}
        </span>
      )}
    </div>
  );
}

function BoardFramePlaceholder({ src }: { src: string }) {
  const kind = dotcanvas.isUriSrc(src) ? "image" : WorkspaceFileKind.of(src);
  const Icon = iconFor(kind === "canvas" ? "image" : kind);
  return (
    <div className="flex size-full items-center justify-center bg-muted/50 text-muted-foreground/55">
      <Icon className="size-1/3 min-h-2 min-w-2 stroke-[1.25]" aria-hidden />
    </div>
  );
}

function ThumbnailLoading() {
  return <div className="size-full animate-pulse bg-muted" aria-hidden />;
}

type ThumbnailIcon = ComponentType<SVGProps<SVGSVGElement>>;

function iconFor(kind: WorkspaceFileKind.Kind): ThumbnailIcon {
  switch (kind) {
    case "canvas":
      return GalleryVerticalEndIcon;
    case "svg":
    case "image":
      return ImageIcon;
    case "video":
      return VideoIcon;
    case "markdown":
      return FileTextIcon;
    case "text":
      return Code2Icon;
  }
}
