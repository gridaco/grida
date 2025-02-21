"use client";
import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";
import { DesktopDragArea } from "@/components/desktop-drag-area";

const PlaygroundCanvas = dynamic(
  () => import("@/scaffolds/playground-canvas/playground"),
  {
    ssr: false,
  }
);

export default function Editor(
  props: React.ComponentProps<typeof PlaygroundCanvas>
) {
  useEffect(() => {
    addEventListener("beforeunload", (event) => {
      event.preventDefault();
      return "";
    });
  }, []);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <DesktopDragArea className="border-b" />
      <div className="flex-1 overflow-hidden">
        <PlaygroundCanvas {...props} />
      </div>
    </div>
  );
}
