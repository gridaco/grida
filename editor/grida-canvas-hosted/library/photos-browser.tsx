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
import { useVirtualizer } from "@tanstack/react-virtual";

export type PhotosBrowserProps = {
  onInsert?: (photo: PhotoAsset) => Promise<void> | void;
  onDragStart?: (
    photo: PhotoAsset,
    event: React.DragEvent<HTMLElement>
  ) => void;
  perPage?: number;
};

function PhotosBrowserImpl({
  onInsert,
  onDragStart,
  perPage = 30,
}: PhotosBrowserProps) {
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [topics, setTopics] = useState<PhotoTopic[]>([]);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);
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

  const load = useCallback(
    (params: { mode: "search" | "random" | "topic"; topicSlug?: string }) => {
      startTransition(async () => {
        setError(null);
        const next = await fetchPhotosAction({
          mode: params.mode,
          query,
          perPage,
          topicSlug: params.topicSlug,
        });
        if (next.status === "error") {
          setPhotos([]);
          setError(next.message ?? "Failed to load photos");
          return;
        }
        setPhotos(next.results);
      });
    },
    [perPage, query]
  );

  useEffect(() => {
    load({ mode: "random" });
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const loadTopics = async () => {
      try {
        const list = await fetchPhotoTopics();
        if (cancelled) return;
        setTopics(list);
      } catch (e) {
        if (cancelled) return;
        setTopicsError(
          e instanceof Error ? e.message : "Failed to load topics."
        );
      }
    };
    void loadTopics();
    return () => {
      cancelled = true;
    };
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
              setSelectedTopic(null);
              load({ mode: "search" });
            }
          }}
          className="flex-1"
        />
      </div>

      <div className="border-b bg-background/60">
        {topics.length > 0 && (
          <PillsList className="py-2">
            <Pill
              active={selectedTopic === null}
              label="Random"
              onClick={() => {
                setSelectedTopic(null);
                setQuery("");
                load({ mode: "random" });
              }}
              disabled={isPending}
            />
            {topics.map((topic) => (
              <Pill
                key={topic.slug}
                active={selectedTopic === topic.slug}
                label={topic.title}
                thumbnail={topic.coverUrl}
                onClick={() => {
                  setSelectedTopic(topic.slug);
                  setQuery("");
                  load({ mode: "topic", topicSlug: topic.slug });
                }}
                disabled={isPending}
              />
            ))}
          </PillsList>
        )}
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
        </div>
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
