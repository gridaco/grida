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
  const { selected_stop, fill_index } =
    useContentEditModeState()! as editor.state.FillGradientContentEditMode;
  const data = useSingleSelection(node_id);
  // TODO: LEGACY_PAINT_MODEL
  const { fill, fills } = useNodeState(node_id, (node) => ({
    fill: node.fill,
    fills: node.fills,
  }));

  if (!data) return null;
  const paints =
    Array.isArray(fills) && fills.length > 0 ? fills : fill ? [fill] : [];
  const activeFillIndex = Math.min(
    paints.length - 1,
    Math.max(0, fill_index ?? 0)
  );
  const gradient = paints[activeFillIndex];

  if (!gradient) return null;
  if (!cg.isGradientPaint(gradient)) return null;

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
          gradient={gradient}
          fill_index={activeFillIndex}
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
  fill_index,
  selected_stop,
}: {
  node_id: string;
  width: number;
  height: number;
  gradient: cg.GradientPaint;
  fill_index: number;
  selected_stop: number;
}) {
  const editor = useCurrentEditor();
  // TODO: LEGACY_PAINT_MODEL
  const { fill, fills } = useNodeState(node_id, (node) => ({
    fill: node.fill,
    fills: node.fills,
  }));

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
      editor.selectGradientStop(node_id, stop ?? 0, {
        fillIndex: fill_index,
      });
    },
    [editor, node_id, fill_index]
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
      if (editor) {
        const currentFills = Array.isArray(fills)
          ? [...fills]
          : fill
            ? [fill]
            : [];
        const activeFillIndex = Math.min(
          currentFills.length - 1,
          Math.max(0, fill_index ?? 0)
        );
        currentFills[activeFillIndex] = g;
        editor.changeNodeFills(node_id, currentFills);
      }
    },
    [editor, node_id, fill_index, fills, fill]
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
        blendMode: gradient.blendMode,
        opacity: gradient.opacity || 1,
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
        blendMode: gradient.blendMode,
        opacity: gradient.opacity || 1,
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
        blendMode: gradient.blendMode,
        opacity: gradient.opacity || 1,
      });
    },
    [stops, points, gradient.type, gradientType, onValueChange]
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
      onFocusedStopChange={setFocusedStop}
    />
  );
}
