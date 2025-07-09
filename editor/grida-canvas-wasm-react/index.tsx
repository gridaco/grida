"use client";
import React, { useLayoutEffect, useEffect, useState } from "react";
import init, { Grida2D } from "@grida/canvas-wasm";
import { useSize } from "@/grida-canvas-react/viewport/size";
import cmath from "@grida/cmath";
import grida from "@grida/schema";
import locateFile from "./locate-file";

function useDPR() {
  const [dpr, setDPR] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDPR(window.devicePixelRatio);
    }
  }, []);
  return dpr;
}

function CanvasContent({
  width,
  height,
  data,
  transform,
  debug,
  onMount,
  className,
  dpr,
}: {
  width: number;
  height: number;
  data: grida.program.document.Document | null;
  transform: cmath.Transform;
  debug?: boolean;
  onMount?: (surface: Grida2D) => void;
  className?: string;
  dpr: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = React.useRef<Grida2D | null>(null);

  useLayoutEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      const canvasel = canvasRef.current;
      init({
        locateFile: locateFile,
      }).then((factory) => {
        console.log("grida wasm initialized");
        const grida = factory.createWebGLCanvasSurface(canvasel);
        // grida.setDebug(false);

        rendererRef.current = grida;
        onMount?.(grida);

        // start the ticker
        const loop = () => {
          grida.tick();
          requestAnimationFrame(loop);
        };

        loop();
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setDebug(debug ?? false);
    }
  }, [rendererRef.current, debug]);

  const syncTransform = (
    surface: Grida2D,
    transform: cmath.Transform,
    width: number,
    height: number,
    dpr: number
  ) => {
    // the transform is the canvas transform, which needs to be converted to camera transform.
    // input transform = translation + scale of the viewport, top left aligned
    // camera transform = transform of the camera, center aligned
    // - translate the transform to the center of the canvas
    // - reverse the transform to match the canvas coordinate system
    // - account for DPR scaling

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
      syncTransform(rendererRef.current, transform, width, height, dpr);
    }
  }, [transform, width, height, dpr]);

  useLayoutEffect(() => {
    if (rendererRef.current) {
      // Resize the WASM surface to physical pixels
      rendererRef.current.resize(width * dpr, height * dpr);
      syncTransform(rendererRef.current, transform, width, height, dpr);
    }
  }, [width, height, dpr]);

  useLayoutEffect(() => {
    if (rendererRef.current && data) {
      rendererRef.current.loadScene(
        JSON.stringify({
          version: "0.0.1-beta.1+20250303",
          document: data,
        })
      );
      rendererRef.current.redraw();
    }
  }, [data]);

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

export default function Canvas({
  width,
  height,
  data,
  transform,
  debug,
  onMount,
  className,
}: {
  width: number;
  height: number;
  data: grida.program.document.Document | null;
  transform: cmath.Transform;
  debug?: boolean;
  onMount?: (surface: Grida2D) => void;
  className?: string;
}) {
  const size = useSize({ width, height });
  const dpr = useDPR();
  
  if (dpr === null) {
    return null; // Wait for DPR to be available
  }

  return (
    <CanvasContent
      width={size.width}
      height={size.height}
      dpr={dpr}
      data={data}
      transform={transform}
      debug={debug}
      onMount={onMount}
      className={className}
    />
  );
}
