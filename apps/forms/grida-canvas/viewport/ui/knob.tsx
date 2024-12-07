import React from "react";
import { cn } from "@/utils";

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
    anchor: "nw" | "ne" | "sw" | "se";
    size?: number;
  },
  ref: React.Ref<HTMLDivElement>
) {
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
        top: anchor[0] === "n" ? 0 : "auto",
        bottom: anchor[0] === "s" ? 0 : "auto",
        left: anchor[1] === "w" ? 0 : "auto",
        right: anchor[1] === "e" ? 0 : "auto",
        width: size,
        height: size,
        transform: `translate(${anchor[1] === "w" ? "-50%" : "50%"}, ${anchor[0] === "n" ? "-50%" : "50%"})`,
        cursor: readonly ? "default" : __resize_handle_cursor_map[anchor],
        touchAction: "none",
        zIndex: 11,
      }}
    >
      {children}
    </div>
  );
});

const __resize_handle_cursor_map = {
  nw: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  se: "nwse-resize",
};
