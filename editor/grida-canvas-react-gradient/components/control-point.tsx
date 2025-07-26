import React from "react";

export interface ControlPointProps {
  x: number;
  y: number;
  readonly?: boolean;
  selected?: boolean;
  tabIndex?: number;
  onFocus?: React.FocusEventHandler<HTMLDivElement>;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
}

export default function ControlPoint({
  x,
  y,
  selected,
  readonly,
  tabIndex,
  onFocus,
  onPointerDown,
}: ControlPointProps) {
  return (
    <div
      className={`absolute size-3 bg-white border rounded-full transform -translate-x-1/2 -translate-y-1/2 shadow-sm ${
        selected ? "scale-105 ring-2" : ""
      } ${readonly ? "cursor-default" : "cursor-move"}`}
      style={{ left: x, top: y }}
      role="button"
      aria-label="Control point"
      tabIndex={tabIndex}
      data-popover-no-close
      onFocus={onFocus}
      onPointerDown={onPointerDown}
    />
  );
}
