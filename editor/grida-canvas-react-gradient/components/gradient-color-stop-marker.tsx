import React from "react";
import { cn } from "@/components/lib/utils";

export default function StopMarker({
  x,
  y,
  transform,
  color,
  selected,
  readonly,
  tabIndex,
  onFocus,
  onPointerDown,
  arrow = true,
  stopSize,
  className,
}: {
  x: number;
  y: number;
  transform: string;
  color: string;
  selected: boolean;
  readonly: boolean;
  tabIndex?: number;
  onFocus?: React.FocusEventHandler<HTMLDivElement>;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  arrow?: boolean;
  stopSize: number;
  className?: string;
}) {
  return (
    <div
      data-selected={selected}
      data-readonly={readonly}
      className={cn(
        `
        group/stop
        absolute focus:outline-none focus:ring-2 focus:ring-blue-500 
        data-[selected=true]:z-10
        data-[selected=false]:z-0
        data-[readonly=true]:cursor-default
        data-[readonly=false]:cursor-move
        `,
        className
      )}
      style={{
        left: x,
        top: y,
        width: stopSize,
        height: stopSize,
        transform,
      }}
      role="button"
      aria-label={`Color stop`}
      tabIndex={tabIndex}
      data-popover-no-close
      onFocus={onFocus}
      onPointerDown={onPointerDown}
    >
      {/* arrow */}
      {arrow && (
        <div
          className={`
            absolute left-1/2 transform -translate-x-1/2
            border-l-[5px] border-l-transparent
            border-r-[5px] border-r-transparent
            border-t-white border-t-[6px]
            group-data-[selected=true]/stop:border-t-yellow-400
            `}
          style={{
            top: stopSize - 2,
            width: 0,
            height: 0,
          }}
        />
      )}

      {/* fill */}
      <div
        className={`
          w-full h-full border-2 shadow-lg
          group-data-[selected=true]/stop:border-yellow-400 group-data-[selected=false]/stop:border-white
          `}
        style={{ backgroundColor: color }}
      >
        <div className="w-full h-full bg-gradient-to-br from-white/30 to-transparent" />
      </div>
    </div>
  );
}
