import { createContext } from "react";

interface ViewportSurfaceContext {
  portal?: HTMLDivElement | null;
  setPortalRef?: (ref: HTMLDivElement | null) => void;
}

export const ViewportSurfaceContext =
  createContext<ViewportSurfaceContext | null>(null);
