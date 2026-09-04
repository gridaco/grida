"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { FileUp, FolderSearch, Mic2, X } from "lucide-react";
import { models } from "@grida/ai-models";
import { Button } from "@app/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@app/ui/components/empty";
import { AudioPlayer } from "@/kits/audio-player";
import { useDesktopBridge, type MediaItem } from "@/lib/desktop/bridge";
import { AudioCompatibility } from "../media-formats/audio-compatibility";
import { FileDownloadButton } from "../shared/file-download-button";
import {
  VoiceGenerationControls,
  type VoiceGeneratedPreview,
} from "./voice-generation-controls";

/** ElevenLabs text-to-speech playground with an MP3 output boundary. */
export function VoicePlayground({
  initialModelId,
  modelIds,
  generationDisabled = false,
  onGenerationBusyChange,
  onStoredMediaCreated,
  onRevealStoredMedia,
}: {
  initialModelId?: models.audio.text_to_speech.ModelId;
  modelIds?: readonly models.audio.text_to_speech.ModelId[];
  generationDisabled?: boolean;
  onGenerationBusyChange?: (busy: boolean) => void;
  onStoredMediaCreated?: (item: MediaItem) => void;
  onRevealStoredMedia?: (item: MediaItem) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<"local" | "generated" | null>(null);
  const [generatedModelId, setGeneratedModelId] =
    useState<models.audio.text_to_speech.ModelId | null>(null);
  const [generatedVoiceName, setGeneratedVoiceName] = useState<string | null>(
    null
  );
  const [storedMedia, setStoredMedia] = useState<MediaItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bridge = useDesktopBridge();
  const revealLabel =
    bridge?.app.platform === "darwin" ? "Show in Finder" : "Show in folder";

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!nextFile) return;
    setFile(nextFile);
    setSource("local");
    setGeneratedModelId(null);
    setGeneratedVoiceName(null);
    setStoredMedia(null);
  };

  const onGenerated = (result: VoiceGeneratedPreview) => {
    setFile(result.file);
    setSource("generated");
    setGeneratedModelId(result.modelId);
    setGeneratedVoiceName(result.voice.name);
    setStoredMedia(result.storedMedia ?? null);
    if (result.storedMedia) onStoredMediaCreated?.(result.storedMedia);
  };

  const clear = () => {
    setFile(null);
    setSource(null);
    setGeneratedModelId(null);
    setGeneratedVoiceName(null);
    setStoredMedia(null);
  };

  const subtitle = generatedModelId
    ? [
        generatedVoiceName,
        models.audio.text_to_speech.models[generatedModelId].label,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Local audio";

  return (
    <section
      data-testid="playground-voice-generation"
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-6 py-4">
        <h2 className="mr-2 min-w-0 text-2xl font-bold tracking-tight">
          Voice
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {source === "generated" && file && <FileDownloadButton file={file} />}
          {file && (
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
        id="voice-generation-output-file"
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept={AudioCompatibility.ACCEPT}
        aria-describedby="voice-generation-output-help"
        onChange={onFileChange}
      />

      <div className="relative min-h-0 flex-1">
        <div className="h-full min-h-0 p-4 pb-40">
          {file ? (
            <div className="flex h-full items-center justify-center overflow-auto rounded-lg border bg-muted/20 p-6">
              <div className="w-full max-w-2xl">
                <AudioPlayer
                  source={file}
                  visualization="waveform"
                  active
                  title={
                    source === "generated"
                      ? "Generated voice"
                      : voiceTitle(file.name)
                  }
                  subtitle={subtitle}
                  eyebrow={
                    source === "generated" ? "AI generated voice" : undefined
                  }
                  details={`${file.name} · ${AudioCompatibility.probe(file).label}`}
                  actions={
                    storedMedia && onRevealStoredMedia
                      ? [
                          {
                            label: revealLabel,
                            icon: <FolderSearch aria-hidden />,
                            onSelect: () => onRevealStoredMedia(storedMedia),
                          },
                        ]
                      : []
                  }
                />
              </div>
            </div>
          ) : (
            <Empty className="h-full bg-transparent">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Mic2 />
                </EmptyMedia>
                <EmptyTitle>Your voice will appear here</EmptyTitle>
                <EmptyDescription id="voice-generation-output-help">
                  Write dialogue below and shape the delivery with audio tags.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4">
          <div className="pointer-events-auto w-full">
            <VoiceGenerationControls
              initialModelId={initialModelId}
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

function voiceTitle(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || "Untitled voice";
}
