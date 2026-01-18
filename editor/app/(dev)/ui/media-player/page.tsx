"use client";

import { MediaObject } from "@/components/mediaviewer";
import { ContentAudio } from "@/components/mediaviewer/pip-audio-content";
import { Card } from "@/components/ui/card";
import React from "react";

export default function MediaPlayerDevPage() {
  return (
    <main className="w-screen h-screen p-10">
      <Card className="h-48 aspect-video shadow-2xl p-0">
        <PipPlayerContent
          mediaSrc={{
            // artist: "Artist",
            // artwork: "https://via.placeholder.com/150",
            title: "Title",
            // id: "0",
            // name: "0.mp3",
            src: "/dummy/audio/mp3/mp3-40s-700kb.mp3",
          }}
          contentType={"audio/mp3"}
        />
      </Card>
    </main>
  );
}

function PipPlayerContent({
  mediaSrc,
  contentType,
}: {
  mediaSrc: MediaObject;
  contentType: `audio/${string}` | `video/${string}` | undefined | "unknwon";
}) {
  if (contentType === "unknwon") {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <PipPlayerErrorMessage>Unable to read the file</PipPlayerErrorMessage>
      </div>
    );
  }

  if (contentType?.startsWith("audio/")) {
    return (
      <ContentAudio media={mediaSrc} contentType={contentType as "audio/*"} />
    );
  }

  if (contentType?.startsWith("video/")) {
    return (
      <video
        src={mediaSrc?.src}
        controls
        className="max-w-full max-h-full aspect-video"
      >
        Your browser does not support the video tag.
      </video>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <PipPlayerErrorMessage>Unable to read the file</PipPlayerErrorMessage>
    </div>
  );
}

function PipPlayerErrorMessage({ children }: React.PropsWithChildren) {
  return <span className="text-sm text-muted-foreground">{children}</span>;
}
