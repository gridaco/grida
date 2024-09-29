"use client";

import { MediaObject } from "@/components/mediaviewer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DotFilledIcon, DotIcon, SlashIcon } from "@radix-ui/react-icons";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  AudioLinesIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
} from "lucide-react";
import React, { useMemo } from "react";
import { PauseFilled, PlayFilledIcon } from "@/components/icons";
import AudioMediaSessionProvider, {
  useMediaSession,
} from "@/components/mediaplayer";

export function ContentAudio({
  media,
}: {
  media: MediaObject;
  contentType: `audio/${string}`;
}) {
  return (
    <AudioMediaSessionProvider
      session={{
        metadata: undefined,
        src: media.src,
        autoplay: true,
      }}
    >
      <div className="py-4 w-full flex flex-col items-center justify-center">
        <div className="px-4 flex w-full h-full">
          <PlayerArtwork>
            <AudioLinesIcon className="w-5 h-5" />
          </PlayerArtwork>
          <div className="flex-1 w-full h-auto flex justify-center items-center">
            <PlayerPrevTrigger disabled>
              <ChevronFirstIcon className="w-4 h-4" />
            </PlayerPrevTrigger>
            <PlayerTrigger
              renderer={(playing) =>
                playing ? (
                  <PauseFilled className="w-4 h-4" />
                ) : (
                  <PlayFilledIcon className="w-4 h-4" />
                )
              }
            />
            <PlayerNextTrigger disabled>
              <ChevronLastIcon className="w-4 h-4" />
            </PlayerNextTrigger>
          </div>
        </div>
        <div className="w-full pt-3 pb-2">
          <PlayerTrack />
        </div>
        <div className="px-4 w-full flex justify-between">
          <div className="flex gap-1 items-center">
            <span className="text-sm font-semibold">
              {media?.title ?? "Untitled Audio"}
            </span>
            {/* {media?.artist && (
              <>
                <DotFilledIcon className="w-2 h-2" />
                <span className="text-sm">{media.artist}</span>
              </>
            )} */}
          </div>
          <div className="flex items-center gap-2">
            <PlayerCurrentTime />
            {/* <PlayerTime>00:00</PlayerTime> */}
            <SlashIcon className="w-2 h-2 text-muted-foreground" />
            {/* <PlayerTime>1:00</PlayerTime> */}
            <PlayerDuration />
          </div>
        </div>
      </div>
    </AudioMediaSessionProvider>
  );
}

//
//
//
function PlayerArtwork({ children }: React.PropsWithChildren<{}>) {
  return (
    <Card className="flex w-24 h-24 aspect-square items-center justify-center">
      {children}
    </Card>
  );
}

function PlayerTrack() {
  const { time, duration, seek } = useMediaSession();

  const handlePointerDown = (event: React.PointerEvent) => {
    event.stopPropagation(); // Prevent event from propagating to parent
  };

  return (
    <div className="w-full group h-4 flex items-center">
      <SliderPrimitive.Root
        min={0}
        max={duration}
        value={[time]}
        onPointerDown={handlePointerDown}
        onValueChange={([value]) => seek(value)}
        className="relative flex w-full touch-none select-none items-center"
      >
        <SliderPrimitive.Track className="relative h-1 group-hover:h-1.5 transition-all w-full grow overflow-hidden bg-primary/20">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block opacity-0 group-hover:opacity-100 w-2 aspect-square group-hover:w-2.5 rounded-full bg-primary shadow transition-colors transition-opacity focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
      </SliderPrimitive.Root>
    </div>
  );
}

function TimeText({ time }: { time: number }) {
  return <span className="text-xs text-muted-foreground">{fmtTime(time)}</span>;
}

function PlayerCurrentTime() {
  const { time } = useMediaSession();
  return <TimeText time={time} />;
}

function PlayerDuration() {
  const { duration } = useMediaSession();
  return <TimeText time={duration} />;
}

function PlayerTrigger({
  renderer,
}: {
  renderer: (playing: boolean) => React.ReactNode;
}) {
  const { play, pause, playing } = useMediaSession();

  const onClick = playing ? pause : play;

  return (
    <Button onClick={onClick} variant="ghost" size="icon">
      {useMemo(() => renderer(playing), [renderer, playing])}
    </Button>
  );
}

function PlayerPlayTrigger({ children }: React.PropsWithChildren<{}>) {
  const { play } = useMediaSession();
  return (
    <Button onClick={play} variant="ghost" size="icon">
      {children}
    </Button>
  );
}

function PlayerNextTrigger({
  children,
  ...props
}: React.PropsWithChildren<React.ComponentProps<typeof Button>>) {
  return (
    <Button variant="ghost" size="icon" {...props}>
      {children}
    </Button>
  );
}

function PlayerPrevTrigger({
  children,
  ...props
}: React.PropsWithChildren<React.ComponentProps<typeof Button>>) {
  return (
    <Button variant="ghost" size="icon" {...props}>
      {children}
    </Button>
  );
}

function fmtTime(time: number) {
  const minutes = Math.floor(time / 60);
  const seconds = (time % 60).toFixed(0).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
