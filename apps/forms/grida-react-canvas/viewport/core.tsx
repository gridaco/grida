import React from "react";
import type { cmath } from "@grida/cmath";
import type { ObjectsDistributionAnalysis } from "./ui/distribution";

export interface SurfaceNodeObject {
  id: string;
  boundingRect: cmath.Rectangle;
  boundingSurfaceRect: cmath.Rectangle;
}

export interface SurfaceSelectionGroup {
  selection: string[];
  size: cmath.Vector2;
  boundingSurfaceRect: cmath.Rectangle;
  objects: SurfaceNodeObject[];
  distribution: ObjectsDistributionAnalysis & {
    preferredDistributeEvenlyActionAxis: cmath.Axis | undefined;
  };
  style: React.CSSProperties;
}

const SurfaceSelectionGroupContext =
  React.createContext<SurfaceSelectionGroup | null>(null);

export const SurfaceSelectionGroupProvider =
  SurfaceSelectionGroupContext.Provider;

export const useSurfaceSelectionGroup = () => {
  const context = React.useContext(SurfaceSelectionGroupContext);
  if (!context) {
    throw new Error(
      "useSurfaceSelectionGroup must be used within a SurfaceSelectionGroupProvider"
    );
  }
  return context;
};
