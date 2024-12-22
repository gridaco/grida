import React from "react";
import { useEventTarget, useSurfacePathEditor } from "@/grida-canvas/provider";
import { useNodeSurfaceTransfrom } from "../hooks/transform";
import { cmath } from "@/grida-canvas/cmath";
import { useGesture } from "@use-gesture/react";
import { cn } from "@/utils";

export function SurfacePathEditor({ node_id }: { node_id: string }) {
  const { surface_cursor_position, cursor_mode, content_offset } =
    useEventTarget();
  const { offset, points, selectedPoints } = useSurfacePathEditor();
  const transform = useNodeSurfaceTransfrom(node_id);

  const extension = selectedPoints.length === 1 && selectedPoints[0];

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
      {cursor_mode.type === "path" && typeof extension === "number" && (
        <Extension
          a={cmath.vector2.add(offset, points[extension], content_offset)}
          b={surface_cursor_position}
        />
      )}
    </div>
  );
}

function Extension({ a, b }: { a: cmath.Vector2; b: cmath.Vector2 }) {
  return (
    <>
      {/* cursor point */}
      <PathPoint point={b} style={{ cursor: "crosshair" }} />
      <Line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
    </>
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
    onKeyDown: (state) => {
      const { event } = state;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.stopPropagation();
        event.preventDefault();
        editor.onPointDelete(index);
      }
    },
  });

  return (
    <PathPoint {...bind()} tabIndex={index} selected={selected} point={point} />
  );
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
          position: "absolute",
          left: point[0],
          top: point[1],
          transform: "translate(-50%, -50%)",
          cursor: "pointer",
          touchAction: "none",
          ...style,
        }}
      />
    );
  }
);

function Line({
  x1,
  y1,
  x2,
  y2,
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  // Calculate the length and angle of the line
  const deltaX = x2 - x1;
  const deltaY = y2 - y1;
  const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

  return (
    <div
      {...props}
      className={cn("bg-workbench-accent-sky", className)}
      style={{
        ...style,
        position: "absolute",
        left: `${x1}px`,
        top: `${y1}px`,
        width: `${length}px`,
        height: 1,
        transform: `rotate(${angle}deg)`,
        transformOrigin: "0 50%", // Rotate around the left center
      }}
    />
  );
}
