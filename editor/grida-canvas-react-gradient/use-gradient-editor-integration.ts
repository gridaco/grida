import React, { useCallback, useMemo } from "react";
import type cg from "@grida/cg";
import { 
  getTransformFromPoints, 
  getPointsFromTransform,
  getBaseControlPoints,
  type GradientTransform,
  type ControlPoints 
} from "./gradient-reducer";
import type { Point } from "./gradient-control-points-editor";

export interface UseGradientEditorIntegrationOptions {
  gradient: cg.GradientPaint;
  width: number;
  height: number;
  onGradientChange: (gradient: cg.GradientPaint) => void;
}

export interface UseGradientEditorIntegrationReturn {
  // Props for GradientControlPointsEditor
  gradientType: "linear" | "radial" | "sweep";
  stops: { offset: number; color: cg.RGBA8888 }[];
  focusedStop: number | null;
  points: [Point, Point, Point];
  
  // Event handlers for GradientControlPointsEditor
  onPointsChange: (points: [Point, Point, Point]) => void;
  onPositionChange: (index: number, position: number) => void;
  onInsertStop: (at: number, position: number) => void;
  onDeleteStop: (index: number) => void;
  onFocusedStopChange: (index: number | null) => void;
  
  // Additional state for focus management
  setFocusedStop: (index: number | null) => void;
}

const gradientTypeMap: Record<cg.GradientPaint["type"], "linear" | "radial" | "sweep"> = {
  linear_gradient: "linear",
  radial_gradient: "radial",
  sweep_gradient: "sweep",
};

/**
 * Hook that bridges the new GradientControlPointsEditor with the editor's fill system.
 * Handles conversion between points and transforms automatically.
 */
export function useGradientEditorIntegration({
  gradient,
  width,
  height,
  onGradientChange,
}: UseGradientEditorIntegrationOptions): UseGradientEditorIntegrationReturn {
  const [focusedStop, setFocusedStop] = React.useState<number | null>(null);
  
  const gradientType = gradientTypeMap[gradient.type];
  
  // Convert gradient transform to control points
  const points = useMemo(() => {
    const transform: GradientTransform = {
      a: gradient.transform[0][0],
      b: gradient.transform[0][1],
      tx: gradient.transform[0][2],
      d: gradient.transform[1][0],
      e: gradient.transform[1][1],
      ty: gradient.transform[1][2],
    };
    
    const controlPoints = getPointsFromTransform(transform, gradientType);
    return [controlPoints.A, controlPoints.B, controlPoints.C] as [Point, Point, Point];
  }, [gradient.transform, gradientType]);
  
  // Convert gradient stops to the format expected by GradientControlPointsEditor
  const stops = useMemo(() => {
    return gradient.stops.map(stop => ({
      offset: stop.offset,
      color: stop.color
    }));
  }, [gradient.stops]);
  
  // Handle points change - convert back to transform and update gradient
  const onPointsChange = useCallback((newPoints: [Point, Point, Point]) => {
    const controlPoints: ControlPoints = {
      A: newPoints[0],
      B: newPoints[1],
      C: newPoints[2],
    };
    
    const transform = getTransformFromPoints(controlPoints, gradientType);
    const newTransform: cg.AffineTransform = [
      [transform.a, transform.b, transform.tx],
      [transform.d, transform.e, transform.ty],
    ];
    
    onGradientChange({
      ...gradient,
      transform: newTransform,
    });
  }, [gradient, gradientType, onGradientChange]);
  
  // Handle stop position change
  const onPositionChange = useCallback((index: number, position: number) => {
    const newStops = [...gradient.stops];
    newStops[index] = { ...newStops[index], offset: position };
    
    // Sort stops by offset to maintain order
    newStops.sort((a, b) => a.offset - b.offset);
    
    onGradientChange({
      ...gradient,
      stops: newStops,
    });
  }, [gradient, onGradientChange]);
  
  // Handle stop insertion
  const onInsertStop = useCallback((at: number, position: number) => {
    // Find the two closest stops to interpolate color
    const sortedStops = [...gradient.stops].sort((a, b) => a.offset - b.offset);
    let beforeStop = sortedStops[0];
    let afterStop = sortedStops[sortedStops.length - 1];
    
    for (let i = 0; i < sortedStops.length - 1; i++) {
      if (sortedStops[i].offset <= position && sortedStops[i + 1].offset >= position) {
        beforeStop = sortedStops[i];
        afterStop = sortedStops[i + 1];
        break;
      }
    }
    
    // Interpolate color between the two stops
    const t = (position - beforeStop.offset) / (afterStop.offset - beforeStop.offset);
    const interpolatedColor: cg.RGBA8888 = {
      r: Math.round(beforeStop.color.r + (afterStop.color.r - beforeStop.color.r) * t),
      g: Math.round(beforeStop.color.g + (afterStop.color.g - beforeStop.color.g) * t),
      b: Math.round(beforeStop.color.b + (afterStop.color.b - beforeStop.color.b) * t),
      a: beforeStop.color.a + (afterStop.color.a - beforeStop.color.a) * t,
    };
    
    const newStops = [...gradient.stops, { offset: position, color: interpolatedColor }];
    newStops.sort((a, b) => a.offset - b.offset);
    
    onGradientChange({
      ...gradient,
      stops: newStops,
    });
    
    // Focus the new stop
    const newIndex = newStops.findIndex(stop => stop.offset === position);
    setFocusedStop(newIndex);
  }, [gradient, onGradientChange]);
  
  // Handle stop deletion
  const onDeleteStop = useCallback((index: number) => {
    if (gradient.stops.length <= 2) return; // Ensure at least 2 stops remain
    
    const newStops = gradient.stops.filter((_, i) => i !== index);
    
    onGradientChange({
      ...gradient,
      stops: newStops,
    });
    
    // Clear focus if the deleted stop was focused
    if (focusedStop === index) {
      setFocusedStop(null);
    } else if (focusedStop !== null && focusedStop > index) {
      setFocusedStop(focusedStop - 1);
    }
  }, [gradient, onGradientChange, focusedStop]);
  
  const onFocusedStopChange = useCallback((index: number | null) => {
    setFocusedStop(index);
  }, []);
  
  return {
    gradientType,
    stops,
    focusedStop,
    points,
    onPointsChange,
    onPositionChange,
    onInsertStop,
    onDeleteStop,
    onFocusedStopChange,
    setFocusedStop,
  };
}