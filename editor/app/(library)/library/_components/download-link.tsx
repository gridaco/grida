"use client";

import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { LibraryDownload } from "@/lib/library/download";
import { LibraryStorage } from "@/lib/library/storage";

/** Public Library download control; do not use inside Desktop's fetch perimeter. */
export function DownloadLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const tigris = LibraryStorage.provider() === "tigris";

  async function download(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await LibraryDownload.save(href);
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <a
        href={href}
        download
        className={className}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        onClick={tigris ? download : undefined}
      >
        {children}
      </a>
      {busy && (
        <span role="status" className="text-xs">
          Downloading…
        </span>
      )}
      {failed && (
        <span role="alert" className="text-xs text-destructive">
          Download failed. Try again.
        </span>
      )}
    </>
  );
}
