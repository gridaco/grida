import React from "react";
import type { cmath } from "@grida/cmath";
import type { ObjectsDistributionAnalysis } from "./ui/distribution";

export interface SurfaceNodeObject {
  id: string;
  boundingRect: cmath.Rectangle;
  boundingSurfaceRect: cmath.Rectangle;
}

export interface SurfaceSelectionGroup {
  /**
   * the id of the group - the shared parent of the selection. if root, it's `""` empty.
   */
  // group: string;

  /**
   * ids of the selection, within the group (same parent)
   */
  selection: string[];

  /**
   * the measured size of the group, in canvas space.
   */
  size: cmath.Vector2;

  /**
   * surface-space bounding rect of the group, used for displaying the overlay.
   */
  boundingSurfaceRect: cmath.Rectangle;

  /**
   * surface overlay objects
   */
  objects: SurfaceNodeObject[];

  /**
   * the calculated distribution of the objects
   */
  distribution: ObjectsDistributionAnalysis & {
    preferredDistributeEvenlyActionAxis: cmath.Axis | undefined;
  };

  /**
   * style of the overlay
   */
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
