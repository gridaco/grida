"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ColorPicker32F } from "@/scaffolds/sidecontrol/controls/color-picker";
import { DownloadIcon, ImageIcon, UploadIcon } from "lucide-react";
import kolor from "@grida/color";

const DEFAULT_GRID = 10;
const MAX_SIZE = 1024;
const DEMO_IMAGE_SRC = "/images/abstract-placeholder.jpg";

type Shape =
  | "circle"
  | "square"
  | "triangle"
  | "star"
  | "spark"
  | "x"
  | "+"
  | "image";

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
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.rect(-radius / 3, -radius, (radius / 3) * 2, radius * 2);
      ctx.rect(-radius, -radius / 3, radius * 2, (radius / 3) * 2);
      ctx.restore();
      break;
    }
    case "+": {
      ctx.rect(cx - radius / 3, cy - radius, (radius / 3) * 2, radius * 2);
      ctx.rect(cx - radius, cy - radius / 3, radius * 2, (radius / 3) * 2);
      break;
    }
    default: {
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    }
  }
}

/** Perceived luminance (ITU-R BT.601) mapped to 0–1 */
function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

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
  color: string,
  customShapeImage?: HTMLImageElement | null
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
      const mapped = Math.pow(brightness, gamma);
      let radius = (1 - mapped) * maxRadius;
      radius = Math.min(radius, maxRadius);

      const jx = (Math.random() * 2 - 1) * jitter;
      const jy = (Math.random() * 2 - 1) * jitter;
      const cx = x + grid / 2 + jx;
      const cy = y + grid / 2 + jy;

      if (shape === "image" && customShapeImage) {
        const size = radius * 2;
        ctx.drawImage(customShapeImage, cx - radius, cy - radius, size, size);
      } else {
        ctx.beginPath();
        drawShape(ctx, shape, cx, cy, radius);
        ctx.fill();
      }
    }
  }

  ctx.globalAlpha = prevAlpha;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onValueChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const id = useId();
  const display = format ? format(value) : String(value);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <span id={id} className="text-xs text-muted-foreground">
          {label}
        </span>
        <span className="text-xs font-mono tabular-nums text-foreground">
          {display}
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onValueChange(v)}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 px-1 pt-3 pb-1">
      {children}
    </p>
  );
}

