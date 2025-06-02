"use client";
import * as React from "react";
import CanvasKitInit, { type CanvasKit } from "canvaskit-wasm";

class CanvasKitRenderer {
  private kit: CanvasKit | null = null;
  private surface: any = null;
  private canvas: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.__init();
  }

  private __init() {
    CanvasKitInit({
      locateFile: (file) =>
        "https://unpkg.com/canvaskit-wasm@latest/bin/" + file,
    }).then((CanvasKit) => {
      this.kit = CanvasKit;
      this.surface = this.kit.MakeWebGLCanvasSurface(this.canvas!);
      this.draw();
    });
  }

  private draw() {
    if (!this.kit || !this.surface) return;

    const canvas = this.surface.getCanvas();
    const paint = new this.kit.Paint();
    const textPaint = new this.kit.Paint();
    const font = new this.kit.Font(null, 20);

    // Clear canvas
    canvas.clear(this.kit.Color(255, 255, 255, 1.0));

    // Helper function to draw shapes with labels
    const drawShapeWithLabel = (
      x: number,
      y: number,
      drawFn: () => void,
      label: string
    ) => {
      // Draw shape
      drawFn();

      // Draw label
      textPaint.setColor(this.kit!.Color(0, 0, 0, 1.0));
      canvas.drawText(label, x, y + 100, textPaint, font);
    };

    // Rectangle
    drawShapeWithLabel(
      100,
      50,
      () => {
        paint.setColor(this.kit!.Color(255, 0, 0, 1.0));
        paint.setStyle(this.kit!.PaintStyle.Fill);
        canvas.drawRect(this.kit!.LTRBRect(100, 50, 200, 100), paint);
      },
      "Rectangle"
    );

    // Circle
    drawShapeWithLabel(
      300,
      50,
      () => {
        paint.setColor(this.kit!.Color(0, 255, 0, 1.0));
        paint.setStyle(this.kit!.PaintStyle.Fill);
        canvas.drawCircle(350, 75, 25, paint);
      },
      "Circle"
    );

    // Ellipse
    drawShapeWithLabel(
      500,
      50,
      () => {
        paint.setColor(this.kit!.Color(0, 0, 255, 1.0));
        paint.setStyle(this.kit!.PaintStyle.Fill);
        canvas.drawOval(this.kit!.LTRBRect(500, 50, 600, 100), paint);
      },
      "Ellipse"
    );

    // Triangle (Polygon)
    drawShapeWithLabel(
      100,
      200,
      () => {
        paint.setColor(this.kit!.Color(255, 165, 0, 1.0));
        paint.setStyle(this.kit!.PaintStyle.Fill);
        const path = new this.kit!.Path();
        path.moveTo(150, 200);
        path.lineTo(100, 250);
        path.lineTo(200, 250);
        path.close();
        canvas.drawPath(path, paint);
      },
      "Triangle"
    );

    // Line
    drawShapeWithLabel(
      300,
      200,
      () => {
        paint.setColor(this.kit!.Color(128, 0, 128, 1.0));
        paint.setStyle(this.kit!.PaintStyle.Stroke);
        paint.setStrokeWidth(3);
        canvas.drawLine(300, 225, 400, 225, paint);
      },
      "Line"
    );

    // Text
    drawShapeWithLabel(
      500,
      200,
      () => {
        paint.setColor(this.kit!.Color(0, 128, 128, 1.0));
        canvas.drawText("Hello", 500, 225, paint, font);
      },
      "Text"
    );

    // SVG Path
    drawShapeWithLabel(
      100,
      350,
      () => {
        paint.setColor(this.kit!.Color(255, 192, 203, 1.0));
        paint.setStyle(this.kit!.PaintStyle.Fill);
        const path = new this.kit!.Path();
        // Draw a heart shape
        path.moveTo(150, 350);
        path.cubicTo(150, 350, 100, 300, 100, 350);
        path.cubicTo(100, 400, 150, 450, 150, 450);
        path.cubicTo(150, 450, 200, 400, 200, 350);
        path.cubicTo(200, 300, 150, 350, 150, 350);
        canvas.drawPath(path, paint);
      },
      "SVG Path"
    );

    this.surface.flush();
  }
}

export default function SkiaCanvasKitExperimentalPage() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = React.useRef<CanvasKitRenderer | null>(null);

  React.useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = new CanvasKitRenderer(canvasRef.current);
    }
  }, []);

  return (
    <main className="w-dvw h-dvh flex items-center justify-center bg-gray-50">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="border border-gray-300 bg-white shadow-lg"
      />
    </main>
  );
}
