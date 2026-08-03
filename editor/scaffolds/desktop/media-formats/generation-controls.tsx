"use client";

import { useState } from "react";
import { ImagePlus, SlidersHorizontal } from "lucide-react";
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
import { MediaModelPickerTrigger } from "../shared/media-model-picker-trigger";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import { Input } from "@app/ui/components/input";
import { Label } from "@app/ui/components/label";
import {
  audio,
  threeD,
  type MediaItem,
  type MusicGenerateRequest,
  type MusicGenerateResult,
  type ThreeDInputImage,
} from "@/lib/desktop/bridge";
import * as gridaGateway from "@/lib/desktop/gg-session";
import {
  generatedMediaFile,
  THREE_D_INPUT_IMAGE_MAX_BYTES,
  THREE_D_INPUT_IMAGE_MEDIA_TYPES,
} from "./generated-media-file";

const THREE_D_MODELS = models.three_d.staged_models();
const AUDIO_MODELS = [
  ...models.audio.music_models(),
  ...models.audio.sound_effect_models(),
] as const;

const DEFAULT_THREE_D_MODEL_ID = THREE_D_MODELS[0]!.id;
const DEFAULT_AUDIO_MODEL_ID = models.audio.music_model_ids[0]!;

function availableThreeDModels(
  modelIds?: readonly models.three_d.ThreeDModelId[]
) {
  if (!modelIds || modelIds.length === 0) return THREE_D_MODELS;
  const allowed = new Set<string>(modelIds);
  return THREE_D_MODELS.filter((model) => allowed.has(model.id));
}

function availableAudioModels(modelIds?: readonly models.audio.AudioModelId[]) {
  if (!modelIds || modelIds.length === 0) return AUDIO_MODELS;
  const allowed = new Set<string>(modelIds);
  return AUDIO_MODELS.filter((model) => allowed.has(model.id));
}

type MusicGenerationDependencies = Readonly<{
  generate: (req: MusicGenerateRequest) => Promise<MusicGenerateResult>;
  forceRefresh: () => Promise<gridaGateway.GridaGatewaySessionState>;
}>;

const musicGenerationDependencies: MusicGenerationDependencies = {
  generate: audio.music.generate,
  forceRefresh: gridaGateway.forceRefresh,
};

