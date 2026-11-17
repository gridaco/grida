"use client";

import { useState } from "react";
import { GlobeIcon } from "lucide-react";
import type { DesktopBrowser } from "@grida/desktop-bridge";

/** Display-only decode fallback for already bounded native raster bytes. */
export function BrowserTabIcon({
  favicon,
}: {
  favicon?: DesktopBrowser.Favicon | null;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const source = favicon?.dataUrl;
  if (!source || source === failed) return <GlobeIcon className="size-3.5" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- bounded native raster data URI, never a remote optimization request
    <img
      key={source}
      src={source}
      alt=""
      aria-hidden
      width={14}
      height={14}
      className="size-3.5 shrink-0 object-contain"
      onError={() => setFailed(source)}
    />
  );
}
