"use client";

import { useState } from "react";
import {
  modelGeneration,
  type MediaItem,
  type ModelGenerationGenerateResult,
} from "@/lib/desktop/bridge";
import { generatedMediaFile } from "../shared/generated-media-file";
import { ModelGenerationControls } from "./model-generation-controls";
import { ModelGenerationForm } from "./model-generation-form";
import { ModelGenerationPreview } from "./model-generation-preview";

export function ModelGenerationPlayground({
  initialModelId,
  generationDisabled = false,
  onGenerationBusyChange,
  onStoredMediaCreated,
  onRevealStoredMedia,
}: {
  initialModelId?: ModelGenerationForm.ModelId;
  generationDisabled?: boolean;
  onGenerationBusyChange?: (busy: boolean) => void;
  onStoredMediaCreated?: (item: MediaItem) => void;
  onRevealStoredMedia?: (item: MediaItem) => void;
}) {
  // Workflow: test/desktop-media-tripo-model-generation.md.
  const [result, setResult] = useState<{
    file: File;
    storedMedia?: MediaItem;
  }>();
  const [busy, setBusy] = useState(false);
  const onGenerated = (generated: ModelGenerationGenerateResult) => {
    setResult({
      file: generatedMediaFile(generated.glb, "model.glb"),
      storedMedia: generated.stored_media,
    });
    if (generated.stored_media) onStoredMediaCreated?.(generated.stored_media);
  };
  if (!modelGeneration.isSupported()) {
    // Hosted-renderer compatibility: test/desktop-media-tripo-host-compatibility.md.
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
      data-testid="playground-model-generation"
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="shrink-0 px-6 py-4">
        <h2 className="text-2xl font-bold tracking-tight">Model generation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a 3D model with Tripo.
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-5 pt-0 lg:flex-row">
        <div className="w-full shrink-0 lg:w-80 lg:overflow-y-auto lg:pr-1">
          <ModelGenerationControls
            initialModelId={initialModelId}
            disabled={generationDisabled}
            onGenerated={onGenerated}
            onBusyChange={(next) => {
              setBusy(next);
              onGenerationBusyChange?.(next);
            }}
          />
        </div>
        <ModelGenerationPreview
          file={result?.file ?? null}
          storedMedia={result?.storedMedia}
          busy={busy}
          onRevealStoredMedia={onRevealStoredMedia}
        />
      </div>
    </section>
  );
}