export type GeneratedPreview = Readonly<{
  file: File;
  modelId: string;
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
  onGenerated: (result: GeneratedPreview) => void;
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
      throw generationError(setError, "Describe the 3D model to generate.");
    }
    let image: ThreeDInputImage | undefined;
    if (!acceptsText) {
      try {
        image = promptImage(message.files[0]);
      } catch (cause) {
        const nextError = errorMessage(cause);
        setError(nextError);
        throw cause;
      }
    }
    if (!threeD.isSupported()) {
      throw generationError(
        setError,
        "3D generation is not available in this Desktop build."
      );
    }

    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const result = acceptsText
        ? await threeD.generate({ model_id: modelId, prompt: trimmedPrompt })
        : await threeD.generate({
            model_id: modelId,
            image: image!,
          });
      const filename = safeGlbFilename(result.glb.file_name);
      onGenerated({
        file: generatedMediaFile(result.glb, filename),
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
          acceptsText ? undefined : THREE_D_INPUT_IMAGE_MEDIA_TYPES.join(",")
        }
        maxFiles={acceptsText ? 0 : 1}
        maxFileSize={THREE_D_INPUT_IMAGE_MAX_BYTES}
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

export function AudioGenerationControls({
  initialModelId = DEFAULT_AUDIO_MODEL_ID,
  modelIds,
  onGenerated,
  onBusyChange,
  disabled = false,
}: {
  initialModelId?: models.audio.AudioModelId;
  modelIds?: readonly models.audio.AudioModelId[];
  onGenerated: (result: GeneratedPreview) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const availableModels = availableAudioModels(modelIds);
  const resolvedInitialModelId = availableModels.some(
    (model) => model.id === initialModelId
  )
    ? initialModelId
    : availableModels[0]!.id;
  const [modelId, setModelId] = useState(resolvedInitialModelId);
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = models.audio.models[modelId];
  const isMusic = card.category === "audio/music";

  const submit = async (message: PromptInputMessage) => {
    if (busy || disabled) return;
    const trimmedPrompt = message.text.trim();
    if (!trimmedPrompt) {
      throw generationError(
        setError,
        isMusic
          ? "Describe the music to generate."
          : "Describe the sound effect to generate."
      );
    }

    const durationSeconds = duration === "" ? undefined : Number(duration);
    if (
      !isMusic &&
      durationSeconds !== undefined &&
      (!Number.isFinite(durationSeconds) ||
        durationSeconds < 0.5 ||
        durationSeconds > 30)
    ) {
      throw generationError(
        setError,
        "Sound-effect duration must be between 0.5 and 30 seconds."
      );
    }
    const supported = isMusic
      ? audio.music.isSupported()
      : audio.soundEffects.isSupported();
    if (!supported) {
      throw generationError(
        setError,
        isMusic
          ? "Music generation is not available in this Grida Desktop build or session."
          : "This Grida Desktop build does not expose sound-effect generation yet."
      );
    }

    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      if (isMusic) {
        const session = await gridaGateway.ensureFresh();
        if (session.kind !== "active") {
          throw new Error(musicSessionError(session.kind));
        }
      }
      const result = isMusic
        ? await generateMusicWithGgRecovery({
            model_id: modelId as models.audio.MusicModelId,
            prompt: trimmedPrompt,
          })
        : await audio.soundEffects.generate({
            model_id: modelId as models.audio.SoundEffectModelId,
            prompt: trimmedPrompt,
            ...(durationSeconds === undefined
              ? {}
              : { duration_seconds: durationSeconds }),
          });
      onGenerated({
        file: generatedMediaFile(
          result.audio,
          safeAudioFilename(
            result.audio.file_name,
            isMusic ? "grida-music.mp3" : "grida-sound-effect.mp3"
          )
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
      data-testid="controls-audio-generation"
      className="mx-auto w-full max-w-2xl"
    >
      <PromptInput
        onSubmit={submit}
        className="w-full [&>div]:rounded-2xl [&>div]:bg-background [&>div]:shadow-lg"
      >
        <PromptInputBody>
          <PromptInputTextarea
            placeholder={
              isMusic
                ? "Describe genre, mood, instruments, and tempo…"
                : "Describe the sound, environment, and timing…"
            }
            aria-label={
              isMusic
                ? "Music generation prompt"
                : "Sound-effect generation prompt"
            }
            disabled={busy || disabled}
            onChange={() => setError(null)}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            {!isMusic && (
              <SoundEffectSettings
                duration={duration}
                disabled={busy || disabled}
                onDurationChange={(value) => {
                  setDuration(value);
                  setError(null);
                }}
              />
            )}
            <PromptInputSelect
              value={modelId}
              onValueChange={(value) => {
                setModelId(value as models.audio.AudioModelId);
                setDuration("");
                setError(null);
              }}
              disabled={busy || disabled}
            >
              <MediaModelPickerTrigger className="max-w-48">
                <PromptInputSelectValue placeholder="Model" />
              </MediaModelPickerTrigger>
              <PromptInputSelectContent>
                {availableModels.map((model) => (
                  <PromptInputSelectItem key={model.id} value={model.id}>
                    {model.label}
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectContent>
            </PromptInputSelect>
          </PromptInputTools>
          <PromptInputSubmit
            status={busy ? "submitted" : undefined}
            disabled={busy || disabled}
            aria-label={isMusic ? "Generate music" : "Generate sound effect"}
          />
        </PromptInputFooter>
      </PromptInput>
      <GenerationMessage error={error} />
    </div>
  );
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

function SoundEffectSettings({
  duration,
  disabled,
  onDurationChange,
}: {
  duration: string;
  disabled: boolean;
  onDurationChange: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton
          aria-label="Sound-effect settings"
          title="Sound-effect settings"
          disabled={disabled}
        >
          <SlidersHorizontal aria-hidden />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56 p-3">
        <div className="grid gap-2">
          <Label htmlFor="media-formats-sfx-duration">Duration</Label>
          <Input
            id="media-formats-sfx-duration"
            type="number"
            min={0.5}
            max={30}
            step={0.5}
            value={duration}
            onChange={(event) => onDurationChange(event.currentTarget.value)}
            placeholder="Automatic"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">0.5–30 seconds</p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function promptImage(
  file: PromptInputMessage["files"][number] | undefined
): ThreeDInputImage {
  if (!file) throw new Error("Add one reference image.");
  if (
    !file.mediaType ||
    !THREE_D_INPUT_IMAGE_MEDIA_TYPES.includes(
      file.mediaType as ThreeDInputImage["media_type"]
    )
  ) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  const marker = ";base64,";
  const markerIndex = file.url.indexOf(marker);
  if (!file.url.startsWith("data:") || markerIndex === -1) {
    throw new Error("Could not read the reference image.");
  }
  const base64 = file.url.slice(markerIndex + marker.length);
  if (!base64) throw new Error("The reference image is empty.");
  return {
    base64,
    media_type: file.mediaType as ThreeDInputImage["media_type"],
  };
}

function generationError(
  setError: (message: string) => void,
  message: string
): Error {
  setError(message);
  return new Error(message);
}

/**
 * GRIDA-SEC-006 / GRIDA-GG: desktop — a daemon restart or an upstream 401 can
 * invalidate the pushed memory-only token after preflight. Refresh once only
 * for the shared message-based `gg_token_expired` code, then let any retry
 * failure surface normally.
 */
export async function generateMusicWithGgRecovery(
  req: MusicGenerateRequest,
  dependencies: MusicGenerationDependencies = musicGenerationDependencies
): Promise<MusicGenerateResult> {
  try {
    return await dependencies.generate(req);
  } catch (cause) {
    if (!gridaGateway.isGgTokenExpired(cause)) throw cause;
  }

  const session = await dependencies.forceRefresh();
  if (session.kind !== "active") {
    throw new Error(musicSessionError(session.kind));
  }
  return await dependencies.generate(req);
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

function safeAudioFilename(value: string, fallback: string): string {
  const leaf = value.split(/[\\/]/).at(-1)?.trim();
  return leaf && /\.mp3$/i.test(leaf) ? leaf : fallback;
}

function musicSessionError(
  kind: Exclude<gridaGateway.GridaGatewaySessionState["kind"], "active">
): string {
  switch (kind) {
    case "signed_out":
      return "Sign in to Grida to generate music.";
    case "no_organization":
      return "Choose or create a Grida organization to generate music.";
    case "unsupported":
      return "This Grida Desktop build does not support included music generation.";
    case "error":
      return "Grida could not prepare the music-generation session. Try again.";
  }
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return String(cause);
}
