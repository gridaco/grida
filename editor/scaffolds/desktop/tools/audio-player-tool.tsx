"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { FileUp, FolderSearch, Volume2, X } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@app/ui/components/empty";
import type { MediaItem } from "@/lib/desktop/bridge";
import { AudioCompatibility } from "../media-formats/audio-compatibility";
import { LocalAudioPlayer } from "../media-formats/local-audio-player";
import { FileDownloadButton } from "../shared/file-download-button";

type StoredFile = Readonly<{
  item: MediaItem;
  file: File;
}>;

/** Local audio inspection tool. It owns no generation or model concerns. */
export function AudioPlayerTool({
  initialStoredMedia = null,
  onRevealStoredMedia,
}: {
  initialStoredMedia?: StoredFile | null;
  onRevealStoredMedia?: (item: MediaItem) => void;
}) {
  const [file, setFile] = useState<File | null>(
    initialStoredMedia?.file ?? null
  );
  const [source, setSource] = useState<"local" | "stored" | null>(
    initialStoredMedia ? "stored" : null
  );
  const [storedMedia, setStoredMedia] = useState<MediaItem | null>(
    initialStoredMedia?.item ?? null
  );
  const [duration, setDuration] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!nextFile) return;
    setFile(nextFile);
    setSource("local");
    setStoredMedia(null);
    setDuration(null);
  };

  const clear = () => {
    setFile(null);
    setSource(null);
    setStoredMedia(null);
    setDuration(null);
  };

  const support = file ? AudioCompatibility.probe(file) : null;

  return (
    <section
      data-testid="tool-audio-player"
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-6 py-4">
        <h2 className="mr-2 min-w-0 text-2xl font-bold tracking-tight">
          Audio player
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {source === "stored" && file && <FileDownloadButton file={file} />}
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
        id="audio-player-file"
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept={AudioCompatibility.ACCEPT}
        aria-describedby="audio-player-help"
        onChange={onFileChange}
      />

      <div className="min-h-0 flex-1 p-4">
        {file ? (
          <div className="flex h-full items-center justify-center overflow-auto rounded-lg border bg-muted/20 p-6">
            <div className="w-full max-w-2xl">
              <LocalAudioPlayer
                file={file}
                active
                onDurationChange={setDuration}
              />
            </div>
          </div>
        ) : (
          <Empty className="h-full bg-transparent">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Volume2 />
              </EmptyMedia>
              <EmptyTitle>Open an audio file</EmptyTitle>
              <EmptyDescription id="audio-player-help">
                Choose an MP3, WAV, FLAC, Ogg, or WebM file.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
              >
                <FileUp aria-hidden />
                Choose file
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>

      {file && (
        <AudioStatusStrip
          file={file}
          support={support}
          duration={duration}
          source={source}
        />
      )}
    </section>
  );
}

function AudioStatusStrip({
  file,
  support,
  duration,
  source,
}: {
  file: File;
  support: AudioCompatibility.SupportResult | null;
  duration: number | null;
  source: "local" | "stored" | null;
}) {
  const selection = file.name + (source === "stored" ? " · saved locally" : "");
  return (
    <footer
      className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-t px-6 py-2 text-xs"
      aria-live="polite"
    >
      <span className="min-w-0 truncate font-medium">{selection}</span>
      <span className="text-muted-foreground">
        {support
          ? [
              support.label,
              formatBytes(file.size),
              formatDuration(duration),
              playbackLabel(support),
            ].join(" · ")
          : "Native playback · runtime codec probing"}
      </span>
    </footer>
  );
}

function playbackLabel(support: AudioCompatibility.SupportResult): string {
  if (support.canPlay === false) return "Unavailable";
  switch (support.playability) {
    case "probably":
      return "Playable";
    case "maybe":
      return "Runtime-dependent";
    case "unprobed":
      return "Not probed";
    case "unsupported":
      return "Unavailable";
  }
}

function formatDuration(duration: number | null): string {
  if (duration === null) return "Duration pending";
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60);
  return minutes + ":" + seconds.toString().padStart(2, "0");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KiB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MiB";
}
