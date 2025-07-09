/**
 * Complete example showing how to integrate DPR handling with WASM canvas backend
 */

import React, { useEffect, useRef, useState } from "react";
import { Editor } from "@/grida-canvas/editor";
import { CanvasWasmGeometryQueryInterfaceProvider } from "@/grida-canvas/backends/wasm";
import Canvas from "@/grida-canvas-wasm-react";
import type { Grida2D } from "@grida/canvas-wasm";
import cmath from "@grida/cmath";
import grida from "@grida/schema";

interface DPRCanvasEditorProps {
  width: number;
  height: number;
  document: grida.program.document.Document | null;
}

export function DPRCanvasEditor({ width, height, document }: DPRCanvasEditorProps) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [surface, setSurface] = useState<Grida2D | null>(null);
  const [dpr, setDpr] = useState(1);
  const geometryRef = useRef<CanvasWasmGeometryQueryInterfaceProvider | null>(null);

  // Monitor DPR changes
  useEffect(() => {
    const updateDPR = () => {
      const newDpr = window.devicePixelRatio || 1;
      setDpr(newDpr);
      
      // Update geometry provider DPR
      if (geometryRef.current) {
        geometryRef.current.updateDPR(newDpr);
      }
    };

    updateDPR();
    window.addEventListener('resize', updateDPR);
    
    // Listen for display changes (when window moves between displays)
    const mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mediaQuery.addEventListener('change', updateDPR);

    return () => {
      window.removeEventListener('resize', updateDPR);
      mediaQuery.removeEventListener('change', updateDPR);
    };
  }, []);

  // Initialize editor when surface is ready
  useEffect(() => {
    if (!surface) return;

    const geometry = new CanvasWasmGeometryQueryInterfaceProvider(
      editor!, // Will be set by editor creation
      surface,
      dpr
    );
    geometryRef.current = geometry;

    const newEditor = new Editor(
      "canvas",
      "viewport", // viewport element ID
      surface,
      geometry,
      {
        document: document,
        scene_id: "main",
        transform: cmath.transform.identity,
      }
    );

    setEditor(newEditor);

    return () => {
      newEditor.dispose?.();
    };
  }, [surface, dpr, document]);

  // Handle surface mount
  const handleSurfaceMount = (grida: Grida2D) => {
    setSurface(grida);
  };

  // Handle mouse events with proper DPR scaling
  const handleMouseEvent = (event: React.MouseEvent) => {
    if (!editor) return;

    // The editor's clientPointToCanvasPoint method will handle coordinate conversion
    // The geometry provider will handle DPR scaling when communicating with WASM
    switch (event.type) {
      case 'mousemove':
        editor.pointerMove(event.nativeEvent as PointerEvent);
        break;
      case 'mousedown':
        editor.pointerDown(event.nativeEvent as PointerEvent);
        break;
      case 'mouseup':
        editor.pointerUp(event.nativeEvent as PointerEvent);
        break;
      case 'click':
        editor.click(event.nativeEvent as MouseEvent);
        break;
    }
  };

  // Handle wheel events with DPR consideration
  const handleWheel = (event: React.WheelEvent) => {
    if (!editor) return;

    event.preventDefault();
    const point = editor.clientPointToCanvasPoint([event.clientX, event.clientY]);
    
    if (event.ctrlKey) {
      // Zoom
      editor.zoom(event.deltaY * -0.01, point);
    } else {
      // Pan
      editor.pan([event.deltaX, event.deltaY]);
    }
  };

  return (
    <div 
      id="viewport"
      style={{ width, height, position: 'relative', overflow: 'hidden' }}
      onMouseMove={handleMouseEvent}
      onMouseDown={handleMouseEvent}
      onMouseUp={handleMouseEvent}
      onClick={handleMouseEvent}
      onWheel={handleWheel}
    >
      <Canvas
        width={width}
        height={height}
        data={document}
        transform={editor?.transform ?? cmath.transform.identity}
        onMount={handleSurfaceMount}
        className="absolute inset-0"
      />
      
      {/* Debug info */}
      <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-sm p-2 rounded">
        DPR: {dpr.toFixed(2)}
        <br />
        Canvas: {width}×{height}
        <br />
        Physical: {Math.round(width * dpr)}×{Math.round(height * dpr)}
      </div>
    </div>
  );
}

// Usage example:
export function App() {
  const [document, setDocument] = useState<grida.program.document.Document | null>(null);

  useEffect(() => {
    // Load your document here
    const exampleDocument: grida.program.document.Document = {
      // Your document structure
    };
    setDocument(exampleDocument);
  }, []);

  return (
    <div className="w-full h-screen">
      <DPRCanvasEditor 
        width={800} 
        height={600} 
        document={document} 
      />
    </div>
  );
}

// Advanced: Custom hook for DPR management
export function useDPRManager() {
  const [dpr, setDpr] = useState(1);
  const geometryRef = useRef<CanvasWasmGeometryQueryInterfaceProvider | null>(null);

  const updateDPR = (newDpr: number) => {
    setDpr(newDpr);
    if (geometryRef.current) {
      geometryRef.current.updateDPR(newDpr);
    }
  };

  const registerGeometry = (geometry: CanvasWasmGeometryQueryInterfaceProvider) => {
    geometryRef.current = geometry;
    geometry.updateDPR(dpr);
  };

  useEffect(() => {
    const handleDPRChange = () => {
      const newDpr = window.devicePixelRatio || 1;
      updateDPR(newDpr);
    };

    handleDPRChange();
    
    const mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mediaQuery.addEventListener('change', handleDPRChange);
    window.addEventListener('resize', handleDPRChange);

    return () => {
      mediaQuery.removeEventListener('change', handleDPRChange);
      window.removeEventListener('resize', handleDPRChange);
    };
  }, []);

  return {
    dpr,
    updateDPR,
    registerGeometry,
  };
}