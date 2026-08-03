"use client";

import { useEffect, useRef, useState } from "react";
import { AudioCompatibility } from "./audio-compatibility";

export function LocalAudioPlayer({
  file,
  active = true,
  onDurationChange,
}: {
  file: File;
  active?: boolean;
  onDurationChange?: (durationSeconds: number | null) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const onDurationChangeRef = useRef(onDurationChange);
  const [error, setError] = useState<string | null>(null);
  const [metadataReady, setMetadataReady] = useState(false);
  const support = AudioCompatibility.probe(file);

  useEffect(() => {
    onDurationChangeRef.current = onDurationChange;
  }, [onDurationChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setError(null);
    setMetadataReady(false);
    onDurationChangeRef.current?.(null);

    let url: string;
    try {
      url = URL.createObjectURL(file);
      audio.src = url;
      audio.load();
    } catch {
      setError("This local audio file could not be opened.");
      return;
    }

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (!active) audioRef.current?.pause();
  }, [active]);

  const compatibilityNote =
    support.tier === "conditional"
      ? `${support.label} playback depends on the codecs available in this Desktop build.`
      : support.canPlay === false
        ? `${support.label} playback is not available in this Desktop build.`
        : null;

  return (
    <div
      data-testid="player-local-audio"
      className="w-full rounded-md border bg-card p-3"
    >
      <div className="mb-2 min-w-0">
        <div className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </div>
        <div className="text-xs text-muted-foreground">{support.label}</div>
      </div>
      <audio
        ref={audioRef}
        className="w-full"
        controls
        preload="metadata"
        onError={() => {
          setMetadataReady(false);
          setError("This audio codec could not be played.");
          onDurationChangeRef.current?.(null);
        }}
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          setMetadataReady(true);
          setError(null);
          onDurationChangeRef.current?.(
            Number.isFinite(duration) && duration >= 0 ? duration : null
          );
        }}
      >
        Your browser does not support audio playback.
      </audio>
      {!metadataReady && !error && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          Reading audio metadata…
        </p>
      )}
      {(error || (metadataReady && compatibilityNote)) && (
        <p
          className={
            error
              ? "mt-2 text-xs text-destructive"
              : "mt-2 text-xs text-muted-foreground"
          }
          role={error ? "alert" : "status"}
        >
          {error ?? compatibilityNote}
        </p>
      )}
    </div>
  );
}
