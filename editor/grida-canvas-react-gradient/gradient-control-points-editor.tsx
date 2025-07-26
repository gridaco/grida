"use client";

import React, { useCallback, useRef, useReducer, useEffect } from "react";
import {
  gradientReducer,
  createInitialState,
  type GradientState,
  type GradientType,
  getControlPoints,
  getStopMarkerTransform,
} from "./gradient-reducer";
import type cg from "@grida/cg";
import StopMarker from "./gradient-color-stop-marker";

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
 *     { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
 *     { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } }
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
  stops: { offset: number; color: cg.RGBA8888 }[];
  /** Index of currently focused stop (null if none) */
  focusedStop: number | null;
  /** Control points for gradient transform [A, B, C] */
  points: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number }
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
  onPointsChange?: (points: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number }
  ]) => void;
  /** Called when a stop's position changes */
  onPositionChange?: (index: number, position: number) => void;
  /** Called when a new stop should be inserted */
  onInsertStop?: (at: number, position: number) => void;
  /** Called when a stop should be deleted */
  onDeleteStop?: (index: number) => void;
  /** Called when the focused stop changes */
  onFocusedStopChange?: (index: number | null) => void;
}

const STOP_SIZE = 18;

export default function GradientControlPointsEditor({
  stops,
  focusedStop,
  points,
  width = 400,
  height = 300,
  gradientType,
  readonly = false,
  onPointsChange,
  onPositionChange,
  onInsertStop,
  onDeleteStop,
  onFocusedStopChange,
}: GradientControlPointsEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Initialize internal state with external values
  const [state, dispatch] = useReducer(gradientReducer, {
    ...createInitialState(gradientType),
    controlPoints: {
      A: points[0],
      B: points[1],
      C: points[2],
    },
    positions: stops.map(stop => stop.offset),
    colors: stops.map(stop => stop.color),
    focusedStop,
  });

  // Update internal state when props change
  useEffect(() => {
    dispatch({
      type: "SET_CONTROL_POINTS",
      payload: {
        A: points[0],
        B: points[1],
        C: points[2],
      },
    });
  }, [points]);

  useEffect(() => {
    dispatch({
      type: "SET_POSITIONS",
      payload: stops.map(stop => stop.offset),
    });
  }, [stops]);

  useEffect(() => {
    dispatch({
      type: "SET_COLORS",
      payload: stops.map(stop => stop.color),
    });
  }, [stops]);

  useEffect(() => {
    dispatch({
      type: "SET_FOCUSED_STOP",
      payload: focusedStop,
    });
  }, [focusedStop]);

  // Calculate control points for rendering
  const controlPoints = getControlPoints(state.controlPoints, width, height);

  // Helper function to convert RGBA8888 to CSS rgba string
  const rgbaToString = (color: cg.RGBA8888) => {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
  };

  // Handle pointer events
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (readonly || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      dispatch({
        type: "HANDLE_POINTER_DOWN",
        payload: { x, y, width, height, gradientType },
      });
    },
    [readonly, width, height, gradientType]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (readonly || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      dispatch({
        type: "HANDLE_POINTER_MOVE",
        payload: { x, y, width, height, gradientType },
      });
    },
    [readonly, width, height, gradientType]
  );

  const handlePointerUp = useCallback(
    (e?: React.MouseEvent | PointerEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      if (readonly) return;
      dispatch({ type: "HANDLE_POINTER_UP" });
    },
    [readonly]
  );

  const handlePointerLeave = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      if (readonly) return;
      dispatch({ type: "HANDLE_POINTER_LEAVE" });
    },
    [readonly]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (readonly) return;
      
      if ((e.key === "Delete" || e.key === "Backspace") && state.focusedStop !== null) {
        e.preventDefault();
        e.stopPropagation();
        if (stops.length > 2) { // Don't allow deleting if only 2 stops remain
          onDeleteStop?.(state.focusedStop);
        }
      }
    },
    [readonly, state.focusedStop, stops.length, onDeleteStop]
  );

  // Set up global pointer event listeners for dragging
  useEffect(() => {
    if (readonly) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (state.dragState.type) {
        handlePointerMove(e);
      }
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (state.dragState.type) {
        handlePointerUp(e);
      }
    };

    if (state.dragState.type) {
      window.addEventListener("pointermove", handleGlobalPointerMove, {
        passive: false,
      });
      window.addEventListener("pointerup", handleGlobalPointerUp, {
        passive: false,
      });
    }

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, [state.dragState.type, readonly, handlePointerMove, handlePointerUp]);

  // Notify parent of control point changes
  useEffect(() => {
    const currentPoints: [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number }
    ] = [state.controlPoints.A, state.controlPoints.B, state.controlPoints.C];
    
    // Only notify if points actually changed to avoid infinite loops
    if (
      currentPoints[0].x !== points[0].x ||
      currentPoints[0].y !== points[0].y ||
      currentPoints[1].x !== points[1].x ||
      currentPoints[1].y !== points[1].y ||
      currentPoints[2].x !== points[2].x ||
      currentPoints[2].y !== points[2].y
    ) {
      onPointsChange?.(currentPoints);
    }
  }, [state.controlPoints, onPointsChange, points]);

  // Notify parent of position changes and new stops
  useEffect(() => {
    const currentPositions = state.positions;
    const propPositions = stops.map(stop => stop.offset);
    
    // Check if a new stop was added
    if (currentPositions.length > propPositions.length) {
      // Find the new position that was added
      const newPositions = currentPositions.filter(
        pos => !propPositions.some(propPos => Math.abs(propPos - pos) < 0.001)
      );
      if (newPositions.length > 0) {
        // Find the insertion index
        const newPosition = newPositions[0];
        const insertionIndex = currentPositions.indexOf(newPosition);
        onInsertStop?.(insertionIndex, newPosition);
        return;
      }
    }
    
    // Check if positions changed (without length change)
    if (JSON.stringify(currentPositions) !== JSON.stringify(propPositions)) {
      // Find which position changed and notify
      currentPositions.forEach((position, index) => {
        if (propPositions[index] !== undefined && propPositions[index] !== position) {
          onPositionChange?.(index, position);
        }
      });
    }
  }, [state.positions, stops, onPositionChange, onInsertStop]);

  // Notify parent of focused stop changes
  useEffect(() => {
    if (state.focusedStop !== focusedStop) {
      onFocusedStopChange?.(state.focusedStop);
    }
  }, [state.focusedStop, focusedStop, onFocusedStopChange]);

  const setFocusedStop = useCallback((index: number | null) => {
    dispatch({ type: "SET_FOCUSED_STOP", payload: index });
  }, []);

  const setFocusedControl = useCallback((control: "A" | "B" | "C" | null) => {
    dispatch({ type: "SET_FOCUSED_CONTROL", payload: control });
  }, []);

  const getStopMarkerTransformUtil = useCallback(
    (position: number) => {
      return getStopMarkerTransform(
        position,
        gradientType,
        state.controlPoints,
        width,
        height
      );
    },
    [gradientType, state.controlPoints, width, height]
  );

  const { A, B, C } = controlPoints;

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-visible z-10 ${
        readonly ? "cursor-default" : "cursor-crosshair"
      }`}
      style={{
        width,
        height,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={(e) => {
        // Only handle local pointer move if not dragging
        if (!state.dragState.type) {
          handlePointerMove(e);
        }
      }}
      onPointerUp={(e) => {
        // Only handle local pointer up if not dragging
        if (!state.dragState.type) {
          handlePointerUp(e);
        }
      }}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
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
        selected={state.focusedControl === "A"}
        readonly={readonly}
        tabIndex={0}
        onFocus={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!readonly) setFocusedControl("A");
        }}
      />

      {/* B Point */}
      <ControlPoint
        x={B.x}
        y={B.y}
        selected={state.focusedControl === "B"}
        readonly={readonly}
        tabIndex={0}
        onFocus={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!readonly) setFocusedControl("B");
        }}
      />

      {/* C Point (radial/sweep only) */}
      {(gradientType === "radial" || gradientType === "sweep") && (
        <ControlPoint
          x={C.x}
          y={C.y}
          selected={state.focusedControl === "C"}
          readonly={readonly}
          tabIndex={0}
          onFocus={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!readonly) setFocusedControl("C");
          }}
        />
      )}

      {/* Color Stop Markers */}
      {stops.map((stop, index) => {
        const selected = state.focusedStop === index;
        const { x, y, rotation } = getStopMarkerTransformUtil(stop.offset);
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
            onFocus={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!readonly) setFocusedStop(index);
            }}
          />
        );
      })}

      {/* Hover Preview */}
      {state.hoverPreview &&
        (() => {
          const previewTransform = getStopMarkerTransformUtil(
            state.hoverPreview.position
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