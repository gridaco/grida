import React from "react";
import { useTransformState, useCurrentEditor } from "@/grida-canvas-react";
import { useSingleSelection } from "../surface-hooks";
import GradientEditor from "@/app/(dev)/ui/gradient-editor/gradient-editor";
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
        <Editor node_id={node_id} />
      </div>
    </div>
  );
}

function Editor({ node_id }: { node_id: string }) {
  const editor = useCurrentEditor();

  const { fill, width, height } = useNodeState(node_id, (node) => ({
    fill: node.fill,
    width: node.width,
    height: node.height,
  }));

  const gradientType = fill?.type ? gradientTypeMap[fill.type] : undefined;
  if (!gradientType) return null;

  console.log("fill", fill);

  return (
    <GradientEditor
      width={width}
      height={height}
      gradientType={gradientType}
      // onValueChange={(s) => {
      //   editor.changeNodeFill(node_id, {
      //     ...fill,
      //     type: "linear_gradient",
      //     stops: s.stops,
      //     // transform: g.transform,
      //   });
      //   //
      // }}
      // onValueChange={(g) => {
      //   console.log("g", g);
      //   editor.changeNodeFill(node_id, {
      //     type: "linear_gradient",
      //     stops: g.stops,
      //     transform: g.transform,
      //   });
      // }}
      preventDefault
      stopPropagation
    />
  );
}
