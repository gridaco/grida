"use client";
// GRIDA-GG: desktop — ensure a fresh GG token before generate (docs/wg/platform/hosted-ai.md)

import { useState } from "react";
import { models } from "@grida/ai-models";
import {
  PromptInput,
  PromptInputBody,
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
  audio,
  type MediaItem,
  type MusicGenerateRequest,
  type MusicGenerateResult,
} from "@/lib/desktop/bridge";
import * as gridaGateway from "@/lib/desktop/gg-session";
import { MediaModelPickerTrigger } from "../shared/media-model-picker-trigger";
import { generatedMediaFile } from "../shared/generated-media-file";

const MUSIC_MODELS = models.audio.music.model_ids.map(
  (id) => models.audio.music.models[id]
);
const DEFAULT_MUSIC_MODEL_ID = models.audio.music.model_ids[0]!;

type MusicGenerationDependencies = Readonly<{
  generate: (req: MusicGenerateRequest) => Promise<MusicGenerateResult>;
  forceRefresh: () => Promise<gridaGateway.GridaGatewaySessionState>;
}>;

const musicGenerationDependencies: MusicGenerationDependencies = {
  generate: audio.music.generate,
  forceRefresh: gridaGateway.forceRefresh,
};

export type MusicGeneratedPreview = Readonly<{
  file: File;
  modelId: models.audio.music.ModelId;
  storedMedia?: MediaItem;
}>;

export function MusicGenerationControls({
  initialModelId = DEFAULT_MUSIC_MODEL_ID,
  modelIds,
  onGenerated,
  onBusyChange,
  disabled = false,
}: {
  initialModelId?: models.audio.music.ModelId;
  modelIds?: readonly models.audio.music.ModelId[];
  onGenerated: (result: MusicGeneratedPreview) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const availableModels = availableMusicModels(modelIds);
  const resolvedInitialModelId = availableModels.some(
    (model) => model.id === initialModelId
  )
    ? initialModelId
    : availableModels[0]!.id;
  const [modelId, setModelId] = useState(resolvedInitialModelId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (message: PromptInputMessage) => {
    if (busy || disabled) return;
    const prompt = message.text.trim();
    if (!prompt) {
      throw setGenerationError(setError, "Describe the music to generate.");
    }
    if (!audio.music.isSupported()) {
      throw setGenerationError(
        setError,
        "Music generation is not available in this Grida Desktop build or session."
      );
    }

    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const session = await gridaGateway.ensureFresh();
      if (session.kind !== "active") {
        throw new Error(musicSessionError(session.kind));
      }
      const result = await generateMusicWithGgRecovery({
        model_id: modelId,
        prompt,
      });
      onGenerated({
        file: generatedMediaFile(
          result.audio,
          safeMusicFilename(result.audio.file_name)
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
      data-testid="controls-music-generation"
      className="mx-auto w-full max-w-2xl"
    >
      <PromptInput
        onSubmit={submit}
        className="w-full [&>div]:rounded-2xl [&>div]:bg-background [&>div]:shadow-lg"
      >
        <PromptInputBody>
          <PromptInputTextarea
            placeholder="Describe genre, mood, instruments, and tempo…"
            aria-label="Music generation prompt"
            disabled={busy || disabled}
            onChange={() => setError(null)}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputSelect
              value={modelId}
              onValueChange={(value) => {
                setModelId(value as models.audio.music.ModelId);
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
            aria-label="Generate music"
          />
        </PromptInputFooter>
      </PromptInput>
      <MusicGenerationMessage error={error} />
    </div>
  );
}

function availableMusicModels(
  modelIds?: readonly models.audio.music.ModelId[]
) {
  if (!modelIds || modelIds.length === 0) return MUSIC_MODELS;
  const allowed = new Set<string>(modelIds);
  return MUSIC_MODELS.filter((model) => allowed.has(model.id));
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

function MusicGenerationMessage({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="px-3 pt-2 text-xs text-destructive" role="alert">
      {error}
    </p>
  );
}

function safeMusicFilename(value: string): string {
  const leaf = value.split(/[\\/]/).at(-1)?.trim();
  return leaf && /\.mp3$/i.test(leaf) ? leaf : "grida-music.mp3";
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
