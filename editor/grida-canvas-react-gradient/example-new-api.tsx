/**
 * Example of using the new GradientControlPointsEditor with clean data-event model
 */

import React, { useState, useCallback } from "react";
import GradientControlPointsEditor, { type Point } from "./gradient-control-points-editor";
import { useGradientEditorIntegration } from "./use-gradient-editor-integration";
import type cg from "@grida/cg";

// Example 1: Using GradientControlPointsEditor directly with manual state management
export function DirectAPIExample() {
  const [stops, setStops] = useState<{ offset: number; color: cg.RGBA8888 }[]>([
    { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
    { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
  ]);
  
  const [focusedStop, setFocusedStop] = useState<number | null>(null);
  
  const [points, setPoints] = useState<[Point, Point, Point]>([
    { x: 0, y: 0.5 },    // A
    { x: 1, y: 0.5 },    // B  
    { x: 0, y: 1 },      // C
  ]);

  const handlePositionChange = useCallback((index: number, position: number) => {
    setStops(prev => {
      const newStops = [...prev];
      newStops[index] = { ...newStops[index], offset: position };
      return newStops.sort((a, b) => a.offset - b.offset);
    });
  }, []);

  const handleInsertStop = useCallback((at: number, position: number) => {
    // Simple interpolation for demo
    const newColor: cg.RGBA8888 = { r: 128, g: 128, b: 128, a: 1 };
    setStops(prev => [...prev, { offset: position, color: newColor }].sort((a, b) => a.offset - b.offset));
  }, []);

  const handleDeleteStop = useCallback((index: number) => {
    if (stops.length <= 2) return;
    setStops(prev => prev.filter((_, i) => i !== index));
    setFocusedStop(null);
  }, [stops.length]);

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4">Direct API Example</h3>
      <GradientControlPointsEditor
        width={400}
        height={300}
        gradientType="linear"
        stops={stops}
        focusedStop={focusedStop}
        points={points}
        onPointsChange={setPoints}
        onPositionChange={handlePositionChange}
        onInsertStop={handleInsertStop}
        onDeleteStop={handleDeleteStop}
        onFocusedStopChange={setFocusedStop}
      />
      
      <div className="mt-4 text-sm">
        <p>Stops: {stops.length}</p>
        <p>Focused: {focusedStop}</p>
        <p>Points: A({points[0].x.toFixed(2)}, {points[0].y.toFixed(2)})</p>
      </div>
    </div>
  );
}

// Example 2: Using with the integration hook (recommended for editor integration)
export function IntegratedAPIExample() {
  const [gradient, setGradient] = useState<cg.GradientPaint>({
    type: "linear_gradient",
    stops: [
      { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
      { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
    ],
    transform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
  });

  const integration = useGradientEditorIntegration({
    gradient,
    width: 400,
    height: 300,
    onGradientChange: setGradient,
  });

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4">Integrated API Example</h3>
      <GradientControlPointsEditor
        width={400}
        height={300}
        gradientType={integration.gradientType}
        stops={integration.stops}
        focusedStop={integration.focusedStop}
        points={integration.points}
        onPointsChange={integration.onPointsChange}
        onPositionChange={integration.onPositionChange}
        onInsertStop={integration.onInsertStop}
        onDeleteStop={integration.onDeleteStop}
        onFocusedStopChange={integration.onFocusedStopChange}
      />
      
      <div className="mt-4 text-sm">
        <p>Type: {gradient.type}</p>
        <p>Stops: {gradient.stops.length}</p>
        <p>Transform: [{gradient.transform[0].join(", ")}], [{gradient.transform[1].join(", ")}]</p>
      </div>
    </div>
  );
}

// Example showing the difference
export function ComparisonExample() {
  return (
    <div className="p-4 space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-4">New Clean API Examples</h2>
        <p className="text-gray-600 mb-6">
          The new GradientControlPointsEditor uses a clean data-event model without complex state management.
          No more controlled/uncontrolled issues or infinite update loops!
        </p>
      </div>
      
      <DirectAPIExample />
      <IntegratedAPIExample />
      
      <div className="mt-8 p-4 bg-gray-100 rounded">
        <h4 className="font-semibold mb-2">Key Benefits:</h4>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Clean separation between UI and state management</li>
          <li>No controlled/uncontrolled value issues</li>
          <li>Easy to integrate with external state sources</li>
          <li>Predictable data flow with explicit event handlers</li>
          <li>Transform computation happens on onPointsChange</li>
        </ul>
      </div>
    </div>
  );
}