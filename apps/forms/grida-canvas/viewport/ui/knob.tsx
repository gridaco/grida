import React from "react";
import { cn } from "@/utils";
import type { cmath } from "@/grida-canvas/cmath";
import { cursors } from "@/grida-canvas/components/cursor";

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

  // Map directions to their translation offsets
  const anchorTranslationMap: Record<
    cmath.CardinalDirection,
    { translateX: string; translateY: string }
  > = {
    nw: { translateX: "-50%", translateY: "-50%" },
    n: { translateX: "-50%", translateY: "-50%" },
    ne: { translateX: "-50%", translateY: "-50%" },
    e: { translateX: "-50%", translateY: "-50%" },
    se: { translateX: "-50%", translateY: "-50%" },
    s: { translateX: "-50%", translateY: "-50%" },
    sw: { translateX: "-50%", translateY: "-50%" },
    w: { translateX: "-50%", translateY: "-50%" },
  };

  // Get the correct position and translation for the current anchor
  const anchorPosition = anchorPositionMap[anchor];
  const anchorTranslation = anchorTranslationMap[anchor];

  return (
    <div
      {...props}
      ref={ref}
      data-layer-is-component-consumer={isComponentConsumer}
      className={cn(
        "border bg-white border-workbench-accent-sky data-[layer-is-component-consumer='true']:border-workbench-accent-violet absolute z-10 pointer-events-auto",
        className
      )}
      style={{
        top: anchorPosition.top,
        left: anchorPosition.left,
        transform: `translate(${anchorTranslation.translateX}, ${anchorTranslation.translateY})`,
        width: size,
        height: size,
        cursor: readonly ? "default" : cursors.resize_handle_cursor_map[anchor],
        touchAction: "none",
        zIndex: 11,
        ...transform,
      }}
    >
      {children}
    </div>
  );
});