export default function HalftoneTool() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(true);
  const [shape, setShape] = useState<Shape>("circle");
  const [grid, setGrid] = useState<number>(DEFAULT_GRID);
  const [maxRadius, setMaxRadius] = useState<number>(DEFAULT_GRID / 2);
  const [gamma, setGamma] = useState<number>(1);
  const [jitter, setJitter] = useState<number>(0);
  const [opacity, setOpacity] = useState<number>(1);
  const [color, setColor] = useState<kolor.colorformats.RGBA32F>(
    kolor.colorformats.RGBA32F.BLACK
  );
  const [customShapeImage, setCustomShapeImage] =
    useState<HTMLImageElement | null>(null);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [canvasDims, setCanvasDims] = useState<{
    w: number;
    h: number;
  } | null>(null);

  const imageDataRef = useRef<ImageData | null>(null);
  const sizeRef = useRef<{ w: number; h: number } | null>(null);
  // Tracks the active blob URL so it can be revoked when replaced
  const blobUrlRef = useRef<string | null>(null);

  // Load demo image on first mount
  useEffect(() => {
    setImageSrc(DEMO_IMAGE_SRC);
  }, []);

  useEffect(() => {
    if (!imageSrc) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsCanvasReady(false);

    let cancelled = false;
    const img = new Image();

    img.onload = () => {
      if (cancelled) return;

      let w = img.width;
      let h = img.height;

      const scale = Math.min(1, MAX_SIZE / Math.max(w, h));
      if (scale < 1) {
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const src = document.createElement("canvas");
      src.width = w;
      src.height = h;
      const sctx = src.getContext("2d")!;
      sctx.drawImage(img, 0, 0, w, h);

      const imageData = sctx.getImageData(0, 0, w, h);
      imageDataRef.current = imageData;
      sizeRef.current = { w, h };
      setCanvasDims({ w, h });

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
        kolor.colorformats.RGBA32F.intoCSSRGBA(color),
        customShapeImage
      );

      setIsCanvasReady(true);
    };

    img.src = imageSrc;

    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [
    imageSrc,
    shape,
    grid,
    maxRadius,
    gamma,
    jitter,
    opacity,
    color,
    customShapeImage,
  ]);

  const handleImageUpload = (file: File) => {
    // Revoke the previous blob URL to avoid memory leaks
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    setImageSrc(url);
    setIsDemo(false);
  };

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
    const fg = kolor.colorformats.RGBA32F.intoCSSRGBA(color);

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
    <main className="flex-1 w-full h-full flex py-4 container mx-auto gap-6 min-h-0">
      {/* ── Controls panel ── */}
      <aside className="w-64 shrink-0 flex flex-col overflow-y-auto overflow-x-hidden">
        {/* Source image */}
        <SectionLabel>Source Image</SectionLabel>
        <div className="flex flex-col gap-2 px-1 pb-3">
          {/* Thumbnail */}
          <div
            className="relative w-full aspect-square rounded-lg overflow-hidden border bg-muted cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            {imageSrc ? (
              <picture>
                <img
                  src={imageSrc}
                  alt="Source"
                  className="w-full h-full object-cover"
                />
              </picture>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageIcon className="size-8" />
                <span className="text-xs">No image</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <UploadIcon className="size-5 text-white" />
            </div>
            {isDemo && imageSrc && (
              <div className="absolute top-1.5 left-1.5">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  demo
                </Badge>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="size-3.5" />
            Upload image
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageUpload(file);
              e.currentTarget.value = "";
            }}
          />
        </div>

        <Separator />

        {/* Shape */}
        <SectionLabel>Shape</SectionLabel>
        <div className="flex flex-col gap-2 px-1 pb-3">
          <Select
            value={shape}
            onValueChange={(v) => setShape(v as Shape)}
            defaultValue="circle"
          >
            <SelectTrigger className="h-8 text-xs">
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
              <SelectItem value="image">Custom Image</SelectItem>
            </SelectContent>
          </Select>

          {shape === "image" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                Custom shape image
              </span>
              <Input
                type="file"
                accept="image/png,image/svg+xml"
                className="h-8 text-xs cursor-pointer"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const img = new Image();
                      img.src = event.target?.result as string;
                      img.onload = () => setCustomShapeImage(img);
                    };
                    reader.readAsDataURL(file);
                  }
                  e.currentTarget.value = "";
                }}
              />
              {!customShapeImage && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Upload a PNG or SVG above — until then the canvas shows
                  circles as a placeholder.
                </p>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Parameters */}
        <SectionLabel>Parameters</SectionLabel>
        <div className="flex flex-col gap-4 px-1 pb-3">
          <SliderRow
            label="Grid"
            value={grid}
            min={4}
            max={64}
            step={1}
            onValueChange={setGrid}
            format={(v) => `${v}px`}
          />
          <SliderRow
            label="Max Radius"
            value={maxRadius}
            min={1}
            max={64}
            step={0.5}
            onValueChange={setMaxRadius}
            format={(v) => `${v}px`}
          />
          <SliderRow
            label="Gamma"
            value={gamma}
            min={0.1}
            max={3}
            step={0.1}
            onValueChange={setGamma}
            format={(v) => v.toFixed(1)}
          />
          <SliderRow
            label="Jitter"
            value={jitter}
            min={0}
            max={32}
            step={1}
            onValueChange={setJitter}
            format={(v) => `${v}px`}
          />
          <SliderRow
            label="Opacity"
            value={opacity}
            min={0}
            max={1}
            step={0.05}
            onValueChange={setOpacity}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </div>

        <Separator />

        {/* Color */}
        <SectionLabel>Color</SectionLabel>
        <div className="px-1 pb-3">
          <ColorPicker32F color={color} onColorChange={setColor} />
        </div>

        <Separator />

        {/* Export */}
        <SectionLabel>Export</SectionLabel>
        <div className="flex flex-col gap-2 px-1 pb-3">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={exportPNG}
              disabled={!isCanvasReady}
            >
              <DownloadIcon className="size-3.5" />
              PNG
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={exportSVG}
              disabled={!isCanvasReady || shape === "image"}
              title={
                shape === "image"
                  ? "SVG export unavailable for custom image shapes"
                  : undefined
              }
            >
              <DownloadIcon className="size-3.5" />
              SVG
            </Button>
          </div>
          {canvasDims && (
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {canvasDims.w} × {canvasDims.h} px
            </p>
          )}
          {shape === "image" && (
            <p className="text-[11px] text-muted-foreground">
              SVG export unavailable for custom image shapes.
            </p>
          )}
        </div>
      </aside>

      {/* ── Canvas preview ── */}
      <div className="flex-1 flex items-center justify-center rounded-xl border overflow-hidden min-h-[400px]">
        {imageSrc ? (
          <canvas
            ref={canvasRef}
            className="shadow-lg"
            style={{ maxWidth: "100%", maxHeight: "100%" }}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <ImageIcon className="size-10 opacity-30" />
            <p className="text-sm">Upload an image to get started</p>
          </div>
        )}
      </div>
    </main>
  );
}
