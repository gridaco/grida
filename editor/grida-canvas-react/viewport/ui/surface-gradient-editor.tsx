import React from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import { useSingleSelection } from "../surface-hooks";
import GradientControlPointsEditor from "@/grida-canvas-react-gradient/gradient-control-points-editor";
import { useGradientEditorIntegration } from "@/grida-canvas-react-gradient/use-gradient-editor-integration";
import cg from "@grida/cg";
import { useNodeState } from "@/grida-canvas-react/provider";

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
  const integration = useGradientEditorIntegration({
    gradient,
    width,
    height,
    onGradientChange: onValueChange,
  });

  return (
    <GradientControlPointsEditor
      width={width}
      height={height}
      gradientType={integration.gradientType}
      stops={integration.stops}
      focusedStop={integration.focusedStop}
      points={integration.points}
      onPointsChange={integration.onPointsChange}
      onPositionChange={integration.onPositionChange}
      onInsertStop={integration.onInsertStop}
      onDeleteStop={integration.onDeleteStop}
      onFocusedStopChange={integration.onFocusedStopChange}
    />
  );
}
