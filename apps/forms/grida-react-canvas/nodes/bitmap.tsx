import React, { useEffect, useRef } from "react";
import queryattributes from "./utils/attributes";
import { grida } from "@/grida";

export const BitmapWidget = ({
  width,
  height,
  data,
  dataframe,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.BitmapNode>) => {
  const { objectFit, objectPosition, ...divStyles } = style || {};

  return (
    <div
      style={{ ...divStyles, overflow: "hidden" }}
      {...queryattributes(props)}
    >
      <BitmapViewer
        width={width}
        height={height}
        data={data}
        frame={dataframe}
      />
    </div>
  );
};

BitmapWidget.type = "bitmap";

interface BitmapViewerProps {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  frame?: number;
}

export const BitmapViewer: React.FC<BitmapViewerProps> = ({
  width,
  height,
  data,
  frame,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BitmapRenderer>();

  useEffect(() => {
    if (!containerRef.current) return;
    rendererRef.current = new BitmapRenderer(width, height, data, {
      antialias: false,
    });
    rendererRef.current.mount(containerRef.current);
    rendererRef.current.render();
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      rendererRef.current = undefined;
    };
  }, [width, height, data, frame]);

  return <div ref={containerRef} />;
};

class BitmapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData;

  constructor(
    width: number,
    height: number,
    data: Uint8ClampedArray,
    { antialias = false } = {}
  ) {
    // Just make the canvas exactly match the bitmap.
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    // Disable smoothing and force pixelated rendering
    this.canvas.style.imageRendering = "pixelated";
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = antialias;

    // Convert data to ImageData
    this.imageData = new ImageData(data, width, height);
  }

  mount(container: HTMLElement) {
    container.appendChild(this.canvas);
  }

  render() {
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
