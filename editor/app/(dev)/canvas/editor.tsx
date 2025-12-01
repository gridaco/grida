"use client";
import dynamic from "next/dynamic";
import React from "react";
import { DesktopDragArea } from "@/host/desktop";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";

const PlaygroundCanvas = dynamic(
  () => import("@/grida-canvas-hosted/playground/playground"),
  {
    ssr: false,
  }
);

export default function Editor(
  props: React.ComponentProps<typeof PlaygroundCanvas>
) {
  useUnsavedChangesWarning(() => {
    // on by default, off in development
    return process.env.NODE_ENV === "development" ? false : true;
  });

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <DesktopDragArea className="border-b" />
      <div className="flex-1 overflow-hidden">
        <PlaygroundCanvas {...props} />
      </div>
    </div>
  );
}
