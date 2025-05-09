import React from "react";
import { cn } from "@/components/lib/utils";

export const LayerOverlay = React.forwardRef(function LayerOverlay(
  {
    readonly,
    isComponentConsumer,
    className,
    children,
    transform,
    zIndex,
    ...props
  }: Omit<React.HTMLAttributes<HTMLDivElement>, "style"> & {
    readonly?: boolean;
    isComponentConsumer?: boolean;
    transform?: React.CSSProperties;
    zIndex?: number;
  },
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <div
      {...props}
      ref={ref}
      data-readonly={readonly}
      data-layer-is-component-consumer={isComponentConsumer}
      className={cn(
        "group pointer-events-auto select-none border-[1.5px] data-[readonly='true']:border border-workbench-accent-sky data-[layer-is-component-consumer='true']:border-workbench-accent-violet",
        className
      )}
      style={{
        position: "absolute",
        zIndex: zIndex ? zIndex : readonly ? 1 : 2,
        touchAction: "none",
        willChange: "transform",
        ...transform,
        pointerEvents: readonly ? "none" : undefined,
      }}
    >
      {children}
    </div>
  );
});
