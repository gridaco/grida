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
    height: number,
    devicePixelRatio: number
  ) => {
    const safeDpr =
      Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
        ? devicePixelRatio
        : 1;

    // the transform is the canvas transform, which needs to be converted to camera transform.
    // input transform = translation + scale of the viewport, top left aligned
    // camera transform = transform of the camera, center aligned
    // - translate the transform to the center of the canvas
    // - reverse the transform to match the canvas coordinate system

    const toCenter = cmath.transform.translate(cmath.transform.identity, [
      (-width * safeDpr) / 2,
      (-height * safeDpr) / 2,
    ]);

    const deviceScale: cmath.Transform = [
      [safeDpr, 0, 0],
      [0, safeDpr, 0],
    ];

    const physicalTransform = cmath.transform.multiply(deviceScale, transform);

    const viewMatrix = cmath.transform.multiply(toCenter, physicalTransform);

    surface.setMainCameraTransform(cmath.transform.invert(viewMatrix));
    surface.redraw();
  };

  useLayoutEffect(() => {
    if (rendererRef.current) {
      syncTransform(rendererRef.current, transform, width, height, dpr);
    }
  }, [transform, width, height, dpr]);

  useLayoutEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.resize(width * dpr, height * dpr);
      syncTransform(rendererRef.current, transform, width, height, dpr);
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
  const [dpr, setDPR] = useState<number>(() => {
    if (typeof window === "undefined") {
      return 1;
    }
    const ratio = window.devicePixelRatio;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const update = () => {
      const ratio = window.devicePixelRatio;
      const next = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
      setDPR((prev) => (Math.abs(prev - next) > 1e-3 ? next : prev));
    };

    update();

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    let mediaQuery: MediaQueryList | null = null;
    let mediaQueryListener: ((event: MediaQueryListEvent) => void) | null =
      null;

    // Listen for DPR changes (e.g., when moving between displays or browser zoom)
    if (typeof window.matchMedia === "function") {
      mediaQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
      mediaQueryListener = () => update();
      mediaQuery.addEventListener("change", mediaQueryListener);
    }

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      if (mediaQuery && mediaQueryListener) {
        mediaQuery.removeEventListener("change", mediaQueryListener);
      }
    };
  }, [dpr]);

  return dpr;
}

export default function Canvas({
  initialSize,
  data,
  transform,
  debug,
  highlightStrokes,
  onMount,
  className,
}: {
  initialSize: { width: number; height: number };
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
  const size = useSize(initialSize);
  const dpr = useDPR();
  return (
    <CanvasContent
      width={size.width}
      height={size.height}
      dpr={dpr}
      data={data}
      transform={transform}
      debug={debug}
      highlightStrokes={highlightStrokes}
      onMount={onMount}
      className={className}
    />
  );
}
