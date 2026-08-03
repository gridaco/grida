"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { models } from "@grida/ai-models";
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@app/ui/ai-elements/prompt-input";
import { threeD, type MediaItem } from "@/lib/desktop/bridge";
import { MediaModelPickerTrigger } from "../shared/media-model-picker-trigger";
import { generatedMediaFile } from "../shared/generated-media-file";
import { ThreeDReferenceImage } from "./three-d-reference-image";

const THREE_D_MODELS = models.three_d.staged_models();
const DEFAULT_THREE_D_MODEL_ID = THREE_D_MODELS[0]!.id;

export type ThreeDGeneratedPreview = Readonly<{
  file: File;
  modelId: models.three_d.ThreeDModelId;
  storedMedia?: MediaItem;
}>;

export type ThreeDGenerationInputMode = "text" | "image";

export function ThreeDGenerationControls({
  initialModelId = DEFAULT_THREE_D_MODEL_ID,
  inputMode,
  modelIds,
  onGenerated,
  onBusyChange,
  disabled = false,
}: {
  initialModelId?: models.three_d.ThreeDModelId;
  inputMode?: ThreeDGenerationInputMode;
  modelIds?: readonly models.three_d.ThreeDModelId[];
  onGenerated: (result: ThreeDGeneratedPreview) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const availableModels = availableThreeDModels(modelIds);
  const resolvedInitialModelId = availableModels.some(
    (model) => model.id === initialModelId
  )
    ? initialModelId
    : availableModels[0]!.id;
  const textModels = availableModels.filter(
    (model) => model.input.type === "text"
  );
  const imageModels = availableModels.filter(
    (model) => model.input.type === "image"
  );
  const initialInputMode =
    models.three_d.models[resolvedInitialModelId].input.type;
  const activeInputMode = inputMode ?? initialInputMode;
  const [textModelId, setTextModelId] = useState(
    initialInputMode === "text"
      ? resolvedInitialModelId
      : (textModels[0]?.id ?? resolvedInitialModelId)
  );
  const [imageModelId, setImageModelId] = useState(
    initialInputMode === "image"
      ? resolvedInitialModelId
      : (imageModels[0]?.id ?? resolvedInitialModelId)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modelId = activeInputMode === "text" ? textModelId : imageModelId;
  const card = models.three_d.models[modelId];
  const acceptsText = activeInputMode === "text";
  const modelsForInput = acceptsText ? textModels : imageModels;

  const submit = async (message: PromptInputMessage) => {
    if (busy || disabled) return;
    const trimmedPrompt = message.text.trim();
    if (acceptsText && !trimmedPrompt) {
      throw setGenerationError(setError, "Describe the 3D model to generate.");
    }
    let image;
    if (!acceptsText) {
      try {
        image = ThreeDReferenceImage.fromPromptAttachment(message.files[0]);
      } catch (cause) {
        const nextError = errorMessage(cause);
        setError(nextError);
        throw cause;
      }
    }
    if (!threeD.isSupported()) {
      throw setGenerationError(
        setError,
        "3D generation is not available in this Desktop build."
      );
    }

    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const result = models.three_d.is_text_to_three_d_model_id(modelId)
        ? await threeD.generate({ model_id: modelId, prompt: trimmedPrompt })
        : await threeD.generate({ model_id: modelId, image: image! });
      onGenerated({
        file: generatedMediaFile(
          result.glb,
          safeGlbFilename(result.glb.file_name)
        ),
        modelId: result.model_id,
        ...(result.stored_media ? { storedMedia: result.stored_media } : {}),
      });
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div
      data-testid="controls-three-d-generation"
      className="mx-auto w-full max-w-2xl"
    >
      <PromptInput
        key={activeInputMode}
        accept={
          acceptsText ? undefined : ThreeDReferenceImage.MEDIA_TYPES.join(",")
        }
        maxFiles={acceptsText ? 0 : 1}
        maxFileSize={ThreeDReferenceImage.MAX_BYTES}
        onError={(nextError) => setError(nextError.message)}
        onSubmit={submit}
        className="w-full [&>div]:rounded-2xl [&>div]:bg-background [&>div]:shadow-lg"
      >
        {acceptsText ? (
          <PromptInputBody>
            <PromptInputTextarea
              maxLength={
                card.input.type === "text"
                  ? card.input.max_utf8_characters
                  : undefined
              }
              placeholder="Describe the 3D model you want to create…"
              aria-label="3D generation prompt"
              disabled={busy || disabled}
              onChange={() => setError(null)}
            />
          </PromptInputBody>
        ) : (
          <ReferenceImageInput />
        )}
        <PromptInputFooter>
          <PromptInputTools>
            {!acceptsText && (
              <ReferenceImageButton disabled={busy || disabled} />
            )}
            <PromptInputSelect
              value={modelId}
              onValueChange={(value) => {
                if (activeInputMode === "text") {
                  setTextModelId(value as models.three_d.ThreeDModelId);
                } else {
                  setImageModelId(value as models.three_d.ThreeDModelId);
                }
                setError(null);
              }}
              disabled={busy || disabled}
            >
              <MediaModelPickerTrigger className="max-w-48">
                <PromptInputSelectValue placeholder="Model" />
              </MediaModelPickerTrigger>
              <PromptInputSelectContent>
                {modelsForInput.map((model) => (
                  <PromptInputSelectItem key={model.id} value={model.id}>
                    {threeDModelLabel(model)}
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectContent>
            </PromptInputSelect>
          </PromptInputTools>
          <PromptInputSubmit
            status={busy ? "submitted" : undefined}
            disabled={busy || disabled}
            aria-label="Generate 3D model"
          />
        </PromptInputFooter>
      </PromptInput>
      <GenerationMessage error={error} />
    </div>
  );
}

function availableThreeDModels(
  modelIds?: readonly models.three_d.ThreeDModelId[]
) {
  if (!modelIds || modelIds.length === 0) return THREE_D_MODELS;
  const allowed = new Set<string>(modelIds);
  return THREE_D_MODELS.filter((model) => allowed.has(model.id));
}

function ReferenceImageInput() {
  const attachments = usePromptInputAttachments();
  return (
    <>
      <PromptInputHeader>
        <PromptInputAttachments className="p-2">
          {(file) => <PromptInputAttachment data={file} />}
        </PromptInputAttachments>
      </PromptInputHeader>
      <PromptInputBody>
        <div className="flex min-h-16 items-center px-3 py-2 text-sm text-muted-foreground">
          {attachments.files.length > 0
            ? "Ready to generate from this reference."
            : "Add a clear reference image to get started. PNG, JPEG, or WebP."}
        </div>
      </PromptInputBody>
    </>
  );
}

function ReferenceImageButton({ disabled }: { disabled: boolean }) {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length > 0) return null;
  return (
    <PromptInputButton
      disabled={disabled}
      onClick={() => attachments.openFileDialog()}
    >
      <ImagePlus aria-hidden />
      Add image
    </PromptInputButton>
  );
}

function GenerationMessage({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="px-3 pt-2 text-xs text-destructive" role="alert">
      {error}
    </p>
  );
}

function threeDModelLabel(model: models.three_d.ThreeDModelCard): string {
  return model.label.replace(/\s+—\s+(Text|Image)$/, "");
}

function safeGlbFilename(value: string): string {
  const leaf = value.split(/[\\/]/).at(-1)?.trim();
  return leaf && /\.glb$/i.test(leaf) ? leaf : "grida-3d.glb";
}

function setGenerationError(
  setError: (message: string) => void,
  message: string
): Error {
  setError(message);
  return new Error(message);
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return String(cause);
}
