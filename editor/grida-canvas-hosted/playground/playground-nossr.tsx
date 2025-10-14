"use client";

import dynamic from "next/dynamic";

const PlaygroundCanvas = dynamic(
  () => import("@/grida-canvas-hosted/playground/playground"),
  {
    ssr: false,
  }
);

export default PlaygroundCanvas;
