"use clint";
import React from "react";
import { cn } from "@/utils/cn";

export const CellRoot = React.forwardRef(function CellRoot(
  {
    selected,
    children,
    className,
    is_local_cursor,
    ...props
  }: React.HtmlHTMLAttributes<HTMLDivElement> & {
    selected?: boolean;
    is_local_cursor?: boolean;
  },
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative h-full w-full px-2 overflow-hidden text-ellipsis",
        className
      )}
      {...props}
    >
      <div
        data-selected={selected}
        data-cursor-type={is_local_cursor ? "local" : "foreign"}
        className="absolute inset-0 pointer-events-none select-none border border-border/25 data-[selected='true']:border-2 data-[cursor-type='local']:border-ring"
      />
      {children}
    </div>
  );
});
