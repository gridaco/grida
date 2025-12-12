"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Image from "next/image";
import type { PhotoAsset, PhotoTopic } from "./lib-photos-actions";
import { fetchPhotoTopics, fetchPhotosAction } from "./lib-photos-actions";
import { SearchInput } from "./components/search-input";
import { Pill, PillsList } from "./components/pills";
import { LoadingIndicator } from "./components/loading-indicator";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { UnsplashLogoIcon } from "@/components/logos/unsplash";
import { useVirtualizer } from "@tanstack/react-virtual";

export type PhotosBrowserProps = {
  onInsert?: (photo: PhotoAsset) => Promise<void> | void;
  onDragStart?: (
    photo: PhotoAsset,
    event: React.DragEvent<HTMLElement>
  ) => void;
  perPage?: number;
};

type PhotoMode = "search" | "random" | "topic";

function usePhotos(perPage: number) {
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [topics, setTopics] = useState<PhotoTopic[]>([]);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentMode, setCurrentMode] = useState<PhotoMode>("random");
  const [currentQuery, setCurrentQuery] = useState("");
  const [currentTopicSlug, setCurrentTopicSlug] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);

  // Scroll detection for infinite scrolling
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasInitialLoadRef = useRef(false);

  const loadInitial = useCallback(
    (params: { mode: PhotoMode; topicSlug?: string }) => {
      // Reset scroll to top when switching topics/queries
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }

      startTransition(async () => {
        setError(null);
        setCurrentPage(1);
        setHasMore(true);
        setCurrentMode(params.mode);
        setCurrentQuery(query);
        setCurrentTopicSlug(params.topicSlug ?? null);

        const next = await fetchPhotosAction({
          mode: params.mode,
          query,
          perPage,
          topicSlug: params.topicSlug,
          page: 1,
        });
        if (next.status === "error") {
          setPhotos([]);
          setError(next.message ?? "Failed to load photos");
          setHasMore(false);
          setTotalPages(0);
          return;
        }
        setPhotos(next.results);
        setTotalPages(next.totalPages ?? 1);
        setHasMore((next.totalPages ?? 1) > 1);
      });
    },
    [perPage, query]
  );

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || isPending) return;

    setIsLoadingMore(true);
    try {
      // For random mode, just fetch more random photos (no pagination)
      if (currentMode === "random") {
        const next = await fetchPhotosAction({
          mode: "random",
          query: "",
          perPage,
          page: 1,
        });

        if (next.status === "error") {
          setError(next.message ?? "Failed to load more photos");
          setIsLoadingMore(false);
          return;
        }

        setPhotos((prev) => [...prev, ...next.results]);
        // Random mode always has more (we can keep fetching)
        setHasMore(true);
      } else {
        // For search and topic modes, use pagination
        const nextPage = currentPage + 1;
        const next = await fetchPhotosAction({
          mode: currentMode,
          query: currentQuery,
          perPage,
          topicSlug: currentTopicSlug ?? undefined,
          page: nextPage,
        });

        if (next.status === "error") {
          setError(next.message ?? "Failed to load more photos");
          setIsLoadingMore(false);
          return;
        }

        setPhotos((prev) => [...prev, ...next.results]);
        setCurrentPage(nextPage);
        setHasMore(nextPage < (next.totalPages ?? 1));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more photos");
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    currentPage,
    hasMore,
    isLoadingMore,
    isPending,
    currentMode,
    currentQuery,
    currentTopicSlug,
    perPage,
  ]);

  // Scroll detection for infinite scrolling
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoadingMore || isPending) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting && hasMore && !isLoadingMore && !isPending) {
          void loadMore();
        }
      },
      {
        root: scrollRef.current,
        rootMargin: "200px",
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isPending, loadMore]);

  // Load initial photos - only once on mount
  useEffect(() => {
    if (!hasInitialLoadRef.current) {
      hasInitialLoadRef.current = true;
      loadInitial({ mode: "random" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Load topics
  useEffect(() => {
    let cancelled = false;
    const loadTopics = async () => {
      setTopicsLoading(true);
      try {
        const list = await fetchPhotoTopics();
        if (cancelled) return;
        setTopics(list);
      } catch (e) {
        if (cancelled) return;
        setTopicsError(
          e instanceof Error ? e.message : "Failed to load topics."
        );
      } finally {
        if (!cancelled) {
          setTopicsLoading(false);
        }
      }
    };
    void loadTopics();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = useCallback(() => {
    setSelectedTopic(null);
    loadInitial({ mode: "search" });
  }, [loadInitial]);

  const handleSelectRandom = useCallback(() => {
    setSelectedTopic(null);
    setQuery("");
    loadInitial({ mode: "random" });
  }, [loadInitial]);

  const handleSelectTopic = useCallback(
    (topicSlug: string) => {
      setSelectedTopic(topicSlug);
      setQuery("");
      loadInitial({ mode: "topic", topicSlug });
    },
    [loadInitial]
  );

  return {
    // State
    photos,
    topics,
    topicsError,
    selectedTopic,
    error,
    isPending,
    isLoadingMore,
    hasMore,
    query,
    // Refs
    scrollRef,
    sentinelRef,
    // Actions
    setQuery,
    handleSearch,
    handleSelectRandom,
    handleSelectTopic,
    topicsLoading,
  };
}

function PhotosBrowserImpl({
  onInsert,
  onDragStart,
  perPage = 30,
}: PhotosBrowserProps) {
  const {
    photos,
    topics,
    topicsError,
    selectedTopic,
    error,
    isPending,
    isLoadingMore,
    hasMore,
    query,
    scrollRef,
    sentinelRef,
    setQuery,
    handleSearch,
    handleSelectRandom,
    handleSelectTopic,
    topicsLoading,
  } = usePhotos(perPage);

  const [containerWidth, setContainerWidth] = useState<number>(0);

  // derive per-item estimated height based on 2 columns layout
  const estimateSize = useCallback(
    (index: number) => {
      const item = photos[index];
      if (!item) return 160;
      const gutter = 12;
      const columns = 2;
      const width =
        containerWidth > 0
          ? (containerWidth - gutter * (columns - 1)) / columns
          : 200;
      const aspect = item.width && item.height ? item.width / item.height : 1; // fallback square if unknown
      const imageHeight = Math.round(width / (aspect || 1));
      return imageHeight + gutter;
    },
    [photos, containerWidth]
  );

  const virtualizer = useVirtualizer({
    count: photos.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: 6,
    lanes: 2,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        setContainerWidth(width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleInsert = useCallback(
    async (photo: PhotoAsset) => {
      if (!onInsert) return;
      await onInsert(photo);
    },
    [onInsert]
  );

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex items-center gap-2 border-b bg-background/60 px-2 py-2">
        <SearchInput
          placeholder="Search photos"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearch();
            }
          }}
          className="flex-1"
        />
      </div>

      <div className="border-b bg-background/60">
        <PillsList className="py-2">
          <Pill
            active={selectedTopic === null}
            label="Random"
            onClick={handleSelectRandom}
          />
          {topicsLoading
            ? // Show 5 skeleton pills while loading
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton
                  key={`skeleton-${i}`}
                  className="h-7 w-20 rounded-full"
                />
              ))
            : topics.map((topic) => (
                <Pill
                  key={topic.slug}
                  active={selectedTopic === topic.slug}
                  label={topic.title}
                  thumbnail={topic.coverUrl}
                  onClick={() => handleSelectTopic(topic.slug)}
                />
              ))}
        </PillsList>
        {topicsError ? (
          <div className="px-2 pb-2 text-xs text-destructive">
            {topicsError}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="p-3 text-xs text-destructive">{error}</div>
      ) : null}

      <LoadingIndicator loading={isPending} />

      <div ref={scrollRef} className="relative flex-1 overflow-auto p-2">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = photos[virtualItem.index];
            if (!item) return null;
            const gutter = 8;
            const columns = 2;
            const columnWidth =
              containerWidth > 0
                ? (containerWidth - gutter * (columns - 1)) / columns
                : 200;
            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: virtualItem.lane * (columnWidth + gutter),
                  width: columnWidth,
                  transform: `translateY(${virtualItem.start}px)`,
                  paddingBottom: gutter,
                }}
              >
                <PhotoCard
                  data={item}
                  width={columnWidth}
                  index={virtualItem.index}
                  onInsert={handleInsert}
                  onDragStart={onDragStart}
                />
              </div>
            );
          })}
          {/* Sentinel element for infinite scrolling - positioned at bottom of content */}
          {hasMore && (
            <div
              ref={sentinelRef}
              style={{
                position: "absolute",
                top: `${virtualizer.getTotalSize()}px`,
                left: 0,
                right: 0,
                height: "1px",
                pointerEvents: "none",
              }}
            />
          )}
        </div>
        {/* Loading indicator for load more */}
        {isLoadingMore && (
          <div className="flex items-center justify-center py-4">
            <Spinner />
          </div>
        )}
        {/* End of results message */}
        {!hasMore && photos.length > 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span>Photos from</span>
              <a
                href="https://unsplash.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-foreground/70 hover:text-foreground transition-colors"
              >
                <UnsplashLogoIcon className="size-4" />
                <span>Unsplash</span>
              </a>
              <span>❤️</span>
            </div>
            <div className="text-[10px] text-muted-foreground/80">
              All photos are free to use thanks to our amazing photographers
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const PhotosBrowser = memo(PhotosBrowserImpl);

type PhotoCardProps = {
  data: PhotoAsset;
  width: number;
  index: number;
  onInsert?: (photo: PhotoAsset) => void;
  onDragStart?: (
    photo: PhotoAsset,
    event: React.DragEvent<HTMLElement>
  ) => void;
};

function PhotoCard({ data, width, onInsert, onDragStart }: PhotoCardProps) {
  const aspect = data.width && data.height ? data.width / data.height : 1;
  const imageHeight = Math.round(width / (aspect || 1));

  return (
    <figure
      className="group relative overflow-hidden rounded-md bg-card cursor-pointer"
      style={{ width }}
      draggable={!!onDragStart}
      onClick={() => onInsert?.(data)}
      onDragStart={(e) => {
        if (onDragStart) {
          onDragStart(data, e);
        }
      }}
    >
      <div className="relative w-full bg-muted">
        <Image
          src={data.urls.small || data.urls.regular || data.urls.full}
          alt={data.alt || "Photo"}
          width={data.width ?? Math.round(width)}
          height={data.height ?? Math.round(imageHeight)}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="h-auto w-full object-cover"
        />
      </div>
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/40 via-40% to-transparent p-2 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="line-clamp-1 font-medium drop-shadow">
          {data.alt || "Untitled photo"}
        </div>
        <div className="text-white/80 drop-shadow">
          {data.author.name}
          {data.author.username ? ` (@${data.author.username})` : ""}
        </div>
      </figcaption>
    </figure>
  );
}
