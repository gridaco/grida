import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { ShineBorder } from "@/www/ui/shine-border";
import Image from "next/image";

export function SingleImageFrame({
  image,
  className,
}: {
  image: {
    src: string;
    alt: string | null;
    width: number;
    height: number;
  } | null;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "relative w-full h-full overflow-hidden rounded",
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
          className="w-full h-full object-cover"
        />
      ) : (
        <Skeleton className="w-full h-full" />
      )}
    </figure>
  );
}
