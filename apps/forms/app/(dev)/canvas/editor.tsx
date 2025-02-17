"use client";
import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";
import "../../desktop.css";

function isElectron(): boolean {
  // Renderer process
  if (
    typeof window !== "undefined" &&
    typeof window.process === "object" &&
    // @ts-expect-error electron type
    window.process.type === "renderer"
  ) {
    return true;
  }

  // Main process
  if (
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    !!process.versions.electron
  ) {
    return true;
  }

  // Detect the user agent when the `nodeIntegration` option is set to false
  if (
    typeof navigator === "object" &&
    typeof navigator.userAgent === "string" &&
    navigator.userAgent.indexOf("Electron") >= 0
  ) {
    return true;
  }

  return false;
}

function useIsElectron() {
  const [_isElectron, setIsElectron] = useState<boolean>(false);
  useEffect(() => {
    setIsElectron(isElectron());
  }, []);

  return _isElectron;
}

function DesktopDragArea() {
  const isElectron = useIsElectron();

  if (!isElectron) return null;
  return <div className="w-full min-h-9 h-9 desktop-drag-area border-b" />;
}

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
      <DesktopDragArea />
      <div className="flex-1 overflow-hidden">
        <PlaygroundCanvas {...props} />
      </div>
    </div>
  );
}
