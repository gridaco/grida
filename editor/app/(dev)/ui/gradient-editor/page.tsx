"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import {
  GradientControlPointsEditor,
  getPointsFromTransform,
  getTransformFromPoints,
  type GradientType,
} from "@/grida-canvas-react-gradient";
import type cg from "@grida/cg";
import kolor from "@grida/color";
import { css } from "@/grida-canvas-utils/css";
import { useWindowSize } from "@uidotdev/usehooks";

// Helper function to convert RGBA8888 to hex string
const rgbaToHex = (color: cg.RGB888A32F): string => {
  const r = color.r.toString(16).padStart(2, "0");
  const g = color.g.toString(16).padStart(2, "0");
  const b = color.b.toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
};

// Main gradient editor component that only renders when size is ready
function GradientEditorContent() {
  const [gradientType, setGradientType] = useState<GradientType>("linear");
  const windowSize = useWindowSize();

  // Calculate dimensions with padding
  const dimensions = {
    width: (windowSize.width || 800) - 48, // 24px padding on each side
    height: (windowSize.height || 600) - 48,
  };

  // State for the gradient
  const [stops, setStops] = useState<
    { offset: number; color: cg.RGB888A32F }[]
  >([
    { offset: 0, color: kolor.colorformats.newRGB888A32F(255, 0, 0, 1) },
    { offset: 1, color: kolor.colorformats.newRGB888A32F(0, 0, 255, 1) },
  ]);
  const [focusedStop, setFocusedStop] = useState<number | null>(null);
  const [points, setPoints] = useState<
    [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ]
  >([
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
    { x: 0, y: 1 },
  ]);

  // Update state when gradient type changes
  const handleGradientTypeChange = useCallback((newType: GradientType) => {
    setGradientType(newType);
    // Reset to default points for the new gradient type
    if (newType === "linear") {
      setPoints([
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
        { x: 0, y: 1 },
      ]);
    } else {
      setPoints([
        { x: 0.5, y: 0.5 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 1 },
      ]);
    }
  }, []);

  const generateGradientCSS = useCallback(() => {
    const transform = getTransformFromPoints(
      { A: points[0], B: points[1], C: points[2] },
      gradientType
    );
    return css.toGradientString({
      type: `${gradientType}_gradient`,
      stops,
      transform,
      blendMode: "normal",
      opacity: 1,
      active: true,
    });
  }, [gradientType, stops, points]);

  const handlePointsChange = useCallback(
    (
      newPoints: [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
      ]
    ) => {
      setPoints(newPoints);
    },
    []
  );

  const handlePositionChange = useCallback(
    (index: number, position: number) => {
      setStops((prev) =>
        prev.map((stop, i) =>
          i === index ? { ...stop, offset: position } : stop
        )
      );
    },
    []
  );

  const handleInsertStop = useCallback((at: number, position: number) => {
    setStops((prev) => {
      const newStops = [...prev];
      newStops.splice(at, 0, {
        offset: position,
        color: kolor.colorformats.RGB888A32F.GRAY,
      });
      return newStops;
    });
    setFocusedStop(at);
  }, []);

  const handleDeleteStop = useCallback(
    (index: number) => {
      if (stops.length > 2) {
        setStops((prev) => prev.filter((_, i) => i !== index));
        if (focusedStop === index) {
          setFocusedStop(null);
        } else if (focusedStop !== null && focusedStop > index) {
          setFocusedStop(focusedStop - 1);
        }
      }
    },
    [stops.length, focusedStop]
  );

  const handleFocusedStopChange = useCallback((index: number | null) => {
    setFocusedStop(index);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Floating Title */}
      <div className="absolute top-12 left-12 z-50">
        <div className="bg-background/80 backdrop-blur-sm rounded-lg px-4 py-3 border shadow-lg">
          <h1 className="text-lg font-bold mb-0.5 font-mono">
            @grida/react-gradient-editor
          </h1>
          <p className="text-xs text-muted-foreground">
            Gradient stops & transforms
          </p>
        </div>
      </div>

      {/* Full Screen Gradient Canvas */}
      <div className="relative w-full h-full p-6">
        <div className="relative w-full h-full rounded-xl shadow-2xl overflow-hidden">
          <GradientControlPointsEditor
            width={dimensions.width}
            height={dimensions.height}
            gradientType={gradientType}
            stops={stops}
            focusedStop={focusedStop}
            points={points}
            onPointsChange={handlePointsChange}
            onPositionChange={handlePositionChange}
            onInsertStop={handleInsertStop}
            onFocusedStopChange={handleFocusedStopChange}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: generateGradientCSS(),
            }}
          />
        </div>
      </div>

      {/* Floating Control Bar at Bottom Center */}
      <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 z-50">
        <div className="bg-background/80 backdrop-blur-sm rounded-lg p-4 border shadow-lg min-w-[400px]">
          <div className="flex items-center gap-4 mb-4">
            {/* Gradient Type Selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Type:</label>
              <Select
                value={gradientType}
                onValueChange={handleGradientTypeChange}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linear">Linear</SelectItem>
                  <SelectItem value="radial">Radial</SelectItem>
                  <SelectItem value="sweep">Sweep</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Color Stop Controls */}
          {focusedStop !== null &&
            (() => {
              const stop = stops[focusedStop];
              if (!stop) return null;

              return (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Stop {focusedStop + 1}
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteStop(focusedStop)}
                      disabled={stops.length <= 2}
                      aria-label="Delete selected color stop"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs">Position</label>
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={stop.offset.toFixed(2)}
                      onChange={(e) => {
                        const pos = Math.max(
                          0,
                          Math.min(1, Number.parseFloat(e.target.value) || 0)
                        );
                        handlePositionChange(focusedStop, pos);
                      }}
                      className="w-16"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs">Color</label>
                    <Input
                      type="color"
                      value={rgbaToHex(stop.color)}
                      onChange={(e) => {
                        const hex = e.target.value;
                        const newColor =
                          kolor.colorformats.RGB888A32F.fromHEX(hex);
                        setStops((prev) =>
                          prev.map((s, i) =>
                            i === focusedStop ? { ...s, color: newColor } : s
                          )
                        );
                      }}
                      className="w-12"
                    />
                  </div>
                </div>
              );
            })()}

          {/* Info Display */}
          <div className="text-xs text-muted-foreground mt-2">
            <span>Stops: {stops.length}</span>
            <span className="mx-2">•</span>
            <span>Focus: {focusedStop !== null ? "Color Stop" : "None"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Root component that measures window size and conditionally renders the editor
export default function GradientEditorDemoPage() {
  const windowSize = useWindowSize();

  // Only render the real component when we have window dimensions
  if (!windowSize.width || !windowSize.height) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            Initializing gradient editor...
          </p>
        </div>
      </div>
    );
  }

  return <GradientEditorContent />;
}
