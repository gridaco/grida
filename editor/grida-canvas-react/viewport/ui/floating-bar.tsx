import React from "react";
import { useSingleSelection } from "../surface-hooks";
import { cn } from "@/components/lib/utils";
import { FLOATING_BAR_Z_INDEX } from "../../ui-config";

interface BarProps {
  node_id: string;
  state: "idle" | "hover" | "active";
  isComponentConsumer?: boolean;
}

export function FloatingBar({
  className,
  children,
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
      style={{
        ...data?.style,
        zIndex: FLOATING_BAR_Z_INDEX,
      }}
    >
      {/* Title bar positioned above the parent using a percentage transform */}
      {/* No gap: -translate-y-full positions it flush with container top */}
      <div className="absolute left-0 right-0 -translate-y-full">
        <div {...porps} className={cn("max-w-full overflow-hidden", className)}>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Content wrapper that receives event bindings and grows with content.
 * This component has no padding/margin that creates gaps and grows naturally with text.
 * Width is constrained to fit-content but respects max-width for text truncation.
 */
export function FloatingBarContentWrapper({
  className,
  children,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn("pointer-events-auto w-fit max-w-full", className)}
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
        "w-full min-w-0 pointer-events-auto text-xs truncate text-muted-foreground/65 group-data-[state=hover]:text-workbench-accent-sky group-data-[state=active]:text-workbench-accent-sky group-data-[layer-is-component-consumer='true']:!text-workbench-accent-violet",
        className
      )}
    >
      {children}
    </div>
  );
}
