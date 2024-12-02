import { cn } from "@/utils";
import React from "react";

export function LayerOverlay({
  readonly,
  isComponentConsumer,
  className,
  children,
  transform,
}: React.PropsWithChildren<{
  readonly?: boolean;
  isComponentConsumer?: boolean;
  className?: string;
  transform?: React.CSSProperties;
}>) {
  return (
    <div
      data-layer-is-component-consumer={isComponentConsumer}
      className={cn(
        "relative group pointer-events-auto select-none border-2 border-workbench-accent-sky data-[layer-is-component-consumer='true']:border-workbench-accent-violet",
        className
      )}
      style={{
        position: "absolute",
        zIndex: readonly ? 1 : 2,
        touchAction: "none",
        willChange: "transform",
        ...transform,
      }}
    >
      {children}
    </div>
  );
}
