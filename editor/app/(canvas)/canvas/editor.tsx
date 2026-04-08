"use client";
import dynamic from "next/dynamic";
import React from "react";
import { DesktopDragArea } from "@/host/desktop";

const PlaygroundCanvas = dynamic(
  () => import("@/grida-canvas-hosted/playground/playground"),
  {
    ssr: false,
  }
);

export default function Editor(
  props: React.ComponentProps<typeof PlaygroundCanvas>
) {
  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <DesktopDragArea className="border-b" />
      <div className="flex-1 overflow-hidden">
        <PlaygroundCanvas {...props} warnOnUnsavedChanges />
      </div>
    </div>
  );
}
