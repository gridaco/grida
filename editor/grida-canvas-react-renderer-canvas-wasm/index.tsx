"use client";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { Grida2D } from "@grida/canvas-wasm";
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
  onMount?: (surface: Grida2D) => void;
  className?: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const { surface, ready } = useGrida2D(canvasRef);

  // onMount once surface is ready
  useLayoutEffect(() => {
    if (ready && surface) {
      onMount?.(surface);
    }
  }, [ready, surface, onMount]);

  // debug toggle
  useLayoutEffect(() => {
    if (ready && surface) {
      surface.setDebug(debug ?? false);
    }
  }, [ready, surface, debug]);

  const syncTransform = (
    surface: Grida2D,
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

  // sync transform when ready or dependencies change
  useLayoutEffect(() => {
    if (ready && surface) {
      syncTransform(surface, transform, width, height);
    }
  }, [ready, surface, transform, width, height]);

  // resize when ready or size/dpr change
  useLayoutEffect(() => {
    if (ready && surface) {
      surface.resize(width * dpr, height * dpr);
      syncTransform(surface, transform, width, height);
    }
  }, [ready, surface, width, height, dpr]);

  // load data once ready or when data changes
  useLayoutEffect(() => {
    if (ready && surface && data) {
      surface.loadScene(
        JSON.stringify({
          version: "0.0.1-beta.1+20250728",
          document: data,
        })
      );
      surface.redraw();
    }
  }, [ready, surface, data]);

  // highlight strokes update
  useLayoutEffect(() => {
    if (ready && surface) {
      surface.highlightStrokes(highlightStrokes);
      surface.redraw();
    }
  }, [ready, surface, highlightStrokes]);

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
  onMount?: (surface: Grida2D) => void;
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
