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
import GradientEditor, { useGradient } from "@/grida-canvas-react-gradient";
import {
  createInitialState,
  type GradientType,
} from "@/grida-canvas-react-gradient";
import type cg from "@grida/cg";
import { css } from "@/grida-canvas-utils/css";
import { useWindowSize } from "@uidotdev/usehooks";

// Helper function to convert RGBA8888 to hex string
const rgbaToHex = (color: cg.RGBA8888): string => {
  const r = color.r.toString(16).padStart(2, "0");
  const g = color.g.toString(16).padStart(2, "0");
  const b = color.b.toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
};

// Helper function to convert hex string to RGBA8888
const hexToRgba = (hex: string): cg.RGBA8888 => {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return { r, g, b, a: 1 };
};

// Canvas component for the gradient editor
function Canvas({
  gradientType,
  editor,
  generateGradientCSS,
  width,
  height,
}: {
  gradientType: GradientType;
  editor: ReturnType<typeof useGradient>;
  generateGradientCSS: () => string;
  width: number;
  height: number;
}) {
  return (
    <div className="relative w-full h-full p-6">
      <div className="relative w-full h-full rounded-xl shadow-2xl overflow-hidden">
        <GradientEditor
          width={width}
          height={height}
          gradientType={gradientType}
          editor={editor}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: generateGradientCSS(),
          }}
        />
      </div>
    </div>
  );
}

// Main gradient editor component that only renders when size is ready
function GradientEditorContent() {
  const [gradientType, setGradientType] = useState<GradientType>("linear");
  const windowSize = useWindowSize();

  // Calculate dimensions with padding
  const dimensions = {
    width: (windowSize.width || 800) - 48, // 24px padding on each side
    height: (windowSize.height || 600) - 48,
  };

  // Create the gradient editor instance only when we have dimensions
  const editor = useGradient({
    gradientType,
    initialValue: {
      stops: [
        { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
        { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
      ],
      transform: [
        [1, 0, 0.5],
        [0, 1, 0.5],
      ],
    },
    width: dimensions.width,
    height: dimensions.height,
  });

  // Update state when gradient type changes
  const handleGradientTypeChange = useCallback(
    (newType: GradientType) => {
      setGradientType(newType);
      // Recreate editor with new gradient type
      const newInitialState = createInitialState(newType);
      editor.setStops(newInitialState.stops);
      editor.setTransform(newInitialState.transform);
    },
    [editor]
  );

  const generateGradientCSS = useCallback(() => {
    const g = editor.getValue();
    return css.toGradientString({
      type: `${gradientType}_gradient`,
      stops: g.stops,
      transform: g.transform,
    });
  }, [gradientType, editor.stops, editor.transform]);

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
      <Canvas
        gradientType={gradientType}
        editor={editor}
        generateGradientCSS={generateGradientCSS}
        width={dimensions.width}
        height={dimensions.height}
      />

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
          {editor.focusedStop !== null &&
            (() => {
              const focusedStopData = editor.stops[editor.focusedStop];
              if (!focusedStopData) return null;

              return (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Stop {editor.focusedStop + 1}
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (editor.stops.length > 2) {
                          editor.removeStop(editor.focusedStop!);
                        }
                      }}
                      disabled={editor.stops.length <= 2}
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
                      value={focusedStopData.offset.toFixed(2)}
                      onChange={(e) => {
                        const pos = Math.max(
                          0,
                          Math.min(1, Number.parseFloat(e.target.value) || 0)
                        );
                        editor.updateStopOffset(editor.focusedStop!, pos);
                      }}
                      className="w-16"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs">Color</label>
                    <Input
                      type="color"
                      value={rgbaToHex(focusedStopData.color)}
                      onChange={(e) => {
                        const hex = e.target.value;
                        const newColor = hexToRgba(hex);
                        editor.updateStopColor(editor.focusedStop!, newColor);
                      }}
                      className="w-12"
                    />
                  </div>
                </div>
              );
            })()}

          {/* Info Display */}
          <div className="text-xs text-muted-foreground mt-2">
            <span>Stops: {editor.stops.length}</span>
            <span className="mx-2">•</span>
            <span>
              Focus:{" "}
              {editor.focusedStop !== null
                ? "Color Stop"
                : editor.focusedControl
                  ? `Point ${editor.focusedControl}`
                  : "None"}
            </span>
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
