"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Box, FileUp, FolderSearch, Loader2, X } from "lucide-react";
import { catalog as models } from "@grida/ai-models/grida";
import { Button } from "@app/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@app/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectValue,
} from "@app/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@app/ui/components/tabs";
import { MediaModelPickerTrigger } from "../shared/media-model-picker-trigger";
import type { ModelGenerationForm } from "./model-generation-form";
import { modelGeneration, type MediaItem } from "@/lib/desktop/bridge";
import { cn } from "@app/ui/lib/utils";
import { LocalGltfBundle } from "../media-formats/local-gltf-bundle";
import { LocalGltfPreview } from "../media-formats/local-gltf-preview";
import { FileDownloadButton } from "../shared/file-download-button";
import { MediaModelAvailability } from "../shared/media-model-availability";
import { generatedMediaFile } from "../shared/generated-media-file";
import {
  ThreeDGenerationControls,
  type ThreeDGeneratedPreview,
} from "./three-d-generation-controls";
import { ModelGenerationControls } from "./model-generation-controls";

const GLTF_BUNDLE_ACCEPT = [
  LocalGltfBundle.ACCEPT,
  ".bin,.png,.jpg,.jpeg,.webp,.avif,image/png,image/jpeg,image/webp,image/avif",
].join(",");

