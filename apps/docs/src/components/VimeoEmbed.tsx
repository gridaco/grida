import React from "react";

const wrapperStyle = {
  padding: "64.67% 0 0 0",
  position: "relative",
};

const iframeStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
};

export function VimeoEmbed({
  videoId,
  title = "Video",
  autoplay = true,
  muted = true,
  loop = true,
}: {
  videoId: string;
  title?: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
}) {
  const params = new URLSearchParams({
    badge: "0",
    autopause: "0",
    player_id: "0",
    app_id: "58479",
    autoplay: autoplay ? "1" : "0",
    muted: muted ? "1" : "0",
    loop: loop ? "1" : "0",
  });
  const src = `https://player.vimeo.com/video/${videoId}?${params.toString()}`;

  return (
    <div style={wrapperStyle}>
      <iframe
        src={src}
        frameBorder="0"
        allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        style={iframeStyle}
        title={title}
      />
    </div>
  );
}
