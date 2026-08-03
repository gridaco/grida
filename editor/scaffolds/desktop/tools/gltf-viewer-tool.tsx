"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Box, FileUp, FolderSearch, X } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@app/ui/components/empty";
import type { MediaItem } from "@/lib/desktop/bridge";
import { LocalGltfBundle } from "../media-formats/local-gltf-bundle";
import { LocalGltfPreview } from "../media-formats/local-gltf-preview";
import type { LocalGltfPreviewController } from "../media-formats/local-gltf-preview-controller";
import { FileDownloadButton } from "../shared/file-download-button";

const GLTF_BUNDLE_ACCEPT = [
  LocalGltfBundle.ACCEPT,
  ".bin,.png,.jpg,.jpeg,.webp,.avif,image/png,image/jpeg,image/webp,image/avif",
].join(",");

type StoredFile = Readonly<{
  item: MediaItem;
  file: File;
}>;

/** Local GLB/glTF inspection tool. It owns no generation or model concerns. */
export function GltfViewerTool({
  initialStoredMedia = null,
  onRevealStoredMedia,
}: {
  initialStoredMedia?: StoredFile | null;
  onRevealStoredMedia?: (item: MediaItem) => void;
}) {
  const [files, setFiles] = useState<readonly File[]>(
    initialStoredMedia ? [initialStoredMedia.file] : []
  );
  const [source, setSource] = useState<"local" | "stored" | null>(
    initialStoredMedia ? "stored" : null
  );
  const [storedMedia, setStoredMedia] = useState<MediaItem | null>(
    initialStoredMedia?.item ?? null
  );
  const [status, setStatus] = useState<LocalGltfPreviewController.Status>({
    phase: "idle",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const onFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (nextFiles.length === 0) return;
    setFiles(nextFiles);
    setSource("local");
    setStoredMedia(null);
    setStatus({ phase: "idle" });
  };

  const clear = () => {
    setFiles([]);
    setSource(null);
    setStoredMedia(null);
    setStatus({ phase: "idle" });
  };

  return (
    <section
      data-testid="tool-gltf-viewer"
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-6 py-4">
        <h2 className="mr-2 min-w-0 text-2xl font-bold tracking-tight">
          3D viewer
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {source === "stored" && files[0] && (
            <FileDownloadButton file={files[0]} />
          )}
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
          {files.length > 0 && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => inputRef.current?.click()}
              >
                <FileUp aria-hidden />
                Replace
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={clear}>
                <X aria-hidden />
                Clear
              </Button>
            </>
          )}
        </div>
      </header>

      <input
        ref={inputRef}
        id="gltf-viewer-files"
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept={GLTF_BUNDLE_ACCEPT}
        multiple
        aria-describedby="gltf-viewer-help"
        onChange={onFilesChange}
      />

      <div className="min-h-0 flex-1 p-4">
        {files.length > 0 ? (
          <div className="h-full overflow-hidden rounded-lg border bg-muted/20">
            <LocalGltfPreview files={files} active onStatusChange={setStatus} />
          </div>
        ) : (
          <Empty className="h-full bg-transparent">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Box />
              </EmptyMedia>
              <EmptyTitle>Open a 3D file</EmptyTitle>
              <EmptyDescription id="gltf-viewer-help">
                Choose a GLB or a complete glTF bundle.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
              >
                <FileUp aria-hidden />
                Choose file
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>

      {files.length > 0 && (
        <GltfStatusStrip files={files} source={source} status={status} />
      )}
    </section>
  );
}

function GltfStatusStrip({
  files,
  source,
  status,
}: {
  files: readonly File[];
  source: "local" | "stored" | null;
  status: LocalGltfPreviewController.Status;
}) {
  let summary = "GLB stable · glTF bundle experimental";
  if (status.phase === "loading") summary = "Preparing local 3D preview…";
  if (status.phase === "error") summary = "Preview failed";
  if (status.phase === "ready") {
    summary =
      status.format.toUpperCase() +
      " · " +
      status.stability +
      " · " +
      status.objectCount.toLocaleString() +
      " objects · " +
      status.triangleCount.toLocaleString() +
      " triangles · " +
      status.animationCount.toLocaleString() +
      " animations";
  }
  const selection =
    source === "stored"
      ? files[0]!.name + " · saved locally"
      : files.length +
        " local file" +
        (files.length === 1 ? "" : "s") +
        " selected";

  return (
    <footer
      className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-t px-6 py-2 text-xs"
      aria-live="polite"
    >
      <span className="font-medium">{selection}</span>
      <span className="text-muted-foreground">{summary}</span>
    </footer>
  );
}
