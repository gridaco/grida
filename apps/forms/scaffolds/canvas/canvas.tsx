"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
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
      <div
        className={className}
        onPointerDown={clearSelection}
        style={{ pointerEvents: "auto" }}
      >
        {children}
      </div>
    </Context.Provider>
  );
}

// CanvasOverlay component that sets the ref in the context
export function CanvasOverlay() {
  const {
    document: { hovered_node_id, selected_node_id },
  } = useCurrentDocument();
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
    <div className="absolute inset-0 pointer-events-none z-50">
      <div className="w-full h-full" id="canvas-overlay-portal" ref={ref}>
        {selected_node_id && <NodeOverlay node_id={selected_node_id} />}
        {hovered_node_id && <NodeOverlay node_id={hovered_node_id} />}
      </div>
    </div>
  );
}

const __rect_fallback = { top: 0, left: 0, width: 0, height: 0 };

function NodeOverlay({ node_id }: { node_id: string }) {
  const portal = useCanvasOverlayPortal();
  const container = useMemo(() => {
    return document.getElementById(node_id);
  }, [node_id]);

  const portalRect = portal?.getBoundingClientRect() ?? __rect_fallback;
  const containerRect = container?.getBoundingClientRect() ?? __rect_fallback;

  // Calculate the position of the target relative to the portal
  const top = containerRect.top - portalRect.top;
  const left = containerRect.left - portalRect.left;
  const width = containerRect.width;
  const height = containerRect.height;

  return (
    <div
      className="pointer-events-none select-none z-10 border-2 border-workbench-accent-sky"
      style={{
        position: "absolute",
        top: top,
        left: left,
        width: width,
        height: height,
      }}
    />
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
