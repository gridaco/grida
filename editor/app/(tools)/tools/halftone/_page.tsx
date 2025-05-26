"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/scaffolds/sidecontrol/controls/color-picker";
import cmath from "@grida/cmath";
import type cg from "@grida/cg";
import { DownloadIcon } from "lucide-react";

const DEFAULT_GRID = 8;
const MAX_SIZE = 1024; // px – down‑scale large uploads

type Shape = "circle" | "square" | "triangle" | "star" | "spark" | "x" | "+";

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  cx: number,
  cy: number,
  radius: number
) {
  switch (shape) {
    case "square": {
      ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
      break;
    }
    case "triangle": {
      const h = radius * Math.sqrt(3);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx - h / 2, cy + radius / 2);
      ctx.lineTo(cx + h / 2, cy + radius / 2);
      ctx.closePath();
      break;
    }
    case "star": {
      const spikes = 5;
      const step = Math.PI / spikes;
      const inner = radius * 0.5;
      ctx.moveTo(cx, cy - radius);
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? radius : inner;
        const ang = -Math.PI / 2 + i * step;
        ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      }
      ctx.closePath();
      break;
    }
    case "spark": {
      const spikes = 4;
      const step = Math.PI / spikes;
      const inner = radius * 0.4;
      ctx.moveTo(cx, cy - radius);
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? radius : inner;
        const ang = -Math.PI / 2 + i * step;
        ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      }
      ctx.closePath();
      break;
    }
    case "x": {
      // rotated plus (X)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4); // 45°
      ctx.rect(-radius / 3, -radius, (radius / 3) * 2, radius * 2); // vertical bar
      ctx.rect(-radius, -radius / 3, radius * 2, (radius / 3) * 2); // horizontal bar
      ctx.restore();
      break;
    }
    case "+": {
      // plus sign
      ctx.rect(cx - radius / 3, cy - radius, (radius / 3) * 2, radius * 2); // vertical bar
      ctx.rect(cx - radius, cy - radius / 3, radius * 2, (radius / 3) * 2); // horizontal bar
      break;
    }
    default: {
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    }
  }
}

/** Perceived luminance (ITU‑R BT.601) mapped to 0–1 */
function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Render halftone dots from raw pixel data */
function renderHalftone(
  ctx: CanvasRenderingContext2D,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  shape: Shape,
  grid: number,
  maxRadius: number,
  gamma: number,
  jitter: number,
  opacity: number,
  color: string
) {
  ctx.clearRect(0, 0, width, height);

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;

  for (let y = 0; y < height; y += grid) {
    for (let x = 0; x < width; x += grid) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const brightness = luminance(r, g, b);
      const mapped = Math.pow(brightness, gamma); // gamma curve
      let radius = (1 - mapped) * maxRadius; // scale
      radius = Math.min(radius, maxRadius); // cap

      // cell‑center plus jitter
      const jx = (Math.random() * 2 - 1) * jitter;
      const jy = (Math.random() * 2 - 1) * jitter;
      const cx = x + grid / 2 + jx;
      const cy = y + grid / 2 + jy;

      ctx.beginPath();
      drawShape(ctx, shape, cx, cy, radius);
      ctx.fill();
    }
  }

  ctx.globalAlpha = prevAlpha;
}

/**
 * Trigger a browser download from a Blob.
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Convert one halftone cell to an SVG snippet.
 */
function shapeToSVG(shape: Shape, cx: number, cy: number, r: number): string {
  switch (shape) {
    case "square":
      return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" />`;
    case "triangle": {
      const h = r * Math.sqrt(3);
      const p1 = `${cx},${cy - r}`;
      const p2 = `${cx - h / 2},${cy + r / 2}`;
      const p3 = `${cx + h / 2},${cy + r / 2}`;
      return `<polygon points="${p1} ${p2} ${p3}" />`;
    }
    case "star": {
      const spikes = 5;
      const step = Math.PI / spikes;
      const inner = r * 0.5;
      const pts: string[] = [];
      for (let i = 0; i < spikes * 2; i++) {
        const rad = i % 2 === 0 ? r : inner;
        const ang = -Math.PI / 2 + i * step;
        pts.push(`${cx + Math.cos(ang) * rad},${cy + Math.sin(ang) * rad}`);
      }
      return `<polygon points="${pts.join(" ")}" />`;
    }
    case "spark": {
      const spikes = 4;
      const step = Math.PI / spikes;
      const inner = r * 0.4;
      const pts: string[] = [];
      for (let i = 0; i < spikes * 2; i++) {
        const rad = i % 2 === 0 ? r : inner;
        const ang = -Math.PI / 2 + i * step;
        pts.push(`${cx + Math.cos(ang) * rad},${cy + Math.sin(ang) * rad}`);
      }
      return `<polygon points="${pts.join(" ")}" />`;
    }
    case "x": {
      const bar = r / 3;
      return `<g transform="translate(${cx} ${cy}) rotate(45)">
        <rect x="${-bar}" y="${-r}" width="${bar * 2}" height="${r * 2}" />
        <rect x="${-r}" y="${-bar}" width="${r * 2}" height="${bar * 2}" />
      </g>`;
    }
    case "+": {
      const bar = r / 3;
      return `<rect x="${cx - bar}" y="${cy - r}" width="${bar * 2}" height="${r * 2}" />
              <rect x="${cx - r}" y="${cy - bar}" width="${r * 2}" height="${bar * 2}" />`;
    }
    default:
      return `<circle cx="${cx}" cy="${cy}" r="${r}" />`;
  }
}

