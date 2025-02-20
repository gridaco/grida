"use client";
import { cn } from "@/utils";
import React, { useEffect, useState } from "react";

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

export function DesktopDragArea({
  children,
  className,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) {
  const isElectron = useIsElectron();

  if (!isElectron) return null;
  return (
    <div
      {...props}
      className={cn("w-full min-h-9 h-9 desktop-drag-area", className)}
    >
      {children}
    </div>
  );
}
