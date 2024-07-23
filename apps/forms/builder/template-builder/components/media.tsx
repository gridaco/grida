import React from "react";
import { z } from "zod";

export function Media({
  type,
  src,
  alt,
  width,
  height,
  className,
}: {
  type: "image" | "video";
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  switch (type) {
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          width={width}
          height={height}
          className={className}
          src={src}
          alt={alt}
        />
      );
    case "video":
      return (
        <video
          width={width}
          height={height}
          className={className}
          src={src}
          autoPlay
          loop
          muted
        />
      );
  }
}

export const MediaSchema = z.object({
  $id: z.literal("media"),
  type: z.union([z.literal("image"), z.literal("video")]),
  src: z.string(),
  alt: z.string().optional(),
});
