import React, { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShineBorder } from "@/www/ui/shine-border";
import { useStopwatch } from "react-timer-hook";
import { cn } from "@/utils";
import Image from "next/image";

export function GenerationImageFrame({
  image,
  className,
  width,
  height,
  start,
  end,
}: {
  image: {
    src: string;
    alt: string | null;
    width: number;
    height: number;
  } | null;
  start?: Date | null;
  end?: Date | null;
  width: number;
  height: number;
  className?: string;
}) {
  const { totalMilliseconds, pause } = useStopwatch({
    autoStart: true,
    offsetTimestamp: start ?? undefined,
    interval: 100,
  });

  useEffect(() => {
    if (image) {
      pause();
    }
  }, [image]);

  return (
    <figure
      className={cn(
        "relative w-full h-auto min-h-64 aspect-square overflow-hidden rounded",
        className
      )}
    >
      {!image && <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />}
      {image ? (
        <Image
          src={image.src}
          width={image.width}
          height={image.height}
          alt={image.alt ?? "Generated"}
          className="w-full h-auto"
        />
      ) : (
        <div className="relative w-full h-full">
          <Skeleton className="w-full h-full" />
          <div className="absolute right-2 bottom-2">
            <span className="font-mono text-xs">
              {(totalMilliseconds / 1000).toFixed(1)}s
            </span>
          </div>
        </div>
      )}
    </figure>
  );
}
