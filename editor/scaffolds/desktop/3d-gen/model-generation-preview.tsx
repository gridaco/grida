"use client";

import { useMemo } from "react";
import { Box, FolderSearch, Loader2 } from "lucide-react";
import { Button } from "@app/ui/components/button";
import type { MediaItem } from "@/lib/desktop/bridge";
import { LocalGltfPreview } from "../media-formats/local-gltf-preview";
import { FileDownloadButton } from "../shared/file-download-button";

/** The generated file stays usable even when the optional media store fails. */
export function ModelGenerationPreview({
  file,
  storedMedia,
  busy,
  onRevealStoredMedia,
}: {
  file: File | null;
  storedMedia?: MediaItem;
  busy: boolean;
  onRevealStoredMedia?: (item: MediaItem) => void;
}) {
  const files = useMemo(() => (file ? [file] : []), [file]);
  return (
    <div
      data-testid="model-generation-preview"
      className="flex min-h-80 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-muted/20"
      aria-busy={busy}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {file ? (
          <div className="h-full min-h-80 w-full">
            <LocalGltfPreview files={files} active />
          </div>
        ) : (
          <div className="max-w-sm px-6 py-12 text-center">
            {busy ? (
              <Loader2
                className="mx-auto mb-4 size-7 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : (
              <Box
                className="mx-auto mb-4 size-7 text-muted-foreground"
                aria-hidden
              />
            )}
            <p className="font-medium" role="status">
              {busy ? "Generating your model…" : "Your model will appear here"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {busy
                ? "Generation can take several minutes. Keep this window open."
                : "Start with a description, one image, or several views of the same object."}
            </p>
          </div>
        )}
      </div>
      {file && (
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background px-4 py-3">
          <p className="min-w-0 text-sm" role="status">
            {busy
              ? "Generating a new model…"
              : storedMedia
                ? "Saved to Recents"
                : "Ready to download"}
          </p>
          <div className="flex items-center gap-2">
            <FileDownloadButton file={file} />
            {storedMedia && onRevealStoredMedia && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onRevealStoredMedia(storedMedia)}
              >
                <FolderSearch aria-hidden />
                Show in folder
              </Button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
