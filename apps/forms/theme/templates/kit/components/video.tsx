"use client";

import { grida } from "@/grida";
import ReactPlayer from "react-player";

export function BackgroundVideo({
  source,
  width,
  height,
  style,
}: {
  source:
    | grida.program.objects.VideoSource
    | grida.program.objects.VideoPlayerSource;
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
}) {
  switch (source.type) {
    case "video":
      return (
        <video
          src={source.src}
          width={width}
          height={height}
          style={style}
          playsInline
          muted
          autoPlay
          loop
        />
      );
    case "youtube":
    case "vimeo":
    case "facebook":
      return (
        <ReactPlayer
          url={source.url}
          width={width}
          height={height}
          style={style}
          playing
          playsinline
          muted
        />
      );
  }
  //
}
