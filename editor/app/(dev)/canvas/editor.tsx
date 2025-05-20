"use client";
import dynamic from "next/dynamic";
import React from "react";
import { DesktopDragArea } from "@/host/desktop";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";

const PlaygroundCanvas = dynamic(
  () => import("@/scaffolds/playground-canvas/playground"),
  {
    ssr: false,
  }
);

export default function Editor(
  props: React.ComponentProps<typeof PlaygroundCanvas>
) {
  useUnsavedChangesWarning(() => true);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <DesktopDragArea className="border-b" />
      <div className="flex-1 overflow-hidden">
        <PlaygroundCanvas {...props} />
      </div>
    </div>
  );
}
