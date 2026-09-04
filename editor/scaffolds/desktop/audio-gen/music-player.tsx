"use client";

import { useEffect, useRef, useState } from "react";
import {
  FolderSearch,
  Music2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import { Slider } from "@app/ui/components/slider";
import { AudioCompatibility } from "../media-formats/audio-compatibility";

export function MusicPlayer({
  file,
  active = true,
  title = trackTitle(file.name),
  artist = "Local audio",
  generated = false,
  revealLabel = "Show in folder",
  onReveal,
}: {
  file: File;
  active?: boolean;
  title?: string;
  artist?: string;
  generated?: boolean;
  revealLabel?: string;
  onReveal?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [metadataReady, setMetadataReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const support = AudioCompatibility.probe(file);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setDuration(0);
    setTime(0);
    setPlaying(false);
    setMetadataReady(false);
    setError(null);

    let url: string;
    try {
      url = URL.createObjectURL(file);
      audio.src = url;
      audio.load();
    } catch {
      setError("This audio file could not be opened.");
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

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || error) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setError("Playback could not be started.");
    }
  };

  const seek = ([nextTime]: number[]) => {
    const audio = audioRef.current;
    if (!audio || nextTime === undefined) return;
    audio.currentTime = nextTime;
    setTime(nextTime);
  };

  const changeVolume = ([nextVolume]: number[]) => {
    const audio = audioRef.current;
    if (!audio || nextVolume === undefined) return;
    const nextMuted = nextVolume === 0;
    audio.volume = nextVolume;
    audio.muted = nextMuted;
    setVolume(nextVolume);
    setMuted(nextMuted);
  };

  const toggleMuted = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextMuted = !audio.muted;
    audio.muted = nextMuted;
    setMuted(nextMuted);
  };

  return (
    <div
      data-testid="player-music"
      className="w-full rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
    >
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          setDuration(
            Number.isFinite(nextDuration) && nextDuration >= 0
              ? nextDuration
              : 0
          );
          setMetadataReady(true);
          setError(null);
        }}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onError={() => {
          setMetadataReady(false);
          setPlaying(false);
          setError("This audio codec could not be played.");
        }}
      />

      <div className="grid items-center gap-6 sm:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] sm:gap-8">
        <div
          className="relative mx-auto flex aspect-square w-full max-w-64 items-center justify-center overflow-hidden rounded-xl border border-black/5 bg-gradient-to-br from-zinc-100 via-zinc-200 to-zinc-300 shadow-[0_18px_45px_-24px_rgba(0,0,0,0.55)] dark:border-white/10 dark:from-zinc-700 dark:via-zinc-800 dark:to-zinc-950"
          role="img"
          aria-label="Album artwork placeholder"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_20%,rgba(255,255,255,0.7),transparent_42%)] opacity-80 dark:opacity-15" />
          <Music2
            className="relative size-[34%] text-zinc-500/65 drop-shadow-sm dark:text-zinc-300/65"
            strokeWidth={1.45}
            aria-hidden
          />
        </div>

        <div className="min-w-0">
          <div className="text-center sm:text-left">
            {generated && (
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                AI generated track
              </div>
            )}
            <h3 className="line-clamp-2 text-xl font-semibold tracking-tight sm:text-2xl">
              {title}
            </h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {artist}
            </p>
          </div>

          <div className="mt-7">
            <Slider
              min={0}
              max={duration || 1}
              step={0.01}
              value={[Math.min(time, duration || 0)]}
              disabled={!metadataReady || Boolean(error)}
              onValueChange={seek}
              aria-label="Track position"
              className="[&_[data-slot=slider-thumb]]:size-3"
            />
            <div className="mt-2 flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>{formatTime(time)}</span>
              <span>{metadataReady ? formatTime(duration) : "--:--"}</span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="w-24" aria-hidden />
            <Button
              type="button"
              size="icon-lg"
              className="size-12 rounded-full shadow-sm"
              onClick={() => void togglePlayback()}
              disabled={!metadataReady || Boolean(error)}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="fill-current" aria-hidden />
              ) : (
                <Play className="ml-0.5 fill-current" aria-hidden />
              )}
            </Button>
            <div className="flex w-24 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={toggleMuted}
                disabled={!metadataReady || Boolean(error)}
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted || volume === 0 ? (
                  <VolumeX aria-hidden />
                ) : (
                  <Volume2 aria-hidden />
                )}
              </Button>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[muted ? 0 : volume]}
                disabled={!metadataReady || Boolean(error)}
                onValueChange={changeVolume}
                aria-label="Volume"
                className="[&_[data-slot=slider-thumb]]:size-3"
              />
            </div>
          </div>

          <div className="mt-5 flex min-w-0 items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              {file.name} · {support.label}
            </span>
            {onReveal && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="-mr-2 shrink-0"
                onClick={onReveal}
                aria-label={revealLabel}
                title={revealLabel}
              >
                <FolderSearch aria-hidden />
              </Button>
            )}
          </div>
          {!metadataReady && !error && (
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              Reading audio metadata…
            </p>
          )}
          {error && (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function trackTitle(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || "Untitled track";
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
