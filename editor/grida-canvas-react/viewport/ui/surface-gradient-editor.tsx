import React from "react";
import { useTransformState, useCurrentEditor } from "@/grida-canvas-react";
import { useSingleSelection } from "../surface-hooks";
import GradientEditor, { useGradient } from "@/grida-canvas-react-gradient";
import cg from "@grida/cg";
import { useNodeState } from "@/grida-canvas-react/provider";

const gradientTypeMap: Record<string, "linear" | "radial" | "sweep"> = {
  ["linear_gradient" satisfies cg.Paint["type"]]: "linear",
  ["radial_gradient" satisfies cg.Paint["type"]]: "radial",
  ["sweep_gradient" satisfies cg.Paint["type"]]: "sweep",
};

export function SurfaceGradientEditor({ node_id }: { node_id: string }) {
  const data = useSingleSelection(node_id);

  if (!data) return null;

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
        />
      </div>
    </div>
  );
}

function Editor({
  node_id,
  width,
  height,
}: {
  node_id: string;
  width: number;
  height: number;
}) {
  const editor = useCurrentEditor();

  const { fill } = useNodeState(node_id, (node) => ({
    fill: node.fill,
  }));

  const gradientType = fill?.type ? gradientTypeMap[fill.type] : undefined;

  const g = useGradient({
    gradientType: gradientType ?? "linear",
    width,
    height,
    // initialValue: fill as cg.GradientPaint,
    preventDefault: true,
    stopPropagation: true,
  });

  if (!gradientType) return null;

  return (
    <GradientEditor
      width={width}
      height={height}
      gradientType={gradientType}
      editor={g}
    />
  );
}
