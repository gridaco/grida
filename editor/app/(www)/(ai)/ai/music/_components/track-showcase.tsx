"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from "lucide-react";
import { cn } from "@/components/lib/utils";

export type ShowcaseTrack = {
  id: string;
  title: string;
  tags: string[];
  prompt: string;
  image: string;
  audio: string;
};

export function TrackShowcase({ tracks }: { tracks: ShowcaseTrack[] }) {
  const n = tracks.length;
  const [active, setActive] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeTrack = tracks[active];

  // Lazily create the singleton audio element on the client.
  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio();
      a.crossOrigin = "anonymous";
      a.preload = "auto";
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  // Keep latest active in a ref so audio event handlers (bound once) read fresh state.
  const activeRef = useRef(active);
  activeRef.current = active;

  // Sync audio with autoPlay + active.
  useEffect(() => {
    const a = ensureAudio();

    if (autoPlay) {
      if (a.src !== activeTrack.audio) {
        a.src = activeTrack.audio;
        a.currentTime = 0;
        setProgress(0);
      }
      const p = a.play();
      if (p) {
        p.then(() => setPlayingId(activeTrack.id)).catch(() => {
          // Browser blocked autoplay or src failed; surrender.
          setAutoPlay(false);
        });
      }
    } else {
      a.pause();
      setPlayingId(null);
    }
  }, [autoPlay, activeTrack, ensureAudio]);

  // Audio event listeners — bind once.
  useEffect(() => {
    const a = ensureAudio();
    const onTime = () => {
      if (a.duration > 0) setProgress(a.currentTime / a.duration);
    };
    const onEnd = () => {
      setProgress(0);
      // Advance to the next track; stop at the end (no looping).
      const cur = activeRef.current;
      if (cur + 1 >= n) {
        setAutoPlay(false);
      } else {
        setActive(cur + 1);
      }
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, [ensureAudio, n]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  // Clamp at boundaries — no looping.
  const goPrev = useCallback(() => {
    setActive((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setActive((i) => Math.min(n - 1, i + 1));
  }, [n]);

  // Keyboard arrows
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === " ") {
        e.preventDefault();
        setAutoPlay((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  return (
    <div className="relative w-screen left-1/2 -translate-x-1/2 max-w-none">
      {/* Stage — spans the full viewport width */}
      <div
        className="relative mx-auto w-full h-[440px] sm:h-[560px] md:h-[660px] lg:h-[740px]"
        style={{ perspective: "2400px" }}
      >
        {tracks.map((track, i) => {
          // Linear distance — no ring wrap. The carousel is a flat strip.
          const offset = i - active;
          const abs = Math.abs(offset);
          const isActive = offset === 0;

          const scale = isActive
            ? 1
            : abs === 1
              ? 0.86
              : abs === 2
                ? 0.74
                : abs === 3
                  ? 0.62
                  : 0.5;
          const rotateY = offset * -18;
          // % of stage width — bigger spread for full-bleed feel
          const translateX = offset * 32;
          const z = 50 - abs * 10;
          // No opacity fade — every card stays fully opaque on its way off-stage.
          const opacity = 1;

          return (
            <button
              key={track.id}
              type="button"
              onClick={() => {
                if (isActive) {
                  setAutoPlay((p) => !p);
                } else {
                  setActive(i);
                }
              }}
              aria-label={
                isActive
                  ? playingId === track.id
                    ? `Pause ${track.title}`
                    : `Play ${track.title}`
                  : `Select ${track.title}`
              }
              className={cn(
                "absolute top-1/2 left-1/2 origin-center",
                "transition-transform duration-500 ease-out",
                "aspect-square",
                "w-[320px] sm:w-[440px] md:w-[580px] lg:w-[680px]",
                "rounded-md overflow-hidden bg-card",
                "shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]",
                "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
              )}
              style={{
                transform: `translate(-50%, -50%) translateX(${translateX}%) rotateY(${rotateY}deg) scale(${scale})`,
                zIndex: z,
                opacity,
                transformStyle: "preserve-3d",
                pointerEvents: abs > 3 ? "none" : "auto",
              }}
            >
              {/* Cover */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={track.image}
                alt={track.title}
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />

              {/* Active overlay */}
              {isActive && (
                <>
                  <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/50 to-transparent" />

                  <span
                    className={cn(
                      "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                      "size-16 md:size-20 rounded-full bg-white/95 text-black",
                      "flex items-center justify-center shadow-lg",
                      "transition-transform duration-200 hover:scale-110"
                    )}
                  >
                    {playingId === track.id ? (
                      <PauseIcon className="size-6 md:size-7 fill-current" />
                    ) : (
                      <PlayIcon className="size-6 md:size-7 fill-current ml-0.5" />
                    )}
                  </span>

                  <div className="absolute inset-x-0 bottom-0 p-5 md:p-6 text-left">
                    <h3 className="text-white text-xl md:text-2xl font-semibold tracking-tight mb-2 drop-shadow">
                      {track.title}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {track.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] text-white/90 border border-white/30 backdrop-blur-sm bg-white/5"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="absolute inset-x-3 bottom-2 h-1 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full bg-white/90 transition-[width] duration-150 ease-linear"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Controls row — sits just below the active card, sized to the card
          width. Pagination dots centered; nav chevrons hugged to the card's
          right edge. Three-column grid keeps pagination centered relative to
          the card regardless of how many dots there are. */}
      <div className="mx-auto mt-4 grid grid-cols-3 items-center w-[320px] sm:w-[440px] md:w-[580px] lg:w-[680px] pr-3 md:pr-4">
        <div />
        <div
          className="flex items-center justify-center gap-1.5"
          aria-label="Pagination"
        >
          {tracks.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Go to ${t.title}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === active
                  ? "w-6 bg-foreground"
                  : "w-1.5 bg-foreground/25 hover:bg-foreground/50"
              )}
            />
          ))}
        </div>
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={active === 0}
            aria-label="Previous track"
            className="inline-flex items-center justify-center text-foreground/60 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-foreground/60"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={active === n - 1}
            aria-label="Next track"
            className="inline-flex items-center justify-center text-foreground/60 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-foreground/60"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Track meta + CTA — prompt with max-h clamp + bottom gradient fade,
          chevron-down toggle to expand. Keeps height uniform across tracks
          regardless of prompt length. */}
      <div className="mt-12 flex flex-col items-center text-center gap-3 px-6">
        <PromptReveal prompt={activeTrack.prompt} />
        <Link
          href={{
            pathname: "/ai/music/playground",
            query: { prompt: activeTrack.prompt },
          }}
          className="text-sm font-medium underline-offset-4 hover:underline mt-3"
        >
          Generate your own →
        </Link>
      </div>
    </div>
  );
}

// Prompt block with a fixed collapsed height + bottom gradient fade and a
// "Read more" / "Read less" toggle. Keeps the meta strip's vertical footprint
// identical across tracks regardless of prompt length (Lyria 3 Pro prompts
// run 1500–2000 chars with `[Intro]` / `[Verse]` etc. structure).
//
// When collapsed, the entire clamped block is the click target — clicking
// anywhere on the prompt expands it. When expanded, only the "Read less"
// affordance collapses, so users can select / read text without accidentally
// closing the block.
function PromptReveal({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full max-w-xl flex flex-col items-start gap-2">
      <div
        role={!open ? "button" : undefined}
        tabIndex={!open ? 0 : undefined}
        aria-expanded={open}
        onClick={!open ? () => setOpen(true) : undefined}
        onKeyDown={
          !open
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(true);
                }
              }
            : undefined
        }
        className={cn(
          "relative w-full overflow-hidden transition-[max-height] duration-300",
          open ? "max-h-[60vh]" : "max-h-32 cursor-pointer"
        )}
      >
        <p className="text-sm text-muted-foreground leading-relaxed text-left whitespace-pre-wrap">
          {prompt}
        </p>
        {!open && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-xs font-medium text-foreground/70 hover:text-foreground underline-offset-4 hover:underline"
      >
        {open ? "Read less" : "Read more"}
      </button>
    </div>
  );
}
