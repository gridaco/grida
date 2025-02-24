import React from "react";
import { useSingleSelection } from "../surface-hooks";
import { cn } from "@/utils";

interface BarProps {
  node_id: string;
  state: "idle" | "hover" | "active";
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
}

export function FloatingBar({
  className,
  children,
  side = "top",
  sideOffset = 4,
  state,
  ...porps
}: React.HtmlHTMLAttributes<HTMLDivElement> & BarProps) {
  const data = useSingleSelection(porps.node_id);

  return (
    <div
      className="group relative pointer-events-none"
      data-state={state}
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
        "max-w-full flex items-center gap-2 pointer-events-auto cursor-pointer rounded-lg py-1 px-2 truncate bg-background/80 group-data-[state=hover]:bg-accent group-data-[state=active]:bg-accent",
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
        "max-w-full w-min pointer-events-auto text-xs truncate text-muted-foreground/65 group-data-[state=hover]:text-workbench-accent-sky group-data-[state=active]:text-workbench-accent-sky",
        className
      )}
    >
      {children}
    </div>
  );
}