/** One 3D workspace; provider-specific forms share the same output and library. */
export function ThreeDPlayground({
  initialModelId,
  modelIds,
  generationDisabled = false,
  onGenerationBusyChange,
  onStoredMediaCreated,
  onRevealStoredMedia,
}: {
  initialModelId?: string;
  modelIds?: readonly string[];
  generationDisabled?: boolean;
  onGenerationBusyChange?: (busy: boolean) => void;
  onStoredMediaCreated?: (item: MediaItem) => void;
  onRevealStoredMedia?: (item: MediaItem) => void;
}) {
  const falModels = MediaModelAvailability.filter(
    models.three_d.ordered_models(),
    modelIds
  );
  const tripoSupported = modelGeneration.isSupported();
  const tripoModels = MediaModelAvailability.filter(
    models.three_d.model_generation.ordered_models(),
    modelIds
  );
  const availableModels = [
    ...falModels,
    ...(tripoSupported ? tripoModels : []),
  ];
  const [modelId, setModelId] = useState(
    availableModels.find((model) => model.id === initialModelId)?.id ??
      availableModels[0]?.id
  );
  const falModel = falModels.find((model) => model.id === modelId);
  const tripoModel = tripoSupported
    ? tripoModels.find((model) => model.id === modelId)
    : undefined;
  const [tripoVariant, setTripoVariant] =
    useState<ModelGenerationForm.Variant>("text");
  const inputMode = tripoModel
    ? tripoVariant
    : (falModel?.input.type ?? "text");
  const inputModes = tripoModel
    ? tripoModel.inputs
    : (["text", "image"] as const).filter((mode) =>
        falModels.some((model) => model.input.type === mode)
      );
  const [files, setFiles] = useState<readonly File[]>([]);
  const [source, setSource] = useState<"local" | "generated" | null>(null);
  const [storedMedia, setStoredMedia] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = busy || generationDisabled;
  const inputRef = useRef<HTMLInputElement>(null);

  const onFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (nextFiles.length === 0) return;
    setFiles(nextFiles);
    setSource("local");
    setStoredMedia(null);
  };
  const onGenerated = (
    result: Pick<ThreeDGeneratedPreview, "file" | "storedMedia">
  ) => {
    setFiles([result.file]);
    setSource("generated");
    setStoredMedia(result.storedMedia ?? null);
    if (result.storedMedia) onStoredMediaCreated?.(result.storedMedia);
  };
  const onBusyChange = (next: boolean) => {
    setBusy(next);
    onGenerationBusyChange?.(next);
  };
  const clear = () => {
    setFiles([]);
    setSource(null);
    setStoredMedia(null);
  };

  const modelPicker = (
    <Select
      value={modelId}
      disabled={locked || availableModels.length === 0}
      onValueChange={(id) => {
        const model = availableModels.find((model) => model.id === id);
        if (model) setModelId(model.id);
      }}
    >
      <MediaModelPickerTrigger aria-label="3D model" className="max-w-48">
        <SelectValue placeholder="Select a model" />
      </MediaModelPickerTrigger>
      <SelectContent position="popper" align="start" side="top">
        {falModels.length > 0 && (
          <SelectGroup>
            <SelectLabel>Hunyuan &amp; TRELLIS</SelectLabel>
            {falModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {tripoSupported && tripoModels.length > 0 && (
          <SelectGroup>
            <SelectLabel>Tripo</SelectLabel>
            {tripoModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );

  // Older native hosts must not silently replace a requested Tripo model with fal.
  if (
    !tripoSupported &&
    initialModelId &&
    models.three_d.model_generation.is_model_id(initialModelId)
  ) {
    return (
      <div
        className="flex min-h-0 flex-1 items-center justify-center p-8"
        role="status"
      >
        <div className="max-w-sm text-center">
          <h2 className="font-semibold">Update Grida Desktop</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Model generation with Tripo needs a newer Desktop build. Your other
            3D tools are still available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section
      data-testid="playground-three-d-generation"
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-6 py-4">
        <h2 className="mr-2 min-w-0 text-2xl font-bold tracking-tight">
          3D model
        </h2>
        {inputModes.length > 1 && (
          <Tabs
            value={inputMode}
            onValueChange={(value) => {
              if (
                tripoModel &&
                tripoModel.inputs.some((input) => input === value)
              ) {
                setTripoVariant(value as ModelGenerationForm.Variant);
              } else {
                const model = falModels.find(
                  (model) => model.input.type === value
                );
                if (model) setModelId(model.id);
              }
            }}
          >
            <TabsList aria-label="3D input">
              {inputModes.map((mode) => (
                <TabsTrigger key={mode} value={mode} disabled={locked}>
                  {mode === "text"
                    ? "Text to 3D"
                    : mode === "image"
                      ? "Image to 3D"
                      : "Multiview"}
                </TabsTrigger>
              ))}
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
        aria-label="Open 3D output files"
        onChange={onFilesChange}
      />
      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            "h-full min-h-0 p-4",
            tripoModel && inputMode !== "text" ? "pb-64" : "pb-44"
          )}
        >
          {files.length > 0 ? (
            <div className="h-full overflow-hidden rounded-lg border bg-muted/20">
              <LocalGltfPreview files={files} active />
            </div>
          ) : (
            <Empty className="h-full bg-transparent">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {busy ? <Loader2 className="animate-spin" /> : <Box />}
                </EmptyMedia>
                <EmptyTitle>
                  {busy
                    ? "Generating your model…"
                    : "Your 3D model will appear here"}
                </EmptyTitle>
                <EmptyDescription>
                  {busy
                    ? "Generation can take several minutes. Keep this window open."
                    : tripoModel
                      ? "Start with a description, one image, or several views of the same object."
                      : falModel?.input.type === "text"
                        ? "Describe what you want to create below."
                        : falModel
                          ? "Add a reference image below."
                          : "No 3D generation model is available for this tool."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
        {files.length > 0 && (
          <p
            role="status"
            className="absolute left-8 top-4 rounded-md border bg-background/90 px-3 py-1.5 text-xs"
          >
            {busy
              ? "Generating a new model…"
              : storedMedia
                ? "Saved to Recents"
                : source === "generated"
                  ? "Ready to download"
                  : "Local model"}
          </p>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex max-h-full justify-center overflow-y-auto p-4">
          <div className="pointer-events-auto w-full">
            {tripoModel ? (
              <ModelGenerationControls
                modelId={tripoModel.id}
                variant={tripoVariant}
                modelPicker={modelPicker}
                disabled={locked}
                onBusyChange={onBusyChange}
                onGenerated={(result) =>
                  onGenerated({
                    file: generatedMediaFile(result.glb, "model.glb"),
                    storedMedia: result.stored_media,
                  })
                }
              />
            ) : falModel ? (
              <ThreeDGenerationControls
                key={falModel.id}
                initialModelId={falModel.id}
                inputMode={falModel.input.type}
                modelIds={[falModel.id]}
                showModelPicker={false}
                modelPicker={modelPicker}
                onGenerated={onGenerated}
                disabled={locked}
                onBusyChange={onBusyChange}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
