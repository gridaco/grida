"use client";

import React, { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
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

export default function GradientEditorDemoPage() {
  const [gradientType, setGradientType] = useState<GradientType>("linear");
  const [readonly, setReadonly] = useState(false);

  // Create the gradient editor instance
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
    width: 400,
    height: 300,
    readonly,
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
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Advanced Gradient Editor</h1>
          <p>
            Professional gradient editor supporting linear, radial, and sweep
            gradients with 2D affine transforms. Now fully controlled via
            useGradient hook.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Editor */}
          <div className="lg:col-span-2">
            <Card className="p-4">
              <div className="space-y-4">
                {/* Gradient Type Selector */}
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium">Gradient Type:</label>
                  <Select
                    value={gradientType}
                    onValueChange={handleGradientTypeChange}
                    disabled={readonly}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="linear">Linear</SelectItem>
                      <SelectItem value="radial">Radial</SelectItem>
                      <SelectItem value="sweep">Sweep</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant={readonly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setReadonly(!readonly)}
                  >
                    {readonly ? "Enable Edit" : "Readonly"}
                  </Button>
                </div>

                {/* Gradient Canvas */}
                <div
                  className="relative"
                  style={{
                    width: 400,
                    height: 300,
                  }}
                >
                  <GradientEditor
                    width={400}
                    height={300}
                    gradientType={gradientType}
                    editor={editor}
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background: generateGradientCSS(),
                    }}
                  />
                </div>

                {/* Instructions */}
                <div className="text-xs p-2 rounded border">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <strong>Controls:</strong> Blue=Center/Start,
                      Green=End/Radius, Purple=Scale
                    </div>
                    <div>
                      <strong>Tracks:</strong>{" "}
                      {gradientType === "sweep"
                        ? "Ellipse track for stops"
                        : "Line track for stops"}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Control Panel */}
          <div className="space-y-4">
            {/* Color stop controls */}
            {editor.focusedStop !== null &&
              (() => {
                const focusedStopData = editor.stops[editor.focusedStop];
                if (!focusedStopData) return null;

                return (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">
                        Color Stop {editor.focusedStop + 1}
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (readonly) return;
                          if (editor.stops.length > 2) {
                            editor.removeStop(editor.focusedStop!);
                          }
                        }}
                        disabled={editor.stops.length <= 2 || readonly}
                        aria-label="Delete selected color stop"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs">Position</label>
                        <Input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={focusedStopData.offset.toFixed(2)}
                          onChange={(e) => {
                            if (readonly) return;
                            const pos = Math.max(
                              0,
                              Math.min(
                                1,
                                Number.parseFloat(e.target.value) || 0
                              )
                            );
                            editor.updateStopOffset(editor.focusedStop!, pos);
                          }}
                          className="h-8"
                          disabled={readonly}
                        />
                      </div>
                      <div>
                        <label className="text-xs">Color</label>
                        <Input
                          type="color"
                          value={rgbaToHex(focusedStopData.color)}
                          onChange={(e) => {
                            if (readonly) return;
                            const hex = e.target.value;
                            const newColor = hexToRgba(hex);
                            editor.updateStopColor(
                              editor.focusedStop!,
                              newColor
                            );
                          }}
                          className="h-8"
                          disabled={readonly}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })()}

            {/* Info */}
            <Card className="p-4">
              <div className="text-xs space-y-1">
                <div>Type: {gradientType}</div>
                <div>Stops: {editor.stops.length}</div>
                <div>
                  Focused:{" "}
                  {editor.focusedStop !== null
                    ? "Color Stop"
                    : editor.focusedControl
                      ? `Point ${editor.focusedControl}`
                      : "None"}
                </div>
                <div>Mode: {readonly ? "Readonly" : "Editable"}</div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
