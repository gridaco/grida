"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AudioWaveform,
  Box,
  FolderOpen,
  FolderSearch,
  ImageIcon,
  Loader2,
  Music2,
  Video,
  Volume2,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@app/ui/components/sidebar";
import { cn } from "@app/ui/lib/utils";
import type { models } from "@grida/ai-models";
import { mediaLibrary, type MediaItem } from "@/lib/desktop/bridge";
import { ThreeDPlayground } from "../3d-gen/three-d-playground";
import { MusicPlayground } from "../audio-gen/music-playground";
import { SoundEffectPlayground } from "../audio-gen/sound-effect-playground";
import { DesktopImagePlayground } from "../image-gen/image-playground";
import { DesktopVideoPlayground } from "../video-gen/video-playground";
import {
  DesktopMediaTool,
  type DesktopMediaToolId,
  type DesktopMediaToolSelection,
  type DesktopMediaToolSpec,
} from "./media-tool-registry";
import { AudioPlayerTool } from "./audio-player-tool";
import { GenerationOperationCounter } from "./generation-operation-counter";
import { GltfViewerTool } from "./gltf-viewer-tool";
import { StoredMedia, type StoredMediaPreview } from "./stored-media";
import { StoredVisualMediaViewer } from "./stored-visual-media-viewer";

const RECENT_LIMIT = 10;

type StoredSelection =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "loading"; mediaId: string }>
  | Readonly<{
      kind: "ready";
      mediaId: string;
      preview: StoredMediaPreview;
    }>
  | Readonly<{ kind: "error"; mediaId: string }>;

/**
 * Desktop-only media tools surface.
 *
 * Prompts and user-opened files remain session-local. Generated results can
 * cross the optional Desktop media-library bridge into the app-managed store;
 * recent entries then re-enter through the same File-backed viewers.
 */
