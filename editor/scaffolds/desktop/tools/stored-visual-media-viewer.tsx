"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, FolderSearch, Loader2 } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { ZoomableImage } from "@/components/zoomable-image";
import type { StoredMediaPreview } from "./stored-media";

type ObjectSource = Readonly<{
  file: File;
  url: string;
}>;

/** File-backed read-only viewer for durable generated image/video results. */
export function StoredVisualMediaViewer({
  preview,
  revealDisabled = false,
  onReveal,
}: {
  preview: StoredMediaPreview;
  revealDisabled?: boolean;
  onReveal?: () => void;
}) {
  const [source, setSource] = useState<ObjectSource | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setSource(null);
    setLoadFailed(false);
    const url = URL.createObjectURL(preview.file);
    setSource({ file: preview.file, url });
    return () => {
      const video = videoRef.current;
      if (video?.getAttribute("src") === url) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      URL.revokeObjectURL(url);
    };
  }, [preview.file]);

  const currentUrl = source?.file === preview.file ? source.url : null;
  const visualMode = preview.mode === "image" || preview.mode === "video";

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
          {preview.item.file_name}
        </h2>
        {onReveal && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={revealDisabled}
            onClick={onReveal}
          >
            <FolderSearch aria-hidden />
            Show in folder
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1">
        {!visualMode || loadFailed ? (
          <VisualMediaError />
        ) : !currentUrl ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            Opening saved media…
          </div>
        ) : preview.mode === "image" ? (
          <ZoomableImage
            src={currentUrl}
            alt={preview.item.file_name}
            onError={() => setLoadFailed(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center overflow-auto bg-muted/30 p-4">
            <video
              ref={videoRef}
              src={currentUrl}
              controls
              playsInline
              preload="metadata"
              className="max-h-full max-w-full object-contain"
              onError={() => setLoadFailed(true)}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function VisualMediaError() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-sm text-center text-sm text-muted-foreground">
        <AlertCircle className="mx-auto mb-2 size-5 text-destructive" />
        This saved file could not be displayed in the built-in viewer.
      </div>
    </div>
  );
}
