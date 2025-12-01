import React, { useState, useCallback, useEffect } from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import { useSingleSelection } from "../surface-hooks";
import {
  GradientControlPointsEditor,
  getPointsFromTransform,
  getTransformFromPoints,
} from "@/grida-canvas-react-gradient";
import cg from "@grida/cg";
import kolor from "@grida/color";
import {
  useContentEditModeState,
  useNodeState,
} from "@/grida-canvas-react/provider";
import { editor } from "@/grida-canvas";
import {
  resolvePaints,
  getTargetPaint,
  updateTargetPaint,
} from "@/grida-canvas/utils/paint-resolution";

const gradientTypeMap: Record<string, "linear" | "radial" | "sweep"> = {
  ["linear_gradient" satisfies cg.Paint["type"]]: "linear",
  ["radial_gradient" satisfies cg.Paint["type"]]: "radial",
  ["sweep_gradient" satisfies cg.Paint["type"]]: "sweep",
  // diamond as radial is ok, because the control points are identical.
  ["diamond_gradient" satisfies cg.Paint["type"]]: "radial",
};

export function SurfaceGradientEditor({ node_id }: { node_id: string }) {
  const { selected_stop, paint_index, paint_target } =
    useContentEditModeState()! as editor.state.PaintGradientContentEditMode;
  const data = useSingleSelection(node_id);
  const node = useNodeState(node_id, (node) => node);

  if (!data || !node) return null;

  const target = paint_target ?? "fill";
  const { paints, resolvedIndex: activePaintIndex } = resolvePaints(
    node,
    target,
    paint_index ?? 0
  );
  const gradient = paints[activePaintIndex];

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
          paint_index={activePaintIndex}
          paint_target={target}
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
  paint_index,
  paint_target,
  selected_stop,
}: {
  node_id: string;
  width: number;
  height: number;
  gradient: cg.GradientPaint;
  paint_index: number;
  paint_target: "fill" | "stroke";
  selected_stop: number;
}) {
  const editor = useCurrentEditor();
  const node = useNodeState(node_id, (node) => node);

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
      editor.surface.surfaceSelectGradientStop(node_id, stop ?? 0, {
        paintIndex: paint_index,
        paintTarget: paint_target,
      });
    },
    [editor, node_id, paint_index, paint_target]
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
      if (editor && node) {
        const { paints } = resolvePaints(node, paint_target, paint_index);
        const updatedPaints = [...paints];

        if (updatedPaints.length === 0) {
          updatedPaints.push(g);
        } else {
          const { resolvedIndex } = resolvePaints(
            node,
            paint_target,
            paint_index
          );
          updatedPaints[resolvedIndex] = g;
        }

        if (paint_target === "stroke") {
          editor.commands.changeNodePropertyStrokes(node_id, updatedPaints);
        } else {
          editor.commands.changeNodePropertyFills(node_id, updatedPaints);
        }
      }
    },
    [editor, node_id, paint_index, paint_target, node]
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
        active: true,
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
        active: true,
      });
    },
    [stops, points, gradient.type, gradientType, onValueChange]
  );

  const handleInsertStop = useCallback(
    (at: number, position: number) => {
      // Create a gray color for new stops
      const newColor: cg.RGBA32F = kolor.colorformats.RGBA32F.GRAY;
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
        active: true,
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
