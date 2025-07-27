"use client";

import type React from "react";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import * as Popover from "@radix-ui/react-popover";

interface DegreeControlProps {
  value?: number;
  onChange?: (value: number) => void;
  size?: "icon" | "sm" | "md" | "lg" | "xl";
  className?: string;
  loop?: boolean;
  min?: number;
  max?: number;
  disabled?: boolean;
}

const SIZE_MAP = {
  icon: 24,
  sm: 32,
  md: 48,
  lg: 64,
  xl: 80,
} as const;

const POPOVER_THRESHOLD = 40;

export default function DegreeControl({
  value = 0,
  onChange,
  size = "md",
  className = "",
  loop = true,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  disabled = false,
}: DegreeControlProps) {
  const [rotation, setRotation] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);

  const pixelSize = SIZE_MAP[size];
  const center = pixelSize / 2;
  const radius = pixelSize / 2 - 2;
  const [isFocused, setIsFocused] = useState(false);
  const [dragSource, setDragSource] = useState<"thumb" | "track" | null>(null);

  // Determine if this should be a popover control
  const isSmall = pixelSize <= POPOVER_THRESHOLD;

  // Memoize the normalize function to prevent infinite loops
  const normalizeValue = useCallback(
    (angle: number) => {
      if (disabled) return angle;

      if (loop) {
        const normalized = ((angle % 360) + 360) % 360;
        return Math.round(normalized);
      } else {
        const constrained = Math.max(min, Math.min(max, angle));
        return Math.round(constrained);
      }
    },
    [disabled, loop, min, max]
  );

  // Get visual angle for display (always 0-360 for visual representation)
  const getVisualAngle = useCallback((value: number) => {
    return ((value % 360) + 360) % 360;
  }, []);

  // Calculate angle from mouse position
  const calculateAngle = useCallback(
    (clientX: number, clientY: number) => {
      if (!controlRef.current) return 0;

      const rect = controlRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;

      // Calculate angle in degrees (0° is at top, clockwise)
      const angle = Math.atan2(deltaX, -deltaY) * (180 / Math.PI);
      const normalizedAngle = ((angle % 360) + 360) % 360;

      if (loop) {
        return normalizedAngle;
      } else {
        // For non-loop mode, handle continuous rotation
        const currentVisual = getVisualAngle(rotation);
        let diff = normalizedAngle - currentVisual;

        // Normalize the difference to [-180, 180]
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        return rotation + diff;
      }
    },
    [loop, rotation, getVisualAngle]
  );

  // Handle mouse down on the handle
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      setDragSource("thumb");
    },
    [disabled]
  );

  // Handle mouse down on the track
  const handleTrackMouseDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();

      // For small controls, open popover instead of dragging
      if (isSmall) {
        setIsPopoverOpen(true);
        return;
      }

      // Calculate initial angle and set rotation
      const newAngle = calculateAngle(e.clientX, e.clientY);
      const normalizedValue = normalizeValue(newAngle);
      setRotation(normalizedValue);
      onChange?.(normalizedValue);

      // Start dragging from track
      setIsDragging(true);
      setDragSource("track");
      setIsFocused(true);

      // Focus the control for keyboard navigation
      if (controlRef.current) {
        controlRef.current.focus();
      }
    },
    [calculateAngle, normalizeValue, onChange, isSmall, disabled]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || disabled) return;

      const newAngle = calculateAngle(e.clientX, e.clientY);
      const normalizedValue = normalizeValue(newAngle);
      setRotation(normalizedValue);
      onChange?.(normalizedValue);
    },
    [isDragging, calculateAngle, normalizeValue, onChange, disabled]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragSource(null);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isFocused || disabled) return;

      let newRotation = rotation;
      const step = e.shiftKey ? 15 : e.ctrlKey || e.metaKey ? 1 : 5;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowUp":
          e.preventDefault();
          newRotation = normalizeValue(rotation + step);
          break;
        case "ArrowLeft":
        case "ArrowDown":
          e.preventDefault();
          newRotation = normalizeValue(rotation - step);
          break;
        case "Home":
          e.preventDefault();
          newRotation = normalizeValue(loop ? 0 : min);
          break;
        case "End":
          e.preventDefault();
          newRotation = normalizeValue(loop ? 180 : max);
          break;
        case "PageUp":
          e.preventDefault();
          newRotation = normalizeValue(rotation + 45);
          break;
        case "PageDown":
          e.preventDefault();
          newRotation = normalizeValue(rotation - 45);
          break;
        case "Escape":
          e.preventDefault();
          setIsFocused(false);
          if (controlRef.current) {
            controlRef.current.blur();
          }
          break;
        default:
          return;
      }

      if (newRotation !== rotation) {
        setRotation(newRotation);
        onChange?.(newRotation);
      }
    },
    [isFocused, disabled, rotation, normalizeValue, loop, min, max, onChange]
  );

  // Set up global mouse events
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Update internal state when prop changes - fix the infinite loop
  useEffect(() => {
    const normalizedValue = normalizeValue(value);
    if (normalizedValue !== rotation) {
      setRotation(normalizedValue);
    }
  }, [value, normalizeValue]); // Remove rotation from dependencies to prevent loop

  // Calculate handle position using visual angle
  const visualAngle = useMemo(
    () => getVisualAngle(rotation),
    [rotation, getVisualAngle]
  );
  const handleAngle = (visualAngle - 90) * (Math.PI / 180);
  const handleX = center + radius * Math.cos(handleAngle);
  const handleY = center + radius * Math.sin(handleAngle);

  // Render the control
  const renderControl = useCallback(
    (controlSize: number) => {
      const controlCenter = controlSize / 2;
      const controlRadius = controlSize / 2 - 2;
      const controlHandleAngle = (visualAngle - 90) * (Math.PI / 180);
      const controlHandleX =
        controlCenter + controlRadius * Math.cos(controlHandleAngle);
      const controlHandleY =
        controlCenter + controlRadius * Math.sin(controlHandleAngle);

      return (
        <div
          ref={controlSize === pixelSize ? controlRef : undefined}
          className={`relative cursor-pointer select-none outline-none rounded-full transition-all ${
            isFocused ? "ring-2 ring-blue-500 ring-offset-1" : ""
          } ${isDragging && dragSource === "track" ? "cursor-grabbing" : "cursor-pointer"} ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          } ${className}`}
          style={{ width: controlSize, height: controlSize }}
          onPointerDown={
            controlSize === pixelSize && !disabled
              ? handleTrackMouseDown
              : undefined
          }
          onKeyDown={handleKeyDown}
          onFocus={() => !disabled && setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          tabIndex={disabled ? -1 : 0}
          role="slider"
          aria-label="Rotation angle"
          aria-valuenow={rotation}
          aria-valuemin={loop ? 0 : min}
          aria-valuemax={loop ? 360 : max}
          aria-valuetext={`${rotation} degrees`}
          aria-disabled={disabled}
        >
          {/* Outer circle */}
          <div
            className={`absolute inset-0 rounded-full border-2 transition-colors ${
              isFocused && !disabled
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 bg-gray-50"
            }`}
            style={{ width: controlSize, height: controlSize }}
          />

          {/* Constraint arc for non-loop mode */}
          {!loop &&
            min > Number.NEGATIVE_INFINITY &&
            max < Number.POSITIVE_INFINITY &&
            max - min <= 360 && (
              <div
                className="absolute inset-0.5 rounded-full"
                style={{
                  background: `conic-gradient(from 0deg, transparent 0deg, transparent ${(min + 90) % 360}deg, rgba(59, 130, 246, 0.1) ${(min + 90) % 360}deg, rgba(59, 130, 246, 0.1) ${(max + 90) % 360}deg, transparent ${(max + 90) % 360}deg, transparent 360deg)`,
                }}
              />
            )}

          {/* Tick marks for larger sizes */}
          {controlSize > 32 &&
            [0, 90, 180, 270].map((angle) => {
              const tickAngle = (angle - 90) * (Math.PI / 180);
              const tickRadius = controlRadius - 4;
              const tickX = controlCenter + tickRadius * Math.cos(tickAngle);
              const tickY = controlCenter + tickRadius * Math.sin(tickAngle);

              return (
                <div
                  key={angle}
                  className="absolute w-0.5 h-2 bg-gray-400 -translate-x-0.5 -translate-y-1"
                  style={{
                    left: tickX,
                    top: tickY,
                    transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                  }}
                />
              );
            })}

          {/* Center dot */}
          <div
            className="absolute w-1 h-1 bg-gray-600 rounded-full -translate-x-0.5 -translate-y-0.5"
            style={{ left: controlCenter, top: controlCenter }}
          />

          {/* Rotation line */}
          <div
            className={`absolute w-0.5 origin-bottom transition-colors ${disabled ? "bg-gray-400" : "bg-blue-500"}`}
            style={{
              left: controlCenter - 1,
              top: 2,
              height: controlRadius,
              transform: `rotate(${visualAngle}deg)`,
            }}
          />

          {/* Draggable handle */}
          <div
            className={`absolute w-1.5 h-1.5 rounded-full border border-white shadow-sm -translate-x-0.5 -translate-y-0.5 ${
              disabled
                ? "bg-gray-400 cursor-not-allowed"
                : isDragging && dragSource === "thumb"
                  ? "bg-blue-600 cursor-grabbing scale-125"
                  : "bg-blue-500 cursor-grab hover:scale-110"
            }`}
            style={{ left: controlHandleX, top: controlHandleY }}
            onMouseDown={
              controlSize === pixelSize && !disabled
                ? handleMouseDown
                : undefined
            }
          />
        </div>
      );
    },
    [
      visualAngle,
      pixelSize,
      isFocused,
      isDragging,
      dragSource,
      disabled,
      className,
      handleTrackMouseDown,
      handleKeyDown,
      handleMouseDown,
      loop,
      min,
      max,
      rotation,
    ]
  );

  // For small controls, wrap in popover
  if (isSmall) {
    return (
      <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <Popover.Trigger>
          <div className="cursor-pointer w-fit">{renderControl(pixelSize)}</div>
        </Popover.Trigger>
        <Popover.Content
          className="p-0"
          align="center"
          side="bottom"
          sideOffset={4}
        >
          <DegreeControl
            value={rotation}
            onChange={(newValue) => {
              setRotation(newValue);
              onChange?.(newValue);
            }}
            size="xl"
            loop={loop}
            min={min}
            max={max}
            disabled={disabled}
          />
        </Popover.Content>
      </Popover.Root>
    );
  }

  return renderControl(pixelSize);
}
