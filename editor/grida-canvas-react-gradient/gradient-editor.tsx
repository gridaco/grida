"use client";

import React from "react";
import { type GradientType, type GradientValue } from "./gradient-reducer";
import { type UseGradientReturn } from "./use-gradient";
import { cn } from "@/components/lib/utils";
import StopMarker from "./gradient-color-stop-marker";

// Helper function to convert RGBA8888 to CSS rgba string
const rgbaToString = (color: {
  r: number;
  g: number;
  b: number;
  a: number;
}) => {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
};

const STOP_SIZE = 18;

export interface GradientEditorProps {
  width?: number;
  height?: number;
  gradientType: GradientType;
  editor: UseGradientReturn;
}

export default function GradientEditor({
  width = 400,
  height = 300,
  gradientType,
  editor,
}: GradientEditorProps) {
  const { A, B, C } = editor.controlPoints;

  return (
    <div
      ref={editor.containerRef}
      className={`relative select-none z-10 ${
        editor.readonly ? "cursor-default" : "cursor-crosshair"
      }`}
      style={{
        width,
        height,
        overflow: "visible",
      }}
      onPointerDown={editor.handlePointerDown}
      onPointerMove={(e) => {
        // Only handle local pointer move if not dragging
        if (!editor.state.dragState.type) {
          editor.handlePointerMove(e);
        }
      }}
      onPointerUp={(e) => {
        // Only handle local pointer up if not dragging
        if (!editor.state.dragState.type) {
          editor.handlePointerUp(e);
        }
      }}
      onPointerLeave={editor.handlePointerLeave}
      data-popover-no-close
      role="application"
      aria-label="Gradient editor canvas"
      tabIndex={0}
    >
      {/* SVG Tracks */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={width}
        height={height}
      >
        <defs>
          <filter id="trackShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="2"
              floodColor="rgba(0,0,0,0.3)"
            />
          </filter>
        </defs>

        {/* A-B Track */}
        <line
          x1={A.x}
          y1={A.y}
          x2={B.x}
          y2={B.y}
          stroke="white"
          strokeWidth="3"
          opacity="0.8"
          // filter="url(#trackShadow)"
        />

        {/* Elliptical Track for radial and sweep */}
        {(gradientType === "radial" || gradientType === "sweep") &&
          (() => {
            const radiusX = Math.sqrt(
              Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2)
            );
            const radiusY = Math.sqrt(
              Math.pow(C.x - A.x, 2) + Math.pow(C.y - A.y, 2)
            );
            const rotationAngle =
              Math.atan2(B.y - A.y, B.x - A.x) * (180 / Math.PI);

            return (
              <ellipse
                cx={A.x}
                cy={A.y}
                rx={radiusX}
                ry={radiusY}
                fill="none"
                stroke="white"
                strokeWidth="3"
                opacity="0.6"
                transform={`rotate(${rotationAngle} ${A.x} ${A.y})`}
                filter="url(#trackShadow)"
              />
            );
          })()}
      </svg>

      {/* Control Points */}
      {/* A Point */}
      <ControlPoint
        x={A.x}
        y={A.y}
        selected={editor.focusedControl === "A"}
        readonly={editor.readonly}
        tabIndex={0}
        onFocus={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!editor.readonly) editor.setFocusedControl("A");
        }}
      />

      {/* B Point */}
      <ControlPoint
        x={B.x}
        y={B.y}
        selected={editor.focusedControl === "B"}
        readonly={editor.readonly}
        tabIndex={0}
        onFocus={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!editor.readonly) editor.setFocusedControl("B");
        }}
      />

      {/* C Point */}
      <ControlPoint
        x={C.x}
        y={C.y}
        selected={editor.focusedControl === "C"}
        readonly={editor.readonly}
        tabIndex={0}
        onFocus={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!editor.readonly) editor.setFocusedControl("C");
        }}
      />

      {/* Color Stop Markers */}
      {editor.stops.map((stop, index) => {
        const selected = editor.focusedStop === index;
        const { x, y, rotation } = editor.getStopMarkerTransform(stop.offset);
        return (
          <StopMarker
            key={index}
            x={x}
            y={y}
            transform={`translate(-50%, -50%) rotate(${rotation}deg)`}
            color={rgbaToString(stop.color)}
            selected={selected}
            readonly={editor.readonly}
            tabIndex={0}
            arrow={true}
            stopSize={STOP_SIZE}
            onFocus={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!editor.readonly) editor.setFocusedStop(index);
            }}
          />
        );
      })}

      {/* Hover Preview */}
      {editor.state.hoverPreview &&
        (() => {
          const previewTransform = editor.getStopMarkerTransform(
            editor.state.hoverPreview.position
          );
          return (
            <StopMarker
              x={previewTransform.x}
              y={previewTransform.y}
              transform={`translate(-50%, -50%) rotate(${previewTransform.rotation}deg)`}
              color={"gray"}
              selected={false}
              readonly
              stopSize={STOP_SIZE}
              className="opacity-60 pointer-events-none"
            />
          );
        })()}
    </div>
  );
}

function ControlPoint({
  x,
  y,
  selected,
  readonly,
  tabIndex,
  onFocus,
}: {
  x: number;
  y: number;
  readonly?: boolean;
  selected?: boolean;
  tabIndex?: number;
  onFocus?: React.FocusEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      className={`absolute w-2 h-2 bg-white border rounded-full transform -translate-x-1/2 -translate-y-1/2 shadow-lg ${
        selected ? "scale-105 ring-2 ring-white" : ""
      } ${readonly ? "cursor-default" : "cursor-move"}`}
      style={{ left: x, top: y }}
      role="button"
      aria-label="Control point"
      tabIndex={tabIndex}
      data-popover-no-close
      onFocus={onFocus}
    />
  );
}
