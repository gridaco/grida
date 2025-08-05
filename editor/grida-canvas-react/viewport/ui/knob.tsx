import React from "react";
import { cn } from "@/components/lib/utils";
import type cmath from "@grida/cmath";
import { cursors } from "@/grida-canvas-react/components/cursor";
import { Point } from "./point";

export const Knob = React.forwardRef(function Knob(
  {
    readonly,
    isComponentConsumer,
    className,
    children,
    transform,
    zIndex,
    anchor,
    size = 8,
    ...props
  }: Omit<React.HTMLAttributes<HTMLDivElement>, "style"> & {
    readonly?: boolean;
    isComponentConsumer?: boolean;
    transform?: React.CSSProperties;
    zIndex?: number;
    anchor: cmath.CardinalDirection; // Supports 8 directions: "nw", "n", "ne", "e", "se", "s", "sw", "w"
    size?: number;
  },
  ref: React.Ref<HTMLDivElement>
) {
  // Map directions to their relative positions
  const anchorPositionMap: Record<
    cmath.CardinalDirection,
    { top: string; left: string }
  > = {
    nw: { top: "0", left: "0" },
    n: { top: "0", left: "50%" },
    ne: { top: "0", left: "100%" },
    e: { top: "50%", left: "100%" },
    se: { top: "100%", left: "100%" },
    s: { top: "100%", left: "50%" },
    sw: { top: "100%", left: "0" },
    w: { top: "50%", left: "0" },
  };

  // Get the correct position for the current anchor
  const anchorPosition = anchorPositionMap[anchor];

  return (
    <Point
      {...props}
      ref={ref}
      point={[0, 0]}
      size={size}
      shape="square"
      data-layer-is-component-consumer={isComponentConsumer}
      className={cn(
        "border bg-white border-workbench-accent-sky group-data-[layer-is-component-consumer='true']:border-workbench-accent-violet data-[layer-is-component-consumer='true']:border-workbench-accent-violet",
        className
      )}
      style={{
        top: anchorPosition.top,
        left: anchorPosition.left,
        cursor: readonly ? "default" : cursors.resize_handle_cursor_map[anchor],
        touchAction: "none",
        zIndex: zIndex ?? 11,
        ...transform,
      }}
    >
      {children}
    </Point>
  );
});
