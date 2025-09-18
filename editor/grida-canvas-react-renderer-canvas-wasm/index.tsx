"use client";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { Scene } from "@grida/canvas-wasm";
import { useSize } from "@/grida-canvas-react/viewport/size";
import cmath from "@grida/cmath";
import grida from "@grida/schema";
import { useGrida2D } from "./use-grida2d";

function CanvasContent({
  width,
  height,
  data,
  transform,
  debug,
  highlightStrokes,
  onMount,
  className,
  dpr,
}: {
  width: number;
  height: number;
  dpr: number;
  data: grida.program.document.Document | null;
  transform: cmath.Transform;
  debug?: boolean;
  highlightStrokes?: {
    nodes: string[];
    style?: { strokeWidth?: number; stroke?: string };
  };
  onMount?: (surface: Scene) => void;
  className?: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = useGrida2D(canvasRef, onMount);

  useLayoutEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setDebug(debug ?? false);
    }
  }, [rendererRef.current, debug]);

  const syncTransform = (
    surface: Scene,
    transform: cmath.Transform,
    width: number,
    height: number
  ) => {
    // the transform is the canvas transform, which needs to be converted to camera transform.
    // input transform = translation + scale of the viewport, top left aligned
    // camera transform = transform of the camera, center aligned
    // - translate the transform to the center of the canvas
    // - reverse the transform to match the canvas coordinate system

    const toCenter = cmath.transform.translate(cmath.transform.identity, [
      -width / 2,
      -height / 2,
    ]);

    const viewMatrix = cmath.transform.multiply(toCenter, transform);

    surface.setMainCameraTransform(cmath.transform.invert(viewMatrix));
    surface.redraw();
  };

  useLayoutEffect(() => {
    if (rendererRef.current) {
      syncTransform(rendererRef.current, transform, width, height);
    }
  }, [transform, width, height]);

  useLayoutEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.resize(width * dpr, height * dpr);
      syncTransform(rendererRef.current, transform, width, height);
    }
  }, [width, height, dpr]);

  useLayoutEffect(() => {
    if (rendererRef.current && data) {
      rendererRef.current.loadScene(
        JSON.stringify({
          version: "0.0.1-beta.1+20250728",
          document: data,
        })
      );
      rendererRef.current.redraw();
    }
  }, [data]);

  useLayoutEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.highlightStrokes(highlightStrokes);
      rendererRef.current.redraw();
    }
  }, [highlightStrokes]);

  return (
    <canvas
      ref={canvasRef}
      width={width * dpr}
      height={height * dpr}
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
      className={className}
    />
  );
}

function useDPR() {
  const [dpr, setDPR] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDPR(window.devicePixelRatio);
    }
  }, []);
  return dpr;
}

export default function Canvas({
  width,
  height,
  data,
  transform,
  debug,
  highlightStrokes,
  onMount,
  className,
}: {
  width: number;
  height: number;
  data: grida.program.document.Document | null;
  transform: cmath.Transform;
  debug?: boolean;
  highlightStrokes?: {
    nodes: string[];
    style?: { strokeWidth?: number; stroke?: string };
  };
  onMount?: (surface: Scene) => void;
  className?: string;
}) {
  const size = useSize({ width, height });
  // const dpr = useDPR();
  const dpr = 1;
  return (
    <CanvasContent
      width={size.width}
      height={size.height}
      dpr={dpr ?? 1}
      data={data}
      transform={transform}
      debug={debug}
      highlightStrokes={highlightStrokes}
      onMount={onMount}
      className={className}
    />
  );
}
