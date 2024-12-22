import React from "react";
import { grida } from "@/grida";
import { useNode, useSurfacePathEditor } from "@/grida-canvas/provider";
import { useNodeSurfaceTransfrom } from "../hooks/transform";
import { cmath } from "@/grida-canvas/cmath";
import { useGesture } from "@use-gesture/react";
import { cn } from "@/utils";
import assert from "assert";

export function SurfacePathEditor({ node_id }: { node_id: string }) {
  const node = useNode(node_id!);
  const transform = useNodeSurfaceTransfrom(node_id);
  assert(node.type === "polyline");
  const { points } = node as grida.program.nodes.PolylineNode;

  return (
    <div id="path-editor-surface" className="fixed left-0 top-0 w-0 h-0 z-10">
      <div
        style={{
          position: "absolute",
          ...transform,
          willChange: "transform",
          overflow: "visible",
          resize: "none",
          zIndex: 1,
        }}
      >
        {points.map((p, i) => (
          <ControlPoint key={i} point={p} index={i} />
        ))}
      </div>
    </div>
  );
}

function ControlPoint({
  point,
  index,
}: {
  point: cmath.Vector2;
  index: number;
}) {
  const editor = useSurfacePathEditor();
  const selected = editor.selectedPoints.includes(index);
  const bind = useGesture({
    onPointerDown: ({ event }) => {
      event.stopPropagation();
    },
    onDragStart: (state) => {
      const { event } = state;
      event.stopPropagation();
      editor.onPointDragStart(index);
    },
    onDrag: (state) => {
      const { movement, distance, delta, initial, xy, event } = state;
      event.stopPropagation();
      editor.onPointDrag({
        movement,
        distance,
        delta,
        initial,
        xy,
      });
    },
    onDragEnd: (state) => {
      const { event } = state;
      event.stopPropagation();
    },
  });

  return <PathPoint {...bind()} selected={selected} point={point} />;
}

const PathPoint = React.forwardRef(
  (
    {
      point,
      className,
      style,
      selected,
      ...props
    }: React.HtmlHTMLAttributes<HTMLDivElement> & {
      point: cmath.Vector2;
      selected?: boolean;
    },
    ref: React.Ref<HTMLDivElement>
  ) => {
    return (
      <div
        ref={ref}
        {...props}
        data-selected={selected}
        className={cn(
          "w-2 aspect-square rounded-full border border-workbench-accent-sky bg-background data-[selected='true']:w-3 data-[selected='true']:shadow-sm data-[selected='true']:bg-workbench-accent-sky data-[selected='true']:border-2 data-[selected='true']:border-background",
          className
        )}
        style={{
          ...style,
          position: "absolute",
          left: point[0],
          top: point[1],
          transform: "translate(-50%, -50%)",
          cursor: "pointer",
          touchAction: "none",
        }}
      />
    );
  }
);
