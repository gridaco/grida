"use client";

import { useState, type ReactNode } from "react";
import { WorkflowIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";
import type { WebPreview } from "@grida/desktop-bridge";

/** Renders a page favicon with the same product fallback in each preview. */
export function PreviewFavicon({
  metadata,
  className,
  inline,
  fallback = null,
}: {
  metadata: WebPreview.Metadata | null;
  className?: string;
  inline?: boolean;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState<WebPreview.Metadata["favicon"]>();
  const favicon = metadata?.favicon;
  const marker = inline ? "" : undefined;
  if (favicon && favicon !== failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- bounded native raster data URI
      <img
        src={favicon.dataUrl}
        alt=""
        className={cn("object-contain", className)}
        data-chat-web-link-favicon={marker}
        onError={() => setFailed(favicon)}
      />
    );
  }
  if (metadata?.productLabel === "FX Viewer") {
    return (
      <WorkflowIcon
        aria-hidden
        className={className}
        data-chat-web-link-favicon={marker}
      />
    );
  }
  return fallback;
}
