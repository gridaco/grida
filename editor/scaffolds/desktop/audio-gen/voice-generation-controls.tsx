"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Loader2, Sparkles } from "lucide-react";
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
import { Button } from "@app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import {
  audio,
  type MediaItem,
  type TextToSpeechVoice,
} from "@/lib/desktop/bridge";
import { MediaModelAvailability } from "../shared/media-model-availability";
import { MediaModelPickerTrigger } from "../shared/media-model-picker-trigger";
import { generatedMediaFile } from "../shared/generated-media-file";
import {
  ElevenLabsSetupNotice,
  useElevenLabsConnection,
} from "./elevenlabs-connection";
import type { ElevenLabsConnection } from "./elevenlabs-connection-state";
import { TextToSpeechPrompt, type TextToSpeechAudioTag } from "./speech-prompt";
import {
  TextToSpeechVoiceCatalogue,
  type TextToSpeechVoiceCatalogueSnapshot,
} from "./text-to-speech-voice-catalogue";

const TEXT_TO_SPEECH_MODELS = models.audio.text_to_speech.model_ids.map(
  (id) => models.audio.text_to_speech.models[id]
);
const AUDIO_TAG_GROUPS = ["Emotion", "Delivery", "Reaction"] as const;

export type VoiceGeneratedPreview = Readonly<{
  file: File;
  modelId: models.audio.text_to_speech.ModelId;
  voice: TextToSpeechVoice;
  storedMedia?: MediaItem;
}>;

type VoiceGenerationControlsProps = Readonly<{
  initialModelId?: models.audio.text_to_speech.ModelId;
  modelIds?: readonly models.audio.text_to_speech.ModelId[];
  onGenerated: (result: VoiceGeneratedPreview) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}>;

export function VoiceGenerationControls(props: VoiceGenerationControlsProps) {
  const availableModels = MediaModelAvailability.filter(
    TEXT_TO_SPEECH_MODELS,
    props.modelIds
  );
  const fallbackModel = availableModels[0];
  // Missing-key recovery: see test/desktop-audio-elevenlabs-key-setup.md.
  const elevenLabs = useElevenLabsConnection();

  if (!fallbackModel) return <VoiceGenerationUnavailable />;
  if (!audio.textToSpeech.isSupported()) return <VoiceGenerationUnsupported />;
  if (elevenLabs.state.kind === "loading") return <VoiceGenerationKeyCheck />;
  if (elevenLabs.state.kind === "missing") {
    return (
      <div
        data-testid="controls-voice-generation"
        className="mx-auto w-full max-w-2xl"
      >
        <ElevenLabsSetupNotice feature="voice" />
      </div>
    );
  }

  return (
    <ConnectedVoiceGenerationControls
      key={`${props.initialModelId ?? ""}|${availableModels
        .map((model) => model.id)
        .join("|")}`}
      {...props}
      availableModels={availableModels}
      fallbackModelId={fallbackModel.id}
      refreshConnection={elevenLabs.refresh}
    />
  );
}

