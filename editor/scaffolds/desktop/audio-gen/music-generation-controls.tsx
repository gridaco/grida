"use client";
// GRIDA-GG: desktop — ensure a fresh GG token before generate (docs/wg/platform/hosted-ai.md)

import { useState } from "react";
import { useGGModels, type CurrentGGModel } from "@/lib/desktop/gg-models";
import { catalog as models } from "@grida/ai/catalogue";
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
import { MediaModelAvailability } from "../shared/media-model-availability";
import { generatedMediaFile } from "../shared/generated-media-file";

type MusicChoice = Readonly<{ id: string; label: string }>;

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
  modelId: string;
  storedMedia?: MediaItem;
}>;

type MusicGenerationControlsProps = Readonly<{
  initialModelId?: string;
  modelIds?: readonly string[];
  onGenerated: (result: MusicGeneratedPreview) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}>;

export function MusicGenerationControls(props: MusicGenerationControlsProps) {
  const current = useGGModels();
  const availableModels = musicModelChoices(current, props.modelIds);
  const fallbackModel = MediaModelAvailability.select(
    availableModels,
    undefined,
    models.audio.music.default_id
  );
  if (!fallbackModel) return <MusicGenerationUnavailable />;

  return (
    <AvailableMusicGenerationControls
      key={props.initialModelId ?? "new"}
      {...props}
      initialModelId={
        current === null
          ? MediaModelAvailability.select(
              availableModels,
              props.initialModelId,
              fallbackModel.id
            )?.id
          : props.initialModelId
      }
      availableModels={availableModels}
      fallbackModelId={fallbackModel.id}
    />
  );
}

/** Only a released binary without the discovery bridge keeps its installed music UI. */
export function musicModelChoices(
  current: readonly CurrentGGModel[] | null,
  legacyModelIds?: readonly string[]
): readonly MusicChoice[] {
  if (current === null) {
    return MediaModelAvailability.filter(
      models.audio.music.listed_models(),
      legacyModelIds
    );
  }
  return current.filter(
    (model) => model.kind === "music" && model.interfaces.includes("endpoints")
  );
}

function AvailableMusicGenerationControls({
  initialModelId,
  onGenerated,
  onBusyChange,
  disabled = false,
  availableModels,
  fallbackModelId,
}: MusicGenerationControlsProps & {
  availableModels: readonly MusicChoice[];
  fallbackModelId: string;
}) {
  const [modelId, setModelId] = useState(initialModelId ?? fallbackModelId);
  const modelAvailable = availableModels.some((model) => model.id === modelId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (message: PromptInputMessage) => {
    if (busy || disabled || !modelAvailable) return;
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
                setModelId(value as string);
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

function MusicGenerationUnavailable() {
  return (
    <div
      data-testid="controls-music-generation"
      className="mx-auto w-full max-w-2xl"
    >
      <p
        className="rounded-2xl border bg-background px-4 py-3 text-sm text-muted-foreground shadow-lg"
        role="status"
      >
        No music generation model is available for this tool.
      </p>
    </div>
  );
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