export default function HalftoneTool() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [shape, setShape] = useState<Shape>("circle");
  const [grid, setGrid] = useState<number>(DEFAULT_GRID);
  const [maxRadius, setMaxRadius] = useState<number>(DEFAULT_GRID / 2);
  const [gamma, setGamma] = useState<number>(1);
  const [jitter, setJitter] = useState<number>(0);
  const [opacity, setOpacity] = useState<number>(1);
  const [color, setColor] = useState<cg.RGBA8888>({
    r: 0,
    g: 0,
    b: 0,
    a: 1,
  });
  const imageDataRef = useRef<ImageData | null>(null);
  const sizeRef = useRef<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!imageSrc) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      // original dimensions
      let w = img.width;
      let h = img.height;

      // down‑scale if too large
      const scale = Math.min(1, MAX_SIZE / Math.max(w, h));
      if (scale < 1) {
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      // prepare a source canvas (off‑screen) at the working size
      const src = document.createElement("canvas");
      src.width = w;
      src.height = h;
      const sctx = src.getContext("2d")!;
      sctx.drawImage(img, 0, 0, w, h);

      // use the source pixels
      const imageData = sctx.getImageData(0, 0, w, h);

      // store refs for export
      imageDataRef.current = imageData;
      sizeRef.current = { w, h };

      // destination canvas
      canvas.width = w;
      canvas.height = h;

      renderHalftone(
        ctx,
        imageData.data,
        w,
        h,
        shape,
        grid,
        maxRadius,
        gamma,
        jitter,
        opacity,
        cmath.color.rgba8888_to_hex(color)
      );
    };
  }, [imageSrc, shape, grid, maxRadius, gamma, jitter, opacity, color]);

  const exportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, "halftone.png");
    }, "image/png");
  };

  const exportSVG = () => {
    const imgData = imageDataRef.current;
    const dims = sizeRef.current;
    if (!imgData || !dims) return;

    const { w, h } = dims;
    const { data } = imgData;
    const fg = cmath.color.rgba8888_to_hex(color);

    const parts: string[] = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="${fg}" fill-opacity="${opacity}">`
    );

    for (let y = 0; y < h; y += grid) {
      for (let x = 0; x < w; x += grid) {
        const idx = (y * w + x) * 4;
        const rCol = data[idx];
        const gCol = data[idx + 1];
        const bCol = data[idx + 2];

        const brightness = luminance(rCol, gCol, bCol);
        const mapped = Math.pow(brightness, gamma);
        let rDot = (1 - mapped) * maxRadius;
        rDot = Math.min(rDot, maxRadius);

        const jx = (Math.random() * 2 - 1) * jitter;
        const jy = (Math.random() * 2 - 1) * jitter;
        const cx = x + grid / 2 + jx;
        const cy = y + grid / 2 + jy;

        parts.push(shapeToSVG(shape, cx, cy, rDot));
      }
    }

    parts.push("</svg>");
    const blob = new Blob(parts, { type: "image/svg+xml" });
    downloadBlob(blob, "halftone.svg");
  };

  return (
    <main className="flex-1 w-full h-full flex py-4 container mx-auto gap-4">
      <aside className="flex-1">
        <Card className="flex flex-col gap-6 p-6">
          <Label>Shape</Label>
          <div className="grid gap-2">
            <span className="text-xs">Image</span>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setImageSrc(URL.createObjectURL(file));
                }
              }}
            />
          </div>
          <div className="grid gap-2">
            <span className="text-xs">Shape</span>
            <Select
              value={shape}
              onValueChange={(v) => setShape(v as Shape)}
              defaultValue="circle"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="circle">Circle</SelectItem>
                <SelectItem value="square">Square</SelectItem>
                <SelectItem value="triangle">Triangle</SelectItem>
                <SelectItem value="star">Star</SelectItem>
                <SelectItem value="spark">Spark</SelectItem>
                <SelectItem value="x">X‑cross</SelectItem>
                <SelectItem value="+">Plus‑cross</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <span className="text-xs">Grid</span>
            <Slider
              min={4}
              max={64}
              step={1}
              value={[grid]}
              onValueChange={([v]) => setGrid(v)}
            />
          </div>
          <div className="grid gap-2">
            <span className="text-xs">Max radius</span>
            <Slider
              min={1}
              max={64}
              step={0.1}
              value={[maxRadius]}
              onValueChange={([v]) => setMaxRadius(v)}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-xs">Gamma</span>
            <Slider
              min={0.1}
              max={3}
              step={0.1}
              value={[gamma]}
              onValueChange={([v]) => setGamma(v)}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-xs">Opacity</span>
            <Slider
              min={0}
              max={1}
              step={0.1}
              value={[opacity]}
              onValueChange={([v]) => setOpacity(v)}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-xs">Jitter</span>
            <Slider
              min={0}
              max={32}
              step={1}
              value={[jitter]}
              onValueChange={([v]) => setJitter(v)}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-xs">Color</span>
            <ColorPicker color={color} onColorChange={setColor} />
          </div>

          <div className="grid gap-2">
            <span className="text-xs">Download</span>
            <div className="w-full flex gap-2">
              <Button variant="outline" onClick={exportPNG}>
                <DownloadIcon className="size-4" /> PNG
              </Button>
              <Button variant="outline" onClick={exportSVG}>
                <DownloadIcon className="size-4" /> SVG
              </Button>
            </div>
          </div>
        </Card>
      </aside>
      <aside className="flex-[3] flex flex-col items-center justify-center">
        <canvas ref={canvasRef} style={{ maxWidth: "100%" }} />
      </aside>
    </main>
  );
}