function ConnectedVoiceGenerationControls({
  initialModelId,
  onGenerated,
  onBusyChange,
  disabled = false,
  availableModels,
  fallbackModelId,
  refreshConnection,
}: VoiceGenerationControlsProps & {
  availableModels: ReadonlyArray<(typeof TEXT_TO_SPEECH_MODELS)[number]>;
  fallbackModelId: models.audio.text_to_speech.ModelId;
  refreshConnection: () => Promise<ElevenLabsConnection.State>;
}) {
  const resolvedInitialModelId =
    initialModelId &&
    availableModels.some((model) => model.id === initialModelId)
      ? initialModelId
      : fallbackModelId;
  const [modelId, setModelId] = useState(resolvedInitialModelId);
  const [text, setText] = useState("");
  const [voiceCatalogue] = useState(
    () =>
      new TextToSpeechVoiceCatalogue({
        listVoices: () => audio.textToSpeech.listVoices(),
        refreshConnection,
      })
  );
  const catalogue = useSyncExternalStore(
    voiceCatalogue.subscribe,
    voiceCatalogue.getSnapshot,
    voiceCatalogue.getSnapshot
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxCharacters =
    models.audio.text_to_speech.models[modelId].input.max_characters;

  useEffect(() => {
    void voiceCatalogue.load();
    return voiceCatalogue.cancelPending;
  }, [voiceCatalogue]);

  const submit = async (message: PromptInputMessage) => {
    if (busy || disabled) return;
    const prompt = message.text.trim();
    if (!prompt) {
      throw setGenerationError(setError, "Write the words you want spoken.");
    }
    if (TextToSpeechPrompt.characterCount(prompt) > maxCharacters) {
      throw setGenerationError(
        setError,
        `Voice text must be ${maxCharacters.toLocaleString()} characters or fewer.`
      );
    }
    const voice =
      catalogue.kind === "ready"
        ? catalogue.voices.find(
            (item) => item.voice_id === catalogue.selectedVoiceId
          )
        : undefined;
    if (!voice) {
      throw setGenerationError(setError, "Choose an ElevenLabs voice.");
    }

    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const result = await audio.textToSpeech.generate({
        model_id: modelId,
        voice_id: voice.voice_id,
        text: prompt,
      });
      onGenerated({
        file: generatedMediaFile(
          result.audio,
          safeVoiceFilename(result.audio.file_name)
        ),
        modelId: result.model_id,
        voice,
        ...(result.stored_media ? { storedMedia: result.stored_media } : {}),
      });
      setText("");
    } catch (cause) {
      const connection = await refreshConnection();
      if (connection.kind === "missing") {
        setError(null);
      } else {
        setError(
          "Voice generation failed. Check that your ElevenLabs key allows Text to Speech, then try again."
        );
      }
      throw cause;
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  const insertAudioTag = (tag: TextToSpeechAudioTag["value"]) => {
    // Cursor/focus behavior: see test/desktop-voice-expression-tags.md.
    const textarea = textareaRef.current;
    const insertion = TextToSpeechPrompt.insertTag(
      text,
      tag,
      textarea?.selectionStart ?? text.length,
      textarea?.selectionEnd ?? text.length
    );
    setText(insertion.value);
    setError(null);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(insertion.caret, insertion.caret);
    });
  };

  const characterCount = TextToSpeechPrompt.characterCount(text);
  const voices = catalogue.kind === "ready" ? catalogue.voices : [];
  const selectedVoice = voices.find(
    (voice) => voice.voice_id === catalogue.selectedVoiceId
  );
  const ready =
    selectedVoice !== undefined &&
    text.trim().length > 0 &&
    characterCount <= maxCharacters;

  return (
    <div
      data-testid="controls-voice-generation"
      className="mx-auto w-full max-w-2xl"
    >
      <PromptInput
        onSubmit={submit}
        className="w-full [&>div]:rounded-2xl [&>div]:bg-background [&>div]:shadow-lg"
      >
        <PromptInputBody>
          <PromptInputTextarea
            ref={textareaRef}
            value={text}
            placeholder="Write dialogue, then add emotion or delivery tags…"
            aria-label="Voice generation text"
            disabled={busy || disabled}
            onChange={(event) => {
              setText(event.currentTarget.value);
              setError(null);
            }}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools className="min-w-0 flex-1">
            <AudioTagMenu
              disabled={busy || disabled}
              onSelect={insertAudioTag}
            />
            <PromptInputSelect
              value={catalogue.selectedVoiceId ?? ""}
              onValueChange={(value) => {
                voiceCatalogue.select(value);
                setError(null);
              }}
              disabled={busy || disabled || catalogue.kind !== "ready"}
            >
              <MediaModelPickerTrigger
                className="min-w-24 max-w-44"
                aria-label="ElevenLabs voice"
              >
                {catalogue.kind === "loading" && (
                  <Loader2
                    className="size-3.5 shrink-0 animate-spin"
                    aria-hidden
                  />
                )}
                <PromptInputSelectValue placeholder="Choose voice" />
              </MediaModelPickerTrigger>
              <PromptInputSelectContent>
                {voices.map((voice) => (
                  <PromptInputSelectItem
                    key={voice.voice_id}
                    value={voice.voice_id}
                  >
                    {voice.name}
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectContent>
            </PromptInputSelect>
            <PromptInputSelect
              value={modelId}
              onValueChange={(value) => {
                setModelId(value as models.audio.text_to_speech.ModelId);
                setError(null);
              }}
              disabled={busy || disabled}
            >
              <MediaModelPickerTrigger className="max-w-36">
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
            disabled={busy || disabled || !ready}
            aria-label="Generate voice"
          />
        </PromptInputFooter>
      </PromptInput>
      <div className="flex items-start gap-3 px-3 pt-2 text-xs">
        <VoiceGenerationMessage
          error={error}
          catalogue={catalogue}
          onRetry={() => void voiceCatalogue.load()}
        />
        <span
          className={
            characterCount > maxCharacters
              ? "ml-auto shrink-0 text-destructive"
              : "ml-auto shrink-0 text-muted-foreground"
          }
          aria-label={`${characterCount} of ${maxCharacters} characters`}
        >
          {characterCount.toLocaleString()}/{maxCharacters.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function AudioTagMenu({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (tag: TextToSpeechAudioTag["value"]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton
          aria-label="Add expression tag"
          title="Add an Eleven v3 expression tag"
          disabled={disabled}
        >
          <Sparkles aria-hidden />
          <span className="hidden sm:inline">Expression</span>
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        {AUDIO_TAG_GROUPS.map((group, groupIndex) => (
          <div key={group}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{group}</DropdownMenuLabel>
            {TextToSpeechPrompt.starterTags
              .filter((tag) => tag.group === group)
              .map((tag) => (
                <DropdownMenuItem
                  key={tag.value}
                  onSelect={() => onSelect(tag.value)}
                >
                  <span>{tag.label}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {tag.value}
                  </span>
                </DropdownMenuItem>
              ))}
          </div>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs leading-5 text-muted-foreground">
          You can also type any square-bracket audio tag directly.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VoiceGenerationMessage({
  error,
  catalogue,
  onRetry,
}: {
  error: string | null;
  catalogue: TextToSpeechVoiceCatalogueSnapshot;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <p className="text-destructive" role="alert">
        {error}
      </p>
    );
  }
  if (catalogue.kind === "error") {
    return (
      <p className="text-muted-foreground" role="status">
        Couldn’t load your ElevenLabs voices. Check that the key allows Voices
        Read.
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-1 py-0 text-xs"
          onClick={onRetry}
        >
          Try again
        </Button>
      </p>
    );
  }
  if (catalogue.kind === "ready" && catalogue.voices.length === 0) {
    return (
      <p className="text-muted-foreground" role="status">
        No voices are available for this ElevenLabs account.
      </p>
    );
  }
  return null;
}

function VoiceGenerationUnavailable() {
  return (
    <VoiceGenerationStatus>No Voice model is available.</VoiceGenerationStatus>
  );
}

function VoiceGenerationUnsupported() {
  return (
    <VoiceGenerationStatus>
      Update Grida Desktop to use ElevenLabs Voice.
    </VoiceGenerationStatus>
  );
}

function VoiceGenerationKeyCheck() {
  return (
    <VoiceGenerationStatus>
      Checking ElevenLabs connection…
    </VoiceGenerationStatus>
  );
}

function VoiceGenerationStatus({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="controls-voice-generation"
      className="mx-auto w-full max-w-2xl"
    >
      <p
        className="rounded-2xl border bg-background px-4 py-3 text-sm text-muted-foreground shadow-lg"
        role="status"
      >
        {children}
      </p>
    </div>
  );
}

function safeVoiceFilename(value: string): string {
  const leaf = value.split(/[\\/]/).at(-1)?.trim();
  return leaf && /\.mp3$/i.test(leaf) ? leaf : "grida-voice.mp3";
}

function setGenerationError(
  setError: (message: string) => void,
  message: string
): Error {
  setError(message);
  return new Error(message);
}
