import React from "react";
import { cn } from "@/components/lib/utils";
import type cmath from "@grida/cmath";

/**
 * UI control Point, with selectable shapes (circle, square, diamond) and extra hit region.
 */
export const Point = React.forwardRef(
  (
    {
      point,
      className,
      style,
      selected,
      hovered,
      size = 8,
      shape = "circle",
      ...props
    }: React.HtmlHTMLAttributes<HTMLDivElement> & {
      point: cmath.Vector2;
      selected?: boolean;
      hovered?: boolean;
      size?: number;
      shape?: "circle" | "diamond" | "square";
    },
    ref: React.Ref<HTMLDivElement>
  ) => {
    const { transform: styleTransform, ...restStyle } = style || {};
    // Ensure a minimum hit target size so points are easier to interact with
    const hitSize = Math.max(size, 16);

    return (
      <div
        ref={ref}
        {...props}
        data-selected={selected}
        data-hovered={hovered}
        style={
          {
            position: "absolute",
            left: point[0],
            top: point[1],
            width: hitSize,
            height: hitSize,
            outline: "none",
            touchAction: "none",
            transform: `translate(-50%, -50%)${styleTransform ? ` ${styleTransform}` : ""}`,
            ...restStyle,
          } as React.CSSProperties
        }
      >
        <div
          data-selected={selected}
          data-hovered={hovered}
          className={cn(
            "border border-workbench-accent-sky bg-background",
            shape === "circle" ? "rounded-full" : undefined,
            "data-[selected='true']:shadow-sm data-[selected='true']:bg-workbench-accent-sky data-[selected='true']:border-spacing-1.5 data-[selected='true']:border-background",
            "data-[hovered='true']:border-workbench-accent-sky/25",
            className
          )}
          style={{
            pointerEvents: "none",
            position: "absolute",
            left: "50%",
            top: "50%",
            width: size,
            height: size,
            transform: `translate(-50%, -50%)${shape === "diamond" ? " rotate(45deg)" : ""}`,
          }}
        />
      </div>
    );
  }
);

Point.displayName = "Point";
