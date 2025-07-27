import type cg from "@grida/cg";
import { css } from "@/grida-canvas-utils/css";
import React, { useRef, useState, useCallback, useEffect } from "react";

interface GradientStopsSliderProps {
  stops: cg.GradientStop[];
  selectedStop?: number;
  onSelectedStopChange?: (stop: number) => void;
  onValueChange?: (value: cg.GradientStop[]) => void;
}

export function GradientStopsSlider({
  stops,
  selectedStop,
  onValueChange,
  onSelectedStopChange,
}: GradientStopsSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null
  );

  const positions = stops.map((stop) => stop.offset);
  const colors = stops.map((stop) => stop.color);

  // Convert screen position to gradient position (0-1)
  const screenToGradientPosition = useCallback((clientX: number): number => {
    if (!trackRef.current) return 0;

    const rect = trackRef.current.getBoundingClientRect();
    const position = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, position));
  }, []);

  // Insert a stop in sorted position by offset
  const insertStopInSortedPosition = useCallback(
    (
      positions: number[],
      colors: cg.RGBA8888[],
      newPosition: number,
      newColor: cg.RGBA8888
    ): {
      positions: number[];
      colors: cg.RGBA8888[];
      insertedIndex: number;
    } => {
      const newPositions = [...positions];
      const newColors = [...colors];

      // Find the correct position to insert the new stop
      let insertIndex = 0;
      for (let i = 0; i < newPositions.length; i++) {
        if (newPosition > newPositions[i]) {
          insertIndex = i + 1;
        } else {
          break;
        }
      }

      // Insert the stop at the correct position
      newPositions.splice(insertIndex, 0, newPosition);
      newColors.splice(insertIndex, 0, newColor);

      return {
        positions: newPositions,
        colors: newColors,
        insertedIndex: insertIndex,
      };
    },
    []
  );

  // Sort stops by offset and return the new index of a specific stop
  const sortStopsByOffset = useCallback(
    (
      positions: number[],
      colors: cg.RGBA8888[],
      originalIndex: number
    ): { positions: number[]; colors: cg.RGBA8888[]; newIndex: number } => {
      const newPositions = [...positions];
      const newColors = [...colors];
      const movedPosition = newPositions[originalIndex];
      const movedColor = newColors[originalIndex];

      // Remove the stop from its current position
      newPositions.splice(originalIndex, 1);
      newColors.splice(originalIndex, 1);

      // Find the correct position to re-insert it
      let newIndex = 0;
      for (let i = 0; i < newPositions.length; i++) {
        if (movedPosition > newPositions[i]) {
          newIndex = i + 1;
        } else {
          break;
        }
      }

      // Insert the stop at the correct position
      newPositions.splice(newIndex, 0, movedPosition);
      newColors.splice(newIndex, 0, movedColor);

      return { positions: newPositions, colors: newColors, newIndex };
    },
    []
  );

  // Update stops with new positions and colors
  const updateStops = useCallback(
    (newPositions: number[], newColors: cg.RGBA8888[]) => {
      const newStops = newPositions.map((position, index) => ({
        offset: position,
        color: newColors[index],
      }));
      onValueChange?.(newStops);
    },
    [onValueChange]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.preventDefault();
      setIsDragging(true);
      setDragIndex(index);
      onSelectedStopChange?.(index);

      // Calculate drag offset from the stop's current position
      const currentPosition = positions[index];
      const trackRect = trackRef.current?.getBoundingClientRect();
      if (trackRect) {
        const stopScreenX = trackRect.left + currentPosition * trackRect.width;
        setDragOffset({ x: e.clientX - stopScreenX, y: 0 });
      }

      // Set pointer capture to ensure we get pointer events even if pointer leaves the element
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
    [positions, onSelectedStopChange]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging || dragIndex === null || dragOffset === null) return;

      // Calculate new position based on drag offset
      const adjustedX = e.clientX - dragOffset.x;
      const newPosition = screenToGradientPosition(adjustedX);

      // Update the specific stop's position
      const newPositions = [...positions];
      newPositions[dragIndex] = newPosition;

      updateStops(newPositions, colors);
    },
    [
      isDragging,
      dragIndex,
      dragOffset,
      screenToGradientPosition,
      positions,
      colors,
      updateStops,
    ]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (isDragging && dragIndex !== null) {
        // Sort stops to maintain order after dragging
        const {
          positions: sortedPositions,
          colors: sortedColors,
          newIndex,
        } = sortStopsByOffset(positions, colors, dragIndex);

        updateStops(sortedPositions, sortedColors);

        // Update selected stop to the new position
        onSelectedStopChange?.(newIndex);
      }

      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      setIsDragging(false);
      setDragIndex(null);
      setDragOffset(null);
    },
    [
      isDragging,
      dragIndex,
      positions,
      colors,
      sortStopsByOffset,
      updateStops,
      onSelectedStopChange,
    ]
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;

      const newPosition = screenToGradientPosition(e.clientX);
      const newColor: cg.RGBA8888 = { r: 128, g: 128, b: 128, a: 1 };

      const {
        positions: newPositions,
        colors: newColors,
        insertedIndex,
      } = insertStopInSortedPosition(positions, colors, newPosition, newColor);

      updateStops(newPositions, newColors);
      onSelectedStopChange?.(insertedIndex);
    },
    [
      isDragging,
      screenToGradientPosition,
      positions,
      colors,
      insertStopInSortedPosition,
      updateStops,
      onSelectedStopChange,
    ]
  );

  // Add global pointer event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);

      return () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };
    }
  }, [isDragging, handlePointerMove, handlePointerUp]);

  return (
    <div className="relative flex w-full touch-none select-none items-center">
      <div
        ref={trackRef}
        className="relative h-9 w-full grow overflow-hidden rounded cursor-pointer border"
        style={{
          background: `linear-gradient(to right, ${stops.map((stop) => `${css.toRGBAString(stop.color)} ${stop.offset * 100}%`).join(", ")})`,
        }}
        onClick={handleTrackClick}
      />
      {stops.map((stop, index) => (
        <div
          key={index}
          data-selected={selectedStop === index}
          className="group/stop-thumb absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing data-[selected=true]:z-10"
          style={{
            left: `${stop.offset * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
          onPointerDown={(e) => handlePointerDown(e, index)}
        >
          <div
            className="
              block size-7 rounded border-4 border-gray-100 shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50
              group-data-[selected=true]/stop-thumb:border-yellow-400
            "
            style={{
              background: css.toRGBAString(stop.color),
            }}
          />
        </div>
      ))}
    </div>
  );
}
