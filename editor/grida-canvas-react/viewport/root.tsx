"use client";

import React from "react";
import { domapi } from "@/grida-canvas/backends/dom";
import { ViewportSurfaceContext } from "./context";
import { cn } from "@/components/lib/utils";

export function ViewportRoot({
  className,
  children,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "id" | "style">) {
  const [overlay, setOverlayRef] = React.useState<HTMLDivElement | null>(null);

  return (
    <ViewportSurfaceContext.Provider
      value={{ portal: overlay, setPortalRef: setOverlayRef }}
    >
      <div
        {...props}
        id={domapi.k.VIEWPORT_ELEMENT_ID}
        className={cn("z-0", className)}
        style={{ pointerEvents: "auto", overflow: "hidden" }}
      >
        {children}
      </div>
    </ViewportSurfaceContext.Provider>
  );
}
