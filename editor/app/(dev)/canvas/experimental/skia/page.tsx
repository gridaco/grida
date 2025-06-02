"use client";
import * as React from "react";
import { CanvasKitRenderer } from "@grida/skia";
import type grida from "@grida/schema";

const imageNode: grida.program.nodes.ImageNode = {
  type: "image",
  id: "1",
  name: "Image",
  active: true,
  locked: false,
  style: {},
  opacity: 1,
  rotation: 0,
  zIndex: 0,
  position: "absolute",
  left: 300,
  top: 300,
  width: 100,
  height: 100,
  fit: "contain",
  src: "/images/abstract-placeholder.jpg",
  cornerRadius: 0,
};

const textNode: grida.program.nodes.TextNode = {
  type: "text",
  id: "1",
  name: "Text",
  active: true,
  locked: false,
  style: {},
  fontFamily: "Arial",
  opacity: 1,
  rotation: 0,
  zIndex: 0,
  position: "absolute",
  width: 200,
  height: 100,
  textAlign: "left",
  textAlignVertical: "top",
  textDecoration: "none",
  fontSize: 16,
  fontWeight: 100,
  text: "Hello, world!",
};

const lineNode: grida.program.nodes.LineNode = {
  type: "line",
  id: "1",
  name: "Line",
  active: true,
  locked: false,
  height: 0,
  top: 50,
  left: 100,
  position: "absolute",
  stroke: { type: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
  strokeWidth: 1,
  strokeCap: "butt",
  width: 200,
  opacity: 1,
  zIndex: 0,
  rotation: 0,
};

const rectNode: grida.program.nodes.RectangleNode = {
  type: "rectangle",
  id: "1",
  name: "Rectangle",
  active: true,
  locked: false,
  position: "absolute",
  left: 100,
  top: 50,
  width: 200,
  height: 100,
  fill: { type: "solid", color: { r: 255, g: 0, b: 0, a: 1 } },
  stroke: { type: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
  strokeWidth: 4,
  cornerRadius: 12,
  opacity: 0.8,
  rotation: 15,
  zIndex: 0,
  strokeCap: "butt",
  effects: [],
};

const ellipseNode: grida.program.nodes.EllipseNode = {
  type: "ellipse",
  id: "1",
  name: "Ellipse",
  active: true,
  locked: false,
  position: "absolute",
  left: 100,
  top: 200,
  width: 100,
  height: 200,
  fill: { type: "solid", color: { r: 0, g: 0, b: 255, a: 1 } },
  stroke: { type: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
  strokeWidth: 4,
  opacity: 0.8,
  rotation: 15,
  zIndex: 0,
  strokeCap: "butt",
  effects: [],
};

export default function SkiaCanvasKitExperimentalPage() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = React.useRef<CanvasKitRenderer | null>(null);

  React.useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      const renderer = new CanvasKitRenderer(canvasRef.current);
      rendererRef.current = renderer;
      renderer.setNodes([imageNode, textNode, lineNode, rectNode, ellipseNode]);
    }
  }, []);

  return (
    <main className="w-dvw h-dvh flex flex-col items-center gap-10 justify-center">
      <header className="w-full flex items-center justify-center">
        <h1 className="text-2xl font-bold">
          Grida Canvas <span className="text-sm font-mono">SKIA BACKEND</span>
        </h1>
      </header>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="border border-gray-300 bg-white shadow-lg"
      />
    </main>
  );
}
