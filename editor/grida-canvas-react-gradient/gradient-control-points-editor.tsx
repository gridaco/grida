"use client";

import React, { useRef, useCallback, useState, useReducer } from "react";
import {
  getControlPoints,
  getStopMarkerTransform,
  screenToGradientPosition,
  gradientPositionToScreen,
  controlPointsReducer,
  type GradientType,
  type ControlPoints,
} from "./gradient-reducer";
import type cg from "@grida/cg";
import kolor from "@grida/color";
import StopMarker from "./components/gradient-color-stop-marker";
import ControlPoint from "./components/control-point";

/**
 * GradientControlPointsEditor - A simplified gradient editor component
 *
 * This is a redesigned version of the original GradientEditor with a simpler API.
 * Instead of managing all state internally, it exposes individual fields and events,
 * allowing the parent component to manage the state.
 *
 * Responsibilities:
 * - Managing control points of the gradient (user figures out transform from onPointsChange)
 * - Managing position changes of color stops
 * - NOT responsible for color management of stops
 *
 * @example
 * ```tsx
 * <GradientControlPointsEditor
 *   stops={[
 *     { offset: 0, color: BLACK },
 *     { offset: 1, color: WHITE }
 *   ]}
 *   focusedStop={null}
 *   points={[
 *     { x: 0, y: 0.5 },
 *     { x: 1, y: 0.5 },
 *     { x: 0, y: 1 }
 *   ]}
 *   gradientType="linear"
 *   onPointsChange={(points) => {
 *     // Convert points to transform and update gradient
 *   }}
 *   onPositionChange={(index, position) => {
 *     // Update stop position at index
 *   }}
 *   onInsertStop={(at, position) => {
 *     // Insert new stop at position
 *   }}
 *   onDeleteStop={(index) => {
 *     // Delete stop at index
 *   }}
 *   onFocusedStopChange={(index) => {
 *     // Update focused stop
 *   }}
 * />
 * ```
 */
export interface GradientControlPointsEditorProps {
  /** Array of gradient stops with positions and colors */
  stops: { offset: number; color: cg.RGB888A32F }[];
  /** Index of currently focused stop (null if none) */
  focusedStop: number | null;
  /** Control points for gradient transform [A, B, C] - optional if using internal state */
  points?: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
  /** Initial control points for internal state management */
  initialPoints?: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
  /** Width of the editor canvas */
  width?: number;
  /** Height of the editor canvas */
  height?: number;
  /** Type of gradient (linear, radial, sweep) */
  gradientType: GradientType;
  /** Whether the editor is read-only */
  readonly?: boolean;
  /** Called when control points change */
  onPointsChange?: (
    points: [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ]
  ) => void;
  /** Called when a stop's position changes */
  onPositionChange?: (index: number, position: number) => void;
  /** Called when a new stop should be inserted */
  onInsertStop?: (at: number, position: number) => void;
  /** Called when the focused stop changes */
  onFocusedStopChange?: (index: number | null) => void;
}

const STOP_SIZE = 18;

