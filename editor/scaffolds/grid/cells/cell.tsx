"use clint";
import React from "react";
import { cn } from "@/components/lib/utils";

export interface DataGridCellRootProps {
  selected?: boolean;
  is_local_cursor?: boolean;
  color?: string;
}

export const CellRoot = React.forwardRef(function CellRoot(
  {
    selected,
    children,
    className,
    is_local_cursor,
    color,
    ...props
  }: React.HtmlHTMLAttributes<HTMLDivElement> & DataGridCellRootProps,
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative h-full w-full px-2 overflow-hidden text-ellipsis border border-border/25",
        className
      )}
      {...props}
    >
      <div
        data-selected={selected}
        data-cursor-type={is_local_cursor && "local"}
        className="absolute inset-0 pointer-events-none select-none border-0 data-[selected='true']:border-2 data-[cursor-type='local']:border-ring"
        style={color ? { borderColor: color } : undefined}
      />
      {children}
    </div>
  );
});
