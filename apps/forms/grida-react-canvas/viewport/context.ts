import { createContext, useContext } from "react";

interface ViewportSurfaceContext {
  portal?: HTMLDivElement | null;
  setPortalRef?: (ref: HTMLDivElement | null) => void;
}

export const ViewportSurfaceContext =
  createContext<ViewportSurfaceContext | null>(null);

export function useViewport() {
  const context = useContext(ViewportSurfaceContext);
  if (!context) {
    throw new Error(
      "useViewportSurface must be used within a ViewportSurfaceProvider"
    );
  }
  return context.portal;
}
