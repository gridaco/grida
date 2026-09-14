"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@app/ui/components/button";
import { AppleLogo, WindowsLogo, LinuxLogo } from "@grida/react-icons/logos";
import { DownloadIcon } from "@radix-ui/react-icons";
import { macarch } from "./mac-arch";

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
}

export function PrimaryDownloadButton({
  os,
  defaultUrl,
  fallbackUrl,
  macX64Url,
}: PrimaryDownloadButtonProps) {
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const [macArch, setMacArch] = useState<macarch.Arch | null>(null);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (os !== "mac") return;
    setMacArch(macarch.classifyRenderer(macarch.readWebGLRenderer()));
  }, [os]);

  const href = macarch.pickHeroUrl({
    os,
    defaultUrl,
    fallbackUrl,
    macX64Url,
    arch: macArch,
  });

  return (
    <a ref={anchorRef} href={href}>
      <Button size="lg">
        {os ? (
          <>
            <OSIcon os={os} className="size-4" /> Download for {oslabel[os]}
          </>
        ) : (
          <>
            <DownloadIcon className="size-4" /> Download
          </>
        )}
        <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex">
          D
        </kbd>
      </Button>
    </a>
  );
}
