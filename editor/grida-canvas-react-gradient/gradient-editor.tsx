"use client";

import type React from "react";
import { useRef, useCallback, useReducer, useEffect } from "react";
import {
  gradientReducer,
  createInitialState,
  type GradientState,
  type GradientType,
  type GradientValue,
  getControlPoints,
  getStopMarkerTransform,
} from "./gradient-reducer";
import { cn } from "@/components/lib/utils";

// Helper function to convert RGBA8888 to CSS rgba string
const rgbaToString = (color: {
  r: number;
  g: number;
  b: number;
  a: number;
}) => {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
};

export interface GradientEditorProps {
  width?: number;
  height?: number;
  gradientType: GradientType;
  initialValue?: GradientValue;
  onStateChange?: (state: GradientState) => void;
  onValueChange?: (value: GradientValue) => void;
  readonly?: boolean;
  background?: string;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export default function GradientEditor({
  width = 400,
  height = 300,
  gradientType,
  initialValue,
  onStateChange,
  onValueChange,
  readonly = false,
  background,
  preventDefault = true,
  stopPropagation = true,
}: GradientEditorProps) {
  // Fixed stop size for consistent physical appearance
  const STOP_SIZE = 18;
  const [state, dispatch] = useReducer(gradientReducer, {
    ...createInitialState(gradientType, initialValue),
  });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  useEffect(() => {
    const _t = state.transform;
    onValueChange?.({
      stops: state.stops,
      transform: [
        [_t.a, _t.b, _t.tx],
        [_t.d, _t.e, _t.ty],
      ],
    });
  }, [state.stops, state.transform, onValueChange]);

  // Handle mouse events only if not readonly
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (preventDefault) e.preventDefault();
      if (stopPropagation) e.stopPropagation();
      if (readonly || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      dispatch({
        type: "HANDLE_POINTER_DOWN",
        payload: { x, y, width, height, gradientType },
      });
    },
    [
      readonly,
      preventDefault,
      stopPropagation,
      dispatch,
      width,
      height,
      gradientType,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | PointerEvent) => {
      if (preventDefault) e.preventDefault();
      if (stopPropagation) e.stopPropagation();
      if (readonly || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      dispatch({
        type: "HANDLE_POINTER_MOVE",
        payload: { x, y, width, height, gradientType },
      });
    },
    [
      readonly,
      preventDefault,
      stopPropagation,
      dispatch,
      width,
      height,
      gradientType,
    ]
  );

  const handlePointerUp = useCallback(
    (e?: React.MouseEvent | PointerEvent) => {
      if (preventDefault) e?.preventDefault();
      if (stopPropagation) e?.stopPropagation();
      if (readonly) return;
      dispatch({ type: "HANDLE_POINTER_UP" });
    },
    [readonly, dispatch, preventDefault, stopPropagation]
  );

  const handlePointerLeave = useCallback(
    (e?: React.MouseEvent) => {
      if (preventDefault) e?.preventDefault();
      if (stopPropagation) e?.stopPropagation();
      if (readonly) return;
      dispatch({ type: "HANDLE_POINTER_LEAVE" });
    },
    [readonly, dispatch, preventDefault, stopPropagation]
  );

  // Register global pointer events for dragging outside bounds
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

  const { A, B, C } = getControlPoints(state.transform, width, height);

  return (
    <div
      ref={containerRef}
      className={`relative select-none z-10 ${
        readonly ? "cursor-default" : "cursor-crosshair"
      }`}
      style={{
        width,
        height,
        background: background || "transparent",
        overflow: "visible",
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
        selected={state.focusedControl === "A"}
        readonly={readonly}
        tabIndex={0}
        onFocus={(e) => {
          if (preventDefault) e.preventDefault();
          if (stopPropagation) e.stopPropagation();
          if (!readonly)
            dispatch({ type: "SET_FOCUSED_CONTROL", payload: "A" });
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
          if (preventDefault) e.preventDefault();
          if (stopPropagation) e.stopPropagation();
          if (!readonly)
            dispatch({ type: "SET_FOCUSED_CONTROL", payload: "B" });
        }}
      />

      {/* C Point */}
      <ControlPoint
        x={C.x}
        y={C.y}
        selected={state.focusedControl === "C"}
        readonly={readonly}
        tabIndex={0}
        onFocus={(e) => {
          if (preventDefault) e.preventDefault();
          if (stopPropagation) e.stopPropagation();
          if (!readonly)
            dispatch({ type: "SET_FOCUSED_CONTROL", payload: "C" });
        }}
      />

      {/* Color Stop Markers */}
      {state.stops.map((stop, index) => {
        const selected = state.focusedStop === index;
        const { x, y, rotation } = getStopMarkerTransform(
          stop.offset, // Changed from position to offset
          gradientType,
          state.transform,
          width,
          height
        );
        return (
          <StopMarker
            key={index}
            x={x}
            y={y}
            transform={`translate(-50%, -50%) rotate(${rotation}deg)`}
            color={rgbaToString(stop.color)} // Convert RGBA8888 to CSS string
            selected={selected}
            readonly={readonly}
            tabIndex={0}
            arrow={true}
            stopSize={STOP_SIZE}
            onFocus={(e) => {
              if (preventDefault) e.preventDefault();
              if (stopPropagation) e.stopPropagation();
              if (!readonly)
                dispatch({
                  type: "SET_FOCUSED_STOP",
                  payload: index,
                });
            }}
          />
        );
      })}

      {/* Hover Preview */}
      {state.hoverPreview &&
        (() => {
          const previewTransform = getStopMarkerTransform(
            state.hoverPreview.position,
            gradientType,
            state.transform,
            width,
            height
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

function StopMarker({
  x,
  y,
  transform,
  color,
  selected,
  readonly,
  tabIndex,
  onFocus,
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
