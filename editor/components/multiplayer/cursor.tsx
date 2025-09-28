"use client";

import React from "react";
import { FakePointerCursorSVG } from "@/components/cursor/cursor-fake";

interface FakeForeignCursorProps {
  color: {
    fill: string;
    hue: string;
  };
  name: string;
  message?: string | null;
}

export function FakeCursorPosition({
  x,
  y,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  x: number;
  y: number;
}) {
  return (
    <div
      className="absolute top-0 left-0 pointer-events-none"
      style={{
        willChange: "transform",
        transform: `translate3d(${x}px, ${y}px, 0)`,
        zIndex: 999,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function FakeForeignCursor({
  color,
  name,
  message,
}: FakeForeignCursorProps) {
  return (
    <>
      {/* Pointer cursor */}
      <FakePointerCursorSVG
        fill={color.fill}
        hue={color.hue}
        className="absolute -top-3.5 -left-3.5 size-8"
      />

      {/* Label container */}
      {(name || message) && (
        <div
          className={`absolute top-3 left-3 text-white rounded shadow-sm font-normal border ${
            message
              ? "flex flex-col items-start px-2 py-1" // Multi-line layout with more padding
              : "px-1 py-px text-[11px]" // Single-line name layout
          }`}
          style={{
            backgroundColor: color.fill,
            borderColor: color.hue,
          }}
        >
          <span
            className="whitespace-nowrap text-[11px]"
            style={{ opacity: message ? 0.6 : 1 }}
          >
            {name}
          </span>
          {message && (
            <span className="whitespace-nowrap text-sm mt-0.5">{message}</span>
          )}
        </div>
      )}
    </>
  );
}