export default function GradientControlPointsEditor({
  stops,
  focusedStop,
  points,
  initialPoints,
  width = 400,
  height = 300,
  gradientType,
  readonly = false,
  onPointsChange,
  onPositionChange,
  onInsertStop,
  onFocusedStopChange,
}: GradientControlPointsEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Internal control points state using controlPointsReducer
  const [internalControlPoints, dispatchControlPoints] = useReducer(
    controlPointsReducer,
    initialPoints
      ? { A: initialPoints[0], B: initialPoints[1], C: initialPoints[2] }
      : {
          A: { x: 0.1, y: 0.1 },
          B: { x: 0.9, y: 0.9 },
          C: { x: 0.5, y: 0.5 },
        }
  );

  // Use external points if provided, otherwise use internal state
  const controlPoints = points
    ? { A: points[0], B: points[1], C: points[2] }
    : internalControlPoints;

  // Local state for dragging control points only
  const [drag, setDrag] = useState<null | {
    type: "A" | "B" | "C";
    start: { x: number; y: number };
    origin: { x: number; y: number };
  }>(null);

  // Local state for stop dragging
  const [stopDrag, setStopDrag] = useState<number | null>(null);

  // Local state for hover preview
  const [hoverPreview, setHoverPreview] = useState<{
    position: number;
    x: number;
    y: number;
    rotation: number;
  } | null>(null);

  // Calculate control points for rendering
  const renderedControlPoints = getControlPoints(controlPoints, width, height);
  const { A, B, C } = renderedControlPoints;

  // Handle pointer down for control points
  const handleControlPointerDown = useCallback(
    (type: "A" | "B" | "C", e: React.PointerEvent) => {
      if (readonly) return;
      e.preventDefault();
      e.stopPropagation();
      setDrag({
        type,
        start: { x: e.clientX, y: e.clientY },
        origin: { ...controlPoints[type] },
      });
      // Focus the control point
      onFocusedStopChange?.(null);
    },
    [readonly, controlPoints, onFocusedStopChange]
  );

  // Handle pointer up to end dragging
  const handlePointerUp = useCallback(
    (e?: React.PointerEvent | PointerEvent) => {
      if (drag) {
        setDrag(null);
      }
    },
    [drag]
  );

  // Handle pointer move for hover preview and control point dragging
  const handlePointerMove = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      if (drag) {
        // Handle control point dragging
        e.preventDefault();
        e.stopPropagation();
        const dx = (e.clientX - drag.start.x) / width;
        const dy = (e.clientY - drag.start.y) / height;
        const idx = "ABC".indexOf(drag.type);
        if (points) {
          // External state management
          const newPoints: [
            { x: number; y: number },
            { x: number; y: number },
            { x: number; y: number },
          ] = [{ ...points[0] }, { ...points[1] }, { ...points[2] }];
          newPoints[idx] = {
            x: drag.origin.x + dx,
            y: drag.origin.y + dy,
          };
          onPointsChange?.(newPoints);
        } else {
          // Internal state management using controlPointsReducer
          dispatchControlPoints({
            type: "UPDATE_CONTROL_POINT",
            payload: {
              point: drag.type,
              deltaX: dx,
              deltaY: dy,
              width,
              height,
              gradientType,
            },
          });
        }
      } else if (!readonly && stopDrag === null) {
        // Handle hover preview (only when not dragging a stop)
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        // Calculate coordinates relative to container
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if hovering over control points with improved hit detection
        const relativeControlHoverSize = Math.min(width, height) * 0.0375; // 3.75% of smaller dimension
        const hitControl = [A, B, C].some(
          (pt) => Math.hypot(pt.x - x, pt.y - y) < relativeControlHoverSize
        );

        // Check if hovering over stop markers with improved hit detection
        const relativeStopHoverSize = STOP_SIZE / 2 + 10; // Fixed stop hover size
        const hitStop = stops.some((stop) => {
          const { x: sx, y: sy } = getStopMarkerTransform(
            stop.offset,
            gradientType,
            controlPoints,
            width,
            height
          );
          return Math.hypot(sx - x, sy - y) < relativeStopHoverSize;
        });

        if (!hitControl && !hitStop) {
          // Use improved hit detection like the original component
          const gradientPos = screenToGradientPosition(
            x,
            y,
            gradientType,
            controlPoints,
            width,
            height
          );
          const trackPos = gradientPositionToScreen(
            gradientPos,
            gradientType,
            controlPoints,
            width,
            height
          );
          const trackDist = Math.hypot(x - trackPos.x, y - trackPos.y);

          // Use a larger hit area for elliptical tracks (sweep only)
          const relativeTrackHitThreshold =
            gradientType === "sweep"
              ? Math.min(width, height) * 0.05 // 5% for sweep
              : Math.min(width, height) * 0.0375; // 3.75% for linear/radial

          if (
            trackDist < relativeTrackHitThreshold &&
            gradientPos >= 0 &&
            gradientPos <= 1
          ) {
            const {
              x: px,
              y: py,
              rotation,
            } = getStopMarkerTransform(
              gradientPos,
              gradientType,
              controlPoints,
              width,
              height
            );
            setHoverPreview({
              position: gradientPos,
              x: px,
              y: py,
              rotation,
            });
          } else {
            setHoverPreview(null);
          }
        } else {
          setHoverPreview(null);
        }
      }
    },
    [
      drag,
      stopDrag,
      points,
      controlPoints,
      width,
      height,
      onPointsChange,
      readonly,
      stops,
      A,
      B,
      C,
      gradientType,
    ]
  );

  // Set up global pointer event listeners for dragging and hover preview
  React.useEffect(() => {
    if (readonly) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (drag) {
        // Handle control point dragging
        handlePointerMove(e);
      } else if (!stopDrag) {
        // Handle hover preview outside bounds
        handlePointerMove(e);
      }
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (drag) {
        handlePointerUp(e);
      }
    };

    // Always set up global events for hover preview, and for drag when needed
    window.addEventListener("pointermove", handleGlobalPointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handleGlobalPointerUp, {
      passive: false,
    });

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, [drag, stopDrag, readonly, handlePointerMove, handlePointerUp]);

  // Handle pointer leave to clear hover preview
  const handlePointerLeave = useCallback(() => {
    // Do NOT cancel drag here! Only clear hover preview.
    setHoverPreview(null);
  }, []);

  // Handle pointer down for the main canvas (for inserting stops)
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readonly) return;

      // Prevent popover from closing when clicking on canvas
      e.preventDefault();
      e.stopPropagation();

      // Only insert stop if not clicking on a control point or stop marker
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if click is on a stop marker or control point
      // (very basic hit test, can be improved)
      const hitControl = [A, B, C].some(
        (pt) => Math.hypot(pt.x - x, pt.y - y) < 16
      );
      const hitStop = stops.some((stop) => {
        const { x: sx, y: sy } = getStopMarkerTransform(
          stop.offset,
          gradientType,
          controlPoints,
          width,
          height
        );
        return Math.hypot(sx - x, sy - y) < STOP_SIZE;
      });
      if (!hitControl && !hitStop && onInsertStop) {
        // Calculate the gradient position for the click using the same function as preview
        const gradientPos = screenToGradientPosition(
          x,
          y,
          gradientType,
          controlPoints,
          width,
          height
        );

        // Clamp to [0, 1] range
        const clamped = Math.max(0, Math.min(1, gradientPos));

        // Find where to insert
        let insertAt = stops.findIndex((s) => s.offset > clamped);
        if (insertAt === -1) insertAt = stops.length;
        onInsertStop(insertAt, clamped);
      }
    },
    [
      readonly,
      stops,
      onInsertStop,
      A,
      B,
      C,
      controlPoints,
      width,
      height,
      gradientType,
    ]
  );

  // Handle dragging stop markers (position change)
  const handleStopPointerDown = useCallback(
    (index: number, e: React.PointerEvent<HTMLDivElement>) => {
      if (readonly) return;
      e.preventDefault();
      e.stopPropagation();
      // Focus the stop
      onFocusedStopChange?.(index);
      // Set stop drag state to prevent preview
      setStopDrag(index);

      // Calculate drag offset like the original implementation
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const currentPosition = stops[index].offset;
      const markerTransform = getStopMarkerTransform(
        currentPosition,
        gradientType,
        controlPoints,
        width,
        height
      );
      const dragOffset = { x: x - markerTransform.x, y: y - markerTransform.y };

      const move = (ev: PointerEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        const adjustedX = ev.clientX - rect.left - dragOffset.x;
        const adjustedY = ev.clientY - rect.top - dragOffset.y;
        const newPosition = screenToGradientPosition(
          adjustedX,
          adjustedY,
          gradientType,
          controlPoints,
          width,
          height
        );
        // Clamp position to [0, 1]
        const clampedPosition = Math.max(0, Math.min(1, newPosition));
        onPositionChange?.(index, clampedPosition);
      };
      const up = (ev: PointerEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        setStopDrag(null); // Clear stop drag state
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up, { passive: false });
    },
    [
      readonly,
      stops,
      onPositionChange,
      onFocusedStopChange,
      width,
      height,
      gradientType,
      controlPoints,
    ]
  );

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-visible z-10 ${readonly ? "cursor-default" : "cursor-crosshair"}`}
      style={{ width, height }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={drag ? undefined : handlePointerMove}
      onPointerUp={drag ? undefined : handlePointerUp}
      onPointerLeave={handlePointerLeave}
      data-popover-no-close
      role="application"
      aria-label="Gradient editor canvas"
      tabIndex={0}
    >
      {/* SVG Tracks */}
      <svg
        className="absolute inset-0 pointer-events-none overflow-visible"
        width={width}
        height={height}
      >
        <defs>
          <filter
            id="trackShadow"
            x={-(typeof window !== "undefined" ? window.innerWidth : width)}
            y={-(typeof window !== "undefined" ? window.innerHeight : height)}
            width={
              (typeof window !== "undefined" ? window.innerWidth : width) * 2
            }
            height={
              (typeof window !== "undefined" ? window.innerHeight : height) * 2
            }
            filterUnits="userSpaceOnUse"
          >
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
          filter="url(#trackShadow)"
        />
        {/* Elliptical Track for radial and sweep */}
        {(gradientType === "radial" || gradientType === "sweep") &&
          (() => {
            const radiusX = Math.sqrt((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
            const radiusY = Math.sqrt((C.x - A.x) ** 2 + (C.y - A.y) ** 2);
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
      <ControlPoint
        x={A.x}
        y={A.y}
        selected={false}
        readonly={readonly}
        tabIndex={0}
        onPointerDown={(e) => handleControlPointerDown("A", e)}
      />
      <ControlPoint
        x={B.x}
        y={B.y}
        selected={false}
        readonly={readonly}
        tabIndex={0}
        onPointerDown={(e) => handleControlPointerDown("B", e)}
      />
      {(gradientType === "radial" || gradientType === "sweep") && (
        <ControlPoint
          x={C.x}
          y={C.y}
          selected={false}
          readonly={readonly}
          tabIndex={0}
          onPointerDown={(e) => handleControlPointerDown("C", e)}
        />
      )}
      {/* Color Stop Markers */}
      {stops.map((stop, index) => {
        const { x, y, rotation } = getStopMarkerTransform(
          stop.offset,
          gradientType,
          controlPoints,
          width,
          height
        );
        return (
          <StopMarker
            key={index}
            x={x}
            y={y}
            transform={`translate(-50%, -50%) rotate(${rotation}deg)`}
            color={kolor.colorformats.RGB888A32F.intoCSSRGBA(stop.color)}
            selected={focusedStop === index}
            readonly={readonly}
            tabIndex={0}
            arrow={true}
            stopSize={STOP_SIZE}
            onFocus={() => onFocusedStopChange?.(index)}
            onPointerDown={(e: React.PointerEvent<HTMLDivElement>) =>
              handleStopPointerDown(index, e)
            }
          />
        );
      })}

      {/* Hover Preview */}
      {hoverPreview && (
        <StopMarker
          x={hoverPreview.x}
          y={hoverPreview.y}
          transform={`translate(-50%, -50%) rotate(${hoverPreview.rotation}deg)`}
          color="gray"
          selected={false}
          readonly={true}
          stopSize={STOP_SIZE}
          className="opacity-60 pointer-events-none"
        />
      )}
    </div>
  );
}
