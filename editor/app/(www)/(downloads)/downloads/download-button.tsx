"use client";

import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Apple } from "@/components/logos/apple";
import { Windows } from "@/components/logos/windows";
import { Linux } from "@/components/logos/linux";
import { DownloadIcon } from "@radix-ui/react-icons";
import type { downloads } from "./downloads";

type OS = "mac" | "windows" | "linux";

const oslabel: Record<OS, string> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
};

function OSIcon({ os, className }: { os: OS; className?: string }) {
  switch (os) {
    case "mac":
      return <Apple className={className} />;
    case "windows":
      return <Windows className={className} />;
    case "linux":
      return <Linux className={className} />;
  }
}

interface PrimaryDownloadButtonProps {
  os: OS | null;
  defaultUrl: string | null;
  fallbackUrl: string;
}

export function PrimaryDownloadButton({
  os,
  defaultUrl,
  fallbackUrl,
}: PrimaryDownloadButtonProps) {
  const anchorRef = useRef<HTMLAnchorElement>(null);

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

  const href = os ? (defaultUrl ?? fallbackUrl) : fallbackUrl;

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
