"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@app/ui/components/button";
import { AppleLogo, WindowsLogo, LinuxLogo } from "@grida/react-icons/logos";
import { DownloadIcon } from "@radix-ui/react-icons";
import { macarch } from "./mac-arch";
import { desktopPlatform } from "@/www/desktop-platform";

type OS = "mac" | "windows" | "linux";

const oslabel: Record<OS, string> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
};

function OSIcon({ os, className }: { os: OS; className?: string }) {
  switch (os) {
    case "mac":
      return <AppleLogo className={className} />;
    case "windows":
      return <WindowsLogo className={className} />;
    case "linux":
      return <LinuxLogo className={className} />;
  }
}

interface PrimaryDownloadButtonProps {
  os: OS | null;
  defaultUrl: string | null;
  fallbackUrl: string;
  /** Intel DMG; ignored unless client-side detection reports x64 (issue #954). */
  macX64Url: string | null;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  showShortcut?: boolean;
  fallbackLabel?: string;
}

export function PrimaryDownloadButton({
  os,
  defaultUrl,
  fallbackUrl,
  macX64Url,
  className,
  variant = "default",
  showShortcut = true,
  fallbackLabel = "Download",
}: PrimaryDownloadButtonProps) {
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const [macArch, setMacArch] = useState<macarch.Arch | null>(null);
  const [detectedOS, setDetectedOS] = useState(os);

  useEffect(() => {
    setDetectedOS(
      desktopPlatform.detect(navigator.userAgent, navigator.maxTouchPoints)
    );
  }, [os]);

  useEffect(() => {
    if (!showShortcut) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "d" && e.key !== "D") return;
      const tag = (e.target as HTMLElement)?.tagName ?? "";
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;
      e.preventDefault();
      anchorRef.current?.click();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showShortcut]);

  useEffect(() => {
    if (detectedOS !== "mac") return;
    setMacArch(macarch.classifyRenderer(macarch.readWebGLRenderer()));
  }, [detectedOS]);

  const href = macarch.pickHeroUrl({
    os: detectedOS,
    defaultUrl,
    fallbackUrl,
    macX64Url,
    arch: macArch,
  });

  return (
    <Button asChild size="lg" variant={variant} className={className}>
      <a ref={anchorRef} href={href}>
        {detectedOS ? (
          <>
            <OSIcon os={detectedOS} className="size-4" /> Download for{" "}
            {oslabel[detectedOS]}
          </>
        ) : (
          <>
            <DownloadIcon className="size-4" /> {fallbackLabel}
          </>
        )}
        {showShortcut && (
          <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex">
            D
          </kbd>
        )}
      </a>
    </Button>
  );
}
