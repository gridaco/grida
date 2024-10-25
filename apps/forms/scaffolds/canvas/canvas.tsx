"use client";

import React, { createContext, useContext, useEffect, useRef } from "react";
import { useCurrentDocument } from "@/scaffolds/editor/use";

interface CanvasEventTargetContext {
  portal?: HTMLDivElement | null;
  setPortalRef?: (ref: HTMLDivElement | null) => void;
}

// Create the context
const Context = createContext<CanvasEventTargetContext | null>(null);

// CanvasEventTarget provider component
export function CanvasEventTarget({
  className,
  children,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  const { clearSelection } = useCurrentDocument();

  const [overlay, setOverlayRef] = React.useState<HTMLDivElement | null>(null);

  return (
    <Context.Provider value={{ portal: overlay, setPortalRef: setOverlayRef }}>
      <div className={className} onPointerDown={clearSelection}>
        {children}
      </div>
    </Context.Provider>
  );
}

// CanvasOverlay component that sets the ref in the context
export function CanvasOverlay() {
  const ref = useRef<HTMLDivElement>(null);
  const context = useContext(Context);

  useEffect(() => {
    if (context?.setPortalRef) {
      context.setPortalRef(ref.current);
    }

    // Clean up when component unmounts
    return () => {
      if (context?.setPortalRef) {
        context.setPortalRef(null);
      }
    };
  }, [context]);

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <div className="w-full h-full" id="canvas-overlay-portal" ref={ref} />
    </div>
  );
}

export function useCanvasOverlayPortal() {
  const context = useContext(Context);
  if (!context) {
    throw new Error(
      "useCanvasOverlay must be used within a CanvasEventTarget."
    );
  }
  return context.portal;
}
