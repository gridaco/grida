import React, { useState, useCallback, useEffect } from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import { useSingleSelection } from "../surface-hooks";
import {
  GradientControlPointsEditor,
  getPointsFromTransform,
  getTransformFromPoints,
} from "@/grida-canvas-react-gradient";
import cg from "@grida/cg";
import {
  useContentEditModeState,
  useNodeState,
} from "@/grida-canvas-react/provider";
import { editor } from "@/grida-canvas";

const gradientTypeMap: Record<string, "linear" | "radial" | "sweep"> = {
  ["linear_gradient" satisfies cg.Paint["type"]]: "linear",
  ["radial_gradient" satisfies cg.Paint["type"]]: "radial",
  ["sweep_gradient" satisfies cg.Paint["type"]]: "sweep",
  // diamond as radial is ok, because the control points are identical.
  ["diamond_gradient" satisfies cg.Paint["type"]]: "radial",
};

export function SurfaceGradientEditor({ node_id }: { node_id: string }) {
  const { selected_stop } =
    useContentEditModeState()! as editor.state.FillGradientContentEditMode;
  const data = useSingleSelection(node_id);
  const { fill } = useNodeState(node_id, (node) => ({
    fill: node.fill,
  }));

  if (!data) return null;
  if (!fill) return null;
  if (!cg.isGradientPaint(fill)) return null;

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
        <EditorUser
          node_id={node_id}
          width={data.boundingSurfaceRect.width}
          height={data.boundingSurfaceRect.height}
          gradient={fill}
          selected_stop={selected_stop}
        />
      </div>
    </div>
  );
}

function EditorUser({
  node_id,
  width,
  height,
  gradient,
  selected_stop,
}: {
  node_id: string;
  width: number;
  height: number;
  gradient: cg.GradientPaint;
  selected_stop: number;
}) {
  const editor = useCurrentEditor();

  const gradientType = gradientTypeMap[gradient.type];

  // Convert transform to control points for initial state
  const [points, setPoints] = useState(() => {
    const controlPoints = getPointsFromTransform(
      gradient.transform,
      gradientType
    );
    return [controlPoints.A, controlPoints.B, controlPoints.C] as [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ];
  });

  const [stops, setStops] = useState(gradient.stops);

  const setFocusedStop = useCallback(
    (stop: number | null) => {
      editor.selectGradientStop(node_id, stop ?? 0);
    },
    [editor, node_id]
  );

  // Update state when gradient prop changes
  useEffect(() => {
    const controlPoints = getPointsFromTransform(
      gradient.transform,
      gradientType
    );
    setPoints([controlPoints.A, controlPoints.B, controlPoints.C]);
    setStops(gradient.stops);
  }, [gradient, gradientType]);

  const onValueChange = useCallback(
    (g: cg.GradientPaint) => {
      editor?.changeNodeFill(node_id, g);
    },
    [editor, node_id]
  );

  const handlePointsChange = useCallback(
    (
      newPoints: [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
      ]
    ) => {
      setPoints(newPoints);

      // Convert points back to transform
      const transform = getTransformFromPoints(
        { A: newPoints[0], B: newPoints[1], C: newPoints[2] },
        gradientType
      );

      onValueChange?.({
        type: gradient.type,
        stops,
        transform,
      });
    },
    [gradient.type, gradientType, stops, onValueChange]
  );

  const handlePositionChange = useCallback(
    (index: number, position: number) => {
      const newStops = [...stops];
      newStops[index] = { ...newStops[index], offset: position };
      setStops(newStops);

      // Convert points to transform
      const transform = getTransformFromPoints(
        { A: points[0], B: points[1], C: points[2] },
        gradientType
      );

      onValueChange?.({
        type: gradient.type,
        stops: newStops,
        transform,
      });
    },
    [stops, points, gradient.type, gradientType, onValueChange]
  );

  const handleInsertStop = useCallback(
    (at: number, position: number) => {
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
        type: gradient.type,
        stops: newStops,
        transform,
      });
    },
    [stops, points, gradient.type, gradientType, onValueChange]
  );

  const handleDeleteStop = useCallback(
    (index: number) => {
      if (stops.length <= 2) return; // Don't allow deleting if only 2 stops remain

      const newStops = stops.filter((_, i) => i !== index);
      setStops(newStops);

      // Adjust focused stop
      if (selected_stop === index) {
        setFocusedStop(null);
      } else if (selected_stop !== null && selected_stop > index) {
        setFocusedStop(selected_stop - 1);
      }

      // Convert points to transform
      const transform = getTransformFromPoints(
        { A: points[0], B: points[1], C: points[2] },
        gradientType
      );

      onValueChange?.({
        type: `${gradientType}_gradient` as cg.GradientPaint["type"],
        stops: newStops,
        transform,
      });
    },
    [stops, selected_stop, points, gradient.type, gradientType, onValueChange]
  );

  return (
    <GradientControlPointsEditor
      stops={stops}
      focusedStop={selected_stop}
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
