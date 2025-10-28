"use client";

import React, { ComponentType } from "react";
import {
  useInfiniteLoader,
  type MasonryProps,
  type LoadMoreItemsCallback,
} from "masonic";
import type { Library } from "@/lib/library";
import { getBlurDataURLFromColor } from "@/utils/placeholder";
import { Button } from "@/components/ui/button";
import { DownloadIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { Spinner } from "@/components/ui/spinner";

const Masonry: ComponentType<MasonryProps<ObjectDetail>> = dynamic(
  () => import("masonic").then((mod) => mod.Masonry),
  { ssr: false }
);

type ObjectDetail = Library.Object & {
  url: string;
  download: string;
  author: Library.Author | null;
};

export function GallerySkeleton() {
  return (
    <div className="w-full flex items-center justify-center">
      <Spinner />
    </div>
  );
}

export default function Gallery({
  objects,
  next,
  count,
  empty = (
    <div className="w-full h-full min-h-96 flex items-center justify-center text-center text-muted-foreground">
      <span>No results found.</span>
    </div>
  ),
}: {
  objects: ObjectDetail[];
  next?: (range: [number, number]) => Promise<ObjectDetail[]>;
  empty?: React.ReactNode;
  count?: number;
}) {
  const loadingRef = React.useRef(false);
  const [busy, setBusy] = React.useState(false);
  const [fetchedItems, setFetchedItems] = React.useState(objects);

  const maybeLoadMore = useInfiniteLoader<
    Library.ObjectDetail,
    LoadMoreItemsCallback<Library.ObjectDetail>
  >(
    async (startIndex, stopIndex) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setBusy(true);

      if (next) {
        const nextItems = await next([startIndex, stopIndex - 1]);
        setFetchedItems((current) => [...current, ...nextItems]);
      }

      loadingRef.current = false;
      setBusy(false);
    },
    {
      minimumBatchSize: 30,
      isItemLoaded: (index, items) => index < items.length,
      totalItems: count,
    }
  );

  const items = React.useMemo(() => {
    const seen = new Set<string>();
    return fetchedItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [fetchedItems]);

  return (
    <div className="w-full min-h-96">
      {process.env.NODE_ENV === "development" && (
        <div className="fixed right-0 top-0 z-50 p-4">
          {fetchedItems.length} / {items.length}
        </div>
      )}
      {objects.length > 0 ? (
        <>
          <Masonry
            onRender={maybeLoadMore}
            columnGutter={16}
            rowGutter={16}
            maxColumnCount={6}
            items={items}
            itemKey={(data) => data.id}
            render={ImageCard}
          />
          {busy && (
            <div className="py-20 w-full flex items-center justify-center mt-4">
              <Spinner />
            </div>
          )}
        </>
      ) : (
        <>{empty}</>
      )}
    </div>
  );
}

function ImageCard({
  data: object,
  width,
}: {
  width: number;
  data: ObjectDetail;
}) {
  const aspect_ratio = object.width / object.height;
  const height = width / aspect_ratio;

  const text =
    object.description || object.alt || object.title || object.prompt;

  return (
    <motion.figure
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      viewport={{ once: true }}
      className="group relative overflow-hidden rounded-lg"
      itemScope
      itemType="http://schema.org/ImageObject"
      style={{
        width: width,
        height: height,
      }}
    >
      <Link href={`/library/o/${object.id}`}>
        <Image
          src={object.url}
          alt={
            object.alt ||
            object.description ||
            object.title ||
            object.prompt ||
            object.category ||
            "Image"
          }
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          placeholder={object.color ? "blur" : undefined}
          blurDataURL={
            object.color ? getBlurDataURLFromColor(object.color) : undefined
          }
          className="w-full h-full object-cover absolute inset-0"
          style={{
            backgroundColor: object.transparency
              ? "transparent"
              : (object.color ?? undefined),
          }}
        />
        <meta itemProp="contentUrl" content={object.url} />
        <meta itemProp="license" content={object.license} />
      </Link>
      <figcaption className="sr-only" itemProp="caption">
        {text}
      </figcaption>
      <div className="absolute inset-0 pointer-events-none bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-4">
        <div className="w-full h-full flex flex-col justify-between">
          <div>
            {object.generator && (
              <div>
                <Tooltip delayDuration={10}>
                  <TooltipTrigger className="pointer-events-auto">
                    <SparklesIcon className="size-3" />
                  </TooltipTrigger>
                  <TooltipContent>
                    This image is generated by {object.generator}
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
          <div>
            <p className="text-xs line-clamp-2 opacity-80">{text}</p>
            {object.author && (
              <span
                itemProp="author"
                itemScope
                itemType="http://schema.org/Person"
                className="pointer-events-auto"
              >
                <Link
                  href={object.author.blog ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline mt-2"
                  itemProp="url"
                >
                  <span itemProp="name">@{object.author.name}</span>
                </Link>
              </span>
            )}
            <div className="mt-4 flex justify-between items-center">
              <Tooltip delayDuration={10}>
                <TooltipTrigger className="pointer-events-auto">
                  <span className="text-[8px] opacity-80">
                    {object.license}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Free for commercial use, no attribution required.
                </TooltipContent>
              </Tooltip>
              <Link
                href={object.download}
                download
                className="pointer-events-auto"
              >
                <Button variant="ghost">
                  <DownloadIcon className="size-4" />
                  Download
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </motion.figure>
  );
}
