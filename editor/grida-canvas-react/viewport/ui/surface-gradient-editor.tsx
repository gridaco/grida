import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import { useSingleSelection } from "../surface-hooks";
import { GradientControlPointsEditor, getPointsFromTransform, getTransformFromPoints, type GradientType } from "@/grida-canvas-react-gradient";
import cg from "@grida/cg";
import { useNodeState } from "@/grida-canvas-react/provider";

const gradientTypeMap: Record<string, "linear" | "radial" | "sweep"> = {
  ["linear_gradient" satisfies cg.Paint["type"]]: "linear",
  ["radial_gradient" satisfies cg.Paint["type"]]: "radial",
  ["sweep_gradient" satisfies cg.Paint["type"]]: "sweep",
};

function isGradientPaint(fill: cg.Paint): fill is cg.GradientPaint {
  return (
    fill.type === "linear_gradient" ||
    fill.type === "radial_gradient" ||
    fill.type === "sweep_gradient"
  );
}

export function SurfaceGradientEditor({ node_id }: { node_id: string }) {
  const editor = useCurrentEditor();
  const data = useSingleSelection(node_id);
  const { fill } = useNodeState(node_id, (node) => ({
    fill: node.fill,
  }));

  if (!data) return null;
  if (!fill) return null;
  if (!isGradientPaint(fill)) return null;

  return (
    <div
      id="gradient-editor-surface"
      className="fixed left-0 top-0 w-0 h-0 z-10"
    >
      <div
        style={{
          position: "absolute",
          ...data.style,
          willChange: "transform",
          overflow: "visible",
          resize: "none",
          zIndex: 1,
        }}
      >
        <Editor
          node_id={node_id}
          width={data.boundingSurfaceRect.width}
          height={data.boundingSurfaceRect.height}
          gradient={fill}
          onValueChange={(g) => {
            editor.changeNodeFill(node_id, g);
          }}
        />
      </div>
    </div>
  );
}

function Editor({
  node_id,
  width,
  height,
  gradient,
  onValueChange,
}: {
  node_id: string;
  width: number;
  height: number;
  gradient: cg.GradientPaint;
  onValueChange: (fill: cg.GradientPaint) => void;
}) {
  const gradientType = gradientTypeMap[gradient.type];
  
  // Convert transform to control points for initial state
  const [points, setPoints] = useState(() => {
    const transform = {
      a: gradient.transform[0][0],
      b: gradient.transform[0][1],
      tx: gradient.transform[0][2],
      d: gradient.transform[1][0],
      e: gradient.transform[1][1],
      ty: gradient.transform[1][2],
    };
    const controlPoints = getPointsFromTransform(transform, gradientType);
    return [controlPoints.A, controlPoints.B, controlPoints.C] as [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number }
    ];
  });

  const [stops, setStops] = useState(gradient.stops);
  const [focusedStop, setFocusedStop] = useState<number | null>(null);

  // Update state when gradient prop changes
  useEffect(() => {
    const transform = {
      a: gradient.transform[0][0],
      b: gradient.transform[0][1],
      tx: gradient.transform[0][2],
      d: gradient.transform[1][0],
      e: gradient.transform[1][1],
      ty: gradient.transform[1][2],
    };
    const controlPoints = getPointsFromTransform(transform, gradientType);
    setPoints([controlPoints.A, controlPoints.B, controlPoints.C]);
    setStops(gradient.stops);
  }, [gradient, gradientType]);

  const handlePointsChange = useCallback((newPoints: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number }
  ]) => {
    setPoints(newPoints);
    
    // Convert points back to transform
    const transform = getTransformFromPoints(
      { A: newPoints[0], B: newPoints[1], C: newPoints[2] },
      gradientType
    );
    
    onValueChange?.({
      type: `${gradientType}_gradient` as cg.GradientPaint["type"],
      stops,
      transform: [
        [transform.a, transform.b, transform.tx],
        [transform.d, transform.e, transform.ty],
      ],
    });
  }, [gradientType, stops, onValueChange]);

  const handlePositionChange = useCallback((index: number, position: number) => {
    const newStops = [...stops];
    newStops[index] = { ...newStops[index], offset: position };
    setStops(newStops);
    
    // Convert points to transform
    const transform = getTransformFromPoints(
      { A: points[0], B: points[1], C: points[2] },
      gradientType
    );
    
    onValueChange?.({
      type: `${gradientType}_gradient` as cg.GradientPaint["type"],
      stops: newStops,
      transform: [
        [transform.a, transform.b, transform.tx],
        [transform.d, transform.e, transform.ty],
      ],
    });
  }, [stops, points, gradientType, onValueChange]);

  const handleInsertStop = useCallback((at: number, position: number) => {
    // Create a gray color for new stops
    const newColor: cg.RGBA8888 = { r: 128, g: 128, b: 128, a: 1 };
    const newStop = { offset: position, color: newColor };
    
    const newStops = [...stops];
    newStops.splice(at, 0, newStop);
    setStops(newStops);
    setFocusedStop(at);
    
    // Convert points to transform
    const transform = getTransformFromPoints(
      { A: points[0], B: points[1], C: points[2] },
      gradientType
    );
    
    onValueChange?.({
      type: `${gradientType}_gradient` as cg.GradientPaint["type"],
      stops: newStops,
      transform: [
        [transform.a, transform.b, transform.tx],
        [transform.d, transform.e, transform.ty],
      ],
    });
  }, [stops, points, gradientType, onValueChange]);

  const handleDeleteStop = useCallback((index: number) => {
    if (stops.length <= 2) return; // Don't allow deleting if only 2 stops remain
    
    const newStops = stops.filter((_, i) => i !== index);
    setStops(newStops);
    
    // Adjust focused stop
    if (focusedStop === index) {
      setFocusedStop(null);
    } else if (focusedStop !== null && focusedStop > index) {
      setFocusedStop(focusedStop - 1);
    }
    
    // Convert points to transform
    const transform = getTransformFromPoints(
      { A: points[0], B: points[1], C: points[2] },
      gradientType
    );
    
    onValueChange?.({
      type: `${gradientType}_gradient` as cg.GradientPaint["type"],
      stops: newStops,
      transform: [
        [transform.a, transform.b, transform.tx],
        [transform.d, transform.e, transform.ty],
      ],
    });
  }, [stops, focusedStop, points, gradientType, onValueChange]);

  return (
    <GradientControlPointsEditor
      stops={stops}
      focusedStop={focusedStop}
      points={points}
      width={width}
      height={height}
      gradientType={gradientType}
      onPointsChange={handlePointsChange}
      onPositionChange={handlePositionChange}
      onInsertStop={handleInsertStop}
      onDeleteStop={handleDeleteStop}
      onFocusedStopChange={setFocusedStop}
    />
  );
}
