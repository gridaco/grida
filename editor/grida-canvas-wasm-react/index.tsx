"use client";
import React, { useLayoutEffect } from "react";
import init, { Grida2D } from "@grida/canvas-wasm";
import { useSize } from "@/grida-canvas-react/viewport/size";
import cmath from "@grida/cmath";
import grida from "@grida/schema";
import locateFile from "./locate-file";

function CanvasContent({
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
      rendererRef.current.resize(width, height);
      syncTransform(rendererRef.current, transform, width, height);
    }
  }, [width, height]);

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
      width={width}
      height={height}
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
  return (
    <CanvasContent
      width={size.width}
      height={size.height}
      data={data}
      transform={transform}
      debug={debug}
      onMount={onMount}
      className={className}
    />
  );
}
