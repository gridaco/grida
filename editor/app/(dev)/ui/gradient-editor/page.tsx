"use client";

import { useState, useCallback } from "react";
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
import GradientEditor from "@/grida-canvas-react-gradient";
import {
  createInitialState,
  type GradientState,
  type GradientType,
} from "@/grida-canvas-react-gradient";
import type cg from "@grida/cg";

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

export default function Page() {
  const [gradientType, setGradientType] = useState<GradientType>("linear");
  const [state, setState] = useState<GradientState>(() =>
    createInitialState(gradientType)
  );
  const [readonly, setReadonly] = useState(false);

  const handleChange = useCallback((newState: GradientState) => {
    setState(newState);
  }, []);

  // Update state when gradient type changes
  const handleGradientTypeChange = useCallback((newType: GradientType) => {
    setGradientType(newType);
    // Recreate state with new gradient type
    setState(createInitialState(newType));
  }, []);

  // Calculate control points from transform for display
  const getControlPoints = useCallback(() => {
    const A = { x: state.transform.tx, y: state.transform.ty };

    // B point: A + (a, d) * scale - controls rotation and main radius
    const scale = 100; // Base scale for visualization
    const B = {
      x: A.x + state.transform.a * scale,
      y: A.y + state.transform.d * scale,
    };

    // C point: Always perpendicular to A-B line, distance controlled by (b, e)
    // Calculate perpendicular direction to A-B
    const abLength = Math.sqrt(
      state.transform.a * state.transform.a +
        state.transform.d * state.transform.d
    );
    if (abLength === 0) {
      // Fallback if A and B are at same position
      return { A, B, C: { x: A.x, y: A.y - scale } };
    }

    // Perpendicular unit vector (90° rotation of A-B direction)
    const perpX = -state.transform.d / abLength;
    const perpY = state.transform.a / abLength;

    // C distance from transform.b and transform.e (should represent the same distance)
    const cDistance =
      Math.sqrt(
        state.transform.b * state.transform.b +
          state.transform.e * state.transform.e
      ) * scale;

    const C = {
      x: A.x + perpX * cDistance,
      y: A.y + perpY * cDistance,
    };

    return { A, B, C };
  }, [state.transform]);

  // Generate CSS gradient string
  const generateGradientCSS = useCallback(() => {
    const sortedStops = [...state.stops].sort(
      (a, b) => a.offset - b.offset // Changed from position to offset
    );
    const stopStrings = sortedStops.map(
      (stop) =>
        `rgba(${stop.color.r}, ${stop.color.g}, ${stop.color.b}, ${stop.color.a}) ${(stop.offset * 100).toFixed(1)}%` // Changed to use RGBA8888 format
    );

    const { A, B, C } = getControlPoints();

    switch (gradientType) {
      case "linear": {
        const angle = Math.atan2(B.y - A.y, B.x - A.x) * (180 / Math.PI) + 90;
        return `linear-gradient(${angle}deg, ${stopStrings.join(", ")})`;
      }
      case "radial": {
        // Main radius from A-B distance
        const radiusX = Math.sqrt(
          Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2)
        );
        // Scale radius from A-C distance
        const radiusY = Math.sqrt(
          Math.pow(C.x - A.x, 2) + Math.pow(C.y - A.y, 2)
        );
        return `radial-gradient(ellipse ${radiusX}px ${radiusY}px at ${A.x}px ${A.y}px, ${stopStrings.join(", ")})`;
      }
      case "sweep": {
        const angle = Math.atan2(B.y - A.y, B.x - A.x) * (180 / Math.PI);
        return `conic-gradient(from ${angle}deg at ${A.x}px ${A.y}px, ${stopStrings.join(", ")})`;
      }
      default:
        return `linear-gradient(0deg, ${stopStrings.join(", ")})`;
    }
  }, [gradientType, state.stops, getControlPoints]);

  const { A, B, C } = getControlPoints();

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Advanced Gradient Editor</h1>
          <p>
            Professional gradient editor supporting linear, radial, and sweep
            gradients with 2D affine transforms.
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
                    onStateChange={handleChange}
                    readonly={readonly}
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
            {/* Transform controls */}
            {state.focusedControl && (
              <Card className="p-4">
                <div className="mb-2">
                  <span className="text-sm font-medium">
                    Control Point {state.focusedControl} -{" "}
                    {state.focusedControl === "A"
                      ? "Center/Start"
                      : state.focusedControl === "B"
                        ? "End/Radius"
                        : "Scale"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs">X Position</label>
                    <Input
                      type="number"
                      value={
                        state.focusedControl === "A"
                          ? Math.round(A.x)
                          : state.focusedControl === "B"
                            ? Math.round(B.x)
                            : Math.round(C.x)
                      }
                      onChange={(e) => {
                        if (readonly) return;
                        const newX = Number.parseInt(e.target.value) || 0;
                        const currentX =
                          state.focusedControl === "A"
                            ? A.x
                            : state.focusedControl === "B"
                              ? B.x
                              : C.x;

                        // Calculate the delta and update transform
                        const deltaX = newX - currentX;
                        if (state.focusedControl === "A") {
                          setState((prev) => ({
                            ...prev,
                            transform: {
                              ...prev.transform,
                              tx: prev.transform.tx + deltaX,
                            },
                          }));
                        } else if (state.focusedControl === "B") {
                          const scale = 100;
                          setState((prev) => ({
                            ...prev,
                            transform: {
                              ...prev.transform,
                              a: prev.transform.a + deltaX / scale,
                            },
                          }));
                        } else if (state.focusedControl === "C") {
                          const scale = 100;
                          // Calculate perpendicular direction for C point
                          const abLength = Math.sqrt(
                            state.transform.a * state.transform.a +
                              state.transform.d * state.transform.d
                          );
                          if (abLength > 0) {
                            const perpX = -state.transform.d / abLength;
                            setState((prev) => ({
                              ...prev,
                              transform: {
                                ...prev.transform,
                                b: prev.transform.b + (perpX * deltaX) / scale,
                              },
                            }));
                          }
                        }
                      }}
                      className="h-8"
                      disabled={readonly}
                    />
                  </div>
                  <div>
                    <label className="text-xs">Y Position</label>
                    <Input
                      type="number"
                      value={
                        state.focusedControl === "A"
                          ? Math.round(A.y)
                          : state.focusedControl === "B"
                            ? Math.round(B.y)
                            : Math.round(C.y)
                      }
                      onChange={(e) => {
                        if (readonly) return;
                        const newY = Number.parseInt(e.target.value) || 0;
                        const currentY =
                          state.focusedControl === "A"
                            ? A.y
                            : state.focusedControl === "B"
                              ? B.y
                              : C.y;

                        // Calculate the delta and update transform
                        const deltaY = newY - currentY;
                        if (state.focusedControl === "A") {
                          setState((prev) => ({
                            ...prev,
                            transform: {
                              ...prev.transform,
                              ty: prev.transform.ty + deltaY,
                            },
                          }));
                        } else if (state.focusedControl === "B") {
                          const scale = 100;
                          setState((prev) => ({
                            ...prev,
                            transform: {
                              ...prev.transform,
                              d: prev.transform.d + deltaY / scale,
                            },
                          }));
                        } else if (state.focusedControl === "C") {
                          const scale = 100;
                          // Calculate perpendicular direction for C point
                          const abLength = Math.sqrt(
                            state.transform.a * state.transform.a +
                              state.transform.d * state.transform.d
                          );
                          if (abLength > 0) {
                            const perpY = state.transform.a / abLength;
                            setState((prev) => ({
                              ...prev,
                              transform: {
                                ...prev.transform,
                                e: prev.transform.e + (perpY * deltaY) / scale,
                              },
                            }));
                          }
                        }
                      }}
                      className="h-8"
                      disabled={readonly}
                    />
                  </div>
                </div>
              </Card>
            )}

            {/* Color stop controls */}
            {state.focusedStop !== null &&
              (() => {
                const focusedStopData = state.stops[state.focusedStop];
                if (!focusedStopData) return null;

                return (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">
                        Color Stop {state.focusedStop + 1}
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (readonly) return;
                          if (state.stops.length > 2) {
                            setState((prev) => ({
                              ...prev,
                              stops: prev.stops.filter(
                                (_, index) => index !== state.focusedStop
                              ),
                              focusedStop: null,
                            }));
                          }
                        }}
                        disabled={state.stops.length <= 2 || readonly}
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
                          value={focusedStopData.offset.toFixed(2)} // Changed from position to offset
                          onChange={(e) => {
                            if (readonly) return;
                            const pos = Math.max(
                              0,
                              Math.min(
                                1,
                                Number.parseFloat(e.target.value) || 0
                              )
                            );
                            setState((prev) => ({
                              ...prev,
                              stops: prev.stops.map((s, index) =>
                                index === state.focusedStop
                                  ? { ...s, offset: pos } // Changed from position to offset
                                  : s
                              ),
                            }));
                          }}
                          className="h-8"
                          disabled={readonly}
                        />
                      </div>
                      <div>
                        <label className="text-xs">Color</label>
                        <Input
                          type="color"
                          value={rgbaToHex(focusedStopData.color)} // Convert RGBA8888 to hex
                          onChange={(e) => {
                            if (readonly) return;
                            const hex = e.target.value;
                            const newColor = hexToRgba(hex); // Convert hex to RGBA8888
                            setState((prev) => ({
                              ...prev,
                              stops: prev.stops.map((s, index) =>
                                index === state.focusedStop
                                  ? { ...s, color: newColor } // Use RGBA8888 format
                                  : s
                              ),
                            }));
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
                <div>Stops: {state.stops.length}</div>
                <div>
                  Focused:{" "}
                  {state.focusedStop
                    ? "Color Stop"
                    : state.focusedControl
                      ? `Point ${state.focusedControl}`
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
