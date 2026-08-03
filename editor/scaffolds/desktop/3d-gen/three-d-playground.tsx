"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Box, FileUp, FolderSearch, X } from "lucide-react";
import { models } from "@grida/ai-models";
import { Button } from "@app/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@app/ui/components/empty";
import { Tabs, TabsList, TabsTrigger } from "@app/ui/components/tabs";
import type { MediaItem } from "@/lib/desktop/bridge";
import { LocalGltfBundle } from "../media-formats/local-gltf-bundle";
import { LocalGltfPreview } from "../media-formats/local-gltf-preview";
import { FileDownloadButton } from "../shared/file-download-button";
import {
  ThreeDGenerationControls,
  type ThreeDGeneratedPreview,
  type ThreeDGenerationInputMode,
} from "./three-d-generation-controls";

const GLTF_BUNDLE_ACCEPT = [
  LocalGltfBundle.ACCEPT,
  ".bin,.png,.jpg,.jpeg,.webp,.avif,image/png,image/jpeg,image/webp,image/avif",
].join(",");

/** fal-only 3D generation playground with a GLB/glTF output boundary. */
export function ThreeDPlayground({
  initialModelId,
  modelIds,
  generationDisabled = false,
  onGenerationBusyChange,
  onStoredMediaCreated,
  onRevealStoredMedia,
}: {
  initialModelId?: models.three_d.ThreeDModelId;
  modelIds?: readonly models.three_d.ThreeDModelId[];
  generationDisabled?: boolean;
  onGenerationBusyChange?: (busy: boolean) => void;
  onStoredMediaCreated?: (item: MediaItem) => void;
  onRevealStoredMedia?: (item: MediaItem) => void;
}) {
  const availableModelIds = modelIds ?? models.three_d.three_d_model_ids;
  const initialInputMode: ThreeDGenerationInputMode = initialModelId
    ? models.three_d.models[initialModelId].input.type
    : availableModelIds.some(
          (id) => models.three_d.models[id].input.type === "text"
        )
      ? "text"
      : "image";
  const [inputMode, setInputMode] =
    useState<ThreeDGenerationInputMode>(initialInputMode);
  const [files, setFiles] = useState<readonly File[]>([]);
  const [source, setSource] = useState<"local" | "generated" | null>(null);
  const [storedMedia, setStoredMedia] = useState<MediaItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasTextInput = availableModelIds.some(
    (id) => models.three_d.models[id].input.type === "text"
  );
  const hasImageInput = availableModelIds.some(
    (id) => models.three_d.models[id].input.type === "image"
  );

  const onFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (nextFiles.length === 0) return;
    setFiles(nextFiles);
    setSource("local");
    setStoredMedia(null);
  };

  const onGenerated = (result: ThreeDGeneratedPreview) => {
    setFiles([result.file]);
    setSource("generated");
    setStoredMedia(result.storedMedia ?? null);
    if (result.storedMedia) onStoredMediaCreated?.(result.storedMedia);
  };

  const clear = () => {
    setFiles([]);
    setSource(null);
    setStoredMedia(null);
  };

  return (
    <section
      data-testid="playground-three-d-generation"
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-6 py-4">
        <h2 className="mr-2 min-w-0 text-2xl font-bold tracking-tight">
          3D model
        </h2>
        {hasTextInput && hasImageInput && (
          <Tabs
            value={inputMode}
            onValueChange={(value) =>
              setInputMode(value as ThreeDGenerationInputMode)
            }
          >
            <TabsList>
              <TabsTrigger value="text" disabled={generationDisabled}>
                Text to 3D
              </TabsTrigger>
              <TabsTrigger value="image" disabled={generationDisabled}>
                Image to 3D
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <div className="ml-auto flex items-center gap-2">
          {source === "generated" && files[0] && (
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
        id="three-d-generation-output-files"
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept={GLTF_BUNDLE_ACCEPT}
        multiple
        aria-describedby="three-d-generation-output-help"
        onChange={onFilesChange}
      />

      <div className="relative min-h-0 flex-1">
        <div className="h-full min-h-0 p-4 pb-40">
          {files.length > 0 ? (
            <div className="h-full overflow-hidden rounded-lg border bg-muted/20">
              <LocalGltfPreview files={files} active />
            </div>
          ) : (
            <Empty className="h-full bg-transparent">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Box />
                </EmptyMedia>
                <EmptyTitle>Your 3D model will appear here</EmptyTitle>
                <EmptyDescription id="three-d-generation-output-help">
                  {inputMode === "text"
                    ? "Describe what you want to create below."
                    : "Add a reference image below."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4">
          <div className="pointer-events-auto w-full">
            <ThreeDGenerationControls
              initialModelId={initialModelId}
              inputMode={inputMode}
              modelIds={modelIds}
              onGenerated={onGenerated}
              disabled={generationDisabled}
              onBusyChange={onGenerationBusyChange}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
