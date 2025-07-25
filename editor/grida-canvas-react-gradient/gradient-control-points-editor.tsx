"use client";

import React from "react";
import type cg from "@grida/cg";
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

export interface GradientControlPointsEditorProps {
  width?: number;
  height?: number;
  gradientType: "linear" | "radial" | "sweep";
  
  // New clean props design
  stops: { offset: number; color: cg.RGBA8888 }[];
  focusedStop: number | null;
  points: [Point, Point, Point]; // [A, B, C]
  
  // Event handlers
  onPointsChange?: (points: [Point, Point, Point]) => void;
  onPositionChange?: (index: number, position: number) => void;
  onInsertStop?: (at: number, position: number) => void;
  onDeleteStop?: (index: number) => void;
  onFocusedStopChange?: (index: number | null) => void;
  
  // Optional props
  readonly?: boolean;
  className?: string;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * A clean gradient control points editor that only handles the control points.
 * Uses vanilla React data-event model without complex state management.
 */
export default function GradientControlPointsEditor({
  width = 400,
  height = 300,
  gradientType,
  stops,
  focusedStop,
  points,
  onPointsChange,
  onPositionChange,
  onInsertStop,
  onDeleteStop,
  onFocusedStopChange,
  readonly = false,
  className,
}: GradientControlPointsEditorProps) {
  const [A, B, C] = points;
  
  // Convert relative points to screen coordinates
  const screenPoints = {
    A: { x: A.x * width, y: A.y * height },
    B: { x: B.x * width, y: B.y * height },
    C: { x: C.x * width, y: C.y * height },
  };

  const [dragState, setDragState] = React.useState<{
    type: "stop" | "A" | "B" | "C" | null;
    index?: number;
    offset?: { x: number; y: number };
  }>({ type: null });

  const containerRef = React.useRef<HTMLDivElement>(null);

  // Handle pointer down for starting drag operations
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    if (readonly) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if clicking on a control point (with some tolerance)
    const tolerance = 10;
    
    // Check control points
    for (const [pointName, point] of Object.entries(screenPoints)) {
      const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
      if (distance <= tolerance) {
        setDragState({
          type: pointName as "A" | "B" | "C",
          offset: { x: x - point.x, y: y - point.y }
        });
        return;
      }
    }
    
    // Check if clicking on a stop marker
    for (let i = 0; i < stops.length; i++) {
      const stopTransform = getStopMarkerTransform(stops[i].offset);
      const distance = Math.sqrt(Math.pow(x - stopTransform.x, 2) + Math.pow(y - stopTransform.y, 2));
      if (distance <= tolerance) {
        setDragState({
          type: "stop",
          index: i,
          offset: { x: x - stopTransform.x, y: y - stopTransform.y }
        });
        onFocusedStopChange?.(i);
        return;
      }
    }
    
    // Check if clicking on the gradient line to add a new stop
    if (gradientType === "linear") {
      const lineDistance = distanceToLine(x, y, screenPoints.A, screenPoints.B);
      if (lineDistance <= 10) {
        const position = getPositionOnLine(x, y, screenPoints.A, screenPoints.B);
        if (position >= 0 && position <= 1) {
          onInsertStop?.(stops.length, position);
        }
      }
    }
  }, [readonly, stops, screenPoints, gradientType, onInsertStop, onFocusedStopChange]);

  // Handle pointer move for drag operations
  React.useEffect(() => {
    if (!dragState.type) return;
    
    const handlePointerMove = (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = e.clientX - rect.left - (dragState.offset?.x || 0);
      const y = e.clientY - rect.top - (dragState.offset?.y || 0);
      
      if (dragState.type === "stop" && dragState.index !== undefined) {
        // Move stop along the gradient line
        const newPosition = getPositionOnLine(x, y, screenPoints.A, screenPoints.B);
        const clampedPosition = Math.max(0, Math.min(1, newPosition));
        onPositionChange?.(dragState.index, clampedPosition);
      } else if (dragState.type === "A" || dragState.type === "B" || dragState.type === "C") {
        // Move control point
        const newPoints = [...points] as [Point, Point, Point];
        const pointIndex = dragState.type === "A" ? 0 : dragState.type === "B" ? 1 : 2;
        newPoints[pointIndex] = {
          x: Math.max(0, Math.min(1, x / width)),
          y: Math.max(0, Math.min(1, y / height))
        };
        onPointsChange?.(newPoints);
      }
    };
    
    const handlePointerUp = () => {
      setDragState({ type: null });
    };
    
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, points, screenPoints, width, height, onPointsChange, onPositionChange]);

  // Handle keyboard events for focused stops
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (readonly || focusedStop === null) return;
    
    if (e.key === "Delete" || e.key === "Backspace") {
      if (stops.length > 2) { // Ensure at least 2 stops remain
        onDeleteStop?.(focusedStop);
        e.preventDefault();
      }
    }
  }, [readonly, focusedStop, stops.length, onDeleteStop]);

  // Get stop marker transform
  const getStopMarkerTransform = React.useCallback((position: number) => {
    if (gradientType === "linear") {
      const x = screenPoints.A.x + (screenPoints.B.x - screenPoints.A.x) * position;
      const y = screenPoints.A.y + (screenPoints.B.y - screenPoints.A.y) * position;
      const rotation = Math.atan2(screenPoints.B.y - screenPoints.A.y, screenPoints.B.x - screenPoints.A.x) * 180 / Math.PI;
      return { x, y, rotation };
    } else {
      // For radial and sweep, position stops on the ellipse
      const angle = position * 2 * Math.PI;
      const radiusX = Math.sqrt(Math.pow(screenPoints.B.x - screenPoints.A.x, 2) + Math.pow(screenPoints.B.y - screenPoints.A.y, 2));
      const radiusY = Math.sqrt(Math.pow(screenPoints.C.x - screenPoints.A.x, 2) + Math.pow(screenPoints.C.y - screenPoints.A.y, 2));
      const rotationAngle = Math.atan2(screenPoints.B.y - screenPoints.A.y, screenPoints.B.x - screenPoints.A.x);
      
      const x = screenPoints.A.x + radiusX * Math.cos(angle + rotationAngle);
      const y = screenPoints.A.y + radiusX * Math.sin(angle + rotationAngle);
      const rotation = (angle + rotationAngle) * 180 / Math.PI;
      return { x, y, rotation };
    }
  }, [gradientType, screenPoints]);

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-visible z-10 ${
        readonly ? "cursor-default" : "cursor-crosshair"
      } ${className || ""}`}
      style={{
        width,
        height,
      }}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      data-popover-no-close
      role="application"
      aria-label="Gradient control points editor"
      tabIndex={0}
    >
      {/* SVG Tracks */}
      <svg
        className="absolute inset-0 pointer-events-none overflow-visible"
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
          x1={screenPoints.A.x}
          y1={screenPoints.A.y}
          x2={screenPoints.B.x}
          y2={screenPoints.B.y}
          stroke="white"
          strokeWidth="3"
          opacity="0.8"
        />

        {/* Elliptical Track for radial and sweep */}
        {(gradientType === "radial" || gradientType === "sweep") &&
          (() => {
            const radiusX = Math.sqrt(
              Math.pow(screenPoints.B.x - screenPoints.A.x, 2) + Math.pow(screenPoints.B.y - screenPoints.A.y, 2)
            );
            const radiusY = Math.sqrt(
              Math.pow(screenPoints.C.x - screenPoints.A.x, 2) + Math.pow(screenPoints.C.y - screenPoints.A.y, 2)
            );
            const rotationAngle =
              Math.atan2(screenPoints.B.y - screenPoints.A.y, screenPoints.B.x - screenPoints.A.x) * (180 / Math.PI);

            return (
              <ellipse
                cx={screenPoints.A.x}
                cy={screenPoints.A.y}
                rx={radiusX}
                ry={radiusY}
                fill="none"
                stroke="white"
                strokeWidth="3"
                opacity="0.6"
                transform={`rotate(${rotationAngle} ${screenPoints.A.x} ${screenPoints.A.y})`}
                filter="url(#trackShadow)"
              />
            );
          })()}
      </svg>

      {/* Control Points */}
      <ControlPoint
        x={screenPoints.A.x}
        y={screenPoints.A.y}
        selected={false}
        readonly={readonly}
        tabIndex={0}
        onFocus={() => {}}
      />

      <ControlPoint
        x={screenPoints.B.x}
        y={screenPoints.B.y}
        selected={false}
        readonly={readonly}
        tabIndex={0}
        onFocus={() => {}}
      />

      {/* C Point (radial/sweep only) */}
      {(gradientType === "radial" || gradientType === "sweep") && (
        <ControlPoint
          x={screenPoints.C.x}
          y={screenPoints.C.y}
          selected={false}
          readonly={readonly}
          tabIndex={0}
          onFocus={() => {}}
        />
      )}

      {/* Color Stop Markers */}
      {stops.map((stop, index) => {
        const selected = focusedStop === index;
        const { x, y, rotation } = getStopMarkerTransform(stop.offset);
        return (
          <StopMarker
            key={index}
            x={x}
            y={y}
            transform={`translate(-50%, -50%) rotate(${rotation}deg)`}
            color={rgbaToString(stop.color)}
            selected={selected}
            readonly={readonly}
            tabIndex={0}
            arrow={true}
            stopSize={STOP_SIZE}
            onFocus={() => {
              if (!readonly) onFocusedStopChange?.(index);
            }}
          />
        );
      })}
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

// Utility functions
function distanceToLine(px: number, py: number, p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return Math.sqrt((px - p1.x) ** 2 + (py - p1.y) ** 2);
  
  const t = Math.max(0, Math.min(1, ((px - p1.x) * dx + (py - p1.y) * dy) / (length * length)));
  const projection = {
    x: p1.x + t * dx,
    y: p1.y + t * dy,
  };
  
  return Math.sqrt((px - projection.x) ** 2 + (py - projection.y) ** 2);
}

function getPositionOnLine(px: number, py: number, p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return 0;
  
  return Math.max(0, Math.min(1, ((px - p1.x) * dx + (py - p1.y) * dy) / (length * length)));
}