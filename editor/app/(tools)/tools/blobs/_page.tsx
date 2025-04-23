"use client";

import React, { useMemo, useState } from "react";
import { blob } from "@grida/cmath/_blob";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { DownloadIcon, RefreshCwIcon } from "lucide-react";

/**
 * Blob‑shape playground (Quadratic Bézier variant).
 *
 * Controls
 * ─────────
 * • Randomness · Minimum size (%) – lower ⇒ wilder shape.
 * • Complexity · Number of nodes     – higher ⇒ more detail.
 */
export default function BlobGeneratorTool() {
  /* ─────── state ──────────────────────────────────────────────── */
  const [minSizePct, setMinSizePct] = useState(60); // 10–100
  const [edges, setEdges] = useState(6); // 3–30
  const [seed, setSeed] = useState(0); // bump to re‑randomise

  const SIZE = 640; // viewBox width/height

  /* ─────── derived blob path ──────────────────────────────────── */
  const path = useMemo(() => {
    const growth = minSizePct / 10; // convert % → blobshape “growth”
    const { path } = blob.generator({
      size: SIZE,
      growth,
      edges,
      seed,
    });
    return path;
  }, [minSizePct, edges, seed]);

  const randomize = () => {
    setSeed((n) => n + 1);
  };

  const download = () => {
    // Serialize SVG markup
    const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}"><path d="${path}" fill="currentColor"/></svg>`;
    const blobFile = new Blob([svgMarkup], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blobFile);
    const link = document.createElement("a");
    link.href = url;
    link.download = "blob.svg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="flex-1 w-full h-full flex py-4 container mx-auto gap-4">
      <aside className="flex-[2] flex flex-col items-center justify-center">
        {/* SVG preview */}
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          className="mx-auto aspect-square text-primary"
        >
          <path d={path} fill="currentColor" />
        </svg>
      </aside>
      <aside className="flex-1">
        <Card className="flex flex-col gap-6 p-6">
          <Label>Shape</Label>
          {/* Randomness */}
          <div className="grid gap-2">
            <span className="text-xs">Randomness</span>
            <Slider
              min={10}
              max={100}
              step={1}
              value={[minSizePct]}
              onValueChange={([v]) => setMinSizePct(v)}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-xs">Complexity</span>
            <Slider
              min={3}
              max={30}
              step={1}
              value={[edges]}
              onValueChange={([v]) => setEdges(v)}
            />
          </div>

          {/* Regenerate and Download */}
          <div className="flex gap-2">
            <Button onClick={randomize}>
              <RefreshCwIcon className="size-4" />
            </Button>
            <Button variant="outline" onClick={download}>
              <DownloadIcon className="size-4" />
            </Button>
          </div>
        </Card>
      </aside>
    </main>
  );
}
