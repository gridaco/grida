"use client";

import dynamic from "next/dynamic";

const PlaygroundCanvas = dynamic(
  () => import("@/scaffolds/playground-canvas/playground"),
  {
    ssr: false,
  }
);

export default PlaygroundCanvas;