export function DesktopMediaTools({
  selection,
  initialMediaId,
  onGenerationBusyChange,
}: {
  selection: DesktopMediaToolSelection;
  initialMediaId?: string | null;
  onGenerationBusyChange?: (busy: boolean) => void;
}) {
  const { tool, initialModelId } = selection;
  const librarySupported = mediaLibrary.isSupported();
  const [recents, setRecents] = useState<readonly MediaItem[]>([]);
  const [recentsLoading, setRecentsLoading] = useState(librarySupported);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [nativeAction, setNativeAction] = useState<string | null>(null);
  const [storedSelection, setStoredSelection] = useState<StoredSelection>(
    initialMediaId
      ? { kind: "loading", mediaId: initialMediaId }
      : { kind: "none" }
  );
  const storedSelectionLoading = Boolean(
    initialMediaId &&
    (storedSelection.kind === "none" ||
      storedSelection.mediaId !== initialMediaId ||
      storedSelection.kind === "loading")
  );
  const storedSelectionError = Boolean(
    initialMediaId &&
    storedSelection.kind === "error" &&
    storedSelection.mediaId === initialMediaId
  );
  const storedPreview =
    initialMediaId &&
    storedSelection.kind === "ready" &&
    storedSelection.mediaId === initialMediaId
      ? storedSelection.preview
      : null;
  const viewerTool = storedPreview
    ? DesktopMediaTool.resolve(StoredMedia.viewerToolId(storedPreview.mode))
    : tool;
  const activeToolId =
    viewerTool.id === "image-viewer"
      ? "image-generator"
      : viewerTool.id === "video-viewer"
        ? "video-generator"
        : viewerTool.id;
  const playgroundKey = storedPreview
    ? `${viewerTool.id}:${storedPreview.item.id}`
    : `${tool.id}:${initialModelId ?? "local"}`;
  const [generationOperations, setGenerationOperations] = useState(() =>
    GenerationOperationCounter.initial(playgroundKey)
  );
  const activePlaygroundKey = useRef(playgroundKey);
  const generationBusy = GenerationOperationCounter.isBusy(
    generationOperations,
    playgroundKey
  );

  useEffect(() => {
    activePlaygroundKey.current = playgroundKey;
    setGenerationOperations((current) =>
      current.epoch === playgroundKey
        ? current
        : GenerationOperationCounter.initial(playgroundKey)
    );
  }, [playgroundKey]);

  useEffect(() => {
    onGenerationBusyChange?.(generationBusy);
  }, [generationBusy, onGenerationBusyChange]);

  const setGenerationOperationBusy = useCallback(
    (busy: boolean) => {
      setGenerationOperations((current) =>
        GenerationOperationCounter.update(current, {
          sourceEpoch: playgroundKey,
          activeEpoch: activePlaygroundKey.current,
          busy,
        })
      );
    },
    [playgroundKey]
  );

  useEffect(() => {
    if (!librarySupported) {
      setRecentsLoading(false);
      return;
    }
    let active = true;
    setRecentsLoading(true);
    void mediaLibrary
      .list()
      .then((items) => {
        if (!active) return;
        setRecents(
          items.filter(StoredMedia.isSupported).slice(0, RECENT_LIMIT)
        );
        setLibraryError(null);
      })
      .catch(() => {
        if (active) setLibraryError("Could not load saved media.");
      })
      .finally(() => {
        if (active) setRecentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [librarySupported]);

  useEffect(() => {
    if (!initialMediaId) {
      setStoredSelection({ kind: "none" });
      return;
    }
    if (!librarySupported) {
      setStoredSelection({ kind: "error", mediaId: initialMediaId });
      return;
    }
    let active = true;
    setStoredSelection({ kind: "loading", mediaId: initialMediaId });
    void mediaLibrary
      .read(initialMediaId)
      .then((result) => {
        if (active) {
          setStoredSelection({
            kind: "ready",
            mediaId: initialMediaId,
            preview: StoredMedia.preview(result),
          });
        }
      })
      .catch(() => {
        if (active) {
          setStoredSelection({ kind: "error", mediaId: initialMediaId });
        }
      });
    return () => {
      active = false;
    };
  }, [initialMediaId, librarySupported]);

  const onStoredMediaCreated = (item: MediaItem) => {
    if (!StoredMedia.isSupported(item)) return;
    setRecents((current) =>
      [item, ...current.filter((candidate) => candidate.id !== item.id)].slice(
        0,
        RECENT_LIMIT
      )
    );
  };

  const reveal = async (item: MediaItem) => {
    if (nativeAction) return;
    setNativeAction(item.id);
    setLibraryError(null);
    try {
      await mediaLibrary.reveal(item.id);
    } catch {
      setLibraryError("Could not show this item in its folder.");
    } finally {
      setNativeAction(null);
    }
  };

  const openFolder = async () => {
    if (nativeAction) return;
    setNativeAction("folder");
    setLibraryError(null);
    try {
      await mediaLibrary.openFolder();
    } catch {
      setLibraryError("Could not open the media folder.");
    } finally {
      setNativeAction(null);
    }
  };

  return (
    <SidebarProvider
      data-testid="desktop-media-tools"
      aria-busy={generationBusy}
      className="min-h-0 flex-1 bg-background"
    >
      <Sidebar
        collapsible="none"
        className="w-56 shrink-0 border-r bg-muted/10"
        role="complementary"
        aria-label="Tools"
      >
        <h1 className="sr-only">Tools</h1>

        <SidebarContent>
          <nav aria-label="Tools">
            {DesktopMediaTool.groups.map((group) => (
              <SidebarGroup key={group.id}>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">
                    {DesktopMediaTool.list
                      .filter((item) => item.group === group.id)
                      .map((item) => {
                        const active = item.id === activeToolId;
                        const content = (
                          <>
                            <ToolIcon id={item.id} />
                            <span>{item.label}</span>
                          </>
                        );
                        return (
                          <SidebarMenuItem key={item.id}>
                            {generationBusy ? (
                              <SidebarMenuButton
                                isActive={active}
                                disabled
                                className="h-9 gap-2.5 px-2.5"
                                aria-current={active ? "page" : undefined}
                              >
                                {content}
                              </SidebarMenuButton>
                            ) : (
                              <SidebarMenuButton
                                asChild
                                isActive={active}
                                className="h-9 gap-2.5 px-2.5"
                              >
                                <Link
                                  href={DesktopMediaTool.href(item.id)}
                                  prefetch={false}
                                  scroll={false}
                                  aria-current={active ? "page" : undefined}
                                >
                                  {content}
                                </Link>
                              </SidebarMenuButton>
                            )}
                          </SidebarMenuItem>
                        );
                      })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}

            {librarySupported && (recentsLoading || recents.length > 0) && (
              <SidebarGroup
                className="mx-2 mt-1 w-auto border-t px-0 pt-3"
                aria-labelledby="tools-recents"
              >
                <div className="flex items-center justify-between px-2 pb-1.5">
                  <h2
                    id="tools-recents"
                    className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Recents
                  </h2>
                  {recentsLoading && (
                    <Loader2
                      className="size-3 animate-spin text-muted-foreground"
                      aria-label="Loading recent media"
                    />
                  )}
                </div>
                {recents.length > 0 && (
                  <SidebarMenu className="gap-0.5">
                    {recents.map((item) => {
                      const selected = initialMediaId === item.id;
                      return (
                        <SidebarMenuItem
                          key={item.id}
                          className={cn(
                            "group flex min-w-0 items-center rounded-md",
                            selected ? "bg-accent" : "hover:bg-accent/60"
                          )}
                        >
                          <Link
                            href={StoredMedia.href(item)}
                            prefetch={false}
                            scroll={false}
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5",
                              generationBusy && "pointer-events-none opacity-50"
                            )}
                            aria-current={selected ? "page" : undefined}
                            aria-disabled={generationBusy || undefined}
                            tabIndex={generationBusy ? -1 : undefined}
                            onClick={(event) => {
                              if (generationBusy) event.preventDefault();
                            }}
                          >
                            <StoredMediaIcon item={item} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium">
                                {item.file_name}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {StoredMedia.formatLabel(item)} ·{" "}
                                {formatRecentTime(item.created_at)}
                              </span>
                            </span>
                          </Link>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label={`Show ${item.file_name} in folder`}
                            disabled={generationBusy || nativeAction !== null}
                            onClick={() => void reveal(item)}
                          >
                            {nativeAction === item.id ? (
                              <Loader2 className="animate-spin" aria-hidden />
                            ) : (
                              <FolderSearch aria-hidden />
                            )}
                          </Button>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                )}
              </SidebarGroup>
            )}
          </nav>
        </SidebarContent>

        {(librarySupported || libraryError) && (
          <SidebarFooter className="border-t" aria-live="polite">
            {librarySupported && (
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    disabled={generationBusy || nativeAction !== null}
                    onClick={() => void openFolder()}
                  >
                    {nativeAction === "folder" ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <FolderOpen aria-hidden />
                    )}
                    <span>Media folder</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            )}
            {libraryError && (
              <p
                className="px-2 py-1 text-[11px] text-destructive"
                role="alert"
              >
                {libraryError}
              </p>
            )}
          </SidebarFooter>
        )}
      </Sidebar>

      <SidebarInset className="min-h-0 min-w-0">
        {storedSelectionLoading ? (
          <StoredMediaLoading />
        ) : storedSelectionError ? (
          <StoredMediaError toolId={storedMediaRecoveryToolId(tool.id)} />
        ) : (
          <DesktopMediaToolContent
            key={playgroundKey}
            tool={viewerTool}
            initialModelId={storedPreview ? null : initialModelId}
            storedPreview={storedPreview}
            generationDisabled={generationBusy}
            onGenerationBusyChange={setGenerationOperationBusy}
            onStoredMediaCreated={onStoredMediaCreated}
            revealDisabled={nativeAction !== null}
            onRevealStoredMedia={(item) => void reveal(item)}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

function DesktopMediaToolContent({
  tool,
  initialModelId,
  storedPreview,
  generationDisabled,
  revealDisabled,
  onGenerationBusyChange,
  onStoredMediaCreated,
  onRevealStoredMedia,
}: {
  tool: DesktopMediaToolSpec;
  initialModelId: string | null;
  storedPreview: StoredMediaPreview | null;
  generationDisabled: boolean;
  revealDisabled: boolean;
  onGenerationBusyChange: (busy: boolean) => void;
  onStoredMediaCreated: (item: MediaItem) => void;
  onRevealStoredMedia: (item: MediaItem) => void;
}) {
  if (storedPreview) {
    switch (storedPreview.mode) {
      case "image":
      case "video":
        return (
          <StoredVisualMediaViewer
            preview={storedPreview}
            revealDisabled={revealDisabled}
            onReveal={() => onRevealStoredMedia(storedPreview.item)}
          />
        );
      case "3d":
        return (
          <GltfViewerTool
            initialStoredMedia={storedPreview}
            onRevealStoredMedia={onRevealStoredMedia}
          />
        );
      case "audio":
        return (
          <AudioPlayerTool
            initialStoredMedia={storedPreview}
            onRevealStoredMedia={onRevealStoredMedia}
          />
        );
    }
  }

  switch (tool.id) {
    case "image-generator":
      return (
        <DesktopImagePlayground
          initialModelId={initialModelId ?? undefined}
          showGridLeftBorder={false}
          onGenerationBusyChange={onGenerationBusyChange}
          onStoredMediaCreated={onStoredMediaCreated}
        />
      );
    case "video-generator":
      return (
        <DesktopVideoPlayground
          initialModelId={initialModelId ?? undefined}
          showGridLeftBorder={false}
          onGenerationBusyChange={onGenerationBusyChange}
          onStoredMediaCreated={onStoredMediaCreated}
        />
      );
    case "3d-generator":
      return (
        <ThreeDPlayground
          initialModelId={
            (initialModelId as models.three_d.ThreeDModelId | null) ?? undefined
          }
          modelIds={tool.modelIds as readonly models.three_d.ThreeDModelId[]}
          generationDisabled={generationDisabled}
          onGenerationBusyChange={onGenerationBusyChange}
          onStoredMediaCreated={onStoredMediaCreated}
          onRevealStoredMedia={onRevealStoredMedia}
        />
      );
    case "text-to-music":
      return (
        <MusicPlayground
          initialModelId={
            (initialModelId as models.audio.music.ModelId | null) ?? undefined
          }
          modelIds={tool.modelIds as readonly models.audio.music.ModelId[]}
          generationDisabled={generationDisabled}
          onGenerationBusyChange={onGenerationBusyChange}
          onStoredMediaCreated={onStoredMediaCreated}
          onRevealStoredMedia={onRevealStoredMedia}
        />
      );
    case "text-to-sound-effects":
      return (
        <SoundEffectPlayground
          initialModelId={
            (initialModelId as models.audio.sound_effects.ModelId | null) ??
            undefined
          }
          modelIds={
            tool.modelIds as readonly models.audio.sound_effects.ModelId[]
          }
          generationDisabled={generationDisabled}
          onGenerationBusyChange={onGenerationBusyChange}
          onStoredMediaCreated={onStoredMediaCreated}
          onRevealStoredMedia={onRevealStoredMedia}
        />
      );
    case "3d-viewer":
      return <GltfViewerTool />;
    case "audio-player":
      return <AudioPlayerTool />;
    case "image-viewer":
      return <StoredMediaError toolId="image-generator" />;
    case "video-viewer":
      return <StoredMediaError toolId="video-generator" />;
  }
}

function StoredMediaLoading() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
      Opening saved media…
    </div>
  );
}

function StoredMediaError({ toolId }: { toolId: DesktopMediaToolId }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <h2 className="text-base font-semibold">Couldn’t open saved media</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The item may have moved or become unreadable. Other saved results are
          still available from Recents.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={DesktopMediaTool.href(toolId)} prefetch={false}>
            Open tool
          </Link>
        </Button>
      </div>
    </div>
  );
}

function storedMediaRecoveryToolId(
  toolId: DesktopMediaToolId
): DesktopMediaToolId {
  if (toolId === "image-viewer") return "image-generator";
  if (toolId === "video-viewer") return "video-generator";
  return toolId;
}

function StoredMediaIcon({ item }: { item: MediaItem }) {
  const className = "size-3.5 shrink-0 text-muted-foreground";
  switch (StoredMedia.mode(item)) {
    case "image":
      return <ImageIcon className={className} aria-hidden />;
    case "video":
      return <Video className={className} aria-hidden />;
    case "3d":
      return <Box className={className} aria-hidden />;
    case "audio":
    case null:
      return <Volume2 className={className} aria-hidden />;
  }
}

function ToolIcon({ id }: { id: DesktopMediaToolId }) {
  const className = "size-4 shrink-0";
  switch (id) {
    case "image-generator":
    case "image-viewer":
      return <ImageIcon className={className} aria-hidden />;
    case "video-generator":
    case "video-viewer":
      return <Video className={className} aria-hidden />;
    case "3d-generator":
    case "3d-viewer":
      return <Box className={className} aria-hidden />;
    case "text-to-music":
      return <Music2 className={className} aria-hidden />;
    case "text-to-sound-effects":
      return <AudioWaveform className={className} aria-hidden />;
    case "audio-player":
      return <Volume2 className={className} aria-hidden />;
  }
}

function formatRecentTime(timestamp: number): string {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 1000)
  );
  if (elapsedSeconds < 60) return "Now";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(timestamp).toLocaleDateString();
}
