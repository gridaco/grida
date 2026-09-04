"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { models } from "@grida/ai-models";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@app/ui/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import { Input } from "@app/ui/components/input";
import { Label } from "@app/ui/components/label";
import { audio, type MediaItem } from "@/lib/desktop/bridge";
import { MediaModelPickerTrigger } from "../shared/media-model-picker-trigger";
import { MediaModelAvailability } from "../shared/media-model-availability";
import { generatedMediaFile } from "../shared/generated-media-file";
import {
  ElevenLabsSetupNotice,
  useElevenLabsConnection,
} from "./elevenlabs-connection";

const SOUND_EFFECT_MODELS = models.audio.sound_effects.model_ids.map(
  (id) => models.audio.sound_effects.models[id]
);

export type SoundEffectGeneratedPreview = Readonly<{
  file: File;
  modelId: models.audio.sound_effects.ModelId;
  storedMedia?: MediaItem;
}>;

type SoundEffectGenerationControlsProps = Readonly<{
  initialModelId?: models.audio.sound_effects.ModelId;
  modelIds?: readonly models.audio.sound_effects.ModelId[];
  onGenerated: (result: SoundEffectGeneratedPreview) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}>;

export function SoundEffectGenerationControls(
  props: SoundEffectGenerationControlsProps
) {
  const availableModels = MediaModelAvailability.filter(
    SOUND_EFFECT_MODELS,
    props.modelIds
  );
  const fallbackModel = availableModels[0];
  if (!fallbackModel) return <SoundEffectGenerationUnavailable />;
  if (!audio.soundEffects.isSupported()) {
    return <SoundEffectGenerationUnsupported />;
  }

  return (
    <AvailableSoundEffectGenerationControls
      key={`${props.initialModelId ?? ""}|${availableModels
        .map((model) => model.id)
        .join("|")}`}
      {...props}
      availableModels={availableModels}
      fallbackModelId={fallbackModel.id}
    />
  );
}

function AvailableSoundEffectGenerationControls({
  initialModelId,
  onGenerated,
  onBusyChange,
  disabled = false,
  availableModels,
  fallbackModelId,
}: SoundEffectGenerationControlsProps & {
  availableModels: ReadonlyArray<(typeof SOUND_EFFECT_MODELS)[number]>;
  fallbackModelId: models.audio.sound_effects.ModelId;
}) {
  const resolvedInitialModelId =
    initialModelId &&
    availableModels.some((model) => model.id === initialModelId)
      ? initialModelId
      : fallbackModelId;
  const [modelId, setModelId] = useState(resolvedInitialModelId);
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Missing-key recovery: see test/desktop-audio-elevenlabs-key-setup.md.
  const elevenLabs = useElevenLabsConnection();

  const submit = async (message: PromptInputMessage) => {
    if (busy || disabled) return;
    const prompt = message.text.trim();
    if (!prompt) {
      throw setGenerationError(
        setError,
        "Describe the sound effect to generate."
      );
    }

    const durationSeconds = duration === "" ? undefined : Number(duration);
    if (
      durationSeconds !== undefined &&
      (!Number.isFinite(durationSeconds) ||
        durationSeconds < 0.5 ||
        durationSeconds > 30)
    ) {
      throw setGenerationError(
        setError,
        "Sound-effect duration must be between 0.5 and 30 seconds."
      );
    }
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const result = await audio.soundEffects.generate({
        model_id: modelId,
        prompt,
        ...(durationSeconds === undefined
          ? {}
          : { duration_seconds: durationSeconds }),
      });
      onGenerated({
        file: generatedMediaFile(
          result.audio,
          safeSoundEffectFilename(result.audio.file_name)
        ),
        modelId: result.model_id,
        ...(result.stored_media ? { storedMedia: result.stored_media } : {}),
      });
    } catch (cause) {
      const connection = await elevenLabs.refresh();
      if (connection.kind === "missing") {
        setError(null);
      } else {
        setError(errorMessage(cause));
      }
      throw cause;
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  if (elevenLabs.state.kind === "loading") {
    return <SoundEffectGenerationKeyCheck />;
  }
  if (elevenLabs.state.kind === "missing") {
    return (
      <div
        data-testid="controls-sound-effect-generation"
        className="mx-auto w-full max-w-2xl"
      >
        <ElevenLabsSetupNotice feature="sound effects" />
      </div>
    );
  }

  return (
    <div
      data-testid="controls-sound-effect-generation"
      className="mx-auto w-full max-w-2xl"
    >
      <PromptInput
        onSubmit={submit}
        className="w-full [&>div]:rounded-2xl [&>div]:bg-background [&>div]:shadow-lg"
      >
        <PromptInputBody>
          <PromptInputTextarea
            placeholder="Describe the sound, environment, and timing…"
            aria-label="Sound-effect generation prompt"
            disabled={busy || disabled}
            onChange={() => setError(null)}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <SoundEffectSettings
              duration={duration}
              disabled={busy || disabled}
              onDurationChange={(value) => {
                setDuration(value);
                setError(null);
              }}
            />
            <PromptInputSelect
              value={modelId}
              onValueChange={(value) => {
                setModelId(value as models.audio.sound_effects.ModelId);
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
            aria-label="Generate sound effect"
          />
        </PromptInputFooter>
      </PromptInput>
      <SoundEffectGenerationMessage error={error} />
    </div>
  );
}

function SoundEffectGenerationUnavailable() {
  return (
    <div
      data-testid="controls-sound-effect-generation"
      className="mx-auto w-full max-w-2xl"
    >
      <p
        className="rounded-2xl border bg-background px-4 py-3 text-sm text-muted-foreground shadow-lg"
        role="status"
      >
        No sound-effect generation model is available for this tool.
      </p>
    </div>
  );
}

function SoundEffectGenerationUnsupported() {
  return (
    <div
      data-testid="controls-sound-effect-generation"
      className="mx-auto w-full max-w-2xl"
    >
      <p
        className="rounded-2xl border bg-background px-4 py-3 text-sm text-muted-foreground shadow-lg"
        role="status"
      >
        Update Grida Desktop to use ElevenLabs Sound Effects.
      </p>
    </div>
  );
}

function SoundEffectGenerationKeyCheck() {
  return (
    <div
      data-testid="controls-sound-effect-generation"
      className="mx-auto w-full max-w-2xl"
    >
      <p
        className="rounded-2xl border bg-background px-4 py-3 text-sm text-muted-foreground shadow-lg"
        role="status"
      >
        Checking ElevenLabs connection…
      </p>
    </div>
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
          <Label htmlFor="sound-effect-duration">Duration</Label>
          <Input
            id="sound-effect-duration"
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

function SoundEffectGenerationMessage({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="px-3 pt-2 text-xs text-destructive" role="alert">
      {error}
    </p>
  );
}

function safeSoundEffectFilename(value: string): string {
  const leaf = value.split(/[\\/]/).at(-1)?.trim();
  return leaf && /\.mp3$/i.test(leaf) ? leaf : "grida-sound-effect.mp3";
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
