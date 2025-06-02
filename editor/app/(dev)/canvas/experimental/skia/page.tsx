"use client";
import * as React from "react";
import CanvasKitInit, {
  type Color,
  type CanvasKit,
  type Surface,
  Paint,
} from "canvaskit-wasm";
import type grida from "@grida/schema";
import cg from "@grida/cg";

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

class CanvasKitRenderer {
  private kit: CanvasKit | null = null;
  private get $kit(): CanvasKit {
    return this.kit!;
  }
  private surface: Surface | null = null;
  private canvas: HTMLCanvasElement | null = null;

  private _fillPaint: Paint | null = null;
  private _strokePaint: Paint | null = null;
  private _textPaint: Paint | null = null;

  private get $fillPaint(): Paint {
    if (!this._fillPaint) {
      this._fillPaint = new this.$kit.Paint();
    }
    return this._fillPaint;
  }
  private get $strokePaint(): Paint {
    if (!this._strokePaint) {
      this._strokePaint = new this.$kit.Paint();
    }
    return this._strokePaint;
  }
  private get $textPaint(): Paint {
    if (!this._textPaint) {
      this._textPaint = new this.$kit.Paint();
    }
    return this._textPaint;
  }

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
      this._fillPaint = new this.$kit.Paint();
      this._strokePaint = new this.$kit.Paint();
      this._strokePaint.setStyle(this.$kit.PaintStyle.Stroke);
      this.drawDemo();
    });
  }

  private drawDemo() {
    if (!this.kit || !this.surface) return;
    const canvas = this.surface.getCanvas();

    // Clear white
    canvas.clear(this.kit.Color(255, 255, 255, 1));

    // Example RectangleNode data

    this.$draw(rectNode);
    this.surface.flush();
  }

  private $draw(node: grida.program.nodes.Node) {
    switch (node.type) {
      case "rectangle":
        this.renderRectangle(node as grida.program.nodes.RectangleNode);
        break;
      default:
        throw new Error("Unsupported node type");
    }
  }

  private $fill(p: cg.Paint | null): Paint {
    this.$fillPaint.setAntiAlias(true);

    if (!p) {
      this.$fillPaint.setStyle(this.$kit.PaintStyle.Fill);
      this.$fillPaint.setColor(this.$kit.Color(0, 0, 0, 0));
      return this.$fillPaint;
    }

    switch (p.type) {
      case "solid":
        this.$fillPaint.setStyle(this.$kit.PaintStyle.Fill);
        this.$fillPaint.setColor(
          this.$kit.Color(p.color.r, p.color.g, p.color.b, p.color.a)
        );
        return this.$fillPaint;
      default:
        throw new Error("Unsupported fill");
    }
  }

  private $stroke(p: cg.Paint | null, width: number): Paint {
    this.$strokePaint.setAntiAlias(true);

    if (!p) {
      this.$strokePaint.setStyle(this.$kit.PaintStyle.Stroke);
      this.$strokePaint.setStrokeWidth(width);
      this.$strokePaint.setColor(this.$kit.Color(0, 0, 0, 0));
      return this.$strokePaint;
    }
    switch (p.type) {
      case "solid":
        this.$strokePaint.setStyle(this.$kit.PaintStyle.Stroke);
        this.$strokePaint.setStrokeWidth(width);
        this.$strokePaint.setColor(
          this.$kit.Color(p.color.r, p.color.g, p.color.b, p.color.a)
        );
        return this.$strokePaint;
      default:
        throw new Error("Unsupported stroke");
    }
  }

  private renderRectangle(node: grida.program.nodes.RectangleNode) {
    if (!this.kit) return;
    if (!this.surface) return;
    const { left: x = 0, top: y = 0, width, height } = node;
    const paint = new this.kit.Paint();
    const innerRect = this.kit.LTRBRect(x, y, x + width, y + height);
    const rrect = this.kit.RRectXY(
      innerRect,
      typeof node.cornerRadius === "number" ? node.cornerRadius : 0,
      typeof node.cornerRadius === "number" ? node.cornerRadius : 0
    );

    const canvas = this.surface.getCanvas();
    // Apply rotation & opacity via save() / restore()
    canvas.restore();
    canvas.save();

    // move pivot to rect center, rotate, then restore pivot
    if (node.rotation) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      canvas.translate(cx, cy);
      canvas.rotate(node.rotation, cx, cy);
      canvas.translate(-cx, -cy);
    }

    // Fill
    canvas.drawRRect(rrect, this.$fill(node.fill ?? null));

    // Stroke (if provided)
    canvas.drawRRect(
      rrect,
      this.$stroke(node.stroke ?? null, node.strokeWidth)
    );

    canvas.restore();
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
