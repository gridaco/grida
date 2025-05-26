import React from "react";
import { useSingleSelection } from "../surface-hooks";
import { cn } from "@/components/lib/utils";

interface BarProps {
  node_id: string;
  state: "idle" | "hover" | "active";
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
  isComponentConsumer?: boolean;
}

export function FloatingBar({
  className,
  children,
  side = "top",
  sideOffset = 4,
  state,
  isComponentConsumer,
  ...porps
}: React.HtmlHTMLAttributes<HTMLDivElement> & BarProps) {
  const data = useSingleSelection(porps.node_id);

  return (
    <div
      className="group relative pointer-events-none"
      data-state={state}
      data-layer-is-component-consumer={isComponentConsumer}
      style={data?.style}
    >
      {/* Title bar positioned above the parent using a percentage transform */}
      <div
        className="absolute left-0 right-0"
        style={{ transform: `translateY(calc(-100% - ${sideOffset}px))` }}
      >
        <div {...porps} className={cn("max-w-full overflow-hidden", className)}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function FloatingBarContent({
  className,
  children,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "max-w-full flex items-center gap-2 pointer-events-auto cursor-pointer rounded-lg py-2 px-2.5 truncate bg-background/80 group-data-[state=hover]:bg-accent group-data-[state=active]:bg-accent group-data-[layer-is-component-consumer='true']:!bg-workbench-accent-violet/50",
        className
      )}
    >
      {children}
    </div>
  );
}

export function FloatingBarTitle({
  className,
  children,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "max-w-full w-min pointer-events-auto text-xs truncate text-muted-foreground/65 group-data-[state=hover]:text-workbench-accent-sky group-data-[state=active]:text-workbench-accent-sky group-data-[layer-is-component-consumer='true']:!text-workbench-accent-violet",
        className
      )}
    >
      {children}
    </div>
  );
}
