"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Music2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { Slider } from "@app/ui/components/slider";
import { cn } from "@app/ui/lib/utils";
import { AudioPlayback } from "./playback";
import { AudioWaveform } from "./waveform";

export type AudioPlayerArtwork = {
  src: string;
  alt: string;
};

export type AudioPlayerAction = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
};

type AudioPlayerSharedProps = {
  source: string | Blob;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  details?: string;
  actions?: readonly AudioPlayerAction[];
  active?: boolean;
  className?: string;
};

export type AudioPlayerVisualization = "artwork" | "waveform";

export type AudioPlayerProps = AudioPlayerSharedProps &
  (
    | {
        visualization?: "artwork";
        artwork?: AudioPlayerArtwork;
      }
    | {
        visualization: "waveform";
        artwork?: never;
      }
  );

type WaveformState =
  | { kind: "idle" | "loading" | "failed" }
  | { kind: "ready"; peaks: number[] };

/** Opinionated single-track audio playback for URL and Blob sources. */
export function AudioPlayer({
  source,
  title,
  subtitle,
  eyebrow,
  details,
  artwork,
  visualization = "artwork",
  actions = [],
  active = true,
  className,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playbackAttemptRef = useRef(0);
  const lastAudibleVolumeRef = useRef(1);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [metadataReady, setMetadataReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<WaveformState>({ kind: "idle" });
  const showTenths = duration > 0 && duration < 1;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    playbackAttemptRef.current += 1;

    setDuration(0);
    setTime(0);
    setPlaying(false);
    setMetadataReady(false);
    setError(null);

    let sourceUrl: string;
    let objectUrl: string | undefined;
    try {
      if (typeof source === "string") {
        sourceUrl = source;
      } else {
        objectUrl = URL.createObjectURL(source);
        sourceUrl = objectUrl;
      }
      audio.src = sourceUrl;
      audio.load();
    } catch {
      setError("This audio source could not be opened.");
      return;
    }

    return () => {
      playbackAttemptRef.current += 1;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  useEffect(() => {
    if (visualization !== "waveform") {
      setWaveform({ kind: "idle" });
      return;
    }

    const controller = new AbortController();
    setWaveform({ kind: "loading" });
    void AudioWaveform.decode(
      source,
      AudioWaveform.DEFAULT_BAR_COUNT,
      controller.signal
    )
      .then((peaks) => {
        if (!controller.signal.aborted) {
          setWaveform({ kind: "ready", peaks });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setWaveform({ kind: "failed" });
      });
    return () => controller.abort();
  }, [source, visualization]);

  useEffect(() => {
    if (!active) {
      playbackAttemptRef.current += 1;
      audioRef.current?.pause();
    }
  }, [active]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !active || error) return;
    const attempt = ++playbackAttemptRef.current;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch (cause) {
      if (
        AudioPlayback.shouldReportPlayError(
          cause,
          attempt,
          playbackAttemptRef.current
        )
      ) {
        setError("Playback could not be started.");
      }
    }
  };

  const seekTo = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const boundedTime = Math.max(0, Math.min(nextTime, duration));
    audio.currentTime = boundedTime;
    setTime(boundedTime);
  };

  const seek = ([nextTime]: number[]) => {
    if (nextTime !== undefined) seekTo(nextTime);
  };

  const changeVolume = ([nextVolume]: number[]) => {
    const audio = audioRef.current;
    if (!audio || nextVolume === undefined) return;
    if (nextVolume > 0) lastAudibleVolumeRef.current = nextVolume;
    const nextMuted = nextVolume === 0;
    audio.volume = nextVolume;
    audio.muted = nextMuted;
    setVolume(nextVolume);
    setMuted(nextMuted);
  };

  const toggleMuted = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const currentlySilent = audio.muted || audio.volume === 0;
    if (currentlySilent) {
      const nextVolume = AudioPlayback.volumeAfterUnmute(
        audio.volume,
        lastAudibleVolumeRef.current
      );
      audio.volume = nextVolume;
      audio.muted = false;
      setVolume(nextVolume);
      setMuted(false);
      return;
    }
    audio.muted = true;
    setMuted(true);
  };

  return (
    <div
      data-testid="kit-audio-player"
      className={cn(
        "w-full rounded-2xl border bg-card p-5 shadow-sm sm:p-6",
        className
      )}
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
          const nextVolume = event.currentTarget.volume;
          if (nextVolume > 0) lastAudibleVolumeRef.current = nextVolume;
          setVolume(nextVolume);
          setMuted(event.currentTarget.muted);
        }}
        onError={() => {
          setMetadataReady(false);
          setPlaying(false);
          setError("This audio source could not be played.");
        }}
      />

      <div
        className={cn(
          "grid items-center gap-6",
          visualization === "artwork" &&
            "sm:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] sm:gap-8"
        )}
      >
        {visualization === "artwork" && <Artwork artwork={artwork} />}

        <div className="min-w-0">
          <div className="text-center sm:text-left">
            {eyebrow && (
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {eyebrow}
              </div>
            )}
            <h3 className="line-clamp-2 text-xl font-semibold tracking-tight sm:text-2xl">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>

          <div className={visualization === "waveform" ? "mt-6" : "mt-7"}>
            {visualization === "waveform" && waveform.kind !== "failed" ? (
              <WaveformScrubber
                peaks={waveform.kind === "ready" ? waveform.peaks : []}
                currentTime={time}
                duration={duration}
                disabled={
                  !metadataReady || Boolean(error) || waveform.kind !== "ready"
                }
                loading={waveform.kind === "loading"}
                onSeek={seekTo}
              />
            ) : (
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
            )}
            <div className="mt-2 flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>{AudioPlayback.formatTime(time, showTenths)}</span>
              <span>
                {metadataReady
                  ? AudioPlayback.formatTime(duration, showTenths)
                  : "--:--"}
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="w-24" aria-hidden />
            <Button
              type="button"
              size="icon-lg"
              className="size-12 rounded-full shadow-sm"
              onClick={() => void togglePlayback()}
              disabled={!active || !metadataReady || Boolean(error)}
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
                aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
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

          {(details || actions.length > 0) && (
            <div className="mt-5 flex min-w-0 items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
              {details && (
                <span className="min-w-0 flex-1 truncate">{details}</span>
              )}
              {actions.map((action) => (
                <Button
                  key={action.label}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-2 shrink-0"
                  onClick={action.onSelect}
                  disabled={action.disabled}
                  aria-label={action.label}
                  title={action.label}
                >
                  {action.icon}
                </Button>
              ))}
            </div>
          )}
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

function WaveformScrubber({
  peaks,
  currentTime,
  duration,
  disabled,
  loading,
  onSeek,
}: {
  peaks: readonly number[];
  currentTime: number;
  duration: number;
  disabled: boolean;
  loading: boolean;
  onSeek: (time: number) => void;
}) {
  const values =
    peaks.length > 0
      ? peaks
      : Array<number>(AudioWaveform.DEFAULT_BAR_COUNT).fill(0);
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const step = 4;
  const barWidth = 2.5;
  const width = values.length * step - (step - barWidth);
  const height = 80;

  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left) / bounds.width)
    );
    onSeek(position * duration);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromPointer(event);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      seekFromPointer(event);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const stepSeconds = Math.max(0.5, duration / 100);
    let nextTime: number | undefined;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        nextTime = currentTime - stepSeconds;
        break;
      case "ArrowRight":
      case "ArrowUp":
        nextTime = currentTime + stepSeconds;
        break;
      case "Home":
        nextTime = 0;
        break;
      case "End":
        nextTime = duration;
        break;
    }
    if (nextTime === undefined) return;
    event.preventDefault();
    onSeek(nextTime);
  };

  return (
    <div
      role="slider"
      aria-label="Track position"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={currentTime}
      aria-valuetext={`${AudioPlayback.formatTime(
        currentTime,
        duration > 0 && duration < 1
      )} of ${AudioPlayback.formatTime(
        duration,
        duration > 0 && duration < 1
      )}`}
      aria-disabled={disabled}
      aria-busy={loading}
      tabIndex={disabled ? -1 : 0}
      className={cn(
        "relative h-28 touch-none overflow-hidden rounded-xl border bg-muted/20 px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        disabled ? "cursor-default" : "cursor-pointer",
        loading && "animate-pulse"
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="size-full"
        aria-hidden
      >
        {values.map((value, index) => {
          const barHeight = Math.max(5, Math.sqrt(value) * 64);
          const played =
            progress > 0 && (index + 0.5) / values.length <= progress;
          return (
            <rect
              key={index}
              x={index * step}
              y={(height - barHeight) / 2}
              width={barWidth}
              height={barHeight}
              rx={barWidth / 2}
              fill="currentColor"
              opacity={played ? 0.95 : loading ? 0.12 : 0.24}
            />
          );
        })}
        {progress > 0 && (
          <line
            x1={progress * width}
            x2={progress * width}
            y1={4}
            y2={height - 4}
            stroke="currentColor"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            opacity={0.85}
          />
        )}
      </svg>
    </div>
  );
}

function Artwork({ artwork }: { artwork?: AudioPlayerArtwork }) {
  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-64 items-center justify-center overflow-hidden rounded-xl border border-black/5 bg-gradient-to-br from-zinc-100 via-zinc-200 to-zinc-300 shadow-[0_18px_45px_-24px_rgba(0,0,0,0.55)] dark:border-white/10 dark:from-zinc-700 dark:via-zinc-800 dark:to-zinc-950">
      {artwork ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artwork.src}
          alt={artwork.alt}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_20%,rgba(255,255,255,0.7),transparent_42%)] opacity-80 dark:opacity-15" />
          <Music2
            className="relative size-[34%] text-zinc-500/65 drop-shadow-sm dark:text-zinc-300/65"
            strokeWidth={1.45}
            aria-hidden
          />
          <span className="sr-only">Album artwork placeholder</span>
        </>
      )}
    </div>
  );
}
